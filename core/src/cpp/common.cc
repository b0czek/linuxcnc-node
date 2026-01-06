#include "common.hh"
#include <vector>

namespace LinuxCNC
{

    std::string g_nmlFilePath = DEFAULT_EMC_NMLFILE;

    void SetNmlFilePath(const Napi::CallbackInfo &info)
    {
        Napi::Env env = info.Env();
        if (info.Length() < 1 || !info[0].IsString())
        {
            Napi::TypeError::New(env, "String expected for NML file path").ThrowAsJavaScriptException();
            return;
        }
        g_nmlFilePath = info[0].As<Napi::String>().Utf8Value();
    }

    Napi::Value GetNmlFilePath(const Napi::CallbackInfo &info)
    {
        Napi::Env env = info.Env();
        return Napi::String::New(env, g_nmlFilePath);
    }

    const char *GetNmlFileCStr()
    {
        return g_nmlFilePath.c_str();
    }

    Napi::Float64Array EmcPoseToNapiFloat64Array(Napi::Env env, const EmcPose &pose)
    {
        Napi::Float64Array arr = Napi::Float64Array::New(env, 9);
        arr[0] = pose.tran.x;
        arr[1] = pose.tran.y;
        arr[2] = pose.tran.z;
        arr[3] = pose.a;
        arr[4] = pose.b;
        arr[5] = pose.c;
        arr[6] = pose.u;
        arr[7] = pose.v;
        arr[8] = pose.w;
        return arr;
    }

    Napi::Array DoubleArrayToNapiArray(Napi::Env env, const double *arr, size_t size)
    {
        Napi::Array napiArr = Napi::Array::New(env, size);
        for (size_t i = 0; i < size; ++i)
        {
            napiArr.Set(i, Napi::Number::New(env, arr[i]));
        }
        return napiArr;
    }

    Napi::Array IntArrayToNapiArray(Napi::Env env, const int *arr, size_t size)
    {
        Napi::Array napiArr = Napi::Array::New(env, size);
        for (size_t i = 0; i < size; ++i)
        {
            napiArr.Set(i, Napi::Number::New(env, arr[i]));
        }
        return napiArr;
    }

    Napi::Array BoolArrayToNapiArray(Napi::Env env, const bool *arr, size_t size)
    {
        Napi::Array napiArr = Napi::Array::New(env, size);
        for (size_t i = 0; i < size; ++i)
        {
            napiArr.Set(i, Napi::Boolean::New(env, arr[i]));
        }
        return napiArr;
    }

    // Explicit instantiations for common types used with DictAdd
    template void DictAdd<double>(Napi::Env env, Napi::Object obj, const char *key, double value);
    template void DictAdd<int>(Napi::Env env, Napi::Object obj, const char *key, int value);
    template void DictAdd<bool>(Napi::Env env, Napi::Object obj, const char *key, bool value);
    template void DictAdd<Napi::Value>(Napi::Env env, Napi::Object obj, const char *key, Napi::Value value);

    template <typename T>
    void DictAdd(Napi::Env env, Napi::Object obj, const char *key, T value)
    {
        if constexpr (std::is_same_v<T, double> || std::is_same_v<T, float>)
        {
            obj.Set(key, Napi::Number::New(env, static_cast<double>(value)));
        }
        else if constexpr (std::is_integral_v<T> && !std::is_same_v<T, bool>)
        {
            obj.Set(key, Napi::Number::New(env, static_cast<double>(value))); // Napi::Number takes double
        }
        else if constexpr (std::is_same_v<T, bool>)
        {
            obj.Set(key, Napi::Boolean::New(env, value));
        }
        else if constexpr (std::is_same_v<T, Napi::Value>)
        {
            obj.Set(key, value);
        }
        // Add more specializations if needed, e.g., for const char*
    }

    void DictAddString(Napi::Env env, Napi::Object obj, const char *key, const char *value)
    {
        obj.Set(key, Napi::String::New(env, value));
    }

}