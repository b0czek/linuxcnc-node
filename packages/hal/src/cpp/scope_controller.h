#pragma once

#include <napi.h>
#include "hal_utils.h"
#include "scope_shm_abi.h"

class ScopeControllerWrapper : public Napi::ObjectWrap<ScopeControllerWrapper> {
public:
    static Napi::Object Init(Napi::Env env, Napi::Object exports);
    ScopeControllerWrapper(const Napi::CallbackInfo &info);
    ~ScopeControllerWrapper();

private:
    static Napi::FunctionReference constructor;
    int component_id_ = 0;
    int shared_memory_id_ = -1;
    scope_shm_control_t *control_ = nullptr;
    scope_data_t *buffer_ = nullptr;
    bool disposed_ = false;

    void EnsureAttached(Napi::Env env);
    void DisposeNative();
    Napi::Value Status(const Napi::CallbackInfo &info);
    Napi::Value Configure(const Napi::CallbackInfo &info);
    Napi::Value Start(const Napi::CallbackInfo &info);
    Napi::Value Stop(const Napi::CallbackInfo &info);
    Napi::Value ForceTrigger(const Napi::CallbackInfo &info);
    Napi::Value Heartbeat(const Napi::CallbackInfo &info);
    Napi::Value Consume(const Napi::CallbackInfo &info);
    Napi::Value Dispose(const Napi::CallbackInfo &info);
};
