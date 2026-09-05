// Original file: proto/linuxcnc/v1/ini.proto

import type * as grpc from '@grpc/grpc-js'
import type { MethodDefinition } from '@grpc/proto-loader'
import type { Empty as _google_protobuf_Empty, Empty__Output as _google_protobuf_Empty__Output } from '../../google/protobuf/Empty';
import type { IniSnapshot as _linuxcnc_v1_IniSnapshot, IniSnapshot__Output as _linuxcnc_v1_IniSnapshot__Output } from '../../linuxcnc/v1/IniSnapshot';

/**
 * Immutable for the daemon session. No request accepts a filename.
 */
export interface IniServiceClient extends grpc.Client {
  Read(argument: _google_protobuf_Empty, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_linuxcnc_v1_IniSnapshot__Output>): grpc.ClientUnaryCall;
  Read(argument: _google_protobuf_Empty, metadata: grpc.Metadata, callback: grpc.requestCallback<_linuxcnc_v1_IniSnapshot__Output>): grpc.ClientUnaryCall;
  Read(argument: _google_protobuf_Empty, options: grpc.CallOptions, callback: grpc.requestCallback<_linuxcnc_v1_IniSnapshot__Output>): grpc.ClientUnaryCall;
  Read(argument: _google_protobuf_Empty, callback: grpc.requestCallback<_linuxcnc_v1_IniSnapshot__Output>): grpc.ClientUnaryCall;
  read(argument: _google_protobuf_Empty, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_linuxcnc_v1_IniSnapshot__Output>): grpc.ClientUnaryCall;
  read(argument: _google_protobuf_Empty, metadata: grpc.Metadata, callback: grpc.requestCallback<_linuxcnc_v1_IniSnapshot__Output>): grpc.ClientUnaryCall;
  read(argument: _google_protobuf_Empty, options: grpc.CallOptions, callback: grpc.requestCallback<_linuxcnc_v1_IniSnapshot__Output>): grpc.ClientUnaryCall;
  read(argument: _google_protobuf_Empty, callback: grpc.requestCallback<_linuxcnc_v1_IniSnapshot__Output>): grpc.ClientUnaryCall;
  
}

/**
 * Immutable for the daemon session. No request accepts a filename.
 */
export interface IniServiceHandlers extends grpc.UntypedServiceImplementation {
  Read: grpc.handleUnaryCall<_google_protobuf_Empty__Output, _linuxcnc_v1_IniSnapshot>;
  
}

export interface IniServiceDefinition extends grpc.ServiceDefinition {
  Read: MethodDefinition<_google_protobuf_Empty, _linuxcnc_v1_IniSnapshot, _google_protobuf_Empty__Output, _linuxcnc_v1_IniSnapshot__Output>
}
