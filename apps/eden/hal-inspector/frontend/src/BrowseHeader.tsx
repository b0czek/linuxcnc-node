import {
  FaSolidBars,
  FaSolidClock,
  FaSolidCode,
  FaSolidCubes,
  FaSolidMagnifyingGlass,
  FaSolidRotateRight,
  FaSolidSliders,
  FaSolidThumbTack,
  FaSolidWaveSquare,
} from "solid-icons/fa";
import { type Component, For } from "solid-js";
import { useHalInspector } from "./HalInspectorProvider";
import { t } from "./i18n";
import type { Category } from "./models";

const categoryLabels: Record<Category, () => string> = {
  components: () => t("inspector.components"),
  pins: () => t("inspector.pins"),
  params: () => t("inspector.parameters"),
  signals: () => t("inspector.signals"),
  functions: () => t("inspector.functions"),
  threads: () => t("inspector.threads"),
};

export const BrowseHeader: Component = () => {
  const { browse, navigation } = useHalInspector();
  return (
    <div class="workspace-topbar">
      <header class="workspace-header">
        <button
          type="button"
          class="eden-btn eden-btn-ghost menu-button"
          aria-label={t("inspector.menu")}
          title={t("inspector.menu")}
          onClick={navigation.openTree}
        >
          <FaSolidBars size={18} />
        </button>
        <div>
          <h1>{categoryLabels[browse.category()]()}</h1>
          <span class="eden-text-sm eden-text-secondary">
            {browse.sourceRows().length.toLocaleString()} items
          </span>
        </div>
        <label class="search">
          <span aria-hidden="true" class="search-icon">
            <FaSolidMagnifyingGlass size={18} />
          </span>
          <input
            class="eden-input"
            value={browse.filter()}
            onInput={(event) => browse.setFilter(event.currentTarget.value)}
            placeholder={t("inspector.search")}
          />
        </label>
        <button
          type="button"
          class="eden-btn eden-btn-outline"
          aria-label={t("inspector.refresh")}
          title={t("inspector.refresh")}
          onClick={() => void browse.refresh()}
        >
          <FaSolidRotateRight size={18} />
        </button>
      </header>
      <div class="tabs-bar">
        <nav class="browse-categories" aria-label={t("inspector.browse")}>
          <For each={Object.keys(categoryLabels) as Category[]}>
            {(item) => (
              <button
                type="button"
                class={`browse-category ${browse.category() === item ? "active" : ""}`}
                onClick={() => browse.setCategory(item)}
              >
                {item === "components" && <FaSolidCubes size={15} />}
                {item === "pins" && <FaSolidThumbTack size={15} />}
                {item === "params" && <FaSolidSliders size={15} />}
                {item === "signals" && <FaSolidWaveSquare size={15} />}
                {item === "functions" && <FaSolidCode size={15} />}
                {item === "threads" && <FaSolidClock size={15} />}
                {categoryLabels[item]()}
                <span class="category-count">{browse.categoryCount(item)}</span>
              </button>
            )}
          </For>
        </nav>
      </div>
    </div>
  );
};
