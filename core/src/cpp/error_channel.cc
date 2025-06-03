#include "error_channel.hh"
#include "common.hh"
#include <cstring>
#include <cinttypes>

namespace LinuxCNC
{

    Napi::FunctionReference NapiErrorChannel::constructor;

    Napi::Object NapiErrorChannel::Init(Napi::Env env, Napi::Object exports)
    {
        Napi::HandleScope scope(env);
        Napi::Function func = DefineClass(env, "NativeErrorChannel", {
                                                                         InstanceMethod("poll", &NapiErrorChannel::Poll),
                                                                     });
        constructor = Napi::Persistent(func);
        constructor.SuppressDestruct();
        exports.Set("NativeErrorChannel", func);
        return exports;
    }

    NapiErrorChannel::NapiErrorChannel(const Napi::CallbackInfo &info) : Napi::ObjectWrap<NapiErrorChannel>(info)
    {
        Napi::Env env = info.Env();
        if (!connect())
        {
            Napi::Error::New(env, "Failed to connect to LinuxCNC error channel").ThrowAsJavaScriptException();
        }
    }

    NapiErrorChannel::~NapiErrorChannel()
    {
        disconnect();
    }

    bool NapiErrorChannel::connect()
    {
        if (c_channel_)
            return true;
        const char *nml_file = GetNmlFileCStr();
        c_channel_ = new NML(emcFormat, "emcError", "linuxcnc-node-err", nml_file);
        if (!c_channel_ || !c_channel_->valid())
        {
            delete c_channel_;
            c_channel_ = nullptr;
            return false;
        }
        return true;
    }

    void NapiErrorChannel::disconnect()
    {
        delete c_channel_;
        c_channel_ = nullptr;
    }

    Napi::Value NapiErrorChannel::Poll(const Napi::CallbackInfo &info)
    {
        Napi::Env env = info.Env();
        if (!c_channel_ || !c_channel_->valid())
        {
            if (!connect())
            {
                Napi::Error::New(env, "Error channel not connected.").ThrowAsJavaScriptException();
                return env.Null();
            }
        }

        NMLTYPE type = c_channel_->read();
        if (type == 0)
        { // No new error
            return env.Null();
        }

        Napi::Object errObj = Napi::Object::New(env);
        errObj.Set("type", Napi::Number::New(env, static_cast<int32_t>(type)));

        char error_string[LINELEN];
        error_string[0] = '\0'; // Initialize

        // #define EXTRACT_ERROR_STRING(msg_type_struct, field)                                                        \
//     strncpy(error_string, (static_cast<msg_type_struct *>(c_channel_->get_address()))->field, LINELEN - 1); \
//     error_string[LINELEN - 1] = 0;

        //         switch (type)
        //         {
        //         case EMC_OPERATOR_ERROR_TYPE:
        //             EXTRACT_ERROR_STRING(EMC_OPERATOR_ERROR, error);
        //             break;
        //         case EMC_OPERATOR_TEXT_TYPE:
        //             EXTRACT_ERROR_STRING(EMC_OPERATOR_TEXT, text);
        //             break;
        //         case EMC_OPERATOR_DISPLAY_TYPE:
        //             EXTRACT_ERROR_STRING(EMC_OPERATOR_DISPLAY, display);
        //             break;
        //         case NML_ERROR_TYPE: // These are NML class types, not EMC_NML specifically
        //             EXTRACT_ERROR_STRING(NML_ERROR, error);
        //             break;
        //         case NML_TEXT_TYPE:
        //             EXTRACT_ERROR_STRING(NML_TEXT, text);
        //             break;
        //         case NML_DISPLAY_TYPE:
        //             EXTRACT_ERROR_STRING(NML_DISPLAY, display);
        //             break;
        //         default:
        //             snprintf(error_string, sizeof(error_string), "Unrecognized error type %" PRId32, type);
        //             break;
        //         }
        // #undef EXTRACT_ERROR_STRING

        errObj.Set("message", Napi::String::New(env, error_string));
        return errObj;
    }

} // namespace LinuxCNC