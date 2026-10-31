// Suggestions in a live document (Ferrum collaboration.md, C3): with Suggesting on, an editor's
// typing does not change the text; it proposes. New words carry an `insertion` mark and removed
// words stay, struck through, with a `deletion` mark, each with who, when and an id (a replacement
// shares one id). Whoever may edit accepts or rejects a suggestion. The marks live in the shared
// document, so everyone sees them at once, and the server's exports show them (HTML ins/del, Word's
// tracked changes).
//
// Suggesting tracks words. Formatting and structure (lists, headings, a paragraph joined) are refused
// while suggesting: a mark cannot carry them. A new paragraph (Enter) is let through.

import { Extension, Mark, mergeAttributes } from "@tiptap/core";
import { Fragment, type MarkType, type Node as PMNode, Slice } from "@tiptap/pm/model";
import { type EditorState, Plugin, PluginKey, TextSelection, type Transaction } from "@tiptap/pm/state";
import { ReplaceStep } from "@tiptap/pm/transform";
import { ySyncPluginKey } from "@tiptap/y-tiptap";

export interface Suggester {
  id: string;
  name: string;
}

interface SuggestState {
  on: boolean;
  me: Suggester | null;
}

export const suggestKey = new PluginKey<SuggestState>("docSuggest");
/** On a deletion made while suggesting: it went backward (Backspace), so the caret goes before the
 *  words it struck rather than after them. */
export const BACKWARD = "docSuggestBackward";

const attrs = {
  id: { default: null },
  user: { default: null },
  name: { default: "" },
  at: { default: null },
};

function suggestionMark(name: "insertion" | "deletion", tag: "ins" | "del") {
  return Mark.create({
    name,
    inclusive: false,
    // One suggestion per character (the default), which also keeps the mark's name plain in the
    // shared document (y-prosemirror suffixes marks that may overlap), as the server reads it.
    addAttributes: () => attrs,
    parseHTML: () => [{ tag: `${tag}[data-suggestion]`, getAttrs: (el) => ({ id: el.getAttribute("data-suggestion"), user: el.getAttribute("data-user"), name: el.getAttribute("data-name") ?? "", at: el.getAttribute("data-at") }) }],
    renderHTML: ({ mark, HTMLAttributes }) => [
      tag,
      mergeAttributes(HTMLAttributes, {
        "data-suggestion": mark.attrs.id,
        "data-user": mark.attrs.user,
        "data-name": mark.attrs.name,
        "data-at": mark.attrs.at,
        class: name === "insertion" ? "doc-ins" : "doc-del",
        title: `${name === "insertion" ? "Suggested" : "Suggested removing"} by ${mark.attrs.name || "someone"}`,
      }),
      0,
    ],
  });
}

export const Insertion = suggestionMark("insertion", "ins");
export const Deletion = suggestionMark("deletion", "del");

const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);

/** A suggestion of `me` beside `pos` (its id and time), to grow it rather than start another. */
function neighbour(doc: PMNode, pos: number, type: MarkType, me: Suggester): { id: string; at: string } | null {
  const $pos = doc.resolve(Math.max(0, Math.min(pos, doc.content.size)));
  for (const node of [$pos.nodeBefore, $pos.nodeAfter]) {
    const mark = node?.marks.find((m) => m.type === type && m.attrs.user === me.id);
    if (mark) return { id: mark.attrs.id as string, at: mark.attrs.at as string };
  }
  return null;
}

/** The removed content to put back, without words `me` had only suggested (deleting your own
 *  suggestion takes it away for good). Null when nothing is left to put back. */
function keep(slice: Slice, me: Suggester, insertion: MarkType): Slice | null {
  let kept = false;
  const content: PMNode[] = [];
  slice.content.forEach((n) => content.push(n));
  const inline = content.every((n) => n.isInline);
  if (!inline) return slice.size ? slice : null;
  const left = content.filter((n) => !(n.isText && n.marks.some((m) => m.type === insertion && m.attrs.user === me.id)));
  kept = left.length > 0;
  return kept ? new Slice(Fragment.from(left), 0, 0) : null;
}

/** Turns an editor's change into a suggestion (see the top of this file). */
function suggest(trs: readonly Transaction[], state: EditorState, me: Suggester): Transaction | null {
  const insertion = state.schema.marks.insertion!;
  const deletion = state.schema.marks.deletion!;
  const mine = trs.filter((tr) => tr.docChanged && !tr.getMeta(suggestKey) && !(tr.getMeta(ySyncPluginKey) as { isChangeOrigin?: boolean } | undefined)?.isChangeOrigin);
  if (!mine.length) return null;
  const out = state.tr.setMeta(suggestKey, { applied: true });
  const steps = mine.flatMap((tr) => tr.steps.map((step, i) => ({ tr, step, i })));
  // Only words can be suggested: anything else is undone, and the editor says so.
  const words = steps.every(({ step, tr, i }) => {
    if (!(step instanceof ReplaceStep)) return false;
    const { from, to, slice } = step as ReplaceStep & { from: number; to: number; slice: Slice };
    // A new paragraph is fine; joining two (a paragraph boundary removed) is not.
    const removed = tr.docs[i]!.slice(from, to);
    return removed.openStart === removed.openEnd || (slice.size === 0 && removed.content.childCount === 0);
  });
  if (!words) {
    for (const tr of [...mine].reverse()) for (let i = tr.steps.length - 1; i >= 0; i--) out.step(tr.steps[i]!.invert(tr.docs[i]!));
    return out.setMeta(suggestKey, { applied: true, refused: true });
  }
  const now = new Date().toISOString();
  let caret: number | null = null;
  // Each change: where it starts in the final document, what was removed and how much was added.
  steps.forEach(({ tr, step, i }, n) => {
    const { from, to, slice } = step as ReplaceStep & { from: number; to: number; slice: Slice };
    const removed = tr.docs[i]!.slice(from, to);
    // From after this step to the end of all of them, then through what was done here so far.
    let start = from;
    for (const later of steps.slice(n + 1)) start = later.step.getMap().map(start, -1);
    start = out.mapping.map(start, -1);
    const added = slice.size;
    // Next to your own suggestion it grows, keeping its id and time (typing over words you struck
    // is one replacement), so its words stay one run.
    const { id, at } = neighbour(out.doc, start, deletion, me) ?? neighbour(out.doc, start, insertion, me) ?? { id: newId(), at: now };
    const mark = (type: MarkType) => type.create({ id, user: me.id, name: me.name, at });
    let back = 0;
    const putBack = removed.size ? keep(removed, me, insertion) : null;
    if (putBack) {
      out.replace(start, start, putBack);
      back = putBack.size;
      // Words already proposed for removal keep who proposed it.
      out.doc.nodesBetween(start, start + back, (node, pos) => {
        if (node.isText && !node.marks.some((m) => m.type === deletion)) out.addMark(Math.max(pos, start), Math.min(pos + node.nodeSize, start + back), mark(deletion));
      });
      out.removeMark(start, start + back, insertion);
    }
    if (added) {
      out.removeMark(start + back, start + back + added, deletion);
      out.addMark(start + back, start + back + added, mark(insertion));
    }
    // Backspace leaves the caret before the words it struck; anything else, after the change.
    caret = !added && back && tr.getMeta(BACKWARD) ? start : start + back + added;
  });
  if (caret !== null) out.setSelection(TextSelection.near(out.doc.resolve(Math.min(caret, out.doc.content.size))));
  return out;
}

/** The suggestions in a document: who, when, what was added and removed, and where. */
export interface Suggestion {
  id: string;
  user: string;
  name: string;
  at: string | null;
  inserted: string;
  deleted: string;
  from: number;
  to: number;
}

export function suggestionsIn(doc: PMNode): Suggestion[] {
  const found = new Map<string, Suggestion>();
  doc.descendants((node, pos) => {
    if (!node.isText) return;
    for (const m of node.marks) {
      if (m.type.name !== "insertion" && m.type.name !== "deletion") continue;
      const id = m.attrs.id as string;
      const s = found.get(id) ?? { id, user: m.attrs.user, name: m.attrs.name, at: m.attrs.at, inserted: "", deleted: "", from: pos, to: pos + node.nodeSize };
      if (m.type.name === "insertion") s.inserted += node.text;
      else s.deleted += node.text;
      s.from = Math.min(s.from, pos);
      s.to = Math.max(s.to, pos + node.nodeSize);
      found.set(id, s);
    }
  });
  return [...found.values()].sort((a, b) => a.from - b.from);
}

/** Accepts (the proposal becomes the text) or rejects (it goes) suggestion `id`. */
export function settle(state: EditorState, id: string, accept: boolean): Transaction {
  const tr = state.tr.setMeta(suggestKey, { applied: true });
  const drop: [number, number][] = [];
  const unmark: [number, number, MarkType][] = [];
  state.doc.descendants((node, pos) => {
    if (!node.isText) return;
    for (const m of node.marks) {
      if (m.attrs.id !== id || (m.type.name !== "insertion" && m.type.name !== "deletion")) continue;
      const range: [number, number] = [pos, pos + node.nodeSize];
      if ((m.type.name === "insertion") === accept) unmark.push([...range, m.type]);
      else drop.push(range);
    }
  });
  for (const [from, to, type] of unmark) tr.removeMark(from, to, type);
  for (const [from, to] of drop.sort((a, b) => b[0] - a[0])) tr.delete(from, to);
  return tr;
}

/** The plugin behind Suggesting; `onRefused` hears of changes that cannot be suggested. */
export function suggestPlugin(onRefused: () => void): Plugin<SuggestState> {
  return new Plugin<SuggestState>({
    key: suggestKey,
    state: {
      init: () => ({ on: false, me: null }),
      apply: (tr, before) => {
        const set = tr.getMeta(suggestKey) as Partial<SuggestState> | undefined;
        return set && "on" in set ? { on: !!set.on, me: set.me ?? before.me } : before;
      },
    },
    appendTransaction(trs, _before, state) {
      const st = suggestKey.getState(state);
      if (!st?.on || !st.me) return null;
      const out = suggest(trs, state, st.me);
      if ((out?.getMeta(suggestKey) as { refused?: boolean } | undefined)?.refused) queueMicrotask(onRefused);
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
export const Suggestions = Extension.create<{ onRefused: () => void }>({
  name: "docSuggestions",

  addOptions() {
    return { onRefused: () => undefined };
  },

  addProseMirrorPlugins() {
    return [suggestPlugin(() => this.options.onRefused())];
  },
});

/** Turns suggesting on or off. */
export function setSuggesting(state: EditorState, on: boolean, me: Suggester | null): Transaction {
  return state.tr.setMeta(suggestKey, { on, me });
}
