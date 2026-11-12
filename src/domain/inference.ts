import { parseIsoDate, parseIsoDateTime, toIsoDateTime as toIsoDateTimeLocal } from "./dates";
import { canonicalFloat, parseFloatText, parseIntText } from "./numbers";
import type { CellValue, ColumnType, ConcreteType } from "./types";

/**
 * A value as read from an import file, before it's assigned a column type.
 * Typed formats (JSON, YAML, EDN, SQLite) can say exactly what a value is;
 * untyped ones (CSV) give text which is classified heuristically.
 */
export type RawValue =
  | null
  | { kind: "text"; text: string } // untyped text, classify heuristically
  | { kind: "string"; value: string } // definitely a string
  | { kind: "int"; value: number }
  | { kind: "float"; value: number }
  | { kind: "bool"; value: boolean }
  | { kind: "date"; value: string } // ISO
  | { kind: "datetime"; value: string } // ISO
  | { kind: "nested"; value: string }; // pre-stringified nested structure

/** The narrowest type a single raw value fits, or null for null. */
export function rawKind(v: RawValue): ConcreteType | "nested" | null {
  if (v === null) return null;
  if (v.kind !== "text") return v.kind;
  const t = v.text;
  const lower = t.toLowerCase();
  if (lower === "true" || lower === "false") return "bool";
  if (parseIntText(t, { strict: true }) !== null) return "int";
  if (parseFloatText(t, { strict: true }) !== null) return "float";
  if (parseIsoDateTime(t) && t.length > 10) return "datetime";
  if (parseIsoDate(t)) return "date";
  return "string";
}

/** Narrowest type fitting every kind in the list. */
export function narrowestCommonType(kinds: Iterable<ConcreteType | "nested" | null>): ColumnType {
  let result: ConcreteType | null = null;
  for (const k of kinds) {
    if (k === null) continue;
    const kind: ConcreteType = k === "nested" ? "string" : k;
    if (result === null) result = kind;
    else if (result !== kind) {
      if ((result === "int" && kind === "float") || (result === "float" && kind === "int")) result = "float";
      else if ((result === "date" && kind === "datetime") || (result === "datetime" && kind === "date"))
        result = "datetime";
      else return "string";
    }
  }
  return result ?? "untyped";
}

/** String form of a raw value, used when a column is typed as string. */
export function rawToText(v: Exclude<RawValue, null>): string {
  switch (v.kind) {
    case "text":
      return v.text;
    case "float":
      return canonicalFloat(v.value);
    default:
      return String(v.value);
  }
}

/**
 * Converts a raw imported value into a stored cell value for the chosen column type.
 * Returns `undefined` when the value doesn't fit (caller decides: null + warning).
 */
export function rawToCell(v: RawValue, type: ColumnType): CellValue | undefined {
  if (v === null) return null;
  if (type === "string" || type === "untyped") return rawToText(v);
  const kind = rawKind(v);
  const text = v.kind === "text" ? v.text : null;
  switch (type) {
    case "int": {
      if (kind === "int") return text !== null ? Number(text) : (v as { value: number }).value;
      if (kind === "float") {
        const n = text !== null ? Number(text) : (v as { value: number }).value;
        return Number.isSafeInteger(n) ? n : undefined;
      }
      if (text !== null) return parseIntText(text) ?? undefined;
      return undefined;
    }
    case "float":
      if (kind === "int" || kind === "float")
        return text !== null ? Number(text) : (v as { value: number }).value;
      if (text !== null) return parseFloatText(text, { allowInt: true }) ?? undefined;
      return undefined;
    case "bool":
      if (kind === "bool")
        return text !== null ? text.toLowerCase() === "true" : (v as { value: boolean }).value;
      if (kind === "int") {
        const n = text !== null ? Number(text) : (v as { value: number }).value;
        return n === 1 ? true : n === 0 ? false : undefined;
      }
      return undefined;
    case "date":
      if (kind === "date") return text ?? (v as { value: string }).value;
      if (kind === "datetime") {
        const iso = text !== null ? parseIsoDateTime(text) : parseIsoDateTime((v as { value: string }).value);
        return iso ? (text ?? (v as { value: string }).value).slice(0, 10) : undefined;
      }
      return undefined;
    case "datetime": {
      if (kind === "datetime") {
        const p = parseIsoDateTime(text ?? (v as { value: string }).value);
        return p ? toIsoDateTimeLocal(p) : undefined;
      }
      if (kind === "date") return `${text ?? (v as { value: string }).value}T00:00:00`;
      return undefined;
    }
  }
}
