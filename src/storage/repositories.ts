import type { AppSettings } from "../domain/settings";
import type { DatabaseMeta, TableDoc, TableMeta } from "../domain/types";
import { appKeys, disablePersistence, readJson, removeKey, writeJson } from "./kv";

/** Index of every database and table (metadata only, no row data). */
export interface WorkspaceIndex {
  databaseOrder: string[];
  databases: Record<string, DatabaseMeta>;
  tables: Record<string, TableMeta>;
}

export type TabRef = { kind: "table"; tableId: string } | { kind: "settings" };

export interface CursorPos {
  rowId: string;
  columnId: string;
}

export interface UiState {
  tabs: TabRef[];
  activeTab: string | null;
  sidebarCollapsed: boolean;
  sidebarWidth: number;
  expandedDatabases: Record<string, boolean>;
  trashExpanded: boolean;
  cursors: Record<string, CursorPos>;
  inspectorOpen: boolean;
  inspectorWidth: number;
  inspectorFormat: "json" | "yaml" | "edn";
}

export type KeymapOverrides = Record<string, string | null>;

const KEYS = {
  index: "index",
  ui: "ui",
  settings: "settings",
  keymap: "keymap",
  table: (id: string) => `table:${id}`,
} as const;

export const TABLE_KEY_PREFIX = "table:";

export const indexRepo = {
  key: KEYS.index,
  load: () => readJson<WorkspaceIndex>(KEYS.index),
  save: (index: WorkspaceIndex) => writeJson(KEYS.index, index),
};

export const tableRepo = {
  key: KEYS.table,
  load: (id: string) => readJson<TableDoc>(KEYS.table(id)),
  save: (doc: TableDoc) => writeJson(KEYS.table(doc.id), doc),
  remove: (id: string) => removeKey(KEYS.table(id)),
  /** Rough serialized size; used to warn before imports. */
  size: (doc: TableDoc) => JSON.stringify(doc).length,
};

export const uiRepo = {
  load: () => readJson<UiState>(KEYS.ui),
  save: (ui: UiState) => writeJson(KEYS.ui, ui),
};

export const settingsRepo = {
  key: KEYS.settings,
  load: () => readJson<AppSettings>(KEYS.settings),
  save: (s: AppSettings) => writeJson(KEYS.settings, s),
};

export const keymapRepo = {
  key: KEYS.keymap,
  load: () => readJson<KeymapOverrides>(KEYS.keymap),
  save: (k: KeymapOverrides) => writeJson(KEYS.keymap, k),
};

/** Full backup of everything the app stores. */
export interface Backup {
  app: "sheets";
  version: 1;
  exportedAt: string;
  entries: Record<string, unknown>;
}

export function createBackup(): Backup {
  const entries: Record<string, unknown> = {};
  for (const key of appKeys()) entries[key] = readJson(key);
  return { app: "sheets", version: 1, exportedAt: new Date().toISOString(), entries };
}

export function restoreBackup(backup: Backup): void {
  if (backup?.app !== "sheets" || backup.version !== 1 || typeof backup.entries !== "object") {
    throw new Error("This file is not a Sheets backup.");
  }
  clearAll();
  for (const [key, value] of Object.entries(backup.entries)) writeJson(key, value);
  disablePersistence();
}

export function clearAll(): void {
  for (const key of appKeys()) removeKey(key);
}

/** Deletes everything and blocks further writes until reload. */
export function resetEverything(): void {
  clearAll();
  disablePersistence();
}
