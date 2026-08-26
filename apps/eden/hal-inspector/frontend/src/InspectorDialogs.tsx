import * as Dialog from "@kobalte/core/dialog";
import { FaSolidXmark } from "solid-icons/fa";
import { type Component, Show } from "solid-js";
import { useHalInspector } from "./HalInspectorProvider";
import { InspectorSidebar } from "./InspectorSidebar";
import { t } from "./i18n";

export const MobileSidebarDialog: Component = () => {
  const { navigation } = useHalInspector();
  return (
    <Dialog.Root
      open={navigation.treeOpen()}
      onOpenChange={navigation.setTreeOpen}
    >
      <Dialog.Portal>
        <Dialog.Overlay class="eden-modal-overlay" />
        <Dialog.Content class="mobile-tree eden-modal">
          <Dialog.Title class="sr-only">{t("inspector.menu")}</Dialog.Title>
          <InspectorSidebar />
          <Dialog.CloseButton class="eden-btn eden-btn-ghost close-tree">
            <FaSolidXmark size={18} />
          </Dialog.CloseButton>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

export const EditValueDialog: Component = () => {
  const { editor } = useHalInspector();
  return (
    <Dialog.Root
      open={Boolean(editor.ref())}
      onOpenChange={(open) => !open && editor.close()}
    >
      <Dialog.Portal>
        <Dialog.Overlay class="eden-modal-overlay" />
        <Dialog.Content class="edit-dialog eden-modal">
          <Dialog.Title class="eden-modal-title">
            {t("inspector.edit")}
          </Dialog.Title>
          <Dialog.Description class="eden-text-secondary">
            {editor.ref()?.name}
          </Dialog.Description>
          <label>
            {t("inspector.current")}
            <output>
              {String(editor.ref() ? (editor.currentValue() ?? "—") : "")}
            </output>
          </label>
          <label>
            {t("inspector.proposed")}
            <input
              class="eden-input"
              value={editor.value()}
              onInput={(event) => editor.setValue(event.currentTarget.value)}
              autofocus
            />
          </label>
          <div class="dialog-actions">
            <Dialog.CloseButton class="eden-btn eden-btn-outline">
              {t("inspector.cancel")}
            </Dialog.CloseButton>
            <button
              type="button"
              class="eden-btn eden-btn-primary"
              onClick={() => void editor.write()}
            >
              {t("inspector.write")}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

export const ErrorToast: Component = () => {
  const { error } = useHalInspector();
  return (
    <Show when={error.message()}>
      <div class="error-toast eden-card" role="alert">
        <span>{error.message()}</span>
        <button
          type="button"
          class="eden-btn eden-btn-ghost"
          onClick={error.dismiss}
        >
          <FaSolidXmark size={18} />
        </button>
      </div>
    </Show>
  );
};
