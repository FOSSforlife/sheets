import type { FormatSettings } from "./settings";

export const MAX_SAFE = Number.MAX_SAFE_INTEGER;

const INT_RE = /^[+-]?\d+$/;
const INT_STRICT_RE = /^[+-]?(0|[1-9]\d*)$/;
const FLOAT_RE = /^[+-]?(\d+\.\d*|\.\d+|\d+(\.\d*)?[eE][+-]?\d+|\.\d+[eE][+-]?\d+)$/;
const THOUSANDS_RE = /^[+-]?\d{1,3}(,\d{3})+(\.\d*)?$/;

/** Removes thousands separators if the input uses them in the canonical grouping. */
function stripThousands(text: string): string {
  return THOUSANDS_RE.test(text) ? text.replaceAll(",", "") : text;
}

/**
 * Parses an int. `strict` (used for inference) rejects leading zeros such as `007`,
 * so identifiers like zip codes stay strings.
 */
export function parseIntText(
  text: string,
  opts: { strict?: boolean; thousands?: boolean } = {},
): number | null {
  const t = opts.thousands ? stripThousands(text) : text;
  if (!(opts.strict ? INT_STRICT_RE : INT_RE).test(t)) return null;
  const n = Number(t);
  return Number.isSafeInteger(n) ? (Object.is(n, -0) ? 0 : n) : null;
}

/** Parses a float. Requires a decimal point or exponent unless `allowInt`. */
export function parseFloatText(
  text: string,
  opts: { allowInt?: boolean; strict?: boolean; thousands?: boolean } = {},
): number | null {
  const t = opts.thousands ? stripThousands(text) : text;
  const isFloat = FLOAT_RE.test(t);
  const isInt = INT_RE.test(t);
  if (!isFloat && !(opts.allowInt && isInt)) return null;
  if (opts.strict && /^[+-]?0\d/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? (Object.is(n, -0) ? 0 : n) : null;
}

export function hasLeadingZeros(text: string): boolean {
  return /^[+-]?0\d/.test(text.trim());
}

function groupThousands(intPart: string): string {
  const neg = intPart.startsWith("-");
  const digits = neg ? intPart.slice(1) : intPart;
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return neg ? `-${grouped}` : grouped;
}

export function formatInt(n: number, fmt: FormatSettings): string {
  const s = String(n);
  return fmt.thousandsSeparator ? groupThousands(s) : s;
}

/** Display form of a float: `42.` / `42.0` / fixed decimals, with optional grouping. */
export function formatFloat(n: number, fmt: FormatSettings): string {
  let s: string;
  if (fmt.floatStyle === "fixed") {
    s = n.toFixed(Math.max(0, Math.min(15, fmt.floatDecimals)));
    if (fmt.floatDecimals === 0) s += ".";
  } else {
    s = String(n);
    if (s.includes("e")) return s;
    if (!s.includes(".")) s += fmt.floatStyle === "trailingDot" ? "." : ".0";
  }
  if (!fmt.thousandsSeparator) return s;
  const dot = s.indexOf(".");
  return groupThousands(s.slice(0, dot)) + s.slice(dot);
}

/** Machine form of a float for text exports: always carries `.0` when integral. */
export function canonicalFloat(n: number): string {
  const s = String(n);
  return s.includes(".") || s.includes("e") || s.includes("N") || s.includes("I") ? s : `${s}.0`;
}

/** Round half away from zero. */
export function roundHalfAway(n: number): number {
  return Math.sign(n) * Math.round(Math.abs(n));
}
