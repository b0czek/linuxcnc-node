import {
  FaSolidBolt,
  FaSolidCircleDot,
  FaSolidPlay,
  FaSolidSquare,
  FaSolidWaveSquare,
} from "solid-icons/fa";
import { type Component, For, Show } from "solid-js";
import type { ScopeRunMode } from "../../shared/protocol";
import { useHalInspector } from "./HalInspectorProvider";
import { t } from "./i18n";
import { ScopePlot } from "./ScopePlot";

export const ScopePanel: Component = () => {
  const { connection, scope } = useHalInspector();
  const channelTypes = () =>
    scope.channels().map((ref) => {
      const topology = connection.topology();
      if (!ref || !topology) return null;
      const items =
        ref.kind === "pin"
          ? topology.pins
          : ref.kind === "param"
            ? topology.params
            : topology.signals;
      return items.find((item) => item.name === ref.name)?.type ?? null;
    });

  const actionClass = (mode: ScopeRunMode) =>
    `eden-btn eden-btn-sm ${
      scope.runMode() === mode ? "eden-btn-primary" : "eden-btn-outline"
    }`;

  return (
    <section class="scope-panel">
      <div class="scope-body">
        <div class="scope-toolbar">
          <div class="scope-actions">
            <button
              type="button"
              class={actionClass("run")}
              disabled={!scope.channels().some(Boolean)}
              onClick={() => void scope.action("run")}
            >
              <FaSolidPlay size={16} />
              <span class="btn-label">{t("inspector.run")}</span>
            </button>
            <button
              type="button"
              class={actionClass("roll")}
              disabled={!scope.channels().some(Boolean)}
              onClick={() => void scope.action("roll")}
            >
              <FaSolidWaveSquare size={16} />
              <span class="btn-label">{t("inspector.roll")}</span>
            </button>
            <button
              type="button"
              class={actionClass("single")}
              disabled={!scope.channels().some(Boolean)}
              onClick={() => void scope.action("single")}
            >
              <FaSolidCircleDot size={16} />
              <span class="btn-label">{t("inspector.single")}</span>
            </button>
            <button
              type="button"
              class="eden-btn eden-btn-sm eden-btn-outline"
              disabled={scope.runMode() === "stop"}
              onClick={() => void scope.action("stop")}
            >
              <FaSolidSquare size={16} />
              <span class="btn-label">{t("inspector.stop")}</span>
            </button>
            <button
              type="button"
              class="eden-btn eden-btn-sm eden-btn-ghost"
              disabled={scope.runMode() === "roll"}
              onClick={() => void scope.action("force")}
            >
              <FaSolidBolt size={16} />
              <span class="btn-label">{t("inspector.force")}</span>
            </button>
          </div>
          <div class="scope-acquisition">
            <label class="scope-field">
              <span>{t("inspector.thread")}</span>
              <select
                class="eden-input eden-input-sm"
                value={scope.thread()}
                onChange={(event) => scope.setThread(event.currentTarget.value)}
              >
                <For
                  each={connection
                    .topology()
                    ?.threads.filter((item) => item.running)}
                >
                  {(item) => <option value={item.name}>{item.name}</option>}
                </For>
              </select>
            </label>
            <label class="scope-field compact">
              <span>{t("inspector.multiplier")}</span>
              <input
                class="eden-input eden-input-sm"
                type="number"
                min="1"
                max={Math.min(
                  1000,
                  Math.floor(
                    1e9 /
                      (connection
                        .topology()
                        ?.threads.find((item) => item.name === scope.thread())
                        ?.periodNs ?? 1e9),
                  ),
                )}
                value={scope.multiplier()}
                onChange={(event) =>
                  scope.setMultiplier(event.currentTarget.valueAsNumber)
                }
              />
            </label>
          </div>
        </div>
        <fieldset
          class="trigger-toolbar"
          classList={{ "roll-disabled": scope.runMode() === "roll" }}
          aria-label="Trigger controls"
          disabled={scope.runMode() === "roll"}
        >
          <div class="eden-btn-group">
            <For each={["auto", "normal"] as const}>
              {(mode) => (
                <button
                  type="button"
                  class={`eden-btn eden-btn-sm ${
                    scope.triggerMode() === mode
                      ? "eden-btn-primary"
                      : "eden-btn-outline"
                  }`}
                  onClick={() => scope.setTriggerMode(mode)}
                >
                  {t(`inspector.${mode}`)}
                </button>
              )}
            </For>
          </div>
          <select
            class="eden-input eden-input-sm trigger-channel"
            aria-label="Trigger channel"
            value={scope.triggerChannel()}
            onChange={(event) =>
              scope.setTriggerChannel(Number(event.currentTarget.value))
            }
          >
            <For
              each={scope
                .channels()
                .map((ref, index) => ({ ref, index }))
                .filter(({ ref }) => ref)}
            >
              {({ ref, index }) => (
                <option value={index}>
                  CH {index + 1} · {ref?.name}
                </option>
              )}
            </For>
          </select>
          <select
            class="eden-input eden-input-sm trigger-edge"
            value={scope.triggerEdge()}
            onChange={(event) =>
              scope.setTriggerEdge(
                event.currentTarget.value as "rising" | "falling",
              )
            }
          >
            <option value="rising">{t("inspector.rising")}</option>
            <option value="falling">{t("inspector.falling")}</option>
          </select>
          <label class="scope-field compact">
            <span>Level</span>
            <input
              class="eden-input eden-input-sm"
              type="number"
              step="any"
              value={scope.triggerLevel()}
              onChange={(event) =>
                scope.setTriggerLevel(event.currentTarget.valueAsNumber)
              }
            />
          </label>
          <label class="pre-trigger">
            <span>
              Pre-trigger {Math.round(scope.preTriggerRatio() * 100)}%
            </span>
            <input
              type="range"
              min="0"
              max="0.9"
              step="0.05"
              value={scope.preTriggerRatio()}
              onChange={(event) =>
                scope.setPreTriggerRatio(event.currentTarget.valueAsNumber)
              }
            />
          </label>
        </fieldset>
        <div class="plot-area">
          <ScopePlot
            capture={scope.capture()}
            rollFrame={scope.rollFrame()}
            runMode={scope.runMode()}
            names={scope.channels().map((ref) => ref?.name ?? null)}
            types={channelTypes()}
            displays={scope.displays()}
            activeChannel={scope.activeChannel()}
            triggerChannel={
              scope.channels()[scope.triggerChannel()]
                ? scope.triggerChannel()
                : Math.max(0, scope.channels().findIndex(Boolean))
            }
            triggerLevel={scope.triggerLevel()}
            status={scope.status()}
            skippedCaptures={scope.skippedCaptures()}
            onActiveChannelChange={scope.setActiveChannel}
            onDisplayChange={scope.updateDisplay}
            onTriggerLevelCommit={scope.setTriggerLevel}
            onRemoveChannel={scope.removeChannel}
          />
          <Show when={!scope.channels().some(Boolean)}>
            <div class="plot-empty">{t("inspector.noChannels")}</div>
          </Show>
        </div>
      </div>
    </section>
  );
};
