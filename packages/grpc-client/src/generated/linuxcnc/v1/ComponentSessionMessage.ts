// Original file: proto/linuxcnc/v1/hal.proto

import type { ComponentOpen as _linuxcnc_v1_ComponentOpen, ComponentOpen__Output as _linuxcnc_v1_ComponentOpen__Output } from '../../linuxcnc/v1/ComponentOpen';
import type { ComponentPin as _linuxcnc_v1_ComponentPin, ComponentPin__Output as _linuxcnc_v1_ComponentPin__Output } from '../../linuxcnc/v1/ComponentPin';
import type { ComponentParameter as _linuxcnc_v1_ComponentParameter, ComponentParameter__Output as _linuxcnc_v1_ComponentParameter__Output } from '../../linuxcnc/v1/ComponentParameter';
import type { ComponentReady as _linuxcnc_v1_ComponentReady, ComponentReady__Output as _linuxcnc_v1_ComponentReady__Output } from '../../linuxcnc/v1/ComponentReady';
import type { ComponentValue as _linuxcnc_v1_ComponentValue, ComponentValue__Output as _linuxcnc_v1_ComponentValue__Output } from '../../linuxcnc/v1/ComponentValue';
import type { ComponentDelta as _linuxcnc_v1_ComponentDelta, ComponentDelta__Output as _linuxcnc_v1_ComponentDelta__Output } from '../../linuxcnc/v1/ComponentDelta';
import type { ComponentClose as _linuxcnc_v1_ComponentClose, ComponentClose__Output as _linuxcnc_v1_ComponentClose__Output } from '../../linuxcnc/v1/ComponentClose';
import type { HalWriterMetadata as _linuxcnc_v1_HalWriterMetadata, HalWriterMetadata__Output as _linuxcnc_v1_HalWriterMetadata__Output } from '../../linuxcnc/v1/HalWriterMetadata';

export interface ComponentSessionMessage {
  'open'?: (_linuxcnc_v1_ComponentOpen | null);
  'pin'?: (_linuxcnc_v1_ComponentPin | null);
  'parameter'?: (_linuxcnc_v1_ComponentParameter | null);
  'ready'?: (_linuxcnc_v1_ComponentReady | null);
  'value'?: (_linuxcnc_v1_ComponentValue | null);
  'delta'?: (_linuxcnc_v1_ComponentDelta | null);
  'close'?: (_linuxcnc_v1_ComponentClose | null);
  'metadata'?: (_linuxcnc_v1_HalWriterMetadata | null);
  'message'?: "open"|"pin"|"parameter"|"ready"|"value"|"delta"|"close"|"metadata";
}

export interface ComponentSessionMessage__Output {
  'open'?: (_linuxcnc_v1_ComponentOpen__Output);
  'pin'?: (_linuxcnc_v1_ComponentPin__Output);
  'parameter'?: (_linuxcnc_v1_ComponentParameter__Output);
  'ready'?: (_linuxcnc_v1_ComponentReady__Output);
  'value'?: (_linuxcnc_v1_ComponentValue__Output);
  'delta'?: (_linuxcnc_v1_ComponentDelta__Output);
  'close'?: (_linuxcnc_v1_ComponentClose__Output);
  'metadata'?: (_linuxcnc_v1_HalWriterMetadata__Output);
  'message'?: "open"|"pin"|"parameter"|"ready"|"value"|"delta"|"close"|"metadata";
}
