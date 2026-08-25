// Original file: proto/linuxcnc/v1/program.proto

import type * as grpc from '@grpc/grpc-js'
import type { MethodDefinition } from '@grpc/proto-loader'
import type { CreateWorkspaceRequest as _linuxcnc_v1_CreateWorkspaceRequest, CreateWorkspaceRequest__Output as _linuxcnc_v1_CreateWorkspaceRequest__Output } from '../../linuxcnc/v1/CreateWorkspaceRequest';
import type { CreateWorkspaceResponse as _linuxcnc_v1_CreateWorkspaceResponse, CreateWorkspaceResponse__Output as _linuxcnc_v1_CreateWorkspaceResponse__Output } from '../../linuxcnc/v1/CreateWorkspaceResponse';
import type { DeleteWorkspaceRequest as _linuxcnc_v1_DeleteWorkspaceRequest, DeleteWorkspaceRequest__Output as _linuxcnc_v1_DeleteWorkspaceRequest__Output } from '../../linuxcnc/v1/DeleteWorkspaceRequest';
import type { Empty as _google_protobuf_Empty, Empty__Output as _google_protobuf_Empty__Output } from '../../google/protobuf/Empty';
import type { ParseProgramEvent as _linuxcnc_v1_ParseProgramEvent, ParseProgramEvent__Output as _linuxcnc_v1_ParseProgramEvent__Output } from '../../linuxcnc/v1/ParseProgramEvent';
import type { ParseProgramRequest as _linuxcnc_v1_ParseProgramRequest, ParseProgramRequest__Output as _linuxcnc_v1_ParseProgramRequest__Output } from '../../linuxcnc/v1/ParseProgramRequest';
import type { UploadWorkspaceRequest as _linuxcnc_v1_UploadWorkspaceRequest, UploadWorkspaceRequest__Output as _linuxcnc_v1_UploadWorkspaceRequest__Output } from '../../linuxcnc/v1/UploadWorkspaceRequest';
import type { UploadWorkspaceResponse as _linuxcnc_v1_UploadWorkspaceResponse, UploadWorkspaceResponse__Output as _linuxcnc_v1_UploadWorkspaceResponse__Output } from '../../linuxcnc/v1/UploadWorkspaceResponse';

export interface ProgramServiceClient extends grpc.Client {
  CreateWorkspace(argument: _linuxcnc_v1_CreateWorkspaceRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_linuxcnc_v1_CreateWorkspaceResponse__Output>): grpc.ClientUnaryCall;
  CreateWorkspace(argument: _linuxcnc_v1_CreateWorkspaceRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_linuxcnc_v1_CreateWorkspaceResponse__Output>): grpc.ClientUnaryCall;
  CreateWorkspace(argument: _linuxcnc_v1_CreateWorkspaceRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_linuxcnc_v1_CreateWorkspaceResponse__Output>): grpc.ClientUnaryCall;
  CreateWorkspace(argument: _linuxcnc_v1_CreateWorkspaceRequest, callback: grpc.requestCallback<_linuxcnc_v1_CreateWorkspaceResponse__Output>): grpc.ClientUnaryCall;
  createWorkspace(argument: _linuxcnc_v1_CreateWorkspaceRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_linuxcnc_v1_CreateWorkspaceResponse__Output>): grpc.ClientUnaryCall;
  createWorkspace(argument: _linuxcnc_v1_CreateWorkspaceRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_linuxcnc_v1_CreateWorkspaceResponse__Output>): grpc.ClientUnaryCall;
  createWorkspace(argument: _linuxcnc_v1_CreateWorkspaceRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_linuxcnc_v1_CreateWorkspaceResponse__Output>): grpc.ClientUnaryCall;
  createWorkspace(argument: _linuxcnc_v1_CreateWorkspaceRequest, callback: grpc.requestCallback<_linuxcnc_v1_CreateWorkspaceResponse__Output>): grpc.ClientUnaryCall;
  
  DeleteWorkspace(argument: _linuxcnc_v1_DeleteWorkspaceRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_google_protobuf_Empty__Output>): grpc.ClientUnaryCall;
  DeleteWorkspace(argument: _linuxcnc_v1_DeleteWorkspaceRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_google_protobuf_Empty__Output>): grpc.ClientUnaryCall;
  DeleteWorkspace(argument: _linuxcnc_v1_DeleteWorkspaceRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_google_protobuf_Empty__Output>): grpc.ClientUnaryCall;
  DeleteWorkspace(argument: _linuxcnc_v1_DeleteWorkspaceRequest, callback: grpc.requestCallback<_google_protobuf_Empty__Output>): grpc.ClientUnaryCall;
  deleteWorkspace(argument: _linuxcnc_v1_DeleteWorkspaceRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_google_protobuf_Empty__Output>): grpc.ClientUnaryCall;
  deleteWorkspace(argument: _linuxcnc_v1_DeleteWorkspaceRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_google_protobuf_Empty__Output>): grpc.ClientUnaryCall;
  deleteWorkspace(argument: _linuxcnc_v1_DeleteWorkspaceRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_google_protobuf_Empty__Output>): grpc.ClientUnaryCall;
  deleteWorkspace(argument: _linuxcnc_v1_DeleteWorkspaceRequest, callback: grpc.requestCallback<_google_protobuf_Empty__Output>): grpc.ClientUnaryCall;
  
  ParseProgram(argument: _linuxcnc_v1_ParseProgramRequest, metadata: grpc.Metadata, options?: grpc.CallOptions): grpc.ClientReadableStream<_linuxcnc_v1_ParseProgramEvent__Output>;
  ParseProgram(argument: _linuxcnc_v1_ParseProgramRequest, options?: grpc.CallOptions): grpc.ClientReadableStream<_linuxcnc_v1_ParseProgramEvent__Output>;
  parseProgram(argument: _linuxcnc_v1_ParseProgramRequest, metadata: grpc.Metadata, options?: grpc.CallOptions): grpc.ClientReadableStream<_linuxcnc_v1_ParseProgramEvent__Output>;
  parseProgram(argument: _linuxcnc_v1_ParseProgramRequest, options?: grpc.CallOptions): grpc.ClientReadableStream<_linuxcnc_v1_ParseProgramEvent__Output>;
  
  UploadWorkspace(metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_linuxcnc_v1_UploadWorkspaceResponse__Output>): grpc.ClientWritableStream<_linuxcnc_v1_UploadWorkspaceRequest>;
  UploadWorkspace(metadata: grpc.Metadata, callback: grpc.requestCallback<_linuxcnc_v1_UploadWorkspaceResponse__Output>): grpc.ClientWritableStream<_linuxcnc_v1_UploadWorkspaceRequest>;
  UploadWorkspace(options: grpc.CallOptions, callback: grpc.requestCallback<_linuxcnc_v1_UploadWorkspaceResponse__Output>): grpc.ClientWritableStream<_linuxcnc_v1_UploadWorkspaceRequest>;
  UploadWorkspace(callback: grpc.requestCallback<_linuxcnc_v1_UploadWorkspaceResponse__Output>): grpc.ClientWritableStream<_linuxcnc_v1_UploadWorkspaceRequest>;
  uploadWorkspace(metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_linuxcnc_v1_UploadWorkspaceResponse__Output>): grpc.ClientWritableStream<_linuxcnc_v1_UploadWorkspaceRequest>;
  uploadWorkspace(metadata: grpc.Metadata, callback: grpc.requestCallback<_linuxcnc_v1_UploadWorkspaceResponse__Output>): grpc.ClientWritableStream<_linuxcnc_v1_UploadWorkspaceRequest>;
  uploadWorkspace(options: grpc.CallOptions, callback: grpc.requestCallback<_linuxcnc_v1_UploadWorkspaceResponse__Output>): grpc.ClientWritableStream<_linuxcnc_v1_UploadWorkspaceRequest>;
  uploadWorkspace(callback: grpc.requestCallback<_linuxcnc_v1_UploadWorkspaceResponse__Output>): grpc.ClientWritableStream<_linuxcnc_v1_UploadWorkspaceRequest>;
  
}

export interface ProgramServiceHandlers extends grpc.UntypedServiceImplementation {
  CreateWorkspace: grpc.handleUnaryCall<_linuxcnc_v1_CreateWorkspaceRequest__Output, _linuxcnc_v1_CreateWorkspaceResponse>;
  
  DeleteWorkspace: grpc.handleUnaryCall<_linuxcnc_v1_DeleteWorkspaceRequest__Output, _google_protobuf_Empty>;
  
  ParseProgram: grpc.handleServerStreamingCall<_linuxcnc_v1_ParseProgramRequest__Output, _linuxcnc_v1_ParseProgramEvent>;
  
  UploadWorkspace: grpc.handleClientStreamingCall<_linuxcnc_v1_UploadWorkspaceRequest__Output, _linuxcnc_v1_UploadWorkspaceResponse>;
  
}

export interface ProgramServiceDefinition extends grpc.ServiceDefinition {
  CreateWorkspace: MethodDefinition<_linuxcnc_v1_CreateWorkspaceRequest, _linuxcnc_v1_CreateWorkspaceResponse, _linuxcnc_v1_CreateWorkspaceRequest__Output, _linuxcnc_v1_CreateWorkspaceResponse__Output>
  DeleteWorkspace: MethodDefinition<_linuxcnc_v1_DeleteWorkspaceRequest, _google_protobuf_Empty, _linuxcnc_v1_DeleteWorkspaceRequest__Output, _google_protobuf_Empty__Output>
  ParseProgram: MethodDefinition<_linuxcnc_v1_ParseProgramRequest, _linuxcnc_v1_ParseProgramEvent, _linuxcnc_v1_ParseProgramRequest__Output, _linuxcnc_v1_ParseProgramEvent__Output>
  UploadWorkspace: MethodDefinition<_linuxcnc_v1_UploadWorkspaceRequest, _linuxcnc_v1_UploadWorkspaceResponse, _linuxcnc_v1_UploadWorkspaceRequest__Output, _linuxcnc_v1_UploadWorkspaceResponse__Output>
}
