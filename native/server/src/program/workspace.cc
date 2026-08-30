#include "linuxcnc_grpc/program/workspace.hpp"

#include <sys/stat.h>
#include <unistd.h>

#include <algorithm>
#include <filesystem>
#include <random>
#include <stdexcept>
#include <system_error>
#include <utility>

namespace linuxcnc::server {
namespace fs = std::filesystem;

namespace {

fs::path absolute_path(const fs::path& path) {
  return fs::absolute(path).lexically_normal();
}

bool path_contains(const fs::path& parent, const fs::path& child) {
  const auto mismatch =
      std::mismatch(parent.begin(), parent.end(), child.begin(), child.end());
  return mismatch.first == parent.end();
}

void require_owned_directory(const fs::path& path, bool private_directory) {
  struct stat status{};
  if (::lstat(path.c_str(), &status) != 0 || !S_ISDIR(status.st_mode) ||
      status.st_uid != ::geteuid() ||
      (status.st_mode & (S_IWGRP | S_IWOTH)) != 0 ||
      (private_directory && (status.st_mode & (S_IRWXG | S_IRWXO)) != 0)) {
    throw std::runtime_error(
        "workspace paths must be owned by the daemon and "
        "must not grant unsafe permissions");
  }
}

void create_owned_directory(const fs::path& path, bool private_directory) {
  std::error_code error;
  const bool created = fs::create_directories(path, error);
  if (error) throw std::system_error(error, "create workspace directory");
  if (created) {
    auto permissions = fs::perms::owner_all;
    if (!private_directory) {
      permissions |= fs::perms::group_read | fs::perms::group_exec |
                     fs::perms::others_read | fs::perms::others_exec;
    }
    fs::permissions(path, permissions, fs::perm_options::replace, error);
    if (error) throw std::system_error(error, "secure workspace directory");
  }
  require_owned_directory(path, private_directory);
}

std::string opaque_workspace_id() {
  static constexpr char hex[] = "0123456789abcdef";
  std::random_device random;
  std::string id = "workspace-";
  id.reserve(id.size() + 32);
  for (int index = 0; index < 32; ++index) id.push_back(hex[random() & 0x0fU]);
  return id;
}

bool safe_regular_file(const fs::path& path) {
  std::error_code error;
  const auto status = fs::symlink_status(path, error);
  return !error && fs::is_regular_file(status);
}

void publish_active_link(const fs::path& active, const fs::path& target) {
  std::error_code error;
  const auto prefix = "." + active.filename().string() + ".replace-";
  const auto temporary =
      active.parent_path() /
      (prefix + std::to_string(static_cast<long>(::getpid())));
  fs::remove(temporary, error);
  error.clear();
  fs::create_directory_symlink(target, temporary, error);
  if (error) throw std::system_error(error, "create active program link");
  fs::rename(temporary, active, error);
  if (error) throw std::system_error(error, "publish active program link");
}

}  // namespace

ProgramWorkspaceStore::ProgramWorkspaceStore(const fs::path& root,
                                             const fs::path& active_directory,
                                             WorkspaceLimits limits)
    : root_(absolute_path(root)),
      active_directory_(absolute_path(active_directory)),
      staging_root_(root_ / ".uploads"),
      empty_active_directory_(
          active_directory_.parent_path() /
          ("." + active_directory_.filename().string() + ".empty")),
      limits_(limits) {
  std::error_code error;
  if (path_contains(root_, active_directory_) ||
      path_contains(active_directory_, root_))
    throw std::runtime_error(
        "workspace root and active program directory must not overlap");
  create_owned_directory(active_directory_.parent_path(), false);
  create_owned_directory(root_, true);
  if (has_symlink_component(root_, root_.root_path()) ||
      has_symlink_component(active_directory_.parent_path(),
                            active_directory_.root_path()))
    throw std::runtime_error("workspace parents may not contain symlinks");
  fs::remove_all(staging_root_, error);
  if (error) throw std::system_error(error, "clear upload staging root");
  create_owned_directory(staging_root_, true);
  fs::remove_all(empty_active_directory_, error);
  if (error) throw std::system_error(error, "clear empty active workspace");
  create_owned_directory(empty_active_directory_, true);

  for (const auto& entry : fs::directory_iterator(root_)) {
    std::error_code scan_error;
    const auto id = entry.path().filename().string();
    if (entry.path() == staging_root_ || !valid_id(id) ||
        !entry.is_directory(scan_error) || scan_error ||
        entry.is_symlink(scan_error) || scan_error)
      continue;
    const auto [bytes, entries] = directory_usage(entry.path());
    const auto expires_at = entry.last_write_time(scan_error);
    if (scan_error) continue;
    workspaces_.emplace(id, Workspace{expires_at, bytes, entries, 0});
  }

  const auto recover = [this](const fs::path& link) {
    const auto id = linked_workspace_id(link);
    if (id.empty()) return false;
    if (recovered_leases_.insert(id).second) ++workspaces_.at(id).leases;
    return true;
  };
  bool valid_active = recover(active_directory_);
  std::error_code active_error;
  if (!valid_active &&
      fs::is_symlink(fs::symlink_status(active_directory_, active_error)) &&
      !active_error) {
    active_error.clear();
    const auto target = fs::weakly_canonical(
        active_directory_.parent_path() / fs::read_symlink(active_directory_),
        active_error);
    valid_active = !active_error && target == empty_active_directory_;
  }
  if (!valid_active) {
    fs::remove_all(active_directory_, active_error);
    if (active_error)
      throw std::system_error(active_error,
                              "clear invalid active program path");
    publish_active_link(active_directory_, empty_active_directory_);
  }

  const auto prefix = "." + active_directory_.filename().string() + ".next-";
  for (fs::directory_iterator it(active_directory_.parent_path(), error), end;
       !error && it != end; it.increment(error)) {
    if (!it->path().filename().string().starts_with(prefix)) continue;
    if (recover(it->path())) {
      recovered_links_.push_back(it->path());
    } else {
      std::error_code cleanup_error;
      fs::remove_all(it->path(), cleanup_error);
    }
  }
  if (error) throw std::system_error(error, "scan active program parent");
}

WorkspacePublishStatus ProgramWorkspaceStore::publish_revision(
    const fs::path& staged_revision, std::size_t bytes, std::size_t entries,
    std::string* workspace_id,
    std::chrono::system_clock::time_point* expires_at) {
  if (!workspace_id ||
      staged_revision.parent_path().parent_path() != staging_root_)
    return WorkspacePublishStatus::Invalid;
  std::error_code error;
  if (!fs::is_directory(fs::symlink_status(staged_revision, error)) || error ||
      bytes > limits_.max_workspace_bytes ||
      entries > limits_.max_entries_per_workspace)
    return WorkspacePublishStatus::Invalid;

  std::lock_guard lock(mutex_);
  if (workspaces_.size() >= limits_.max_workspaces ||
      bytes > limits_.max_total_bytes ||
      total_size_locked() > limits_.max_total_bytes - bytes)
    return WorkspacePublishStatus::ResourceExhausted;
  std::string id;
  do {
    id = opaque_workspace_id();
  } while (workspace_exists(id));
  const auto file_expiration = fs::file_time_type::clock::now() + limits_.ttl;
  fs::last_write_time(staged_revision, file_expiration, error);
  if (error) return WorkspacePublishStatus::IoError;
  fs::rename(staged_revision, workspace_path(id), error);
  if (error)
    return error == std::errc::no_space_on_device
               ? WorkspacePublishStatus::ResourceExhausted
               : WorkspacePublishStatus::IoError;
  workspaces_.emplace(id, Workspace{file_expiration, bytes, entries, 0});
  *workspace_id = std::move(id);
  if (expires_at) *expires_at = std::chrono::system_clock::now() + limits_.ttl;
  return WorkspacePublishStatus::Ok;
}

bool ProgramWorkspaceStore::erase(const std::string& workspace_id) {
  if (!valid_id(workspace_id)) return false;
  std::lock_guard lock(mutex_);
  const auto found = workspaces_.find(workspace_id);
  if (found == workspaces_.end() || found->second.leases != 0) return false;
  std::error_code error;
  fs::remove_all(workspace_path(workspace_id), error);
  if (error) return false;
  workspaces_.erase(found);
  return true;
}

bool ProgramWorkspaceStore::pin_entry(const std::string& workspace_id,
                                      const std::string& entry_path,
                                      fs::path* resolved_entry) {
  if (!resolved_entry) return false;
  fs::path entry;
  if (!valid_id(workspace_id) || !valid_relative_path(entry_path, &entry))
    return false;
  std::lock_guard lock(mutex_);
  const auto found = workspaces_.find(workspace_id);
  const auto workspace = workspace_path(workspace_id);
  const auto source = workspace / entry;
  if (found == workspaces_.end() ||
      fs::file_time_type::clock::now() >= found->second.expires_at ||
      !safe_regular_file(source) || has_symlink_component(source, workspace))
    return false;
  ++found->second.leases;
  *resolved_entry = source;
  return true;
}

bool ProgramWorkspaceStore::unpin_entry(const std::string& workspace_id) {
  std::lock_guard lock(mutex_);
  const auto found = workspaces_.find(workspace_id);
  if (found == workspaces_.end() || found->second.leases == 0) return false;
  --found->second.leases;
  return true;
}

std::shared_ptr<DirectoryTransaction> ProgramWorkspaceStore::stage(
    const std::string& workspace_id, const std::string& entry_path,
    DirectoryTransaction::Cleanup cleanup) {
  fs::path entry;
  if (!valid_id(workspace_id) || !valid_relative_path(entry_path, &entry))
    return {};
  std::lock_guard lock(mutex_);
  const auto found = workspaces_.find(workspace_id);
  const auto workspace = workspace_path(workspace_id);
  if (found == workspaces_.end() || found->second.leases == 0 ||
      fs::file_time_type::clock::now() >= found->second.expires_at ||
      !safe_regular_file(workspace / entry))
    return {};

  std::error_code error;
  fs::path staging;
  do {
    staging = active_directory_.parent_path() /
              ("." + active_directory_.filename().string() + ".next-" +
               std::to_string(next_id_++));
  } while (fs::exists(fs::symlink_status(staging, error)) && !error);
  error.clear();
  fs::create_directory_symlink(workspace, staging, error);
  if (error) return {};
  return std::make_shared<DirectoryTransaction>(
      active_directory_, std::move(staging), std::move(cleanup));
}

std::size_t ProgramWorkspaceStore::prune_expired() {
  std::lock_guard lock(mutex_);
  const auto now = fs::file_time_type::clock::now();
  std::size_t removed = 0;
  for (auto it = workspaces_.begin(); it != workspaces_.end();) {
    if (it->second.leases == 0 && now >= it->second.expires_at) {
      std::error_code error;
      fs::remove_all(workspace_path(it->first), error);
      if (!error) {
        it = workspaces_.erase(it);
        ++removed;
        continue;
      }
    }
    ++it;
  }
  return removed;
}

bool ProgramWorkspaceStore::release_recovered_leases() {
  std::vector<fs::path> links;
  bool released = false;
  {
    std::lock_guard lock(mutex_);
    released = !recovered_leases_.empty();
    for (const auto& id : recovered_leases_) {
      const auto found = workspaces_.find(id);
      if (found != workspaces_.end() && found->second.leases != 0)
        --found->second.leases;
    }
    recovered_leases_.clear();
    links = std::move(recovered_links_);
  }
  for (const auto& link : links) {
    std::error_code error;
    fs::remove(link, error);
  }
  return released;
}

void ProgramWorkspaceStore::clear_active_link() {
  try {
    publish_active_link(active_directory_, empty_active_directory_);
  } catch (...) {
    // A stale link is safe: startup recovery pins its target again.
    return;
  }
}

bool ProgramWorkspaceStore::valid_id(const std::string& id) {
  if (!id.starts_with("workspace-") || id.size() != 42) return false;
  for (std::size_t index = 10; index < id.size(); ++index) {
    const char value = id[index];
    if (!((value >= '0' && value <= '9') || (value >= 'a' && value <= 'f')))
      return false;
  }
  return true;
}

bool ProgramWorkspaceStore::valid_relative_path(const std::string& value,
                                                fs::path* normalized) {
  if (!normalized || value.empty()) return false;
  const fs::path path(value);
  if (path.is_absolute() || path != path.lexically_normal()) return false;
  for (const auto& component : path)
    if (component.empty() || component == "." || component == "..")
      return false;
  *normalized = path;
  return true;
}

bool ProgramWorkspaceStore::has_symlink_component(const fs::path& path,
                                                  const fs::path& stop) {
  auto current = path;
  for (;;) {
    std::error_code error;
    if (fs::is_symlink(fs::symlink_status(current, error)) && !error)
      return true;
    if (current == stop || current == current.root_path()) return false;
    const auto parent = current.parent_path();
    if (parent == current) return false;
    current = parent;
  }
}

std::pair<std::size_t, std::size_t> ProgramWorkspaceStore::directory_usage(
    const fs::path& directory) {
  std::size_t bytes = 0;
  std::size_t entries = 0;
  std::error_code error;
  for (fs::recursive_directory_iterator it(directory, error), end;
       !error && it != end; it.increment(error)) {
    ++entries;
    if (it->is_regular_file(error) && !error) bytes += it->file_size(error);
  }
  if (error) throw std::system_error(error, "scan workspace revision");
  return {bytes, entries};
}

std::string ProgramWorkspaceStore::linked_workspace_id(
    const fs::path& link) const {
  std::error_code error;
  if (!fs::is_symlink(fs::symlink_status(link, error)) || error) return {};
  auto target = fs::read_symlink(link, error);
  if (error) return {};
  if (target.is_relative()) target = link.parent_path() / target;
  target = fs::weakly_canonical(target, error);
  if (error || target.parent_path() != root_) return {};
  const auto id = target.filename().string();
  return valid_id(id) && workspaces_.contains(id) ? id : std::string{};
}

fs::path ProgramWorkspaceStore::workspace_path(const std::string& id) const {
  return root_ / id;
}

bool ProgramWorkspaceStore::workspace_exists(const std::string& id) const {
  std::error_code error;
  return fs::is_directory(fs::symlink_status(workspace_path(id), error)) &&
         !error;
}

std::size_t ProgramWorkspaceStore::total_size_locked() const {
  std::size_t total = 0;
  for (const auto& [id, workspace] : workspaces_) {
    (void)id;
    total += workspace.bytes;
  }
  return total;
}

}  // namespace linuxcnc::server
