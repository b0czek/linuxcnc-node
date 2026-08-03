import type { ScopeCapture, ScopeStatus } from "@linuxcnc-node/types";
import {
  createEffect,
  createMemo,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
  type Component,
  untrack,
} from "solid-js";
import {
  clearCanvas,
  createWebGL2Context,
  handleCanvasResize,
  type LineConfig,
  UnifiedLinePlot,
} from "webgl-plot";
import { t } from "./i18n";
import type { ScopeChannelDisplay } from "./models";
import type { ScopeRunMode } from "../../shared/protocol";

const CHANNEL_COLORS = [
  "#62a8ff",
  "#ffbe55",
  "#66d19e",
  "#df7cff",
  "#ff6b6b",
  "#67d8e8",
  "#f38ba8",
  "#a6e3a1",
] as const;

const CHANNEL_RGBA: Array<[number, number, number, number]> = [
  [0.384, 0.659, 1, 1],
  [1, 0.745, 0.333, 1],
  [0.4, 0.82, 0.62, 1],
  [0.875, 0.486, 1, 1],
  [1, 0.42, 0.42, 1],
  [0.404, 0.847, 0.91, 1],
  [0.953, 0.545, 0.659, 1],
  [0.651, 0.89, 0.631, 1],
];

type DragState =
  | { kind: "cursor"; cursor: 0 | 1 }
  | { kind: "trigger" }
  | { kind: "zero"; channel: number }
  | { kind: "pan"; x: number; start: number; end: number }
  | null;

export interface ScopePlotProps {
  capture: ScopeCapture | null;
  runMode: ScopeRunMode;
  names: Array<string | null>;
  types: Array<string | null>;
  displays: ScopeChannelDisplay[];
  activeChannel: number;
  triggerChannel: number;
  triggerLevel: number;
  status: ScopeStatus | null;
  skippedCaptures: number;
  onActiveChannelChange: (index: number) => void;
  onDisplayChange: (index: number, display: ScopeChannelDisplay) => void;
  onTriggerLevelCommit: (value: number) => void;
  onRemoveChannel: (index: number) => void;
}

function formatEngineering(value: number, unit = ""): string {
  if (!Number.isFinite(value)) return "—";
  if (value === 0) return `0${unit}`;
  const prefixes: Record<number, string> = {
    [-12]: "p",
    [-9]: "n",
    [-6]: "µ",
    [-3]: "m",
    0: "",
    3: "k",
    6: "M",
    9: "G",
    12: "T",
  };
  const exponent = Math.max(
    -12,
    Math.min(12, Math.floor(Math.log10(Math.abs(value)) / 3) * 3)
  );
  const scaled = value / 10 ** exponent;
  return `${Number(scaled.toPrecision(4))}${prefixes[exponent]}${unit}`;
}

function step125(value: number, direction: -1 | 1): number {
  const safe = Math.max(1e-12, Math.min(1e12, value || 1));
  const exponent = Math.floor(Math.log10(safe));
  const candidates = [-1, 0, 1].flatMap((shift) =>
    [1, 2, 5].map((factor) => factor * 10 ** (exponent + shift))
  );
  const sorted = [...new Set(candidates)].sort((a, b) => a - b);
  const next =
    direction > 0
      ? sorted.find((candidate) => candidate > safe * 1.000001)
      : sorted.reverse().find((candidate) => candidate < safe * 0.999999);
  return Math.max(1e-12, Math.min(1e12, next ?? safe));
}

function offsetStep(unitsPerDivision: number): number {
  return Number((Math.max(1e-12, Math.abs(unitsPerDivision)) / 100).toPrecision(6));
}

function roundOffset(value: number, unitsPerDivision: number): number {
  if (!Number.isFinite(value)) return 0;
  const step = offsetStep(unitsPerDivision);
  return Number((Math.round(value / step) * step).toPrecision(6));
}

function analogPoints(values: Float64Array): Float32Array {
  const points = new Float32Array(values.length * 2);
  const denominator = Math.max(1, values.length - 1);
  for (let index = 0; index < values.length; index++) {
    points[index * 2] = (index / denominator) * 2 - 1;
    points[index * 2 + 1] = values[index];
  }
  return points;
}

function digitalPoints(values: Float64Array): Float32Array {
  if (!values.length) return new Float32Array();
  const points: number[] = [-1, values[0] ? 1 : 0];
  const denominator = Math.max(1, values.length - 1);
  let previous = values[0] ? 1 : 0;
  for (let index = 1; index < values.length; index++) {
    const x = (index / denominator) * 2 - 1;
    const next = values[index] ? 1 : 0;
    if (next !== previous) points.push(x, previous);
    points.push(x, next);
    previous = next;
  }
  return new Float32Array(points);
}

export const ScopePlot: Component<ScopePlotProps> = (props) => {
  let canvas!: HTMLCanvasElement;
  let viewport!: HTMLDivElement;
  let observer: ResizeObserver | undefined;
  let gl: WebGL2RenderingContext | undefined;
  let plotter: UnifiedLinePlot | undefined;
  let renderedChannels: Array<{ index: number; type: string | null }> = [];
  let frame = 0;
  let initializedViewport = false;
  let previousRunMode = props.runMode;
  let rollSampleCount = 0;
  let drag: DragState = null;
  const pointers = new Map<number, { x: number; y: number }>();
  let pinch:
    | { distance: number; start: number; end: number; centerRatio: number }
    | undefined;

  const [viewStart, setViewStart] = createSignal(0);
  const [viewEnd, setViewEnd] = createSignal(1);
  const [cursorA, setCursorA] = createSignal(0);
  const [cursorB, setCursorB] = createSignal(0);
  const [draftTriggerLevel, setDraftTriggerLevel] = createSignal(
    props.triggerLevel
  );
  const [webglError, setWebglError] = createSignal("");

  const activeChannels = createMemo(() =>
    props.names
      .map((name, index) => ({
        index,
        name,
        type: props.types[index],
      }))
      .filter((channel) => channel.name)
  );
  const digitalChannels = createMemo(() =>
    activeChannels().filter((channel) => channel.type === "bit")
  );
  const analogChannels = createMemo(() =>
    activeChannels().filter((channel) => channel.type !== "bit")
  );
  const digitalShare = createMemo(() => {
    if (!digitalChannels().length) return 0;
    if (!analogChannels().length) return 1;
    return Math.min(0.44, Math.max(0.18, digitalChannels().length * 0.055));
  });

  const captureBounds = () => {
    const capture = props.capture;
    if (!capture || capture.samples < 1) return { start: 0, end: 1 };
    return {
      start: (-capture.triggerIndex * capture.samplePeriodNs) / 1e9,
      end:
        ((capture.samples - 1 - capture.triggerIndex) *
          capture.samplePeriodNs) /
        1e9,
    };
  };

  const scheduleDraw = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      if (!gl || !plotter || gl.isContextLost()) return;
      clearCanvas(gl, [0, 0, 0, 0]);
      plotter.draw();
    });
  };

  const applyViewportTransform = () => {
    const bounds = captureBounds();
    const fullSpan = bounds.end - bounds.start || 1;
    const startFraction = (viewStart() - bounds.start) / fullSpan;
    const endFraction = (viewEnd() - bounds.start) / fullSpan;
    const fractionSpan = Math.max(1e-12, endFraction - startFraction);
    plotter?.setGlobalTransform(
      [1 / fractionSpan, 1],
      [(1 - startFraction - endFraction) / fractionSpan, 0]
    );
    scheduleDraw();
  };

  const setViewport = (requestedStart: number, requestedEnd: number) => {
    const bounds = captureBounds();
    const fullSpan = Math.max(Number.EPSILON, bounds.end - bounds.start);
    const minimumSpan = Math.min(
      fullSpan,
      Math.max(
        Number.EPSILON,
        ((props.capture?.samplePeriodNs ?? 1) * 10) / 1e9
      )
    );
    let span = Math.max(minimumSpan, Math.min(fullSpan, requestedEnd - requestedStart));
    let start = requestedStart;
    if (start < bounds.start) start = bounds.start;
    if (start + span > bounds.end) start = bounds.end - span;
    const end = start + span;
    setViewStart(start);
    setViewEnd(end);
    setCursorA((value) => Math.max(start, Math.min(end, value)));
    setCursorB((value) => Math.max(start, Math.min(end, value)));
  };

  const fitViewport = () => {
    const bounds = captureBounds();
    setViewport(bounds.start, bounds.end);
  };

  const resize = () => {
    if (!gl) return;
    handleCanvasResize(canvas, gl, window.devicePixelRatio || 1);
    scheduleDraw();
  };

  const initializeWebgl = () => {
    try {
      plotter?.cleanup();
      gl = createWebGL2Context(canvas, {
        transparent: true,
        antialias: true,
        preserveDrawing: false,
        powerPerformance: "high-performance",
      });
      plotter = new UnifiedLinePlot(gl, 16);
      setWebglError("");
      resize();
      queueMicrotask(uploadCapture);
    } catch (error) {
      plotter = undefined;
      gl = undefined;
      setWebglError(error instanceof Error ? error.message : String(error));
    }
  };

  const uploadCapture = () => {
    if (!plotter) return;
    const capture = props.capture;
    if (!capture) {
      renderedChannels = [];
      plotter.initLines([]);
      scheduleDraw();
      return;
    }
    const digital = digitalChannels();
    const digitalByIndex = new Map(
      digital.map((channel, index) => [channel.index, index])
    );
    const share = digitalShare();
    const analogCenter = share;
    const configs: LineConfig[] = [];
    renderedChannels = [];
    for (const channel of activeChannels()) {
      const values = capture.channels[channel.index];
      if (!values?.length) continue;
      renderedChannels.push({ index: channel.index, type: channel.type });
      if (channel.type === "bit") {
        const lane = digitalByIndex.get(channel.index) ?? 0;
        const laneHeight = (2 * share) / Math.max(1, digital.length);
        const center = 1 - 2 * (1 - share) - (lane + 0.5) * laneHeight;
        const scaleY = laneHeight * 0.55;
        configs.push({
          points: digitalPoints(values),
          color: CHANNEL_RGBA[channel.index % CHANNEL_RGBA.length],
          scale: [1, scaleY],
          offset: [0, center - scaleY / 2],
        });
      } else {
        const display = props.displays[channel.index] ?? {
          unitsPerDivision: 1,
          offset: 0,
        };
        const scaleY =
          (1 - share) / (4 * Math.max(1e-12, display.unitsPerDivision));
        configs.push({
          points: analogPoints(values),
          color: CHANNEL_RGBA[channel.index % CHANNEL_RGBA.length],
          scale: [1, scaleY],
          offset: [0, analogCenter - display.offset * scaleY],
        });
      }
    }
    plotter.initLines(configs);
    applyViewportTransform();
  };

  const applyLineTransforms = () => {
    if (!plotter) return;
    const digital = digitalChannels();
    const share = digitalShare();
    renderedChannels.forEach((channel, lineId) => {
      if (channel.type === "bit") {
        const lane = digital.findIndex((item) => item.index === channel.index);
        const laneHeight = (2 * share) / Math.max(1, digital.length);
        const center = 1 - 2 * (1 - share) - (lane + 0.5) * laneHeight;
        const scaleY = laneHeight * 0.55;
        plotter?.updateLineTransform(
          lineId,
          [1, scaleY],
          [0, center - scaleY / 2]
        );
      } else {
        const display = props.displays[channel.index] ?? {
          unitsPerDivision: 1,
          offset: 0,
        };
        const scaleY =
          (1 - share) / (4 * Math.max(1e-12, display.unitsPerDivision));
        plotter?.updateLineTransform(
          lineId,
          [1, scaleY],
          [0, share - display.offset * scaleY]
        );
      }
    });
    scheduleDraw();
  };

  const positionToTime = (clientX: number) => {
    const rect = viewport.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return viewStart() + ratio * (viewEnd() - viewStart());
  };

  const timePercent = (time: number) =>
    ((time - viewStart()) / Math.max(Number.EPSILON, viewEnd() - viewStart())) *
    100;

  const markerTopForValue = (channelIndex: number, value: number) => {
    const display = props.displays[channelIndex] ?? {
      unitsPerDivision: 1,
      offset: 0,
    };
    const analogHeight = 1 - digitalShare();
    const normalized = (value - display.offset) / (display.unitsPerDivision * 8);
    return (0.5 - normalized) * analogHeight * 100;
  };

  const valueAtPointerY = (channelIndex: number, clientY: number) => {
    const rect = viewport.getBoundingClientRect();
    const analogHeight = rect.height * (1 - digitalShare());
    const ratio = Math.max(0, Math.min(1, (clientY - rect.top) / analogHeight));
    const display = props.displays[channelIndex] ?? {
      unitsPerDivision: 1,
      offset: 0,
    };
    return display.offset + (0.5 - ratio) * display.unitsPerDivision * 8;
  };

  const beginMarkerDrag = (
    event: PointerEvent,
    nextDrag: Exclude<DragState, null>
  ) => {
    event.preventDefault();
    event.stopPropagation();
    viewport.setPointerCapture(event.pointerId);
    drag = nextDrag;
  };

  const handlePointerDown = (event: PointerEvent) => {
    if (event.button !== 0 || (drag && drag.kind !== "pan")) return;
    viewport.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size >= 2) {
      drag = null;
      pinch = undefined;
      return;
    }
    drag = {
      kind: "pan",
      x: event.clientX,
      start: viewStart(),
      end: viewEnd(),
    };
  };

  const handlePointerMove = (event: PointerEvent) => {
    if (pointers.has(event.pointerId))
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size >= 2) {
      const [first, second] = [...pointers.values()];
      const distance = Math.max(1, Math.abs(second.x - first.x));
      const rect = viewport.getBoundingClientRect();
      const centerRatio =
        (Math.min(first.x, second.x) + distance / 2 - rect.left) / rect.width;
      if (!pinch)
        pinch = {
          distance,
          start: viewStart(),
          end: viewEnd(),
          centerRatio,
        };
      else {
        const span = (pinch.end - pinch.start) * (pinch.distance / distance);
        const center =
          pinch.start + pinch.centerRatio * (pinch.end - pinch.start);
        setViewport(
          center - Math.max(0, Math.min(1, centerRatio)) * span,
          center + (1 - Math.max(0, Math.min(1, centerRatio))) * span
        );
      }
      return;
    }
    if (!drag) return;
    if (drag.kind === "cursor") {
      const value = positionToTime(event.clientX);
      if (drag.cursor === 0) setCursorA(value);
      else setCursorB(value);
    } else if (drag.kind === "trigger") {
      setDraftTriggerLevel(
        valueAtPointerY(props.triggerChannel, event.clientY)
      );
    } else if (drag.kind === "zero") {
      const display = props.displays[drag.channel];
      if (!display) return;
      const rect = viewport.getBoundingClientRect();
      const analogHeight = rect.height * (1 - digitalShare());
      const ratio = Math.max(
        0,
        Math.min(1, (event.clientY - rect.top) / analogHeight)
      );
      props.onDisplayChange(drag.channel, {
        ...display,
        offset: roundOffset(
          (ratio - 0.5) * display.unitsPerDivision * 8,
          display.unitsPerDivision
        ),
      });
    } else if (drag.kind === "pan") {
      const rect = viewport.getBoundingClientRect();
      const secondsPerPixel = (drag.end - drag.start) / rect.width;
      const shift = (drag.x - event.clientX) * secondsPerPixel;
      setViewport(drag.start + shift, drag.end + shift);
    }
  };

  const handlePointerUp = (event: PointerEvent) => {
    pointers.delete(event.pointerId);
    if (pointers.size < 2) pinch = undefined;
    if (drag?.kind === "trigger")
      props.onTriggerLevelCommit(draftTriggerLevel());
    drag = null;
  };

  const handleWheel = (event: WheelEvent) => {
    event.preventDefault();
    const center = positionToTime(event.clientX);
    const ratio =
      (center - viewStart()) / Math.max(Number.EPSILON, viewEnd() - viewStart());
    const factor = event.deltaY < 0 ? 0.82 : 1.22;
    const span = (viewEnd() - viewStart()) * factor;
    setViewport(center - ratio * span, center + (1 - ratio) * span);
  };

  const sampleValue = (time: number) => {
    const capture = props.capture;
    const values = capture?.channels[props.activeChannel];
    if (!capture || !values?.length) return null;
    const index = Math.max(
      0,
      Math.min(
        values.length - 1,
        Math.round(time / (capture.samplePeriodNs / 1e9) + capture.triggerIndex)
      )
    );
    return values[index];
  };

  const handleContextLost = (event: Event) => {
    event.preventDefault();
    setWebglError(t("inspector.webglLost"));
  };
  const handleContextRestored = () => initializeWebgl();

  onMount(() => {
    initializeWebgl();
    observer = new ResizeObserver(resize);
    observer.observe(viewport);
    canvas.addEventListener("webglcontextlost", handleContextLost);
    canvas.addEventListener("webglcontextrestored", handleContextRestored);
  });

  createEffect(() => setDraftTriggerLevel(props.triggerLevel));

  createEffect(() => {
    const mode = props.runMode;
    if (mode === previousRunMode) return;
    previousRunMode = mode;
    initializedViewport = false;
    rollSampleCount = 0;
  });

  createEffect(() => {
    const capture = props.capture;
    if (!capture) return;
    const bounds = captureBounds();
    if (!initializedViewport) {
      initializedViewport = true;
      setViewStart(bounds.start);
      setViewEnd(bounds.end);
      setCursorA(bounds.start + (bounds.end - bounds.start) * 0.35);
      setCursorB(bounds.start + (bounds.end - bounds.start) * 0.65);
    } else if (props.runMode === "roll" && capture.samples > rollSampleCount) {
      setViewport(bounds.start, bounds.end);
    } else setViewport(viewStart(), viewEnd());
    if (props.runMode === "roll") rollSampleCount = capture.samples;
  });

  createEffect(() => {
    props.capture;
    props.names.join("\u0000");
    props.types.join("\u0000");
    digitalShare();
    untrack(uploadCapture);
  });

  createEffect(() => {
    props.displays.forEach((display) => {
      display.unitsPerDivision;
      display.offset;
    });
    untrack(applyLineTransforms);
  });

  createEffect(() => {
    viewStart();
    viewEnd();
    applyViewportTransform();
  });

  onCleanup(() => {
    cancelAnimationFrame(frame);
    observer?.disconnect();
    canvas.removeEventListener("webglcontextlost", handleContextLost);
    canvas.removeEventListener("webglcontextrestored", handleContextRestored);
    plotter?.cleanup();
  });

  const analogHeightPercent = () => (1 - digitalShare()) * 100;
  const triggerVisible = () =>
    props.runMode !== "roll" &&
    props.types[props.triggerChannel] !== "bit" &&
    Boolean(props.names[props.triggerChannel]);
  const cursorDelta = () => Math.abs(cursorB() - cursorA());
  const activeDelta = () => {
    if (props.types[props.activeChannel] === "bit") return null;
    const a = sampleValue(cursorA());
    const b = sampleValue(cursorB());
    return a == null || b == null ? null : Math.abs(b - a);
  };
  const statusLabel = () => {
    if (props.runMode === "roll") return t("inspector.roll");
    switch (props.status?.state) {
      case "init":
        return t("inspector.initializing");
      case "pre-trigger":
        return t("inspector.preTriggerState");
      case "trigger-wait":
        return t("inspector.waitingTrigger");
      case "post-trigger":
        return t("inspector.postTriggerState");
      case "done":
        return t("inspector.complete");
      case "reset":
        return t("inspector.resetting");
      case "invalid":
        return t("inspector.invalidState");
      default:
        return t("inspector.idle");
    }
  };

  return (
    <div class="scope-instrument">
      <aside class="scope-channel-rail eden-scrollbar">
        <div class="scope-rail-heading">
          <span>{t("inspector.channels")}</span>
          <small>{activeChannels().length}/16</small>
        </div>
        <For each={activeChannels()}>
          {(channel) => {
            const display = () =>
              props.displays[channel.index] ?? {
                unitsPerDivision: 1,
                offset: 0,
              };
            return (
              <section
                class={`scope-channel-card ${
                  props.activeChannel === channel.index ? "active" : ""
                }`}
                style={{
                  "--channel-color":
                    CHANNEL_COLORS[channel.index % CHANNEL_COLORS.length],
                }}
                onClick={() => props.onActiveChannelChange(channel.index)}
              >
                <div class="scope-channel-title">
                  <strong>CH {channel.index + 1}</strong>
                  <span title={channel.name ?? ""}>{channel.name}</span>
                  <button
                    type="button"
                    aria-label={t("inspector.removeChannel")}
                    onClick={(event) => {
                      event.stopPropagation();
                      props.onRemoveChannel(channel.index);
                    }}
                  >
                    ×
                  </button>
                </div>
                <Show
                  when={channel.type !== "bit"}
                  fallback={
                    <div class="scope-logic-label">
                      {t("inspector.logic")}
                    </div>
                  }
                >
                  <div class="scope-channel-control">
                    <span>{t("inspector.scale")}</span>
                    <div>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          props.onDisplayChange(channel.index, {
                            ...display(),
                            unitsPerDivision: step125(
                              display().unitsPerDivision,
                              -1
                            ),
                          });
                        }}
                      >
                        −
                      </button>
                      <output>
                        {formatEngineering(display().unitsPerDivision)}/div
                      </output>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          props.onDisplayChange(channel.index, {
                            ...display(),
                            unitsPerDivision: step125(
                              display().unitsPerDivision,
                              1
                            ),
                          });
                        }}
                      >
                        +
                      </button>
                    </div>
                  </div>
                  <label class="scope-offset-control">
                    <span>{t("inspector.offset")}</span>
                    <input
                      type="number"
                      step={offsetStep(display().unitsPerDivision)}
                      value={roundOffset(
                        display().offset,
                        display().unitsPerDivision
                      )}
                      onClick={(event) => event.stopPropagation()}
                      onChange={(event) =>
                        props.onDisplayChange(channel.index, {
                          ...display(),
                          offset: roundOffset(
                            event.currentTarget.valueAsNumber,
                            display().unitsPerDivision
                          ),
                        })
                      }
                    />
                  </label>
                </Show>
              </section>
            );
          }}
        </For>
      </aside>

      <div
        ref={viewport}
        class="scope-viewport"
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onDblClick={fitViewport}
      >
        <svg class="scope-graticule" aria-hidden="true">
          <For each={Array.from({ length: 51 }, (_, index) => index)}>
            {(index) => (
              <line
                class={index % 5 === 0 ? "major" : "minor"}
                x1={`${index * 2}%`}
                x2={`${index * 2}%`}
                y1="0"
                y2="100%"
              />
            )}
          </For>
          <Show when={analogChannels().length > 0}>
            <For each={Array.from({ length: 41 }, (_, index) => index)}>
              {(index) => (
                <line
                  class={index % 5 === 0 ? "major" : "minor"}
                  x1="0"
                  x2="100%"
                  y1={`${(index / 40) * analogHeightPercent()}%`}
                  y2={`${(index / 40) * analogHeightPercent()}%`}
                />
              )}
            </For>
          </Show>
          <For each={digitalChannels()}>
            {(_channel, index) => (
              <line
                class="digital-separator"
                x1="0"
                x2="100%"
                y1={`${
                  analogHeightPercent() +
                  (index() / Math.max(1, digitalChannels().length)) *
                    digitalShare() *
                    100
                }%`}
                y2={`${
                  analogHeightPercent() +
                  (index() / Math.max(1, digitalChannels().length)) *
                    digitalShare() *
                    100
                }%`}
              />
            )}
          </For>
        </svg>
        <canvas
          ref={canvas}
          class="scope-webgl-canvas"
          aria-label={t("inspector.scopeWaveform")}
        />

        <div class="scope-status-strip">
          <strong
            data-state={
              props.runMode === "roll"
                ? "roll"
                : props.status?.state ?? "idle"
            }
          >
            {statusLabel().toUpperCase()}
          </strong>
          <span>
            {formatEngineering(viewEnd() - viewStart(), "s")} {t("inspector.span")}
          </span>
          <span>
            {formatEngineering((viewEnd() - viewStart()) / 10, "s")}/div
          </span>
          <span>
            {props.capture
              ? `${formatEngineering(
                  1e9 / props.capture.samplePeriodNs,
                  "Sa/s"
                )} · ${props.capture.samples} ${t("inspector.points")}`
              : "—"}
          </span>
          <Show when={props.skippedCaptures > 0}>
            <span class="scope-dropped">
              {t("inspector.skipped")} {props.skippedCaptures}
            </span>
          </Show>
        </div>

        <div class="scope-axis-labels" aria-hidden="true">
          <For each={Array.from({ length: 6 }, (_, index) => index)}>
            {(index) => {
              const ratio = index / 5;
              return (
                <span style={{ left: `${ratio * 100}%` }}>
                  {formatEngineering(
                    viewStart() + ratio * (viewEnd() - viewStart()),
                    "s"
                  )}
                </span>
              );
            }}
          </For>
        </div>

        <Show
          when={
            props.runMode !== "roll" &&
            timePercent(0) >= 0 &&
            timePercent(0) <= 100
          }
        >
          <div
            class="scope-trigger-time"
            style={{ left: `${timePercent(0)}%` }}
            aria-label={t("inspector.triggerPosition")}
          >
            T
          </div>
        </Show>

        <Show when={triggerVisible()}>
          <button
            type="button"
            class="scope-trigger-level"
            style={{
              top: `${markerTopForValue(
                props.triggerChannel,
                draftTriggerLevel()
              )}%`,
              "--channel-color":
                CHANNEL_COLORS[
                  props.triggerChannel % CHANNEL_COLORS.length
                ],
            }}
            onPointerDown={(event) => beginMarkerDrag(event, { kind: "trigger" })}
          >
            <span>T</span>
          </button>
        </Show>

        <For each={analogChannels()}>
          {(channel) => (
            <button
              type="button"
              class="scope-zero-marker"
              classList={{ active: props.activeChannel === channel.index }}
              style={{
                top: `${markerTopForValue(channel.index, 0)}%`,
                "--channel-color":
                  CHANNEL_COLORS[channel.index % CHANNEL_COLORS.length],
              }}
              onPointerDown={(event) =>
                beginMarkerDrag(event, {
                  kind: "zero",
                  channel: channel.index,
                })
              }
              aria-label={`${channel.name} ${t("inspector.zeroPosition")}`}
            >
              {channel.index + 1}
            </button>
          )}
        </For>

        <For each={[cursorA, cursorB] as const}>
          {(cursor, index) => (
            <Show when={timePercent(cursor()) >= 0 && timePercent(cursor()) <= 100}>
              <button
                type="button"
                class={`scope-measure-cursor cursor-${index()}`}
                style={{ left: `${timePercent(cursor())}%` }}
                data-letter={index() === 0 ? "A" : "B"}
                aria-label={`${t("inspector.measurementCursor")} ${
                  index() === 0 ? "A" : "B"
                }`}
                onPointerDown={(event) =>
                  beginMarkerDrag(event, {
                    kind: "cursor",
                    cursor: index() as 0 | 1,
                  })
                }
              />
            </Show>
          )}
        </For>

        <output class="scope-cursor-readout">
          <span>A {formatEngineering(cursorA(), "s")}</span>
          <span>B {formatEngineering(cursorB(), "s")}</span>
          <span>Δt {formatEngineering(cursorDelta(), "s")}</span>
          <span>
            1/Δt {cursorDelta() ? formatEngineering(1 / cursorDelta(), "Hz") : "∞"}
          </span>
          <Show when={activeDelta() != null}>
            <span>Δvalue {formatEngineering(activeDelta()!)}</span>
          </Show>
        </output>

        <Show when={webglError()}>
          <div class="scope-webgl-error" role="alert">
            <strong>{t("inspector.webglUnavailable")}</strong>
            <span>{webglError()}</span>
            <button
              type="button"
              class="eden-btn eden-btn-sm eden-btn-outline"
              onClick={initializeWebgl}
            >
              {t("inspector.retry")}
            </button>
          </div>
        </Show>
      </div>
    </div>
  );
};
