import type { HalValue } from "@linuxcnc-node/types";

export interface HalTelemetryEntry {
  slot: number;
  type: number;
  value?: HalValue;
}

export interface HalTelemetryFrame {
  kind: "replacement" | "delta";
  revision: number;
  sequence: bigint;
  entries: HalTelemetryEntry[];
}

const HEADER_SIZE = 32;
const ENTRY_SIZE = 16;

export function decodeHalTelemetryFrame(
  buffer: ArrayBuffer,
): HalTelemetryFrame {
  if (buffer.byteLength < HEADER_SIZE)
    throw new Error("HAL telemetry frame is shorter than its header");
  const view = new DataView(buffer);
  if (
    view.getUint8(0) !== 0x4c ||
    view.getUint8(1) !== 0x43 ||
    view.getUint8(2) !== 0x48 ||
    view.getUint8(3) !== 0x56
  )
    throw new Error("HAL telemetry frame has invalid magic");
  if (view.getUint8(4) !== 1)
    throw new Error("HAL telemetry frame uses an unsupported version");
  const kindValue = view.getUint8(5);
  if (kindValue !== 1 && kindValue !== 2)
    throw new Error("HAL telemetry frame has an invalid kind");
  if (view.getUint16(6, true) !== ENTRY_SIZE)
    throw new Error("HAL telemetry frame has an invalid entry stride");
  const revision = Number(view.getBigUint64(8, true));
  if (!Number.isSafeInteger(revision))
    throw new Error("HAL telemetry revision exceeds the safe JavaScript range");
  const sequence = view.getBigUint64(16, true);
  const count = view.getUint32(24, true);
  if (buffer.byteLength !== HEADER_SIZE + count * ENTRY_SIZE)
    throw new Error(
      "HAL telemetry frame length does not match its entry count",
    );
  const entries: HalTelemetryEntry[] = [];
  for (let index = 0; index < count; index++) {
    const offset = HEADER_SIZE + index * ENTRY_SIZE;
    const slot = view.getUint32(offset, true);
    const type = view.getUint8(offset + 4);
    let value: HalValue | undefined;
    switch (type) {
      case 0:
        break;
      case 1:
        value = view.getBigUint64(offset + 8, true) !== 0n;
        break;
      case 2:
        value = view.getFloat64(offset + 8, true);
        break;
      case 3:
        value = view.getInt32(offset + 8, true);
        break;
      case 4:
        value = view.getUint32(offset + 8, true);
        break;
      case 5:
        value = view.getBigInt64(offset + 8, true);
        break;
      case 6:
        value = view.getBigUint64(offset + 8, true);
        break;
      default:
        throw new Error(`HAL telemetry entry has unknown type ${type}`);
    }
    entries.push(value === undefined ? { slot, type } : { slot, type, value });
  }
  return {
    kind: kindValue === 1 ? "replacement" : "delta",
    revision,
    sequence,
    entries,
  };
}
