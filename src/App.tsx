import { type RouteSectionProps, useLocation, useNavigate } from "@solidjs/router";
import { createEffect, createSignal, onCleanup, Show } from "solid-js";
import { Sidebar } from "./components/sidebar/Sidebar";
import { TabBar } from "./components/tabs/TabBar";
import { DialogHost } from "./components/ui/DialogHost";
import { FileUp } from "./components/ui/icons";
import { MenuHost } from "./components/ui/MenuHost";
import { menu } from "./components/ui/menu";
import { Toasts } from "./components/ui/Toasts";
import { exportTarget, importFile, importTableFromPicker } from "./services/importExport";
import { onExternalChange } from "./storage/kv";
import { TABLE_KEY_PREFIX } from "./storage/repositories";
import { isDialogOpen } from "./stores/dialogs";
import {
  type ActionId,
  dispatchAction,
  isRecording,
  matchAction,
  registerAction,
  reloadKeymap,
} from "./stores/keymap";
import { reloadSettings } from "./stores/settings";
import {
  closeTab,
  cycleTab,
  openSettings,
  openTable,
  pruneTabs,
  SETTINGS_TAB,
  toggleSidebar,
  ui,
} from "./stores/ui";
import {
  createTable,
  flushAllSessions,
  getTable,
  handleExternalTableChange,
  liveDatabases,
  reloadIndex,
} from "./stores/workspace";

const activeTableId = () => (ui.activeTab && ui.activeTab !== SETTINGS_TAB ? ui.activeTab : null);
const activeDatabaseId = () => {
  const id = activeTableId();
  return (id && getTable(id)?.databaseId) || liveDatabases()[0]?.id;
};

/** Keeps the URL and the active tab in step. */
function useRouteSync(): void {
  const navigate = useNavigate();
  const location = useLocation();
  createEffect(() => {
    const id = ui.activeTab;
    const path = !id ? "/" : id === SETTINGS_TAB ? "/settings" : `/t/${id}`;
    if (location.pathname !== path) navigate(path);
  });
}

function useGlobalShortcuts(): void {
  const appActions: Partial<Record<ActionId, () => void>> = {
    nextTab: () => cycleTab(1),
    prevTab: () => cycleTab(-1),
    closeTab: () => ui.activeTab && closeTab(ui.activeTab),
    toggleSidebar,
    openSettings,
    newTable: () => {
      const db = activeDatabaseId();
      if (db) openTable(createTable(db));
    },
    importTable: () => void importTableFromPicker(activeDatabaseId()),
    exportTable: () => {
      const id = activeTableId();
      if (id) exportTarget({ kind: "table", tableId: id });
    },
  };
  for (const [id, fn] of Object.entries(appActions))
    onCleanup(
      registerAction(id as ActionId, () => {
        fn();
        return true;
      }),
    );

  const onKey = (e: KeyboardEvent) => {
    if (isRecording() || isDialogOpen() || menu()) return;
    const action = matchAction(e);
    if (action && dispatchAction(action, e)) {
      e.preventDefault();
      e.stopPropagation();
    }
  };
  window.addEventListener("keydown", onKey, true);
  onCleanup(() => window.removeEventListener("keydown", onKey, true));
}

/** Another window wrote to storage: pull the change in. */
function useCrossWindowSync(): void {
  onCleanup(
    onExternalChange((key) => {
      if (key === null) location.reload();
      else if (key === "index") {
        reloadIndex();
        pruneTabs();
      } else if (key.startsWith(TABLE_KEY_PREFIX))
        handleExternalTableChange(key.slice(TABLE_KEY_PREFIX.length));
      else if (key === "settings") reloadSettings();
      else if (key === "keymap") reloadKeymap();
    }),
  );
  const flush = () => flushAllSessions();
  window.addEventListener("beforeunload", flush);
  onCleanup(() => window.removeEventListener("beforeunload", flush));
}

/** Drop a file anywhere to import it. */
function useFileDrop() {
  const [dragging, setDragging] = createSignal(false);
  let depth = 0;
  const hasFiles = (e: DragEvent) => e.dataTransfer?.types.includes("Files") ?? false;
  const enter = (e: DragEvent) => {
    if (!hasFiles(e)) return;
    depth++;
    setDragging(true);
  };
  const leave = (e: DragEvent) => {
    if (!hasFiles(e)) return;
    depth = Math.max(0, depth - 1);
    if (!depth) setDragging(false);
  };
  const over = (e: DragEvent) => hasFiles(e) && e.preventDefault();
  const drop = (e: DragEvent) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    depth = 0;
    setDragging(false);
    const file = e.dataTransfer?.files[0];
    if (file) void importFile(file, activeDatabaseId());
  };
  window.addEventListener("dragenter", enter);
  window.addEventListener("dragleave", leave);
  window.addEventListener("dragover", over);
  window.addEventListener("drop", drop);
  onCleanup(() => {
    window.removeEventListener("dragenter", enter);
    window.removeEventListener("dragleave", leave);
    window.removeEventListener("dragover", over);
    window.removeEventListener("drop", drop);
  });
  return dragging;
}

export function App(props: RouteSectionProps) {
  useRouteSync();
  useGlobalShortcuts();
  useCrossWindowSync();
  const dragging = useFileDrop();

  return (
    <div class="flex h-screen w-screen overflow-hidden bg-bg text-fg">
      <Show when={!ui.sidebarCollapsed}>
        <Sidebar />
      </Show>
      <main class="flex min-w-0 flex-1 flex-col">
        <TabBar />
        <div class="min-h-0 flex-1">{props.children}</div>
      </main>
      <Show when={dragging()}>
        <div class="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-accent/10 ring-4 ring-accent/50 ring-inset">
          <div class="flex items-center gap-2 rounded-lg bg-panel px-4 py-3 shadow-xl">
            <FileUp size={18} class="text-accent" /> Drop to import (CSV, JSON, JSONL, YAML, EDN, EDNL,
            SQLite)
          </div>
        </div>
      </Show>
      <MenuHost />
      <DialogHost />
      <Toasts />
    </div>
  );
}
