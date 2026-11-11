// @vitest-environment jsdom
import { Editor, getSchema } from "@tiptap/core";
import { Fragment, type Node as PMNode } from "@tiptap/pm/model";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import { StarterKit } from "@tiptap/starter-kit";
import { afterAll, describe, expect, it } from "vitest";
import { Mention } from "./mention";
import { documentExtensions } from "./schema";
import { BACKWARD, suggestKey as suggestKeyForTest, Deletion, FormatChange, Insertion, type Refusal, SuggestionAttrs, Suggestions, setSuggesting, settle, settled, suggestPlugin, suggestionsIn, verifySuggestions } from "./suggest";

const schema = getSchema([StarterKit, Insertion, Deletion, FormatChange, SuggestionAttrs]);
const ana = { id: "u-ana", name: "Ana Rao" };
const ben = { id: "u-ben", name: "Ben Ito" };

/** A one-paragraph document, suggesting as Ana, the caret at `caret`. */
function start(text: string, caret = 1) {
  let refused = 0;
  const doc = schema.node("doc", null, [schema.node("paragraph", null, text ? [schema.text(text)] : [])]);
  let state = EditorState.create({ schema, doc, plugins: [suggestPlugin(() => refused++)] });
  state = state.apply(setSuggesting(state, true, ana));
  state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, caret)));
  return { state, refused: () => refused };
}

/** The words, `[+added]`, `[-removed]`, `[~reformatted]`, and `¶` / `¶+` / `¶-` between paragraphs. */
function shown(doc: PMNode): string {
  let out = "";
  let first = true;
  doc.descendants((n) => {
    if (n.isTextblock) {
      if (!first) out += n.attrs.split ? "¶+" : n.attrs.join ? "¶-" : "¶";
      first = false;
    }
    if (!n.isText) return;
    const kind = n.marks.find((m) => m.type.name === "insertion") ? "+" : n.marks.find((m) => m.type.name === "deletion") ? "-" : n.marks.find((m) => m.type.name === "formatChange") ? "~" : "";
    out += kind ? `[${kind}${n.text}]` : n.text;
  });
  return out;
}

describe("suggestions", () => {
  it("marks what is typed as proposed, signed and grown as one", () => {
    let { state } = start("Ship Friday", 6);
    for (const ch of "on ") state = state.apply(state.tr.insertText(ch));
    expect(shown(state.doc)).toBe("Ship [+on ]Friday");
    const [s] = suggestionsIn(state.doc);
    expect(s).toMatchObject({ user: "u-ana", name: "Ana Rao", inserted: "on ", deleted: "", formats: [] });
    expect(suggestionsIn(state.doc)).toHaveLength(1);
  });

  it("strikes what Backspace or Delete would remove, the caret moving on", () => {
    let { state } = start("Ship on Friday", 8);
    state = state.apply(state.tr.delete(7, 8).setMeta(BACKWARD, true));
    state = state.apply(state.tr.delete(state.selection.from - 1, state.selection.from).setMeta(BACKWARD, true));
    expect(shown(state.doc)).toBe("Ship [-on] Friday");
    expect(state.selection.from).toBe(6);
    expect(suggestionsIn(state.doc)).toHaveLength(1);
    ({ state } = start("Ship on Friday", 9));
    state = state.apply(state.tr.delete(9, 10));
    expect(shown(state.doc)).toBe("Ship on [-F]riday");
    expect(state.selection.from).toBe(10);
  });

  it("turns typing over selected words into one replacement", () => {
    let { state } = start("Ship on Friday", 9);
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 9, 15)));
    state = state.apply(state.tr.insertText("Thursday"));
    expect(shown(state.doc)).toBe("Ship on [-Friday][+Thursday]");
    const [s] = suggestionsIn(state.doc);
    expect(s).toMatchObject({ deleted: "Friday", inserted: "Thursday" });
  });

  it("takes away your own proposal for good when you delete it", () => {
    let { state } = start("Ship", 5);
    state = state.apply(state.tr.insertText(" now"));
    state = state.apply(state.tr.delete(5, 9));
    expect(shown(state.doc)).toBe("Ship");
    expect(suggestionsIn(state.doc)).toEqual([]);
  });

  it("proposes formatting, showing what changed, and rejecting gives the old look back", () => {
    let { state } = start("Ship on Friday", 1);
    state = state.apply(state.tr.addMark(1, 5, schema.marks.bold!.create()));
    expect(shown(state.doc)).toBe("[~Ship] on Friday");
    const [s] = suggestionsIn(state.doc);
    expect(s).toMatchObject({ formats: ["bold"], inserted: "", deleted: "" });
    expect(state.doc.firstChild!.firstChild!.marks.some((m) => m.type.name === "bold")).toBe(true);
    const rejected = state.apply(settle(state, s!.id, false)).doc;
    expect(rejected.eq(start("Ship on Friday").state.doc)).toBe(true);
    const accepted = state.apply(settle(state, s!.id, true)).doc;
    expect(shown(accepted)).toBe("Ship on Friday");
    expect(accepted.firstChild!.firstChild!.marks.map((m) => m.type.name)).toEqual(["bold"]);
    // Taking the bold away again leaves nothing proposed.
    state = state.apply(state.tr.removeMark(1, 5, schema.marks.bold!));
    expect(suggestionsIn(state.doc)).toEqual([]);
  });

  it("proposes a new paragraph, and rejecting it joins the two again", () => {
    let { state } = start("Ship on Friday", 5);
    state = state.apply(state.tr.split(5));
    expect(shown(state.doc)).toBe("Ship¶+ on Friday");
    expect(suggestionsIn(state.doc)[0]).toMatchObject({ inserted: "¶" });
    const [s] = suggestionsIn(state.doc);
    expect(state.apply(settle(state, s!.id, false)).doc.eq(start("Ship on Friday").state.doc)).toBe(true);
    expect(shown(state.apply(settle(state, s!.id, true)).doc)).toBe("Ship¶ on Friday");
  });

  it("proposes joining two paragraphs, keeping them apart until accepted", () => {
    const doc = schema.node("doc", null, [schema.node("paragraph", null, [schema.text("One")]), schema.node("paragraph", null, [schema.text("Two")])]);
    let state = EditorState.create({ schema, doc, plugins: [suggestPlugin(() => undefined)] });
    state = state.apply(setSuggesting(state, true, ana));
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 6)));
    state = state.apply(state.tr.delete(4, 6));
    expect(shown(state.doc)).toBe("One¶-Two");
    // The caret goes to the end of the first paragraph, as the join went backward.
    expect(state.selection.from).toBe(4);
    const [s] = suggestionsIn(state.doc);
    expect(s).toMatchObject({ deleted: "¶" });
    expect(state.apply(settle(state, s!.id, false)).doc.eq(doc)).toBe(true);
    expect(shown(state.apply(settle(state, s!.id, true)).doc)).toBe("OneTwo");
  });

  it("refuses to add or take away a mention: it is one unit, not words", async () => {
    const withMentions = getSchema([StarterKit, Insertion, Deletion, FormatChange, SuggestionAttrs, Mention]);
    const mention = withMentions.node("mention", { kind: "person", id: "u1", entity: null }, [withMentions.text("@Ben")]);
    const doc = withMentions.node("doc", null, [withMentions.node("paragraph", null, [withMentions.text("Hi "), mention, withMentions.text(" there")])]);
    const refused: Refusal[] = [];
    let state = EditorState.create({ schema: withMentions, doc, plugins: [suggestPlugin((w) => refused.push(w))] });
    state = state.apply(setSuggesting(state, true, ana));
    expect(state.apply(state.tr.delete(4, 10)).doc.eq(doc)).toBe(true);
    expect(state.apply(state.tr.insert(1, mention)).doc.eq(doc)).toBe(true);
    await Promise.resolve();
    expect(refused).toEqual(["block", "block"]);
  });

  it("refuses cleanly when another plugin changed the document in the same round", async () => {
    const withMentions = getSchema([StarterKit, Insertion, Deletion, FormatChange, SuggestionAttrs, Mention]);
    const { Plugin } = await import("@tiptap/pm/state");
    // Like pages.ts keeping a paragraph at the end: it adds one after any change, marked as not a suggestion.
    const tidy = new Plugin({
      appendTransaction: (trs, _b, state) => (trs.some((t) => t.docChanged && !t.getMeta("tidy")) ? state.tr.insert(state.doc.content.size, withMentions.node("paragraph")).setMeta("tidy", true).setMeta(suggestKeyForTest, { applied: true }) : null),
    });
    const doc = withMentions.node("doc", null, [withMentions.node("paragraph", null, [withMentions.text("Hi there")])]);
    const refused: Refusal[] = [];
    let state = EditorState.create({ schema: withMentions, doc, plugins: [tidy, suggestPlugin((w) => refused.push(w))] });
    state = state.apply(setSuggesting(state, true, ana));
    const mention = withMentions.node("mention", { kind: "person", id: "u1", entity: null }, [withMentions.text("@Ben")]);
    const after = state.apply(state.tr.insert(4, mention));
    await Promise.resolve();
    expect(refused).toEqual(["block"]);
    expect(after.doc.firstChild!.eq(doc.firstChild!)).toBe(true);
    // What the other plugin added stays (this naive one adds a paragraph after the refusal too).
    expect(after.doc.childCount).toBeGreaterThan(1);
  });

  it("is accepted or rejected as a whole", () => {
    let { state } = start("Ship on Friday", 9);
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 9, 15)));
    state = state.apply(state.tr.insertText("Thursday"));
    const [s] = suggestionsIn(state.doc);
    expect(shown(state.apply(settle(state, s!.id, true)).doc)).toBe("Ship on Thursday");
    expect(shown(state.apply(settle(state, s!.id, false)).doc)).toBe("Ship on Friday");
    expect(suggestionsIn(state.apply(settle(state, s!.id, true)).doc)).toEqual([]);
  });

  it("leaves typing alone when Suggesting is off", () => {
    let { state } = start("Ship", 5);
    state = state.apply(setSuggesting(state, false, ana));
    state = state.apply(state.tr.insertText(" now"));
    expect(shown(state.doc)).toBe("Ship now");
  });

  it("does not let a paragraph split off another keep the other's proposed boundary", () => {
    let { state } = start("Ship on Friday", 5);
    state = state.apply(state.tr.split(5));
    state = state.apply(setSuggesting(state, false, ana));
    // Splitting the proposed paragraph in its middle, with Suggesting off.
    state = state.apply(state.tr.split(state.doc.firstChild!.nodeSize + 4));
    expect(shown(state.doc)).toBe("Ship¶+ on¶ Friday");
  });
});

// ── the invariant, over random edits ──

/** A small seeded random source, so a failing case can be run again. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

const WORDS = ["alpha", "beta", "gamma", "delta", "ship", "on", "friday", "the", "plan"];

/** A random document of paragraphs with marks, headings, lists and a table. */
function randomDoc(r: () => number) {
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)]!;
  const runs = () => {
    const out: Record<string, unknown>[] = [];
    const n = 1 + Math.floor(r() * 3);
    for (let i = 0; i < n; i++) {
      const marks = [];
      if (r() < 0.3) marks.push({ type: "bold" });
      if (r() < 0.2) marks.push({ type: "italic" });
      if (r() < 0.2) marks.push({ type: "textStyle", attrs: { color: pick(["#c0392b", "#1f6feb"]) } });
      out.push({ type: "text", text: `${pick(WORDS)} ${pick(WORDS)} `, ...(marks.length ? { marks } : {}) });
    }
    return out;
  };
  const para = () => ({ type: "paragraph", attrs: r() < 0.2 ? { textAlign: "center" } : {}, content: runs() });
  const blocks: Record<string, unknown>[] = [];
  const n = 2 + Math.floor(r() * 4);
  for (let i = 0; i < n; i++) {
    const k = r();
    if (k < 0.45) blocks.push(para());
    else if (k < 0.6) blocks.push({ type: "heading", attrs: { level: 1 + Math.floor(r() * 3) }, content: runs() });
    else if (k < 0.85) blocks.push({ type: r() < 0.5 ? "bulletList" : "orderedList", content: Array.from({ length: 1 + Math.floor(r() * 3) }, () => ({ type: "listItem", content: [para()] })) });
    else blocks.push({ type: "table", content: [0, 1].map(() => ({ type: "tableRow", content: [0, 1].map(() => ({ type: "tableCell", content: [para()] })) })) });
  }
  blocks.push(para());
  return { type: "doc", content: blocks };
}

/** Text positions of the document: where a caret can be. */
function textPositions(doc: PMNode): number[] {
  const out: number[] = [];
  doc.descendants((n, pos) => {
    if (n.isTextblock) for (let i = 0; i <= n.content.size; i++) out.push(pos + 1 + i);
    return !n.isTextblock;
  });
  return out;
}
function blockStarts(doc: PMNode): number[] {
  const out: number[] = [];
  doc.descendants((n, pos) => {
    if (n.isTextblock) out.push(pos + 1);
    return !n.isTextblock;
  });
  return out;
}

type Edit = { kind: string; run: (e: Editor) => void };

/** A random edit, its choices made now so that it does the same to two copies of one document. */
function randomEdit(r: () => number, doc: PMNode): Edit {
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)]!;
  const positions = textPositions(doc);
  const at = pick(positions);
  const other = pick(positions);
  const [a, b] = [Math.min(at, other), Math.max(at, other)];
  const $at = doc.resolve(at);
  const inBlock = [$at.start(), $at.end()];
  const x = inBlock[0]! + Math.floor(r() * (inBlock[1]! - inBlock[0]! + 1));
  const [p, q] = [Math.min(at, x), Math.max(at, x)];
  const word = pick(WORDS);
  const size = pick([14, 18, 11]);
  const colour = pick(["#2e7d32", null]);
  const align = pick(["left", "center", "right"]);
  const line = pick([1.5, 2, null]);
  const level = pick([1, 2, 3]) as 1;
  const startAt = pick(blockStarts(doc));
  const caret = (e: Editor, from: number, to = from) => e.commands.setTextSelection({ from, to });
  const kinds: Edit[] = [
    { kind: "type", run: (e) => (caret(e, at), e.commands.insertContent(word)) },
    { kind: "delete words", run: (e) => p < q && e.view.dispatch(e.state.tr.delete(p, q)) },
    { kind: "delete across", run: (e) => a < b && (caret(e, a, b), e.commands.keyboardShortcut("Backspace")) },
    { kind: "type over across", run: (e) => a < b && (caret(e, a, b), e.view.dispatch(e.state.tr.insertText(word, a, b))) },
    { kind: "enter", run: (e) => (caret(e, at), e.commands.keyboardShortcut("Enter")) },
    { kind: "backspace at start", run: (e) => (caret(e, startAt), e.commands.keyboardShortcut("Backspace")) },
    { kind: "delete at end", run: (e) => (caret(e, $at.end()), e.commands.keyboardShortcut("Delete")) },
    { kind: "bold", run: (e) => p < q && (caret(e, p, q), e.commands.toggleBold()) },
    { kind: "colour", run: (e) => p < q && (caret(e, p, q), e.commands.setTextColor(colour)) },
    { kind: "size", run: (e) => p < q && (caret(e, p, q), e.commands.setFontSize(size)) },
    { kind: "align", run: (e) => (caret(e, at), e.commands.setTextAlign(align)) },
    { kind: "spacing", run: (e) => (caret(e, at), e.commands.setLineHeight(line)) },
    { kind: "heading", run: (e) => (caret(e, at), e.commands.setHeading({ level })) },
    { kind: "text style", run: (e) => (caret(e, at), e.commands.setParagraph()) },
    { kind: "list type", run: (e) => (caret(e, at), e.isActive("bulletList") ? e.commands.toggleOrderedList() : e.isActive("orderedList") ? e.commands.toggleBulletList() : undefined) },
    { kind: "paste paragraphs", run: (e) => (caret(e, at), e.commands.insertContent(`<p>${word} one</p><p>two ${word}</p>`)) },
    { kind: "table row", run: (e) => (caret(e, at), e.isActive("table") && e.commands.addRowAfter()) },
  ];
  return pick(kinds);
}

/** One editor per person over the document, with Suggesting on or off. */
function editorOn(doc: PMNode, on: boolean, me = ana) {
  const refused: Refusal[] = [];
  const e = new Editor({ extensions: [...documentExtensions("f"), Suggestions.configure({ onRefused: (w) => refused.push(w) })], content: doc.toJSON() });
  e.view.dispatch(setSuggesting(e.state, on, me));
  return { e, refused };
}
const load = (e: Editor, doc: PMNode, me = ana, on = true) => {
  e.view.updateState(EditorState.create({ doc: e.schema.nodeFromJSON(doc.toJSON()), plugins: e.state.plugins }));
  e.view.dispatch(setSuggesting(e.state, on, me));
};

const CASES = 160;
const EDITS = 8;

/** The document as the editor keeps it, compared without an empty paragraph at its end: pages.ts adds one
 *  (not a suggestion) whenever the text would end in something else. */
function norm(doc: PMNode): PMNode {
  const blocks: PMNode[] = [];
  doc.forEach((n) => blocks.push(n));
  while (blocks.length > 1 && blocks.at(-1)!.type.name === "paragraph" && blocks.at(-1)!.content.size === 0) blocks.pop();
  if (blocks.at(-1)?.type.name !== "paragraph") blocks.push(doc.type.schema.nodes.paragraph!.create());
  return doc.copy(Fragment.from(blocks));
}

const settledN = (d: PMNode, accept: boolean, pick?: (w: { user: string }) => boolean) => norm(settled(d, accept, pick));

/** Runs `CASES` random sequences; returns how many edits of each kind were proposed and refused. */
async function run(verify: boolean) {
  verifySuggestions(verify);
  const tally: Record<string, { proposed: number; refused: number }> = {};
  const base = editorOn(schema.node("doc", null, [schema.node("paragraph")]), true);
  const plain = editorOn(schema.node("doc", null, [schema.node("paragraph")]), false);
  const sch = base.e.schema;
  for (let c = 0; c < CASES; c++) {
    const r = rng(1000 + c);
    const d0 = sch.nodeFromJSON(randomDoc(r));
    let doc = d0;
    for (let k = 0; k < EDITS; k++) {
      const me = r() < 0.5 ? ana : ben;
      const edit = randomEdit(r, doc);
      load(base.e, doc, me, true);
      load(plain.e, doc, me, false);
      base.refused.length = 0;
      // A TipTap command that throws on its own (setHeading's clearNodes can, on a table) changes neither copy.
      try {
        edit.run(base.e);
        edit.run(plain.e);
      } catch {
        load(base.e, doc, me, true);
        continue;
      }
      await Promise.resolve();
      const t = (tally[edit.kind] ??= { proposed: 0, refused: 0 });
      const next = base.e.state.doc;
      if (base.refused.length) {
        t.refused++;
        expect(next.eq(doc), `case ${c} edit ${k} (${edit.kind}): a refused change leaves the document`).toBe(true);
        continue;
      }
      if (!next.eq(doc)) t.proposed++;
      // Rejecting everything gives back the document before any suggestion; accepting everything, what the
      // same change makes with Suggesting off.
      expect(settledN(next, false).eq(norm(d0)), `case ${c} edit ${k} (${edit.kind}): reject all`).toBe(true);
      const made = sch.nodeFromJSON(plain.e.state.doc.toJSON());
      expect(settledN(next, true).eq(settledN(made, true)), `case ${c} edit ${k} (${edit.kind}): accept all`).toBe(true);
      // Settling one person's, then the other's, is the same as settling everyone's.
      const byAna = (w: { user: string }) => w.user === ana.id;
      const byBen = (w: { user: string }) => w.user === ben.id;
      expect(settledN(settled(next, true, byAna), true, byBen).eq(settledN(next, true)), `case ${c} edit ${k}: accept by person`).toBe(true);
      expect(settledN(settled(next, false, byBen), false, byAna).eq(norm(d0)), `case ${c} edit ${k}: reject by person`).toBe(true);
      doc = next;
    }
  }
  base.e.destroy();
  plain.e.destroy();
  verifySuggestions(true);
  return tally;
}

describe("the suggestion invariant, over random edits", () => {
  afterAll(() => verifySuggestions(true));
  const results: Record<string, Record<string, { proposed: number; refused: number }>> = {};

  it(`holds without the live check: ${CASES} documents, ${EDITS} edits each, by two people`, async () => {
    const tally = await run(false);
    results.off = tally;
    // Words, paragraphs and formatting are proposed, never refused; table structure is refused.
    for (const kind of ["type", "delete words", "bold", "colour", "size", "align", "spacing", "list type"]) {
      expect(tally[kind]?.refused ?? 0, kind).toBe(0);
      expect(tally[kind]?.proposed ?? 0, kind).toBeGreaterThan(0);
    }
    expect(tally["table row"]?.proposed ?? 0).toBe(0);
    // Across paragraphs: proposed when what is removed starts and ends at the same depth, refused otherwise; a
    // heading or text style in a list or table takes the paragraph out of it first (refused).
    for (const kind of ["delete across", "type over across", "enter", "backspace at start", "delete at end", "heading", "text style", "paste paragraphs"]) expect(tally[kind]?.proposed ?? 0, kind).toBeGreaterThan(0);
    console.info("suggestions, without the check:", JSON.stringify(tally));
  }, 120_000);

  it("holds with the live check, which refuses nothing the rules handle", async () => {
    const tally = await run(true);
    for (const [kind, n] of Object.entries(results.off ?? {})) expect(tally[kind]?.refused, kind).toBe(n.refused);
  }, 120_000);
});

describe("two people suggesting at once", () => {
  it("merge without either's proposals spoiling the other's", async () => {
    const { Collaboration } = await import("@tiptap/extension-collaboration");
    const Y = await import("yjs");
    const docs = [new Y.Doc(), new Y.Doc()];
    // Every change of one reaches the other, as the server relays it.
    docs.forEach((d, i) => d.on("update", (u: Uint8Array, origin: unknown) => origin !== "peer" && Y.applyUpdate(docs[1 - i]!, u, "peer")));
    const make = (d: InstanceType<typeof Y.Doc>, me: typeof ana) => {
      const e = new Editor({ extensions: [...documentExtensions("f"), Suggestions, Collaboration.configure({ document: d, field: "default" })] });
      return { e, me };
    };
    const [a, b] = [make(docs[0]!, ana), make(docs[1]!, ben)];
    a.e.commands.setContent("<p>Ship on Friday</p><p>Pay the invoice</p><ul><li><p>one</p></li><li><p>two</p></li></ul>");
    const tick = () => new Promise((r) => setTimeout(r, 10));
    await tick();
    const original = a.e.state.doc;
    expect(b.e.state.doc.toJSON()).toEqual(original.toJSON());
    for (const p of [a, b]) p.e.view.dispatch(setSuggesting(p.e.state, true, p.me));
    // Ana splits the first paragraph and bolds a word of the list; Ben retypes a word of the second paragraph.
    a.e.commands.setTextSelection(5);
    a.e.commands.keyboardShortcut("Enter");
    b.e.commands.setTextSelection({ from: 22, to: 25 });
    b.e.commands.insertContent("bill");
    a.e.commands.setTextSelection({ from: a.e.state.doc.content.size - 12, to: a.e.state.doc.content.size - 9 });
    a.e.commands.toggleBold();
    await tick();
    expect(a.e.state.doc.toJSON()).toEqual(b.e.state.doc.toJSON());
    const people = new Set(suggestionsIn(a.e.state.doc).map((s) => s.user));
    expect(people).toEqual(new Set([ana.id, ben.id]));
    // Rejecting Ben's leaves Ana's; rejecting everything gives the document back.
    const onlyAna = settled(a.e.state.doc, false, (w) => w.user === ben.id);
    expect(suggestionsIn(onlyAna).every((s) => s.user === ana.id) && suggestionsIn(onlyAna).length > 0).toBe(true);
    expect(settled(a.e.state.doc, false).eq(original)).toBe(true);
    a.e.destroy();
    b.e.destroy();
    await tick();
  });
});
