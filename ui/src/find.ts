// Find and replace in a document. The plugin keeps what is searched for and where it is, marks every
// match in the text and the one the bar is on, and follows everyone's typing; replacing is an
// ordinary change of the text (one undo step, and a suggestion while suggesting).

import { Extension } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { type EditorState, Plugin, PluginKey, type Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

export interface Match {
  from: number;
  to: number;
}

/** Matches past this many are not marked; the bar says "1000+". */
export const MAX_MATCHES = 1000;

/** Stands in for an inline node (a mention, a break) or struck-out words in a paragraph's text: no
 *  search matches it. */
const OBJECT = "￼";

/** Where `query` is in the text, in order, ignoring case unless asked. A match lies within one
 *  paragraph, across its marks. */
export function findMatches(doc: PMNode, query: string, matchCase: boolean, limit = MAX_MATCHES + 1): Match[] {
  if (!query) return [];
  let re: RegExp;
  try {
    re = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), matchCase ? "gu" : "giu");
  } catch {
    return [];
  }
  const out: Match[] = [];
  doc.descendants((block, pos) => {
    if (out.length >= limit) return false;
    if (!block.isTextblock) return true;
    let text = "";
    // Where each character of the text is in the document.
    const places: number[] = [];
    block.forEach((child, offset) => {
      if (child.isText) {
        for (let i = 0; i < child.text!.length; i++) places.push(pos + 1 + offset + i);
        // Words suggested for removal are struck out: what is replaced is not found again.
        text += child.marks.some((m) => m.type.name === "deletion") ? OBJECT.repeat(child.text!.length) : child.text;
      } else {
        places.push(pos + 1 + offset);
        text += OBJECT;
      }
    });
    for (const m of text.matchAll(re)) {
      if (m[0].includes(OBJECT)) continue;
      out.push({ from: places[m.index]!, to: places[m.index + m[0].length - 1]! + 1 });
      if (out.length >= limit) break;
    }
    return false;
  });
  return out;
}

export interface FindState {
  query: string;
  matchCase: boolean;
  matches: Match[];
  /** The match the bar is on; -1 when there is none. */
  current: number;
  /** There are more matches than are marked. */
  more: boolean;
  decos: DecorationSet;
}

export const findKey = new PluginKey<FindState>("docFind");

interface Change {
  query?: string;
  matchCase?: boolean;
  /** Go to this match (wrapping round). */
  current?: number;
}

/** A transaction that changes what is searched for or the match in view. */
export const setFind = (state: EditorState, change: Change): Transaction => state.tr.setMeta(findKey, change);

const wrap = (i: number, n: number) => (n ? ((i % n) + n) % n : -1);

function marks(doc: PMNode, matches: Match[], current: number): DecorationSet {
  return DecorationSet.create(
    doc,
    matches.slice(0, MAX_MATCHES).map((m, i) => Decoration.inline(m.from, m.to, { class: i === current ? "doc-found doc-found-current" : "doc-found" })),
  );
}

export function findPlugin(): Plugin<FindState> {
  return new Plugin<FindState>({
    key: findKey,
    state: {
      init: () => ({ query: "", matchCase: false, matches: [], current: -1, more: false, decos: DecorationSet.empty }),
      apply(tr, before, _old, state) {
        const change = tr.getMeta(findKey) as Change | undefined;
        if (!change && !tr.docChanged) return before;
        const query = change?.query ?? before.query;
        const matchCase = change?.matchCase ?? before.matchCase;
        const all = findMatches(state.doc, query, matchCase);
        const matches = all.slice(0, MAX_MATCHES);
        let current: number;
        if (change?.current !== undefined) current = wrap(change.current, matches.length);
        else if (!matches.length) current = -1;
        else {
          // A new search starts at the first match from the caret on; typing in the text keeps the match
          // nearest where the bar was.
          const from = change ? state.selection.from : tr.mapping.map(before.matches[before.current]?.from ?? 0);
          current = Math.max(0, matches.findIndex((m) => m.from >= from));
        }
        return { query, matchCase, matches, current, more: all.length > MAX_MATCHES, decos: marks(state.doc, matches, current) };
      },
    },
    props: { decorations: (state) => findKey.getState(state)?.decos ?? null },
  });
}

/** Replaces the match the bar is on; null when there is none. */
export function replaceOne(state: EditorState, replacement: string): Transaction | null {
  const st = findKey.getState(state);
  const m = st?.matches[st.current];
  return m ? state.tr.insertText(replacement, m.from, m.to) : null;
}

/** Replaces every match (also those past the marked ones), from the end so earlier places stand. */
export function replaceAll(state: EditorState, replacement: string): Transaction | null {
  const st = findKey.getState(state);
  if (!st?.query) return null;
  const all = findMatches(state.doc, st.query, st.matchCase, Infinity);
  if (!all.length) return null;
  const tr = state.tr;
  for (const m of all.reverse()) tr.insertText(replacement, m.from, m.to);
  return tr;
}

export const Find = Extension.create({
  name: "docFind",

  addProseMirrorPlugins() {
    return [findPlugin()];
  },
});
