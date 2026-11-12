import type { DateFormat, TimeFormat } from "./settings";

/** Pure date helpers. Dates are naive: `YYYY-MM-DD` and `YYYY-MM-DDTHH:mm:ss`, no time zone. */

export interface DateParts {
  y: number;
  m: number;
  d: number;
}
export interface DateTimeParts extends DateParts {
  hh: number;
  mm: number;
  ss: number;
}

const pad = (n: number, len = 2) => String(n).padStart(len, "0");

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function isValidDate({ y, m, d }: DateParts): boolean {
  return y >= 1 && y <= 9999 && m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m);
}

export function isValidTime(hh: number, mm: number, ss: number): boolean {
  return hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59 && ss >= 0 && ss <= 59;
}

export function toIsoDate(p: DateParts): string {
  return `${pad(p.y, 4)}-${pad(p.m)}-${pad(p.d)}`;
}

export function toIsoDateTime(p: DateTimeParts): string {
  return `${toIsoDate(p)}T${pad(p.hh)}:${pad(p.mm)}:${pad(p.ss)}`;
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_DATETIME =
  /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/;

export function parseIsoDate(text: string): DateParts | null {
  const m = ISO_DATE.exec(text);
  if (!m) return null;
  const p = { y: +m[1]!, m: +m[2]!, d: +m[3]! };
  return isValidDate(p) ? p : null;
}

/**
 * Parses ISO datetimes. Values with an offset are converted to local wall-clock time and the
 * offset dropped (we only store naive datetimes).
 */
export function parseIsoDateTime(text: string): DateTimeParts | null {
  const m = ISO_DATETIME.exec(text);
  if (!m) return null;
  let p: DateTimeParts = { y: +m[1]!, m: +m[2]!, d: +m[3]!, hh: +m[4]!, mm: +m[5]!, ss: m[6] ? +m[6] : 0 };
  if (!isValidDate(p) || !isValidTime(p.hh, p.mm, p.ss)) return null;
  if (m[7]) {
    const instant = new Date(`${toIsoDateTime(p)}${m[7] === "Z" ? "Z" : normalizeOffset(m[7])}`);
    if (Number.isNaN(instant.getTime())) return null;
    p = fromLocalDate(instant);
  }
  return p;
}

function normalizeOffset(off: string): string {
  return off.includes(":") ? off : `${off.slice(0, 3)}:${off.slice(3)}`;
}

export function fromLocalDate(d: Date): DateTimeParts {
  return {
    y: d.getFullYear(),
    m: d.getMonth() + 1,
    d: d.getDate(),
    hh: d.getHours(),
    mm: d.getMinutes(),
    ss: d.getSeconds(),
  };
}

export function todayIso(now = new Date()): string {
  return toIsoDate(fromLocalDate(now));
}

export function nowIso(now = new Date()): string {
  return toIsoDateTime({ ...fromLocalDate(now), ss: 0 });
}

// ---- Display formats ----

/** Mask template for the configured format. `9` = digit slot, `A` = AM/PM slot. */
export function dateMask(fmt: DateFormat): string {
  return fmt === "YMD" ? "9999-99-99" : fmt === "DMY_DOT" ? "99.99.9999" : "99/99/9999";
}

export function dateTimeMask(fmt: DateFormat, time: TimeFormat): string {
  return `${dateMask(fmt)} 99:99${time === "12h" ? " AA" : ""}`;
}

export function datePlaceholder(fmt: DateFormat): string {
  return { MDY: "MM/DD/YYYY", DMY: "DD/MM/YYYY", YMD: "YYYY-MM-DD", DMY_DOT: "DD.MM.YYYY" }[fmt];
}

export function dateTimePlaceholder(fmt: DateFormat, time: TimeFormat): string {
  return `${datePlaceholder(fmt)} ${time === "12h" ? "hh:mm AM" : "HH:mm"}`;
}

export function formatDateParts(p: DateParts, fmt: DateFormat): string {
  const y = pad(p.y, 4);
  const m = pad(p.m);
  const d = pad(p.d);
  switch (fmt) {
    case "MDY":
      return `${m}/${d}/${y}`;
    case "DMY":
      return `${d}/${m}/${y}`;
    case "YMD":
      return `${y}-${m}-${d}`;
    case "DMY_DOT":
      return `${d}.${m}.${y}`;
  }
}

export function formatTime(hh: number, mm: number, time: TimeFormat): string {
  if (time === "24h") return `${pad(hh)}:${pad(mm)}`;
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${pad(h12)}:${pad(mm)} ${hh < 12 ? "AM" : "PM"}`;
}

export function formatIsoDate(iso: string, fmt: DateFormat): string {
  const p = parseIsoDate(iso);
  return p ? formatDateParts(p, fmt) : iso;
}

export function formatIsoDateTime(iso: string, fmt: DateFormat, time: TimeFormat): string {
  const p = parseIsoDateTime(iso);
  if (!p) return iso;
  const base = `${formatDateParts(p, fmt)} ${formatTime(p.hh, p.mm, time)}`;
  return p.ss ? base.replace(/(\d{2}:\d{2})/, `$1:${pad(p.ss)}`) : base;
}

function displayDateRegex(fmt: DateFormat): RegExp {
  const sep = fmt === "DMY_DOT" ? "\\." : fmt === "YMD" ? "-" : "/";
  return fmt === "YMD"
    ? new RegExp(`^(\\d{4})${sep}(\\d{1,2})${sep}(\\d{1,2})`)
    : new RegExp(`^(\\d{1,2})${sep}(\\d{1,2})${sep}(\\d{4})`);
}

function partsFromMatch(m: RegExpExecArray, fmt: DateFormat): DateParts {
  const [a, b, c] = [+m[1]!, +m[2]!, +m[3]!];
  switch (fmt) {
    case "MDY":
      return { y: c, m: a, d: b };
    case "DMY":
    case "DMY_DOT":
      return { y: c, m: b, d: a };
    case "YMD":
      return { y: a, m: b, d: c };
  }
}

/** Parses a date typed in the display format (or ISO). Returns ISO or null. */
export function parseDisplayDate(text: string, fmt: DateFormat): string | null {
  const t = text.trim();
  const iso = parseIsoDate(t);
  if (iso) return toIsoDate(iso);
  const re = displayDateRegex(fmt);
  const m = re.exec(t);
  if (!m || m[0].length !== t.length) return null;
  const p = partsFromMatch(m, fmt);
  return isValidDate(p) ? toIsoDate(p) : null;
}

/** Parses a datetime typed in the display format (or ISO). Returns ISO or null. */
export function parseDisplayDateTime(text: string, fmt: DateFormat): string | null {
  const t = text.trim();
  const iso = parseIsoDateTime(t);
  if (iso) return toIsoDateTime(iso);
  const re = displayDateRegex(fmt);
  const m = re.exec(t);
  if (!m) return null;
  const rest = t.slice(m[0].length);
  const tm = /^[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])?$/.exec(rest);
  if (!tm) return null;
  const date = partsFromMatch(m, fmt);
  let hh = +tm[1]!;
  const mm = +tm[2]!;
  const ss = tm[3] ? +tm[3] : 0;
  const ampm = tm[4]?.toUpperCase();
  if (ampm) {
    if (hh < 1 || hh > 12) return null;
    hh = (hh % 12) + (ampm === "PM" ? 12 : 0);
  }
  if (!isValidDate(date) || !isValidTime(hh, mm, ss)) return null;
  return toIsoDateTime({ ...date, hh, mm, ss });
}
