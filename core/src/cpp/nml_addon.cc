#include <napi.h>
#include "common.hh"
#include "stat_channel.hh"
#include "command_channel.hh"
#include "error_channel.hh"
#include "emc.hh"
#include "emc_nml.hh"
#include "kinematics.h"
#include "inihal.hh"

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
    // LCNC_NODE_EXPORT_INT_CONSTANT(env, exports, NML_ERROR_TYPE);
    // LCNC_NODE_EXPORT_INT_CONSTANT(env, exports, NML_TEXT_TYPE);
    // LCNC_NODE_EXPORT_INT_CONSTANT(env, exports, NML_DISPLAY_TYPE);

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
    // Note: Python binding used ENUMX(4, EMC_MOTION_TYPE_TRAVERSE) -> MOTION_TYPE_TRAVERSE
    // For Node.js, we'll name them directly or prefix with EMC_ for clarity if needed.
    // For consistency with other enums, let's use the name_override pattern.
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

    // Local constants (ported from Python binding #defines)
    LCNC_NODE_EXPORT_LOCAL_INT_CONSTANT(env, exports, "SPINDLE_FORWARD", LOCAL_SPINDLE_FORWARD);
    LCNC_NODE_EXPORT_LOCAL_INT_CONSTANT(env, exports, "SPINDLE_REVERSE", LOCAL_SPINDLE_REVERSE);
    LCNC_NODE_EXPORT_LOCAL_INT_CONSTANT(env, exports, "SPINDLE_OFF", LOCAL_SPINDLE_OFF);
    LCNC_NODE_EXPORT_LOCAL_INT_CONSTANT(env, exports, "SPINDLE_INCREASE", LOCAL_SPINDLE_INCREASE);
    LCNC_NODE_EXPORT_LOCAL_INT_CONSTANT(env, exports, "SPINDLE_DECREASE", LOCAL_SPINDLE_DECREASE);
    LCNC_NODE_EXPORT_LOCAL_INT_CONSTANT(env, exports, "SPINDLE_CONSTANT", LOCAL_SPINDLE_CONSTANT);

    LCNC_NODE_EXPORT_LOCAL_INT_CONSTANT(env, exports, "MIST_ON", LOCAL_MIST_ON);
    LCNC_NODE_EXPORT_LOCAL_INT_CONSTANT(env, exports, "MIST_OFF", LOCAL_MIST_OFF);

    LCNC_NODE_EXPORT_LOCAL_INT_CONSTANT(env, exports, "FLOOD_ON", LOCAL_FLOOD_ON);
    LCNC_NODE_EXPORT_LOCAL_INT_CONSTANT(env, exports, "FLOOD_OFF", LOCAL_FLOOD_OFF);

    LCNC_NODE_EXPORT_LOCAL_INT_CONSTANT(env, exports, "BRAKE_ENGAGE", LOCAL_BRAKE_ENGAGE);
    LCNC_NODE_EXPORT_LOCAL_INT_CONSTANT(env, exports, "BRAKE_RELEASE", LOCAL_BRAKE_RELEASE);

    LCNC_NODE_EXPORT_LOCAL_INT_CONSTANT(env, exports, "JOG_STOP", LOCAL_JOG_STOP);
    LCNC_NODE_EXPORT_LOCAL_INT_CONSTANT(env, exports, "JOG_CONTINUOUS", LOCAL_JOG_CONTINUOUS);
    LCNC_NODE_EXPORT_LOCAL_INT_CONSTANT(env, exports, "JOG_INCREMENT", LOCAL_JOG_INCREMENT);

    LCNC_NODE_EXPORT_LOCAL_INT_CONSTANT(env, exports, "AUTO_RUN", LOCAL_AUTO_RUN);
    LCNC_NODE_EXPORT_LOCAL_INT_CONSTANT(env, exports, "AUTO_PAUSE", LOCAL_AUTO_PAUSE);
    LCNC_NODE_EXPORT_LOCAL_INT_CONSTANT(env, exports, "AUTO_RESUME", LOCAL_AUTO_RESUME);
    LCNC_NODE_EXPORT_LOCAL_INT_CONSTANT(env, exports, "AUTO_STEP", LOCAL_AUTO_STEP);
    LCNC_NODE_EXPORT_LOCAL_INT_CONSTANT(env, exports, "AUTO_REVERSE", LOCAL_AUTO_REVERSE);
    LCNC_NODE_EXPORT_LOCAL_INT_CONSTANT(env, exports, "AUTO_FORWARD", LOCAL_AUTO_FORWARD);

    // EMCMOT_MAX_JOINTS, etc.
    LCNC_NODE_EXPORT_INT_CONSTANT(env, exports, EMCMOT_MAX_JOINTS);
    LCNC_NODE_EXPORT_INT_CONSTANT(env, exports, EMCMOT_MAX_AXIS);
    LCNC_NODE_EXPORT_INT_CONSTANT(env, exports, EMCMOT_MAX_SPINDLES);
    LCNC_NODE_EXPORT_INT_CONSTANT(env, exports, EMCMOT_MAX_DIO);
    LCNC_NODE_EXPORT_INT_CONSTANT(env, exports, EMCMOT_MAX_AIO);
    LCNC_NODE_EXPORT_INT_CONSTANT(env, exports, EMCMOT_MAX_MISC_ERROR);

    exports.Set(Napi::String::New(env, "JOINT_TYPE_LINEAR"), Napi::Number::New(env, EMC_LINEAR));
    exports.Set(Napi::String::New(env, "JOINT_TYPE_ANGULAR"), Napi::Number::New(env, EMC_ANGULAR));

    return exports;
}

NODE_API_MODULE(nml_addon, InitAll)