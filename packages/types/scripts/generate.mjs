import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../../..");
const proto = join(root, "proto/linuxcnc/v1/linuxcnc.proto");
const outputFlag = process.argv.indexOf("--output");
if (outputFlag >= 0 && !process.argv[outputFlag + 1]) {
  throw new Error("--output requires a file path");
}
const domainOutputFlag = process.argv.indexOf("--domain-output");
if (domainOutputFlag >= 0 && !process.argv[domainOutputFlag + 1]) {
  throw new Error("--domain-output requires a file path");
}
const generated =
  outputFlag >= 0
    ? resolve(process.cwd(), process.argv[outputFlag + 1])
    : join(here, "../src/generated/enums.ts");
const generatedDomain =
  domainOutputFlag >= 0
    ? resolve(process.cwd(), process.argv[domainOutputFlag + 1])
    : outputFlag >= 0
      ? join(dirname(generated), "domain.ts")
      : join(here, "../src/generated/domain.ts");
const source = readFileSync(proto, "utf8");
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
const prefixFor = (name) =>
  name
    .replace(/[A-Z]/g, (letter, index) => `${index ? "_" : ""}${letter}`)
    .toUpperCase();
const parse = (name) => {
  const match = source.match(
    new RegExp(`enum\\s+${name}\\s*\\{([\\s\\S]*?)\\n\\}`),
  );
  if (!match) throw new Error(`missing enum ${name}`);
  const values = [];
  for (const [, rawName, rawValue] of match[1].matchAll(
    /(?:^|\n)\s*([A-Z][A-Z0-9_]*)\s*=\s*(-?(?:0x[0-9a-fA-F]+|\d+))/g,
  )) {
    if (rawName.endsWith("_UNSPECIFIED")) continue;
    values.push([rawName.replace(`${prefixFor(name)}_`, ""), Number(rawValue)]);
  }
  return values;
};
const fieldNameOverrides = {
  naive_cam_tolerance: "naiveCAMTolerance",
  rotation_xy: "rotationXY",
};
const snakeToCamel = (name) =>
  fieldNameOverrides[name] ??
  name.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
const messageBlock = (name) => {
  const match = source.match(new RegExp(`message\\s+${name}\\s*\\{`));
  if (!match || match.index === undefined)
    throw new Error(`missing message ${name}`);
  const open = source.indexOf("{", match.index);
  let depth = 1;
  for (let index = open + 1; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(open + 1, index);
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
  const body = messageBlock(message);
  const match = body.match(
    new RegExp(`oneof\\s+${oneof}\\s*\\{([\\s\\S]*?)\\n\\s*\\}`),
  );
  if (!match) throw new Error(`missing oneof ${message}.${oneof}`);
  const fields = [];
  for (const [, wireType, wireName, rawNumber] of match[1].matchAll(
    /(?:^|;|\n)\s*([A-Za-z][A-Za-z0-9_.]*)\s+([a-z][A-Za-z0-9_]*)\s*=\s*(\d+)/g,
  )) {
    fields.push({
      name: snakeToCamel(wireName),
      wireName,
      number: Number(rawNumber),
      wireType,
    });
  }
  return fields;
};
const domainMessages = [
  "Position",
  "ToolEntry",
  "ActiveGCodes",
  "ActiveMCodes",
  "ActiveSettings",
  "TaskStat",
  "JointStat",
  "AxisStat",
  "SpindleStat",
  "TrajectoryStat",
  "MotionStat",
  "ToolIoStat",
  "CoolantIoStat",
  "IoStat",
  "LinuxCNCStat",
  "LinuxCNCError",
  "Extents",
  "GCodeOperation",
  "HalItemRef",
  "HalScalar",
  "HalComponentInfo",
  "HalFunctionInfo",
  "HalThreadInfo",
  "HalPinInfo",
  "HalParamInfo",
  "HalSignalInfo",
  "HalTopology",
  "ScopeChannelConfig",
  "ScopeAcquisitionConfig",
  "ScopeStatus",
  "ScopeCapture",
  "ScopeCaptureDelta",
  "PackedChannel",
];
const domainFields = Object.fromEntries(
  domainMessages.map((name) => [name, parseMessageFields(name)]),
);
const gcodeOperationVariants = parseOneofFields("GCodeOperation", "data");
const halScalarVariants = parseOneofFields("HalScalar", "value");
const packedChannelFields = domainFields.PackedChannel;
let output =
  "/** Generated from proto/linuxcnc/v1/linuxcnc.proto. Do not edit manually. */\n\n";
for (const name of stableEnums) {
  output += `export enum ${name} {\n`;
  for (const [member, value] of parse(name))
    output += `  ${member} = ${value},\n`;
  output += "}\n\n";
}
output += `export const POSITION_STRIDE = 10;\n\nexport enum PositionLoggerIndex {\n  X = 0,\n  Y = 1,\n  Z = 2,\n  A = 3,\n  B = 4,\n  C = 5,\n  U = 6,\n  V = 7,\n  W = 8,\n  MotionType = 9,\n}\n\nexport enum PositionIndex {\n  X = 0,\n  Y = 1,\n  Z = 2,\n  A = 3,\n  B = 4,\n  C = 5,\n  U = 6,\n  V = 7,\n  W = 8,\n}\n`;
writeFileSync(generated, output);

let domainOutput =
  "/** Generated from proto/linuxcnc/v1/linuxcnc.proto. Do not edit manually. */\n\n";
domainOutput += `import type {\n  AxisStat,\n  AxisName,\n  LinuxCNCError,\n  LinuxCNCStat,\n  Position,\n  Position3,\n  ToolEntry,\n} from "../core";\nimport type {\n  GCodeOperation,\n  GCodeParseResult,\n  Extents,\n} from "../gcode";\nimport type {\n  HalComponentInfo,\n  HalFunctionInfo,\n  HalParamInfo,\n  HalPinInfo,\n  HalSignalInfo,\n  HalThreadInfo,\n  HalTopology,\n  HalValue,\n  ScopeCapture,\n  ScopeCaptureDelta,\n  ScopeStatus,\n} from "../hal";\n\n`;
domainOutput += `export type GeneratedPosition = Position;\nexport type GeneratedPosition3 = Position3;\nexport type GeneratedToolEntry = ToolEntry;\nexport type GeneratedLinuxCNCStat = LinuxCNCStat;\nexport type GeneratedLinuxCNCError = LinuxCNCError;\nexport type GeneratedAxisStat = AxisStat;\nexport type GeneratedAxisName = AxisName;\nexport type GeneratedGCodeOperation = GCodeOperation;\nexport type GeneratedGCodeParseResult = GCodeParseResult;\nexport type GeneratedExtents = Extents;\nexport type GeneratedHalValue = HalValue;\nexport type GeneratedHalComponentInfo = HalComponentInfo;\nexport type GeneratedHalFunctionInfo = HalFunctionInfo;\nexport type GeneratedHalParamInfo = HalParamInfo;\nexport type GeneratedHalPinInfo = HalPinInfo;\nexport type GeneratedHalSignalInfo = HalSignalInfo;\nexport type GeneratedHalThreadInfo = HalThreadInfo;\nexport type GeneratedHalTopology = HalTopology;\nexport type GeneratedScopeStatus = ScopeStatus;\nexport type GeneratedScopeCapture = ScopeCapture;\nexport type GeneratedScopeCaptureDelta = ScopeCaptureDelta;\n\n`;
domainOutput += "export const PROTO_DOMAIN_FIELDS = {\n";
for (const name of domainMessages) {
  domainOutput += `  ${name}: {\n`;
  for (const field of domainFields[name]) {
    domainOutput += `    ${field.name}: { number: ${field.number}, wireName: "${field.wireName}" },\n`;
  }
  domainOutput += "  },\n";
}
domainOutput += "} as const;\n\n";
domainOutput += `export const PROTO_POSITION_LAYOUT = {\n  Position: { storage: "Float64Array", length: 9 },\n  Position3: { storage: "Float64Array", length: 3 },\n  PositionHistory: { storage: "Float64Array", stride: 10 },\n} as const;\n\n`;
domainOutput += "export const PROTO_GCODE_OPERATION_VARIANTS = [\n";
for (const field of gcodeOperationVariants)
  domainOutput += `  { name: "${field.name}", wireName: "${field.wireName}", number: ${field.number} },\n`;
domainOutput += "] as const;\n\n";
domainOutput += "export const PROTO_HAL_SCALAR_VARIANTS = [\n";
for (const field of halScalarVariants)
  domainOutput += `  { name: "${field.name}", wireName: "${field.wireName}", number: ${field.number} },\n`;
domainOutput += "] as const;\n\n";
domainOutput += "export const PROTO_PACKED_CHANNEL_FIELDS = [\n";
for (const field of packedChannelFields)
  domainOutput += `  { name: "${field.name}", wireName: "${field.wireName}", number: ${field.number} },\n`;
domainOutput += "] as const;\n";
writeFileSync(generatedDomain, domainOutput);

const candidates = [process.env.PROTOC, "protoc"].filter(Boolean);
const protoc = candidates.find(
  (candidate) =>
    spawnSync(candidate, ["--version"], { encoding: "utf8" }).status === 0,
);
if (protoc) {
  const descriptorDir = mkdtempSync(
    join(tmpdir(), "linuxcnc-types-descriptor-"),
  );
  try {
    const descriptor = join(descriptorDir, "linuxcnc-v1.generated.pb");
    const result = spawnSync(
      protoc,
      [
        "-I",
        join(root, "proto"),
        "-I",
        "/usr/include",
        `--descriptor_set_out=${descriptor}`,
        proto,
      ],
      { encoding: "utf8" },
    );
    if (result.status !== 0) throw new Error(result.stderr || "protoc failed");
    console.log(
      `generated enums and validated protobuf descriptor with ${protoc}`,
    );
  } finally {
    rmSync(descriptorDir, { recursive: true, force: true });
  }
} else {
  console.warn(
    "protoc is not installed; generated enums from schema text and skipped descriptor validation.",
  );
}
