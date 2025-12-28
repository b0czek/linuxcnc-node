#pragma once
#include <napi.h>
#include "common.hh"
#include "rcs.hh"
#include "emc.hh"
#include "emc_nml.hh"
#include "tooldata.hh"
#include <memory>
#include <optional>
#include <map>

namespace LinuxCNC
{
    class NapiCommandChannel;

    // AsyncWorker class for handling commands asynchronously
    class CommandWorker : public Napi::AsyncWorker
    {
    public:
        CommandWorker(Napi::Function &callback,
                      NapiCommandChannel *channel,
                      std::unique_ptr<RCS_CMD_MSG> cmd_msg,
                      double timeout);

    protected:
        void Execute() override;
        void OnOK() override;
        void OnError(const Napi::Error &error) override;

    private:
        NapiCommandChannel *channel_;
        std::unique_ptr<RCS_CMD_MSG> cmd_msg_;
        double timeout_;
        int command_serial_;
        RCS_STATUS result_status_;
        std::string error_message_;

        RCS_STATUS waitCommandComplete();
    };

    // AsyncWorker for ProgramOpen command - handles file open / transfer operations (in case of )
    class ProgramOpenWorker : public Napi::AsyncWorker
    {
    public:
        ProgramOpenWorker(const Napi::CallbackInfo &info, std::string file_path, NapiCommandChannel *channel);
        Napi::Promise GetPromise() { return deferred_.Promise(); }

    protected:
        void Execute() override;
        void OnOK() override;
        void OnError(const Napi::Error &error) override;

    private:
        Napi::Promise::Deferred deferred_;
        std::string file_path_;
        NapiCommandChannel *channel_;
        RCS_STATUS result_status_;

        RCS_STATUS waitCommandComplete();
        RCS_STATUS handleRemoteFileTransfer(EMC_TASK_PLAN_OPEN &open_msg);
    };

    // AsyncWorker for SetTool command
    class SetToolWorker : public Napi::AsyncWorker
    {
    public:
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

        SetToolWorker(Napi::Promise::Deferred deferred, const Napi::Object &toolEntry, const std::string &toolTableFilename);

    protected:
        void Execute() override;
        void OnOK() override;
        void OnError(const Napi::Error &error) override;

    private:
        Napi::Promise::Deferred deferred_;
        int toolNo_;
        std::string tool_table_filename_;
        RCS_STATUS result_status_;

        // Use optional for fields that may or may not be provided
        std::optional<int> pocketNo_;
        std::optional<double> diameter_;
        std::optional<double> frontAngle_;
        std::optional<double> backAngle_;
        std::optional<int> orientation_;
        std::optional<std::string> comment_;
        std::map<CoordType, double> offsetCoords_;

        // Helper methods
        static const char *getCoordName(CoordType type);
        static double *getCoordField(CANON_TOOL_TABLE &toolData, CoordType type);
    };

}