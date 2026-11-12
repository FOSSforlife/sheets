import { For } from "solid-js";
import { dismissToast, toasts } from "../../stores/toasts";
import { X } from "./icons";

export function Toasts() {
  return (
    <div class="pointer-events-none fixed right-4 bottom-4 z-50 flex w-80 flex-col gap-2" aria-live="polite">
      <For each={toasts()}>
        {(t) => (
          <div class={`toast toast-${t.kind} pointer-events-auto`}>
            <span class="flex-1">{t.message}</span>
            <button
              type="button"
              class="icon-btn icon-btn-sm"
              onClick={() => dismissToast(t.id)}
              aria-label="Dismiss"
            >
              <X size={12} />
            </button>
          </div>
        )}
      </For>
    </div>
  );
}
