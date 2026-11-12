import { newId } from "../domain/ids";
import { narrowestCommonType, rawKind, rawToCell } from "../domain/inference";
import { nextColumnName } from "../domain/names";
import type { CellValue, Column, ColumnType, Row, TableDoc } from "../domain/types";
import type { RawTable } from "./types";

export type NestedMode = "stringify" | "null";

/** Narrowest type per column that fits every value (nested values count as strings unless nulled). */
export function inferColumnTypes(raw: RawTable, nested: NestedMode): ColumnType[] {
  if (raw.declaredTypes) return raw.declaredTypes;
  return raw.columns.map((_, ci) =>
    narrowestCommonType(
      raw.rows.map((r) => {
        const v = r[ci] ?? null;
        if (v?.kind === "nested") return nested === "null" ? null : "string";
        return rawKind(v);
      }),
    ),
  );
}

/** Column names cleaned up: blanks get default names, duplicates get suffixes. */
export function cleanColumnNames(names: string[]): string[] {
  const out: string[] = [];
  const taken = new Set<string>();
  for (const n of names) {
    let name = n.trim();
    if (!name) name = nextColumnName([...taken, ...names]);
    if (taken.has(name)) {
      let i = 2;
      while (taken.has(`${name}_${i}`)) i++;
      name = `${name}_${i}`;
    }
    taken.add(name);
    out.push(name);
  }
  return out;
}

export interface BuildResult {
  doc: Omit<TableDoc, "id">;
  warnings: string[];
}

/** Turns a RawTable into a TableDoc with the chosen column types. Values that don't fit become null. */
export function buildDoc(raw: RawTable, types: ColumnType[], nested: NestedMode): BuildResult {
  const names = cleanColumnNames(raw.columns);
  const columns: Column[] = names.map((name, i) => ({ id: newId("c"), name, type: types[i] ?? "string" }));
  const mismatches = new Map<string, number>();
  const rows: Row[] = raw.rows.map((r) => {
    const cells: Record<string, CellValue> = {};
    columns.forEach((col, ci) => {
      let v = r[ci] ?? null;
      if (v?.kind === "nested" && nested === "null") v = null;
      const cell = rawToCell(v, col.type);
      if (cell === undefined) mismatches.set(col.name, (mismatches.get(col.name) ?? 0) + 1);
      else if (cell !== null) cells[col.id] = cell;
    });
    return { id: newId("r"), cells };
  });
  const warnings = [...mismatches].map(
    ([name, n]) =>
      `${n} value${n === 1 ? "" : "s"} in “${name}” didn't fit the column type and became empty.`,
  );
  if (!columns.length) columns.push({ id: newId("c"), name: "ColumnA", type: "untyped" });
  if (!rows.length) rows.push({ id: newId("r"), cells: {} });
  return { doc: { columns, rows }, warnings };
}

/** Counts values per column that wouldn't fit the given type (for live preview warnings). */
export function countMismatches(raw: RawTable, ci: number, type: ColumnType, nested: NestedMode): number {
  let n = 0;
  for (const r of raw.rows) {
    let v = r[ci] ?? null;
    if (v?.kind === "nested" && nested === "null") v = null;
    if (rawToCell(v, type) === undefined) n++;
  }
  return n;
}
