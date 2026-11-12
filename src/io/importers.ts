import Papa from "papaparse";
import { isMap, isScalar, isSeq, parseDocument, type Scalar } from "yaml";
import { parseIsoDate, parseIsoDateTime, toIsoDateTime } from "../domain/dates";
import type { RawValue } from "../domain/inference";
import { EdnReader, type EdnValue, ednToString, parseEdn } from "./edn";
import { ImportError, type RawTable, type TextFormat, type TextParseOptions } from "./types";

/** Text-format importers: file text → RawTable. Typing happens later (see build.ts). */

type RecordRow = Map<string, RawValue>;

/** Builds a RawTable from records; columns are the union of keys in first-seen order. */
function recordsToRaw(name: string, records: RecordRow[], warnings: string[], nestedCount: number): RawTable {
  const columns: string[] = [];
  const seen = new Set<string>();
  for (const r of records) {
    for (const k of r.keys()) {
      if (!seen.has(k)) {
        seen.add(k);
        columns.push(k);
      }
    }
  }
  const rows = records.map((r) => columns.map((c) => r.get(c) ?? null));
  return { name, columns, rows, warnings, nestedCount };
}

/**
 * ISO strings → date/datetime, everything else stays a string. A trailing `Z` is read as wall-clock
 * time (that's how we export EDN), other offsets are converted to local time.
 */
function classifyString(s: string): RawValue {
  if (parseIsoDate(s)) return { kind: "date", value: s };
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(s)) {
    const p = parseIsoDateTime(s.replace(/(\.\d+)?Z$/i, ""));
    if (p) return { kind: "datetime", value: toIsoDateTime(p) };
  }
  return { kind: "string", value: s };
}

function numberFromSource(value: number, source: string, warnings: Set<string>): RawValue {
  const isFloat = /[.eE]/.test(source);
  if (isFloat) return { kind: "float", value };
  if (!Number.isSafeInteger(value)) {
    warnings.add("Some integers were too large to store exactly and were imported as text.");
    return { kind: "string", value: source };
  }
  return { kind: "int", value };
}

// ---- CSV ----

export function parseCsv(name: string, text: string, opts: TextParseOptions): RawTable {
  const result = Papa.parse<string[]>(text.replace(/^﻿/, ""), {
    delimiter: opts.csvDelimiter === "auto" ? "" : opts.csvDelimiter,
    skipEmptyLines: true,
  });
  const warnings = result.errors.slice(0, 3).map((e) => `Row ${(e.row ?? 0) + 1}: ${e.message}`);
  const data = result.data;
  if (!data.length) return { name, columns: [], rows: [], warnings, nestedCount: 0 };
  const width = Math.max(...data.map((r) => r.length));
  const header = opts.csvHeader ? data[0]! : [];
  const body = opts.csvHeader ? data.slice(1) : data;
  const columns = Array.from({ length: width }, (_, i) => (header[i] ?? "").trim());
  const rows = body.map((r) =>
    columns.map((_, i): RawValue => {
      const v = (r[i] ?? "").trim();
      return v === "" ? null : { kind: "text", text: v };
    }),
  );
  return { name, columns, rows, warnings, nestedCount: 0 };
}

// ---- JSON / JSONL ----

function jsonValue(
  v: unknown,
  source: string | undefined,
  counts: { nested: number },
  warnings: Set<string>,
): RawValue {
  if (v === null || v === undefined) return null;
  if (typeof v === "boolean") return { kind: "bool", value: v };
  if (typeof v === "number") return numberFromSource(v, source ?? String(v), warnings);
  if (typeof v === "string") return classifyString(v);
  counts.nested++;
  return { kind: "nested", value: JSON.stringify(v) };
}

/** JSON.parse keeping each number's source text, so `42.0` stays a float. */
function parseJsonKeepingNumbers(text: string): {
  value: unknown;
  sources: WeakMap<object, Record<string, string>>;
} {
  const sources = new WeakMap<object, Record<string, string>>();
  const value = (JSON.parse as any)(
    text,
    function (this: any, key: string, v: unknown, ctx?: { source?: string }) {
      if (typeof v === "number" && ctx?.source && this && typeof this === "object") {
        const rec = sources.get(this) ?? {};
        rec[key] = ctx.source;
        sources.set(this, rec);
      }
      return v;
    },
  );
  return { value, sources };
}

function jsonRecord(
  obj: unknown,
  sources: WeakMap<object, Record<string, string>>,
  counts: { nested: number },
  warnings: Set<string>,
): RecordRow | null {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;
  const src = sources.get(obj) ?? {};
  const row: RecordRow = new Map();
  for (const [k, v] of Object.entries(obj)) row.set(k, jsonValue(v, src[k], counts, warnings));
  return row;
}

export function parseJson(name: string, text: string): RawTable {
  let parsed: ReturnType<typeof parseJsonKeepingNumbers>;
  try {
    parsed = parseJsonKeepingNumbers(text);
  } catch (e) {
    throw new ImportError(`Invalid JSON: ${(e as Error).message}`);
  }
  const counts = { nested: 0 };
  const warnings = new Set<string>();
  const items = Array.isArray(parsed.value) ? parsed.value : [parsed.value];
  const records: RecordRow[] = [];
  let skipped = 0;
  for (const item of items) {
    const r = jsonRecord(item, parsed.sources, counts, warnings);
    if (r) records.push(r);
    else skipped++;
  }
  if (!records.length && items.length) {
    throw new ImportError("JSON must be an object or an array of objects.");
  }
  if (skipped)
    warnings.add(
      `${skipped} array item${skipped === 1 ? " wasn't an object and was" : "s weren't objects and were"} skipped.`,
    );
  return recordsToRaw(name, records, [...warnings], counts.nested);
}

function parseLines(
  text: string,
  parseLine: (line: string) => RecordRow | null,
): { records: RecordRow[]; bad: number } {
  const records: RecordRow[] = [];
  let bad = 0;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const r = parseLine(line);
      if (r) records.push(r);
      else bad++;
    } catch {
      bad++;
    }
  }
  return { records, bad };
}

export function parseJsonl(name: string, text: string): RawTable {
  const counts = { nested: 0 };
  const warnings = new Set<string>();
  const { records, bad } = parseLines(text, (line) => {
    const p = parseJsonKeepingNumbers(line);
    return jsonRecord(p.value, p.sources, counts, warnings);
  });
  if (bad)
    warnings.add(
      `${bad} line${bad === 1 ? " was" : "s were"} not a valid JSON object and ${bad === 1 ? "was" : "were"} skipped.`,
    );
  return recordsToRaw(name, records, [...warnings], counts.nested);
}

// ---- YAML ----

function yamlScalar(node: Scalar, warnings: Set<string>): RawValue {
  const v = node.value;
  if (v === null || v === undefined) return null;
  const plain = node.type === "PLAIN";
  if (typeof v === "boolean") return { kind: "bool", value: v };
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return { kind: "string", value: node.source ?? String(v) };
    return numberFromSource(v, node.source ?? String(v), warnings);
  }
  const s = String(v);
  return plain ? classifyString(s) : { kind: "string", value: s };
}

export function parseYaml(name: string, text: string): RawTable {
  const doc = parseDocument(text, { uniqueKeys: false });
  if (doc.errors.length) throw new ImportError(`Invalid YAML: ${doc.errors[0]!.message}`);
  const counts = { nested: 0 };
  const warnings = new Set<string>();
  const root = doc.contents;
  const maps = isSeq(root) ? root.items : isMap(root) ? [root] : null;
  if (!maps) throw new ImportError("YAML must be a list of mappings or a single mapping.");
  const records: RecordRow[] = [];
  let skipped = 0;
  for (const m of maps) {
    if (!isMap(m)) {
      skipped++;
      continue;
    }
    const row: RecordRow = new Map();
    for (const pair of m.items) {
      const key = isScalar(pair.key) ? String(pair.key.value) : String(pair.key);
      const val = pair.value;
      if (val === null || val === undefined) row.set(key, null);
      else if (isScalar(val)) row.set(key, yamlScalar(val, warnings));
      else {
        counts.nested++;
        row.set(key, { kind: "nested", value: JSON.stringify((val as any).toJSON()) });
      }
    }
    records.push(row);
  }
  if (skipped)
    warnings.add(
      `${skipped} list item${skipped === 1 ? " wasn't a mapping and was" : "s weren't mappings and were"} skipped.`,
    );
  return recordsToRaw(name, records, [...warnings], counts.nested);
}

// ---- EDN / EDNL ----

function ednKey(k: EdnValue): string {
  if (k && typeof k === "object" && (k.type === "keyword" || k.type === "symbol")) return k.name;
  if (typeof k === "string") return k;
  return ednToString(k);
}

function ednValue(v: EdnValue, counts: { nested: number }, warnings: Set<string>): RawValue {
  if (v === null) return null;
  if (typeof v === "boolean") return { kind: "bool", value: v };
  if (typeof v === "string") return { kind: "string", value: v };
  switch (v.type) {
    case "int":
      return numberFromSource(v.value, v.text, warnings);
    case "float":
      return { kind: "float", value: v.value };
    case "keyword":
      return { kind: "string", value: v.name };
    case "symbol":
      return { kind: "string", value: v.name };
    case "char":
      return { kind: "string", value: v.value };
    case "tagged":
      if (v.tag === "inst" && typeof v.value === "string") {
        const c = classifyString(v.value);
        if (c && (c.kind === "date" || c.kind === "datetime")) return c;
      }
      if (v.tag === "uuid" && typeof v.value === "string") return { kind: "string", value: v.value };
      warnings.add(`Tagged values like #${v.tag} were imported as text.`);
      return { kind: "string", value: ednToString(v) };
    default:
      counts.nested++;
      return { kind: "nested", value: ednToString(v) };
  }
}

function ednRecord(v: EdnValue, counts: { nested: number }, warnings: Set<string>): RecordRow | null {
  if (!v || typeof v !== "object" || v.type !== "map") return null;
  const row: RecordRow = new Map();
  for (const [k, val] of v.entries) row.set(ednKey(k), ednValue(val, counts, warnings));
  return row;
}

export function parseEdnTable(name: string, text: string): RawTable {
  let root: EdnValue;
  try {
    root = parseEdn(text);
  } catch (e) {
    throw new ImportError(`Invalid EDN: ${(e as Error).message}`);
  }
  const counts = { nested: 0 };
  const warnings = new Set<string>();
  const items =
    root && typeof root === "object" && (root.type === "vector" || root.type === "list")
      ? root.items
      : [root];
  const records: RecordRow[] = [];
  let skipped = 0;
  for (const it of items) {
    const r = ednRecord(it, counts, warnings);
    if (r) records.push(r);
    else skipped++;
  }
  if (!records.length) throw new ImportError("EDN must be a map or a vector/list of maps.");
  if (skipped)
    warnings.add(
      `${skipped} item${skipped === 1 ? " wasn't a map and was" : "s weren't maps and were"} skipped.`,
    );
  return recordsToRaw(name, records, [...warnings], counts.nested);
}

export function parseEdnl(name: string, text: string): RawTable {
  const counts = { nested: 0 };
  const warnings = new Set<string>();
  const { records, bad } = parseLines(text, (line) => {
    const r = new EdnReader(line);
    const v = r.read();
    if (!r.atEnd()) return null;
    return ednRecord(v, counts, warnings);
  });
  if (bad)
    warnings.add(
      `${bad} line${bad === 1 ? " was" : "s were"} not a valid EDN map and ${bad === 1 ? "was" : "were"} skipped.`,
    );
  return recordsToRaw(name, records, [...warnings], counts.nested);
}

export function parseText(format: TextFormat, name: string, text: string, opts: TextParseOptions): RawTable {
  switch (format) {
    case "csv":
      return parseCsv(name, text, opts);
    case "json":
      return parseJson(name, text);
    case "jsonl":
      return parseJsonl(name, text);
    case "yaml":
      return parseYaml(name, text);
    case "edn":
      return parseEdnTable(name, text);
    case "ednl":
      return parseEdnl(name, text);
  }
}
