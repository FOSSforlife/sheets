/** Spreadsheet-style letters: 0 → A, 25 → Z, 26 → AA, 701 → ZZ, ... */
export function columnLetters(index: number): string {
  let n = index + 1;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

/** First unused name in ColumnA, ColumnB, ..., ColumnZ, ColumnAA, ... */
export function nextColumnName(existing: Iterable<string>): string {
  const taken = new Set(existing);
  for (let i = 0; ; i++) {
    const name = `Column${columnLetters(i)}`;
    if (!taken.has(name)) return name;
  }
}

/** First unused name in Table1, Table2, ... */
export function nextTableName(existing: Iterable<string>, base = "Table"): string {
  const taken = new Set(existing);
  for (let i = 1; ; i++) {
    const name = `${base}${i}`;
    if (!taken.has(name)) return name;
  }
}

/** `name` if free, else `name (2)`, `name (3)`, ... */
export function dedupeName(name: string, existing: Iterable<string>): string {
  const taken = new Set(existing);
  if (!taken.has(name)) return name;
  for (let i = 2; ; i++) {
    const candidate = `${name} (${i})`;
    if (!taken.has(candidate)) return candidate;
  }
}
