#include "command_worker.hh"
#include "command_channel.hh"
#include "timer.hh"
#include "emc.hh"
#include <algorithm>
#include <cstring>
#include <fstream>
#include "cms.hh"
#include "tooldata.hh"
#include "inifile.hh"

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

    // ProgramOpenWorker implementation
    ProgramOpenWorker::ProgramOpenWorker(const Napi::CallbackInfo &info, std::string file_path, NapiCommandChannel *channel)
        : Napi::AsyncWorker(info.Env()),
          deferred_(Napi::Promise::Deferred::New(info.Env())),
          file_path_(std::move(file_path)),
          channel_(channel),
          result_status_(RCS_STATUS::UNINITIALIZED)
    {
    }

    void ProgramOpenWorker::Execute()
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

    void ProgramOpenWorker::OnOK()
    {
        deferred_.Resolve(Napi::Number::New(Env(), static_cast<int>(result_status_)));
    }

    void ProgramOpenWorker::OnError(const Napi::Error &error)
    {
        deferred_.Reject(error.Value());
    }

    RCS_STATUS ProgramOpenWorker::waitCommandComplete()
    {
        return channel_->waitCommandComplete();
    }

    RCS_STATUS ProgramOpenWorker::handleRemoteFileTransfer(EMC_TASK_PLAN_OPEN &open_msg)
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

    // SetToolWorker implementation
    SetToolWorker::SetToolWorker(Napi::Promise::Deferred deferred, const Napi::Object &toolEntry, const std::string &toolTableFilename)
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

    void SetToolWorker::Execute()
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

    void SetToolWorker::OnOK()
    {
        Napi::Env env = Env();
        deferred_.Resolve(Napi::Number::New(env, static_cast<int>(result_status_)));
    }

    void SetToolWorker::OnError(const Napi::Error &error)
    {
        deferred_.Reject(error.Value());
    }

    // Helper method to get coordinate field name
    const char *SetToolWorker::getCoordName(CoordType type)
    {
        static const std::map<CoordType, const char *> names = {
            {CoordType::X, "x"}, {CoordType::Y, "y"}, {CoordType::Z, "z"}, {CoordType::A, "a"}, {CoordType::B, "b"}, {CoordType::C, "c"}, {CoordType::U, "u"}, {CoordType::V, "v"}, {CoordType::W, "w"}};
        return names.at(type);
    }

    // Helper method to get pointer to coordinate field in CANON_TOOL_TABLE
    double *SetToolWorker::getCoordField(CANON_TOOL_TABLE &toolData, CoordType type)
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
}