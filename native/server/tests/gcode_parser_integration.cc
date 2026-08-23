#include "linuxcnc_grpc/gcode_parser.hpp"

#include <cassert>
#include <cstddef>
#include <iostream>
#include <string>

using linuxcnc::server::gcode::OperationBatch;
using linuxcnc::server::gcode::ParseOptions;
using linuxcnc::server::gcode::SerializedRs274Parser;

int main(int argc, char** argv) {
  if (argc != 3) {
    std::cerr << "usage: gcode_parser_integration <ini-path> <gcode-path>\n";
    return 2;
  }

  std::size_t delivered = 0;
  std::size_t operations = 0;
  SerializedRs274Parser parser;
  ParseOptions options;
  options.ini_path = argv[1];
  options.batch_size = 2;
  options.on_batch = [&](OperationBatch&& batch) {
    assert(!batch.empty());
    assert(batch.size() <= options.batch_size);
    operations += batch.size();
    ++delivered;
    return true;
  };

  const auto parsed = parser.parse_file(argv[2], options);
  assert(!parsed.cancelled);
  assert(parsed.operationCount == operations);
  assert(parsed.operationCount > 0);
  assert(delivered > 0);
  assert(parsed.extents.isValid());

  // A callback can cancel after a bounded batch. Cancellation is observed
  // before the next rs274 read/execute step and never removes that batch.
  std::size_t cancelled_batches = 0;
  ParseOptions cancelled_options;
  cancelled_options.ini_path = argv[1];
  cancelled_options.batch_size = 1;
  cancelled_options.on_batch = [&](OperationBatch&& batch) {
    assert(batch.size() == 1);
    ++cancelled_batches;
    return true;
  };
  cancelled_options.is_cancelled = [&] { return cancelled_batches >= 1; };
  const auto cancelled = parser.parse_file(argv[2], cancelled_options);
  assert(cancelled.cancelled);
  // A single interpreter execute step may emit more than one canonical
  // operation; cancellation is intentionally checked at the step boundary.
  assert(cancelled_batches >= 1);
  assert(cancelled.operationCount >= 1);
  return 0;
}
