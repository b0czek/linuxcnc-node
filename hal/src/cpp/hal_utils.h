#pragma once
#include <napi.h>
#include <string>

#include "rtapi.h"
#include "hal.h"
#include "hal_priv.h"

// These are defined in hal_lib.c and exported by liblinuxcnchal.so
// We declare them as extern so our addon can use them.
extern "C" char *hal_shmem_base;
extern "C" hal_data_t *hal_data;

// Helper to throw HalError
inline void ThrowHalError(const Napi::Env &env, const std::string &msg, int hal_errno = 0)
{
    std::string full_msg = "HalError: " + msg;
    if (hal_errno != 0)
    {
        if (hal_errno < 0)
        { // Standard Unix errors are positive, HAL uses negative
            full_msg += " (HAL code: " + std::to_string(hal_errno) + ", " + strerror(-hal_errno) + ")";
        }
        else
        {
            full_msg += " (HAL code: " + std::to_string(hal_errno) + ")";
        }
    }
    Napi::Error::New(env, full_msg).ThrowAsJavaScriptException();
}

// Helper to convert hal_data_u content to Napi::Value
Napi::Value HalDataContentToNapiValue(Napi::Env env, hal_type_t type, void *data_ptr);

// Helper for set_p, set_s string to value conversion
int SetHalValueFromString(hal_type_t type, void *data_target_ptr, const std::string &value_str);