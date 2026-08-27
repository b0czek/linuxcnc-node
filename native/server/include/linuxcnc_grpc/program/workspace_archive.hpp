#pragma once

#include <cstddef>
#include <filesystem>
#include <string>

namespace linuxcnc::server {

struct WorkspaceArchiveLimits {
  std::size_t max_extracted_bytes;
  std::size_t max_entries;
  std::size_t max_metadata_bytes;
};

enum class WorkspaceArchiveStatus {
  Ok,
  Invalid,
  ResourceExhausted,
  IoError,
};

struct WorkspaceArchiveResult {
  WorkspaceArchiveStatus status = WorkspaceArchiveStatus::Invalid;
  std::size_t extracted_bytes = 0;
  std::size_t entries = 0;
  std::string error;
};

// Extracts exactly one Zstandard-compressed tar archive into an empty,
// caller-owned directory. Archive ownership, permissions, links, and special
// files are never reproduced.
WorkspaceArchiveResult extract_workspace_archive(
    const std::filesystem::path& archive,
    const std::filesystem::path& destination, WorkspaceArchiveLimits limits);

}  // namespace linuxcnc::server
