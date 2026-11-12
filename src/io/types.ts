import type { RawValue } from "../domain/inference";
import type { ColumnType } from "../domain/types";

export type TextFormat = "csv" | "json" | "jsonl" | "yaml" | "edn" | "ednl";
export type SqlDialect = "sqlite" | "postgres";
export type ExportFormat = TextFormat | SqlDialect;

export const TEXT_FORMATS: TextFormat[] = ["csv", "json", "jsonl", "yaml", "edn", "ednl"];

export const FORMAT_LABELS: Record<ExportFormat, string> = {
  csv: "CSV",
  json: "JSON",
  jsonl: "JSON Lines",
  yaml: "YAML",
  edn: "EDN",
  ednl: "EDN Lines",
  sqlite: "SQLite (.sql)",
  postgres: "PostgreSQL (.sql)",
};

export const FORMAT_EXTENSIONS: Record<ExportFormat, string> = {
  csv: "csv",
  json: "json",
  jsonl: "jsonl",
  yaml: "yaml",
  edn: "edn",
  ednl: "ednl",
  sqlite: "sqlite.sql",
  postgres: "pg.sql",
};

/** A parsed import before types are chosen. */
export interface RawTable {
  name: string;
  columns: string[];
  rows: RawValue[][];
  /** Non-fatal problems found while reading (bad lines, skipped columns...). */
  warnings: string[];
  /** How many nested values (objects/arrays/sets) were found. */
  nestedCount: number;
  /** Types suggested by the source (e.g. SQLite declared types). Overrides inference when present. */
  declaredTypes?: ColumnType[];
}

export interface TextParseOptions {
  csvHeader: boolean;
  csvDelimiter: "auto" | "," | ";" | "\t" | "|";
}

export const DEFAULT_PARSE_OPTIONS: TextParseOptions = { csvHeader: true, csvDelimiter: "auto" };

/** Detects an import format from a file name. */
export function detectFormat(fileName: string): TextFormat | "sqlite-db" | "backup" | null {
  const lower = fileName.toLowerCase();
  if (/\.(sqlite3?|db|sqlite-db)$/.test(lower)) return "sqlite-db";
  const ext = lower.split(".").pop() ?? "";
  switch (ext) {
    case "csv":
    case "tsv":
    case "txt":
      return "csv";
    case "json":
      return "json";
    case "jsonl":
    case "ndjson":
      return "jsonl";
    case "yaml":
    case "yml":
      return "yaml";
    case "edn":
      return "edn";
    case "ednl":
      return "ednl";
    default:
      return null;
  }
}

export class ImportError extends Error {}
