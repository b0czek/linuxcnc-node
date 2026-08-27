#pragma once

#include <chrono>
#include <cstddef>
#include <cstdint>
#include <filesystem>
#include <memory>
#include <mutex>
#include <string>
#include <unordered_map>

#include "linuxcnc_grpc/filesystem/directory_transaction.hpp"

namespace linuxcnc::server {

struct WorkspaceLimits {
  std::size_t max_workspace_bytes = std::size_t{256} * 1024U * 1024U;
  std::size_t max_total_bytes = std::size_t{1024} * 1024U * 1024U;
  std::chrono::seconds ttl = std::chrono::hours(24);
  std::size_t max_workspaces = 64;
  std::size_t max_entries_per_workspace = 4096;
};

enum class WorkspacePublishStatus { Ok, Invalid, ResourceExhausted, IoError };

// Owns immutable, atomically published workspace revisions. LinuxCNC sees the
// leased active revision through a server-owned symlink at PROGRAM_PREFIX.
class ProgramWorkspaceStore {
 public:
  ProgramWorkspaceStore(std::filesystem::path root,
                        std::filesystem::path active_directory,
                        WorkspaceLimits limits = {});

  WorkspacePublishStatus publish_revision(
      const std::filesystem::path& staged_revision, std::size_t bytes,
      std::size_t entries, std::chrono::seconds ttl, std::string* workspace_id);
  bool erase(const std::string& workspace_id);
  bool pin_entry(const std::string& workspace_id, const std::string& entry_path,
                 std::filesystem::path* resolved_entry);
  bool unpin_entry(const std::string& workspace_id);
  std::shared_ptr<DirectoryTransaction> stage(
      const std::string& workspace_id, const std::string& entry_path,
      DirectoryTransaction::Cleanup cleanup);
  std::size_t prune_expired();

  const std::filesystem::path& root() const noexcept { return root_; }
  const std::filesystem::path& staging_root() const noexcept {
    return staging_root_;
  }
  const std::filesystem::path& active_directory() const noexcept {
    return active_directory_;
  }

 private:
  struct Workspace {
    std::chrono::steady_clock::time_point touched;
    std::chrono::seconds ttl;
    std::size_t bytes = 0;
    std::size_t entries = 0;
    std::size_t leases = 0;
  };

  static bool valid_id(const std::string& workspace_id);
  static bool valid_relative_path(const std::string& relative_path,
                                  std::filesystem::path* normalized);
  static bool has_symlink_component(const std::filesystem::path& path,
                                    const std::filesystem::path& stop);
  static std::pair<std::size_t, std::size_t> directory_usage(
      const std::filesystem::path& directory);
  std::filesystem::path workspace_path(const std::string& workspace_id) const;
  bool workspace_exists(const std::string& workspace_id) const;
  std::size_t total_size_locked() const;
  void touch_locked(const std::string& workspace_id);

  const std::filesystem::path root_;
  const std::filesystem::path active_directory_;
  const std::filesystem::path staging_root_;
  const std::filesystem::path empty_active_directory_;
  const WorkspaceLimits limits_;
  mutable std::mutex mutex_;
  std::unordered_map<std::string, Workspace> workspaces_;
  std::uint64_t next_id_ = 1;
};

}  // namespace linuxcnc::server
