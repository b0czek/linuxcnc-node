#include "linuxcnc_grpc/program/workspace.hpp"

#include <unistd.h>

#include <filesystem>
#include <random>
#include <stdexcept>
#include <system_error>
#include <utility>

namespace linuxcnc::server {
namespace fs = std::filesystem;

namespace {

fs::path absolute_path(fs::path path) { return fs::absolute(std::move(path)); }

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

void initialize_active_link(const fs::path& active, const fs::path& empty) {
  std::error_code error;
  fs::create_directories(active.parent_path(), error);
  if (error) throw std::system_error(error, "create active program parent");
  fs::remove_all(empty, error);
  if (error) throw std::system_error(error, "clear empty active workspace");
  fs::create_directory(empty, error);
  if (error) throw std::system_error(error, "create empty active workspace");

  const auto prefix = "." + active.filename().string() + ".next-";
  for (fs::directory_iterator it(active.parent_path(), error), end;
       !error && it != end; it.increment(error)) {
    if (it->path().filename().string().starts_with(prefix)) {
      std::error_code cleanup_error;
      fs::remove_all(it->path(), cleanup_error);
    }
  }
  if (error) throw std::system_error(error, "scan active program parent");

  fs::remove_all(active, error);
  if (error) throw std::system_error(error, "reset active program path");
  const auto temporary =
      active.parent_path() /
      (prefix + std::to_string(static_cast<long>(::getpid())));
  fs::remove(temporary, error);
  error.clear();
  fs::create_directory_symlink(empty, temporary, error);
  if (error) throw std::system_error(error, "create active program link");
  fs::rename(temporary, active, error);
  if (error) throw std::system_error(error, "publish active program link");
}

}  // namespace

ProgramWorkspaceStore::ProgramWorkspaceStore(fs::path root,
                                             fs::path active_directory,
                                             WorkspaceLimits limits)
    : root_(absolute_path(std::move(root))),
      active_directory_(absolute_path(std::move(active_directory))),
      staging_root_(root_ / ".uploads"),
      empty_active_directory_(
          active_directory_.parent_path() /
          ("." + active_directory_.filename().string() + ".empty")),
      limits_(limits) {
  std::error_code error;
  fs::create_directories(root_, error);
  if (error) throw std::system_error(error, "create workspace root");
  if (has_symlink_component(root_, root_.root_path()) ||
      has_symlink_component(active_directory_.parent_path(),
                            active_directory_.root_path()))
    throw std::runtime_error("workspace parents may not contain symlinks");
  fs::remove_all(staging_root_, error);
  if (error) throw std::system_error(error, "clear upload staging root");
  fs::create_directory(staging_root_, error);
  if (error) throw std::system_error(error, "create upload staging root");
  initialize_active_link(active_directory_, empty_active_directory_);

  const auto now = std::chrono::steady_clock::now();
  for (const auto& entry : fs::directory_iterator(root_)) {
    std::error_code scan_error;
    const auto id = entry.path().filename().string();
    if (entry.path() == staging_root_ || !valid_id(id) ||
        !entry.is_directory(scan_error) || scan_error ||
        entry.is_symlink(scan_error) || scan_error)
      continue;
    const auto [bytes, entries] = directory_usage(entry.path());
    workspaces_.emplace(id, Workspace{now, limits_.ttl, bytes, entries, 0});
  }
}

WorkspacePublishStatus ProgramWorkspaceStore::publish_revision(
    const fs::path& staged_revision, std::size_t bytes, std::size_t entries,
    std::chrono::seconds ttl, std::string* workspace_id) {
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
  fs::rename(staged_revision, workspace_path(id), error);
  if (error)
    return error == std::errc::no_space_on_device
               ? WorkspacePublishStatus::ResourceExhausted
               : WorkspacePublishStatus::IoError;
  workspaces_.emplace(
      id, Workspace{std::chrono::steady_clock::now(),
                    ttl == std::chrono::seconds::zero() ? limits_.ttl : ttl,
                    bytes, entries, 0});
  *workspace_id = std::move(id);
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
  if (found == workspaces_.end() || !safe_regular_file(source) ||
      has_symlink_component(source, workspace))
    return false;
  ++found->second.leases;
  touch_locked(workspace_id);
  *resolved_entry = source;
  return true;
}

bool ProgramWorkspaceStore::unpin_entry(const std::string& workspace_id) {
  std::lock_guard lock(mutex_);
  const auto found = workspaces_.find(workspace_id);
  if (found == workspaces_.end() || found->second.leases == 0) return false;
  --found->second.leases;
  touch_locked(workspace_id);
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
  const auto now = std::chrono::steady_clock::now();
  std::size_t removed = 0;
  for (auto it = workspaces_.begin(); it != workspaces_.end();) {
    if (it->second.leases == 0 && now - it->second.touched > it->second.ttl) {
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

void ProgramWorkspaceStore::touch_locked(const std::string& id) {
  const auto found = workspaces_.find(id);
  if (found != workspaces_.end())
    found->second.touched = std::chrono::steady_clock::now();
}

}  // namespace linuxcnc::server
