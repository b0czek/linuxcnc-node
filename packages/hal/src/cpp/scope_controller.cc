#include "scope_controller.h"

#include <algorithm>
#include <cmath>
#include <cstring>
#include <string>
#include <unistd.h>

Napi::FunctionReference ScopeControllerWrapper::constructor;

static const char *StateName(scope_state_t state) {
    static const char *names[] = {"idle", "init", "pre-trigger", "trigger-wait", "post-trigger", "done", "reset"};
    return state >= SCOPE_IDLE && state <= SCOPE_RESET ? names[state] : "invalid";
}

static void *ResolveScopeSourceUnlocked(const std::string &kind, const std::string &name, hal_type_t *type) {
    if (kind == "param") {
        hal_param_t *param = halpr_find_param_by_name(name.c_str());
        if (param) { *type = param->type; return SHMPTR(param->data_ptr); }
    } else if (kind == "pin") {
        hal_pin_t *pin = halpr_find_pin_by_name(name.c_str());
        if (pin) {
            *type = pin->type;
            if (pin->signal) {
                hal_sig_t *signal = static_cast<hal_sig_t *>(SHMPTR(pin->signal));
                return SHMPTR(signal->data_ptr);
            }
            return &(pin->dummysig);
        }
    } else if (kind == "signal") {
        hal_sig_t *signal = halpr_find_sig_by_name(name.c_str());
        if (signal) { *type = signal->type; return SHMPTR(signal->data_ptr); }
    }
    return nullptr;
}

static std::string FindScopeThreadUnlocked() {
    hal_funct_t *scopeFunction = halpr_find_funct_by_name("scope.sample");
    if (!scopeFunction) return {};
    SHMFIELD(hal_thread_t) next = hal_data->thread_list_ptr;
    while (next) {
        hal_thread_t *thread = static_cast<hal_thread_t *>(SHMPTR(next));
        hal_list_t *root = &(thread->funct_list);
        for (hal_list_t *entry = list_next(root); entry != root; entry = list_next(entry)) {
            auto *functionEntry = reinterpret_cast<hal_funct_entry_t *>(entry);
            if (scopeFunction == static_cast<hal_funct_t *>(SHMPTR(functionEntry->funct_ptr))) return thread->name;
        }
        next = thread->next_ptr;
    }
    return {};
}

Napi::Object ScopeControllerWrapper::Init(Napi::Env env, Napi::Object exports) {
    Napi::Function function = DefineClass(env, "ScopeController", {
        InstanceMethod("status", &ScopeControllerWrapper::Status),
        InstanceMethod("configure", &ScopeControllerWrapper::Configure),
        InstanceMethod("start", &ScopeControllerWrapper::Start),
        InstanceMethod("stop", &ScopeControllerWrapper::Stop),
        InstanceMethod("forceTrigger", &ScopeControllerWrapper::ForceTrigger),
        InstanceMethod("heartbeat", &ScopeControllerWrapper::Heartbeat),
        InstanceMethod("consume", &ScopeControllerWrapper::Consume),
        InstanceMethod("dispose", &ScopeControllerWrapper::Dispose),
    });
    constructor = Napi::Persistent(function);
    constructor.SuppressDestruct();
    exports.Set("ScopeController", function);
    return exports;
}

ScopeControllerWrapper::ScopeControllerWrapper(const Napi::CallbackInfo &info)
    : Napi::ObjectWrap<ScopeControllerWrapper>(info) {
    Napi::Env env = info.Env();
    if (hal_data && halpr_find_comp_by_name("halscope")) {
        ThrowHalError(env, "Original halscope is already active; scope control is exclusive");
        return;
    }
    component_id_ = hal_init("hal-inspector-scope");
    if (component_id_ <= 0) {
        ThrowHalError(env, "Scope controller already active or HAL unavailable", component_id_);
        component_id_ = 0;
        return;
    }
    shared_memory_id_ = rtapi_shmem_new(SCOPE_SHM_KEY, component_id_, sizeof(scope_shm_control_t));
    if (shared_memory_id_ < 0) {
        int result = shared_memory_id_;
        hal_exit(component_id_);
        component_id_ = 0;
        ThrowHalError(env, "scope_rt shared memory is unavailable", result);
        return;
    }
    void *base = nullptr;
    int result = rtapi_shmem_getptr(shared_memory_id_, &base);
    if (result < 0 || !base) {
        DisposeNative();
        ThrowHalError(env, "Unable to map scope_rt shared memory", result);
        return;
    }
    control_ = static_cast<scope_shm_control_t *>(base);
    const unsigned long header = (sizeof(scope_shm_control_t) + 3UL) & ~3UL;
    if (control_->shm_size < header || control_->buf_len <= 0 ||
        control_->shm_size < header + static_cast<unsigned long>(control_->buf_len) * sizeof(scope_data_t)) {
        DisposeNative();
        ThrowHalError(env, "Invalid or incompatible scope_rt shared-memory ABI");
        return;
    }
    buffer_ = reinterpret_cast<scope_data_t *>(static_cast<char *>(base) + header);
    if (!control_->thread_name[0]) {
        rtapi_mutex_get(&(hal_data->mutex));
        std::string adoptedThread = FindScopeThreadUnlocked();
        rtapi_mutex_give(&(hal_data->mutex));
        if (!adoptedThread.empty()) {
            std::strncpy(control_->thread_name, adoptedThread.c_str(), HAL_NAME_LEN);
            control_->thread_name[HAL_NAME_LEN] = '\0';
        }
    }
    if (hal_ready(component_id_) != 0) {
        DisposeNative();
        ThrowHalError(env, "Unable to ready HAL Inspector scope controller");
    }
}

ScopeControllerWrapper::~ScopeControllerWrapper() { DisposeNative(); }

void ScopeControllerWrapper::EnsureAttached(Napi::Env env) {
    if (disposed_ || !control_ || !buffer_) ThrowHalError(env, "Scope controller is disposed");
}

void ScopeControllerWrapper::DisposeNative() {
    if (disposed_) return;
    disposed_ = true;
    if (control_) {
        control_->state = SCOPE_RESET;
        control_->force_trig = 0;
    }
    if (shared_memory_id_ >= 0 && component_id_ > 0) rtapi_shmem_delete(shared_memory_id_, component_id_);
    if (component_id_ > 0) hal_exit(component_id_);
    shared_memory_id_ = -1;
    component_id_ = 0;
    control_ = nullptr;
    buffer_ = nullptr;
}

Napi::Value ScopeControllerWrapper::Status(const Napi::CallbackInfo &info) {
    Napi::Env env = info.Env(); EnsureAttached(env); if (env.IsExceptionPending()) return env.Null();
    Napi::Object result = Napi::Object::New(env);
    result.Set("state", StateName(control_->state));
    result.Set("bufferLength", control_->buf_len);
    result.Set("recordLength", control_->rec_len);
    result.Set("sampleLength", control_->sample_len);
    result.Set("samples", control_->samples);
    result.Set("start", control_->start);
    result.Set("multiplier", control_->mult);
    result.Set("watchdog", control_->watchdog);
    result.Set("threadName", control_->thread_name);
    long period = 0;
    rtapi_mutex_get(&(hal_data->mutex));
    hal_thread_t *thread = control_->thread_name[0] ? halpr_find_thread_by_name(control_->thread_name) : nullptr;
    if (thread) period = thread->period;
    rtapi_mutex_give(&(hal_data->mutex));
    result.Set("samplePeriodNs", Napi::Number::New(env, period * control_->mult));
    return result;
}

Napi::Value ScopeControllerWrapper::Configure(const Napi::CallbackInfo &info) {
    Napi::Env env = info.Env(); EnsureAttached(env); if (env.IsExceptionPending()) return env.Null();
    if (info.Length() < 1 || !info[0].IsObject()) {
        Napi::TypeError::New(env, "Scope configuration object expected").ThrowAsJavaScriptException(); return env.Null();
    }
    Napi::Object config = info[0].As<Napi::Object>();
    std::string threadName = config.Get("threadName").ToString().Utf8Value();
    int multiplier = config.Get("multiplier").ToNumber().Int32Value();
    int preTrigger = config.Get("preTrigger").ToNumber().Int32Value();
    int triggerChannel = config.Get("triggerChannel").ToNumber().Int32Value();
    double triggerLevel = config.Get("triggerLevel").ToNumber().DoubleValue();
    bool rising = config.Get("rising").ToBoolean().Value();
    bool automatic = config.Get("automatic").ToBoolean().Value();
    Napi::Value channelsValue = config.Get("channels");
    if (!channelsValue.IsArray()) { Napi::TypeError::New(env, "channels must be an array").ThrowAsJavaScriptException(); return env.Null(); }
    Napi::Array channels = channelsValue.As<Napi::Array>();
    if (channels.Length() > SCOPE_CHANNELS || triggerChannel < 0 || triggerChannel > SCOPE_CHANNELS) {
        ThrowHalError(env, "Scope supports exactly 16 channel slots"); return env.Null();
    }

    struct Source { bool enabled = false; hal_type_t type = HAL_TYPE_UNSPECIFIED; int offset = 0; char length = 0; } sources[SCOPE_CHANNELS];
    long period = 0;
    std::string attachedThread;
    rtapi_mutex_get(&(hal_data->mutex));
    hal_thread_t *thread = halpr_find_thread_by_name(threadName.c_str());
    if (thread) period = thread->period;
    for (uint32_t i = 0; thread && i < channels.Length(); ++i) {
        Napi::Value channelValue = channels.Get(i);
        if (channelValue.IsNull() || channelValue.IsUndefined()) continue;
        Napi::Object channel = channelValue.As<Napi::Object>();
        if (channel.Has("enabled") && !channel.Get("enabled").ToBoolean().Value()) continue;
        std::string kind = channel.Get("kind").ToString().Utf8Value();
        std::string name = channel.Get("name").ToString().Utf8Value();
        hal_type_t type = HAL_TYPE_UNSPECIFIED;
        void *data = ResolveScopeSourceUnlocked(kind, name, &type);
        if (!data || (type != HAL_BIT && type != HAL_FLOAT && type != HAL_S32 && type != HAL_U32)) {
            thread = nullptr;
            break;
        }
        sources[i].enabled = true;
        sources[i].type = type;
        sources[i].offset = static_cast<int>(SHMOFF(data));
        sources[i].length = type == HAL_BIT ? 1 : (type == HAL_FLOAT ? sizeof(hal_float_t) : 4);
    }
    attachedThread = FindScopeThreadUnlocked();
    rtapi_mutex_give(&(hal_data->mutex));
    if (!thread || period <= 0) { ThrowHalError(env, "Invalid thread or scope source"); return env.Null(); }
    int maxMultiplier = static_cast<int>(std::min(1000L, 1000000000L / period));
    if (multiplier < 1 || multiplier > maxMultiplier) { ThrowHalError(env, "Scope multiplier is outside the thread's supported range"); return env.Null(); }

    if (control_->state != SCOPE_IDLE) {
        control_->state = SCOPE_RESET;
        for (int i = 0; i < 250 && control_->state != SCOPE_IDLE; ++i) usleep(1000);
        if (control_->state != SCOPE_IDLE) {
            // RESET is normally acknowledged by scope.sample in the realtime
            // thread. Recover when that recorded link is stale or its thread
            // is no longer executing, otherwise the controller can never be
            // configured again.
            if (!attachedThread.empty()) {
                hal_del_funct_from_thread("scope.sample", attachedThread.c_str());
                attachedThread.clear();
            }
            control_->curr = 0;
            control_->start = 0;
            control_->samples = 0;
            control_->force_trig = 0;
            control_->state = SCOPE_IDLE;
        }
    }
    std::string oldThread = attachedThread;
    if (oldThread != threadName) {
        if (!oldThread.empty()) hal_del_funct_from_thread("scope.sample", oldThread.c_str());
        if (hal_add_funct_to_thread("scope.sample", threadName.c_str(), -1) != 0) {
            ThrowHalError(env, "Unable to link scope.sample to thread '" + threadName + "'"); return env.Null();
        }
    }
    std::strncpy(control_->thread_name, threadName.c_str(), HAL_NAME_LEN);
    control_->thread_name[HAL_NAME_LEN] = '\0';
    control_->sample_len = SCOPE_CHANNELS;
    control_->rec_len = control_->buf_len / SCOPE_CHANNELS;
    control_->pre_trig = std::clamp(preTrigger, 0, std::max(0, control_->rec_len - 1));
    control_->mult = multiplier;
    control_->trig_chan = triggerChannel;
    hal_type_t triggerType = triggerChannel > 0 ? sources[triggerChannel - 1].type : HAL_FLOAT;
    if (triggerChannel > 0 && !sources[triggerChannel - 1].enabled) {
        ThrowHalError(env, "Trigger channel is not enabled"); return env.Null();
    }
    switch (triggerType) {
        case HAL_BIT: control_->trig_level.d_u8 = triggerLevel != 0; break;
        case HAL_S32: control_->trig_level.d_s32 = static_cast<rtapi_s32>(triggerLevel); break;
        case HAL_U32: control_->trig_level.d_u32 = static_cast<rtapi_u32>(triggerLevel); break;
        default: control_->trig_level.d_real = triggerLevel; break;
    }
    control_->trig_edge = rising ? 1 : 0;
    control_->auto_trig = automatic ? 1 : 0;
    for (int i = 0; i < SCOPE_CHANNELS; ++i) {
        control_->data_offset[i] = sources[i].offset;
        control_->data_type[i] = sources[i].type;
        control_->data_len[i] = sources[i].length;
    }
    return Status(info);
}

Napi::Value ScopeControllerWrapper::Start(const Napi::CallbackInfo &info) {
    Napi::Env env = info.Env(); EnsureAttached(env); if (env.IsExceptionPending()) return env.Null();
    if (control_->state != SCOPE_IDLE && control_->state != SCOPE_DONE) { ThrowHalError(env, "Scope is already acquiring"); return env.Null(); }
    control_->state = SCOPE_INIT; return env.Undefined();
}

Napi::Value ScopeControllerWrapper::Stop(const Napi::CallbackInfo &info) {
    Napi::Env env = info.Env(); EnsureAttached(env); if (env.IsExceptionPending()) return env.Null();
    control_->state = SCOPE_RESET; return env.Undefined();
}

Napi::Value ScopeControllerWrapper::ForceTrigger(const Napi::CallbackInfo &info) {
    Napi::Env env = info.Env(); EnsureAttached(env); if (env.IsExceptionPending()) return env.Null();
    control_->force_trig = 1; return env.Undefined();
}

Napi::Value ScopeControllerWrapper::Heartbeat(const Napi::CallbackInfo &info) {
    Napi::Env env = info.Env(); EnsureAttached(env); if (env.IsExceptionPending()) return env.Null();
    control_->watchdog = std::min(control_->watchdog + 1, 10); return Napi::Number::New(env, control_->watchdog);
}

Napi::Value ScopeControllerWrapper::Consume(const Napi::CallbackInfo &info) {
    Napi::Env env = info.Env(); EnsureAttached(env); if (env.IsExceptionPending()) return env.Null();
    if (control_->state != SCOPE_DONE) return env.Null();
    if (control_->sample_len != SCOPE_CHANNELS || control_->samples < 0 || control_->samples > control_->rec_len ||
        control_->start < 0 || control_->start >= control_->buf_len) {
        ThrowHalError(env, "Invalid scope capture bounds"); return env.Null();
    }
    Napi::Object capture = Napi::Object::New(env);
    Napi::Array channels = Napi::Array::New(env, SCOPE_CHANNELS);
    for (int channel = 0; channel < SCOPE_CHANNELS; ++channel) {
        if (!control_->data_len[channel]) { channels.Set(channel, env.Null()); continue; }
        Napi::Float64Array values = Napi::Float64Array::New(env, control_->samples);
        for (int sample = 0; sample < control_->samples; ++sample) {
            int cell = control_->start + sample * control_->sample_len + channel;
            cell %= control_->buf_len;
            const scope_data_t &value = buffer_[cell];
            double converted = 0;
            switch (control_->data_type[channel]) {
                case HAL_BIT: converted = value.d_u8 ? 1 : 0; break;
                case HAL_FLOAT: converted = value.d_real; break;
                case HAL_S32: converted = value.d_s32; break;
                case HAL_U32: converted = value.d_u32; break;
                default: break;
            }
            values[sample] = converted;
        }
        channels.Set(channel, values);
    }
    capture.Set("channels", channels);
    capture.Set("samples", control_->samples);
    capture.Set("triggerIndex", control_->pre_trig);
    long period = 0;
    rtapi_mutex_get(&(hal_data->mutex));
    hal_thread_t *thread = control_->thread_name[0] ? halpr_find_thread_by_name(control_->thread_name) : nullptr;
    if (thread) period = thread->period;
    rtapi_mutex_give(&(hal_data->mutex));
    capture.Set("samplePeriodNs", Napi::Number::New(env, period * control_->mult));
    return capture;
}

Napi::Value ScopeControllerWrapper::Dispose(const Napi::CallbackInfo &info) { DisposeNative(); return info.Env().Undefined(); }
