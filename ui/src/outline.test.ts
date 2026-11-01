import { getSchema } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import { depthOf, headingInView, headingsOf, sameHeadings } from "./outline";
import { documentExtensions } from "./schema";

const schema = getSchema(documentExtensions("file"));
const heading = (level: number, text: string) => schema.node("heading", { level }, text ? [schema.text(text)] : []);
const para = (text: string) => schema.node("paragraph", null, [schema.text(text)]);
const doc = (...blocks: ReturnType<typeof para>[]) => schema.node("doc", null, blocks);

describe("a document's contents", () => {
  const d = doc(heading(1, "Plan"), para("Why we do it."), heading(2, "Goals"), heading(2, "  Not   doing "), heading(3, ""), heading(2, "Risks"));

  it("lists the headings with words, in order, where each one starts", () => {
    const hs = headingsOf(d);
    expect(hs.map((h) => [h.level, h.text])).toEqual([
      [1, "Plan"],
      [2, "Goals"],
      [2, "Not doing"],
      [2, "Risks"],
    ]);
    // Each position is the heading's own.
    for (const h of hs) expect(d.nodeAt(h.pos)?.type.name).toBe("heading");
  });

  it("finds headings in quotes and lists, and none in a document without any", () => {
    const quote = schema.node("blockquote", null, [heading(2, "Inside")]);
    expect(headingsOf(schema.node("doc", null, [quote, para("x")])).map((h) => h.text)).toEqual(["Inside"]);
    expect(headingsOf(doc(para("Just words")))).toEqual([]);
  });

  it("indents by level below the highest one used", () => {
    const hs = headingsOf(doc(heading(2, "A"), heading(3, "B"), heading(6, "C")));
    expect(hs.map((h) => depthOf(hs, h))).toEqual([0, 1, 4]);
  });

  it("knows when nothing changed", () => {
    expect(sameHeadings(headingsOf(d), headingsOf(d))).toBe(true);
    expect(sameHeadings(headingsOf(d), headingsOf(doc(heading(1, "Plan"))))).toBe(false);
    expect(sameHeadings(headingsOf(doc(heading(1, "A"))), headingsOf(doc(heading(1, "B"))))).toBe(false);
  });

  it("says which heading the reader is at", () => {
    expect(headingInView([-900, -300, 40, 600], 120)).toBe(2);
    expect(headingInView([200, 500], 120)).toBe(0);
    expect(headingInView([-10], 120)).toBe(0);
    expect(headingInView([], 120)).toBe(0);
  });
});
