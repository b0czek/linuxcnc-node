import type { HalValue } from "@linuxcnc-node/types";
import type { Row, TreeRow } from "./models";

export const TYPE_COLORS: Record<string, string> = {
  bit: "#55d48a",
  float: "#f2b94b",
  s32: "#61a9ff",
  u32: "#51d4ef",
  s64: "#9f7dff",
  u64: "#e178ff",
  port: "#9aa6ac",
  default: "#c2d0d6",
};

const MAX_INLINE_VALUE_CHARS = 14;

export function formatInlineValue(value: HalValue | undefined): string {
  if (value === undefined) return "—";
  const plain = String(value);
  if (typeof value !== "number" || plain.length <= MAX_INLINE_VALUE_CHARS)
    return plain;
  const magnitude = Math.abs(value);
  if (magnitude >= 1e14 || (magnitude > 0 && magnitude < 1e-6))
    return value
      .toExponential(6)
      .replace(/(\.\d*?[1-9])0+e/, "$1e")
      .replace(/\.0+e/, "e");
  const integerChars =
    Math.trunc(magnitude).toString().length + (value < 0 ? 1 : 0);
  const decimalPlaces = Math.max(
    0,
    MAX_INLINE_VALUE_CHARS - integerChars - 1,
  );
  return value.toFixed(decimalPlaces).replace(/\.?0+$/, "");
}

type NameNode = {
  segment: string;
  path: string;
  children: Map<string, NameNode>;
  rows: Row[];
};

export function buildTreeRows(
  rows: Row[],
  namespace: string,
  expanded: Set<string>,
  forceExpanded: boolean,
): TreeRow[] {
  const root: NameNode = { segment: "", path: "", children: new Map(), rows: [] };
  for (const row of rows) {
    const parts = row.name.split(".").filter(Boolean);
    if (parts.length === 0) {
      root.rows.push(row);
      continue;
    }
    let node = root;
    for (const segment of parts) {
      const path = node.path ? `${node.path}.${segment}` : segment;
      let child = node.children.get(segment);
      if (!child) {
        child = { segment, path, children: new Map(), rows: [] };
        node.children.set(segment, child);
      }
      node = child;
    }
    node.rows.push(row);
  }

  const countRows = (node: NameNode): number =>
    node.rows.length +
    [...node.children.values()].reduce(
      (total, child) => total + countRows(child),
      0,
    );
  const result: TreeRow[] = [];
  const append = (node: NameNode, depth: number) => {
    const children = [...node.children.values()].sort((a, b) =>
      a.segment.localeCompare(b.segment),
    );
    for (const child of children) {
      if (child.children.size > 0) {
        const groupKey = `${namespace}:${child.path}`;
        result.push({
          id: `group:${groupKey}`,
          name: child.path,
          displayName: child.segment,
          kind: rows[0]?.kind ?? "pins",
          depth,
          guideDepth: depth,
          groupKey,
          groupCount: countRows(child),
        });
        if (forceExpanded || expanded.has(groupKey)) {
          for (const row of child.rows)
            result.push({
              ...row,
              displayName: child.segment,
              depth: depth + 1,
              guideDepth: depth + 1,
            });
          append(child, depth + 1);
        }
      } else {
        for (const row of child.rows)
          result.push({
            ...row,
            displayName: child.segment,
            depth,
            guideDepth: depth,
          });
      }
    }
  };

  for (const row of root.rows)
    result.push({ ...row, displayName: row.name, depth: 0, guideDepth: 0 });
  append(root, 0);
  return result;
}
