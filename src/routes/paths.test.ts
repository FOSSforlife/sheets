import { describe, expect, it } from "vitest";
import { absolutePath, parseLocation } from "./paths";

describe("parseLocation", () => {
  it("reads table and settings routes under the base", () => {
    expect(parseLocation(absolutePath("/t/t_abc"))).toEqual({ kind: "table", tableId: "t_abc" });
    expect(parseLocation(absolutePath("/t/t_abc/"))).toEqual({ kind: "table", tableId: "t_abc" });
    expect(parseLocation(absolutePath("/settings"))).toEqual({ kind: "settings" });
  });
  it("returns null for the root and unknown paths", () => {
    expect(parseLocation(absolutePath("/"))).toBeNull();
    expect(parseLocation(absolutePath("/nope"))).toBeNull();
  });
});
