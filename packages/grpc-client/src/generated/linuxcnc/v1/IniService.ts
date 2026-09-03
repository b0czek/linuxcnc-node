// Original file: proto/linuxcnc/v1/ini.proto

import type * as grpc from '@grpc/grpc-js'
import type { MethodDefinition } from '@grpc/proto-loader'
import type { IniBoolValue as _linuxcnc_v1_IniBoolValue, IniBoolValue__Output as _linuxcnc_v1_IniBoolValue__Output } from '../../linuxcnc/v1/IniBoolValue';
import type { IniFindAllRequest as _linuxcnc_v1_IniFindAllRequest, IniFindAllRequest__Output as _linuxcnc_v1_IniFindAllRequest__Output } from '../../linuxcnc/v1/IniFindAllRequest';
import type { IniFloatValue as _linuxcnc_v1_IniFloatValue, IniFloatValue__Output as _linuxcnc_v1_IniFloatValue__Output } from '../../linuxcnc/v1/IniFloatValue';
import type { IniIntValue as _linuxcnc_v1_IniIntValue, IniIntValue__Output as _linuxcnc_v1_IniIntValue__Output } from '../../linuxcnc/v1/IniIntValue';
import type { IniStringValue as _linuxcnc_v1_IniStringValue, IniStringValue__Output as _linuxcnc_v1_IniStringValue__Output } from '../../linuxcnc/v1/IniStringValue';
import type { IniStringValues as _linuxcnc_v1_IniStringValues, IniStringValues__Output as _linuxcnc_v1_IniStringValues__Output } from '../../linuxcnc/v1/IniStringValues';
import type { IniUIntValue as _linuxcnc_v1_IniUIntValue, IniUIntValue__Output as _linuxcnc_v1_IniUIntValue__Output } from '../../linuxcnc/v1/IniUIntValue';
import type { IniValueRequest as _linuxcnc_v1_IniValueRequest, IniValueRequest__Output as _linuxcnc_v1_IniValueRequest__Output } from '../../linuxcnc/v1/IniValueRequest';

/**
 * Read-only access to the INI loaded when this server session starts. No RPC
 * accepts a filename, so callers cannot query files other than the active INI.
 */
export interface IniServiceClient extends grpc.Client {
  /**
   * Returns NOT_FOUND when the selected key occurrence does not exist.
   */
  Find(argument: _linuxcnc_v1_IniValueRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_linuxcnc_v1_IniStringValue__Output>): grpc.ClientUnaryCall;
  Find(argument: _linuxcnc_v1_IniValueRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_linuxcnc_v1_IniStringValue__Output>): grpc.ClientUnaryCall;
  Find(argument: _linuxcnc_v1_IniValueRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_linuxcnc_v1_IniStringValue__Output>): grpc.ClientUnaryCall;
  Find(argument: _linuxcnc_v1_IniValueRequest, callback: grpc.requestCallback<_linuxcnc_v1_IniStringValue__Output>): grpc.ClientUnaryCall;
  /**
   * Returns NOT_FOUND when the selected key occurrence does not exist.
   */
  find(argument: _linuxcnc_v1_IniValueRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_linuxcnc_v1_IniStringValue__Output>): grpc.ClientUnaryCall;
  find(argument: _linuxcnc_v1_IniValueRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_linuxcnc_v1_IniStringValue__Output>): grpc.ClientUnaryCall;
  find(argument: _linuxcnc_v1_IniValueRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_linuxcnc_v1_IniStringValue__Output>): grpc.ClientUnaryCall;
  find(argument: _linuxcnc_v1_IniValueRequest, callback: grpc.requestCallback<_linuxcnc_v1_IniStringValue__Output>): grpc.ClientUnaryCall;
  
  /**
   * Returns an empty values list when the key does not exist.
   */
  FindAll(argument: _linuxcnc_v1_IniFindAllRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_linuxcnc_v1_IniStringValues__Output>): grpc.ClientUnaryCall;
  FindAll(argument: _linuxcnc_v1_IniFindAllRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_linuxcnc_v1_IniStringValues__Output>): grpc.ClientUnaryCall;
  FindAll(argument: _linuxcnc_v1_IniFindAllRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_linuxcnc_v1_IniStringValues__Output>): grpc.ClientUnaryCall;
  FindAll(argument: _linuxcnc_v1_IniFindAllRequest, callback: grpc.requestCallback<_linuxcnc_v1_IniStringValues__Output>): grpc.ClientUnaryCall;
  /**
   * Returns an empty values list when the key does not exist.
   */
  findAll(argument: _linuxcnc_v1_IniFindAllRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_linuxcnc_v1_IniStringValues__Output>): grpc.ClientUnaryCall;
  findAll(argument: _linuxcnc_v1_IniFindAllRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_linuxcnc_v1_IniStringValues__Output>): grpc.ClientUnaryCall;
  findAll(argument: _linuxcnc_v1_IniFindAllRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_linuxcnc_v1_IniStringValues__Output>): grpc.ClientUnaryCall;
  findAll(argument: _linuxcnc_v1_IniFindAllRequest, callback: grpc.requestCallback<_linuxcnc_v1_IniStringValues__Output>): grpc.ClientUnaryCall;
  
  /**
   * Typed operations return NOT_FOUND for an absent value and
   * INVALID_ARGUMENT for a present value that LinuxCNC cannot convert.
   */
  GetBool(argument: _linuxcnc_v1_IniValueRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_linuxcnc_v1_IniBoolValue__Output>): grpc.ClientUnaryCall;
  GetBool(argument: _linuxcnc_v1_IniValueRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_linuxcnc_v1_IniBoolValue__Output>): grpc.ClientUnaryCall;
  GetBool(argument: _linuxcnc_v1_IniValueRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_linuxcnc_v1_IniBoolValue__Output>): grpc.ClientUnaryCall;
  GetBool(argument: _linuxcnc_v1_IniValueRequest, callback: grpc.requestCallback<_linuxcnc_v1_IniBoolValue__Output>): grpc.ClientUnaryCall;
  /**
   * Typed operations return NOT_FOUND for an absent value and
   * INVALID_ARGUMENT for a present value that LinuxCNC cannot convert.
   */
  getBool(argument: _linuxcnc_v1_IniValueRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_linuxcnc_v1_IniBoolValue__Output>): grpc.ClientUnaryCall;
  getBool(argument: _linuxcnc_v1_IniValueRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_linuxcnc_v1_IniBoolValue__Output>): grpc.ClientUnaryCall;
  getBool(argument: _linuxcnc_v1_IniValueRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_linuxcnc_v1_IniBoolValue__Output>): grpc.ClientUnaryCall;
  getBool(argument: _linuxcnc_v1_IniValueRequest, callback: grpc.requestCallback<_linuxcnc_v1_IniBoolValue__Output>): grpc.ClientUnaryCall;
  
  GetFloat(argument: _linuxcnc_v1_IniValueRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_linuxcnc_v1_IniFloatValue__Output>): grpc.ClientUnaryCall;
  GetFloat(argument: _linuxcnc_v1_IniValueRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_linuxcnc_v1_IniFloatValue__Output>): grpc.ClientUnaryCall;
  GetFloat(argument: _linuxcnc_v1_IniValueRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_linuxcnc_v1_IniFloatValue__Output>): grpc.ClientUnaryCall;
  GetFloat(argument: _linuxcnc_v1_IniValueRequest, callback: grpc.requestCallback<_linuxcnc_v1_IniFloatValue__Output>): grpc.ClientUnaryCall;
  getFloat(argument: _linuxcnc_v1_IniValueRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_linuxcnc_v1_IniFloatValue__Output>): grpc.ClientUnaryCall;
  getFloat(argument: _linuxcnc_v1_IniValueRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_linuxcnc_v1_IniFloatValue__Output>): grpc.ClientUnaryCall;
  getFloat(argument: _linuxcnc_v1_IniValueRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_linuxcnc_v1_IniFloatValue__Output>): grpc.ClientUnaryCall;
  getFloat(argument: _linuxcnc_v1_IniValueRequest, callback: grpc.requestCallback<_linuxcnc_v1_IniFloatValue__Output>): grpc.ClientUnaryCall;
  
  GetInt(argument: _linuxcnc_v1_IniValueRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_linuxcnc_v1_IniIntValue__Output>): grpc.ClientUnaryCall;
  GetInt(argument: _linuxcnc_v1_IniValueRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_linuxcnc_v1_IniIntValue__Output>): grpc.ClientUnaryCall;
  GetInt(argument: _linuxcnc_v1_IniValueRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_linuxcnc_v1_IniIntValue__Output>): grpc.ClientUnaryCall;
  GetInt(argument: _linuxcnc_v1_IniValueRequest, callback: grpc.requestCallback<_linuxcnc_v1_IniIntValue__Output>): grpc.ClientUnaryCall;
  getInt(argument: _linuxcnc_v1_IniValueRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_linuxcnc_v1_IniIntValue__Output>): grpc.ClientUnaryCall;
  getInt(argument: _linuxcnc_v1_IniValueRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_linuxcnc_v1_IniIntValue__Output>): grpc.ClientUnaryCall;
  getInt(argument: _linuxcnc_v1_IniValueRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_linuxcnc_v1_IniIntValue__Output>): grpc.ClientUnaryCall;
  getInt(argument: _linuxcnc_v1_IniValueRequest, callback: grpc.requestCallback<_linuxcnc_v1_IniIntValue__Output>): grpc.ClientUnaryCall;
  
  GetUInt(argument: _linuxcnc_v1_IniValueRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_linuxcnc_v1_IniUIntValue__Output>): grpc.ClientUnaryCall;
  GetUInt(argument: _linuxcnc_v1_IniValueRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_linuxcnc_v1_IniUIntValue__Output>): grpc.ClientUnaryCall;
  GetUInt(argument: _linuxcnc_v1_IniValueRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_linuxcnc_v1_IniUIntValue__Output>): grpc.ClientUnaryCall;
  GetUInt(argument: _linuxcnc_v1_IniValueRequest, callback: grpc.requestCallback<_linuxcnc_v1_IniUIntValue__Output>): grpc.ClientUnaryCall;
  getUInt(argument: _linuxcnc_v1_IniValueRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_linuxcnc_v1_IniUIntValue__Output>): grpc.ClientUnaryCall;
  getUInt(argument: _linuxcnc_v1_IniValueRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_linuxcnc_v1_IniUIntValue__Output>): grpc.ClientUnaryCall;
  getUInt(argument: _linuxcnc_v1_IniValueRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_linuxcnc_v1_IniUIntValue__Output>): grpc.ClientUnaryCall;
  getUInt(argument: _linuxcnc_v1_IniValueRequest, callback: grpc.requestCallback<_linuxcnc_v1_IniUIntValue__Output>): grpc.ClientUnaryCall;
  
}

/**
 * Read-only access to the INI loaded when this server session starts. No RPC
 * accepts a filename, so callers cannot query files other than the active INI.
 */
export interface IniServiceHandlers extends grpc.UntypedServiceImplementation {
  /**
   * Returns NOT_FOUND when the selected key occurrence does not exist.
   */
  Find: grpc.handleUnaryCall<_linuxcnc_v1_IniValueRequest__Output, _linuxcnc_v1_IniStringValue>;
  
  /**
   * Returns an empty values list when the key does not exist.
   */
  FindAll: grpc.handleUnaryCall<_linuxcnc_v1_IniFindAllRequest__Output, _linuxcnc_v1_IniStringValues>;
  
  /**
   * Typed operations return NOT_FOUND for an absent value and
   * INVALID_ARGUMENT for a present value that LinuxCNC cannot convert.
   */
  GetBool: grpc.handleUnaryCall<_linuxcnc_v1_IniValueRequest__Output, _linuxcnc_v1_IniBoolValue>;
  
  GetFloat: grpc.handleUnaryCall<_linuxcnc_v1_IniValueRequest__Output, _linuxcnc_v1_IniFloatValue>;
  
  GetInt: grpc.handleUnaryCall<_linuxcnc_v1_IniValueRequest__Output, _linuxcnc_v1_IniIntValue>;
  
  GetUInt: grpc.handleUnaryCall<_linuxcnc_v1_IniValueRequest__Output, _linuxcnc_v1_IniUIntValue>;
  
}

export interface IniServiceDefinition extends grpc.ServiceDefinition {
  Find: MethodDefinition<_linuxcnc_v1_IniValueRequest, _linuxcnc_v1_IniStringValue, _linuxcnc_v1_IniValueRequest__Output, _linuxcnc_v1_IniStringValue__Output>
  FindAll: MethodDefinition<_linuxcnc_v1_IniFindAllRequest, _linuxcnc_v1_IniStringValues, _linuxcnc_v1_IniFindAllRequest__Output, _linuxcnc_v1_IniStringValues__Output>
  GetBool: MethodDefinition<_linuxcnc_v1_IniValueRequest, _linuxcnc_v1_IniBoolValue, _linuxcnc_v1_IniValueRequest__Output, _linuxcnc_v1_IniBoolValue__Output>
  GetFloat: MethodDefinition<_linuxcnc_v1_IniValueRequest, _linuxcnc_v1_IniFloatValue, _linuxcnc_v1_IniValueRequest__Output, _linuxcnc_v1_IniFloatValue__Output>
  GetInt: MethodDefinition<_linuxcnc_v1_IniValueRequest, _linuxcnc_v1_IniIntValue, _linuxcnc_v1_IniValueRequest__Output, _linuxcnc_v1_IniIntValue__Output>
  GetUInt: MethodDefinition<_linuxcnc_v1_IniValueRequest, _linuxcnc_v1_IniUIntValue, _linuxcnc_v1_IniValueRequest__Output, _linuxcnc_v1_IniUIntValue__Output>
}
