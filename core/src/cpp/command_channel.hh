#pragma once
#include <napi.h>
#include "common.hh"
#include "rcs.hh"
#include "emc.hh"
#include "emc_nml.hh"
#include "timer.hh"
#include "command_worker.hh"
#include <memory>

namespace LinuxCNC
{

    class NapiCommandChannel : public Napi::ObjectWrap<NapiCommandChannel>
    {
    public:
        static Napi::Object Init(Napi::Env env, Napi::Object exports);
        NapiCommandChannel(const Napi::CallbackInfo &info);
        ~NapiCommandChannel();

    private:
        static Napi::FunctionReference constructor;

        // Allow CommandWorker to access private members
        friend class CommandWorker;

        RCS_CMD_CHANNEL *c_channel_ = nullptr;
        RCS_STAT_CHANNEL *s_channel_ = nullptr; // For echo checking
        int last_serial_ = 0;

        bool connect();
        void disconnect();

        // Helper for sending commands asynchronously
        Napi::Value sendCommandAsync(const Napi::CallbackInfo &info, std::unique_ptr<RCS_CMD_MSG> cmd_msg, double timeout = 5.0);

        // Helper methods for command completion waiting
        RCS_STATUS waitCommandComplete();
        RCS_STATUS waitCommandComplete(double timeout);

        // --- NAPI Wrapped Methods ---
        // Task Commands
        Napi::Value SetTaskMode(const Napi::CallbackInfo &info);
        Napi::Value SetState(const Napi::CallbackInfo &info);
        Napi::Value TaskPlanSynch(const Napi::CallbackInfo &info);
        Napi::Value ResetInterpreter(const Napi::CallbackInfo &info);
        Napi::Value ProgramOpen(const Napi::CallbackInfo &info);
        // auto commands
        Napi::Value RunProgram(const Napi::CallbackInfo &info);
        Napi::Value PauseProgram(const Napi::CallbackInfo &info);
        Napi::Value ResumeProgram(const Napi::CallbackInfo &info);
        Napi::Value StepProgram(const Napi::CallbackInfo &info);
        Napi::Value ReverseProgram(const Napi::CallbackInfo &info);
        Napi::Value ForwardProgram(const Napi::CallbackInfo &info);
        Napi::Value AbortTask(const Napi::CallbackInfo &info);
        Napi::Value SetOptionalStop(const Napi::CallbackInfo &info);
        Napi::Value SetBlockDelete(const Napi::CallbackInfo &info);
        Napi::Value Mdi(const Napi::CallbackInfo &info);

        // Trajectory Commands
        Napi::Value SetTrajMode(const Napi::CallbackInfo &info);
        Napi::Value SetMaxVelocity(const Napi::CallbackInfo &info);
        Napi::Value SetFeedRate(const Napi::CallbackInfo &info);        // Feed override scale
        Napi::Value SetRapidRate(const Napi::CallbackInfo &info);       // Rapid override scale
        Napi::Value SetSpindleOverride(const Napi::CallbackInfo &info); // Spindle override scale
        Napi::Value OverrideLimits(const Napi::CallbackInfo &info);
        Napi::Value TeleopEnable(const Napi::CallbackInfo &info);
        Napi::Value SetFeedOverrideEnable(const Napi::CallbackInfo &info);
        Napi::Value SetSpindleOverrideEnable(const Napi::CallbackInfo &info);
        Napi::Value SetFeedHoldEnable(const Napi::CallbackInfo &info);
        Napi::Value SetAdaptiveFeedEnable(const Napi::CallbackInfo &info);

        // Joint Commands
        Napi::Value HomeJoint(const Napi::CallbackInfo &info);
        Napi::Value UnhomeJoint(const Napi::CallbackInfo &info);
        Napi::Value JogStop(const Napi::CallbackInfo &info);
        Napi::Value JogContinuous(const Napi::CallbackInfo &info);
        Napi::Value JogIncrement(const Napi::CallbackInfo &info);
        Napi::Value SetMinPositionLimit(const Napi::CallbackInfo &info);
        Napi::Value SetMaxPositionLimit(const Napi::CallbackInfo &info);

        // Spindle Commands
        Napi::Value SpindleOn(const Napi::CallbackInfo &info); // Covers forward, reverse, speed
        Napi::Value SpindleIncrease(const Napi::CallbackInfo &info);
        Napi::Value SpindleDecrease(const Napi::CallbackInfo &info);
        Napi::Value SpindleOff(const Napi::CallbackInfo &info);
        Napi::Value SpindleBrake(const Napi::CallbackInfo &info); // engage/release

        // Coolant Commands
        Napi::Value SetMist(const Napi::CallbackInfo &info);
        Napi::Value SetFlood(const Napi::CallbackInfo &info);

        // Tool Commands
        Napi::Value LoadToolTable(const Napi::CallbackInfo &info);
        Napi::Value SetToolOffset(const Napi::CallbackInfo &info);

        // IO Commands
        Napi::Value SetDigitalOutput(const Napi::CallbackInfo &info);
        Napi::Value SetAnalogOutput(const Napi::CallbackInfo &info);

        // Debug & Message Commands
        Napi::Value SetDebugLevel(const Napi::CallbackInfo &info);
        Napi::Value SendOperatorError(const Napi::CallbackInfo &info);
        Napi::Value SendOperatorText(const Napi::CallbackInfo &info);
        Napi::Value SendOperatorDisplay(const Napi::CallbackInfo &info);

        // Misc
        Napi::Value WaitComplete(const Napi::CallbackInfo &info);
        Napi::Value GetSerial(const Napi::CallbackInfo &info);
    };

}