#pragma once

#include <napi.h>
#include <string>
#include "emccfg.h"
#include "emcpos.h"

namespace LinuxCNC
{

    extern std::string g_nmlFilePath;

    void SetNmlFilePath(const Napi::CallbackInfo &info);
    Napi::Value GetNmlFilePath(const Napi::CallbackInfo &info);
    const char *GetNmlFileCStr();

    // Helper to convert EmcPose to Napi::Object
    Napi::Object EmcPoseToNapiObject(Napi::Env env, const EmcPose &pose);
    // Helper to convert Napi::Object to EmcPose (if ever needed for commands)
    bool NapiObjectToEmcPose(Napi::Env env, Napi::Value value, EmcPose &pose);
    // Helper to overlay partial EmcPose data from Napi::Object onto existing EmcPose
    void OverlayEmcPoseFromNapiObject(Napi::Env env, Napi::Object obj, EmcPose &pose);

    Napi::Array DoubleArrayToNapiArray(Napi::Env env, const double *arr, size_t size);
    Napi::Array IntArrayToNapiArray(Napi::Env env, const int *arr, size_t size);
    Napi::Array BoolArrayToNapiArray(Napi::Env env, const bool *arr, size_t size); // For homed etc.

    // Helper for creating dictionaries (Napi::Object) like Python's dict_add
    template <typename T>
    void DictAdd(Napi::Env env, Napi::Object obj, const char *key, T value);

    void DictAddString(Napi::Env env, Napi::Object obj, const char *key, const char *value);

}