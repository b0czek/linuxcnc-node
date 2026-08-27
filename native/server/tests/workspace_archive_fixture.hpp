#pragma once

#include <archive.h>
#include <archive_entry.h>

#include <cassert>
#include <cstddef>
#include <string>
#include <vector>

inline std::string workspace_archive_fixture(const std::string& path,
                                             const std::string& contents) {
  std::vector<char> output(contents.size() + 64U * 1024U);
  std::size_t used = 0;
  auto* writer = archive_write_new();
  assert(writer);
  assert(archive_write_set_format_pax_restricted(writer) == ARCHIVE_OK);
  assert(archive_write_add_filter_zstd(writer) == ARCHIVE_OK);
  assert(archive_write_open_memory(writer, output.data(), output.size(),
                                   &used) == ARCHIVE_OK);
  auto* entry = archive_entry_new();
  assert(entry);
  archive_entry_set_pathname(entry, path.c_str());
  archive_entry_set_filetype(entry, AE_IFREG);
  archive_entry_set_perm(entry, 0600);
  archive_entry_set_size(entry, static_cast<la_int64_t>(contents.size()));
  assert(archive_write_header(writer, entry) == ARCHIVE_OK);
  assert(archive_write_data(writer, contents.data(), contents.size()) ==
         static_cast<la_ssize_t>(contents.size()));
  archive_entry_free(entry);
  assert(archive_write_close(writer) == ARCHIVE_OK);
  assert(archive_write_free(writer) == ARCHIVE_OK);
  return {output.data(), used};
}
