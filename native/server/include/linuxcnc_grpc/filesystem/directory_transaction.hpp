#pragma once

#include <filesystem>
#include <functional>

namespace linuxcnc::server {

// Owns a fully prepared sibling path until it is atomically published.
// commit() and rollback() perform only same-filesystem renames. Recursive
// staging and cleanup belong on a filesystem executor supplied by the caller.
// The caller serializes transactions that target the same path.
class DirectoryTransaction {
 public:
  using Cleanup = std::function<void(std::filesystem::path)>;

  DirectoryTransaction(std::filesystem::path target,
                       std::filesystem::path staging, Cleanup cleanup);
  ~DirectoryTransaction();

  DirectoryTransaction(const DirectoryTransaction&) = delete;
  DirectoryTransaction& operator=(const DirectoryTransaction&) = delete;

  bool commit();
  void complete();
  void rollback();

  const std::filesystem::path& target() const noexcept { return target_; }
  const std::filesystem::path& staging() const noexcept { return staging_; }

 private:
  enum class State { Staged, Committed, Completed, RolledBack };
  void cleanup(std::filesystem::path path) noexcept;

  std::filesystem::path target_;
  std::filesystem::path staging_;
  Cleanup cleanup_;
  State state_ = State::Staged;
};

}  // namespace linuxcnc::server
