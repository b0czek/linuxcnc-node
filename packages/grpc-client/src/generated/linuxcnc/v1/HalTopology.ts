// Original file: proto/linuxcnc/v1/hal.proto

import type { HalComponentInfo as _linuxcnc_v1_HalComponentInfo, HalComponentInfo__Output as _linuxcnc_v1_HalComponentInfo__Output } from '../../linuxcnc/v1/HalComponentInfo';
import type { HalFunctionInfo as _linuxcnc_v1_HalFunctionInfo, HalFunctionInfo__Output as _linuxcnc_v1_HalFunctionInfo__Output } from '../../linuxcnc/v1/HalFunctionInfo';
import type { HalThreadInfo as _linuxcnc_v1_HalThreadInfo, HalThreadInfo__Output as _linuxcnc_v1_HalThreadInfo__Output } from '../../linuxcnc/v1/HalThreadInfo';
import type { HalPinInfo as _linuxcnc_v1_HalPinInfo, HalPinInfo__Output as _linuxcnc_v1_HalPinInfo__Output } from '../../linuxcnc/v1/HalPinInfo';
import type { HalParamInfo as _linuxcnc_v1_HalParamInfo, HalParamInfo__Output as _linuxcnc_v1_HalParamInfo__Output } from '../../linuxcnc/v1/HalParamInfo';
import type { HalSignalInfo as _linuxcnc_v1_HalSignalInfo, HalSignalInfo__Output as _linuxcnc_v1_HalSignalInfo__Output } from '../../linuxcnc/v1/HalSignalInfo';

export interface HalTopology {
  'components'?: (_linuxcnc_v1_HalComponentInfo)[];
  'functions'?: (_linuxcnc_v1_HalFunctionInfo)[];
  'threads'?: (_linuxcnc_v1_HalThreadInfo)[];
  'pins'?: (_linuxcnc_v1_HalPinInfo)[];
  'params'?: (_linuxcnc_v1_HalParamInfo)[];
  'signals'?: (_linuxcnc_v1_HalSignalInfo)[];
}

export interface HalTopology__Output {
  'components'?: (_linuxcnc_v1_HalComponentInfo__Output)[];
  'functions'?: (_linuxcnc_v1_HalFunctionInfo__Output)[];
  'threads'?: (_linuxcnc_v1_HalThreadInfo__Output)[];
  'pins'?: (_linuxcnc_v1_HalPinInfo__Output)[];
  'params'?: (_linuxcnc_v1_HalParamInfo__Output)[];
  'signals'?: (_linuxcnc_v1_HalSignalInfo__Output)[];
}
