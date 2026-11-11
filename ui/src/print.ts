// The printed page: an `@page` style made from the page setup and the header and footer regions, kept in
// the page while a document is open, so File > Print, the browser's own print and a PDF all come out
// the same. Chrome prints the header and footer in the page margins (CSS margin boxes), where the page
// number and the page count are counters the printer fills in. A margin box carries text and counters, so
// each region paragraph becomes a line in the box its alignment names, in the style of its first words.
// What the box cannot say (a different style for each word of a line) is kept in the document and
// exported to Word whole, but prints in one style per line.

import { type Field, cleanField } from "./regions";
import { type PageSetup, dims, inches } from "./page";
import { cleanColor, cleanFontFamily, cleanFontSize, fontStack } from "./format";

export interface Run {
  text?: string;
  field?: Field;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  size?: number | null;
  color?: string | null;
  family?: string | null;
}
export interface Line {
  align: "left" | "center" | "right";
  runs: Run[];
}

interface JSONNode {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  content?: JSONNode[];
}

/** The paragraphs of a region (its ProseMirror JSON) as lines of runs. */
export function linesOf(json: unknown): Line[] {
  const root = json as JSONNode | null;
  const lines: Line[] = [];
  for (const p of root?.content ?? []) {
    if (p.type !== "paragraph") continue;
    const a = p.attrs?.textAlign;
    const runs: Run[] = [];
    for (const n of p.content ?? []) {
      if (n.type === "pageField") runs.push({ field: cleanField(n.attrs?.kind), ...style(n) });
      else if (n.type === "text" && n.text) runs.push({ text: n.text, ...style(n) });
      else if (n.type === "hardBreak") runs.push({ text: "\n" });
    }
    lines.push({ align: a === "center" || a === "right" ? a : "left", runs });
  }
  while (lines.length && !lines.at(-1)!.runs.length) lines.pop();
  return lines;
}

function style(n: JSONNode): Omit<Run, "text" | "field"> {
  const out: Omit<Run, "text" | "field"> = {};
  for (const m of n.marks ?? []) {
    if (m.type === "bold") out.bold = true;
    else if (m.type === "italic") out.italic = true;
    else if (m.type === "underline") out.underline = true;
    else if (m.type === "textStyle") {
      out.size = cleanFontSize(m.attrs?.fontSize);
      out.color = cleanColor(m.attrs?.color);
      out.family = cleanFontFamily(m.attrs?.fontFamily);
    }
  }
  return out;
}

/** A CSS string: quotes, backslashes and line ends escaped, other control characters dropped. */
export const cssString = (s: string) => `"${s.replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, "").replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\A ")}"`;

export interface Context {
  title: string;
  date: string;
}

/** The `content` of a margin box for lines: strings and the page counters, one paragraph under another. */
export function boxContent(lines: Line[], ctx: Context): string {
  const parts: string[] = [];
  lines.forEach((line, i) => {
    if (i > 0) parts.push(cssString("\n"));
    for (const r of line.runs) {
      if (r.field === "page") parts.push("counter(page)");
      else if (r.field === "pages") parts.push("counter(pages)");
      else if (r.field === "date") parts.push(cssString(ctx.date));
      else if (r.field === "title") parts.push(cssString(ctx.title));
      else if (r.text) parts.push(cssString(r.text));
    }
  });
  return parts.length ? parts.join(" ") : "none";
}

const BOX = { left: "left", center: "center", right: "right" } as const;

/** The six margin boxes of one side: the content of those that have lines, `none` for the rest. */
export function boxes(side: "top" | "bottom", lines: Line[], ctx: Context): string {
  const out: string[] = [];
  for (const align of ["left", "center", "right"] as const) {
    const mine = lines.filter((l) => l.align === align);
    const css = [`content: ${mine.length ? boxContent(mine, ctx) : "none"}`];
    if (mine.length) {
      const first = mine.flatMap((l) => l.runs).find((r) => r.text || r.field);
      // ui-lint-allow raw-color: the printed margin text is grey on white paper, whatever the theme
      css.push("white-space: pre-wrap", "vertical-align: middle", `font-size: ${first?.size ?? 9}pt`, `color: ${first?.color ?? "#555555"}`, `font-weight: ${first?.bold ? 700 : 400}`, `font-style: ${first?.italic ? "italic" : "normal"}`);
      if (first?.underline) css.push("text-decoration: underline");
      const stack = fontStack(first?.family);
      if (stack) css.push(`font-family: ${stack}`);
    }
    out.push(`@${side}-${BOX[align]} { ${css.join("; ")} }`);
  }
  return out.join("\n  ");
}

/** The whole `@page` style for a page setup and the lines of its regions (those not set are empty). */
export function printStyle(setup: PageSetup, regions: Record<"header" | "footer" | "firstHeader" | "firstFooter", Line[]>, ctx: Context): string {
  const [w, h] = dims(setup);
  const page = (header: Line[], footer: Line[]) => `${boxes("top", header, ctx)}\n  ${boxes("bottom", footer, ctx)}`;
  let css = `@page {\n  size: ${inches(w)} ${inches(h)};\n  margin: ${inches(setup.top)} ${inches(setup.right)} ${inches(setup.bottom)} ${inches(setup.left)};\n  ${page(regions.header, regions.footer)}\n}\n`;
  if (setup.differentFirst) css += `@page :first {\n  ${page(regions.firstHeader, regions.firstFooter)}\n}\n`;
  return css;
}
