import { confirmConversion } from "../components/modals/ConversionDialog";
import { confirm } from "../components/modals/confirm";
import type { FormatSettings } from "../domain/settings";
import type { ConcreteType } from "../domain/types";
import type { TableSession } from "../stores/tableSession";
import { toast } from "../stores/toasts";
import {
  type CellRange,
  changeTypePlan,
  clearRangeOps,
  commitInput,
  deleteColumnsOps,
  deleteRowsOps,
  insertColumnOps,
  insertRowsOps,
  normalizeRange,
  planPaste,
  rangeToMatrix,
  renameColumnOps,
  setValueOps,
  sortOps,
  todayValue,
  toggleBoolOps,
} from "./commands";
import type { CommitMove } from "./editors/CellEditor";
import type { GridController } from "./GridController";
import { parseTsv, toTsv } from "./tsv";

/**
 * High-level grid operations: turns user intents into ops on the session and moves the selection.
 * Knows nothing about keys or DOM events (see keyboard.ts / GridView.tsx).
 */
export class GridActions {
  /** Column Tab started from, so Enter returns there (like Excel). */
  private tabAnchorCol: number | null = null;

  constructor(
    private readonly session: TableSession,
    private readonly grid: GridController,
    private readonly fmt: () => FormatSettings,
  ) {}

  private get doc() {
    return this.session.doc;
  }

  rowCount(): number {
    return this.doc.rows.length;
  }

  columnCount(): number {
    return this.doc.columns.length;
  }

  selection(): CellRange {
    return this.grid.getSelection() ?? { r0: 0, c0: 0, r1: 0, c1: 0 };
  }

  private select(ri: number, ci: number): void {
    this.grid.setSelection({ r0: ri, c0: ci, r1: ri, c1: ci });
  }

  resetTabAnchor(): void {
    this.tabAnchorCol = null;
  }

  /** Commits typed text. Returns an error message if the value doesn't fit the column. */
  commitText(rowId: string, columnId: string, text: string, move: CommitMove): string | null {
    const res = commitInput(this.doc, rowId, columnId, text, this.fmt());
    if (!res.ok) return res.error;
    const ri = this.doc.rows.findIndex((r) => r.id === rowId);
    const ci = this.doc.columns.findIndex((c) => c.id === columnId);
    const ops = [...res.ops];
    let target: { ri: number; ci: number } | null = null;

    switch (move) {
      case "down": {
        const col = this.tabAnchorCol ?? ci;
        this.tabAnchorCol = null;
        if (ri === this.doc.rows.length - 1) {
          ops.push(...insertRowsOps(this.doc.rows.length).ops);
        }
        target = { ri: ri + 1, ci: col };
        break;
      }
      case "up":
        this.tabAnchorCol = null;
        target = { ri: Math.max(0, ri - 1), ci };
        break;
      case "right":
        this.tabAnchorCol ??= ci;
        if (ci === this.doc.columns.length - 1)
          ops.push(...insertColumnOps(this.doc, this.doc.columns.length).ops);
        target = { ri, ci: ci + 1 };
        break;
      case "left":
        target = { ri, ci: Math.max(0, ci - 1) };
        break;
    }
    this.session.apply("Edit cell", ops, { rowId, columnId });
    if (target) this.select(target.ri, target.ci);
    return null;
  }

  /** Tab/Shift+Tab without an editor. Tab at the right edge creates a column. */
  tab(back: boolean): void {
    const { r0, c0 } = this.selection();
    if (back) {
      this.select(r0, Math.max(0, c0 - 1));
      return;
    }
    this.tabAnchorCol ??= c0;
    if (c0 === this.doc.columns.length - 1) {
      const { ops } = insertColumnOps(this.doc, this.doc.columns.length);
      this.session.apply("Add column", ops);
    }
    this.select(r0, c0 + 1);
  }

  clear(): void {
    this.session.apply("Clear", clearRangeOps(this.doc, this.selection()));
  }

  toggleBools(range = this.selection()): void {
    this.session.apply("Toggle", toggleBoolOps(this.doc, range));
  }

  /** Insert today / now into the active cell (date → today, datetime → now, untyped → today). */
  insertNowValue(kind: "today" | "now"): void {
    const { r0, c0 } = this.selection();
    const row = this.doc.rows[r0];
    const col = this.doc.columns[c0];
    if (!row || !col) return;
    const type: ConcreteType =
      col.type === "untyped" ? (kind === "now" ? "datetime" : "date") : (col.type as ConcreteType);
    if (type !== "date" && type !== "datetime") {
      toast(`“${col.name}” isn't a date column`, "warning");
      return;
    }
    const value = todayValue(type);
    this.session.apply(
      "Insert date",
      setValueOps(this.doc, [{ rowId: row.id, columnId: col.id, value }], type),
    );
  }

  // ---- clipboard ----

  copyText(): string {
    return toTsv(rangeToMatrix(this.doc, this.selection(), this.fmt()));
  }

  cut(): string {
    const text = this.copyText();
    this.clear();
    return text;
  }

  async paste(text: string): Promise<void> {
    if (!text) return;
    const matrix = parseTsv(text);
    const plan = planPaste(this.doc, this.selection(), matrix, this.fmt());
    if (plan.mismatches > 0) {
      const ok = await confirm({
        title: "Some values don't fit",
        message: `${plan.mismatches} pasted value${plan.mismatches === 1 ? " doesn't" : "s don't"} match the column type and will become empty.`,
        confirmLabel: "Paste anyway",
      });
      if (!ok) return;
    }
    this.session.apply("Paste", plan.ops);
    this.grid.setSelection(plan.target);
  }

  // ---- rows ----

  insertRow(where: "above" | "below"): void {
    const r = normalizeRange(this.selection());
    const index = where === "above" ? r.r0 : r.r1 + 1;
    const count = r.r1 - r.r0 + 1;
    this.session.apply("Insert row", insertRowsOps(index, count).ops);
    this.grid.setSelection({ r0: index, c0: r.c0, r1: index + count - 1, c1: r.c0 });
  }

  deleteRows(range = this.selection()): void {
    const r = normalizeRange(range);
    this.session.apply("Delete rows", deleteRowsOps(this.doc, r.r0, r.r1));
    this.select(Math.min(r.r0, this.doc.rows.length - 1), r.c0);
  }

  // ---- columns ----

  insertColumn(where: "left" | "right", at?: number): string {
    const r = normalizeRange(this.selection());
    const index = at ?? (where === "left" ? r.c0 : r.c1 + 1);
    const { ops, column } = insertColumnOps(this.doc, index);
    this.session.apply("Insert column", ops);
    this.select(r.r0, index);
    return column.id;
  }

  deleteColumns(range = this.selection()): void {
    const r = normalizeRange(range);
    this.session.apply("Delete columns", deleteColumnsOps(this.doc, r.c0, r.c1));
    this.select(r.r0, Math.min(r.c0, this.doc.columns.length - 1));
  }

  renameColumn(columnId: string, name: string): string | null {
    const res = renameColumnOps(this.doc, columnId, name);
    if (!res.ok) return res.error;
    this.session.apply("Rename column", res.ops);
    return null;
  }

  async changeType(columnId: string, to: ConcreteType): Promise<void> {
    const col = this.doc.columns.find((c) => c.id === columnId);
    if (!col || col.type === to) return;
    const { plan, ops } = changeTypePlan(this.doc, columnId, to, this.fmt());
    if (col.type !== "untyped" && plan.needsWarning && !(await confirmConversion(plan, col.name))) return;
    this.session.apply("Change type", ops, { columnId });
  }

  sort(columnId: string, dir: "asc" | "desc"): void {
    this.session.apply("Sort", sortOps(this.doc, columnId, dir), { columnId });
  }

  moveColumn(columnId: string, toIndex: number): void {
    this.session.apply("Move column", [{ kind: "moveColumn", columnId, toIndex }]);
  }

  resizeColumn(columnId: string, width: number): void {
    const col = this.doc.columns.find((c) => c.id === columnId);
    if (!col) return;
    // Widths are layout, not data: persist without an undo step.
    col.width = Math.round(width);
    this.session.touch();
  }

  undo(): void {
    if (!this.session.undo()) toast("Nothing to undo");
  }

  redo(): void {
    if (!this.session.redo()) toast("Nothing to redo");
  }
}
