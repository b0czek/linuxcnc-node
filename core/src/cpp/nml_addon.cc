#include <napi.h>
#include "common.hh"
#include "stat_channel.hh"
#include "command_channel.hh"
#include "error_channel.hh"
#include "position_logger.hh"
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

Napi::Object InitAll(Napi::Env env, Napi::Object exports)
{
    exports.Set(Napi::String::New(env, "setNmlFilePath"), Napi::Function::New(env, LinuxCNC::SetNmlFilePath));
    exports.Set(Napi::String::New(env, "getNmlFilePath"), Napi::Function::New(env, LinuxCNC::GetNmlFilePath));

    LinuxCNC::NapiStatChannel::Init(env, exports);
    LinuxCNC::NapiCommandChannel::Init(env, exports);
    LinuxCNC::NapiErrorChannel::Init(env, exports);
    LinuxCNC::NapiPositionLogger::Init(env, exports);

    // Export constants
    exports.Set(Napi::String::New(env, "NMLFILE_DEFAULT"), Napi::String::New(env, DEFAULT_EMC_NMLFILE));

    // EMCMOT_MAX_JOINTS, etc.
    LCNC_NODE_EXPORT_INT_CONSTANT(env, exports, EMCMOT_MAX_JOINTS);
    LCNC_NODE_EXPORT_INT_CONSTANT(env, exports, EMCMOT_MAX_AXIS);
    LCNC_NODE_EXPORT_INT_CONSTANT(env, exports, EMCMOT_MAX_SPINDLES);
    LCNC_NODE_EXPORT_INT_CONSTANT(env, exports, EMCMOT_MAX_DIO);
    LCNC_NODE_EXPORT_INT_CONSTANT(env, exports, EMCMOT_MAX_AIO);
    LCNC_NODE_EXPORT_INT_CONSTANT(env, exports, EMCMOT_MAX_MISC_ERROR);



    return exports;
}

NODE_API_MODULE(nml_addon, InitAll)