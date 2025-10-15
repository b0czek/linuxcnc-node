#pragma once
#include <napi.h>
#include <vector>
#include <memory>
#include <thread>
#include <mutex>
#include <atomic>
#include <chrono>
#include <optional>
#include "common.hh"
#include "rcs.hh"
#include "emc.hh"
#include "emc_nml.hh"
#include "position_logger_utils.hh"

namespace LinuxCNC
{

  class NapiPositionLogger : public Napi::ObjectWrap<NapiPositionLogger>
  {
  public:
    static Napi::Object Init(Napi::Env env, Napi::Object exports);
    NapiPositionLogger(const Napi::CallbackInfo &info);
    ~NapiPositionLogger();

  private:
    static Napi::FunctionReference constructor;

    // Methods exposed to JavaScript
    Napi::Value Start(const Napi::CallbackInfo &info);
    Napi::Value Stop(const Napi::CallbackInfo &info);
    Napi::Value Clear(const Napi::CallbackInfo &info);
    Napi::Value GetCurrentPosition(const Napi::CallbackInfo &info);
    Napi::Value GetMotionHistory(const Napi::CallbackInfo &info);
    Napi::Value GetHistoryCount(const Napi::CallbackInfo &info);

    // Internal methods
    void LoggerThread();
    std::optional<PositionPoint> getCurrentPositionInternal();
    bool connectToStatChannel();
    void disconnectFromStatChannel();
    bool pollStatChannel();

    // Member variables
    RCS_STAT_CHANNEL *stat_channel_;
    EMC_STAT current_status_{};
    std::vector<PositionPoint> position_history_;

    std::thread logger_thread_;
    std::atomic<bool> should_stop_;
    std::atomic<bool> should_clear_;
    std::mutex history_mutex_;

    double logging_interval_; // in seconds
    size_t max_history_size_;

    static constexpr double DEFAULT_INTERVAL = 0.01; // 10ms
    static constexpr size_t DEFAULT_MAX_HISTORY = 10000;
    static constexpr double POSITION_EPSILON = 1e-6; // Minimum change to log
  };
}