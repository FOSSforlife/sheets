import {
  ArrowDownAZ,
  ArrowUpAZ,
  Clipboard,
  Copy,
  Eraser,
  Pencil,
  Plus,
  Scissors,
  Trash2,
} from "../components/ui/icons";
import type { MenuItem } from "../components/ui/menu";
import { COLUMN_TYPES, type Column, TYPE_LABELS, TYPE_NAMES } from "../domain/types";
import { type ActionId, bindingFor, formatBinding, IS_MAC } from "../stores/keymap";
import type { GridActions } from "./GridActions";

/** Menu definitions for the grid. Pure builders: they only call into GridActions. */

const hint = (id: ActionId) => {
  const b = bindingFor(id);
  return b ? formatBinding(b) : undefined;
};
const mod = (k: string) => (IS_MAC ? `⌘${k}` : `Ctrl+${k}`);

export function typeMenuItems(col: Column, actions: GridActions): MenuItem[] {
  return COLUMN_TYPES.map((t) => ({
    label: TYPE_NAMES[t],
    checked: col.type === t,
    icon: () => <span class={`pill pill-${t} pill-sm`}>{TYPE_LABELS[t]}</span>,
    action: () => void actions.changeType(col.id, t),
  }));
}

export function headerMenuItems(col: Column, actions: GridActions, rename: () => void): MenuItem[] {
  return [
    { label: "Rename column", icon: () => <Pencil size={14} />, hint: "F2", action: rename },
    { label: "Change type", submenu: typeMenuItems(col, actions) },
    { separator: true },
    { label: "Sort A → Z", icon: () => <ArrowDownAZ size={14} />, action: () => actions.sort(col.id, "asc") },
    { label: "Sort Z → A", icon: () => <ArrowUpAZ size={14} />, action: () => actions.sort(col.id, "desc") },
    { separator: true },
    ...columnItems(actions),
  ];
}

function columnItems(actions: GridActions): MenuItem[] {
  return [
    {
      label: "Insert column left",
      icon: () => <Plus size={14} />,
      hint: hint("insertColumnLeft"),
      action: () => actions.insertColumn("left"),
    },
    {
      label: "Insert column right",
      icon: () => <Plus size={14} />,
      hint: hint("insertColumnRight"),
      action: () => actions.insertColumn("right"),
    },
    {
      label: "Delete column(s)",
      icon: () => <Trash2 size={14} />,
      danger: true,
      hint: hint("deleteColumns"),
      action: () => actions.deleteColumns(),
    },
  ];
}

export function rowItems(actions: GridActions): MenuItem[] {
  return [
    {
      label: "Insert row above",
      icon: () => <Plus size={14} />,
      hint: hint("insertRowAbove"),
      action: () => actions.insertRow("above"),
    },
    {
      label: "Insert row below",
      icon: () => <Plus size={14} />,
      hint: hint("insertRowBelow"),
      action: () => actions.insertRow("below"),
    },
    {
      label: "Delete row(s)",
      icon: () => <Trash2 size={14} />,
      danger: true,
      hint: hint("deleteRows"),
      action: () => actions.deleteRows(),
    },
  ];
}

export function cellMenuItems(
  actions: GridActions,
  clipboard: { copy(): void; cut(): void; paste(): void },
): MenuItem[] {
  return [
    { label: "Cut", icon: () => <Scissors size={14} />, hint: mod("X"), action: clipboard.cut },
    { label: "Copy", icon: () => <Copy size={14} />, hint: mod("C"), action: clipboard.copy },
    { label: "Paste", icon: () => <Clipboard size={14} />, hint: mod("V"), action: clipboard.paste },
    { label: "Clear", icon: () => <Eraser size={14} />, hint: "Del", action: () => actions.clear() },
    { separator: true },
    ...rowItems(actions),
    { separator: true },
    ...columnItems(actions),
  ];
}
