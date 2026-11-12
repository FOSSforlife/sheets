import Papa from "papaparse";
import { canonicalFloat } from "../domain/numbers";
import type { FormatSettings } from "../domain/settings";
import type { CellValue, Column, ColumnType, Row, TableDoc } from "../domain/types";
import { formatDisplay } from "../domain/values";
import { ednString, isKeywordName } from "./edn";
import type { TextFormat } from "./types";

/** Text-format exporters: TableDoc → file text. */

export interface TextExportOptions {
  skipEmptyRows: boolean;
  csvDelimiter: string;
  csvNullText: string;
  /** CSV floats as `42.0` instead of the displayed `42.`. */
  csvCanonicalFloats: boolean;
  jsonPretty: boolean;
  omitNulls: boolean;
}

export const DEFAULT_TEXT_EXPORT: TextExportOptions = {
  skipEmptyRows: false,
  csvDelimiter: ",",
  csvNullText: "",
  csvCanonicalFloats: false,
  jsonPretty: true,
  omitNulls: false,
};

type Entry = [Column, CellValue];

function rowsOf(doc: TableDoc, opts: TextExportOptions): Entry[][] {
  const rows = doc.rows.map((r) => doc.columns.map((c): Entry => [c, r.cells[c.id] ?? null]));
  return opts.skipEmptyRows ? rows.filter((r) => r.some(([, v]) => v !== null)) : rows;
}

// ---- CSV ----

/** Display float style without grouping or rounding, so no precision is lost. */
function csvFloatFormat(fmt: FormatSettings): FormatSettings {
  return {
    ...fmt,
    thousandsSeparator: false,
    floatStyle: fmt.floatStyle === "fixed" ? "trailingDot" : fmt.floatStyle,
  };
}

export function exportCsv(doc: TableDoc, opts: TextExportOptions, fmt: FormatSettings): string {
  const header = doc.columns.map((c) => c.name);
  const body = rowsOf(doc, opts).map((r) =>
    r.map(([c, v]) => {
      if (v === null) return opts.csvNullText;
      if (c.type === "float" && typeof v === "number") {
        return opts.csvCanonicalFloats ? canonicalFloat(v) : formatDisplay(v, "float", csvFloatFormat(fmt));
      }
      // Ints are plain digits; dates are always ISO strings (Obsidian-compatible).
      return String(v);
    }),
  );
  return Papa.unparse([header, ...body], { delimiter: opts.csvDelimiter, newline: "\n" });
}

// ---- JSON ----

function jsonScalar(c: Column, v: CellValue): string {
  if (v === null) return "null";
  if (c.type === "float" && typeof v === "number") return canonicalFloat(v);
  return JSON.stringify(v);
}

function jsonObject(r: Entry[], opts: TextExportOptions, pretty: boolean): string {
  const parts = r
    .filter(([, v]) => !(opts.omitNulls && v === null))
    .map(([c, v]) => `${JSON.stringify(c.name)}:${pretty ? " " : ""}${jsonScalar(c, v)}`);
  if (!pretty) return `{${parts.join(",")}}`;
  return parts.length ? `{\n    ${parts.join(",\n    ")}\n  }` : "{}";
}

export function exportJson(doc: TableDoc, opts: TextExportOptions): string {
  const rows = rowsOf(doc, opts).map((r) => jsonObject(r, opts, opts.jsonPretty));
  if (!opts.jsonPretty) return `[${rows.join(",")}]`;
  return rows.length ? `[\n  ${rows.join(",\n  ")}\n]\n` : "[]\n";
}

export function exportJsonl(doc: TableDoc, opts: TextExportOptions): string {
  return rowsOf(doc, opts)
    .map((r) => jsonObject(r, opts, false))
    .join("\n")
    .concat("\n");
}

// ---- YAML ----

const YAML_RESERVED = /^(true|false|yes|no|on|off|y|n|null|~)$/i;

function yamlString(s: string): string {
  const plainSafe =
    /^[A-Za-z_][A-Za-z0-9 _.,/()-]*$/.test(s) &&
    !s.endsWith(" ") &&
    !YAML_RESERVED.test(s) &&
    !s.includes(": ") &&
    !s.includes(" #");
  return plainSafe ? s : JSON.stringify(s);
}

function yamlScalar(c: Column, v: CellValue): string {
  if (v === null) return "null";
  switch (c.type) {
    case "float":
      return canonicalFloat(v as number);
    case "int":
    case "bool":
      return String(v);
    case "date":
    case "datetime":
      return String(v); // YAML timestamps are written unquoted
    default:
      return yamlString(String(v));
  }
}

export function exportYaml(doc: TableDoc, opts: TextExportOptions): string {
  const rows = rowsOf(doc, opts);
  if (!rows.length) return "[]\n";
  return rows
    .map((r) => {
      const fields = r.filter(([, v]) => !(opts.omitNulls && v === null));
      if (!fields.length) return "- {}";
      return fields
        .map(([c, v], i) => `${i === 0 ? "- " : "  "}${yamlString(c.name)}: ${yamlScalar(c, v)}`)
        .join("\n");
    })
    .join("\n")
    .concat("\n");
}

// ---- EDN ----

function ednKey(name: string): string {
  return isKeywordName(name) ? `:${name}` : ednString(name);
}

function ednScalar(c: Column, v: CellValue): string {
  if (v === null) return "nil";
  switch (c.type) {
    case "float":
      return canonicalFloat(v as number);
    case "int":
    case "bool":
      return String(v);
    case "date":
      return `#inst ${ednString(String(v))}`;
    case "datetime":
      // Wall-clock time; the Z is required by #inst and is read back as wall-clock.
      return `#inst ${ednString(`${v}Z`)}`;
    default:
      return ednString(String(v));
  }
}

function ednMap(r: Entry[], opts: TextExportOptions): string {
  return `{${r
    .filter(([, v]) => !(opts.omitNulls && v === null))
    .map(([c, v]) => `${ednKey(c.name)} ${ednScalar(c, v)}`)
    .join(", ")}}`;
}

export function exportEdn(doc: TableDoc, opts: TextExportOptions): string {
  const rows = rowsOf(doc, opts).map((r) => ednMap(r, opts));
  return rows.length ? `[${rows.join("\n ")}]\n` : "[]\n";
}

export function exportEdnl(doc: TableDoc, opts: TextExportOptions): string {
  return rowsOf(doc, opts)
    .map((r) => ednMap(r, opts))
    .join("\n")
    .concat("\n");
}

export function exportText(
  format: TextFormat,
  doc: TableDoc,
  opts: TextExportOptions,
  fmt: FormatSettings,
): string {
  switch (format) {
    case "csv":
      return exportCsv(doc, opts, fmt);
    case "json":
      return exportJson(doc, opts);
    case "jsonl":
      return exportJsonl(doc, opts);
    case "yaml":
      return exportYaml(doc, opts);
    case "edn":
      return exportEdn(doc, opts);
    case "ednl":
      return exportEdnl(doc, opts);
  }
}

// ---- single records (row inspector) ----

export type RecordFormat = "json" | "yaml" | "edn";

/** A piece of a rendered record. Values carry their column type so the UI can color them. */
export interface RecordToken {
  text: string;
  kind: "punct" | "key" | "value" | "null";
  type?: ColumnType;
}

/**
 * One row as a pretty-printed object, as tokens. Uses the same value encoding as the file exports
 * (floats keep `.0`, dates are ISO / YAML timestamps / `#inst`). Nulls are included.
 */
export function recordTokens(format: RecordFormat, columns: Column[], row: Row): RecordToken[] {
  const punct = (text: string): RecordToken => ({ text, kind: "punct" });
  const key = (text: string): RecordToken => ({ text, kind: "key" });
  const value = (c: Column, v: CellValue, text: string): RecordToken =>
    v === null ? { text, kind: "null" } : { text, kind: "value", type: c.type };

  const entries: Entry[] = columns.map((c) => [c, row.cells[c.id] ?? null]);
  if (!entries.length) return [punct("{}")];
  const out: RecordToken[] = [];
  switch (format) {
    case "json":
      out.push(punct("{\n"));
      entries.forEach(([c, v], i) => {
        out.push(punct("  "), key(JSON.stringify(c.name)), punct(": "), value(c, v, jsonScalar(c, v)));
        out.push(punct(i < entries.length - 1 ? ",\n" : "\n"));
      });
      out.push(punct("}"));
      break;
    case "yaml":
      entries.forEach(([c, v], i) => {
        out.push(key(yamlString(c.name)), punct(": "), value(c, v, yamlScalar(c, v)));
        if (i < entries.length - 1) out.push(punct("\n"));
      });
      break;
    case "edn":
      out.push(punct("{"));
      entries.forEach(([c, v], i) => {
        if (i > 0) out.push(punct("\n "));
        out.push(key(ednKey(c.name)), punct(" "), value(c, v, ednScalar(c, v)));
      });
      out.push(punct("}"));
      break;
  }
  return out;
}

/** One row as pretty-printed text (exactly the concatenated tokens). */
export function exportRecord(format: RecordFormat, columns: Column[], row: Row): string {
  return recordTokens(format, columns, row)
    .map((t) => t.text)
    .join("");
}
