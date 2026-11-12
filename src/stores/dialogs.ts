import { type Component, createSignal } from "solid-js";

/**
 * Promise-based modal service. Any component can be shown as a dialog; it receives `close(result)`.
 * Only one dialog stack exists app-wide, rendered by <DialogHost/>.
 */
export interface DialogProps<R> {
  close: (result: R) => void;
}

interface OpenDialog {
  id: number;
  render: Component<{ close: (r: unknown) => void }>;
  resolve: (r: unknown) => void;
  dismissValue: unknown;
  /** Focus is returned here when the dialog closes. */
  returnFocus: HTMLElement | null;
}

const [stack, setStack] = createSignal<OpenDialog[]>([]);
let nextId = 1;

export const dialogStack = stack;

export function openDialog<R, P extends object>(
  component: Component<P & DialogProps<R>>,
  props: P,
  dismissValue: R,
): Promise<R> {
  return new Promise<R>((resolve) => {
    const id = nextId++;
    const render: OpenDialog["render"] = (p) => component({ ...props, close: p.close as (r: R) => void });
    const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setStack((s) => [
      ...s,
      { id, render, resolve: resolve as (r: unknown) => void, dismissValue, returnFocus },
    ]);
  });
}

export function closeDialog(id: number, result: unknown): void {
  const d = stack().find((x) => x.id === id);
  if (!d) return;
  setStack((s) => s.filter((x) => x.id !== id));
  if (d.returnFocus?.isConnected) d.returnFocus.focus({ preventScroll: true });
  d.resolve(result);
}

export function dismissTopDialog(): boolean {
  const top = stack().at(-1);
  if (!top) return false;
  closeDialog(top.id, top.dismissValue);
  return true;
}

export function isDialogOpen(): boolean {
  return stack().length > 0;
}
