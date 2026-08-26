import type * as grpc from '@grpc/grpc-js';
import type { EnumTypeDefinition, MessageTypeDefinition } from '@grpc/proto-loader';

import type { Empty as _google_protobuf_Empty, Empty__Output as _google_protobuf_Empty__Output } from './google/protobuf/Empty';
import type { ActiveGCodes as _linuxcnc_v1_ActiveGCodes, ActiveGCodes__Output as _linuxcnc_v1_ActiveGCodes__Output } from './linuxcnc/v1/ActiveGCodes';
import type { ActiveMCodes as _linuxcnc_v1_ActiveMCodes, ActiveMCodes__Output as _linuxcnc_v1_ActiveMCodes__Output } from './linuxcnc/v1/ActiveMCodes';
import type { ActiveSettings as _linuxcnc_v1_ActiveSettings, ActiveSettings__Output as _linuxcnc_v1_ActiveSettings__Output } from './linuxcnc/v1/ActiveSettings';
import type { AnalogOutput as _linuxcnc_v1_AnalogOutput, AnalogOutput__Output as _linuxcnc_v1_AnalogOutput__Output } from './linuxcnc/v1/AnalogOutput';
import type { ArcData as _linuxcnc_v1_ArcData, ArcData__Output as _linuxcnc_v1_ArcData__Output } from './linuxcnc/v1/ArcData';
import type { AxisStat as _linuxcnc_v1_AxisStat, AxisStat__Output as _linuxcnc_v1_AxisStat__Output } from './linuxcnc/v1/AxisStat';
import type { ComponentClose as _linuxcnc_v1_ComponentClose, ComponentClose__Output as _linuxcnc_v1_ComponentClose__Output } from './linuxcnc/v1/ComponentClose';
import type { ComponentDelta as _linuxcnc_v1_ComponentDelta, ComponentDelta__Output as _linuxcnc_v1_ComponentDelta__Output } from './linuxcnc/v1/ComponentDelta';
import type { ComponentOpen as _linuxcnc_v1_ComponentOpen, ComponentOpen__Output as _linuxcnc_v1_ComponentOpen__Output } from './linuxcnc/v1/ComponentOpen';
import type { ComponentParameter as _linuxcnc_v1_ComponentParameter, ComponentParameter__Output as _linuxcnc_v1_ComponentParameter__Output } from './linuxcnc/v1/ComponentParameter';
import type { ComponentPin as _linuxcnc_v1_ComponentPin, ComponentPin__Output as _linuxcnc_v1_ComponentPin__Output } from './linuxcnc/v1/ComponentPin';
import type { ComponentReady as _linuxcnc_v1_ComponentReady, ComponentReady__Output as _linuxcnc_v1_ComponentReady__Output } from './linuxcnc/v1/ComponentReady';
import type { ComponentSessionMessage as _linuxcnc_v1_ComponentSessionMessage, ComponentSessionMessage__Output as _linuxcnc_v1_ComponentSessionMessage__Output } from './linuxcnc/v1/ComponentSessionMessage';
import type { ComponentValue as _linuxcnc_v1_ComponentValue, ComponentValue__Output as _linuxcnc_v1_ComponentValue__Output } from './linuxcnc/v1/ComponentValue';
import type { ControlPointG5 as _linuxcnc_v1_ControlPointG5, ControlPointG5__Output as _linuxcnc_v1_ControlPointG5__Output } from './linuxcnc/v1/ControlPointG5';
import type { ControlPointG6 as _linuxcnc_v1_ControlPointG6, ControlPointG6__Output as _linuxcnc_v1_ControlPointG6__Output } from './linuxcnc/v1/ControlPointG6';
import type { CoolantIoStat as _linuxcnc_v1_CoolantIoStat, CoolantIoStat__Output as _linuxcnc_v1_CoolantIoStat__Output } from './linuxcnc/v1/CoolantIoStat';
import type { CreateHalSignalRequest as _linuxcnc_v1_CreateHalSignalRequest, CreateHalSignalRequest__Output as _linuxcnc_v1_CreateHalSignalRequest__Output } from './linuxcnc/v1/CreateHalSignalRequest';
import type { CreateHalSignalResponse as _linuxcnc_v1_CreateHalSignalResponse, CreateHalSignalResponse__Output as _linuxcnc_v1_CreateHalSignalResponse__Output } from './linuxcnc/v1/CreateHalSignalResponse';
import type { CreateHalValueSubscriptionRequest as _linuxcnc_v1_CreateHalValueSubscriptionRequest, CreateHalValueSubscriptionRequest__Output as _linuxcnc_v1_CreateHalValueSubscriptionRequest__Output } from './linuxcnc/v1/CreateHalValueSubscriptionRequest';
import type { CreateWorkspaceRequest as _linuxcnc_v1_CreateWorkspaceRequest, CreateWorkspaceRequest__Output as _linuxcnc_v1_CreateWorkspaceRequest__Output } from './linuxcnc/v1/CreateWorkspaceRequest';
import type { CreateWorkspaceResponse as _linuxcnc_v1_CreateWorkspaceResponse, CreateWorkspaceResponse__Output as _linuxcnc_v1_CreateWorkspaceResponse__Output } from './linuxcnc/v1/CreateWorkspaceResponse';
import type { DeleteHalValueSubscriptionRequest as _linuxcnc_v1_DeleteHalValueSubscriptionRequest, DeleteHalValueSubscriptionRequest__Output as _linuxcnc_v1_DeleteHalValueSubscriptionRequest__Output } from './linuxcnc/v1/DeleteHalValueSubscriptionRequest';
import type { DeleteWorkspaceRequest as _linuxcnc_v1_DeleteWorkspaceRequest, DeleteWorkspaceRequest__Output as _linuxcnc_v1_DeleteWorkspaceRequest__Output } from './linuxcnc/v1/DeleteWorkspaceRequest';
import type { DigitalOutput as _linuxcnc_v1_DigitalOutput, DigitalOutput__Output as _linuxcnc_v1_DigitalOutput__Output } from './linuxcnc/v1/DigitalOutput';
import type { DwellData as _linuxcnc_v1_DwellData, DwellData__Output as _linuxcnc_v1_DwellData__Output } from './linuxcnc/v1/DwellData';
import type { EmptyCommand as _linuxcnc_v1_EmptyCommand, EmptyCommand__Output as _linuxcnc_v1_EmptyCommand__Output } from './linuxcnc/v1/EmptyCommand';
import type { ExecuteCommandRequest as _linuxcnc_v1_ExecuteCommandRequest, ExecuteCommandRequest__Output as _linuxcnc_v1_ExecuteCommandRequest__Output } from './linuxcnc/v1/ExecuteCommandRequest';
import type { ExecuteCommandResponse as _linuxcnc_v1_ExecuteCommandResponse, ExecuteCommandResponse__Output as _linuxcnc_v1_ExecuteCommandResponse__Output } from './linuxcnc/v1/ExecuteCommandResponse';
import type { Extents as _linuxcnc_v1_Extents, Extents__Output as _linuxcnc_v1_Extents__Output } from './linuxcnc/v1/Extents';
import type { FeedRateData as _linuxcnc_v1_FeedRateData, FeedRateData__Output as _linuxcnc_v1_FeedRateData__Output } from './linuxcnc/v1/FeedRateData';
import type { FileChunk as _linuxcnc_v1_FileChunk, FileChunk__Output as _linuxcnc_v1_FileChunk__Output } from './linuxcnc/v1/FileChunk';
import type { G5xOffsetData as _linuxcnc_v1_G5xOffsetData, G5xOffsetData__Output as _linuxcnc_v1_G5xOffsetData__Output } from './linuxcnc/v1/G5xOffsetData';
import type { GCodeOperation as _linuxcnc_v1_GCodeOperation, GCodeOperation__Output as _linuxcnc_v1_GCodeOperation__Output } from './linuxcnc/v1/GCodeOperation';
import type { GetHalTopologyRequest as _linuxcnc_v1_GetHalTopologyRequest, GetHalTopologyRequest__Output as _linuxcnc_v1_GetHalTopologyRequest__Output } from './linuxcnc/v1/GetHalTopologyRequest';
import type { GetHalTopologyResponse as _linuxcnc_v1_GetHalTopologyResponse, GetHalTopologyResponse__Output as _linuxcnc_v1_GetHalTopologyResponse__Output } from './linuxcnc/v1/GetHalTopologyResponse';
import type { GetHalWriterMetadataRequest as _linuxcnc_v1_GetHalWriterMetadataRequest, GetHalWriterMetadataRequest__Output as _linuxcnc_v1_GetHalWriterMetadataRequest__Output } from './linuxcnc/v1/GetHalWriterMetadataRequest';
import type { GetHalWriterMetadataResponse as _linuxcnc_v1_GetHalWriterMetadataResponse, GetHalWriterMetadataResponse__Output as _linuxcnc_v1_GetHalWriterMetadataResponse__Output } from './linuxcnc/v1/GetHalWriterMetadataResponse';
import type { GetStatusRequest as _linuxcnc_v1_GetStatusRequest, GetStatusRequest__Output as _linuxcnc_v1_GetStatusRequest__Output } from './linuxcnc/v1/GetStatusRequest';
import type { GetStatusResponse as _linuxcnc_v1_GetStatusResponse, GetStatusResponse__Output as _linuxcnc_v1_GetStatusResponse__Output } from './linuxcnc/v1/GetStatusResponse';
import type { HalComponentInfo as _linuxcnc_v1_HalComponentInfo, HalComponentInfo__Output as _linuxcnc_v1_HalComponentInfo__Output } from './linuxcnc/v1/HalComponentInfo';
import type { HalFunctionInfo as _linuxcnc_v1_HalFunctionInfo, HalFunctionInfo__Output as _linuxcnc_v1_HalFunctionInfo__Output } from './linuxcnc/v1/HalFunctionInfo';
import type { HalItemRef as _linuxcnc_v1_HalItemRef, HalItemRef__Output as _linuxcnc_v1_HalItemRef__Output } from './linuxcnc/v1/HalItemRef';
import type { HalParamInfo as _linuxcnc_v1_HalParamInfo, HalParamInfo__Output as _linuxcnc_v1_HalParamInfo__Output } from './linuxcnc/v1/HalParamInfo';
import type { HalPinInfo as _linuxcnc_v1_HalPinInfo, HalPinInfo__Output as _linuxcnc_v1_HalPinInfo__Output } from './linuxcnc/v1/HalPinInfo';
import type { HalReadRequest as _linuxcnc_v1_HalReadRequest, HalReadRequest__Output as _linuxcnc_v1_HalReadRequest__Output } from './linuxcnc/v1/HalReadRequest';
import type { HalReadResponse as _linuxcnc_v1_HalReadResponse, HalReadResponse__Output as _linuxcnc_v1_HalReadResponse__Output } from './linuxcnc/v1/HalReadResponse';
import type { HalReadValue as _linuxcnc_v1_HalReadValue, HalReadValue__Output as _linuxcnc_v1_HalReadValue__Output } from './linuxcnc/v1/HalReadValue';
import type { HalScalar as _linuxcnc_v1_HalScalar, HalScalar__Output as _linuxcnc_v1_HalScalar__Output } from './linuxcnc/v1/HalScalar';
import type { HalServiceClient as _linuxcnc_v1_HalServiceClient, HalServiceDefinition as _linuxcnc_v1_HalServiceDefinition } from './linuxcnc/v1/HalService';
import type { HalSignalInfo as _linuxcnc_v1_HalSignalInfo, HalSignalInfo__Output as _linuxcnc_v1_HalSignalInfo__Output } from './linuxcnc/v1/HalSignalInfo';
import type { HalThreadInfo as _linuxcnc_v1_HalThreadInfo, HalThreadInfo__Output as _linuxcnc_v1_HalThreadInfo__Output } from './linuxcnc/v1/HalThreadInfo';
import type { HalTopology as _linuxcnc_v1_HalTopology, HalTopology__Output as _linuxcnc_v1_HalTopology__Output } from './linuxcnc/v1/HalTopology';
import type { HalValueFrame as _linuxcnc_v1_HalValueFrame, HalValueFrame__Output as _linuxcnc_v1_HalValueFrame__Output } from './linuxcnc/v1/HalValueFrame';
import type { HalValueFrameEntry as _linuxcnc_v1_HalValueFrameEntry, HalValueFrameEntry__Output as _linuxcnc_v1_HalValueFrameEntry__Output } from './linuxcnc/v1/HalValueFrameEntry';
import type { HalValueSubscription as _linuxcnc_v1_HalValueSubscription, HalValueSubscription__Output as _linuxcnc_v1_HalValueSubscription__Output } from './linuxcnc/v1/HalValueSubscription';
import type { HalValueSubscriptionSlot as _linuxcnc_v1_HalValueSubscriptionSlot, HalValueSubscriptionSlot__Output as _linuxcnc_v1_HalValueSubscriptionSlot__Output } from './linuxcnc/v1/HalValueSubscriptionSlot';
import type { HalWrite as _linuxcnc_v1_HalWrite, HalWrite__Output as _linuxcnc_v1_HalWrite__Output } from './linuxcnc/v1/HalWrite';
import type { HalWriteResponse as _linuxcnc_v1_HalWriteResponse, HalWriteResponse__Output as _linuxcnc_v1_HalWriteResponse__Output } from './linuxcnc/v1/HalWriteResponse';
import type { HalWriteValue as _linuxcnc_v1_HalWriteValue, HalWriteValue__Output as _linuxcnc_v1_HalWriteValue__Output } from './linuxcnc/v1/HalWriteValue';
import type { HalWriterMetadata as _linuxcnc_v1_HalWriterMetadata, HalWriterMetadata__Output as _linuxcnc_v1_HalWriterMetadata__Output } from './linuxcnc/v1/HalWriterMetadata';
import type { IndexedAxisDelta as _linuxcnc_v1_IndexedAxisDelta, IndexedAxisDelta__Output as _linuxcnc_v1_IndexedAxisDelta__Output } from './linuxcnc/v1/IndexedAxisDelta';
import type { IndexedJointDelta as _linuxcnc_v1_IndexedJointDelta, IndexedJointDelta__Output as _linuxcnc_v1_IndexedJointDelta__Output } from './linuxcnc/v1/IndexedJointDelta';
import type { IndexedSpindleDelta as _linuxcnc_v1_IndexedSpindleDelta, IndexedSpindleDelta__Output as _linuxcnc_v1_IndexedSpindleDelta__Output } from './linuxcnc/v1/IndexedSpindleDelta';
import type { IoStat as _linuxcnc_v1_IoStat, IoStat__Output as _linuxcnc_v1_IoStat__Output } from './linuxcnc/v1/IoStat';
import type { IoStatDelta as _linuxcnc_v1_IoStatDelta, IoStatDelta__Output as _linuxcnc_v1_IoStatDelta__Output } from './linuxcnc/v1/IoStatDelta';
import type { JogContinuous as _linuxcnc_v1_JogContinuous, JogContinuous__Output as _linuxcnc_v1_JogContinuous__Output } from './linuxcnc/v1/JogContinuous';
import type { JogIncrement as _linuxcnc_v1_JogIncrement, JogIncrement__Output as _linuxcnc_v1_JogIncrement__Output } from './linuxcnc/v1/JogIncrement';
import type { JogStop as _linuxcnc_v1_JogStop, JogStop__Output as _linuxcnc_v1_JogStop__Output } from './linuxcnc/v1/JogStop';
import type { JointIndex as _linuxcnc_v1_JointIndex, JointIndex__Output as _linuxcnc_v1_JointIndex__Output } from './linuxcnc/v1/JointIndex';
import type { JointLimit as _linuxcnc_v1_JointLimit, JointLimit__Output as _linuxcnc_v1_JointLimit__Output } from './linuxcnc/v1/JointLimit';
import type { JointStat as _linuxcnc_v1_JointStat, JointStat__Output as _linuxcnc_v1_JointStat__Output } from './linuxcnc/v1/JointStat';
import type { LinuxCNCError as _linuxcnc_v1_LinuxCNCError, LinuxCNCError__Output as _linuxcnc_v1_LinuxCNCError__Output } from './linuxcnc/v1/LinuxCNCError';
import type { LinuxCNCStat as _linuxcnc_v1_LinuxCNCStat, LinuxCNCStat__Output as _linuxcnc_v1_LinuxCNCStat__Output } from './linuxcnc/v1/LinuxCNCStat';
import type { LinuxCNCStatDelta as _linuxcnc_v1_LinuxCNCStatDelta, LinuxCNCStatDelta__Output as _linuxcnc_v1_LinuxCNCStatDelta__Output } from './linuxcnc/v1/LinuxCNCStatDelta';
import type { MachineServiceClient as _linuxcnc_v1_MachineServiceClient, MachineServiceDefinition as _linuxcnc_v1_MachineServiceDefinition } from './linuxcnc/v1/MachineService';
import type { Mdi as _linuxcnc_v1_Mdi, Mdi__Output as _linuxcnc_v1_Mdi__Output } from './linuxcnc/v1/Mdi';
import type { MessageCommand as _linuxcnc_v1_MessageCommand, MessageCommand__Output as _linuxcnc_v1_MessageCommand__Output } from './linuxcnc/v1/MessageCommand';
import type { MotionStat as _linuxcnc_v1_MotionStat, MotionStat__Output as _linuxcnc_v1_MotionStat__Output } from './linuxcnc/v1/MotionStat';
import type { MotionStatDelta as _linuxcnc_v1_MotionStatDelta, MotionStatDelta__Output as _linuxcnc_v1_MotionStatDelta__Output } from './linuxcnc/v1/MotionStatDelta';
import type { NurbsG5Data as _linuxcnc_v1_NurbsG5Data, NurbsG5Data__Output as _linuxcnc_v1_NurbsG5Data__Output } from './linuxcnc/v1/NurbsG5Data';
import type { NurbsG6Data as _linuxcnc_v1_NurbsG6Data, NurbsG6Data__Output as _linuxcnc_v1_NurbsG6Data__Output } from './linuxcnc/v1/NurbsG6Data';
import type { OffsetData as _linuxcnc_v1_OffsetData, OffsetData__Output as _linuxcnc_v1_OffsetData__Output } from './linuxcnc/v1/OffsetData';
import type { PackedChannel as _linuxcnc_v1_PackedChannel, PackedChannel__Output as _linuxcnc_v1_PackedChannel__Output } from './linuxcnc/v1/PackedChannel';
import type { ParseBatch as _linuxcnc_v1_ParseBatch, ParseBatch__Output as _linuxcnc_v1_ParseBatch__Output } from './linuxcnc/v1/ParseBatch';
import type { ParseProgress as _linuxcnc_v1_ParseProgress, ParseProgress__Output as _linuxcnc_v1_ParseProgress__Output } from './linuxcnc/v1/ParseProgress';
import type { ParseSummary as _linuxcnc_v1_ParseSummary, ParseSummary__Output as _linuxcnc_v1_ParseSummary__Output } from './linuxcnc/v1/ParseSummary';
import type { PlaneChangeData as _linuxcnc_v1_PlaneChangeData, PlaneChangeData__Output as _linuxcnc_v1_PlaneChangeData__Output } from './linuxcnc/v1/PlaneChangeData';
import type { Position as _linuxcnc_v1_Position, Position__Output as _linuxcnc_v1_Position__Output } from './linuxcnc/v1/Position';
import type { PositionHistoryConfig as _linuxcnc_v1_PositionHistoryConfig, PositionHistoryConfig__Output as _linuxcnc_v1_PositionHistoryConfig__Output } from './linuxcnc/v1/PositionHistoryConfig';
import type { PositionHistoryFrame as _linuxcnc_v1_PositionHistoryFrame, PositionHistoryFrame__Output as _linuxcnc_v1_PositionHistoryFrame__Output } from './linuxcnc/v1/PositionHistoryFrame';
import type { ProbeData as _linuxcnc_v1_ProbeData, ProbeData__Output as _linuxcnc_v1_ProbeData__Output } from './linuxcnc/v1/ProbeData';
import type { ProgramHandle as _linuxcnc_v1_ProgramHandle, ProgramHandle__Output as _linuxcnc_v1_ProgramHandle__Output } from './linuxcnc/v1/ProgramHandle';
import type { ProgramOpen as _linuxcnc_v1_ProgramOpen, ProgramOpen__Output as _linuxcnc_v1_ProgramOpen__Output } from './linuxcnc/v1/ProgramOpen';
import type { ProgramPreviewError as _linuxcnc_v1_ProgramPreviewError, ProgramPreviewError__Output as _linuxcnc_v1_ProgramPreviewError__Output } from './linuxcnc/v1/ProgramPreviewError';
import type { ProgramPreviewEvent as _linuxcnc_v1_ProgramPreviewEvent, ProgramPreviewEvent__Output as _linuxcnc_v1_ProgramPreviewEvent__Output } from './linuxcnc/v1/ProgramPreviewEvent';
import type { ProgramServiceClient as _linuxcnc_v1_ProgramServiceClient, ProgramServiceDefinition as _linuxcnc_v1_ProgramServiceDefinition } from './linuxcnc/v1/ProgramService';
import type { RigidTapData as _linuxcnc_v1_RigidTapData, RigidTapData__Output as _linuxcnc_v1_RigidTapData__Output } from './linuxcnc/v1/RigidTapData';
import type { RotationData as _linuxcnc_v1_RotationData, RotationData__Output as _linuxcnc_v1_RotationData__Output } from './linuxcnc/v1/RotationData';
import type { RunProgram as _linuxcnc_v1_RunProgram, RunProgram__Output as _linuxcnc_v1_RunProgram__Output } from './linuxcnc/v1/RunProgram';
import type { ScopeAcquire as _linuxcnc_v1_ScopeAcquire, ScopeAcquire__Output as _linuxcnc_v1_ScopeAcquire__Output } from './linuxcnc/v1/ScopeAcquire';
import type { ScopeAcquisitionConfig as _linuxcnc_v1_ScopeAcquisitionConfig, ScopeAcquisitionConfig__Output as _linuxcnc_v1_ScopeAcquisitionConfig__Output } from './linuxcnc/v1/ScopeAcquisitionConfig';
import type { ScopeCapture as _linuxcnc_v1_ScopeCapture, ScopeCapture__Output as _linuxcnc_v1_ScopeCapture__Output } from './linuxcnc/v1/ScopeCapture';
import type { ScopeCaptureDelta as _linuxcnc_v1_ScopeCaptureDelta, ScopeCaptureDelta__Output as _linuxcnc_v1_ScopeCaptureDelta__Output } from './linuxcnc/v1/ScopeCaptureDelta';
import type { ScopeChannelConfig as _linuxcnc_v1_ScopeChannelConfig, ScopeChannelConfig__Output as _linuxcnc_v1_ScopeChannelConfig__Output } from './linuxcnc/v1/ScopeChannelConfig';
import type { ScopeConfigure as _linuxcnc_v1_ScopeConfigure, ScopeConfigure__Output as _linuxcnc_v1_ScopeConfigure__Output } from './linuxcnc/v1/ScopeConfigure';
import type { ScopeFrameAck as _linuxcnc_v1_ScopeFrameAck, ScopeFrameAck__Output as _linuxcnc_v1_ScopeFrameAck__Output } from './linuxcnc/v1/ScopeFrameAck';
import type { ScopeRun as _linuxcnc_v1_ScopeRun, ScopeRun__Output as _linuxcnc_v1_ScopeRun__Output } from './linuxcnc/v1/ScopeRun';
import type { ScopeServiceClient as _linuxcnc_v1_ScopeServiceClient, ScopeServiceDefinition as _linuxcnc_v1_ScopeServiceDefinition } from './linuxcnc/v1/ScopeService';
import type { ScopeSessionMessage as _linuxcnc_v1_ScopeSessionMessage, ScopeSessionMessage__Output as _linuxcnc_v1_ScopeSessionMessage__Output } from './linuxcnc/v1/ScopeSessionMessage';
import type { ScopeStatus as _linuxcnc_v1_ScopeStatus, ScopeStatus__Output as _linuxcnc_v1_ScopeStatus__Output } from './linuxcnc/v1/ScopeStatus';
import type { ScopeStop as _linuxcnc_v1_ScopeStop, ScopeStop__Output as _linuxcnc_v1_ScopeStop__Output } from './linuxcnc/v1/ScopeStop';
import type { ScopeTrigger as _linuxcnc_v1_ScopeTrigger, ScopeTrigger__Output as _linuxcnc_v1_ScopeTrigger__Output } from './linuxcnc/v1/ScopeTrigger';
import type { SetBool as _linuxcnc_v1_SetBool, SetBool__Output as _linuxcnc_v1_SetBool__Output } from './linuxcnc/v1/SetBool';
import type { SetDebugLevel as _linuxcnc_v1_SetDebugLevel, SetDebugLevel__Output as _linuxcnc_v1_SetDebugLevel__Output } from './linuxcnc/v1/SetDebugLevel';
import type { SetFeedRate as _linuxcnc_v1_SetFeedRate, SetFeedRate__Output as _linuxcnc_v1_SetFeedRate__Output } from './linuxcnc/v1/SetFeedRate';
import type { SetFlood as _linuxcnc_v1_SetFlood, SetFlood__Output as _linuxcnc_v1_SetFlood__Output } from './linuxcnc/v1/SetFlood';
import type { SetHalMessageLevelRequest as _linuxcnc_v1_SetHalMessageLevelRequest, SetHalMessageLevelRequest__Output as _linuxcnc_v1_SetHalMessageLevelRequest__Output } from './linuxcnc/v1/SetHalMessageLevelRequest';
import type { SetHalWriterReadyRequest as _linuxcnc_v1_SetHalWriterReadyRequest, SetHalWriterReadyRequest__Output as _linuxcnc_v1_SetHalWriterReadyRequest__Output } from './linuxcnc/v1/SetHalWriterReadyRequest';
import type { SetMaxVelocity as _linuxcnc_v1_SetMaxVelocity, SetMaxVelocity__Output as _linuxcnc_v1_SetMaxVelocity__Output } from './linuxcnc/v1/SetMaxVelocity';
import type { SetMist as _linuxcnc_v1_SetMist, SetMist__Output as _linuxcnc_v1_SetMist__Output } from './linuxcnc/v1/SetMist';
import type { SetRapidRate as _linuxcnc_v1_SetRapidRate, SetRapidRate__Output as _linuxcnc_v1_SetRapidRate__Output } from './linuxcnc/v1/SetRapidRate';
import type { SetSpindleOverride as _linuxcnc_v1_SetSpindleOverride, SetSpindleOverride__Output as _linuxcnc_v1_SetSpindleOverride__Output } from './linuxcnc/v1/SetSpindleOverride';
import type { SetSpindleOverrideEnable as _linuxcnc_v1_SetSpindleOverrideEnable, SetSpindleOverrideEnable__Output as _linuxcnc_v1_SetSpindleOverrideEnable__Output } from './linuxcnc/v1/SetSpindleOverrideEnable';
import type { SetTaskMode as _linuxcnc_v1_SetTaskMode, SetTaskMode__Output as _linuxcnc_v1_SetTaskMode__Output } from './linuxcnc/v1/SetTaskMode';
import type { SetTaskState as _linuxcnc_v1_SetTaskState, SetTaskState__Output as _linuxcnc_v1_SetTaskState__Output } from './linuxcnc/v1/SetTaskState';
import type { SetTool as _linuxcnc_v1_SetTool, SetTool__Output as _linuxcnc_v1_SetTool__Output } from './linuxcnc/v1/SetTool';
import type { SetTrajMode as _linuxcnc_v1_SetTrajMode, SetTrajMode__Output as _linuxcnc_v1_SetTrajMode__Output } from './linuxcnc/v1/SetTrajMode';
import type { SpindleBrake as _linuxcnc_v1_SpindleBrake, SpindleBrake__Output as _linuxcnc_v1_SpindleBrake__Output } from './linuxcnc/v1/SpindleBrake';
import type { SpindleIndex as _linuxcnc_v1_SpindleIndex, SpindleIndex__Output as _linuxcnc_v1_SpindleIndex__Output } from './linuxcnc/v1/SpindleIndex';
import type { SpindleOn as _linuxcnc_v1_SpindleOn, SpindleOn__Output as _linuxcnc_v1_SpindleOn__Output } from './linuxcnc/v1/SpindleOn';
import type { SpindleStat as _linuxcnc_v1_SpindleStat, SpindleStat__Output as _linuxcnc_v1_SpindleStat__Output } from './linuxcnc/v1/SpindleStat';
import type { StatusReplay as _linuxcnc_v1_StatusReplay, StatusReplay__Output as _linuxcnc_v1_StatusReplay__Output } from './linuxcnc/v1/StatusReplay';
import type { TaskStat as _linuxcnc_v1_TaskStat, TaskStat__Output as _linuxcnc_v1_TaskStat__Output } from './linuxcnc/v1/TaskStat';
import type { TaskStatDelta as _linuxcnc_v1_TaskStatDelta, TaskStatDelta__Output as _linuxcnc_v1_TaskStatDelta__Output } from './linuxcnc/v1/TaskStatDelta';
import type { ToolChangeData as _linuxcnc_v1_ToolChangeData, ToolChangeData__Output as _linuxcnc_v1_ToolChangeData__Output } from './linuxcnc/v1/ToolChangeData';
import type { ToolEntry as _linuxcnc_v1_ToolEntry, ToolEntry__Output as _linuxcnc_v1_ToolEntry__Output } from './linuxcnc/v1/ToolEntry';
import type { ToolIoStat as _linuxcnc_v1_ToolIoStat, ToolIoStat__Output as _linuxcnc_v1_ToolIoStat__Output } from './linuxcnc/v1/ToolIoStat';
import type { ToolNumber as _linuxcnc_v1_ToolNumber, ToolNumber__Output as _linuxcnc_v1_ToolNumber__Output } from './linuxcnc/v1/ToolNumber';
import type { ToolTableDelta as _linuxcnc_v1_ToolTableDelta, ToolTableDelta__Output as _linuxcnc_v1_ToolTableDelta__Output } from './linuxcnc/v1/ToolTableDelta';
import type { TrajectoryStat as _linuxcnc_v1_TrajectoryStat, TrajectoryStat__Output as _linuxcnc_v1_TrajectoryStat__Output } from './linuxcnc/v1/TrajectoryStat';
import type { UnitsChangeData as _linuxcnc_v1_UnitsChangeData, UnitsChangeData__Output as _linuxcnc_v1_UnitsChangeData__Output } from './linuxcnc/v1/UnitsChangeData';
import type { UpdateHalValueSubscriptionRequest as _linuxcnc_v1_UpdateHalValueSubscriptionRequest, UpdateHalValueSubscriptionRequest__Output as _linuxcnc_v1_UpdateHalValueSubscriptionRequest__Output } from './linuxcnc/v1/UpdateHalValueSubscriptionRequest';
import type { UploadWorkspaceRequest as _linuxcnc_v1_UploadWorkspaceRequest, UploadWorkspaceRequest__Output as _linuxcnc_v1_UploadWorkspaceRequest__Output } from './linuxcnc/v1/UploadWorkspaceRequest';
import type { UploadWorkspaceResponse as _linuxcnc_v1_UploadWorkspaceResponse, UploadWorkspaceResponse__Output as _linuxcnc_v1_UploadWorkspaceResponse__Output } from './linuxcnc/v1/UploadWorkspaceResponse';
import type { WatchHalTopologyEvent as _linuxcnc_v1_WatchHalTopologyEvent, WatchHalTopologyEvent__Output as _linuxcnc_v1_WatchHalTopologyEvent__Output } from './linuxcnc/v1/WatchHalTopologyEvent';
import type { WatchHalTopologyRequest as _linuxcnc_v1_WatchHalTopologyRequest, WatchHalTopologyRequest__Output as _linuxcnc_v1_WatchHalTopologyRequest__Output } from './linuxcnc/v1/WatchHalTopologyRequest';
import type { WatchStatusEvent as _linuxcnc_v1_WatchStatusEvent, WatchStatusEvent__Output as _linuxcnc_v1_WatchStatusEvent__Output } from './linuxcnc/v1/WatchStatusEvent';
import type { WatchStatusRequest as _linuxcnc_v1_WatchStatusRequest, WatchStatusRequest__Output as _linuxcnc_v1_WatchStatusRequest__Output } from './linuxcnc/v1/WatchStatusRequest';

type SubtypeConstructor<Constructor extends new (...args: any) => any, Subtype> = {
  new(...args: ConstructorParameters<Constructor>): Subtype;
};

export interface ProtoGrpcType {
  google: {
    protobuf: {
      Empty: MessageTypeDefinition<_google_protobuf_Empty, _google_protobuf_Empty__Output>
    }
  }
  linuxcnc: {
    v1: {
      ActiveGCodes: MessageTypeDefinition<_linuxcnc_v1_ActiveGCodes, _linuxcnc_v1_ActiveGCodes__Output>
      ActiveMCodes: MessageTypeDefinition<_linuxcnc_v1_ActiveMCodes, _linuxcnc_v1_ActiveMCodes__Output>
      ActiveSettings: MessageTypeDefinition<_linuxcnc_v1_ActiveSettings, _linuxcnc_v1_ActiveSettings__Output>
      AnalogOutput: MessageTypeDefinition<_linuxcnc_v1_AnalogOutput, _linuxcnc_v1_AnalogOutput__Output>
      ArcData: MessageTypeDefinition<_linuxcnc_v1_ArcData, _linuxcnc_v1_ArcData__Output>
      AxisName: EnumTypeDefinition
      AxisStat: MessageTypeDefinition<_linuxcnc_v1_AxisStat, _linuxcnc_v1_AxisStat__Output>
      ComponentClose: MessageTypeDefinition<_linuxcnc_v1_ComponentClose, _linuxcnc_v1_ComponentClose__Output>
      ComponentDelta: MessageTypeDefinition<_linuxcnc_v1_ComponentDelta, _linuxcnc_v1_ComponentDelta__Output>
      ComponentOpen: MessageTypeDefinition<_linuxcnc_v1_ComponentOpen, _linuxcnc_v1_ComponentOpen__Output>
      ComponentParameter: MessageTypeDefinition<_linuxcnc_v1_ComponentParameter, _linuxcnc_v1_ComponentParameter__Output>
      ComponentPin: MessageTypeDefinition<_linuxcnc_v1_ComponentPin, _linuxcnc_v1_ComponentPin__Output>
      ComponentReady: MessageTypeDefinition<_linuxcnc_v1_ComponentReady, _linuxcnc_v1_ComponentReady__Output>
      ComponentSessionMessage: MessageTypeDefinition<_linuxcnc_v1_ComponentSessionMessage, _linuxcnc_v1_ComponentSessionMessage__Output>
      ComponentValue: MessageTypeDefinition<_linuxcnc_v1_ComponentValue, _linuxcnc_v1_ComponentValue__Output>
      ControlPointG5: MessageTypeDefinition<_linuxcnc_v1_ControlPointG5, _linuxcnc_v1_ControlPointG5__Output>
      ControlPointG6: MessageTypeDefinition<_linuxcnc_v1_ControlPointG6, _linuxcnc_v1_ControlPointG6__Output>
      CoolantIoStat: MessageTypeDefinition<_linuxcnc_v1_CoolantIoStat, _linuxcnc_v1_CoolantIoStat__Output>
      CreateHalSignalRequest: MessageTypeDefinition<_linuxcnc_v1_CreateHalSignalRequest, _linuxcnc_v1_CreateHalSignalRequest__Output>
      CreateHalSignalResponse: MessageTypeDefinition<_linuxcnc_v1_CreateHalSignalResponse, _linuxcnc_v1_CreateHalSignalResponse__Output>
      CreateHalValueSubscriptionRequest: MessageTypeDefinition<_linuxcnc_v1_CreateHalValueSubscriptionRequest, _linuxcnc_v1_CreateHalValueSubscriptionRequest__Output>
      CreateWorkspaceRequest: MessageTypeDefinition<_linuxcnc_v1_CreateWorkspaceRequest, _linuxcnc_v1_CreateWorkspaceRequest__Output>
      CreateWorkspaceResponse: MessageTypeDefinition<_linuxcnc_v1_CreateWorkspaceResponse, _linuxcnc_v1_CreateWorkspaceResponse__Output>
      DeleteHalValueSubscriptionRequest: MessageTypeDefinition<_linuxcnc_v1_DeleteHalValueSubscriptionRequest, _linuxcnc_v1_DeleteHalValueSubscriptionRequest__Output>
      DeleteWorkspaceRequest: MessageTypeDefinition<_linuxcnc_v1_DeleteWorkspaceRequest, _linuxcnc_v1_DeleteWorkspaceRequest__Output>
      DigitalOutput: MessageTypeDefinition<_linuxcnc_v1_DigitalOutput, _linuxcnc_v1_DigitalOutput__Output>
      DwellData: MessageTypeDefinition<_linuxcnc_v1_DwellData, _linuxcnc_v1_DwellData__Output>
      EmcDebug: EnumTypeDefinition
      EmptyCommand: MessageTypeDefinition<_linuxcnc_v1_EmptyCommand, _linuxcnc_v1_EmptyCommand__Output>
      ExecState: EnumTypeDefinition
      ExecuteCommandRequest: MessageTypeDefinition<_linuxcnc_v1_ExecuteCommandRequest, _linuxcnc_v1_ExecuteCommandRequest__Output>
      ExecuteCommandResponse: MessageTypeDefinition<_linuxcnc_v1_ExecuteCommandResponse, _linuxcnc_v1_ExecuteCommandResponse__Output>
      Extents: MessageTypeDefinition<_linuxcnc_v1_Extents, _linuxcnc_v1_Extents__Output>
      FeedRateData: MessageTypeDefinition<_linuxcnc_v1_FeedRateData, _linuxcnc_v1_FeedRateData__Output>
      FileChunk: MessageTypeDefinition<_linuxcnc_v1_FileChunk, _linuxcnc_v1_FileChunk__Output>
      FrameKind: EnumTypeDefinition
      G5xOffsetData: MessageTypeDefinition<_linuxcnc_v1_G5xOffsetData, _linuxcnc_v1_G5xOffsetData__Output>
      GCodeOperation: MessageTypeDefinition<_linuxcnc_v1_GCodeOperation, _linuxcnc_v1_GCodeOperation__Output>
      GetHalTopologyRequest: MessageTypeDefinition<_linuxcnc_v1_GetHalTopologyRequest, _linuxcnc_v1_GetHalTopologyRequest__Output>
      GetHalTopologyResponse: MessageTypeDefinition<_linuxcnc_v1_GetHalTopologyResponse, _linuxcnc_v1_GetHalTopologyResponse__Output>
      GetHalWriterMetadataRequest: MessageTypeDefinition<_linuxcnc_v1_GetHalWriterMetadataRequest, _linuxcnc_v1_GetHalWriterMetadataRequest__Output>
      GetHalWriterMetadataResponse: MessageTypeDefinition<_linuxcnc_v1_GetHalWriterMetadataResponse, _linuxcnc_v1_GetHalWriterMetadataResponse__Output>
      GetStatusRequest: MessageTypeDefinition<_linuxcnc_v1_GetStatusRequest, _linuxcnc_v1_GetStatusRequest__Output>
      GetStatusResponse: MessageTypeDefinition<_linuxcnc_v1_GetStatusResponse, _linuxcnc_v1_GetStatusResponse__Output>
      HalComponentInfo: MessageTypeDefinition<_linuxcnc_v1_HalComponentInfo, _linuxcnc_v1_HalComponentInfo__Output>
      HalComponentKind: EnumTypeDefinition
      HalFunctionInfo: MessageTypeDefinition<_linuxcnc_v1_HalFunctionInfo, _linuxcnc_v1_HalFunctionInfo__Output>
      HalItemKind: EnumTypeDefinition
      HalItemRef: MessageTypeDefinition<_linuxcnc_v1_HalItemRef, _linuxcnc_v1_HalItemRef__Output>
      HalParamDirection: EnumTypeDefinition
      HalParamInfo: MessageTypeDefinition<_linuxcnc_v1_HalParamInfo, _linuxcnc_v1_HalParamInfo__Output>
      HalPinDirection: EnumTypeDefinition
      HalPinInfo: MessageTypeDefinition<_linuxcnc_v1_HalPinInfo, _linuxcnc_v1_HalPinInfo__Output>
      HalReadRequest: MessageTypeDefinition<_linuxcnc_v1_HalReadRequest, _linuxcnc_v1_HalReadRequest__Output>
      HalReadResponse: MessageTypeDefinition<_linuxcnc_v1_HalReadResponse, _linuxcnc_v1_HalReadResponse__Output>
      HalReadValue: MessageTypeDefinition<_linuxcnc_v1_HalReadValue, _linuxcnc_v1_HalReadValue__Output>
      HalScalar: MessageTypeDefinition<_linuxcnc_v1_HalScalar, _linuxcnc_v1_HalScalar__Output>
      HalService: SubtypeConstructor<typeof grpc.Client, _linuxcnc_v1_HalServiceClient> & { service: _linuxcnc_v1_HalServiceDefinition }
      HalSignalInfo: MessageTypeDefinition<_linuxcnc_v1_HalSignalInfo, _linuxcnc_v1_HalSignalInfo__Output>
      HalThreadInfo: MessageTypeDefinition<_linuxcnc_v1_HalThreadInfo, _linuxcnc_v1_HalThreadInfo__Output>
      HalTopology: MessageTypeDefinition<_linuxcnc_v1_HalTopology, _linuxcnc_v1_HalTopology__Output>
      HalType: EnumTypeDefinition
      HalValueFrame: MessageTypeDefinition<_linuxcnc_v1_HalValueFrame, _linuxcnc_v1_HalValueFrame__Output>
      HalValueFrameEntry: MessageTypeDefinition<_linuxcnc_v1_HalValueFrameEntry, _linuxcnc_v1_HalValueFrameEntry__Output>
      HalValueSubscription: MessageTypeDefinition<_linuxcnc_v1_HalValueSubscription, _linuxcnc_v1_HalValueSubscription__Output>
      HalValueSubscriptionSlot: MessageTypeDefinition<_linuxcnc_v1_HalValueSubscriptionSlot, _linuxcnc_v1_HalValueSubscriptionSlot__Output>
      HalWrite: MessageTypeDefinition<_linuxcnc_v1_HalWrite, _linuxcnc_v1_HalWrite__Output>
      HalWriteResponse: MessageTypeDefinition<_linuxcnc_v1_HalWriteResponse, _linuxcnc_v1_HalWriteResponse__Output>
      HalWriteValue: MessageTypeDefinition<_linuxcnc_v1_HalWriteValue, _linuxcnc_v1_HalWriteValue__Output>
      HalWriterMetadata: MessageTypeDefinition<_linuxcnc_v1_HalWriterMetadata, _linuxcnc_v1_HalWriterMetadata__Output>
      IndexedAxisDelta: MessageTypeDefinition<_linuxcnc_v1_IndexedAxisDelta, _linuxcnc_v1_IndexedAxisDelta__Output>
      IndexedJointDelta: MessageTypeDefinition<_linuxcnc_v1_IndexedJointDelta, _linuxcnc_v1_IndexedJointDelta__Output>
      IndexedSpindleDelta: MessageTypeDefinition<_linuxcnc_v1_IndexedSpindleDelta, _linuxcnc_v1_IndexedSpindleDelta__Output>
      InterpState: EnumTypeDefinition
      IoStat: MessageTypeDefinition<_linuxcnc_v1_IoStat, _linuxcnc_v1_IoStat__Output>
      IoStatDelta: MessageTypeDefinition<_linuxcnc_v1_IoStatDelta, _linuxcnc_v1_IoStatDelta__Output>
      JogContinuous: MessageTypeDefinition<_linuxcnc_v1_JogContinuous, _linuxcnc_v1_JogContinuous__Output>
      JogIncrement: MessageTypeDefinition<_linuxcnc_v1_JogIncrement, _linuxcnc_v1_JogIncrement__Output>
      JogStop: MessageTypeDefinition<_linuxcnc_v1_JogStop, _linuxcnc_v1_JogStop__Output>
      JointIndex: MessageTypeDefinition<_linuxcnc_v1_JointIndex, _linuxcnc_v1_JointIndex__Output>
      JointLimit: MessageTypeDefinition<_linuxcnc_v1_JointLimit, _linuxcnc_v1_JointLimit__Output>
      JointStat: MessageTypeDefinition<_linuxcnc_v1_JointStat, _linuxcnc_v1_JointStat__Output>
      JointType: EnumTypeDefinition
      KinematicsType: EnumTypeDefinition
      LinuxCNCError: MessageTypeDefinition<_linuxcnc_v1_LinuxCNCError, _linuxcnc_v1_LinuxCNCError__Output>
      LinuxCNCStat: MessageTypeDefinition<_linuxcnc_v1_LinuxCNCStat, _linuxcnc_v1_LinuxCNCStat__Output>
      LinuxCNCStatDelta: MessageTypeDefinition<_linuxcnc_v1_LinuxCNCStatDelta, _linuxcnc_v1_LinuxCNCStatDelta__Output>
      MachineService: SubtypeConstructor<typeof grpc.Client, _linuxcnc_v1_MachineServiceClient> & { service: _linuxcnc_v1_MachineServiceDefinition }
      Mdi: MessageTypeDefinition<_linuxcnc_v1_Mdi, _linuxcnc_v1_Mdi__Output>
      MessageCommand: MessageTypeDefinition<_linuxcnc_v1_MessageCommand, _linuxcnc_v1_MessageCommand__Output>
      MotionStat: MessageTypeDefinition<_linuxcnc_v1_MotionStat, _linuxcnc_v1_MotionStat__Output>
      MotionStatDelta: MessageTypeDefinition<_linuxcnc_v1_MotionStatDelta, _linuxcnc_v1_MotionStatDelta__Output>
      MotionType: EnumTypeDefinition
      NmlMessageType: EnumTypeDefinition
      NurbsG5Data: MessageTypeDefinition<_linuxcnc_v1_NurbsG5Data, _linuxcnc_v1_NurbsG5Data__Output>
      NurbsG6Data: MessageTypeDefinition<_linuxcnc_v1_NurbsG6Data, _linuxcnc_v1_NurbsG6Data__Output>
      OffsetData: MessageTypeDefinition<_linuxcnc_v1_OffsetData, _linuxcnc_v1_OffsetData__Output>
      OperationType: EnumTypeDefinition
      OrientState: EnumTypeDefinition
      PackedChannel: MessageTypeDefinition<_linuxcnc_v1_PackedChannel, _linuxcnc_v1_PackedChannel__Output>
      ParseBatch: MessageTypeDefinition<_linuxcnc_v1_ParseBatch, _linuxcnc_v1_ParseBatch__Output>
      ParseProgress: MessageTypeDefinition<_linuxcnc_v1_ParseProgress, _linuxcnc_v1_ParseProgress__Output>
      ParseSummary: MessageTypeDefinition<_linuxcnc_v1_ParseSummary, _linuxcnc_v1_ParseSummary__Output>
      Plane: EnumTypeDefinition
      PlaneChangeData: MessageTypeDefinition<_linuxcnc_v1_PlaneChangeData, _linuxcnc_v1_PlaneChangeData__Output>
      Position: MessageTypeDefinition<_linuxcnc_v1_Position, _linuxcnc_v1_Position__Output>
      PositionHistoryConfig: MessageTypeDefinition<_linuxcnc_v1_PositionHistoryConfig, _linuxcnc_v1_PositionHistoryConfig__Output>
      PositionHistoryFrame: MessageTypeDefinition<_linuxcnc_v1_PositionHistoryFrame, _linuxcnc_v1_PositionHistoryFrame__Output>
      ProbeData: MessageTypeDefinition<_linuxcnc_v1_ProbeData, _linuxcnc_v1_ProbeData__Output>
      ProgramHandle: MessageTypeDefinition<_linuxcnc_v1_ProgramHandle, _linuxcnc_v1_ProgramHandle__Output>
      ProgramOpen: MessageTypeDefinition<_linuxcnc_v1_ProgramOpen, _linuxcnc_v1_ProgramOpen__Output>
      ProgramPreviewError: MessageTypeDefinition<_linuxcnc_v1_ProgramPreviewError, _linuxcnc_v1_ProgramPreviewError__Output>
      ProgramPreviewErrorCode: EnumTypeDefinition
      ProgramPreviewEvent: MessageTypeDefinition<_linuxcnc_v1_ProgramPreviewEvent, _linuxcnc_v1_ProgramPreviewEvent__Output>
      ProgramService: SubtypeConstructor<typeof grpc.Client, _linuxcnc_v1_ProgramServiceClient> & { service: _linuxcnc_v1_ProgramServiceDefinition }
      ProgramUnits: EnumTypeDefinition
      RcsStatus: EnumTypeDefinition
      RigidTapData: MessageTypeDefinition<_linuxcnc_v1_RigidTapData, _linuxcnc_v1_RigidTapData__Output>
      RotationData: MessageTypeDefinition<_linuxcnc_v1_RotationData, _linuxcnc_v1_RotationData__Output>
      RtapiMessageLevel: EnumTypeDefinition
      RunProgram: MessageTypeDefinition<_linuxcnc_v1_RunProgram, _linuxcnc_v1_RunProgram__Output>
      ScopeAcquire: MessageTypeDefinition<_linuxcnc_v1_ScopeAcquire, _linuxcnc_v1_ScopeAcquire__Output>
      ScopeAcquisitionConfig: MessageTypeDefinition<_linuxcnc_v1_ScopeAcquisitionConfig, _linuxcnc_v1_ScopeAcquisitionConfig__Output>
      ScopeCapture: MessageTypeDefinition<_linuxcnc_v1_ScopeCapture, _linuxcnc_v1_ScopeCapture__Output>
      ScopeCaptureDelta: MessageTypeDefinition<_linuxcnc_v1_ScopeCaptureDelta, _linuxcnc_v1_ScopeCaptureDelta__Output>
      ScopeChannelConfig: MessageTypeDefinition<_linuxcnc_v1_ScopeChannelConfig, _linuxcnc_v1_ScopeChannelConfig__Output>
      ScopeConfigure: MessageTypeDefinition<_linuxcnc_v1_ScopeConfigure, _linuxcnc_v1_ScopeConfigure__Output>
      ScopeFrameAck: MessageTypeDefinition<_linuxcnc_v1_ScopeFrameAck, _linuxcnc_v1_ScopeFrameAck__Output>
      ScopeRun: MessageTypeDefinition<_linuxcnc_v1_ScopeRun, _linuxcnc_v1_ScopeRun__Output>
      ScopeRunMode: EnumTypeDefinition
      ScopeRuntimeState: EnumTypeDefinition
      ScopeService: SubtypeConstructor<typeof grpc.Client, _linuxcnc_v1_ScopeServiceClient> & { service: _linuxcnc_v1_ScopeServiceDefinition }
      ScopeSessionMessage: MessageTypeDefinition<_linuxcnc_v1_ScopeSessionMessage, _linuxcnc_v1_ScopeSessionMessage__Output>
      ScopeStatus: MessageTypeDefinition<_linuxcnc_v1_ScopeStatus, _linuxcnc_v1_ScopeStatus__Output>
      ScopeStop: MessageTypeDefinition<_linuxcnc_v1_ScopeStop, _linuxcnc_v1_ScopeStop__Output>
      ScopeTrigger: MessageTypeDefinition<_linuxcnc_v1_ScopeTrigger, _linuxcnc_v1_ScopeTrigger__Output>
      SetBool: MessageTypeDefinition<_linuxcnc_v1_SetBool, _linuxcnc_v1_SetBool__Output>
      SetDebugLevel: MessageTypeDefinition<_linuxcnc_v1_SetDebugLevel, _linuxcnc_v1_SetDebugLevel__Output>
      SetFeedRate: MessageTypeDefinition<_linuxcnc_v1_SetFeedRate, _linuxcnc_v1_SetFeedRate__Output>
      SetFlood: MessageTypeDefinition<_linuxcnc_v1_SetFlood, _linuxcnc_v1_SetFlood__Output>
      SetHalMessageLevelRequest: MessageTypeDefinition<_linuxcnc_v1_SetHalMessageLevelRequest, _linuxcnc_v1_SetHalMessageLevelRequest__Output>
      SetHalWriterReadyRequest: MessageTypeDefinition<_linuxcnc_v1_SetHalWriterReadyRequest, _linuxcnc_v1_SetHalWriterReadyRequest__Output>
      SetMaxVelocity: MessageTypeDefinition<_linuxcnc_v1_SetMaxVelocity, _linuxcnc_v1_SetMaxVelocity__Output>
      SetMist: MessageTypeDefinition<_linuxcnc_v1_SetMist, _linuxcnc_v1_SetMist__Output>
      SetRapidRate: MessageTypeDefinition<_linuxcnc_v1_SetRapidRate, _linuxcnc_v1_SetRapidRate__Output>
      SetSpindleOverride: MessageTypeDefinition<_linuxcnc_v1_SetSpindleOverride, _linuxcnc_v1_SetSpindleOverride__Output>
      SetSpindleOverrideEnable: MessageTypeDefinition<_linuxcnc_v1_SetSpindleOverrideEnable, _linuxcnc_v1_SetSpindleOverrideEnable__Output>
      SetTaskMode: MessageTypeDefinition<_linuxcnc_v1_SetTaskMode, _linuxcnc_v1_SetTaskMode__Output>
      SetTaskState: MessageTypeDefinition<_linuxcnc_v1_SetTaskState, _linuxcnc_v1_SetTaskState__Output>
      SetTool: MessageTypeDefinition<_linuxcnc_v1_SetTool, _linuxcnc_v1_SetTool__Output>
      SetTrajMode: MessageTypeDefinition<_linuxcnc_v1_SetTrajMode, _linuxcnc_v1_SetTrajMode__Output>
      SpindleBrake: MessageTypeDefinition<_linuxcnc_v1_SpindleBrake, _linuxcnc_v1_SpindleBrake__Output>
      SpindleIndex: MessageTypeDefinition<_linuxcnc_v1_SpindleIndex, _linuxcnc_v1_SpindleIndex__Output>
      SpindleOn: MessageTypeDefinition<_linuxcnc_v1_SpindleOn, _linuxcnc_v1_SpindleOn__Output>
      SpindleStat: MessageTypeDefinition<_linuxcnc_v1_SpindleStat, _linuxcnc_v1_SpindleStat__Output>
      StatusReplay: MessageTypeDefinition<_linuxcnc_v1_StatusReplay, _linuxcnc_v1_StatusReplay__Output>
      StopState: EnumTypeDefinition
      TaskMode: EnumTypeDefinition
      TaskStat: MessageTypeDefinition<_linuxcnc_v1_TaskStat, _linuxcnc_v1_TaskStat__Output>
      TaskStatDelta: MessageTypeDefinition<_linuxcnc_v1_TaskStatDelta, _linuxcnc_v1_TaskStatDelta__Output>
      TaskState: EnumTypeDefinition
      ToolChangeData: MessageTypeDefinition<_linuxcnc_v1_ToolChangeData, _linuxcnc_v1_ToolChangeData__Output>
      ToolEntry: MessageTypeDefinition<_linuxcnc_v1_ToolEntry, _linuxcnc_v1_ToolEntry__Output>
      ToolIoStat: MessageTypeDefinition<_linuxcnc_v1_ToolIoStat, _linuxcnc_v1_ToolIoStat__Output>
      ToolNumber: MessageTypeDefinition<_linuxcnc_v1_ToolNumber, _linuxcnc_v1_ToolNumber__Output>
      ToolTableDelta: MessageTypeDefinition<_linuxcnc_v1_ToolTableDelta, _linuxcnc_v1_ToolTableDelta__Output>
      TrajMode: EnumTypeDefinition
      TrajectoryStat: MessageTypeDefinition<_linuxcnc_v1_TrajectoryStat, _linuxcnc_v1_TrajectoryStat__Output>
      UnitsChangeData: MessageTypeDefinition<_linuxcnc_v1_UnitsChangeData, _linuxcnc_v1_UnitsChangeData__Output>
      UpdateHalValueSubscriptionRequest: MessageTypeDefinition<_linuxcnc_v1_UpdateHalValueSubscriptionRequest, _linuxcnc_v1_UpdateHalValueSubscriptionRequest__Output>
      UploadWorkspaceRequest: MessageTypeDefinition<_linuxcnc_v1_UploadWorkspaceRequest, _linuxcnc_v1_UploadWorkspaceRequest__Output>
      UploadWorkspaceResponse: MessageTypeDefinition<_linuxcnc_v1_UploadWorkspaceResponse, _linuxcnc_v1_UploadWorkspaceResponse__Output>
      WaitPolicy: EnumTypeDefinition
      WatchHalTopologyEvent: MessageTypeDefinition<_linuxcnc_v1_WatchHalTopologyEvent, _linuxcnc_v1_WatchHalTopologyEvent__Output>
      WatchHalTopologyRequest: MessageTypeDefinition<_linuxcnc_v1_WatchHalTopologyRequest, _linuxcnc_v1_WatchHalTopologyRequest__Output>
      WatchStatusEvent: MessageTypeDefinition<_linuxcnc_v1_WatchStatusEvent, _linuxcnc_v1_WatchStatusEvent__Output>
      WatchStatusRequest: MessageTypeDefinition<_linuxcnc_v1_WatchStatusRequest, _linuxcnc_v1_WatchStatusRequest__Output>
    }
  }
}

