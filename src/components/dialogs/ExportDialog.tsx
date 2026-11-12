import { createMemo, createSignal, For, Show } from "solid-js";
import { unwrap } from "solid-js/store";
import { type TableDoc, TYPE_LABELS } from "../../domain/types";
import { DEFAULT_TEXT_EXPORT, exportText, type TextExportOptions } from "../../io/exporters";
import { downloadText, safeFileName } from "../../io/files";
import { defaultNotNull, exportSql, type SqlTableInput, sqlType, sqlWarnings } from "../../io/sql";
import {
  type ExportFormat,
  FORMAT_EXTENSIONS,
  FORMAT_LABELS,
  type SqlDialect,
  TEXT_FORMATS,
  type TextFormat,
} from "../../io/types";
import { type DialogProps, openDialog } from "../../stores/dialogs";
import { settings } from "../../stores/settings";
import { toast } from "../../stores/toasts";
import { index, loadDoc, tablesOf } from "../../stores/workspace";
import { Advanced, Warnings } from "../ui/Advanced";
import { Modal } from "../ui/Modal";

export type ExportTarget = { kind: "table"; tableId: string } | { kind: "database"; databaseId: string };

const SQL_FORMATS: SqlDialect[] = ["sqlite", "postgres"];
const isSql = (f: ExportFormat): f is SqlDialect => f === "sqlite" || f === "postgres";
const PREVIEW_CHARS = 4000;

function ExportDialog(props: { target: ExportTarget } & DialogProps<void>) {
  const target = props.target;
  const name =
    target.kind === "table" ? index.tables[target.tableId]!.name : index.databases[target.databaseId]!.name;
  const tables: SqlTableInput[] =
    target.kind === "table"
      ? [{ name, doc: loadDoc(target.tableId)! }]
      : tablesOf(target.databaseId, { deleted: false }).map((t) => ({ name: t.name, doc: loadDoc(t.id)! }));

  const formats: ExportFormat[] = target.kind === "table" ? [...TEXT_FORMATS, ...SQL_FORMATS] : SQL_FORMATS;
  const [format, setFormat] = createSignal<ExportFormat>(formats[0]!);
  const [text, setText] = createSignal<TextExportOptions>({
    ...DEFAULT_TEXT_EXPORT,
    csvDelimiter: settings.exportDefaults.csvDelimiter,
    jsonPretty: settings.exportDefaults.jsonPretty,
  });
  const [dropTable, setDropTable] = createSignal(false);
  const [primaryKey, setPrimaryKey] = createSignal(false);
  const [schema, setSchema] = createSignal("");
  const [notNull, setNotNull] = createSignal(new Set(tables.flatMap(({ doc }) => [...defaultNotNull(doc)])));

  const output = createMemo(() => {
    const f = format();
    if (isSql(f)) {
      return exportSql(
        tables,
        f,
        {
          dropTable: dropTable(),
          skipEmptyRows: text().skipEmptyRows,
          primaryKey: primaryKey(),
          schema: schema(),
          notNull: notNull(),
          batchSize: 500,
        },
        unwrap(settings.postgres),
      );
    }
    return exportText(f as TextFormat, tables[0]!.doc, text(), unwrap(settings.format));
  });

  const warnings = createMemo(() =>
    isSql(format()) ? sqlWarnings(tables, format() as SqlDialect, settings.postgres) : [],
  );
  const fileName = () => `${safeFileName(name)}.${FORMAT_EXTENSIONS[format()]}`;

  const toggleNotNull = (id: string, on: boolean) => {
    const s = new Set(notNull());
    if (on) s.add(id);
    else s.delete(id);
    setNotNull(s);
  };
  const setOpt = <K extends keyof TextExportOptions>(k: K, v: TextExportOptions[K]) =>
    setText({ ...text(), [k]: v });

  return (
    <Modal
      title={`Export ${target.kind === "table" ? "table" : "database"} “${name}”`}
      width="42rem"
      onClose={() => props.close()}
      footer={
        <>
          <button
            type="button"
            class="btn"
            onClick={() => {
              void navigator.clipboard
                .writeText(output())
                .then(() => toast("Copied to clipboard", "success"));
            }}
          >
            Copy
          </button>
          <button
            type="button"
            class="btn primary"
            onClick={() => {
              downloadText(output(), fileName());
              props.close();
            }}
          >
            Download {fileName()}
          </button>
        </>
      }
    >
      <label class="field">
        <span>Format</span>
        <select
          class="input"
          value={format()}
          onChange={(e) => setFormat(e.currentTarget.value as ExportFormat)}
          autofocus
        >
          <For each={formats}>{(f) => <option value={f}>{FORMAT_LABELS[f]}</option>}</For>
        </select>
      </label>
      <Show when={target.kind === "database"}>
        <p class="mt-2 text-xs text-muted">
          {tables.length} table{tables.length === 1 ? "" : "s"}. Databases export as a SQL script you can run
          yourself.
        </p>
      </Show>
      <Show when={isSql(format())}>
        <p class="mt-2 text-xs text-muted">
          A .sql script with CREATE TABLE statements and all data, wrapped in a transaction.
        </p>
      </Show>

      <Warnings items={warnings()} />

      <div class="mt-3">
        <div class="mb-1 text-xs text-muted">Preview</div>
        <pre class="max-h-56 overflow-auto rounded border border-line bg-fg/5 p-2 font-mono text-xs whitespace-pre">
          {output().length > PREVIEW_CHARS ? `${output().slice(0, PREVIEW_CHARS)}\n…` : output()}
        </pre>
      </div>

      <Advanced>
        <label class="flex items-center gap-2">
          <input
            type="checkbox"
            checked={text().skipEmptyRows}
            onChange={(e) => setOpt("skipEmptyRows", e.currentTarget.checked)}
          />
          Skip rows where every value is empty
        </label>
        <Show when={format() === "csv"}>
          <div class="grid grid-cols-2 gap-3">
            <label class="field">
              <span>Delimiter</span>
              <select
                class="input"
                value={text().csvDelimiter}
                onChange={(e) => setOpt("csvDelimiter", e.currentTarget.value)}
              >
                <option value=",">Comma ( , )</option>
                <option value=";">Semicolon ( ; )</option>
                <option value={"\t"}>Tab</option>
                <option value="|">Pipe ( | )</option>
              </select>
            </label>
            <label class="field">
              <span>Write empty values as</span>
              <input
                class="input"
                value={text().csvNullText}
                placeholder="(nothing)"
                onInput={(e) => setOpt("csvNullText", e.currentTarget.value)}
              />
            </label>
          </div>
          <label class="flex items-center gap-2">
            <input
              type="checkbox"
              checked={text().csvCanonicalFloats}
              onChange={(e) => setOpt("csvCanonicalFloats", e.currentTarget.checked)}
            />
            Write whole floats as <code>42.0</code> instead of <code>42.</code>
          </label>
        </Show>
        <Show when={format() === "json"}>
          <label class="flex items-center gap-2">
            <input
              type="checkbox"
              checked={!text().jsonPretty}
              onChange={(e) => setOpt("jsonPretty", !e.currentTarget.checked)}
            />
            Minify
          </label>
        </Show>
        <Show when={!isSql(format()) && format() !== "csv"}>
          <label class="flex items-center gap-2">
            <input
              type="checkbox"
              checked={text().omitNulls}
              onChange={(e) => setOpt("omitNulls", e.currentTarget.checked)}
            />
            Leave out empty values
          </label>
        </Show>
        <Show when={isSql(format())}>
          <label class="flex items-center gap-2">
            <input
              type="checkbox"
              checked={dropTable()}
              onChange={(e) => setDropTable(e.currentTarget.checked)}
            />
            Add <code>DROP TABLE IF EXISTS</code>
          </label>
          <label class="flex items-center gap-2">
            <input
              type="checkbox"
              checked={primaryKey()}
              onChange={(e) => setPrimaryKey(e.currentTarget.checked)}
            />
            Add an auto-incrementing <code>id</code> primary key
          </label>
          <Show when={format() === "postgres"}>
            <label class="field">
              <span>Schema (optional)</span>
              <input
                class="input"
                value={schema()}
                placeholder="public"
                onInput={(e) => setSchema(e.currentTarget.value)}
              />
            </label>
          </Show>
          <div>
            <div class="mb-1 text-xs font-medium">NOT NULL columns</div>
            <p class="mb-2 text-xs text-muted">Columns without empty values are NOT NULL by default.</p>
            <For each={tables}>
              {({ name: tname, doc }) => (
                <NotNullList
                  table={tname}
                  doc={doc}
                  dialect={format() as SqlDialect}
                  checked={notNull()}
                  toggle={toggleNotNull}
                />
              )}
            </For>
          </div>
        </Show>
      </Advanced>
    </Modal>
  );
}

function NotNullList(props: {
  table: string;
  doc: TableDoc;
  dialect: SqlDialect;
  checked: Set<string>;
  toggle: (id: string, on: boolean) => void;
}) {
  return (
    <div class="mb-2">
      <div class="text-xs text-muted">{props.table}</div>
      <div class="flex flex-wrap gap-x-4 gap-y-1">
        <For each={props.doc.columns}>
          {(c) => (
            <label class="inline-flex items-center gap-1.5 text-xs">
              <input
                type="checkbox"
                checked={props.checked.has(c.id)}
                onChange={(e) => props.toggle(c.id, e.currentTarget.checked)}
              />
              {c.name}
              <span class="text-muted">
                {sqlType(c.type, props.dialect, settings.postgres)}{" "}
                <span class="opacity-60">({TYPE_LABELS[c.type]})</span>
              </span>
            </label>
          )}
        </For>
      </div>
    </div>
  );
}

export function openExportDialog(target: ExportTarget): Promise<void> {
  return openDialog(ExportDialog, { target }, undefined);
}
