// LinuxCNC's rs274 shared library expects the embedding executable to provide
// the built-in remap modules. This is the standalone daemon equivalent of the
// old addon's registration and intentionally contains no Node/N-API code.

#include <Python.h>

extern "C" PyObject* PyInit_interpreter(void);
extern "C" PyObject* PyInit_emccanon(void);
extern "C" struct _inittab builtin_modules[];

extern "C" {
struct _inittab builtin_modules[] = {
    {"interpreter", PyInit_interpreter},
    {"emccanon", PyInit_emccanon},
    {nullptr, nullptr},
};
}

namespace linuxcnc::server::gcode {

// Referenced by gcode_parser.cc so static-library linkers retain this
// translation unit and its process-global builtin_modules symbol.
void ensure_python_modules_linked() noexcept {}

}  // namespace linuxcnc::server::gcode
