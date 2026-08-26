import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../../..");
const protoDirectory = join(root, "proto/linuxcnc/v1");
const protoFiles = [
  "common.proto",
  "machine.proto",
  "program.proto",
  "hal.proto",
  "scope.proto",
  "websocket.proto",
];
const generatedPath = join(here, "../src/generated/enums.ts");
const generatedDomainPath = join(here, "../src/generated/domain.ts");
const proto = protoFiles
  .map((file) => readFileSync(join(protoDirectory, file), "utf8"))
  .join("\n");
const generated = readFileSync(generatedPath, "utf8");

// Regenerate into an isolated temporary directory and compare bytes. This catches
// stale or nondeterministic checked-in output in addition to the semantic checks
// below. The generator owns its own temporary descriptor lifecycle as well.
const generatedTempDir = mkdtempSync(
  join(tmpdir(), "linuxcnc-types-generated-"),
);
try {
  const generatedTempPath = join(generatedTempDir, "enums.ts");
  const generatedDomainTempPath = join(generatedTempDir, "domain.ts");
  const generatedCommandTempPath = join(generatedTempDir, "commands.ts");
  const result = spawnSync(
    process.execPath,
    [
      join(here, "generate.mjs"),
      "--output",
      generatedTempPath,
      "--domain-output",
      generatedDomainTempPath,
      "--command-output",
      generatedCommandTempPath,
    ],
    {
      cwd: root,
      env: process.env,
      encoding: "utf8",
    },
  );
  if (result.status !== 0) {
    throw new Error(
      result.stderr || result.error?.message || "types generation failed",
    );
  }
  const checkedInBytes = readFileSync(generatedPath);
  const generatedBytes = readFileSync(generatedTempPath);
  if (!checkedInBytes.equals(generatedBytes)) {
    throw new Error(
      "generated enum output differs: packages/types/src/generated/enums.ts",
    );
  }
  const checkedInDomainBytes = readFileSync(generatedDomainPath);
  const generatedDomainBytes = readFileSync(generatedDomainTempPath);
  if (!checkedInDomainBytes.equals(generatedDomainBytes)) {
    throw new Error(
      "generated domain output differs: packages/types/src/generated/domain.ts",
    );
  }
  const checkedInCommandBytes = readFileSync(
    join(here, "../src/generated/commands.ts"),
  );
  const generatedCommandBytes = readFileSync(generatedCommandTempPath);
  if (!checkedInCommandBytes.equals(generatedCommandBytes)) {
    throw new Error(
      "generated command output differs: packages/types/src/generated/commands.ts",
    );
  }
} finally {
  rmSync(generatedTempDir, { recursive: true, force: true });
}

const findProtoc = () => {
  const candidates = [process.env.PROTOC, "protoc"].filter(Boolean);
  for (const candidate of candidates) {
    const result = spawnSync(candidate, ["--version"], { encoding: "utf8" });
    if (result.status === 0) return [candidate, result.stdout.trim()];
  }
  return null;
};

const parseEnum = (source, name, generatedSource = false) => {
  const match = source.match(
    new RegExp(`enum\\s+${name}\\s*\\{([\\s\\S]*?)\\n\\}`),
  );
  if (!match) throw new Error(`missing enum ${name}`);
  const values = new Map();
  for (const [, rawName, rawValue] of match[1].matchAll(
    /(?:^|\n)\s*([A-Z][A-Z0-9_]*)\s*=\s*(-?(?:0x[0-9a-fA-F]+|\d+))/g,
  )) {
    const prefix = name
      .replace(/[A-Z]/g, (letter, index) => `${index ? "_" : ""}${letter}`)
      .toUpperCase();
    const short = generatedSource ? rawName : rawName.replace(`${prefix}_`, "");
    // Domain enums intentionally omit the wire-only zero sentinel.
    if (rawName.endsWith("_UNSPECIFIED")) continue;
    values.set(short, Number(rawValue));
  }
  return values;
};

const stableEnums = [
  "TaskMode",
  "TaskState",
  "RcsStatus",
  "ExecState",
  "InterpState",
  "StopState",
  "TrajMode",
  "MotionType",
  "KinematicsType",
  "ProgramUnits",
  "NmlMessageType",
  "JointType",
  "OrientState",
  "EmcDebug",
  "OperationType",
  "Plane",
];
for (const name of stableEnums) {
  const wire = parseEnum(proto, name);
  const domain = parseEnum(generated, name, true);
  for (const [member, value] of wire) {
    if (member === "UNSPECIFIED") continue;
    if (domain.get(member) !== value) {
      throw new Error(
        `${name}.${member}: generated=${domain.get(member)} proto=${value}`,
      );
    }
  }
}

const generatedCommands = readFileSync(
  join(root, "packages/types/src/generated/commands.ts"),
  "utf8",
);
const commandNames = [
  ...generatedCommands.matchAll(/^ {2}\| \{ type: "([A-Za-z][A-Za-z0-9]*)"/gm),
].map((m) => m[1]);
const snake = (value) =>
  value.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
const commandBlock =
  proto.match(/message ExecuteCommandRequest\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
const commandOneof =
  commandBlock.match(/oneof\s+command\s*\{([\s\S]*?)\n\s*\}/)?.[1] ?? "";
const wireCommandNames = [
  ...commandOneof.matchAll(
    /^\s*[A-Za-z][A-Za-z0-9<>.]*\s+([a-z][a-z0-9_]*)\s*=\s*\d+;/gm,
  ),
].map((m) => m[1]);
const expectedCommandNames = commandNames.map(snake);
const missingCommands = expectedCommandNames.filter(
  (name) => !wireCommandNames.includes(name),
);
const extraCommands = wireCommandNames.filter(
  (name) => !expectedCommandNames.includes(name),
);
if (
  missingCommands.length ||
  extraCommands.length ||
  wireCommandNames.length !== expectedCommandNames.length
) {
  throw new Error(
    `command catalog drifted: missing=${missingCommands.join(", ") || "none"} ` +
      `extra=${extraCommands.join(", ") || "none"} ` +
      `domain=${expectedCommandNames.length} wire=${wireCommandNames.length}`,
  );
}

const nativeService = readFileSync(
  join(root, "native/server/src/machine/grpc/service.cc"),
  "utf8",
);
const pascal = (value) => value[0].toUpperCase() + value.slice(1);
const missingNativeCases = commandNames.filter(
  (name) =>
    !nativeService.includes(`case ExecuteCommandRequest::k${pascal(name)}:`),
);
if (missingNativeCases.length) {
  throw new Error(
    `native protobuf dispatch is missing: ${missingNativeCases.join(", ")}`,
  );
}
const nativeAdapter = readFileSync(
  join(root, "native/server/src/linuxcnc/nml_adapter.cc"),
  "utf8",
);
const nativeAdapterCases = new Set(
  [...nativeAdapter.matchAll(/case\s+NmlCommandKind::([A-Za-z0-9]+):/g)].map(
    (match) => match[1],
  ),
);
if (nativeAdapterCases.size !== commandNames.length) {
  throw new Error(
    `native NML dispatch has ${nativeAdapterCases.size} cases for ${commandNames.length} protobuf commands`,
  );
}

for (const required of [
  "MachineService",
  "ProgramService",
  "HalService",
  "ScopeService",
]) {
  if (!new RegExp(`service\\s+${required}\\s*\\{`).test(proto))
    throw new Error(`missing ${required}`);
}
for (const required of ["path", "json_value"]) {
  if (!new RegExp(`reserved\\s+[\\s\\S]*\\"${required}\\"`).test(proto))
    throw new Error(`removed field ${required} is not reserved`);
}
if (
  !/message HalScalar\s*\{[\s\S]*?sint64 s64\s*=\s*6;[\s\S]*?uint64 u64\s*=\s*7;/.test(
    proto,
  )
) {
  throw new Error(
    "HalScalar must preserve exact signed and unsigned 64-bit values",
  );
}
if (/rpc\s+(Get|Watch)PositionHistory\b/.test(proto)) {
  throw new Error(
    "position history telemetry must not be exposed through gRPC",
  );
}

const statDeltaBody =
  proto.match(/message LinuxCNCStatDelta\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
if (/\boneof\s+change\b/.test(statDeltaBody)) {
  throw new Error(
    "LinuxCNCStatDelta changes must coexist atomically, not share a oneof",
  );
}
for (const required of [
  /optional\s+int64\s+echo_serial_number\s*=\s*2\s*;/,
  /optional\s+RcsStatus\s+state\s*=\s*3\s*;/,
  /optional\s+int32\s+debug\s*=\s*8\s*;/,
]) {
  if (!required.test(statDeltaBody)) {
    throw new Error(
      "LinuxCNCStatDelta scalar presence contract is missing or changed",
    );
  }
}
const reservedStatements = [
  ...statDeltaBody.matchAll(/^\s*reserved\s+([^;]+);/gm),
].map(([, statement]) => statement);
const reservedNumbers = reservedStatements.flatMap((statement) =>
  [...statement.matchAll(/(?:^|,)\s*(\d+)\s*(?=,|$)/g)].map(([, number]) =>
    Number(number),
  ),
);
const reservedNames = reservedStatements.flatMap((statement) =>
  [...statement.matchAll(/"([a-z][a-z0-9_]*)"/g)].map(([, name]) => name),
);
if (
  JSON.stringify(reservedNumbers.sort((a, b) => a - b)) !==
  JSON.stringify([9, 10])
) {
  throw new Error(
    `LinuxCNCStatDelta must reserve removed field numbers 9, 10 (got ${reservedNumbers.join(", ") || "none"})`,
  );
}
for (const required of ["path", "json_value"]) {
  if (!reservedNames.includes(required))
    throw new Error(
      `LinuxCNCStatDelta removed field ${required} is not reserved`,
    );
}

// Structural domain conformance. The generated domain artifact records every
// field number/name for these messages; this check additionally proves that
// the transport-independent TypeScript models still expose each corresponding
// domain field. This intentionally parses source text instead of importing
// TypeScript, so @linuxcnc-node/types remains free of protobuf/grpc runtime
// dependencies.
const fieldNameOverrides = {
  naive_cam_tolerance: "naiveCAMTolerance",
  rotation_xy: "rotationXY",
};
const snakeToCamel = (name) =>
  fieldNameOverrides[name] ??
  name.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
const messageBlock = (name) => {
  const match = proto.match(new RegExp(`message\\s+${name}\\s*\\{`));
  if (!match || match.index === undefined)
    throw new Error(`missing message ${name}`);
  const open = proto.indexOf("{", match.index);
  let depth = 1;
  for (let index = open + 1; index < proto.length; index += 1) {
    if (proto[index] === "{") depth += 1;
    if (proto[index] === "}") depth -= 1;
    if (depth === 0) return proto.slice(open + 1, index);
  }
  throw new Error(`unterminated message ${name}`);
};
const parseMessageFields = (name) => {
  const fields = [];
  for (const [, label = "", wireType, wireName, rawNumber] of messageBlock(
    name,
  ).matchAll(
    /(?:^|;|\n)\s*(?:(optional|repeated)\s+)?([A-Za-z][A-Za-z0-9_.]*)\s+([a-z][A-Za-z0-9_]*)\s*=\s*(\d+)/g,
  )) {
    fields.push({
      name: snakeToCamel(wireName),
      wireName,
      number: Number(rawNumber),
      label,
      wireType,
    });
  }
  return fields;
};
const parseOneofFields = (message, oneof) => {
  const match = messageBlock(message).match(
    new RegExp(`oneof\\s+${oneof}\\s*\\{([\\s\\S]*?)\\n\\s*\\}`),
  );
  if (!match) throw new Error(`missing oneof ${message}.${oneof}`);
  return [
    ...match[1].matchAll(
      /(?:^|;|\n)\s*([A-Za-z][A-Za-z0-9_.]*)\s+([a-z][A-Za-z0-9_]*)\s*=\s*(\d+)/g,
    ),
  ].map(([, wireType, wireName, rawNumber]) => ({
    name: snakeToCamel(wireName),
    wireName,
    number: Number(rawNumber),
    wireType,
  }));
};
const sourceFiles = {
  core: readFileSync(join(root, "packages/types/src/core.ts"), "utf8"),
  gcode: readFileSync(join(root, "packages/types/src/gcode.ts"), "utf8"),
  hal: readFileSync(join(root, "packages/types/src/hal.ts"), "utf8"),
};
const interfaceFields = (source, name, seen = new Set()) => {
  if (seen.has(name)) return new Set();
  seen.add(name);
  const match = source.match(
    new RegExp(
      `interface\\s+${name}(?:\\s+extends[^\\{]+)?\\s*\\{([\\s\\S]*?)\\n\\}`,
    ),
  );
  if (!match) throw new Error(`missing TypeScript interface ${name}`);
  const fields = new Set(
    [...match[1].matchAll(/^\s*([A-Za-z][A-Za-z0-9_]*)\??\s*:/gm)].map(
      ([, field]) => field,
    ),
  );
  for (const [, base] of match[0].matchAll(
    /extends\s+([A-Za-z][A-Za-z0-9_]*)/g,
  )) {
    for (const field of interfaceFields(source, base, seen)) fields.add(field);
  }
  return fields;
};
const assertMessageFields = (
  wireName,
  sourceName,
  interfaceName,
  aliases = {},
) => {
  const fields = interfaceFields(sourceFiles[sourceName], interfaceName);
  for (const field of parseMessageFields(wireName)) {
    const expected = aliases[field.wireName] ?? [field.name];
    for (const name of Array.isArray(expected) ? expected : [expected]) {
      if (!fields.has(name)) {
        throw new Error(
          `${wireName}.${field.wireName}: missing ${sourceName}.${interfaceName}.${name}`,
        );
      }
    }
  }
};

const statusContracts = [
  ["ToolEntry", "core"],
  ["ActiveGCodes", "core"],
  ["ActiveMCodes", "core"],
  ["ActiveSettings", "core"],
  ["TaskStat", "core"],
  ["JointStat", "core"],
  ["AxisStat", "core"],
  ["SpindleStat", "core"],
  ["TrajectoryStat", "core"],
  ["MotionStat", "core"],
  ["ToolIoStat", "core"],
  ["CoolantIoStat", "core"],
  ["IoStat", "core"],
  ["LinuxCNCStat", "core"],
  ["LinuxCNCError", "core"],
];
for (const [message, sourceName] of statusContracts)
  assertMessageFields(message, sourceName, message);
assertMessageFields("Extents", "gcode", "Extents");
assertMessageFields("HalItemRef", "hal", "HalItemRef");
for (const message of [
  "HalComponentInfo",
  "HalFunctionInfo",
  "HalThreadInfo",
  "HalPinInfo",
  "HalParamInfo",
  "HalSignalInfo",
  "HalTopology",
]) {
  assertMessageFields(message, "hal", message);
}
for (const message of [
  "ScopeAcquisitionConfig",
  "ScopeStatus",
  "ScopeCapture",
  "ScopeCaptureDelta",
]) {
  assertMessageFields(message, "hal", message);
}
// ScopeChannelConfig deliberately flattens the wire's nested HalItemRef into
// the long-standing {kind, name} domain shape while retaining slot metadata.
assertMessageFields("ScopeChannelConfig", "hal", "ScopeChannelConfig", {
  item: ["kind", "name"],
});

const operationUnion =
  sourceFiles.gcode.match(/export type GCodeOperation\s*=([\s\S]*?);/)?.[1] ??
  "";
const operationTypes = new Set(
  [...operationUnion.matchAll(/\|\s*([A-Za-z][A-Za-z0-9]*)/g)].map(
    ([, name]) => name,
  ),
);
const operationWireTypes = {
  arc: "ArcOperation",
  probe: "ProbeOperation",
  rigid_tap: "RigidTapOperation",
  dwell: "DwellOperation",
  nurbs_g5: "NurbsG5Operation",
  nurbs_g6: "NurbsG6Operation",
  units_change: "UnitsChangeOperation",
  plane_change: "PlaneChangeOperation",
  g5x_offset: "G5xOffsetOperation",
  g92_offset: "G92OffsetOperation",
  xy_rotation: "XYRotationOperation",
  tool_offset: "ToolOffsetOperation",
  tool_change: "ToolChangeOperation",
  feed_rate_change: "FeedRateChangeOperation",
};
const actualOperationVariants = parseOneofFields("GCodeOperation", "data")
  .map((field) => field.wireName)
  .sort();
const expectedOperationVariants = Object.keys(operationWireTypes).sort();
if (
  JSON.stringify(actualOperationVariants) !==
  JSON.stringify(expectedOperationVariants)
) {
  throw new Error(
    `GCodeOperation variants drifted: ${actualOperationVariants.join(", ")}`,
  );
}
for (const type of Object.values(operationWireTypes)) {
  if (!operationTypes.has(type))
    throw new Error(`GCodeOperation union is missing ${type}`);
}

const scalarVariants = parseOneofFields("HalScalar", "value")
  .map((field) => field.wireName)
  .sort();
if (
  JSON.stringify(scalarVariants) !==
  JSON.stringify(["bit", "float_value", "s32", "s64", "u32", "u64"])
) {
  throw new Error(`HalScalar variants drifted: ${scalarVariants.join(", ")}`);
}
if (
  !/export type HalValue = boolean \| number \| bigint/.test(sourceFiles.hal)
) {
  throw new Error(
    "HalValue must retain boolean, number, and bigint domain values",
  );
}
const packedFields = new Map(
  parseMessageFields("PackedChannel").map((field) => [
    field.wireName,
    field.number,
  ]),
);
for (const [name, number] of [
  ["values", 1],
  ["index", 2],
  ["enabled", 3],
]) {
  if (packedFields.get(name) !== number)
    throw new Error(`PackedChannel.${name} must remain field ${number}`);
}
if (
  !/export type Position = Float64Array/.test(sourceFiles.core) ||
  !/export type Position3 = Float64Array/.test(sourceFiles.core) ||
  !/POSITION_STRIDE = 10/.test(generated)
) {
  throw new Error(
    "position domain layout drifted from Float64Array/stride contract",
  );
}

const protoc = findProtoc();
if (!protoc) {
  console.warn(
    "protoc is not installed; validated the checked-in generated outputs against the schema text only.",
  );
} else {
  console.log(`validated with ${protoc[1]}`);
}
console.log(
  `generated contract check passed (${stableEnums.length} enums, ${commandNames.length} commands)`,
);
