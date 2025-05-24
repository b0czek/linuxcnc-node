#include "hal_component.h"

Napi::FunctionReference HalComponentWrapper::constructor;

Napi::Object HalComponentWrapper::Init(Napi::Env env, Napi::Object exports)
{
    Napi::HandleScope scope(env);
    Napi::Function func = DefineClass(env, "HalComponent", {
                                                               InstanceMethod("newPin", &HalComponentWrapper::NewPin),
                                                               InstanceMethod("newParam", &HalComponentWrapper::NewParam),
                                                               InstanceMethod("ready", &HalComponentWrapper::Ready),
                                                               InstanceMethod("unready", &HalComponentWrapper::Unready),
                                                               InstanceMethod("getProperty", &HalComponentWrapper::JsGetProperty),
                                                               InstanceMethod("setProperty", &HalComponentWrapper::JsSetProperty),
                                                               InstanceAccessor("name", &HalComponentWrapper::GetComponentNameJs, nullptr),
                                                               InstanceAccessor("prefix", &HalComponentWrapper::GetPrefixJs, nullptr),
                                                           });
    constructor = Napi::Persistent(func);
    constructor.SuppressDestruct();
    exports.Set("HalComponent", func);
    return exports;
}

HalComponentWrapper::HalComponentWrapper(const Napi::CallbackInfo &info) : Napi::ObjectWrap<HalComponentWrapper>(info)
{
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsString())
    {
        Napi::TypeError::New(env, "Component name (string) required").ThrowAsJavaScriptException();
        return;
    }
    this->component_name_ = info[0].As<Napi::String>().Utf8Value();
    this->prefix_ = (info.Length() > 1 && info[1].IsString()) ? info[1].As<Napi::String>().Utf8Value() : this->component_name_;
    this->is_hal_ready_state_ = false;

    this->hal_id_ = hal_init(this->component_name_.c_str());
    if (this->hal_id_ <= 0)
    {
        ThrowHalError(env, "hal_init failed for component '" + this->component_name_ + "'", this->hal_id_);
        this->hal_id_ = 0;
    }
}

HalComponentWrapper::~HalComponentWrapper()
{
    if (this->hal_id_ > 0)
    {
        // The critical part is that hal_exit() will clean up pins and parameters
        // registered with HAL using this->hal_id_.
        hal_exit(this->hal_id_);
        this->hal_id_ = 0;
    }
}

Napi::Value HalComponentWrapper::GetComponentNameJs(const Napi::CallbackInfo &info)
{
    return Napi::String::New(info.Env(), this->component_name_);
}
Napi::Value HalComponentWrapper::GetPrefixJs(const Napi::CallbackInfo &info)
{
    return Napi::String::New(info.Env(), this->prefix_);
}

Napi::Value HalComponentWrapper::NewPin(const Napi::CallbackInfo &info)
{
    return CreateItem(info, true);
}
Napi::Value HalComponentWrapper::NewParam(const Napi::CallbackInfo &info)
{
    return CreateItem(info, false);
}

Napi::Value HalComponentWrapper::CreateItem(const Napi::CallbackInfo &info, bool is_pin_type)
{
    Napi::Env env = info.Env();
    if (this->hal_id_ <= 0)
    {
        ThrowHalError(env, "Component is not initialized");
        return env.Null();
    }
    if (this->is_hal_ready_state_)
    {
        ThrowHalError(env, "Cannot add items after component is ready. Call unready() first.");
        return env.Null();
    }
    if (info.Length() < 3 || !info[0].IsString() || !info[1].IsNumber() || !info[2].IsNumber())
    {
        Napi::TypeError::New(env, "Expected: name_suffix (string), type (HalType), direction (HalPinDir/HalParamDir)").ThrowAsJavaScriptException();
        return env.Null();
    }

    std::string name_suffix = info[0].As<Napi::String>().Utf8Value();
    hal_type_t item_type = static_cast<hal_type_t>(info[1].As<Napi::Number>().Int32Value());
    int dir_val = info[2].As<Napi::Number>().Int32Value();

    if (items_.count(name_suffix))
    {
        ThrowHalError(env, "Duplicate item name_suffix '" + name_suffix + "' for this component");
        return env.Null();
    }

    std::string full_item_name = this->prefix_ + "." + name_suffix;
    if (full_item_name.length() > HAL_NAME_LEN)
    {
        ThrowHalError(env, "Full item name '" + full_item_name + "' exceeds HAL_NAME_LEN");
        return env.Null();
    }

    // Create the item in the map first to get a stable address for its members
    HalItemInternal &new_item_ref = items_[name_suffix]; // This creates or finds

    new_item_ref.name_suffix = name_suffix;
    new_item_ref.full_name = full_item_name;
    new_item_ref.type = item_type;
    new_item_ref.is_pin = is_pin_type;

    int result;
    if (is_pin_type)
    {
        new_item_ref.pin_dir = static_cast<hal_pin_dir_t>(dir_val);

        new_item_ref.data_address_location = hal_malloc(sizeof(void *)); // Allocate space for one pointer
        if (!new_item_ref.data_address_location)
        {
            ThrowHalError(env, "hal_malloc failed for pin's data pointer storage", -ENOMEM);
            items_.erase(name_suffix); // Clean up map entry
            return env.Null();
        }

        result = hal_pin_new(
            full_item_name.c_str(),
            item_type,
            new_item_ref.pin_dir,
            static_cast<void **>(new_item_ref.data_address_location), // Pass the address of the slot
            this->hal_id_);
    }
    else
    { // Parameter
        new_item_ref.param_dir = static_cast<hal_param_dir_t>(dir_val);

        new_item_ref.data_address_location = hal_malloc(sizeof(paramunion)); // Allocate space
        if (!new_item_ref.data_address_location)
        {
            ThrowHalError(env, "hal_malloc failed for params's data storage", -ENOMEM);
            items_.erase(name_suffix); // Clean up map entry
            return env.Null();
        }

        result = hal_param_new(
            full_item_name.c_str(),
            item_type,
            new_item_ref.param_dir,
            new_item_ref.data_address_location, // Pass the address of the storage
            this->hal_id_);
    }

    if (result != 0)
    {
        if (is_pin_type && new_item_ref.data_address_location)
        {
            // If hal_pin_new failed, the hal_malloc'd space for the pointer might be orphaned.
            // HAL's memory model is tricky; hal_malloc'd memory is globally managed.
            // We don't explicitly free it here.
        }
        items_.erase(name_suffix); // Remove the partially constructed item from our map
        ThrowHalError(env, std::string(is_pin_type ? "hal_pin_new" : "hal_param_new") + " failed for '" + full_item_name + "'", result);
        return env.Null();
    }

    return Napi::Boolean::New(env, true);
}

Napi::Value HalComponentWrapper::Ready(const Napi::CallbackInfo &info)
{
    Napi::Env env = info.Env();
    if (this->hal_id_ <= 0)
    {
        ThrowHalError(env, "Component not initialized");
        return env.Null();
    }
    int result = hal_ready(this->hal_id_);
    if (result != 0)
    {
        ThrowHalError(env, "hal_ready failed", result);
        return env.Null();
    }
    this->is_hal_ready_state_ = true;
    return env.Undefined();
}

Napi::Value HalComponentWrapper::Unready(const Napi::CallbackInfo &info)
{
    Napi::Env env = info.Env();
    if (this->hal_id_ <= 0)
    {
        ThrowHalError(env, "Component not initialized");
        return env.Null();
    }
    int result = hal_unready(this->hal_id_);
    if (result != 0)
    {
        ThrowHalError(env, "hal_unready failed", result);
        return env.Null();
    }
    this->is_hal_ready_state_ = false;
    return env.Undefined();
}

HalItemInternal *HalComponentWrapper::FindItemBySuffix(const std::string &name_suffix)
{
    auto it = items_.find(name_suffix);
    return (it != items_.end()) ? &(it->second) : nullptr;
}

Napi::Value HalComponentWrapper::JsGetProperty(const Napi::CallbackInfo &info)
{
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsString())
    {
        Napi::TypeError::New(env, "Property name (string) expected for getProperty").ThrowAsJavaScriptException();
        return env.Null();
    }
    std::string name_suffix = info[0].As<Napi::String>().Utf8Value();
    HalItemInternal *item = FindItemBySuffix(name_suffix);
    if (!item)
    {
        ThrowHalError(env, "Item '" + name_suffix + "' not found on component '" + this->component_name_ + "'");
        return env.Null();
    }
    return GetItemValueInternal(env, item);
}

Napi::Value HalComponentWrapper::JsSetProperty(const Napi::CallbackInfo &info)
{
    Napi::Env env = info.Env();
    if (info.Length() < 2 || !info[0].IsString())
    {
        Napi::TypeError::New(env, "Property name (string) and value expected for setProperty").ThrowAsJavaScriptException();
        return env.Null();
    }
    std::string name_suffix = info[0].As<Napi::String>().Utf8Value();
    Napi::Value js_val = info[1];

    HalItemInternal *item = FindItemBySuffix(name_suffix);
    if (!item)
    {
        ThrowHalError(env, "Item '" + name_suffix + "' not found on component '" + this->component_name_ + "' for setting");
        return env.Null();
    }
    SetItemValueInternal(env, item, js_val);
    return js_val;
}

Napi::Value HalComponentWrapper::GetItemValueInternal(const Napi::Env &env, HalItemInternal *item)
{
    if (!item || !item->data_address_location)
    {
        ThrowHalError(env, "Invalid item or item data location for get");
        return env.Null();
    }

    if (item->is_pin)
    {
        // For pins, item->data_address_location contains a POINTER (void*)
        // which was filled by hal_pin_new. This pointer (e.g., actual_pin_data_ptr)
        // points to the signal data or dummy data.
        void *actual_pin_data_ptr = *(static_cast<void **>(item->data_address_location));
        if (!actual_pin_data_ptr)
        { // Should not happen if hal_pin_new succeeded
            ThrowHalError(env, "Pin data pointer is null for " + item->full_name);
            return env.Null();
        }
        return HalDataContentToNapiValue(env, item->type, actual_pin_data_ptr);
    }
    else
    { // Parameter
        return HalDataContentToNapiValue(env, item->type, item->data_address_location);
    }
}

void HalComponentWrapper::SetItemValueInternal(const Napi::Env &env, HalItemInternal *item, const Napi::Value &js_value)
{
    if (!item || !item->data_address_location)
    {
        ThrowHalError(env, "Invalid item or item data location for set");
        return;
    }

    if (item->is_pin)
    {
        if (item->pin_dir == HAL_IN)
        {
            ThrowHalError(env, "Cannot set value of an IN pin '" + item->full_name + "'");
            return;
        }
        void *actual_pin_data_ptr = *(static_cast<void **>(item->data_address_location));
        if (!actual_pin_data_ptr)
        {
            ThrowHalError(env, "Pin data pointer is null for setting " + item->full_name);
            return;
        }

        switch (item->type)
        {
        case HAL_BIT:
            *(static_cast<hal_bit_t *>(actual_pin_data_ptr)) = js_value.ToBoolean().Value();
            break;
        case HAL_FLOAT:
            *(static_cast<hal_float_t *>(actual_pin_data_ptr)) = js_value.ToNumber().DoubleValue();
            break;
        case HAL_S32:
            *(static_cast<hal_s32_t *>(actual_pin_data_ptr)) = js_value.ToNumber().Int32Value();
            break;
        case HAL_U32:
            *(static_cast<hal_u32_t *>(actual_pin_data_ptr)) = js_value.ToNumber().Uint32Value();
            break;
        case HAL_S64:
            *(static_cast<hal_s64_t *>(actual_pin_data_ptr)) = js_value.ToNumber().Int64Value();
            break;
        case HAL_U64:
        {

            double num = js_value.As<Napi::Number>().DoubleValue();
            if (num < 0)
            {
                ThrowHalError(env, "Value out of range for HAL_U64: " + std::to_string(num));
                return;
            }

            *(static_cast<hal_u64_t *>(actual_pin_data_ptr)) = static_cast<uint64_t>(num);

            break;
        }
        default:
            ThrowHalError(env, "Unsupported pin type for set: " + std::to_string(item->type));
            return;
        }
    }
    else
    { // Parameter
        void *param_storage_ptr = item->data_address_location;
        switch (item->type)
        {
        case HAL_BIT:
            *(static_cast<hal_bit_t *>(param_storage_ptr)) = js_value.ToBoolean().Value();
            break;
        case HAL_FLOAT:
            *(static_cast<hal_float_t *>(param_storage_ptr)) = js_value.ToNumber().DoubleValue();
            break;
        case HAL_S32:
            *(static_cast<hal_s32_t *>(param_storage_ptr)) = js_value.ToNumber().Int32Value();
            break;
        case HAL_U32:
            *(static_cast<hal_u32_t *>(param_storage_ptr)) = js_value.ToNumber().Uint32Value();
            break;
        case HAL_S64:
            *(static_cast<hal_s64_t *>(param_storage_ptr)) = js_value.ToNumber().Int64Value();
            break;
        case HAL_U64:
        {

            double num = js_value.As<Napi::Number>().DoubleValue();
            if (num < 0)
            {
                ThrowHalError(env, "Value out of range for HAL_U64: " + std::to_string(num));
                return;
            }

            *(static_cast<hal_u64_t *>(param_storage_ptr)) = static_cast<uint64_t>(num);
            break;
        }
        default:
            ThrowHalError(env, "Unsupported param type for set: " + std::to_string(item->type));
            return;
        }
    }
}