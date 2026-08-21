/**
 * Canon Preview - Header
 *
 * Implements LinuxCNC canonical machining functions for G-code preview/parsing.
 * These functions are called by the rs274ngc interpreter during execution.
 */

#ifndef LINUXCNC_GRPC_GCODE_CANON_PREVIEW_HPP
#define LINUXCNC_GRPC_GCODE_CANON_PREVIEW_HPP

#include "linuxcnc_grpc/gcode_operation_types.hpp"
#include <functional>

namespace linuxcnc::server::gcode
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
    std::function<bool(OperationBatch &&)> batchCallback;
    std::function<bool()> cancellationCallback;
    std::size_t batchSize = 128;
    std::size_t operationCount = 0;
    bool cancelled = false;
    size_t totalBytes = 0;
    size_t linesProcessed = 0;

    // Helper methods
    void addOperation(Operation &&op);
    bool flushReadyBatch();
    bool flushBatch();
    bool cancellationRequested();
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

} // namespace linuxcnc::server::gcode

#endif // LINUXCNC_GRPC_GCODE_CANON_PREVIEW_HPP
