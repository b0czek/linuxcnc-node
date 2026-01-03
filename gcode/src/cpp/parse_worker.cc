/**
 * Parse Worker - Implementation
 *
 * Async worker for background G-code parsing with progress reporting.
 */

#include "parse_worker.hh"
#include "gcode_parser.hh"

namespace GCodeParser
{

  ParseWorker::ParseWorker(
      Napi::Function &callback,
      Napi::Function &progressCallback,
      const std::string &filepath,
      const std::string &iniPath,
      int progressUpdates)
      : Napi::AsyncProgressWorker<ParseProgress>(callback),
        filepath_(filepath),
        iniPath_(iniPath),
        progressUpdates_(progressUpdates)
  {
    if (!progressCallback.IsEmpty() && progressCallback.IsFunction())
    {
      progressCallback_ = Napi::Persistent(progressCallback);
    }
  }

  ParseWorker::~ParseWorker() {}

  void ParseWorker::Execute(const ExecutionProgress &progress)
  {
    try
    {
      // Create progress callback that reports to Node.js
      auto progressFn = [&progress](const ParseProgress &p)
      {
        progress.Send(&p, 1);
      };

      result_ = parseFile(filepath_, iniPath_, progressFn, progressUpdates_);
    }
    catch (const std::exception &e)
    {
      SetError(e.what());
    }
  }

  void ParseWorker::OnProgress(const ParseProgress *data, size_t count)
  {
    if (count > 0 && !progressCallback_.IsEmpty())
    {
      Napi::Env env = progressCallback_.Env();
      Napi::HandleScope scope(env);

      const ParseProgress &p = data[0];

      Napi::Object progressObj = Napi::Object::New(env);
      progressObj.Set("bytesRead", Napi::Number::New(env, static_cast<double>(p.bytesRead)));
      progressObj.Set("totalBytes", Napi::Number::New(env, static_cast<double>(p.totalBytes)));
      progressObj.Set("percent", Napi::Number::New(env, p.percent));
      progressObj.Set("operationCount", Napi::Number::New(env, static_cast<double>(p.operationCount)));

      progressCallback_.Call({progressObj});
    }
  }

  void ParseWorker::OnOK()
  {
    Napi::Env env = Env();
    Napi::HandleScope scope(env);

    Callback().Call({env.Null(), resultToJS(env)});
  }

  void ParseWorker::OnError(const Napi::Error &error)
  {
    Napi::Env env = Env();
    Napi::HandleScope scope(env);

    Callback().Call({error.Value(), env.Null()});
  }

  Napi::Float64Array ParseWorker::positionToJS(Napi::Env env, const Position &pos)
  {
    // Return as Float64Array(9): [x, y, z, a, b, c, u, v, w]
    Napi::Float64Array arr = Napi::Float64Array::New(env, 9);
    arr[0] = pos.x;
    arr[1] = pos.y;
    arr[2] = pos.z;
    arr[3] = pos.a;
    arr[4] = pos.b;
    arr[5] = pos.c;
    arr[6] = pos.u;
    arr[7] = pos.v;
    arr[8] = pos.w;
    return arr;
  }

  Napi::Float64Array ParseWorker::position3ToJS(Napi::Env env, const Position3 &pos)
  {
    // Return as Float64Array(3): [x, y, z]
    Napi::Float64Array arr = Napi::Float64Array::New(env, 3);
    arr[0] = pos.x;
    arr[1] = pos.y;
    arr[2] = pos.z;
    return arr;
  }

  Napi::Object ParseWorker::toolDataToJS(Napi::Env env, const ToolData &tool)
  {
    Napi::Object obj = Napi::Object::New(env);
    obj.Set("toolNumber", Napi::Number::New(env, tool.toolNumber));
    obj.Set("pocketNumber", Napi::Number::New(env, tool.pocketNumber));
    obj.Set("diameter", Napi::Number::New(env, tool.diameter));
    obj.Set("frontAngle", Napi::Number::New(env, tool.frontAngle));
    obj.Set("backAngle", Napi::Number::New(env, tool.backAngle));
    obj.Set("orientation", Napi::Number::New(env, tool.orientation));
    obj.Set("offset", positionToJS(env, tool.offset));
    return obj;
  }

  Napi::Object ParseWorker::operationToJS(Napi::Env env, const Operation &op)
  {
    Napi::Object obj = Napi::Object::New(env);

    std::visit([&](const auto &operation)
               {
      using T = std::decay_t<decltype(operation)>;
      obj.Set("type", Napi::Number::New(env, static_cast<int>(T::type)));

      if constexpr (std::is_same_v<T, TraverseOp>) {
        obj.Set("lineNumber", Napi::Number::New(env, operation.lineNumber));
        obj.Set("pos", positionToJS(env, operation.pos));
      }
      else if constexpr (std::is_same_v<T, FeedOp>) {
        obj.Set("lineNumber", Napi::Number::New(env, operation.lineNumber));
        obj.Set("pos", positionToJS(env, operation.pos));
      }
      else if constexpr (std::is_same_v<T, ArcOp>) {
        obj.Set("lineNumber", Napi::Number::New(env, operation.lineNumber));
        obj.Set("pos", positionToJS(env, operation.pos));
        obj.Set("plane", Napi::Number::New(env, static_cast<int>(operation.plane)));
        
        Napi::Object arcData = Napi::Object::New(env);
        arcData.Set("centerFirst", Napi::Number::New(env, operation.arcData.centerFirst));
        arcData.Set("centerSecond", Napi::Number::New(env, operation.arcData.centerSecond));
        arcData.Set("rotation", Napi::Number::New(env, operation.arcData.rotation));
        arcData.Set("axisEndPoint", Napi::Number::New(env, operation.arcData.axisEndPoint));
        obj.Set("arcData", arcData);
      }
      else if constexpr (std::is_same_v<T, ProbeOp>) {
        obj.Set("lineNumber", Napi::Number::New(env, operation.lineNumber));
        obj.Set("pos", positionToJS(env, operation.pos));
      }
      else if constexpr (std::is_same_v<T, RigidTapOp>) {
        obj.Set("lineNumber", Napi::Number::New(env, operation.lineNumber));
        obj.Set("pos", position3ToJS(env, operation.pos));
        obj.Set("scale", Napi::Number::New(env, operation.scale));
      }
      else if constexpr (std::is_same_v<T, DwellOp>) {
        obj.Set("pos", positionToJS(env, operation.pos));
        obj.Set("duration", Napi::Number::New(env, operation.duration));
        obj.Set("plane", Napi::Number::New(env, static_cast<int>(operation.plane)));
      }
      else if constexpr (std::is_same_v<T, NurbsG5Op>) {
        obj.Set("lineNumber", Napi::Number::New(env, operation.lineNumber));
        obj.Set("pos", positionToJS(env, operation.pos));
        obj.Set("plane", Napi::Number::New(env, static_cast<int>(operation.plane)));
        
        Napi::Object nurbsData = Napi::Object::New(env);
        nurbsData.Set("order", Napi::Number::New(env, operation.nurbsData.order));
        
        Napi::Array controlPoints = Napi::Array::New(env, operation.nurbsData.controlPoints.size());
        for (size_t i = 0; i < operation.nurbsData.controlPoints.size(); i++) {
          const auto& cp = operation.nurbsData.controlPoints[i];
          Napi::Object cpObj = Napi::Object::New(env);
          cpObj.Set("x", Napi::Number::New(env, cp.x));
          cpObj.Set("y", Napi::Number::New(env, cp.y));
          cpObj.Set("weight", Napi::Number::New(env, cp.weight));
          controlPoints[i] = cpObj;
        }
        nurbsData.Set("controlPoints", controlPoints);
        obj.Set("nurbsData", nurbsData);
      }
      else if constexpr (std::is_same_v<T, NurbsG6Op>) {
        obj.Set("lineNumber", Napi::Number::New(env, operation.lineNumber));
        obj.Set("pos", positionToJS(env, operation.pos));
        obj.Set("plane", Napi::Number::New(env, static_cast<int>(operation.plane)));
        
        Napi::Object nurbsData = Napi::Object::New(env);
        nurbsData.Set("order", Napi::Number::New(env, operation.nurbsData.order));
        
        Napi::Array controlPoints = Napi::Array::New(env, operation.nurbsData.controlPoints.size());
        for (size_t i = 0; i < operation.nurbsData.controlPoints.size(); i++) {
          const auto& cp = operation.nurbsData.controlPoints[i];
          Napi::Object cpObj = Napi::Object::New(env);
          cpObj.Set("x", Napi::Number::New(env, cp.x));
          cpObj.Set("y", Napi::Number::New(env, cp.y));
          cpObj.Set("r", Napi::Number::New(env, cp.r));
          cpObj.Set("k", Napi::Number::New(env, cp.k));
          controlPoints[i] = cpObj;
        }
        nurbsData.Set("controlPoints", controlPoints);
        obj.Set("nurbsData", nurbsData);
      }
      else if constexpr (std::is_same_v<T, UnitsChangeOp>) {
        obj.Set("units", Napi::Number::New(env, static_cast<int>(operation.units)));
      }
      else if constexpr (std::is_same_v<T, PlaneChangeOp>) {
        obj.Set("plane", Napi::Number::New(env, static_cast<int>(operation.plane)));
      }
      else if constexpr (std::is_same_v<T, G5xOffsetOp>) {
        obj.Set("origin", Napi::Number::New(env, operation.origin));
        obj.Set("offset", positionToJS(env, operation.offset));
      }
      else if constexpr (std::is_same_v<T, G92OffsetOp>) {
        obj.Set("offset", positionToJS(env, operation.offset));
      }
      else if constexpr (std::is_same_v<T, XYRotationOp>) {
        obj.Set("rotation", Napi::Number::New(env, operation.rotation));
      }
      else if constexpr (std::is_same_v<T, ToolOffsetOp>) {
        obj.Set("offset", positionToJS(env, operation.offset));
      }
      else if constexpr (std::is_same_v<T, ToolChangeOp>) {
        obj.Set("tool", toolDataToJS(env, operation.tool));
      }
      else if constexpr (std::is_same_v<T, FeedRateChangeOp>) {
        obj.Set("feedRate", Napi::Number::New(env, operation.feedRate));
      } }, op);

    return obj;
  }

  Napi::Object ParseWorker::resultToJS(Napi::Env env)
  {
    Napi::Object result = Napi::Object::New(env);

    // Convert operations array
    Napi::Array operations = Napi::Array::New(env, result_.operations.size());
    for (size_t i = 0; i < result_.operations.size(); i++)
    {
      operations[i] = operationToJS(env, result_.operations[i]);
    }
    result.Set("operations", operations);

    // Convert extents
    Napi::Object extents = Napi::Object::New(env);
    extents.Set("min", position3ToJS(env, result_.extents.min));
    extents.Set("max", position3ToJS(env, result_.extents.max));
    result.Set("extents", extents);

    return result;
  }

} // namespace GCodeParser
