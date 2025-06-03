// src/ts/errorChannel.ts
import { NapiErrorChannelInstance } from "./native_type_interfaces";
import { LinuxCNCError, ErrorCallback } from "./types";

export const DEFAULT_ERROR_POLL_INTERVAL = 250; // ms

export interface ErrorWatcherOptions {
  pollInterval?: number;
}

export class ErrorChannel {
  private nativeInstance: NapiErrorChannelInstance;
  private pollInterval: number;
  private poller: NodeJS.Timeout | null = null;
  private isPolling: boolean = false;
  private errorCallbacks: Set<ErrorCallback> = new Set();

  constructor(
    nativeInstance: NapiErrorChannelInstance,
    options?: ErrorWatcherOptions
  ) {
    this.nativeInstance = nativeInstance;
    this.pollInterval = options?.pollInterval ?? DEFAULT_ERROR_POLL_INTERVAL;
    this.startPolling();
  }

  private startPolling(): void {
    if (this.poller || !this.nativeInstance) return;
    this.poller = setInterval(() => this.performPoll(), this.pollInterval);
  }

  private stopPolling(): void {
    if (this.poller) {
      clearInterval(this.poller);
      this.poller = null;
    }
  }

  private async performPoll(): Promise<void> {
    if (this.isPolling) return;
    this.isPolling = true;

    try {
      const error = this.nativeInstance.poll(); // Returns LinuxCNCError | null
      if (error) {
        this.errorCallbacks.forEach((cb) => {
          try {
            cb(error);
          } catch (e) {
            console.error("Error in ErrorChannel callback:", e);
          }
        });
      }
    } catch (e) {
      console.error("Error during ErrorChannel poll:", e);
    } finally {
      this.isPolling = false;
    }
  }

  /**
   * Adds a callback to be invoked when a new error/message is received.
   * @param callback The function to call.
   */
  onError(callback: ErrorCallback): void {
    this.errorCallbacks.add(callback);
  }

  /**
   * Removes an error callback.
   * @param callback The callback function to remove.
   */
  removeErrorCallback(callback: ErrorCallback): void {
    this.errorCallbacks.delete(callback);
  }

  /**
   * Sets the polling interval for error checks.
   * @param interval The new interval in milliseconds.
   */
  setPollInterval(interval: number): void {
    this.pollInterval = Math.max(50, interval); // Ensure a minimum interval
    this.stopPolling();
    this.startPolling();
  }

  /**
   * Gets the current polling interval.
   * @returns The interval in milliseconds.
   */
  getPollInterval(): number {
    return this.pollInterval;
  }

  /**
   * Cleans up resources, stopping the polling timer.
   */
  destroy(): void {
    this.stopPolling();
    this.errorCallbacks.clear();
  }
}
