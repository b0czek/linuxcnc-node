import {
  HalItemData,
  HalPinData,
  HalParamData,
  HalSignalData,
  FullHalData,
  TreeItem,
} from "../../electron/types";

export function formatDisplayValue(value: any, typeName: string): string {
  if (value === null || value === undefined) return "N/A";
  if (typeName === "HAL_FLOAT") {
    return typeof value === "number" ? value.toFixed(4) : String(value);
  }
  if (typeName === "HAL_BIT") {
    return value ? "TRUE" : "FALSE";
  }
  return String(value);
}

export function formatItemDetails(item: HalItemData): string {
  let details = `Name: ${item.name}\nType: ${
    item.typeName || "N/A"
  }\nValue: ${formatDisplayValue(item.value, item.typeName)}`;
  if ("directionName" in item) {
    // Pin or Param
    details += `\nDirection: ${
      (item as HalPinData).directionName || (item as HalParamData).directionName
    }`;
  }
  if ("signalName" in item && (item as HalPinData).signalName) {
    details += `\nSignal: ${(item as HalPinData).signalName}`;
  }
  if ("writers" in item && (item as HalSignalData).writers !== undefined) {
    // Signal
    details += `\nWriters: ${(item as HalSignalData).writers}`;
  }
  details += `\nWritable: ${item.isWritable ? "Yes" : "No"}`;
  if ("ownerId" in item) {
    details += `\nOwner ID: ${(item as HalPinData | HalParamData).ownerId}`;
  }
  return details;
}

// Helper for TreeView.tsx to build its structure
export const buildTreeStructure = (
  halData: FullHalData | null,
  filterText: string
): TreeItem[] => {
  if (!halData) return [];

  const root: TreeItem[] = [];
  const filter = filterText.toLowerCase().trim();

  const addNode = (
    pathParts: string[],
    parentChildren: TreeItem[],
    itemData: HalItemData,
    itemBaseType: "pin" | "param" | "signal"
  ) => {
    let currentLevel = parentChildren;
    let currentPathId = itemBaseType;

    for (let i = 0; i < pathParts.length; i++) {
      const part = pathParts[i];
      currentPathId += `:${part}`; // Create a unique ID like "pin:compName:pinName"
      let node = currentLevel.find((n) => n.id === currentPathId);

      if (!node) {
        const isLeaf = i === pathParts.length - 1;
        node = {
          id: currentPathId,
          name: part,
          itemType: isLeaf ? itemBaseType : "folder",
          children: [],
          // isExpanded: filter ? true : i < 1, // Auto-expand if filtering or top-level
          fullName: isLeaf ? itemData.name : undefined,
          data: isLeaf ? itemData : undefined,
        };
        currentLevel.push(node);
      }
      currentLevel = node.children;
    }
  };

  const itemMatchesFilter = (
    item: HalItemData,
    pathParts: string[]
  ): boolean => {
    if (!filter) return true;
    if (item.name.toLowerCase().includes(filter)) return true;
    return pathParts.some((part) => part.toLowerCase().includes(filter));
  };

  // PINS
  const pinsRootNode: TreeItem = {
    id: "root:pins",
    name: "Pins",
    itemType: "root",
    children: [],
  };
  halData.pins.forEach((pin) => {
    const pathParts = pin.name.split(".");
    if (itemMatchesFilter(pin, pathParts)) {
      addNode(pathParts, pinsRootNode.children, pin, "pin");
    }
  });
  if (pinsRootNode.children.length > 0 || "pins".includes(filter))
    root.push(pinsRootNode);

  // PARAMETERS
  const paramsRootNode: TreeItem = {
    id: "root:params",
    name: "Parameters",
    itemType: "root",
    children: [],
  };
  halData.params.forEach((param) => {
    const pathParts = param.name.split(".");
    if (itemMatchesFilter(param, pathParts)) {
      addNode(pathParts, paramsRootNode.children, param, "param");
    }
  });
  if (paramsRootNode.children.length > 0 || "parameters".includes(filter))
    root.push(paramsRootNode);

  // SIGNALS
  const signalsRootNode: TreeItem = {
    id: "root:signals",
    name: "Signals",
    itemType: "root",
    children: [],
  };
  halData.signals.forEach((signal) => {
    if (itemMatchesFilter(signal, [signal.name])) {
      signalsRootNode.children.push({
        id: `signal:${signal.name}`,
        name: signal.name,
        fullName: signal.name,
        itemType: "signal",
        children: [],
        data: signal,
      });
    }
  });
  if (signalsRootNode.children.length > 0 || "signals".includes(filter))
    root.push(signalsRootNode);

  return root;
};
