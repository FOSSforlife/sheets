import { createSignal } from "solid-js";
import { type AnyOp, applyOps } from "../domain/ops";
import type { TableDoc } from "../domain/types";
import { tableRepo } from "../storage/repositories";
import { reportErrors } from "./toasts";

/** What changed, so views can patch themselves instead of re-rendering everything. */
export interface ChangeEvent {
  ops: AnyOp[];
  source: "edit" | "undo" | "redo" | "reload";
  /** Selection hint for the view after undo/redo. */
  focus?: { rowId?: string; columnId?: string };
}

type Listener = (e: ChangeEvent) => void;

interface Transaction {
  label: string;
  inverse: AnyOp[];
  focus?: ChangeEvent["focus"];
}

const SAVE_DELAY = 300;
const HISTORY_LIMIT = 200;

/**
 * Owns one table's document while it's open: applies edits as invertible ops,
 * keeps the undo/redo stacks, persists (debounced), and notifies views.
 */
export class TableSession {
  private undoStack: Transaction[] = [];
  private redoStack: Transaction[] = [];
  private listeners = new Set<Listener>();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly versionSignal = createSignal(0);
  /** Set by the grid while an in-cell editor is open (used for cross-window conflict handling). */
  editing = false;

  constructor(public doc: TableDoc) {}

  get id(): string {
    return this.doc.id;
  }

  /** Reactive counter bumped on every change. Read it to track the doc in Solid. */
  version(): number {
    return this.versionSignal[0]();
  }

  canUndo(): boolean {
    this.version();
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    this.version();
    return this.redoStack.length > 0;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Applies a transaction of ops as one undoable step. */
  apply(label: string, ops: AnyOp[], focus?: ChangeEvent["focus"]): void {
    if (ops.length === 0) return;
    const inverse = applyOps(this.doc, ops);
    this.undoStack.push({ label, inverse, focus });
    if (this.undoStack.length > HISTORY_LIMIT) this.undoStack.shift();
    this.redoStack = [];
    this.changed({ ops, source: "edit", focus });
  }

  undo(): boolean {
    const tx = this.undoStack.pop();
    if (!tx) return false;
    const redo = applyOps(this.doc, tx.inverse);
    this.redoStack.push({ label: tx.label, inverse: redo, focus: tx.focus });
    this.changed({ ops: tx.inverse, source: "undo", focus: tx.focus });
    return true;
  }

  redo(): boolean {
    const tx = this.redoStack.pop();
    if (!tx) return false;
    const undo = applyOps(this.doc, tx.inverse);
    this.undoStack.push({ label: tx.label, inverse: undo, focus: tx.focus });
    this.changed({ ops: tx.inverse, source: "redo", focus: tx.focus });
    return true;
  }

  /** Replaces the doc wholesale (e.g. after another window changed it). History is cleared. */
  replaceDoc(doc: TableDoc): void {
    this.doc = doc;
    this.undoStack = [];
    this.redoStack = [];
    this.bump();
    this.emit({ ops: [], source: "reload" });
  }

  /** Writes immediately if a save is pending. */
  flush(): void {
    if (!this.saveTimer) return;
    clearTimeout(this.saveTimer);
    this.saveTimer = null;
    this.saveNow();
  }

  /** Persists an untracked change to the doc (e.g. column widths). */
  touch(): void {
    this.scheduleSave();
  }

  /** Cancels any pending save. */
  discard(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = null;
    this.listeners.clear();
  }

  private changed(e: ChangeEvent): void {
    this.bump();
    this.emit(e);
    this.scheduleSave();
  }

  private bump(): void {
    this.versionSignal[1]((v) => v + 1);
  }

  private emit(e: ChangeEvent): void {
    for (const fn of this.listeners) fn(e);
  }

  private scheduleSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.saveNow();
    }, SAVE_DELAY);
  }

  /** Doc snapshot we last wrote; used to ignore our own storage echoes. */
  lastSaved = "";

  private saveNow(): void {
    reportErrors(() => {
      tableRepo.save(this.doc);
      this.lastSaved = JSON.stringify(this.doc);
    });
  }
}
