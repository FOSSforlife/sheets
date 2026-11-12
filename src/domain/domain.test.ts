import { describe, expect, it } from "vitest";
import { planConversion } from "./conversion";
import { formatIsoDateTime, parseDisplayDate, parseDisplayDateTime } from "./dates";
import { narrowestCommonType, rawKind, rawToCell } from "./inference";
import { columnLetters, dedupeName, nextColumnName } from "./names";
import { canonicalFloat, formatFloat } from "./numbers";
import { applyOps } from "./ops";
import { DEFAULT_FORMAT as F } from "./settings";
import type { TableDoc } from "./types";
import { formatDisplay, inferTypeFromInput, parseInput } from "./values";

describe("names", () => {
  it("letters", () => {
    expect([0, 25, 26, 27, 701, 702].map(columnLetters)).toEqual(["A", "Z", "AA", "AB", "ZZ", "AAA"]);
  });
  it("next column name reuses gaps", () => {
    expect(nextColumnName(["ColumnB", "Name"])).toBe("ColumnA");
    expect(nextColumnName(["ColumnA", "ColumnB"])).toBe("ColumnC");
  });
  it("dedupe", () => {
    expect(dedupeName("Table1", ["Table1", "Table1 (2)"])).toBe("Table1 (3)");
  });
});

describe("numbers", () => {
  it("floats", () => {
    expect(formatFloat(42, F)).toBe("42.");
    expect(formatFloat(4.2, F)).toBe("4.2");
    expect(formatFloat(42, { ...F, floatStyle: "pointZero" })).toBe("42.0");
    expect(formatFloat(1234.5, { ...F, floatStyle: "fixed", thousandsSeparator: true })).toBe("1,234.50");
    expect(canonicalFloat(42)).toBe("42.0");
  });
});

describe("parse & infer", () => {
  it("infers", () => {
    expect(inferTypeFromInput("true", F)).toBe("bool");
    expect(inferTypeFromInput("1", F)).toBe("int");
    expect(inferTypeFromInput("007", F)).toBe("string");
    expect(inferTypeFromInput("42.", F)).toBe("float");
    expect(inferTypeFromInput("1e3", F)).toBe("float");
    expect(inferTypeFromInput("04/20/1998", F)).toBe("date");
    expect(inferTypeFromInput("04/20/1998 13:05", F)).toBe("datetime");
    expect(inferTypeFromInput("1998-04-20", F)).toBe("date");
    expect(inferTypeFromInput("hello", F)).toBe("string");
  });
  it("rejects invalid", () => {
    expect(parseInput("abc", "int", F).ok).toBe(false);
    expect(parseInput("02/31/2020", "date", F).ok).toBe(false);
    expect(parseInput("   ", "int", F)).toEqual({ ok: true, value: null });
    expect(parseInput("99999999999999999999", "int", F).ok).toBe(false);
  });
  it("dates", () => {
    expect(parseDisplayDate("04/20/1998", "MDY")).toBe("1998-04-20");
    expect(parseDisplayDate("20.04.1998", "DMY_DOT")).toBe("1998-04-20");
    expect(parseDisplayDateTime("09/19/1919 09:18 AM", "MDY")).toBe("1919-09-19T09:18:00");
    expect(parseDisplayDateTime("09/19/1919 12:18 AM", "MDY")).toBe("1919-09-19T00:18:00");
    expect(formatIsoDateTime("1919-09-19T21:18:00", "MDY", "12h")).toBe("09/19/1919 09:18 PM");
    expect(formatDisplay("1998-04-20", "date", F)).toBe("04/20/1998");
  });
});

describe("conversion", () => {
  const rows = (vals: unknown[]) => vals.map((v, i) => ({ id: `r${i}`, cells: { c: v as never } }));
  it("no warning for clean string → int", () => {
    expect(planConversion(rows(["1", "2"]), "c", "string", "int", F).needsWarning).toBe(false);
  });
  it("warns for leading zeros and nulls", () => {
    const p = planConversion(rows(["007", "abc", "3"]), "c", "string", "int", F);
    expect(p.changed).toBe(1);
    expect(p.nulled).toBe(1);
  });
  it("float → int rounds", () => {
    const p = planConversion(rows([4.6, 2]), "c", "float", "int", F);
    expect(p.changes.map((c) => c.value)).toEqual([5]);
    expect(p.needsWarning).toBe(true);
  });
  it("string dates no warning", () => {
    const p = planConversion(rows(["1998-04-20", "04/21/1998"]), "c", "string", "date", F);
    expect(p.needsWarning).toBe(false);
    expect(p.changes.map((c) => c.value)).toEqual(["1998-04-21"]);
  });
  it("datetime → date warns only with time", () => {
    expect(planConversion(rows(["2020-01-01T00:00:00"]), "c", "datetime", "date", F).needsWarning).toBe(
      false,
    );
    expect(planConversion(rows(["2020-01-01T10:00:00"]), "c", "datetime", "date", F).needsWarning).toBe(true);
  });
});

describe("inference of raw values", () => {
  it("narrowest", () => {
    expect(narrowestCommonType(["int", "float", null])).toBe("float");
    expect(narrowestCommonType(["int", "string"])).toBe("string");
    expect(narrowestCommonType([null])).toBe("untyped");
    expect(rawKind({ kind: "text", text: "1998-04-20" })).toBe("date");
    expect(rawToCell({ kind: "text", text: "3" }, "float")).toBe(3);
    expect(rawToCell({ kind: "text", text: "x" }, "int")).toBeUndefined();
  });
});

describe("ops", () => {
  it("round-trips", () => {
    const doc: TableDoc = {
      id: "t",
      columns: [{ id: "a", name: "A", type: "int" }],
      rows: [
        { id: "r1", cells: { a: 1 } },
        { id: "r2", cells: { a: 2 } },
      ],
    };
    const snapshot = JSON.stringify(doc);
    const inv = applyOps(doc, [
      { kind: "setCells", changes: [{ rowId: "r1", columnId: "a", value: 9 }] },
      { kind: "removeRows", rowIds: ["r1"] },
      { kind: "insertColumn", index: 0, column: { id: "b", name: "B", type: "string" } },
      { kind: "removeColumn", columnId: "a" },
      { kind: "reorderRows", order: ["r2"] },
    ]);
    expect(doc.columns.map((c) => c.id)).toEqual(["b"]);
    applyOps(doc, inv);
    expect(JSON.stringify(doc)).toBe(snapshot);
  });
});
