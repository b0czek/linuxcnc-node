#include "linuxcnc_grpc/filesystem/directory_transaction.hpp"

#include <fcntl.h>
#include <linux/fs.h>
#include <sys/syscall.h>
#include <unistd.h>

#include <cerrno>
#include <utility>

namespace linuxcnc::server {
namespace fs = std::filesystem;

namespace {

bool exchange_paths(const fs::path& first, const fs::path& second) {
  return ::syscall(SYS_renameat2, AT_FDCWD, first.c_str(), AT_FDCWD,
                   second.c_str(), RENAME_EXCHANGE) == 0;
}

}  // namespace

DirectoryTransaction::DirectoryTransaction(fs::path target, fs::path staging,
                                           Cleanup cleanup)
    : target_(std::move(target)),
      staging_(std::move(staging)),
      cleanup_(std::move(cleanup)) {}

DirectoryTransaction::~DirectoryTransaction() {
  if (state_ == State::Committed) rollback();
  if (state_ == State::Staged) cleanup(std::move(staging_));
}

bool DirectoryTransaction::commit() {
  if (state_ != State::Staged) return false;
  if (!exchange_paths(target_, staging_)) return false;
  state_ = State::Committed;
  return true;
}

void DirectoryTransaction::complete() {
  if (state_ != State::Committed) return;
  state_ = State::Completed;
  cleanup(std::move(staging_));
}

void DirectoryTransaction::rollback() {
  if (state_ != State::Committed || !exchange_paths(target_, staging_)) return;
  state_ = State::RolledBack;
  cleanup(std::move(staging_));
}

void DirectoryTransaction::cleanup(fs::path path) noexcept {
  if (path.empty()) return;
  try {
    if (cleanup_) cleanup_(std::move(path));
  } catch (...) {
    // Callers reconcile orphaned sibling directories on startup. Cleanup must
    // not change the outcome of the external operation being committed.
  }
}

}  // namespace linuxcnc::server
