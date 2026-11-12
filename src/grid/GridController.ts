import {
  type CellComponent,
  type ColumnComponent,
  type ColumnDefinition,
  TabulatorFull as Tabulator,
} from "tabulator-tables";
import type { AnyOp } from "../domain/ops";
import type { FormatSettings } from "../domain/settings";
import { type Column, type TableDoc, TYPE_LABELS } from "../domain/types";
import type { ChangeEvent, TableSession } from "../stores/tableSession";
import type { CellRange } from "./commands";
import { cellHtml } from "./format";

export type NavDir = "up" | "down" | "left" | "right";

export interface GridCallbacks {
  onCellDblClick(ri: number, ci: number): void;
  onCheckboxClick(ri: number, ci: number): void;
  onTypePillClick(columnId: string, anchor: DOMRect): void;
  onHeaderDblClick(columnId: string): void;
  onHeaderContext(columnId: string, e: MouseEvent): void;
  onCellContext(ri: number, ci: number, e: MouseEvent): void;
  onRowHeaderContext(ri: number, e: MouseEvent): void;
  onColumnMoved(columnId: string, toIndex: number): void;
  onColumnResized(columnId: string, width: number): void;
  onSelectionChange(range: CellRange): void;
}

const ROW_ID = "__rowId";

/**
 * Adapter between a TableSession and a Tabulator instance. Tabulator is used purely as a view:
 * rendering, virtual scrolling, mouse range selection, column resize/move. All keyboard handling,
 * editing, clipboard and history are ours (see GridView / keyboard.ts).
 */
export class GridController {
  readonly table: Tabulator;
  private ready = false;
  private pendingSelection: CellRange | null = null;
  private unsubscribe: () => void;
  /** Set while applying a change that Tabulator already shows (e.g. a column it just moved). */
  private skipNextSync = false;

  constructor(
    private readonly el: HTMLElement,
    private readonly session: TableSession,
    private fmt: FormatSettings,
    private readonly cb: GridCallbacks,
  ) {
    this.table = new Tabulator(el, {
      data: this.rowData(),
      columns: this.columnDefs(),
      index: ROW_ID,
      layout: "fitData",
      height: "100%",
      renderHorizontal: "virtual",
      reactiveData: false,
      keybindings: false,
      movableColumns: true,
      selectableRange: 1,
      selectableRangeColumns: true,
      selectableRangeRows: true,
      selectableRangeClearCells: false,
      rowHeader: {
        formatter: "rownum",
        headerSort: false,
        resizable: false,
        frozen: true,
        hozAlign: "right",
        width: 48,
        cssClass: "row-header",
      },
      columnDefaults: { headerSort: false, resizable: true, minWidth: 60 },
      placeholder: "",
    } as any);

    this.table.on("tableBuilt", () => {
      this.ready = true;
      if (this.pendingSelection) this.setSelection(this.pendingSelection);
      this.pendingSelection = null;
    });
    this.bindEvents();
    if (import.meta.env.DEV) (window as any).__grid = this;
    this.unsubscribe = session.subscribe((e) => this.sync(e));
  }

  // ---- building ----

  private get doc(): TableDoc {
    return this.session.doc;
  }

  private rowData(): Record<string, unknown>[] {
    return this.doc.rows.map((r) => ({ [ROW_ID]: r.id, ...r.cells }));
  }

  private columnDefs(): ColumnDefinition[] {
    return this.doc.columns.map((c) => this.columnDef(c));
  }

  private columnDef(col: Column): ColumnDefinition {
    const fmt = () => this.fmt;
    const cb = this.cb;
    return {
      field: col.id,
      title: col.name,
      width: col.width,
      cssClass: `type-${col.type}`,
      hozAlign:
        col.type === "int" || col.type === "float" ? "right" : col.type === "bool" ? "center" : "left",
      formatter: (cell: CellComponent) => cellHtml(cell.getValue(), col.type, fmt()),
      tooltip: (_e: MouseEvent, cell: CellComponent) => {
        const v = cell.getValue();
        return typeof v === "string" && (v.includes("\n") || v.length > 40) ? v : "";
      },
      titleFormatter: () => {
        const wrap = document.createElement("div");
        wrap.className = "hdr";
        const name = document.createElement("div");
        name.className = "hdr-name";
        name.textContent = col.name;
        name.title = col.name;
        const pill = document.createElement("button");
        pill.type = "button";
        pill.tabIndex = -1;
        pill.className = `pill pill-${col.type}`;
        pill.textContent = TYPE_LABELS[col.type];
        pill.title = "Change column type";
        pill.addEventListener("mousedown", (e) => e.stopPropagation());
        pill.addEventListener("click", (e) => {
          e.stopPropagation();
          cb.onTypePillClick(col.id, pill.getBoundingClientRect());
        });
        wrap.append(name, pill);
        return wrap;
      },
    } as ColumnDefinition;
  }

  private bindEvents(): void {
    const t = this.table;
    t.on("cellDblClick", (_e, cell) => {
      const p = this.cellPos(cell);
      if (p) this.cb.onCellDblClick(p.ri, p.ci);
    });
    t.on("cellClick", (e, cell) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-checkbox]")) return;
      const p = this.cellPos(cell);
      if (p) this.cb.onCheckboxClick(p.ri, p.ci);
    });
    t.on("cellContext", (e, cell) => {
      e.preventDefault();
      const p = this.cellPos(cell);
      if (!p) {
        const ri = this.rowIndex(cell);
        if (ri >= 0) this.cb.onRowHeaderContext(ri, e as MouseEvent);
        return;
      }
      this.cb.onCellContext(p.ri, p.ci, e as MouseEvent);
    });
    t.on("headerDblClick", (e, column) => {
      if ((e.target as HTMLElement).closest(".pill")) return;
      const id = column.getField();
      if (id) this.cb.onHeaderDblClick(id);
    });
    t.on("headerContext", (e, column) => {
      e.preventDefault();
      const id = column.getField();
      if (id) this.cb.onHeaderContext(id, e as MouseEvent);
    });
    t.on("columnMoved", (column: ColumnComponent) => {
      const id = column.getField();
      const order = this.table
        .getColumns()
        .map((c) => c.getField())
        .filter(Boolean);
      this.skipNextSync = true;
      this.cb.onColumnMoved(id, order.indexOf(id));
      this.skipNextSync = false;
    });
    t.on("columnResized", (column: ColumnComponent) => {
      const id = column.getField();
      if (id) this.cb.onColumnResized(id, column.getWidth());
    });
    const selChanged = () => {
      const r = this.getSelection();
      if (r) this.cb.onSelectionChange(r);
    };
    t.on("rangeChanged", selChanged);
    t.on("rangeAdded", selChanged);
  }

  private rowIndex(cell: CellComponent): number {
    const id = cell.getRow().getData()[ROW_ID];
    return this.doc.rows.findIndex((r) => r.id === id);
  }

  private cellPos(cell: CellComponent): { ri: number; ci: number } | null {
    const field = cell.getField();
    if (!field) return null;
    const ci = this.doc.columns.findIndex((c) => c.id === field);
    const ri = this.rowIndex(cell);
    return ci < 0 || ri < 0 ? null : { ri, ci };
  }

  // ---- syncing from the model ----

  setFormat(fmt: FormatSettings): void {
    this.fmt = fmt;
    if (this.ready) this.table.redraw(true);
  }

  /** While Tabulator rebuilds asynchronously, selection requests are deferred until it's done. */
  private rebuilding = false;
  private selectionAfterRebuild: CellRange | null = null;

  private sync(e: ChangeEvent): void {
    if (this.skipNextSync) return;
    const structural = e.source === "reload" || e.ops.some((op) => op.kind !== "setCells");
    const focus = e.source === "undo" || e.source === "redo" ? this.focusRange(e.focus) : null;
    if (!structural) {
      this.updateRows(e.ops);
      if (focus) this.setSelection(focus);
      return;
    }
    const sel = this.rebuilding ? this.selectionAfterRebuild : this.getSelection();
    this.selectionAfterRebuild = focus ?? sel;
    this.rebuilding = true;
    const columnsChanged =
      e.source === "reload" ||
      e.ops.some((op) => ["insertColumn", "removeColumn", "updateColumn", "moveColumn"].includes(op.kind));
    if (columnsChanged) this.table.setColumns(this.columnDefs());
    void this.table.replaceData(this.rowData()).then(() => {
      setTimeout(() => {
        this.rebuilding = false;
        const target = this.selectionAfterRebuild;
        this.selectionAfterRebuild = null;
        if (target) this.setSelection(this.clampRange(target));
      });
    });
  }

  private focusRange(f: ChangeEvent["focus"]): CellRange | null {
    if (!f) return null;
    const cur = this.getSelection() ?? { r0: 0, c0: 0, r1: 0, c1: 0 };
    const ri = f.rowId ? this.doc.rows.findIndex((r) => r.id === f.rowId) : cur.r0;
    const ci = f.columnId ? this.doc.columns.findIndex((c) => c.id === f.columnId) : cur.c0;
    if (ri < 0 || ci < 0) return null;
    return { r0: ri, c0: ci, r1: ri, c1: ci };
  }

  private updateRows(ops: AnyOp[]): void {
    const ids = new Set<string>();
    for (const op of ops) if (op.kind === "setCells") for (const c of op.changes) ids.add(c.rowId);
    const updates = this.doc.rows
      .filter((r) => ids.has(r.id))
      .map((r) => {
        const data: Record<string, unknown> = { [ROW_ID]: r.id };
        for (const c of this.doc.columns) data[c.id] = r.cells[c.id] ?? null;
        return data;
      });
    if (updates.length) void this.table.updateData(updates);
  }

  // ---- selection ----

  private get ranges(): any {
    return (this.table as any).modules?.selectRange;
  }

  private clampRange(r: CellRange): CellRange {
    const maxR = Math.max(0, this.doc.rows.length - 1);
    const maxC = Math.max(0, this.doc.columns.length - 1);
    const cl = (v: number, m: number) => Math.max(0, Math.min(v, m));
    return { r0: cl(r.r0, maxR), r1: cl(r.r1, maxR), c0: cl(r.c0, maxC), c1: cl(r.c1, maxC) };
  }

  /** Active range in data coordinates; r0/c0 is the anchor (active cell). */
  getSelection(): CellRange | null {
    if (this.rebuilding && this.selectionAfterRebuild) return this.selectionAfterRebuild;
    const range = this.ranges?.activeRange;
    if (!range || range.start.row === undefined) return null;
    const off = this.ranges.rowHeader ? 1 : 0;
    return {
      r0: range.start.row,
      c0: Math.max(0, range.start.col - off),
      r1: range.end.row,
      c1: Math.max(0, range.end.col - off),
    };
  }

  /** 'cell' | 'row' | 'column' | 'all' */
  selectionMode(): string {
    return this.ranges?.selecting ?? "cell";
  }

  setSelection(r: CellRange, scroll = true): void {
    if (this.rebuilding) {
      this.selectionAfterRebuild = r;
      return;
    }
    if (!this.ready) {
      this.pendingSelection = r;
      return;
    }
    const m = this.ranges;
    if (!m) return;
    const range = m.activeRange || m.addRange();
    const off = m.rowHeader ? 1 : 0;
    const c = this.clampRange(r);
    range.setStart(c.r0, c.c0 + off);
    range.setEnd(c.r1, c.c1 + off);
    m.selecting = "cell";
    m.layoutElement();
    if (scroll) this.scrollIntoView(c.r1, c.c1);
    this.cb.onSelectionChange(c);
  }

  /** Arrow navigation via Tabulator's range module (handles jump/expand and auto-scroll). */
  navigate(dir: NavDir, jump: boolean, expand: boolean): void {
    this.ranges?.navigate(jump, expand, dir);
    const r = this.getSelection();
    if (r) this.cb.onSelectionChange(r);
  }

  selectAll(): void {
    this.setSelection({ r0: 0, c0: 0, r1: this.doc.rows.length - 1, c1: this.doc.columns.length - 1 }, false);
  }

  scrollIntoView(ri: number, ci: number): void {
    const row = this.doc.rows[ri];
    const col = this.doc.columns[ci];
    if (!row || !col) return;
    // Tabulator logs a warning for unknown rows (e.g. mid-rebuild), so only scroll to rows it has.
    if (this.hasRow(row.id)) void this.table.scrollToRow(row.id, "nearest", false).catch(() => {});
    const holder = this.el.querySelector(".tabulator-tableholder") as HTMLElement | null;
    const colEl = this.table.getColumn(col.id)?.getElement();
    if (!holder || !colEl) return;
    const left = colEl.offsetLeft;
    const right = left + colEl.offsetWidth;
    const frozen = 48;
    if (left - frozen < holder.scrollLeft) holder.scrollLeft = Math.max(0, left - frozen);
    else if (right > holder.scrollLeft + holder.clientWidth) holder.scrollLeft = right - holder.clientWidth;
  }

  /** Silent row lookup (Tabulator's public `getRow` logs a warning when the row is missing). */
  private hasRow(id: string): boolean {
    return !!(this.table as any).rowManager?.findRow(id);
  }

  /** Viewport rect of a cell (for positioning the editor overlay). */
  cellRect(ri: number, ci: number): DOMRect | null {
    const row = this.doc.rows[ri];
    const col = this.doc.columns[ci];
    if (!row || !col) return null;
    if (!this.hasRow(row.id)) return null;
    const el = this.table.getRow(row.id)?.getCell(col.id)?.getElement();
    return el?.isConnected ? el.getBoundingClientRect() : null;
  }

  headerRect(columnId: string): DOMRect | null {
    const el = this.table.getColumn(columnId)?.getElement();
    return el ? el.getBoundingClientRect() : null;
  }

  pillRect(columnId: string): DOMRect | null {
    const el = this.table.getColumn(columnId)?.getElement().querySelector(".pill");
    return el ? el.getBoundingClientRect() : null;
  }

  visibleRowCount(): number {
    const holder = this.el.querySelector(".tabulator-tableholder") as HTMLElement | null;
    const rowEl = this.el.querySelector(".tabulator-row") as HTMLElement | null;
    if (!holder || !rowEl) return 10;
    return Math.max(1, Math.floor(holder.clientHeight / rowEl.offsetHeight) - 1);
  }

  focus(): void {
    const el = this.el.querySelector(".tabulator-tableholder") as HTMLElement | null;
    el?.focus({ preventScroll: true });
  }

  redraw(): void {
    if (this.ready) this.table.redraw();
  }

  destroy(): void {
    this.unsubscribe();
    this.table.destroy();
  }
}
