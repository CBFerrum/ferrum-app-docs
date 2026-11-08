// Mentions in the text (Ferrum collaboration.md, C3): a person or a record named inline with @.
//
// A mention is an inline node named `mention` holding its label as text ("@Ana Rao"). The platform
// reads exactly that shape: its HTML, Word and Markdown exports and the words kept for search all
// carry the label, and nothing else of it (kernel `coedit.rs` names `mention` for this). The node
// also carries what the label stands for: `kind` ("person" or "record"), `id` and, for a record, its
// `entity`. The page never stores an address, so a mention cannot send readers anywhere but to a
// record of this workspace (`/open/{entity}/{id}`, which the platform checks against their rights).

import { mergeAttributes, Node } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { type EditorState, NodeSelection } from "@tiptap/pm/state";
import { shell, t } from "@ferrum/client";

export type MentionKind = "person" | "record";

export interface MentionAttrs {
  kind: MentionKind;
  /** The person's id, or the record's. */
  id: string | null;
  /** The record's entity (`Customer`); none for a person. */
  entity: string | null;
}

const ID = /^[\w.-]{1,64}$/;
const ENTITY = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;

/** The page a mention opens: a record's, or nothing for a person. */
export function mentionTarget(a: Pick<MentionAttrs, "kind" | "id" | "entity">): { entity: string; id: string } | null {
  return a.kind === "record" && a.id && a.entity && ID.test(a.id) && ENTITY.test(a.entity) ? { entity: a.entity, id: a.id } : null;
}

/** Opens the record a mention names. */
export function openMention(a: MentionAttrs): boolean {
  const to = mentionTarget(a);
  return !!to && shell().navigate(to);
}

/** The mention right beside the caret, on the side `dir` (-1 before it, 1 after), as the range to take
 *  away: Backspace and Delete take a mention whole, whatever the browser would do with a unit it
 *  cannot edit. */
export function mentionBeside(state: EditorState, dir: -1 | 1): { from: number; to: number } | null {
  if (!state.selection.empty) return null;
  const $pos = state.selection.$from;
  const node = dir < 0 ? $pos.nodeBefore : $pos.nodeAfter;
  if (node?.type.name !== "mention") return null;
  const from = dir < 0 ? $pos.pos - node.nodeSize : $pos.pos;
  return { from, to: from + node.nodeSize };
}

export const Mention = Node.create({
  name: "mention",
  group: "inline",
  inline: true,
  // The label is the node's text, so the platform's exports and search read it; the node is still one
  // unit in the editor: the caret skips it, and Backspace takes all of it.
  content: "text*",
  marks: "",
  atom: true,
  selectable: true,
  // Not draggable, as for images: a draggable atom is not selected by a click in Chrome.
  draggable: false,

  addAttributes() {
    return {
      kind: { default: "person", parseHTML: (el: HTMLElement) => (el.getAttribute("data-mention") === "record" ? "record" : "person"), renderHTML: () => ({}) },
      id: {
        default: null,
        parseHTML: (el: HTMLElement) => {
          const id = el.getAttribute("data-id");
          return id && ID.test(id) ? id : null;
        },
        renderHTML: () => ({}),
      },
      entity: {
        default: null,
        parseHTML: (el: HTMLElement) => {
          const entity = el.getAttribute("data-entity");
          return entity && ENTITY.test(entity) ? entity : null;
        },
        renderHTML: () => ({}),
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-mention]" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const a = node.attrs as MentionAttrs;
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        class: `doc-mention doc-mention-${a.kind}`,
        "data-mention": a.kind,
        ...(a.id ? { "data-id": a.id } : {}),
        ...(a.entity ? { "data-entity": a.entity } : {}),
        contenteditable: "false",
      }),
      0,
    ];
  },

  renderText: ({ node }) => node.textContent,

  addKeyboardShortcuts() {
    const take = (dir: -1 | 1) => () => {
      const range = mentionBeside(this.editor.state, dir);
      return !!range && this.editor.commands.deleteRange(range);
    };
    return {
      Backspace: take(-1),
      Delete: take(1),
      // A selected record opens with Enter, as a link does with a click.
      Enter: ({ editor }) => {
        const sel = editor.state.selection;
        if (!(sel instanceof NodeSelection) || sel.node.type.name !== "mention") return false;
        return openMention(sel.node.attrs as MentionAttrs);
      },
    };
  },
});

export interface Found {
  attrs: MentionAttrs;
  label: string;
  /** Where the node starts. */
  pos: number;
}

/** The mentions in a document, in order. */
export function mentionsIn(doc: PMNode): Found[] {
  const out: Found[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== "mention") return true;
    out.push({ attrs: node.attrs as MentionAttrs, label: node.textContent, pos });
    return false;
  });
  return out;
}

const CONTEXT = 200;

/** The words around a place: its paragraph, cut to a window when it is long. */
export function contextOf(doc: PMNode, pos: number): string {
  const $pos = doc.resolve(pos);
  const text = $pos.parent.textContent.replace(/\s+/g, " ").trim();
  if (text.length <= CONTEXT) return text;
  const at = $pos.parent.textBetween(0, $pos.parentOffset, "", "").replace(/\s+/g, " ").trimStart().length;
  const from = Math.max(0, at - 80);
  const to = Math.min(text.length, from + CONTEXT);
  return `${from > 0 ? "…" : ""}${text.slice(from, to).trim()}${to < text.length ? "…" : ""}`;
}

/** A person picked from the menu, to be told once they are still mentioned. */
export interface Pending {
  id: string;
  email: string;
  name: string;
}

export interface Notice {
  person: Pending;
  /** The words around their mention. */
  context: string;
}

/** Who still needs telling: each pending person whose mention is in the text (once, however many
 *  times they are named), with the words around it. Someone whose mention was deleted again is not. */
export function planNotices(doc: PMNode, pending: ReadonlyMap<string, Pending>): Notice[] {
  const seen = new Set<string>();
  const out: Notice[] = [];
  for (const m of mentionsIn(doc)) {
    const person = m.attrs.kind === "person" && m.attrs.id ? pending.get(m.attrs.id) : undefined;
    if (!person || seen.has(person.id)) continue;
    seen.add(person.id);
    out.push({ person, context: contextOf(doc, m.pos) });
  }
  return out;
}

/** What the comment that tells someone says (their bell and mail show its first words). */
export const noticeBody = (context: string) => (context ? t("Mentioned in the text: “{context}”", { context }) : t("Mentioned in the text."));

/** The people whose name or address matches `query`, best first: a name starting with it, a word of
 *  the name or the address starting with it, then anywhere. */
export function findPeople<T extends { full_name: string; email: string }>(people: readonly T[], query: string, limit = 6): T[] {
  const q = query.trim().toLowerCase();
  const rank = (p: T) => {
    const name = (p.full_name || "").toLowerCase();
    const email = p.email.toLowerCase();
    if (!q) return 3;
    if (name.startsWith(q)) return 0;
    if (name.split(/\s+/).some((w) => w.startsWith(q)) || email.startsWith(q)) return 1;
    return name.includes(q) || email.includes(q) ? 2 : -1;
  };
  return people
    .map((p) => ({ p, r: rank(p) }))
    .filter((x) => x.r >= 0)
    .sort((a, b) => a.r - b.r || (a.p.full_name || a.p.email).localeCompare(b.p.full_name || b.p.email))
    .slice(0, limit)
    .map((x) => x.p);
}

/** The label a mention shows: "@" and the name. */
export const mentionLabel = (name: string) => `@${name.trim()}`;
