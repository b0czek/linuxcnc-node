#include "linuxcnc_grpc/gcode_parser.hpp"

#include <sys/stat.h>

#include <algorithm>
#include <cstdlib>
#include <mutex>
#include <stdexcept>

#include "interp_base.hh"
#include "interp_return.hh"
#include "linuxcnc_grpc/gcode_canon_preview.hpp"
#include "recordingcanon.hh"
#include "rs274ngc_interp.hh"
#include "tooldata.hh"

namespace linuxcnc::server::gcode {
namespace {

std::mutex rs274_mutex;

bool result_ok(const int result) {
  return result == INTERP_OK || result == INTERP_EXECUTE_FINISH;
}

}  // namespace

void ensure_python_modules_linked() noexcept;

SerializedRs274Parser::SerializedRs274Parser() = default;

SerializedRs274Parser::~SerializedRs274Parser() = default;

ParseResult SerializedRs274Parser::parse_file(const std::string& filepath,
                                              const ParseOptions& options) {
  if (options.ini_path.empty())
    throw std::invalid_argument("G-code parser requires a LinuxCNC INI path");

  std::lock_guard<std::mutex> lock(rs274_mutex);
  ensure_python_modules_linked();

  // Interp::ini_load() loads the parameter file name; the rest of LinuxCNC's
  // interpreter configuration (including REMAP and PYTHON) is intentionally
  // discovered through INI_FILE_NAME during init(). Parsing is serialized, so
  // this process-global LinuxCNC convention cannot race another session.
  // NOLINTNEXTLINE(concurrency-mt-unsafe): serialized external API contract
  if (setenv("INI_FILE_NAME", options.ini_path.c_str(), 1) != 0)
    throw std::runtime_error("failed to set LinuxCNC INI_FILE_NAME");

  struct stat file_stat {};
  if (stat(filepath.c_str(), &file_stat) != 0)
    throw std::runtime_error("G-code file not found: " + filepath);
  if (!S_ISREG(file_stat.st_mode))
    throw std::runtime_error("G-code path is not a regular file: " + filepath);

  ParseContext context;
  context.totalBytes = static_cast<std::size_t>(file_stat.st_size);
  context.extents.reset();
  context.progressCallback = options.on_progress;
  context.batchCallback = options.on_batch;
  context.cancellationCallback = options.is_cancelled;
  context.batchSize = options.batch_size;

  // The selected canon backend records every call made by the interpreter,
  // including calls from Python/NGC remaps. Translation and RPC batching stay
  // outside the interpreter/canonical call stack.
  ::linuxcnc::recording::Session recording_session;
  bool opened = false;

  try {
    if (!interpreter_) interpreter_.reset(makeInterp());
    if (!interpreter_)
      throw std::runtime_error("failed to create rs274 interpreter");

    // The daemon supplies its configured INI explicitly for every parse. The
    // interpreter is reinitialized even when the path is unchanged so modal
    // state never leaks from a previous workspace/program.
    if (loaded_ini_path_ != options.ini_path) {
      if (interpreter_->ini_load(options.ini_path.c_str()) != 0)
        throw std::runtime_error("failed to load INI file: " +
                                 options.ini_path);
      loaded_ini_path_ = options.ini_path;
    }
    if (interpreter_->init() != 0)
      throw std::runtime_error("failed to initialize rs274 interpreter");
    if (!options.program_prefix.empty()) {
      auto* concrete = dynamic_cast<Interp*>(interpreter_.get());
      if (!concrete)
        throw std::runtime_error(
            "rs274 interpreter does not expose its program prefix");
      if (options.program_prefix.size() >=
          sizeof(concrete->_setup.program_prefix))
        throw std::runtime_error("G-code program prefix is too long");
      std::copy(options.program_prefix.begin(), options.program_prefix.end(),
                concrete->_setup.program_prefix);
      concrete->_setup.program_prefix[options.program_prefix.size()] = '\0';
    }
    consumeRecordingEvents(recording_session, context);

    // Tool data is optional for preview. LinuxCNC's canonical tool callbacks
    // continue to return safe defaults when no tool table is available.
    (void)tool_mmap_user();

    if (interpreter_->open(filepath.c_str()) != 0)
      throw std::runtime_error("failed to open G-code file: " + filepath);
    opened = true;

    const std::size_t estimated_lines =
        std::max(context.totalBytes / 25U, std::size_t{100});
    const std::size_t progress_interval =
        options.progress_updates > 0
            ? std::max(estimated_lines /
                           static_cast<std::size_t>(options.progress_updates),
                       std::size_t{1})
            : static_cast<std::size_t>(-1);

    int result = INTERP_OK;
    std::size_t line_count = 0;
    while (result_ok(result)) {
      // This check is deliberately before read() and after execute(). It lets
      // RPC cancellation stop the wait without undoing an already accepted
      // interpreter step.
      if (context.cancellationRequested()) break;

      result = interpreter_->read();
      if (context.cancellationRequested()) break;
      if (!result_ok(result)) break;

      result = interpreter_->execute();
      ++line_count;
      consumeRecordingEvents(recording_session, context);
      if (!context.cancellationRequested()) {
        // Delivery happens after execute returns, outside canonical callback
        // code, so a gRPC adapter can enqueue work without doing network I/O
        // from the interpreter/canonical path.
        if (!context.flushReadyBatch()) break;
      }
      if (context.cancellationRequested()) break;

      if (context.progressCallback && line_count % progress_interval == 0) {
        std::size_t estimated_bytes =
            (context.totalBytes * line_count) /
            std::max(line_count + 100U, std::size_t{1});
        estimated_bytes = std::min(estimated_bytes, context.totalBytes);
        context.reportProgress(estimated_bytes);
      }
    }

    const bool cancelled = context.cancellationRequested();
    if (!cancelled && result != INTERP_ENDFILE && result != INTERP_EXIT &&
        !result_ok(result)) {
      char error_buffer[256]{};
      interpreter_->error_text(result, error_buffer, sizeof(error_buffer));
      throw std::runtime_error(std::string("G-code parse error: ") +
                               error_buffer);
    }

    interpreter_->close();
    opened = false;
    consumeRecordingEvents(recording_session, context);

    // Flush the final partial batch only if the consumer is still connected.
    // A cancelled stream must not retain or deliver an unbounded tail.
    if (!context.cancelled) context.flushBatch();
    if (context.progressCallback) context.reportProgress(context.totalBytes);
  } catch (...) {
    if (opened) interpreter_->close();
    throw;
  }

  if (!context.extents.isValid()) {
    context.extents.min = {0, 0, 0};
    context.extents.max = {0, 0, 0};
  }

  ParseResult result;
  result.operations = std::move(context.operations);
  result.extents = context.extents;
  result.operationCount = context.operationCount;
  result.cancelled = context.cancelled;
  return result;
}

ParseResult parse_file(const std::string& filepath,
                       const ParseOptions& options) {
  static SerializedRs274Parser parser;
  return parser.parse_file(filepath, options);
}

}  // namespace linuxcnc::server::gcode
