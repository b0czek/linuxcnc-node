#pragma once

#include <grpcpp/support/status.h>

#include <mutex>
#include <optional>
#include <utility>

namespace linuxcnc::server::detail {

// Tracks the one gRPC callback constraint shared by the server's streaming
// reactors: Finish must wait until the outstanding write completes.
class DeferredWriteFinish {
 public:
  [[nodiscard]] bool try_start_write() {
    std::lock_guard lock(mutex_);
    if (write_in_flight_ || terminal_status_ || finish_started_) return false;
    write_in_flight_ = true;
    return true;
  }

  void complete_write(bool ok) {
    std::lock_guard lock(mutex_);
    write_in_flight_ = false;
    if (!ok && !terminal_status_) terminal_status_ = ::grpc::Status::OK;
  }

  void request_finish(::grpc::Status status) {
    std::lock_guard lock(mutex_);
    if (!terminal_status_ && !finish_started_)
      terminal_status_ = std::move(status);
  }

  [[nodiscard]] std::optional<::grpc::Status> take_finish_status() {
    std::lock_guard lock(mutex_);
    if (write_in_flight_ || !terminal_status_ || finish_started_)
      return std::nullopt;
    finish_started_ = true;
    return terminal_status_;
  }

  [[nodiscard]] bool write_in_flight() const {
    std::lock_guard lock(mutex_);
    return write_in_flight_;
  }

  [[nodiscard]] bool termination_requested() const {
    std::lock_guard lock(mutex_);
    return terminal_status_.has_value() || finish_started_;
  }

 private:
  mutable std::mutex mutex_;
  bool write_in_flight_ = false;
  bool finish_started_ = false;
  std::optional<::grpc::Status> terminal_status_;
};

}  // namespace linuxcnc::server::detail
