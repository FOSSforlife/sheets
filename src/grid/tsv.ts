/** Tab-separated clipboard format, compatible with Google Sheets and Excel. */

export function toTsv(matrix: string[][]): string {
  return matrix.map((row) => row.map(quoteField).join("\t")).join("\n");
}

function quoteField(s: string): string {
  return /[\t\n\r"]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

/** Parses TSV text; quoted fields may contain tabs, newlines and doubled quotes. */
export function parseTsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let i = 0;
  let quoted = false;
  let atFieldStart = true;
  const src = text.replace(/\r\n?/g, "\n").replace(/\n$/, "");
  while (i < src.length) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"' && atFieldStart) {
      quoted = true;
      atFieldStart = false;
      i++;
      continue;
    }
    if (ch === "\t") {
      row.push(field);
      field = "";
      atFieldStart = true;
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      atFieldStart = true;
    } else {
      field += ch;
      atFieldStart = false;
    }
    i++;
  }
  row.push(field);
  rows.push(row);
  return rows;
}
