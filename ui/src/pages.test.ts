// @vitest-environment jsdom
import { Editor } from "@tiptap/core";
import { Collaboration } from "@tiptap/extension-collaboration";
import { EditorState } from "@tiptap/pm/state";
import { EditorView } from "@tiptap/pm/view";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { findMatches } from "./find";
import { footnotePos, insertFootnoteAndJump, viewPlugins } from "./pages";
import { documentExtensions } from "./schema";

const make = (doc = new Y.Doc(), extra: Parameters<typeof documentExtensions>[0] = "f") => {
  const e = new Editor({ extensions: [...documentExtensions(extra), Collaboration.configure({ document: doc, field: "default" })] });
  return { e, doc };
};
const names = (e: Editor) => e.state.doc.children.map((c) => c.type.name);

describe("a page break", () => {
  it("splits the paragraph at the caret and leaves the caret in the text after it", () => {
    const { e } = make();
    e.commands.setContent("<p>First part second part</p>");
    e.commands.setTextSelection(11);
    expect(e.commands.insertPageBreak()).toBe(true);
    expect(names(e)).toEqual(["paragraph", "pageBreak", "paragraph"]);
    expect(e.state.doc.child(0).textContent).toBe("First part");
    expect(e.state.doc.child(2).textContent).toBe(" second part");
    expect(e.state.selection.$from.parent).toBe(e.state.doc.child(2));
    expect(e.getHTML()).toContain("data-page-break");
    e.destroy();
  });
  it("goes after a table when the caret is in a cell, and makes a paragraph to type in at the end", () => {
    const { e } = make();
    e.commands.insertTable({ rows: 1, cols: 1, withHeaderRow: false });
    e.commands.insertPageBreak();
    expect(names(e).slice(-2)).toEqual(["pageBreak", "paragraph"]);
    e.destroy();
  });
  it("reads Word's break paragraphs back", () => {
    const { e } = make();
    e.commands.setContent('<p>a</p><p style="page-break-before:always"></p><p>b</p>');
    expect(names(e)).toContain("pageBreak");
    e.destroy();
  });
});

describe("footnotes", () => {
  it("make their body at the end, number in the order of the text, and go with their reference", () => {
    const { e } = make();
    e.commands.setContent("<p>One two three</p>");
    e.commands.setTextSelection(8);
    expect(insertFootnoteAndJump(e)).toBe(true);
    e.commands.setTextSelection(4);
    expect(insertFootnoteAndJump(e)).toBe(true);
    const refs: string[] = [];
    e.state.doc.descendants((n) => void (n.type.name === "footnoteRef" && refs.push(n.attrs.id)));
    expect(refs).toHaveLength(2);
    // The bodies are in the order of the references, and numbered so.
    const bodies = e.state.doc.children.filter((c) => c.type.name === "footnote").map((c) => c.attrs.id);
    expect(bodies).toEqual(refs);
    const html = e.view.dom.innerHTML;
    expect([...html.matchAll(/data-footnote-body="[^"]+"[^>]*data-n="(\d)"/g)].map((m) => m[1])).toEqual(["1", "2"]);
    // Deleting a reference deletes its body, in the same step.
    const first = refs[0]!;
    let at = -1;
    e.state.doc.descendants((n, p) => void (n.attrs.id === first && n.type.name === "footnoteRef" && (at = p)));
    e.view.dispatch(e.state.tr.delete(at, at + 1));
    expect(footnotePos(e.state.doc, first)).toBeNull();
    expect(e.state.doc.children.filter((c) => c.type.name === "footnote")).toHaveLength(1);
    e.destroy();
  });
  it("copy with their reference: a pasted reference gets a body of its own", () => {
    const { e } = make();
    e.commands.setContent("<p>Alpha beta</p>");
    e.commands.setTextSelection(6);
    e.commands.insertFootnote("abcdef12");
    expect(footnotePos(e.state.doc, "abcdef12")).not.toBeNull();
    e.commands.setTextSelection(1);
    e.commands.insertContent('<sup data-footnote="abcdef12"></sup>');
    const ids = new Set<string>();
    e.state.doc.descendants((n) => void (n.type.name === "footnoteRef" && ids.add(n.attrs.id)));
    expect(ids.size).toBe(2);
    expect(e.state.doc.children.filter((c) => c.type.name === "footnote")).toHaveLength(2);
    e.destroy();
  });
  it("arrive at a co-editor whole, and renumber there when another reference is added before them", () => {
    const a = make();
    const b = make();
    const sync = () => {
      Y.applyUpdate(b.doc, Y.encodeStateAsUpdate(a.doc));
      Y.applyUpdate(a.doc, Y.encodeStateAsUpdate(b.doc));
    };
    a.e.commands.setContent("<p>Alpha beta gamma</p>");
    sync();
    a.e.commands.setTextSelection(12);
    a.e.commands.insertFootnote("zzzzzz01");
    sync();
    expect(b.e.state.doc.children.map((c) => c.type.name)).toEqual(["paragraph", "footnote"]);
    b.e.commands.setTextSelection(3);
    b.e.commands.insertFootnote("aaaaaa02");
    sync();
    const order = a.e.state.doc.children.filter((c) => c.type.name === "footnote").map((c) => c.attrs.id);
    expect(order).toEqual(["aaaaaa02", "zzzzzz01"]);
    expect(a.e.view.dom.innerHTML).toMatch(/data-footnote-body="aaaaaa02"[^>]*data-n="1"/);
    expect(a.e.view.dom.innerHTML).toMatch(/data-footnote-body="zzzzzz01"[^>]*data-n="2"/);
    a.e.destroy();
    b.e.destroy();
  });
});

describe("an inserted table of contents", () => {
  it("lists the headings as they are, and follows them", async () => {
    const { e } = make();
    e.commands.setContent("<h1>Scope</h1><p>x</p><h2>Fees</h2><p>y</p>");
    e.commands.insertContent({ type: "tableOfContents" });
    await Promise.resolve();
    const items = () => [...e.view.dom.querySelectorAll("nav[data-toc] a")].map((a) => a.textContent);
    expect(items()).toEqual(["Scope", "Fees"]);
    e.commands.insertContentAt(e.state.doc.content.size, { type: "heading", attrs: { level: 3 }, content: [{ type: "text", text: "Late fees" }] });
    expect(items()).toEqual(["Scope", "Fees", "Late fees"]);
    e.destroy();
  });
});

describe("a version of the history", () => {
  it("draws the new nodes and marks with the plugins of the editor", async () => {
    const live = make();
    live.e.commands.setContent('<h1>Title here</h1><p><span style="color:#336699;font-size:14pt">Styled</span> text</p>');
    live.e.commands.insertContent({ type: "tableOfContents" });
    live.e.commands.setTextSelection(14);
    live.e.commands.insertFootnote("hist0001");
    live.e.commands.insertPageBreak();
    const json = live.e.getJSON();
    const el = document.createElement("div");
    const view = new EditorView(el, { state: EditorState.create({ doc: live.e.schema.nodeFromJSON(json), plugins: viewPlugins() }), editable: () => false });
    await Promise.resolve();
    const html = el.innerHTML;
    expect(html).toMatch(/color: (#336699|rgb\(51, 102, 153\))/);
    expect(html).toContain("font-size: 14pt");
    expect(html).toContain("data-footnote-body");
    expect(html).toContain('data-n="1"');
    expect(html).toContain("data-page-break");
    expect(el.querySelector("nav[data-toc] a")?.textContent).toBe("Title here");
    view.destroy();
    live.e.destroy();
  });
});

describe("an older client", () => {
  const old = () => documentExtensions("f").filter((x) => !["pageBreak", "tableOfContents", "footnoteRef", "footnote", "doc", "docStructure", "docPages"].includes(x.name));
  it("does not rewrite a document that has page breaks and footnotes: it does not open it", () => {
    const doc = new Y.Doc();
    const now = make(doc);
    now.e.commands.setContent("<p>Body text</p>");
    now.e.commands.setTextSelection(5);
    now.e.commands.insertFootnote("old00001");
    now.e.commands.insertPageBreak();
    const before = doc.getXmlFragment("default").toString();
    expect(before).toMatch(/footnote/i);
    expect(before).toMatch(/pagebreak/i);
    const was = console.error;
    console.error = () => undefined;
    let stale: Editor | null = null;
    try {
      stale = new Editor({ extensions: [...old(), Collaboration.configure({ document: doc, field: "default" })] });
      stale.commands.insertContentAt(1, "more ");
    } catch {
      // Not opening is the failure that is allowed.
    } finally {
      console.error = was;
    }
    const after = doc.getXmlFragment("default").toString();
    expect(after).toMatch(/footnote/i);
    expect(after).toMatch(/pagebreak/i);
    expect(after).toContain("Body");
    stale?.destroy();
    now.e.destroy();
  });
});

describe("find whole word", () => {
  it("matches words, not parts of words", () => {
    const { e } = make();
    e.commands.setContent("<p>The fee is a fee, fees and feeding; fee_x and fee.</p>");
    const all = findMatches(e.state.doc, "fee", false);
    const whole = findMatches(e.state.doc, "fee", false, 1001, true);
    expect(all.length).toBe(6);
    expect(whole.length).toBe(3);
    e.destroy();
  });
});
