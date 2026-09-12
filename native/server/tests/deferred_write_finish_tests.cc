#include <grpcpp/support/status.h>

#include <cassert>
#include <string>
#include <thread>
#include <vector>

#include "grpc/server/deferred_write_finish.hpp"

using linuxcnc::server::detail::DeferredWriteFinish;

namespace {

void finishes_immediately_without_a_write() {
  DeferredWriteFinish state;
  state.request_finish(
      {::grpc::StatusCode::UNAVAILABLE, "server shutting down"});
  const auto status = state.take_finish_status();
  assert(status);
  assert(status->error_code() == ::grpc::StatusCode::UNAVAILABLE);
  assert(!state.take_finish_status());
  assert(!state.try_start_write());
}

void defers_cancellation_until_the_write_completes() {
  DeferredWriteFinish state;
  assert(state.try_start_write());
  state.request_finish({::grpc::StatusCode::CANCELLED, "stream cancelled"});
  assert(state.termination_requested());
  assert(!state.try_start_write());
  assert(!state.take_finish_status());
  state.complete_write(true);
  const auto status = state.take_finish_status();
  assert(status);
  assert(status->error_code() == ::grpc::StatusCode::CANCELLED);
  assert(!state.take_finish_status());
}

void failed_write_requests_a_single_clean_finish() {
  DeferredWriteFinish state;
  assert(state.try_start_write());
  state.complete_write(false);
  const auto status = state.take_finish_status();
  assert(status && status->ok());
  assert(!state.take_finish_status());
  assert(!state.try_start_write());
}

void retains_the_first_of_repeated_concurrent_termination_requests() {
  DeferredWriteFinish state;
  assert(state.try_start_write());
  state.request_finish({::grpc::StatusCode::CANCELLED, "first termination"});

  std::vector<std::thread> requests;
  requests.reserve(16);
  for (int index = 0; index < 16; ++index) {
    requests.emplace_back([&state, index] {
      state.request_finish({::grpc::StatusCode::UNAVAILABLE,
                            "later termination " + std::to_string(index)});
    });
  }
  for (auto& request : requests) request.join();

  assert(!state.take_finish_status());
  state.complete_write(false);
  const auto status = state.take_finish_status();
  assert(status);
  assert(status->error_code() == ::grpc::StatusCode::CANCELLED);
  assert(status->error_message() == "first termination");
  assert(!state.take_finish_status());
}

}  // namespace

int main() {
  finishes_immediately_without_a_write();
  defers_cancellation_until_the_write_completes();
  failed_write_requests_a_single_clean_finish();
  retains_the_first_of_repeated_concurrent_termination_requests();
  return 0;
}
