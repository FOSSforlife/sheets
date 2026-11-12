import type { GridActions } from "./GridActions";
import type { GridController, NavDir } from "./GridController";

export interface KeyContext {
  actions: GridActions;
  grid: GridController;
  /** Opens the editor on the active cell. `text` given → replace mode with that initial text. */
  startEdit(text?: string): void;
  renameSelectedColumn(): boolean;
  isBoolCell(): boolean;
}

const ARROWS: Record<string, NavDir> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
};

/**
 * The fixed spreadsheet keys (navigation, editing, clearing, undo). Configurable shortcuts are
 * dispatched separately through the keymap. Runs only while no editor is open.
 * Returns true if the event was handled.
 */
export function handleGridKey(e: KeyboardEvent, ctx: KeyContext): boolean {
  const mod = e.ctrlKey || e.metaKey;
  const { actions, grid } = ctx;
  const sel = actions.selection();

  const dir = ARROWS[e.key];
  if (dir && !e.altKey) {
    actions.resetTabAnchor();
    grid.navigate(dir, mod, e.shiftKey);
    return true;
  }

  if (mod && !e.altKey) {
    switch (e.key.toLowerCase()) {
      case "z":
        if (e.shiftKey) actions.redo();
        else actions.undo();
        return true;
      case "y":
        actions.redo();
        return true;
      case "a":
        grid.selectAll();
        return true;
      case "home":
        grid.setSelection({ r0: 0, c0: 0, r1: 0, c1: 0 });
        return true;
      case "end": {
        const r = actions.rowCount() - 1;
        const c = actions.columnCount() - 1;
        grid.setSelection({ r0: r, c0: c, r1: r, c1: c });
        return true;
      }
    }
    return false; // let copy/cut/paste events and app shortcuts through
  }
  if (e.altKey || e.metaKey) return false;

  switch (e.key) {
    case "Tab":
      actions.tab(e.shiftKey);
      return true;
    case "Enter":
      if (e.shiftKey) grid.navigate("up", false, false);
      else ctx.startEdit();
      return true;
    case "F2":
      if (!ctx.renameSelectedColumn()) ctx.startEdit();
      return true;
    case "Delete":
    case "Backspace":
      actions.clear();
      return true;
    case "Home":
      grid.setSelection({ r0: sel.r0, c0: 0, r1: sel.r0, c1: 0 });
      return true;
    case "End": {
      const last = actions.columnCount() - 1;
      grid.setSelection({ r0: sel.r0, c0: last, r1: sel.r0, c1: last });
      return true;
    }
    case "PageDown":
    case "PageUp": {
      const n = grid.visibleRowCount() * (e.key === "PageDown" ? 1 : -1);
      const r = sel.r0 + n;
      grid.setSelection({ r0: r, c0: sel.c0, r1: r, c1: sel.c0 });
      return true;
    }
    case " ":
      if (ctx.isBoolCell()) {
        actions.toggleBools();
        return true;
      }
      break;
    case "Escape":
      grid.setSelection({ r0: sel.r0, c0: sel.c0, r1: sel.r0, c1: sel.c0 }, false);
      return true;
  }

  if (e.key.length === 1 && !e.ctrlKey) {
    ctx.startEdit(e.key);
    return true;
  }
  return false;
}
