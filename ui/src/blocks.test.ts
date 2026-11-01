import { describe, expect, it } from "vitest";
import { BLOCKS, findBlocks } from "./blocks";

const ids = (query: string) => findBlocks(query).map((b) => b.id);

describe("the slash menu's blocks", () => {
  it("lists everything, in order, until something is typed", () => {
    expect(ids("")).toEqual(BLOCKS.map((b) => b.id));
    expect(ids("  ")).toEqual(BLOCKS.map((b) => b.id));
  });

  it("is found by title, by a word of it, or by another name", () => {
    expect(ids("head")).toEqual(["h1", "h2", "h3"]);
    expect(ids("heading 2")).toEqual(["h2"]);
    expect(ids("h1")[0]).toBe("h1");
    expect(ids("todo")).toEqual(["checklist"]);
    expect(ids("photo")).toEqual(["image"]);
    expect(ids("hr")).toEqual(["divider"]);
    expect(ids("TABLE")).toEqual(["table"]);
  });

  it("puts a title that starts with the words before one that only mentions them", () => {
    // "list" starts two titles; "checklist" only holds it.
    expect(ids("list").slice(0, 2)).toEqual(["bullets", "numbers"]);
    expect(ids("list")).toContain("checklist");
    expect(ids("call")).toEqual(["note", "tip", "warning", "alert"]);
  });

  it("offers nothing for words that match nothing", () => {
    expect(ids("zzzz")).toEqual([]);
  });

  it("describes each block in a line, and no block twice", () => {
    expect(new Set(BLOCKS.map((b) => b.id)).size).toBe(BLOCKS.length);
    for (const b of BLOCKS) expect(b.hint.length).toBeGreaterThan(5);
  });
});
