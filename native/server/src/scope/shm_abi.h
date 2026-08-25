/*
 * LinuxCNC scope_rt shared-memory ABI, pinned to the repository's baseline.
 * Derived from src/hal/utils/scope_shm.h. This header is deliberately kept
 * on the native implementation side; transport-facing code sees only the
 * types in scope_controller.hpp.
 */
#pragma once

#include <hal.h>
#include <rtapi.h>

#define LINUXCNC_SCOPE_SHM_KEY 0x130CF406
#define LINUXCNC_SCOPE_CHANNELS 16

enum linuxcnc_scope_state_t {
  LINUXCNC_SCOPE_IDLE = 0,
  LINUXCNC_SCOPE_INIT,
  LINUXCNC_SCOPE_PRE_TRIG,
  LINUXCNC_SCOPE_TRIG_WAIT,
  LINUXCNC_SCOPE_POST_TRIG,
  LINUXCNC_SCOPE_DONE,
  LINUXCNC_SCOPE_RESET,
};

union linuxcnc_scope_data_t {
  unsigned char d_u8;
  rtapi_u32 d_u32;
  rtapi_s32 d_s32;
  real_t d_real;
  ireal_t d_ireal;
};

struct linuxcnc_scope_shm_control_t {
  unsigned long shm_size;
  int buf_len;
  int watchdog;
  char thread_name[HAL_NAME_LEN + 1];
  int mult;
  int rec_len;
  int sample_len;
  int pre_trig;
  int trig_chan;
  linuxcnc_scope_data_t trig_level;
  int trig_edge;
  int force_trig;
  int auto_trig;
  int start;
  int curr;
  int samples;
  linuxcnc_scope_state_t state;
  int data_offset[LINUXCNC_SCOPE_CHANNELS];
  hal_type_t data_type[LINUXCNC_SCOPE_CHANNELS];
  char data_len[LINUXCNC_SCOPE_CHANNELS];
};
