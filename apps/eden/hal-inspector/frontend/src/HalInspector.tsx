import { FaSolidBars } from "solid-icons/fa";
import { type Component, Show } from "solid-js";
import { BrowseHeader } from "./BrowseHeader";
import { HalInspectorProvider, useHalInspector } from "./HalInspectorProvider";
import { HalItemsPanel } from "./HalItemsPanel";
import {
  EditValueDialog,
  ErrorToast,
  MobileSidebarDialog,
} from "./InspectorDialogs";
import { InspectorSidebar } from "./InspectorSidebar";
import { t } from "./i18n";
import { ScopePanel } from "./ScopePanel";

const InspectorScreen: Component = () => {
  const { connection, navigation } = useHalInspector();
  return (
    <main class="inspector-frame">
      <Show
        when={connection.connected()}
        fallback={
          <section class="disconnected-view">
            <strong>{t("inspector.appName")}</strong>
            <span>{t("inspector.disconnected")}</span>
          </section>
        }
      >
        <div class="desktop-tree">
          <InspectorSidebar />
        </div>
        <MobileSidebarDialog />
        <section class="workspace">
          <Show when={navigation.activeTab() !== "browse"}>
            <button
              type="button"
              class="eden-btn eden-btn-ghost menu-button standalone-menu-button"
              aria-label={t("inspector.menu")}
              title={t("inspector.menu")}
              onClick={navigation.openTree}
            >
              <FaSolidBars size={18} />
            </button>
          </Show>
          <div
            class={`workspace-content ${
              navigation.activeTab() !== "browse" ? "has-standalone-menu" : ""
            }`}
          >
            <Show when={navigation.activeTab() === "browse"}>
              <BrowseHeader />
            </Show>
            <Show when={navigation.activeTab() !== "scope"}>
              <HalItemsPanel />
            </Show>
            <Show when={navigation.activeTab() === "scope"}>
              <ScopePanel />
            </Show>
          </div>
        </section>
        <EditValueDialog />
        <ErrorToast />
      </Show>
    </main>
  );
};

export const HalInspector: Component = () => (
  <HalInspectorProvider>
    <InspectorScreen />
  </HalInspectorProvider>
);
