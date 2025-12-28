#pragma once
#include <cmath>
#include <chrono>

// Utility functions extracted from position_logger for testing and reuse
// These are the pure algorithmic functions without N-API dependencies

namespace LinuxCNC
{
    struct PositionPoint
    {
        double x, y, z, a, b, c, u, v, w;
        int motionType;
        std::chrono::steady_clock::time_point timestamp;
    };

    namespace PositionLoggerUtils
    {
        static constexpr double POSITION_EPSILON = 1e-6; // Minimum change to log

        inline bool isPositionChanged(const PositionPoint &current, const PositionPoint &previous)
        {
            const double positions_current[] = {current.x, current.y, current.z, current.a, current.b, current.c, current.u, current.v, current.w};
            const double positions_previous[] = {previous.x, previous.y, previous.z, previous.a, previous.b, previous.c, previous.u, previous.v, previous.w};

            for (size_t i = 0; i < 9; ++i)
            {
                if (std::abs(positions_current[i] - positions_previous[i]) > POSITION_EPSILON)
                {
                    return true;
                }
            }

            return current.motionType != previous.motionType;
        }

        inline bool isColinear(const PositionPoint &a, const PositionPoint &b, const PositionPoint &c)
        {
            static const double epsilon = 1e-4;
            static const double tiny = 1e-10;

            double dx1 = a.x - b.x, dx2 = b.x - c.x;
            double dy1 = a.y - b.y, dy2 = b.y - c.y;
            double dz1 = a.z - b.z, dz2 = b.z - c.z;

            double dp = std::sqrt(dx1 * dx1 + dy1 * dy1 + dz1 * dz1);
            double dq = std::sqrt(dx2 * dx2 + dy2 * dy2 + dz2 * dz2);

            if (std::abs(dp) < tiny || std::abs(dq) < tiny)
                return true;

            double dot = (dx1 * dx2 + dy1 * dy2 + dz1 * dz2) / dp / dq;

            if (std::abs(1.0 - dot) < epsilon)
                return true;

            return false;
        }
    }
}
