#include "command_channel.hh"
#include "common.hh"
#include <cstring>
#include <algorithm>
#include <unistd.h>
#include "cms.hh"

#define EMC_COMMAND_TIMEOUT_DEFAULT 5.0
#define EMC_COMMAND_DELAY_DEFAULT 0.01

namespace LinuxCNC
{

    Napi::FunctionReference NapiCommandChannel::constructor;

    Napi::Object NapiCommandChannel::Init(Napi::Env env, Napi::Object exports)
    {
        Napi::HandleScope scope(env);
        Napi::Function func = DefineClass(env, "NativeCommandChannel", {
                                                                           // Task
                                                                           InstanceMethod("setMode", &NapiCommandChannel::SetMode),
                                                                           InstanceMethod("setState", &NapiCommandChannel::SetState),
                                                                           InstanceMethod("taskPlanSynch", &NapiCommandChannel::TaskPlanSynch),
                                                                           InstanceMethod("resetInterpreter", &NapiCommandChannel::ResetInterpreter),
                                                                           InstanceMethod("programOpen", &NapiCommandChannel::ProgramOpen),
                                                                           InstanceMethod("runProgram", &NapiCommandChannel::RunProgram),
                                                                           InstanceMethod("pauseProgram", &NapiCommandChannel::PauseProgram),
                                                                           InstanceMethod("resumeProgram", &NapiCommandChannel::ResumeProgram),
                                                                           InstanceMethod("stepProgram", &NapiCommandChannel::StepProgram),
                                                                           InstanceMethod("reverseProgram", &NapiCommandChannel::ReverseProgram),
                                                                           InstanceMethod("forwardProgram", &NapiCommandChannel::ForwardProgram),
                                                                           InstanceMethod("abortTask", &NapiCommandChannel::AbortTask),
                                                                           InstanceMethod("setOptionalStop", &NapiCommandChannel::SetOptionalStop),
                                                                           InstanceMethod("setBlockDelete", &NapiCommandChannel::SetBlockDelete),
                                                                           InstanceMethod("mdi", &NapiCommandChannel::Mdi),
                                                                           // Trajectory
                                                                           InstanceMethod("setTrajMode", &NapiCommandChannel::SetTrajMode),
                                                                           InstanceMethod("setMaxVelocity", &NapiCommandChannel::SetMaxVelocity),
                                                                           InstanceMethod("setFeedRate", &NapiCommandChannel::SetFeedRate),
                                                                           InstanceMethod("setRapidRate", &NapiCommandChannel::SetRapidRate),
                                                                           InstanceMethod("setSpindleOverride", &NapiCommandChannel::SetSpindleOverride),
                                                                           InstanceMethod("overrideLimits", &NapiCommandChannel::OverrideLimits),
                                                                           InstanceMethod("teleopEnable", &NapiCommandChannel::TeleopEnable),
                                                                           InstanceMethod("setFeedOverrideEnable", &NapiCommandChannel::SetFeedOverrideEnable),
                                                                           InstanceMethod("setSpindleOverrideEnable", &NapiCommandChannel::SetSpindleOverrideEnable),
                                                                           InstanceMethod("setFeedHoldEnable", &NapiCommandChannel::SetFeedHoldEnable),
                                                                           InstanceMethod("setAdaptiveFeedEnable", &NapiCommandChannel::SetAdaptiveFeedEnable),
                                                                           // Joint
                                                                           InstanceMethod("homeJoint", &NapiCommandChannel::HomeJoint),
                                                                           InstanceMethod("unhomeJoint", &NapiCommandChannel::UnhomeJoint),
                                                                           InstanceMethod("jogStop", &NapiCommandChannel::JogStop),
                                                                           InstanceMethod("jogContinuous", &NapiCommandChannel::JogContinuous),
                                                                           InstanceMethod("jogIncrement", &NapiCommandChannel::JogIncrement),
                                                                           InstanceMethod("setMinPositionLimit", &NapiCommandChannel::SetMinPositionLimit),
                                                                           InstanceMethod("setMaxPositionLimit", &NapiCommandChannel::SetMaxPositionLimit),
                                                                           // Spindle
                                                                           InstanceMethod("spindleOn", &NapiCommandChannel::SpindleOn),
                                                                           InstanceMethod("spindleIncrease", &NapiCommandChannel::SpindleIncrease),
                                                                           InstanceMethod("spindleDecrease", &NapiCommandChannel::SpindleDecrease),
                                                                           InstanceMethod("spindleConstant", &NapiCommandChannel::SpindleConstant),
                                                                           InstanceMethod("spindleOff", &NapiCommandChannel::SpindleOff),
                                                                           InstanceMethod("spindleBrake", &NapiCommandChannel::SpindleBrake),
                                                                           // Coolant
                                                                           InstanceMethod("setMist", &NapiCommandChannel::SetMist),
                                                                           InstanceMethod("setFlood", &NapiCommandChannel::SetFlood),
                                                                           // Tool
                                                                           InstanceMethod("loadToolTable", &NapiCommandChannel::LoadToolTable),
                                                                           InstanceMethod("setToolOffset", &NapiCommandChannel::SetToolOffset),
                                                                           // IO
                                                                           InstanceMethod("setDigitalOutput", &NapiCommandChannel::SetDigitalOutput),
                                                                           InstanceMethod("setAnalogOutput", &NapiCommandChannel::SetAnalogOutput),
                                                                           // Debug & Msg
                                                                           InstanceMethod("setDebugLevel", &NapiCommandChannel::SetDebugLevel),
                                                                           InstanceMethod("sendOperatorError", &NapiCommandChannel::SendOperatorError),
                                                                           InstanceMethod("sendOperatorText", &NapiCommandChannel::SendOperatorText),
                                                                           InstanceMethod("sendOperatorDisplay", &NapiCommandChannel::SendOperatorDisplay),
                                                                           // Misc
                                                                           InstanceMethod("waitComplete", &NapiCommandChannel::WaitComplete),
                                                                           InstanceAccessor("serial", &NapiCommandChannel::GetSerial, nullptr),
                                                                       });
        constructor = Napi::Persistent(func);
        constructor.SuppressDestruct();
        exports.Set("NativeCommandChannel", func);
        return exports;
    }

    NapiCommandChannel::NapiCommandChannel(const Napi::CallbackInfo &info) : Napi::ObjectWrap<NapiCommandChannel>(info)
    {
        Napi::Env env = info.Env();
        if (!connect())
        {
            Napi::Error::New(env, "Failed to connect to LinuxCNC command/status channels").ThrowAsJavaScriptException();
        }
    }

    NapiCommandChannel::~NapiCommandChannel()
    {
        disconnect();
    }

    bool NapiCommandChannel::connect()
    {
        if (c_channel_ && s_channel_)
            return true;

        const char *nml_file = GetNmlFileCStr();
        c_channel_ = new RCS_CMD_CHANNEL(emcFormat, "emcCommand", "xemc", nml_file);
        if (!c_channel_ || !c_channel_->valid())
        {
            delete c_channel_;
            c_channel_ = nullptr;
            return false;
        }
        s_channel_ = new RCS_STAT_CHANNEL(emcFormat, "emcStatus", "xemc", nml_file);
        if (!s_channel_ || !s_channel_->valid())
        {
            delete c_channel_;
            c_channel_ = nullptr;
            delete s_channel_;
            s_channel_ = nullptr;
            return false;
        }
        return true;
    }

    void NapiCommandChannel::disconnect()
    {
        delete c_channel_;
        c_channel_ = nullptr;
        delete s_channel_;
        s_channel_ = nullptr;
    }

    RCS_STATUS NapiCommandChannel::waitCommandComplete(double timeout)
    {
        double start = etime();
        do
        {
            double now = etime();
            if (s_channel_->peek() == EMC_STAT_TYPE)
            {
                EMC_STAT *stat = static_cast<EMC_STAT *>(s_channel_->get_address());
                if (stat)
                {
                    int serial_diff = stat->echo_serial_number - last_serial_;
                    if (serial_diff > 0)
                    {
                        return RCS_STATUS::DONE; // Command processed by LCNC
                    }
                    if (serial_diff == 0 && (stat->status == RCS_STATUS::DONE || stat->status == RCS_STATUS::ERROR))
                    {
                        return stat->status; // Final status from LCNC for this command
                    }
                }
            }
            // Use LinuxCNC's esleep for portability within its ecosystem
            esleep(std::min(timeout - (now - start), EMC_COMMAND_DELAY_DEFAULT));
        } while (etime() - start < timeout);
        return RCS_STATUS::UNINITIALIZED; // Timeout
    }

    Napi::Value NapiCommandChannel::sendCommandAndWait(const Napi::CallbackInfo &info, RCS_CMD_MSG &cmd_msg, double timeout)
    {
        Napi::Env env = info.Env();
        if (!c_channel_ || !s_channel_ || !c_channel_->valid() || !s_channel_->valid())
        {
            if (!connect())
            { // Attempt to reconnect
                Napi::Error::New(env, "Command channel not connected.").ThrowAsJavaScriptException();
                return env.Null();
            }
        }

        if (c_channel_->write(&cmd_msg))
        {
            Napi::Error::New(env, "Failed to write command to NML channel.").ThrowAsJavaScriptException();
            return env.Null();
        }
        last_serial_ = cmd_msg.serial_number;

        RCS_STATUS status = waitCommandComplete(timeout);
        return Napi::Number::New(env, static_cast<int>(status));
    }

    Napi::Value NapiCommandChannel::SetMode(const Napi::CallbackInfo &info)
    {
        Napi::Env env = info.Env();
        if (info.Length() < 1 || !info[0].IsNumber())
        {
            Napi::TypeError::New(env, "Mode (number) expected").ThrowAsJavaScriptException();
            return env.Null();
        }
        EMC_TASK_SET_MODE msg;
        msg.mode = static_cast<EMC_TASK_MODE>(info[0].As<Napi::Number>().Int32Value());

        // Basic validation
        switch (msg.mode)
        {
        case EMC_TASK_MODE::MDI:
        case EMC_TASK_MODE::MANUAL:
        case EMC_TASK_MODE::AUTO:
            break;
        default:
            Napi::Error::New(env, "Invalid mode value").ThrowAsJavaScriptException();
            return env.Null();
        }
        return sendCommandAndWait(info, msg);
    }

    Napi::Value NapiCommandChannel::SetState(const Napi::CallbackInfo &info)
    {
        Napi::Env env = info.Env();
        if (info.Length() < 1 || !info[0].IsNumber())
        {
            Napi::TypeError::New(env, "State (number) expected").ThrowAsJavaScriptException();
            return env.Null();
        }
        EMC_TASK_SET_STATE msg;
        msg.state = static_cast<EMC_TASK_STATE>(info[0].As<Napi::Number>().Int32Value());
        switch (msg.state)
        {
        case EMC_TASK_STATE::ESTOP:
        case EMC_TASK_STATE::ESTOP_RESET:
        case EMC_TASK_STATE::ON:
        case EMC_TASK_STATE::OFF:
            break;
        default:
            Napi::Error::New(env, "Invalid state value").ThrowAsJavaScriptException();
            return env.Null();
        }
        return sendCommandAndWait(info, msg);
    }

    Napi::Value NapiCommandChannel::TaskPlanSynch(const Napi::CallbackInfo &info)
    {
        EMC_TASK_PLAN_SYNCH msg;
        return sendCommandAndWait(info, msg);
    }
    Napi::Value NapiCommandChannel::ResetInterpreter(const Napi::CallbackInfo &info)
    {
        EMC_TASK_PLAN_INIT msg;
        return sendCommandAndWait(info, msg);
    }

    Napi::Value NapiCommandChannel::ProgramOpen(const Napi::CallbackInfo &info)
    {
        Napi::Env env = info.Env();
        if (info.Length() < 1 || !info[0].IsString())
        {
            Napi::TypeError::New(env, "File path (string) expected for programOpen").ThrowAsJavaScriptException();
            return env.Null();
        }
        std::string file_path_str = info[0].As<Napi::String>().Utf8Value();

        EMC_TASK_PLAN_CLOSE close_msg;
        Napi::Value close_status_val = sendCommandAndWait(info, close_msg);
        // Check close_status_val if needed, but original python code doesn't explicitly check it before open

        EMC_TASK_PLAN_OPEN open_msg;
        if (file_path_str.length() >= sizeof(open_msg.file))
        {
            Napi::Error::New(env, "File path too long").ThrowAsJavaScriptException();
            return env.Null();
        }
        strncpy(open_msg.file, file_path_str.c_str(), sizeof(open_msg.file) - 1);
        open_msg.file[sizeof(open_msg.file) - 1] = '\0';

        open_msg.remote_buffersize = 0;
        open_msg.remote_filesize = 0;

        // Handle remote file transfer if necessary (complex, as discussed)
        if (s_channel_ && s_channel_->cms &&
            s_channel_->cms->ProcessType == CMS_REMOTE_TYPE &&
            strcmp(s_channel_->cms->ProcessName, "emc") != 0)
        {

            FILE *fd = fopen(file_path_str.c_str(), "rb");
            if (!fd)
            {
                Napi::Error::New(env, "Failed to open file: " + file_path_str + " (" + strerror(errno) + ")").ThrowAsJavaScriptException();
                return env.Null();
            }

            fseek(fd, 0, SEEK_END);
            long filesize = ftell(fd);
            fseek(fd, 0, SEEK_SET);
            if (filesize < 0)
            {
                fclose(fd);
                Napi::Error::New(env, "Failed to get file size: " + file_path_str).ThrowAsJavaScriptException();
                return env.Null();
            }
            open_msg.remote_filesize = filesize;

            size_t bytes_read_total = 0;
            RCS_STATUS last_chunk_status = RCS_STATUS::UNINITIALIZED;

            while (bytes_read_total < (size_t)filesize)
            {
                size_t bytes_to_read = sizeof(open_msg.remote_buffer);
                if (bytes_read_total + bytes_to_read > (size_t)filesize)
                {
                    bytes_to_read = filesize - bytes_read_total;
                }

                size_t actually_read = fread(open_msg.remote_buffer, 1, bytes_to_read, fd);
                if (actually_read == 0 && ferror(fd))
                {
                    fclose(fd);
                    Napi::Error::New(env, "Error reading file: " + file_path_str).ThrowAsJavaScriptException();
                    return env.Null();
                }
                if (actually_read == 0 && feof(fd) && bytes_read_total < (size_t)filesize)
                {
                    fclose(fd);
                    Napi::Error::New(env, "Premature EOF reading file: " + file_path_str).ThrowAsJavaScriptException();
                    return env.Null();
                }

                open_msg.remote_buffersize = actually_read;
                Napi::Value status_val = sendCommandAndWait(info, open_msg, 10.0); // Longer timeout for file transfer

                if (!status_val.IsNumber())
                {
                    fclose(fd);
                    Napi::Error::New(env, "Error sending file chunk (non-numeric status) for: " + file_path_str).ThrowAsJavaScriptException();
                    return env.Null();
                }
                last_chunk_status = static_cast<RCS_STATUS>(status_val.As<Napi::Number>().Int32Value());
                if (last_chunk_status != RCS_STATUS::DONE)
                {
                    fclose(fd);
                    Napi::Error::New(env, "Error sending file chunk (status not DONE) for: " + file_path_str).ThrowAsJavaScriptException();
                    return env.Null();
                }
                bytes_read_total += actually_read;
            }
            fclose(fd);
            return Napi::Number::New(env, static_cast<int>(last_chunk_status)); // Status of the last chunk send
        }
        else
        {
            // Local case
            return sendCommandAndWait(info, open_msg);
        }
    }

    Napi::Value NapiCommandChannel::RunProgram(const Napi::CallbackInfo &info)
    {
        Napi::Env env = info.Env();
        EMC_TASK_PLAN_RUN msg;
        msg.line = 0; // Default: start from beginning
        if (info.Length() > 0 && info[0].IsNumber())
        {
            msg.line = info[0].As<Napi::Number>().Int32Value();
        }
        return sendCommandAndWait(info, msg);
    }

    Napi::Value NapiCommandChannel::PauseProgram(const Napi::CallbackInfo &info)
    {
        EMC_TASK_PLAN_PAUSE msg;
        return sendCommandAndWait(info, msg);
    }
    Napi::Value NapiCommandChannel::ResumeProgram(const Napi::CallbackInfo &info)
    {
        EMC_TASK_PLAN_RESUME msg;
        return sendCommandAndWait(info, msg);
    }
    Napi::Value NapiCommandChannel::StepProgram(const Napi::CallbackInfo &info)
    {
        EMC_TASK_PLAN_STEP msg;
        return sendCommandAndWait(info, msg);
    }
    Napi::Value NapiCommandChannel::ReverseProgram(const Napi::CallbackInfo &info)
    {
        EMC_TASK_PLAN_REVERSE msg;
        return sendCommandAndWait(info, msg);
    }
    Napi::Value NapiCommandChannel::ForwardProgram(const Napi::CallbackInfo &info)
    {
        EMC_TASK_PLAN_FORWARD msg;
        return sendCommandAndWait(info, msg);
    }
    Napi::Value NapiCommandChannel::AbortTask(const Napi::CallbackInfo &info)
    {
        EMC_TASK_ABORT msg;
        return sendCommandAndWait(info, msg);
    }
    Napi::Value NapiCommandChannel::SetOptionalStop(const Napi::CallbackInfo &info)
    {
        Napi::Env env = info.Env();
        if (info.Length() < 1 || !info[0].IsBoolean())
        {
            Napi::TypeError::New(env, "Enable (boolean) expected").ThrowAsJavaScriptException();
            return env.Null();
        }
        EMC_TASK_PLAN_SET_OPTIONAL_STOP msg;
        msg.state = info[0].As<Napi::Boolean>().Value();
        return sendCommandAndWait(info, msg);
    }
    Napi::Value NapiCommandChannel::SetBlockDelete(const Napi::CallbackInfo &info)
    {
        Napi::Env env = info.Env();
        if (info.Length() < 1 || !info[0].IsBoolean())
        {
            Napi::TypeError::New(env, "Enable (boolean) expected").ThrowAsJavaScriptException();
            return env.Null();
        }
        EMC_TASK_PLAN_SET_BLOCK_DELETE msg;
        msg.state = info[0].As<Napi::Boolean>().Value();
        return sendCommandAndWait(info, msg);
    }

    Napi::Value NapiCommandChannel::Mdi(const Napi::CallbackInfo &info)
    {
        Napi::Env env = info.Env();
        if (info.Length() < 1 || !info[0].IsString())
        {
            Napi::TypeError::New(env, "MDI command (string) expected").ThrowAsJavaScriptException();
            return env.Null();
        }
        std::string cmd_str = info[0].As<Napi::String>().Utf8Value();
        if (cmd_str.length() >= sizeof(EMC_TASK_PLAN_EXECUTE::command))
        {
            Napi::Error::New(env, "MDI command too long").ThrowAsJavaScriptException();
            return env.Null();
        }

        EMC_TASK_PLAN_EXECUTE msg;
        strncpy(msg.command, cmd_str.c_str(), sizeof(msg.command) - 1);
        msg.command[sizeof(msg.command) - 1] = '\0';

        return sendCommandAndWait(info, msg);
    }

    // Trajectory Commands
    Napi::Value NapiCommandChannel::SetTrajMode(const Napi::CallbackInfo &info)
    {
        Napi::Env env = info.Env();
        if (info.Length() < 1 || !info[0].IsNumber())
        {
            Napi::TypeError::New(env, "Mode (number) expected").ThrowAsJavaScriptException();
            return env.Null();
        }
        EMC_TRAJ_SET_MODE msg;
        msg.mode = static_cast<EMC_TRAJ_MODE>(info[0].As<Napi::Number>().Int32Value());
        return sendCommandAndWait(info, msg);
    }
    Napi::Value NapiCommandChannel::SetMaxVelocity(const Napi::CallbackInfo &info)
    {
        Napi::Env env = info.Env();
        if (info.Length() < 1 || !info[0].IsNumber())
        {
            Napi::TypeError::New(env, "Velocity (number) expected").ThrowAsJavaScriptException();
            return env.Null();
        }
        EMC_TRAJ_SET_MAX_VELOCITY msg;
        msg.velocity = info[0].As<Napi::Number>().DoubleValue();
        return sendCommandAndWait(info, msg);
    }
    Napi::Value NapiCommandChannel::SetFeedRate(const Napi::CallbackInfo &info)
    {
        Napi::Env env = info.Env();
        if (info.Length() < 1 || !info[0].IsNumber())
        {
            Napi::TypeError::New(env, "Scale (number) expected").ThrowAsJavaScriptException();
            return env.Null();
        }
        EMC_TRAJ_SET_SCALE msg;
        msg.scale = info[0].As<Napi::Number>().DoubleValue();
        if (msg.scale < 0)
            msg.scale = 0; // Or throw error for invalid scale
        return sendCommandAndWait(info, msg);
    }
    Napi::Value NapiCommandChannel::SetRapidRate(const Napi::CallbackInfo &info)
    {
        Napi::Env env = info.Env();
        if (info.Length() < 1 || !info[0].IsNumber())
        {
            Napi::TypeError::New(env, "Scale (number) expected").ThrowAsJavaScriptException();
            return env.Null();
        }
        EMC_TRAJ_SET_RAPID_SCALE msg;
        msg.scale = info[0].As<Napi::Number>().DoubleValue();
        if (msg.scale < 0)
            msg.scale = 0;
        return sendCommandAndWait(info, msg);
    }
    Napi::Value NapiCommandChannel::SetSpindleOverride(const Napi::CallbackInfo &info)
    {
        Napi::Env env = info.Env();
        if (info.Length() < 1 || !info[0].IsNumber())
        {
            Napi::TypeError::New(env, "Scale (number) expected").ThrowAsJavaScriptException();
            return env.Null();
        }
        EMC_TRAJ_SET_SPINDLE_SCALE msg;
        msg.scale = info[0].As<Napi::Number>().DoubleValue();
        if (msg.scale < 0)
            msg.scale = 0;
        msg.spindle = 0; // Default spindle 0
        if (info.Length() > 1 && info[1].IsNumber())
        {
            msg.spindle = info[1].As<Napi::Number>().Int32Value();
        }
        return sendCommandAndWait(info, msg);
    }
    Napi::Value NapiCommandChannel::OverrideLimits(const Napi::CallbackInfo &info)
    {
        EMC_JOINT_OVERRIDE_LIMITS msg; // This is a JOINT command, not TRAJ
        msg.joint = 0;                 // Affects all joints (as per python binding)
        return sendCommandAndWait(info, msg);
    }
    Napi::Value NapiCommandChannel::TeleopEnable(const Napi::CallbackInfo &info)
    {
        Napi::Env env = info.Env();
        if (info.Length() < 1 || !info[0].IsBoolean())
        {
            Napi::TypeError::New(env, "Enable (boolean) expected").ThrowAsJavaScriptException();
            return env.Null();
        }
        EMC_TRAJ_SET_TELEOP_ENABLE msg;
        msg.enable = info[0].As<Napi::Boolean>().Value() ? 1 : 0;
        return sendCommandAndWait(info, msg);
    }

    Napi::Value NapiCommandChannel::SetFeedOverrideEnable(const Napi::CallbackInfo &info)
    {
        Napi::Env env = info.Env();
        if (info.Length() < 1 || !info[0].IsBoolean())
        {
            Napi::TypeError::New(env, "Enable (boolean) expected").ThrowAsJavaScriptException();
            return env.Null();
        }
        EMC_TRAJ_SET_FO_ENABLE msg;
        msg.mode = info[0].As<Napi::Boolean>().Value() ? 1 : 0; // 1 for enable in struct
        return sendCommandAndWait(info, msg);
    }
    Napi::Value NapiCommandChannel::SetSpindleOverrideEnable(const Napi::CallbackInfo &info)
    {
        Napi::Env env = info.Env();
        if (info.Length() < 1 || !info[0].IsBoolean())
        {
            Napi::TypeError::New(env, "Enable (boolean) expected").ThrowAsJavaScriptException();
            return env.Null();
        }
        EMC_TRAJ_SET_SO_ENABLE msg;
        msg.mode = info[0].As<Napi::Boolean>().Value() ? 1 : 0;
        msg.spindle = 0; // Default spindle 0
        if (info.Length() > 1 && info[1].IsNumber())
        {
            msg.spindle = info[1].As<Napi::Number>().Int32Value();
        }
        return sendCommandAndWait(info, msg);
    }
    Napi::Value NapiCommandChannel::SetFeedHoldEnable(const Napi::CallbackInfo &info)
    {
        Napi::Env env = info.Env();
        if (info.Length() < 1 || !info[0].IsBoolean())
        {
            Napi::TypeError::New(env, "Enable (boolean) expected").ThrowAsJavaScriptException();
            return env.Null();
        }
        EMC_TRAJ_SET_FH_ENABLE msg;
        msg.mode = info[0].As<Napi::Boolean>().Value() ? 1 : 0;
        return sendCommandAndWait(info, msg);
    }
    Napi::Value NapiCommandChannel::SetAdaptiveFeedEnable(const Napi::CallbackInfo &info)
    {
        Napi::Env env = info.Env();
        if (info.Length() < 1 || !info[0].IsBoolean())
        {
            Napi::TypeError::New(env, "Enable (boolean) expected").ThrowAsJavaScriptException();
            return env.Null();
        }
        EMC_MOTION_ADAPTIVE msg; // This is a MOTION command
        msg.status = info[0].As<Napi::Boolean>().Value() ? 1 : 0;
        return sendCommandAndWait(info, msg);
    }

    // Joint Commands
    Napi::Value NapiCommandChannel::HomeJoint(const Napi::CallbackInfo &info)
    {
        Napi::Env env = info.Env();
        if (info.Length() < 1 || !info[0].IsNumber())
        {
            Napi::TypeError::New(env, "Joint index (number) expected").ThrowAsJavaScriptException();
            return env.Null();
        }
        EMC_JOINT_HOME msg;
        msg.joint = info[0].As<Napi::Number>().Int32Value();
        return sendCommandAndWait(info, msg);
    }
    Napi::Value NapiCommandChannel::UnhomeJoint(const Napi::CallbackInfo &info)
    {
        Napi::Env env = info.Env();
        if (info.Length() < 1 || !info[0].IsNumber())
        {
            Napi::TypeError::New(env, "Joint index (number) expected").ThrowAsJavaScriptException();
            return env.Null();
        }
        EMC_JOINT_UNHOME msg;
        msg.joint = info[0].As<Napi::Number>().Int32Value();
        return sendCommandAndWait(info, msg);
    }
    Napi::Value NapiCommandChannel::JogStop(const Napi::CallbackInfo &info)
    {
        Napi::Env env = info.Env();
        if (info.Length() < 2 || !info[0].IsNumber() || !info[1].IsBoolean())
        {
            Napi::TypeError::New(env, "JogStop(axisOrJointIndex, isJointJog) expected").ThrowAsJavaScriptException();
            return env.Null();
        }
        EMC_JOG_STOP msg;
        msg.joint_or_axis = info[0].As<Napi::Number>().Int32Value();
        msg.jjogmode = info[1].As<Napi::Boolean>().Value() ? 1 : 0;
        return sendCommandAndWait(info, msg);
    }
    Napi::Value NapiCommandChannel::JogContinuous(const Napi::CallbackInfo &info)
    {
        Napi::Env env = info.Env();
        if (info.Length() < 3 || !info[0].IsNumber() || !info[1].IsBoolean() || !info[2].IsNumber())
        {
            Napi::TypeError::New(env, "JogContinuous(axisOrJointIndex, isJointJog, speed) expected").ThrowAsJavaScriptException();
            return env.Null();
        }
        EMC_JOG_CONT msg;
        msg.joint_or_axis = info[0].As<Napi::Number>().Int32Value();
        msg.jjogmode = info[1].As<Napi::Boolean>().Value() ? 1 : 0;
        msg.vel = info[2].As<Napi::Number>().DoubleValue();
        return sendCommandAndWait(info, msg);
    }
    Napi::Value NapiCommandChannel::JogIncrement(const Napi::CallbackInfo &info)
    {
        Napi::Env env = info.Env();
        if (info.Length() < 4 || !info[0].IsNumber() || !info[1].IsBoolean() || !info[2].IsNumber() || !info[3].IsNumber())
        {
            Napi::TypeError::New(env, "JogIncrement(axisOrJointIndex, isJointJog, speed, increment) expected").ThrowAsJavaScriptException();
            return env.Null();
        }
        EMC_JOG_INCR msg;
        msg.joint_or_axis = info[0].As<Napi::Number>().Int32Value();
        msg.jjogmode = info[1].As<Napi::Boolean>().Value() ? 1 : 0;
        msg.vel = info[2].As<Napi::Number>().DoubleValue();
        msg.incr = info[3].As<Napi::Number>().DoubleValue();
        return sendCommandAndWait(info, msg);
    }
    Napi::Value NapiCommandChannel::SetMinPositionLimit(const Napi::CallbackInfo &info)
    {
        Napi::Env env = info.Env();
        if (info.Length() < 2 || !info[0].IsNumber() || !info[1].IsNumber())
        {
            Napi::TypeError::New(env, "SetMinPositionLimit(jointIndex, limit) expected").ThrowAsJavaScriptException();
            return env.Null();
        }
        EMC_JOINT_SET_MIN_POSITION_LIMIT msg;
        msg.joint = info[0].As<Napi::Number>().Int32Value();
        msg.limit = info[1].As<Napi::Number>().DoubleValue();
        return sendCommandAndWait(info, msg);
    }
    Napi::Value NapiCommandChannel::SetMaxPositionLimit(const Napi::CallbackInfo &info)
    {
        Napi::Env env = info.Env();
        if (info.Length() < 2 || !info[0].IsNumber() || !info[1].IsNumber())
        {
            Napi::TypeError::New(env, "SetMaxPositionLimit(jointIndex, limit) expected").ThrowAsJavaScriptException();
            return env.Null();
        }
        EMC_JOINT_SET_MAX_POSITION_LIMIT msg;
        msg.joint = info[0].As<Napi::Number>().Int32Value();
        msg.limit = info[1].As<Napi::Number>().DoubleValue();
        return sendCommandAndWait(info, msg);
    }

    // Spindle commands
    Napi::Value NapiCommandChannel::SpindleOn(const Napi::CallbackInfo &info)
    {
        Napi::Env env = info.Env();
        if (info.Length() < 1 || !info[0].IsNumber())
        { // Direction
            Napi::TypeError::New(env, "Spindle direction (number) expected").ThrowAsJavaScriptException();
            return env.Null();
        }

        int dir = info[0].As<Napi::Number>().Int32Value();
        double speed = 0.0;
        int spindle_idx = 0;
        bool wait_for_speed = true; // Default from python binding seems to be true for M3/M4

        if (info.Length() > 1 && info[1].IsNumber())
            speed = info[1].As<Napi::Number>().DoubleValue();
        if (info.Length() > 2 && info[2].IsNumber())
            spindle_idx = info[2].As<Napi::Number>().Int32Value();
        if (info.Length() > 3 && info[3].IsBoolean())
            wait_for_speed = info[3].As<Napi::Boolean>().Value();

        // This maps to the Python spindle() command logic where dir is LOCAL_SPINDLE_FORWARD/REVERSE
        // LOCAL_SPINDLE_OFF is handled by SpindleOff method.
        // LOCAL_SPINDLE_INCREASE, DECREASE, CONSTANT are separate methods.

        if (dir == LOCAL_SPINDLE_FORWARD || dir == LOCAL_SPINDLE_REVERSE)
        {
            EMC_SPINDLE_ON msg;
            msg.spindle = spindle_idx;
            msg.speed = (dir == LOCAL_SPINDLE_REVERSE) ? -speed : speed; // Python uses dir * arg1
            // msg.factor and msg.xoffset are for CSS, not typically set by simple M3/M4. Assuming 0.
            msg.factor = 0;
            msg.xoffset = 0;
            msg.wait_for_spindle_at_speed = wait_for_speed ? 1 : 0;
            return sendCommandAndWait(info, msg);
        }
        else
        {
            Napi::Error::New(env, "Invalid direction for SpindleOn. Use SpindleOff, SpindleIncrease etc. for other operations.").ThrowAsJavaScriptException();
            return env.Null();
        }
    }

    Napi::Value NapiCommandChannel::SpindleIncrease(const Napi::CallbackInfo &info)
    {
        Napi::Env env = info.Env();
        EMC_SPINDLE_INCREASE msg;
        msg.spindle = 0;
        if (info.Length() > 0 && info[0].IsNumber())
        {
            msg.spindle = info[0].As<Napi::Number>().Int32Value();
        }
        return sendCommandAndWait(info, msg);
    }
    Napi::Value NapiCommandChannel::SpindleDecrease(const Napi::CallbackInfo &info)
    {
        Napi::Env env = info.Env();
        EMC_SPINDLE_DECREASE msg;
        msg.spindle = 0;
        if (info.Length() > 0 && info[0].IsNumber())
        {
            msg.spindle = info[0].As<Napi::Number>().Int32Value();
        }
        return sendCommandAndWait(info, msg);
    }
    Napi::Value NapiCommandChannel::SpindleConstant(const Napi::CallbackInfo &info)
    {
        Napi::Env env = info.Env();
        EMC_SPINDLE_CONSTANT msg;
        msg.spindle = 0;
        if (info.Length() > 0 && info[0].IsNumber())
        {
            msg.spindle = info[0].As<Napi::Number>().Int32Value();
        }
        return sendCommandAndWait(info, msg);
    }
    Napi::Value NapiCommandChannel::SpindleOff(const Napi::CallbackInfo &info)
    {
        Napi::Env env = info.Env();
        EMC_SPINDLE_OFF msg;
        msg.spindle = 0;
        if (info.Length() > 0 && info[0].IsNumber())
        {
            msg.spindle = info[0].As<Napi::Number>().Int32Value();
        }
        return sendCommandAndWait(info, msg);
    }
    Napi::Value NapiCommandChannel::SpindleBrake(const Napi::CallbackInfo &info)
    {
        Napi::Env env = info.Env();
        if (info.Length() < 1 || !info[0].IsBoolean())
        {
            Napi::TypeError::New(env, "Engage (boolean) expected for SpindleBrake").ThrowAsJavaScriptException();
            return env.Null();
        }
        bool engage = info[0].As<Napi::Boolean>().Value();
        int spindle_idx = 0;
        if (info.Length() > 1 && info[1].IsNumber())
        {
            spindle_idx = info[1].As<Napi::Number>().Int32Value();
        }

        if (engage)
        {
            EMC_SPINDLE_BRAKE_ENGAGE msg;
            msg.spindle = spindle_idx;
            return sendCommandAndWait(info, msg);
        }
        else
        {
            EMC_SPINDLE_BRAKE_RELEASE msg;
            msg.spindle = spindle_idx;
            return sendCommandAndWait(info, msg);
        }
    }

    // Coolant Commands
    Napi::Value NapiCommandChannel::SetMist(const Napi::CallbackInfo &info)
    {
        Napi::Env env = info.Env();
        if (info.Length() < 1 || !info[0].IsBoolean())
        {
            Napi::TypeError::New(env, "On (boolean) expected for SetMist").ThrowAsJavaScriptException();
            return env.Null();
        }
        bool on = info[0].As<Napi::Boolean>().Value();
        if (on)
        {
            EMC_COOLANT_MIST_ON msg;
            return sendCommandAndWait(info, msg);
        }
        else
        {
            EMC_COOLANT_MIST_OFF msg;
            return sendCommandAndWait(info, msg);
        }
    }
    Napi::Value NapiCommandChannel::SetFlood(const Napi::CallbackInfo &info)
    {
        Napi::Env env = info.Env();
        if (info.Length() < 1 || !info[0].IsBoolean())
        {
            Napi::TypeError::New(env, "On (boolean) expected for SetFlood").ThrowAsJavaScriptException();
            return env.Null();
        }
        bool on = info[0].As<Napi::Boolean>().Value();
        if (on)
        {
            EMC_COOLANT_FLOOD_ON msg;
            return sendCommandAndWait(info, msg);
        }
        else
        {
            EMC_COOLANT_FLOOD_OFF msg;
            return sendCommandAndWait(info, msg);
        }
    }

    // Tool Commands
    Napi::Value NapiCommandChannel::LoadToolTable(const Napi::CallbackInfo &info)
    {
        EMC_TOOL_LOAD_TOOL_TABLE msg;
        msg.file[0] = '\0'; // Use INI default
        // Optionally, allow overriding filename:
        // if (info.Length() > 0 && info[0].IsString()) { ... }
        return sendCommandAndWait(info, msg);
    }
    Napi::Value NapiCommandChannel::SetToolOffset(const Napi::CallbackInfo &info)
    {
        Napi::Env env = info.Env();
        // toolNumber, zOffset, xOffset, diameter, frontAngle, backAngle, orientation
        if (info.Length() < 7 || !info[0].IsNumber() || !info[1].IsNumber() || !info[2].IsNumber() ||
            !info[3].IsNumber() || !info[4].IsNumber() || !info[5].IsNumber() || !info[6].IsNumber())
        {
            Napi::TypeError::New(env, "SetToolOffset requires 7 numeric arguments").ThrowAsJavaScriptException();
            return env.Null();
        }
        EMC_TOOL_SET_OFFSET msg;
        msg.toolno = info[0].As<Napi::Number>().Int32Value();
        msg.offset.tran.z = info[1].As<Napi::Number>().DoubleValue();
        msg.offset.tran.x = info[2].As<Napi::Number>().DoubleValue();
        msg.diameter = info[3].As<Napi::Number>().DoubleValue();
        msg.frontangle = info[4].As<Napi::Number>().DoubleValue();
        msg.backangle = info[5].As<Napi::Number>().DoubleValue();
        msg.orientation = info[6].As<Napi::Number>().Int32Value();
        // Other offsets (Y, A, B, C, U, V, W) default to 0 as per Python binding
        msg.offset.tran.y = 0.0;
        msg.offset.a = 0.0;
        msg.offset.b = 0.0;
        msg.offset.c = 0.0;
        msg.offset.u = 0.0;
        msg.offset.v = 0.0;
        msg.offset.w = 0.0;
        msg.pocket = msg.toolno; // Often pocket == toolno, though not always. Original Python binding seems to imply this for this specific command.
                                 // Or, if toolno is always what matters for setting the offset, pocket might not be used by this specific LCNC message processor.
        return sendCommandAndWait(info, msg);
    }

    // IO Commands
    Napi::Value NapiCommandChannel::SetDigitalOutput(const Napi::CallbackInfo &info)
    {
        Napi::Env env = info.Env();
        if (info.Length() < 2 || !info[0].IsNumber() || !info[1].IsBoolean())
        {
            Napi::TypeError::New(env, "SetDigitalOutput(index, value) expected").ThrowAsJavaScriptException();
            return env.Null();
        }
        EMC_MOTION_SET_DOUT msg;
        msg.index = static_cast<unsigned char>(info[0].As<Napi::Number>().Uint32Value());
        msg.start = info[1].As<Napi::Boolean>().Value() ? 1 : 0;
        msg.end = msg.start; // Immediate change
        msg.now = 1;         // Immediate
        return sendCommandAndWait(info, msg);
    }
    Napi::Value NapiCommandChannel::SetAnalogOutput(const Napi::CallbackInfo &info)
    {
        Napi::Env env = info.Env();
        if (info.Length() < 2 || !info[0].IsNumber() || !info[1].IsNumber())
        {
            Napi::TypeError::New(env, "SetAnalogOutput(index, value) expected").ThrowAsJavaScriptException();
            return env.Null();
        }
        EMC_MOTION_SET_AOUT msg;
        msg.index = static_cast<unsigned char>(info[0].As<Napi::Number>().Uint32Value());
        msg.start = info[1].As<Napi::Number>().DoubleValue();
        msg.end = msg.start; // Immediate change
        msg.now = 1;         // Immediate
        return sendCommandAndWait(info, msg);
    }

    // Debug & Message Commands
    Napi::Value NapiCommandChannel::SetDebugLevel(const Napi::CallbackInfo &info)
    {
        Napi::Env env = info.Env();
        if (info.Length() < 1 || !info[0].IsNumber())
        {
            Napi::TypeError::New(env, "Level (number) expected").ThrowAsJavaScriptException();
            return env.Null();
        }
        EMC_SET_DEBUG msg;
        msg.debug = info[0].As<Napi::Number>().Uint32Value();
        return sendCommandAndWait(info, msg);
    }

    Napi::Value NapiCommandChannel::SendOperatorError(const Napi::CallbackInfo &info)
    {
        Napi::Env env = info.Env();
        if (info.Length() < 1 || !info[0].IsString())
        {
            Napi::TypeError::New(env, "Message (string) expected").ThrowAsJavaScriptException();
            return env.Null();
        }
        std::string str_msg = info[0].As<Napi::String>().Utf8Value();
        EMC_OPERATOR_ERROR emc_msg;
        strncpy(emc_msg.error, str_msg.c_str(), LINELEN - 1);
        emc_msg.error[LINELEN - 1] = 0;
        return sendCommandAndWait(info, emc_msg);
    }
    Napi::Value NapiCommandChannel::SendOperatorText(const Napi::CallbackInfo &info)
    {
        Napi::Env env = info.Env();
        if (info.Length() < 1 || !info[0].IsString())
        {
            Napi::TypeError::New(env, "Message (string) expected").ThrowAsJavaScriptException();
            return env.Null();
        }
        std::string str_msg = info[0].As<Napi::String>().Utf8Value();
        EMC_OPERATOR_TEXT emc_msg;
        strncpy(emc_msg.text, str_msg.c_str(), LINELEN - 1);
        emc_msg.text[LINELEN - 1] = 0;
        return sendCommandAndWait(info, emc_msg);
    }
    Napi::Value NapiCommandChannel::SendOperatorDisplay(const Napi::CallbackInfo &info)
    {
        Napi::Env env = info.Env();
        if (info.Length() < 1 || !info[0].IsString())
        {
            Napi::TypeError::New(env, "Message (string) expected").ThrowAsJavaScriptException();
            return env.Null();
        }
        std::string str_msg = info[0].As<Napi::String>().Utf8Value();
        EMC_OPERATOR_DISPLAY emc_msg;
        strncpy(emc_msg.display, str_msg.c_str(), LINELEN - 1);
        emc_msg.display[LINELEN - 1] = 0;
        return sendCommandAndWait(info, emc_msg);
    }

    Napi::Value NapiCommandChannel::GetSerial(const Napi::CallbackInfo &info)
    {
        Napi::Env env = info.Env();
        return Napi::Number::New(env, last_serial_);
    }

    Napi::Value NapiCommandChannel::WaitComplete(const Napi::CallbackInfo &info)
    {
        Napi::Env env = info.Env();
        double timeout = EMC_COMMAND_TIMEOUT_DEFAULT;
        if (info.Length() > 0 && info[0].IsNumber())
        {
            timeout = info[0].As<Napi::Number>().DoubleValue();
        }
        RCS_STATUS status = waitCommandComplete(timeout);
        return Napi::Number::New(env, static_cast<int>(status));
    }

} // namespace LinuxCNC