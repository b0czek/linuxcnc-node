#include "config.h"
#include "emccfg.h"

// emcglb.c normally supplies this when LinuxCNC links milltask.  The Node
// addon is a standalone NML client, so provide the one formatter-side global
// it needs without importing task-only code from liblinuxcnc.a.
const char *DEFAULT_EMC_NMLFILE = EMC2_DEFAULT_NMLFILE;
