// @vitest-environment jsdom
import { Editor } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import { cleanDate, today } from "./chips";
import { documentExtensions } from "./schema";

describe("a date chip", () => {
  it("keeps only real dates", () => {
    expect([cleanDate("2026-11-12"), cleanDate("2026-02-30"), cleanDate("2026-1-2"), cleanDate("<b>"), cleanDate(5)]).toEqual(["2026-11-12", null, null, null, null]);
    expect(today(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });
  it("is stored as the date and drawn in the reader's words, and read back from what it drew", () => {
    const e = new Editor({ extensions: documentExtensions("f"), content: "<p>Due </p>" });
    e.commands.setTextSelection(5);
    e.commands.insertDate("2026-11-12");
    const chip = e.state.doc.firstChild!.lastChild!;
    expect(chip.type.name).toBe("dateChip");
    expect(chip.attrs.date).toBe("2026-11-12");
    const html = e.getHTML();
    expect(html).toContain('datetime="2026-11-12"');
    const back = new Editor({ extensions: documentExtensions("f"), content: html });
    expect(back.state.doc.firstChild!.lastChild!.attrs.date).toBe("2026-11-12");
    // A hostile value never reaches the page.
    const bad = new Editor({ extensions: documentExtensions("f"), content: '<p><time data-date-chip datetime="x onload=alert(1)">x</time></p>' });
    expect(bad.state.doc.firstChild!.firstChild!.attrs.date).toBeNull();
    for (const x of [e, back, bad]) x.destroy();
  });
});
