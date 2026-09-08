#include <cassert>
#include <cstdint>

#include "machine/grpc/status_codec.hpp"

using namespace linuxcnc::server;
using namespace linuxcnc::server::detail;

namespace {

NmlStatusSnapshot status_sample() {
  NmlStatusSnapshot sample;
  sample.echo_serial_number = 17;
  sample.rcs_status = linuxcnc::v1::RCS_STATUS_EXEC;
  sample.debug = 3;
  sample.task_stat.mode = linuxcnc::v1::TASK_MODE_AUTO;
  sample.task_stat.file = "program.ngc";
  sample.task_stat.optional_stop_state = false;
  sample.motion_stat.traj.joints = 1;
  sample.motion_stat.traj.actual_position.values[0] = 12.5;
  sample.motion_stat.joints.resize(1);
  sample.motion_stat.joints[0].homed = true;
  sample.motion_stat.digital_input = {0, 1};
  sample.io_stat.tool_in_spindle = 7;
  sample.tool_table.resize(1);
  sample.tool_table[0].tool_no = 7;
  sample.tool_table[0].diameter = 4.0;
  return sample;
}

void snapshot_encoding_is_stable() {
  auto source = status_sample();
  const auto encoded = encode_status(source);
  assert(encoded.message.echo_serial_number() == 17);
  assert(encoded.message.state() == linuxcnc::v1::RCS_STATUS_EXEC);
  assert(encoded.message.task().file() == "program.ngc");
  assert(encoded.message.motion().traj().actual_position().values(0) == 12.5);
  assert(encoded.message.motion().joint(0).homed());
  assert(encoded.message.io().tool().tool_in_spindle() == 7);
  assert(encoded.message.tool_table(0).diameter() == 4.0);

  source.task_stat.file = "changed.ngc";
  assert(encoded.message.task().file() == "program.ngc");
  assert(encoded.serialized == encoded.message.SerializeAsString());
  assert(!make_status_delta(encoded, encoded, 2));
}

void delta_preserves_wire_changes() {
  const auto previous = encode_status(status_sample());
  auto changed = status_sample();
  changed.echo_serial_number = 18;
  changed.task_stat.optional_stop_state = true;
  changed.motion_stat.traj.actual_position.values[0] = 15.0;
  changed.motion_stat.joints[0].homed = false;
  changed.motion_stat.digital_input = {1, 0};
  changed.io_stat.tool_in_spindle = 8;
  changed.tool_table[0].diameter = 5.0;
  const auto current = encode_status(changed);

  const auto delta = make_status_delta(previous, current, 23);
  assert(delta);
  assert(delta->sequence() == 23);
  assert(delta->echo_serial_number() == 18);
  assert(delta->task().optional_stop_state());
  assert(delta->motion().traj().actual_position().values(0) == 15.0);
  assert(delta->motion().joint_size() == 1);
  assert(!delta->motion().joint(0).value().homed());
  assert(delta->motion().replace_digital_input());
  assert(delta->motion().digital_input(0) == 1);
  assert(delta->io().tool().tool_in_spindle() == 8);
  assert(delta->tool_table().replace_all());
  assert(delta->tool_table().replaced(0).diameter() == 5.0);
}

}  // namespace

int main() {
  snapshot_encoding_is_stable();
  delta_preserves_wire_changes();
  return 0;
}
