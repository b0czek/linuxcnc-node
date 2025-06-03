#pragma once

#include <napi.h>
#include <string>
#include "emccfg.h"
#include "emcpos.h"

#define LOCAL_SPINDLE_FORWARD (1)
#define LOCAL_SPINDLE_REVERSE (-1)
#define LOCAL_SPINDLE_OFF (0)
#define LOCAL_SPINDLE_INCREASE (10)
#define LOCAL_SPINDLE_DECREASE (11)
#define LOCAL_SPINDLE_CONSTANT (12)

#define LOCAL_MIST_ON (1)
#define LOCAL_MIST_OFF (0)

#define LOCAL_FLOOD_ON (1)
#define LOCAL_FLOOD_OFF (0)

#define LOCAL_BRAKE_ENGAGE (1)
#define LOCAL_BRAKE_RELEASE (0)

#define LOCAL_JOG_STOP (0)
#define LOCAL_JOG_CONTINUOUS (1)
#define LOCAL_JOG_INCREMENT (2)

#define LOCAL_AUTO_RUN (0)
#define LOCAL_AUTO_PAUSE (1)
#define LOCAL_AUTO_RESUME (2)
#define LOCAL_AUTO_STEP (3)
#define LOCAL_AUTO_REVERSE (4)
#define LOCAL_AUTO_FORWARD (5)

namespace LinuxCNC
{

    extern std::string g_nmlFilePath;

    void SetNmlFilePath(const Napi::CallbackInfo &info);
    Napi::Value GetNmlFilePath(const Napi::CallbackInfo &info);
    const char *GetNmlFileCStr();

    // Helper to convert EmcPose to Napi::Object
    Napi::Object EmcPoseToNapiObject(Napi::Env env, const EmcPose &pose);
    // Helper to convert Napi::Object to EmcPose (if needed for commands)
    bool NapiObjectToEmcPose(Napi::Env env, Napi::Value value, EmcPose &pose);

    Napi::Array DoubleArrayToNapiArray(Napi::Env env, const double *arr, size_t size);
    Napi::Array IntArrayToNapiArray(Napi::Env env, const int *arr, size_t size);
    Napi::Array BoolArrayToNapiArray(Napi::Env env, const bool *arr, size_t size); // For homed etc.

    // Helper for creating dictionaries (Napi::Object) like Python's dict_add
    template <typename T>
    void DictAdd(Napi::Env env, Napi::Object obj, const char *key, T value);

    void DictAddString(Napi::Env env, Napi::Object obj, const char *key, const char *value);

} // namespace LinuxCNC
