#include "command_channel.hh"
#include "command_worker.hh"
#include "common.hh"
#include <cstring>
#include <algorithm>
#include <unistd.h>
#include <memory>
#include <vector>
#include <optional>
#include <map>
#include "cms.hh"
#include "tooldata.hh"
#include "inifile.hh"
#include <fstream>

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
                                                                           InstanceMethod("setTaskMode", &NapiCommandChannel::SetTaskMode),
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
                                                                           InstanceMethod("spindleOff", &NapiCommandChannel::SpindleOff),
                                                                           InstanceMethod("spindleBrake", &NapiCommandChannel::SpindleBrake),
                                                                           // Coolant
                                                                           InstanceMethod("setMist", &NapiCommandChannel::SetMist),
                                                                           InstanceMethod("setFlood", &NapiCommandChannel::SetFlood),
                                                                           // Tool
                                                                           InstanceMethod("loadToolTable", &NapiCommandChannel::LoadToolTable),
                                                                           InstanceMethod("setTool", &NapiCommandChannel::SetTool),
                                                                           // IO
                                                                           InstanceMethod("setDigitalOutput", &NapiCommandChannel::SetDigitalOutput),
                                                                           InstanceMethod("setAnalogOutput", &NapiCommandChannel::SetAnalogOutput),
                                                                           // Debug & Msg
                                                                           InstanceMethod("setDebugLevel", &NapiCommandChannel::SetDebugLevel),
                                                                           InstanceMethod("sendOperatorError", &NapiCommandChannel::SendOperatorError),
                                                                           InstanceMethod("sendOperatorText", &NapiCommandChannel::SendOperatorText),
                                                                           InstanceMethod("sendOperatorDisplay", &NapiCommandChannel::SendOperatorDisplay),
                                                                           // Misc
                                                                           InstanceMethod("disconnect", &NapiCommandChannel::Disconnect),
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

        // Parse INI file to cache commonly used settings
        if (!parseIniFile())
        {
            // If INI parsing fails, we can still continue but SetTool might not work
            // This is not a critical failure for basic command channel functionality
        }

        return true;
    }

    bool NapiCommandChannel::parseIniFile()
    {
        // Get INI filename from stat channel
        if (!s_channel_ || !s_channel_->valid())
        {
            return false;
        }

        // Poll status to get current INI filename
        if (s_channel_->peek() != EMC_STAT_TYPE)
        {
            return false;
        }

        EMC_STAT *emc_status_ptr = static_cast<EMC_STAT *>(s_channel_->get_address());
        if (!emc_status_ptr)
        {
            return false;
        }

        ini_filename_ = std::string(emc_status_ptr->task.ini_filename);
        if (ini_filename_.empty())
        {
            return false;
        }

        // Parse the INI file to get tool table filename
        IniFile iniFile;
        if (iniFile.Open(ini_filename_.c_str()) == false)
        {
            return false;
        }

        std::optional<const char *> toolTableFile;
        if ((toolTableFile = iniFile.Find("TOOL_TABLE", "EMCIO")))
        {
            tool_table_filename_ = std::string(*toolTableFile);
        }
        else
        {
            iniFile.Close();
            return false;
        }

        iniFile.Close();

        // Handle relative paths - make them relative to the INI file directory
        if (tool_table_filename_[0] != '/')
        {
            size_t lastSlash = ini_filename_.find_last_of('/');
            if (lastSlash != std::string::npos)
            {
                tool_table_filename_ = ini_filename_.substr(0, lastSlash + 1) + tool_table_filename_;
            }
        }

        return true;
    }

    void NapiCommandChannel::disconnect()
    {
        delete c_channel_;
        c_channel_ = nullptr;
        delete s_channel_;
        s_channel_ = nullptr;

        // Clear cached INI settings
        ini_filename_.clear();
        tool_table_filename_.clear();
    }

    Napi::Value NapiCommandChannel::sendCommandAsync(const Napi::CallbackInfo &info, std::unique_ptr<RCS_CMD_MSG> cmd_msg, double timeout)
    {
        Napi::Env env = info.Env();

        // Check if channels are connected
        if (!c_channel_ || !s_channel_ || !c_channel_->valid() || !s_channel_->valid())
        {
            if (!connect())
            { // Attempt to reconnect
                Napi::Error::New(env, "Command channel not connected.").ThrowAsJavaScriptException();
                return env.Null();
            }
        }

        // Write command to channel
        if (c_channel_->write(cmd_msg.get()))
        {
            Napi::Error::New(env, "Failed to write command to NML channel.").ThrowAsJavaScriptException();
            return env.Null();
        }

        // Store the serial number for tracking
        last_serial_ = cmd_msg->serial_number;

        // Create promise and return it immediately
        auto deferred = Napi::Promise::Deferred::New(env);

        // Create callback function that resolves the promise
        auto resolver = Napi::Function::New(env, [deferred](const Napi::CallbackInfo &cbInfo) -> Napi::Value
                                            {
            Napi::Env env = cbInfo.Env();
            if (cbInfo.Length() > 0 && cbInfo[0].IsNumber()) {
                // Success case - resolve with status
                deferred.Resolve(cbInfo[0]);
            } else if (cbInfo.Length() > 1) {
                // Error case - reject with error
                deferred.Reject(cbInfo[1]);
            } else {
                // Fallback error
                deferred.Reject(Napi::Error::New(env, "Unknown command completion error").Value());
            }
            return env.Undefined(); });

        // Create and queue the async worker
        CommandWorker *worker = new CommandWorker(resolver, this, std::move(cmd_msg), timeout);
        worker->Queue();

        return deferred.Promise();
    }

    Napi::Value NapiCommandChannel::SetTaskMode(const Napi::CallbackInfo &info)
    {
        Napi::Env env = info.Env();
        if (info.Length() < 1 || !info[0].IsNumber())
        {
            Napi::TypeError::New(env, "Mode (number) expected").ThrowAsJavaScriptException();
            return env.Null();
        }

        auto msg = std::make_unique<EMC_TASK_SET_MODE>();
        msg->mode = static_cast<EMC_TASK_MODE>(info[0].As<Napi::Number>().Int32Value());

        // Basic validation
        switch (msg->mode)
        {
        case EMC_TASK_MODE::MDI:
        case EMC_TASK_MODE::MANUAL:
        case EMC_TASK_MODE::AUTO:
            break;
        default:
            Napi::Error::New(env, "Invalid mode value").ThrowAsJavaScriptException();
            return env.Null();
        }

        // Cast to base class pointer for sendCommandAsync
        std::unique_ptr<RCS_CMD_MSG> cmd_msg(static_cast<RCS_CMD_MSG *>(msg.release()));
        return sendCommandAsync(info, std::move(cmd_msg));
    }

    Napi::Value NapiCommandChannel::SetState(const Napi::CallbackInfo &info)
    {
        Napi::Env env = info.Env();
        if (info.Length() < 1 || !info[0].IsNumber())
        {
            Napi::TypeError::New(env, "State (number) expected").ThrowAsJavaScriptException();
            return env.Null();
        }

        auto msg = std::make_unique<EMC_TASK_SET_STATE>();
        msg->state = static_cast<EMC_TASK_STATE>(info[0].As<Napi::Number>().Int32Value());

        switch (msg->state)
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

        std::unique_ptr<RCS_CMD_MSG> cmd_msg(static_cast<RCS_CMD_MSG *>(msg.release()));
        return sendCommandAsync(info, std::move(cmd_msg));
    }

    Napi::Value NapiCommandChannel::TaskPlanSynch(const Napi::CallbackInfo &info)
    {
        auto msg = std::make_unique<EMC_TASK_PLAN_SYNCH>();
        std::unique_ptr<RCS_CMD_MSG> cmd_msg(static_cast<RCS_CMD_MSG *>(msg.release()));
        return sendCommandAsync(info, std::move(cmd_msg));
    }

    Napi::Value NapiCommandChannel::ResetInterpreter(const Napi::CallbackInfo &info)
    {
        auto msg = std::make_unique<EMC_TASK_PLAN_INIT>();
        std::unique_ptr<RCS_CMD_MSG> cmd_msg(static_cast<RCS_CMD_MSG *>(msg.release()));
        return sendCommandAsync(info, std::move(cmd_msg));
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

        // Create and queue the ProgramOpenWorker
        ProgramOpenWorker *worker = new ProgramOpenWorker(info, file_path_str, this);
        worker->Queue();

        // Return the promise from the worker
        return worker->GetPromise();
    }

    Napi::Value NapiCommandChannel::RunProgram(const Napi::CallbackInfo &info)
    {
        auto msg = std::make_unique<EMC_TASK_PLAN_RUN>();
        msg->line = 0; // Default: start from beginning
        if (info.Length() > 0 && info[0].IsNumber())
        {
            msg->line = info[0].As<Napi::Number>().Int32Value();
        }
        std::unique_ptr<RCS_CMD_MSG> cmd_msg(static_cast<RCS_CMD_MSG *>(msg.release()));
        return sendCommandAsync(info, std::move(cmd_msg));
    }

    Napi::Value NapiCommandChannel::PauseProgram(const Napi::CallbackInfo &info)
    {
        auto msg = std::make_unique<EMC_TASK_PLAN_PAUSE>();
        std::unique_ptr<RCS_CMD_MSG> cmd_msg(static_cast<RCS_CMD_MSG *>(msg.release()));
        return sendCommandAsync(info, std::move(cmd_msg));
    }

    Napi::Value NapiCommandChannel::ResumeProgram(const Napi::CallbackInfo &info)
    {
        auto msg = std::make_unique<EMC_TASK_PLAN_RESUME>();
        std::unique_ptr<RCS_CMD_MSG> cmd_msg(static_cast<RCS_CMD_MSG *>(msg.release()));
        return sendCommandAsync(info, std::move(cmd_msg));
    }
    Napi::Value NapiCommandChannel::StepProgram(const Napi::CallbackInfo &info)
    {
        auto msg = std::make_unique<EMC_TASK_PLAN_STEP>();
        std::unique_ptr<RCS_CMD_MSG> cmd_msg(static_cast<RCS_CMD_MSG *>(msg.release()));
        return sendCommandAsync(info, std::move(cmd_msg));
    }

    Napi::Value NapiCommandChannel::ReverseProgram(const Napi::CallbackInfo &info)
    {
        auto msg = std::make_unique<EMC_TASK_PLAN_REVERSE>();
        std::unique_ptr<RCS_CMD_MSG> cmd_msg(static_cast<RCS_CMD_MSG *>(msg.release()));
        return sendCommandAsync(info, std::move(cmd_msg));
    }

    Napi::Value NapiCommandChannel::ForwardProgram(const Napi::CallbackInfo &info)
    {
        auto msg = std::make_unique<EMC_TASK_PLAN_FORWARD>();
        std::unique_ptr<RCS_CMD_MSG> cmd_msg(static_cast<RCS_CMD_MSG *>(msg.release()));
        return sendCommandAsync(info, std::move(cmd_msg));
    }

    Napi::Value NapiCommandChannel::AbortTask(const Napi::CallbackInfo &info)
    {
        auto msg = std::make_unique<EMC_TASK_ABORT>();
        std::unique_ptr<RCS_CMD_MSG> cmd_msg(static_cast<RCS_CMD_MSG *>(msg.release()));
        return sendCommandAsync(info, std::move(cmd_msg));
    }
    Napi::Value NapiCommandChannel::SetOptionalStop(const Napi::CallbackInfo &info)
    {
        Napi::Env env = info.Env();
        if (info.Length() < 1 || !info[0].IsBoolean())
        {
            Napi::TypeError::New(env, "Enable (boolean) expected").ThrowAsJavaScriptException();
            return env.Null();
        }
        auto msg = std::make_unique<EMC_TASK_PLAN_SET_OPTIONAL_STOP>();
        msg->state = info[0].As<Napi::Boolean>().Value();
        std::unique_ptr<RCS_CMD_MSG> cmd_msg(static_cast<RCS_CMD_MSG *>(msg.release()));
        return sendCommandAsync(info, std::move(cmd_msg));
    }
    Napi::Value NapiCommandChannel::SetBlockDelete(const Napi::CallbackInfo &info)
    {
        Napi::Env env = info.Env();
        if (info.Length() < 1 || !info[0].IsBoolean())
        {
            Napi::TypeError::New(env, "Enable (boolean) expected").ThrowAsJavaScriptException();
            return env.Null();
        }
        auto msg = std::make_unique<EMC_TASK_PLAN_SET_BLOCK_DELETE>();
        msg->state = info[0].As<Napi::Boolean>().Value();
        std::unique_ptr<RCS_CMD_MSG> cmd_msg(static_cast<RCS_CMD_MSG *>(msg.release()));
        return sendCommandAsync(info, std::move(cmd_msg));
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

        auto msg = std::make_unique<EMC_TASK_PLAN_EXECUTE>();
        strncpy(msg->command, cmd_str.c_str(), sizeof(msg->command) - 1);
        msg->command[sizeof(msg->command) - 1] = '\0';

        std::unique_ptr<RCS_CMD_MSG> cmd_msg(static_cast<RCS_CMD_MSG *>(msg.release()));
        return sendCommandAsync(info, std::move(cmd_msg));
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
        auto msg = std::make_unique<EMC_TRAJ_SET_MODE>();
        msg->mode = static_cast<EMC_TRAJ_MODE>(info[0].As<Napi::Number>().Int32Value());
        std::unique_ptr<RCS_CMD_MSG> cmd_msg(static_cast<RCS_CMD_MSG *>(msg.release()));
        return sendCommandAsync(info, std::move(cmd_msg));
    }
    Napi::Value NapiCommandChannel::SetMaxVelocity(const Napi::CallbackInfo &info)
    {
        Napi::Env env = info.Env();
        if (info.Length() < 1 || !info[0].IsNumber())
        {
            Napi::TypeError::New(env, "Velocity (number) expected").ThrowAsJavaScriptException();
            return env.Null();
        }
        auto msg = std::make_unique<EMC_TRAJ_SET_MAX_VELOCITY>();
        msg->velocity = info[0].As<Napi::Number>().DoubleValue();
        std::unique_ptr<RCS_CMD_MSG> cmd_msg(static_cast<RCS_CMD_MSG *>(msg.release()));
        return sendCommandAsync(info, std::move(cmd_msg));
    }

    Napi::Value NapiCommandChannel::SetFeedRate(const Napi::CallbackInfo &info)
    {
        Napi::Env env = info.Env();
        if (info.Length() < 1 || !info[0].IsNumber())
        {
            Napi::TypeError::New(env, "Scale (number) expected").ThrowAsJavaScriptException();
            return env.Null();
        }
        auto msg = std::make_unique<EMC_TRAJ_SET_SCALE>();
        msg->scale = info[0].As<Napi::Number>().DoubleValue();
        if (msg->scale < 0)
            msg->scale = 0; // Or throw error for invalid scale
        std::unique_ptr<RCS_CMD_MSG> cmd_msg(static_cast<RCS_CMD_MSG *>(msg.release()));
        return sendCommandAsync(info, std::move(cmd_msg));
    }
    Napi::Value NapiCommandChannel::SetRapidRate(const Napi::CallbackInfo &info)
    {
        Napi::Env env = info.Env();
        if (info.Length() < 1 || !info[0].IsNumber())
        {
            Napi::TypeError::New(env, "Scale (number) expected").ThrowAsJavaScriptException();
            return env.Null();
        }
        auto msg = std::make_unique<EMC_TRAJ_SET_RAPID_SCALE>();
        msg->scale = info[0].As<Napi::Number>().DoubleValue();
        if (msg->scale < 0)
            msg->scale = 0;
        std::unique_ptr<RCS_CMD_MSG> cmd_msg(static_cast<RCS_CMD_MSG *>(msg.release()));
        return sendCommandAsync(info, std::move(cmd_msg));
    }
    Napi::Value NapiCommandChannel::SetSpindleOverride(const Napi::CallbackInfo &info)
    {
        Napi::Env env = info.Env();
        if (info.Length() < 1 || !info[0].IsNumber())
        {
            Napi::TypeError::New(env, "Scale (number) expected").ThrowAsJavaScriptException();
            return env.Null();
        }
        auto msg = std::make_unique<EMC_TRAJ_SET_SPINDLE_SCALE>();
        msg->scale = info[0].As<Napi::Number>().DoubleValue();
        if (msg->scale < 0)
            msg->scale = 0;
        msg->spindle = 0; // Default spindle 0
        if (info.Length() > 1 && info[1].IsNumber())
        {
            msg->spindle = info[1].As<Napi::Number>().Int32Value();
        }
        std::unique_ptr<RCS_CMD_MSG> cmd_msg(static_cast<RCS_CMD_MSG *>(msg.release()));
        return sendCommandAsync(info, std::move(cmd_msg));
    }
    Napi::Value NapiCommandChannel::OverrideLimits(const Napi::CallbackInfo &info)
    {
        auto msg = std::make_unique<EMC_JOINT_OVERRIDE_LIMITS>(); // This is a JOINT command, not TRAJ
        msg->joint = 0;                                           // Affects all joints (as per python binding)
        std::unique_ptr<RCS_CMD_MSG> cmd_msg(static_cast<RCS_CMD_MSG *>(msg.release()));
        return sendCommandAsync(info, std::move(cmd_msg));
    }
    Napi::Value NapiCommandChannel::TeleopEnable(const Napi::CallbackInfo &info)
    {
        Napi::Env env = info.Env();
        if (info.Length() < 1 || !info[0].IsBoolean())
        {
            Napi::TypeError::New(env, "Enable (boolean) expected").ThrowAsJavaScriptException();
            return env.Null();
        }
        auto msg = std::make_unique<EMC_TRAJ_SET_TELEOP_ENABLE>();
        msg->enable = info[0].As<Napi::Boolean>().Value() ? 1 : 0;
        std::unique_ptr<RCS_CMD_MSG> cmd_msg(static_cast<RCS_CMD_MSG *>(msg.release()));
        return sendCommandAsync(info, std::move(cmd_msg));
    }

    Napi::Value NapiCommandChannel::SetFeedOverrideEnable(const Napi::CallbackInfo &info)
    {
        Napi::Env env = info.Env();
        if (info.Length() < 1 || !info[0].IsBoolean())
        {
            Napi::TypeError::New(env, "Enable (boolean) expected").ThrowAsJavaScriptException();
            return env.Null();
        }
        auto msg = std::make_unique<EMC_TRAJ_SET_FO_ENABLE>();
        msg->mode = info[0].As<Napi::Boolean>().Value() ? 1 : 0; // 1 for enable in struct
        std::unique_ptr<RCS_CMD_MSG> cmd_msg(static_cast<RCS_CMD_MSG *>(msg.release()));
        return sendCommandAsync(info, std::move(cmd_msg));
    }
    Napi::Value NapiCommandChannel::SetSpindleOverrideEnable(const Napi::CallbackInfo &info)
    {
        Napi::Env env = info.Env();
        if (info.Length() < 1 || !info[0].IsBoolean())
        {
            Napi::TypeError::New(env, "Enable (boolean) expected").ThrowAsJavaScriptException();
            return env.Null();
        }
        auto msg = std::make_unique<EMC_TRAJ_SET_SO_ENABLE>();
        msg->mode = info[0].As<Napi::Boolean>().Value() ? 1 : 0;
        msg->spindle = 0; // Default spindle 0
        if (info.Length() > 1 && info[1].IsNumber())
        {
            msg->spindle = info[1].As<Napi::Number>().Int32Value();
        }
        std::unique_ptr<RCS_CMD_MSG> cmd_msg(static_cast<RCS_CMD_MSG *>(msg.release()));
        return sendCommandAsync(info, std::move(cmd_msg));
    }
    Napi::Value NapiCommandChannel::SetFeedHoldEnable(const Napi::CallbackInfo &info)
    {
        Napi::Env env = info.Env();
        if (info.Length() < 1 || !info[0].IsBoolean())
        {
            Napi::TypeError::New(env, "Enable (boolean) expected").ThrowAsJavaScriptException();
            return env.Null();
        }
        auto msg = std::make_unique<EMC_TRAJ_SET_FH_ENABLE>();
        msg->mode = info[0].As<Napi::Boolean>().Value() ? 1 : 0;
        std::unique_ptr<RCS_CMD_MSG> cmd_msg(static_cast<RCS_CMD_MSG *>(msg.release()));
        return sendCommandAsync(info, std::move(cmd_msg));
    }
    Napi::Value NapiCommandChannel::SetAdaptiveFeedEnable(const Napi::CallbackInfo &info)
    {
        Napi::Env env = info.Env();
        if (info.Length() < 1 || !info[0].IsBoolean())
        {
            Napi::TypeError::New(env, "Enable (boolean) expected").ThrowAsJavaScriptException();
            return env.Null();
        }
        auto msg = std::make_unique<EMC_MOTION_ADAPTIVE>(); // This is a MOTION command
        msg->status = info[0].As<Napi::Boolean>().Value() ? 1 : 0;
        std::unique_ptr<RCS_CMD_MSG> cmd_msg(static_cast<RCS_CMD_MSG *>(msg.release()));
        return sendCommandAsync(info, std::move(cmd_msg));
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
        auto msg = std::make_unique<EMC_JOINT_HOME>();
        msg->joint = info[0].As<Napi::Number>().Int32Value();
        std::unique_ptr<RCS_CMD_MSG> cmd_msg(static_cast<RCS_CMD_MSG *>(msg.release()));
        return sendCommandAsync(info, std::move(cmd_msg));
    }
    Napi::Value NapiCommandChannel::UnhomeJoint(const Napi::CallbackInfo &info)
    {
        Napi::Env env = info.Env();
        if (info.Length() < 1 || !info[0].IsNumber())
        {
            Napi::TypeError::New(env, "Joint index (number) expected").ThrowAsJavaScriptException();
            return env.Null();
        }
        auto msg = std::make_unique<EMC_JOINT_UNHOME>();
        msg->joint = info[0].As<Napi::Number>().Int32Value();
        std::unique_ptr<RCS_CMD_MSG> cmd_msg(static_cast<RCS_CMD_MSG *>(msg.release()));
        return sendCommandAsync(info, std::move(cmd_msg));
    }
    Napi::Value NapiCommandChannel::JogStop(const Napi::CallbackInfo &info)
    {
        Napi::Env env = info.Env();
        if (info.Length() < 2 || !info[0].IsNumber() || !info[1].IsBoolean())
        {
            Napi::TypeError::New(env, "JogStop(axisOrJointIndex, isJointJog) expected").ThrowAsJavaScriptException();
            return env.Null();
        }
        auto msg = std::make_unique<EMC_JOG_STOP>();
        msg->joint_or_axis = info[0].As<Napi::Number>().Int32Value();
        msg->jjogmode = info[1].As<Napi::Boolean>().Value() ? 1 : 0;
        std::unique_ptr<RCS_CMD_MSG> cmd_msg(static_cast<RCS_CMD_MSG *>(msg.release()));
        return sendCommandAsync(info, std::move(cmd_msg));
    }
    Napi::Value NapiCommandChannel::JogContinuous(const Napi::CallbackInfo &info)
    {
        Napi::Env env = info.Env();
        if (info.Length() < 3 || !info[0].IsNumber() || !info[1].IsBoolean() || !info[2].IsNumber())
        {
            Napi::TypeError::New(env, "JogContinuous(axisOrJointIndex, isJointJog, speed) expected").ThrowAsJavaScriptException();
            return env.Null();
        }
        auto msg = std::make_unique<EMC_JOG_CONT>();
        msg->joint_or_axis = info[0].As<Napi::Number>().Int32Value();
        msg->jjogmode = info[1].As<Napi::Boolean>().Value() ? 1 : 0;
        msg->vel = info[2].As<Napi::Number>().DoubleValue();
        std::unique_ptr<RCS_CMD_MSG> cmd_msg(static_cast<RCS_CMD_MSG *>(msg.release()));
        return sendCommandAsync(info, std::move(cmd_msg));
    }
    Napi::Value NapiCommandChannel::JogIncrement(const Napi::CallbackInfo &info)
    {
        Napi::Env env = info.Env();
        if (info.Length() < 4 || !info[0].IsNumber() || !info[1].IsBoolean() || !info[2].IsNumber() || !info[3].IsNumber())
        {
            Napi::TypeError::New(env, "JogIncrement(axisOrJointIndex, isJointJog, speed, increment) expected").ThrowAsJavaScriptException();
            return env.Null();
        }
        auto msg = std::make_unique<EMC_JOG_INCR>();
        msg->joint_or_axis = info[0].As<Napi::Number>().Int32Value();
        msg->jjogmode = info[1].As<Napi::Boolean>().Value() ? 1 : 0;
        msg->vel = info[2].As<Napi::Number>().DoubleValue();
        msg->incr = info[3].As<Napi::Number>().DoubleValue();
        std::unique_ptr<RCS_CMD_MSG> cmd_msg(static_cast<RCS_CMD_MSG *>(msg.release()));
        return sendCommandAsync(info, std::move(cmd_msg));
    }
    Napi::Value NapiCommandChannel::SetMinPositionLimit(const Napi::CallbackInfo &info)
    {
        Napi::Env env = info.Env();
        if (info.Length() < 2 || !info[0].IsNumber() || !info[1].IsNumber())
        {
            Napi::TypeError::New(env, "SetMinPositionLimit(jointIndex, limit) expected").ThrowAsJavaScriptException();
            return env.Null();
        }
        auto msg = std::make_unique<EMC_JOINT_SET_MIN_POSITION_LIMIT>();
        msg->joint = info[0].As<Napi::Number>().Int32Value();
        msg->limit = info[1].As<Napi::Number>().DoubleValue();
        std::unique_ptr<RCS_CMD_MSG> cmd_msg(static_cast<RCS_CMD_MSG *>(msg.release()));
        return sendCommandAsync(info, std::move(cmd_msg));
    }
    Napi::Value NapiCommandChannel::SetMaxPositionLimit(const Napi::CallbackInfo &info)
    {
        Napi::Env env = info.Env();
        if (info.Length() < 2 || !info[0].IsNumber() || !info[1].IsNumber())
        {
            Napi::TypeError::New(env, "SetMaxPositionLimit(jointIndex, limit) expected").ThrowAsJavaScriptException();
            return env.Null();
        }
        auto msg = std::make_unique<EMC_JOINT_SET_MAX_POSITION_LIMIT>();
        msg->joint = info[0].As<Napi::Number>().Int32Value();
        msg->limit = info[1].As<Napi::Number>().DoubleValue();
        std::unique_ptr<RCS_CMD_MSG> cmd_msg(static_cast<RCS_CMD_MSG *>(msg.release()));
        return sendCommandAsync(info, std::move(cmd_msg));
    }

    // Spindle commands
    Napi::Value NapiCommandChannel::SpindleOn(const Napi::CallbackInfo &info)
    {
        Napi::Env env = info.Env();
        if (info.Length() < 1 || !info[0].IsNumber())
        { // Speed
            Napi::TypeError::New(env, "Spindle speed (number) expected").ThrowAsJavaScriptException();
            return env.Null();
        }

        double speed = info[0].As<Napi::Number>().DoubleValue();
        int spindle_idx = 0;
        bool wait_for_speed = true; // Default from python binding seems to be true for M3/M4

        if (info.Length() > 1 && info[1].IsNumber())
            spindle_idx = info[1].As<Napi::Number>().Int32Value();
        if (info.Length() > 2 && info[2].IsBoolean())
            wait_for_speed = info[2].As<Napi::Boolean>().Value();

        auto msg = std::make_unique<EMC_SPINDLE_ON>();
        msg->spindle = spindle_idx;
        msg->speed = speed; // Speed sign determines direction
        // msg.factor and msg.xoffset are for CSS, not typically set by simple M3/M4. Assuming 0.
        msg->factor = 0;
        msg->xoffset = 0;
        msg->wait_for_spindle_at_speed = wait_for_speed ? 1 : 0;
        std::unique_ptr<RCS_CMD_MSG> cmd_msg(static_cast<RCS_CMD_MSG *>(msg.release()));
        return sendCommandAsync(info, std::move(cmd_msg));
    }

    Napi::Value NapiCommandChannel::SpindleIncrease(const Napi::CallbackInfo &info)
    {
        auto msg = std::make_unique<EMC_SPINDLE_INCREASE>();
        msg->spindle = 0;
        if (info.Length() > 0 && info[0].IsNumber())
        {
            msg->spindle = info[0].As<Napi::Number>().Int32Value();
        }
        std::unique_ptr<RCS_CMD_MSG> cmd_msg(static_cast<RCS_CMD_MSG *>(msg.release()));
        return sendCommandAsync(info, std::move(cmd_msg));
    }
    Napi::Value NapiCommandChannel::SpindleDecrease(const Napi::CallbackInfo &info)
    {
        auto msg = std::make_unique<EMC_SPINDLE_DECREASE>();
        msg->spindle = 0;
        if (info.Length() > 0 && info[0].IsNumber())
        {
            msg->spindle = info[0].As<Napi::Number>().Int32Value();
        }
        std::unique_ptr<RCS_CMD_MSG> cmd_msg(static_cast<RCS_CMD_MSG *>(msg.release()));
        return sendCommandAsync(info, std::move(cmd_msg));
    }

    Napi::Value NapiCommandChannel::SpindleOff(const Napi::CallbackInfo &info)
    {
        auto msg = std::make_unique<EMC_SPINDLE_OFF>();
        msg->spindle = 0;
        if (info.Length() > 0 && info[0].IsNumber())
        {
            msg->spindle = info[0].As<Napi::Number>().Int32Value();
        }
        std::unique_ptr<RCS_CMD_MSG> cmd_msg(static_cast<RCS_CMD_MSG *>(msg.release()));
        return sendCommandAsync(info, std::move(cmd_msg));
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
            auto msg = std::make_unique<EMC_SPINDLE_BRAKE_ENGAGE>();
            msg->spindle = spindle_idx;
            std::unique_ptr<RCS_CMD_MSG> cmd_msg(static_cast<RCS_CMD_MSG *>(msg.release()));
            return sendCommandAsync(info, std::move(cmd_msg));
        }
        else
        {
            auto msg = std::make_unique<EMC_SPINDLE_BRAKE_RELEASE>();
            msg->spindle = spindle_idx;
            std::unique_ptr<RCS_CMD_MSG> cmd_msg(static_cast<RCS_CMD_MSG *>(msg.release()));
            return sendCommandAsync(info, std::move(cmd_msg));
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
            auto msg = std::make_unique<EMC_COOLANT_MIST_ON>();
            std::unique_ptr<RCS_CMD_MSG> cmd_msg(static_cast<RCS_CMD_MSG *>(msg.release()));
            return sendCommandAsync(info, std::move(cmd_msg));
        }
        else
        {
            auto msg = std::make_unique<EMC_COOLANT_MIST_OFF>();
            std::unique_ptr<RCS_CMD_MSG> cmd_msg(static_cast<RCS_CMD_MSG *>(msg.release()));
            return sendCommandAsync(info, std::move(cmd_msg));
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
            auto msg = std::make_unique<EMC_COOLANT_FLOOD_ON>();
            std::unique_ptr<RCS_CMD_MSG> cmd_msg(static_cast<RCS_CMD_MSG *>(msg.release()));
            return sendCommandAsync(info, std::move(cmd_msg));
        }
        else
        {
            auto msg = std::make_unique<EMC_COOLANT_FLOOD_OFF>();
            std::unique_ptr<RCS_CMD_MSG> cmd_msg(static_cast<RCS_CMD_MSG *>(msg.release()));
            return sendCommandAsync(info, std::move(cmd_msg));
        }
    }

    // Tool Commands
    Napi::Value NapiCommandChannel::LoadToolTable(const Napi::CallbackInfo &info)
    {
        auto msg = std::make_unique<EMC_TOOL_LOAD_TOOL_TABLE>();
        msg->file[0] = '\0'; // Use INI default
        // Optionally, allow overriding filename:
        // if (info.Length() > 0 && info[0].IsString()) { ... }
        std::unique_ptr<RCS_CMD_MSG> cmd_msg(static_cast<RCS_CMD_MSG *>(msg.release()));
        return sendCommandAsync(info, std::move(cmd_msg));
    }

    Napi::Value NapiCommandChannel::SetTool(const Napi::CallbackInfo &info)
    {
        Napi::Env env = info.Env();

        if (info.Length() < 1 || !info[0].IsObject())
        {
            Napi::TypeError::New(env, "SetTool requires toolEntry (object)").ThrowAsJavaScriptException();
            return env.Null();
        }

        Napi::Object toolEntry = info[0].As<Napi::Object>();

        // Validate that toolNo is present in toolEntry
        if (!toolEntry.Has("toolNo") || !toolEntry.Get("toolNo").IsNumber())
        {
            Napi::TypeError::New(env, "toolEntry must contain toolNo (number)").ThrowAsJavaScriptException();
            return env.Null();
        }

        // Ensure we're connected and have parsed INI settings
        if (!s_channel_ || !s_channel_->valid())
        {
            if (!connect())
            {
                Napi::Error::New(env, "Status channel not connected and failed to reconnect").ThrowAsJavaScriptException();
                return env.Null();
            }
        }

        // Check if we have the tool table filename cached
        if (tool_table_filename_.empty())
        {
            // Try to parse INI file again
            if (!parseIniFile())
            {
                Napi::Error::New(env, "Failed to get tool table filename from INI file").ThrowAsJavaScriptException();
                return env.Null();
            }
        }

        // Create a promise
        auto deferred = Napi::Promise::Deferred::New(env);

        // Create and queue the async worker
        SetToolWorker *worker = new SetToolWorker(deferred, toolEntry, tool_table_filename_);
        worker->Queue();

        return deferred.Promise();
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
        auto msg = std::make_unique<EMC_MOTION_SET_DOUT>();
        msg->index = static_cast<unsigned char>(info[0].As<Napi::Number>().Uint32Value());
        msg->start = info[1].As<Napi::Boolean>().Value() ? 1 : 0;
        msg->end = msg->start; // Immediate change
        msg->now = 1;          // Immediate
        std::unique_ptr<RCS_CMD_MSG> cmd_msg(static_cast<RCS_CMD_MSG *>(msg.release()));
        return sendCommandAsync(info, std::move(cmd_msg));
    }
    Napi::Value NapiCommandChannel::SetAnalogOutput(const Napi::CallbackInfo &info)
    {
        Napi::Env env = info.Env();
        if (info.Length() < 2 || !info[0].IsNumber() || !info[1].IsNumber())
        {
            Napi::TypeError::New(env, "SetAnalogOutput(index, value) expected").ThrowAsJavaScriptException();
            return env.Null();
        }
        auto msg = std::make_unique<EMC_MOTION_SET_AOUT>();
        msg->index = static_cast<unsigned char>(info[0].As<Napi::Number>().Uint32Value());
        msg->start = info[1].As<Napi::Number>().DoubleValue();
        msg->end = msg->start; // Immediate change
        msg->now = 1;          // Immediate
        std::unique_ptr<RCS_CMD_MSG> cmd_msg(static_cast<RCS_CMD_MSG *>(msg.release()));
        return sendCommandAsync(info, std::move(cmd_msg));
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
        auto msg = std::make_unique<EMC_SET_DEBUG>();
        msg->debug = info[0].As<Napi::Number>().Uint32Value();
        std::unique_ptr<RCS_CMD_MSG> cmd_msg(static_cast<RCS_CMD_MSG *>(msg.release()));
        return sendCommandAsync(info, std::move(cmd_msg));
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
        auto msg = std::make_unique<EMC_OPERATOR_ERROR>();
        strncpy(msg->error, str_msg.c_str(), LINELEN - 1);
        msg->error[LINELEN - 1] = 0;
        std::unique_ptr<RCS_CMD_MSG> cmd_msg(static_cast<RCS_CMD_MSG *>(msg.release()));
        return sendCommandAsync(info, std::move(cmd_msg));
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
        auto msg = std::make_unique<EMC_OPERATOR_TEXT>();
        strncpy(msg->text, str_msg.c_str(), LINELEN - 1);
        msg->text[LINELEN - 1] = 0;
        std::unique_ptr<RCS_CMD_MSG> cmd_msg(static_cast<RCS_CMD_MSG *>(msg.release()));
        return sendCommandAsync(info, std::move(cmd_msg));
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
        auto msg = std::make_unique<EMC_OPERATOR_DISPLAY>();
        strncpy(msg->display, str_msg.c_str(), LINELEN - 1);
        msg->display[LINELEN - 1] = 0;
        std::unique_ptr<RCS_CMD_MSG> cmd_msg(static_cast<RCS_CMD_MSG *>(msg.release()));
        return sendCommandAsync(info, std::move(cmd_msg));
    }

    Napi::Value NapiCommandChannel::GetSerial(const Napi::CallbackInfo &info)
    {
        Napi::Env env = info.Env();
        return Napi::Number::New(env, last_serial_);
    }

    Napi::Value NapiCommandChannel::Disconnect(const Napi::CallbackInfo &info)
    {
        Napi::Env env = info.Env();
        disconnect();
        return env.Undefined();
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
                    // Check if we have any pending command with a known serial
                    if (last_serial_ > 0)
                    {
                        int serial_diff = stat->echo_serial_number - last_serial_;
                        if (serial_diff >= 0)
                        {
                            return RCS_STATUS::DONE; // Command processed by LCNC
                        }
                    }
                    // Also check current status
                    if (stat->status == RCS_STATUS::DONE || stat->status == RCS_STATUS::ERROR)
                    {
                        return stat->status;
                    }
                }
            }
            // Use LinuxCNC's esleep for portability within its ecosystem
            esleep(std::min(timeout - (now - start), EMC_COMMAND_DELAY_DEFAULT));
        } while (etime() - start < timeout);
        return RCS_STATUS::UNINITIALIZED; // Timeout
    }

    RCS_STATUS NapiCommandChannel::waitCommandComplete()
    {
        return waitCommandComplete(EMC_COMMAND_TIMEOUT_DEFAULT);
    }

}