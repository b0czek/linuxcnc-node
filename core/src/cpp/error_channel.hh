#pragma once
#include <napi.h>
#include "common.hh"
#include "nml.hh"
#include "emc_nml.hh"

namespace LinuxCNC
{

    class NapiErrorChannel : public Napi::ObjectWrap<NapiErrorChannel>
    {
    public:
        static Napi::Object Init(Napi::Env env, Napi::Object exports);
        NapiErrorChannel(const Napi::CallbackInfo &info);
        ~NapiErrorChannel();

    private:
        static Napi::FunctionReference constructor;
        NML *c_channel_ = nullptr;

        bool connect();
        void disconnect();

        Napi::Value Poll(const Napi::CallbackInfo &info);
        Napi::Value Disconnect(const Napi::CallbackInfo &info);
    };

}