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

    Napi::Object EmcPoseToNapiObject(Napi::Env env, const EmcPose &pose)
    {
        Napi::Object tranObj = Napi::Object::New(env);
        tranObj.Set("x", Napi::Number::New(env, pose.tran.x));
        tranObj.Set("y", Napi::Number::New(env, pose.tran.y));
        tranObj.Set("z", Napi::Number::New(env, pose.tran.z));

        Napi::Object poseObj = Napi::Object::New(env);
        poseObj.Set("tran", tranObj);
        poseObj.Set("a", Napi::Number::New(env, pose.a));
        poseObj.Set("b", Napi::Number::New(env, pose.b));
        poseObj.Set("c", Napi::Number::New(env, pose.c));
        poseObj.Set("u", Napi::Number::New(env, pose.u));
        poseObj.Set("v", Napi::Number::New(env, pose.v));
        poseObj.Set("w", Napi::Number::New(env, pose.w));
        return poseObj;
    }

    bool NapiObjectToEmcPose(Napi::Env env, Napi::Value value, EmcPose &pose)
    {
        if (!value.IsObject())
            return false;
        Napi::Object obj = value.As<Napi::Object>();

        if (!obj.Has("tran") || !obj.Get("tran").IsObject())
            return false;
        Napi::Object tranObj = obj.Get("tran").As<Napi::Object>();

        auto getNumber = [&](Napi::Object o, const char *key, double &val)
        {
            if (!o.Has(key) || !o.Get(key).IsNumber())
                return false;
            val = o.Get(key).As<Napi::Number>().DoubleValue();
            return true;
        };

        if (!getNumber(tranObj, "x", pose.tran.x))
            return false;
        if (!getNumber(tranObj, "y", pose.tran.y))
            return false;
        if (!getNumber(tranObj, "z", pose.tran.z))
            return false;
        if (!getNumber(obj, "a", pose.a))
            return false;
        if (!getNumber(obj, "b", pose.b))
            return false;
        if (!getNumber(obj, "c", pose.c))
            return false;
        if (!getNumber(obj, "u", pose.u))
            return false;
        if (!getNumber(obj, "v", pose.v))
            return false;
        if (!getNumber(obj, "w", pose.w))
            return false;

        return true;
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

} // namespace LinuxCNC