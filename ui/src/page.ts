// A document's page: paper size, orientation and margins, kept in the shared document so everyone sees
// a change at once and the exporters can read it (DOCS-STORED-FORMAT.md). It is a Yjs map named "page"
// beside the text. Lengths are twips (1/1440 inch, Word's own unit): exact for inches and for Word, and
// a screen pixel is 15 of them. Every value is checked when it is read, so a hostile update from another
// client cannot make a page of absurd size or put CSS in the print style.
//
// A document that has never had a page set (every document made before this) keeps what it was
// exported as: A4 with 2 cm margins. A new empty document gets the person's usual paper (Letter for
// en-US, A4 elsewhere) written into it the first time an editor opens it (Docs.tsx, LiveDoc.tsx).

import * as Y from "yjs";
import { FORMAT } from "./compat";

export type Paper = "A4" | "Letter" | "Legal" | "A3" | "A5";
export const PAPERS: Paper[] = ["A4", "Letter", "Legal", "A3", "A5"];
/** Width and height in twips, portrait. */
export const PAPER_TWIPS: Record<Paper, [number, number]> = { A4: [11906, 16838], Letter: [12240, 15840], Legal: [12240, 20160], A3: [16838, 23811], A5: [8391, 11906] };
export const PAPER_NAMES: Record<Paper, string> = { A4: "A4 (21 × 29.7 cm)", Letter: "Letter (8.5 × 11 in)", Legal: "Legal (8.5 × 14 in)", A3: "A3 (29.7 × 42 cm)", A5: "A5 (14.8 × 21 cm)" };

export interface PageSetup {
  size: Paper;
  orientation: "portrait" | "landscape";
  top: number;
  right: number;
  bottom: number;
  left: number;
  /** A different header and footer on the first page. */
  differentFirst: boolean;
}

export const TWIPS_PER_PX = 15;
export const MIN_MARGIN = 283; // 0.5 cm
export const MAX_MARGIN = 4320; // 3 in
/** The least room left for text, across and down (2 in). */
export const MIN_TEXT = 2880;
/** What a document with no page settings is: how it has always been exported. */
export const LEGACY: PageSetup = { size: "A4", orientation: "portrait", top: 1134, right: 1134, bottom: 1134, left: 1134, differentFirst: false };

export const PRESETS = {
  normal: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
  narrow: { top: 720, right: 720, bottom: 720, left: 720 },
  wide: { top: 1440, right: 2880, bottom: 1440, left: 2880 },
} as const;
export type Preset = keyof typeof PRESETS;

/** Distance of the header and the footer from the edge of the paper: half an inch, as in Word. */
export const EDGE = 720;

const int = (v: unknown, lo: number, hi: number): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : NaN;
  return Number.isFinite(n) && n >= lo && n <= hi ? Math.round(n) : null;
};

/** The page a map of raw values describes: each missing or out-of-bounds value is the legacy one. */
export function cleanSetup(raw: Record<string, unknown>): PageSetup {
  const size = (PAPERS as string[]).includes(raw.size as string) ? (raw.size as Paper) : LEGACY.size;
  const orientation = raw.orientation === "landscape" ? "landscape" : "portrait";
  const out: PageSetup = { size, orientation, top: LEGACY.top, right: LEGACY.right, bottom: LEGACY.bottom, left: LEGACY.left, differentFirst: raw.differentFirst === true };
  for (const side of ["top", "right", "bottom", "left"] as const) out[side] = int(raw[side], MIN_MARGIN, MAX_MARGIN) ?? LEGACY[side];
  // Margins that leave no room for text are the legacy ones.
  const [w, h] = dims(out);
  if (w - out.left - out.right < MIN_TEXT) (out.left = LEGACY.left), (out.right = LEGACY.right);
  if (h - out.top - out.bottom < MIN_TEXT) (out.top = LEGACY.top), (out.bottom = LEGACY.bottom);
  return out;
}

/** The paper's width and height in twips, as it lies. */
export function dims(s: Pick<PageSetup, "size" | "orientation">): [number, number] {
  const [w, h] = PAPER_TWIPS[s.size];
  return s.orientation === "landscape" ? [h, w] : [w, h];
}

export const toPx = (twips: number) => twips / TWIPS_PER_PX;

/** The map the setup lives in. */
export const pageMap = (doc: Y.Doc) => doc.getMap<unknown>("page");

export function readSetup(doc: Y.Doc): PageSetup {
  return cleanSetup(Object.fromEntries(pageMap(doc).entries()));
}

/** Whether nobody has set the page of this document (so it is the legacy page). */
export const isUnset = (doc: Y.Doc) => pageMap(doc).size === 0;

/** Writes a page setup (one change, so it is one undo step and one message to the others). */
export function writeSetup(doc: Y.Doc, setup: PageSetup): void {
  const clean = cleanSetup({ ...setup });
  doc.transact(() => {
    const m = pageMap(doc);
    for (const [k, v] of Object.entries(clean)) if (m.get(k) !== v) m.set(k, v);
    if (typeof m.get("format") !== "number" || (m.get("format") as number) < FORMAT) m.set("format", FORMAT);
  });
}

/** Calls `fn` with the setup now and whenever it changes; returns the way to stop. */
export function watchSetup(doc: Y.Doc, fn: (s: PageSetup) => void): () => void {
  const run = () => fn(readSetup(doc));
  pageMap(doc).observe(run);
  run();
  return () => pageMap(doc).unobserve(run);
}

// ── units ──

export type Unit = "cm" | "in";

/** Inches in the United States, Liberia and Myanmar; centimetres everywhere else. */
export function unitFor(locale: string): Unit {
  const region = /[-_]([A-Za-z]{2})\b/.exec(locale)?.[1]?.toUpperCase() ?? (locale.toLowerCase() === "en" ? "US" : "");
  return ["US", "LR", "MM"].includes(region) ? "in" : "cm";
}

/** The paper a person usually uses: Letter for en-US (and Canada, Mexico, the Philippines), else A4. */
export function paperFor(locale: string): Paper {
  const region = /[-_]([A-Za-z]{2})\b/.exec(locale)?.[1]?.toUpperCase() ?? "";
  return ["US", "CA", "MX", "PH", "CL", "CO", "VE"].includes(region) ? "Letter" : "A4";
}

const PER = { cm: 1440 / 2.54, in: 1440 } as const;

/** Twips as text in the unit: `2.54`, `1`. */
export function formatLength(twips: number, unit: Unit): string {
  const v = twips / PER[unit];
  return String(Math.round(v * 100) / 100);
}

/** Text a person typed as twips (`2.5`, `2,5`, `1 in`, `25 mm`); null when it is not a length. */
export function parseLength(text: string, unit: Unit): number | null {
  const m = /^\s*(\d*[.,]?\d+)\s*(cm|mm|in|"|pt)?\s*$/i.exec(text);
  if (!m) return null;
  const n = parseFloat(m[1]!.replace(",", "."));
  const u = (m[2] ?? unit).toLowerCase();
  const twips = u === "cm" ? n * PER.cm : u === "mm" ? (n * PER.cm) / 10 : u === "in" || u === '"' ? n * 1440 : u === "pt" ? n * 20 : NaN;
  return Number.isFinite(twips) ? Math.round(twips) : null;
}

/** The preset these margins are, if any. */
export function presetOf(s: Pick<PageSetup, "top" | "right" | "bottom" | "left">): Preset | null {
  return (Object.keys(PRESETS) as Preset[]).find((k) => (["top", "right", "bottom", "left"] as const).every((side) => PRESETS[k][side] === s[side])) ?? null;
}

/** The inches a CSS length needs, from twips (`@page` sizes). */
export const inches = (twips: number) => `${Math.round((twips / 1440) * 10000) / 10000}in`;
