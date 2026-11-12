import { batch, createSignal } from "solid-js";
import { createStore, produce, reconcile } from "solid-js/store";
import { newId } from "../domain/ids";
import { dedupeName, nextTableName } from "../domain/names";
import type { DatabaseMeta, TableDoc, TableMeta } from "../domain/types";
import { indexRepo, tableRepo, type WorkspaceIndex } from "../storage/repositories";
import { TableSession } from "./tableSession";
import { reportErrors } from "./toasts";

/**
 * The database/table index (metadata only) plus the registry of open table sessions.
 * Every mutation persists the index immediately; row data is persisted by each TableSession.
 */

const EMPTY: WorkspaceIndex = { databaseOrder: [], databases: {}, tables: {} };

const [index, setIndex] = createStore<WorkspaceIndex>(indexRepo.load() ?? structuredClone(EMPTY));

export { index };

function persist(): void {
  reportErrors(() => indexRepo.save(JSON.parse(JSON.stringify(index))));
}

function mutate(fn: (draft: WorkspaceIndex) => void): void {
  setIndex(produce(fn));
  persist();
}

// ---- events (so tabs can react without a circular dependency) ----

type RemovedListener = (tableIds: string[]) => void;
const removedListeners = new Set<RemovedListener>();
export function onTablesRemoved(fn: RemovedListener): () => void {
  removedListeners.add(fn);
  return () => removedListeners.delete(fn);
}
function emitRemoved(ids: string[]): void {
  if (ids.length) for (const fn of removedListeners) fn(ids);
}

// ---- queries ----

export function liveDatabases(): DatabaseMeta[] {
  return index.databaseOrder
    .map((id) => index.databases[id])
    .filter((d): d is DatabaseMeta => !!d && !d.deletedAt);
}

export function tablesOf(dbId: string, opts: { deleted?: boolean } = {}): TableMeta[] {
  const db = index.databases[dbId];
  if (!db) return [];
  return db.tableIds
    .map((id) => index.tables[id])
    .filter((t): t is TableMeta => !!t && (opts.deleted === undefined || !!t.deletedAt === opts.deleted));
}

export function getTable(id: string): TableMeta | undefined {
  return index.tables[id];
}

/** A table is openable if neither it nor its database is in Deleted. */
export function isTableLive(id: string): boolean {
  const t = index.tables[id];
  return !!t && !t.deletedAt && !index.databases[t.databaseId]?.deletedAt;
}

export interface TrashEntry {
  kind: "database" | "table";
  id: string;
  name: string;
  deletedAt: number;
  children: TableMeta[];
}

/** Deleted databases (with all their tables nested) and deleted tables of live databases. */
export function trashEntries(): TrashEntry[] {
  const out: TrashEntry[] = [];
  for (const id of index.databaseOrder) {
    const db = index.databases[id];
    if (!db) continue;
    if (db.deletedAt) {
      out.push({ kind: "database", id, name: db.name, deletedAt: db.deletedAt, children: tablesOf(id) });
    } else {
      for (const t of tablesOf(id, { deleted: true })) {
        out.push({ kind: "table", id: t.id, name: t.name, deletedAt: t.deletedAt!, children: [] });
      }
    }
  }
  return out.sort((a, b) => b.deletedAt - a.deletedAt);
}

/** Names of the live tables in a database (names only need to be unique among those). */
function siblingNames(dbId: string, exceptId?: string): string[] {
  return tablesOf(dbId, { deleted: false })
    .filter((t) => t.id !== exceptId)
    .map((t) => t.name);
}

function liveDbNames(exceptId?: string): string[] {
  return liveDatabases()
    .filter((d) => d.id !== exceptId)
    .map((d) => d.name);
}

// ---- documents & sessions ----

export function newTableDoc(id: string): TableDoc {
  return {
    id,
    columns: [{ id: newId("c"), name: "ColumnA", type: "untyped" }],
    rows: [{ id: newId("r"), cells: {} }],
  };
}

const sessions = new Map<string, TableSession>();

export function getSession(tableId: string): TableSession | null {
  const existing = sessions.get(tableId);
  if (existing) return existing;
  if (!index.tables[tableId]) return null;
  const doc = tableRepo.load(tableId) ?? newTableDoc(tableId);
  const session = new TableSession(doc);
  sessions.set(tableId, session);
  return session;
}

export function peekSession(tableId: string): TableSession | undefined {
  return sessions.get(tableId);
}

export function releaseSession(tableId: string): void {
  const s = sessions.get(tableId);
  if (!s) return;
  s.flush();
  sessions.delete(tableId);
}

/** Drops a session without saving (its table is being permanently deleted). */
function discardSession(tableId: string): void {
  sessions.get(tableId)?.discard();
  sessions.delete(tableId);
}

export function flushAllSessions(): void {
  for (const s of sessions.values()) s.flush();
}

/** Loads a table's doc, preferring the live session (which may have unsaved edits). */
export function loadDoc(tableId: string): TableDoc | null {
  const s = sessions.get(tableId);
  if (s) return s.doc;
  return tableRepo.load(tableId) ?? (index.tables[tableId] ? newTableDoc(tableId) : null);
}

// ---- mutations ----

export function createDatabase(name?: string): string {
  const id = newId("db");
  mutate((d) => {
    d.databases[id] = {
      id,
      name: dedupeName(name ?? "New Database", liveDbNames()),
      tableIds: [],
      createdAt: Date.now(),
      deletedAt: null,
    };
    d.databaseOrder.push(id);
  });
  return id;
}

/** Creates a table (optionally with contents) and persists its doc. */
export function createTable(dbId: string, name?: string, doc?: Omit<TableDoc, "id">): string {
  const id = newId("t");
  const fullDoc: TableDoc = doc ? { ...doc, id } : newTableDoc(id);
  tableRepo.save(fullDoc); // throws on quota: nothing is added to the index in that case
  const existing = siblingNames(dbId);
  mutate((d) => {
    d.tables[id] = {
      id,
      name: name ? dedupeName(name, existing) : nextTableName(existing),
      databaseId: dbId,
      createdAt: Date.now(),
      deletedAt: null,
    };
    d.databases[dbId]?.tableIds.push(id);
  });
  return id;
}

/** Returns an error message, or null on success. */
export function renameTable(id: string, rawName: string): string | null {
  const name = rawName.trim();
  const t = index.tables[id];
  if (!t) return "Table not found";
  if (!name) return "Name can't be empty";
  if (siblingNames(t.databaseId, id).includes(name)) return "A table with that name already exists";
  mutate((d) => {
    d.tables[id]!.name = name;
  });
  return null;
}

export function renameDatabase(id: string, rawName: string): string | null {
  const name = rawName.trim();
  if (!name) return "Name can't be empty";
  if (liveDbNames(id).includes(name)) return "A database with that name already exists";
  mutate((d) => {
    d.databases[id]!.name = name;
  });
  return null;
}

export function moveTable(tableId: string, toDbId: string, toIndex?: number): void {
  const t = index.tables[tableId];
  if (!t || !index.databases[toDbId]) return;
  const name = t.databaseId === toDbId ? t.name : dedupeName(t.name, siblingNames(toDbId));
  mutate((d) => {
    const from = d.databases[t.databaseId]!;
    from.tableIds = from.tableIds.filter((x) => x !== tableId);
    const to = d.databases[toDbId]!;
    const ids = to.tableIds.filter((x) => x !== tableId);
    ids.splice(toIndex ?? ids.length, 0, tableId);
    to.tableIds = ids;
    d.tables[tableId]!.databaseId = toDbId;
    d.tables[tableId]!.name = name;
  });
}

export function trashTable(id: string): void {
  mutate((d) => {
    d.tables[id]!.deletedAt = Date.now();
  });
  emitRemoved([id]);
}

export function trashDatabase(id: string): void {
  mutate((d) => {
    d.databases[id]!.deletedAt = Date.now();
  });
  emitRemoved(tablesOf(id).map((t) => t.id));
}

export function restoreDatabase(id: string): void {
  const db = index.databases[id];
  if (!db) return;
  const name = dedupeName(db.name, liveDbNames(id));
  mutate((d) => {
    d.databases[id]!.deletedAt = null;
    d.databases[id]!.name = name;
  });
}

/**
 * Restores a table. If its database is also deleted, the database comes back containing only this
 * table; its other (not individually deleted) tables stay in Deleted.
 */
export function restoreTable(id: string): void {
  const t = index.tables[id];
  if (!t) return;
  const db = index.databases[t.databaseId];
  batch(() => {
    if (db?.deletedAt) {
      const now = Date.now();
      const dbName = dedupeName(db.name, liveDbNames(db.id));
      mutate((d) => {
        for (const sib of tablesOf(db.id))
          if (sib.id !== id && !sib.deletedAt) d.tables[sib.id]!.deletedAt = now;
        d.databases[db.id]!.deletedAt = null;
        d.databases[db.id]!.name = dbName;
      });
    }
    const name = dedupeName(t.name, siblingNames(t.databaseId, id));
    mutate((d) => {
      d.tables[id]!.deletedAt = null;
      d.tables[id]!.name = name;
    });
  });
}

export function purgeTable(id: string): void {
  const t = index.tables[id];
  if (!t) return;
  discardSession(id);
  tableRepo.remove(id);
  mutate((d) => {
    const db = d.databases[t.databaseId];
    if (db) db.tableIds = db.tableIds.filter((x) => x !== id);
    delete d.tables[id];
  });
  emitRemoved([id]);
}

export function purgeDatabase(id: string): void {
  const ids = tablesOf(id).map((t) => t.id);
  for (const tid of ids) {
    discardSession(tid);
    tableRepo.remove(tid);
  }
  mutate((d) => {
    for (const tid of ids) delete d.tables[tid];
    delete d.databases[id];
    d.databaseOrder = d.databaseOrder.filter((x) => x !== id);
  });
  emitRemoved(ids);
}

export function emptyTrash(): void {
  for (const e of trashEntries()) {
    if (e.kind === "database") purgeDatabase(e.id);
    else purgeTable(e.id);
  }
}

export function reorderDatabases(order: string[]): void {
  mutate((d) => {
    d.databaseOrder = order;
  });
}

/** Ensures there's at least one database with one table. Returns a table id to open, if seeded. */
export function seedIfEmpty(): string | null {
  if (index.databaseOrder.length > 0) return null;
  const db = createDatabase("My Database");
  return createTable(db, "Table1");
}

/** Re-reads the index after another window changed it. */
export function reloadIndex(): void {
  setIndex(reconcile(indexRepo.load() ?? structuredClone(EMPTY)));
}

// ---- external (other window) changes to open tables ----

const [conflicts, setConflicts] = createSignal<Set<string>>(new Set());

export { conflicts };

export function handleExternalTableChange(tableId: string): void {
  const s = sessions.get(tableId);
  if (!s) return;
  const doc = tableRepo.load(tableId);
  if (!doc || JSON.stringify(doc) === s.lastSaved) return;
  if (s.editing) setConflicts((c) => new Set(c).add(tableId));
  else s.replaceDoc(doc);
}

export function resolveConflict(tableId: string, reload: boolean): void {
  setConflicts((c) => {
    const n = new Set(c);
    n.delete(tableId);
    return n;
  });
  const s = sessions.get(tableId);
  const doc = tableRepo.load(tableId);
  if (reload && s && doc) s.replaceDoc(doc);
}
