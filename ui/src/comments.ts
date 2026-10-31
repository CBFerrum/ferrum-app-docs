// Comments in the text of a live document (Ferrum collaboration.md, C3). Drive keeps them
// (`add_comment` with an `anchor`: where the text starts and ends, as Yjs relative positions, so the
// place moves with everyone's typing, and a `quote` of it); replies name their thread, and a thread is
// resolved when done. This marks open threads' text and says which one a click lands in.

import { Extension } from "@tiptap/core";
import { type EditorState, Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { absolutePositionToRelativePosition, relativePositionToAbsolutePosition, ySyncPluginKey } from "@tiptap/y-tiptap";
import * as Y from "yjs";

export interface Anchor {
  from: unknown;
  to: unknown;
}

/** A comment as Drive lists it. */
export interface DriveComment {
  id: string;
  author: string | null;
  body: string;
  created_at: string;
  mine: boolean;
  reply_to: string | null;
  anchor: Anchor | null;
  quote: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
}

export interface Thread {
  root: DriveComment;
  replies: DriveComment[];
}

/** Threads on the text, in the order they were started, each with its replies in order. */
export function textThreads(list: DriveComment[]): Thread[] {
  const roots = list.filter((c) => !c.reply_to && c.anchor);
  return roots.map((root) => ({ root, replies: list.filter((c) => c.reply_to === root.id) }));
}

/** The selection as a place for a comment, with the words it covers; null for an empty selection. */
export function anchorOf(state: EditorState): { anchor: Anchor; quote: string } | null {
  const { from, to, empty } = state.selection;
  if (empty) return null;
  const quote = state.doc.textBetween(from, to, " ").replace(/\s+/g, " ").trim().slice(0, 500);
  const y = ySyncPluginKey.getState(state);
  if (!quote || !y?.binding) return null;
  const at = (pos: number) => Y.relativePositionToJSON(absolutePositionToRelativePosition(pos, y.type, y.binding.mapping));
  return { anchor: { from: at(from), to: at(to) }, quote };
}

/** Where a comment's text is now; null when its text is gone. */
export function rangeOf(state: EditorState, anchor: Anchor): { from: number; to: number } | null {
  const y = ySyncPluginKey.getState(state);
  if (!y?.binding) return null;
  try {
    const at = (json: unknown) => relativePositionToAbsolutePosition(y.doc, y.type, Y.createRelativePositionFromJSON(json), y.binding.mapping);
    const from = at(anchor.from);
    const to = at(anchor.to);
    if (from === null || to === null || to <= from || to > state.doc.content.size) return null;
    return { from, to };
  } catch {
    return null;
  }
}

interface Marked {
  /** Open threads on the text. */
  threads: { id: string; anchor: Anchor }[];
  /** The thread in view. */
  active: string | null;
  /** Their words, marked. */
  decos: DecorationSet;
}

export const commentsKey = new PluginKey<Marked>("docComments");

/** The marks of `threads` in `state`, from their anchors (where Yjs and the editor agree). */
function marks(state: EditorState, threads: Marked["threads"], active: string | null): DecorationSet {
  const found: Decoration[] = [];
  for (const t of threads) {
    const r = rangeOf(state, t.anchor);
    if (r) found.push(Decoration.inline(r.from, r.to, { class: t.id === active ? "doc-comment doc-comment-active" : "doc-comment", "data-comment": t.id }, { id: t.id }));
  }
  return DecorationSet.create(state.doc, found);
}

export const DocComments = Extension.create<{ onActivate: (id: string | null) => void }>({
  name: "docComments",

  addOptions() {
    return { onActivate: () => undefined };
  },

  addProseMirrorPlugins() {
    const options = this.options;
    return [
      new Plugin<Marked>({
        key: commentsKey,
        state: {
          init: () => ({ threads: [], active: null, decos: DecorationSet.empty }),
          apply(tr, before, _old, state) {
            const set = tr.getMeta(commentsKey) as Omit<Marked, "decos"> | undefined;
            if (set) return { ...set, decos: marks(state, set.threads, set.active) };
            if (!tr.docChanged || !before.threads.length) return before;
            // Changes from Yjs (others' typing, the first load): the anchors say where the words are.
            // Changes typed here: the marks move with the editor's steps (Yjs catches up after).
            const fromYjs = (tr.getMeta(ySyncPluginKey) as { isChangeOrigin?: boolean } | undefined)?.isChangeOrigin;
            return { ...before, decos: fromYjs ? marks(state, before.threads, before.active) : before.decos.map(tr.mapping, tr.doc) };
          },
        },
        props: {
          decorations: (state) => commentsKey.getState(state)?.decos ?? null,
          handleClick(view, pos) {
            const marked = commentsKey.getState(view.state);
            if (!marked?.threads.length) return false;
            const hit = marked.decos.find(pos, pos)[0];
            options.onActivate((hit?.spec as { id?: string } | undefined)?.id ?? null);
            return false;
          },
        },
      }),
    ];
  },
});
