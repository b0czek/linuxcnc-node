import type { ScopeStatus } from "@linuxcnc-node/types";
import {
  FaSolidChartLine,
  FaSolidCubes,
  FaSolidWaveSquare,
} from "solid-icons/fa";
import type { Component } from "solid-js";
import { t } from "./i18n";
import type { ActiveTab } from "./models";

interface InspectorSidebarProps {
  activeTab: ActiveTab;
  watchCount: number;
  scopeStatus: ScopeStatus | null;
  onSelect: (tab: ActiveTab) => void;
}

export const InspectorSidebar: Component<InspectorSidebarProps> = (props) => (
  <aside class="hal-sidebar eden-sidebar">
    <div class="sidebar-title">
      <strong>{t("inspector.appName")}</strong>
    </div>
    <nav aria-label={t("inspector.menu")}>
      <button
        type="button"
        class={`tree-root ${props.activeTab === "browse" ? "active" : ""}`}
        onClick={() => props.onSelect("browse")}
      >
        <span aria-hidden="true" class="category-icon">
          <FaSolidCubes size={18} />
        </span>
        <span>{t("inspector.browse")}</span>
      </button>
      <button
        type="button"
        class={`tree-root ${props.activeTab === "watch" ? "active" : ""}`}
        onClick={() => props.onSelect("watch")}
      >
        <span aria-hidden="true" class="category-icon">
          <FaSolidChartLine size={18} />
        </span>
        <span>{t("inspector.watch")}</span>
        <span class="eden-badge eden-badge-sm">{props.watchCount}</span>
      </button>
      <button
        type="button"
        class={`tree-root ${props.activeTab === "scope" ? "active" : ""}`}
        onClick={() => props.onSelect("scope")}
      >
        <span aria-hidden="true" class="category-icon">
          <FaSolidWaveSquare size={18} />
        </span>
        <span>{t("inspector.scope")}</span>
        <span class="eden-badge eden-badge-sm">
          {props.scopeStatus?.state ?? "idle"}
        </span>
      </button>
    </nav>
  </aside>
);
