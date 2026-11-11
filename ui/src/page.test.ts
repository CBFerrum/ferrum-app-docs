// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { getSchema } from "@tiptap/core";
import * as Y from "yjs";
import { documentExtensions } from "./schema";
import { columnOf } from "./layout";
import { cleanHref, headingByAnchor, targetOf } from "./links";
import { LEGACY, PRESETS, cleanSetup, dims, formatLength, isUnset, paperFor, parseLength, presetOf, readSetup, unitFor, watchSetup, writeSetup } from "./page";
import { boxContent, cssString, linesOf, printStyle } from "./print";
import { readFormat } from "./compat";

describe("the page setup", () => {
  it("is the legacy A4 with 2 cm margins until somebody sets it", () => {
    const doc = new Y.Doc();
    expect(isUnset(doc)).toBe(true);
    expect(readSetup(doc)).toEqual(LEGACY);
  });
  it("is shared: a change is seen by the other document at once, and it records the format", () => {
    const a = new Y.Doc();
    const b = new Y.Doc();
    a.on("update", (u: Uint8Array) => Y.applyUpdate(b, u));
    const seen: string[] = [];
    watchSetup(b, (s) => seen.push(`${s.size} ${s.orientation}`));
    writeSetup(a, { size: "Letter", orientation: "landscape", ...PRESETS.narrow, differentFirst: true });
    expect(readSetup(b)).toMatchObject({ size: "Letter", orientation: "landscape", top: 720, differentFirst: true });
    expect(seen.at(-1)).toBe("Letter landscape");
    expect(readFormat(b)).toBe(2);
  });
  it("is checked when read: a hostile map gives bounded values", () => {
    const s = cleanSetup({ size: "<script>", orientation: "sideways", top: -5, right: 1e9, bottom: "99999", left: "abc", differentFirst: "yes" });
    expect(s).toEqual(LEGACY);
    expect(cleanSetup({ size: "A5", top: 100000, left: 3000, right: 3000 })).toMatchObject({ size: "A5", left: LEGACY.left, right: LEGACY.right });
  });
  it("lies landscape by swapping the paper's sides", () => {
    expect(dims({ size: "Letter", orientation: "landscape" })).toEqual([15840, 12240]);
  });
  it("knows its presets", () => {
    expect(presetOf(PRESETS.wide)).toBe("wide");
    expect(presetOf({ top: 1, right: 2, bottom: 3, left: 4 })).toBeNull();
  });
  it("speaks inches in the United States and centimetres elsewhere, on Letter or A4", () => {
    expect([unitFor("en-US"), unitFor("en-GB"), unitFor("ar-EG"), unitFor("hi-IN"), unitFor("en")]).toEqual(["in", "cm", "cm", "cm", "in"]);
    expect([paperFor("en-US"), paperFor("en-GB"), paperFor("de-DE"), paperFor("en-CA")]).toEqual(["Letter", "A4", "A4", "Letter"]);
  });
  it("reads and writes lengths in the person's unit", () => {
    expect([formatLength(1440, "in"), formatLength(1417, "cm"), formatLength(1134, "cm")]).toEqual(["1", "2.5", "2"]);
    expect([parseLength("2,5", "cm"), parseLength("1 in", "cm"), parseLength("25 mm", "in"), parseLength("1", "in"), parseLength("abc", "cm"), parseLength("", "cm")]).toEqual([1417, 1440, 1417, 1440, null, null]);
  });
});

describe("the printed page", () => {
  const regions = {
    header: linesOf({ type: "doc", content: [{ type: "paragraph", attrs: { textAlign: "right" }, content: [{ type: "text", text: 'Agreement "A"', marks: [{ type: "bold" }] }] }] }),
    footer: linesOf({ type: "doc", content: [{ type: "paragraph", attrs: { textAlign: "center" }, content: [{ type: "text", text: "Page " }, { type: "pageField", attrs: { kind: "page" } }, { type: "text", text: " of " }, { type: "pageField", attrs: { kind: "pages" } }] }] }),
    firstHeader: [],
    firstFooter: [],
  };
  it("sets the paper, the margins, and the margin boxes with the printer's own counters", () => {
    const css = printStyle({ ...LEGACY, size: "Letter", orientation: "landscape", ...PRESETS.normal }, regions, { title: "T", date: "12 November 2026" });
    expect(css).toContain("size: 11in 8.5in");
    expect(css).toContain("margin: 1in 1in 1in 1in");
    expect(css).toContain('@top-right { content: "Agreement \\"A\\""');
    expect(css).toContain('@bottom-center { content: "Page " counter(page) " of " counter(pages)');
    expect(css).toContain("@top-left { content: none }");
    expect(css).not.toContain(":first");
  });
  it("has the first page's own boxes when it is asked for", () => {
    const css = printStyle({ ...LEGACY, differentFirst: true }, regions, { title: "T", date: "d" });
    expect(css).toContain("@page :first");
  });
  it("cannot be given CSS: strings are escaped and colours and fonts come out validated", () => {
    expect(cssString('a"; } @import url(x); {')).toBe('"a\\"; } @import url(x); {"');
    expect(cssString("a\nb\u0000")).toBe('"a\\A b"');
    const lines = linesOf({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "x", marks: [{ type: "textStyle", attrs: { color: "red; background: url(x)", fontFamily: "a};x{", fontSize: 9999 } }] }] }] });
    const css = printStyle(LEGACY, { header: lines, footer: [], firstHeader: [], firstFooter: [] }, { title: "", date: "" });
    expect(css).not.toMatch(/url\(|a\};x/);
    expect(boxContent([], { title: "", date: "" })).toBe("none");
  });
});

describe("links", () => {
  it("go to the web, to mail, to a heading of the document or to another document, and to nothing else", () => {
    expect(cleanHref("example.com")).toBe("https://example.com");
    expect(cleanHref("#abc12345")).toBe("#abc12345");
    expect(cleanHref("/docs/d/01a1cbff-6be2-7486-b91e-1274072992e5")).toBe("/docs/d/01a1cbff-6be2-7486-b91e-1274072992e5");
    for (const bad of ["/etc/passwd", "/docs/d/../x", "#a b", "#x", "javascript:1", "//evil.test/x"]) expect(cleanHref(bad), bad).toBeNull();
    expect(targetOf("#abc12345")).toEqual({ kind: "heading", anchor: "abc12345" });
    expect(targetOf("/docs/d/01a1cbff-6be2-7486-b91e-1274072992e5")).toEqual({ kind: "doc", id: "01a1cbff-6be2-7486-b91e-1274072992e5" });
    expect(targetOf("https://x.test").kind).toBe("web");
  });
  it("finds a heading by its anchor", () => {
    const doc = getSchema(documentExtensions("f")).nodeFromJSON({ type: "doc", content: [{ type: "paragraph" }, { type: "heading", attrs: { level: 2, anchor: "abc12345" }, content: [{ type: "text", text: "Fees" }] }] });
    expect(headingByAnchor(doc, "abc12345")).toEqual({ pos: 2, text: "Fees" });
    expect(headingByAnchor(doc, "zzzzzzzz")).toBeNull();
  });
});

describe("the layout", () => {
  it("numbers columns by the distance along them", () => {
    expect([columnOf(0, 700), columnOf(600, 700), columnOf(700, 700), columnOf(1400.5, 700), columnOf(-5, 700)]).toEqual([0, 0, 1, 2, 0]);
  });
});
