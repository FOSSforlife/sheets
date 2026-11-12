import { createMemo, createSignal, For, Show } from "solid-js";
import { type RecordFormat, type RecordToken, recordTokens } from "../../io/exporters";
import { bindingFor, formatBinding } from "../../stores/keymap";
import { rowSelection } from "../../stores/selection";
import { toast } from "../../stores/toasts";
import { setUi, toggleInspector, ui } from "../../stores/ui";
import { peekSession } from "../../stores/workspace";
import { Check, Copy, PanelRightClose, PanelRightOpen } from "../ui/icons";

const FORMATS: { id: RecordFormat; label: string }[] = [
  { id: "json", label: "JSON" },
  { id: "yaml", label: "YAML" },
  { id: "edn", label: "EDN" },
];

/** Values take their column type's pill color; keys are bold; nulls are muted. */
function tokenClass(t: RecordToken): string {
  if (t.kind === "key") return "tok-key";
  if (t.kind === "null") return "tok-null";
  return `tok-value tok-${t.type}`;
}

type Preview =
  | { kind: "row"; tokens: RecordToken[]; text: string; rowNumber: number }
  | { kind: "none" }
  | { kind: "many"; count: number };

/**
 * Right-hand panel: the selected row as a pretty-printed JSON / YAML / EDN object.
 * Collapsed, it shrinks to a thin strip holding only the expand button, so the toggle never moves.
 */
export function RowInspector(props: { tableId: string }) {
  return (
    <Show when={ui.inspectorOpen} fallback={<CollapsedStrip />}>
      <InspectorPanel tableId={props.tableId} />
    </Show>
  );
}

function toggleHint(): string {
  const b = bindingFor("toggleInspector");
  return b ? ` (${formatBinding(b)})` : "";
}

/** Same header metrics as the open panel (px-2 py-2 + border), so the button sits in the same spot. */
function CollapsedStrip() {
  return (
    <aside
      class="flex h-full shrink-0 flex-col border-l border-line bg-sidebar"
      aria-label="Row preview (collapsed)"
    >
      <div class="flex items-center border-b border-line px-2 py-2">
        <button
          type="button"
          class="icon-btn"
          title={`Show row preview${toggleHint()}`}
          onClick={toggleInspector}
        >
          <PanelRightOpen size={16} />
        </button>
      </div>
      <button
        type="button"
        class="flex-1 cursor-pointer hover:bg-fg/5"
        tabIndex={-1}
        aria-hidden="true"
        title={`Show row preview${toggleHint()}`}
        onClick={toggleInspector}
      />
    </aside>
  );
}

function InspectorPanel(props: { tableId: string }) {
  const [copied, setCopied] = createSignal(false);

  const preview = createMemo((): Preview => {
    const sel = rowSelection();
    const session = peekSession(props.tableId);
    if (!sel || sel.tableId !== props.tableId || !session) return { kind: "none" };
    session.version(); // re-render when the table changes
    const count = sel.r1 - sel.r0 + 1;
    if (count > 1) return { kind: "many", count };
    const row = session.doc.rows[sel.r0];
    if (!row) return { kind: "none" };
    const tokens = recordTokens(ui.inspectorFormat, session.doc.columns, row);
    return { kind: "row", tokens, text: tokens.map((t) => t.text).join(""), rowNumber: sel.r0 + 1 };
  });

  const copy = () => {
    const p = preview();
    if (p.kind !== "row") return;
    navigator.clipboard
      .writeText(p.text)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      })
      .catch(() => toast("The browser blocked clipboard access", "warning"));
  };

  const startResize = (e: MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = ui.inspectorWidth;
    const move = (ev: MouseEvent) =>
      setUi("inspectorWidth", Math.max(220, Math.min(720, startW - (ev.clientX - startX))));
    const up = () => {
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
      document.body.classList.remove("resizing");
    };
    document.body.classList.add("resizing");
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
  };

  return (
    <aside
      class="relative flex h-full shrink-0 flex-col border-l border-line bg-sidebar"
      style={{ width: `${ui.inspectorWidth}px` }}
      aria-label="Row preview"
    >
      <div class="inspector-resizer" onMouseDown={startResize} title="Drag to resize" />
      <div class="flex items-center gap-1 border-b border-line px-2 py-2">
        <span class="flex-1 truncate pl-1 font-semibold">
          {(() => {
            const p = preview();
            return p.kind === "row" ? `Row ${p.rowNumber}` : "Row preview";
          })()}
        </span>
        <fieldset class="segmented" aria-label="Format">
          <For each={FORMATS}>
            {(f) => (
              <button
                type="button"
                aria-pressed={ui.inspectorFormat === f.id}
                onClick={() => setUi("inspectorFormat", f.id)}
              >
                {f.label}
              </button>
            )}
          </For>
        </fieldset>
        <button
          type="button"
          class="icon-btn"
          title={copied() ? "Copied" : "Copy to clipboard"}
          disabled={preview().kind !== "row"}
          onClick={copy}
        >
          {copied() ? <Check size={15} class="text-accent" /> : <Copy size={15} />}
        </button>
        <button
          type="button"
          class="icon-btn"
          title={`Hide row preview${toggleHint()}`}
          onClick={toggleInspector}
        >
          <PanelRightClose size={16} />
        </button>
      </div>
      <div class="min-h-0 flex-1 overflow-auto">
        <Show
          when={(() => {
            const p = preview();
            return p.kind === "row" ? p.tokens : null;
          })()}
          fallback={
            <div class="flex h-full items-center justify-center px-6 text-center text-sm text-muted">
              {(() => {
                const p = preview();
                return p.kind === "many"
                  ? `${p.count} rows selected. Select a single row to preview it.`
                  : "No row selected";
              })()}
            </div>
          }
        >
          {(tokens) => (
            <pre class="inspector-code">
              <For each={tokens()}>
                {(t) => (t.kind === "punct" ? t.text : <span class={tokenClass(t)}>{t.text}</span>)}
              </For>
            </pre>
          )}
        </Show>
      </div>
    </aside>
  );
}
