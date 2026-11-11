// @vitest-environment jsdom
import { Editor } from "@tiptap/core";
import { Collaboration } from "@tiptap/extension-collaboration";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { DEFAULT_SIZE, FONTS, GREYS, HUES, SHADES, cleanBullet, cleanColor, cleanFontFamily, cleanFontSize, cleanIndent, cleanLineHeight, cleanSpace, fontStack, indentOf, pastedColor, stepSize } from "./format";
import { documentExtensions } from "./schema";

describe("colours", () => {
  it("are kept as solid hex, whatever form they arrive in", () => {
    expect([cleanColor("#ABC"), cleanColor("#1F2A44"), cleanColor("rgb(31, 42, 68)"), cleanColor("rgba(31 42 68 / 0.5)"), cleanColor("Red"), cleanColor("#12345678")]).toEqual(["#aabbcc", "#1f2a44", "#1f2a44", "#1f2a44", "#ff0000", "#123456"]);
  });
  it("refuse what is not a colour, and what is nothing", () => {
    const hostile = ["red; background: url(https://x.test/a)", "url(javascript:alert(1))", "expression(alert(1))", "#12345", "rgb(300, 0, 0)", "var(--text)", "windowtext", "transparent", "rgba(1,2,3,0)", "#00000000", "red}", "\u0000red", 12, null, undefined, {}];
    for (const v of hostile) expect(cleanColor(v), String(v)).toBeNull();
  });
  it("treat pasted black as the automatic colour", () => {
    expect([pastedColor("#000000"), pastedColor("black"), pastedColor("rgb(0,0,0)"), pastedColor("#202329")]).toEqual([null, null, null, "#202329"]);
  });
  it("have a palette of ten hues in five shades, valid and distinct, and the greys", () => {
    expect(HUES).toHaveLength(10);
    expect(SHADES).toHaveLength(5);
    for (const row of SHADES) {
      expect(row).toHaveLength(10);
      for (const c of row) expect(cleanColor(c)).toBe(c);
    }
    expect(new Set(SHADES.flat()).size).toBe(50);
    expect(GREYS[0]).toBe("#000000");
    expect(GREYS.at(-1)).toBe("#ffffff");
  });
});

describe("font families", () => {
  it("keep the offered ones in their own spelling and the first of a CSS list", () => {
    expect([cleanFontFamily("arial"), cleanFontFamily('"Times New Roman", Times, serif'), cleanFontFamily("Courier New, monospace"), cleanFontFamily("Serif")]).toEqual(["Arial", "Times New Roman", "Courier New", "Serif"]);
    expect([cleanFontFamily("sans-serif"), cleanFontFamily("system-ui, sans-serif"), cleanFontFamily("monospace"), cleanFontFamily("")]).toEqual([null, null, "Monospace", null]);
  });
  it("keep a plain family a reader's computer may have, and never CSS", () => {
    expect(cleanFontFamily('"Calibri Light", sans-serif')).toBe("Calibri Light");
    expect(fontStack("Calibri")).toBe('"Calibri", sans-serif');
    expect(fontStack("Cambria")).toBe('"Cambria", serif');
    for (const v of ['Arial; background: url(x)', 'x" onload="alert(1)', "url(https://x.test/f.woff)", "a{b}", "expression(alert(1))", "Arial</style>", "\\41rial", "a".repeat(80), 5, null]) expect(cleanFontFamily(v), String(v)).toBeNull();
    for (const f of FONTS) expect(fontStack(f.name)).toBe(f.stack);
  });
});

describe("sizes", () => {
  it("are points in bounds, from points or pixels", () => {
    expect([cleanFontSize(12), cleanFontSize("12pt"), cleanFontSize("16px"), cleanFontSize("10.4pt"), cleanFontSize("11.0pt")]).toEqual([12, 12, 12, 10.5, 11]);
    for (const v of [5, 201, -3, "1000pt", "12em", "12pt; color: red", "calc(1pt)", "NaN", Infinity, null]) expect(cleanFontSize(v), String(v)).toBeNull();
  });
  it("step through the menu's set", () => {
    expect([stepSize(null, 1), stepSize(11, -1), stepSize(12, 1), stepSize(13, 1), stepSize(96, 1), stepSize(8, -1), stepSize(200, 1)]).toEqual([12, 10, 14, 14, 97, 7, 200]);
    expect(DEFAULT_SIZE).toBe(11);
  });
});

describe("paragraph values", () => {
  it("are line heights, spaces and indents in bounds", () => {
    expect([cleanLineHeight("1.5"), cleanLineHeight("107%"), cleanLineHeight("normal"), cleanLineHeight("20px"), cleanLineHeight(9)]).toEqual([1.5, 1.07, null, null, null]);
    expect([cleanSpace("8.0pt"), cleanSpace("0cm"), cleanSpace("0.5in"), cleanSpace("-4pt"), cleanSpace("999pt"), cleanSpace("1em")]).toEqual([8, 0, 36, null, null, null]);
    expect([cleanIndent(3), cleanIndent(0), cleanIndent(9), cleanIndent(1.5), indentOf("36.0pt"), indentOf("72pt"), indentOf("0cm"), indentOf("auto")]).toEqual([3, null, null, null, 1, 2, null, null]);
    expect([cleanBullet("square"), cleanBullet("disc"), cleanBullet("url(x)")]).toEqual(["square", null, null]);
  });
});

function editor(content: string, ext = documentExtensions("f")) {
  return new Editor({ extensions: ext, content });
}

describe("the document", () => {
  it("keeps what a person set and draws only validated styles", () => {
    const e = editor('<p style="line-height:1.5;margin-top:6pt;margin-bottom:12pt;margin-left:36pt;text-align:justify"><span style="font-family:Georgia,serif;font-size:14pt;color:#1F2A44">Quarter</span> <sub>2</sub> <span style="background:yellow">hot</span></p>');
    const p = e.getJSON().content![0]!;
    expect(p.attrs).toMatchObject({ lineHeight: 1.5, spaceBefore: 6, spaceAfter: 12, indent: 1, textAlign: "justify" });
    expect(p.content![0]!.marks).toEqual([{ type: "textStyle", attrs: { color: "#1f2a44", fontFamily: "Georgia", fontSize: 14 } }]);
    expect(p.content![2]!.marks![0]!.type).toBe("subscript");
    expect(p.content![4]!.marks).toEqual([{ type: "highlight", attrs: { color: "#ffff00" } }]);
    const html = e.getHTML();
    expect(html).toContain("color: rgb(31, 42, 68)");
    expect(html).toContain("font-family: Georgia, &quot;Times New Roman&quot;, serif");
    expect(html).toContain("margin-inline-start: 36pt");
    e.destroy();
  });
  it("never writes the clipboard's own style into a document", () => {
    const e = editor('<p style="margin-left:url(javascript:1);line-height:expression(x)"><span style="color:red;background-image:url(https://x.test/p.png);font-family:Arial;position:fixed;font-size:2000pt">x</span><span style="color:url(javascript:alert(1))">y</span><span style="font-family:a;b{}">z</span></p>');
    const html = e.getHTML();
    expect(html).not.toMatch(/url\(|javascript|expression|position|background-image|2000/i);
    expect(html).toContain("color: rgb(255, 0, 0)");
    e.destroy();
  });
  it("cannot be given CSS by a hostile update from another client", () => {
    const doc = new Y.Doc();
    const e = new Editor({ extensions: [...documentExtensions("f"), Collaboration.configure({ document: doc, field: "default" })] });
    const frag = doc.getXmlFragment("default");
    const p = new Y.XmlElement("paragraph");
    const text = new Y.XmlText();
    p.insert(0, [text]);
    frag.delete(0, frag.length);
    frag.insert(0, [p]);
    text.insert(0, "x", { textStyle: { color: "red; background: url(https://x.test/a)", fontFamily: 'a"; x:y', fontSize: "9999pt" }, highlight: { color: "url(x)" } });
    const html = e.getHTML();
    expect(html).not.toMatch(/url\(|;\s*x:y|9999|"; x/);
    e.destroy();
  });
});

describe("an older client", () => {
  const old = () => documentExtensions("f").filter((x) => !["textStyle", "subscript", "superscript", "docFormatting"].includes(x.name));
  it("does not rewrite a document that has styles it does not know", () => {
    const doc = new Y.Doc();
    const now = new Editor({ extensions: [...documentExtensions("f"), Collaboration.configure({ document: doc, field: "default" })] });
    now.commands.setContent('<p><span style="color:#336699;font-size:14pt">Styled</span> and plain</p>');
    const before = doc.getXmlFragment("default").toString();
    expect(before).toContain("textStyle");
    const errors: unknown[] = [];
    const was = console.error;
    console.error = (...a: unknown[]) => void errors.push(a);
    let stale: Editor | null = null;
    try {
      stale = new Editor({ extensions: [...old(), Collaboration.configure({ document: doc, field: "default" })] });
      // The old tab's person types: whatever it does, the styles in the shared document stay.
      stale.commands.insertContentAt(1, "more ");
    } catch {
      // Not opening is the failure that is allowed.
    } finally {
      console.error = was;
    }
    const after = doc.getXmlFragment("default").toString();
    expect(after).toContain("textStyle");
    expect(after).toContain("Styled");
    expect(after).toContain("color");
    stale?.destroy();
    now.destroy();
  });
});
