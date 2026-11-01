// A Word document (.docx) as Markdown, to make a Docs document from it. The server turns Markdown
// into a live document (Drive's `create_document`); it has no Word reader, so the browser reads the
// file here: headings, paragraphs, bold, italic and strikethrough, links, bulleted and numbered
// lists (nested), quotes, code, and tables. Pictures, headers and footers, comments, footnotes and
// page layout are left out; changes that were tracked are taken as they stand (deleted words go).
//
// The file is read in the browser and nothing in it is run or fetched.

import { type XmlEl, child, elements, parseXml, textOf } from "./xml";
import { readText, zipEntries } from "./zip";

export interface Imported {
  markdown: string;
  /** Pictures in the Word file, which Markdown cannot carry. */
  pictures: number;
}

/** Longest Markdown the server takes in one document. */
export const MAX_MARKDOWN = 1 << 20;

// ───────────────────────────── Markdown text ─────────────────────────────

/** Characters that mean something in the server's Markdown, kept as the text they are. */
const escapeText = (s: string) => s.replace(/[\\`*_[\]~<|]/g, "\\$&").replace(/[\r\n]+/g, " ");

/** Keeps a line from reading as a block of its own: a heading, quote, list item or rule. */
export function guardLine(line: string): string {
  const t = line.trimStart();
  const digits = /^\d+/.exec(t)?.[0].length ?? 0;
  const risky = t.startsWith("#") || t.startsWith(">") || /^[-+]\s/.test(t) || /^[-_]{3,}\s*$/.test(t) || (digits > 0 && /^\d+[.)]\s/.test(t));
  if (!risky) return line;
  const pad = line.slice(0, line.length - t.length);
  return digits > 0 ? `${pad}${t.slice(0, digits)}\\${t.slice(digits)}` : `${pad}\\${t}`;
}

const safeLink = (href: string) => /^(https?:|mailto:)/i.test(href);

interface Seg {
  text: string;
  bold?: boolean;
  italic?: boolean;
  strike?: boolean;
  code?: boolean;
  href?: string;
}

const sameLook = (a: Seg, b: Seg) => !!a.bold === !!b.bold && !!a.italic === !!b.italic && !!a.strike === !!b.strike && !!a.code === !!b.code && a.href === b.href;

function renderSeg(seg: Seg): string {
  if (seg.code) {
    const ticks = "`".repeat((Math.max(0, ...(seg.text.match(/`+/g) ?? []).map((t) => t.length)) || 0) + 1);
    return `${ticks}${seg.text.startsWith("`") || seg.text.endsWith("`") ? ` ${seg.text} ` : seg.text}${ticks}`;
  }
  const core = seg.text.trim();
  if (!core) return seg.text.replace(/\s+/g, " ");
  const lead = seg.text.slice(0, seg.text.length - seg.text.trimStart().length);
  const trail = seg.text.slice(seg.text.trimEnd().length);
  let out = escapeText(core);
  if (seg.strike) out = `~~${out}~~`;
  if (seg.italic) out = `*${out}*`;
  if (seg.bold) out = `**${out}**`;
  return `${lead.replace(/\s+/g, " ")}${out}${trail.replace(/\s+/g, " ")}`;
}

/** Runs as Markdown: neighbours that look alike are one, and links wrap what they cover. */
export function renderSegs(segs: Seg[]): string {
  const merged: Seg[] = [];
  for (const s of segs) {
    const last = merged[merged.length - 1];
    if (last && last.text !== "\n" && s.text !== "\n" && sameLook(last, s)) last.text += s.text;
    else merged.push({ ...s });
  }
  let out = "";
  for (let i = 0; i < merged.length; ) {
    const s = merged[i]!;
    if (s.text === "\n") {
      out += "\\\n";
      i++;
    } else if (s.href && safeLink(s.href)) {
      // The runs that go to the same address are one link; spaces at its edges stay outside it.
      let inner = "";
      let j = i;
      for (; j < merged.length && merged[j]!.href === s.href && merged[j]!.text !== "\n"; j++) inner += renderSeg({ ...merged[j]!, href: undefined });
      const label = inner.trim();
      const address = s.href.replace(/\)/g, "%29").replace(/\s/g, "%20");
      out += label ? `${inner.slice(0, inner.length - inner.trimStart().length)}[${label}](${address})${inner.slice(inner.trimEnd().length)}` : inner;
      i = j;
    } else {
      out += renderSeg({ ...s, href: undefined });
      i++;
    }
  }
  return out;
}

// ───────────────────────────── the Word file ─────────────────────────────

interface Parts {
  /** Style id → its name, lower case, following `basedOn` for a style of the user's own. */
  styles: Map<string, string>;
  /** Number id → level → bullet or ordered. */
  numbering: Map<string, Map<number, "bullet" | "ordered" | "none">>;
  /** Relationship id → where a link goes. */
  links: Map<string, string>;
}

function styleNames(xml: string | null): Map<string, string> {
  const names = new Map<string, string>();
  const based = new Map<string, string>();
  if (xml) {
    for (const s of elements(parseXml(xml), "w:style")) {
      const id = s.attrs["w:styleId"];
      if (!id) continue;
      names.set(id, (child(s, "w:name")?.attrs["w:val"] ?? id).toLowerCase());
      const parent = child(s, "w:basedOn")?.attrs["w:val"];
      if (parent) based.set(id, parent);
    }
  }
  // A style the user made from a heading is a heading.
  const resolved = new Map<string, string>();
  for (const [id, name] of names) {
    let current = name;
    let at = id;
    for (let hops = 0; hops < 6 && !/^(heading \d|title|quote|block quotation|list |code|source code|html preformatted|preformatted)/.test(current) && based.has(at); hops++) {
      at = based.get(at)!;
      current = names.get(at) ?? current;
    }
    resolved.set(id, current);
  }
  return resolved;
}

function numberingKinds(xml: string | null): Parts["numbering"] {
  const out: Parts["numbering"] = new Map();
  if (!xml) return out;
  const root = parseXml(xml);
  const abstracts = new Map<string, Map<number, "bullet" | "ordered" | "none">>();
  for (const a of elements(root, "w:abstractNum")) {
    const levels = new Map<number, "bullet" | "ordered" | "none">();
    for (const l of elements(a, "w:lvl")) {
      const fmt = child(l, "w:numFmt")?.attrs["w:val"] ?? "decimal";
      levels.set(Number(l.attrs["w:ilvl"] ?? 0), fmt === "bullet" ? "bullet" : fmt === "none" ? "none" : "ordered");
    }
    abstracts.set(a.attrs["w:abstractNumId"] ?? "", levels);
  }
  for (const n of elements(root, "w:num")) {
    const levels = abstracts.get(child(n, "w:abstractNumId")?.attrs["w:val"] ?? "");
    if (levels && n.attrs["w:numId"]) out.set(n.attrs["w:numId"], levels);
  }
  return out;
}

function linkTargets(xml: string | null): Map<string, string> {
  const out = new Map<string, string>();
  if (xml) {
    for (const r of elements(parseXml(xml), "Relationship")) {
      if (r.attrs.Type?.endsWith("/hyperlink") && r.attrs.TargetMode === "External" && r.attrs.Id && r.attrs.Target) out.set(r.attrs.Id, r.attrs.Target);
    }
  }
  return out;
}

const MONOSPACE = /courier|consolas|monospace|menlo|monaco|lucida console|source code|fira code|liberation mono|dejavu sans mono/i;

type Block =
  | { t: "heading"; level: number; text: string }
  | { t: "para"; text: string }
  | { t: "quote"; text: string }
  | { t: "code"; text: string }
  | { t: "item"; kind: "bullet" | "ordered"; level: number; text: string }
  | { t: "table"; rows: string[][] };

class Reader {
  pictures = 0;
  blocks: Block[] = [];
  constructor(private readonly parts: Parts) {}

  /** The runs of a paragraph (or any container of runs) as text with looks. */
  private runs(el: XmlEl, link: string | undefined, out: Seg[]) {
    for (const c of elements(el)) {
      switch (c.name) {
        case "w:r":
          this.run(c, link, out);
          break;
        case "w:hyperlink": {
          const id = c.attrs["r:id"];
          this.runs(c, id ? this.parts.links.get(id) : undefined, out);
          break;
        }
        case "w:ins":
        case "w:moveTo":
        case "w:smartTag":
        case "w:fldSimple":
        case "w:customXml":
          this.runs(c, link, out);
          break;
        case "w:sdt":
          this.runs(child(c, "w:sdtContent") ?? c, link, out);
          break;
        // Deleted words (tracked), and everything else, are not text.
      }
    }
  }

  private run(r: XmlEl, link: string | undefined, out: Seg[]) {
    const props = child(r, "w:rPr");
    const on = (name: string) => {
      const p = props && child(props, name);
      return !!p && !["0", "false", "off", "none"].includes(p.attrs["w:val"] ?? "");
    };
    const font = props && child(props, "w:rFonts")?.attrs["w:ascii"];
    const look = { bold: on("w:b"), italic: on("w:i"), strike: on("w:strike") || on("w:dstrike"), code: !!font && MONOSPACE.test(font), href: link };
    for (const c of elements(r)) {
      if (c.name === "w:t") out.push({ ...look, text: textOf(c) });
      else if (c.name === "w:tab") out.push({ ...look, text: " " });
      else if (c.name === "w:noBreakHyphen") out.push({ ...look, text: "-" });
      else if (c.name === "w:br" || c.name === "w:cr") {
        // A page or column break is layout, not text.
        if (!["page", "column"].includes(c.attrs["w:type"] ?? "")) out.push({ text: "\n" });
      } else if (c.name === "w:drawing" || c.name === "w:pict" || c.name === "w:object" || c.name === "mc:AlternateContent") this.pictures++;
    }
  }

  private style(p: XmlEl): string {
    const id = child(child(p, "w:pPr") ?? p, "w:pStyle")?.attrs["w:val"];
    return (id && this.parts.styles.get(id)) || "";
  }

  paragraph(p: XmlEl) {
    const segs: Seg[] = [];
    this.runs(p, undefined, segs);
    const text = renderSegs(segs);
    const plain = text.replace(/\\\n/g, " ");
    // A paragraph of spaces and breaks only is a gap in the layout, not text.
    if (!plain.trim()) return;
    const style = this.style(p);
    const heading = /^heading (\d)/.exec(style);
    if (heading) return void this.blocks.push({ t: "heading", level: Math.min(6, Number(heading[1])), text: plain });
    if (style === "title") return void this.blocks.push({ t: "heading", level: 1, text: plain });
    const mono = segs.length > 0 && segs.every((s) => s.text === "\n" || !s.text.trim() || s.code);
    if (/^(code|source code|html preformatted|preformatted)/.test(style) || (mono && segs.some((s) => s.code))) {
      return void this.blocks.push({ t: "code", text: segs.map((s) => (s.text === "\n" ? "\n" : s.text)).join("") });
    }
    const num = child(child(p, "w:pPr") ?? p, "w:numPr");
    const numId = num && child(num, "w:numId")?.attrs["w:val"];
    if (num && numId && numId !== "0") {
      const level = Number(child(num, "w:ilvl")?.attrs["w:val"] ?? 0);
      const kind = this.parts.numbering.get(numId)?.get(level) ?? "bullet";
      if (kind !== "none") return void this.blocks.push({ t: "item", kind, level, text });
    } else if (/^list (bullet|number|continue)/.test(style)) {
      const level = Math.max(0, (Number(/(\d)$/.exec(style)?.[1]) || 1) - 1);
      if (!style.startsWith("list continue")) return void this.blocks.push({ t: "item", kind: style.startsWith("list number") ? "ordered" : "bullet", level, text });
    }
    if (/^(quote|quotations?|intense quote|block text|block quotation)/.test(style)) return void this.blocks.push({ t: "quote", text });
    this.blocks.push({ t: "para", text });
  }

  table(t: XmlEl) {
    const rows: string[][] = [];
    for (const tr of elements(t, "w:tr")) {
      const cells: string[] = [];
      for (const tc of elements(tr, "w:tc")) {
        const props = child(tc, "w:tcPr");
        const span = Number(props && child(props, "w:gridSpan")?.attrs["w:val"]) || 1;
        const merged = props && child(props, "w:vMerge");
        // Paragraphs of a cell (also in a table inside it) run together on one line.
        const inner = new Reader(this.parts);
        inner.cell(tc);
        this.pictures += inner.pictures;
        cells.push(merged && merged.attrs["w:val"] !== "restart" ? "" : inner.blocks.map((b) => ("text" in b ? b.text : "")).filter(Boolean).join(" ").replace(/\\\n/g, " ").replace(/\n/g, " "));
        for (let i = 1; i < span; i++) cells.push("");
      }
      if (cells.length) rows.push(cells);
    }
    if (rows.length) this.blocks.push({ t: "table", rows });
  }

  private cell(tc: XmlEl) {
    for (const c of elements(tc)) {
      if (c.name === "w:p") this.paragraph(c);
      else if (c.name === "w:tbl") {
        const nested = new Reader(this.parts);
        nested.table(c);
        this.pictures += nested.pictures;
        for (const b of nested.blocks) if (b.t === "table") this.blocks.push({ t: "para", text: b.rows.map((r) => r.join(" ")).join(" ") });
      }
    }
  }

  /** The body: paragraphs and tables, also those inside content controls. */
  body(el: XmlEl) {
    for (const c of elements(el)) {
      if (c.name === "w:p") this.paragraph(c);
      else if (c.name === "w:tbl") this.table(c);
      else if (c.name === "w:sdt") this.body(child(c, "w:sdtContent") ?? c);
      else if (c.name === "w:ins" || c.name === "w:customXml") this.body(c);
    }
  }
}

// ───────────────────────────── blocks as Markdown ─────────────────────────────

function renderTable(rows: string[][]): string {
  const width = Math.max(...rows.map((r) => r.length));
  const line = (cells: string[]) => `| ${Array.from({ length: width }, (_, i) => cells[i] ?? "").join(" | ")} |`;
  return [line(rows[0]!), `|${"---|".repeat(width)}`, ...rows.slice(1).map(line)].join("\n");
}

/** Blocks as Markdown, in the shapes the server reads: lists nested by indentation, a fence for code. */
export function renderBlocks(blocks: Block[]): string {
  const out: string[] = [];
  let list: string[] = [];
  /** The lists open now, outermost first: their kind and the width of their marker. */
  let open: { kind: "bullet" | "ordered"; level: number; width: number }[] = [];
  const flush = () => {
    if (list.length) out.push(list.join("\n"));
    list = [];
    open = [];
  };
  let code: string[] = [];
  let quote: string[] = [];
  const flushCode = () => {
    if (!code.length) return;
    const body = code.join("\n");
    const fence = "`".repeat(Math.max(3, ...(body.match(/`+/g) ?? []).map((t) => t.length + 1)));
    out.push(`${fence}\n${body}\n${fence}`);
    code = [];
  };
  const flushQuote = () => {
    if (quote.length) out.push(quote.join("\n>\n"));
    quote = [];
  };
  for (const b of blocks) {
    if (b.t !== "code") flushCode();
    if (b.t !== "quote") flushQuote();
    if (b.t !== "item") flush();
    switch (b.t) {
      case "heading":
        out.push(`${"#".repeat(b.level)} ${b.text}`);
        break;
      case "para":
        out.push(b.text.split("\n").map(guardLine).join("\n"));
        break;
      case "quote":
        quote.push(b.text.split("\n").map((l) => `> ${guardLine(l)}`).join("\n"));
        break;
      case "code":
        code.push(b.text);
        break;
      case "table":
        out.push(renderTable(b.rows));
        break;
      case "item": {
        while (open.length && open[open.length - 1]!.level > b.level) open.pop();
        const top = open[open.length - 1];
        // A list of another kind at the same depth starts a new list.
        if (top && top.level === b.level && top.kind !== b.kind) {
          open.pop();
          list.push("");
        }
        const here = open[open.length - 1];
        if (!here || here.level < b.level) open.push({ kind: b.kind, level: b.level, width: b.kind === "bullet" ? 2 : 3 });
        const indent = open.slice(0, -1).reduce((n, o) => n + o.width, 0);
        const marker = b.kind === "bullet" ? "- " : "1. ";
        const [first, ...rest] = b.text.split("\n").map(guardLine);
        list.push(`${" ".repeat(indent)}${marker}${first}`, ...rest.map((l) => `${" ".repeat(indent + marker.length)}${l}`));
        break;
      }
    }
  }
  flushCode();
  flushQuote();
  flush();
  return out.join("\n\n");
}

/** The Markdown of a Word file's bytes. Throws, in words for the person, when it is not one. */
export async function docxToMarkdown(bytes: Uint8Array): Promise<Imported> {
  const entries = zipEntries(bytes);
  const document = await readText(bytes, entries, "word/document.xml");
  if (document === null) throw new Error("This is not a Word document: it has no text part.");
  const [styles, numbering, rels] = await Promise.all([
    readText(bytes, entries, "word/styles.xml"),
    readText(bytes, entries, "word/numbering.xml"),
    readText(bytes, entries, "word/_rels/document.xml.rels"),
  ]);
  const reader = new Reader({ styles: styleNames(styles), numbering: numberingKinds(numbering), links: linkTargets(rels) });
  const body = child(parseXml(document), "w:body");
  if (!body) throw new Error("This Word document has no text.");
  reader.body(body);
  const markdown = renderBlocks(reader.blocks);
  if (!markdown.trim()) throw new Error("This Word document has no text to import.");
  if (new TextEncoder().encode(markdown).length > MAX_MARKDOWN) throw new Error("This document is too long to import: the text is over 1 MB.");
  return { markdown, pictures: reader.pictures };
}
