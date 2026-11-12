import {
  formatIsoDate,
  formatIsoDateTime,
  parseDisplayDate,
  parseDisplayDateTime,
  parseIsoDate,
  parseIsoDateTime,
} from "./dates";
import { formatFloat, formatInt, parseFloatText, parseIntText } from "./numbers";
import type { FormatSettings } from "./settings";
import type { CellValue, ColumnType, ConcreteType } from "./types";

export type ParseResult = { ok: true; value: CellValue } | { ok: false; error: string };

const TRUE_WORDS = new Set(["true", "t", "yes", "y", "1"]);
const FALSE_WORDS = new Set(["false", "f", "no", "n", "0"]);

export function parseBoolText(text: string): boolean | null {
  const t = text.trim().toLowerCase();
  if (TRUE_WORDS.has(t)) return true;
  if (FALSE_WORDS.has(t)) return false;
  return null;
}

/** Normalises raw user input: trims; empty becomes null. */
export function normalizeInput(text: string): string | null {
  const t = text.trim();
  return t === "" ? null : t;
}

/** Parses user-typed text for a column of the given (concrete) type. */
export function parseInput(text: string, type: ConcreteType, fmt: FormatSettings): ParseResult {
  const t = normalizeInput(text);
  if (t === null) return { ok: true, value: null };
  const fail = (error: string): ParseResult => ({ ok: false, error });
  switch (type) {
    case "string":
      return { ok: true, value: t };
    case "int": {
      const n = parseIntText(t, { thousands: fmt.thousandsSeparator });
      if (n !== null) return { ok: true, value: n };
      return fail(/^[+-]?\d+$/.test(t) ? "Integer is too large" : "Expected a whole number, e.g. 42");
    }
    case "float": {
      const n = parseFloatText(t, { allowInt: true, thousands: fmt.thousandsSeparator });
      return n === null ? fail("Expected a number, e.g. 4.2") : { ok: true, value: n };
    }
    case "bool": {
      const b = parseBoolText(t);
      return b === null ? fail("Expected true or false") : { ok: true, value: b };
    }
    case "date": {
      const iso = parseDisplayDate(t, fmt.dateFormat);
      return iso === null ? fail("Expected a valid date") : { ok: true, value: iso };
    }
    case "datetime": {
      const iso = parseDisplayDateTime(t, fmt.dateFormat);
      return iso === null ? fail("Expected a valid date and time") : { ok: true, value: iso };
    }
  }
}

/**
 * Infers a column type from the first value typed into an untyped column.
 * Precedence: bool → int → float → datetime → date → string.
 */
export function inferTypeFromInput(text: string, fmt: FormatSettings): ConcreteType {
  const t = text.trim();
  const lower = t.toLowerCase();
  if (lower === "true" || lower === "false") return "bool";
  if (parseIntText(t, { strict: true, thousands: fmt.thousandsSeparator }) !== null) return "int";
  if (parseFloatText(t, { strict: true, thousands: fmt.thousandsSeparator }) !== null) return "float";
  if (parseDisplayDateTime(t, fmt.dateFormat) !== null) return "datetime";
  if (parseDisplayDate(t, fmt.dateFormat) !== null) return "date";
  return "string";
}

/** Text shown in a cell (and used for any → string conversions and copying). */
export function formatDisplay(value: CellValue, type: ColumnType, fmt: FormatSettings): string {
  if (value === null || value === undefined) return "";
  switch (type) {
    case "int":
      return typeof value === "number" ? formatInt(value, fmt) : String(value);
    case "float":
      return typeof value === "number" ? formatFloat(value, fmt) : String(value);
    case "bool":
      return value === true ? "true" : value === false ? "false" : String(value);
    case "date":
      return typeof value === "string" ? formatIsoDate(value, fmt.dateFormat) : String(value);
    case "datetime":
      return typeof value === "string"
        ? formatIsoDateTime(value, fmt.dateFormat, fmt.timeFormat)
        : String(value);
    default:
      return String(value);
  }
}

/** Text placed into the editor when editing an existing value. */
export function formatForEdit(value: CellValue, type: ColumnType, fmt: FormatSettings): string {
  if (value === null) return "";
  if (type === "int" || type === "float") return String(value);
  return formatDisplay(value, type, fmt);
}

/** True if the stored value is valid for the column type. */
export function isValueOfType(value: CellValue, type: ColumnType): boolean {
  if (value === null) return true;
  switch (type) {
    case "untyped":
      return false;
    case "string":
      return typeof value === "string";
    case "int":
      return typeof value === "number" && Number.isSafeInteger(value);
    case "float":
      return typeof value === "number" && Number.isFinite(value);
    case "bool":
      return typeof value === "boolean";
    case "date":
      return typeof value === "string" && parseIsoDate(value) !== null;
    case "datetime":
      return typeof value === "string" && parseIsoDateTime(value) !== null;
  }
}
