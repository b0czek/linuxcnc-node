#include "command_channel.hh"
#include "command_worker.hh"
#include "common.hh"
#include <cstring>
#include <algorithm>
#include <unistd.h>
#include <memory>
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

    Napi::Value NapiCommandChannel::SetMode(const Napi::CallbackInfo &info)
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
    Napi::Value NapiCommandChannel::SpindleConstant(const Napi::CallbackInfo &info)
    {
        auto msg = std::make_unique<EMC_SPINDLE_CONSTANT>();
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
        auto msg = std::make_unique<EMC_TOOL_SET_OFFSET>();
        msg->toolno = info[0].As<Napi::Number>().Int32Value();
        msg->offset.tran.z = info[1].As<Napi::Number>().DoubleValue();
        msg->offset.tran.x = info[2].As<Napi::Number>().DoubleValue();
        msg->diameter = info[3].As<Napi::Number>().DoubleValue();
        msg->frontangle = info[4].As<Napi::Number>().DoubleValue();
        msg->backangle = info[5].As<Napi::Number>().DoubleValue();
        msg->orientation = info[6].As<Napi::Number>().Int32Value();
        // Other offsets (Y, A, B, C, U, V, W) default to 0 as per Python binding
        msg->offset.tran.y = 0.0;
        msg->offset.a = 0.0;
        msg->offset.b = 0.0;
        msg->offset.c = 0.0;
        msg->offset.u = 0.0;
        msg->offset.v = 0.0;
        msg->offset.w = 0.0;
        msg->pocket = msg->toolno; // Often pocket == toolno, though not always. Original Python binding seems to imply this for this specific command.
                                   // Or, if toolno is always what matters for setting the offset, pocket might not be used by this specific LCNC message processor.
        std::unique_ptr<RCS_CMD_MSG> cmd_msg(static_cast<RCS_CMD_MSG *>(msg.release()));
        return sendCommandAsync(info, std::move(cmd_msg));
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