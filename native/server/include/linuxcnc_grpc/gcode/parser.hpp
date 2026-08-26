#pragma once

#include <cstddef>
#include <functional>
#include <memory>
#include <optional>
#include <stdexcept>
#include <string>

#include "linuxcnc_grpc/gcode/operation_types.hpp"

class InterpBase;

namespace linuxcnc::server::gcode {

enum class ParseErrorCode { InvalidEntry, Interpreter, Internal };

class ParseError : public std::runtime_error {
 public:
  ParseError(ParseErrorCode code, std::string message,
             std::optional<int> line_number = std::nullopt)
      : std::runtime_error(std::move(message)),
        code_(code),
        line_number_(line_number) {}

  ParseErrorCode code() const noexcept { return code_; }
  std::optional<int> line_number() const noexcept { return line_number_; }

 private:
  ParseErrorCode code_;
  std::optional<int> line_number_;
};

// Callbacks are invoked by the parser worker, never by realtime LinuxCNC
// code. The batch callback owns at most batch_size operations at a time and
// returns false to stop delivery. Cancellation is checked between each
// interpreter read/execute step.
struct ParseOptions {
  std::string ini_path;
  std::string program_prefix;
  std::size_t batch_size = 128;
  int progress_updates = 40;
  std::function<bool(OperationBatch&&)> on_batch;
  std::function<void(const ParseProgress&)> on_progress;
  std::function<bool()> is_cancelled;
};

// LinuxCNC's rs274 interpreter is not reentrant. Instances share a process
// mutex, while each parser retains its interpreter object and loaded INI path.
// The class has no transport or JavaScript dependencies.
class SerializedRs274Parser {
 public:
  SerializedRs274Parser();
  ~SerializedRs274Parser();

  SerializedRs274Parser(const SerializedRs274Parser&) = delete;
  SerializedRs274Parser& operator=(const SerializedRs274Parser&) = delete;

  ParseResult parse_file(const std::string& filepath,
                         const ParseOptions& options);

 private:
  std::unique_ptr<InterpBase> interpreter_;
  std::string loaded_ini_path_;
};

// Convenience entry point for one-off daemon workers. Callers that parse
// repeatedly should retain a SerializedRs274Parser to reuse the interpreter.
ParseResult parse_file(const std::string& filepath,
                       const ParseOptions& options);

}  // namespace linuxcnc::server::gcode
