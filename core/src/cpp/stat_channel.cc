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

    Napi::Value NapiStatChannel::Poll(const Napi::CallbackInfo &info)
    {
        Napi::Env env = info.Env();
        if (!s_channel_ || !s_channel_->valid())
        {
            // Attempt to reconnect or throw error
            if (!connect())
            {
                Napi::Error::New(env, "Stat channel not connected and failed to reconnect.").ThrowAsJavaScriptException();
                return env.Null();
            }
        }

        bool updated = pollInternal();
        return Napi::Boolean::New(env, updated);
    }

    Napi::Value NapiStatChannel::GetCurrentFullStat(const Napi::CallbackInfo &info)
    {
        Napi::Env env = info.Env();
        if (!s_channel_ || !s_channel_->valid())
        { // Ensure we are connected
            Napi::Error::New(env, "Stat channel not connected.").ThrowAsJavaScriptException();
            return env.Null();
        }
        return convertFullStatToNapiObject(env, status_);
    }

    Napi::Object NapiStatChannel::convertFullStatToNapiObject(Napi::Env env, const EMC_STAT &stat_to_convert)
    {
        Napi::Object obj = Napi::Object::New(env);

        obj.Set("echoSerialNumber", Napi::Number::New(env, stat_to_convert.echo_serial_number));
        obj.Set("state", Napi::Number::New(env, static_cast<int>(stat_to_convert.status))); // RCS_STATUS

        obj.Set("task", convertTaskStatToNapi(env, stat_to_convert.task));
        obj.Set("motion", convertMotionStatToNapi(env, stat_to_convert.motion));
        obj.Set("io", convertIoStatToNapi(env, stat_to_convert.io));
        obj.Set("debug", Napi::Number::New(env, stat_to_convert.debug));

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
        DictAdd(env, obj, "rotationXY", task_stat.rotation_xy);
        obj.Set("toolOffset", EmcPoseToNapiObject(env, task_stat.toolOffset));

        Napi::Object activeGCodesObj = Napi::Object::New(env);
        DictAdd(env, activeGCodesObj, "motionMode", task_stat.activeGCodes[1]);       // G0, G1, G2, G3, G38.2, G80, G81, G82, G83, G84, G85, G86, G87, G88, G89
        DictAdd(env, activeGCodesObj, "gMode0", task_stat.activeGCodes[2]);           // G4, G10, G28, G30, G53, G92, G92.1, G92.2, G92.3
        DictAdd(env, activeGCodesObj, "plane", task_stat.activeGCodes[3]);            // G17, G18, G19
        DictAdd(env, activeGCodesObj, "cutterComp", task_stat.activeGCodes[4]);       // G40, G41, G42
        DictAdd(env, activeGCodesObj, "units", task_stat.activeGCodes[5]);            // G20, G21
        DictAdd(env, activeGCodesObj, "distanceMode", task_stat.activeGCodes[6]);     // G90, G91
        DictAdd(env, activeGCodesObj, "feedRateMode", task_stat.activeGCodes[7]);     // G93, G94, G95
        DictAdd(env, activeGCodesObj, "origin", task_stat.activeGCodes[8]);           // G54-G59.3
        DictAdd(env, activeGCodesObj, "toolLengthOffset", task_stat.activeGCodes[9]); // G43, G49
        DictAdd(env, activeGCodesObj, "retractMode", task_stat.activeGCodes[10]);     // G98, G99
        DictAdd(env, activeGCodesObj, "pathControl", task_stat.activeGCodes[11]);     // G61, G61.1, G64
        // skip index 12 as it is reserved/empty
        DictAdd(env, activeGCodesObj, "spindleSpeedMode", task_stat.activeGCodes[13]);  // G96, G97
        DictAdd(env, activeGCodesObj, "ijkDistanceMode", task_stat.activeGCodes[14]);   // G90.1, G91.1
        DictAdd(env, activeGCodesObj, "latheDiameterMode", task_stat.activeGCodes[15]); // G7, G8
        DictAdd(env, activeGCodesObj, "g92Applied", task_stat.activeGCodes[16]);        // G92.2, G92.3
        obj.Set("activeGCodes", activeGCodesObj);

        Napi::Object activeMCodesObj = Napi::Object::New(env);
        DictAdd(env, activeMCodesObj, "stopping", task_stat.activeMCodes[1]);            // M0, M1, M2, M30, M60
        DictAdd(env, activeMCodesObj, "spindleControl", task_stat.activeMCodes[2]);      // M3, M4, M5
        DictAdd(env, activeMCodesObj, "toolChange", task_stat.activeMCodes[3]);          // M6
        DictAdd(env, activeMCodesObj, "mistCoolant", task_stat.activeMCodes[4]);         // M7, M9
        DictAdd(env, activeMCodesObj, "floodCoolant", task_stat.activeMCodes[5]);        // M8, M9
        DictAdd(env, activeMCodesObj, "overrideControl", task_stat.activeMCodes[6]);     // M48, M49, M50, M51
        DictAdd(env, activeMCodesObj, "adaptiveFeedControl", task_stat.activeMCodes[7]); // M52
        DictAdd(env, activeMCodesObj, "feedHoldControl", task_stat.activeMCodes[8]);     // M53
        obj.Set("activeMCodes", activeMCodesObj);

        Napi::Object activeSettingsObj = Napi::Object::New(env);
        DictAdd(env, activeSettingsObj, "feedRate", task_stat.activeSettings[1]);
        DictAdd(env, activeSettingsObj, "speed", task_stat.activeSettings[2]);
        DictAdd(env, activeSettingsObj, "blendTolerance", task_stat.activeSettings[3]);
        DictAdd(env, activeSettingsObj, "naiveCAMTolerance", task_stat.activeSettings[4]);
        obj.Set("activeSettings", activeSettingsObj);

        DictAdd(env, obj, "programUnits", static_cast<int>(task_stat.programUnits));
        DictAdd(env, obj, "delayLeft", task_stat.delayLeft);
        DictAdd(env, obj, "taskPaused", (bool)task_stat.task_paused);
        DictAdd(env, obj, "interpreterErrorCode", task_stat.interpreter_errcode);

        // not in original python library but added as it might be useful
        DictAdd(env, obj, "queuedMdiCommands", task_stat.queuedMDIcommands);
        return obj;
    }

    Napi::Object NapiStatChannel::convertMotionStatToNapi(Napi::Env env, const EMC_MOTION_STAT &motion_stat)
    {
        Napi::Object obj = Napi::Object::New(env);
        obj.Set("traj", convertTrajStatToNapi(env, motion_stat.traj));
        obj.Set("joint", convertJointsToNapi(env, motion_stat.joint, EMCMOT_MAX_JOINTS));
        obj.Set("axis", convertAxesToNapi(env, motion_stat.axis, EMCMOT_MAX_AXIS));
        obj.Set("spindle", convertSpindlesToNapi(env, motion_stat.spindle, EMCMOT_MAX_SPINDLES));
        obj.Set("digitalInput", IntArrayToNapiArray(env, motion_stat.synch_di, EMCMOT_MAX_DIO));
        obj.Set("digitalOutput", IntArrayToNapiArray(env, motion_stat.synch_do, EMCMOT_MAX_DIO));
        obj.Set("analogInput", DoubleArrayToNapiArray(env, motion_stat.analog_input, EMCMOT_MAX_AIO));
        obj.Set("analogOutput", DoubleArrayToNapiArray(env, motion_stat.analog_output, EMCMOT_MAX_AIO));
        // ... other motion_stat fields if needed
        return obj;
    }

    Napi::Object NapiStatChannel::convertIoStatToNapi(Napi::Env env, const EMC_IO_STAT &io_stat)
    {
        Napi::Object obj = Napi::Object::New(env);
        obj.Set("tool", convertToolStatToNapi(env, io_stat.tool));
        obj.Set("coolant", convertCoolantStatToNapi(env, io_stat.coolant));

        DictAdd(env, obj, "estop", (bool)io_stat.aux.estop);
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

        // Convert axis mask to array of available axis letters
        Napi::Array axisArray = Napi::Array::New(env);
        uint32_t axisMask = traj_stat.axis_mask;
        uint32_t arrayIndex = 0;

        if (axisMask & 1)
            axisArray.Set(arrayIndex++, Napi::String::New(env, "X")); // X=1
        if (axisMask & 2)
            axisArray.Set(arrayIndex++, Napi::String::New(env, "Y")); // Y=2
        if (axisMask & 4)
            axisArray.Set(arrayIndex++, Napi::String::New(env, "Z")); // Z=4
        if (axisMask & 8)
            axisArray.Set(arrayIndex++, Napi::String::New(env, "A")); // A=8
        if (axisMask & 16)
            axisArray.Set(arrayIndex++, Napi::String::New(env, "B")); // B=16
        if (axisMask & 32)
            axisArray.Set(arrayIndex++, Napi::String::New(env, "C")); // C=32
        if (axisMask & 64)
            axisArray.Set(arrayIndex++, Napi::String::New(env, "U")); // U=64
        if (axisMask & 128)
            axisArray.Set(arrayIndex++, Napi::String::New(env, "V")); // V=128
        if (axisMask & 256)
            axisArray.Set(arrayIndex++, Napi::String::New(env, "W")); // W=256

        obj.Set("availableAxes", axisArray);

        DictAdd(env, obj, "mode", static_cast<int>(traj_stat.mode));
        DictAdd(env, obj, "enabled", (bool)traj_stat.enabled);
        DictAdd(env, obj, "inPosition", (bool)traj_stat.inpos);
        DictAdd(env, obj, "queue", traj_stat.queue);
        DictAdd(env, obj, "activeQueue", traj_stat.activeQueue);
        DictAdd(env, obj, "queueFull", (bool)traj_stat.queueFull);
        DictAdd(env, obj, "id", traj_stat.id);
        DictAdd(env, obj, "paused", (bool)traj_stat.paused);
        DictAdd(env, obj, "feedRateOverride", traj_stat.scale);
        DictAdd(env, obj, "rapidRateOverride", traj_stat.rapid_scale);
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
            DictAdd(env, jointObj, "inPosition", (bool)joints[i].inpos);
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
            DictAdd(env, spindleObj, "override", spindles[i].spindle_scale);
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
        return obj;
    }
    Napi::Object NapiStatChannel::convertCoolantStatToNapi(Napi::Env env, const EMC_COOLANT_STAT &coolant_stat)
    {
        Napi::Object obj = Napi::Object::New(env);
        DictAdd(env, obj, "mist", (bool)coolant_stat.mist);
        DictAdd(env, obj, "flood", (bool)coolant_stat.flood);
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
            toolObj.Set("offset", EmcPoseToNapiObject(env, tdata.offset));
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
            Napi::Error::New(env, "toolInfo: No tooldata for toolNo=" + std::to_string(toolno)).ThrowAsJavaScriptException();
            return env.Null();
        }

        Napi::Object res = Napi::Object::New(env);
        DictAdd(env, res, "toolNo", tdata.toolno);
        DictAdd(env, res, "pocketNo", tdata.pocketno);
        DictAdd(env, res, "diameter", tdata.diameter);
        DictAdd(env, res, "frontAngle", tdata.frontangle);
        DictAdd(env, res, "backAngle", tdata.backangle);
        DictAdd(env, res, "orientation", tdata.orientation);
        res.Set("offset", EmcPoseToNapiObject(env, tdata.offset));
        DictAddString(env, res, "comment", tdata.comment);

        return res;
    }

    Napi::Value NapiStatChannel::Disconnect(const Napi::CallbackInfo &info)
    {
        Napi::Env env = info.Env();
        disconnect();
        return env.Undefined();
    }

}