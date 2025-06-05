#pragma once
#include <napi.h>
#include "common.hh"
#include "rcs.hh"
#include <memory>

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

}