# Sheets — Plan

A simple, fast, local-first "database" app that feels like a spreadsheet. What you see is what you get:
no formulas, no computed columns, no relations, no lists.

## Stack

- Vite + SolidJS SPA (no SSR), `@solidjs/router`, pnpm, TypeScript strict
- `tabulator-tables` in normal column-definition mode with `selectableRange` (not `spreadsheet: true`)
- Tailwind v4 for the app shell; Tabulator styled via a custom stylesheet using shared CSS variables
- `lucide-solid` icons; `sql.js` (SQLite import); `papaparse` (CSV); `yaml` (YAML); a hand-written EDN reader/writer
- Vitest unit tests for all pure logic; Biome for lint/format
- Git is managed by the user

## Grid behaviour

- Left gutter shows row numbers 1..n; click to select a row, right-click → insert above/below, delete
- Hidden internal row id (never exported)
- Keys (fixed, Excel/Sheets semantics):
  - typing on a selected cell replaces its content; Enter / F2 edit the existing value
  - Enter commits + moves down; Shift+Enter commits + moves up
  - Tab / Shift+Tab commit + move right / left
  - Esc cancels; Delete / Backspace set the selected range to null
  - Alt+Enter inserts a newline (rendered as `↵`, full text in tooltip)
  - Ctrl/Cmd+C/X/V copy/cut/paste as TSV; Ctrl/Cmd+Z / Ctrl/Cmd+Shift+Z undo/redo
- Enter on the last row creates a new row (Down arrow does not)
- Tab on the rightmost column creates a new column
- Paste extends rows/columns past the edge; a single value pasted into a range fills it
- Paste into untyped/new columns infers the narrowest common type (int+float → float, mismatch → string)
- Paste values that don't fit an existing column's type → modal: "Paste anyway (N values become null)" / Cancel
- No header-row detection on paste
- Copy uses displayed values: null → empty, bool → `TRUE`/`FALSE`, float → `42.`
- Undo/redo: per-table command stack, session only. Covers cell edits, pastes, row/col insert/delete,
  renames, type conversions, sorts, column reorders. Sidebar actions are not undoable (Deleted is the net).
- Header: click name → select column; double-click / F2 (column selected) → rename inline;
  click type pill → type dropdown; right-click → insert left/right, delete, Sort A→Z / Z→A
  (sort physically reorders rows, undoable); drag → reorder; drag edge → resize
- Column widths + order persisted per table; no frozen columns
- A table always has ≥1 row and ≥1 column (deleting the last clears it). New table: 1 untyped column, 1 row.
- Empty rows are kept (WYSIWYG)

## Columns & types

- Names unique per table (duplicate rename rejected inline)
- Default name = first unused in ColumnA, ColumnB, … ColumnZ, ColumnAA, … ColumnZZ
- Types: `untyped`, `string`, `int`, `float`, `bool`, `date`, `datetime`
- Pill colours: untyped grey `?`, string blue `str`, int green `int`, float teal `float`,
  bool purple `bool`, date orange `date`, datetime amber `datetime` (light + dark tuned)
- Inference on first non-null value in an untyped column, precedence:
  bool (`true`/`false` only) → int → float (`42.`, `4.2`, `1e3`) → datetime → date (configured format) → string
- Clearing all values does not revert a column to untyped
- Typed input that doesn't fit the column's type is rejected (red outline, tooltip, stays in edit)
- Inputs are trimmed; empty → null. Interior whitespace preserved.
- Bool: checkbox, tri-state (null visually distinct). Space toggles; `t/f/true/false/y/n/1/0` accepted once bool.
- Int: must fit ±2^53−1. Float: 64-bit double.
- Float display: `42.` (default) / `42.0` / fixed N decimals; optional thousands separator; decimal mark always `.`
- Display format never changes stored values

### Dates

- Stored as naive ISO strings: `1998-04-20`, `1919-09-19T09:18:00` (no time zone, no seconds in the editor)
- Display/input format setting: `MM/DD/YYYY` (default), `DD/MM/YYYY`, `YYYY-MM-DD`, `DD.MM.YYYY`; 24h (default) or 12h
- Masked editor: digits fill slots and skip separators; Backspace steps back; ↑/↓ increment the segment
  under the caret; invalid (02/31) or partial values rejected; paste accepts ISO too
- "Insert today" / "Insert now" exist as keymap actions with no default binding

### Type conversion

| from → to | rule |
|---|---|
| any → string | displayed value |
| string → int/float/bool/date/datetime | parse with input rules; failures → null |
| int → float | lossless |
| float → int | round half away from zero |
| int → bool | 0→false, 1→true, else null |
| bool → int/float | 1 / 0 |
| date → datetime | midnight |
| datetime → date | drop time |
| numbers ↔ dates | null |
| untyped → any | no modal |

The warning modal only appears when at least one value becomes null or its displayed text meaningfully
changes (e.g. `"007"`→`7`, `4.6`→`5`, datetime→date). `"1"`→`1`, `"1.5"`→`1.5`, `"1998-04-20"`→date: no warning.
Modal shows counts + up to 5 before→after samples; Cancel / Convert. Undoable.

## Workspace

- Databases contain tables. First launch: "My Database" → "Table1", open.
- Collapsible (Ctrl+\ or chevron), resizable sidebar; width and per-database expand state persisted. No search.
- Icons distinguish databases vs tables (also in Deleted)
- "+ Database" and "Import database…" at top; "+" on each database adds a table
- Double-click to rename; table names unique per database
- Move table via drag-and-drop or right-click "Move to ▸"; name collision → auto-rename "Table1 (2)"
- Hover "x" deletes → moves to **Deleted** (collapsed by default). Deleted items can't be opened;
  Restore / Delete forever (confirm) / Empty trash. Deleting a DB moves it with its tables.
  Restoring a table whose DB is deleted restores the DB too (containing only that table).
  Deleting a table closes its tab.

## Tabs & routing

- Routes: `/t/:tableId`, `/settings` (settings is a tab too)
- Opening an already-open table focuses its tab; middle-click closes; drag to reorder; overflow scrolls;
  closing active focuses right neighbour (else left); rename updates the tab title. No "reopen closed tab".
- Tabs can be disabled: clicking a table replaces the single view, no tab bar
- On load: restore open tabs, active tab, and last selected cell

## Storage

- localStorage: one key per table, an index key (databases, metadata), UI-state key, settings key
- Debounced saves; toast when near quota; clear error on failed writes
- Multiple windows: sync via `storage` event; reload the table in place, or show a
  "changed elsewhere, reload?" banner if mid-edit

## Import / export

| | Import | Export |
|---|---|---|
| Table | CSV, JSON, JSONL, YAML, EDN, EDNL | CSV, JSON, JSONL, YAML, EDN, EDNL, SQLite SQL, Postgres SQL |
| Database | SQLite file (creates new database) | SQLite SQL, Postgres SQL |

- Imports always create a new table (into a chosen DB, default current) / new DB; then open it
- Every import shows a preview with an editable inferred type per column (narrowest type fitting all values)
- Entry points: table/database right-click menus, tab "⋯" menu, sidebar top, drag-drop a file anywhere
- Advanced options collapsed by default; sensible defaults everywhere

### Import formats

- **CSV**: header toggle (default on); delimiter auto-detect `,` `;` tab with override; empty → null; RFC 4180
- **JSON**: array of flat objects, or one object; columns = union of keys in first-seen order;
  nested values → stringify or null (user choice); mixed types → string
- **JSONL / EDNL**: one record per line; bad lines skipped with a warning count
- **YAML**: single document, top-level sequence of maps (or one map); YAML timestamps → date/datetime
- **EDN**: vector/list of maps; `:name` → `name`, `:user/name` → `user/name`; keyword values → string
  without colon; `#inst` → datetime; vectors/sets/maps → stringify or null; unknown tags → string
- **SQLite** (via sql.js): declared type → `INT*` int, `REAL/FLOAT/DOUBLE/NUMERIC` float, `BOOL*` bool,
  `DATE` date, `DATETIME/TIMESTAMP` datetime, else string. Mismatched cells → null (per-table option: make
  column string). BLOB columns, views, triggers skipped and listed. Warn before exceeding storage.
- Ints outside ±2^53−1 become strings with a warning

### Export formats

- Floats serialise as `42.0` in JSON/YAML/EDN; CSV uses the display form (`42.`), advanced option for `42.0`
- Dates per format: CSV/JSON ISO strings; YAML native timestamps (`1919-09-19 09:18:00`); EDN `#inst "…Z"`
  (wall-clock); SQL ISO text
- **CSV**: header, comma, null → empty. Advanced: delimiter, null text
- **JSON**: array of objects, 2-space indent, nulls included. Advanced: minify, omit nulls
- **JSONL**: one object per line
- **YAML**: sequence of maps
- **EDN / EDNL**: vector of maps, keyword keys where valid else string keys, null → `nil`
- All formats: advanced option "skip all-null rows" (default off)
- **SQL** (`.sql` text): `BEGIN; … COMMIT;`, batched multi-row INSERT (500), identifiers quoted only when
  needed. Advanced: `DROP TABLE IF EXISTS`, per-column NOT NULL (default: NOT NULL iff no nulls),
  surrogate primary key toggle (default off)
  - SQLite types: `INTEGER`, `REAL`, `TEXT`, `BOOLEAN` (0/1), `DATE`, `DATETIME` (ISO text)
  - Postgres: `boolean`, `date`, `timestamp`; int/float/string from app settings
    (defaults `int4`, `float4`, `text`); optional schema name; range/precision warnings

## Settings

- Formats: date, time (24h/12h), float style, thousands separator
- Tabs on/off
- Postgres type mappings (int: int2/int4/int8; float: float4/float8/numeric; string: text/varchar)
- Default export options; theme (system/light/dark); grid density (compact/comfortable)
- Confirm before permanent delete
- Full backup export/restore (one JSON file); storage usage meter; Reset all data (type to confirm)
- **Keyboard**: list of actions → binding; click to record, Backspace clears; conflicts shown inline,
  assigning steals; reset one / all. Cmd≡Ctrl on macOS; Mac shows ⌘ ⇧ ⌥ ⌃.

| action | default |
|---|---|
| Insert today / Insert now | — |
| Insert row above / below | Ctrl+Alt+↑ / Ctrl+Alt+↓ |
| Delete row(s) | Ctrl+Alt+Backspace |
| Insert column left / right | Ctrl+Alt+← / Ctrl+Alt+→ |
| Delete column(s) | Ctrl+Alt+Shift+Backspace |
| Rename column | — (F2 on selected column) |
| Open type dropdown | Alt+T |
| Next / previous tab | Alt+] / Alt+[ |
| Close tab | Alt+W |
| Toggle sidebar | Ctrl+\ |
| Open settings | Ctrl+, |
| New table / Import / Export | — |

## Code layout

```
src/
  domain/      types, ids, column naming, inference, conversion, value parse/format, dates
  storage/     localStorage repositories (index, tables, ui, settings), quota helpers
  stores/      workspace, tabs, settings, keymap, history (undo)
  io/          format registry + one importer/exporter per format, shared interfaces
  grid/        Tabulator adapter, editors (text, date, bool), header, keyboard layer, clipboard
  components/  sidebar, tab bar, modals, menus, settings page, import/export dialogs
  routes/      route components
```
