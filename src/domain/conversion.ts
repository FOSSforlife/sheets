import { parseIsoDateTime } from "./dates";
import { hasLeadingZeros, roundHalfAway } from "./numbers";
import type { FormatSettings } from "./settings";
import type { CellValue, ColumnType, ConcreteType, Row } from "./types";
import { formatDisplay, parseInput } from "./values";

/** Converts one stored value between column types. Values that can't convert become null. */
export function convertValue(
  value: CellValue,
  from: ColumnType,
  to: ConcreteType,
  fmt: FormatSettings,
): CellValue {
  if (value === null) return null;
  if (from === to) return value;
  if (to === "string") return formatDisplay(value, from, fmt);

  switch (from) {
    case "string":
    case "untyped": {
      const r = parseInput(String(value), to, fmt);
      return r.ok ? r.value : null;
    }
    case "int":
      if (to === "float") return value;
      if (to === "bool") return value === 1 ? true : value === 0 ? false : null;
      return null;
    case "float":
      if (to === "int") {
        const n = roundHalfAway(value as number);
        return Number.isSafeInteger(n) ? n : null;
      }
      if (to === "bool") return value === 1 ? true : value === 0 ? false : null;
      return null;
    case "bool":
      if (to === "int" || to === "float") return value ? 1 : 0;
      return null;
    case "date":
      if (to === "datetime") return `${value}T00:00:00`;
      return null;
    case "datetime":
      if (to === "date") return String(value).slice(0, 10);
      return null;
  }
}

/** True when a conversion changed a value in a way the user might not expect. */
export function isMeaningfulChange(
  before: CellValue,
  from: ColumnType,
  after: CellValue,
  to: ConcreteType,
): boolean {
  if (before === null) return false;
  if (after === null) return true;
  if (to === "string") return false; // the displayed text is preserved verbatim

  switch (from) {
    case "string":
    case "untyped": {
      const text = String(before).trim();
      if (to === "int" || to === "float")
        return hasLeadingZeros(text) || Number(text.replaceAll(",", "")) !== after;
      if (to === "bool") return !["true", "false"].includes(text.toLowerCase());
      return false; // dates parsed successfully: only formatting differs
    }
    case "int":
      return to !== "float";
    case "float":
      return before !== after;
    case "bool":
      return true;
    case "date":
      return false;
    case "datetime": {
      const p = parseIsoDateTime(String(before));
      if (!p) return true;
      return p.hh !== 0 || p.mm !== 0 || p.ss !== 0;
    }
  }
}

export interface ConversionSample {
  before: string;
  after: string;
}

export interface ConversionPlan {
  columnId: string;
  from: ColumnType;
  to: ConcreteType;
  changes: { rowId: string; value: CellValue }[];
  nulled: number;
  changed: number;
  samples: ConversionSample[];
  /** Whether the user should be warned before converting. */
  needsWarning: boolean;
}

/** Computes every value change for converting a column, plus the stats the warning modal needs. */
export function planConversion(
  rows: Row[],
  columnId: string,
  from: ColumnType,
  to: ConcreteType,
  fmt: FormatSettings,
): ConversionPlan {
  const changes: ConversionPlan["changes"] = [];
  const samples: ConversionSample[] = [];
  let nulled = 0;
  let changed = 0;
  for (const row of rows) {
    const before = row.cells[columnId] ?? null;
    if (before === null) continue;
    const after = convertValue(before, from, to, fmt);
    if (after !== before) changes.push({ rowId: row.id, value: after });
    if (!isMeaningfulChange(before, from, after, to)) continue;
    if (after === null) nulled++;
    else changed++;
    if (samples.length < 5) {
      samples.push({
        before: formatDisplay(before, from, fmt),
        after: after === null ? "null" : formatDisplay(after, to, fmt),
      });
    }
  }
  return { columnId, from, to, changes, nulled, changed, samples, needsWarning: nulled + changed > 0 };
}
