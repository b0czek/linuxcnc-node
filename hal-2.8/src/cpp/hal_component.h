#pragma once
#include <napi.h>
#include <string>
#include <map>
#include "hal_utils.h"

union paramunion
{
    hal_bit_t b;
    hal_u32_t u32;
    hal_s32_t s32;
    hal_float_t f;
};

// Structure to hold internal representation of a pin/param for this component
struct HalItemInternal
{
    std::string name_suffix; // Name relative to component prefix (e.g., "in1")
    std::string full_name;   // Full HAL name (e.g., "mycomp.in1")
    hal_type_t type;
    bool is_pin;

    // Store direction directly using HAL's enum types
    hal_pin_dir_t pin_dir;     // Used if is_pin == true
    hal_param_dir_t param_dir; // Used if is_pin == false

    // hal_malloced data ptr
    void *data_address_location;

    HalItemInternal() : type(HAL_TYPE_UNSPECIFIED),
                        is_pin(false),
                        pin_dir(HAL_DIR_UNSPECIFIED),
                        param_dir(static_cast<hal_param_dir_t>(0)), // Some default
                        data_address_location(nullptr)
    {
    }
};

class HalComponentWrapper : public Napi::ObjectWrap<HalComponentWrapper>
{
public:
    static Napi::Object Init(Napi::Env env, Napi::Object exports);
    HalComponentWrapper(const Napi::CallbackInfo &info);
    ~HalComponentWrapper();

    Napi::Value NewPin(const Napi::CallbackInfo &info);
    Napi::Value NewParam(const Napi::CallbackInfo &info);
    Napi::Value Ready(const Napi::CallbackInfo &info);

    Napi::Value JsGetProperty(const Napi::CallbackInfo &info);
    Napi::Value JsSetProperty(const Napi::CallbackInfo &info);

    Napi::Value GetComponentNameJs(const Napi::CallbackInfo &info);
    Napi::Value GetPrefixJs(const Napi::CallbackInfo &info);

private:
    static Napi::FunctionReference constructor;

    std::string component_name_;
    std::string prefix_;
    int hal_id_;
    bool is_hal_ready_state_;

    std::map<std::string, HalItemInternal> items_; // Owned items

    // Pointers to the component's local storage for pins.
    // These are the **addresses** that hal_pin_new needs.
    // std::map<std::string, void*> pin_data_ptr_storage_map_; // Maps suffix to e.g. &this->local_float_pin_ptr

    Napi::Value CreateItem(const Napi::CallbackInfo &info, bool is_pin_type);
    HalItemInternal *FindItemBySuffix(const std::string &name_suffix);

    Napi::Value GetItemValueInternal(const Napi::Env &env, HalItemInternal *item);
    void SetItemValueInternal(const Napi::Env &env, HalItemInternal *item, const Napi::Value &js_value);
};