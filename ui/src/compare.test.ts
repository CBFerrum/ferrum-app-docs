import { getSchema } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { describe, expect, it } from "vitest";
import { compare, linesOf, sharedPlaces } from "./compare";
import { documentExtensions } from "./schema";

const schema = getSchema(documentExtensions("file"));
const text = (t: string) => schema.text(t);
const para = (t: string) => schema.node("paragraph", null, t ? [text(t)] : []);
const heading = (level: number, t: string) => schema.node("heading", { level }, [text(t)]);
const mention = (label: string) => schema.node("mention", { kind: "person", id: "u1", entity: null }, [schema.text(label)]);
const doc = (...blocks: PMNode[]) => schema.node("doc", null, blocks);

/** The words each side marks. */
function marks(older: PMNode, newer: PMNode) {
  const c = compare(older, newer);
  return {
    c,
    removed: c.removed.map((r) => older.textBetween(r.from, r.to, " ")),
    added: c.added.map((r) => newer.textBetween(r.from, r.to, " ")),
  };
}

describe("matching two sequences", () => {
  const pairs = (a: string, b: string) => sharedPlaces([...a], [...b]).map(([i, j]) => `${a[i]}${i}${j}`);

  it("keeps what both share, in order", () => {
    expect(sharedPlaces(["a", "b", "c"], ["a", "b", "c"])).toEqual([[0, 0], [1, 1], [2, 2]]);
    expect(sharedPlaces(["a", "x", "c"], ["a", "y", "c"])).toEqual([[0, 0], [2, 2]]);
    expect(sharedPlaces([], ["a"])).toEqual([]);
    expect(sharedPlaces(["a"], [])).toEqual([]);
  });

  it("finds a longest common subsequence where the middle differs", () => {
    // ABCABBA and CBABAC share four places (the classic example).
    expect(sharedPlaces([..."ABCABBA"], [..."CBABAC"]).length).toBe(4);
    const shared = sharedPlaces([..."ABCABBA"], [..."CBABAC"]);
    for (let k = 1; k < shared.length; k++) {
      expect(shared[k]![0]).toBeGreaterThan(shared[k - 1]![0]);
      expect(shared[k]![1]).toBeGreaterThan(shared[k - 1]![1]);
    }
    expect(shared.every(([i, j]) => "ABCABBA"[i] === "CBABAC"[j])).toBe(true);
    expect(pairs("hello world", "hello brave world").length).toBe(11);
  });

  it("gives up on sequences that differ by more than it was told to look for", () => {
    const a = Array.from({ length: 50 }, (_, i) => `a${i}`);
    const b = Array.from({ length: 50 }, (_, i) => `b${i}`);
    expect(sharedPlaces(a, b, 10)).toEqual([]);
    expect(sharedPlaces(a, b, 200)).toEqual([]);
  });
});

describe("comparing two versions", () => {
  it("finds nothing when nothing changed", () => {
    const d = doc(heading(1, "Plan"), para("Ship the thing."));
    const c = compare(d, doc(heading(1, "Plan"), para("Ship the thing.")));
    expect([c.removed, c.added, c.changes]).toEqual([[], [], []]);
    expect([c.wordsAdded, c.wordsRemoved]).toEqual([0, 0]);
  });

  it("marks the words that changed in a paragraph, not the whole of it", () => {
    const m = marks(doc(para("The quick brown fox jumps.")), doc(para("The slow brown fox leaps over.")));
    expect(m.removed).toEqual(["quick", "jumps"]);
    expect(m.added).toEqual(["slow", "leaps over"]);
    expect([m.c.wordsRemoved, m.c.wordsAdded]).toEqual([2, 3]);
    expect(m.c.changes).toHaveLength(1);
  });

  it("marks a paragraph added or taken away whole, and says where a change with nothing on a side sits", () => {
    const older = doc(para("One."), para("Two."), para("Three."));
    const newer = doc(para("One."), para("Two and a half."), para("Three."));
    const m = marks(older, newer);
    // "Two." becomes "Two and a half." (alike enough to compare): only the extra words are added.
    expect(m.added).toEqual(["and a half"]);
    const added = marks(doc(para("One."), para("Three.")), doc(para("One."), para("Brand new paragraph here."), para("Three.")));
    expect(added.added).toEqual(["Brand new paragraph here."]);
    expect(added.removed).toEqual([]);
    expect(added.c.wordsAdded).toBe(4);
    const { older: oldPlace, newer: newPlace } = added.c.changes[0]!;
    // Nothing was in the older text there: the change is a point, before "Three.".
    expect(oldPlace.from).toBe(oldPlace.to);
    expect(newPlace.to).toBeGreaterThan(newPlace.from);
    const removed = marks(doc(para("One."), para("Gone for good."), para("Three.")), doc(para("One."), para("Three.")));
    expect(removed.removed).toEqual(["Gone for good."]);
    expect(removed.c.wordsRemoved).toBe(3);
  });

  it("shows a heading made a paragraph (or the reverse) as a change of both", () => {
    const m = marks(doc(heading(2, "Risks"), para("Rain.")), doc(para("Risks"), para("Rain.")));
    expect(m.removed).toEqual(["Risks"]);
    expect(m.added).toEqual(["Risks"]);
    expect(m.c.changes).toHaveLength(1);
  });

  it("treats a mention as one unit: another person is a change of the whole of it", () => {
    const withAna = doc(schema.node("paragraph", null, [text("Ask "), mention("@Ana Rao"), text(" first.")]));
    const withBen = doc(schema.node("paragraph", null, [text("Ask "), mention("@Ben Cole"), text(" first.")]));
    const m = marks(withAna, withBen);
    expect(m.removed).toEqual(["@Ana Rao"]);
    expect(m.added).toEqual(["@Ben Cole"]);
    expect(marks(withAna, withAna).c.changes).toEqual([]);
  });

  it("tells each change apart and in order, for stepping through them", () => {
    const older = doc(para("Alpha is first."), para("Keep this line the same."), para("Gamma is last."));
    const newer = doc(para("Alpha is second."), para("Keep this line the same."), para("Gamma is final."));
    const c = compare(older, newer);
    expect(c.changes).toHaveLength(2);
    expect(c.changes[0]!.newer.from).toBeLessThan(c.changes[1]!.newer.from);
    expect(c.changes[0]!.older.from).toBeLessThan(c.changes[1]!.older.from);
  });

  it("does not mix up lines when one is added before an edited one", () => {
    const older = doc(para("The budget is ten thousand."));
    const newer = doc(para("A brand new opening paragraph."), para("The budget is twelve thousand."));
    const m = marks(older, newer);
    expect(m.removed).toEqual(["ten"]);
    expect(m.added).toEqual(["A brand new opening paragraph.", "twelve"]);
  });

  it("copes with long documents and with a rewrite of the lot", () => {
    const many = (prefix: string, n: number) => doc(...Array.from({ length: n }, (_, i) => para(`${prefix} paragraph number ${i} has some words in it`)));
    const a = many("Old", 1200);
    const b = many("Old", 1200);
    expect(compare(a, b).changes).toEqual([]);
    const edited = doc(...Array.from({ length: 1200 }, (_, i) => para(i % 300 === 7 ? `Edited paragraph number ${i} differs` : `Old paragraph number ${i} has some words in it`)));
    expect(compare(a, edited).changes).toHaveLength(4);
    const rewrite = compare(many("Old", 1200), many("Brand new text", 1200));
    expect(rewrite.changes.length).toBeGreaterThan(0);
    expect(rewrite.wordsAdded).toBeGreaterThan(0);
  });

  it("reads pictures and rules as lines of their own", () => {
    const image = (id: string) => schema.node("image", { image: id, alt: "", width: null, height: null });
    const m = marks(doc(para("Before"), image("a1"), para("After")), doc(para("Before"), image("b2"), para("After")));
    expect(m.c.changes).toHaveLength(1);
    expect(m.c.removed).toHaveLength(1);
    expect(m.c.added).toHaveLength(1);
    expect(linesOf(doc(schema.node("horizontalRule"))).map((l) => l.text)).toEqual(["[horizontalRule]"]);
  });
});
