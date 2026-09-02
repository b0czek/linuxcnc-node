// Original file: proto/linuxcnc/v1/hal.proto

export const RtapiMessageLevel = {
  RTAPI_MESSAGE_LEVEL_UNSPECIFIED: 0,
  RTAPI_MESSAGE_LEVEL_NONE: 1,
  RTAPI_MESSAGE_LEVEL_ERR: 2,
  RTAPI_MESSAGE_LEVEL_WARN: 3,
  RTAPI_MESSAGE_LEVEL_INFO: 4,
  RTAPI_MESSAGE_LEVEL_DBG: 5,
  RTAPI_MESSAGE_LEVEL_ALL: 6,
} as const;

export type RtapiMessageLevel =
  | 'RTAPI_MESSAGE_LEVEL_UNSPECIFIED'
  | 0
  | 'RTAPI_MESSAGE_LEVEL_NONE'
  | 1
  | 'RTAPI_MESSAGE_LEVEL_ERR'
  | 2
  | 'RTAPI_MESSAGE_LEVEL_WARN'
  | 3
  | 'RTAPI_MESSAGE_LEVEL_INFO'
  | 4
  | 'RTAPI_MESSAGE_LEVEL_DBG'
  | 5
  | 'RTAPI_MESSAGE_LEVEL_ALL'
  | 6

export type RtapiMessageLevel__Output = typeof RtapiMessageLevel[keyof typeof RtapiMessageLevel]
