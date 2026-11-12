import { createMemo, createResource, createSignal, For, Show } from "solid-js";
import { COLUMN_TYPES, type ColumnType, TYPE_NAMES } from "../../domain/types";
import {
  buildDoc,
  cleanColumnNames,
  countMismatches,
  inferColumnTypes,
  type NestedMode,
} from "../../io/build";
import { baseName } from "../../io/files";
import { parseText } from "../../io/importers";
import {
  DEFAULT_PARSE_OPTIONS,
  FORMAT_LABELS,
  type RawTable,
  TEXT_FORMATS,
  type TextFormat,
  type TextParseOptions,
} from "../../io/types";
import { QUOTA_CHARS, usedChars } from "../../storage/kv";
import { tableRepo } from "../../storage/repositories";
import { type DialogProps, openDialog } from "../../stores/dialogs";
import { toast } from "../../stores/toasts";
import { createTable, liveDatabases } from "../../stores/workspace";
import { Advanced, Warnings } from "../ui/Advanced";
import { Modal } from "../ui/Modal";

interface Props {
  file: File;
  format: TextFormat;
  databaseId?: string;
}

function ImportTableDialog(props: Props & DialogProps<string | null>) {
  const [text] = createResource(() => props.file.text());
  const [format, setFormat] = createSignal<TextFormat>(props.format);
  const [opts, setOpts] = createSignal<TextParseOptions>(DEFAULT_PARSE_OPTIONS);
  const [nested, setNested] = createSignal<NestedMode>("stringify");
  const [name, setName] = createSignal(baseName(props.file.name));
  const [dbId, setDbId] = createSignal(props.databaseId ?? liveDatabases()[0]?.id ?? "");
  const [typeOverrides, setTypeOverrides] = createSignal<Record<number, ColumnType>>({});

  const parsed = createMemo((): { raw: RawTable } | { error: string } | null => {
    const t = text();
    if (t === undefined) return null;
    try {
      return { raw: parseText(format(), "", t, opts()) };
    } catch (e) {
      return { error: (e as Error).message };
    }
  });
  const raw = () => {
    const p = parsed();
    return p && "raw" in p ? p.raw : null;
  };
  const inferred = createMemo(() => (raw() ? inferColumnTypes(raw()!, nested()) : []));
  const types = () => inferred().map((t, i) => typeOverrides()[i] ?? t);
  const names = createMemo(() => (raw() ? cleanColumnNames(raw()!.columns) : []));

  const mismatchWarnings = createMemo(() => {
    const r = raw();
    if (!r) return [];
    return types().flatMap((t, i) => {
      if (t === inferred()[i]) return [];
      const n = countMismatches(r, i, t, nested());
      return n
        ? [
            `${n} value${n === 1 ? "" : "s"} in “${names()[i]}” won't fit ${TYPE_NAMES[t]} and will become empty.`,
          ]
        : [];
    });
  });

  const submit = () => {
    const r = raw();
    if (!r || !dbId()) return;
    const { doc, warnings } = buildDoc(r, types(), nested());
    const size = tableRepo.size({ ...doc, id: "x" });
    if (usedChars() + size > QUOTA_CHARS) {
      toast("This table is too large for the remaining browser storage.", "error");
      return;
    }
    try {
      const id = createTable(dbId(), name().trim() || "Imported", doc);
      for (const w of [...r.warnings, ...warnings]) toast(w, "warning");
      toast(`Imported ${doc.rows.length} row${doc.rows.length === 1 ? "" : "s"}`, "success");
      props.close(id);
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  return (
    <Modal
      title={`Import ${props.file.name}`}
      width="44rem"
      onClose={() => props.close(null)}
      footer={
        <>
          <button type="button" class="btn" onClick={() => props.close(null)}>
            Cancel
          </button>
          <button type="button" class="btn primary" disabled={!raw() || !dbId()} onClick={submit}>
            Import
          </button>
        </>
      }
    >
      <div class="grid grid-cols-3 gap-3">
        <label class="field">
          <span>Table name</span>
          <input class="input" value={name()} onInput={(e) => setName(e.currentTarget.value)} />
        </label>
        <label class="field">
          <span>Database</span>
          <select class="input" value={dbId()} onChange={(e) => setDbId(e.currentTarget.value)}>
            <For each={liveDatabases()}>{(d) => <option value={d.id}>{d.name}</option>}</For>
          </select>
        </label>
        <label class="field">
          <span>Format</span>
          <select
            class="input"
            value={format()}
            onChange={(e) => {
              setFormat(e.currentTarget.value as TextFormat);
              setTypeOverrides({});
            }}
          >
            <For each={TEXT_FORMATS}>{(f) => <option value={f}>{FORMAT_LABELS[f]}</option>}</For>
          </select>
        </label>
      </div>

      <Show when={format() === "csv"}>
        <label class="mt-3 flex items-center gap-2">
          <input
            type="checkbox"
            checked={opts().csvHeader}
            onChange={(e) => {
              setOpts({ ...opts(), csvHeader: e.currentTarget.checked });
              setTypeOverrides({});
            }}
          />
          First row is a header
        </label>
      </Show>

      <Show when={(raw()?.nestedCount ?? 0) > 0}>
        <div class="mt-3 rounded border border-line px-3 py-2">
          <p class="mb-2">
            Found <b>{raw()!.nestedCount}</b> nested value{raw()!.nestedCount === 1 ? "" : "s"} (objects,
            lists or sets). Sheets only stores flat values, so these can be:
          </p>
          <label class="mr-4 inline-flex items-center gap-2">
            <input
              type="radio"
              name="nested"
              checked={nested() === "stringify"}
              onChange={() => setNested("stringify")}
            />
            Kept as text
          </label>
          <label class="inline-flex items-center gap-2">
            <input
              type="radio"
              name="nested"
              checked={nested() === "null"}
              onChange={() => setNested("null")}
            />
            Left empty
          </label>
        </div>
      </Show>

      <Show when={parsed() && "error" in parsed()!}>
        <p class="mt-3 rounded border border-danger/40 bg-danger/10 px-3 py-2 text-danger">
          {(parsed() as { error: string }).error}
        </p>
      </Show>
      <Show when={!text()}>
        <p class="mt-3 text-muted">Reading file…</p>
      </Show>

      <Show when={raw()}>
        {(r) => (
          <>
            <p class="mt-4 mb-1 text-xs text-muted">
              {r().rows.length} row{r().rows.length === 1 ? "" : "s"}, {r().columns.length} column
              {r().columns.length === 1 ? "" : "s"}. Types are inferred — change any you like.
            </p>
            <div class="max-h-72 overflow-auto rounded border border-line">
              <table class="preview-table">
                <thead>
                  <tr>
                    <For each={names()}>
                      {(n, i) => (
                        <th>
                          <div class="mb-1 truncate font-medium">{n}</div>
                          <select
                            class="input input-sm"
                            value={types()[i()]}
                            onChange={(e) =>
                              setTypeOverrides({
                                ...typeOverrides(),
                                [i()]: e.currentTarget.value as ColumnType,
                              })
                            }
                          >
                            <For
                              each={
                                inferred()[i()] === "untyped" ? ["untyped", ...COLUMN_TYPES] : COLUMN_TYPES
                              }
                            >
                              {(t) => <option value={t}>{TYPE_NAMES[t as ColumnType]}</option>}
                            </For>
                          </select>
                        </th>
                      )}
                    </For>
                  </tr>
                </thead>
                <tbody>
                  <For each={r().rows.slice(0, 8)}>
                    {(row) => (
                      <tr>
                        <For each={row}>
                          {(v) => (
                            <td classList={{ "text-muted italic": v === null }}>
                              {v === null ? "" : "text" in v ? v.text : String(v.value)}
                            </td>
                          )}
                        </For>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </div>
            <Warnings items={[...r().warnings, ...mismatchWarnings()]} />
          </>
        )}
      </Show>

      <Show when={format() === "csv"}>
        <Advanced>
          <label class="field">
            <span>Delimiter</span>
            <select
              class="input"
              value={opts().csvDelimiter}
              onChange={(e) => {
                setOpts({
                  ...opts(),
                  csvDelimiter: e.currentTarget.value as TextParseOptions["csvDelimiter"],
                });
                setTypeOverrides({});
              }}
            >
              <option value="auto">Detect automatically</option>
              <option value=",">Comma ( , )</option>
              <option value=";">Semicolon ( ; )</option>
              <option value={"\t"}>Tab</option>
              <option value="|">Pipe ( | )</option>
            </select>
          </label>
        </Advanced>
      </Show>
    </Modal>
  );
}

export function openImportTableDialog(
  file: File,
  format: TextFormat,
  databaseId?: string,
): Promise<string | null> {
  return openDialog(ImportTableDialog, { file, format, databaseId }, null);
}
