import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { credentials as grpcCredentials } from "@grpc/grpc-js";

export interface GrpcClientConfig {
  address: string;
  telemetryUrl: string;
  /** Optional schema override; the generated client supplies its bundled default. */
  protoPath?: string;
  /** Root containing linuxcnc/v1, grpc/health/v1, and google/protobuf. */
  protoRoot?: string;
  credentials?: unknown;
}

function resolvePackage(name: string): string {
  // The backend is shipped as CommonJS.  Avoid import.meta.url here because
  // esbuild replaces it with an empty value in that format.
  if (typeof require === "function") return require.resolve(name);
  return createRequire(resolve(process.cwd(), "package.json")).resolve(name);
}

function rootForProtoPath(protoPath: string): string {
  // .../<protoRoot>/linuxcnc/v1/linuxcnc.proto
  return resolve(dirname(resolve(protoPath)), "../..");
}

interface SchemaPaths {
  protoPath?: string;
  protoRoot?: string;
}

function defaultSchemaPaths(env: NodeJS.ProcessEnv): SchemaPaths {
  const explicitRoot = env.LINUXCNC_GRPC_PROTO_ROOT?.trim();
  const explicitPath = env.LINUXCNC_GRPC_PROTO?.trim();
  if (explicitPath) {
    const protoPath = resolve(explicitPath);
    return {
      protoPath,
      protoRoot: explicitRoot
        ? resolve(explicitRoot)
        : rootForProtoPath(protoPath),
    };
  }
  if (explicitRoot) return { protoRoot: resolve(explicitRoot) };

  // The CJS backend build copies the raw client's schema beside backend.cjs;
  // prefer this deterministic packaged-app location before package metadata.
  const packaged = resolve(
    typeof __dirname === "string"
      ? __dirname
      : resolve(process.cwd(), "backend/dist"),
    "proto/linuxcnc/v1/linuxcnc.proto",
  );
  if (existsSync(packaged))
    return { protoPath: packaged, protoRoot: rootForProtoPath(packaged) };
  try {
    const packageRoot = dirname(
      resolvePackage("@linuxcnc-node/grpc-client/package.json"),
    );
    const bundled = resolve(packageRoot, "proto/linuxcnc/v1/linuxcnc.proto");
    if (existsSync(bundled))
      return { protoPath: bundled, protoRoot: rootForProtoPath(bundled) };
  } catch {
    // The package may be bundled into an Eden image without package metadata.
  }
  // Passing undefined lets @linuxcnc-node/grpc-client resolve its bundled
  // schema relative to its own runtime.  In a development checkout, accept
  // the conventional repository path as a convenience.
  const checkout = resolve(process.cwd(), "proto/linuxcnc/v1/linuxcnc.proto");
  return existsSync(checkout)
    ? { protoPath: checkout, protoRoot: rootForProtoPath(checkout) }
    : {};
}

function readPem(env: NodeJS.ProcessEnv, name: string): Buffer | undefined {
  const path = env[name]?.trim();
  if (!path) return undefined;
  return readFileSync(resolve(path));
}

/**
 * Resolve the Inspector's daemon endpoint without coupling the UI to gRPC.
 * TLS is enabled only when a CA is configured; client cert/key turn it into
 * mTLS.  The returned credential is passed directly to grpc-js by the
 * backend boundary.
 */
export function readGrpcConfig(
  env: NodeJS.ProcessEnv = process.env,
): GrpcClientConfig {
  const address = env.LINUXCNC_GRPC_ENDPOINT?.trim() || "127.0.0.1:50051";
  const telemetryUrl =
    env.LINUXCNC_TELEMETRY_URL?.trim().replace(/\/$/, "") ||
    "ws://127.0.0.1:50052";
  const schema = defaultSchemaPaths(env);
  const ca = readPem(env, "LINUXCNC_GRPC_TLS_CA");
  const cert = readPem(env, "LINUXCNC_GRPC_TLS_CERT");
  const key = readPem(env, "LINUXCNC_GRPC_TLS_KEY");
  if ((cert && !key) || (!cert && key)) {
    throw new Error(
      "LINUXCNC_GRPC_TLS_CERT and LINUXCNC_GRPC_TLS_KEY must be provided together",
    );
  }
  if (!ca && (cert || key)) {
    throw new Error(
      "LINUXCNC_GRPC_TLS_CA is required when client certificates are configured",
    );
  }
  if (!ca) return { address, telemetryUrl, ...schema };

  return {
    address,
    telemetryUrl,
    ...schema,
    credentials: grpcCredentials.createSsl(ca, key, cert),
  };
}
