import { getSchema } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import { describe, expect, it } from "vitest";
import { MAX_MATCHES, findKey, findMatches, findPlugin, replaceAll, replaceOne, setFind } from "./find";
import { documentExtensions } from "./schema";

const schema = getSchema(documentExtensions("file"));
const bold = schema.marks.bold!.create();
const text = (t: string, marked = false) => schema.text(t, marked ? [bold] : []);
const mention = (label: string) => schema.node("mention", { kind: "person", id: "u1", entity: null }, [schema.text(label)]);
const para = (...content: PMNode[]) => schema.node("paragraph", null, content);
const doc = (...blocks: PMNode[]) => schema.node("doc", null, blocks);

/** The words a match covers. */
const covered = (d: PMNode, query: string, matchCase = false) => findMatches(d, query, matchCase).map((m) => d.textBetween(m.from, m.to));

describe("finding words", () => {
  const d = doc(para(text("The cat sat. The Cat ran.")), para(text("A "), text("cat", true), text("nap")));

  it("ignores case unless asked, and finds a word across its marks", () => {
    expect(covered(d, "cat")).toEqual(["cat", "Cat", "cat"]);
    expect(covered(d, "cat", true)).toEqual(["cat", "cat"]);
    expect(covered(d, "catn")).toEqual(["catn"]);
    expect(findMatches(d, "", false)).toEqual([]);
    expect(covered(d, "the c")).toEqual(["The c", "The C"]);
  });

  it("takes what is typed as words, not as a pattern", () => {
    const odd = doc(para(text("Cost (est.) is 5+5 [maybe] a.b $x")));
    expect(covered(odd, "(est.)")).toEqual(["(est.)"]);
    expect(covered(odd, "5+5")).toEqual(["5+5"]);
    expect(covered(odd, "[maybe]")).toEqual(["[maybe]"]);
    expect(covered(odd, "a.b")).toEqual(["a.b"]);
    expect(covered(odd, ".")).toEqual([".", "."]);
    expect(covered(odd, "\\")).toEqual([]);
    expect(covered(odd, "$x")).toEqual(["$x"]);
  });

  it("does not find words suggested for removal: they are struck out", () => {
    const struck = schema.marks.deletion!.create({ id: "s1", user: "u1", name: "Ana", at: null });
    const d2 = doc(para(text("keep "), schema.text("drop", [struck]), text(" keep")));
    expect(covered(d2, "keep")).toEqual(["keep", "keep"]);
    expect(covered(d2, "drop")).toEqual([]);
    expect(covered(d2, "keep drop")).toEqual([]);
  });

  it("does not look inside a mention, nor match across one", () => {
    const m = doc(para(text("Ask "), mention("@Ben Cole"), text(" Ben")));
    expect(covered(m, "ben")).toEqual(["Ben"]);
    expect(covered(m, "ask ben")).toEqual([]);
  });

  it("finds words in lists, quotes and table cells", () => {
    const nested = doc(
      schema.node("bulletList", null, [schema.node("listItem", null, [para(text("alpha beta"))])]),
      schema.node("blockquote", null, [para(text("beta gamma"))]),
      schema.node("table", null, [schema.node("tableRow", null, [schema.node("tableCell", null, [para(text("beta"))])])]),
    );
    expect(covered(nested, "beta")).toHaveLength(3);
  });

  it("keeps to the limit", () => {
    const many = doc(para(text("a ".repeat(MAX_MATCHES + 50))));
    expect(findMatches(many, "a", false)).toHaveLength(MAX_MATCHES + 1);
    expect(findMatches(many, "a", false, Infinity)).toHaveLength(MAX_MATCHES + 50);
  });
});

describe("the find plugin", () => {
  function start(d: PMNode) {
    let state = EditorState.create({ schema, doc: d, plugins: [findPlugin()] });
    return {
      get state() {
        return state;
      },
      do: (tr: ReturnType<typeof setFind>) => (state = state.apply(tr)),
      find: (query: string, matchCase = false) => (state = state.apply(setFind(state, { query, matchCase }))),
      get now() {
        return findKey.getState(state)!;
      },
    };
  }
  const d = doc(para(text("one two one two one")));

  it("marks every match and the one in view, from the caret on", () => {
    const f = start(d);
    f.do(f.state.tr.setSelection(TextSelection.create(f.state.doc, 6)));
    f.find("one");
    expect(f.now.matches).toHaveLength(3);
    expect(f.now.current).toBe(1);
    expect(f.now.decos.find().length).toBe(3);
    expect(f.now.more).toBe(false);
  });

  it("moves round the matches, and says none when there are none", () => {
    const f = start(d);
    f.find("two");
    expect(f.now.current).toBe(0);
    f.do(setFind(f.state, { current: f.now.current + 1 }));
    expect(f.now.current).toBe(1);
    f.do(setFind(f.state, { current: f.now.current + 1 }));
    expect(f.now.current).toBe(0);
    f.do(setFind(f.state, { current: -1 }));
    expect(f.now.current).toBe(1);
    f.find("nothing");
    expect([f.now.matches.length, f.now.current]).toEqual([0, -1]);
  });

  it("follows the typing: matches are found again and the bar keeps its place", () => {
    const f = start(d);
    f.find("one");
    f.do(setFind(f.state, { current: 1 }));
    // Someone types at the start: every place moves by the same amount.
    f.do(f.state.tr.insertText("zero ", 1));
    expect(f.now.matches.map((m) => m.from)).toEqual([6, 14, 22]);
    expect(f.now.current).toBe(1);
    // Someone adds a match before the one in view.
    f.do(f.state.tr.insertText("one ", 1));
    expect(f.now.matches).toHaveLength(4);
    expect(f.now.current).toBe(2);
  });

  it("replaces the match in view, keeping its look, and the next takes its place", () => {
    const f = start(doc(para(text("red "), text("fox", true), text(" and red hen"))));
    f.find("red");
    f.do(replaceOne(f.state, "blue")!);
    expect(f.state.doc.textContent).toBe("blue fox and red hen");
    expect(f.now.matches).toHaveLength(1);
    f.do(replaceOne(f.state, "")!);
    expect(f.state.doc.textContent).toBe("blue fox and  hen");
    expect(replaceOne(f.state, "x")).toBeNull();
    // Bold stays bold when a marked word is replaced.
    f.find("fox");
    f.do(replaceOne(f.state, "cat")!);
    expect(f.state.doc.textContent).toBe("blue cat and  hen");
    const cat = f.state.doc.firstChild!.child(1);
    expect([cat.text, cat.marks.map((m) => m.type.name)]).toEqual(["cat", ["bold"]]);
  });

  it("replaces every match at once, as one change, even past the marked ones", () => {
    const f = start(doc(para(text("a b a b a")), para(text("A"))));
    f.find("a");
    const before = f.state.doc;
    f.do(replaceAll(f.state, "xx")!);
    expect(f.state.doc.textContent).toBe("xx b xx b xxxx");
    expect(f.now.matches).toHaveLength(0);
    expect(before.textContent).toBe("a b a b aA");
    const big = start(doc(para(text("a ".repeat(MAX_MATCHES + 50)))));
    big.find("a");
    expect(big.now.more).toBe(true);
    big.do(replaceAll(big.state, "b")!);
    expect(big.state.doc.textContent).toBe("b ".repeat(MAX_MATCHES + 50));
  });
});
