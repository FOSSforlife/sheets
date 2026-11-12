import { createStore, reconcile } from "solid-js/store";
import { type KeymapOverrides, keymapRepo } from "../storage/repositories";
import { reportErrors } from "./toasts";

/**
 * User-configurable shortcuts. A binding is a canonical string like `Mod+Alt+ArrowUp`.
 * `Mod` is ⌘ on macOS and Ctrl elsewhere. On macOS, `Ctrl` is the physical ⌃ key.
 */

export type ActionId =
  | "insertToday"
  | "insertNow"
  | "insertRowAbove"
  | "insertRowBelow"
  | "deleteRows"
  | "insertColumnLeft"
  | "insertColumnRight"
  | "deleteColumns"
  | "renameColumn"
  | "openTypeMenu"
  | "nextTab"
  | "prevTab"
  | "closeTab"
  | "toggleSidebar"
  | "toggleInspector"
  | "openSettings"
  | "newTable"
  | "importTable"
  | "exportTable";

export interface ActionDef {
  id: ActionId;
  label: string;
  group: "Cells" | "Rows & columns" | "Navigation" | "Files";
  defaultBinding: string | null;
}

export const ACTIONS: ActionDef[] = [
  { id: "insertToday", label: "Insert today's date", group: "Cells", defaultBinding: null },
  { id: "insertNow", label: "Insert current date & time", group: "Cells", defaultBinding: null },
  {
    id: "insertRowAbove",
    label: "Insert row above",
    group: "Rows & columns",
    defaultBinding: "Mod+Alt+ArrowUp",
  },
  {
    id: "insertRowBelow",
    label: "Insert row below",
    group: "Rows & columns",
    defaultBinding: "Mod+Alt+ArrowDown",
  },
  { id: "deleteRows", label: "Delete row(s)", group: "Rows & columns", defaultBinding: "Mod+Alt+Backspace" },
  {
    id: "insertColumnLeft",
    label: "Insert column left",
    group: "Rows & columns",
    defaultBinding: "Mod+Alt+ArrowLeft",
  },
  {
    id: "insertColumnRight",
    label: "Insert column right",
    group: "Rows & columns",
    defaultBinding: "Mod+Alt+ArrowRight",
  },
  {
    id: "deleteColumns",
    label: "Delete column(s)",
    group: "Rows & columns",
    defaultBinding: "Mod+Alt+Shift+Backspace",
  },
  { id: "renameColumn", label: "Rename column", group: "Rows & columns", defaultBinding: null },
  { id: "openTypeMenu", label: "Change column type", group: "Rows & columns", defaultBinding: "Alt+T" },
  { id: "nextTab", label: "Next tab", group: "Navigation", defaultBinding: "Alt+]" },
  { id: "prevTab", label: "Previous tab", group: "Navigation", defaultBinding: "Alt+[" },
  { id: "closeTab", label: "Close tab", group: "Navigation", defaultBinding: "Alt+W" },
  { id: "toggleSidebar", label: "Toggle sidebar", group: "Navigation", defaultBinding: "Mod+\\" },
  {
    id: "toggleInspector",
    label: "Toggle row preview",
    group: "Navigation",
    defaultBinding: "Mod+Shift+\\",
  },
  { id: "openSettings", label: "Open settings", group: "Navigation", defaultBinding: "Mod+," },
  { id: "newTable", label: "New table", group: "Files", defaultBinding: null },
  { id: "importTable", label: "Import table…", group: "Files", defaultBinding: null },
  { id: "exportTable", label: "Export table…", group: "Files", defaultBinding: null },
];

export const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

const [overrides, setOverrides] = createStore<KeymapOverrides>(keymapRepo.load() ?? {});

function persist(): void {
  reportErrors(() => keymapRepo.save({ ...overrides }));
}

export function bindingFor(id: ActionId): string | null {
  const o = overrides[id];
  if (o !== undefined) return o;
  return ACTIONS.find((a) => a.id === id)?.defaultBinding ?? null;
}

export function isDefaultBinding(id: ActionId): boolean {
  return overrides[id] === undefined;
}

/** Assigns a binding; any other action using it is cleared. */
export function setBinding(id: ActionId, binding: string | null): void {
  if (binding) {
    for (const a of ACTIONS) if (a.id !== id && bindingFor(a.id) === binding) setOverrides(a.id, null);
  }
  const def = ACTIONS.find((a) => a.id === id)?.defaultBinding ?? null;
  setOverrides(id, binding === def ? undefined! : binding);
  persist();
}

export function resetBinding(id: ActionId): void {
  const target = ACTIONS.find((a) => a.id === id)?.defaultBinding ?? null;
  setBinding(id, target);
}

export function resetAllBindings(): void {
  setOverrides(reconcile({}));
  persist();
}

export function reloadKeymap(): void {
  setOverrides(reconcile(keymapRepo.load() ?? {}));
}

export function conflictFor(id: ActionId, binding: string): ActionDef | undefined {
  return ACTIONS.find((a) => a.id !== id && bindingFor(a.id) === binding);
}

// ---- event → binding ----

const CODE_KEYS: Record<string, string> = {
  BracketLeft: "[",
  BracketRight: "]",
  Backslash: "\\",
  Comma: ",",
  Period: ".",
  Slash: "/",
  Semicolon: ";",
  Quote: "'",
  Minus: "-",
  Equal: "=",
  Backquote: "`",
  Space: "Space",
};

const MODIFIER_KEYS = new Set(["Shift", "Control", "Alt", "Meta", "OS", "AltGraph"]);

function keyName(e: KeyboardEvent): string | null {
  if (MODIFIER_KEYS.has(e.key)) return null;
  const c = e.code;
  if (c.startsWith("Key")) return c.slice(3);
  if (c.startsWith("Digit")) return c.slice(5);
  if (CODE_KEYS[c]) return CODE_KEYS[c]!;
  if (/^F\d+$/.test(e.key)) return e.key;
  if (e.key === "Del") return "Delete";
  return e.key.length === 1 ? e.key.toUpperCase() : e.key;
}

/** Canonical binding string for a keyboard event, or null for bare modifier presses. */
export function eventToBinding(e: KeyboardEvent): string | null {
  const key = keyName(e);
  if (!key) return null;
  const mods: string[] = [];
  if (IS_MAC ? e.metaKey : e.ctrlKey) mods.push("Mod");
  if (IS_MAC ? e.ctrlKey : e.metaKey) mods.push(IS_MAC ? "Ctrl" : "Meta");
  if (e.altKey) mods.push("Alt");
  if (e.shiftKey) mods.push("Shift");
  return [...mods, key].join("+");
}

export function matchAction(e: KeyboardEvent): ActionId | null {
  const b = eventToBinding(e);
  if (!b) return null;
  return ACTIONS.find((a) => bindingFor(a.id) === b)?.id ?? null;
}

// ---- display ----

const MAC_SYMBOLS: Record<string, string> = { Mod: "⌘", Ctrl: "⌃", Alt: "⌥", Shift: "⇧", Meta: "⌘" };
const KEY_SYMBOLS: Record<string, string> = {
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
  Enter: "↵",
  Escape: "Esc",
};

/** Human-readable form: `⌃⌥⇧⌘↑` on macOS, `Ctrl+Alt+↑` elsewhere. */
export function formatBinding(binding: string): string {
  const parts = binding.split("+").map((p, i, arr) => (p === "" && arr[i - 1] === "" ? "+" : p));
  const key = binding.endsWith("++") ? "+" : parts.at(-1)!;
  const mods = parts.slice(0, -1).filter(Boolean);
  if (IS_MAC) {
    const order = ["Ctrl", "Alt", "Shift", "Mod", "Meta"];
    const sorted = order.filter((m) => mods.includes(m)).map((m) => MAC_SYMBOLS[m]);
    const k = key === "Backspace" ? "⌫" : key === "Delete" ? "⌦" : (KEY_SYMBOLS[key] ?? key);
    return sorted.join("") + k;
  }
  const names = mods.map((m) => (m === "Mod" ? "Ctrl" : m === "Meta" ? "Win" : m));
  return [...names, KEY_SYMBOLS[key] ?? key].join("+");
}

// ---- dispatch ----

type Handler = (e: KeyboardEvent) => boolean | undefined;
const handlers = new Map<ActionId, Handler[]>();

/** Registers a handler; the most recently registered handler for an action runs first. */
export function registerAction(id: ActionId, fn: Handler): () => void {
  const list = handlers.get(id) ?? [];
  list.unshift(fn);
  handlers.set(id, list);
  return () => {
    const l = handlers.get(id);
    if (l)
      handlers.set(
        id,
        l.filter((h) => h !== fn),
      );
  };
}

/** Runs the action for an event. Handlers return `false` to pass. Returns true if handled. */
export function dispatchAction(id: ActionId, e: KeyboardEvent): boolean {
  for (const h of handlers.get(id) ?? []) {
    if (h(e) !== false) return true;
  }
  return false;
}

let recording = false;
export function setRecording(on: boolean): void {
  recording = on;
}
export function isRecording(): boolean {
  return recording;
}
