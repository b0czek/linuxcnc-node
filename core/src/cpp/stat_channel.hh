#pragma once

#include <napi.h>
#include "common.hh"
#include "rcs.hh"
#include "emc.hh"
#include "emc_nml.hh"
#include "tooldata.hh"
#include "canon.hh"

namespace LinuxCNC
{

    class NapiStatChannel : public Napi::ObjectWrap<NapiStatChannel>
    {
    public:
        static Napi::Object Init(Napi::Env env, Napi::Object exports);
        NapiStatChannel(const Napi::CallbackInfo &info);
        ~NapiStatChannel();

    private:
        static Napi::FunctionReference constructor;

        RCS_STAT_CHANNEL *s_channel_ = nullptr;
        EMC_STAT status_{};                  // Current status, directly from NML
        bool tool_mmap_initialized_ = false; // For tool_mmap_user etc.

        // Internal helper to connect to NML
        bool connect();
        void disconnect();
        bool pollInternal(); // Internal poll without Napi dependencies

        // Conversion helpers
        Napi::Object convertFullStatToNapiObject(Napi::Env env, const EMC_STAT &stat_to_convert);

        Napi::Object convertTaskStatToNapi(Napi::Env env, const EMC_TASK_STAT &task_stat);
        Napi::Object convertMotionStatToNapi(Napi::Env env, const EMC_MOTION_STAT &motion_stat);
        Napi::Object convertIoStatToNapi(Napi::Env env, const EMC_IO_STAT &io_stat);
        Napi::Object convertTrajStatToNapi(Napi::Env env, const EMC_TRAJ_STAT &traj_stat);
        Napi::Array convertJointsToNapi(Napi::Env env, const EMC_JOINT_STAT joints[], int count);
        Napi::Array convertAxesToNapi(Napi::Env env, const EMC_AXIS_STAT axes[], int count);
        Napi::Array convertSpindlesToNapi(Napi::Env env, const EMC_SPINDLE_STAT spindles[], int count);
        Napi::Object convertToolStatToNapi(Napi::Env env, const EMC_TOOL_STAT &tool_stat);
        Napi::Object convertCoolantStatToNapi(Napi::Env env, const EMC_COOLANT_STAT &coolant_stat);
        Napi::Array convertToolTableToNapi(Napi::Env env); // Specific for tool_table

        // Exposed methods
        Napi::Value Poll(const Napi::CallbackInfo &info);               // Returns bool: true if new data was read
        Napi::Value GetCurrentFullStat(const Napi::CallbackInfo &info); // Returns the full current stat object
        Napi::Value ToolInfo(const Napi::CallbackInfo &info);
    };

}
