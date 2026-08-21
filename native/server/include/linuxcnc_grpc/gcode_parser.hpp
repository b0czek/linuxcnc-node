#pragma once

#include "linuxcnc_grpc/gcode_operation_types.hpp"

#include <cstddef>
#include <functional>
#include <memory>
#include <string>

class InterpBase;

namespace linuxcnc::server::gcode {

// Callbacks are invoked by the parser worker, never by realtime LinuxCNC
// code. The batch callback owns at most batch_size operations at a time and
// returns false to stop delivery. Cancellation is checked between each
// interpreter read/execute step.
struct ParseOptions {
  std::string ini_path;
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
