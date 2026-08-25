#pragma once

#include <chrono>
#include <cstddef>
#include <cstdint>
#include <filesystem>
#include <mutex>
#include <string>
#include <unordered_map>
#include <vector>

namespace linuxcnc::server {

struct WorkspaceLimits {
  std::size_t max_workspace_bytes = 256U * 1024U * 1024U;
  std::size_t max_total_bytes = 1024U * 1024U * 1024U;
  std::chrono::seconds ttl = std::chrono::hours(24);
};

// Safe workspace storage for ProgramService. It only accepts relative paths,
// rejects symlinks and executable files, and enforces both per-workspace and
// aggregate quotas before replacing an uploaded file.
class ProgramWorkspaceStore {
 public:
  ProgramWorkspaceStore(std::filesystem::path root,
                        std::filesystem::path active_directory,
                        WorkspaceLimits limits = {});

  std::string create(std::chrono::seconds ttl = std::chrono::seconds::zero());
  bool write_file(const std::string& workspace_id,
                  const std::string& relative_path,
                  const std::vector<std::uint8_t>& contents);
  bool remove_file(const std::string& workspace_id,
                   const std::string& relative_path);
  bool erase(const std::string& workspace_id);
  bool pin(const std::string& workspace_id);
  bool unpin(const std::string& workspace_id);
  bool resolve_entry(const std::string& workspace_id,
                     const std::string& entry_path,
                     std::filesystem::path* resolved_entry);
  bool materialize(const std::string& workspace_id,
                   const std::string& entry_path,
                   std::filesystem::path* materialized_entry = nullptr);
  std::size_t prune_expired();

  std::filesystem::path root() const { return root_; }
  std::filesystem::path active_directory() const { return active_directory_; }

 private:
  struct Workspace {
    std::chrono::steady_clock::time_point touched;
    std::chrono::seconds ttl;
    std::size_t leases = 0;
  };

  static bool valid_id(const std::string& workspace_id);
  static bool valid_relative_path(const std::string& relative_path,
                                  std::filesystem::path* normalized);
  static bool has_symlink_component(const std::filesystem::path& path,
                                    const std::filesystem::path& stop);
  static std::size_t directory_size(const std::filesystem::path& directory);
  bool within_root(const std::filesystem::path& path) const;
  std::filesystem::path workspace_path(const std::string& workspace_id) const;
  bool workspace_exists(const std::string& workspace_id) const;
  std::size_t total_size_locked() const;
  void touch_locked(const std::string& workspace_id);

  const std::filesystem::path root_;
  const std::filesystem::path active_directory_;
  const WorkspaceLimits limits_;
  mutable std::mutex mutex_;
  std::unordered_map<std::string, Workspace> workspaces_;
  std::uint64_t next_id_ = 1;
};

}  // namespace linuxcnc::server
