import { canonicalFloat } from "../domain/numbers";
import type { PostgresTypeSettings } from "../domain/settings";
import type { CellValue, Column, ColumnType, TableDoc } from "../domain/types";
import type { SqlDialect } from "./types";

/** SQL script export (CREATE TABLE + INSERT) for SQLite and PostgreSQL. */

export interface SqlTableInput {
  name: string;
  doc: TableDoc;
}

export interface SqlExportOptions {
  dropTable: boolean;
  skipEmptyRows: boolean;
  /** Adds an auto-increment surrogate `id` primary key. */
  primaryKey: boolean;
  /** Postgres only. */
  schema: string;
  /** Column ids that get NOT NULL. */
  notNull: Set<string>;
  batchSize: number;
}

const RESERVED = new Set(
  "all and as asc between by case check column constraint create cross default delete desc distinct drop else end exists foreign from full group having in index inner insert into is join key left like limit not null offset on or order outer primary references right select set table then to union unique update using values when where with user date time timestamp".split(
    " ",
  ),
);

export function quoteIdent(name: string): string {
  return /^[a-z_][a-z0-9_]*$/.test(name) && !RESERVED.has(name) ? name : `"${name.replaceAll('"', '""')}"`;
}

export function sqlType(type: ColumnType, dialect: SqlDialect, pg: PostgresTypeSettings): string {
  if (dialect === "sqlite") {
    return {
      untyped: "TEXT",
      string: "TEXT",
      int: "INTEGER",
      float: "REAL",
      bool: "BOOLEAN",
      date: "DATE",
      datetime: "DATETIME",
    }[type];
  }
  return {
    untyped: pg.string,
    string: pg.string,
    int: pg.int,
    float: pg.float,
    bool: "boolean",
    date: "date",
    datetime: "timestamp",
  }[type];
}

function literal(v: CellValue, col: Column, dialect: SqlDialect): string {
  if (v === null) return "NULL";
  switch (col.type) {
    case "int":
      return String(v);
    case "float":
      return canonicalFloat(v as number);
    case "bool":
      return dialect === "sqlite" ? (v ? "1" : "0") : v ? "TRUE" : "FALSE";
    default:
      return `'${String(v).replaceAll("'", "''")}'`;
  }
}

/** Columns that have no nulls default to NOT NULL. */
export function defaultNotNull(doc: TableDoc): Set<string> {
  const out = new Set<string>();
  if (!doc.rows.length) return out;
  for (const c of doc.columns) {
    if (c.type !== "untyped" && doc.rows.every((r) => r.cells[c.id] != null)) out.add(c.id);
  }
  return out;
}

function surrogateKeyName(doc: TableDoc): string {
  const names = new Set(doc.columns.map((c) => c.name));
  let name = "id";
  for (let i = 2; names.has(name); i++) name = `id_${i}`;
  return name;
}

export function exportSql(
  tables: SqlTableInput[],
  dialect: SqlDialect,
  opts: SqlExportOptions,
  pg: PostgresTypeSettings,
): string {
  const out: string[] = [];
  const schema = dialect === "postgres" && opts.schema.trim() ? opts.schema.trim() : "";
  const qualify = (name: string) => (schema ? `${quoteIdent(schema)}.${quoteIdent(name)}` : quoteIdent(name));
  out.push(`-- Exported from Sheets on ${new Date().toISOString()}`);
  out.push("BEGIN;", "");
  if (schema) out.push(`CREATE SCHEMA IF NOT EXISTS ${quoteIdent(schema)};`, "");

  for (const { name, doc } of tables) {
    const table = qualify(name);
    const cols = doc.columns;
    if (opts.dropTable) out.push(`DROP TABLE IF EXISTS ${table};`);
    const defs: string[] = [];
    if (opts.primaryKey) {
      const pk = quoteIdent(surrogateKeyName(doc));
      defs.push(
        dialect === "sqlite"
          ? `${pk} INTEGER PRIMARY KEY`
          : `${pk} integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY`,
      );
    }
    for (const c of cols) {
      defs.push(
        `${quoteIdent(c.name)} ${sqlType(c.type, dialect, pg)}${opts.notNull.has(c.id) ? " NOT NULL" : ""}`,
      );
    }
    out.push(`CREATE TABLE ${table} (\n  ${defs.join(",\n  ")}\n);`);

    const rows = opts.skipEmptyRows
      ? doc.rows.filter((r) => cols.some((c) => r.cells[c.id] != null))
      : doc.rows;
    const colList = cols.map((c) => quoteIdent(c.name)).join(", ");
    for (let i = 0; i < rows.length; i += opts.batchSize) {
      const batch = rows.slice(i, i + opts.batchSize);
      const values = batch.map(
        (r) => `  (${cols.map((c) => literal(r.cells[c.id] ?? null, c, dialect)).join(", ")})`,
      );
      out.push(`INSERT INTO ${table} (${colList}) VALUES\n${values.join(",\n")};`);
    }
    out.push("");
  }
  out.push("COMMIT;", "");
  return out.join("\n");
}

const INT_RANGES: Record<string, number> = { int2: 32767, int4: 2147483647 };

/** Problems the user should know about before running the script. */
export function sqlWarnings(
  tables: SqlTableInput[],
  dialect: SqlDialect,
  pg: PostgresTypeSettings,
): string[] {
  const warnings: string[] = [];
  if (dialect !== "postgres") return warnings;
  for (const { name, doc } of tables) {
    for (const c of doc.columns) {
      const values = doc.rows.map((r) => r.cells[c.id]).filter((v): v is number => typeof v === "number");
      if (c.type === "int" && INT_RANGES[pg.int]) {
        const max = INT_RANGES[pg.int]!;
        if (values.some((v) => v > max || v < -max - 1)) {
          warnings.push(`${name}.${c.name}: some values don't fit ${pg.int}; consider int8.`);
        }
      }
      if (c.type === "float" && pg.float === "float4" && values.some((v) => significantDigits(v) > 6)) {
        warnings.push(`${name}.${c.name}: some values will lose precision as float4; consider float8.`);
      }
    }
  }
  return warnings;
}

/** float4 reliably holds 6 significant decimal digits. */
function significantDigits(v: number): number {
  const digits = Math.abs(v).toExponential().split("e")[0]!.replace(".", "");
  return digits.replace(/0+$/, "").length;
}
