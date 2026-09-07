#include "linuxcnc_grpc/scope/telemetry.hpp"

#include <array>
#include <iomanip>
#include <random>
#include <sstream>
#include <utility>

#include "linuxcnc_grpc/scope/controller.hpp"

namespace linuxcnc::server {

struct ScopeTelemetry::State {
  std::string owner;
  std::string token;
  std::shared_ptr<LinuxCncScopeController> controller;
  SubscriptionHub<std::uint64_t> wakes;
  bool attached = false;
};

std::string ScopeTelemetry::make_token() {
  std::array<unsigned char, 16> bytes{};
  std::random_device random;
  for (auto& byte : bytes) byte = static_cast<unsigned char>(random());
  std::ostringstream output;
  output << std::hex << std::setfill('0');
  for (const auto byte : bytes)
    output << std::setw(2) << static_cast<unsigned>(byte);
  return output.str();
}

std::string ScopeTelemetry::register_controller(
    const std::string& owner,
    std::shared_ptr<LinuxCncScopeController> controller) {
  std::lock_guard lock(mutex_);
  if (closed_ || owner.empty() || !controller) return {};
  if (state_)
    return state_->owner == owner ? "/v1/scope/" + state_->token
                                  : std::string{};
  state_ = std::make_shared<State>();
  state_->owner = owner;
  state_->token = make_token();
  state_->controller = std::move(controller);
  return "/v1/scope/" + state_->token;
}

void ScopeTelemetry::revoke(const std::string& owner) {
  std::shared_ptr<State> state;
  {
    std::lock_guard lock(mutex_);
    if (!state_ || state_->owner != owner) return;
    state = std::move(state_);
  }
  state->controller->set_frame_listener({});
  state->wakes.close();
}

std::optional<std::string> ScopeTelemetry::claim(const std::string& token) {
  std::shared_ptr<State> state;
  {
    std::lock_guard lock(mutex_);
    if (closed_ || !state_ || state_->token != token || state_->attached)
      return std::nullopt;
    state = state_;
    state->attached = true;
  }
  const std::weak_ptr<State> weak = state;
  state->controller->set_frame_listener([weak] {
    if (const auto locked = weak.lock())
      locked->wakes.publish(locked->controller->skipped_frames());
  });
  return token;
}

void ScopeTelemetry::release(const std::string& token) {
  std::shared_ptr<State> state;
  {
    std::lock_guard lock(mutex_);
    if (!state_ || state_->token != token || !state_->attached) return;
    state = state_;
    state->attached = false;
  }
  state->controller->set_frame_listener({});
  state->controller->discard_frames(state->owner);
}

std::optional<ScopeFrame> ScopeTelemetry::next(const std::string& token) {
  std::shared_ptr<State> state;
  {
    std::lock_guard lock(mutex_);
    if (!state_ || state_->token != token || !state_->attached)
      return std::nullopt;
    state = state_;
  }
  return state->controller->next_frame(state->owner);
}

std::optional<ScopeFrame> ScopeTelemetry::acknowledge(
    const std::string& token, std::uint64_t generation) {
  std::shared_ptr<State> state;
  {
    std::lock_guard lock(mutex_);
    if (!state_ || state_->token != token || !state_->attached)
      return std::nullopt;
    state = state_;
  }
  return state->controller->acknowledge(state->owner, generation);
}

ScopeTelemetry::Subscription ScopeTelemetry::subscribe(
    const std::string& token,
    SubscriptionHub<std::uint64_t>::Callback callback) {
  std::lock_guard lock(mutex_);
  return !state_ || state_->token != token
             ? Subscription{}
             : state_->wakes.subscribe(std::move(callback));
}

void ScopeTelemetry::close() {
  std::shared_ptr<State> state;
  {
    std::lock_guard lock(mutex_);
    if (closed_) return;
    closed_ = true;
    state = std::move(state_);
  }
  if (state) {
    state->controller->set_frame_listener({});
    state->wakes.close();
  }
}

}  // namespace linuxcnc::server
