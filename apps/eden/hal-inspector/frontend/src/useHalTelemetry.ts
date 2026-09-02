import type { PeerConnection } from "@edenapp/types/ipc";
import type { HalItemRef, HalValue } from "@linuxcnc-node/types";
import {
  type HalValueFrame,
  openHalValues,
  type SocketHandle,
} from "@linuxcnc-node/websocket-client";
import {
  type Accessor,
  createEffect,
  createSignal,
  onCleanup,
  type Setter,
} from "solid-js";
import type {
  HalInspectorProtocol,
  HalValueSlot,
  HalValueSubscriptionDescriptor,
  TopologySnapshot,
} from "../../shared/protocol";
import { halItemKey } from "./hal-items";

interface HalTelemetryOptions {
  api: PeerConnection<HalInspectorProtocol>;
  topology: Accessor<TopologySnapshot | null>;
  refs: Accessor<HalItemRef[]>;
  intervalMs: Accessor<number>;
  pageVisible: Accessor<boolean>;
  setValues: Setter<Map<string, HalValue>>;
  setUnavailableValues: Setter<Set<string>>;
  onUpdates: (updates: Array<{ ref: HalItemRef; value?: HalValue }>) => void;
  onError: (message: string) => void;
}

export function useHalTelemetry(options: HalTelemetryOptions): void {
  const [retry, setRetry] = createSignal(0);
  let disposed = false;
  let socket: SocketHandle | null = null;
  let socketGeneration = 0;
  let subscriptionRequest = 0;
  let activeRevision = 0;
  let activeSlots = new Map<number, HalValueSlot>();
  const slotMaps = new Map<number, Map<number, HalValueSlot>>();
  const pendingFrames = new Map<number, HalValueFrame[]>();
  let retryMs = 250;

  const applyFrame = (frame: HalValueFrame): void => {
    const revision = Number(frame.revision);
    if (!Number.isSafeInteger(revision))
      throw new Error("HAL telemetry revision exceeds the safe UI range");
    const slots = slotMaps.get(revision);
    if (!slots || (frame.kind === "delta" && activeRevision !== revision)) {
      const queued = pendingFrames.get(revision) ?? [];
      queued.push(frame);
      if (queued.length > 32) queued.splice(0, queued.length - 32);
      pendingFrames.set(revision, queued);
      return;
    }
    if (revision < activeRevision) return;
    if (frame.kind === "replacement") {
      if (frame.entries.length !== slots.size)
        throw new Error("HAL telemetry replacement omitted subscription slots");
      activeRevision = revision;
    }
    const updates: Array<{ ref: HalItemRef; value?: HalValue }> = [];
    for (const entry of frame.entries) {
      const slot = slots.get(entry.slot);
      if (!slot)
        throw new Error(`HAL telemetry referenced unknown slot ${entry.slot}`);
      updates.push({ ref: slot.ref, value: entry.value });
    }
    options.setValues((current) => {
      const next = new Map(current);
      if (frame.kind === "replacement")
        for (const slot of activeSlots.values())
          next.delete(halItemKey(slot.ref));
      for (const update of updates) {
        if (update.value === undefined) next.delete(halItemKey(update.ref));
        else next.set(halItemKey(update.ref), update.value);
      }
      return next;
    });
    options.setUnavailableValues((current) => {
      const next = new Set(current);
      if (frame.kind === "replacement")
        for (const slot of activeSlots.values())
          next.delete(halItemKey(slot.ref));
      for (const update of updates) {
        if (update.value === undefined) next.add(halItemKey(update.ref));
        else next.delete(halItemKey(update.ref));
      }
      return next;
    });
    if (frame.kind === "replacement") activeSlots = slots;
    options.onUpdates(updates);
  };

  const registerSubscription = (descriptor: HalValueSubscriptionDescriptor) => {
    const slots = new Map(descriptor.slots.map((slot) => [slot.slot, slot]));
    slotMaps.set(descriptor.revision, slots);
    for (const revision of slotMaps.keys())
      if (revision < descriptor.revision - 1) slotMaps.delete(revision);
    for (const revision of pendingFrames.keys())
      if (revision < descriptor.revision) pendingFrames.delete(revision);
    const queued = pendingFrames.get(descriptor.revision) ?? [];
    pendingFrames.delete(descriptor.revision);
    for (const frame of queued) applyFrame(frame);
    if (!descriptor.websocketUrl) return;
    const generation = ++socketGeneration;
    socket?.close();
    const socketUrl = new URL(descriptor.websocketUrl);
    socket = openHalValues(socketUrl, socketUrl.pathname, {
      onFrame: (frame) => {
        if (generation !== socketGeneration) return;
        try {
          applyFrame(frame);
          retryMs = 250;
        } catch (failure) {
          options.onError(String(failure));
          socket?.close();
        }
      },
      onError: (failure) => options.onError(failure.message),
      onClose: () => {
        if (
          generation !== socketGeneration ||
          disposed ||
          !options.pageVisible()
        )
          return;
        socket = null;
        const delay = retryMs;
        retryMs = Math.min(retryMs * 2, 5000);
        setTimeout(() => {
          if (!disposed && generation === socketGeneration)
            setRetry((value) => value + 1);
        }, delay);
      },
    });
  };

  createEffect(() => {
    options.topology()?.revision;
    retry();
    const refs = options.pageVisible() ? options.refs() : [];
    const request = ++subscriptionRequest;
    void options.api
      .request("subscriptions/set", { refs, intervalMs: options.intervalMs() })
      .then((result) => {
        if (disposed) return;
        if (result.ok && result.value?.websocketUrl)
          registerSubscription(result.value);
        if (request !== subscriptionRequest) return;
        if (!result.ok) options.onError(result.error.message);
        else if (result.value && !result.value.websocketUrl)
          registerSubscription(result.value);
      });
  });

  onCleanup(() => {
    disposed = true;
    socketGeneration++;
    socket?.close();
    socket = null;
  });
}
