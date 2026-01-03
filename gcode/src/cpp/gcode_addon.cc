/**
 * G-Code Addon - N-API Module Entry Point
 *
 * Exports the parseGCode function to JavaScript.
 */

#include <napi.h>
#include <Python.h>
#include "parse_worker.hh"
#include "operation_types.hh"

// Definitions required by librs274.so
extern "C" PyObject* PyInit_interpreter(void);
extern "C" PyObject* PyInit_emccanon(void);
extern "C" struct _inittab builtin_modules[];
struct _inittab builtin_modules[] = {
    { "interpreter", PyInit_interpreter },
    { "emccanon", PyInit_emccanon },
    { NULL, NULL }
};


namespace GCodeParser
{

  /**
   * parseGCode(filepath, iniPath, progressUpdates, progressCallback, callback)
   *
   * Asynchronously parse a G-code file.
   *
   * @param filepath - Path to the G-code file
   * @param iniPath - Path to the LinuxCNC INI file
   * @param progressUpdates - Target number of progress updates (0 to disable)
   * @param progressCallback - Function called with progress updates
   * @param callback - Function called with (error, result) when complete
   */
  Napi::Value ParseGCode(const Napi::CallbackInfo &info)
  {
    Napi::Env env = info.Env();

    // Validate arguments
    if (info.Length() < 5)
    {
      Napi::TypeError::New(env, "Expected 5 arguments: filepath, iniPath, progressUpdates, progressCallback, callback")
          .ThrowAsJavaScriptException();
      return env.Undefined();
    }

    if (!info[0].IsString())
    {
      Napi::TypeError::New(env, "filepath must be a string")
          .ThrowAsJavaScriptException();
      return env.Undefined();
    }

    if (!info[1].IsString())
    {
      Napi::TypeError::New(env, "iniPath must be a string")
          .ThrowAsJavaScriptException();
      return env.Undefined();
    }

    if (!info[2].IsNumber())
    {
      Napi::TypeError::New(env, "progressUpdates must be a number")
          .ThrowAsJavaScriptException();
      return env.Undefined();
    }

    if (!info[3].IsFunction())
    {
      Napi::TypeError::New(env, "progressCallback must be a function")
          .ThrowAsJavaScriptException();
      return env.Undefined();
    }

    if (!info[4].IsFunction())
    {
      Napi::TypeError::New(env, "callback must be a function")
          .ThrowAsJavaScriptException();
      return env.Undefined();
    }

    std::string filepath = info[0].As<Napi::String>().Utf8Value();
    std::string iniPath = info[1].As<Napi::String>().Utf8Value();
    int progressUpdates = info[2].As<Napi::Number>().Int32Value();
    Napi::Function progressCallback = info[3].As<Napi::Function>();
    Napi::Function callback = info[4].As<Napi::Function>();

    // Create and queue async worker
    ParseWorker *worker = new ParseWorker(callback, progressCallback, filepath, iniPath, progressUpdates);
    worker->Queue();

    return env.Undefined();
  }

  /**
   * Module initialization
   */
  Napi::Object Init(Napi::Env env, Napi::Object exports)
  {
    // Export parseGCode function
    exports.Set("parseGCode", Napi::Function::New(env, ParseGCode));

    // Export operation type constants
    exports.Set("OPERATION_TRAVERSE", Napi::Number::New(env, static_cast<int>(OperationType::TRAVERSE)));
    exports.Set("OPERATION_FEED", Napi::Number::New(env, static_cast<int>(OperationType::FEED)));
    exports.Set("OPERATION_ARC", Napi::Number::New(env, static_cast<int>(OperationType::ARC)));
    exports.Set("OPERATION_PROBE", Napi::Number::New(env, static_cast<int>(OperationType::PROBE)));
    exports.Set("OPERATION_RIGID_TAP", Napi::Number::New(env, static_cast<int>(OperationType::RIGID_TAP)));
    exports.Set("OPERATION_DWELL", Napi::Number::New(env, static_cast<int>(OperationType::DWELL)));
    exports.Set("OPERATION_NURBS_G5", Napi::Number::New(env, static_cast<int>(OperationType::NURBS_G5)));
    exports.Set("OPERATION_NURBS_G6", Napi::Number::New(env, static_cast<int>(OperationType::NURBS_G6)));
    exports.Set("OPERATION_UNITS_CHANGE", Napi::Number::New(env, static_cast<int>(OperationType::UNITS_CHANGE)));
    exports.Set("OPERATION_PLANE_CHANGE", Napi::Number::New(env, static_cast<int>(OperationType::PLANE_CHANGE)));
    exports.Set("OPERATION_G5X_OFFSET", Napi::Number::New(env, static_cast<int>(OperationType::G5X_OFFSET)));
    exports.Set("OPERATION_G92_OFFSET", Napi::Number::New(env, static_cast<int>(OperationType::G92_OFFSET)));
    exports.Set("OPERATION_XY_ROTATION", Napi::Number::New(env, static_cast<int>(OperationType::XY_ROTATION)));
    exports.Set("OPERATION_TOOL_OFFSET", Napi::Number::New(env, static_cast<int>(OperationType::TOOL_OFFSET)));
    exports.Set("OPERATION_TOOL_CHANGE", Napi::Number::New(env, static_cast<int>(OperationType::TOOL_CHANGE)));
    exports.Set("OPERATION_FEED_RATE_CHANGE", Napi::Number::New(env, static_cast<int>(OperationType::FEED_RATE_CHANGE)));


    // Export plane constants
    exports.Set("PLANE_XY", Napi::Number::New(env, static_cast<int>(Plane::XY)));
    exports.Set("PLANE_YZ", Napi::Number::New(env, static_cast<int>(Plane::YZ)));
    exports.Set("PLANE_XZ", Napi::Number::New(env, static_cast<int>(Plane::XZ)));
    exports.Set("PLANE_UV", Napi::Number::New(env, static_cast<int>(Plane::UV)));
    exports.Set("PLANE_VW", Napi::Number::New(env, static_cast<int>(Plane::VW)));
    exports.Set("PLANE_UW", Napi::Number::New(env, static_cast<int>(Plane::UW)));

    // Export units constants
    exports.Set("UNITS_INCHES", Napi::Number::New(env, static_cast<int>(Units::INCHES)));
    exports.Set("UNITS_MM", Napi::Number::New(env, static_cast<int>(Units::MM)));
    exports.Set("UNITS_CM", Napi::Number::New(env, static_cast<int>(Units::CM)));

    return exports;
  }

  NODE_API_MODULE(gcode_addon, Init)

} // namespace GCodeParser
