import { createEffect, createRoot } from "solid-js";
import { createStore, produce } from "solid-js/store";
import { type CursorPos, type TabRef, type UiState, uiRepo } from "../storage/repositories";
import { settings } from "./settings";
import { isTableLive, onTablesRemoved, releaseSession } from "./workspace";

/** Open tabs, the active tab, and sidebar layout. Persisted so the session restores on reload. */

const DEFAULTS: UiState = {
  tabs: [],
  activeTab: null,
  sidebarCollapsed: false,
  sidebarWidth: 260,
  expandedDatabases: {},
  trashExpanded: false,
  cursors: {},
};

const [ui, setUi] = createStore<UiState>({ ...DEFAULTS, ...uiRepo.load() });

export { setUi, ui };

export const SETTINGS_TAB = "settings";

export function tabId(t: TabRef): string {
  return t.kind === "settings" ? SETTINGS_TAB : t.tableId;
}

function tableTabsReleased(ids: string[]): void {
  for (const id of ids) releaseSession(id);
}

/** Adds (or focuses) a tab. With tabs disabled the tab replaces whatever was open. */
function openTab(ref: TabRef): void {
  const id = tabId(ref);
  setUi(
    produce((u) => {
      if (!settings.tabsEnabled) {
        const dropped = u.tabs.filter((t) => tabId(t) !== id && t.kind === "table");
        tableTabsReleased(dropped.map(tabId));
        u.tabs = [ref];
      } else if (!u.tabs.some((t) => tabId(t) === id)) {
        const at = u.tabs.findIndex((t) => tabId(t) === u.activeTab);
        u.tabs.splice(at === -1 ? u.tabs.length : at + 1, 0, ref);
      }
      u.activeTab = id;
    }),
  );
}

export function openTable(tableId: string): void {
  if (isTableLive(tableId)) openTab({ kind: "table", tableId });
}

export function openSettings(): void {
  openTab({ kind: "settings" });
}

export function activateTab(id: string): void {
  if (ui.tabs.some((t) => tabId(t) === id)) setUi("activeTab", id);
}

export function closeTab(id: string): void {
  const idx = ui.tabs.findIndex((t) => tabId(t) === id);
  if (idx === -1) return;
  setUi(
    produce((u) => {
      u.tabs.splice(idx, 1);
      if (u.activeTab === id) {
        const next = u.tabs[idx] ?? u.tabs[idx - 1];
        u.activeTab = next ? tabId(next) : null;
      }
    }),
  );
  if (id !== SETTINGS_TAB) releaseSession(id);
}

export function moveTab(fromId: string, toIndex: number): void {
  setUi(
    produce((u) => {
      const from = u.tabs.findIndex((t) => tabId(t) === fromId);
      if (from === -1) return;
      const [tab] = u.tabs.splice(from, 1);
      u.tabs.splice(Math.max(0, Math.min(toIndex, u.tabs.length)), 0, tab!);
    }),
  );
}

export function cycleTab(delta: 1 | -1): void {
  const n = ui.tabs.length;
  if (n < 2) return;
  const idx = ui.tabs.findIndex((t) => tabId(t) === ui.activeTab);
  const next = ui.tabs[(idx + delta + n) % n]!;
  setUi("activeTab", tabId(next));
}

export function setCursor(tableId: string, pos: CursorPos): void {
  setUi("cursors", tableId, pos);
}

export function toggleSidebar(): void {
  setUi("sidebarCollapsed", (c) => !c);
}

export function setDatabaseExpanded(dbId: string, expanded: boolean): void {
  setUi("expandedDatabases", dbId, expanded);
}

export function isDatabaseExpanded(dbId: string): boolean {
  return ui.expandedDatabases[dbId] ?? true;
}

/** Removes tabs whose tables no longer exist or are in Deleted. */
export function pruneTabs(): void {
  const dead = ui.tabs.filter((t) => t.kind === "table" && !isTableLive(t.tableId)).map(tabId);
  for (const id of dead) closeTab(id);
}

createRoot(() => {
  onTablesRemoved((ids) => {
    for (const id of ids) closeTab(id);
  });

  createEffect(() => {
    const snapshot = JSON.parse(JSON.stringify(ui)) as UiState;
    try {
      uiRepo.save(snapshot);
    } catch {
      // UI state is best-effort; table data errors are surfaced elsewhere.
    }
  });

  // Turning tabs off collapses to the active tab.
  createEffect(() => {
    if (settings.tabsEnabled || ui.tabs.length <= 1) return;
    const keep = ui.tabs.find((t) => tabId(t) === ui.activeTab);
    const dropped = ui.tabs.filter((t) => t !== keep).map(tabId);
    setUi("tabs", keep ? [keep] : []);
    tableTabsReleased(dropped.filter((id) => id !== SETTINGS_TAB));
  });
});
