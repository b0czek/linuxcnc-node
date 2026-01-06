import { EventEmitter } from "events";
import { addon } from "./constants";
import { NmlMessageType, LinuxCNCError } from "@linuxcnc-node/types";
import { NapiErrorChannelInstance } from "./native_type_interfaces";

export const DEFAULT_ERROR_POLL_INTERVAL = 100; // ms

export interface ErrorChannelOptions {
  pollInterval?: number;
}

interface ErrorChannelEvents {
  message: [message: LinuxCNCError];
  operatorError: [message: LinuxCNCError];
  operatorText: [message: LinuxCNCError];
  operatorDisplay: [message: LinuxCNCError];
  nmlError: [message: LinuxCNCError];
  nmlText: [message: LinuxCNCError];
  nmlDisplay: [message: LinuxCNCError];
}

export class ErrorChannel extends EventEmitter<ErrorChannelEvents> {
  private nativeInstance: NapiErrorChannelInstance;
  private poller: NodeJS.Timeout | null = null;
  private isPolling = false;

  constructor(options?: ErrorChannelOptions) {
    super();
    this.nativeInstance = new addon.NativeErrorChannel();
    const pollInterval = options?.pollInterval ?? DEFAULT_ERROR_POLL_INTERVAL;
    this.poller = setInterval(() => this.poll(), pollInterval);
  }

  private poll(): void {
    if (this.isPolling) return;
    this.isPolling = true;

    try {
      const error = this.nativeInstance.poll();
      if (error) {
        this.emit("message", error);

        // Emit specific event based on message type
        switch (error.type) {
          case NmlMessageType.EMC_OPERATOR_ERROR:
            this.emit("operatorError", error);
            break;
          case NmlMessageType.EMC_OPERATOR_TEXT:
            this.emit("operatorText", error);
            break;
          case NmlMessageType.EMC_OPERATOR_DISPLAY:
            this.emit("operatorDisplay", error);
            break;
          case NmlMessageType.NML_ERROR:
            this.emit("nmlError", error);
            break;
          case NmlMessageType.NML_TEXT:
            this.emit("nmlText", error);
            break;
          case NmlMessageType.NML_DISPLAY:
            this.emit("nmlDisplay", error);
            break;
        }
      }
    } catch (e) {
      console.error("Error during ErrorChannel poll:", e);
    } finally {
      this.isPolling = false;
    }
  }

  destroy(): void {
    if (this.poller) {
      clearInterval(this.poller);
      this.poller = null;
    }
    this.removeAllListeners();
    this.nativeInstance.disconnect();
  }
}
