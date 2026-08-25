// Adapter from LinuxCNC recording-canon events to native preview operations.

#ifndef LINUXCNC_GRPC_GCODE_CANON_PREVIEW_HPP
#define LINUXCNC_GRPC_GCODE_CANON_PREVIEW_HPP

#include <functional>

#include "linuxcnc_grpc/gcode/operation_types.hpp"

namespace linuxcnc::recording {
class Session;
}

namespace linuxcnc::server::gcode {

/** Context for translating one recording-canon event stream. */
struct ParseContext {
  // Output
  std::vector<Operation> operations;
  Extents extents;

  // Current state
  Position currentPosition;
  Plane currentPlane = Plane::XY;
  Units currentUnits = Units::MM;
  double currentFeedRate = 0.0;
  int selectedTool = 0;
  // Canon callbacks use the active program units; operations are normalized
  // to millimetres at this boundary.
  double linearUnitScale = 25.4;

  // For tracking state changes
  double lastFeedRate = -1.0;

  // Progress callback
  std::function<void(const ParseProgress&)> progressCallback;
  std::function<bool(OperationBatch&&)> batchCallback;
  std::function<bool()> cancellationCallback;
  std::size_t batchSize = 128;
  std::size_t operationCount = 0;
  bool cancelled = false;
  size_t totalBytes = 0;
  size_t linesProcessed = 0;

  // Helper methods
  void addOperation(Operation&& op);
  bool flushReadyBatch();
  bool flushBatch();
  bool cancellationRequested();
  void updateExtents(const Position& pos);
  void reportProgress(size_t bytesRead);
};

void consumeRecordingEvents(::linuxcnc::recording::Session& session,
                            ParseContext& context);

}  // namespace linuxcnc::server::gcode

#endif  // LINUXCNC_GRPC_GCODE_CANON_PREVIEW_HPP
