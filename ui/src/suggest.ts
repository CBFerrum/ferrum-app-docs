// Suggestions in a live document (Ferrum collaboration.md, C3): with Suggesting on, an editor's
// changes do not change the text; they propose. Everything proposed is in the shared document, signed
// with who, when and an id, so everyone sees it at once, and whoever may edit accepts or rejects it:
//
//   words          new words carry an `insertion` mark; removed words stay, struck, with `deletion`
//   paragraphs     a new paragraph boundary (Enter, a pasted paragraph) is a `split` attribute on the
//                  paragraph or heading after it; a removed one (Backspace at a paragraph's start, a
//                  deletion across paragraphs) is a `join` attribute there, the paragraphs kept apart
//   formatting     text whose marks changed carries a `formatChange` mark with the marks it had
//                  (`before`); a paragraph, heading or list whose type or attributes changed carries a
//                  `formatted` attribute with the type and attributes it had
//
// Rejecting every suggestion gives back the document as it was; accepting every one gives what the same
// changes would have made with Suggesting off (suggest.test.ts proves both over random edits). A change
// that cannot be put this way (tables, pictures, wrapping in or out of a list, a mention, a page break,
// contents or a footnote) is refused and the person told why. Changes that touch paragraphs or formatting
// are checked as they happen: if settling them would not give back exactly the document before and after,
// the change is refused rather than proposed wrongly.

import { type Editor, Extension, Mark, mergeAttributes } from "@tiptap/core";
import { Fragment, type MarkType, Mark as PMMark, type Node as PMNode, Slice } from "@tiptap/pm/model";
import { type EditorState, Plugin, PluginKey, TextSelection, type Transaction } from "@tiptap/pm/state";
import { AddMarkStep, AttrStep, Mapping, RemoveMarkStep, ReplaceAroundStep, ReplaceStep, type Step, Transform } from "@tiptap/pm/transform";
import { ySyncPluginKey } from "@tiptap/y-tiptap";
import { t } from "@ferrum/client";

export interface Suggester {
  id: string;
  name: string;
}

/** Who proposed something: the suggestion's id, the person, and when. */
export interface Who {
  id: string;
  user: string;
  name: string;
  at: string | null;
}

interface SuggestState {
  on: boolean;
  me: Suggester | null;
}

/** Why a change could not be suggested. */
export type Refusal = "table" | "image" | "block" | "structure";

export const suggestKey = new PluginKey<SuggestState>("docSuggest");
/** On a deletion made while suggesting: it went backward (Backspace), so the caret goes before the
 *  words it struck rather than after them. */
export const BACKWARD = "docSuggestBackward";

/** The marks a suggestion is made of (never formatting themselves). */
const OWN_MARKS = new Set(["insertion", "deletion", "formatChange"]);
/** Where paragraph boundaries are proposed. */
const TEXTBLOCKS = new Set(["paragraph", "heading"]);
/** Whose type and attributes can be proposed. */
const FORMATTED = new Set(["paragraph", "heading", "bulletList", "orderedList"]);
/** The attributes a suggestion is kept in (not formatting). */
const OWN_ATTRS = ["split", "join", "formatted"];
/** Units and blocks a suggestion cannot carry, and why. */
const REFUSED: Record<string, Refusal> = {
  table: "table",
  tableRow: "table",
  tableCell: "table",
  tableHeader: "table",
  image: "image",
  mention: "block",
  dateChip: "block",
  footnoteRef: "block",
  footnote: "block",
  pageBreak: "block",
  tableOfContents: "block",
  horizontalRule: "block",
  pageField: "block",
};

// Drawn as data-* attributes by each mark itself, never as plain ones (an `id` attribute would repeat on the page).
const hidden = { renderHTML: () => ({}) };
const whoAttrs = {
  id: { default: null, ...hidden },
  user: { default: null, ...hidden },
  name: { default: "", ...hidden },
  at: { default: null, ...hidden },
};

/** A `Who` read from the shared document, or null for anything else (another client may write anything). */
export function cleanWho(v: unknown): Who | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (typeof o.id !== "string" || !o.id) return null;
  return { id: o.id, user: typeof o.user === "string" ? o.user : "", name: typeof o.name === "string" ? o.name.slice(0, 200) : "", at: typeof o.at === "string" ? o.at : null };
}

function suggestionMark(name: "insertion" | "deletion", tag: "ins" | "del") {
  return Mark.create({
    name,
    inclusive: false,
    // One suggestion per character (the default), which also keeps the mark's name plain in the
    // shared document (y-prosemirror suffixes marks that may overlap), as the server reads it.
    addAttributes: () => whoAttrs,
    parseHTML: () => [{ tag: `${tag}[data-suggestion]`, getAttrs: (el) => ({ id: el.getAttribute("data-suggestion"), user: el.getAttribute("data-user"), name: el.getAttribute("data-name") ?? "", at: el.getAttribute("data-at") }) }],
    renderHTML: ({ mark, HTMLAttributes }) => [
      tag,
      mergeAttributes(HTMLAttributes, {
        "data-suggestion": mark.attrs.id,
        "data-user": mark.attrs.user,
        "data-name": mark.attrs.name,
        "data-at": mark.attrs.at,
        class: name === "insertion" ? "doc-ins" : "doc-del",
        title: t("{value} by {value2}", { value: name === "insertion" ? t("Suggested") : t("Suggested removing"), value2: String(mark.attrs.name || t("someone")) }),
      }),
      0,
    ],
  });
}

export const Insertion = suggestionMark("insertion", "ins");
export const Deletion = suggestionMark("deletion", "del");

/** Formatting proposed on text: `before` is the marks it had (ProseMirror's JSON of each). Never read
 *  from the clipboard: a copy must not carry someone's proposal. */
export const FormatChange = Mark.create({
  name: "formatChange",
  inclusive: false,
  addAttributes: () => ({ ...whoAttrs, before: { default: null, ...hidden } }),
  parseHTML: () => [],
  renderHTML: ({ mark }) => ["span", { class: "doc-fmt", "data-suggestion": mark.attrs.id, title: t("Formatting suggested by {name}", { name: String(mark.attrs.name || t("someone")) }) }, 0],
});

const whoAttr = (name: string) => ({
  default: null,
  keepOnSplit: false,
  parseHTML: () => null,
  renderHTML: (a: Record<string, unknown>) => {
    const w = cleanWho(a[name]);
    return w ? { [`data-${name}`]: w.name || "" } : {};
  },
});

/** The attributes that carry proposed paragraph boundaries and block formatting. */
export const SuggestionAttrs = Extension.create({
  name: "docSuggestionAttrs",
  addGlobalAttributes() {
    return [
      { types: [...TEXTBLOCKS], attributes: { split: whoAttr("split"), join: whoAttr("join") } },
      { types: [...FORMATTED], attributes: { formatted: { ...whoAttr("formatted"), keepOnSplit: true } } },
    ];
  },
});

const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);

// ── reading and settling ──

/** A node's attributes without the suggestion's own. */
function plainAttrs(attrs: Record<string, unknown>): Record<string, unknown> {
  const out = { ...attrs };
  for (const k of OWN_ATTRS) delete out[k];
  return out;
}

/** Deep equality of attribute values, null and absent alike. */
function same(a: unknown, b: unknown): boolean {
  if (a === b || (a == null && b == null)) return true;
  if (typeof a !== "object" || typeof b !== "object" || !a || !b) return false;
  const ka = Object.keys(a).filter((k) => (a as Record<string, unknown>)[k] != null);
  const kb = Object.keys(b).filter((k) => (b as Record<string, unknown>)[k] != null);
  return ka.length === kb.length && ka.every((k) => same((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

const formatMarks = (marks: readonly PMMark[]) => marks.filter((m) => !OWN_MARKS.has(m.type.name));

/** The marks a `before` list names, the ones this schema cannot make left out. */
function marksFrom(doc: PMNode, before: unknown): PMMark[] {
  if (!Array.isArray(before)) return [];
  const out: PMMark[] = [];
  for (const j of before) {
    try {
      const m = doc.type.schema.markFromJSON(j);
      if (!OWN_MARKS.has(m.type.name)) out.push(m);
    } catch {
      // A mark this client does not know: compat.ts keeps such a document read-only.
    }
  }
  return PMMark.setFrom(out) as PMMark[];
}

/** The type and attributes a `formatted` record keeps, when it is one this schema can apply. */
function formerOf(v: unknown): { type: string; attrs: Record<string, unknown> } | null {
  const o = v as { type?: unknown; attrs?: unknown } | null;
  if (!o || typeof o.type !== "string" || !FORMATTED.has(o.type)) return null;
  return { type: o.type, attrs: o.attrs && typeof o.attrs === "object" ? (o.attrs as Record<string, unknown>) : {} };
}

/** Whether `a` (the end of a textblock) and `b` (the start of the next) are only a boundary apart, not
 *  across a table or anything that is not a paragraph's wrapping. */
function pureBoundary(doc: PMNode, a: number, b: number): boolean {
  const $a = doc.resolve(a);
  const $b = doc.resolve(b);
  if (!$a.parent.isTextblock || !$b.parent.isTextblock || a !== $a.end() || b !== $b.start()) return false;
  const d = $a.sharedDepth(b);
  if (b - a !== $a.depth - d + ($b.depth - d)) return false;
  for (let k = d + 1; k <= $a.depth; k++) if ($a.node(k).type.spec.tableRole) return false;
  for (let k = d + 1; k <= $b.depth; k++) if ($b.node(k).type.spec.tableRole) return false;
  return true;
}

/** Accepts or rejects, in `tr`, the suggestions whose author record `pick` chooses. */
export function settleIn(tr: Transform, pick: (w: Who) => boolean, accept: boolean): void {
  const doc = tr.doc;
  const schema = doc.type.schema;
  const fc = schema.marks.formatChange;
  const picked = (v: unknown) => {
    const w = cleanWho(v);
    return !!w && pick(w);
  };
  const drops: [number, number][] = [];
  const wholes: [number, number][] = [];
  let prevEnd: number | null = null;
  // First what keeps every position where it is (marks and attributes), then the removals, last first.
  doc.descendants((node, pos) => {
    if (FORMATTED.has(node.type.name) && picked(node.attrs.formatted)) {
      const former = accept ? null : formerOf(node.attrs.formatted);
      if (former) {
        try {
          tr.setNodeMarkup(pos, schema.nodes[former.type], { ...plainAttrs(former.attrs), split: node.attrs.split ?? null, join: node.attrs.join ?? null, formatted: null });
        } catch {
          tr.setNodeAttribute(pos, "formatted", null);
        }
      } else tr.setNodeAttribute(pos, "formatted", null);
    }
    if (!node.isTextblock) return true;
    let allDropped = true;
    node.forEach((child, offset) => {
      const a = pos + 1 + offset;
      const b = a + child.nodeSize;
      let dropped = false;
      for (const m of child.marks) {
        if (m.type.name === "insertion" || m.type.name === "deletion") {
          if (!picked(m.attrs)) continue;
          if ((m.type.name === "insertion") === accept) tr.removeMark(a, b, m);
          else dropped = true;
        } else if (fc && m.type === fc && picked(m.attrs)) {
          if (!accept) {
            for (const old of formatMarks(child.marks)) tr.removeMark(a, b, old.type);
            for (const back of marksFrom(doc, m.attrs.before)) tr.addMark(a, b, back);
          }
          tr.removeMark(a, b, fc);
        }
      }
      if (dropped) drops.push([a, b]);
      else allDropped = false;
    });
    if (TEXTBLOCKS.has(node.type.name)) {
      const split = picked(node.attrs.split);
      const join = picked(node.attrs.join);
      // A rejected new boundary, or an accepted removed one, goes: the paragraph joins the one before.
      const goes = (split && !accept) || (join && accept);
      if (split && accept) tr.setNodeAttribute(pos, "split", null);
      if (join && !accept) tr.setNodeAttribute(pos, "join", null);
      if (goes) {
        if (prevEnd !== null && pureBoundary(doc, prevEnd, pos + 1)) drops.push([prevEnd, pos + 1]);
        else if (allDropped) wholes.push([pos, pos + node.nodeSize]);
      }
    }
    prevEnd = pos + node.nodeSize - 1;
    return false;
  });
  const inWhole = ([a, b]: [number, number]) => wholes.some(([x, y]) => a >= x && b <= y);
  // Removals that touch are made as one, as the change that proposed them was: deleting across a paragraph and a
  // list at once joins what is left differently from joining each boundary in turn.
  const merged: [number, number][] = [];
  for (const r of [...drops.filter((r) => !inWhole(r)), ...wholes].sort((x, y) => x[0] - y[0])) {
    const last = merged.at(-1);
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([r[0], r[1]]);
  }
  for (const [a, b] of merged.reverse()) {
    try {
      tr.delete(a, b);
    } catch {
      // What cannot be removed stays; the check while suggesting refuses changes that would come here.
    }
  }
}

/** The document with every suggestion `pick` chooses (all, by default) accepted or rejected. */
export function settled(doc: PMNode, accept: boolean, pick: (w: Who) => boolean = () => true): PMNode {
  const tr = new Transform(doc);
  settleIn(tr, pick, accept);
  return tr.doc;
}

/** Accepts (the proposal becomes the text) or rejects (it goes) the suggestions `ids`. One transaction, one undo. */
export function settle(state: EditorState, ids: string | Iterable<string>, accept: boolean): Transaction {
  const want = new Set(typeof ids === "string" ? [ids] : ids);
  const tr = state.tr.setMeta(suggestKey, { applied: true });
  settleIn(tr, (w) => want.has(w.id), accept);
  return tr;
}

/** What a format suggestion changed: keys the interface names (SuggestionList.tsx). */
function markChanges(before: readonly PMMark[], now: readonly PMMark[], out: Set<string>) {
  const names = new Set([...before, ...now].map((m) => m.type.name));
  for (const n of names) {
    const a = before.find((m) => m.type.name === n);
    const b = now.find((m) => m.type.name === n);
    if (a && b && same(a.attrs, b.attrs)) continue;
    if (n === "textStyle") {
      for (const k of ["color", "fontSize", "fontFamily"]) if (!same(a?.attrs[k], b?.attrs[k])) out.add(k);
    } else out.add(a && !b ? `-${n}` : n);
  }
}

function nodeChanges(former: { type: string; attrs: Record<string, unknown> }, node: PMNode, out: Set<string>) {
  if (former.type !== node.type.name || (node.type.name === "heading" && former.attrs.level !== node.attrs.level)) out.add(`type:${node.type.name}${node.type.name === "heading" ? `:${node.attrs.level}` : ""}`);
  if (former.type !== node.type.name) return;
  const now = plainAttrs(node.attrs);
  for (const k of new Set([...Object.keys(now), ...Object.keys(former.attrs)])) {
    if (k === "level" || OWN_ATTRS.includes(k) || same(now[k], former.attrs[k])) continue;
    out.add(k === "spaceBefore" || k === "spaceAfter" ? "spacing" : k === "type" ? "numberStyle" : k);
  }
}

/** The suggestions in a document: who, when, what was added and removed (a paragraph boundary as ¶), what
 *  formatting changed, and where. */
export interface Suggestion {
  id: string;
  user: string;
  name: string;
  at: string | null;
  inserted: string;
  deleted: string;
  /** Keys of what formatting changed ("bold", "color", "textAlign", "type:heading:2" ...). */
  formats: string[];
  from: number;
  to: number;
}

export function suggestionsIn(doc: PMNode): Suggestion[] {
  const found = new Map<string, Suggestion & { f: Set<string> }>();
  const at = (v: unknown, from: number, to: number) => {
    const w = cleanWho(v);
    if (!w) return null;
    const s = found.get(w.id) ?? { ...w, inserted: "", deleted: "", formats: [], f: new Set<string>(), from, to };
    s.from = Math.min(s.from, from);
    s.to = Math.max(s.to, to);
    found.set(w.id, s);
    return s;
  };
  doc.descendants((node, pos) => {
    if (FORMATTED.has(node.type.name) && node.attrs.formatted) {
      const s = at(node.attrs.formatted, pos, pos + node.nodeSize);
      const former = formerOf(node.attrs.formatted);
      if (s && former) nodeChanges(former, node, s.f);
    }
    if (TEXTBLOCKS.has(node.type.name)) {
      const sp = at(node.attrs.split, pos, pos + 1);
      if (sp) sp.inserted += "¶";
      const jn = at(node.attrs.join, pos, pos + 1);
      if (jn) jn.deleted += "¶";
    }
    if (!node.isInline) return true;
    const text = node.isText ? node.text! : node.type.name === "hardBreak" ? "↵" : "";
    for (const m of node.marks) {
      if (!OWN_MARKS.has(m.type.name)) continue;
      const s = at(m.attrs, pos, pos + node.nodeSize);
      if (!s) continue;
      if (m.type.name === "insertion") s.inserted += text;
      else if (m.type.name === "deletion") s.deleted += text;
      else markChanges(marksFrom(doc, m.attrs.before), formatMarks(node.marks), s.f);
    }
    return false;
  });
  return [...found.values()].map(({ f, ...s }) => ({ ...s, formats: [...f].sort() })).sort((a, b) => a.from - b.from);
}

// ── turning changes into suggestions ──

/** A suggestion of `me` beside `pos` (its id and time), to grow it rather than start another: words next to
 *  my words, or the start of a paragraph I proposed. */
function neighbour(doc: PMNode, pos: number, me: Suggester): { id: string; at: string } | null {
  const $pos = doc.resolve(Math.max(0, Math.min(pos, doc.content.size)));
  for (const node of [$pos.nodeBefore, $pos.nodeAfter]) {
    for (const name of ["deletion", "insertion"]) {
      const mark = node?.marks.find((m) => m.type.name === name && m.attrs.user === me.id);
      if (mark) return { id: mark.attrs.id as string, at: mark.attrs.at as string };
    }
  }
  const split = cleanWho($pos.parent.attrs.split);
  if ($pos.parent.isTextblock && $pos.parentOffset === 0 && split?.user === me.id) return { id: split.id, at: split.at ?? "" };
  return null;
}

/** The removed content to put back, without words `me` had only suggested (deleting your own
 *  suggestion takes it away for good). Null when nothing is left to put back. */
function keep(slice: Slice, me: Suggester): Slice | null {
  const content: PMNode[] = [];
  slice.content.forEach((n) => content.push(n));
  if (!content.every((n) => n.isInline)) return slice.size ? slice : null;
  const left = content.filter((n) => !n.marks.some((m) => m.type.name === "insertion" && m.attrs.user === me.id));
  return left.length ? new Slice(Fragment.from(left), 0, 0) : null;
}

/** Why `content` cannot be part of a suggestion, or null. */
function refusedIn(content: Fragment): Refusal | null {
  let why: Refusal | null = null;
  content.descendants((n) => {
    why ??= REFUSED[n.type.name] ?? null;
    return !why;
  });
  return why;
}

type Kind = "words" | "blocks" | "marks" | "markup";

/** What kind of change `step` is to `doc`, or why it cannot be suggested. */
function classify(step: Step, doc: PMNode): Kind | Refusal {
  if (step instanceof AddMarkStep || step instanceof RemoveMarkStep) return OWN_MARKS.has(step.mark.type.name) ? "structure" : "marks";
  if (step instanceof AttrStep) {
    const node = doc.nodeAt(step.pos);
    if (!node) return "structure";
    return FORMATTED.has(node.type.name) && !OWN_ATTRS.includes(step.attr) ? "markup" : (REFUSED[node.type.name] ?? "structure");
  }
  if (step instanceof ReplaceAroundStep) {
    const node = doc.nodeAt(step.from);
    const into = step.slice.content.firstChild;
    const markup = step.gapFrom === step.from + 1 && step.gapTo === step.to - 1 && step.insert === 1 && step.slice.openStart === 0 && step.slice.openEnd === 0 && step.slice.content.childCount === 1 && into?.content.size === 0;
    if (markup && node && node.nodeSize === step.to - step.from && FORMATTED.has(node.type.name) && FORMATTED.has(into!.type.name)) return "markup";
    return node ? (REFUSED[node.type.name] ?? "structure") : "structure";
  }
  if (!(step instanceof ReplaceStep)) return "structure";
  const { from, to, slice } = step as ReplaceStep & { from: number; to: number; slice: Slice };
  const removed = doc.slice(from, to);
  const why = refusedIn(removed.content) ?? refusedIn(slice.content);
  if (why) return why;
  // Removed content that starts and ends at different depths (from a paragraph into a list item) cannot be put
  // back as it was: the list it ended in would come back as two.
  if (removed.openStart !== removed.openEnd) return "structure";
  const $from = doc.resolve(from);
  const inline = $from.parent.isTextblock && $from.sameParent(doc.resolve(to)) && slice.openStart === 0 && slice.openEnd === 0;
  let onlyInline = true;
  slice.content.forEach((n) => void (onlyInline &&= n.isInline));
  return inline && onlyInline ? "words" : "blocks";
}

/** Removes, in `out` between `a` and `b`, what `me` proposed and now takes away again: my own new words and
 *  my own new paragraph boundaries. Returns how much shorter the range became. */
function tidy(out: Transaction, a: number, b: number, me: Suggester): number {
  const size = out.doc.content.size;
  const ops: [number, number][] = [];
  let prevEnd: number | null = null;
  out.doc.nodesBetween(Math.max(0, a - 1), b, (node, pos) => {
    if (node.isTextblock) {
      if (pos >= a && pos < b && cleanWho(node.attrs.split)?.user === me.id && prevEnd !== null && pureBoundary(out.doc, prevEnd, pos + 1)) ops.push([prevEnd, pos + 1]);
      prevEnd = pos + node.nodeSize - 1;
      return true;
    }
    if (node.isInline && pos >= a && pos + node.nodeSize <= b && node.marks.some((m) => m.type.name === "insertion" && m.attrs.user === me.id)) ops.push([pos, pos + node.nodeSize]);
    return !node.isInline;
  });
  for (const [x, y] of ops.sort((p, q) => q[0] - p[0])) out.delete(x, y);
  return size - out.doc.content.size;
}

/** Whether changes are checked by settling them as they are made (structure and formatting). Tests turn it
 *  off to prove the rules hold without the check. */
let verifying = true;
export function verifySuggestions(on: boolean) {
  verifying = on;
}

/** Turns an editor's change into a suggestion (see the top of this file). */
function suggest(trs: readonly Transaction[], before: EditorState, state: EditorState, me: Suggester): Transaction | null {
  const mine = trs.filter((tr) => tr.docChanged && !tr.getMeta(suggestKey) && !(tr.getMeta(ySyncPluginKey) as { isChangeOrigin?: boolean } | undefined)?.isChangeOrigin);
  if (!mine.length) return null;
  const schema = state.schema;
  const insertion = schema.marks.insertion!;
  const deletion = schema.marks.deletion!;
  const fc = schema.marks.formatChange!;
  const out = state.tr.setMeta(suggestKey, { applied: true });
  const steps = mine.flatMap((tr) => tr.steps.map((step, i) => ({ tr, step, i, doc: tr.docs[i]! })));
  const kinds = steps.map(({ step, doc }) => classify(step, doc));
  // Undoing what cannot be suggested: each of this person's steps inverted, last first, and carried over whatever
  // came after it (others' changes, a plugin's tidying in the same round), as ProseMirror's history rebases.
  const refuse = (why: Refusal) => {
    // A transaction of its own: what was tracked so far (the check comes last) is not kept.
    const back = state.tr;
    const all = trs.flatMap((tr) => tr.steps.map((step, i) => ({ step, doc: tr.docs[i]!, mine: mine.includes(tr) })));
    const firstMine = all.findIndex((x) => x.mine);
    if (all.slice(firstMine).every((x) => x.mine)) {
      // Nothing came between: each step's inverse applies exactly.
      for (const tr of [...mine].reverse()) for (let i = tr.steps.length - 1; i >= 0; i--) back.step(tr.steps[i]!.invert(tr.docs[i]!));
      return back.setMeta(suggestKey, { applied: true, refused: why });
    }
    for (let k = all.length - 1; k >= 0; k--) {
      if (!all[k]!.mine) continue;
      const over = new Mapping([...all.slice(k + 1).map((x) => x.step.getMap()), ...back.mapping.maps]);
      const undo = all[k]!.step.invert(all[k]!.doc).map(over);
      if (undo) back.maybeStep(undo);
    }
    return back.setMeta(suggestKey, { applied: true, refused: why });
  };
  const bad = kinds.find((k): k is Refusal => k !== "words" && k !== "blocks" && k !== "marks" && k !== "markup");
  if (bad) return refuse(bad);
  const now = new Date().toISOString();
  const fresh: Who = { id: newId(), user: me.id, name: me.name, at: now };
  let caret: number | null = null;
  const textFormats: { from: number; to: number; before: unknown }[] = [];
  const blockFormats: { pos: number; former: { type: string; attrs: Record<string, unknown> } }[] = [];
  const later = (n: number, pos: number, assoc: number) => {
    for (const s of steps.slice(n + 1)) pos = s.step.getMap().map(pos, assoc);
    return pos;
  };
  steps.forEach(({ tr, step, doc }, n) => {
    const kind = kinds[n] as Kind;
    if (kind === "marks") {
      const { from, to } = step as AddMarkStep;
      doc.nodesBetween(from, to, (node, pos) => {
        if (!node.isInline) return true;
        if (node.marks.some((m) => m.type === insertion)) return false;
        const old = node.marks.find((m) => m.type === fc);
        textFormats.push({ from: later(n, Math.max(pos, from), 1), to: later(n, Math.min(pos + node.nodeSize, to), -1), before: old ? old.attrs.before : formatMarks(node.marks).map((m) => m.toJSON()) });
        return false;
      });
      return;
    }
    if (kind === "markup") {
      const pos = step instanceof AttrStep ? step.pos : (step as ReplaceAroundStep).from;
      const node = doc.nodeAt(pos)!;
      blockFormats.push({ pos: later(n, pos, 1), former: formerOf(node.attrs.formatted) ?? { type: node.type.name, attrs: plainAttrs(node.attrs) } });
      return;
    }
    // Words and paragraphs: what was removed goes back, struck; what was added stays, marked new.
    const { from, to, slice } = step as ReplaceStep & { from: number; to: number; slice: Slice };
    const removed = doc.slice(from, to);
    const start = out.mapping.map(later(n, from, -1), 1);
    const added = slice.size;
    const grown = neighbour(out.doc, start, me);
    const who: Who = grown ? { ...fresh, id: grown.id, at: grown.at } : fresh;
    const mark = (type: MarkType) => type.create(who);
    let back = 0;
    const putBack = removed.size ? keep(removed, me) : null;
    if (putBack) {
      out.replace(start, start, putBack);
      back = putBack.size;
      if (kind === "blocks") back -= tidy(out, start, start + back, me);
      out.doc.nodesBetween(start, start + back, (node, pos) => {
        // Words already proposed for removal keep who proposed it; others' new words stay theirs too.
        if (node.isInline && !node.marks.some((m) => m.type === deletion)) out.addMark(Math.max(pos, start), Math.min(pos + node.nodeSize, start + back), mark(deletion));
        if (node.isTextblock && pos >= start && TEXTBLOCKS.has(node.type.name)) out.setNodeAttribute(pos, "join", who);
        return true;
      });
    }
    if (added) {
      const a = start + back;
      // Typed words inherit the marks around the caret, a strike or a format suggestion among them: they are
      // simply new. Moved or pasted content keeps what it carried (words struck stay struck).
      if (kind === "words") {
        out.removeMark(a, a + added, deletion);
        out.removeMark(a, a + added, fc);
      }
      out.addMark(a, a + added, mark(insertion));
      out.doc.nodesBetween(a, a + added, (node, pos) => {
        if (node.isTextblock && pos >= a && TEXTBLOCKS.has(node.type.name)) out.setNodeMarkup(pos, undefined, { ...node.attrs, split: who, join: null });
        return !node.isInline;
      });
    }
    // Backspace leaves the caret before what it struck; anything else, after the change.
    const backward = !!tr.getMeta(BACKWARD) || (n === 0 && before.selection.empty && before.selection.from === to && to > from);
    caret = !added && back && backward ? start : start + back + added;
  });
  // Formatting: the earliest `before` wins (records are applied last first); text back as it was loses its mark.
  for (const r of [...textFormats].reverse()) {
    const a = out.mapping.map(r.from, 1);
    const b = out.mapping.map(r.to, -1);
    if (a < b) out.addMark(a, b, fc.create({ ...fresh, before: r.before }));
  }
  for (const r of textFormats) {
    const a = out.mapping.map(r.from, 1);
    const b = out.mapping.map(r.to, -1);
    if (a >= b) continue;
    out.doc.nodesBetween(a, b, (node, pos) => {
      const m = node.isInline ? node.marks.find((x) => x.type === fc && x.attrs.id === fresh.id) : null;
      if (m && PMMark.sameSet(formatMarks(node.marks), marksFrom(out.doc, m.attrs.before))) out.removeMark(Math.max(pos, a), Math.min(pos + node.nodeSize, b), fc);
      return !node.isInline;
    });
  }
  for (const r of [...blockFormats].reverse()) {
    const pos = out.mapping.map(r.pos, 1);
    const node = out.doc.nodeAt(pos);
    if (!node || !FORMATTED.has(node.type.name)) continue;
    const back = node.type.name === r.former.type && same(plainAttrs(node.attrs), r.former.attrs);
    out.setNodeAttribute(pos, "formatted", back ? null : { ...fresh, type: r.former.type, attrs: r.former.attrs });
  }
  if (caret !== null) out.setSelection(TextSelection.near(out.doc.resolve(Math.min(caret, out.doc.content.size))));
  // Paragraphs and formatting: settling everything must give back the document before, and what the change made.
  if (verifying && kinds.some((k) => k !== "words")) {
    const clean = cleanCopies(mine, state);
    const made = clean ? clean.doc : state.doc;
    if (!settled(out.doc, false).eq(settled(mine[0]!.before, false)) || !settled(out.doc, true).eq(settled(made, true))) return refuse("structure");
  }
  out.setMeta(suggestKey, { applied: true, tracked: kinds.some((k) => k !== "words") });
  return out;
}

/** With Suggesting off: a paragraph made by splitting another does not keep the boundary suggestion of the
 *  one it came from (ProseMirror copies a paragraph's attributes to its second half), and words typed inside a
 *  suggestion are plain words, not part of it (the marks at the caret would otherwise carry over). */
function cleanCopies(trs: readonly Transaction[], state: EditorState): Transaction | null {
  const mine = trs.filter((tr) => tr.docChanged && !tr.getMeta(suggestKey) && !(tr.getMeta(ySyncPluginKey) as { isChangeOrigin?: boolean } | undefined)?.isChangeOrigin);
  const steps = mine.flatMap((tr) => tr.steps.map((step, i) => ({ step, doc: tr.docs[i]! })));
  const out = state.tr.setMeta(suggestKey, { applied: true });
  steps.forEach(({ step, doc }, n) => {
    if (!(step instanceof ReplaceStep)) return;
    const { from, slice } = step as ReplaceStep & { from: number; slice: Slice };
    if (!slice.size) return;
    let a = from;
    let b = from + slice.size;
    for (const s of steps.slice(n + 1)) {
      a = s.step.getMap().map(a, 1);
      b = s.step.getMap().map(b, -1);
    }
    if (a >= b) return;
    if (classify(step, doc) === "words") for (const name of OWN_MARKS) out.removeMark(a, b, out.doc.type.schema.marks[name]!);
    out.doc.nodesBetween(a, b, (node, pos) => {
      if (node.isTextblock && pos >= a && (node.attrs.split || node.attrs.join)) out.setNodeMarkup(pos, undefined, { ...node.attrs, split: null, join: null });
      return !node.isInline;
    });
  });
  return out.docChanged ? out : null;
}

/** The plugin behind Suggesting; `onRefused` hears of changes that cannot be suggested and why, `onTracked`
 *  of a proposed paragraph or formatting change (the document's format is raised for it, compat.ts). */
export function suggestPlugin(onRefused: (why: Refusal) => void, onTracked: () => void = () => undefined): Plugin<SuggestState> {
  return new Plugin<SuggestState>({
    key: suggestKey,
    state: {
      init: () => ({ on: false, me: null }),
      apply: (tr, before) => {
        const set = tr.getMeta(suggestKey) as Partial<SuggestState> | undefined;
        return set && "on" in set ? { on: !!set.on, me: set.me ?? before.me } : before;
      },
    },
    appendTransaction(trs, before, state) {
      const st = suggestKey.getState(state);
      if (!st?.on || !st.me) return cleanCopies(trs, state);
      const out = suggest(trs, before, state, st.me);
      const meta = out?.getMeta(suggestKey) as { refused?: Refusal; tracked?: boolean } | undefined;
      if (meta?.refused) queueMicrotask(() => onRefused(meta.refused!));
      else if (meta?.tracked) queueMicrotask(onTracked);
      return out;
    },
    props: {
      handleDOMEvents: {
        // Deleting while suggesting is done here, not by the browser: its own deletions come back
        // as whatever the page's text became (whitespace folded, struck words re-read), not as a
        // removal of what was meant. The browser says exactly what it would delete.
        beforeinput(view, event) {
          const st = suggestKey.getState(view.state);
          const e = event as InputEvent;
          if (!st?.on || !st.me || !e.inputType?.startsWith("delete")) return false;
          const backward = e.inputType.includes("Backward");
          const { selection } = view.state;
          let from = selection.from;
          let to = selection.to;
          const target = typeof e.getTargetRanges === "function" ? e.getTargetRanges()[0] : undefined;
          if (target) {
            try {
              const a = view.posAtDOM(target.startContainer, target.startOffset);
              const b = view.posAtDOM(target.endContainer, target.endOffset);
              [from, to] = [Math.min(a, b), Math.max(a, b)];
            } catch {
              return false;
            }
          } else if (selection.empty) {
            // No target from the browser: one character beside the caret.
            [from, to] = backward ? [Math.max(selection.$from.start(), from - 1), from] : [to, Math.min(selection.$to.end(), to + 1)];
          }
          if (from === to) return false;
          e.preventDefault();
          view.dispatch(view.state.tr.delete(from, to).setMeta(BACKWARD, backward).scrollIntoView());
          return true;
        },
      },
    },
  });
}

/** Suggesting: `setSuggesting` turns it on and off for this editor (`me` signs what it proposes). */
export const Suggestions = Extension.create<{ onRefused: (why: Refusal) => void; onTracked: () => void }>({
  name: "docSuggestions",

  addOptions() {
    return { onRefused: () => undefined, onTracked: () => undefined };
  },

  addProseMirrorPlugins() {
    return [
      suggestPlugin(
        (why) => this.options.onRefused(why),
        () => this.options.onTracked(),
      ),
    ];
  },
});

/** Turns suggesting on or off. */
export function setSuggesting(state: EditorState, on: boolean, me: Suggester | null): Transaction {
  return state.tr.setMeta(suggestKey, { on, me });
}

/** Whether this editor is suggesting, where inserting a page break, a note, contents or a chip is refused (and the person told). */
export function suggestingRefuses(editor: Editor): boolean {
  if (!suggestKey.getState(editor.state)?.on) return false;
  (editor.extensionManager.extensions.find((e) => e.name === "docSuggestions")?.options as { onRefused?: (why: Refusal) => void } | undefined)?.onRefused?.("block");
  return true;
}

/** What the person is told when a change cannot be suggested. */
export function refusalText(why: Refusal): string {
  if (why === "table") return t("Tables cannot be changed while suggesting: switch to Editing to add, remove or merge rows and columns");
  if (why === "image") return t("Pictures cannot be changed while suggesting: switch to Editing to move, resize or replace one");
  if (why === "block") return t("Page breaks, contents, footnotes, mentions and chips cannot be suggested: switch to Editing to add or remove one");
  return t("This change cannot be suggested: switch to Editing to make it");
}
