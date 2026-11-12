import type { CellValue, Column, Row, TableDoc } from "./types";

/**
 * Primitive, invertible edits to a TableDoc. Applying an op mutates the doc and returns the op
 * that undoes it. Undo/redo, persistence and view syncing are all built on these.
 */
export type Op =
  | { kind: "setCells"; changes: CellChange[] }
  | { kind: "insertRows"; index: number; rows: Row[] }
  | { kind: "removeRows"; rowIds: string[] }
  | { kind: "insertColumn"; index: number; column: Column; values?: Record<string, CellValue> }
  | { kind: "removeColumn"; columnId: string }
  | { kind: "updateColumn"; columnId: string; patch: Partial<Omit<Column, "id">> }
  | { kind: "moveColumn"; columnId: string; toIndex: number }
  | { kind: "reorderRows"; order: string[] };

export interface CellChange {
  rowId: string;
  columnId: string;
  value: CellValue;
}

/** Restoring removed rows needs their original positions, so removals invert to positioned inserts. */
type InsertAt = { kind: "insertRowsAt"; entries: { index: number; row: Row }[] };
export type AnyOp = Op | InsertAt;

function rowIndexMap(doc: TableDoc): Map<string, number> {
  const map = new Map<string, number>();
  doc.rows.forEach((r, i) => {
    map.set(r.id, i);
  });
  return map;
}

export function applyOp(doc: TableDoc, op: AnyOp): AnyOp {
  switch (op.kind) {
    case "setCells": {
      const idx = rowIndexMap(doc);
      const inverse: CellChange[] = [];
      for (const ch of op.changes) {
        const i = idx.get(ch.rowId);
        if (i === undefined) continue;
        const row = doc.rows[i]!;
        inverse.push({ rowId: ch.rowId, columnId: ch.columnId, value: row.cells[ch.columnId] ?? null });
        if (ch.value === null) delete row.cells[ch.columnId];
        else row.cells[ch.columnId] = ch.value;
      }
      return { kind: "setCells", changes: inverse.reverse() };
    }
    case "insertRows": {
      const index = Math.max(0, Math.min(op.index, doc.rows.length));
      const rows = op.rows.map(cloneRow);
      doc.rows.splice(index, 0, ...rows);
      return { kind: "removeRows", rowIds: rows.map((r) => r.id) };
    }
    case "insertRowsAt": {
      const sorted = [...op.entries].sort((a, b) => a.index - b.index);
      for (const e of sorted) doc.rows.splice(Math.min(e.index, doc.rows.length), 0, cloneRow(e.row));
      return { kind: "removeRows", rowIds: sorted.map((e) => e.row.id) };
    }
    case "removeRows": {
      const ids = new Set(op.rowIds);
      const entries: { index: number; row: Row }[] = [];
      doc.rows.forEach((row, index) => {
        if (ids.has(row.id)) entries.push({ index, row });
      });
      doc.rows = doc.rows.filter((r) => !ids.has(r.id));
      return { kind: "insertRowsAt", entries };
    }
    case "insertColumn": {
      const index = Math.max(0, Math.min(op.index, doc.columns.length));
      doc.columns.splice(index, 0, { ...op.column });
      if (op.values) {
        for (const row of doc.rows) {
          const v = op.values[row.id];
          if (v !== undefined && v !== null) row.cells[op.column.id] = v;
        }
      }
      return { kind: "removeColumn", columnId: op.column.id };
    }
    case "removeColumn": {
      const index = doc.columns.findIndex((c) => c.id === op.columnId);
      if (index === -1) return { kind: "setCells", changes: [] };
      const [column] = doc.columns.splice(index, 1);
      const values: Record<string, CellValue> = {};
      for (const row of doc.rows) {
        const v = row.cells[op.columnId];
        if (v !== undefined) {
          values[row.id] = v;
          delete row.cells[op.columnId];
        }
      }
      return { kind: "insertColumn", index, column: column!, values };
    }
    case "updateColumn": {
      const col = doc.columns.find((c) => c.id === op.columnId);
      if (!col) return { kind: "setCells", changes: [] };
      const prev: Partial<Column> = {};
      for (const key of Object.keys(op.patch) as (keyof Omit<Column, "id">)[]) {
        (prev as any)[key] = col[key];
        (col as any)[key] = op.patch[key];
      }
      return { kind: "updateColumn", columnId: op.columnId, patch: prev };
    }
    case "moveColumn": {
      const from = doc.columns.findIndex((c) => c.id === op.columnId);
      if (from === -1) return { kind: "setCells", changes: [] };
      const [col] = doc.columns.splice(from, 1);
      doc.columns.splice(Math.max(0, Math.min(op.toIndex, doc.columns.length)), 0, col!);
      return { kind: "moveColumn", columnId: op.columnId, toIndex: from };
    }
    case "reorderRows": {
      const prevOrder = doc.rows.map((r) => r.id);
      const byId = new Map(doc.rows.map((r) => [r.id, r]));
      const next = op.order.map((id) => byId.get(id)).filter((r): r is Row => !!r);
      const seen = new Set(op.order);
      for (const r of doc.rows) if (!seen.has(r.id)) next.push(r);
      doc.rows = next;
      return { kind: "reorderRows", order: prevOrder };
    }
  }
}

/** Applies ops in order; returns the inverse ops in undo order. */
export function applyOps(doc: TableDoc, ops: AnyOp[]): AnyOp[] {
  const inverses = ops.map((op) => applyOp(doc, op));
  return inverses.reverse();
}

function cloneRow(r: Row): Row {
  return { id: r.id, cells: { ...r.cells } };
}

/** Whether an op changes the column structure (and so needs a full grid column refresh). */
export function isStructural(op: AnyOp): boolean {
  return op.kind !== "setCells";
}
