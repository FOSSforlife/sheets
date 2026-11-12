import {
  dateMask,
  datePlaceholder,
  dateTimeMask,
  dateTimePlaceholder,
  daysInMonth,
} from "../../domain/dates";
import type { DateFormat, TimeFormat } from "../../domain/settings";

/**
 * Obsidian-style masked date input. Each digit fills the next slot and the caret skips over
 * separators. Pure state transitions, so the editor component stays dumb.
 *
 * `template`:  `9` = digit slot, `A` = AM/PM slot, anything else is a literal separator.
 * `placeholder`: letters shown in empty slots, which also name each segment (MM, DD, YYYY, HH, hh, mm, AM).
 */
export interface MaskState {
  template: string;
  placeholder: string;
  chars: string[];
  caret: number;
}

export function createMask(
  kind: "date" | "datetime",
  fmt: DateFormat,
  time: TimeFormat,
  text = "",
): MaskState {
  const template = kind === "date" ? dateMask(fmt) : dateTimeMask(fmt, time);
  const placeholder = kind === "date" ? datePlaceholder(fmt) : dateTimePlaceholder(fmt, time);
  const state: MaskState = { template, placeholder, chars: [...placeholder], caret: 0 };
  return text ? fillFromText(state, text) : { ...state, caret: firstSlot(state) };
}

const isSlot = (s: MaskState, i: number) => s.template[i] === "9" || s.template[i] === "A";

function firstSlot(s: MaskState): number {
  for (let i = 0; i < s.template.length; i++) if (isSlot(s, i)) return i;
  return 0;
}

function nextSlot(s: MaskState, from: number): number {
  for (let i = from; i < s.template.length; i++) if (isSlot(s, i)) return i;
  return s.template.length;
}

function prevSlot(s: MaskState, from: number): number {
  for (let i = from; i >= 0; i--) if (isSlot(s, i)) return i;
  return -1;
}

/** Fills slots from already-formatted text, e.g. `04/20/1998`. */
export function fillFromText(s: MaskState, text: string): MaskState {
  let state = { ...s, chars: [...s.placeholder], caret: firstSlot(s) };
  for (const ch of text) {
    if (/\d/.test(ch) || /[AaPp]/.test(ch)) state = typeChar(state, ch, false);
  }
  return state;
}

export function toText(s: MaskState): string {
  return s.chars.join("");
}

export function isEmpty(s: MaskState): boolean {
  return s.chars.every((c, i) => !isSlot(s, i) || c === s.placeholder[i]);
}

export function isComplete(s: MaskState): boolean {
  return s.chars.every((c, i) => !isSlot(s, i) || (s.template[i] === "9" ? /\d/.test(c) : /[AP]|M/.test(c)));
}

/** Segment (start, end exclusive, name) containing index i. */
export function segmentAt(s: MaskState, i: number): { start: number; end: number; name: string } | null {
  const idx = isSlot(s, i) ? i : nextSlot(s, i);
  if (idx >= s.template.length) {
    const p = prevSlot(s, s.template.length - 1);
    if (p < 0) return null;
    return segmentAt(s, p);
  }
  const kind = s.template[idx];
  let start = idx;
  let end = idx;
  while (start > 0 && s.template[start - 1] === kind && s.placeholder[start - 1] === s.placeholder[idx])
    start--;
  while (end < s.template.length && s.template[end] === kind) end++;
  return { start, end, name: s.placeholder.slice(start, end) };
}

/** Max value for the first digit of a 2-digit segment; above it we auto-pad (4 → 04). */
const FIRST_DIGIT_MAX: Record<string, number> = { MM: 1, DD: 3, HH: 2, hh: 1, mm: 5 };

export function typeChar(s: MaskState, ch: string, smart = true): MaskState {
  const i = nextSlot(s, s.caret);
  if (i >= s.template.length) return s;
  const chars = [...s.chars];
  if (s.template[i] === "A") {
    if (!/[AaPp]/.test(ch)) return s;
    const seg = segmentAt(s, i)!;
    chars[seg.start] = ch.toUpperCase();
    chars[seg.start + 1] = "M";
    return { ...s, chars, caret: nextSlot(s, seg.end) };
  }
  if (!/\d/.test(ch)) return s;
  const seg = segmentAt(s, i)!;
  const max = FIRST_DIGIT_MAX[seg.name];
  if (smart && max !== undefined && i === seg.start && Number(ch) > max) {
    chars[i] = "0";
    chars[i + 1] = ch;
    return { ...s, chars, caret: nextSlot(s, i + 2) };
  }
  chars[i] = ch;
  return { ...s, chars, caret: nextSlot(s, i + 1) };
}

export function backspace(s: MaskState): MaskState {
  const i = prevSlot(s, s.caret - 1);
  if (i < 0) return s;
  const chars = [...s.chars];
  if (s.template[i] === "A") {
    const seg = segmentAt(s, i)!;
    for (let k = seg.start; k < seg.end; k++) chars[k] = s.placeholder[k]!;
    return { ...s, chars, caret: seg.start };
  }
  chars[i] = s.placeholder[i]!;
  return { ...s, chars, caret: i };
}

export function deleteForward(s: MaskState): MaskState {
  const i = nextSlot(s, s.caret);
  if (i >= s.template.length) return s;
  const chars = [...s.chars];
  chars[i] = s.placeholder[i]!;
  return { ...s, chars };
}

export function moveCaret(s: MaskState, dir: -1 | 1): MaskState {
  if (dir === 1) {
    const i = nextSlot(s, s.caret + 1);
    return { ...s, caret: Math.min(i, s.template.length) };
  }
  const i = prevSlot(s, s.caret - 1);
  return i < 0 ? s : { ...s, caret: i };
}

export function setCaretFromIndex(s: MaskState, index: number): MaskState {
  const i = nextSlot(s, index);
  return { ...s, caret: i >= s.template.length ? prevSlot(s, s.template.length) + 1 || 0 : i };
}

function segmentValue(s: MaskState, seg: { start: number; end: number }): number | null {
  const t = s.chars.slice(seg.start, seg.end).join("");
  return /^\d+$/.test(t) ? Number(t) : null;
}

function findSegment(s: MaskState, name: string) {
  const i = s.placeholder.indexOf(name);
  return i < 0 ? null : { start: i, end: i + name.length };
}

/** ↑/↓: increments the segment under the caret, wrapping within its range. */
export function stepSegment(s: MaskState, delta: 1 | -1): MaskState {
  const seg = segmentAt(s, s.caret);
  if (!seg) return s;
  const chars = [...s.chars];
  if (seg.name === "AM") {
    const cur = chars[seg.start] === "P" ? "A" : "P";
    chars[seg.start] = cur;
    chars[seg.start + 1] = "M";
    return { ...s, chars };
  }
  let min = 0;
  let max = 59;
  switch (seg.name) {
    case "MM":
      min = 1;
      max = 12;
      break;
    case "DD": {
      min = 1;
      const y = findSegment(s, "YYYY");
      const m = findSegment(s, "MM");
      const yv = y ? segmentValue(s, y) : null;
      const mv = m ? segmentValue(s, m) : null;
      max = mv && mv >= 1 && mv <= 12 ? daysInMonth(yv ?? 2000, mv) : 31;
      break;
    }
    case "YYYY":
      min = 1;
      max = 9999;
      break;
    case "HH":
      max = 23;
      break;
    case "hh":
      min = 1;
      max = 12;
      break;
  }
  const current = segmentValue(s, seg);
  let next: number;
  if (current === null) {
    next = seg.name === "YYYY" ? new Date().getFullYear() : delta === 1 ? min : max;
  } else {
    next = current + delta;
    if (next > max) next = min;
    if (next < min) next = max;
  }
  const str = String(next).padStart(seg.end - seg.start, "0");
  for (let k = 0; k < str.length; k++) chars[seg.start + k] = str[k]!;
  return { ...s, chars };
}
