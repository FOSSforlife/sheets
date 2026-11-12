import { createSignal, For, type JSX } from "solid-js";
import { formatDateParts, formatTime } from "../../domain/dates";
import { formatFloat } from "../../domain/numbers";
import { DATE_FORMAT_LABELS, type DateFormat, type FloatStyle } from "../../domain/settings";
import { downloadText, pickFile } from "../../io/files";
import { reloadAtRoot } from "../../routes/paths";
import { QUOTA_CHARS, usedChars } from "../../storage/kv";
import { createBackup, resetEverything, restoreBackup } from "../../storage/repositories";
import { resetSettings, setSettings, settings } from "../../stores/settings";
import { toast } from "../../stores/toasts";
import { flushAllSessions } from "../../stores/workspace";
import { confirm, prompt } from "../modals/confirm";
import { KeymapEditor } from "./KeymapEditor";

function Section(props: { title: string; description?: string; children: JSX.Element }) {
  return (
    <section class="border-b border-line py-6">
      <h2 class="text-base font-semibold">{props.title}</h2>
      {props.description && <p class="mt-0.5 text-xs text-muted">{props.description}</p>}
      <div class="mt-4 space-y-4">{props.children}</div>
    </section>
  );
}

function Row(props: { label: string; hint?: string; children: JSX.Element }) {
  return (
    <div class="flex items-center justify-between gap-6">
      <div>
        <div>{props.label}</div>
        {props.hint && <div class="text-xs text-muted">{props.hint}</div>}
      </div>
      <div class="shrink-0">{props.children}</div>
    </div>
  );
}

function Toggle(props: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={props.checked}
      class="switch"
      onClick={() => props.onChange(!props.checked)}
    >
      <span />
    </button>
  );
}

const SAMPLE = { y: 1998, m: 4, d: 20 };

export function SettingsPage() {
  const [usage, setUsage] = createSignal(usedChars());
  const pct = () => Math.min(100, (usage() / QUOTA_CHARS) * 100);
  const f = () => settings.format;

  const exportBackup = () => {
    flushAllSessions();
    downloadText(
      JSON.stringify(createBackup()),
      `sheets-backup-${new Date().toISOString().slice(0, 10)}.json`,
      "application/json",
    );
  };

  const importBackup = async () => {
    const file = await pickFile(".json");
    if (!file) return;
    const ok = await confirm({
      title: "Restore backup?",
      message: "Everything currently in Sheets will be replaced by the backup.",
      confirmLabel: "Restore",
      danger: true,
    });
    if (!ok) return;
    try {
      restoreBackup(JSON.parse(await file.text()));
      reloadAtRoot();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  const resetAll = async () => {
    const v = await prompt({
      title: "Reset all data",
      label: 'This deletes every database, table and setting. Type "delete everything" to confirm.',
      confirmLabel: "Delete everything",
      validate: (s) => (s.trim().toLowerCase() === "delete everything" ? null : 'Type "delete everything"'),
    });
    if (v === null) return;
    resetEverything();
    reloadAtRoot();
  };

  return (
    <div class="h-full overflow-y-auto">
      <div class="mx-auto max-w-2xl px-6 pb-16 text-sm">
        <h1 class="pt-8 text-xl font-semibold">Settings</h1>

        <Section title="Formats" description="How values are shown and typed. Stored data never changes.">
          <Row label="Date format" hint={`e.g. ${formatDateParts(SAMPLE, f().dateFormat)}`}>
            <select
              class="input"
              value={f().dateFormat}
              onChange={(e) => setSettings("format", "dateFormat", e.currentTarget.value as DateFormat)}
            >
              <For each={Object.entries(DATE_FORMAT_LABELS)}>
                {([k, v]) => <option value={k}>{v}</option>}
              </For>
            </select>
          </Row>
          <Row label="Time format" hint={`e.g. ${formatTime(21, 18, f().timeFormat)}`}>
            <select
              class="input"
              value={f().timeFormat}
              onChange={(e) => setSettings("format", "timeFormat", e.currentTarget.value as "24h" | "12h")}
            >
              <option value="24h">24-hour</option>
              <option value="12h">12-hour (AM/PM)</option>
            </select>
          </Row>
          <Row label="Float style" hint={`e.g. ${formatFloat(42, f())} and ${formatFloat(1234.5, f())}`}>
            <select
              class="input"
              value={f().floatStyle}
              onChange={(e) => setSettings("format", "floatStyle", e.currentTarget.value as FloatStyle)}
            >
              <option value="trailingDot">42.</option>
              <option value="pointZero">42.0</option>
              <option value="fixed">Fixed decimals</option>
            </select>
          </Row>
          {f().floatStyle === "fixed" && (
            <Row label="Decimal places">
              <input
                class="input w-20"
                type="number"
                min="0"
                max="10"
                value={f().floatDecimals}
                onChange={(e) =>
                  setSettings(
                    "format",
                    "floatDecimals",
                    Math.max(0, Math.min(10, Number(e.currentTarget.value) || 0)),
                  )
                }
              />
            </Row>
          )}
          <Row label="Thousands separator" hint="Show 1,234,567 instead of 1234567">
            <Toggle
              checked={f().thousandsSeparator}
              onChange={(v) => setSettings("format", "thousandsSeparator", v)}
            />
          </Row>
        </Section>

        <Section title="Workspace">
          <Row
            label="Tabs"
            hint="Open several tables at once. When off, opening a table replaces the current one."
          >
            <Toggle checked={settings.tabsEnabled} onChange={(v) => setSettings("tabsEnabled", v)} />
          </Row>
          <Row label="Confirm before deleting forever">
            <Toggle
              checked={settings.confirmPermanentDelete}
              onChange={(v) => setSettings("confirmPermanentDelete", v)}
            />
          </Row>
          <Row label="Theme">
            <select
              class="input"
              value={settings.theme}
              onChange={(e) => setSettings("theme", e.currentTarget.value as never)}
            >
              <option value="system">System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </Row>
          <Row label="Grid density">
            <select
              class="input"
              value={settings.density}
              onChange={(e) => setSettings("density", e.currentTarget.value as never)}
            >
              <option value="compact">Compact</option>
              <option value="comfortable">Comfortable</option>
            </select>
          </Row>
        </Section>

        <Section title="Export" description="Defaults used when exporting.">
          <Row label="PostgreSQL integer type">
            <select
              class="input"
              value={settings.postgres.int}
              onChange={(e) => setSettings("postgres", "int", e.currentTarget.value as never)}
            >
              <option value="int2">int2 (smallint)</option>
              <option value="int4">int4 (integer)</option>
              <option value="int8">int8 (bigint)</option>
            </select>
          </Row>
          <Row label="PostgreSQL float type">
            <select
              class="input"
              value={settings.postgres.float}
              onChange={(e) => setSettings("postgres", "float", e.currentTarget.value as never)}
            >
              <option value="float4">float4 (real)</option>
              <option value="float8">float8 (double precision)</option>
              <option value="numeric">numeric</option>
            </select>
          </Row>
          <Row label="PostgreSQL string type">
            <select
              class="input"
              value={settings.postgres.string}
              onChange={(e) => setSettings("postgres", "string", e.currentTarget.value as never)}
            >
              <option value="text">text</option>
              <option value="varchar">varchar</option>
            </select>
          </Row>
          <Row label="CSV delimiter">
            <select
              class="input"
              value={settings.exportDefaults.csvDelimiter}
              onChange={(e) => setSettings("exportDefaults", "csvDelimiter", e.currentTarget.value)}
            >
              <option value=",">Comma</option>
              <option value=";">Semicolon</option>
              <option value={"\t"}>Tab</option>
              <option value="|">Pipe</option>
            </select>
          </Row>
          <Row label="Pretty-print JSON">
            <Toggle
              checked={settings.exportDefaults.jsonPretty}
              onChange={(v) => setSettings("exportDefaults", "jsonPretty", v)}
            />
          </Row>
        </Section>

        <Section title="Keyboard shortcuts">
          <KeymapEditor />
        </Section>

        <Section title="Data" description="Everything is stored in this browser's local storage.">
          <div>
            <div class="mb-1 flex justify-between text-xs">
              <span>Storage used</span>
              <span class="text-muted">
                {(usage() / 1024).toFixed(0)} KB of ~{(QUOTA_CHARS / 1024 / 1024).toFixed(0)} MB (
                {pct().toFixed(1)}%)
              </span>
            </div>
            <div class="h-2 overflow-hidden rounded bg-fg/10">
              <div
                class="h-full rounded"
                classList={{ "bg-accent": pct() < 80, "bg-danger": pct() >= 80 }}
                style={{ width: `${pct()}%` }}
              />
            </div>
            <button
              type="button"
              class="mt-1 text-xs text-muted hover:underline"
              onClick={() => setUsage(usedChars())}
            >
              Refresh
            </button>
          </div>
          <Row label="Backup" hint="Download or restore everything as one JSON file.">
            <div class="flex gap-2">
              <button type="button" class="btn" onClick={exportBackup}>
                Download backup
              </button>
              <button type="button" class="btn" onClick={() => void importBackup()}>
                Restore…
              </button>
            </div>
          </Row>
          <Row label="Reset settings" hint="Restore default formats and preferences (keeps your data).">
            <button type="button" class="btn" onClick={resetSettings}>
              Reset settings
            </button>
          </Row>
          <Row label="Reset all data" hint="Delete every database, table and setting.">
            <button type="button" class="btn danger" onClick={() => void resetAll()}>
              Reset all data…
            </button>
          </Row>
        </Section>
      </div>
    </div>
  );
}
