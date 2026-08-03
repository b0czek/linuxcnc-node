/*
 * LinuxCNC scope shared-memory ABI, pinned to the repository's LinuxCNC 2.10
 * baseline. Derived from src/hal/utils/scope_shm.h, GPL-2.0-only.
 * Copyright (C) 2003 John Kasunich.
 */
#pragma once

#include <rtapi.h>
#include <hal.h>

#define SCOPE_SHM_KEY 0x130CF406
#define SCOPE_CHANNELS 16

enum scope_state_t {
    SCOPE_IDLE = 0,
    SCOPE_INIT,
    SCOPE_PRE_TRIG,
    SCOPE_TRIG_WAIT,
    SCOPE_POST_TRIG,
    SCOPE_DONE,
    SCOPE_RESET
};

union scope_data_t {
    unsigned char d_u8;
    rtapi_u32 d_u32;
    rtapi_s32 d_s32;
    real_t d_real;
    ireal_t d_ireal;
};

struct scope_shm_control_t {
    unsigned long shm_size;
    int buf_len;
    int watchdog;
    char thread_name[HAL_NAME_LEN + 1];
    int mult;
    int rec_len;
    int sample_len;
    int pre_trig;
    int trig_chan;
    scope_data_t trig_level;
    int trig_edge;
    int force_trig;
    int auto_trig;
    int start;
    int curr;
    int samples;
    scope_state_t state;
    int data_offset[SCOPE_CHANNELS];
    hal_type_t data_type[SCOPE_CHANNELS];
    char data_len[SCOPE_CHANNELS];
};
