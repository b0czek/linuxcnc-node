#include "command_worker.hh"
#include "command_channel.hh"
#include "timer.hh"
#include "emc.hh"
#include <algorithm>

#define EMC_COMMAND_TIMEOUT_DEFAULT 5.0
#define EMC_COMMAND_DELAY_DEFAULT 0.01

namespace LinuxCNC
{

    CommandWorker::CommandWorker(Napi::Function &callback,
                                 NapiCommandChannel *channel,
                                 std::unique_ptr<RCS_CMD_MSG> cmd_msg,
                                 double timeout)
        : Napi::AsyncWorker(callback),
          channel_(channel),
          cmd_msg_(std::move(cmd_msg)),
          timeout_(timeout),
          command_serial_(0),
          result_status_(RCS_STATUS::UNINITIALIZED)
    {
        command_serial_ = cmd_msg_->serial_number;
    }

    void CommandWorker::Execute()
    {
        result_status_ = waitCommandComplete();
    }

    void CommandWorker::OnOK()
    {
        Napi::Env env = Env();
        Napi::HandleScope scope(env);

        // Call the callback with the result status
        Callback().Call({Napi::Number::New(env, static_cast<int>(result_status_))});
    }

    void CommandWorker::OnError(const Napi::Error &error)
    {
        Napi::Env env = Env();
        Napi::HandleScope scope(env);

        // Call the callback with error in second parameter
        Callback().Call({env.Undefined(),
                         error.Value()});
    }

    RCS_STATUS CommandWorker::waitCommandComplete()
    {
        double start = etime();
        do
        {
            double now = etime();
            if (channel_->s_channel_->peek() == EMC_STAT_TYPE)
            {
                EMC_STAT *stat = static_cast<EMC_STAT *>(channel_->s_channel_->get_address());
                if (stat)
                {
                    int serial_diff = stat->echo_serial_number - command_serial_;
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
            esleep(std::min(timeout_ - (now - start), EMC_COMMAND_DELAY_DEFAULT));
        } while (etime() - start < timeout_);
        return RCS_STATUS::UNINITIALIZED; // Timeout
    }

}