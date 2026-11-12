import type { FormatSettings } from "../domain/settings";
import type { CellValue, ColumnType } from "../domain/types";
import { formatDisplay } from "../domain/values";

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ESC[c]!);

const CHECK_SVG =
  '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/** HTML for a cell. Strings show line breaks as ↵ (full text is in the tooltip). */
export function cellHtml(value: CellValue | undefined, type: ColumnType, fmt: FormatSettings): string {
  if (type === "bool") {
    const state = value === true ? "true" : value === false ? "false" : "null";
    return `<span class="cb cb-${state}" data-checkbox="1">${value === true ? CHECK_SVG : ""}</span>`;
  }
  if (value === null || value === undefined) return "";
  const text = formatDisplay(value, type, fmt);
  return escapeHtml(text).replace(/\n/g, '<span class="nl">↵</span>');
}
