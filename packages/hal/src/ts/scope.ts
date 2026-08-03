import type {
  ScopeAcquisitionConfig,
  ScopeCapture,
  ScopeStatus,
} from "@linuxcnc-node/types";
import { halNative } from "./constants";

interface NativeScopeController {
  status(): ScopeStatus;
  configure(config: ScopeAcquisitionConfig): ScopeStatus;
  start(): void;
  stop(): void;
  forceTrigger(): void;
  heartbeat(): number;
  snapshot(): ScopeCapture | null;
  consume(): ScopeCapture | null;
  dispose(): void;
}

/** Exclusive synchronous controller for LinuxCNC's existing scope_rt ABI. */
export class ScopeController {
  readonly #native: NativeScopeController;

  constructor() {
    this.#native = new halNative.ScopeController();
  }

  status(): ScopeStatus { return this.#native.status(); }
  configure(config: ScopeAcquisitionConfig): ScopeStatus { return this.#native.configure(config); }
  start(): void { this.#native.start(); }
  stop(): void { this.#native.stop(); }
  forceTrigger(): void { this.#native.forceTrigger(); }
  heartbeat(): number { return this.#native.heartbeat(); }
  /** Copies the currently valid realtime circular buffer without stopping acquisition. */
  snapshot(): ScopeCapture | null { return this.#native.snapshot(); }
  consume(): ScopeCapture | null { return this.#native.consume(); }
  dispose(): void { this.#native.dispose(); }
}
