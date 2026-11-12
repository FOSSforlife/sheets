import { planConversion } from "../domain/conversion";
import { nowIso, todayIso } from "../domain/dates";
import { newId } from "../domain/ids";
import { narrowestCommonType } from "../domain/inference";
import { nextColumnName } from "../domain/names";
import type { AnyOp, CellChange } from "../domain/ops";
import type { FormatSettings } from "../domain/settings";
import type { CellValue, Column, ColumnType, ConcreteType, Row, TableDoc } from "../domain/types";
import { formatDisplay, inferTypeFromInput, normalizeInput, parseInput } from "../domain/values";

/**
 * Pure edit commands: (doc, args) → ops. They never mutate the doc; the TableSession applies the ops.
 * Coordinates are data indices (row index into doc.rows, column index into doc.columns).
 */

export interface CellRange {
  r0: number;
  c0: number;
  r1: number;
  c1: number;
}

export function normalizeRange(r: CellRange): CellRange {
  return {
    r0: Math.min(r.r0, r.r1),
    r1: Math.max(r.r0, r.r1),
    c0: Math.min(r.c0, r.c1),
    c1: Math.max(r.c0, r.c1),
  };
}

export function emptyRow(): Row {
  return { id: newId("r"), cells: {} };
}

export function newColumn(doc: TableDoc, extraNames: string[] = []): Column {
  return {
    id: newId("c"),
    name: nextColumnName([...doc.columns.map((c) => c.name), ...extraNames]),
    type: "untyped",
  };
}

// ---- cell input ----

export type InputResult = { ok: true; ops: AnyOp[] } | { ok: false; error: string };

/** Commits text typed into a cell. Untyped columns get their type inferred from the first value. */
export function commitInput(
  doc: TableDoc,
  rowId: string,
  columnId: string,
  text: string,
  fmt: FormatSettings,
): InputResult {
  const col = doc.columns.find((c) => c.id === columnId);
  const row = doc.rows.find((r) => r.id === rowId);
  if (!col || !row) return { ok: true, ops: [] };
  const current = row.cells[columnId] ?? null;
  const normalized = normalizeInput(text);

  if (col.type === "untyped") {
    if (normalized === null) return { ok: true, ops: [] };
    const type = inferTypeFromInput(normalized, fmt);
    const parsed = parseInput(normalized, type, fmt);
    if (!parsed.ok) return parsed;
    return {
      ok: true,
      ops: [
        { kind: "updateColumn", columnId, patch: { type } },
        { kind: "setCells", changes: [{ rowId, columnId, value: parsed.value }] },
      ],
    };
  }
  const parsed = parseInput(text, col.type, fmt);
  if (!parsed.ok) return parsed;
  if (parsed.value === current) return { ok: true, ops: [] };
  return { ok: true, ops: [{ kind: "setCells", changes: [{ rowId, columnId, value: parsed.value }] }] };
}

/** Sets a concrete value directly (checkbox toggles, insert today/now). */
export function setValueOps(doc: TableDoc, changes: CellChange[], inferType?: ConcreteType): AnyOp[] {
  const ops: AnyOp[] = [];
  if (inferType) {
    const untyped = new Set(changes.map((c) => c.columnId));
    for (const col of doc.columns) {
      if (untyped.has(col.id) && col.type === "untyped") {
        ops.push({ kind: "updateColumn", columnId: col.id, patch: { type: inferType } });
      }
    }
  }
  ops.push({ kind: "setCells", changes });
  return ops;
}

export function todayValue(type: ColumnType): CellValue {
  return type === "datetime" ? nowIso() : todayIso();
}

// ---- ranges ----

export function clearRangeOps(doc: TableDoc, range: CellRange): AnyOp[] {
  const r = normalizeRange(range);
  const changes: CellChange[] = [];
  for (let ri = r.r0; ri <= r.r1; ri++) {
    const row = doc.rows[ri];
    if (!row) continue;
    for (let ci = r.c0; ci <= r.c1; ci++) {
      const col = doc.columns[ci];
      if (col && row.cells[col.id] != null) changes.push({ rowId: row.id, columnId: col.id, value: null });
    }
  }
  return changes.length ? [{ kind: "setCells", changes }] : [];
}

/** Space on bools: if every non-null selected bool is true → false, else → true. */
export function toggleBoolOps(doc: TableDoc, range: CellRange): AnyOp[] {
  const r = normalizeRange(range);
  const cells: { rowId: string; columnId: string; value: CellValue }[] = [];
  for (let ri = r.r0; ri <= r.r1; ri++) {
    for (let ci = r.c0; ci <= r.c1; ci++) {
      const row = doc.rows[ri];
      const col = doc.columns[ci];
      if (row && col?.type === "bool")
        cells.push({ rowId: row.id, columnId: col.id, value: row.cells[col.id] ?? null });
    }
  }
  if (!cells.length) return [];
  const allTrue = cells.every((c) => c.value === true);
  return [{ kind: "setCells", changes: cells.map((c) => ({ ...c, value: !allTrue })) }];
}

export function rangeToMatrix(doc: TableDoc, range: CellRange, fmt: FormatSettings): string[][] {
  const r = normalizeRange(range);
  const out: string[][] = [];
  for (let ri = r.r0; ri <= r.r1; ri++) {
    const row = doc.rows[ri];
    if (!row) continue;
    const line: string[] = [];
    for (let ci = r.c0; ci <= r.c1; ci++) {
      const col = doc.columns[ci];
      if (!col) continue;
      const v = row.cells[col.id] ?? null;
      line.push(col.type === "bool" && v !== null ? (v ? "TRUE" : "FALSE") : formatDisplay(v, col.type, fmt));
    }
    out.push(line);
  }
  return out;
}

// ---- paste ----

export interface PastePlan {
  ops: AnyOp[];
  /** Values that don't fit their (existing) column type and would become null. */
  mismatches: number;
  /** Selection covering the pasted area afterwards. */
  target: CellRange;
}

export function planPaste(
  doc: TableDoc,
  selection: CellRange,
  matrix: string[][],
  fmt: FormatSettings,
): PastePlan {
  const sel = normalizeRange(selection);
  const isSingle = matrix.length === 1 && matrix[0]!.length === 1;
  const fill = isSingle && (sel.r1 > sel.r0 || sel.c1 > sel.c0);
  const height = fill ? sel.r1 - sel.r0 + 1 : matrix.length;
  const width = fill ? sel.c1 - sel.c0 + 1 : Math.max(...matrix.map((r) => r.length));
  const valueAt = (i: number, j: number) => (fill ? matrix[0]![0]! : (matrix[i]?.[j] ?? ""));

  const ops: AnyOp[] = [];
  // Grow the table where the paste runs past the edges.
  const rowsNeeded = sel.r0 + height - doc.rows.length;
  const newRows: Row[] = [];
  for (let i = 0; i < rowsNeeded; i++) newRows.push(emptyRow());
  if (newRows.length) ops.push({ kind: "insertRows", index: doc.rows.length, rows: newRows });
  const rowIds = [...doc.rows.map((r) => r.id), ...newRows.map((r) => r.id)];

  const colsNeeded = sel.c0 + width - doc.columns.length;
  const columns: Column[] = [...doc.columns];
  const addedNames: string[] = [];
  for (let i = 0; i < colsNeeded; i++) {
    const col = newColumn(doc, addedNames);
    addedNames.push(col.name);
    ops.push({ kind: "insertColumn", index: columns.length, column: col });
    columns.push(col);
  }

  const changes: CellChange[] = [];
  let mismatches = 0;
  for (let j = 0; j < width; j++) {
    const col = columns[sel.c0 + j]!;
    let type = col.type;
    if (type === "untyped") {
      const texts = Array.from({ length: height }, (_, i) => normalizeInput(valueAt(i, j)));
      const inferred = narrowestCommonType(
        texts.map((t) => (t === null ? null : inferTypeFromInput(t, fmt))),
      );
      if (inferred !== "untyped") {
        type = inferred;
        ops.push({ kind: "updateColumn", columnId: col.id, patch: { type } });
      }
    }
    for (let i = 0; i < height; i++) {
      const rowId = rowIds[sel.r0 + i]!;
      const text = valueAt(i, j);
      if (type === "untyped") {
        changes.push({ rowId, columnId: col.id, value: null });
        continue;
      }
      const parsed = parseInput(text, type as ConcreteType, fmt);
      if (!parsed.ok) mismatches++;
      changes.push({ rowId, columnId: col.id, value: parsed.ok ? parsed.value : null });
    }
  }
  ops.push({ kind: "setCells", changes });
  return {
    ops,
    mismatches,
    target: { r0: sel.r0, c0: sel.c0, r1: sel.r0 + height - 1, c1: sel.c0 + width - 1 },
  };
}

// ---- structure ----

export function insertRowsOps(index: number, count = 1): { ops: AnyOp[]; rows: Row[] } {
  const rows = Array.from({ length: count }, emptyRow);
  return { ops: [{ kind: "insertRows", index, rows }], rows };
}

/** Deleting every row leaves one empty row, so the table is never empty. */
export function deleteRowsOps(doc: TableDoc, r0: number, r1: number): AnyOp[] {
  const ids = doc.rows.slice(Math.min(r0, r1), Math.max(r0, r1) + 1).map((r) => r.id);
  if (!ids.length) return [];
  const ops: AnyOp[] = [{ kind: "removeRows", rowIds: ids }];
  if (ids.length === doc.rows.length) ops.push({ kind: "insertRows", index: 0, rows: [emptyRow()] });
  return ops;
}

export function insertColumnOps(doc: TableDoc, index: number): { ops: AnyOp[]; column: Column } {
  const column = newColumn(doc);
  return { ops: [{ kind: "insertColumn", index, column }], column };
}

/** Deleting every column leaves a fresh untyped ColumnA. */
export function deleteColumnsOps(doc: TableDoc, c0: number, c1: number): AnyOp[] {
  const cols = doc.columns.slice(Math.min(c0, c1), Math.max(c0, c1) + 1);
  if (!cols.length) return [];
  const ops: AnyOp[] = cols.map((c) => ({ kind: "removeColumn", columnId: c.id }));
  if (cols.length === doc.columns.length) {
    ops.push({
      kind: "insertColumn",
      index: 0,
      column: { id: newId("c"), name: "ColumnA", type: "untyped" },
    });
  }
  return ops;
}

export function renameColumnOps(
  doc: TableDoc,
  columnId: string,
  rawName: string,
): { ok: true; ops: AnyOp[] } | { ok: false; error: string } {
  const name = rawName.trim();
  const col = doc.columns.find((c) => c.id === columnId);
  if (!col) return { ok: false, error: "Column not found" };
  if (!name) return { ok: false, error: "Name can't be empty" };
  if (name === col.name) return { ok: true, ops: [] };
  if (doc.columns.some((c) => c.id !== columnId && c.name === name)) {
    return { ok: false, error: "Another column already has that name" };
  }
  return { ok: true, ops: [{ kind: "updateColumn", columnId, patch: { name } }] };
}

export function changeTypePlan(doc: TableDoc, columnId: string, to: ConcreteType, fmt: FormatSettings) {
  const col = doc.columns.find((c) => c.id === columnId)!;
  const plan = planConversion(doc.rows, columnId, col.type, to, fmt);
  const ops: AnyOp[] = [
    { kind: "updateColumn", columnId, patch: { type: to } },
    ...(plan.changes.length
      ? [
          {
            kind: "setCells" as const,
            changes: plan.changes.map((c) => ({ rowId: c.rowId, columnId, value: c.value })),
          },
        ]
      : []),
  ];
  return { plan, ops };
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

/** Sorts rows by a column; nulls always last. Stable. */
export function sortOps(doc: TableDoc, columnId: string, dir: "asc" | "desc"): AnyOp[] {
  const sign = dir === "asc" ? 1 : -1;
  const sorted = doc.rows
    .map((row, i) => ({ row, i, v: row.cells[columnId] ?? null }))
    .sort((a, b) => {
      if (a.v === null || b.v === null) return a.v === b.v ? a.i - b.i : a.v === null ? 1 : -1;
      let cmp: number;
      if (typeof a.v === "string" && typeof b.v === "string") cmp = collator.compare(a.v, b.v);
      else cmp = Number(a.v) - Number(b.v);
      return cmp === 0 ? a.i - b.i : cmp * sign;
    });
  return [{ kind: "reorderRows", order: sorted.map((x) => x.row.id) }];
}
