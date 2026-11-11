// Whether this client can read a document's stored content. Each release that adds nodes, marks or
// settings raises FORMAT, and a document records the highest format it uses in its shared page settings
// (the `format` key of the "page" map, written the first time a feature of that format is used). A client
// that sees a higher format than it knows, or a node or mark its schema does not have, must not draw the
// document at all: drawing what it can read would show an empty or partial page that says "Saved" and
// invite a write. It shows a clear state instead and stays read-only (LiveDoc.tsx, NewerFormat.tsx).
//
// The check reads the shared document and changes nothing in it. The editor is not bound to the shared
// content until the check has passed (LiveDoc.tsx), because binding is what projects, and a projection that
// fails is where an editor could discard what it cannot read.
//
//   1  Docs 0.7.13 and before: text, lists, tables, images, comments, suggestions.
//   2  Docs 0.8: fonts, sizes, colours, spacing, page setup, headers and footers, page breaks,
//      contents, footnotes (DOCS-STORED-FORMAT.md).

import type { Node as PMNode, Schema } from "@tiptap/pm/model";
import * as Y from "yjs";
import { pageMap } from "./page";

export const FORMAT = 2;

export const readFormat = (doc: Y.Doc): number => {
  const v = pageMap(doc).get("format");
  return typeof v === "number" && Number.isFinite(v) ? v : 1;
};

/** Records that this document uses format `FORMAT` features. */
export function stamp(doc: Y.Doc): void {
  if (readFormat(doc) < FORMAT) pageMap(doc).set("format", FORMAT);
}

/** The names of the nodes and marks in the shared text that `schema` does not have. Reads only. */
export function unknownIn(doc: Y.Doc, schema: Schema, field = "default"): string[] {
  const out = new Set<string>();
  const walk = (n: Y.XmlFragment | Y.XmlElement) => {
    for (const c of n.toArray()) {
      if (c instanceof Y.XmlText) {
        for (const op of c.toDelta() as { attributes?: Record<string, unknown> }[]) for (const m of Object.keys(op.attributes ?? {})) if (!schema.marks[m]) out.add(`mark ${m}`);
      } else if (c instanceof Y.XmlElement) {
        if (!schema.nodes[c.nodeName]) out.add(`node ${c.nodeName}`);
        walk(c);
      }
    }
  };
  walk(doc.getXmlFragment(field));
  return [...out];
}

export type Compat = { ok: true } | { ok: false; why: "newer-format" | "unknown-content"; unknown: string[] };

export function checkFormat(doc: Y.Doc, schema: Schema): Compat {
  const unknown = unknownIn(doc, schema);
  if (readFormat(doc) > FORMAT) return { ok: false, why: "newer-format", unknown };
  return unknown.length ? { ok: false, why: "unknown-content", unknown } : { ok: true };
}

const NODES = new Set(["pageBreak", "tableOfContents", "footnote", "footnoteRef"]);
const MARKS = new Set(["textStyle", "subscript", "superscript"]);

/** Whether the text uses something only format 2 clients can read. */
export function usesNewer(doc: PMNode): boolean {
  let found = false;
  doc.descendants((n) => {
    if (found) return false;
    if (NODES.has(n.type.name) || n.marks.some((m) => MARKS.has(m.type.name)) || n.attrs.lineHeight || n.attrs.indent || n.attrs.role || n.attrs.background) found = true;
    return !found;
  });
  return found;
}
