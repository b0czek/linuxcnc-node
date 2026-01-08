#include "stat_channel.hh"
#include "common.hh"
#include <cstring>
#include <cmath>
#include "timer.hh"
#include "tooldata.hh"
#include "rtapi_string.h"

namespace LinuxCNC
{

    Napi::FunctionReference NapiStatChannel::constructor;

    Napi::Object NapiStatChannel::Init(Napi::Env env, Napi::Object exports)
    {
        Napi::HandleScope scope(env);
        Napi::Function func = DefineClass(env, "NativeStatChannel", {
                                                                        InstanceMethod("poll", &NapiStatChannel::Poll),
                                                                        InstanceMethod("getCursor", &NapiStatChannel::GetCursor),
                                                                        InstanceMethod("disconnect", &NapiStatChannel::Disconnect),
                                                                    });
        constructor = Napi::Persistent(func);
        constructor.SuppressDestruct();
        exports.Set("NativeStatChannel", func);
        return exports;
    }

    NapiStatChannel::NapiStatChannel(const Napi::CallbackInfo &info) : Napi::ObjectWrap<NapiStatChannel>(info)
    {
        Napi::Env env = info.Env();
        if (!connect())
        {
            Napi::Error::New(env, "Failed to connect to LinuxCNC stat channel").ThrowAsJavaScriptException();
        }
    }

    NapiStatChannel::~NapiStatChannel()
    {
        disconnect();
    }

    bool NapiStatChannel::connect()
    {
        if (s_channel_)
            return true; // Already connected

        // Ensure NML file path is set
        const char *nml_file = GetNmlFileCStr();
        if (strlen(nml_file) == 0)
        {
            return false;
        }

        s_channel_ = new RCS_STAT_CHANNEL(emcFormat, "emcStatus", "xemc", nml_file);
        if (!s_channel_ || !s_channel_->valid())
        {
            delete s_channel_;
            s_channel_ = nullptr;
            return false;
        }
        // Initial poll to populate status_
        pollInternal();

        return true;
    }

    void NapiStatChannel::disconnect()
    {
        if (s_channel_)
        {
            delete s_channel_;
            s_channel_ = nullptr;
        }
        if (tool_mmap_initialized_)
        {
            tool_mmap_initialized_ = false;
        }
    }

    bool NapiStatChannel::pollInternal()
    {
        if (!s_channel_ || !s_channel_->valid())
        {
            return false;
        }

        // Initialize tool mmap if not done yet
        if (!tool_mmap_initialized_)
        {
            if (tool_mmap_user() == 0)
            {
                tool_mmap_initialized_ = true;
            }
        }

        if (s_channel_->peek() == EMC_STAT_TYPE)
        {
            EMC_STAT *emc_status_ptr = static_cast<EMC_STAT *>(s_channel_->get_address());
            if (emc_status_ptr)
            {
                // Compare new data with current status to determine if it has changed
                bool data_changed = (memcmp(&status_, emc_status_ptr, sizeof(EMC_STAT)) != 0);

                if (data_changed)
                {
                    // Update current status with new data
                    status_ = *emc_status_ptr;
                    return true; // Data was updated
                }
                return false; // Data exists but hasn't changed
            }
        }
        return false; // No new data or error
    }

    // Helper overloads to convert C++ values to Napi::Value
    inline Napi::Value toNapiValue(Napi::Env env, double v) { return Napi::Number::New(env, v); }
    inline Napi::Value toNapiValue(Napi::Env env, int v) { return Napi::Number::New(env, v); }
    inline Napi::Value toNapiValue(Napi::Env env, bool v) { return Napi::Boolean::New(env, v); }
    inline Napi::Value toNapiValue(Napi::Env env, const char* v) { return Napi::String::New(env, v); }
    inline Napi::Value toNapiValue(Napi::Env env, const EmcPose& v) { return EmcPoseToNapiFloat64Array(env, v); }

    // Generic delta helper - adds {path, value} to the changes array
    template<typename T>
    void addDelta(Napi::Env env, Napi::Array &deltas, const char* path, const T& value) {
        Napi::Object change = Napi::Object::New(env);
        change.Set("path", Napi::String::New(env, path));
        change.Set("value", toNapiValue(env, value));
        deltas.Set(deltas.Length(), change);
    }

    // Macro helpers for cleaner comparison code - force bypasses comparison
    #define COMPARE_FIELD(field, path) \
        if (force || newStat.field != oldStat.field) addDelta(env, deltas, path, newStat.field)
    #define COMPARE_BOOL(field, path) \
        if (force || newStat.field != oldStat.field) addDelta(env, deltas, path, (bool)newStat.field)
    #define COMPARE_INT_CAST(field, path) \
        if (force || (int)newStat.field != (int)oldStat.field) addDelta(env, deltas, path, (int)newStat.field)
    #define COMPARE_STRING(field, path) \
        if (force || strcmp(newStat.field, oldStat.field) != 0) addDelta(env, deltas, path, newStat.field)
    #define COMPARE_POSE(field, path) \
        if (force || memcmp(&newStat.field, &oldStat.field, sizeof(EmcPose)) != 0) addDelta(env, deltas, path, newStat.field)
    #define COMPARE_ARRAY(array, idx, path) \
        if (force || newStat.array[idx] != oldStat.array[idx]) addDelta(env, deltas, path, newStat.array[idx])

    void NapiStatChannel::compareTaskStat(Napi::Env env, Napi::Array &deltas, bool force,
                                          const EMC_TASK_STAT &newStat, const EMC_TASK_STAT &oldStat)
    {
        COMPARE_INT_CAST(mode, "task.mode");
        COMPARE_INT_CAST(state, "task.state");
        COMPARE_INT_CAST(execState, "task.execState");
        COMPARE_INT_CAST(interpState, "task.interpState");
        COMPARE_FIELD(callLevel, "task.callLevel");
        COMPARE_FIELD(motionLine, "task.motionLine");
        COMPARE_FIELD(currentLine, "task.currentLine");
        COMPARE_FIELD(readLine, "task.readLine");
        COMPARE_BOOL(optional_stop_state, "task.optionalStopState");
        COMPARE_BOOL(block_delete_state, "task.blockDeleteState");
        COMPARE_BOOL(input_timeout, "task.inputTimeout");
        COMPARE_STRING(file, "task.file");
        COMPARE_STRING(command, "task.command");
        COMPARE_STRING(ini_filename, "task.iniFilename");
        COMPARE_POSE(g5x_offset, "task.g5xOffset");
        COMPARE_FIELD(g5x_index, "task.g5xIndex");
        COMPARE_POSE(g92_offset, "task.g92Offset");
        COMPARE_FIELD(rotation_xy, "task.rotationXY");
        COMPARE_POSE(toolOffset, "task.toolOffset");
        
        // Active G-codes
        COMPARE_ARRAY(activeGCodes, 1, "task.activeGCodes.motionMode");
        COMPARE_ARRAY(activeGCodes, 2, "task.activeGCodes.gMode0");
        COMPARE_ARRAY(activeGCodes, 3, "task.activeGCodes.plane");
        COMPARE_ARRAY(activeGCodes, 4, "task.activeGCodes.cutterComp");
        COMPARE_ARRAY(activeGCodes, 5, "task.activeGCodes.units");
        COMPARE_ARRAY(activeGCodes, 6, "task.activeGCodes.distanceMode");
        COMPARE_ARRAY(activeGCodes, 7, "task.activeGCodes.feedRateMode");
        COMPARE_ARRAY(activeGCodes, 8, "task.activeGCodes.origin");
        COMPARE_ARRAY(activeGCodes, 9, "task.activeGCodes.toolLengthOffset");
        COMPARE_ARRAY(activeGCodes, 10, "task.activeGCodes.retractMode");
        COMPARE_ARRAY(activeGCodes, 11, "task.activeGCodes.pathControl");
        COMPARE_ARRAY(activeGCodes, 13, "task.activeGCodes.spindleSpeedMode");
        COMPARE_ARRAY(activeGCodes, 14, "task.activeGCodes.ijkDistanceMode");
        COMPARE_ARRAY(activeGCodes, 15, "task.activeGCodes.latheDiameterMode");
        COMPARE_ARRAY(activeGCodes, 16, "task.activeGCodes.g92Applied");

        // Active M-codes
        COMPARE_ARRAY(activeMCodes, 1, "task.activeMCodes.stopping");
        COMPARE_ARRAY(activeMCodes, 2, "task.activeMCodes.spindleControl");
        COMPARE_ARRAY(activeMCodes, 3, "task.activeMCodes.toolChange");
        COMPARE_ARRAY(activeMCodes, 4, "task.activeMCodes.mistCoolant");
        COMPARE_ARRAY(activeMCodes, 5, "task.activeMCodes.floodCoolant");
        COMPARE_ARRAY(activeMCodes, 6, "task.activeMCodes.overrideControl");
        COMPARE_ARRAY(activeMCodes, 7, "task.activeMCodes.adaptiveFeedControl");
        COMPARE_ARRAY(activeMCodes, 8, "task.activeMCodes.feedHoldControl");

        // Active settings
        COMPARE_ARRAY(activeSettings, 1, "task.activeSettings.feedRate");
        COMPARE_ARRAY(activeSettings, 2, "task.activeSettings.speed");
        COMPARE_ARRAY(activeSettings, 3, "task.activeSettings.blendTolerance");
        COMPARE_ARRAY(activeSettings, 4, "task.activeSettings.naiveCAMTolerance");

        COMPARE_INT_CAST(programUnits, "task.programUnits");
        COMPARE_FIELD(delayLeft, "task.delayLeft");
        COMPARE_BOOL(task_paused, "task.taskPaused");
        COMPARE_FIELD(interpreter_errcode, "task.interpreterErrorCode");
        COMPARE_FIELD(queuedMDIcommands, "task.queuedMdiCommands");
    }

    void NapiStatChannel::compareTrajStat(Napi::Env env, Napi::Array &deltas, const char* prefix,
                                          const EMC_TRAJ_STAT &newStat, const EMC_TRAJ_STAT &oldStat, bool force)
    {
        char path[128];
        #define TRAJ_PATH(name) snprintf(path, sizeof(path), "%s.%s", prefix, name), path
        
        // Simple field comparisons
        COMPARE_FIELD(linearUnits, TRAJ_PATH("linearUnits"));
        COMPARE_FIELD(angularUnits, TRAJ_PATH("angularUnits"));
        COMPARE_FIELD(cycleTime, TRAJ_PATH("cycleTime"));
        COMPARE_FIELD(joints, TRAJ_PATH("joints"));
        COMPARE_FIELD(spindles, TRAJ_PATH("spindles"));
        
        // Axis mask - special handling to build string array
        if (force || newStat.axis_mask != oldStat.axis_mask) {
            Napi::Array axisArray = Napi::Array::New(env);
            uint32_t axisMask = newStat.axis_mask;
            uint32_t idx = 0;
            if (axisMask & 1) axisArray.Set(idx++, Napi::String::New(env, "X"));
            if (axisMask & 2) axisArray.Set(idx++, Napi::String::New(env, "Y"));
            if (axisMask & 4) axisArray.Set(idx++, Napi::String::New(env, "Z"));
            if (axisMask & 8) axisArray.Set(idx++, Napi::String::New(env, "A"));
            if (axisMask & 16) axisArray.Set(idx++, Napi::String::New(env, "B"));
            if (axisMask & 32) axisArray.Set(idx++, Napi::String::New(env, "C"));
            if (axisMask & 64) axisArray.Set(idx++, Napi::String::New(env, "U"));
            if (axisMask & 128) axisArray.Set(idx++, Napi::String::New(env, "V"));
            if (axisMask & 256) axisArray.Set(idx++, Napi::String::New(env, "W"));
            
            Napi::Object change = Napi::Object::New(env);
            change.Set("path", Napi::String::New(env, TRAJ_PATH("availableAxes")));
            change.Set("value", axisArray);
            deltas.Set(deltas.Length(), change);
        }
        
        COMPARE_INT_CAST(mode, TRAJ_PATH("mode"));
        COMPARE_BOOL(enabled, TRAJ_PATH("enabled"));
        COMPARE_BOOL(inpos, TRAJ_PATH("inPosition"));
        COMPARE_FIELD(queue, TRAJ_PATH("queue"));
        COMPARE_FIELD(activeQueue, TRAJ_PATH("activeQueue"));
        COMPARE_BOOL(queueFull, TRAJ_PATH("queueFull"));
        COMPARE_FIELD(id, TRAJ_PATH("id"));
        COMPARE_BOOL(paused, TRAJ_PATH("paused"));
        
        // Fields with different path names
        if (force || newStat.scale != oldStat.scale) addDelta(env, deltas, TRAJ_PATH("feedRateOverride"), newStat.scale);
        if (force || newStat.rapid_scale != oldStat.rapid_scale) addDelta(env, deltas, TRAJ_PATH("rapidRateOverride"), newStat.rapid_scale);
        
        COMPARE_POSE(position, TRAJ_PATH("position"));
        COMPARE_POSE(actualPosition, TRAJ_PATH("actualPosition"));
        COMPARE_FIELD(acceleration, TRAJ_PATH("acceleration"));
        COMPARE_FIELD(maxVelocity, TRAJ_PATH("maxVelocity"));
        COMPARE_FIELD(maxAcceleration, TRAJ_PATH("maxAcceleration"));
        COMPARE_POSE(probedPosition, TRAJ_PATH("probedPosition"));
        COMPARE_BOOL(probe_tripped, TRAJ_PATH("probeTripped"));
        COMPARE_BOOL(probing, TRAJ_PATH("probing"));
        COMPARE_FIELD(probeval, TRAJ_PATH("probeVal"));
        COMPARE_FIELD(kinematics_type, TRAJ_PATH("kinematicsType"));
        COMPARE_FIELD(motion_type, TRAJ_PATH("motionType"));
        COMPARE_FIELD(distance_to_go, TRAJ_PATH("distanceToGo"));
        COMPARE_POSE(dtg, TRAJ_PATH("dtg"));
        COMPARE_FIELD(current_vel, TRAJ_PATH("currentVelocity"));
        COMPARE_BOOL(feed_override_enabled, TRAJ_PATH("feedOverrideEnabled"));
        COMPARE_BOOL(adaptive_feed_enabled, TRAJ_PATH("adaptiveFeedEnabled"));
        COMPARE_BOOL(feed_hold_enabled, TRAJ_PATH("feedHoldEnabled"));
        
        #undef TRAJ_PATH
    }

    void NapiStatChannel::compareJointStat(Napi::Env env, Napi::Array &deltas, const char* prefix,
                                           const EMC_JOINT_STAT &newStat, const EMC_JOINT_STAT &oldStat, bool force)
    {
        char path[128];
        #define JOINT_PATH(name) snprintf(path, sizeof(path), "%s.%s", prefix, name), path
        
        COMPARE_INT_CAST(jointType, JOINT_PATH("jointType"));
        COMPARE_FIELD(units, JOINT_PATH("units"));
        COMPARE_FIELD(backlash, JOINT_PATH("backlash"));
        COMPARE_FIELD(minPositionLimit, JOINT_PATH("minPositionLimit"));
        COMPARE_FIELD(maxPositionLimit, JOINT_PATH("maxPositionLimit"));
        COMPARE_FIELD(minFerror, JOINT_PATH("minFerror"));
        COMPARE_FIELD(maxFerror, JOINT_PATH("maxFerror"));
        COMPARE_FIELD(ferrorCurrent, JOINT_PATH("ferrorCurrent"));
        COMPARE_FIELD(ferrorHighMark, JOINT_PATH("ferrorHighMark"));
        COMPARE_FIELD(output, JOINT_PATH("output"));
        COMPARE_FIELD(input, JOINT_PATH("input"));
        COMPARE_FIELD(velocity, JOINT_PATH("velocity"));
        COMPARE_BOOL(inpos, JOINT_PATH("inPosition"));
        COMPARE_BOOL(homing, JOINT_PATH("homing"));
        COMPARE_BOOL(homed, JOINT_PATH("homed"));
        COMPARE_BOOL(fault, JOINT_PATH("fault"));
        COMPARE_BOOL(enabled, JOINT_PATH("enabled"));
        COMPARE_BOOL(minSoftLimit, JOINT_PATH("minSoftLimit"));
        COMPARE_BOOL(maxSoftLimit, JOINT_PATH("maxSoftLimit"));
        COMPARE_BOOL(minHardLimit, JOINT_PATH("minHardLimit"));
        COMPARE_BOOL(maxHardLimit, JOINT_PATH("maxHardLimit"));
        COMPARE_BOOL(overrideLimits, JOINT_PATH("overrideLimits"));
        
        #undef JOINT_PATH
    }

    void NapiStatChannel::compareSpindleStat(Napi::Env env, Napi::Array &deltas, const char* prefix,
                                             const EMC_SPINDLE_STAT &newStat, const EMC_SPINDLE_STAT &oldStat, bool force)
    {
        char path[128];
        #define SPINDLE_PATH(name) snprintf(path, sizeof(path), "%s.%s", prefix, name), path
        
        COMPARE_FIELD(speed, SPINDLE_PATH("speed"));
        COMPARE_FIELD(direction, SPINDLE_PATH("direction"));
        COMPARE_FIELD(increasing, SPINDLE_PATH("increasing"));
        COMPARE_FIELD(orient_state, SPINDLE_PATH("orientState"));
        COMPARE_FIELD(orient_fault, SPINDLE_PATH("orientFault"));
        COMPARE_BOOL(brake, SPINDLE_PATH("brake"));
        COMPARE_BOOL(enabled, SPINDLE_PATH("enabled"));
        COMPARE_BOOL(spindle_override_enabled, SPINDLE_PATH("spindleOverrideEnabled"));
        COMPARE_BOOL(homed, SPINDLE_PATH("homed"));
        
        // Field with different path name
        if (force || newStat.spindle_scale != oldStat.spindle_scale) 
            addDelta(env, deltas, SPINDLE_PATH("override"), newStat.spindle_scale);
        
        #undef SPINDLE_PATH
    }

    void NapiStatChannel::compareAxisStat(Napi::Env env, Napi::Array &deltas, const char* prefix,
                                          const EMC_AXIS_STAT &newStat, const EMC_AXIS_STAT &oldStat, bool force)
    {
        char path[128];
        #define AXIS_PATH(name) snprintf(path, sizeof(path), "%s.%s", prefix, name), path
        
        COMPARE_FIELD(minPositionLimit, AXIS_PATH("minPositionLimit"));
        COMPARE_FIELD(maxPositionLimit, AXIS_PATH("maxPositionLimit"));
        COMPARE_FIELD(velocity, AXIS_PATH("velocity"));
        
        #undef AXIS_PATH
    }

    void NapiStatChannel::compareMotionStat(Napi::Env env, Napi::Array &deltas,
                                            const EMC_MOTION_STAT &newStat, const EMC_MOTION_STAT &oldStat, bool force)
    {
        // Trajectory
        compareTrajStat(env, deltas, "motion.traj", newStat.traj, oldStat.traj, force);
        
        char prefix[64];
        
        // Joints
        for (int i = 0; i < EMCMOT_MAX_JOINTS; ++i) {
            snprintf(prefix, sizeof(prefix), "motion.joint.%d", i);
            compareJointStat(env, deltas, prefix, newStat.joint[i], oldStat.joint[i], force);
        }
        
        // Axes
        for (int i = 0; i < EMCMOT_MAX_AXIS; ++i) {
            snprintf(prefix, sizeof(prefix), "motion.axis.%d", i);
            compareAxisStat(env, deltas, prefix, newStat.axis[i], oldStat.axis[i], force);
        }
        
        // Spindles
        for (int i = 0; i < EMCMOT_MAX_SPINDLES; ++i) {
            snprintf(prefix, sizeof(prefix), "motion.spindle.%d", i);
            compareSpindleStat(env, deltas, prefix, newStat.spindle[i], oldStat.spindle[i], force);
        }
        
        // Local macro for indexed array comparison with dynamic path
        char path[128];
        #define COMPARE_INDEXED_IO(array, base_path) \
            for (int i = 0; i < (int)(sizeof(newStat.array)/sizeof(newStat.array[0])); ++i) { \
                if (force || newStat.array[i] != oldStat.array[i]) { \
                    snprintf(path, sizeof(path), base_path ".%d", i); \
                    addDelta(env, deltas, path, newStat.array[i]); \
                } \
            }
        
        COMPARE_INDEXED_IO(synch_di, "motion.digitalInput");
        COMPARE_INDEXED_IO(synch_do, "motion.digitalOutput");
        COMPARE_INDEXED_IO(analog_input, "motion.analogInput");
        COMPARE_INDEXED_IO(analog_output, "motion.analogOutput");
        
        #undef COMPARE_INDEXED_IO
    }

    void NapiStatChannel::compareIoStat(Napi::Env env, Napi::Array &deltas,
                                        const EMC_IO_STAT &newStat, const EMC_IO_STAT &oldStat, bool force)
    {
        // Tool stat
        if (force || newStat.tool.pocketPrepped != oldStat.tool.pocketPrepped) 
            addDelta(env, deltas, "io.tool.pocketPrepped", newStat.tool.pocketPrepped);
        if (force || newStat.tool.toolInSpindle != oldStat.tool.toolInSpindle) 
            addDelta(env, deltas, "io.tool.toolInSpindle", newStat.tool.toolInSpindle);
        if (force || newStat.tool.toolFromPocket != oldStat.tool.toolFromPocket) 
            addDelta(env, deltas, "io.tool.toolFromPocket", newStat.tool.toolFromPocket);
        
        // Coolant stat
        if (force || newStat.coolant.mist != oldStat.coolant.mist) 
            addDelta(env, deltas, "io.coolant.mist", (bool)newStat.coolant.mist);
        if (force || newStat.coolant.flood != oldStat.coolant.flood) 
            addDelta(env, deltas, "io.coolant.flood", (bool)newStat.coolant.flood);
        
        // Aux stat
        if (force || newStat.aux.estop != oldStat.aux.estop) 
            addDelta(env, deltas, "io.estop", (bool)newStat.aux.estop);
    }

    // Undefine macros
    #undef COMPARE_FIELD
    #undef COMPARE_BOOL
    #undef COMPARE_INT_CAST
    #undef COMPARE_STRING
    #undef COMPARE_POSE
    #undef COMPARE_ARRAY

    Napi::Value NapiStatChannel::Poll(const Napi::CallbackInfo &info)
    {
        Napi::Env env = info.Env();
        
        // Parse optional force parameter
        bool force = false;
        if (info.Length() > 0 && info[0].IsBoolean()) {
            force = info[0].As<Napi::Boolean>().Value();
        }
        
        if (!s_channel_ || !s_channel_->valid())
        {
            // Attempt to reconnect or throw error
            if (!connect())
            {
                Napi::Error::New(env, "Stat channel not connected and failed to reconnect.").ThrowAsJavaScriptException();
                return env.Null();
            }
        }

        // Create result object
        Napi::Object result = Napi::Object::New(env);
        Napi::Array deltas = Napi::Array::New(env);
        
        bool updated = pollInternal();
        
        if (updated && (force || has_prev_status_)) {
            // Compare and generate deltas (force emits all fields)
            if (force || status_.echo_serial_number != prev_status_.echo_serial_number)
                addDelta(env, deltas, "echoSerialNumber", (int)status_.echo_serial_number);
            if (force || (int)status_.status != (int)prev_status_.status)
                addDelta(env, deltas, "state", (int)status_.status);
            if (force || status_.debug != prev_status_.debug)
                addDelta(env, deltas, "debug", (int)status_.debug);
            
            compareTaskStat(env, deltas, status_.task, prev_status_.task, force);
            compareMotionStat(env, deltas, status_.motion, prev_status_.motion, force);
            compareIoStat(env, deltas, status_.io, prev_status_.io, force);
            
            // Tool table comparison
            compareToolTable(env, deltas, force);
        }
        
        // If we have updated data, copy current to previous for next comparison
        if (updated) {
            prev_status_ = status_;
            has_prev_status_ = true;
        }
        
        // Only increment cursor if there are actual changes
        if (deltas.Length() > 0) {
            cursor_++;
        }
        
        result.Set("changes", deltas);
        result.Set("cursor", Napi::Number::New(env, static_cast<uint32_t>(cursor_)));
        return result;
    }
    
    Napi::Value NapiStatChannel::GetCursor(const Napi::CallbackInfo &info)
    {
        return Napi::Number::New(info.Env(), static_cast<uint32_t>(cursor_));
    }

    Napi::Array NapiStatChannel::convertToolTableToNapi(Napi::Env env)
    {
        if (!tool_mmap_initialized_)
        {
            // fprintf(stderr, "Tool mmap not initialized, cannot get tool table.\n");
            return Napi::Array::New(env, 0); // Return empty array
        }

        int idxmax = tooldata_last_index_get() + 1;
        Napi::Array toolList = Napi::Array::New(env);
        uint32_t js_idx = 0;

        for (int i = 0; i < idxmax; ++i)
        {
            CANON_TOOL_TABLE tdata;
            if (tooldata_get(&tdata, i) != IDX_OK)
            {
                fprintf(stderr, "NapiStatChannel::convertToolTableToNapi: Error getting tool data for index %d\n", i);
                continue;
            }

            Napi::Object toolObj = Napi::Object::New(env);
            DictAdd(env, toolObj, "toolNo", tdata.toolno);
            DictAdd(env, toolObj, "pocketNo", tdata.pocketno);
            DictAdd(env, toolObj, "diameter", tdata.diameter);
            DictAdd(env, toolObj, "frontAngle", tdata.frontangle);
            DictAdd(env, toolObj, "backAngle", tdata.backangle);
            DictAdd(env, toolObj, "orientation", tdata.orientation);
            toolObj.Set("offset", EmcPoseToNapiFloat64Array(env, tdata.offset));
            DictAddString(env, toolObj, "comment", tdata.comment);

            toolList.Set(js_idx++, toolObj);
        }
        return toolList;
    }

    Napi::Value NapiStatChannel::Disconnect(const Napi::CallbackInfo &info)
    {
        Napi::Env env = info.Env();
        disconnect();
        return env.Undefined();
    }



    void NapiStatChannel::compareToolTable(Napi::Env env, Napi::Array &deltas, bool force)
    {
        if (!tool_mmap_initialized_)
        {
            if (tool_mmap_user() != 0)
            {
                // Failed to init, skip
                return;
            }
            tool_mmap_initialized_ = true;
        }

        int idxmax = tooldata_last_index_get() + 1;
        
        // Resize shadow table if needed
        if (prev_tool_table_.size() < (size_t)idxmax) {
            prev_tool_table_.resize(idxmax);
            // If resizing, we might want to force update for new slots, 
            // but the loop below handles "diff against zero-init" naturally.
        }

        char path[128];
        
        for (int i = 0; i < idxmax; ++i)
        {
            CANON_TOOL_TABLE tdata;
            if (tooldata_get(&tdata, i) != IDX_OK)
            {
                continue;
            }

            CANON_TOOL_TABLE &oldData = prev_tool_table_[i];

            // Helper macros for tool table fields
            #define TOOL_PATH(idx, name) snprintf(path, sizeof(path), "toolTable.%d.%s", idx, name), path

            // Compare fields
            if (force || tdata.toolno != oldData.toolno) 
                addDelta(env, deltas, TOOL_PATH(i, "toolNo"), tdata.toolno);
                
            if (force || tdata.pocketno != oldData.pocketno) 
                addDelta(env, deltas, TOOL_PATH(i, "pocketNo"), tdata.pocketno);
                
            if (force || tdata.diameter != oldData.diameter) 
                addDelta(env, deltas, TOOL_PATH(i, "diameter"), tdata.diameter);
                
            if (force || tdata.frontangle != oldData.frontangle) 
                addDelta(env, deltas, TOOL_PATH(i, "frontAngle"), tdata.frontangle);
                
            if (force || tdata.backangle != oldData.backangle) 
                addDelta(env, deltas, TOOL_PATH(i, "backAngle"), tdata.backangle);
                
            if (force || tdata.orientation != oldData.orientation) 
                addDelta(env, deltas, TOOL_PATH(i, "orientation"), tdata.orientation);
                
            if (force || memcmp(&tdata.offset, &oldData.offset, sizeof(EmcPose)) != 0) 
                addDelta(env, deltas, TOOL_PATH(i, "offset"), tdata.offset);
                
            if (force || strcmp(tdata.comment, oldData.comment) != 0) 
                addDelta(env, deltas, TOOL_PATH(i, "comment"), tdata.comment);

            #undef TOOL_PATH

            // Update shadow copy
            oldData = tdata;
        }
    }

}
