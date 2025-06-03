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
                                                                        InstanceMethod("getCurrentFullStat", &NapiStatChannel::GetCurrentFullStat),
                                                                        InstanceMethod("toolInfo", &NapiStatChannel::ToolInfo),
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
        if (c_channel_)
            return true; // Already connected

        // Ensure NML file path is set
        const char *nml_file = GetNmlFileCStr();
        if (strlen(nml_file) == 0)
        {
            // This should not happen if nml path is set.
            // Consider throwing an error or logging.
            return false;
        }

        c_channel_ = new RCS_STAT_CHANNEL(emcFormat, "emcStatus", "xemc", nml_file);
        if (!c_channel_ || !c_channel_->valid())
        {
            delete c_channel_;
            c_channel_ = nullptr;
            return false;
        }
        // Initialize status_ to a zeroed state or by an initial poll
        memset(&status_, 0, sizeof(EMC_STAT));
        // Initial poll to populate status_
        // Poll(Napi::CallbackInfo(Env(), NewObject())); // Call with dummy info
        return true;
    }

    void NapiStatChannel::disconnect()
    {
        if (c_channel_)
        {
            delete c_channel_;
            c_channel_ = nullptr;
        }
        if (tool_mmap_initialized_)
        {
            // tool_mmap_close(); // If tooldata.cc has a close function
            tool_mmap_initialized_ = false;
        }
    }

    Napi::Value NapiStatChannel::Poll(const Napi::CallbackInfo &info)
    {
        Napi::Env env = info.Env();
        if (!c_channel_ || !c_channel_->valid())
        {
            // Attempt to reconnect or throw error
            if (!connect())
            {
                Napi::Error::New(env, "Stat channel not connected and failed to reconnect.").ThrowAsJavaScriptException();
                return env.Null();
            }
        }

        // Initialize tool mmap if not done yet ( mimics original python logic )
        if (!tool_mmap_initialized_)
        {
            // The original python code registers tool table with status_.io.tool.toolTable,
            // but here status_ is just a copy. tooldata.hh functions directly access shared memory.
            if (tool_mmap_user() == 0)
            { // 0 on success
                tool_mmap_initialized_ = true;
            }
            else
            {
                // fprintf(stderr, "NapiStatChannel::Poll: tool_mmap_user() failed. Continuing without tool mmap data.\n");
                //  Don't set tool_mmap_initialized_ to true, so it might retry or operate without.
                //  The tooldata_get functions might then fail or return defaults.
            }
        }

        if (c_channel_->peek() == EMC_STAT_TYPE)
        {
            EMC_STAT *emc_status_ptr = static_cast<EMC_STAT *>(c_channel_->get_address());
            if (emc_status_ptr)
            {
                // Compare with current status_ to see if there's a real change in content
                // For simplicity, we assume any new message from peek() is a change.
                // A more robust check would be memcmp or specific field comparison.
                // The serial_number in RCS_MSG might indicate a change.
                // For now, if peek() has data, we copy it.
                memcpy(&status_, emc_status_ptr, sizeof(EMC_STAT));
                return Napi::Boolean::New(env, true); // Data was updated
            }
        }
        return Napi::Boolean::New(env, false); // No new data or error
    }

    Napi::Value NapiStatChannel::GetCurrentFullStat(const Napi::CallbackInfo &info)
    {
        Napi::Env env = info.Env();
        if (!c_channel_ || !c_channel_->valid())
        { // Ensure we are connected
            Napi::Error::New(env, "Stat channel not connected.").ThrowAsJavaScriptException();
            return env.Null();
        }
        return convertFullStatToNapiObject(env, status_);
    }

    // --- Conversion helpers (implementation details) ---
    // These will be quite long. I'll sketch one or two.

    Napi::Object NapiStatChannel::convertFullStatToNapiObject(Napi::Env env, const EMC_STAT &stat_to_convert)
    {
        Napi::Object obj = Napi::Object::New(env);

        obj.Set("echoSerialNumber", Napi::Number::New(env, stat_to_convert.echo_serial_number));
        obj.Set("state", Napi::Number::New(env, static_cast<int>(stat_to_convert.status))); // RCS_STATUS

        obj.Set("task", convertTaskStatToNapi(env, stat_to_convert.task));
        obj.Set("motion", convertMotionStatToNapi(env, stat_to_convert.motion));
        obj.Set("io", convertIoStatToNapi(env, stat_to_convert.io));
        obj.Set("debug", Napi::Number::New(env, stat_to_convert.debug));

        // Derived properties from Python's PyGetSetDef for stat
        // These are added for convenience, directly mirroring the Python API surface
        // actualPosition -> motion.traj.actualPosition (already in motion.traj)
        // ain -> motion.analog_input (already in motion)
        // aout -> motion.analog_output (already in motion)
        // din -> motion.synch_di (already in motion)
        // dout -> motion.synch_do (already in motion)
        // gcodes -> task.activeGCodes (already in task)

        Napi::Array homedArr = Napi::Array::New(env, EMCMOT_MAX_JOINTS);
        for (int i = 0; i < EMCMOT_MAX_JOINTS; ++i)
        {
            homedArr.Set(i, Napi::Boolean::New(env, stat_to_convert.motion.joint[i].homed != 0));
        }
        obj.Set("homed", homedArr);

        Napi::Array limitArr = Napi::Array::New(env, EMCMOT_MAX_JOINTS);
        for (int i = 0; i < EMCMOT_MAX_JOINTS; i++)
        {
            int v = 0;
            if (stat_to_convert.motion.joint[i].minHardLimit)
                v |= 1;
            if (stat_to_convert.motion.joint[i].maxHardLimit)
                v |= 2;
            if (stat_to_convert.motion.joint[i].minSoftLimit)
                v |= 4;
            if (stat_to_convert.motion.joint[i].maxSoftLimit)
                v |= 8;
            limitArr.Set(i, Napi::Number::New(env, v));
        }
        obj.Set("limit", limitArr);

        // mcodes -> task.activeMCodes (already in task)
        // g5xOffset -> task.g5x_offset (already in task)
        // g5xIndex -> task.g5x_index (already in task)
        // g92Offset -> task.g92_offset (already in task)
        // position -> motion.traj.position (already in motion.traj)
        // dtg -> motion.traj.dtg (already in motion.traj)
        // jointPosition -> motion.joint[i].output (already in motion.joint)
        // jointActualPosition -> motion.joint[i].input (already in motion.joint)
        // probedPosition -> motion.traj.probedPosition (already in motion.traj)
        // settings -> task.activeSettings (already in task)
        // toolOffset -> task.toolOffset (already in task)

        obj.Set("toolTable", convertToolTableToNapi(env));

        return obj;
    }

    Napi::Object NapiStatChannel::convertTaskStatToNapi(Napi::Env env, const EMC_TASK_STAT &task_stat)
    {
        Napi::Object obj = Napi::Object::New(env);
        DictAdd(env, obj, "mode", static_cast<int>(task_stat.mode));
        DictAdd(env, obj, "state", static_cast<int>(task_stat.state));
        DictAdd(env, obj, "execState", static_cast<int>(task_stat.execState));
        DictAdd(env, obj, "interpState", static_cast<int>(task_stat.interpState));
        DictAdd(env, obj, "callLevel", task_stat.callLevel);
        DictAdd(env, obj, "motionLine", task_stat.motionLine);
        DictAdd(env, obj, "currentLine", task_stat.currentLine);
        DictAdd(env, obj, "readLine", task_stat.readLine);
        DictAdd(env, obj, "optionalStopState", (bool)task_stat.optional_stop_state);
        DictAdd(env, obj, "blockDeleteState", (bool)task_stat.block_delete_state);
        DictAdd(env, obj, "inputTimeout", (bool)task_stat.input_timeout);
        DictAddString(env, obj, "file", task_stat.file);
        DictAddString(env, obj, "command", task_stat.command);
        DictAddString(env, obj, "iniFilename", task_stat.ini_filename);
        obj.Set("g5xOffset", EmcPoseToNapiObject(env, task_stat.g5x_offset));
        DictAdd(env, obj, "g5xIndex", task_stat.g5x_index);
        obj.Set("g92Offset", EmcPoseToNapiObject(env, task_stat.g92_offset));
        DictAdd(env, obj, "rotationXy", task_stat.rotation_xy);
        obj.Set("toolOffset", EmcPoseToNapiObject(env, task_stat.toolOffset));
        obj.Set("activeGCodes", IntArrayToNapiArray(env, task_stat.activeGCodes, ACTIVE_G_CODES));
        obj.Set("activeMCodes", IntArrayToNapiArray(env, task_stat.activeMCodes, ACTIVE_M_CODES));
        obj.Set("activeSettings", DoubleArrayToNapiArray(env, task_stat.activeSettings, ACTIVE_SETTINGS));
        DictAdd(env, obj, "programUnits", static_cast<int>(task_stat.programUnits));
        DictAdd(env, obj, "interpreterErrcode", task_stat.interpreter_errcode);
        DictAdd(env, obj, "taskPaused", (bool)task_stat.task_paused); // Original was int
        DictAdd(env, obj, "delayLeft", task_stat.delayLeft);
        DictAdd(env, obj, "queuedMdiCommands", task_stat.queuedMDIcommands);
        DictAdd(env, obj, "heartbeat", (int)task_stat.heartbeat); // Cast to int for JS Number
        return obj;
    }

    Napi::Object NapiStatChannel::convertMotionStatToNapi(Napi::Env env, const EMC_MOTION_STAT &motion_stat)
    {
        Napi::Object obj = Napi::Object::New(env);
        obj.Set("traj", convertTrajStatToNapi(env, motion_stat.traj));
        obj.Set("joint", convertJointsToNapi(env, motion_stat.joint, EMCMOT_MAX_JOINTS));
        obj.Set("axis", convertAxesToNapi(env, motion_stat.axis, EMCMOT_MAX_AXIS));
        obj.Set("spindle", convertSpindlesToNapi(env, motion_stat.spindle, EMCMOT_MAX_SPINDLES));
        obj.Set("synchDi", IntArrayToNapiArray(env, motion_stat.synch_di, EMCMOT_MAX_DIO));
        obj.Set("synchDo", IntArrayToNapiArray(env, motion_stat.synch_do, EMCMOT_MAX_DIO));
        obj.Set("analogInput", DoubleArrayToNapiArray(env, motion_stat.analog_input, EMCMOT_MAX_AIO));
        obj.Set("analogOutput", DoubleArrayToNapiArray(env, motion_stat.analog_output, EMCMOT_MAX_AIO));
        // motion_stat.misc_error can be added if needed
        DictAdd(env, obj, "debug", motion_stat.debug);
        DictAdd(env, obj, "numExtraJoints", motion_stat.numExtraJoints);
        // ... other motion_stat fields if needed
        return obj;
    }

    Napi::Object NapiStatChannel::convertIoStatToNapi(Napi::Env env, const EMC_IO_STAT &io_stat)
    {
        Napi::Object obj = Napi::Object::New(env);
        obj.Set("tool", convertToolStatToNapi(env, io_stat.tool));
        obj.Set("coolant", convertCoolantStatToNapi(env, io_stat.coolant));
        obj.Set("aux", convertAuxStatToNapi(env, io_stat.aux));
        // io_stat.debug, reason, fault can be added
        return obj;
    }

    Napi::Object NapiStatChannel::convertTrajStatToNapi(Napi::Env env, const EMC_TRAJ_STAT &traj_stat)
    {
        Napi::Object obj = Napi::Object::New(env);
        DictAdd(env, obj, "linearUnits", traj_stat.linearUnits);
        DictAdd(env, obj, "angularUnits", traj_stat.angularUnits);
        DictAdd(env, obj, "cycleTime", traj_stat.cycleTime);
        DictAdd(env, obj, "joints", traj_stat.joints);
        DictAdd(env, obj, "spindles", traj_stat.spindles);
        DictAdd(env, obj, "axisMask", traj_stat.axis_mask);
        DictAdd(env, obj, "mode", static_cast<int>(traj_stat.mode));
        DictAdd(env, obj, "enabled", (bool)traj_stat.enabled);
        DictAdd(env, obj, "inpos", (bool)traj_stat.inpos);
        DictAdd(env, obj, "queue", traj_stat.queue);
        DictAdd(env, obj, "activeQueue", traj_stat.activeQueue);
        DictAdd(env, obj, "queueFull", (bool)traj_stat.queueFull);
        DictAdd(env, obj, "id", traj_stat.id);
        DictAdd(env, obj, "paused", (bool)traj_stat.paused);
        DictAdd(env, obj, "scale", traj_stat.scale); // feedrate
        DictAdd(env, obj, "rapidScale", traj_stat.rapid_scale);
        obj.Set("position", EmcPoseToNapiObject(env, traj_stat.position));
        obj.Set("actualPosition", EmcPoseToNapiObject(env, traj_stat.actualPosition));
        DictAdd(env, obj, "velocity", traj_stat.velocity);
        DictAdd(env, obj, "acceleration", traj_stat.acceleration);
        DictAdd(env, obj, "maxVelocity", traj_stat.maxVelocity);
        DictAdd(env, obj, "maxAcceleration", traj_stat.maxAcceleration);
        obj.Set("probedPosition", EmcPoseToNapiObject(env, traj_stat.probedPosition));
        DictAdd(env, obj, "probeTripped", (bool)traj_stat.probe_tripped);
        DictAdd(env, obj, "probing", (bool)traj_stat.probing);
        DictAdd(env, obj, "probeVal", traj_stat.probeval);
        DictAdd(env, obj, "kinematicsType", traj_stat.kinematics_type);
        DictAdd(env, obj, "motionType", traj_stat.motion_type);
        DictAdd(env, obj, "distanceToGo", traj_stat.distance_to_go);
        obj.Set("dtg", EmcPoseToNapiObject(env, traj_stat.dtg));
        DictAdd(env, obj, "currentVel", traj_stat.current_vel);
        DictAdd(env, obj, "feedOverrideEnabled", (bool)traj_stat.feed_override_enabled);
        DictAdd(env, obj, "adaptiveFeedEnabled", (bool)traj_stat.adaptive_feed_enabled);
        DictAdd(env, obj, "feedHoldEnabled", (bool)traj_stat.feed_hold_enabled);
        // traj_stat.tag can be added if needed (it's complex)
        return obj;
    }

    Napi::Array NapiStatChannel::convertJointsToNapi(Napi::Env env, const EMC_JOINT_STAT joints[], int count)
    {
        Napi::Array arr = Napi::Array::New(env, count);
        for (int i = 0; i < count; ++i)
        {
            Napi::Object jointObj = Napi::Object::New(env);
            DictAdd(env, jointObj, "jointType", (int)joints[i].jointType);
            DictAdd(env, jointObj, "units", joints[i].units);
            DictAdd(env, jointObj, "backlash", joints[i].backlash);
            DictAdd(env, jointObj, "minPositionLimit", joints[i].minPositionLimit);
            DictAdd(env, jointObj, "maxPositionLimit", joints[i].maxPositionLimit);
            DictAdd(env, jointObj, "minFerror", joints[i].minFerror);
            DictAdd(env, jointObj, "maxFerror", joints[i].maxFerror);
            DictAdd(env, jointObj, "ferrorCurrent", joints[i].ferrorCurrent);
            DictAdd(env, jointObj, "ferrorHighMark", joints[i].ferrorHighMark);
            DictAdd(env, jointObj, "output", joints[i].output);
            DictAdd(env, jointObj, "input", joints[i].input);
            DictAdd(env, jointObj, "velocity", joints[i].velocity);
            DictAdd(env, jointObj, "inpos", (bool)joints[i].inpos);
            DictAdd(env, jointObj, "homing", (bool)joints[i].homing);
            DictAdd(env, jointObj, "homed", (bool)joints[i].homed);
            DictAdd(env, jointObj, "fault", (bool)joints[i].fault);
            DictAdd(env, jointObj, "enabled", (bool)joints[i].enabled);
            DictAdd(env, jointObj, "minSoftLimit", (bool)joints[i].minSoftLimit);
            DictAdd(env, jointObj, "maxSoftLimit", (bool)joints[i].maxSoftLimit);
            DictAdd(env, jointObj, "minHardLimit", (bool)joints[i].minHardLimit);
            DictAdd(env, jointObj, "maxHardLimit", (bool)joints[i].maxHardLimit);
            DictAdd(env, jointObj, "overrideLimits", (bool)joints[i].overrideLimits);
            arr.Set(i, jointObj);
        }
        return arr;
    }

    Napi::Array NapiStatChannel::convertAxesToNapi(Napi::Env env, const EMC_AXIS_STAT axes[], int count)
    {
        Napi::Array arr = Napi::Array::New(env, count);
        for (int i = 0; i < count; ++i)
        {
            Napi::Object axisObj = Napi::Object::New(env);
            DictAdd(env, axisObj, "minPositionLimit", axes[i].minPositionLimit);
            DictAdd(env, axisObj, "maxPositionLimit", axes[i].maxPositionLimit);
            DictAdd(env, axisObj, "velocity", axes[i].velocity);
            arr.Set(i, axisObj);
        }
        return arr;
    }

    Napi::Array NapiStatChannel::convertSpindlesToNapi(Napi::Env env, const EMC_SPINDLE_STAT spindles[], int count)
    {
        Napi::Array arr = Napi::Array::New(env, count);
        for (int i = 0; i < count; ++i)
        {
            Napi::Object spindleObj = Napi::Object::New(env);
            DictAdd(env, spindleObj, "speed", spindles[i].speed);
            DictAdd(env, spindleObj, "spindleScale", spindles[i].spindle_scale);
            DictAdd(env, spindleObj, "cssMaximum", spindles[i].css_maximum);
            DictAdd(env, spindleObj, "cssFactor", spindles[i].css_factor);
            DictAdd(env, spindleObj, "direction", spindles[i].direction);
            DictAdd(env, spindleObj, "brake", (bool)(spindles[i].brake != 0));
            DictAdd(env, spindleObj, "increasing", spindles[i].increasing);
            DictAdd(env, spindleObj, "enabled", (bool)(spindles[i].enabled != 0));
            DictAdd(env, spindleObj, "orientState", spindles[i].orient_state);
            DictAdd(env, spindleObj, "orientFault", spindles[i].orient_fault);
            DictAdd(env, spindleObj, "spindleOverrideEnabled", (bool)spindles[i].spindle_override_enabled);
            DictAdd(env, spindleObj, "homed", (bool)spindles[i].homed);
            arr.Set(i, spindleObj);
        }
        return arr;
    }

    Napi::Object NapiStatChannel::convertToolStatToNapi(Napi::Env env, const EMC_TOOL_STAT &tool_stat)
    {
        Napi::Object obj = Napi::Object::New(env);
        DictAdd(env, obj, "pocketPrepped", tool_stat.pocketPrepped);
        DictAdd(env, obj, "toolInSpindle", tool_stat.toolInSpindle);
        DictAdd(env, obj, "toolFromPocket", tool_stat.toolFromPocket);
        // toolTable is handled by a dedicated getter in convertFullStatToNapiObject
        return obj;
    }
    Napi::Object NapiStatChannel::convertCoolantStatToNapi(Napi::Env env, const EMC_COOLANT_STAT &coolant_stat)
    {
        Napi::Object obj = Napi::Object::New(env);
        DictAdd(env, obj, "mist", (bool)coolant_stat.mist);
        DictAdd(env, obj, "flood", (bool)coolant_stat.flood);
        return obj;
    }
    Napi::Object NapiStatChannel::convertAuxStatToNapi(Napi::Env env, const EMC_AUX_STAT &aux_stat)
    {
        Napi::Object obj = Napi::Object::New(env);
        DictAdd(env, obj, "estop", (bool)aux_stat.estop);
        return obj;
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
                // This case might indicate an issue, or just an empty slot.
                // The original Python code prints to stderr for unexpected idx.
                // For now, we'll skip problematic entries.
                // fprintf(stderr, "NapiStatChannel::convertToolTableToNapi: Error getting tool data for index %d\n", i);
                continue;
            }

            Napi::Object toolObj = Napi::Object::New(env);
            DictAdd(env, toolObj, "id", tdata.toolno); // toolno is 'id' in Python struct
            toolObj.Set("offset", EmcPoseToNapiObject(env, tdata.offset));
            DictAdd(env, toolObj, "diameter", tdata.diameter);
            DictAdd(env, toolObj, "frontAngle", tdata.frontangle); // CamelCase
            DictAdd(env, toolObj, "backAngle", tdata.backangle);   // CamelCase
            DictAdd(env, toolObj, "orientation", tdata.orientation);
            // Pocket number and comment are not in this direct toolTable array in EMC_STAT,
            // but are part of full CANON_TOOL_TABLE struct if accessed via toolinfo or more detailed tool data queries.
            // The Python struct sequence `tool_fields` directly takes from `t`.
            // For consistency with your `ToolEntry` type, we can add them if available.
            // Here `tdata.pocketno` is available if tooldata_get populates it fully.
            DictAdd(env, toolObj, "pocketNo", tdata.pocketno);
            DictAddString(env, toolObj, "comment", tdata.comment);

            toolList.Set(js_idx++, toolObj);
        }
        return toolList;
    }

    Napi::Value NapiStatChannel::ToolInfo(const Napi::CallbackInfo &info)
    {
        Napi::Env env = info.Env();
        if (info.Length() < 1 || !info[0].IsNumber())
        {
            Napi::TypeError::New(env, "Tool number (integer) expected").ThrowAsJavaScriptException();
            return env.Null();
        }
        int toolno = info[0].As<Napi::Number>().Int32Value();

        if (!tool_mmap_initialized_)
        {
            Napi::Error::New(env, "Tool mmap not initialized. Call poll() first.").ThrowAsJavaScriptException();
            return env.Null();
        }

        // Mimic Python's tool_0_exception
        if (toolno == 0)
        {
            Napi::Error::New(env, "toolInfo: for tool in spindle, use stat.toolTable[0] or equivalent access").ThrowAsJavaScriptException();
            return env.Null();
        }

        CANON_TOOL_TABLE tdata = tooldata_entry_init();
        int idx = tooldata_find_index_for_tool(toolno);

        if (tooldata_get(&tdata, idx) != IDX_OK)
        {
            Napi::Error::New(env, "toolInfo: No tooldata for toolno=" + std::to_string(toolno)).ThrowAsJavaScriptException();
            return env.Null();
        }

        Napi::Object res = Napi::Object::New(env);
        DictAdd(env, res, "toolNo", tdata.toolno); // "toolno" in python, "toolNo" for camelCase
        DictAdd(env, res, "pocketNo", tdata.pocketno);
        DictAdd(env, res, "diameter", tdata.diameter);
        DictAdd(env, res, "frontAngle", tdata.frontangle);
        DictAdd(env, res, "backAngle", tdata.backangle);
        DictAdd(env, res, "orientation", tdata.orientation);
        // Offsets are part of the EmcPose
        DictAdd(env, res, "xOffset", tdata.offset.tran.x); // Individual offsets for convenience
        DictAdd(env, res, "yOffset", tdata.offset.tran.y);
        DictAdd(env, res, "zOffset", tdata.offset.tran.z);
        DictAdd(env, res, "aOffset", tdata.offset.a);
        DictAdd(env, res, "bOffset", tdata.offset.b);
        DictAdd(env, res, "cOffset", tdata.offset.c);
        DictAdd(env, res, "uOffset", tdata.offset.u);
        DictAdd(env, res, "vOffset", tdata.offset.v);
        DictAdd(env, res, "wOffset", tdata.offset.w);
        res.Set("offset", EmcPoseToNapiObject(env, tdata.offset)); // Full pose object
        DictAddString(env, res, "comment", tdata.comment);

        return res;
    }

} // namespace LinuxCNC