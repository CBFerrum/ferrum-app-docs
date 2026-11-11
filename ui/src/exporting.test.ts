import { describe, expect, it } from "vitest";
import { notCarriedField, notCarriedText, parseNotCarried } from "./exporting";

describe("what an export could not carry", () => {
  it("is read from the header, trimmed, without empties or repeats", () => {
    expect(parseNotCarried("comments; fonts ;;fonts; page setup")).toEqual(["comments", "fonts", "page setup"]);
  });
  it("is nothing when the header is absent or empty, as on a server that does not say", () => {
    expect(parseNotCarried(null)).toEqual([]);
    expect(parseNotCarried(undefined)).toEqual([]);
    expect(parseNotCarried("")).toEqual([]);
    expect(notCarriedText("docx", [])).toBeNull();
  });
  it("is said in the person's words, unknown names as the server gave them", () => {
    expect(notCarriedText("docx", ["comments", "something new"])).toBe("The Word file could not carry: comments, something new");
    expect(notCarriedText("md", ["fonts"])).toBe("The Markdown file could not carry: fonts");
  });
  it("from Markdown's answer, keeps only words", () => {
    expect(notCarriedField(["fonts", 3, null, "fonts", "page breaks"])).toEqual(["fonts", "page breaks"]);
    expect(notCarriedField("fonts")).toEqual([]);
    expect(notCarriedField(undefined)).toEqual([]);
  });
});
