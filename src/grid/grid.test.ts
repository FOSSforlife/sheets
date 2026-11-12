import { describe, expect, it } from "vitest";
import { applyOps } from "../domain/ops";
import { DEFAULT_FORMAT as F } from "../domain/settings";
import type { TableDoc } from "../domain/types";
import { commitInput, planPaste, sortOps } from "./commands";
import { backspace, createMask, isComplete, stepSegment, toText, typeChar } from "./editors/mask";
import { parseTsv, toTsv } from "./tsv";

const doc = (): TableDoc => ({
  id: "t",
  columns: [
    { id: "a", name: "ColumnA", type: "untyped" },
    { id: "b", name: "ColumnB", type: "int" },
  ],
  rows: [{ id: "r1", cells: { b: 3 } }],
});

describe("tsv", () => {
  it("round-trips", () => {
    const m = [
      ["a", 'b"c'],
      ["x\ty", "multi\nline"],
    ];
    expect(parseTsv(toTsv(m))).toEqual(m);
    expect(parseTsv("1\t2\r\n3\t4\r\n")).toEqual([
      ["1", "2"],
      ["3", "4"],
    ]);
  });
});

describe("commitInput", () => {
  it("infers type", () => {
    const r = commitInput(doc(), "r1", "a", " 42 ", F);
    expect(r.ok && r.ops[0]).toEqual({ kind: "updateColumn", columnId: "a", patch: { type: "int" } });
  });
  it("rejects bad", () => {
    expect(commitInput(doc(), "r1", "b", "abc", F).ok).toBe(false);
  });
  it("whitespace → null", () => {
    const r = commitInput(doc(), "r1", "b", "   ", F);
    expect(r.ok && r.ops).toEqual([
      { kind: "setCells", changes: [{ rowId: "r1", columnId: "b", value: null }] },
    ]);
  });
});

describe("paste", () => {
  it("grows and infers", () => {
    const d = doc();
    const p = planPaste(
      d,
      { r0: 0, c0: 1, r1: 0, c1: 1 },
      [
        ["1", "x"],
        ["2", "y"],
      ],
      F,
    );
    expect(p.mismatches).toBe(0);
    applyOps(d, p.ops);
    expect(d.rows.length).toBe(2);
    expect(d.columns.map((c) => [c.name, c.type])).toEqual([
      ["ColumnA", "untyped"],
      ["ColumnB", "int"],
      ["ColumnC", "string"],
    ]);
  });
  it("counts mismatches", () => {
    expect(planPaste(doc(), { r0: 0, c0: 1, r1: 0, c1: 1 }, [["nope"]], F).mismatches).toBe(1);
  });
  it("fills range with single value", () => {
    const d = doc();
    d.rows.push({ id: "r2", cells: {} });
    const p = planPaste(d, { r0: 0, c0: 1, r1: 1, c1: 1 }, [["7"]], F);
    applyOps(d, p.ops);
    expect(d.rows.map((r) => r.cells.b)).toEqual([7, 7]);
  });
});

describe("sort", () => {
  it("nulls last", () => {
    const d: TableDoc = {
      id: "t",
      columns: [{ id: "a", name: "A", type: "int" }],
      rows: [
        { id: "1", cells: {} },
        { id: "2", cells: { a: 5 } },
        { id: "3", cells: { a: 1 } },
      ],
    };
    expect(sortOps(d, "a", "desc")).toEqual([{ kind: "reorderRows", order: ["2", "3", "1"] }]);
  });
});

describe("mask", () => {
  it("types digits skipping separators", () => {
    let m = createMask("date", "MDY", "24h");
    for (const c of "04201998") m = typeChar(m, c);
    expect(toText(m)).toBe("04/20/1998");
    expect(isComplete(m)).toBe(true);
    m = backspace(m);
    expect(toText(m)).toBe("04/20/199Y");
  });
  it("smart pads", () => {
    let m = createMask("date", "MDY", "24h");
    m = typeChar(m, "4");
    expect(toText(m)).toBe("04/DD/YYYY");
  });
  it("steps", () => {
    let m = createMask("datetime", "MDY", "12h", "12/31/2020 11:59 PM");
    m = { ...m, caret: 0 };
    m = stepSegment(m, 1);
    expect(toText(m)).toBe("01/31/2020 11:59 PM");
  });
});
