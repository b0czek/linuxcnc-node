#pragma once

#include <cstdint>
#include <memory>
#include <mutex>
#include <optional>
#include <string>

#include "linuxcnc_grpc/callback_runtime.hpp"

namespace linuxcnc::server {

class LinuxCncScopeController;
struct ScopeFrame;

// Owns the browser attachment token for the daemon's scope controller. The
// attached WebSocket only consumes and acknowledges telemetry frames.
class ScopeTelemetry {
 public:
  using Subscription = SubscriptionHub<std::uint64_t>::Subscription;

  std::string register_controller(
      const std::string& owner,
      std::shared_ptr<LinuxCncScopeController> controller);
  void revoke(const std::string& owner);

  std::optional<std::string> claim(const std::string& token);
  void release(const std::string& token);
  std::optional<ScopeFrame> next(const std::string& token);
  std::optional<ScopeFrame> acknowledge(const std::string& token,
                                        std::uint64_t generation);
  Subscription subscribe(const std::string& token,
                         SubscriptionHub<std::uint64_t>::Callback callback);
  void close();

 private:
  struct State;
  static std::string make_token();

  mutable std::mutex mutex_;
  std::shared_ptr<State> state_;
  bool closed_ = false;
};

}  // namespace linuxcnc::server
