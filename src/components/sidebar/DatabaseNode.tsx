import { createSignal, For, Show } from "solid-js";
import type { DatabaseMeta } from "../../domain/types";
import { exportTarget, importTableFromPicker } from "../../services/importExport";
import { toast } from "../../stores/toasts";
import { isDatabaseExpanded, openTable, setDatabaseExpanded } from "../../stores/ui";
import { createTable, moveTable, renameDatabase, tablesOf, trashDatabase } from "../../stores/workspace";
import { InlineEdit } from "../ui/InlineEdit";
import { ChevronRight, Database, Download, Pencil, Plus, Trash2, Upload, X } from "../ui/icons";
import { openMenuAt } from "../ui/menu";
import { DRAG_DB, DRAG_TABLE, TableNode } from "./TableNode";

export function DatabaseNode(props: {
  db: DatabaseMeta;
  renaming: boolean;
  onRenameStart: () => void;
  onRenameEnd: () => void;
  onReorder: (dragId: string, before: boolean) => void;
}) {
  const [dropTarget, setDropTarget] = createSignal(false);
  const [renamingTable, setRenamingTable] = createSignal<string | null>(null);
  const expanded = () => isDatabaseExpanded(props.db.id);
  const tables = () => tablesOf(props.db.id, { deleted: false });

  const newTable = () => {
    const id = createTable(props.db.id);
    setDatabaseExpanded(props.db.id, true);
    openTable(id);
  };

  const menu = (e: MouseEvent) => {
    e.preventDefault();
    openMenuAt(
      [
        { label: "New table", icon: () => <Plus size={14} />, action: newTable },
        {
          label: "Import table…",
          icon: () => <Upload size={14} />,
          action: () => void importTableFromPicker(props.db.id),
        },
        {
          label: "Export database…",
          icon: () => <Download size={14} />,
          action: () => exportTarget({ kind: "database", databaseId: props.db.id }),
        },
        { separator: true },
        { label: "Rename", icon: () => <Pencil size={14} />, action: props.onRenameStart },
        {
          label: "Delete",
          icon: () => <Trash2 size={14} />,
          danger: true,
          action: () => trashDatabase(props.db.id),
        },
      ],
      e,
    );
  };

  const onDrop = (e: DragEvent) => {
    setDropTarget(false);
    const tableId = e.dataTransfer?.getData(DRAG_TABLE);
    const dbId = e.dataTransfer?.getData(DRAG_DB);
    if (tableId) {
      e.preventDefault();
      moveTable(tableId, props.db.id);
      setDatabaseExpanded(props.db.id, true);
    } else if (dbId && dbId !== props.db.id) {
      e.preventDefault();
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
      props.onReorder(dbId, e.clientY < r.top + r.height / 2);
    }
  };

  return (
    <div>
      <div
        class="tree-row group"
        classList={{ "drop-target": dropTarget() }}
        draggable={!props.renaming}
        onDragStart={(e) => e.dataTransfer?.setData(DRAG_DB, props.db.id)}
        onDragOver={(e) => {
          const types = e.dataTransfer?.types ?? [];
          if (types.includes(DRAG_TABLE) || types.includes(DRAG_DB)) {
            e.preventDefault();
            setDropTarget(true);
          }
        }}
        onDragLeave={() => setDropTarget(false)}
        onDrop={onDrop}
        onClick={() => setDatabaseExpanded(props.db.id, !expanded())}
        onDblClick={props.onRenameStart}
        onContextMenu={menu}
      >
        <ChevronRight
          size={14}
          class="shrink-0 text-muted transition-transform"
          classList={{ "rotate-90": expanded() }}
        />
        <Database size={14} class="shrink-0 text-db" />
        <Show
          when={props.renaming}
          fallback={<span class="flex-1 truncate font-medium">{props.db.name}</span>}
        >
          <InlineEdit
            value={props.db.name}
            onCommit={(v) => {
              const err = renameDatabase(props.db.id, v);
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
            title="New table"
            onClick={(e) => {
              e.stopPropagation();
              newTable();
            }}
          >
            <Plus size={13} />
          </button>
          <button
            type="button"
            class="icon-btn icon-btn-sm"
            title="Delete database"
            onClick={(e) => {
              e.stopPropagation();
              trashDatabase(props.db.id);
            }}
          >
            <X size={13} />
          </button>
        </span>
      </div>
      <Show when={expanded()}>
        <For each={tables()}>
          {(t) => (
            <TableNode
              table={t}
              renaming={renamingTable() === t.id}
              onRenameStart={() => setRenamingTable(t.id)}
              onRenameEnd={() => setRenamingTable(null)}
              onDropBefore={(dragId) =>
                moveTable(
                  dragId,
                  props.db.id,
                  tables()
                    .filter((x) => x.id !== dragId)
                    .findIndex((x) => x.id === t.id),
                )
              }
            />
          )}
        </For>
        <Show when={tables().length === 0}>
          <button type="button" class="tree-row tree-child text-muted" onClick={newTable}>
            <Plus size={13} /> New table
          </button>
        </Show>
      </Show>
    </div>
  );
}
