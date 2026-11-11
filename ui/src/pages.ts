// What makes a document a set of pages, in the text itself (the page's size and margins are page.ts,
// the header and footer regions.ts): page breaks, an inserted table of contents, footnotes, heading
// anchors and the Title and Subtitle styles. Everything stored is a plain node or attribute, never a
// style string, and every value is checked when it is read.
//
// An older client does not know these nodes. y-tiptap cannot project them ("There is no node type
// footnote"), so such a client fails to open the document and leaves the shared text as it is (see
// pages.test.ts); it never writes a version of the text without them.

import { type Editor, Extension, Node, mergeAttributes } from "@tiptap/core";
import { Document } from "@tiptap/extension-document";
import { Fragment, type Node as PMNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, TextSelection, type Transaction, type EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import { ySyncPluginKey } from "@tiptap/y-tiptap";
import { t } from "@ferrum/client";
import { headingsOf } from "./outline";
import { suggestKey, suggestingRefuses } from "./suggest";

const ID = /^[a-z0-9]{6,24}$/i;
/** A short random id for a footnote or a heading anchor. */
export const newId = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => (b % 36).toString(36)).join("");
export const cleanId = (v: unknown): string | null => (typeof v === "string" && ID.test(v) ? v : null);

// ── the document: blocks, then the footnotes ──

/** The text, then the footnotes' bodies (a body is a few paragraphs, one per footnote reference). */
export const DocWithNotes = Document.extend({ content: "block+ footnote*" });

// ── page break ──

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    docPages: {
      insertPageBreak: () => ReturnType;
      insertContents: () => ReturnType;
      /** Puts a footnote reference at the caret; the body is made at the end of the document. */
      insertFootnote: (id?: string) => ReturnType;
      /** Gives the paragraph a role: Title, Subtitle or none. */
      setParagraphRole: (role: "title" | "subtitle" | null) => ReturnType;
    };
  }
}

export const PageBreak = Node.create({
  name: "pageBreak",
  group: "block",
  atom: true,
  selectable: true,
  draggable: false,
  parseHTML() {
    return [{ tag: "div[data-page-break]" }, { tag: "hr[data-page-break]" }, { tag: 'br[style*="page-break-before"]', priority: 60 }, { tag: 'p[style*="page-break-before:always" i]:empty', priority: 60 }];
  },
  renderHTML() {
    return ["div", { "data-page-break": "", class: "doc-page-break", "data-label": t("Page break") }];
  },
  addCommands() {
    return {
      insertPageBreak:
        () =>
        ({ tr, dispatch, state, editor }) => {
          if (dispatch && suggestingRefuses(editor)) return false;
          const type = state.schema.nodes.pageBreak!;
          // Not in a footnote: the notes are the end of the document, nothing goes after them.
          for (let d = state.selection.$from.depth; d > 0; d--) if (state.selection.$from.node(d).type.name === "footnote") return false;
          // Only between the document's own blocks: a break inside a table or a list goes after it.
          tr.deleteSelection();
          const at = tr.selection.$from;
          let pos: number;
          if (at.depth === 1 && at.parent.isTextblock) {
            tr.split(at.pos, 1, at.parentOffset === at.parent.content.size ? [{ type: state.schema.nodes.paragraph! }] : undefined);
            pos = at.pos + 1;
          } else pos = at.depth >= 1 ? at.after(1) : at.pos;
          tr.insert(pos, type.create());
          // The caret goes to the text after the break (a new paragraph when nothing follows).
          const after = pos + 1;
          if (!tr.doc.resolve(after).nodeAfter?.isTextblock) tr.insert(after, state.schema.nodes.paragraph!.create());
          tr.setSelection(TextSelection.near(tr.doc.resolve(after + 1)));
          if (dispatch) dispatch(tr.scrollIntoView());
          return true;
        },
    };
  },
  // Mod-Enter, the page break in a word processor (StarterKit's hard break has it otherwise), is in keys.ts.
});

// ── table of contents ──

export const MAX_LEVELS = 6;

export const TableOfContents = Node.create({
  name: "tableOfContents",
  group: "block",
  atom: true,
  selectable: true,
  draggable: false,
  addAttributes() {
    return {
      // The deepest heading level listed (1 to 6).
      levels: {
        default: 3,
        parseHTML: (el: HTMLElement) => {
          const n = Number(el.getAttribute("data-levels"));
          return Number.isInteger(n) && n >= 1 && n <= MAX_LEVELS ? n : 3;
        },
        renderHTML: (a: Record<string, unknown>) => ({ "data-levels": String(Number.isInteger(a.levels) && (a.levels as number) >= 1 && (a.levels as number) <= MAX_LEVELS ? a.levels : 3) }),
      },
    };
  },
  parseHTML() {
    return [{ tag: "nav[data-toc]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["nav", mergeAttributes(HTMLAttributes, { "data-toc": "", class: "doc-contents", "aria-label": t("Contents") })];
  },
  addCommands() {
    return {
      insertContents:
        () =>
        ({ commands, editor, dispatch }) => (dispatch && suggestingRefuses(editor) ? false : commands.insertContent({ type: "tableOfContents" })),
    };
  },
});

/** Fills each contents block with the headings it lists (as links that jump), and jumps on a click. The
 *  list is drawn from the text each time it changes: the block stores no headings of its own, so it is
 *  always as current as the text (and a reader of an old version sees that version's). */
export function contentsPlugin(): Plugin {
  const fill = (view: EditorView) => {
    const navs = view.dom.querySelectorAll<HTMLElement>("nav[data-toc]");
    if (!navs.length) return;
    const headings = headingsOf(view.state.doc);
    for (const nav of navs) {
      const levels = Number(nav.getAttribute("data-levels")) || 3;
      const shown = headings.filter((h) => h.level <= levels);
      const key = JSON.stringify(shown.map((h) => [h.level, h.text]));
      if (nav.dataset.filled === key) continue;
      nav.dataset.filled = key;
      nav.textContent = "";
      const title = nav.ownerDocument.createElement("div");
      title.className = "doc-contents-title";
      title.textContent = t("Contents");
      nav.append(title);
      if (!shown.length) {
        const none = nav.ownerDocument.createElement("div");
        none.className = "doc-contents-none";
        none.textContent = t("Headings in the document will be listed here.");
        nav.append(none);
        continue;
      }
      const top = Math.min(...shown.map((h) => h.level));
      for (const h of shown) {
        const a = nav.ownerDocument.createElement("a");
        a.className = `doc-contents-item doc-contents-l${Math.min(5, h.level - top + 1)}`;
        a.setAttribute("href", `#heading-${headings.indexOf(h) + 1}`);
        a.dataset.heading = String(headings.indexOf(h));
        a.textContent = h.text;
        nav.append(a);
      }
    }
  };
  return new Plugin({
    key: new PluginKey("docContents"),
    view(view) {
      queueMicrotask(() => fill(view));
      return {
        update(v, prev) {
          if (v.state.doc !== prev.doc || !prev.doc.eq(v.state.doc)) fill(v);
        },
      };
    },
    props: {
      handleDOMEvents: {
        click(view, event) {
          const a = (event.target as HTMLElement | null)?.closest<HTMLElement>("nav[data-toc] a[data-heading]");
          if (!a) return false;
          event.preventDefault();
          const h = headingsOf(view.state.doc)[Number(a.dataset.heading)];
          if (!h) return true;
          goTo(view, h.pos);
          return true;
        },
      },
    },
  });
}

/** Brings the text at `pos` into view with the caret in it. */
export function goTo(view: EditorView, pos: number) {
  try {
    const tr = view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(Math.min(pos + 1, view.state.doc.content.size)))).scrollIntoView();
    view.dispatch(tr);
    const el = view.nodeDOM(pos);
    const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (el instanceof HTMLElement) el.scrollIntoView({ block: "start", behavior: calm ? "auto" : "smooth" });
    if (view.editable) view.focus();
  } catch {
    // A heading that is gone: nothing to jump to.
  }
}

// ── footnotes ──

export const FootnoteRef = Node.create({
  name: "footnoteRef",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (el: HTMLElement) => cleanId(el.getAttribute("data-footnote")),
        renderHTML: (a: Record<string, unknown>) => (cleanId(a.id) ? { "data-footnote": cleanId(a.id)! } : {}),
      },
    };
  },
  parseHTML() {
    return [{ tag: "sup[data-footnote]", priority: 100 }];
  },
  // The number is drawn by a CSS counter, in the order the references are in the text.
  renderHTML({ HTMLAttributes }) {
    return ["sup", mergeAttributes(HTMLAttributes, { class: "doc-fn-ref", title: t("Footnote") })];
  },
});

export const Footnote = Node.create({
  name: "footnote",
  group: "",
  content: "paragraph+",
  isolating: true,
  defining: true,
  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (el: HTMLElement) => cleanId(el.getAttribute("data-footnote-body")),
        renderHTML: (a: Record<string, unknown>) => (cleanId(a.id) ? { "data-footnote-body": cleanId(a.id)! } : {}),
      },
    };
  },
  parseHTML() {
    return [{ tag: "div[data-footnote-body]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { class: "doc-footnote" }), 0];
  },
});

interface Notes {
  /** Reference ids in the order of the text (null: no id yet). */
  refs: { id: string | null; pos: number }[];
  bodies: { id: string | null; pos: number; node: PMNode }[];
  /** Where the bodies begin (the end of the document when there are none). */
  tail: number;
}

function scan(doc: PMNode): Notes {
  const refs: Notes["refs"] = [];
  const bodies: Notes["bodies"] = [];
  let tail = doc.content.size;
  doc.forEach((child, offset) => {
    if (child.type.name === "footnote") {
      if (tail === doc.content.size) tail = offset;
      bodies.push({ id: child.attrs.id as string | null, pos: offset, node: child });
    }
  });
  doc.descendants((node, pos) => {
    if (node.type.name === "footnote") return false;
    if (node.type.name === "footnoteRef") refs.push({ id: node.attrs.id as string | null, pos });
    return true;
  });
  return { refs, bodies, tail };
}

/** The transaction that makes the footnotes agree with their references, or null when they do:
 *  every reference has an id of its own and one body (a copied reference gets a copy of the body), a
 *  body without a reference goes, and the bodies are in the order of the references. */
export function settleNotes(state: EditorState): Transaction | null {
  const { schema, doc } = state;
  const { refs, bodies, tail } = scan(doc);
  const type = schema.nodes.footnote;
  if (!type) return null;
  const tr = state.tr;
  const used = new Set<string>();
  const copies = new Map<string, string>();
  const order: string[] = [];
  for (const r of refs) {
    let id = cleanId(r.id);
    if (!id || used.has(id)) {
      const old = id;
      id = newId();
      if (old) copies.set(id, old);
      tr.setNodeMarkup(r.pos, undefined, { id });
    }
    used.add(id);
    order.push(id);
  }
  const have = new Map<string, PMNode>();
  for (const b of bodies) if (b.id && !have.has(b.id)) have.set(b.id, b.node);
  const want = order.map((id) => {
    const existing = have.get(id);
    if (existing) return existing;
    const from = copies.get(id);
    const source = from ? have.get(from) : null;
    return type.create({ id }, source ? source.content : schema.nodes.paragraph!.create());
  });
  const same = want.length === bodies.length && want.every((n, i) => n === bodies[i]!.node);
  if (!same) tr.replaceWith(tail, doc.content.size, Fragment.from(want));
  // The text always ends in a paragraph to type in (the editor's own trailing node cannot know the notes follow).
  const last = tail > 0 ? doc.resolve(tail).nodeBefore : null;
  if (last && last.type.name !== "paragraph") tr.insert(tail, schema.nodes.paragraph!.create());
  // Keeping the notes in step is not anyone's proposal: suggesting does not track it.
  return tr.docChanged ? tr.setMeta(suggestKey, { applied: true }) : null;
}

/** Notes: keeps bodies and references in step (for changes made here: others' changes arrive already
 *  in step), and numbers the bodies in the order of their references. */
export function notesPlugin(): Plugin {
  const numbers = (doc: PMNode) => {
    const { refs, bodies } = scan(doc);
    const n = new Map<string, number>();
    refs.forEach((r, i) => r.id && !n.has(r.id) && n.set(r.id, i + 1));
    const out: Decoration[] = [];
    bodies.forEach((b, i) => out.push(Decoration.node(b.pos, b.pos + b.node.nodeSize, { "data-n": String(n.get(b.id ?? "") ?? "?"), ...(i === 0 ? { class: "doc-footnote-first" } : {}) })));
    return DecorationSet.create(doc, out);
  };
  return new Plugin({
    key: new PluginKey("docNotes"),
    state: {
      init: (_c, s) => numbers(s.doc),
      apply: (tr, old, _o, s) => (tr.docChanged ? numbers(s.doc) : old),
    },
    props: {
      decorations(state) {
        return this.getState(state);
      },
      handleClick(view, _pos, event) {
        const ref = (event.target as HTMLElement | null)?.closest<HTMLElement>("sup.doc-fn-ref");
        const id = ref?.getAttribute("data-footnote");
        if (!id) return false;
        const at = footnotePos(view.state.doc, id);
        if (at === null) return false;
        goTo(view, at + 1);
        return true;
      },
    },
    appendTransaction(trs, _old, state) {
      // Only for changes typed here; those that arrive from others (or an undo) were made in step.
      const local = trs.some((tr) => tr.docChanged && !tr.getMeta(ySyncPluginKey)?.isChangeOrigin);
      return local ? settleNotes(state) : null;
    },
  });
}

/** Where the body of footnote `id` starts, if it has one. */
export function footnotePos(doc: PMNode, id: string): number | null {
  let at: number | null = null;
  doc.forEach((n, pos) => {
    if (at === null && n.type.name === "footnote" && n.attrs.id === id) at = pos;
  });
  return at;
}

// ── structure: heading anchors, Title and Subtitle ──

export const ROLES = ["title", "subtitle"] as const;
export const cleanRole = (v: unknown) => ((ROLES as readonly string[]).includes(v as string) ? (v as (typeof ROLES)[number]) : null);

export const Structure = Extension.create({
  name: "docStructure",
  addGlobalAttributes() {
    return [
      {
        types: ["heading"],
        attributes: {
          // Set when something links to the heading; a link names it by this, not by its place.
          anchor: {
            default: null,
            // An anchor comes from the document it was made in, never from the clipboard (a copy would have two).
            parseHTML: () => null,
            renderHTML: (a: Record<string, unknown>) => (cleanId(a.anchor) ? { "data-anchor": cleanId(a.anchor)! } : {}),
          },
        },
      },
      {
        types: ["paragraph"],
        attributes: {
          role: {
            default: null,
            parseHTML: (el: HTMLElement) => cleanRole(el.getAttribute("data-role")),
            renderHTML: (a: Record<string, unknown>) => (cleanRole(a.role) ? { "data-role": cleanRole(a.role)! } : {}),
          },
        },
      },
    ];
  },
  addCommands() {
    return {
      setParagraphRole:
        (role) =>
        ({ chain }) =>
          chain().setParagraph().updateAttributes("paragraph", { role: cleanRole(role) }).run(),
      insertFootnote:
        (id) =>
        ({ state, tr, dispatch, editor }) => {
          const { $from } = state.selection;
          if (dispatch && suggestingRefuses(editor)) return false;
          for (let d = $from.depth; d > 0; d--) if ($from.node(d).type.name === "footnote") return false;
          if (dispatch) {
            tr.replaceSelectionWith(state.schema.nodes.footnoteRef!.create({ id: cleanId(id) ?? newId() }), false);
            dispatch(tr.scrollIntoView());
          }
          return true;
        },
    };
  },
});

/** A footnote reference at the caret, and the caret in its body at the end of the document, to type the note. */
export function insertFootnoteAndJump(editor: Editor): boolean {
  const id = newId();
  if (!editor.commands.insertFootnote(id)) return false;
  const at = footnotePos(editor.state.doc, id);
  if (at !== null) goTo(editor.view, at + 1);
  return true;
}

/** The plugins that draw what the text keeps: the contents' lists, the footnotes' numbers. The history of
 *  a document (a reader with no editor) takes them too. */
export const viewPlugins = () => [contentsPlugin(), notesPlugin()];

export const PagesExtension = Extension.create({
  name: "docPages",
  addProseMirrorPlugins() {
    return viewPlugins();
  },
});

/** The extensions of this file, for the schema. */
export const pagesExtensions = () => [PageBreak, TableOfContents, FootnoteRef, Footnote, Structure, PagesExtension];
