// EMC_STAT contains modal_state values whose constructors live in LinuxCNC's
// modal_state.cc.  Keep that small value-type implementation local to the
// standalone addon; it has no task-process dependency.
#include "modal_state.cc"
