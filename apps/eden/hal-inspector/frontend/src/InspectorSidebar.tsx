import {
  FaSolidChartLine,
  FaSolidCubes,
  FaSolidWaveSquare,
} from "solid-icons/fa";
import type { Component } from "solid-js";
import { useHalInspector } from "./HalInspectorProvider";
import { t } from "./i18n";

export const InspectorSidebar: Component = () => {
  const { browse, navigation, scope } = useHalInspector();
  return (
    <aside class="hal-sidebar eden-sidebar">
      <div class="sidebar-title">
        <strong>{t("inspector.appName")}</strong>
      </div>
      <nav aria-label={t("inspector.menu")}>
        <button
          type="button"
          class={`tree-root ${navigation.activeTab() === "browse" ? "active" : ""}`}
          onClick={() => navigation.selectTab("browse")}
        >
          <span aria-hidden="true" class="category-icon">
            <FaSolidCubes size={18} />
          </span>
          <span>{t("inspector.browse")}</span>
        </button>
        <button
          type="button"
          class={`tree-root ${navigation.activeTab() === "watch" ? "active" : ""}`}
          onClick={() => navigation.selectTab("watch")}
        >
          <span aria-hidden="true" class="category-icon">
            <FaSolidChartLine size={18} />
          </span>
          <span>{t("inspector.watch")}</span>
          <span class="eden-badge eden-badge-sm">
            {browse.watches().length}
          </span>
        </button>
        <button
          type="button"
          class={`tree-root ${navigation.activeTab() === "scope" ? "active" : ""}`}
          onClick={() => navigation.selectTab("scope")}
        >
          <span aria-hidden="true" class="category-icon">
            <FaSolidWaveSquare size={18} />
          </span>
          <span>{t("inspector.scope")}</span>
          <span class="eden-badge eden-badge-sm">
            {scope.status()?.state ?? "idle"}
          </span>
        </button>
      </nav>
    </aside>
  );
};
