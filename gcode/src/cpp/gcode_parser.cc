/**
 * G-Code Parser - Implementation
 *
 * Core parser that uses LinuxCNC's rs274ngc interpreter to parse G-code files.
 */

#include "gcode_parser.hh"
#include "canon_preview.hh"

// Public LinuxCNC headers only - no internal source dependencies
#include "interp_base.hh"
#include "interp_return.hh"
#include "inifile.hh"
#include "tooldata.hh"

#include <sys/stat.h>
#include <stdexcept>
#include <cstring>
#include <mutex>

namespace GCodeParser
{

  // Check if result is OK or execute finish
#define RESULT_OK(r) ((r) == INTERP_OK || (r) == INTERP_EXECUTE_FINISH)

  std::mutex parser_mutex;
  static InterpBase *global_interp = nullptr;
  static std::string last_ini_path;

  ParseResult parseFile(
      const std::string &filepath,
      const std::string &iniPath,
      std::function<void(const ParseProgress &)> progressCallback)
  {
    // Serialize access to the interpreter
    std::lock_guard<std::mutex> lock(parser_mutex);

    // Validate file exists
    struct stat fileStat;
    if (stat(filepath.c_str(), &fileStat) != 0)
    {
      throw std::runtime_error("G-code file not found: " + filepath);
    }

    // Create parse context
    ParseContext ctx;
    ctx.progressCallback = progressCallback;
    ctx.totalBytes = static_cast<size_t>(fileStat.st_size);
    ctx.extents.reset();

    // Set as current context
    setParseContext(&ctx);

    // Create interpreter if not exists
    if (!global_interp)
    {
      global_interp = makeInterp();
      if (!global_interp)
      {
        clearParseContext();
        throw std::runtime_error("Failed to create interpreter");
      }
    }

    try
    {
      // Initialize interpreter if INI changed or first run
      if (last_ini_path != iniPath)
      {
        if (global_interp->ini_load(iniPath.c_str()) != 0)
        {
          throw std::runtime_error("Failed to load INI file: " + iniPath);
        }
        if (global_interp->init() != 0)
        {
          throw std::runtime_error("Failed to initialize interpreter");
        }
        last_ini_path = iniPath;
      }
      else
      {
        // For same INI, we still need to ensure clean state
        if (global_interp->init() != 0)
        {
          throw std::runtime_error("Failed to initialize interpreter");
        }
      }

      // Initialize tool data
      if (tool_mmap_user() != 0)
      {
        // Not fatal - tool data just won't be available
      }

      // Open the G-code file
      if (global_interp->open(filepath.c_str()) != 0)
      {
        throw std::runtime_error("Failed to open G-code file: " + filepath);
      }

      // Execute the file
      int result = INTERP_OK;
      size_t lineCount = 0;
      const size_t progressInterval = 50; // Report progress every N lines

      while (RESULT_OK(result))
      {
        result = global_interp->read();
        if (!RESULT_OK(result))
        {
          break;
        }

        result = global_interp->execute();
        lineCount++;

        // Report progress periodically
        if (progressCallback && (lineCount % progressInterval == 0))
        {
          // Estimate bytes based on line count (rough approximation)
          size_t estimatedBytes = (ctx.totalBytes * lineCount) /
                                  std::max(lineCount + 100, size_t(1));
          estimatedBytes = std::min(estimatedBytes, ctx.totalBytes);
          ctx.reportProgress(estimatedBytes);
        }
      }

      // Check for errors (but not end of file)
      if (result != INTERP_ENDFILE && result != INTERP_EXIT && !RESULT_OK(result))
      {
        char errBuf[256];
        global_interp->error_text(result, errBuf, sizeof(errBuf));
        throw std::runtime_error(std::string("G-code parse error: ") + errBuf);
      }

      // Close interpreter (file)
      global_interp->close();

      // Final progress report
      if (progressCallback)
      {
        ctx.reportProgress(ctx.totalBytes);
      }
    }
    catch (...)
    {
      // Cleanup on error
      if (global_interp) {
          global_interp->close();
      }
      clearParseContext();
      throw;
    }

    // Cleanup context only, keep interpreter alive
    clearParseContext();

    // If extents are not valid (no motion commands), set to zero
    if (!ctx.extents.isValid())
    {
      ctx.extents.min = {0, 0, 0};
      ctx.extents.max = {0, 0, 0};
    }

    // Build result
    ParseResult parseResult;
    parseResult.operations = std::move(ctx.operations);
    parseResult.extents = ctx.extents;

    return parseResult;
  }

} // namespace GCodeParser
