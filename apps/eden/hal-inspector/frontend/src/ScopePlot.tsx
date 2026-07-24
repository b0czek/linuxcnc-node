import { createEffect, onCleanup, onMount, type Component } from "solid-js";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
import type { ScopeCapture } from "@linuxcnc-node/types";

const COLORS = [
  "#62a8ff",
  "#ffbe55",
  "#66d19e",
  "#df7cff",
  "#ff6b6b",
  "#67d8e8",
  "#f38ba8",
  "#a6e3a1",
];

function interactionPlugin(): uPlot.Plugin {
  return {
    hooks: {
      ready: [
        (chart) => {
          const over = chart.over;
          const wheel = (event: WheelEvent) => {
            event.preventDefault();
            const scale = chart.scales.x;
            if (scale.min == null || scale.max == null) return;
            const rect = over.getBoundingClientRect();
            const cursor = chart.posToVal(event.clientX - rect.left, "x");
            const factor = event.deltaY < 0 ? 0.82 : 1.22;
            chart.setScale("x", {
              min: cursor - (cursor - scale.min) * factor,
              max: cursor + (scale.max - cursor) * factor,
            });
          };
          let pinchDistance = 0;
          const touchMove = (event: TouchEvent) => {
            if (event.touches.length !== 2) return;
            event.preventDefault();
            const distance = Math.abs(
              event.touches[1].clientX - event.touches[0].clientX
            );
            if (pinchDistance) {
              const scale = chart.scales.x;
              if (scale.min != null && scale.max != null) {
                const midpoint =
                  (event.touches[0].clientX + event.touches[1].clientX) / 2 -
                  over.getBoundingClientRect().left;
                const center = chart.posToVal(midpoint, "x");
                const factor = pinchDistance / distance;
                chart.setScale("x", {
                  min: center - (center - scale.min) * factor,
                  max: center + (scale.max - center) * factor,
                });
              }
            }
            pinchDistance = distance;
          };
          const touchEnd = () => {
            pinchDistance = 0;
          };
          over.addEventListener("wheel", wheel, { passive: false });
          over.addEventListener("touchmove", touchMove, { passive: false });
          over.addEventListener("touchend", touchEnd);
          (
            chart.root as HTMLElement & { __scopeCleanup?: () => void }
          ).__scopeCleanup = () => {
            over.removeEventListener("wheel", wheel);
            over.removeEventListener("touchmove", touchMove);
            over.removeEventListener("touchend", touchEnd);
          };
        },
      ],
      destroy: [
        (chart) =>
          (
            chart.root as HTMLElement & { __scopeCleanup?: () => void }
          ).__scopeCleanup?.(),
      ],
    },
  };
}

function measurementCursorPlugin(): uPlot.Plugin {
  let render = () => {};
  return {
    hooks: {
      ready: [
        (chart) => {
          const markers = [0, 1].map((index) => {
            const marker = document.createElement("button");
            marker.type = "button";
            marker.className = `scope-measure-cursor cursor-${index}`;
            marker.setAttribute(
              "aria-label",
              `Measurement cursor ${index ? "B" : "A"}`
            );
            marker.dataset.letter = index ? "B" : "A";
            marker.textContent = index ? "B" : "A";
            chart.over.append(marker);
            return marker;
          });
          const readout = document.createElement("output");
          readout.className = "scope-cursor-readout";
          chart.over.append(readout);
          let values: [number, number] = [0, 0];
          let active = -1;

          const initialize = () => {
            const scale = chart.scales.x;
            if (scale.min == null || scale.max == null) return;
            if (values[0] === values[1]) {
              const span = scale.max - scale.min;
              values = [scale.min + span * 0.35, scale.min + span * 0.65];
            }
          };
          render = () => {
            initialize();
            markers.forEach((marker, index) => {
              marker.style.left = `${chart.valToPos(values[index], "x")}px`;
            });
            const delta = Math.abs(values[1] - values[0]);
            const xData = chart.data[0] as number[];
            const nearest = (value: number) => {
              if (!xData.length) return -1;
              const span = xData[xData.length - 1] - xData[0] || 1;
              return Math.max(
                0,
                Math.min(
                  xData.length - 1,
                  Math.round(((value - xData[0]) / span) * (xData.length - 1))
                )
              );
            };
            const a = nearest(values[0]),
              b = nearest(values[1]);
            const series = chart.data[1] as Array<number | null> | undefined;
            const valueDelta =
              series &&
              a >= 0 &&
              b >= 0 &&
              series[a] != null &&
              series[b] != null
                ? ` · Δvalue ${Math.abs(
                    Number(series[b]) - Number(series[a])
                  ).toPrecision(5)}`
                : "";
            readout.textContent = `A ${(values[0] * 1e3).toFixed(3)} ms · B ${(
              values[1] * 1e3
            ).toFixed(3)} ms · Δt ${(delta * 1e3).toFixed(3)} ms · ${
              delta ? (1 / delta).toFixed(2) : "∞"
            } Hz${valueDelta}`;
          };
          const pointerDown = (event: PointerEvent) => {
            const target = event.target as HTMLElement;
            active = markers.indexOf(target as HTMLButtonElement);
            if (active >= 0) {
              markers[active].setPointerCapture(event.pointerId);
              event.stopPropagation();
            }
          };
          const pointerMove = (event: PointerEvent) => {
            if (active < 0) return;
            const rect = chart.over.getBoundingClientRect();
            values[active] = chart.posToVal(
              Math.max(0, Math.min(rect.width, event.clientX - rect.left)),
              "x"
            );
            render();
            event.stopPropagation();
          };
          const pointerUp = () => {
            active = -1;
          };
          chart.over.addEventListener("pointerdown", pointerDown);
          chart.over.addEventListener("pointermove", pointerMove);
          chart.over.addEventListener("pointerup", pointerUp);
          chart.over.addEventListener("pointercancel", pointerUp);
          (
            chart.root as HTMLElement & { __cursorCleanup?: () => void }
          ).__cursorCleanup = () => {
            chart.over.removeEventListener("pointerdown", pointerDown);
            chart.over.removeEventListener("pointermove", pointerMove);
            chart.over.removeEventListener("pointerup", pointerUp);
            chart.over.removeEventListener("pointercancel", pointerUp);
          };
          render();
        },
      ],
      setScale: [
        (_chart, scaleKey) => {
          if (scaleKey === "x") render();
        },
      ],
      draw: [() => render()],
      destroy: [
        (chart) =>
          (
            chart.root as HTMLElement & { __cursorCleanup?: () => void }
          ).__cursorCleanup?.(),
      ],
    },
  };
}

export const ScopePlot: Component<{
  capture: ScopeCapture | null;
  names: Array<string | null>;
  types?: Array<string | null>;
}> = (props) => {
  let host!: HTMLDivElement;
  let chart: uPlot | undefined;
  let observer: ResizeObserver | undefined;

  const makeData = (): uPlot.AlignedData => {
    const capture = props.capture;
    if (!capture)
      return [
        [],
        ...props.names.filter(Boolean).map(() => []),
      ] as uPlot.AlignedData;
    const x = Array.from(
      { length: capture.samples },
      (_, index) =>
        ((index - capture.triggerIndex) * capture.samplePeriodNs) / 1e9
    );
    return [
      x,
      ...capture.channels
        .filter((values) => values !== null)
        .map((values) => Array.from(values!)),
    ] as uPlot.AlignedData;
  };

  const createChart = () => {
    chart?.destroy();
    host.replaceChildren();
    const active = props.names
      .map((name, index) => ({ name, index }))
      .filter(({ name }) => name);
    const isBitChannel = (index: number) => {
      if (props.types?.[index]) return props.types[index] === "bit";
      const values = props.capture?.channels[index];
      return (
        Boolean(values?.length) &&
        Array.from(values!).every((value) => value === 0 || value === 1)
      );
    };
    chart = new uPlot(
      {
        width: Math.max(320, host.clientWidth),
        height: Math.max(180, host.clientHeight),
        pxAlign: true,
        scales: { x: { time: false } },
        axes: [
          {
            stroke: "#8d97a8",
            grid: { stroke: "rgba(130,145,165,.18)" },
            values: (_u, values) =>
              values.map((value) => `${(value * 1e3).toFixed(2)} ms`),
          },
          {
            stroke: "#8d97a8",
            grid: { stroke: "rgba(130,145,165,.18)" },
            size: 54,
          },
        ],
        cursor: {
          drag: { x: true, y: false, setScale: true },
          focus: { prox: 30 },
        },
        legend: { show: true, live: true },
        series: [
          { label: "Time" },
          ...active.map(({ name, index }) => ({
            label: `CH ${index + 1} · ${name}`,
            stroke: COLORS[index % COLORS.length],
            width: 1.5,
            paths: isBitChannel(index)
              ? uPlot.paths.stepped!({ align: 1 })
              : undefined,
            value: (_u: uPlot, value: number | null) =>
              value == null ? "—" : Number(value).toPrecision(7),
          })),
        ],
        plugins: [interactionPlugin(), measurementCursorPlugin()],
      },
      makeData(),
      host
    );
  };

  onMount(() => {
    createChart();
    observer = new ResizeObserver(() =>
      chart?.setSize({
        width: Math.max(320, host.clientWidth),
        height: Math.max(180, host.clientHeight),
      })
    );
    observer.observe(host);
  });
  createEffect(() => {
    const capture = props.capture;
    if (!chart || !capture) return;
    const activeCount = props.names.filter(Boolean).length;
    if (chart.series.length !== activeCount + 1) createChart();
    else chart.setData(makeData(), true);
  });
  onCleanup(() => {
    observer?.disconnect();
    chart?.destroy();
  });
  return (
    <div
      ref={host}
      class="scope-chart"
      aria-label="Interactive HAL scope waveform"
    />
  );
};
