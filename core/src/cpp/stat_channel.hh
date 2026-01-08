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
        EMC_STAT prev_status_{};             // Previous status for delta comparison
        uint64_t cursor_{0};                 // Monotonic cursor for sync
        bool has_prev_status_{false};        // Whether we have a previous status to compare
        bool tool_mmap_initialized_ = false; // For tool_mmap_user etc.

        // Internal helper to connect to NML
        bool connect();
        void disconnect();
        bool pollInternal(); // Internal poll without Napi dependencies

        // Note: addDelta is a free template function in stat_channel.cc
        
        // Compare subsystems and add deltas (force=true emits all fields regardless of comparison)
        void compareTaskStat(Napi::Env env, Napi::Array &deltas, 
                            const EMC_TASK_STAT &newStat, const EMC_TASK_STAT &oldStat, bool force);
        void compareMotionStat(Napi::Env env, Napi::Array &deltas,
                              const EMC_MOTION_STAT &newStat, const EMC_MOTION_STAT &oldStat, bool force);
        void compareIoStat(Napi::Env env, Napi::Array &deltas,
                          const EMC_IO_STAT &newStat, const EMC_IO_STAT &oldStat, bool force);
        void compareTrajStat(Napi::Env env, Napi::Array &deltas, const char* prefix,
                            const EMC_TRAJ_STAT &newStat, const EMC_TRAJ_STAT &oldStat, bool force);
        void compareJointStat(Napi::Env env, Napi::Array &deltas, const char* prefix,
                             const EMC_JOINT_STAT &newStat, const EMC_JOINT_STAT &oldStat, bool force);
        void compareSpindleStat(Napi::Env env, Napi::Array &deltas, const char* prefix,
                               const EMC_SPINDLE_STAT &newStat, const EMC_SPINDLE_STAT &oldStat, bool force);
        void compareAxisStat(Napi::Env env, Napi::Array &deltas, const char* prefix,
                            const EMC_AXIS_STAT &newStat, const EMC_AXIS_STAT &oldStat, bool force);

        // Tool table conversion (still needed - from mmap, not EMC_STAT)
        Napi::Array convertToolTableToNapi(Napi::Env env);

        // Shadow tool table for diffing
        std::vector<CANON_TOOL_TABLE> prev_tool_table_;
        
        // Compare tool table and add deltas
        void compareToolTable(Napi::Env env, Napi::Array &deltas, bool force);

        // Exposed methods
        Napi::Value Poll(const Napi::CallbackInfo &info);               // Returns delta changes array (accepts optional force bool)
        Napi::Value GetCursor(const Napi::CallbackInfo &info);          // Returns current cursor value
        Napi::Value Disconnect(const Napi::CallbackInfo &info);         // Disconnects from NML channel
    };

}
