import { createSignal } from "solid-js";

export type ToastKind = "info" | "success" | "warning" | "error";
export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

const [toasts, setToasts] = createSignal<Toast[]>([]);
let nextId = 1;

export { toasts };

export function toast(message: string, kind: ToastKind = "info", ms = kind === "error" ? 8000 : 4000): void {
  const id = nextId++;
  setToasts((t) => [...t.filter((x) => x.message !== message), { id, kind, message }]);
  setTimeout(() => dismissToast(id), ms);
}

export function dismissToast(id: number): void {
  setToasts((t) => t.filter((x) => x.id !== id));
}

/** Runs `fn` and surfaces any thrown error as a toast. */
export function reportErrors<T>(fn: () => T): T | undefined {
  try {
    return fn();
  } catch (e) {
    toast(e instanceof Error ? e.message : String(e), "error");
    return undefined;
  }
}
