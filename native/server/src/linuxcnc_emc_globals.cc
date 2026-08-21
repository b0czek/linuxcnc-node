#include "config.h"
#include "emccfg.h"

// emcglb.c normally supplies this when LinuxCNC links milltask. The standalone
// daemon is an NML client, so provide the formatter-side global without
// importing task-only code from liblinuxcnc.a.
const char* DEFAULT_EMC_NMLFILE = EMC2_DEFAULT_NMLFILE;
