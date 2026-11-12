import { createSignal, For, onCleanup, Show } from "solid-js";
import {
  ACTIONS,
  type ActionDef,
  bindingFor,
  conflictFor,
  eventToBinding,
  formatBinding,
  isDefaultBinding,
  resetAllBindings,
  resetBinding,
  setBinding,
  setRecording,
} from "../../stores/keymap";
import { RotateCcw } from "../ui/icons";

const GROUPS = ["Cells", "Rows & columns", "Navigation", "Files"] as const;

/** Click a binding, press keys to record; Backspace clears; Escape cancels. */
export function KeymapEditor() {
  const [recording, setRec] = createSignal<string | null>(null);
  const [pending, setPending] = createSignal<string | null>(null);

  const stop = () => {
    setRec(null);
    setPending(null);
    setRecording(false);
  };
  onCleanup(stop);

  const onKey = (a: ActionDef, e: KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.key === "Escape") return stop();
    if (
      (e.key === "Backspace" || e.key === "Delete") &&
      !e.ctrlKey &&
      !e.metaKey &&
      !e.altKey &&
      !e.shiftKey
    ) {
      setBinding(a.id, null);
      return stop();
    }
    const b = eventToBinding(e);
    if (!b) return;
    setBinding(a.id, b);
    stop();
  };

  return (
    <div>
      <For each={GROUPS}>
        {(g) => (
          <div class="mb-4">
            <div class="mb-1 text-xs font-medium uppercase tracking-wide text-muted">{g}</div>
            <div class="divide-y divide-line rounded border border-line">
              <For each={ACTIONS.filter((a) => a.group === g)}>
                {(a) => {
                  const b = () => bindingFor(a.id);
                  const isRec = () => recording() === a.id;
                  return (
                    <div class="flex items-center gap-3 px-3 py-1.5">
                      <span class="flex-1">{a.label}</span>
                      <Show when={isRec() && pending()}>
                        <span class="text-xs text-warn">
                          Replaces “{conflictFor(a.id, pending()!)?.label}”
                        </span>
                      </Show>
                      <button
                        type="button"
                        class="kbd-btn"
                        classList={{ recording: isRec() }}
                        onClick={() => {
                          setRec(a.id);
                          setRecording(true);
                        }}
                        onBlur={() => isRec() && stop()}
                        onKeyDown={(e) => isRec() && onKey(a, e)}
                        onKeyUp={(e) => {
                          if (!isRec()) return;
                          const p = eventToBinding(e);
                          setPending(p && conflictFor(a.id, p) ? p : null);
                        }}
                      >
                        {isRec() ? (
                          "Press keys…"
                        ) : b() ? (
                          formatBinding(b()!)
                        ) : (
                          <span class="text-muted">—</span>
                        )}
                      </button>
                      <button
                        type="button"
                        class="icon-btn icon-btn-sm"
                        classList={{ invisible: isDefaultBinding(a.id) }}
                        title="Reset to default"
                        onClick={() => resetBinding(a.id)}
                      >
                        <RotateCcw size={13} />
                      </button>
                    </div>
                  );
                }}
              </For>
            </div>
          </div>
        )}
      </For>
      <p class="mb-2 text-xs text-muted">
        Click a shortcut and press the new keys. Backspace clears it, Escape cancels. Spreadsheet keys
        (arrows, Tab, Enter, F2, Delete, copy/paste, undo) are fixed.
      </p>
      <button type="button" class="btn" onClick={resetAllBindings}>
        Reset all shortcuts
      </button>
    </div>
  );
}
