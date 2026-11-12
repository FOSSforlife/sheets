import { For, Show } from "solid-js";
import { settings } from "../../stores/settings";
import { setUi, ui } from "../../stores/ui";
import {
  emptyTrash,
  purgeDatabase,
  purgeTable,
  restoreDatabase,
  restoreTable,
  trashEntries,
} from "../../stores/workspace";
import { confirm } from "../modals/confirm";
import { ChevronRight, Database, RotateCcw, Sheet, Trash2, X } from "../ui/icons";

async function confirmPurge(what: string): Promise<boolean> {
  if (!settings.confirmPermanentDelete) return true;
  return confirm({
    title: "Delete forever?",
    message: `${what} will be permanently deleted. This can't be undone.`,
    confirmLabel: "Delete forever",
    danger: true,
  });
}

function TrashActions(props: { onRestore: () => void; onPurge: () => void }) {
  return (
    <span class="row-actions">
      <button type="button" class="icon-btn icon-btn-sm" title="Restore" onClick={props.onRestore}>
        <RotateCcw size={13} />
      </button>
      <button type="button" class="icon-btn icon-btn-sm" title="Delete forever" onClick={props.onPurge}>
        <X size={13} />
      </button>
    </span>
  );
}

/** The "Deleted" area: restore or permanently delete. Items here can't be opened. */
export function DeletedSection() {
  const entries = () => trashEntries();
  const count = () => entries().reduce((n, e) => n + 1 + e.children.length, 0);

  return (
    <div class="border-t border-line text-sm">
      <div class="tree-row group" onClick={() => setUi("trashExpanded", !ui.trashExpanded)}>
        <ChevronRight
          size={14}
          class="shrink-0 text-muted transition-transform"
          classList={{ "rotate-90": ui.trashExpanded }}
        />
        <Trash2 size={14} class="shrink-0 text-muted" />
        <span class="flex-1 text-muted">Deleted</span>
        <Show when={count() > 0}>
          <span class="text-xs text-muted">{count()}</span>
        </Show>
      </div>
      <Show when={ui.trashExpanded}>
        <div class="max-h-64 overflow-y-auto pb-1">
          <Show when={entries().length === 0}>
            <div class="tree-child px-3 py-1 text-xs text-muted">Nothing here</div>
          </Show>
          <For each={entries()}>
            {(e) => (
              <>
                <div class="tree-row tree-child group text-muted">
                  {e.kind === "database" ? (
                    <Database size={14} class="shrink-0" />
                  ) : (
                    <Sheet size={14} class="shrink-0" />
                  )}
                  <span class="flex-1 truncate line-through decoration-muted/50">{e.name}</span>
                  <TrashActions
                    onRestore={() => (e.kind === "database" ? restoreDatabase(e.id) : restoreTable(e.id))}
                    onPurge={async () => {
                      if (
                        !(await confirmPurge(
                          `“${e.name}”${e.kind === "database" ? " and all its tables" : ""}`,
                        ))
                      )
                        return;
                      if (e.kind === "database") purgeDatabase(e.id);
                      else purgeTable(e.id);
                    }}
                  />
                </div>
                <For each={e.children}>
                  {(t) => (
                    <div class="tree-row tree-grandchild group text-muted">
                      <Sheet size={14} class="shrink-0" />
                      <span class="flex-1 truncate">{t.name}</span>
                      <TrashActions
                        onRestore={() => restoreTable(t.id)}
                        onPurge={async () => {
                          if (await confirmPurge(`“${t.name}”`)) purgeTable(t.id);
                        }}
                      />
                    </div>
                  )}
                </For>
              </>
            )}
          </For>
          <Show when={entries().length > 0}>
            <button
              type="button"
              class="mx-3 my-1 text-xs text-danger hover:underline"
              onClick={async () => {
                if (await confirmPurge("Everything in Deleted")) emptyTrash();
              }}
            >
              Empty trash
            </button>
          </Show>
        </div>
      </Show>
    </div>
  );
}
