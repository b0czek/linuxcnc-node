// LinuxCNC's NML formatter lives in the source tree rather than in a shared
// runtime library. Include it in the standalone daemon instead of linking
// liblinuxcnc.a, whose task/INI objects reference milltask-only symbols.
// NOLINTNEXTLINE(bugprone-suspicious-include): LinuxCNC source-only contract
#include "emc.cc"
