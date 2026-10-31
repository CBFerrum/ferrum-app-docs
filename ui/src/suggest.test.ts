import { getSchema } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import { StarterKit } from "@tiptap/starter-kit";
import { describe, expect, it } from "vitest";
import { BACKWARD, Deletion, Insertion, setSuggesting, settle, suggestPlugin, suggestionsIn } from "./suggest";

const schema = getSchema([StarterKit, Insertion, Deletion]);
const ana = { id: "u-ana", name: "Ana Rao" };

/** A one-paragraph document, suggesting as Ana, the caret at `caret`. */
function start(text: string, caret = 1) {
  let refused = 0;
  const doc = schema.node("doc", null, [schema.node("paragraph", null, text ? [schema.text(text)] : [])]);
  let state = EditorState.create({ schema, doc, plugins: [suggestPlugin(() => refused++)] });
  state = state.apply(setSuggesting(state, true, ana));
  state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, caret)));
  return { state, refused: () => refused };
}

/** The paragraph's words, `[+added]` and `[-removed]`. */
function shown(doc: PMNode): string {
  let out = "";
  doc.descendants((n) => {
    if (!n.isText) return;
    const kind = n.marks.find((m) => m.type.name === "insertion") ? "+" : n.marks.find((m) => m.type.name === "deletion") ? "-" : "";
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
    expect(s).toMatchObject({ user: "u-ana", name: "Ana Rao", inserted: "on ", deleted: "" });
    expect(suggestionsIn(state.doc)).toHaveLength(1);
  });

  it("strikes what Backspace or Delete would remove, the caret moving on", () => {
    let { state } = start("Ship on Friday", 8);
    state = state.apply(state.tr.delete(7, 8).setMeta(BACKWARD, true));
    state = state.apply(state.tr.delete(state.selection.from - 1, state.selection.from).setMeta(BACKWARD, true));
    expect(shown(state.doc)).toBe("Ship [-on] Friday");
    expect(state.selection.from).toBe(6);
    expect(suggestionsIn(state.doc)).toHaveLength(1);
    // Delete, forward: the caret goes past what it struck.
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

  it("refuses formatting and structure, and says so", async () => {
    const { state, refused } = start("Ship on Friday", 1);
    const bold = state.apply(state.tr.addMark(1, 5, schema.marks.bold!.create()));
    expect(bold.doc.eq(state.doc)).toBe(true);
    await Promise.resolve();
    expect(refused()).toBe(1);
  });

  it("is accepted or rejected as a whole", () => {
    let { state } = start("Ship on Friday", 9);
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 9, 15)));
    state = state.apply(state.tr.insertText("Thursday"));
    const [s] = suggestionsIn(state.doc);
    expect(shown(state.apply(settle(state, s!.id, true)).doc)).toBe("Ship on Thursday");
    expect(shown(state.apply(settle(state, s!.id, false)).doc)).toBe("Ship on Friday");
    // Settling is not itself a suggestion.
    expect(suggestionsIn(state.apply(settle(state, s!.id, true)).doc)).toEqual([]);
  });

  it("leaves typing alone when Suggesting is off", () => {
    let { state } = start("Ship", 5);
    state = state.apply(setSuggesting(state, false, ana));
    state = state.apply(state.tr.insertText(" now"));
    expect(shown(state.doc)).toBe("Ship now");
  });
});
