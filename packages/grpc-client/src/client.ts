import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import type { HealthClient } from "./generated/grpc/health/v1/Health";
import type { ProtoGrpcType as HealthProtoGrpcType } from "./generated/health";
import type { ProtoGrpcType } from "./generated/linuxcnc";
import type { HalServiceClient } from "./generated/linuxcnc/v1/HalService";
import type { MachineServiceClient } from "./generated/linuxcnc/v1/MachineService";
import type { ProgramServiceClient } from "./generated/linuxcnc/v1/ProgramService";
import type { ScopeServiceClient } from "./generated/linuxcnc/v1/ScopeService";

declare const __dirname: string;

export interface LinuxCncClientOptions {
  address: string;
  protoPath?: string;
  /** Root containing linuxcnc/v1 and grpc/health/v1 schema trees. */
  protoRoot?: string;
  /** Explicit health schema path for deployments with a custom layout. */
  healthProtoPath?: string;
  credentials?: grpc.ChannelCredentials;
  channelOptions?: grpc.ChannelOptions;
}

export interface LinuxCncClients {
  machine: MachineServiceClient;
  program: ProgramServiceClient;
  hal: HalServiceClient;
  scope: ScopeServiceClient;
  health: HealthClient;
}

/** Load the checked-in protobuf schema and construct raw grpc-js clients. */
export async function createLinuxCncClients(
  options: LinuxCncClientOptions,
): Promise<LinuxCncClients> {
  const protoRoot = options.protoRoot ?? `${__dirname}/../proto`;
  const protoPath =
    options.protoPath ?? `${protoRoot}/linuxcnc/v1/linuxcnc.proto`;
  const healthProtoPath =
    options.healthProtoPath ?? `${protoRoot}/grpc/health/v1/health.proto`;
  const packageDefinition = await protoLoader.load(
    [protoPath, healthProtoPath],
    {
      includeDirs: [protoRoot],
      keepCase: false,
      longs: String,
      enums: Number,
      bytes: Buffer,
      oneofs: true,
      defaults: true,
    },
  );
  const loaded = grpc.loadPackageDefinition(
    packageDefinition,
  ) as unknown as ProtoGrpcType & HealthProtoGrpcType;
  const v1 = loaded.linuxcnc.v1;
  const credentials = options.credentials ?? grpc.credentials.createInsecure();
  return {
    machine: new v1.MachineService(
      options.address,
      credentials,
      options.channelOptions,
    ),
    program: new v1.ProgramService(
      options.address,
      credentials,
      options.channelOptions,
    ),
    hal: new v1.HalService(
      options.address,
      credentials,
      options.channelOptions,
    ),
    scope: new v1.ScopeService(
      options.address,
      credentials,
      options.channelOptions,
    ),
    health: new loaded.grpc.health.v1.Health(
      options.address,
      credentials,
      options.channelOptions,
    ),
  };
}
