#include <atomic>
#include <cassert>
#include <condition_variable>
#include <cstdint>
#include <memory>
#include <mutex>
#include <thread>

#include "linuxcnc_grpc/callback_runtime.hpp"

namespace {

using linuxcnc::server::LifetimeGate;
using linuxcnc::server::SubscriptionHub;

class Barrier {
 public:
  explicit Barrier(int participants) : remaining_(participants) {}

  void arrive_and_wait() {
    std::unique_lock lock(mutex_);
    if (--remaining_ == 0) {
      open_ = true;
      condition_.notify_all();
      return;
    }
    condition_.wait(lock, [this] { return open_; });
  }

 private:
  std::mutex mutex_;
  std::condition_variable condition_;
  int remaining_;
  bool open_ = false;
};

struct ReactorProbe {
  void wake() {
    if (active_.fetch_add(1) != 0) overlapped_ = true;
    std::this_thread::yield();
    ++calls_;
    --active_;
  }

  std::atomic<int> active_{0};
  std::atomic<int> calls_{0};
  std::atomic<bool> overlapped_{false};
};

void subscription_publish_and_initial_wake_are_serialized() {
  for (int iteration = 0; iteration < 1000; ++iteration) {
    ReactorProbe reactor;
    auto gate = std::make_shared<LifetimeGate<ReactorProbe>>(&reactor);
    std::weak_ptr<LifetimeGate<ReactorProbe>> weak_gate = gate;
    SubscriptionHub<std::uint64_t> hub;
    auto subscription = hub.subscribe([weak_gate](const std::uint64_t&) {
      if (auto locked = weak_gate.lock()) {
        locked->invoke([](ReactorProbe& value) { value.wake(); });
      }
    });

    Barrier barrier(3);
    std::thread publisher([&] {
      barrier.arrive_and_wait();
      hub.publish(1);
    });
    std::thread initializer([&] {
      barrier.arrive_and_wait();
      gate->invoke([](ReactorProbe& value) { value.wake(); });
    });
    barrier.arrive_and_wait();
    publisher.join();
    initializer.join();

    assert(reactor.calls_ == 2);
    assert(!reactor.overlapped_);
  }
}

}  // namespace

int main() {
  subscription_publish_and_initial_wake_are_serialized();
  return 0;
}
