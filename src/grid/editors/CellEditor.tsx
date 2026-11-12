import { createSignal, onMount, Show } from "solid-js";
import type { DateFormat, TimeFormat } from "../../domain/settings";
import {
  backspace,
  createMask,
  deleteForward,
  fillFromText,
  isEmpty,
  type MaskState,
  moveCaret,
  setCaretFromIndex,
  stepSegment,
  toText,
  typeChar,
} from "./mask";

/** Where the selection goes after a commit. */
export type CommitMove = "down" | "up" | "right" | "left" | "none" | "blur";

export interface EditorRequest {
  rowId: string;
  columnId: string;
  kind: "text" | "date" | "datetime";
  multiline: boolean;
  /** Initial text. In "replace" mode this is the typed character. */
  text: string;
  /** "replace": started by typing (arrows commit). "edit": F2/Enter/double-click (arrows move the caret). */
  mode: "replace" | "edit";
}

export interface CellEditorProps {
  request: EditorRequest;
  rect: { left: number; top: number; width: number; height: number };
  error: string | null;
  dateFormat: DateFormat;
  timeFormat: TimeFormat;
  onCommit: (text: string, move: CommitMove) => void;
  onCancel: () => void;
  onInput: () => void;
}

const ARROW_MOVES: Record<string, CommitMove> = {
  ArrowDown: "down",
  ArrowUp: "up",
  ArrowLeft: "left",
  ArrowRight: "right",
};

/** Keys shared by every editor kind. Returns true if handled. */
function handleCommonKeys(e: KeyboardEvent, props: CellEditorProps, text: () => string): boolean {
  if (e.key === "Escape") {
    props.onCancel();
    return true;
  }
  if (e.key === "Tab") {
    props.onCommit(text(), e.shiftKey ? "left" : "right");
    return true;
  }
  if (e.key === "Enter" && !e.altKey && !e.ctrlKey && !e.metaKey) {
    props.onCommit(text(), e.shiftKey ? "up" : "down");
    return true;
  }
  const move = ARROW_MOVES[e.key];
  if (move && props.request.mode === "replace" && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
    props.onCommit(text(), move);
    return true;
  }
  return false;
}

/** In-cell editor overlay. Plain text uses a growing textarea; dates use the masked input. */
export function CellEditor(props: CellEditorProps) {
  return (
    <div
      class="cell-editor"
      classList={{ invalid: !!props.error }}
      style={{
        left: `${props.rect.left}px`,
        top: `${props.rect.top}px`,
        "min-width": `${props.rect.width}px`,
        "min-height": `${props.rect.height}px`,
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <Show when={props.request.kind === "text"} fallback={<DateEditor {...props} />}>
        <TextEditor {...props} />
      </Show>
      <Show when={props.error}>
        <div class="cell-editor-error" role="alert">
          {props.error}
        </div>
      </Show>
    </div>
  );
}

function TextEditor(props: CellEditorProps) {
  let ref!: HTMLTextAreaElement;
  const [value, setValue] = createSignal(props.request.text);
  const lines = () => Math.min(8, value().split("\n").length);

  onMount(() => {
    ref.focus({ preventScroll: true });
    const end = ref.value.length;
    ref.setSelectionRange(end, end);
  });

  const onKeyDown = (e: KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === "Enter" && e.altKey) {
      e.preventDefault();
      if (!props.request.multiline) return;
      const { selectionStart: s, selectionEnd: en } = ref;
      ref.setRangeText("\n", s, en, "end");
      setValue(ref.value);
      props.onInput();
      return;
    }
    if (handleCommonKeys(e, props, () => ref.value)) e.preventDefault();
  };

  return (
    <textarea
      ref={ref}
      class="cell-editor-input"
      rows={lines()}
      spellcheck={false}
      value={value()}
      onInput={(e) => {
        setValue(e.currentTarget.value);
        props.onInput();
      }}
      onKeyDown={onKeyDown}
      onBlur={() => props.onCommit(ref.value, "blur")}
    />
  );
}

function DateEditor(props: CellEditorProps) {
  let ref!: HTMLInputElement;
  const kind = props.request.kind === "datetime" ? "datetime" : "date";
  const initial = createMask(
    kind,
    props.dateFormat,
    props.timeFormat,
    props.request.mode === "edit" ? props.request.text : "",
  );
  const [mask, setMaskState] = createSignal<MaskState>(
    props.request.mode === "replace" && props.request.text ? typeChar(initial, props.request.text) : initial,
  );

  const sync = (m: MaskState) => {
    setMaskState(m);
    ref.value = toText(m);
    ref.setSelectionRange(m.caret, m.caret);
  };
  const update = (m: MaskState) => {
    sync(m);
    props.onInput();
  };
  const text = () => (isEmpty(mask()) ? "" : toText(mask()));

  onMount(() => {
    ref.focus({ preventScroll: true });
    sync(mask());
  });

  const onKeyDown = (e: KeyboardEvent) => {
    e.stopPropagation();
    if (handleCommonKeys(e, props, text)) {
      e.preventDefault();
      return;
    }
    if (e.ctrlKey || e.metaKey) {
      if (e.key.toLowerCase() === "v" || e.key.toLowerCase() === "c" || e.key.toLowerCase() === "x") return;
      if (e.key.toLowerCase() === "a") return;
      e.preventDefault();
      return;
    }
    const m = mask();
    e.preventDefault();
    switch (e.key) {
      case "Backspace":
        return update(backspace(m));
      case "Delete":
        return update(deleteForward(m));
      case "ArrowLeft":
        return sync(moveCaret(m, -1));
      case "ArrowRight":
        return sync(moveCaret(m, 1));
      case "ArrowUp":
        return update(stepSegment(m, 1));
      case "ArrowDown":
        return update(stepSegment(m, -1));
      case "Home":
        return sync(setCaretFromIndex(m, 0));
      case "End":
        return sync(setCaretFromIndex(m, m.template.length));
      default:
        if (e.key.length === 1) update(typeChar(m, e.key));
    }
  };

  const onPaste = (e: ClipboardEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const t = e.clipboardData?.getData("text/plain")?.trim() ?? "";
    // ISO text is reformatted into the mask by the commit parser; feed digits in display order.
    const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(t);
    if (iso) {
      props.onCommit(t, "none");
      return;
    }
    update(fillFromText(createMask(kind, props.dateFormat, props.timeFormat), t));
  };

  return (
    <input
      ref={ref}
      class="cell-editor-input font-mono"
      spellcheck={false}
      onKeyDown={onKeyDown}
      onPaste={onPaste}
      onMouseUp={() => sync(setCaretFromIndex(mask(), ref.selectionStart ?? 0))}
      onBlur={() => props.onCommit(text(), "blur")}
    />
  );
}
