import type { RawValue } from "../domain/inference";
import type { ColumnType } from "../domain/types";
import { ImportError, type RawTable } from "./types";

/** SQLite database file → RawTables, typed by each column's declared type. Uses sql.js (WASM). */

export function declaredToType(declared: string): ColumnType | "blob" {
  const t = declared.toUpperCase();
  if (t.includes("BLOB")) return "blob";
  if (t.startsWith("BOOL")) return "bool";
  if (t.includes("DATETIME") || t.includes("TIMESTAMP")) return "datetime";
  if (t === "DATE") return "date";
  if (t.includes("INT")) return "int";
  if (/REAL|FLOA|DOUB|NUMERIC|DECIMAL/.test(t)) return "float";
  return "string";
}

export interface SqliteImport {
  tables: RawTable[];
  skipped: string[];
}

function rawFromSqlite(v: unknown): RawValue | "blob" {
  if (v === null || v === undefined) return null;
  if (v instanceof Uint8Array) return "blob";
  if (typeof v === "number")
    return Number.isInteger(v) ? { kind: "int", value: v } : { kind: "float", value: v };
  if (typeof v === "bigint") return { kind: "string", value: v.toString() };
  return { kind: "text", text: String(v) };
}

export async function readSqlite(bytes: Uint8Array): Promise<SqliteImport> {
  const [{ default: initSqlJs }, { default: wasmUrl }] = await Promise.all([
    import("sql.js"),
    import("sql.js/dist/sql-wasm.wasm?url"),
  ]);
  const SQL = await initSqlJs({ locateFile: () => wasmUrl });
  let db: import("sql.js").Database;
  try {
    db = new SQL.Database(bytes);
    db.exec("SELECT count(*) FROM sqlite_master");
  } catch {
    throw new ImportError("This file isn't a valid SQLite database.");
  }
  const skipped: string[] = [];
  const tables: RawTable[] = [];
  try {
    const master = db.exec(
      "SELECT type, name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY rowid",
    );
    for (const [type, name] of master[0]?.values ?? []) {
      if (type === "view") skipped.push(`View “${name}”`);
      else if (type === "trigger") skipped.push(`Trigger “${name}”`);
      if (type !== "table") continue;
      const tname = String(name);
      const info = db.exec(`PRAGMA table_info("${tname.replaceAll('"', '""')}")`)[0];
      const cols = (info?.values ?? []).map((r) => ({ name: String(r[1]), declared: String(r[2] ?? "") }));
      const keep = cols.map((c) => declaredToType(c.declared));
      const kept = cols.filter((_, i) => keep[i] !== "blob");
      for (const [i, c] of cols.entries())
        if (keep[i] === "blob") skipped.push(`Column “${tname}.${c.name}” (BLOB)`);
      const types = keep.filter((t): t is ColumnType => t !== "blob");
      const rows: RawValue[][] = [];
      let blobCells = 0;
      if (kept.length) {
        const sel = kept.map((c) => `"${c.name.replaceAll('"', '""')}"`).join(", ");
        const stmt = db.prepare(`SELECT ${sel} FROM "${tname.replaceAll('"', '""')}"`);
        while (stmt.step()) {
          rows.push(
            stmt.get().map((v) => {
              const r = rawFromSqlite(v);
              if (r === "blob") {
                blobCells++;
                return null;
              }
              return r;
            }),
          );
        }
        stmt.free();
      }
      const warnings = blobCells
        ? [`${blobCells} binary value${blobCells === 1 ? " was" : "s were"} skipped.`]
        : [];
      tables.push({
        name: tname,
        columns: kept.map((c) => c.name),
        rows,
        warnings,
        nestedCount: 0,
        declaredTypes: types,
      });
    }
  } finally {
    db.close();
  }
  return { tables, skipped };
}
