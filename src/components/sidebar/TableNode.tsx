import { createSignal, Show } from "solid-js";
import type { TableMeta } from "../../domain/types";
import { exportTarget } from "../../services/importExport";
import { toast } from "../../stores/toasts";
import { openTable, ui } from "../../stores/ui";
import { liveDatabases, moveTable, renameTable, trashTable } from "../../stores/workspace";
import { InlineEdit } from "../ui/InlineEdit";
import { Download, FolderInput, Pencil, Sheet, SquareArrowOutUpRight, Trash2, X } from "../ui/icons";
import { openMenuAt } from "../ui/menu";

export const DRAG_TABLE = "application/x-sheets-table";
export const DRAG_DB = "application/x-sheets-database";

export function TableNode(props: {
  table: TableMeta;
  renaming: boolean;
  onRenameStart: () => void;
  onRenameEnd: () => void;
  onDropBefore: (dragId: string) => void;
}) {
  const [dropBefore, setDropBefore] = createSignal(false);
  const active = () => ui.activeTab === props.table.id;

  const menu = (e: MouseEvent) => {
    e.preventDefault();
    const others = liveDatabases().filter((d) => d.id !== props.table.databaseId);
    openMenuAt(
      [
        {
          label: "Open",
          icon: () => <SquareArrowOutUpRight size={14} />,
          action: () => openTable(props.table.id),
        },
        { label: "Rename", icon: () => <Pencil size={14} />, action: props.onRenameStart },
        {
          label: "Move to",
          icon: () => <FolderInput size={14} />,
          disabled: others.length === 0,
          submenu: others.map((d) => ({ label: d.name, action: () => moveTable(props.table.id, d.id) })),
        },
        {
          label: "Export…",
          icon: () => <Download size={14} />,
          action: () => exportTarget({ kind: "table", tableId: props.table.id }),
        },
        { separator: true },
        {
          label: "Delete",
          icon: () => <Trash2 size={14} />,
          danger: true,
          action: () => trashTable(props.table.id),
        },
      ],
      e,
    );
  };

  return (
    <div
      class="tree-row tree-child group"
      classList={{ active: active(), "drop-before": dropBefore() }}
      draggable={!props.renaming}
      onDragStart={(e) => {
        e.dataTransfer?.setData(DRAG_TABLE, props.table.id);
        e.dataTransfer!.effectAllowed = "move";
      }}
      onDragOver={(e) => {
        if (e.dataTransfer?.types.includes(DRAG_TABLE)) {
          e.preventDefault();
          e.stopPropagation();
          setDropBefore(true);
        }
      }}
      onDragLeave={() => setDropBefore(false)}
      onDrop={(e) => {
        setDropBefore(false);
        const id = e.dataTransfer?.getData(DRAG_TABLE);
        if (id && id !== props.table.id) {
          e.preventDefault();
          e.stopPropagation();
          props.onDropBefore(id);
        }
      }}
      onClick={() => openTable(props.table.id)}
      onDblClick={props.onRenameStart}
      onContextMenu={menu}
    >
      <Sheet size={14} class="shrink-0 text-table" />
      <Show when={props.renaming} fallback={<span class="flex-1 truncate">{props.table.name}</span>}>
        <InlineEdit
          value={props.table.name}
          onCommit={(v) => {
            const err = renameTable(props.table.id, v);
            if (err) toast(err, "warning");
            props.onRenameEnd();
          }}
          onCancel={props.onRenameEnd}
        />
      </Show>
      <span class="row-actions">
        <button
          type="button"
          class="icon-btn icon-btn-sm"
          title="Delete table"
          onClick={(e) => {
            e.stopPropagation();
            trashTable(props.table.id);
          }}
        >
          <X size={13} />
        </button>
      </span>
    </div>
  );
}
