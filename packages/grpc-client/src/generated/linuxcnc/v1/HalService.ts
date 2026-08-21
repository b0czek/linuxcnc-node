// Original file: proto/linuxcnc/v1/linuxcnc.proto

import type * as grpc from '@grpc/grpc-js'
import type { MethodDefinition } from '@grpc/proto-loader'
import type { ComponentSessionMessage as _linuxcnc_v1_ComponentSessionMessage, ComponentSessionMessage__Output as _linuxcnc_v1_ComponentSessionMessage__Output } from '../../linuxcnc/v1/ComponentSessionMessage';
import type { CreateHalSignalRequest as _linuxcnc_v1_CreateHalSignalRequest, CreateHalSignalRequest__Output as _linuxcnc_v1_CreateHalSignalRequest__Output } from '../../linuxcnc/v1/CreateHalSignalRequest';
import type { CreateHalSignalResponse as _linuxcnc_v1_CreateHalSignalResponse, CreateHalSignalResponse__Output as _linuxcnc_v1_CreateHalSignalResponse__Output } from '../../linuxcnc/v1/CreateHalSignalResponse';
import type { Empty as _google_protobuf_Empty, Empty__Output as _google_protobuf_Empty__Output } from '../../google/protobuf/Empty';
import type { GetHalTopologyRequest as _linuxcnc_v1_GetHalTopologyRequest, GetHalTopologyRequest__Output as _linuxcnc_v1_GetHalTopologyRequest__Output } from '../../linuxcnc/v1/GetHalTopologyRequest';
import type { GetHalTopologyResponse as _linuxcnc_v1_GetHalTopologyResponse, GetHalTopologyResponse__Output as _linuxcnc_v1_GetHalTopologyResponse__Output } from '../../linuxcnc/v1/GetHalTopologyResponse';
import type { GetHalWriterMetadataRequest as _linuxcnc_v1_GetHalWriterMetadataRequest, GetHalWriterMetadataRequest__Output as _linuxcnc_v1_GetHalWriterMetadataRequest__Output } from '../../linuxcnc/v1/GetHalWriterMetadataRequest';
import type { GetHalWriterMetadataResponse as _linuxcnc_v1_GetHalWriterMetadataResponse, GetHalWriterMetadataResponse__Output as _linuxcnc_v1_GetHalWriterMetadataResponse__Output } from '../../linuxcnc/v1/GetHalWriterMetadataResponse';
import type { HalReadRequest as _linuxcnc_v1_HalReadRequest, HalReadRequest__Output as _linuxcnc_v1_HalReadRequest__Output } from '../../linuxcnc/v1/HalReadRequest';
import type { HalReadResponse as _linuxcnc_v1_HalReadResponse, HalReadResponse__Output as _linuxcnc_v1_HalReadResponse__Output } from '../../linuxcnc/v1/HalReadResponse';
import type { HalWrite as _linuxcnc_v1_HalWrite, HalWrite__Output as _linuxcnc_v1_HalWrite__Output } from '../../linuxcnc/v1/HalWrite';
import type { HalWriteResponse as _linuxcnc_v1_HalWriteResponse, HalWriteResponse__Output as _linuxcnc_v1_HalWriteResponse__Output } from '../../linuxcnc/v1/HalWriteResponse';
import type { SetHalMessageLevelRequest as _linuxcnc_v1_SetHalMessageLevelRequest, SetHalMessageLevelRequest__Output as _linuxcnc_v1_SetHalMessageLevelRequest__Output } from '../../linuxcnc/v1/SetHalMessageLevelRequest';
import type { SetHalWriterReadyRequest as _linuxcnc_v1_SetHalWriterReadyRequest, SetHalWriterReadyRequest__Output as _linuxcnc_v1_SetHalWriterReadyRequest__Output } from '../../linuxcnc/v1/SetHalWriterReadyRequest';
import type { WatchHalTopologyEvent as _linuxcnc_v1_WatchHalTopologyEvent, WatchHalTopologyEvent__Output as _linuxcnc_v1_WatchHalTopologyEvent__Output } from '../../linuxcnc/v1/WatchHalTopologyEvent';
import type { WatchHalTopologyRequest as _linuxcnc_v1_WatchHalTopologyRequest, WatchHalTopologyRequest__Output as _linuxcnc_v1_WatchHalTopologyRequest__Output } from '../../linuxcnc/v1/WatchHalTopologyRequest';

export interface HalServiceClient extends grpc.Client {
  ComponentSession(metadata: grpc.Metadata, options?: grpc.CallOptions): grpc.ClientDuplexStream<_linuxcnc_v1_ComponentSessionMessage, _linuxcnc_v1_ComponentSessionMessage__Output>;
  ComponentSession(options?: grpc.CallOptions): grpc.ClientDuplexStream<_linuxcnc_v1_ComponentSessionMessage, _linuxcnc_v1_ComponentSessionMessage__Output>;
  componentSession(metadata: grpc.Metadata, options?: grpc.CallOptions): grpc.ClientDuplexStream<_linuxcnc_v1_ComponentSessionMessage, _linuxcnc_v1_ComponentSessionMessage__Output>;
  componentSession(options?: grpc.CallOptions): grpc.ClientDuplexStream<_linuxcnc_v1_ComponentSessionMessage, _linuxcnc_v1_ComponentSessionMessage__Output>;
  
  CreateSignal(argument: _linuxcnc_v1_CreateHalSignalRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_linuxcnc_v1_CreateHalSignalResponse__Output>): grpc.ClientUnaryCall;
  CreateSignal(argument: _linuxcnc_v1_CreateHalSignalRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_linuxcnc_v1_CreateHalSignalResponse__Output>): grpc.ClientUnaryCall;
  CreateSignal(argument: _linuxcnc_v1_CreateHalSignalRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_linuxcnc_v1_CreateHalSignalResponse__Output>): grpc.ClientUnaryCall;
  CreateSignal(argument: _linuxcnc_v1_CreateHalSignalRequest, callback: grpc.requestCallback<_linuxcnc_v1_CreateHalSignalResponse__Output>): grpc.ClientUnaryCall;
  createSignal(argument: _linuxcnc_v1_CreateHalSignalRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_linuxcnc_v1_CreateHalSignalResponse__Output>): grpc.ClientUnaryCall;
  createSignal(argument: _linuxcnc_v1_CreateHalSignalRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_linuxcnc_v1_CreateHalSignalResponse__Output>): grpc.ClientUnaryCall;
  createSignal(argument: _linuxcnc_v1_CreateHalSignalRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_linuxcnc_v1_CreateHalSignalResponse__Output>): grpc.ClientUnaryCall;
  createSignal(argument: _linuxcnc_v1_CreateHalSignalRequest, callback: grpc.requestCallback<_linuxcnc_v1_CreateHalSignalResponse__Output>): grpc.ClientUnaryCall;
  
  GetTopology(argument: _linuxcnc_v1_GetHalTopologyRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_linuxcnc_v1_GetHalTopologyResponse__Output>): grpc.ClientUnaryCall;
  GetTopology(argument: _linuxcnc_v1_GetHalTopologyRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_linuxcnc_v1_GetHalTopologyResponse__Output>): grpc.ClientUnaryCall;
  GetTopology(argument: _linuxcnc_v1_GetHalTopologyRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_linuxcnc_v1_GetHalTopologyResponse__Output>): grpc.ClientUnaryCall;
  GetTopology(argument: _linuxcnc_v1_GetHalTopologyRequest, callback: grpc.requestCallback<_linuxcnc_v1_GetHalTopologyResponse__Output>): grpc.ClientUnaryCall;
  getTopology(argument: _linuxcnc_v1_GetHalTopologyRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_linuxcnc_v1_GetHalTopologyResponse__Output>): grpc.ClientUnaryCall;
  getTopology(argument: _linuxcnc_v1_GetHalTopologyRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_linuxcnc_v1_GetHalTopologyResponse__Output>): grpc.ClientUnaryCall;
  getTopology(argument: _linuxcnc_v1_GetHalTopologyRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_linuxcnc_v1_GetHalTopologyResponse__Output>): grpc.ClientUnaryCall;
  getTopology(argument: _linuxcnc_v1_GetHalTopologyRequest, callback: grpc.requestCallback<_linuxcnc_v1_GetHalTopologyResponse__Output>): grpc.ClientUnaryCall;
  
  GetWriterMetadata(argument: _linuxcnc_v1_GetHalWriterMetadataRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_linuxcnc_v1_GetHalWriterMetadataResponse__Output>): grpc.ClientUnaryCall;
  GetWriterMetadata(argument: _linuxcnc_v1_GetHalWriterMetadataRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_linuxcnc_v1_GetHalWriterMetadataResponse__Output>): grpc.ClientUnaryCall;
  GetWriterMetadata(argument: _linuxcnc_v1_GetHalWriterMetadataRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_linuxcnc_v1_GetHalWriterMetadataResponse__Output>): grpc.ClientUnaryCall;
  GetWriterMetadata(argument: _linuxcnc_v1_GetHalWriterMetadataRequest, callback: grpc.requestCallback<_linuxcnc_v1_GetHalWriterMetadataResponse__Output>): grpc.ClientUnaryCall;
  getWriterMetadata(argument: _linuxcnc_v1_GetHalWriterMetadataRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_linuxcnc_v1_GetHalWriterMetadataResponse__Output>): grpc.ClientUnaryCall;
  getWriterMetadata(argument: _linuxcnc_v1_GetHalWriterMetadataRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_linuxcnc_v1_GetHalWriterMetadataResponse__Output>): grpc.ClientUnaryCall;
  getWriterMetadata(argument: _linuxcnc_v1_GetHalWriterMetadataRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_linuxcnc_v1_GetHalWriterMetadataResponse__Output>): grpc.ClientUnaryCall;
  getWriterMetadata(argument: _linuxcnc_v1_GetHalWriterMetadataRequest, callback: grpc.requestCallback<_linuxcnc_v1_GetHalWriterMetadataResponse__Output>): grpc.ClientUnaryCall;
  
  Read(argument: _linuxcnc_v1_HalReadRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_linuxcnc_v1_HalReadResponse__Output>): grpc.ClientUnaryCall;
  Read(argument: _linuxcnc_v1_HalReadRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_linuxcnc_v1_HalReadResponse__Output>): grpc.ClientUnaryCall;
  Read(argument: _linuxcnc_v1_HalReadRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_linuxcnc_v1_HalReadResponse__Output>): grpc.ClientUnaryCall;
  Read(argument: _linuxcnc_v1_HalReadRequest, callback: grpc.requestCallback<_linuxcnc_v1_HalReadResponse__Output>): grpc.ClientUnaryCall;
  read(argument: _linuxcnc_v1_HalReadRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_linuxcnc_v1_HalReadResponse__Output>): grpc.ClientUnaryCall;
  read(argument: _linuxcnc_v1_HalReadRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_linuxcnc_v1_HalReadResponse__Output>): grpc.ClientUnaryCall;
  read(argument: _linuxcnc_v1_HalReadRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_linuxcnc_v1_HalReadResponse__Output>): grpc.ClientUnaryCall;
  read(argument: _linuxcnc_v1_HalReadRequest, callback: grpc.requestCallback<_linuxcnc_v1_HalReadResponse__Output>): grpc.ClientUnaryCall;
  
  SetMessageLevel(argument: _linuxcnc_v1_SetHalMessageLevelRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_google_protobuf_Empty__Output>): grpc.ClientUnaryCall;
  SetMessageLevel(argument: _linuxcnc_v1_SetHalMessageLevelRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_google_protobuf_Empty__Output>): grpc.ClientUnaryCall;
  SetMessageLevel(argument: _linuxcnc_v1_SetHalMessageLevelRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_google_protobuf_Empty__Output>): grpc.ClientUnaryCall;
  SetMessageLevel(argument: _linuxcnc_v1_SetHalMessageLevelRequest, callback: grpc.requestCallback<_google_protobuf_Empty__Output>): grpc.ClientUnaryCall;
  setMessageLevel(argument: _linuxcnc_v1_SetHalMessageLevelRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_google_protobuf_Empty__Output>): grpc.ClientUnaryCall;
  setMessageLevel(argument: _linuxcnc_v1_SetHalMessageLevelRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_google_protobuf_Empty__Output>): grpc.ClientUnaryCall;
  setMessageLevel(argument: _linuxcnc_v1_SetHalMessageLevelRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_google_protobuf_Empty__Output>): grpc.ClientUnaryCall;
  setMessageLevel(argument: _linuxcnc_v1_SetHalMessageLevelRequest, callback: grpc.requestCallback<_google_protobuf_Empty__Output>): grpc.ClientUnaryCall;
  
  SetWriterReady(argument: _linuxcnc_v1_SetHalWriterReadyRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_google_protobuf_Empty__Output>): grpc.ClientUnaryCall;
  SetWriterReady(argument: _linuxcnc_v1_SetHalWriterReadyRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_google_protobuf_Empty__Output>): grpc.ClientUnaryCall;
  SetWriterReady(argument: _linuxcnc_v1_SetHalWriterReadyRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_google_protobuf_Empty__Output>): grpc.ClientUnaryCall;
  SetWriterReady(argument: _linuxcnc_v1_SetHalWriterReadyRequest, callback: grpc.requestCallback<_google_protobuf_Empty__Output>): grpc.ClientUnaryCall;
  setWriterReady(argument: _linuxcnc_v1_SetHalWriterReadyRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_google_protobuf_Empty__Output>): grpc.ClientUnaryCall;
  setWriterReady(argument: _linuxcnc_v1_SetHalWriterReadyRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_google_protobuf_Empty__Output>): grpc.ClientUnaryCall;
  setWriterReady(argument: _linuxcnc_v1_SetHalWriterReadyRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_google_protobuf_Empty__Output>): grpc.ClientUnaryCall;
  setWriterReady(argument: _linuxcnc_v1_SetHalWriterReadyRequest, callback: grpc.requestCallback<_google_protobuf_Empty__Output>): grpc.ClientUnaryCall;
  
  WatchTopology(argument: _linuxcnc_v1_WatchHalTopologyRequest, metadata: grpc.Metadata, options?: grpc.CallOptions): grpc.ClientReadableStream<_linuxcnc_v1_WatchHalTopologyEvent__Output>;
  WatchTopology(argument: _linuxcnc_v1_WatchHalTopologyRequest, options?: grpc.CallOptions): grpc.ClientReadableStream<_linuxcnc_v1_WatchHalTopologyEvent__Output>;
  watchTopology(argument: _linuxcnc_v1_WatchHalTopologyRequest, metadata: grpc.Metadata, options?: grpc.CallOptions): grpc.ClientReadableStream<_linuxcnc_v1_WatchHalTopologyEvent__Output>;
  watchTopology(argument: _linuxcnc_v1_WatchHalTopologyRequest, options?: grpc.CallOptions): grpc.ClientReadableStream<_linuxcnc_v1_WatchHalTopologyEvent__Output>;
  
  Write(argument: _linuxcnc_v1_HalWrite, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_linuxcnc_v1_HalWriteResponse__Output>): grpc.ClientUnaryCall;
  Write(argument: _linuxcnc_v1_HalWrite, metadata: grpc.Metadata, callback: grpc.requestCallback<_linuxcnc_v1_HalWriteResponse__Output>): grpc.ClientUnaryCall;
  Write(argument: _linuxcnc_v1_HalWrite, options: grpc.CallOptions, callback: grpc.requestCallback<_linuxcnc_v1_HalWriteResponse__Output>): grpc.ClientUnaryCall;
  Write(argument: _linuxcnc_v1_HalWrite, callback: grpc.requestCallback<_linuxcnc_v1_HalWriteResponse__Output>): grpc.ClientUnaryCall;
  write(argument: _linuxcnc_v1_HalWrite, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_linuxcnc_v1_HalWriteResponse__Output>): grpc.ClientUnaryCall;
  write(argument: _linuxcnc_v1_HalWrite, metadata: grpc.Metadata, callback: grpc.requestCallback<_linuxcnc_v1_HalWriteResponse__Output>): grpc.ClientUnaryCall;
  write(argument: _linuxcnc_v1_HalWrite, options: grpc.CallOptions, callback: grpc.requestCallback<_linuxcnc_v1_HalWriteResponse__Output>): grpc.ClientUnaryCall;
  write(argument: _linuxcnc_v1_HalWrite, callback: grpc.requestCallback<_linuxcnc_v1_HalWriteResponse__Output>): grpc.ClientUnaryCall;
  
}

export interface HalServiceHandlers extends grpc.UntypedServiceImplementation {
  ComponentSession: grpc.handleBidiStreamingCall<_linuxcnc_v1_ComponentSessionMessage__Output, _linuxcnc_v1_ComponentSessionMessage>;
  
  CreateSignal: grpc.handleUnaryCall<_linuxcnc_v1_CreateHalSignalRequest__Output, _linuxcnc_v1_CreateHalSignalResponse>;
  
  GetTopology: grpc.handleUnaryCall<_linuxcnc_v1_GetHalTopologyRequest__Output, _linuxcnc_v1_GetHalTopologyResponse>;
  
  GetWriterMetadata: grpc.handleUnaryCall<_linuxcnc_v1_GetHalWriterMetadataRequest__Output, _linuxcnc_v1_GetHalWriterMetadataResponse>;
  
  Read: grpc.handleUnaryCall<_linuxcnc_v1_HalReadRequest__Output, _linuxcnc_v1_HalReadResponse>;
  
  SetMessageLevel: grpc.handleUnaryCall<_linuxcnc_v1_SetHalMessageLevelRequest__Output, _google_protobuf_Empty>;
  
  SetWriterReady: grpc.handleUnaryCall<_linuxcnc_v1_SetHalWriterReadyRequest__Output, _google_protobuf_Empty>;
  
  WatchTopology: grpc.handleServerStreamingCall<_linuxcnc_v1_WatchHalTopologyRequest__Output, _linuxcnc_v1_WatchHalTopologyEvent>;
  
  Write: grpc.handleUnaryCall<_linuxcnc_v1_HalWrite__Output, _linuxcnc_v1_HalWriteResponse>;
  
}

export interface HalServiceDefinition extends grpc.ServiceDefinition {
  ComponentSession: MethodDefinition<_linuxcnc_v1_ComponentSessionMessage, _linuxcnc_v1_ComponentSessionMessage, _linuxcnc_v1_ComponentSessionMessage__Output, _linuxcnc_v1_ComponentSessionMessage__Output>
  CreateSignal: MethodDefinition<_linuxcnc_v1_CreateHalSignalRequest, _linuxcnc_v1_CreateHalSignalResponse, _linuxcnc_v1_CreateHalSignalRequest__Output, _linuxcnc_v1_CreateHalSignalResponse__Output>
  GetTopology: MethodDefinition<_linuxcnc_v1_GetHalTopologyRequest, _linuxcnc_v1_GetHalTopologyResponse, _linuxcnc_v1_GetHalTopologyRequest__Output, _linuxcnc_v1_GetHalTopologyResponse__Output>
  GetWriterMetadata: MethodDefinition<_linuxcnc_v1_GetHalWriterMetadataRequest, _linuxcnc_v1_GetHalWriterMetadataResponse, _linuxcnc_v1_GetHalWriterMetadataRequest__Output, _linuxcnc_v1_GetHalWriterMetadataResponse__Output>
  Read: MethodDefinition<_linuxcnc_v1_HalReadRequest, _linuxcnc_v1_HalReadResponse, _linuxcnc_v1_HalReadRequest__Output, _linuxcnc_v1_HalReadResponse__Output>
  SetMessageLevel: MethodDefinition<_linuxcnc_v1_SetHalMessageLevelRequest, _google_protobuf_Empty, _linuxcnc_v1_SetHalMessageLevelRequest__Output, _google_protobuf_Empty__Output>
  SetWriterReady: MethodDefinition<_linuxcnc_v1_SetHalWriterReadyRequest, _google_protobuf_Empty, _linuxcnc_v1_SetHalWriterReadyRequest__Output, _google_protobuf_Empty__Output>
  WatchTopology: MethodDefinition<_linuxcnc_v1_WatchHalTopologyRequest, _linuxcnc_v1_WatchHalTopologyEvent, _linuxcnc_v1_WatchHalTopologyRequest__Output, _linuxcnc_v1_WatchHalTopologyEvent__Output>
  Write: MethodDefinition<_linuxcnc_v1_HalWrite, _linuxcnc_v1_HalWriteResponse, _linuxcnc_v1_HalWrite__Output, _linuxcnc_v1_HalWriteResponse__Output>
}
