import { type ExportTarget, openExportDialog } from "../components/dialogs/ExportDialog";
import { openImportDatabaseDialog } from "../components/dialogs/ImportDatabaseDialog";
import { openImportTableDialog } from "../components/dialogs/ImportTableDialog";
import { pickFile } from "../io/files";
import { detectFormat } from "../io/types";
import { toast } from "../stores/toasts";
import { openTable } from "../stores/ui";
import { index, liveDatabases } from "../stores/workspace";

/** Entry points for import/export, shared by menus, shortcuts and drag-and-drop. */

const TABLE_ACCEPT = ".csv,.tsv,.txt,.json,.jsonl,.ndjson,.yaml,.yml,.edn,.ednl";
const DB_ACCEPT = ".sqlite,.sqlite3,.db";

export async function importTableFromPicker(databaseId?: string): Promise<void> {
  const file = await pickFile(TABLE_ACCEPT);
  if (file) await importFile(file, databaseId);
}

export async function importDatabaseFromPicker(): Promise<void> {
  const file = await pickFile(DB_ACCEPT);
  if (file) await importFile(file);
}

/** Routes a file to the right import dialog based on its extension. */
export async function importFile(file: File, databaseId?: string): Promise<void> {
  const format = detectFormat(file.name);
  if (format === "sqlite-db") {
    const dbId = await openImportDatabaseDialog(file);
    const first = dbId ? index.databases[dbId]?.tableIds[0] : undefined;
    if (first) openTable(first);
    return;
  }
  if (!format || format === "backup") {
    toast(`Can't import “${file.name}”: unsupported file type`, "warning");
    return;
  }
  const dbId = databaseId ?? liveDatabases()[0]?.id;
  const tableId = await openImportTableDialog(file, format, dbId);
  if (tableId) openTable(tableId);
}

export function exportTarget(target: ExportTarget): void {
  void openExportDialog(target);
}
