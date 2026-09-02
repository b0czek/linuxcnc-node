#include "linuxcnc_grpc/program/workspace_archive.hpp"

#include <archive.h>
#include <archive_entry.h>
#include <fcntl.h>
#include <unistd.h>

#include <cerrno>
#include <cstdint>
#include <filesystem>
#include <limits>
#include <memory>
#include <string>
#include <system_error>
#include <unordered_set>

namespace linuxcnc::server {
namespace fs = std::filesystem;

namespace {

using ArchiveHandle = std::unique_ptr<archive, decltype(&archive_read_free)>;

WorkspaceArchiveResult fail(WorkspaceArchiveStatus status,
                            std::string message) {
  return {status, 0, 0, std::move(message)};
}

const char* archive_error_or(archive* value, const char* fallback) {
  const char* message = archive_error_string(value);
  return message ? message : fallback;
}

WorkspaceArchiveStatus io_status(int error) {
  return error == ENOSPC || error == ENOMEM
             ? WorkspaceArchiveStatus::ResourceExhausted
             : WorkspaceArchiveStatus::IoError;
}

WorkspaceArchiveStatus archive_status(archive* value) {
  const int error = archive_errno(value);
  return error == ENOSPC || error == ENOMEM
             ? WorkspaceArchiveStatus::ResourceExhausted
             : WorkspaceArchiveStatus::Invalid;
}

bool normalized_relative_path(const char* raw, fs::path* output) {
  if (!raw || !output) return false;
  const fs::path input(raw);
  if (input.empty() || input.is_absolute()) return false;
  fs::path normalized;
  for (const auto& component : input) {
    if (component.empty() || component == ".") continue;
    if (component == ".." || component == input.root_name() ||
        component == input.root_directory())
      return false;
    normalized /= component;
  }
  if (normalized.empty()) return false;
  *output = std::move(normalized);
  return true;
}

bool write_all(int descriptor, const void* data, std::size_t size) {
  const auto* bytes = static_cast<const std::uint8_t*>(data);
  std::size_t offset = 0;
  while (offset < size) {
    const auto written = ::write(descriptor, bytes + offset, size - offset);
    if (written < 0 && errno == EINTR) continue;
    if (written <= 0) return false;
    offset += static_cast<std::size_t>(written);
  }
  return true;
}

}  // namespace

WorkspaceArchiveResult extract_workspace_archive(
    const fs::path& archive_path, const fs::path& destination,
    WorkspaceArchiveLimits limits) {
  ArchiveHandle reader(archive_read_new(), &archive_read_free);
  if (!reader)
    return fail(WorkspaceArchiveStatus::ResourceExhausted,
                "failed to allocate archive reader");
  if (archive_read_support_filter_zstd(reader.get()) != ARCHIVE_OK)
    return fail(WorkspaceArchiveStatus::IoError,
                "libarchive was built without Zstandard support");
  if (archive_read_support_format_tar(reader.get()) != ARCHIVE_OK)
    return fail(WorkspaceArchiveStatus::IoError,
                "libarchive tar support is unavailable");
  if (archive_read_open_filename(reader.get(), archive_path.c_str(),
                                 static_cast<std::size_t>(64U) * 1024U) !=
      ARCHIVE_OK) {
    return fail(archive_status(reader.get()),
                archive_error_or(reader.get(), "invalid archive"));
  }

  std::error_code error;
  if (!fs::is_directory(fs::symlink_status(destination, error)) || error)
    return fail(WorkspaceArchiveStatus::IoError,
                "archive destination is unavailable");

  WorkspaceArchiveResult result{WorkspaceArchiveStatus::Ok, 0, 0, {}};
  std::size_t metadata_bytes = 0;
  std::unordered_set<std::string> paths;
  archive_entry* entry = nullptr;
  bool saw_entry = false;
  for (;;) {
    const int next = archive_read_next_header(reader.get(), &entry);
    if (next == ARCHIVE_EOF) break;
    if (next != ARCHIVE_OK)
      return fail(archive_status(reader.get()),
                  archive_error_or(reader.get(), "invalid tar header"));
    saw_entry = true;
    if (archive_filter_code(reader.get(), 0) != ARCHIVE_FILTER_ZSTD ||
        (archive_format(reader.get()) & ARCHIVE_FORMAT_BASE_MASK) !=
            ARCHIVE_FORMAT_TAR) {
      return fail(WorkspaceArchiveStatus::Invalid,
                  "workspace must be a Zstandard-compressed tar archive");
    }
    if (result.entries >= limits.max_entries)
      return fail(WorkspaceArchiveStatus::ResourceExhausted,
                  "workspace archive entry limit reached");

    fs::path relative;
    if (!normalized_relative_path(archive_entry_pathname(entry), &relative))
      return fail(WorkspaceArchiveStatus::Invalid,
                  "workspace archive contains an unsafe path");
    const auto name = relative.generic_string();
    if (name.size() > limits.max_metadata_bytes ||
        result.entries > std::numeric_limits<std::size_t>::max() - 1 ||
        !paths.insert(name).second) {
      return fail(WorkspaceArchiveStatus::Invalid,
                  "workspace archive contains duplicate or invalid metadata");
    }
    if (name.size() > limits.max_metadata_bytes -
                          std::min(metadata_bytes, limits.max_metadata_bytes))
      return fail(WorkspaceArchiveStatus::ResourceExhausted,
                  "workspace archive metadata limit reached");
    metadata_bytes += name.size();
    ++result.entries;

    if (archive_entry_symlink(entry) || archive_entry_hardlink(entry) ||
        archive_entry_sparse_count(entry) != 0 ||
        archive_entry_xattr_count(entry) != 0 ||
        archive_entry_acl_count(entry, ARCHIVE_ENTRY_ACL_TYPE_ACCESS |
                                           ARCHIVE_ENTRY_ACL_TYPE_DEFAULT) !=
            0) {
      return fail(
          WorkspaceArchiveStatus::Invalid,
          "workspace archive links and extended metadata are forbidden");
    }
    const auto destination_path = destination / relative;
    const auto type = archive_entry_filetype(entry);
    if (type == AE_IFDIR) {
      fs::create_directories(destination_path, error);
      if (error)
        return fail(io_status(error.value()),
                    "failed to create archive directory");
      continue;
    }
    if (type != AE_IFREG)
      return fail(WorkspaceArchiveStatus::Invalid,
                  "workspace archive contains a special file");

    fs::create_directories(destination_path.parent_path(), error);
    if (error)
      return fail(io_status(error.value()), "failed to create archive parent");
    const int descriptor =
        ::open(destination_path.c_str(),
               O_WRONLY | O_CREAT | O_EXCL | O_CLOEXEC | O_NOFOLLOW,
               S_IRUSR | S_IWUSR);
    if (descriptor < 0)
      return fail(io_status(errno), "failed to create extracted file");

    std::size_t file_offset = 0;
    bool write_failed = false;
    int write_error = 0;
    for (;;) {
      const void* block = nullptr;
      std::size_t size = 0;
      la_int64_t offset = 0;
      const int read =
          archive_read_data_block(reader.get(), &block, &size, &offset);
      if (read == ARCHIVE_EOF) break;
      if (read != ARCHIVE_OK || offset < 0 ||
          static_cast<std::uint64_t>(offset) != file_offset ||
          size > limits.max_extracted_bytes -
                     std::min(result.extracted_bytes,
                              limits.max_extracted_bytes)) {
        write_failed = true;
        write_error = read == ARCHIVE_OK ? EFBIG
                                         : (archive_errno(reader.get()) == 0
                                                ? EINVAL
                                                : archive_errno(reader.get()));
        break;
      }
      if (!write_all(descriptor, block, size)) {
        write_failed = true;
        write_error = errno;
        break;
      }
      file_offset += size;
      result.extracted_bytes += size;
    }
    if (::close(descriptor) != 0 && !write_failed) {
      write_failed = true;
      write_error = errno;
    }
    if (write_failed) {
      return fail(
          write_error == EFBIG    ? WorkspaceArchiveStatus::ResourceExhausted
          : write_error == EINVAL ? WorkspaceArchiveStatus::Invalid
                                  : io_status(write_error),
          write_error == EFBIG ? "workspace extracted byte limit reached"
                               : "failed to extract archive file");
    }
  }
  if (!saw_entry || archive_filter_code(reader.get(), 0) != ARCHIVE_FILTER_ZSTD)
    return fail(WorkspaceArchiveStatus::Invalid,
                "workspace must be a non-empty tar.zst archive");
  return result;
}

}  // namespace linuxcnc::server
