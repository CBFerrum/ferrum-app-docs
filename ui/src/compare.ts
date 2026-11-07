// Comparing two versions of a document: which words were added and which removed, as places in each
// document, so the version history can mark them in the text itself.
//
// A document is read as lines, one per paragraph, heading, list item or cell, with where each one
// sits (its ancestors) and its words. Lines are matched the way a diff matches text; where several
// were rewritten, the old and new lines that say much the same are paired and their words compared;
// the rest are wholly removed or added. Formatting inside a line (bold, links) is not compared.

import type { Node as PMNode } from "@tiptap/pm/model";
import { t as tr } from "@ferrum/client";

/** A stretch of a document, in its positions. */
export interface Range {
  from: number;
  to: number;
}

/** One change: where it is in the older text and in the newer (empty where nothing is on that side). */
export interface Change {
  older: Range;
  newer: Range;
}

export interface Comparison {
  /** Words only the older text has, in the older text. */
  removed: Range[];
  /** Words only the newer text has, in the newer text. */
  added: Range[];
  /** The changes in order, for stepping through them. */
  changes: Change[];
  wordsAdded: number;
  wordsRemoved: number;
}

interface Line {
  /** Where it is (its ancestors and level) with its words: lines are matched by this. */
  key: string;
  text: string;
  start: number;
  end: number;
  /** For each boundary between its characters (0 to length): the position a range starting there
   *  begins at, and a range ending there ends at (inside an inline node, round out to the node). */
  lo: number[];
  hi: number[];
}

const OBJECT = "￼";

/** The lines of a document: its text blocks, and the pictures and rules between them. */
export function linesOf(doc: PMNode): Line[] {
  const out: Line[] = [];
  doc.descendants((block, pos) => {
    if (block.isTextblock) {
      const $pos = doc.resolve(pos);
      let where = "";
      for (let d = 1; d <= $pos.depth; d++) where += `${$pos.node(d).type.name}>`;
      where += block.type.name + (block.type.name === "heading" ? String(block.attrs.level) : "");
      let text = "";
      const lo = [pos + 1];
      const hi = [pos + 1];
      block.forEach((child, offset) => {
        const at = pos + 1 + offset;
        if (child.isText) {
          for (let i = 1; i <= child.text!.length; i++) {
            lo.push(at + i);
            hi.push(at + i);
          }
          text += child.text;
          return;
        }
        // A mention or a break: its words count, but it is one unit in the text.
        const words = child.type.name === "hardBreak" ? "\n" : child.textContent || OBJECT;
        for (let i = 1; i < words.length; i++) {
          lo.push(at);
          hi.push(at + child.nodeSize);
        }
        lo.push(at + child.nodeSize);
        hi.push(at + child.nodeSize);
        text += words;
      });
      out.push({ key: `${where}\u0001${text}`, text, start: pos + 1, end: pos + 1 + block.content.size, lo, hi });
      return false;
    }
    if (block.isLeaf && block.isBlock) {
      const text = block.type.name === "image" ? tr("[image {value}]", { value: String(block.attrs.image ?? "") }) : `[${block.type.name}]`;
      const end = pos + block.nodeSize;
      const after = new Array<number>(text.length).fill(end);
      out.push({ key: `${block.type.name}\u0001${text}`, text, start: pos, end, lo: [pos, ...after], hi: [end, ...after] });
      return false;
    }
    return true;
  });
  return out;
}

/** The pairs of equal places `[i, j]` of two sequences, in order, as many as can be (a longest
 *  common subsequence), by Myers' O(ND) method; null when they differ by more than `maxD` places. */
function myers(a: string[], b: string[], maxD: number): [number, number][] | null {
  const n = a.length;
  const m = b.length;
  if (!n || !m) return [];
  const max = Math.min(n + m, maxD);
  const offset = max + 1;
  const v = new Int32Array(2 * max + 3);
  // trace[d]: the furthest x of each diagonal k in -d..d as round d begins.
  const trace: Int32Array[] = [];
  for (let d = 0; d <= max; d++) {
    const snap = new Int32Array(2 * d + 1);
    for (let k = -d; k <= d; k++) snap[k + d] = v[offset + k]!;
    trace.push(snap);
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[offset + k - 1]! < v[offset + k + 1]!) ? v[offset + k + 1]! : v[offset + k - 1]! + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }
      v[offset + k] = x;
      if (x >= n && y >= m) return walkBack(trace, n, m);
    }
  }
  return null;
}

/** The equal places on the way back from the end of both sequences. */
function walkBack(trace: Int32Array[], n: number, m: number): [number, number][] {
  const out: [number, number][] = [];
  let x = n;
  let y = m;
  for (let d = trace.length - 1; d > 0; d--) {
    const before = trace[d]!;
    const k = x - y;
    const down = k === -d || (k !== d && before[k - 1 + d]! < before[k + 1 + d]!);
    const prevK = down ? k + 1 : k - 1;
    const prevX = before[prevK + d]!;
    const prevY = prevX - prevK;
    const midX = down ? prevX : prevX + 1;
    const midY = midX - k;
    while (x > midX && y > midY) {
      x--;
      y--;
      out.push([x, y]);
    }
    x = prevX;
    y = prevY;
  }
  while (x > 0 && y > 0) {
    x--;
    y--;
    out.push([x, y]);
  }
  return out.reverse();
}

/** What both sequences share, in order: their common start and end, and a diff between. Where they
 *  differ by too much to match, nothing between is shared. */
export function sharedPlaces(a: string[], b: string[], maxD = 1500): [number, number][] {
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const out: [number, number][] = [];
  for (let i = 0; i < start; i++) out.push([i, i]);
  for (const [i, j] of myers(a.slice(start, endA), b.slice(start, endB), maxD) ?? []) out.push([i + start, j + start]);
  for (let k = 0; endA + k < a.length; k++) out.push([endA + k, endB + k]);
  return out;
}

const TOKEN = /\s+|[\p{L}\p{N}_]+|[^\s\p{L}\p{N}_]/gu;
const isWord = (t: string) => /[\p{L}\p{N}]/u.test(t);
const wordsOf = (t: string) => new Set((t.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []));

/** How alike two lines are (0 to 1): twice the words they share over the words they have. */
function likeness(x: Set<string>, y: Set<string>, a: string, b: string): number {
  if (!x.size || !y.size) return a === b ? 1 : 0;
  let both = 0;
  x.forEach((w) => y.has(w) && both++);
  return (2 * both) / (x.size + y.size);
}

/** Lines at least this alike are taken for the same line, edited. */
const ALIKE = 0.4;

/** Which old line says much what a new line says, in order: `older[i]` pairs with `newer[j]`. */
function pairUp(older: string[], newer: string[]): Map<number, number> {
  const pairs = new Map<number, number>();
  const [sa, sb] = [older.map(wordsOf), newer.map(wordsOf)];
  const like = (i: number, j: number) => likeness(sa[i]!, sb[j]!, older[i]!, newer[j]!);
  // A rewrite of many lines is not searched pair by pair.
  if (older.length * newer.length > 40_000) {
    if (older.length === newer.length) older.forEach((_, i) => like(i, i) >= ALIKE && pairs.set(i, i));
    return pairs;
  }
  let from = 0;
  older.forEach((_, i) => {
    let best = -1;
    let score = -1;
    for (let j = from; j < newer.length; j++) {
      const s = like(i, j);
      if (s >= ALIKE && s > score) {
        best = j;
        score = s;
      }
    }
    if (best >= 0) {
      pairs.set(i, best);
      from = best + 1;
    }
  });
  return pairs;
}

interface Tokens {
  text: string[];
  /** Where each starts. */
  at: number[];
}

function tokens(text: string): Tokens {
  const list = text.match(TOKEN) ?? [];
  const at: number[] = [];
  let n = 0;
  for (const t of list) {
    at.push(n);
    n += t.length;
  }
  return { text: list, at };
}

/** The stretches of `text` (as character places) not among the tokens `keep` lists, joined across
 *  the spaces between, and how many words they hold. */
function stretches(t: Tokens, text: string, keep: Set<number>): { spans: [number, number][]; words: number } {
  const spans: [number, number][] = [];
  let words = 0;
  t.text.forEach((tok, i) => {
    if (keep.has(i)) return;
    if (isWord(tok)) words++;
    const from = t.at[i]!;
    const to = from + tok.length;
    const last = spans[spans.length - 1];
    // A stretch goes on over the spaces between changed tokens: "red fox" is one change.
    if (last && !text.slice(last[1], from).trim()) last[1] = to;
    else if (!/^\s+$/.test(tok)) spans.push([from, to]);
  });
  return { spans, words };
}

/** What changed between two texts, word by word: places in the older and in the newer. */
function wordChanges(older: string, newer: string) {
  const [a, b] = [tokens(older), tokens(newer)];
  const same = sharedPlaces(a.text, b.text, 3000);
  const gone = stretches(a, older, new Set(same.map(([i]) => i)));
  const came = stretches(b, newer, new Set(same.map(([, j]) => j)));
  return { gone, came };
}

export function compare(older: PMNode, newer: PMNode): Comparison {
  const [la, lb] = [linesOf(older), linesOf(newer)];
  const same = sharedPlaces(
    la.map((l) => l.key),
    lb.map((l) => l.key),
  );
  const out: Comparison = { removed: [], added: [], changes: [], wordsAdded: 0, wordsRemoved: 0 };
  const whole = (l: Line): Range => ({ from: l.lo[0]!, to: l.hi[l.hi.length - 1]! });
  const words = (l: Line) => (l.text.match(TOKEN) ?? []).filter(isWord).length;
  /** Where a change with nothing on this side sits: at the next shared line, or the end. */
  const gap = (lines: Line[], i: number, end: number): Range => {
    const at = lines[i] ? lines[i]!.start : end;
    return { from: at, to: at };
  };
  const hunk = (i0: number, i1: number, j0: number, j1: number) => {
    const ra = la.slice(i0, i1);
    const rb = lb.slice(j0, j1);
    if (!ra.length && !rb.length) return;
    const pairs = pairUp(
      ra.map((l) => l.text),
      rb.map((l) => l.text),
    );
    const paired = new Set(pairs.values());
    ra.forEach((l, i) => {
      const j = pairs.get(i);
      if (j === undefined) {
        out.removed.push(whole(l));
        out.wordsRemoved += words(l);
        return;
      }
      const other = rb[j]!;
      if (l.text === other.text) {
        // The same words in another place (a heading made a paragraph, a list item moved out).
        out.removed.push(whole(l));
        out.added.push(whole(other));
        return;
      }
      const { gone, came } = wordChanges(l.text, other.text);
      for (const [f, t] of gone.spans) out.removed.push({ from: l.lo[f]!, to: l.hi[t]! });
      for (const [f, t] of came.spans) out.added.push({ from: other.lo[f]!, to: other.hi[t]! });
      out.wordsRemoved += gone.words;
      out.wordsAdded += came.words;
    });
    rb.forEach((l, j) => {
      if (paired.has(j)) return;
      out.added.push(whole(l));
      out.wordsAdded += words(l);
    });
    const span = (lines: Line[], at: number, end: number, docEnd: number): Range =>
      end > at ? { from: lines[at]!.lo[0]!, to: lines[end - 1]!.hi[lines[end - 1]!.hi.length - 1]! } : gap(lines, end, docEnd);
    out.changes.push({ older: span(la, i0, i1, older.content.size), newer: span(lb, j0, j1, newer.content.size) });
  };
  let [i, j] = [0, 0];
  for (const [si, sj] of same) {
    hunk(i, si, j, sj);
    [i, j] = [si + 1, sj + 1];
  }
  hunk(i, la.length, j, lb.length);
  out.removed.sort((x, y) => x.from - y.from);
  out.added.sort((x, y) => x.from - y.from);
  return out;
}
