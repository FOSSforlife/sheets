import { createSignal, For, Show } from "solid-js";
import { importDatabaseFromPicker } from "../../services/importExport";
import { bindingFor, formatBinding } from "../../stores/keymap";
import { setUi, toggleSidebar, ui } from "../../stores/ui";
import { createDatabase, index, liveDatabases, reorderDatabases } from "../../stores/workspace";
import { Database, DatabaseZap, PanelLeftClose, Plus, Upload } from "../ui/icons";
import { DatabaseNode } from "./DatabaseNode";
import { DeletedSection } from "./DeletedSection";

/** Left sidebar: databases → tables, plus Deleted. Collapsible and resizable. */
export function Sidebar() {
  const [renamingDb, setRenamingDb] = createSignal<string | null>(null);

  const addDatabase = () => {
    const id = createDatabase();
    setRenamingDb(id);
  };

  const startResize = (e: MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = ui.sidebarWidth;
    const move = (ev: MouseEvent) =>
      setUi("sidebarWidth", Math.max(180, Math.min(520, startW + ev.clientX - startX)));
    const up = () => {
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
      document.body.classList.remove("resizing");
    };
    document.body.classList.add("resizing");
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
  };

  const toggleHint = () => {
    const b = bindingFor("toggleSidebar");
    return b ? ` (${formatBinding(b)})` : "";
  };

  return (
    <aside
      class="relative flex h-full shrink-0 flex-col border-r border-line bg-sidebar"
      style={{ width: `${ui.sidebarWidth}px` }}
    >
      <div class="flex items-center gap-1 border-b border-line px-2 py-2">
        <DatabaseZap size={16} class="ml-1 text-accent" />
        <span class="flex-1 font-semibold tracking-tight">Sheets</span>
        <button type="button" class="icon-btn" title="New database" onClick={addDatabase}>
          <Plus size={16} />
        </button>
        <button
          type="button"
          class="icon-btn"
          title="Import SQLite database…"
          onClick={() => void importDatabaseFromPicker()}
        >
          <Upload size={15} />
        </button>
        <button
          type="button"
          class="icon-btn"
          title={`Collapse sidebar${toggleHint()}`}
          onClick={toggleSidebar}
        >
          <PanelLeftClose size={16} />
        </button>
      </div>

      <nav class="flex-1 overflow-y-auto py-1 text-sm">
        <For each={liveDatabases()}>
          {(db) => (
            <DatabaseNode
              db={db}
              renaming={renamingDb() === db.id}
              onRenameStart={() => setRenamingDb(db.id)}
              onRenameEnd={() => setRenamingDb(null)}
              onReorder={(dragId, before) => {
                const order = index.databaseOrder.filter((id) => id !== dragId);
                const at = before ? order.indexOf(db.id) : order.indexOf(db.id) + 1;
                order.splice(at, 0, dragId);
                reorderDatabases(order);
              }}
            />
          )}
        </For>
        <Show when={liveDatabases().length === 0}>
          <button
            type="button"
            class="mx-3 mt-2 flex items-center gap-2 text-muted hover:text-fg"
            onClick={addDatabase}
          >
            <Database size={14} /> Create a database
          </button>
        </Show>
      </nav>

      <DeletedSection />

      <div class="sidebar-resizer" onMouseDown={startResize} title="Drag to resize" />
    </aside>
  );
}
