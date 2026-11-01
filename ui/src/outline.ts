// A long document's contents: its headings, in order, as a list to jump by and to see where you
// are. Pure, so what counts as a heading and which one is in view are tested without a browser.

import type { Node as PMNode } from "@tiptap/pm/model";

export interface Heading {
  /** Where the heading starts in the document. */
  pos: number;
  level: number;
  text: string;
}

/** The headings with words in them, in the order of the text (also those in quotes and lists). */
export function headingsOf(doc: PMNode): Heading[] {
  const out: Heading[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== "heading") return !node.isTextblock;
    const text = node.textContent.replace(/\s+/g, " ").trim();
    if (text) out.push({ pos, level: Math.min(6, Math.max(1, Number(node.attrs.level) || 1)), text });
    return false;
  });
  return out;
}

export const sameHeadings = (a: Heading[], b: Heading[] | null) =>
  !!b && a.length === b.length && a.every((h, i) => h.pos === b[i]!.pos && h.level === b[i]!.level && h.text === b[i]!.text);

/** How far in a heading sits: its level below the highest one used, so a document that starts at
 *  Heading 2 does not start indented. At most four steps. */
export function depthOf(headings: Heading[], heading: Heading): number {
  const top = Math.min(...headings.map((h) => h.level));
  return Math.min(4, heading.level - top);
}

/** The heading the reader is at: the last one whose top has reached `line` (counted from the top of
 *  the screen), else the first. */
export function headingInView(tops: number[], line: number): number {
  let at = 0;
  tops.forEach((top, i) => {
    if (top <= line) at = i;
  });
  return at;
}
