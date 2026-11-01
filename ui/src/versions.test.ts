import { describe, expect, it } from "vitest";
import { type Version, chosen, fileSize, parseAgainst, sideName, sides, summary } from "./versions";

const v = (version: number, current = false): Version => ({ id: `id${version}`, version, size: 100, author: "ana@acme.test", comment: null, created_at: "2026-11-01T10:00:00Z", current });
// As Drive lists them: newest first.
const list = [v(7, true), v(5), v(4), v(1)];

describe("which versions are compared", () => {
  it("reads the link's choice of what to compare with", () => {
    expect([parseAgainst(null), parseAgainst("previous"), parseAgainst("current"), parseAgainst("4"), parseAgainst("x"), parseAgainst("0"), parseAgainst("-3")]).toEqual(["previous", "previous", "current", 4, "previous", "previous", "previous"]);
  });

  it("opens the version a link names, else the newest, else nothing", () => {
    expect(chosen(list, "4")?.version).toBe(4);
    expect(chosen(list, "99")?.version).toBe(7);
    expect(chosen(list, null)?.version).toBe(7);
    expect(chosen([], "1")).toBeNull();
  });

  it("puts the version beside the one before it by default, skipping versions that are gone", () => {
    expect(sides(list, 7, "previous")).toEqual({ older: 5, newer: 7 });
    expect(sides(list, 5, "previous")).toEqual({ older: 4, newer: 5 });
    // The first version is compared with nothing: all of it is new.
    expect(sides(list, 1, "previous")).toEqual({ older: "start", newer: 1 });
  });

  it("can compare with the text now, or with any other version, older one first", () => {
    expect(sides(list, 4, "current")).toEqual({ older: 4, newer: "current" });
    expect(sides(list, 5, 1)).toEqual({ older: 1, newer: 5 });
    expect(sides(list, 4, 7)).toEqual({ older: 4, newer: 7 });
    // Itself, or a version that does not exist, is the version before it.
    expect(sides(list, 5, 5)).toEqual({ older: 4, newer: 5 });
    expect(sides(list, 5, 6)).toEqual({ older: 4, newer: 5 });
  });

  it("names the sides, sizes and changes in plain words", () => {
    expect([sideName(3), sideName("current"), sideName("start")]).toEqual(["Version 3", "The text now", "Nothing yet"]);
    expect([fileSize(900), fileSize(2048), fileSize(5 * 1024 * 1024)]).toEqual(["900 B", "2 KB", "5.0 MB"]);
    expect([summary(0, 0), summary(1, 0), summary(12, 3), summary(0, 1)]).toEqual(["No changes in the words", "1 word added", "12 words added, 3 removed", "1 word removed"]);
  });
});
