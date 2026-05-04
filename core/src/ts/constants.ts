import { NapiOptions } from "./native_type_interfaces";

// Native addon - loaded immediately on module import
function loadAddon(): NapiOptions {
  const paths = [
    "../build/Release/nml_addon.node",
    "../../build/Release/nml_addon.node", // Fallback for debug builds
  ];
  const errors: string[] = [];

  for (const path of paths) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      return require(path);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${path}: ${message}`);
      // Try next path
    }
  }

  throw new Error(
    `Failed to load linuxcnc-node nml native addon. Please ensure it's built correctly and that LinuxCNC is in your PATH/LD_LIBRARY_PATH.\n${errors.join("\n")}`
  );
}

export const addon: NapiOptions = loadAddon();
