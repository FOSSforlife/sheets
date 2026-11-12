import { For, onCleanup } from "solid-js";
import { Portal } from "solid-js/web";
import { closeDialog, dialogStack, dismissTopDialog } from "../../stores/dialogs";

/** Renders the dialog stack with a backdrop. Escape dismisses the topmost dialog. */
export function DialogHost() {
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape" && dialogStack().length) {
      e.preventDefault();
      e.stopPropagation();
      dismissTopDialog();
    }
  };
  window.addEventListener("keydown", onKey, true);
  onCleanup(() => window.removeEventListener("keydown", onKey, true));

  return (
    <Portal>
      <For each={dialogStack()}>
        {(d) => (
          <div
            class="fixed inset-0 z-40 flex items-start justify-center bg-black/40 pt-[12vh]"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) closeDialog(d.id, d.dismissValue);
            }}
          >
            {d.render({ close: (r) => closeDialog(d.id, r) })}
          </div>
        )}
      </For>
    </Portal>
  );
}
