import { getSchema } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { EditorState, TextSelection, type Transaction } from "@tiptap/pm/state";
import { describe, expect, it } from "vitest";
import { type MenuHooks, findTrigger, menuKey, menuPlugin, textBefore } from "./menus";
import { documentExtensions } from "./schema";

const schema = getSchema(documentExtensions("file"));
const mention = (label: string) => schema.node("mention", { kind: "person", id: "u1", entity: null }, [schema.text(label)]);
const doc = (...content: PMNode[]) => schema.node("doc", null, [schema.node("paragraph", null, content)]);
const text = (t: string) => schema.text(t);

/** The trigger with the caret at the end of the paragraph. */
const triggerIn = (d: PMNode) => findTrigger(d.resolve(d.content.size - 1));

describe("the menu trigger", () => {
  it("opens on a slash or an @ that starts a word, and says what was typed after it", () => {
    expect(triggerIn(doc(text("/")))).toEqual({ char: "/", from: 1, to: 2, query: "" });
    expect(triggerIn(doc(text("/head")))).toEqual({ char: "/", from: 1, to: 6, query: "head" });
    expect(triggerIn(doc(text("Next: /heading 1")))).toMatchObject({ char: "/", from: 7, query: "heading 1" });
    expect(triggerIn(doc(text("Ask @Ben Co")))).toMatchObject({ char: "@", from: 5, to: 12, query: "Ben Co" });
    expect(triggerIn(doc(text("(@Ana")))).toMatchObject({ char: "@", query: "Ana" });
  });

  it("leaves words that merely hold a slash or an @ alone", () => {
    for (const t of ["and/or", "1/2 cup", "write to ana@acme.test", "a / b", "see @ noon", "http://x.test/a", "Hello"]) {
      expect(triggerIn(doc(text(t))), t).toBeNull();
    }
  });

  it("closes once what was typed is more than a search", () => {
    expect(triggerIn(doc(text(`/${"x".repeat(29)}`)))).not.toBeNull();
    expect(triggerIn(doc(text(`/${"x".repeat(30)}`)))).toBeNull();
    expect(triggerIn(doc(text("/path/to")))).toBeNull();
  });

  it("does not take a finished mention for a new one", () => {
    // "hi @Ben" with the caret after the mention: the label is not typing.
    expect(textBefore(doc(text("hi "), mention("@Ben")).resolve(1 + 3 + 6))).toBe("hi ￼");
    expect(triggerIn(doc(text("hi "), mention("@Ben")))).toBeNull();
    expect(triggerIn(doc(text("hi "), mention("@Ben"), text(" /ta")))).toMatchObject({ char: "/", query: "ta" });
    expect(triggerIn(doc(mention("@Ben"), text("/")))).toMatchObject({ char: "/", query: "" });
  });

  it("stays out of code", () => {
    const code = schema.node("doc", null, [schema.node("codeBlock", null, [text("/head")])]);
    expect(triggerIn(code)).toBeNull();
    const inline = schema.node("doc", null, [schema.node("paragraph", null, [schema.text("/head", [schema.marks.code!.create()])])]);
    expect(triggerIn(inline)).toBeNull();
  });
});

describe("the menu plugin", () => {
  function setup(hooks: Partial<MenuHooks> = {}, initial = "") {
    const all: MenuHooks = { enabled: () => true, count: () => 3, choose: () => undefined, listId: "m", ...hooks };
    const d = doc(...(initial ? [text(initial)] : []));
    let state = EditorState.create({ schema, doc: d, plugins: [menuPlugin(() => all)] });
    state = state.apply(state.tr.setSelection(TextSelection.atEnd(state.doc)));
    const plugin = state.plugins[0]!;
    const view = {
      get state() {
        return state;
      },
      dispatch: (tr: Transaction) => {
        state = state.apply(tr);
      },
    };
    const press = (key: string) =>
      plugin.props.handleKeyDown!.call(plugin, view as never, { key, isComposing: false, ctrlKey: false, metaKey: false, altKey: false } as KeyboardEvent);
    return { get state() { return state; }, type: (t: string) => (state = state.apply(state.tr.insertText(t))), press, plugin };
  }
  const now = (s: { state: EditorState }) => menuKey.getState(s.state)!;

  it("opens while a trigger is typed and closes when it is not", () => {
    const m = setup();
    m.type("Go ");
    expect(now(m).trigger).toBeNull();
    m.type("/ta");
    expect(now(m).trigger).toMatchObject({ char: "/", query: "ta" });
    m.type("b");
    expect(now(m).trigger?.query).toBe("tab");
    m.type(" 5 6 7 /x");
    expect(now(m).trigger?.query).toBe("x");
    m.type(" y");
    expect(now(m).trigger?.query).toBe("x y");
  });

  it("moves with the arrow keys, round the list, and picks with Enter or Tab", () => {
    const chosen: number[] = [];
    const m = setup({ choose: (i) => chosen.push(i) });
    m.type("/");
    expect(m.press("ArrowDown")).toBe(true);
    expect(now(m).index).toBe(1);
    m.press("ArrowDown");
    m.press("ArrowDown");
    expect(now(m).index).toBe(0);
    m.press("ArrowUp");
    expect(now(m).index).toBe(2);
    expect(m.press("Enter")).toBe(true);
    expect(m.press("Tab")).toBe(true);
    expect(chosen).toEqual([2, 2]);
    // Typing on starts again from the top.
    m.type("t");
    expect(now(m).index).toBe(0);
  });

  it("leaves the keys to the editor when there is nothing to choose", () => {
    const m = setup({ count: () => 0 });
    m.type("/zzz");
    expect(m.press("Enter")).toBe(false);
    expect(m.press("ArrowDown")).toBe(false);
    const closed = setup();
    closed.type("plain");
    expect(closed.press("Enter")).toBe(false);
  });

  it("stays closed after Escape, until the trigger is typed again", () => {
    const m = setup();
    m.type("/ta");
    expect(m.press("Escape")).toBe(true);
    expect(now(m).trigger).toBeNull();
    m.type("b");
    expect(now(m).trigger).toBeNull();
    m.type(" ");
    m.type("/");
    expect(now(m).trigger).toMatchObject({ query: "" });
  });

  it("never opens where the text does not take typing", () => {
    const m = setup({ enabled: () => false });
    m.type("/ta");
    expect(now(m).trigger).toBeNull();
  });

  it("tells the editor which choice is in view", () => {
    const m = setup({ listId: "menu-7" });
    m.type("/");
    m.press("ArrowDown");
    const attrs = (m.plugin.props.attributes as (s: EditorState) => Record<string, string>)(m.state);
    expect(attrs).toMatchObject({ "aria-expanded": "true", "aria-controls": "menu-7", "aria-activedescendant": "menu-7-1" });
    const closed = setup();
    expect((closed.plugin.props.attributes as (s: EditorState) => Record<string, string>)(closed.state)).toEqual({});
  });
});
