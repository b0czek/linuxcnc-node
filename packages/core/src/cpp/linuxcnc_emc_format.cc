// LinuxCNC's NML formatter lives in the source tree rather than in a shared
// runtime library.  Include it in the addon instead of linking
// liblinuxcnc.a, whose task/INI objects reference symbols only exported by
// milltask.
#include "emc.cc"
