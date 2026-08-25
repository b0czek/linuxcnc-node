#include <google/protobuf/empty.pb.h>
#include <grpcpp/grpcpp.h>

#include <algorithm>
#include <atomic>
#include <chrono>
#include <condition_variable>
#include <cstddef>
#include <cstdint>
#include <deque>
#include <filesystem>
#include <memory>
#include <mutex>
#include <optional>
#include <stdexcept>
#include <string>
#include <unordered_map>
#include <utility>
#include <vector>

#include "grpc/service_factories.hpp"
#include "grpc/unary_task_reactor.hpp"
#include "linuxcnc/v1/program.grpc.pb.h"
#include "linuxcnc_grpc/callback_runtime.hpp"
#include "linuxcnc_grpc/daemon_config.hpp"
#include "linuxcnc_grpc/gcode_parser.hpp"
#include "linuxcnc_grpc/program_workspace.hpp"
#include "linuxcnc_grpc/protobuf_gcode_mapping.hpp"

namespace linuxcnc::server::detail {
namespace {

using namespace linuxcnc::v1;

constexpr std::size_t kMaxUploadChunk = std::size_t{16} * 1024U * 1024U;

::grpc::Status invalid(const std::string& message) {
  return {::grpc::StatusCode::INVALID_ARGUMENT, message};
}

using ProgramCallbackBase = ProgramService::WithCallbackMethod_CreateWorkspace<
    ProgramService::WithCallbackMethod_UploadWorkspace<
        ProgramService::WithCallbackMethod_DeleteWorkspace<
            ProgramService::Service>>>;

class ProgramServiceImpl final : public ProgramCallbackBase,
                                 public ManagedGrpcService {
  class UploadReactor;
  class ParseReactor;

 public:
  explicit ProgramServiceImpl(const DaemonConfig& config,
                              std::shared_ptr<ProgramWorkspaceStore> store,
                              BoundedExecutor& blocking,
                              AdmissionCounter& upload_admission)
      : store_(std::move(store)),
        blocking_(blocking),
        upload_admission_(upload_admission),
        default_ttl_(config.workspace_ttl),
        max_upload_bytes_(config.workspace_quota_bytes),
        prune_period_(
            std::max(std::chrono::seconds(1),
                     std::min(config.workspace_ttl,
                              std::chrono::duration_cast<std::chrono::seconds>(
                                  std::chrono::hours(1))))),
        stopping_(false),
        pruner_([this] {
          std::unique_lock lock(prune_mutex_);
          while (!stopping_.load(std::memory_order_relaxed)) {
            if (prune_condition_.wait_for(lock, prune_period_, [this] {
                  return stopping_.load(std::memory_order_relaxed);
                })) {
              break;
            }
            lock.unlock();
            store_->prune_expired();
            lock.lock();
          }
        }) {}

  ~ProgramServiceImpl() override { shutdown(); }

  ::grpc::Service* service() noexcept override { return this; }

  void shutdown() override {
    if (stopping_.exchange(true, std::memory_order_relaxed)) return;
    prune_condition_.notify_all();
    if (pruner_.joinable()) pruner_.join();
    callbacks_.shutdown();
  }

  ::grpc::ServerUnaryReactor* CreateWorkspace(
      ::grpc::CallbackServerContext*, const CreateWorkspaceRequest* request,
      CreateWorkspaceResponse* response) override {
    auto owned_request = std::make_shared<CreateWorkspaceRequest>(*request);
    return new detail::UnaryTaskReactor<CreateWorkspaceResponse>(
        blocking_, callbacks_, response,
        [this, owned_request = std::move(owned_request)](
            const CancellationToken& cancelled,
            CreateWorkspaceResponse* task_response) {
          if (cancelled.cancelled()) {
            return ::grpc::Status(::grpc::StatusCode::CANCELLED,
                                  "RPC cancelled");
          }
          return create_workspace(*owned_request, task_response);
        });
  }

  ::grpc::Status create_workspace(const CreateWorkspaceRequest& request,
                                  CreateWorkspaceResponse* response) {
    try {
      const auto ttl = request.ttl_seconds() == 0
                           ? std::chrono::seconds::zero()
                           : std::chrono::seconds(request.ttl_seconds());
      response->set_workspace_id(store_->create(ttl));
      const auto effective_ttl =
          ttl == std::chrono::seconds::zero() ? default_ttl_ : ttl;
      const auto expires =
          std::chrono::time_point_cast<std::chrono::milliseconds>(
              std::chrono::system_clock::now() + effective_ttl)
              .time_since_epoch()
              .count();
      response->set_expires_at_unix_ms(static_cast<std::uint64_t>(expires));
      return ::grpc::Status::OK;
    } catch (const std::exception& error) {
      return {::grpc::StatusCode::INTERNAL, error.what()};
    }
  }

  ::grpc::ServerReadReactor<UploadWorkspaceRequest>* UploadWorkspace(
      ::grpc::CallbackServerContext*,
      UploadWorkspaceResponse* response) override {
    return new UploadReactor(*this, response);
  }

  ::grpc::ServerUnaryReactor* DeleteWorkspace(
      ::grpc::CallbackServerContext*, const DeleteWorkspaceRequest* request,
      google::protobuf::Empty* response) override {
    auto owned_request = std::make_shared<DeleteWorkspaceRequest>(*request);
    return new detail::UnaryTaskReactor<google::protobuf::Empty>(
        blocking_, callbacks_, response,
        [this, owned_request = std::move(owned_request)](
            const CancellationToken& cancelled, google::protobuf::Empty*) {
          if (cancelled.cancelled()) {
            return ::grpc::Status(::grpc::StatusCode::CANCELLED,
                                  "RPC cancelled");
          }
          if (!store_->erase(owned_request->workspace_id())) {
            return invalid("workspace not found or leased");
          }
          return ::grpc::Status::OK;
        });
  }

 private:
  class UploadReactor final
      : public ::grpc::ServerReadReactor<UploadWorkspaceRequest> {
    struct State {
      explicit State(std::shared_ptr<ProgramWorkspaceStore> value)
          : store(std::move(value)) {}
      ~State() {
        if (leased) store->unpin(workspace_id);
      }
      std::shared_ptr<ProgramWorkspaceStore> store;
      bool leased = false;
      std::string workspace_id;
      std::unordered_map<std::string, std::vector<std::uint8_t>> pending;
      std::size_t pending_bytes = 0;
    };

    struct Result {
      Result() = default;
      Result(::grpc::Status value, bool end)
          : status(std::move(value)), finish(end) {}
      ::grpc::Status status;
      bool finish = false;
      std::size_t bytes = 0;
      std::string file;
    };

   public:
    UploadReactor(ProgramServiceImpl& service,
                  UploadWorkspaceResponse* response)
        : service_(service),
          response_(response),
          admitted_(service_.upload_admission_.acquire()),
          state_(std::make_shared<State>(service_.store_)),
          gate_(std::make_shared<LifetimeGate<UploadReactor>>(this)) {
      const std::weak_ptr<LifetimeGate<UploadReactor>> weak_gate = gate_;
      registration_ = service_.callbacks_.register_callback([weak_gate] {
        if (auto gate = weak_gate.lock()) {
          gate->invoke([](UploadReactor& reactor) { reactor.shutdown(); });
        }
      });
      if (!registration_) {
        shutdown();
        return;
      }
      if (!admitted_) {
        finish({::grpc::StatusCode::RESOURCE_EXHAUSTED,
                "workspace upload limit reached"});
      } else {
        StartRead(&request_);
      }
    }

    void OnReadDone(bool ok) override {
      gate_->invoke([ok](UploadReactor& reactor) { reactor.read_done(ok); });
    }

    void OnCancel() override {
      token_->cancel();
      gate_->invoke([](UploadReactor& reactor) {
        reactor.finish({::grpc::StatusCode::CANCELLED, "upload cancelled"});
      });
    }

    void OnDone() override {
      gate_->detach();
      registration_.reset();
      if (admitted_) service_.upload_admission_.release();
      delete this;
    }

    void shutdown() {
      token_->cancel();
      finish({::grpc::StatusCode::UNAVAILABLE, "server shutting down"});
    }

   private:
    void read_done(bool ok) {
      if (!ok) {
        finish(validate_end(*state_));
        return;
      }
      auto message = request_;
      request_.Clear();
      const auto state = state_;
      const auto token = token_;
      const auto max_upload_bytes = service_.max_upload_bytes_;
      const std::weak_ptr<LifetimeGate<UploadReactor>> weak_gate = gate_;
      if (!service_.blocking_.submit([weak_gate, state, token, max_upload_bytes,
                                      message = std::move(message)]() mutable {
            Result result = consume(*state, message, *token, max_upload_bytes);
            auto gate = weak_gate.lock();
            if (gate) {
              gate->invoke([&](UploadReactor& reactor) {
                reactor.consumed(std::move(result));
              });
            }
          })) {
        finish({::grpc::StatusCode::RESOURCE_EXHAUSTED,
                "filesystem work queue is full"});
      }
    }

    static Result consume(State& state, const UploadWorkspaceRequest& request,
                          const CancellationToken& token,
                          std::size_t max_upload_bytes) {
      if (token.cancelled()) {
        return {{::grpc::StatusCode::CANCELLED, "upload cancelled"}, true};
      }
      if (request.content_case() == UploadWorkspaceRequest::kFinish) {
        return {validate_end(state), true};
      }
      if (request.content_case() != UploadWorkspaceRequest::kFile) {
        return {invalid("file chunk required"), true};
      }
      const auto& file = request.file();
      if (state.workspace_id.empty()) {
        state.workspace_id = request.workspace_id();
        if (state.workspace_id.empty() ||
            !state.store->pin(state.workspace_id)) {
          return {invalid("workspace not found"), true};
        }
        state.leased = true;
      }
      if (request.workspace_id() != state.workspace_id) {
        return {invalid("all chunks must address one workspace"), true};
      }
      if (file.data().size() > kMaxUploadChunk ||
          file.relative_path().empty()) {
        return {invalid("invalid or oversized file chunk"), true};
      }
      if (file.data().size() > max_upload_bytes ||
          state.pending_bytes > max_upload_bytes - file.data().size()) {
        return {{::grpc::StatusCode::RESOURCE_EXHAUSTED,
                 "workspace upload exceeds its bounded quota"},
                true};
      }
      auto& buffer = state.pending[file.relative_path()];
      state.pending_bytes += file.data().size();
      buffer.insert(buffer.end(), file.data().begin(), file.data().end());
      if (file.eof()) {
        if (!state.store->write_file(state.workspace_id, file.relative_path(),
                                     buffer)) {
          return {invalid("workspace path or quota rejected"), true};
        }
        Result result;
        result.bytes = buffer.size();
        result.file = file.relative_path();
        state.pending_bytes -= buffer.size();
        state.pending.erase(file.relative_path());
        return result;
      }
      return {};
    }

    static ::grpc::Status validate_end(const State& state) {
      if (!state.pending.empty()) {
        return invalid("workspace upload ended before file eof");
      }
      if (state.workspace_id.empty()) {
        return invalid("workspace upload requires at least one file");
      }
      return ::grpc::Status::OK;
    }

    void consumed(Result result) {
      if (result.bytes) {
        response_->set_bytes_written(response_->bytes_written() + result.bytes);
      }
      if (!result.file.empty()) response_->add_files(std::move(result.file));
      if (result.finish) {
        finish(std::move(result.status));
      } else {
        StartRead(&request_);
      }
    }

    void finish(::grpc::Status status) {
      gate_->finish([&](UploadReactor& reactor) { reactor.Finish(status); });
    }

    ProgramServiceImpl& service_;
    UploadWorkspaceResponse* response_;
    bool admitted_ = false;
    UploadWorkspaceRequest request_;
    std::shared_ptr<State> state_;
    std::shared_ptr<CancellationToken> token_ =
        std::make_shared<CancellationToken>();
    std::shared_ptr<LifetimeGate<UploadReactor>> gate_;
    ActiveCallbackRegistry::Registration registration_;
  };

  std::shared_ptr<ProgramWorkspaceStore> store_;
  BoundedExecutor& blocking_;
  AdmissionCounter& upload_admission_;
  const std::chrono::seconds default_ttl_;
  const std::size_t max_upload_bytes_;
  const std::chrono::seconds prune_period_;
  std::mutex prune_mutex_;
  std::condition_variable prune_condition_;
  std::atomic<bool> stopping_;
  std::thread pruner_;
  ActiveCallbackRegistry callbacks_;
};

}  // namespace

std::unique_ptr<ManagedGrpcService> make_program_service(
    const DaemonConfig& config, std::shared_ptr<ProgramWorkspaceStore> store,
    BoundedExecutor& blocking, AdmissionCounter& upload_admission) {
  return std::make_unique<ProgramServiceImpl>(config, std::move(store),
                                              blocking, upload_admission);
}

}  // namespace linuxcnc::server::detail
