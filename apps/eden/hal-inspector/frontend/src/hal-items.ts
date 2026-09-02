import type { HalItemRef, HalValue } from "@linuxcnc-node/types";
import type { TopologySnapshot } from "../../shared/protocol";
import { t } from "./i18n";
import type { Category, Row } from "./models";

export const halItemKey = (ref: HalItemRef): string =>
  `${ref.kind}:${ref.name}`;

export function categoryItemCount(
  topology: TopologySnapshot | null,
  category: Category,
): number {
  if (!topology) return 0;
  if (category === "params") return topology.params.length;
  return topology[category].length;
}

export function buildItemRows(
  topology: TopologySnapshot | null,
  category: Category,
  filter: string,
  values: Map<string, HalValue>,
  unavailableValues: Set<string>,
): Row[] {
  if (!topology) return [];
  const rows: Row[] = [];
  if (category === "components")
    rows.push(
      ...topology.components.map((item) => ({
        id: `component:${item.id}`,
        name: item.name,
        kind: "components" as const,
        subtitle: `${item.kind} · ${item.ready ? "ready" : "not ready"}`,
      })),
    );
  if (category === "pins")
    rows.push(
      ...topology.pins.map((item) => ({
        id: `pin:${item.name}`,
        name: item.name,
        kind: "pins" as const,
        ref: { kind: "pin" as const, name: item.name },
        value: unavailableValues.has(`pin:${item.name}`)
          ? undefined
          : (values.get(`pin:${item.name}`) ?? item.value),
        type: item.type,
        writable: item.direction !== "out" && !item.signalName,
        subtitle: `${item.direction}${item.signalName ? ` · ${item.signalName}` : ""}`,
      })),
    );
  if (category === "params")
    rows.push(
      ...topology.params.map((item) => ({
        id: `param:${item.name}`,
        name: item.name,
        kind: "params" as const,
        ref: { kind: "param" as const, name: item.name },
        value: unavailableValues.has(`param:${item.name}`)
          ? undefined
          : (values.get(`param:${item.name}`) ?? item.value),
        type: item.type,
        writable: item.direction === "rw",
        subtitle: item.direction,
      })),
    );
  if (category === "signals")
    rows.push(
      ...topology.signals.map((item) => ({
        id: `signal:${item.name}`,
        name: item.name,
        kind: "signals" as const,
        ref: { kind: "signal" as const, name: item.name },
        value: unavailableValues.has(`signal:${item.name}`)
          ? undefined
          : (values.get(`signal:${item.name}`) ?? item.value),
        type: item.type,
        writable: item.writers === 0,
        subtitle: `${item.writers} writer · ${item.readers} reader`,
      })),
    );
  if (category === "functions")
    rows.push(
      ...topology.functions.map((item) => ({
        id: `function:${item.name}`,
        name: item.name,
        kind: "functions" as const,
        subtitle: `${item.ownerName} · ${item.users} user`,
      })),
    );
  if (category === "threads")
    rows.push(
      ...topology.threads.map((item) => ({
        id: `thread:${item.name}`,
        name: item.name,
        kind: "threads" as const,
        subtitle: `${(item.periodNs / 1e6).toFixed(3)} ms · ${item.functions.length} functions`,
      })),
    );
  const query = filter.trim().toLocaleLowerCase();
  return (
    query
      ? rows.filter((row) => row.name.toLocaleLowerCase().includes(query))
      : rows
  ).sort((a, b) => a.name.localeCompare(b.name));
}

export function rowForRef(
  ref: HalItemRef,
  topology: TopologySnapshot | null,
  values: Map<string, HalValue>,
  unavailableValues: Set<string>,
): Row {
  const kind = ref.kind === "param" ? "params" : (`${ref.kind}s` as Category);
  const unavailable = (): Row => ({
    id: halItemKey(ref),
    name: ref.name,
    kind,
    ref,
    subtitle: t("inspector.unavailable"),
  });
  if (!topology) return unavailable();
  const meta =
    ref.kind === "pin"
      ? topology.pins.find((item) => item.name === ref.name)
      : ref.kind === "param"
        ? topology.params.find((item) => item.name === ref.name)
        : topology.signals.find((item) => item.name === ref.name);
  if (!meta) return unavailable();
  const writable =
    ref.kind === "param"
      ? "direction" in meta && meta.direction === "rw"
      : ref.kind === "pin"
        ? "direction" in meta &&
          meta.direction !== "out" &&
          !("signalName" in meta && meta.signalName)
        : "writers" in meta && meta.writers === 0;
  return {
    id: halItemKey(ref),
    name: ref.name,
    kind,
    ref,
    type: meta.type,
    value: unavailableValues.has(halItemKey(ref))
      ? undefined
      : (values.get(halItemKey(ref)) ?? meta.value),
    writable,
  };
}
