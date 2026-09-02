#pragma once

#include <array>
#include <atomic>
#include <chrono>
#include <condition_variable>
#include <cstdint>
#include <functional>
#include <memory>
#include <mutex>
#include <optional>
#include <stdexcept>
#include <string>
#include <thread>
#include <variant>
#include <vector>

namespace linuxcnc::server {

struct LinuxCncScopeControllerState;

constexpr std::size_t kScopeChannelCount = 16;
constexpr auto kScopePollPeriod = std::chrono::milliseconds(20);
constexpr auto kScopeHeartbeatPeriod = std::chrono::milliseconds(100);

enum class ScopeState {
  Idle,
  Init,
  PreTrigger,
  TriggerWait,
  PostTrigger,
  Done,
  Reset,
  Invalid
};
enum class ScopeRunMode { Run, Single, Roll };
enum class ScopeSourceKind { Pin, Param, Signal };
enum class ScopeFrameKind { Capture, Roll };

struct ScopeSource {
  ScopeSourceKind kind = ScopeSourceKind::Pin;
  std::string name;
};

struct ScopeChannelConfig {
  bool enabled = false;
  ScopeSource source;
};

struct ScopeConfig {
  std::string thread_name;
  int multiplier = 1;
  int pre_trigger = 0;
  int trigger_channel = 0;
  double trigger_level = 0.0;
  bool rising = true;
  bool automatic = false;
  std::array<ScopeChannelConfig, kScopeChannelCount> channels{};
};

struct ScopeStatus {
  ScopeState state = ScopeState::Invalid;
  int buffer_length = 0;
  int record_length = 0;
  int sample_length = 0;
  int samples = 0;
  int start = 0;
  int multiplier = 0;
  int watchdog = 0;
  std::string thread_name;
  std::int64_t sample_period_ns = 0;
};

using ScopeChannelSamples =
    std::array<std::optional<std::vector<double>>, kScopeChannelCount>;

struct ScopeCapture {
  ScopeChannelSamples channels;
  int samples = 0;
  int trigger_index = 0;
  std::int64_t sample_period_ns = 0;
};

struct ScopeCaptureDelta {
  ScopeChannelSamples channels;
  int samples = 0;
  int capacity = 0;
  std::uint64_t sequence = 0;
  std::int64_t sample_period_ns = 0;
  bool reset = false;
};

struct ScopeFrame {
  std::uint64_t generation = 0;
  std::uint64_t skipped_frames = 0;
  ScopeFrameKind kind = ScopeFrameKind::Capture;
  std::variant<ScopeCapture, ScopeCaptureDelta> payload;
};

class ScopeControllerError final : public std::runtime_error {
 public:
  explicit ScopeControllerError(std::string message, int code = 0);
  int code() const noexcept { return code_; }

 private:
  int code_;
};

/**
 * Owns the one-in-flight/one-pending scope event policy. It performs no
 * network I/O; the transport takes a frame and acknowledges it by generation.
 */
class ScopeFrameQueue final {
 public:
  bool acquire(const std::string& owner);
  void release(const std::string& owner);
  void clear(const std::string& owner);
  bool acquired() const;

  bool publish(ScopeFrame frame);
  std::optional<ScopeFrame> next(const std::string& owner);
  std::optional<ScopeFrame> wait_next(const std::string& owner,
                                      std::chrono::milliseconds timeout);
  std::optional<ScopeFrame> acknowledge(const std::string& owner,
                                        std::uint64_t generation);
  std::uint64_t skipped_frames() const;
  void set_listener(std::function<void()> listener);

 private:
  mutable std::mutex mutex_;
  std::condition_variable condition_;
  std::string owner_;
  std::optional<ScopeFrame> in_flight_;
  std::optional<ScopeFrame> pending_;
  bool delivered_ = false;
  std::uint64_t next_generation_ = 1;
  std::uint64_t pending_skipped_frames_ = 0;
  std::uint64_t skipped_frames_ = 0;
  std::function<void()> listener_;
};

/**
 * Native scope_rt controller. The public API is transport-independent; the
 * implementation attaches to LinuxCNC HAL and scope_rt shared memory only in
 * the .cc translation unit. A bounded worker polls at 20 ms and refreshes the
 * scope heartbeat at 100 ms. Its frame queue never performs network work.
 */
class LinuxCncScopeController final {
 public:
  explicit LinuxCncScopeController(
      std::string component_name = "linuxcnc-grpc-scope",
      std::chrono::milliseconds poll_period = kScopePollPeriod,
      std::chrono::milliseconds heartbeat_period = kScopeHeartbeatPeriod,
      std::size_t requested_samples = 32000);
  ~LinuxCncScopeController();
  LinuxCncScopeController(const LinuxCncScopeController&) = delete;
  LinuxCncScopeController& operator=(const LinuxCncScopeController&) = delete;
  LinuxCncScopeController(LinuxCncScopeController&&) = delete;
  LinuxCncScopeController& operator=(LinuxCncScopeController&&) = delete;

  bool acquire(const std::string& owner);
  void release(const std::string& owner);
  bool acquired() const;

  ScopeStatus status() const;
  void configure(const std::string& owner, const ScopeConfig& config);
  void run(const std::string& owner, ScopeRunMode mode);
  void stop(const std::string& owner);
  void trigger(const std::string& owner);

  std::optional<ScopeFrame> next_frame(const std::string& owner);
  std::optional<ScopeFrame> wait_frame(const std::string& owner,
                                       std::chrono::milliseconds timeout);
  std::optional<ScopeFrame> acknowledge(const std::string& owner,
                                        std::uint64_t generation);
  std::uint64_t skipped_frames() const;
  void set_frame_listener(std::function<void()> listener);

  void start_polling();
  void stop_polling();

 private:
  std::unique_ptr<LinuxCncScopeControllerState> impl_;
};

}  // namespace linuxcnc::server
