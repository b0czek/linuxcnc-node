#include <fcntl.h>
#include <google/protobuf/empty.pb.h>
#include <grpcpp/grpcpp.h>
#include <unistd.h>

#include <chrono>
#include <cstddef>
#include <cstdint>
#include <filesystem>
#include <memory>
#include <string>
#include <system_error>
#include <utility>

#include "grpc/server/service_factories.hpp"
#include "linuxcnc/v1/program.grpc.pb.h"
#include "linuxcnc_grpc/callback_runtime.hpp"
#include "linuxcnc_grpc/daemon/config.hpp"
#include "linuxcnc_grpc/program/workspace.hpp"
#include "linuxcnc_grpc/program/workspace_archive.hpp"

namespace linuxcnc::server::detail {
namespace {

using namespace linuxcnc::v1;
namespace fs = std::filesystem;

constexpr std::size_t kMaxUploadChunk = std::size_t{16} * 1024U * 1024U;

::grpc::Status invalid(const std::string& message) {
  return {::grpc::StatusCode::INVALID_ARGUMENT, message};
}

::grpc::Status io_failure(int error, const char* message) {
  return {error == ENOSPC || error == ENOMEM
              ? ::grpc::StatusCode::RESOURCE_EXHAUSTED
              : ::grpc::StatusCode::INTERNAL,
          message};
}

class UploadSlot {
 public:
  explicit UploadSlot(AdmissionCounter& admission)
      : admission_(admission), acquired_(admission_.acquire()) {}
  ~UploadSlot() {
    if (acquired_) admission_.release();
  }

  explicit operator bool() const noexcept { return acquired_; }

 private:
  AdmissionCounter& admission_;
  bool acquired_;
};

class StagedArchive {
 public:
  explicit StagedArchive(const fs::path& staging_root)
      : directory_(staging_root / "current"),
        archive_(directory_ / "workspace.tar.zst") {}

  ~StagedArchive() {
    if (descriptor_ >= 0) ::close(descriptor_);
    std::error_code error;
    fs::remove_all(directory_, error);
  }

  ::grpc::Status open() {
    std::error_code error;
    fs::remove_all(directory_, error);
    if (error)
      return io_failure(error.value(), "failed to clear upload staging");
    fs::create_directory(directory_, error);
    if (error)
      return io_failure(error.value(), "failed to create upload staging");
    descriptor_ = ::open(archive_.c_str(),
                         O_WRONLY | O_CREAT | O_EXCL | O_CLOEXEC | O_NOFOLLOW,
                         S_IRUSR | S_IWUSR);
    if (descriptor_ < 0)
      return io_failure(errno, "failed to create staged archive");
    return ::grpc::Status::OK;
  }

  ::grpc::Status append(const std::string& chunk) {
    std::size_t offset = 0;
    while (offset < chunk.size()) {
      const auto written =
          ::write(descriptor_, chunk.data() + offset, chunk.size() - offset);
      if (written < 0 && errno == EINTR) continue;
      if (written <= 0)
        return io_failure(errno, "failed to stage archive data");
      offset += static_cast<std::size_t>(written);
    }
    bytes_ += chunk.size();
    return ::grpc::Status::OK;
  }

  ::grpc::Status close() {
    const int descriptor = std::exchange(descriptor_, -1);
    if (descriptor < 0 || ::close(descriptor) != 0)
      return io_failure(errno, "failed to close staged archive");
    return ::grpc::Status::OK;
  }

  std::size_t bytes() const noexcept { return bytes_; }
  const fs::path& archive() const noexcept { return archive_; }
  fs::path revision() const { return directory_ / "revision"; }

 private:
  fs::path directory_;
  fs::path archive_;
  int descriptor_ = -1;
  std::size_t bytes_ = 0;
};

class ProgramServiceImpl final : public ProgramService::Service,
                                 public ManagedGrpcService {
 public:
  ProgramServiceImpl(const DaemonConfig& config,
                     std::shared_ptr<ProgramWorkspaceStore> store,
                     AdmissionCounter& upload_admission)
      : store_(std::move(store)),
        upload_admission_(upload_admission),
        workspace_ttl_(config.workspace_ttl),
        max_upload_bytes_(config.workspace_quota_bytes),
        archive_limits_{config.workspace_quota_bytes,
                        config.max_workspace_entries,
                        config.max_upload_metadata_bytes},
        upload_timeout_(config.upload_timeout) {}

  ::grpc::Service* service() noexcept override { return this; }
  void shutdown() override {}

  ::grpc::Status UploadWorkspace(
      ::grpc::ServerContext* context,
      ::grpc::ServerReader<UploadWorkspaceRequest>* reader,
      UploadWorkspaceResponse* response) override {
    UploadSlot slot(upload_admission_);
    if (!slot)
      return {::grpc::StatusCode::RESOURCE_EXHAUSTED,
              "a workspace upload is already in progress"};

    const auto deadline = context->deadline();
    const auto now = std::chrono::system_clock::now();
    if (deadline == std::chrono::system_clock::time_point::max() ||
        deadline - now > upload_timeout_)
      return invalid("upload requires a deadline within the configured limit");
    if (deadline <= now)
      return {::grpc::StatusCode::DEADLINE_EXCEEDED,
              "workspace upload deadline expired"};

    try {
      store_->prune_expired();
      StagedArchive staged(store_->staging_root());
      const auto open_status = staged.open();
      if (!open_status.ok()) return open_status;

      UploadWorkspaceRequest request;
      while (reader->Read(&request)) {
        if (context->IsCancelled()) return cancelled();
        const auto& chunk = request.archive_chunk();
        if (chunk.empty() || chunk.size() > kMaxUploadChunk)
          return invalid("empty or oversized archive chunk");
        if (chunk.size() > max_upload_bytes_ ||
            staged.bytes() > max_upload_bytes_ - chunk.size())
          return {::grpc::StatusCode::RESOURCE_EXHAUSTED,
                  "compressed workspace archive exceeds its quota"};
        const auto append_status = staged.append(chunk);
        if (!append_status.ok()) return append_status;
        request.Clear();
      }
      if (context->IsCancelled()) return cancelled();
      if (staged.bytes() == 0) return invalid("workspace upload is empty");
      const auto close_status = staged.close();
      if (!close_status.ok()) return close_status;

      const auto revision = staged.revision();
      std::error_code error;
      fs::create_directory(revision, error);
      if (error)
        return io_failure(error.value(), "failed to create workspace revision");
      const auto extracted = extract_workspace_archive(
          staged.archive(), revision, archive_limits_);
      if (extracted.status != WorkspaceArchiveStatus::Ok)
        return archive_failure(extracted);
      if (context->IsCancelled()) return cancelled();

      std::string workspace_id;
      const auto published = store_->publish_revision(
          revision, extracted.extracted_bytes, extracted.entries,
          std::chrono::seconds::zero(), &workspace_id);
      if (published != WorkspacePublishStatus::Ok)
        return publish_failure(published);

      response->set_workspace_id(std::move(workspace_id));
      response->set_archive_bytes(staged.bytes());
      response->set_extracted_bytes(extracted.extracted_bytes);
      response->set_entries(extracted.entries);
      const auto expires =
          std::chrono::time_point_cast<std::chrono::milliseconds>(
              std::chrono::system_clock::now() + workspace_ttl_)
              .time_since_epoch()
              .count();
      response->set_expires_at_unix_ms(static_cast<std::uint64_t>(expires));
      return ::grpc::Status::OK;
    } catch (const std::bad_alloc&) {
      return {::grpc::StatusCode::RESOURCE_EXHAUSTED,
              "upload allocation failed"};
    } catch (const std::exception& error) {
      return {::grpc::StatusCode::INTERNAL, error.what()};
    }
  }

  ::grpc::Status DeleteWorkspace(::grpc::ServerContext* context,
                                 const DeleteWorkspaceRequest* request,
                                 google::protobuf::Empty*) override {
    if (context->IsCancelled()) return cancelled();
    store_->prune_expired();
    if (!store_->erase(request->workspace_id()))
      return invalid("workspace not found or leased");
    return ::grpc::Status::OK;
  }

 private:
  static ::grpc::Status cancelled() {
    return {::grpc::StatusCode::CANCELLED, "upload cancelled"};
  }

  static ::grpc::Status archive_failure(const WorkspaceArchiveResult& result) {
    const auto code = result.status == WorkspaceArchiveStatus::ResourceExhausted
                          ? ::grpc::StatusCode::RESOURCE_EXHAUSTED
                      : result.status == WorkspaceArchiveStatus::Invalid
                          ? ::grpc::StatusCode::INVALID_ARGUMENT
                          : ::grpc::StatusCode::INTERNAL;
    return {code, result.error};
  }

  static ::grpc::Status publish_failure(WorkspacePublishStatus status) {
    const auto code = status == WorkspacePublishStatus::ResourceExhausted
                          ? ::grpc::StatusCode::RESOURCE_EXHAUSTED
                      : status == WorkspacePublishStatus::Invalid
                          ? ::grpc::StatusCode::INVALID_ARGUMENT
                          : ::grpc::StatusCode::INTERNAL;
    return {code, "failed to publish workspace revision"};
  }

  std::shared_ptr<ProgramWorkspaceStore> store_;
  AdmissionCounter& upload_admission_;
  const std::chrono::seconds workspace_ttl_;
  const std::size_t max_upload_bytes_;
  const WorkspaceArchiveLimits archive_limits_;
  const std::chrono::seconds upload_timeout_;
};

}  // namespace

std::unique_ptr<ManagedGrpcService> make_program_service(
    const DaemonConfig& config, std::shared_ptr<ProgramWorkspaceStore> store,
    AdmissionCounter& upload_admission) {
  return std::make_unique<ProgramServiceImpl>(config, std::move(store),
                                              upload_admission);
}

}  // namespace linuxcnc::server::detail
