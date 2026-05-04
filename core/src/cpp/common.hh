#pragma once

#include <napi.h>
#include <string>
#include "emccfg.h"
#include "emcpos.h"

namespace LinuxCNC
{
    constexpr int NML_CONNECT_ATTEMPTS = 20;
    constexpr double NML_CONNECT_RETRY_DELAY = 0.1;

    extern std::string g_nmlFilePath;

    void SetNmlFilePath(const Napi::CallbackInfo &info);
    Napi::Value GetNmlFilePath(const Napi::CallbackInfo &info);
    const char *GetNmlFileCStr();

    // Helper to convert EmcPose to Napi::Float64Array (9 elements: x,y,z,a,b,c,u,v,w)
    Napi::Float64Array EmcPoseToNapiFloat64Array(Napi::Env env, const EmcPose &pose);

    Napi::Array DoubleArrayToNapiArray(Napi::Env env, const double *arr, size_t size);
    Napi::Array IntArrayToNapiArray(Napi::Env env, const int *arr, size_t size);
    Napi::Array BoolArrayToNapiArray(Napi::Env env, const bool *arr, size_t size); // For homed etc.

    // Helper for creating dictionaries (Napi::Object) like Python's dict_add
    template <typename T>
    void DictAdd(Napi::Env env, Napi::Object obj, const char *key, T value);

    void DictAddString(Napi::Env env, Napi::Object obj, const char *key, const char *value);

}
