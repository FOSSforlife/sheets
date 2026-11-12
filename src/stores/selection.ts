import { createSignal } from "solid-js";

/**
 * The rows spanned by the active grid's selection (inclusive indices into the doc's rows).
 * Published by the grid, read by side panels such as the row inspector.
 */
export interface RowSelection {
  tableId: string;
  r0: number;
  r1: number;
}

const [rowSelection, setRowSelectionSignal] = createSignal<RowSelection | null>(null, {
  equals: (a, b) => a?.tableId === b?.tableId && a?.r0 === b?.r0 && a?.r1 === b?.r1,
});

export { rowSelection };

export function setRowSelection(tableId: string, ra: number, rb: number): void {
  setRowSelectionSignal({ tableId, r0: Math.min(ra, rb), r1: Math.max(ra, rb) });
}

export function clearRowSelection(tableId: string): void {
  if (rowSelection()?.tableId === tableId) setRowSelectionSignal(null);
}
