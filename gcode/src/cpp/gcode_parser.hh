/**
 * G-Code Parser - Header
 *
 * Core parser that uses LinuxCNC's rs274ngc interpreter to parse G-code files.
 */

#ifndef GCODE_PARSER_HH
#define GCODE_PARSER_HH

#include "operation_types.hh"
#include <string>
#include <functional>

namespace GCodeParser
{

  /**
   * Parse a G-code file and return the list of operations.
   *
   * @param filepath Path to the G-code file
   * @param iniPath Path to the LinuxCNC INI file
   * @param progressCallback Optional callback for progress updates
   * @return ParseResult containing operations and extents
   * @throws std::runtime_error on parse failure
   */
  ParseResult parseFile(
      const std::string &filepath,
      const std::string &iniPath,
      std::function<void(const ParseProgress &)> progressCallback = nullptr);

} // namespace GCodeParser

#endif // GCODE_PARSER_HH
