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

        // Custom AsyncWorker for ProgramOpen - handles file transfer operations
        class ProgramOpenWorker : public Napi::AsyncWorker
        {
        public:
            ProgramOpenWorker(const Napi::CallbackInfo &info, std::string file_path, NapiCommandChannel *channel)
                : Napi::AsyncWorker(info.Env()),
                  deferred_(Napi::Promise::Deferred::New(info.Env())),
                  file_path_(std::move(file_path)),
                  channel_(channel),
                  result_status_(RCS_STATUS::UNINITIALIZED)
            {
            }

            Napi::Promise GetPromise() { return deferred_.Promise(); }

        protected:
            void Execute() override
            {
                try
                {
                    // First close any open program
                    EMC_TASK_PLAN_CLOSE close_msg;
                    if (channel_->c_channel_->write(&close_msg))
                    {
                        result_status_ = RCS_STATUS::ERROR;
                        SetError("Failed to send close command");
                        return;
                    }

                    RCS_STATUS close_status = waitCommandComplete();
                    if (close_status != RCS_STATUS::DONE)
                    {
                        result_status_ = close_status;
                        SetError("Close command failed");
                        return;
                    }

                    // Prepare open message
                    EMC_TASK_PLAN_OPEN open_msg;
                    if (file_path_.length() >= sizeof(open_msg.file))
                    {
                        result_status_ = RCS_STATUS::ERROR;
                        SetError("File path too long");
                        return;
                    }

                    strncpy(open_msg.file, file_path_.c_str(), sizeof(open_msg.file) - 1);
                    open_msg.file[sizeof(open_msg.file) - 1] = '\0';
                    open_msg.remote_buffersize = 0;
                    open_msg.remote_filesize = 0;

                    // Handle remote file transfer if necessary
                    if (channel_->s_channel_ && channel_->s_channel_->cms &&
                        channel_->s_channel_->cms->ProcessType == CMS_REMOTE_TYPE &&
                        strcmp(channel_->s_channel_->cms->ProcessName, "emc") != 0)
                    {
                        result_status_ = handleRemoteFileTransfer(open_msg);
                    }
                    else
                    {
                        // Local case - simple command
                        if (channel_->c_channel_->write(&open_msg))
                        {
                            result_status_ = RCS_STATUS::ERROR;
                            SetError("Failed to send open command");
                            return;
                        }
                        result_status_ = waitCommandComplete();
                    }
                }
                catch (const std::exception &e)
                {
                    result_status_ = RCS_STATUS::ERROR;
                    SetError(std::string("Exception in ProgramOpen: ") + e.what());
                }
            }

            void OnOK() override
            {
                deferred_.Resolve(Napi::Number::New(Env(), static_cast<int>(result_status_)));
            }

            void OnError(const Napi::Error &error) override
            {
                deferred_.Reject(error.Value());
            }

        private:
            Napi::Promise::Deferred deferred_;
            std::string file_path_;
            NapiCommandChannel *channel_;
            RCS_STATUS result_status_;

            RCS_STATUS waitCommandComplete()
            {
                return channel_->waitCommandComplete();
            }

            RCS_STATUS handleRemoteFileTransfer(EMC_TASK_PLAN_OPEN &open_msg)
            {
                FILE *fd = fopen(file_path_.c_str(), "rb");
                if (!fd)
                {
                    SetError("Failed to open file: " + file_path_ + " (" + strerror(errno) + ")");
                    return RCS_STATUS::ERROR;
                }

                fseek(fd, 0, SEEK_END);
                long filesize = ftell(fd);
                fseek(fd, 0, SEEK_SET);
                if (filesize < 0)
                {
                    fclose(fd);
                    SetError("Failed to get file size: " + file_path_);
                    return RCS_STATUS::ERROR;
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
                        SetError("Error reading file: " + file_path_);
                        return RCS_STATUS::ERROR;
                    }
                    if (actually_read == 0 && feof(fd) && bytes_read_total < (size_t)filesize)
                    {
                        fclose(fd);
                        SetError("Premature EOF reading file: " + file_path_);
                        return RCS_STATUS::ERROR;
                    }

                    open_msg.remote_buffersize = actually_read;

                    if (channel_->c_channel_->write(&open_msg))
                    {
                        fclose(fd);
                        SetError("Error sending file chunk for: " + file_path_);
                        return RCS_STATUS::ERROR;
                    }

                    last_chunk_status = waitCommandComplete();
                    if (last_chunk_status != RCS_STATUS::DONE)
                    {
                        fclose(fd);
                        SetError("Error sending file chunk (status not DONE) for: " + file_path_);
                        return last_chunk_status;
                    }
                    bytes_read_total += actually_read;
                }

                fclose(fd);
                return last_chunk_status;
            }
        };

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

    // async worker for SetTool command
    class SetToolWorker : public Napi::AsyncWorker
    {
    public:
        SetToolWorker(Napi::Promise::Deferred deferred, const Napi::Object &toolEntry, const std::string &toolTableFilename)
            : AsyncWorker(deferred.Env()), deferred_(deferred), tool_table_filename_(toolTableFilename), result_status_(RCS_STATUS::ERROR)
        {
            // Extract tool data from the toolEntry object
            // toolNo is required
            if (!toolEntry.Has("toolNo") || !toolEntry.Get("toolNo").IsNumber())
            {
                throw std::runtime_error("toolNo is required in toolEntry");
            }
            toolNo_ = toolEntry.Get("toolNo").As<Napi::Number>().Int32Value();

            // Extract optional fields using std::optional
            if (toolEntry.Has("pocketNo") && toolEntry.Get("pocketNo").IsNumber())
                pocketNo_ = toolEntry.Get("pocketNo").As<Napi::Number>().Int32Value();

            if (toolEntry.Has("diameter") && toolEntry.Get("diameter").IsNumber())
                diameter_ = toolEntry.Get("diameter").As<Napi::Number>().DoubleValue();

            if (toolEntry.Has("frontAngle") && toolEntry.Get("frontAngle").IsNumber())
                frontAngle_ = toolEntry.Get("frontAngle").As<Napi::Number>().DoubleValue();

            if (toolEntry.Has("backAngle") && toolEntry.Get("backAngle").IsNumber())
                backAngle_ = toolEntry.Get("backAngle").As<Napi::Number>().DoubleValue();

            if (toolEntry.Has("orientation") && toolEntry.Get("orientation").IsNumber())
                orientation_ = toolEntry.Get("orientation").As<Napi::Number>().Int32Value();

            if (toolEntry.Has("comment") && toolEntry.Get("comment").IsString())
                comment_ = toolEntry.Get("comment").As<Napi::String>().Utf8Value();

            // Handle offset object - extract coordinate values
            if (toolEntry.Has("offset") && toolEntry.Get("offset").IsObject())
            {
                Napi::Object offsetObj = toolEntry.Get("offset").As<Napi::Object>();

                // Process each coordinate type
                for (int i = 0; i < 9; ++i)
                {
                    CoordType coordType = static_cast<CoordType>(i);
                    const char *coordName = getCoordName(coordType);

                    if (offsetObj.Has(coordName) && offsetObj.Get(coordName).IsNumber())
                    {
                        offsetCoords_[coordType] = offsetObj.Get(coordName).As<Napi::Number>().DoubleValue();
                    }
                }
            }
        }

    protected:
        void Execute() override
        {
            try
            {
                // Initialize tool mmap if not already done
                if (tool_mmap_user() != 0)
                {
                    SetError("Failed to initialize tool memory map");
                    return;
                }

                // Find the tool index
                int idx = tooldata_find_index_for_tool(toolNo_);
                bool isNewTool = false;

                if (idx < 0)
                {
                    // Tool not found, look for an empty slot to insert new tool
                    int idxmax = tooldata_last_index_get() + 1;

                    idx = -1; // Reset to indicate not found

                    for (int i = 0; i < idxmax; ++i)
                    {
                        CANON_TOOL_TABLE temp_data;
                        if (tooldata_get(&temp_data, i) == IDX_OK)
                        {
                            // Check if this slot is empty
                            if (temp_data.toolno < 0)
                            {
                                idx = i;
                                isNewTool = true;
                                break;
                            }
                        }
                    }

                    if (idx < 0)
                    {
                        if (idxmax < CANON_POCKETS_MAX)
                        {
                            // no empty slot found, but we can create a new tool
                            idx = idxmax;
                            isNewTool = true;
                        }
                        else
                        {
                            SetError("Tool not found and no empty slot available for tool " + std::to_string(toolNo_));
                            return;
                        }
                    }
                }

                // Get existing tool data or initialize new tool data
                CANON_TOOL_TABLE existingData;
                if (isNewTool)
                {
                    // Initialize new tool entry
                    existingData = tooldata_entry_init();
                    // Set the tool number as it's required for new tools
                    existingData.toolno = toolNo_;
                }
                else
                {
                    // Get existing tool data
                    if (tooldata_get(&existingData, idx) != IDX_OK)
                    {
                        SetError("Failed to get tool data for tool " + std::to_string(toolNo_));
                        return;
                    }
                }

                // Overlay new data on existing data
                // Tool number is always set (required field)
                existingData.toolno = toolNo_;

                if (pocketNo_.has_value())
                    existingData.pocketno = pocketNo_.value();
                if (diameter_.has_value())
                    existingData.diameter = diameter_.value();
                if (frontAngle_.has_value())
                    existingData.frontangle = frontAngle_.value();
                if (backAngle_.has_value())
                    existingData.backangle = backAngle_.value();
                if (orientation_.has_value())
                    existingData.orientation = orientation_.value();
                if (comment_.has_value())
                {
                    strncpy(existingData.comment, comment_.value().c_str(), CANON_TOOL_COMMENT_SIZE - 1);
                    existingData.comment[CANON_TOOL_COMMENT_SIZE - 1] = '\0';
                }

                // Apply offset coordinates that were provided
                for (const auto &[coordType, value] : offsetCoords_)
                {
                    double *coordField = getCoordField(existingData, coordType);
                    if (coordField)
                    {
                        *coordField = value;
                    }
                }

                // Put the updated data back
                if (tooldata_put(existingData, idx) == IDX_FAIL)
                {
                    SetError("Failed to update tool data for tool " + std::to_string(toolNo_));
                    return;
                }

                // Save the tool table using the cached filename
                if (tool_table_filename_.empty())
                {
                    SetError("Tool table filename not available - INI file may not have been parsed");
                    return;
                }

                // Save the tool table
                if (tooldata_save(tool_table_filename_.c_str()) != 0)
                {
                    SetError("Failed to save tool table to " + tool_table_filename_);
                    return;
                }
                else
                {
                    printf("Tool table saved successfully to %s\n", tool_table_filename_.c_str());
                }

                result_status_ = RCS_STATUS::DONE;
            }
            catch (const std::exception &e)
            {
                SetError(std::string("SetTool execution failed: ") + e.what());
            }
        }

        void OnOK() override
        {
            Napi::Env env = Env();
            deferred_.Resolve(Napi::Number::New(env, static_cast<int>(result_status_)));
        }

        void OnError(const Napi::Error &error) override
        {
            deferred_.Reject(error.Value());
        }

    private:
        Napi::Promise::Deferred deferred_;
        int toolNo_;
        std::string tool_table_filename_;
        RCS_STATUS result_status_;

        // Coordinate system using enum for type safety and cleaner code
        enum class CoordType
        {
            X,
            Y,
            Z,
            A,
            B,
            C,
            U,
            V,
            W
        };

        // Use optional for fields that may or may not be provided
        std::optional<int> pocketNo_;
        std::optional<double> diameter_;
        std::optional<double> frontAngle_;
        std::optional<double> backAngle_;
        std::optional<int> orientation_;
        std::optional<std::string> comment_;
        std::map<CoordType, double> offsetCoords_;

        // Helper method to get coordinate field name
        static const char *getCoordName(CoordType type)
        {
            static const std::map<CoordType, const char *> names = {
                {CoordType::X, "x"}, {CoordType::Y, "y"}, {CoordType::Z, "z"}, {CoordType::A, "a"}, {CoordType::B, "b"}, {CoordType::C, "c"}, {CoordType::U, "u"}, {CoordType::V, "v"}, {CoordType::W, "w"}};
            return names.at(type);
        }

        // Helper method to get pointer to coordinate field in CANON_TOOL_TABLE
        static double *getCoordField(CANON_TOOL_TABLE &toolData, CoordType type)
        {
            switch (type)
            {
            case CoordType::X:
                return &toolData.offset.tran.x;
            case CoordType::Y:
                return &toolData.offset.tran.y;
            case CoordType::Z:
                return &toolData.offset.tran.z;
            case CoordType::A:
                return &toolData.offset.a;
            case CoordType::B:
                return &toolData.offset.b;
            case CoordType::C:
                return &toolData.offset.c;
            case CoordType::U:
                return &toolData.offset.u;
            case CoordType::V:
                return &toolData.offset.v;
            case CoordType::W:
                return &toolData.offset.w;
            default:
                return nullptr;
            }
        }
    };

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