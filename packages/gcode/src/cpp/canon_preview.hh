/**
 * Canon Preview - Header
 *
 * Implements LinuxCNC canonical machining functions for G-code preview/parsing.
 * These functions are called by the rs274ngc interpreter during execution.
 */

#ifndef GCODE_CANON_PREVIEW_HH
#define GCODE_CANON_PREVIEW_HH

#include "operation_types.hh"
#include <functional>

namespace GCodeParser
{

  /**
   * Context for tracking parser state during G-code interpretation.
   * This is set as a thread-local before parsing begins.
   */
  struct ParseContext
  {
    // Output
    std::vector<Operation> operations;
    Extents extents;

    // Current state
    Position currentPosition;
    Plane currentPlane = Plane::XY;
    Units currentUnits = Units::MM;
    double currentFeedRate = 0.0;
    int selectedTool = 0;
    bool metric = false;

    // For tracking state changes
    double lastFeedRate = -1.0;

    // Progress callback
    std::function<void(const ParseProgress &)> progressCallback;
    size_t totalBytes = 0;
    size_t linesProcessed = 0;

    // Helper methods
    void addOperation(Operation &&op);
    void updateExtents(const Position &pos);
    void reportProgress(size_t bytesRead);
  };

  /**
   * Set the current parse context.
   * Must be called before interpreter execution.
   */
  void setParseContext(ParseContext *ctx);

  /**
   * Get the current parse context.
   */
  ParseContext *getParseContext();

  /**
   * Clear the current parse context.
   */
  void clearParseContext();

} // namespace GCodeParser

#endif // GCODE_CANON_PREVIEW_HH
