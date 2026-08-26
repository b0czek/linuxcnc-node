import { createVirtualizer } from "@tanstack/solid-virtual";
import {
  FaSolidChartLine,
  FaSolidChevronDown,
  FaSolidChevronRight,
  FaSolidMinus,
  FaSolidPenToSquare,
  FaSolidPlus,
  FaSolidXmark,
} from "solid-icons/fa";
import { type Component, createEffect, For, onCleanup, Show } from "solid-js";
import { useHalInspector } from "./HalInspectorProvider";
import { t } from "./i18n";
import { formatInlineValue, TYPE_COLORS } from "./tree";

const LIST_ROW_PITCH = 64;
const LIST_OVERSCAN = 8;

export const HalItemsPanel: Component = () => {
  const { browse, editor, navigation } = useHalInspector();
  let listElement: HTMLDivElement | null = null;
  let disposed = false;
  const virtualizer = createVirtualizer<HTMLDivElement, HTMLDivElement>({
    get count() {
      return browse.displayedRows().length;
    },
    getScrollElement: () => listElement,
    estimateSize: () => LIST_ROW_PITCH,
    overscan: LIST_OVERSCAN,
  });

  const attachListElement = (element: HTMLDivElement) => {
    listElement = element;
    requestAnimationFrame(() => {
      if (!disposed && listElement === element) virtualizer._willUpdate();
    });
  };

  createEffect(() => {
    browse.filter();
    navigation.activeTab();
    if (listElement) listElement.scrollTop = 0;
  });

  onCleanup(() => {
    disposed = true;
    listElement = null;
  });

  return (
    <div class="list-detail">
      <Show
        when={navigation.activeTab() === "watch" && browse.watches().length > 0}
      >
        <button
          type="button"
          class="eden-btn eden-btn-sm eden-btn-ghost clear-watches"
          aria-label={t("inspector.clearWatches")}
          title={t("inspector.clearWatches")}
          onClick={browse.clearWatches}
        >
          <FaSolidXmark size={16} />
        </button>
      </Show>
      <div
        ref={attachListElement}
        class={`virtual-list eden-list ${navigation.activeTab() === "watch" ? "watch-list" : ""}`}
        role="tree"
        aria-label={navigation.activeTab()}
      >
        <Show
          when={browse.displayedRows().length}
          fallback={<div class="empty-state">{t("inspector.empty")}</div>}
        >
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              position: "relative",
            }}
          >
            <For each={virtualizer.getVirtualItems()}>
              {(virtualRow) => {
                const row = () => browse.displayedRows()[virtualRow.index];
                const groupExpanded = () => {
                  const groupKey = row()?.groupKey;
                  return Boolean(
                    groupKey &&
                      (browse.filter().trim() ||
                        browse.expandedGroups().has(groupKey)),
                  );
                };
                const watched = () => {
                  const ref = row()?.ref;
                  return ref ? browse.isWatched(ref) : false;
                };
                const activate = () => {
                  const current = row();
                  if (!current) return;
                  if (current.groupKey) browse.toggleGroup(current.groupKey);
                  else browse.setSelected(current);
                };
                return (
                  <div
                    class={`hal-row ${row()?.groupKey ? "group-row" : ""} ${
                      browse.selected()?.id === row()?.id ? "selected" : ""
                    }`}
                    style={{ transform: `translateY(${virtualRow.start}px)` }}
                    role="treeitem"
                    tabIndex={0}
                    aria-level={(row()?.depth ?? 0) + 1}
                    aria-expanded={
                      row()?.groupKey ? groupExpanded() : undefined
                    }
                    onClick={activate}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter" && event.key !== " ") return;
                      event.preventDefault();
                      activate();
                    }}
                  >
                    <div
                      class="tree-leading"
                      style={{
                        "padding-left": `${(row()?.depth ?? 0) * 20}px`,
                        "--tree-guide-width": `${(row()?.guideDepth ?? 0) * 20}px`,
                      }}
                    >
                      <Show
                        when={row()?.groupKey}
                        fallback={
                          <div
                            class="kind-chip"
                            title={row()?.type ?? row()?.kind}
                          >
                            <span
                              class="type-dot"
                              style={{
                                "background-color":
                                  TYPE_COLORS[row()?.type ?? ""] ??
                                  TYPE_COLORS.default,
                              }}
                            />
                          </div>
                        }
                      >
                        <button
                          type="button"
                          class="group-toggle"
                          aria-label={row()?.displayName}
                          tabindex={-1}
                          onClick={(event) => {
                            event.stopPropagation();
                            const groupKey = row()?.groupKey;
                            if (groupKey) browse.toggleGroup(groupKey);
                          }}
                        >
                          {groupExpanded() ? (
                            <FaSolidChevronDown size={14} />
                          ) : (
                            <FaSolidChevronRight size={14} />
                          )}
                        </button>
                      </Show>
                    </div>
                    <div class="row-main">
                      <strong title={row()?.name}>{row()?.displayName}</strong>
                      <span>
                        {row()?.groupKey
                          ? `${row()?.groupCount ?? 0} items`
                          : row()?.subtitle}
                      </span>
                    </div>
                    <Show when={row()?.ref}>
                      <div class="value-cell">
                        <code class="value">
                          <span title={String(row()?.value ?? "—")}>
                            {formatInlineValue(row()?.value)}
                          </span>
                        </code>
                        <span class="value-edit-slot">
                          <Show when={row()?.writable}>
                            <button
                              type="button"
                              class="eden-btn eden-btn-outline"
                              aria-label={t("inspector.edit")}
                              title={t("inspector.edit")}
                              onClick={(event) => {
                                event.stopPropagation();
                                const current = row();
                                if (current) editor.open(current);
                              }}
                            >
                              <FaSolidPenToSquare size={16} />
                            </button>
                          </Show>
                        </span>
                      </div>
                      <div class="row-actions">
                        <button
                          type="button"
                          class="eden-btn eden-btn-ghost"
                          aria-label={
                            watched()
                              ? t("inspector.removeWatch")
                              : t("inspector.addWatch")
                          }
                          title={
                            watched()
                              ? t("inspector.removeWatch")
                              : t("inspector.addWatch")
                          }
                          onClick={(event) => {
                            event.stopPropagation();
                            const ref = row()?.ref;
                            if (ref) browse.toggleWatch(ref);
                          }}
                        >
                          {watched() ? (
                            <FaSolidMinus size={16} />
                          ) : (
                            <FaSolidPlus size={16} />
                          )}
                        </button>
                        <Show
                          when={["bit", "float", "s32", "u32"].includes(
                            row()?.type ?? "",
                          )}
                        >
                          <button
                            type="button"
                            class="eden-btn eden-btn-ghost"
                            aria-label={t("inspector.inspectScope")}
                            title={t("inspector.inspectScope")}
                            onClick={(event) => {
                              event.stopPropagation();
                              const ref = row()?.ref;
                              if (ref) void browse.inspectOnScope(ref);
                            }}
                          >
                            <FaSolidChartLine size={16} />
                          </button>
                        </Show>
                      </div>
                    </Show>
                  </div>
                );
              }}
            </For>
          </div>
        </Show>
      </div>
      <Show when={browse.selected()}>
        <aside class="detail-pane eden-surface-secondary">
          <h2>{browse.selected()?.name}</h2>
          <dl>
            <dt>{t("inspector.type")}</dt>
            <dd>{browse.selected()?.type ?? browse.selected()?.kind}</dd>
            <dt>{t("inspector.value")}</dt>
            <dd>
              <code>{String(browse.selected()?.value ?? "—")}</code>
            </dd>
          </dl>
        </aside>
      </Show>
    </div>
  );
};
