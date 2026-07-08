#include "position_logger.hh"
#include "common.hh"
#include <algorithm>
#include <thread>
#include <cstring>
#include <cmath>
#include <optional>
#include "tooldata.hh"

namespace LinuxCNC
{
  Napi::FunctionReference NapiPositionLogger::constructor;

  Napi::Object NapiPositionLogger::Init(Napi::Env env, Napi::Object exports)
  {
    Napi::HandleScope scope(env);
    Napi::Function func = DefineClass(env, "NativePositionLogger", {
                                                                       InstanceMethod("start", &NapiPositionLogger::Start),
                                                                       InstanceMethod("stop", &NapiPositionLogger::Stop),
                                                                       InstanceMethod("clear", &NapiPositionLogger::Clear),
                                                                       InstanceMethod("getCurrentPosition", &NapiPositionLogger::GetCurrentPosition),
                                                                       InstanceMethod("getMotionHistory", &NapiPositionLogger::GetMotionHistory),
                                                                       InstanceMethod("getHistoryCount", &NapiPositionLogger::GetHistoryCount),
                                                                       InstanceMethod("getDeltaSince", &NapiPositionLogger::GetDeltaSince),
                                                                       InstanceMethod("getCurrentCursor", &NapiPositionLogger::GetCurrentCursor),
                                                                   });

    constructor = Napi::Persistent(func);
    constructor.SuppressDestruct();
    exports.Set("NativePositionLogger", func);
    return exports;
  }

  NapiPositionLogger::NapiPositionLogger(const Napi::CallbackInfo &info)
      : Napi::ObjectWrap<NapiPositionLogger>(info), stat_channel_(nullptr), should_stop_(false), should_clear_(false), logging_interval_(DEFAULT_INTERVAL), max_history_size_(DEFAULT_MAX_HISTORY), cursor_(0), oldest_cursor_(0)
  {
  }

  NapiPositionLogger::~NapiPositionLogger()
  {
    should_stop_ = true;
    if (logger_thread_.joinable())
    {
      logger_thread_.join();
    }
    disconnectFromStatChannel();
  }

  Napi::Value NapiPositionLogger::Start(const Napi::CallbackInfo &info)
  {
    Napi::Env env = info.Env();

    // Connect to stat channel if not already connected
    if (!connectToStatChannel())
    {
      Napi::Error::New(env, "Failed to connect to LinuxCNC stat channel").ThrowAsJavaScriptException();
      return env.Undefined();
    }

    // Optional interval parameter
    if (info.Length() > 0 && info[0].IsNumber())
    {
      logging_interval_ = info[0].As<Napi::Number>().DoubleValue();
      if (logging_interval_ <= 0)
      {
        logging_interval_ = DEFAULT_INTERVAL;
      }
    }

    // Optional max history size parameter
    if (info.Length() > 1 && info[1].IsNumber())
    {
      max_history_size_ = static_cast<size_t>(info[1].As<Napi::Number>().Uint32Value());
      if (max_history_size_ == 0)
      {
        max_history_size_ = DEFAULT_MAX_HISTORY;
      }
    }

    // Stop existing thread if running
    if (logger_thread_.joinable())
    {
      should_stop_ = true;
      logger_thread_.join();
    }

    should_stop_ = false;
    should_clear_ = false;

    // Start logging thread
    logger_thread_ = std::thread(&NapiPositionLogger::LoggerThread, this);

    return env.Undefined();
  }

  Napi::Value NapiPositionLogger::Stop(const Napi::CallbackInfo &info)
  {
    Napi::Env env = info.Env();

    should_stop_ = true;
    if (logger_thread_.joinable())
    {
      logger_thread_.join();
    }

    return env.Undefined();
  }

  Napi::Value NapiPositionLogger::Clear(const Napi::CallbackInfo &info)
  {
    Napi::Env env = info.Env();

    // Clear is handled in logger thread to avoid race conditions
    // but we also reset cursors atomically here
    should_clear_ = true;

    return env.Undefined();
  }

  Napi::Value NapiPositionLogger::GetCurrentPosition(const Napi::CallbackInfo &info)
  {
    Napi::Env env = info.Env();

    // Get position from last element of vector
    std::lock_guard<std::mutex> lock(history_mutex_);
    if (position_history_.empty())
    {
      return env.Null();
    }

    PositionPoint current = position_history_.back();

    // Create Float64Array with 10 values: x, y, z, a, b, c, u, v, w, motionType
    Napi::Float64Array result = Napi::Float64Array::New(env, 10);
    result[0] = current.x;
    result[1] = current.y;
    result[2] = current.z;
    result[3] = current.a;
    result[4] = current.b;
    result[5] = current.c;
    result[6] = current.u;
    result[7] = current.v;
    result[8] = current.w;
    result[9] = static_cast<double>(current.motionType);

    return result;
  }

  Napi::Value NapiPositionLogger::GetMotionHistory(const Napi::CallbackInfo &info)
  {
    Napi::Env env = info.Env();

    std::lock_guard<std::mutex> lock(history_mutex_);

    // Optional parameters for range
    size_t start_index = 0;
    size_t count = position_history_.size();

    if (info.Length() > 0 && info[0].IsNumber())
    {
      start_index = static_cast<size_t>(info[0].As<Napi::Number>().Uint32Value());
    }

    if (info.Length() > 1 && info[1].IsNumber())
    {
      count = static_cast<size_t>(info[1].As<Napi::Number>().Uint32Value());
    }

    // Clamp values
    start_index = std::min(start_index, position_history_.size());
    count = std::min(count, position_history_.size() - start_index);

    // Create Float64Array with 10 values per point: x, y, z, a, b, c, u, v, w, motionType
    constexpr size_t STRIDE = 10;
    Napi::Float64Array result = Napi::Float64Array::New(env, count * STRIDE);

    for (size_t i = 0; i < count; ++i)
    {
      const PositionPoint &point = position_history_[start_index + i];
      size_t offset = i * STRIDE;

      result[offset + 0] = point.x;
      result[offset + 1] = point.y;
      result[offset + 2] = point.z;
      result[offset + 3] = point.a;
      result[offset + 4] = point.b;
      result[offset + 5] = point.c;
      result[offset + 6] = point.u;
      result[offset + 7] = point.v;
      result[offset + 8] = point.w;
      result[offset + 9] = static_cast<double>(point.motionType);
    }

    return result;
  }

  Napi::Value NapiPositionLogger::GetHistoryCount(const Napi::CallbackInfo &info)
  {
    Napi::Env env = info.Env();

    std::lock_guard<std::mutex> lock(history_mutex_);
    return Napi::Number::New(env, static_cast<uint32_t>(position_history_.size()));
  }

  Napi::Value NapiPositionLogger::GetCurrentCursor(const Napi::CallbackInfo &info)
  {
    Napi::Env env = info.Env();
    return Napi::Number::New(env, static_cast<uint32_t>(cursor_.load()));
  }

  Napi::Value NapiPositionLogger::GetDeltaSince(const Napi::CallbackInfo &info)
  {
    Napi::Env env = info.Env();

    size_t requested_cursor = 0;
    if (info.Length() > 0 && info[0].IsNumber())
    {
      requested_cursor = static_cast<size_t>(info[0].As<Napi::Number>().Uint32Value());
    }

    std::lock_guard<std::mutex> lock(history_mutex_);

    size_t current_cursor = cursor_.load();
    size_t oldest = oldest_cursor_.load();

    // Create result object
    Napi::Object result = Napi::Object::New(env);

    // Check if requested cursor is stale (history has wrapped past it)
    bool was_reset = requested_cursor < oldest;
    result.Set("wasReset", Napi::Boolean::New(env, was_reset));
    result.Set("cursor", Napi::Number::New(env, static_cast<uint32_t>(current_cursor)));

    // Calculate start position in history vector
    size_t start_cursor = was_reset ? oldest : requested_cursor;
    size_t delta_count = current_cursor > start_cursor ? current_cursor - start_cursor : 0;

    // Clamp to actual history size
    delta_count = std::min(delta_count, position_history_.size());

    // Calculate starting index in the vector
    // The vector may not be at max capacity yet
    size_t start_index = position_history_.size() - delta_count;

    // Create Float64Array with results
    constexpr size_t STRIDE = 10;
    Napi::Float64Array points = Napi::Float64Array::New(env, delta_count * STRIDE);

    for (size_t i = 0; i < delta_count; ++i)
    {
      const PositionPoint &point = position_history_[start_index + i];
      size_t offset = i * STRIDE;

      points[offset + 0] = point.x;
      points[offset + 1] = point.y;
      points[offset + 2] = point.z;
      points[offset + 3] = point.a;
      points[offset + 4] = point.b;
      points[offset + 5] = point.c;
      points[offset + 6] = point.u;
      points[offset + 7] = point.v;
      points[offset + 8] = point.w;
      points[offset + 9] = static_cast<double>(point.motionType);
    }

    result.Set("points", points);
    result.Set("count", Napi::Number::New(env, static_cast<uint32_t>(delta_count)));

    return result;
  }

  void NapiPositionLogger::LoggerThread()
  {
    PositionPoint last_position = {};
    PositionPoint second_last_position = {};
    bool first_run = true;
    bool second_run = true;

    while (!should_stop_)
    {
      if (should_clear_)
      {
        std::lock_guard<std::mutex> lock(history_mutex_);
        position_history_.clear();
        // Keep cursor monotonic - mark everything including current cursor as gone
        // so pre-clear cursors are detected as stale (wasReset = true)
        oldest_cursor_ = cursor_.load() + 1;
        should_clear_ = false;
        first_run = true;
        second_run = true;
      }

      auto current_opt = getCurrentPositionInternal();
      if (!current_opt.has_value())
      {
        // Skip this iteration if we can't get position data
        std::this_thread::sleep_for(std::chrono::duration<double>(logging_interval_));
        continue;
      }

      PositionPoint current = current_opt.value();

      // Check if position changed significantly or if it's the first/second run
      if (first_run || second_run || PositionLoggerUtils::isPositionChanged(current, last_position))
      {
        bool should_log = true;

        // Check for colinearity if we have at least 3 points
        if (!first_run && !second_run)
        {
          // Check if current, last, and second_last are colinear
          // If they are, we might skip logging this point to reduce redundant data
          if (PositionLoggerUtils::isColinear(current, last_position, second_last_position) &&
              current.motionType == last_position.motionType &&
              last_position.motionType == second_last_position.motionType)
          {
            // Points are colinear and same motion type - update last position but don't log
            // This reduces redundant points in straight line moves
            should_log = false;

            // Update the last logged point in history with current position
            {
              std::lock_guard<std::mutex> lock(history_mutex_);
              if (!position_history_.empty())
              {
                position_history_.back() = current;
              }
            }
          }
        }

        if (should_log)
        {
          std::lock_guard<std::mutex> lock(history_mutex_);
          position_history_.push_back(current);
          cursor_++;

          // Limit history size
          if (position_history_.size() > max_history_size_)
          {
            size_t excess = position_history_.size() - max_history_size_;
            position_history_.erase(position_history_.begin(),
                                    position_history_.begin() + excess);
            oldest_cursor_ += excess;
          }
        }

        // Update position tracking
        second_last_position = last_position;
        last_position = current;

        if (first_run)
        {
          first_run = false;
        }
        else if (second_run)
        {
          second_run = false;
        }
      }

      // Sleep for the specified interval
      std::this_thread::sleep_for(std::chrono::duration<double>(logging_interval_));
    }
  }

  std::optional<PositionPoint> NapiPositionLogger::getCurrentPositionInternal()
  {
    if (!stat_channel_)
    {
      return std::nullopt;
    }

    // Poll the stat channel to get current status
    if (!pollStatChannel())
    {
      return std::nullopt;
    }

    PositionPoint point = {};
    point.timestamp = std::chrono::steady_clock::now();

    // Extract position data from EMC_STAT
    point.x = current_status_.motion.traj.position.tran.x - current_status_.task.toolOffset.tran.x;
    point.y = current_status_.motion.traj.position.tran.y - current_status_.task.toolOffset.tran.y;
    point.z = current_status_.motion.traj.position.tran.z - current_status_.task.toolOffset.tran.z;
    point.a = current_status_.motion.traj.position.a - current_status_.task.toolOffset.a;
    point.b = current_status_.motion.traj.position.b - current_status_.task.toolOffset.b;
    point.c = current_status_.motion.traj.position.c - current_status_.task.toolOffset.c;
    point.u = current_status_.motion.traj.position.u - current_status_.task.toolOffset.u;
    point.v = current_status_.motion.traj.position.v - current_status_.task.toolOffset.v;
    point.w = current_status_.motion.traj.position.w - current_status_.task.toolOffset.w;

    // Get motion type
    point.motionType = current_status_.motion.traj.motion_type;

    return point;
  }

  bool NapiPositionLogger::connectToStatChannel()
  {
    if (stat_channel_)
    {
      return true; // Already connected
    }

    // Get NML file path
    const char *nml_file = GetNmlFileCStr();
    if (strlen(nml_file) == 0)
    {
      return false;
    }

    // Create the stat channel
    stat_channel_ = new RCS_STAT_CHANNEL(emcFormat, "emcStatus", "xemc", nml_file);
    if (!stat_channel_ || !stat_channel_->valid())
    {
      delete stat_channel_;
      stat_channel_ = nullptr;
      return false;
    }

    // for some reason, tool_mmap_user() must be called before using the stat channel
    if (tool_mmap_user() != 0)
    {
      delete stat_channel_;
      stat_channel_ = nullptr;
      return false;
    }

    // Initial poll to populate current_status_
    pollStatChannel();

    return true;
  }

  void NapiPositionLogger::disconnectFromStatChannel()
  {
    if (stat_channel_)
    {
      delete stat_channel_;
      stat_channel_ = nullptr;
    }
  }

  bool NapiPositionLogger::pollStatChannel()
  {
    if (!stat_channel_ || !stat_channel_->valid())
    {
      return false;
    }

    if (stat_channel_->peek() == EMC_STAT_TYPE)
    {
      EMC_STAT *emc_status_ptr = static_cast<EMC_STAT *>(stat_channel_->get_address());
      if (emc_status_ptr)
      {
        // Copy the status data
        current_status_ = *emc_status_ptr;
        return true;
      }
    }

    return false;
  }

}
