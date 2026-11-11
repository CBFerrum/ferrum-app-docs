// What a link in a document can point at: a web page or an email address (as before), a heading in this
// document (`#` and the heading's anchor, set when the link is made: a link survives the heading moving
// or being renamed), or another Ferrum document (`/docs/d/` and its id). Anything else is refused: a
// reader could not follow it safely.

import type { Node as PMNode } from "@tiptap/pm/model";

const ANCHOR = /^#([a-z0-9]{6,24})$/i;
const DOC = /^\/docs\/d\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

export function cleanHref(raw: string): string | null {
  const href = raw.trim();
  if (!href) return null;
  if (ANCHOR.test(href) || DOC.test(href)) return href;
  if (/^(https?:|mailto:)/i.test(href)) return href;
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("/") || href.startsWith("#")) return null;
  return href.includes("@") && !href.includes("/") ? `mailto:${href}` : `https://${href}`;
}

export type Target = { kind: "heading"; anchor: string } | { kind: "doc"; id: string } | { kind: "web"; href: string };

export function targetOf(href: string): Target {
  const a = ANCHOR.exec(href);
  if (a) return { kind: "heading", anchor: a[1]! };
  const d = DOC.exec(href);
  if (d) return { kind: "doc", id: d[1]! };
  return { kind: "web", href };
}

export const docHref = (id: string) => `/docs/d/${id}`;

/** Where the heading with this anchor is. */
export function headingByAnchor(doc: PMNode, anchor: string): { pos: number; text: string } | null {
  let found: { pos: number; text: string } | null = null;
  doc.descendants((node, pos) => {
    if (found) return false;
    if (node.type.name === "heading" && node.attrs.anchor === anchor) found = { pos, text: node.textContent };
    return !node.isTextblock;
  });
  return found;
}
