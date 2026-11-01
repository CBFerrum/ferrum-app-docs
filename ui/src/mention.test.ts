import { getSchema } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import { prosemirrorToYDoc, yDocToProsemirrorJSON } from "@tiptap/y-tiptap";
import { describe, expect, it } from "vitest";
import { calloutKind } from "./callout";
import { type Pending, contextOf, findPeople, mentionBeside, mentionTarget, mentionsIn, noticeBody, planNotices } from "./mention";
import { documentExtensions } from "./schema";

const schema = getSchema(documentExtensions("file"));
const text = (t: string) => schema.text(t);
const person = (id: string, label: string) => schema.node("mention", { kind: "person", id, entity: null }, [text(label)]);
const record = (entity: string, id: string, label: string) => schema.node("mention", { kind: "record", id, entity }, [text(label)]);
const para = (...content: PMNode[]) => schema.node("paragraph", null, content);
const doc = (...blocks: PMNode[]) => schema.node("doc", null, blocks);

describe("mentions", () => {
  it("are the shape the platform's exports read: a `mention` element holding its label", () => {
    const d = doc(para(text("Ask "), person("u1", "@Ben Cole"), text(" about "), record("Customer", "c-9", "@Acme"), text(".")));
    const shared = prosemirrorToYDoc(d, "default");
    const xml = shared.getXmlFragment("default").toString();
    expect(xml).toContain("@Ben Cole</mention>");
    expect(xml).toContain("<mention");
    expect(xml).toMatch(/kind="record"/);
    // And back: the same document comes out of the shared one.
    expect(schema.nodeFromJSON(yDocToProsemirrorJSON(shared, "default")).eq(d)).toBe(true);
    expect(d.textContent).toBe("Ask @Ben Cole about @Acme.");
  });

  it("open a record of this workspace and nothing else", () => {
    expect(mentionTarget({ kind: "record", id: "6f2c-41", entity: "Customer" })).toEqual({ entity: "Customer", id: "6f2c-41" });
    expect(mentionTarget({ kind: "person", id: "u1", entity: null })).toBeNull();
    expect(mentionTarget({ kind: "record", id: "x", entity: "../admin" })).toBeNull();
    expect(mentionTarget({ kind: "record", id: "a/b", entity: "Customer" })).toBeNull();
    expect(mentionTarget({ kind: "record", id: null, entity: "Customer" })).toBeNull();
  });

  it("are taken whole by Backspace and Delete beside them, and by nothing in the middle of words", () => {
    // "Ask " (4) + the mention (@Ben = 4 characters + 2 for the node = 6) + " now"
    const d = doc(para(text("Ask "), person("u1", "@Ben"), text(" now")));
    const at = (pos: number) => EditorState.create({ schema, doc: d, selection: TextSelection.create(d, pos) });
    const start = 1 + 4;
    const end = start + 6;
    expect(mentionBeside(at(end), -1)).toEqual({ from: start, to: end });
    expect(mentionBeside(at(start), 1)).toEqual({ from: start, to: end });
    expect(mentionBeside(at(end), 1)).toBeNull();
    expect(mentionBeside(at(start), -1)).toBeNull();
    expect(mentionBeside(at(3), -1)).toBeNull();
    const range = EditorState.create({ schema, doc: d, selection: TextSelection.create(d, 2, 4) });
    expect(mentionBeside(range, -1)).toBeNull();
    const state = at(end);
    const after = state.apply(state.tr.delete(start, end));
    expect(after.doc.textContent).toBe("Ask  now");
  });

  it("are found in the text, in order", () => {
    const d = doc(para(person("u1", "@Ana")), schema.node("bulletList", null, [schema.node("listItem", null, [para(text("x "), record("Deal", "d1", "@Big deal"))])]));
    expect(mentionsIn(d).map((m) => [m.attrs.kind, m.attrs.id, m.label])).toEqual([
      ["person", "u1", "@Ana"],
      ["record", "d1", "@Big deal"],
    ]);
  });

  it("tell each person once, in words around their mention, and not those taken out again", () => {
    const d = doc(para(text("Please review, "), person("u1", "@Ben Cole"), text(", before Friday.")), para(person("u1", "@Ben Cole"), text(" again")), para(person("u2", "@Cy")));
    const pending = new Map<string, Pending>([
      ["u1", { id: "u1", email: "ben@acme.test", name: "Ben Cole" }],
      // Picked, then deleted again: nothing to tell.
      ["u3", { id: "u3", email: "gone@acme.test", name: "Gone" }],
    ]);
    const notices = planNotices(d, pending);
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({ person: { email: "ben@acme.test" }, context: "Please review, @Ben Cole, before Friday." });
    expect(noticeBody(notices[0]!.context)).toBe("Mentioned in the text: “Please review, @Ben Cole, before Friday.”");
    expect(noticeBody("")).toBe("Mentioned in the text.");
  });

  it("show a window of a long paragraph, around the mention", () => {
    const long = `${"word ".repeat(80)}`;
    const d = doc(para(text(long), person("u1", "@Ana"), text(` ${long}`)));
    const at = mentionsIn(d)[0]!.pos;
    const context = contextOf(d, at);
    expect(context.length).toBeLessThan(210);
    expect(context).toContain("@Ana");
    expect(context.startsWith("…") && context.endsWith("…")).toBe(true);
  });

  it("are looked up among people by name, a word of it, or the address", () => {
    const people = [
      { id: "1", full_name: "Ana Rao", email: "ana@acme.test" },
      { id: "2", full_name: "Rao Bharat", email: "bharat@acme.test" },
      { id: "3", full_name: "Cy Ana-Lee", email: "cy@acme.test" },
      { id: "4", full_name: "", email: "dev@acme.test" },
    ];
    expect(findPeople(people, "ana").map((p) => p.id)).toEqual(["1", "3"]);
    expect(findPeople(people, "rao").map((p) => p.id)).toEqual(["2", "1"]);
    expect(findPeople(people, "dev").map((p) => p.id)).toEqual(["4"]);
    expect(findPeople(people, "").map((p) => p.id)).toEqual(["1", "3", "4", "2"]);
    expect(findPeople(people, "nobody")).toEqual([]);
    expect(findPeople(people, "", 2)).toHaveLength(2);
  });
});

describe("callouts", () => {
  it("are quotes with a kind, and only a kind this editor knows", () => {
    expect([calloutKind("note"), calloutKind("tip"), calloutKind("warning"), calloutKind("alert")]).toEqual(["note", "tip", "warning", "alert"]);
    expect([calloutKind("danger"), calloutKind('x" onload="y'), calloutKind(null), calloutKind(undefined)]).toEqual([null, null, null, null]);
  });

  it("draw as a box and stay a quote for everything else", () => {
    const quote = schema.node("blockquote", { callout: "warning" }, [para(text("Careful"))]);
    const [tag, attrs] = quote.type.spec.toDOM!(quote) as [string, Record<string, string>];
    expect(tag).toBe("blockquote");
    expect(attrs["data-callout"]).toBe("warning");
    expect(attrs.class).toContain("doc-callout-warning");
    const plain = schema.node("blockquote", null, [para(text("Quoted"))]);
    expect((plain.type.spec.toDOM!(plain) as [string, Record<string, string>])[1]["data-callout"]).toBeUndefined();
    // A kind the editor does not know draws as a plain quote, however it got into the document.
    const odd = schema.node("blockquote", { callout: "x onclick=y" }, [para(text("Odd"))]);
    expect((odd.type.spec.toDOM!(odd) as [string, Record<string, string>])[1]["data-callout"]).toBeUndefined();
  });
});
