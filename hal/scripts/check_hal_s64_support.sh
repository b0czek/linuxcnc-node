#!/bin/bash

# --- Configuration ---
# Adjust these as necessary, or pass them as arguments if you prefer.
# The GYP file will pass the compiler and include paths.
CC="${1:-gcc}" # Compiler, defaults to gcc if not passed as arg 1
shift
INCLUDE_DIRS_ARGS="$@" # All remaining arguments are include directories

# Default defines needed by hal.h for the check
# In your binding.gyp, you'll ensure these are passed from your CFLAGS
DEFINES_FOR_CHECK="-DULAPI"

# Temporary file for the test C code
TEST_C_FILE=$(mktemp --suffix=.c)
TEST_O_FILE=$(mktemp --suffix=.o)

# --- Test C Code ---
cat << EOF > "$TEST_C_FILE"
// Test C code for HAL s64 support

// hal.h requires RTAPI or ULAPI to be defined.
// This should be provided by the build system's CFLAGS.
// #ifndef ULAPI
// #ifndef RTAPI
// #define ULAPI
// #endif
// #endif

#include "hal.h" // This is the hal.h you are testing
#include <stddef.h> // For NULL

int main(void) {
    hal_type_t type_enum_check = HAL_S64;
    hal_s64_t type_def_check = 0;
    int (*func_pin_ptr)(const char *, hal_pin_dir_t, hal_s64_t **, int) = &hal_pin_s64_new;
    int (*func_param_ptr)(const char *, hal_param_dir_t, hal_s64_t *, int) = &hal_param_s64_new;

    (void)type_enum_check;
    (void)type_def_check;
    (void)func_pin_ptr;
    (void)func_param_ptr;
    return 0;
}
EOF

# --- Perform Test Compilation ---
# Compile the test file. We only care about success/failure.
# The INCLUDE_DIRS_ARGS will be a string of -I flags.
# Ensure DEFINES_FOR_CHECK is also included.

# echo "Executing: $CC $DEFINES_FOR_CHECK $INCLUDE_DIRS_ARGS -c $TEST_C_FILE -o $TEST_O_FILE" >&2
if $CC $DEFINES_FOR_CHECK $INCLUDE_DIRS_ARGS -c "$TEST_C_FILE" -o "$TEST_O_FILE" > /dev/null 2>&1; then
  # If compilation succeeds, output the define for node-gyp
  echo "-DHAL_S64_SUPPORT"
else
  # If compilation fails, output nothing
  echo ""
fi

# --- Cleanup ---
rm -f "$TEST_C_FILE" "$TEST_O_FILE"

exit 0