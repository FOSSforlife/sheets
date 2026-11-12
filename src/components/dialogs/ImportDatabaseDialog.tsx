import { createResource, createSignal, For, Show } from "solid-js";
import { TYPE_LABELS } from "../../domain/types";
import { buildDoc, countMismatches } from "../../io/build";
import { baseName } from "../../io/files";
import { readSqlite } from "../../io/sqliteImport";
import { QUOTA_CHARS, usedChars } from "../../storage/kv";
import { tableRepo } from "../../storage/repositories";
import { type DialogProps, openDialog } from "../../stores/dialogs";
import { toast } from "../../stores/toasts";
import { createDatabase, createTable, purgeDatabase } from "../../stores/workspace";
import { Warnings } from "../ui/Advanced";
import { Modal } from "../ui/Modal";

/** SQLite file → new database. Values that don't match a column's declared type become empty, or the column becomes text. */
function ImportDatabaseDialog(props: { file: File } & DialogProps<string | null>) {
  const [data] = createResource(async () => readSqlite(new Uint8Array(await props.file.arrayBuffer())));
  const [name, setName] = createSignal(baseName(props.file.name));
  const [asText, setAsText] = createSignal<Record<string, boolean>>({});

  const mismatchesFor = (ti: number) => {
    const t = data()!.tables[ti]!;
    return t.columns
      .map((c, ci) => ({ column: c, count: countMismatches(t, ci, t.declaredTypes![ci]!, "stringify") }))
      .filter((m) => m.count > 0);
  };

  const built = () =>
    data()!.tables.map((t) => {
      const types = t.declaredTypes!.map((ty, ci) =>
        asText()[`${t.name}.${t.columns[ci]}`] ? "string" : ty,
      );
      return { name: t.name, ...buildDoc(t, types, "stringify") };
    });

  const submit = () => {
    const tables = built();
    const size = tables.reduce((n, t) => n + tableRepo.size({ ...t.doc, id: "x" }), 0);
    if (usedChars() + size > QUOTA_CHARS) {
      toast(
        `This database (~${Math.round(size / 1024)} KB) is too large for the remaining browser storage.`,
        "error",
      );
      return;
    }
    const dbId = createDatabase(name().trim() || "Imported");
    try {
      for (const t of tables) createTable(dbId, t.name, t.doc);
    } catch (e) {
      purgeDatabase(dbId);
      toast((e as Error).message, "error");
      return;
    }
    for (const t of tables) for (const w of t.warnings) toast(`${t.name}: ${w}`, "warning");
    toast(`Imported ${tables.length} table${tables.length === 1 ? "" : "s"}`, "success");
    props.close(dbId);
  };

  return (
    <Modal
      title={`Import ${props.file.name}`}
      width="40rem"
      onClose={() => props.close(null)}
      footer={
        <>
          <button type="button" class="btn" onClick={() => props.close(null)}>
            Cancel
          </button>
          <button
            type="button"
            class="btn primary"
            disabled={!data() || !data()!.tables.length}
            onClick={submit}
          >
            Import database
          </button>
        </>
      }
    >
      <label class="field">
        <span>Database name</span>
        <input class="input" value={name()} onInput={(e) => setName(e.currentTarget.value)} />
      </label>
      <Show when={data.loading}>
        <p class="mt-3 text-muted">Reading database…</p>
      </Show>
      <Show when={data.error}>
        <p class="mt-3 rounded border border-danger/40 bg-danger/10 px-3 py-2 text-danger">
          {String(data.error?.message ?? data.error)}
        </p>
      </Show>
      <Show when={data()}>
        {(d) => (
          <>
            <Show when={!d().tables.length}>
              <p class="mt-3 text-muted">This database has no tables.</p>
            </Show>
            <div class="mt-3 space-y-3">
              <For each={d().tables}>
                {(t, ti) => (
                  <div class="rounded border border-line px-3 py-2">
                    <div class="flex items-baseline justify-between">
                      <b>{t.name}</b>
                      <span class="text-xs text-muted">{t.rows.length} rows</span>
                    </div>
                    <div class="mt-1 flex flex-wrap gap-1">
                      <For each={t.columns}>
                        {(c, ci) => (
                          <span class="inline-flex items-center gap-1 rounded bg-fg/5 px-1.5 py-0.5 text-xs">
                            {c}
                            <span class={`pill pill-sm pill-${t.declaredTypes![ci()]}`}>
                              {TYPE_LABELS[t.declaredTypes![ci()]!]}
                            </span>
                          </span>
                        )}
                      </For>
                    </div>
                    <For each={mismatchesFor(ti())}>
                      {(m) => (
                        <div class="mt-2 flex items-center justify-between gap-2 text-xs">
                          <span>
                            ⚠ {m.count} value{m.count === 1 ? "" : "s"} in “{m.column}” don't match its
                            declared type.
                          </span>
                          <select
                            class="input input-sm w-auto"
                            onChange={(e) =>
                              setAsText({
                                ...asText(),
                                [`${t.name}.${m.column}`]: e.currentTarget.value === "text",
                              })
                            }
                          >
                            <option value="null">Leave them empty</option>
                            <option value="text">Make the column text</option>
                          </select>
                        </div>
                      )}
                    </For>
                  </div>
                )}
              </For>
            </div>
            <Show when={d().skipped.length}>
              <Warnings items={[`Not imported: ${d().skipped.join(", ")}.`]} />
            </Show>
          </>
        )}
      </Show>
    </Modal>
  );
}

export function openImportDatabaseDialog(file: File): Promise<string | null> {
  return openDialog(ImportDatabaseDialog, { file }, null);
}
