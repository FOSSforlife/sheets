import { createSignal, For, Show } from "solid-js";
import { exportTarget, importTableFromPicker } from "../../services/importExport";
import { settings } from "../../stores/settings";
import { activateTab, closeTab, moveTab, SETTINGS_TAB, tabId, toggleSidebar, ui } from "../../stores/ui";
import { getTable, index } from "../../stores/workspace";
import { Download, Ellipsis, PanelLeftOpen, Settings, Sheet, Upload, X } from "../ui/icons";
import { openMenuBelow } from "../ui/menu";

const DRAG_TAB = "application/x-sheets-tab";

/** Tabs across the top: reorder by dragging, middle-click or × to close, ⋯ for table actions. */
export function TabBar() {
  const [dropIndex, setDropIndex] = createSignal<number | null>(null);

  const label = (id: string) => (id === SETTINGS_TAB ? "Settings" : (getTable(id)?.name ?? "…"));
  const subtitle = (id: string) => {
    const t = getTable(id);
    return t ? index.databases[t.databaseId]?.name : undefined;
  };

  const moreMenu = (e: MouseEvent) => {
    const id = ui.activeTab;
    if (!id || id === SETTINGS_TAB) return;
    const t = getTable(id);
    openMenuBelow(
      [
        {
          label: "Export table…",
          icon: () => <Download size={14} />,
          action: () => exportTarget({ kind: "table", tableId: id }),
        },
        {
          label: "Import table…",
          icon: () => <Upload size={14} />,
          action: () => void importTableFromPicker(t?.databaseId),
        },
        {
          label: "Export database…",
          icon: () => <Download size={14} />,
          action: () => t && exportTarget({ kind: "database", databaseId: t.databaseId }),
        },
      ],
      (e.currentTarget as HTMLElement).getBoundingClientRect(),
    );
  };

  return (
    <div class="flex h-9 shrink-0 items-stretch border-b border-line bg-sidebar">
      <Show when={ui.sidebarCollapsed}>
        <button type="button" class="icon-btn mx-1 self-center" title="Show sidebar" onClick={toggleSidebar}>
          <PanelLeftOpen size={16} />
        </button>
      </Show>
      <div
        class="tab-strip flex flex-1 items-stretch overflow-x-auto"
        classList={{ "single-tab": !settings.tabsEnabled }}
      >
        <For each={ui.tabs}>
          {(tab, i) => {
            const id = tabId(tab);
            return (
              <div
                class="tab group"
                classList={{ active: ui.activeTab === id, "drop-before": dropIndex() === i() }}
                title={subtitle(id) ? `${subtitle(id)} / ${label(id)}` : label(id)}
                draggable={settings.tabsEnabled}
                onDragStart={(e) => e.dataTransfer?.setData(DRAG_TAB, id)}
                onDragOver={(e) => {
                  if (e.dataTransfer?.types.includes(DRAG_TAB)) {
                    e.preventDefault();
                    setDropIndex(i());
                  }
                }}
                onDragLeave={() => setDropIndex(null)}
                onDrop={(e) => {
                  setDropIndex(null);
                  const from = e.dataTransfer?.getData(DRAG_TAB);
                  if (!from) return;
                  const fromIdx = ui.tabs.findIndex((t) => tabId(t) === from);
                  moveTab(from, fromIdx < i() ? i() - 1 : i());
                }}
                onMouseDown={(e) => {
                  if (e.button === 1) {
                    e.preventDefault();
                    closeTab(id);
                  }
                }}
                onClick={() => activateTab(id)}
              >
                {id === SETTINGS_TAB ? (
                  <Settings size={13} class="shrink-0" />
                ) : (
                  <Sheet size={13} class="shrink-0 text-table" />
                )}
                <span class="truncate">{label(id)}</span>
                <Show when={settings.tabsEnabled}>
                  <button
                    type="button"
                    class="tab-close"
                    title="Close tab"
                    onClick={(e) => {
                      e.stopPropagation();
                      closeTab(id);
                    }}
                  >
                    <X size={12} />
                  </button>
                </Show>
              </div>
            );
          }}
        </For>
      </div>
      <Show when={ui.activeTab && ui.activeTab !== SETTINGS_TAB}>
        <button type="button" class="icon-btn mx-1 self-center" title="Table actions" onClick={moreMenu}>
          <Ellipsis size={16} />
        </button>
      </Show>
    </div>
  );
}
