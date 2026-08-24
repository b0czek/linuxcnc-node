#include "linuxcnc_grpc/program_workspace.hpp"

#include <cerrno>
#include <fcntl.h>
#include <fstream>
#include <random>
#include <stdexcept>
#include <system_error>
#include <unordered_map>
#include <unistd.h>

namespace linuxcnc::server {
namespace fs = std::filesystem;

namespace {

bool is_safe_regular_file(const fs::path& path) {
  const auto status = fs::symlink_status(path);
  if (!fs::is_regular_file(status)) return false;
  constexpr auto executable = fs::perms::owner_exec | fs::perms::group_exec |
                              fs::perms::others_exec;
  return (status.permissions() & executable) == fs::perms::none;
}

std::string opaque_workspace_id() {
  static constexpr char hex[] = "0123456789abcdef";
  std::random_device random;
  std::string id = "workspace-";
  id.reserve(id.size() + 32);
  for (int index = 0; index < 32; ++index) {
    id.push_back(hex[random() & 0x0fU]);
  }
  return id;
}

}  // namespace

ProgramWorkspaceStore::ProgramWorkspaceStore(fs::path root, fs::path active_directory,
                                             WorkspaceLimits limits)
    : root_(fs::absolute(std::move(root))),
      active_directory_(fs::absolute(std::move(active_directory))),
      limits_(limits) {
  std::error_code error;
  fs::create_directories(root_, error);
  if (error) throw std::system_error(error, "create workspace root");
  fs::create_directories(active_directory_, error);
  if (error) throw std::system_error(error, "create active program directory");
  if (has_symlink_component(root_, root_.root_path()) ||
      has_symlink_component(active_directory_, active_directory_.root_path())) {
    throw std::runtime_error("workspace directories may not contain symlinks");
  }
  const auto now = std::chrono::steady_clock::now();
  for (const auto& entry : fs::directory_iterator(root_)) {
    const auto id = entry.path().filename().string();
    std::error_code scan_error;
    if (valid_id(id) && entry.is_directory(scan_error) && !scan_error &&
        !entry.is_symlink(scan_error) && !scan_error) {
      workspaces_.emplace(id, Workspace{now, limits_.ttl, false});
    }
  }
}

std::string ProgramWorkspaceStore::create(std::chrono::seconds ttl) {
  std::lock_guard lock(mutex_);
  std::string id;
  do {
    id = opaque_workspace_id();
  } while (workspace_exists(id));
  std::error_code error;
  fs::create_directory(workspace_path(id), error);
  if (error) throw std::system_error(error, "create workspace");
  workspaces_.emplace(id, Workspace{std::chrono::steady_clock::now(),
                                    ttl == std::chrono::seconds::zero() ? limits_.ttl : ttl,
                                    false});
  return id;
}

bool ProgramWorkspaceStore::write_file(const std::string& workspace_id,
                                       const std::string& relative_path,
                                       const std::vector<std::uint8_t>& contents) {
  fs::path normalized;
  if (!valid_id(workspace_id) || !valid_relative_path(relative_path, &normalized)) return false;
  std::lock_guard lock(mutex_);
  if (!workspace_exists(workspace_id)) return false;
  const auto workspace = workspace_path(workspace_id);
  const auto destination = workspace / normalized;
  if (!within_root(destination) || has_symlink_component(destination, workspace)) return false;
  const auto existing = fs::symlink_status(destination);
  if (fs::exists(existing) && !is_safe_regular_file(destination)) {
    return false;
  }
  const auto old_size = fs::is_regular_file(existing) ? fs::file_size(destination) : 0;
  const auto workspace_size = directory_size(workspace);
  if (contents.size() > limits_.max_workspace_bytes || contents.size() > limits_.max_total_bytes ||
      contents.size() > limits_.max_workspace_bytes - std::min(old_size, limits_.max_workspace_bytes) ||
      workspace_size - std::min(old_size, workspace_size) > limits_.max_workspace_bytes - contents.size()) {
    return false;
  }
  const auto total = total_size_locked();
  if (total - std::min(old_size, total) > limits_.max_total_bytes - contents.size()) return false;

  std::error_code error;
  fs::create_directories(destination.parent_path(), error);
  if (error || has_symlink_component(destination.parent_path(), workspace)) return false;
  fs::path temporary;
  int descriptor = -1;
  for (int attempt = 0; attempt < 128; ++attempt) {
    temporary = destination.parent_path() / (".upload-" + opaque_workspace_id());
    descriptor = ::open(temporary.c_str(), O_WRONLY | O_CREAT | O_EXCL | O_CLOEXEC,
                        S_IRUSR | S_IWUSR);
    if (descriptor >= 0) break;
    if (errno != EEXIST) return false;
  }
  if (descriptor < 0) return false;
  std::size_t offset = 0;
  while (offset < contents.size()) {
    const auto written = ::write(descriptor, contents.data() + offset,
                                 contents.size() - offset);
    if (written < 0 && errno == EINTR) continue;
    if (written <= 0) {
      ::close(descriptor);
      fs::remove(temporary, error);
      return false;
    }
    offset += static_cast<std::size_t>(written);
  }
  if (::close(descriptor) != 0) {
    fs::remove(temporary, error);
    return false;
  }
  fs::rename(temporary, destination, error);
  if (error) {
    fs::remove(temporary, error);
    return false;
  }
  touch_locked(workspace_id);
  return true;
}

bool ProgramWorkspaceStore::remove_file(const std::string& workspace_id,
                                        const std::string& relative_path) {
  fs::path normalized;
  if (!valid_id(workspace_id) || !valid_relative_path(relative_path, &normalized)) return false;
  std::lock_guard lock(mutex_);
  const auto path = workspace_path(workspace_id) / normalized;
  if (!workspace_exists(workspace_id) || !within_root(path) ||
      has_symlink_component(path, workspace_path(workspace_id))) return false;
  std::error_code error;
  const bool removed = fs::is_regular_file(fs::symlink_status(path)) && fs::remove(path, error);
  if (removed) touch_locked(workspace_id);
  return removed && !error;
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

bool ProgramWorkspaceStore::pin(const std::string& workspace_id) {
  std::lock_guard lock(mutex_);
  const auto found = workspaces_.find(workspace_id);
  if (found == workspaces_.end()) return false;
  ++found->second.leases;
  touch_locked(workspace_id);
  return true;
}

bool ProgramWorkspaceStore::unpin(const std::string& workspace_id) {
  std::lock_guard lock(mutex_);
  const auto found = workspaces_.find(workspace_id);
  if (found == workspaces_.end()) return false;
  if (found->second.leases == 0) return false;
  --found->second.leases;
  touch_locked(workspace_id);
  return true;
}

bool ProgramWorkspaceStore::resolve_entry(const std::string& workspace_id,
                                          const std::string& entry_path,
                                          fs::path* resolved_entry) {
  if (!resolved_entry) return false;
  fs::path entry;
  if (!valid_id(workspace_id) || !valid_relative_path(entry_path, &entry)) return false;
  std::lock_guard lock(mutex_);
  const auto workspace = workspace_path(workspace_id);
  const auto source_entry = workspace / entry;
  if (!workspace_exists(workspace_id) || !within_root(source_entry) ||
      !is_safe_regular_file(source_entry) ||
      has_symlink_component(source_entry, workspace)) {
    return false;
  }
  touch_locked(workspace_id);
  *resolved_entry = source_entry;
  return true;
}

bool ProgramWorkspaceStore::materialize(const std::string& workspace_id,
                                        const std::string& entry_path,
                                        fs::path* materialized_entry) {
  fs::path entry;
  if (!valid_id(workspace_id) || !valid_relative_path(entry_path, &entry)) return false;
  std::lock_guard lock(mutex_);
  const auto workspace = workspace_path(workspace_id);
  const auto source_entry = workspace / entry;
  if (!workspace_exists(workspace_id) || !is_safe_regular_file(source_entry) ||
      has_symlink_component(source_entry, workspace)) return false;
  std::error_code error;
  fs::create_directories(active_directory_, error);
  if (error || has_symlink_component(active_directory_, active_directory_.root_path())) return false;
  // Validate the complete tree before changing the active program. Build a
  // sibling staging directory, then swap directories with same-filesystem
  // renames so LinuxCNC never observes a partially copied workspace.
  for (const auto& source : fs::recursive_directory_iterator(workspace)) {
    if (source.is_symlink(error) || error) return false;
    if (source.is_regular_file(error) && !is_safe_regular_file(source.path())) return false;
    if (error) return false;
  }
  const auto parent = active_directory_.parent_path();
  const auto stem = active_directory_.filename().string();
  fs::path staging;
  fs::path previous;
  do {
    const auto suffix = std::to_string(next_id_++);
    staging = parent / ("." + stem + ".staging-" + suffix);
    previous = parent / ("." + stem + ".previous-" + suffix);
  } while (fs::exists(staging) || fs::exists(previous));
  fs::create_directory(staging, error);
  if (error) return false;
  for (const auto& source : fs::recursive_directory_iterator(workspace)) {
    if (source.is_symlink(error) || error) {
      fs::remove_all(staging, error);
      return false;
    }
    const auto relative = fs::relative(source.path(), workspace, error);
    if (error) {
      fs::remove_all(staging, error);
      return false;
    }
    const auto destination = staging / relative;
    if (source.is_directory(error)) {
      fs::create_directories(destination, error);
    } else if (source.is_regular_file(error)) {
      fs::create_directories(destination.parent_path(), error);
      if (!error) fs::copy_file(source.path(), destination, fs::copy_options::none, error);
    }
    if (error) {
      std::error_code cleanup_error;
      fs::remove_all(staging, cleanup_error);
      return false;
    }
  }
  fs::rename(active_directory_, previous, error);
  if (error) {
    std::error_code cleanup_error;
    fs::remove_all(staging, cleanup_error);
    return false;
  }
  fs::rename(staging, active_directory_, error);
  if (error) {
    std::error_code restore_error;
    fs::rename(previous, active_directory_, restore_error);
    fs::remove_all(staging, restore_error);
    return false;
  }
  std::error_code cleanup_error;
  fs::remove_all(previous, cleanup_error);
  touch_locked(workspace_id);
  if (materialized_entry) *materialized_entry = active_directory_ / entry;
  return true;
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

bool ProgramWorkspaceStore::valid_id(const std::string& workspace_id) {
  if (workspace_id.empty() || workspace_id == "." || workspace_id == "..") return false;
  for (const char character : workspace_id) {
    if (!(character == '-' || character == '_' || character == '.' ||
          (character >= '0' && character <= '9') ||
          (character >= 'a' && character <= 'z') ||
          (character >= 'A' && character <= 'Z'))) return false;
  }
  return workspace_id.find("..") == std::string::npos;
}

bool ProgramWorkspaceStore::valid_relative_path(const std::string& relative_path,
                                                fs::path* normalized) {
  if (relative_path.empty()) return false;
  fs::path path(relative_path);
  if (path.is_absolute() || path.has_root_name() || path.has_root_directory()) return false;
  for (const auto& component : path) {
    if (component == ".." || component == "." || component.empty()) return false;
  }
  if (normalized) *normalized = path.lexically_normal();
  return true;
}

bool ProgramWorkspaceStore::has_symlink_component(const fs::path& path, const fs::path& stop) {
  fs::path current = path;
  std::error_code error;
  while (!current.empty() && current != stop) {
    const auto status = fs::symlink_status(current, error);
    if (error && error != std::errc::no_such_file_or_directory) return true;
    error.clear();
    if (fs::is_symlink(status)) return true;
    current = current.parent_path();
  }
  return false;
}

std::size_t ProgramWorkspaceStore::directory_size(const fs::path& directory) {
  std::size_t result = 0;
  std::error_code error;
  for (const auto& item : fs::recursive_directory_iterator(
           directory, fs::directory_options::skip_permission_denied, error)) {
    if (error || item.is_symlink(error)) continue;
    if (item.is_regular_file(error)) {
      const auto size = item.file_size(error);
      if (!error) result += size;
    }
  }
  return result;
}

bool ProgramWorkspaceStore::within_root(const fs::path& path) const {
  const auto relative = fs::relative(path, root_);
  if (relative.empty()) return false;
  for (const auto& component : relative) {
    if (component == "..") return false;
  }
  return true;
}

fs::path ProgramWorkspaceStore::workspace_path(const std::string& workspace_id) const {
  return root_ / workspace_id;
}

bool ProgramWorkspaceStore::workspace_exists(const std::string& workspace_id) const {
  return workspaces_.find(workspace_id) != workspaces_.end() &&
         fs::is_directory(fs::symlink_status(workspace_path(workspace_id)));
}

std::size_t ProgramWorkspaceStore::total_size_locked() const {
  std::size_t result = 0;
  for (const auto& [id, workspace] : workspaces_) {
    (void)workspace;
    result += directory_size(workspace_path(id));
  }
  return result;
}

void ProgramWorkspaceStore::touch_locked(const std::string& workspace_id) {
  const auto found = workspaces_.find(workspace_id);
  if (found != workspaces_.end()) found->second.touched = std::chrono::steady_clock::now();
}

}  // namespace linuxcnc::server
