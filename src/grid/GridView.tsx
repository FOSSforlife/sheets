import { createEffect, createSignal, on, onCleanup, onMount, Show } from "solid-js";
import { unwrap } from "solid-js/store";
import { Plus } from "../components/ui/icons";
import { openMenuAt, openMenuBelow } from "../components/ui/menu";
import { formatForEdit } from "../domain/values";
import { type ActionId, registerAction } from "../stores/keymap";
import { clearRowSelection, setRowSelection } from "../stores/selection";
import { settings } from "../stores/settings";
import type { TableSession } from "../stores/tableSession";
import { reportErrors, toast } from "../stores/toasts";
import { setCursor, ui } from "../stores/ui";
import { CellEditor, type CommitMove, type EditorRequest } from "./editors/CellEditor";
import { GridActions } from "./GridActions";
import { GridController } from "./GridController";
import { handleGridKey } from "./keyboard";
import { cellMenuItems, headerMenuItems, rowItems, typeMenuItems } from "./menus";

interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

const isEditable = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);

/** One table's spreadsheet: Tabulator view + editor overlay + header rename + menus + clipboard. */
export function GridView(props: { session: TableSession }) {
  let root!: HTMLDivElement;
  let host!: HTMLDivElement;
  let grid!: GridController;
  let actions!: GridActions;
  const session = props.session;
  const fmt = () => unwrap(settings.format);

  const [editor, setEditor] = createSignal<EditorRequest | null>(null);
  const [editorRect, setEditorRect] = createSignal<Rect | null>(null);
  const [editorError, setEditorError] = createSignal<string | null>(null);
  const [addButtons, setAddButtons] = createSignal<{ column: Rect | null; row: Rect | null }>({
    column: null,
    row: null,
  });
  const [rename, setRename] = createSignal<{ columnId: string; rect: Rect; error: string | null } | null>(
    null,
  );

  const toLocal = (r: DOMRect): Rect => {
    const base = root.getBoundingClientRect();
    return { left: r.left - base.left, top: r.top - base.top, width: r.width, height: r.height };
  };

  const doc = () => session.doc;

  /** Re-measures where the add-row / add-column buttons sit (they track scrolling and resizing). */
  function layoutAddButtons(): void {
    if (!grid) return; // Tabulator can emit layout events while still being constructed
    const a = grid.addButtonAnchors();
    setAddButtons({ column: a.column && toLocal(a.column), row: a.row && toLocal(a.row) });
  }

  // ---- editing ----

  /** Characters typed while an editor is waiting for its cell to scroll into view. */
  let pendingEdit: { text?: string } | null = null;

  function startEdit(text?: string): void {
    if (pendingEdit) {
      if (text !== undefined) pendingEdit.text = (pendingEdit.text ?? "") + text;
      return;
    }
    const sel = actions.selection();
    const row = doc().rows[sel.r0];
    const col = doc().columns[sel.c0];
    if (!row || !col) return;
    grid.setSelection({ r0: sel.r0, c0: sel.c0, r1: sel.r0, c1: sel.c0 });
    const open = (initial?: string) => {
      const rect = grid.cellRect(sel.r0, sel.c0);
      if (!rect) return false;
      const kind = col.type === "date" ? "date" : col.type === "datetime" ? "datetime" : "text";
      setEditorRect(toLocal(rect));
      setEditorError(null);
      setEditor({
        rowId: row.id,
        columnId: col.id,
        kind,
        multiline: col.type === "string" || col.type === "untyped",
        text: initial ?? formatForEdit(row.cells[col.id] ?? null, col.type, fmt()),
        mode: initial === undefined ? "edit" : "replace",
      });
      session.editing = true;
      return true;
    };
    if (open(text)) return;
    // The cell isn't rendered yet (scrolled away): wait for the scroll, buffering keystrokes.
    pendingEdit = { text };
    setTimeout(() => {
      const p = pendingEdit;
      pendingEdit = null;
      if (p) open(p.text);
    }, 30);
  }

  function closeEditor(refocus: boolean): void {
    setEditor(null);
    setEditorError(null);
    session.editing = false;
    if (refocus) grid.focus();
  }

  function commit(text: string, move: CommitMove): void {
    const req = editor();
    if (!req) return;
    const err = actions.commitText(req.rowId, req.columnId, text, move === "blur" ? "none" : move);
    if (err) {
      if (move === "blur") {
        closeEditor(false);
        toast(`Not saved: ${err}`, "warning");
      } else setEditorError(err);
      return;
    }
    closeEditor(move !== "blur");
  }

  // ---- header rename ----

  function startRename(columnId: string): void {
    const rect = grid.headerRect(columnId);
    if (rect) setRename({ columnId, rect: toLocal(rect), error: null });
  }

  function finishRename(value: string | null): void {
    const r = rename();
    if (!r) return;
    if (value !== null) {
      const err = actions.renameColumn(r.columnId, value);
      if (err) {
        setRename({ ...r, error: err });
        return;
      }
    }
    setRename(null);
    grid.focus();
  }

  function renameSelectedColumn(): boolean {
    if (grid.selectionMode() !== "column") return false;
    const col = doc().columns[actions.selection().c0];
    if (col) startRename(col.id);
    return !!col;
  }

  function openTypeMenu(columnId: string, anchor?: DOMRect): void {
    const col = doc().columns.find((c) => c.id === columnId);
    const rect = anchor ?? grid.pillRect(columnId);
    if (col && rect) openMenuBelow(typeMenuItems(col, actions), rect, () => grid.focus());
  }

  // ---- clipboard ----

  const clipboard = {
    copy: () => void navigator.clipboard?.writeText(actions.copyText()),
    cut: () => void navigator.clipboard?.writeText(actions.cut()),
    paste: () => {
      navigator.clipboard
        ?.readText()
        .then((t) => actions.paste(t))
        .catch(() => toast("Use Ctrl/⌘+V to paste — the browser blocked clipboard access", "warning"));
    },
  };

  function onCopy(e: ClipboardEvent, cut: boolean): void {
    if (isEditable(e.target) || editor()) return;
    e.preventDefault();
    e.clipboardData?.setData("text/plain", cut ? actions.cut() : actions.copyText());
  }

  function onPaste(e: ClipboardEvent): void {
    if (isEditable(e.target) || editor()) return;
    e.preventDefault();
    void actions.paste(e.clipboardData?.getData("text/plain") ?? "");
  }

  // ---- keys ----

  function onKeyDown(e: KeyboardEvent): void {
    if (isEditable(e.target) || editor() || rename()) return;
    const handled = handleGridKey(e, {
      actions,
      grid,
      startEdit,
      renameSelectedColumn,
      isBoolCell: () => doc().columns[actions.selection().c0]?.type === "bool",
    });
    if (handled) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  function registerActions(): void {
    const whenIdle = (fn: () => void) => () => {
      if (editor() || rename()) return false;
      fn();
      return true;
    };
    const selectedCol = () => doc().columns[actions.selection().c0];
    const map: Partial<Record<ActionId, () => boolean | undefined>> = {
      insertToday: () => {
        if (editor()) closeEditor(true);
        actions.insertNowValue("today");
        return true;
      },
      insertNow: () => {
        if (editor()) closeEditor(true);
        actions.insertNowValue("now");
        return true;
      },
      insertRowAbove: whenIdle(() => actions.insertRow("above")),
      insertRowBelow: whenIdle(() => actions.insertRow("below")),
      deleteRows: whenIdle(() => actions.deleteRows()),
      insertColumnLeft: whenIdle(() => actions.insertColumn("left")),
      insertColumnRight: whenIdle(() => actions.insertColumn("right")),
      deleteColumns: whenIdle(() => actions.deleteColumns()),
      renameColumn: whenIdle(() => {
        const c = selectedCol();
        if (c) startRename(c.id);
      }),
      openTypeMenu: whenIdle(() => {
        const c = selectedCol();
        if (c) openTypeMenu(c.id);
      }),
    };
    for (const [id, fn] of Object.entries(map)) onCleanup(registerAction(id as ActionId, fn));
  }

  // ---- lifecycle ----

  onMount(() => {
    grid = new GridController(host, session, fmt(), {
      onCellDblClick: () => startEdit(),
      onCheckboxClick: (ri, ci) => actions.toggleBools({ r0: ri, c0: ci, r1: ri, c1: ci }),
      onTypePillClick: (id, rect) => openTypeMenu(id, rect),
      onHeaderDblClick: (id) => startRename(id),
      onHeaderContext: (id, e) => {
        const col = doc().columns.find((c) => c.id === id);
        if (col)
          openMenuAt(
            headerMenuItems(col, actions, () => startRename(id)),
            e,
          );
      },
      onCellContext: (_ri, _ci, e) => openMenuAt(cellMenuItems(actions, clipboard), e),
      onRowHeaderContext: (_ri, e) => openMenuAt(rowItems(actions), e),
      onColumnMoved: (id, to) => actions.moveColumn(id, to),
      onColumnResized: (id, w) => actions.resizeColumn(id, w),
      onLayout: () => layoutAddButtons(),
      onSelectionChange: (r) => {
        setRowSelection(session.id, r.r0, r.r1);
        const row = doc().rows[r.r0];
        const col = doc().columns[r.c0];
        if (row && col) setCursor(session.id, { rowId: row.id, columnId: col.id });
      },
    });
    actions = new GridActions(session, grid, fmt);

    const saved = ui.cursors[session.id];
    const ri = saved ? doc().rows.findIndex((r) => r.id === saved.rowId) : 0;
    const ci = saved ? doc().columns.findIndex((c) => c.id === saved.columnId) : 0;
    const r = Math.max(0, ri);
    const c = Math.max(0, ci);
    grid.setSelection({ r0: r, c0: c, r1: r, c1: c });
    setTimeout(() => grid.focus(), 50);

    root.addEventListener("keydown", onKeyDown, true);
    root.addEventListener("copy", (e) => onCopy(e, false));
    root.addEventListener("cut", (e) => onCopy(e, true));
    root.addEventListener("paste", onPaste);
    registerActions();

    const ro = new ResizeObserver(() => {
      grid.redraw();
      layoutAddButtons();
    });
    // Data changes can move the last row / column without a Tabulator render event (e.g. updateData).
    onCleanup(session.subscribe(() => setTimeout(layoutAddButtons)));
    ro.observe(root);

    // Close the editor if its cell scrolls away; otherwise follow it.
    const holder = host.querySelector(".tabulator-tableholder");
    const onScroll = () => {
      const req = editor();
      if (!req) return;
      const ri2 = doc().rows.findIndex((x) => x.id === req.rowId);
      const ci2 = doc().columns.findIndex((x) => x.id === req.columnId);
      const rect = grid.cellRect(ri2, ci2);
      if (rect) setEditorRect(toLocal(rect));
    };
    holder?.addEventListener("scroll", onScroll);

    onCleanup(() => {
      ro.disconnect();
      holder?.removeEventListener("scroll", onScroll);
      session.editing = false;
      clearRowSelection(session.id);
      reportErrors(() => grid.destroy());
    });
  });

  // Display settings changed → re-render cells.
  createEffect(
    on(
      () => JSON.stringify(settings.format),
      () => grid?.setFormat(fmt()),
      { defer: true },
    ),
  );

  return (
    <div ref={root} class="grid-root relative h-full w-full" data-density={settings.density}>
      <div ref={host} class="h-full w-full" />
      <Show when={addButtons().column}>
        {(r) => (
          <button
            type="button"
            class="grid-add-btn"
            title="Add column"
            style={{ left: `${r().left + 4}px`, top: `${r().top + r().height / 2 - 11}px` }}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              actions.appendColumn();
              grid.focus();
            }}
          >
            <Plus size={14} />
          </button>
        )}
      </Show>
      <Show when={addButtons().row}>
        {(r) => (
          <button
            type="button"
            class="grid-add-btn"
            title="Add row"
            style={{ left: `${r().left + r().width / 2 - 11}px`, top: `${r().top + 4}px` }}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              actions.appendRow();
              grid.focus();
            }}
          >
            <Plus size={14} />
          </button>
        )}
      </Show>
      <Show when={editor()} keyed>
        {(req) => (
          <CellEditor
            request={req}
            rect={editorRect()!}
            error={editorError()}
            dateFormat={settings.format.dateFormat}
            timeFormat={settings.format.timeFormat}
            onCommit={commit}
            onCancel={() => closeEditor(true)}
            onInput={() => setEditorError(null)}
          />
        )}
      </Show>
      <Show when={rename()} keyed>
        {(r) => (
          <div
            class="header-rename"
            style={{
              left: `${r.rect.left}px`,
              top: `${r.rect.top}px`,
              width: `${Math.max(r.rect.width, 140)}px`,
            }}
          >
            <input
              class="cell-editor-input"
              classList={{ invalid: !!rename()?.error }}
              value={doc().columns.find((c) => c.id === r.columnId)?.name ?? ""}
              ref={(el) => setTimeout(() => el.select())}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter") finishRename(e.currentTarget.value);
                if (e.key === "Escape") finishRename(null);
              }}
              onInput={() => rename()?.error && setRename({ ...rename()!, error: null })}
              onBlur={(e) => {
                const err = actions.renameColumn(r.columnId, e.currentTarget.value);
                if (err) toast(`Not renamed: ${err}`, "warning");
                setRename(null);
              }}
            />
            <Show when={rename()?.error}>
              <div class="cell-editor-error">{rename()?.error}</div>
            </Show>
          </div>
        )}
      </Show>
    </div>
  );
}
