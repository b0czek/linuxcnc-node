/**
 * Parse Worker - Header
 *
 * Async worker for background G-code parsing with progress reporting.
 */

#ifndef GCODE_PARSE_WORKER_HH
#define GCODE_PARSE_WORKER_HH

#include <napi.h>
#include "operation_types.hh"

namespace GCodeParser
{

  /**
   * Async worker that parses G-code in a background thread.
   */
  class ParseWorker : public Napi::AsyncProgressWorker<ParseProgress>
  {
  public:
    ParseWorker(
        Napi::Function &callback,
        Napi::Function &progressCallback,
        const std::string &filepath,
        const std::string &iniPath,
        int progressUpdates = 40);

    ~ParseWorker();

    void Execute(const ExecutionProgress &progress) override;
    void OnProgress(const ParseProgress *data, size_t count) override;
    void OnOK() override;
    void OnError(const Napi::Error &error) override;

  private:
    std::string filepath_;
    std::string iniPath_;
    int progressUpdates_;
    ParseResult result_;
    Napi::FunctionReference progressCallback_;

    // Helper to convert result to JS object
    Napi::Object resultToJS(Napi::Env env);
    Napi::Float64Array positionToJS(Napi::Env env, const Position &pos);
    Napi::Float64Array position3ToJS(Napi::Env env, const Position3 &pos);
    Napi::Object toolDataToJS(Napi::Env env, const ToolData &tool);
    Napi::Object operationToJS(Napi::Env env, const Operation &op);
  };

} // namespace GCodeParser

#endif // GCODE_PARSE_WORKER_HH
