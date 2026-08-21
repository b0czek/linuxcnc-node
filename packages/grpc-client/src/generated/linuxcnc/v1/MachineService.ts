// Original file: proto/linuxcnc/v1/linuxcnc.proto

import type * as grpc from '@grpc/grpc-js'
import type { MethodDefinition } from '@grpc/proto-loader'
import type { Empty as _google_protobuf_Empty, Empty__Output as _google_protobuf_Empty__Output } from '../../google/protobuf/Empty';
import type { ExecuteCommandRequest as _linuxcnc_v1_ExecuteCommandRequest, ExecuteCommandRequest__Output as _linuxcnc_v1_ExecuteCommandRequest__Output } from '../../linuxcnc/v1/ExecuteCommandRequest';
import type { ExecuteCommandResponse as _linuxcnc_v1_ExecuteCommandResponse, ExecuteCommandResponse__Output as _linuxcnc_v1_ExecuteCommandResponse__Output } from '../../linuxcnc/v1/ExecuteCommandResponse';
import type { GetStatusRequest as _linuxcnc_v1_GetStatusRequest, GetStatusRequest__Output as _linuxcnc_v1_GetStatusRequest__Output } from '../../linuxcnc/v1/GetStatusRequest';
import type { GetStatusResponse as _linuxcnc_v1_GetStatusResponse, GetStatusResponse__Output as _linuxcnc_v1_GetStatusResponse__Output } from '../../linuxcnc/v1/GetStatusResponse';
import type { LinuxCNCError as _linuxcnc_v1_LinuxCNCError, LinuxCNCError__Output as _linuxcnc_v1_LinuxCNCError__Output } from '../../linuxcnc/v1/LinuxCNCError';
import type { PositionHistoryConfig as _linuxcnc_v1_PositionHistoryConfig, PositionHistoryConfig__Output as _linuxcnc_v1_PositionHistoryConfig__Output } from '../../linuxcnc/v1/PositionHistoryConfig';
import type { PositionHistoryEvent as _linuxcnc_v1_PositionHistoryEvent, PositionHistoryEvent__Output as _linuxcnc_v1_PositionHistoryEvent__Output } from '../../linuxcnc/v1/PositionHistoryEvent';
import type { PositionHistoryRequest as _linuxcnc_v1_PositionHistoryRequest, PositionHistoryRequest__Output as _linuxcnc_v1_PositionHistoryRequest__Output } from '../../linuxcnc/v1/PositionHistoryRequest';
import type { PositionHistorySnapshot as _linuxcnc_v1_PositionHistorySnapshot, PositionHistorySnapshot__Output as _linuxcnc_v1_PositionHistorySnapshot__Output } from '../../linuxcnc/v1/PositionHistorySnapshot';
import type { WatchStatusEvent as _linuxcnc_v1_WatchStatusEvent, WatchStatusEvent__Output as _linuxcnc_v1_WatchStatusEvent__Output } from '../../linuxcnc/v1/WatchStatusEvent';
import type { WatchStatusRequest as _linuxcnc_v1_WatchStatusRequest, WatchStatusRequest__Output as _linuxcnc_v1_WatchStatusRequest__Output } from '../../linuxcnc/v1/WatchStatusRequest';

export interface MachineServiceClient extends grpc.Client {
  ClearPositionHistory(argument: _google_protobuf_Empty, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_google_protobuf_Empty__Output>): grpc.ClientUnaryCall;
  ClearPositionHistory(argument: _google_protobuf_Empty, metadata: grpc.Metadata, callback: grpc.requestCallback<_google_protobuf_Empty__Output>): grpc.ClientUnaryCall;
  ClearPositionHistory(argument: _google_protobuf_Empty, options: grpc.CallOptions, callback: grpc.requestCallback<_google_protobuf_Empty__Output>): grpc.ClientUnaryCall;
  ClearPositionHistory(argument: _google_protobuf_Empty, callback: grpc.requestCallback<_google_protobuf_Empty__Output>): grpc.ClientUnaryCall;
  clearPositionHistory(argument: _google_protobuf_Empty, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_google_protobuf_Empty__Output>): grpc.ClientUnaryCall;
  clearPositionHistory(argument: _google_protobuf_Empty, metadata: grpc.Metadata, callback: grpc.requestCallback<_google_protobuf_Empty__Output>): grpc.ClientUnaryCall;
  clearPositionHistory(argument: _google_protobuf_Empty, options: grpc.CallOptions, callback: grpc.requestCallback<_google_protobuf_Empty__Output>): grpc.ClientUnaryCall;
  clearPositionHistory(argument: _google_protobuf_Empty, callback: grpc.requestCallback<_google_protobuf_Empty__Output>): grpc.ClientUnaryCall;
  
  ConfigurePositionHistory(argument: _linuxcnc_v1_PositionHistoryConfig, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_google_protobuf_Empty__Output>): grpc.ClientUnaryCall;
  ConfigurePositionHistory(argument: _linuxcnc_v1_PositionHistoryConfig, metadata: grpc.Metadata, callback: grpc.requestCallback<_google_protobuf_Empty__Output>): grpc.ClientUnaryCall;
  ConfigurePositionHistory(argument: _linuxcnc_v1_PositionHistoryConfig, options: grpc.CallOptions, callback: grpc.requestCallback<_google_protobuf_Empty__Output>): grpc.ClientUnaryCall;
  ConfigurePositionHistory(argument: _linuxcnc_v1_PositionHistoryConfig, callback: grpc.requestCallback<_google_protobuf_Empty__Output>): grpc.ClientUnaryCall;
  configurePositionHistory(argument: _linuxcnc_v1_PositionHistoryConfig, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_google_protobuf_Empty__Output>): grpc.ClientUnaryCall;
  configurePositionHistory(argument: _linuxcnc_v1_PositionHistoryConfig, metadata: grpc.Metadata, callback: grpc.requestCallback<_google_protobuf_Empty__Output>): grpc.ClientUnaryCall;
  configurePositionHistory(argument: _linuxcnc_v1_PositionHistoryConfig, options: grpc.CallOptions, callback: grpc.requestCallback<_google_protobuf_Empty__Output>): grpc.ClientUnaryCall;
  configurePositionHistory(argument: _linuxcnc_v1_PositionHistoryConfig, callback: grpc.requestCallback<_google_protobuf_Empty__Output>): grpc.ClientUnaryCall;
  
  ExecuteCommand(argument: _linuxcnc_v1_ExecuteCommandRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_linuxcnc_v1_ExecuteCommandResponse__Output>): grpc.ClientUnaryCall;
  ExecuteCommand(argument: _linuxcnc_v1_ExecuteCommandRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_linuxcnc_v1_ExecuteCommandResponse__Output>): grpc.ClientUnaryCall;
  ExecuteCommand(argument: _linuxcnc_v1_ExecuteCommandRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_linuxcnc_v1_ExecuteCommandResponse__Output>): grpc.ClientUnaryCall;
  ExecuteCommand(argument: _linuxcnc_v1_ExecuteCommandRequest, callback: grpc.requestCallback<_linuxcnc_v1_ExecuteCommandResponse__Output>): grpc.ClientUnaryCall;
  executeCommand(argument: _linuxcnc_v1_ExecuteCommandRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_linuxcnc_v1_ExecuteCommandResponse__Output>): grpc.ClientUnaryCall;
  executeCommand(argument: _linuxcnc_v1_ExecuteCommandRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_linuxcnc_v1_ExecuteCommandResponse__Output>): grpc.ClientUnaryCall;
  executeCommand(argument: _linuxcnc_v1_ExecuteCommandRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_linuxcnc_v1_ExecuteCommandResponse__Output>): grpc.ClientUnaryCall;
  executeCommand(argument: _linuxcnc_v1_ExecuteCommandRequest, callback: grpc.requestCallback<_linuxcnc_v1_ExecuteCommandResponse__Output>): grpc.ClientUnaryCall;
  
  GetPositionHistory(argument: _linuxcnc_v1_PositionHistoryRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_linuxcnc_v1_PositionHistorySnapshot__Output>): grpc.ClientUnaryCall;
  GetPositionHistory(argument: _linuxcnc_v1_PositionHistoryRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_linuxcnc_v1_PositionHistorySnapshot__Output>): grpc.ClientUnaryCall;
  GetPositionHistory(argument: _linuxcnc_v1_PositionHistoryRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_linuxcnc_v1_PositionHistorySnapshot__Output>): grpc.ClientUnaryCall;
  GetPositionHistory(argument: _linuxcnc_v1_PositionHistoryRequest, callback: grpc.requestCallback<_linuxcnc_v1_PositionHistorySnapshot__Output>): grpc.ClientUnaryCall;
  getPositionHistory(argument: _linuxcnc_v1_PositionHistoryRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_linuxcnc_v1_PositionHistorySnapshot__Output>): grpc.ClientUnaryCall;
  getPositionHistory(argument: _linuxcnc_v1_PositionHistoryRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_linuxcnc_v1_PositionHistorySnapshot__Output>): grpc.ClientUnaryCall;
  getPositionHistory(argument: _linuxcnc_v1_PositionHistoryRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_linuxcnc_v1_PositionHistorySnapshot__Output>): grpc.ClientUnaryCall;
  getPositionHistory(argument: _linuxcnc_v1_PositionHistoryRequest, callback: grpc.requestCallback<_linuxcnc_v1_PositionHistorySnapshot__Output>): grpc.ClientUnaryCall;
  
  GetStatus(argument: _linuxcnc_v1_GetStatusRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_linuxcnc_v1_GetStatusResponse__Output>): grpc.ClientUnaryCall;
  GetStatus(argument: _linuxcnc_v1_GetStatusRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_linuxcnc_v1_GetStatusResponse__Output>): grpc.ClientUnaryCall;
  GetStatus(argument: _linuxcnc_v1_GetStatusRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_linuxcnc_v1_GetStatusResponse__Output>): grpc.ClientUnaryCall;
  GetStatus(argument: _linuxcnc_v1_GetStatusRequest, callback: grpc.requestCallback<_linuxcnc_v1_GetStatusResponse__Output>): grpc.ClientUnaryCall;
  getStatus(argument: _linuxcnc_v1_GetStatusRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_linuxcnc_v1_GetStatusResponse__Output>): grpc.ClientUnaryCall;
  getStatus(argument: _linuxcnc_v1_GetStatusRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_linuxcnc_v1_GetStatusResponse__Output>): grpc.ClientUnaryCall;
  getStatus(argument: _linuxcnc_v1_GetStatusRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_linuxcnc_v1_GetStatusResponse__Output>): grpc.ClientUnaryCall;
  getStatus(argument: _linuxcnc_v1_GetStatusRequest, callback: grpc.requestCallback<_linuxcnc_v1_GetStatusResponse__Output>): grpc.ClientUnaryCall;
  
  WatchErrors(argument: _google_protobuf_Empty, metadata: grpc.Metadata, options?: grpc.CallOptions): grpc.ClientReadableStream<_linuxcnc_v1_LinuxCNCError__Output>;
  WatchErrors(argument: _google_protobuf_Empty, options?: grpc.CallOptions): grpc.ClientReadableStream<_linuxcnc_v1_LinuxCNCError__Output>;
  watchErrors(argument: _google_protobuf_Empty, metadata: grpc.Metadata, options?: grpc.CallOptions): grpc.ClientReadableStream<_linuxcnc_v1_LinuxCNCError__Output>;
  watchErrors(argument: _google_protobuf_Empty, options?: grpc.CallOptions): grpc.ClientReadableStream<_linuxcnc_v1_LinuxCNCError__Output>;
  
  WatchPositionHistory(argument: _linuxcnc_v1_PositionHistoryRequest, metadata: grpc.Metadata, options?: grpc.CallOptions): grpc.ClientReadableStream<_linuxcnc_v1_PositionHistoryEvent__Output>;
  WatchPositionHistory(argument: _linuxcnc_v1_PositionHistoryRequest, options?: grpc.CallOptions): grpc.ClientReadableStream<_linuxcnc_v1_PositionHistoryEvent__Output>;
  watchPositionHistory(argument: _linuxcnc_v1_PositionHistoryRequest, metadata: grpc.Metadata, options?: grpc.CallOptions): grpc.ClientReadableStream<_linuxcnc_v1_PositionHistoryEvent__Output>;
  watchPositionHistory(argument: _linuxcnc_v1_PositionHistoryRequest, options?: grpc.CallOptions): grpc.ClientReadableStream<_linuxcnc_v1_PositionHistoryEvent__Output>;
  
  WatchStatus(argument: _linuxcnc_v1_WatchStatusRequest, metadata: grpc.Metadata, options?: grpc.CallOptions): grpc.ClientReadableStream<_linuxcnc_v1_WatchStatusEvent__Output>;
  WatchStatus(argument: _linuxcnc_v1_WatchStatusRequest, options?: grpc.CallOptions): grpc.ClientReadableStream<_linuxcnc_v1_WatchStatusEvent__Output>;
  watchStatus(argument: _linuxcnc_v1_WatchStatusRequest, metadata: grpc.Metadata, options?: grpc.CallOptions): grpc.ClientReadableStream<_linuxcnc_v1_WatchStatusEvent__Output>;
  watchStatus(argument: _linuxcnc_v1_WatchStatusRequest, options?: grpc.CallOptions): grpc.ClientReadableStream<_linuxcnc_v1_WatchStatusEvent__Output>;
  
}

export interface MachineServiceHandlers extends grpc.UntypedServiceImplementation {
  ClearPositionHistory: grpc.handleUnaryCall<_google_protobuf_Empty__Output, _google_protobuf_Empty>;
  
  ConfigurePositionHistory: grpc.handleUnaryCall<_linuxcnc_v1_PositionHistoryConfig__Output, _google_protobuf_Empty>;
  
  ExecuteCommand: grpc.handleUnaryCall<_linuxcnc_v1_ExecuteCommandRequest__Output, _linuxcnc_v1_ExecuteCommandResponse>;
  
  GetPositionHistory: grpc.handleUnaryCall<_linuxcnc_v1_PositionHistoryRequest__Output, _linuxcnc_v1_PositionHistorySnapshot>;
  
  GetStatus: grpc.handleUnaryCall<_linuxcnc_v1_GetStatusRequest__Output, _linuxcnc_v1_GetStatusResponse>;
  
  WatchErrors: grpc.handleServerStreamingCall<_google_protobuf_Empty__Output, _linuxcnc_v1_LinuxCNCError>;
  
  WatchPositionHistory: grpc.handleServerStreamingCall<_linuxcnc_v1_PositionHistoryRequest__Output, _linuxcnc_v1_PositionHistoryEvent>;
  
  WatchStatus: grpc.handleServerStreamingCall<_linuxcnc_v1_WatchStatusRequest__Output, _linuxcnc_v1_WatchStatusEvent>;
  
}

export interface MachineServiceDefinition extends grpc.ServiceDefinition {
  ClearPositionHistory: MethodDefinition<_google_protobuf_Empty, _google_protobuf_Empty, _google_protobuf_Empty__Output, _google_protobuf_Empty__Output>
  ConfigurePositionHistory: MethodDefinition<_linuxcnc_v1_PositionHistoryConfig, _google_protobuf_Empty, _linuxcnc_v1_PositionHistoryConfig__Output, _google_protobuf_Empty__Output>
  ExecuteCommand: MethodDefinition<_linuxcnc_v1_ExecuteCommandRequest, _linuxcnc_v1_ExecuteCommandResponse, _linuxcnc_v1_ExecuteCommandRequest__Output, _linuxcnc_v1_ExecuteCommandResponse__Output>
  GetPositionHistory: MethodDefinition<_linuxcnc_v1_PositionHistoryRequest, _linuxcnc_v1_PositionHistorySnapshot, _linuxcnc_v1_PositionHistoryRequest__Output, _linuxcnc_v1_PositionHistorySnapshot__Output>
  GetStatus: MethodDefinition<_linuxcnc_v1_GetStatusRequest, _linuxcnc_v1_GetStatusResponse, _linuxcnc_v1_GetStatusRequest__Output, _linuxcnc_v1_GetStatusResponse__Output>
  WatchErrors: MethodDefinition<_google_protobuf_Empty, _linuxcnc_v1_LinuxCNCError, _google_protobuf_Empty__Output, _linuxcnc_v1_LinuxCNCError__Output>
  WatchPositionHistory: MethodDefinition<_linuxcnc_v1_PositionHistoryRequest, _linuxcnc_v1_PositionHistoryEvent, _linuxcnc_v1_PositionHistoryRequest__Output, _linuxcnc_v1_PositionHistoryEvent__Output>
  WatchStatus: MethodDefinition<_linuxcnc_v1_WatchStatusRequest, _linuxcnc_v1_WatchStatusEvent, _linuxcnc_v1_WatchStatusRequest__Output, _linuxcnc_v1_WatchStatusEvent__Output>
}
