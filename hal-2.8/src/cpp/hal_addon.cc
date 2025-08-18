#include <napi.h>
#include <cstring>
#include <cctype>
#include <cstdlib>
#include <vector>

#include "hal_utils.h"
#include "hal_component.h"

Napi::Value HalDataContentToNapiValue(Napi::Env env, hal_type_t type, void *data_ptr)
{
    if (!data_ptr)
        return env.Null();
    switch (type)
    {
    case HAL_BIT:
        return Napi::Boolean::New(env, *(static_cast<hal_bit_t *>(data_ptr)));
    case HAL_FLOAT:
        return Napi::Number::New(env, *(static_cast<hal_float_t *>(data_ptr)));
    case HAL_S32:
        return Napi::Number::New(env, *(static_cast<hal_s32_t *>(data_ptr)));
    case HAL_U32:
        return Napi::Number::New(env, *(static_cast<hal_u32_t *>(data_ptr)));

    // HAL_PORT skipped
    default:
        ThrowHalError(env, "Unsupported HAL type for JS conversion: " + std::to_string(type));
        return env.Null();
    }
}

int SetHalValueFromString(hal_type_t type, void *data_target_ptr, const std::string &value_str)
{
    int retval = 0;
    char *end_ptr;
    const char *c_str_val = value_str.c_str();

    // Ensure "C" locale for parsing, Python version does this.
    // For C standard library functions like strtod, locale can affect decimal point.
    // This is a complex topic. For now, we assume default locale works or a C locale is set.
    // A more robust solution might involve temporarily setting LC_NUMERIC.

    switch (type)
    {
    case HAL_BIT:
        if (value_str == "1" || strcasecmp(c_str_val, "true") == 0)
        {
            *(static_cast<hal_bit_t *>(data_target_ptr)) = 1;
        }
        else if (value_str == "0" || strcasecmp(c_str_val, "false") == 0)
        {
            *(static_cast<hal_bit_t *>(data_target_ptr)) = 0;
        }
        else
        {
            retval = -EINVAL; // Invalid boolean string
        }
        break;
    case HAL_FLOAT:
        *(static_cast<hal_float_t *>(data_target_ptr)) = strtod(c_str_val, &end_ptr);
        if (*end_ptr != '\0' && !isspace((unsigned char)*end_ptr))
            retval = -EINVAL;
        break;
    case HAL_S32:
        *(static_cast<hal_s32_t *>(data_target_ptr)) = static_cast<hal_s32_t>(strtol(c_str_val, &end_ptr, 0));
        if (*end_ptr != '\0' && !isspace((unsigned char)*end_ptr))
            retval = -EINVAL;
        break;
    case HAL_U32:
        *(static_cast<hal_u32_t *>(data_target_ptr)) = static_cast<hal_u32_t>(strtoul(c_str_val, &end_ptr, 0));
        if (*end_ptr != '\0' && !isspace((unsigned char)*end_ptr))
            retval = -EINVAL;
        break;

    default:
        retval = -EINVAL; // Unsupported type
    }
    return retval;
}

// --- Global HAL Functions exposed on the module ---

Napi::Value ComponentExists(const Napi::CallbackInfo &info)
{
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsString())
    {
        Napi::TypeError::New(env, "String expected for component name").ThrowAsJavaScriptException();
        return env.Null();
    }
    std::string name = info[0].As<Napi::String>().Utf8Value();

    if (!hal_data)
    { // hal_data is initialized by the first hal_init call
        // It's possible no component has been created yet via this addon or elsewhere
        return Napi::Boolean::New(env, false); // Or throw if HAL must be active
    }
    // halpr_find_comp_by_name itself takes the mutex.
    hal_comp_t *comp = halpr_find_comp_by_name(name.c_str());
    return Napi::Boolean::New(env, comp != nullptr);
}

Napi::Value ComponentIsReady(const Napi::CallbackInfo &info)
{
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsString())
    {
        Napi::TypeError::New(env, "String expected for component name").ThrowAsJavaScriptException();
        return env.Null();
    }
    std::string name = info[0].As<Napi::String>().Utf8Value();
    if (!hal_data)
    {
        return Napi::Boolean::New(env, false);
    }
    hal_comp_t *comp = halpr_find_comp_by_name(name.c_str()); // Takes mutex
    return Napi::Boolean::New(env, comp && comp->ready);
}

Napi::Value GetMsgLevel(const Napi::CallbackInfo &info)
{
    Napi::Env env = info.Env();
    return Napi::Number::New(env, rtapi_get_msg_level());
}

Napi::Value SetMsgLevel(const Napi::CallbackInfo &info)
{
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsNumber())
    {
        Napi::TypeError::New(env, "Number expected for message level").ThrowAsJavaScriptException();
        return env.Null();
    }
    int level = info[0].As<Napi::Number>().Int32Value();
    int result = rtapi_set_msg_level(level);
    if (result != 0)
    {
        ThrowHalError(env, "Failed to set message level", result);
    }
    return env.Undefined();
}

Napi::Value ConnectPinToSignal(const Napi::CallbackInfo &info)
{
    Napi::Env env = info.Env();
    if (info.Length() < 2 || !info[0].IsString() || !info[1].IsString())
    {
        Napi::TypeError::New(env, "Two strings expected (pin_name, signal_name)").ThrowAsJavaScriptException();
        return env.Null();
    }
    std::string pin_name = info[0].As<Napi::String>().Utf8Value();
    std::string sig_name = info[1].As<Napi::String>().Utf8Value();

    if (!hal_data)
    {
        ThrowHalError(env, "HAL is not initialized. Create a component first.");
        return env.Null();
    }

    int result = hal_link(pin_name.c_str(), sig_name.c_str()); // Takes mutex
    if (result != 0)
    {
        ThrowHalError(env, "hal_link failed for pin '" + pin_name + "' to signal '" + sig_name + "'", result);
        return env.Null(); // Error already thrown
    }
    return Napi::Boolean::New(env, true);
}

Napi::Value DisconnectPin(const Napi::CallbackInfo &info)
{
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsString())
    {
        Napi::TypeError::New(env, "String expected for pin_name").ThrowAsJavaScriptException();
        return env.Null();
    }
    std::string pin_name = info[0].As<Napi::String>().Utf8Value();
    if (!hal_data)
    {
        ThrowHalError(env, "HAL is not initialized. Create a component first.");
        return env.Null();
    }
    int result = hal_unlink(pin_name.c_str()); // Takes mutex
    if (result != 0)
    {
        ThrowHalError(env, "hal_unlink failed for pin '" + pin_name + "'", result);
        return env.Null();
    }
    return Napi::Boolean::New(env, true);
}

Napi::Value NewSignal(const Napi::CallbackInfo &info)
{
    Napi::Env env = info.Env();
    if (info.Length() < 2 || !info[0].IsString() || !info[1].IsNumber())
    {
        Napi::TypeError::New(env, "String and number expected (signal_name, type)").ThrowAsJavaScriptException();
        return env.Null();
    }
    std::string sig_name = info[0].As<Napi::String>().Utf8Value();
    hal_type_t type = (hal_type_t)info[1].As<Napi::Number>().Int32Value();

    if (!hal_data)
    {
        ThrowHalError(env, "HAL is not initialized. Create a component first.");
        return env.Null();
    }

    int result = hal_signal_new(sig_name.c_str(), type); // Takes mutex
    if (result != 0)
    {
        ThrowHalError(env, "hal_signal_new failed for signal '" + sig_name + "'", result);
        return env.Null();
    }
    return Napi::Boolean::New(env, true);
}

Napi::Value PinHasWriter(const Napi::CallbackInfo &info)
{
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsString())
    {
        Napi::TypeError::New(env, "String expected for pin name").ThrowAsJavaScriptException();
        return env.Null();
    }
    std::string name = info[0].As<Napi::String>().Utf8Value();

    if (!hal_data)
    {
        ThrowHalError(env, "HAL is not initialized. Create a component first.");
        return env.Null();
    }

    rtapi_mutex_get(&(hal_data->mutex));
    hal_pin_t *pin = halpr_find_pin_by_name(name.c_str());
    if (!pin)
    {
        rtapi_mutex_give(&(hal_data->mutex));
        ThrowHalError(env, "Pin '" + name + "' does not exist");
        return env.Null();
    }

    bool has_writer = false;

    if (pin->signal)
    { // pin->signal is an offset
        hal_sig_t *signal = (hal_sig_t *)SHMPTR(pin->signal);
        has_writer = (signal->writers > 0);
    }

    rtapi_mutex_give(&(hal_data->mutex));
    return Napi::Boolean::New(env, has_writer);
}

Napi::Value GetValue(const Napi::CallbackInfo &info)
{
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsString())
    {
        Napi::TypeError::New(env, "String name expected for get_value").ThrowAsJavaScriptException();
        return env.Null();
    }
    std::string name = info[0].As<Napi::String>().Utf8Value();

    if (!hal_data)
    {
        ThrowHalError(env, "HAL not initialized for get_value");
        return env.Null();
    }

    // This logic is from _hal.so's get_value which is similar to halcmd's logic
    rtapi_mutex_get(&(hal_data->mutex)); // Protect access to HAL lists and data

    hal_param_t *param = halpr_find_param_by_name(name.c_str());
    if (param)
    {
        void *d_ptr = SHMPTR(param->data_ptr);
        Napi::Value val = HalDataContentToNapiValue(env, param->type, d_ptr);
        rtapi_mutex_give(&(hal_data->mutex));
        return val;
    }

    hal_pin_t *pin = halpr_find_pin_by_name(name.c_str());
    if (pin)
    {
        void *d_ptr;
        if (pin->signal != 0)
        { // Pin is connected to a signal
            hal_sig_t *sig = (hal_sig_t *)SHMPTR(pin->signal);
            d_ptr = SHMPTR(sig->data_ptr);
        }
        else
        { // Pin is not connected, use its internal dummy signal storage
            d_ptr = &(pin->dummysig);
        }
        Napi::Value val = HalDataContentToNapiValue(env, pin->type, d_ptr);
        rtapi_mutex_give(&(hal_data->mutex));
        return val;
    }

    hal_sig_t *sig = halpr_find_sig_by_name(name.c_str());
    if (sig)
    {
        void *d_ptr = SHMPTR(sig->data_ptr);
        Napi::Value val = HalDataContentToNapiValue(env, sig->type, d_ptr);
        rtapi_mutex_give(&(hal_data->mutex));
        return val;
    }

    rtapi_mutex_give(&(hal_data->mutex));
    ;
    ThrowHalError(env, "get_value: Pin, param, or signal '" + name + "' not found.");
    return env.Null();
}

Napi::Value SetP(const Napi::CallbackInfo &info)
{
    Napi::Env env = info.Env();
    if (info.Length() < 2 || !info[0].IsString() || !info[1].IsString())
    {
        Napi::TypeError::New(env, "Expected name (string) and value (string) for set_p").ThrowAsJavaScriptException();
        return env.Null();
    }
    std::string name = info[0].As<Napi::String>().Utf8Value();
    std::string value_str = info[1].As<Napi::String>().Utf8Value();

    if (!hal_data)
    {
        ThrowHalError(env, "HAL not initialized for set_p");
        return env.Null();
    }

    rtapi_mutex_get(&(hal_data->mutex));

    hal_param_t *param = halpr_find_param_by_name(name.c_str());
    hal_pin_t *pin = nullptr; // Initialize to avoid uninitialized use warning
    hal_type_t type;
    void *d_ptr; // Pointer to the actual data to be modified

    if (param)
    { // It's a parameter
        type = param->type;
        d_ptr = SHMPTR(param->data_ptr);
    }
    else
    { // Not a param, try pin
        pin = halpr_find_pin_by_name(name.c_str());
        if (!pin)
        {
            rtapi_mutex_give(&(hal_data->mutex));
            ThrowHalError(env, "set_p: Pin/param '" + name + "' not found");
            return env.Null();
        }
        // It's a pin
        type = pin->type;
        if (pin->dir == HAL_OUT)
        {
            rtapi_mutex_give(&(hal_data->mutex));
            ThrowHalError(env, "set_p: Pin '" + name + "' is an OUT pin (not writable by set_p)");
            return env.Null();
        }
        if (pin->signal != 0)
        { // Pin is connected
            rtapi_mutex_give(&(hal_data->mutex));
            ThrowHalError(env, "set_p: Pin '" + name + "' is connected to a signal, cannot set directly");
            return env.Null();
        }
        // Write to the pin's internal dummysig storage
        d_ptr = &(pin->dummysig);
    }

    int retval = SetHalValueFromString(type, d_ptr, value_str);
    rtapi_mutex_give(&(hal_data->mutex));

    if (retval != 0)
    {
        ThrowHalError(env, "set_p: Failed to set pin/param '" + name + "' to value '" + value_str + "'", retval);
        return env.Null();
    }
    return Napi::Boolean::New(env, true);
}

Napi::Value SetS(const Napi::CallbackInfo &info)
{
    Napi::Env env = info.Env();
    if (info.Length() < 2 || !info[0].IsString() || !info[1].IsString())
    {
        Napi::TypeError::New(env, "Expected signal name (string) and value (string) for set_s").ThrowAsJavaScriptException();
        return env.Null();
    }
    std::string name = info[0].As<Napi::String>().Utf8Value();
    std::string value_str = info[1].As<Napi::String>().Utf8Value();

    if (!hal_data)
    {
        ThrowHalError(env, "HAL not initialized for set_s");
        return env.Null();
    }

    rtapi_mutex_get(&(hal_data->mutex));

    hal_sig_t *sig = halpr_find_sig_by_name(name.c_str());
    if (!sig)
    {
        rtapi_mutex_give(&(hal_data->mutex));
        ThrowHalError(env, "set_s: Signal '" + name + "' not found");
        return env.Null();
    }

    // Python _hal.so also checks for HAL_PORT type, we are skipping PORTs for now
    if (sig->writers > 0)
    {
        rtapi_mutex_give(&(hal_data->mutex));
        ThrowHalError(env, "set_s: Signal '" + name + "' already has writer(s)");
        return env.Null();
    }

    void *d_ptr = SHMPTR(sig->data_ptr);
    int retval = SetHalValueFromString(sig->type, d_ptr, value_str);
    rtapi_mutex_give(&(hal_data->mutex));

    if (retval != 0)
    {
        ThrowHalError(env, "set_s: Failed to set signal '" + name + "' to value '" + value_str + "'", retval);
        return env.Null();
    }
    return Napi::Boolean::New(env, true);
}

Napi::Object InitModule(Napi::Env env, Napi::Object exports)
{
    // Initialize HalComponentWrapper (registers the class "HalComponent")
    HalComponentWrapper::Init(env, exports); // exports will get "HalComponent" property

    // Global functions
    exports.Set(Napi::String::New(env, "component_exists"), Napi::Function::New(env, ComponentExists));
    exports.Set(Napi::String::New(env, "component_is_ready"), Napi::Function::New(env, ComponentIsReady));
    exports.Set(Napi::String::New(env, "get_msg_level"), Napi::Function::New(env, GetMsgLevel));
    exports.Set(Napi::String::New(env, "set_msg_level"), Napi::Function::New(env, SetMsgLevel));
    exports.Set(Napi::String::New(env, "connect"), Napi::Function::New(env, ConnectPinToSignal));
    exports.Set(Napi::String::New(env, "disconnect"), Napi::Function::New(env, DisconnectPin));
    exports.Set(Napi::String::New(env, "new_sig"), Napi::Function::New(env, NewSignal));
    exports.Set(Napi::String::New(env, "pin_has_writer"), Napi::Function::New(env, PinHasWriter));
    exports.Set(Napi::String::New(env, "get_value"), Napi::Function::New(env, GetValue));
    exports.Set(Napi::String::New(env, "set_p"), Napi::Function::New(env, SetP));
    exports.Set(Napi::String::New(env, "set_s"), Napi::Function::New(env, SetS));

    // Constants
    exports.Set("HAL_BIT", Napi::Number::New(env, HAL_BIT));
    exports.Set("HAL_FLOAT", Napi::Number::New(env, HAL_FLOAT));
    exports.Set("HAL_S32", Napi::Number::New(env, HAL_S32));
    exports.Set("HAL_U32", Napi::Number::New(env, HAL_U32));

    exports.Set("HAL_IN", Napi::Number::New(env, HAL_IN));
    exports.Set("HAL_OUT", Napi::Number::New(env, HAL_OUT));
    exports.Set("HAL_IO", Napi::Number::New(env, HAL_IO));

    exports.Set("HAL_RO", Napi::Number::New(env, HAL_RO));
    exports.Set("HAL_RW", Napi::Number::New(env, HAL_RW));

    exports.Set("MSG_NONE", Napi::Number::New(env, RTAPI_MSG_NONE));
    exports.Set("MSG_ERR", Napi::Number::New(env, RTAPI_MSG_ERR));
    exports.Set("MSG_WARN", Napi::Number::New(env, RTAPI_MSG_WARN));
    exports.Set("MSG_INFO", Napi::Number::New(env, RTAPI_MSG_INFO));
    exports.Set("MSG_DBG", Napi::Number::New(env, RTAPI_MSG_DBG));
    exports.Set("MSG_ALL", Napi::Number::New(env, RTAPI_MSG_ALL));

    return exports;
}

NODE_API_MODULE(hal_addon, InitModule)