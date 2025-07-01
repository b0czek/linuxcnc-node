#include <napi.h>
#include "common.hh"
#include "stat_channel.hh"
#include "command_channel.hh"
#include "error_channel.hh"
#include "emc.hh"
#include "emc_nml.hh"
#include "kinematics.h"
#include "inihal.hh"
#include "motion.h"
#include "debugflags.h"
#include "nml_oi.hh"

// Workarond for old_inihal_data - it's defined in taskintf.cc in original source which is
// included in milltask binary but is included in liblinuxcnc.a so I have to define it here.
value_inihal_data old_inihal_data;

// Define constants similar to Python's ENUM and ENUMX
#define LCNC_NODE_EXPORT_INT_CONSTANT(env, exports, name) \
    exports.Set(Napi::String::New(env, #name), Napi::Number::New(env, name))

#define LCNC_NODE_EXPORT_ENUM_MEMBER(env, exports, enum_val, name_override) \
    exports.Set(Napi::String::New(env, name_override), Napi::Number::New(env, static_cast<int>(enum_val)))

#define LCNC_NODE_EXPORT_LOCAL_INT_CONSTANT(env, exports, name, val) \
    exports.Set(Napi::String::New(env, name), Napi::Number::New(env, val))

Napi::Object InitAll(Napi::Env env, Napi::Object exports)
{
    exports.Set(Napi::String::New(env, "setNmlFilePath"), Napi::Function::New(env, LinuxCNC::SetNmlFilePath));
    exports.Set(Napi::String::New(env, "getNmlFilePath"), Napi::Function::New(env, LinuxCNC::GetNmlFilePath));

    LinuxCNC::NapiStatChannel::Init(env, exports);
    LinuxCNC::NapiCommandChannel::Init(env, exports);
    LinuxCNC::NapiErrorChannel::Init(env, exports);

    // Export constants
    exports.Set(Napi::String::New(env, "NMLFILE_DEFAULT"), Napi::String::New(env, DEFAULT_EMC_NMLFILE));

    // NML Error Types
    LCNC_NODE_EXPORT_INT_CONSTANT(env, exports, EMC_OPERATOR_ERROR_TYPE);
    LCNC_NODE_EXPORT_INT_CONSTANT(env, exports, EMC_OPERATOR_TEXT_TYPE);
    LCNC_NODE_EXPORT_INT_CONSTANT(env, exports, EMC_OPERATOR_DISPLAY_TYPE);
    LCNC_NODE_EXPORT_INT_CONSTANT(env, exports, NML_ERROR_TYPE);
    LCNC_NODE_EXPORT_INT_CONSTANT(env, exports, NML_TEXT_TYPE);
    LCNC_NODE_EXPORT_INT_CONSTANT(env, exports, NML_DISPLAY_TYPE);

    // EMC_TASK_MODE
    LCNC_NODE_EXPORT_ENUM_MEMBER(env, exports, EMC_TASK_MODE::MDI, "TASK_MODE_MDI");
    LCNC_NODE_EXPORT_ENUM_MEMBER(env, exports, EMC_TASK_MODE::MANUAL, "TASK_MODE_MANUAL");
    LCNC_NODE_EXPORT_ENUM_MEMBER(env, exports, EMC_TASK_MODE::AUTO, "TASK_MODE_AUTO");

    // EMC_TASK_STATE
    LCNC_NODE_EXPORT_ENUM_MEMBER(env, exports, EMC_TASK_STATE::ESTOP, "TASK_STATE_ESTOP");
    LCNC_NODE_EXPORT_ENUM_MEMBER(env, exports, EMC_TASK_STATE::ESTOP_RESET, "TASK_STATE_ESTOP_RESET");
    LCNC_NODE_EXPORT_ENUM_MEMBER(env, exports, EMC_TASK_STATE::OFF, "TASK_STATE_OFF");
    LCNC_NODE_EXPORT_ENUM_MEMBER(env, exports, EMC_TASK_STATE::ON, "TASK_STATE_ON");

    // EMC_TASK_EXEC
    LCNC_NODE_EXPORT_ENUM_MEMBER(env, exports, EMC_TASK_EXEC::ERROR, "EXEC_STATE_ERROR");
    LCNC_NODE_EXPORT_ENUM_MEMBER(env, exports, EMC_TASK_EXEC::DONE, "EXEC_STATE_DONE");
    LCNC_NODE_EXPORT_ENUM_MEMBER(env, exports, EMC_TASK_EXEC::WAITING_FOR_MOTION, "EXEC_STATE_WAITING_FOR_MOTION");
    LCNC_NODE_EXPORT_ENUM_MEMBER(env, exports, EMC_TASK_EXEC::WAITING_FOR_MOTION_QUEUE, "EXEC_STATE_WAITING_FOR_MOTION_QUEUE");
    LCNC_NODE_EXPORT_ENUM_MEMBER(env, exports, EMC_TASK_EXEC::WAITING_FOR_IO, "EXEC_STATE_WAITING_FOR_IO");
    LCNC_NODE_EXPORT_ENUM_MEMBER(env, exports, EMC_TASK_EXEC::WAITING_FOR_MOTION_AND_IO, "EXEC_STATE_WAITING_FOR_MOTION_AND_IO");
    LCNC_NODE_EXPORT_ENUM_MEMBER(env, exports, EMC_TASK_EXEC::WAITING_FOR_DELAY, "EXEC_STATE_WAITING_FOR_DELAY");
    LCNC_NODE_EXPORT_ENUM_MEMBER(env, exports, EMC_TASK_EXEC::WAITING_FOR_SYSTEM_CMD, "EXEC_STATE_WAITING_FOR_SYSTEM_CMD");
    LCNC_NODE_EXPORT_ENUM_MEMBER(env, exports, EMC_TASK_EXEC::WAITING_FOR_SPINDLE_ORIENTED, "EXEC_STATE_WAITING_FOR_SPINDLE_ORIENTED");

    // EMC_TASK_INTERP
    LCNC_NODE_EXPORT_ENUM_MEMBER(env, exports, EMC_TASK_INTERP::IDLE, "INTERP_STATE_IDLE");
    LCNC_NODE_EXPORT_ENUM_MEMBER(env, exports, EMC_TASK_INTERP::READING, "INTERP_STATE_READING");
    LCNC_NODE_EXPORT_ENUM_MEMBER(env, exports, EMC_TASK_INTERP::PAUSED, "INTERP_STATE_PAUSED");
    LCNC_NODE_EXPORT_ENUM_MEMBER(env, exports, EMC_TASK_INTERP::WAITING, "INTERP_STATE_WAITING");

    // EMC_TRAJ_MODE
    LCNC_NODE_EXPORT_ENUM_MEMBER(env, exports, EMC_TRAJ_MODE::FREE, "TRAJ_MODE_FREE");
    LCNC_NODE_EXPORT_ENUM_MEMBER(env, exports, EMC_TRAJ_MODE::COORD, "TRAJ_MODE_COORD");
    LCNC_NODE_EXPORT_ENUM_MEMBER(env, exports, EMC_TRAJ_MODE::TELEOP, "TRAJ_MODE_TELEOP");

    // MOTION_TYPE
    LCNC_NODE_EXPORT_INT_CONSTANT(env, exports, EMC_MOTION_TYPE_TRAVERSE); // Original name
    LCNC_NODE_EXPORT_INT_CONSTANT(env, exports, EMC_MOTION_TYPE_FEED);
    LCNC_NODE_EXPORT_INT_CONSTANT(env, exports, EMC_MOTION_TYPE_ARC);
    LCNC_NODE_EXPORT_INT_CONSTANT(env, exports, EMC_MOTION_TYPE_TOOLCHANGE);
    LCNC_NODE_EXPORT_INT_CONSTANT(env, exports, EMC_MOTION_TYPE_PROBING);
    LCNC_NODE_EXPORT_INT_CONSTANT(env, exports, EMC_MOTION_TYPE_INDEXROTARY);
    // Also, it's common to have a 0 value for "no motion type" or "idle"
    exports.Set(Napi::String::New(env, "MOTION_TYPE_NONE"), Napi::Number::New(env, 0));

    // KINEMATICS_TYPE
    LCNC_NODE_EXPORT_INT_CONSTANT(env, exports, KINEMATICS_IDENTITY);
    LCNC_NODE_EXPORT_INT_CONSTANT(env, exports, KINEMATICS_FORWARD_ONLY);
    LCNC_NODE_EXPORT_INT_CONSTANT(env, exports, KINEMATICS_INVERSE_ONLY);
    LCNC_NODE_EXPORT_INT_CONSTANT(env, exports, KINEMATICS_BOTH);

    // RCS_STATUS
    LCNC_NODE_EXPORT_ENUM_MEMBER(env, exports, RCS_STATUS::UNINITIALIZED, "RCS_STATUS_UNINITIALIZED");
    LCNC_NODE_EXPORT_ENUM_MEMBER(env, exports, RCS_STATUS::DONE, "RCS_STATUS_DONE");
    LCNC_NODE_EXPORT_ENUM_MEMBER(env, exports, RCS_STATUS::EXEC, "RCS_STATUS_EXEC");
    LCNC_NODE_EXPORT_ENUM_MEMBER(env, exports, RCS_STATUS::ERROR, "RCS_STATUS_ERROR");

    // EMCMOT_MAX_JOINTS, etc.
    LCNC_NODE_EXPORT_INT_CONSTANT(env, exports, EMCMOT_MAX_JOINTS);
    LCNC_NODE_EXPORT_INT_CONSTANT(env, exports, EMCMOT_MAX_AXIS);
    LCNC_NODE_EXPORT_INT_CONSTANT(env, exports, EMCMOT_MAX_SPINDLES);
    LCNC_NODE_EXPORT_INT_CONSTANT(env, exports, EMCMOT_MAX_DIO);
    LCNC_NODE_EXPORT_INT_CONSTANT(env, exports, EMCMOT_MAX_AIO);
    LCNC_NODE_EXPORT_INT_CONSTANT(env, exports, EMCMOT_MAX_MISC_ERROR);

    exports.Set(Napi::String::New(env, "JOINT_TYPE_LINEAR"), Napi::Number::New(env, EMC_LINEAR));
    exports.Set(Napi::String::New(env, "JOINT_TYPE_ANGULAR"), Napi::Number::New(env, EMC_ANGULAR));

    // EMCMOT_ORIENT
    LCNC_NODE_EXPORT_INT_CONSTANT(env, exports, EMCMOT_ORIENT_NONE);
    LCNC_NODE_EXPORT_INT_CONSTANT(env, exports, EMCMOT_ORIENT_COMPLETE);
    LCNC_NODE_EXPORT_INT_CONSTANT(env, exports, EMCMOT_ORIENT_IN_PROGRESS);
    LCNC_NODE_EXPORT_INT_CONSTANT(env, exports, EMCMOT_ORIENT_FAULTED);

    // EMC_DEBUG
    LCNC_NODE_EXPORT_INT_CONSTANT(env, exports, EMC_DEBUG_CONFIG);
    LCNC_NODE_EXPORT_INT_CONSTANT(env, exports, EMC_DEBUG_VERSIONS);
    LCNC_NODE_EXPORT_INT_CONSTANT(env, exports, EMC_DEBUG_TASK_ISSUE);
    LCNC_NODE_EXPORT_INT_CONSTANT(env, exports, EMC_DEBUG_NML);
    LCNC_NODE_EXPORT_INT_CONSTANT(env, exports, EMC_DEBUG_MOTION_TIME);
    LCNC_NODE_EXPORT_INT_CONSTANT(env, exports, EMC_DEBUG_INTERP);
    LCNC_NODE_EXPORT_INT_CONSTANT(env, exports, EMC_DEBUG_RCS);
    LCNC_NODE_EXPORT_INT_CONSTANT(env, exports, EMC_DEBUG_INTERP_LIST);
    LCNC_NODE_EXPORT_INT_CONSTANT(env, exports, EMC_DEBUG_IOCONTROL);
    LCNC_NODE_EXPORT_INT_CONSTANT(env, exports, EMC_DEBUG_OWORD);
    LCNC_NODE_EXPORT_INT_CONSTANT(env, exports, EMC_DEBUG_REMAP);
    LCNC_NODE_EXPORT_INT_CONSTANT(env, exports, EMC_DEBUG_PYTHON);
    LCNC_NODE_EXPORT_INT_CONSTANT(env, exports, EMC_DEBUG_NAMEDPARAM);
    LCNC_NODE_EXPORT_INT_CONSTANT(env, exports, EMC_DEBUG_GDBONSIGNAL);
    LCNC_NODE_EXPORT_INT_CONSTANT(env, exports, EMC_DEBUG_STATE_TAGS);

    return exports;
}

NODE_API_MODULE(nml_addon, InitAll)