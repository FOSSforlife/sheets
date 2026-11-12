import { describe, expect, it } from "vitest";
import { DEFAULT_FORMAT, DEFAULT_SETTINGS } from "../domain/settings";
import type { TableDoc } from "../domain/types";
import { buildDoc, inferColumnTypes } from "./build";
import { DEFAULT_TEXT_EXPORT, exportText } from "./exporters";
import { parseText } from "./importers";
import { defaultNotNull, exportSql, quoteIdent } from "./sql";
import { DEFAULT_PARSE_OPTIONS, TEXT_FORMATS } from "./types";

const doc: TableDoc = {
  id: "t",
  columns: [
    { id: "s", name: "name", type: "string" },
    { id: "i", name: "count", type: "int" },
    { id: "f", name: "score", type: "float" },
    { id: "b", name: "ok", type: "bool" },
    { id: "d", name: "born", type: "date" },
    { id: "dt", name: "at time", type: "datetime" },
  ],
  rows: [
    {
      id: "1",
      cells: { s: 'He said "hi", ok', i: 42, f: 42, b: true, d: "1998-04-20", dt: "1919-09-19T09:18:00" },
    },
    { id: "2", cells: { s: "true", i: -3, f: 4.25, b: false } },
    { id: "3", cells: {} },
  ],
};

describe("text round-trips", () => {
  for (const format of TEXT_FORMATS) {
    it(format, () => {
      const text = exportText(format, doc, DEFAULT_TEXT_EXPORT, DEFAULT_FORMAT);
      const raw = parseText(format, "t", text, DEFAULT_PARSE_OPTIONS);
      const types = inferColumnTypes(raw, "stringify");
      expect(raw.columns).toEqual(doc.columns.map((c) => c.name));
      const expected =
        format === "csv"
          ? ["string", "int", "float", "bool", "date", "datetime"]
          : doc.columns.map((c) => c.type);
      expect(types).toEqual(expected);
      const built = buildDoc(raw, types, "stringify").doc;
      expect(built.rows.length).toBe(3);
      const vals = built.rows.map((r) => built.columns.map((c) => r.cells[c.id] ?? null));
      expect(vals[0]).toEqual(['He said "hi", ok', 42, 42, true, "1998-04-20", "1919-09-19T09:18:00"]);
      expect(vals[1]).toEqual(["true", -3, 4.25, false, null, null]);
    });
  }
});

describe("nested handling", () => {
  it("json nested stringify / null", () => {
    const raw = parseText("json", "t", '[{"a": {"x": 1}, "b": [1,2], "c": 1.0}]', DEFAULT_PARSE_OPTIONS);
    expect(raw.nestedCount).toBe(2);
    expect(inferColumnTypes(raw, "stringify")).toEqual(["string", "string", "float"]);
    const built = buildDoc(raw, inferColumnTypes(raw, "null"), "null").doc;
    expect(built.columns.map((c) => c.type)).toEqual(["untyped", "untyped", "float"]);
  });
  it("edn keywords & sets", () => {
    const raw = parseText("edn", "t", '[{:user/name "a" :tags #{:x} :k :foo}]', DEFAULT_PARSE_OPTIONS);
    expect(raw.columns).toEqual(["user/name", "tags", "k"]);
    expect(raw.rows[0]![2]).toEqual({ kind: "string", value: "foo" });
  });
  it("csv delimiter detection", () => {
    const raw = parseText("csv", "t", "a;b\n1;2\n", DEFAULT_PARSE_OPTIONS);
    expect(raw.columns).toEqual(["a", "b"]);
  });
  it("jsonl bad lines", () => {
    const raw = parseText("jsonl", "t", '{"a":1}\nnope\n{"a":2}\n', DEFAULT_PARSE_OPTIONS);
    expect(raw.rows.length).toBe(2);
    expect(raw.warnings.length).toBe(1);
  });
});

describe("sql", () => {
  it("quotes", () => {
    expect(quoteIdent("name")).toBe("name");
    expect(quoteIdent("at time")).toBe('"at time"');
    expect(quoteIdent("Name")).toBe('"Name"');
    expect(quoteIdent("order")).toBe('"order"');
  });
  it("generates", () => {
    const sql = exportSql(
      [{ name: "people", doc }],
      "postgres",
      {
        dropTable: true,
        skipEmptyRows: false,
        primaryKey: true,
        schema: "",
        notNull: defaultNotNull(doc),
        batchSize: 500,
      },
      DEFAULT_SETTINGS.postgres,
    );
    expect(sql).toContain("CREATE TABLE people");
    expect(sql).toContain("score float4");
    expect(sql).toContain("'He said \"hi\", ok', 42, 42.0, TRUE, '1998-04-20', '1919-09-19T09:18:00'");
    expect(sql).toContain("(NULL, NULL, NULL, NULL, NULL, NULL)");
  });
});
