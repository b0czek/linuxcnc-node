#include <hal.h>
#include <rtapi.h>
#include <scope_shm.h>

#include <cassert>
#include <chrono>
#include <cstddef>
#include <cstdint>
#include <type_traits>

#include "../src/scope/shm_abi.h"
#include "linuxcnc_grpc/scope/controller.hpp"

using namespace linuxcnc::server;

int main() {
  static_assert(kScopeChannelCount == 16);
  static_assert(kScopePollPeriod == std::chrono::milliseconds(20));
  static_assert(kScopeHeartbeatPeriod == std::chrono::milliseconds(100));
  static_assert(!std::is_copy_constructible_v<ScopeFrameQueue>);
  static_assert(sizeof(linuxcnc_scope_shm_control_t) ==
                sizeof(scope_shm_control_t));
  static_assert(offsetof(linuxcnc_scope_shm_control_t, data_offset) ==
                offsetof(scope_shm_control_t, data_offset));
  static_assert(offsetof(linuxcnc_scope_shm_control_t, data_type) ==
                offsetof(scope_shm_control_t, data_type));
  static_assert(offsetof(linuxcnc_scope_shm_control_t, data_len) ==
                offsetof(scope_shm_control_t, data_len));

  ScopeFrameQueue queue;
  int notifications = 0;
  queue.set_listener([&] { ++notifications; });
  assert(!queue.acquire(""));
  assert(queue.acquire("inspector-a"));
  assert(!queue.acquire("inspector-b"));

  ScopeFrame first;
  first.kind = ScopeFrameKind::Capture;
  first.payload = ScopeCapture{};
  assert(queue.publish(first));
  assert(notifications == 1);
  const auto delivered = queue.next("inspector-a");
  assert(delivered.has_value());
  assert(delivered->generation == 1);
  assert(std::holds_alternative<ScopeCapture>(delivered->payload));
  assert(!queue.next("inspector-a").has_value());

  ScopeFrame second;
  second.kind = ScopeFrameKind::Roll;
  second.payload = ScopeCaptureDelta{};
  assert(queue.publish(second));
  ScopeFrame third;
  third.kind = ScopeFrameKind::Roll;
  third.payload = ScopeCaptureDelta{};
  assert(queue.publish(third));
  assert(notifications == 3);

  const auto next = queue.acknowledge("inspector-a", delivered->generation);
  assert(next.has_value());
  assert(next->generation == 3);
  assert(next->skipped_frames == 1);
  assert(queue.skipped_frames() == 1);
  assert(!queue.acknowledge("inspector-a", delivered->generation).has_value());
  assert(!queue.acknowledge("inspector-a", next->generation).has_value());

  queue.release("inspector-a");
  assert(!queue.acquired());
  assert(queue.acquire("inspector-b"));
  return 0;
}
