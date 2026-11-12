import { createSignal, type JSX } from "solid-js";

export type MenuItem =
  | {
      label: string;
      icon?: () => JSX.Element;
      hint?: string;
      checked?: boolean;
      disabled?: boolean;
      danger?: boolean;
      action?: () => void;
      submenu?: MenuItem[];
    }
  | { separator: true };

export interface OpenMenu {
  items: MenuItem[];
  x: number;
  y: number;
  /** Element to refocus when the menu closes. */
  returnFocus?: HTMLElement | null;
  onClose?: () => void;
}

const [menu, setMenu] = createSignal<OpenMenu | null>(null);

export { menu };

export function openMenu(m: OpenMenu): void {
  setMenu({ ...m, returnFocus: m.returnFocus ?? (document.activeElement as HTMLElement | null) });
}

export function openMenuAt(items: MenuItem[], e: MouseEvent): void {
  openMenu({ items, x: e.clientX, y: e.clientY });
}

export function openMenuBelow(items: MenuItem[], rect: DOMRect, onClose?: () => void): void {
  openMenu({ items, x: rect.left, y: rect.bottom + 4, onClose });
}

export function closeMenu(): void {
  const m = menu();
  setMenu(null);
  m?.onClose?.();
  m?.returnFocus?.focus({ preventScroll: true });
}
