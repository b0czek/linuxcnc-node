// Original file: proto/linuxcnc/v1/linuxcnc.proto

import type * as grpc from '@grpc/grpc-js'
import type { MethodDefinition } from '@grpc/proto-loader'
import type { ScopeSessionMessage as _linuxcnc_v1_ScopeSessionMessage, ScopeSessionMessage__Output as _linuxcnc_v1_ScopeSessionMessage__Output } from '../../linuxcnc/v1/ScopeSessionMessage';

export interface ScopeServiceClient extends grpc.Client {
  Session(metadata: grpc.Metadata, options?: grpc.CallOptions): grpc.ClientDuplexStream<_linuxcnc_v1_ScopeSessionMessage, _linuxcnc_v1_ScopeSessionMessage__Output>;
  Session(options?: grpc.CallOptions): grpc.ClientDuplexStream<_linuxcnc_v1_ScopeSessionMessage, _linuxcnc_v1_ScopeSessionMessage__Output>;
  session(metadata: grpc.Metadata, options?: grpc.CallOptions): grpc.ClientDuplexStream<_linuxcnc_v1_ScopeSessionMessage, _linuxcnc_v1_ScopeSessionMessage__Output>;
  session(options?: grpc.CallOptions): grpc.ClientDuplexStream<_linuxcnc_v1_ScopeSessionMessage, _linuxcnc_v1_ScopeSessionMessage__Output>;
  
}

export interface ScopeServiceHandlers extends grpc.UntypedServiceImplementation {
  Session: grpc.handleBidiStreamingCall<_linuxcnc_v1_ScopeSessionMessage__Output, _linuxcnc_v1_ScopeSessionMessage>;
  
}

export interface ScopeServiceDefinition extends grpc.ServiceDefinition {
  Session: MethodDefinition<_linuxcnc_v1_ScopeSessionMessage, _linuxcnc_v1_ScopeSessionMessage, _linuxcnc_v1_ScopeSessionMessage__Output, _linuxcnc_v1_ScopeSessionMessage__Output>
}
