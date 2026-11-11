// How many pages the document is, and where each one starts, found with the browser's own layout: the
// text is copied into a hidden box as wide as the page's text area, split into columns as tall as the
// page's text area (`column-fill: auto`), and each column is a page. Block fragmentation is one
// engine for columns and for printed pages (the same widows, orphans and `break-inside` rules), so a
// column is a page as the printer will cut it; a page break is `break-after: column` in the copy. The
// page numbers the printed margins show are the printer's own (CSS counters), never this count.
//
// The editing surface itself stays one continuous sheet: the places a page ends are drawn as rules in
// the text. (True pagination in the editor would have to move the text to fit what the printer does
// later, and could only guess at it; here the layout engine says.)

import { type PageSetup, dims, toPx } from "./page";

export interface Layout {
  /** The number of pages the printer will make. */
  pages: number;
  /** Where each page after the first starts, in px from the top of `sheet` (empty when the sheet is not at the paper's width, or a page starts at an explicit break). */
  marks: { page: number; top: number }[];
}

/** Which column a place is in, from its distance along the line of columns. */
export const columnOf = (distance: number, pitch: number) => Math.max(0, Math.floor(distance / pitch + 0.02));

const GAP = 48;

interface Leaf {
  node: Node;
  /** A text node, or an element that takes up room (a picture, a rule, a break, an empty line). */
  text: boolean;
}

const skipped = (n: Node) => !!(n.parentElement ?? (n as Element)).closest?.(".ProseMirror-widget, .collaboration-cursor__caret, .collaboration-cursor__label");

/** The places in a document's DOM that can say which page they are on, in order. */
function leavesOf(root: HTMLElement): Leaf[] {
  const out: Leaf[] = [];
  const walk = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    if (n.nodeType === Node.TEXT_NODE) {
      if ((n.textContent ?? "").trim() && !skipped(n)) out.push({ node: n, text: true });
    } else {
      const el = n as HTMLElement;
      if (skipped(el)) continue;
      if (el.matches("img, hr, .doc-page-break, br.ProseMirror-trailingBreak")) out.push({ node: el, text: false });
    }
  }
  return out;
}

const rectsOf = (l: Leaf): DOMRect[] => {
  if (!l.text) return [(l.node as Element).getBoundingClientRect()];
  const r = document.createRange();
  r.selectNodeContents(l.node);
  return Array.from(r.getClientRects()).filter((x) => x.width > 0 || x.height > 0);
};

const charRect = (node: Node, i: number): DOMRect | null => {
  const r = document.createRange();
  r.setStart(node, i);
  r.setEnd(node, i + 1);
  return r.getClientRects()[0] ?? null;
};

/** Waits for the pictures in `root` (a picture that has not loaded has no height yet), at most `ms`. */
async function pictures(root: HTMLElement, ms: number) {
  const waiting = Array.from(root.querySelectorAll("img")).filter((i) => !i.complete);
  if (!waiting.length) return;
  await Promise.race([Promise.all(waiting.map((i) => new Promise((ok) => (i.addEventListener("load", ok, { once: true }), i.addEventListener("error", ok, { once: true }))))), new Promise((ok) => setTimeout(ok, ms))]);
}

/** Lays the document out as the printer would. `live` is the editor's DOM, `sheet` the page it is drawn on
 *  (marks are measured from its top); with `marks` false only the count is worked out. Null when the live
 *  text changed while the pictures were loading (the caller measures again). */
export async function measure(live: HTMLElement, sheet: HTMLElement, setup: PageSetup, marks: boolean): Promise<Layout | null> {
  const [w, h] = dims(setup);
  const width = toPx(w - setup.left - setup.right);
  const height = toPx(h - setup.top - setup.bottom);
  const copy = live.cloneNode(true) as HTMLElement;
  copy.removeAttribute("contenteditable");
  copy.removeAttribute("id");
  copy.classList.add("doc-measure");
  copy.setAttribute("aria-hidden", "true");
  copy.setAttribute("inert", "");
  for (const w of copy.querySelectorAll(".ProseMirror-widget, .collaboration-cursor__caret")) w.remove();
  copy.style.cssText = `position:fixed;inset-block-start:0;inset-inline-start:0;box-sizing:content-box;inline-size:${width}px;block-size:${height}px;min-block-size:0;max-inline-size:none;margin:0;padding:0;column-width:${width}px;column-gap:${GAP}px;column-fill:auto;overflow:visible;visibility:hidden;pointer-events:none;`;
  const rtl = getComputedStyle(live).direction === "rtl";
  copy.dir = rtl ? "rtl" : "ltr";
  document.body.append(copy);
  try {
    await pictures(copy, 1500);
    const mine = leavesOf(copy);
    const yours = leavesOf(live);
    if (mine.length !== yours.length) return null;
    const box = copy.getBoundingClientRect();
    const pitch = width + GAP;
    const col = (r: DOMRect) => columnOf(rtl ? box.right - r.right : r.left - box.left, pitch);
    const top = sheet.getBoundingClientRect().top;
    const found: Layout["marks"] = [];
    let reached = 0;
    let before: Leaf | null = null;
    mine.forEach((leaf, i) => {
      const rects = rectsOf(leaf);
      if (rects.length) {
        const first = col(rects[0]!);
        const last = Math.max(first, col(rects.at(-1)!));
        for (let k = reached + 1; k <= last; k++) {
          let y: number | null = null;
          if (marks) {
            const at = yours[i]!;
            if (first >= k || !leaf.text) y = rectsOf(at)[0]?.top ?? null;
            else {
              // Inside this text: the first character that is in column k (columns follow the text in order).
              const len = leaf.node.textContent!.length;
              let lo = 0;
              let hi = len - 1;
              while (lo < hi) {
                const mid = (lo + hi) >> 1;
                const r = charRect(leaf.node, mid);
                if (r && col(r) >= k) hi = mid;
                else lo = mid + 1;
              }
              y = charRect(at.node, lo)?.top ?? null;
            }
          }
          // A page that starts right after an explicit break is marked by the break itself.
          const explicit = before && !before.text && (before.node as Element).matches(".doc-page-break") && k === first;
          if (y !== null && !explicit) found.push({ page: k + 1, top: Math.round(y - top) });
        }
        reached = Math.max(reached, last);
        before = leaf;
      }
    });
    return { pages: reached + 1, marks: found };
  } finally {
    copy.remove();
  }
}
