// A Word document (.docx) as a Docs document, read in the browser: everything the schema can hold is
// kept (headings, Title and Subtitle, fonts, sizes, colours, highlight, sub- and superscript, alignment,
// spacing and indents, lists, tables with merged cells, cell colour and column widths, pictures, links,
// page setup, headers and footers with their page-number fields, footnotes, page breaks and a table of
// contents), and what it cannot is counted and reported (`notes`), never dropped silently. The result
// is ProseMirror JSON for the editor's schema (schema.ts), and the page and region settings of the
// shared document (page.ts, regions.ts); the page makes the document from it (importing.ts).
//
// Nothing in the file is run or fetched: it is read as a zip of XML parts.

import { t as tr } from "@ferrum/client";
import { cleanColor, cleanFontFamily, cleanFontSize, cleanLineHeight, cleanSpace, cleanIndent, DEFAULT_SIZE, INDENT_STEP, pastedColor } from "./format";
import { PAPERS, PAPER_TWIPS, type PageSetup, cleanSetup, type Paper } from "./page";
import { newId } from "./pages";
import { type Field } from "./regions";
import { type XmlEl, child, elements, parseXml, textOf } from "./xml";
import { type ZipEntry, readEntry, readText, zipEntries } from "./zip";

export interface JSONNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: JSONNode[];
  text?: string;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
}

export interface Picture {
  /** The placeholder in the image node's `image` attribute until the picture is uploaded. */
  key: string;
  entry: string;
  type: string;
  name: string;
}

export interface Converted {
  /** The blocks of the text, in order (footnote bodies are separate). */
  content: JSONNode[];
  footnotes: { id: string; content: JSONNode[] }[];
  /** Each region of the header and footer as a document of paragraphs. */
  regions: Partial<Record<"header" | "footer" | "firstHeader" | "firstFooter", JSONNode>>;
  setup: PageSetup | null;
  pictures: Picture[];
  /** What was not carried, in words for the person. */
  notes: string[];
}

const MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp" };
const MONOSPACE = /courier|consolas|monospace|menlo|monaco|lucida console|source code|fira code|liberation mono|dejavu sans mono/i;
const HIGHLIGHT: Record<string, string> = {
  yellow: "#ffff00", green: "#00ff00", cyan: "#00ffff", magenta: "#ff00ff", blue: "#0000ff", red: "#ff0000",
  darkBlue: "#000080", darkCyan: "#008080", darkGreen: "#008000", darkMagenta: "#800080", darkRed: "#800000", darkYellow: "#808000",
  darkGray: "#808080", lightGray: "#c0c0c0", black: "#000000",
};

interface Parts {
  styles: Map<string, string>;
  numbering: Map<string, Map<number, { kind: "bullet" | "ordered" | "none"; type: string; start: number }>>;
  rels: Map<string, { type: string; target: string; external: boolean }>;
  footnotes: Map<string, XmlEl>;
  entries: ZipEntry[];
}

const val = (el: XmlEl | undefined, name: string) => (el ? child(el, name)?.attrs["w:val"] : undefined);
const on = (props: XmlEl | undefined, name: string) => {
  const p = props && child(props, name);
  return !!p && !["0", "false", "off", "none"].includes(p.attrs["w:val"] ?? "");
};

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
  const resolved = new Map<string, string>();
  for (const [id, name] of names) {
    let current = name;
    let at = id;
    for (let hops = 0; hops < 6 && !/^(heading \d|title|subtitle|quote|block quotation|list |code|source code|html preformatted|preformatted)/.test(current) && based.has(at); hops++) {
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
  const abstracts = new Map<string, Map<number, { kind: "bullet" | "ordered" | "none"; type: string; start: number }>>();
  for (const a of elements(root, "w:abstractNum")) {
    const levels = new Map<number, { kind: "bullet" | "ordered" | "none"; type: string; start: number }>();
    for (const l of elements(a, "w:lvl")) {
      const fmt = val(l, "w:numFmt") ?? "decimal";
      levels.set(Number(l.attrs["w:ilvl"] ?? 0), { kind: fmt === "bullet" ? "bullet" : fmt === "none" ? "none" : "ordered", type: /lowerLetter|upperLetter/.test(fmt) ? "a" : /Roman/.test(fmt) ? "i" : "1", start: Number(val(l, "w:start")) || 1 });
    }
    abstracts.set(a.attrs["w:abstractNumId"] ?? "", levels);
  }
  for (const n of elements(root, "w:num")) {
    const levels = abstracts.get(val(n, "w:abstractNumId") ?? "");
    if (levels && n.attrs["w:numId"]) out.set(n.attrs["w:numId"], levels);
  }
  return out;
}

function relsOf(xml: string | null): Parts["rels"] {
  const out: Parts["rels"] = new Map();
  if (xml) for (const r of elements(parseXml(xml), "Relationship")) if (r.attrs.Id && r.attrs.Target) out.set(r.attrs.Id, { type: r.attrs.Type ?? "", target: r.attrs.Target, external: r.attrs.TargetMode === "External" });
  return out;
}

const safeLink = (href: string) => /^(https?:|mailto:)/i.test(href);

/** A paragraph's pieces while it is read: text and inline nodes, or a block that splits the paragraph (a picture, a page break). */
type Piece = { inline: JSONNode } | { block: JSONNode };

class Reader {
  notes = { deletions: 0, textBoxes: 0, shapes: 0, equations: 0, charts: 0, internalLinks: 0, picturesLost: 0, footnoteImages: 0, columns: false, sections: 0 };
  pictures: Picture[] = [];
  footnoteIds = new Map<string, string>();
  /** A table of contents being skipped: how many of its fields are still open. */
  private skipping = 0;
  private region = false;

  constructor(private readonly parts: Parts, private readonly rels: Parts["rels"]) {}

  // ── runs ──

  private marksOf(props: XmlEl | undefined, link: string | undefined): JSONNode["marks"] {
    const marks: NonNullable<JSONNode["marks"]> = [];
    const font = (props && child(props, "w:rFonts")?.attrs["w:ascii"]) || (props && child(props, "w:rFonts")?.attrs["w:hAnsi"]);
    if (on(props, "w:b")) marks.push({ type: "bold" });
    if (on(props, "w:i")) marks.push({ type: "italic" });
    const u = props && child(props, "w:u")?.attrs["w:val"];
    if (props && child(props, "w:u") && u !== "none") marks.push({ type: "underline" });
    if (on(props, "w:strike") || on(props, "w:dstrike")) marks.push({ type: "strike" });
    const code = !!font && MONOSPACE.test(font);
    if (code) marks.push({ type: "code" });
    const va = val(props, "w:vertAlign");
    if (va === "subscript") marks.push({ type: "subscript" });
    if (va === "superscript") marks.push({ type: "superscript" });
    const hl = val(props, "w:highlight");
    const fill = props && child(props, "w:shd")?.attrs["w:fill"];
    const hlColor = hl && hl !== "none" ? (HIGHLIGHT[hl] ?? null) : fill && fill !== "auto" ? cleanColor(`#${fill}`) : null;
    if (hlColor) marks.push({ type: "highlight", attrs: { color: hlColor } });
    const color = val(props, "w:color");
    const text: Record<string, unknown> = {};
    const c = color && color !== "auto" ? pastedColor(`#${color}`) : null;
    if (c) text.color = c;
    if (font && !code) {
      const f = cleanFontFamily(font);
      if (f) text.fontFamily = f;
    }
    const sz = Number(val(props, "w:sz"));
    const size = sz ? cleanFontSize(sz / 2) : null;
    if (size && size !== DEFAULT_SIZE) text.fontSize = size;
    if (Object.keys(text).length) marks.push({ type: "textStyle", attrs: { color: null, fontFamily: null, fontSize: null, ...text } });
    if (link) marks.push({ type: "link", attrs: { href: link } });
    return marks;
  }

  /** The text of a field's instruction and the field it makes: page numbers and the like. */
  private fieldOf(instr: string): Field | "toc" | null {
    const word = instr.trim().split(/\s+/)[0]?.toUpperCase();
    return word === "PAGE" ? "page" : word === "NUMPAGES" ? "pages" : word === "DATE" || word === "SAVEDATE" || word === "CREATEDATE" ? "date" : word === "TITLE" ? "title" : word === "TOC" ? "toc" : null;
  }

  private runs(el: XmlEl, link: string | undefined, out: Piece[], field: { stack: { instr: string; phase: "instr" | "result"; make: Field | "toc" | null }[] }) {
    for (const c of elements(el)) {
      switch (c.name) {
        case "w:r":
          this.run(c, link, out, field);
          break;
        case "w:hyperlink": {
          const id = c.attrs["r:id"];
          const target = id ? this.rels.get(id) : undefined;
          const href = target?.external && safeLink(target.target) ? target.target : undefined;
          if (c.attrs["w:anchor"]) this.notes.internalLinks++;
          this.runs(c, href, out, field);
          break;
        }
        case "w:fldSimple": {
          const make = this.fieldOf(c.attrs["w:instr"] ?? "");
          if (make && make !== "toc") out.push({ inline: { type: "pageField", attrs: { kind: make } } });
          else if (!make) this.runs(c, link, out, field);
          break;
        }
        case "w:ins":
        case "w:moveTo":
        case "w:smartTag":
        case "w:customXml":
          this.runs(c, link, out, field);
          break;
        case "w:sdt":
          this.runs(child(c, "w:sdtContent") ?? c, link, out, field);
          break;
        case "w:del":
        case "w:moveFrom":
          this.notes.deletions++;
          break;
        case "w:commentRangeStart":
          break;
        case "m:oMath":
        case "m:oMathPara":
          this.notes.equations++;
          break;
      }
    }
  }

  private run(r: XmlEl, link: string | undefined, out: Piece[], field: { stack: { instr: string; phase: "instr" | "result"; make: Field | "toc" | null }[] }) {
    const props = child(r, "w:rPr");
    const marks = this.marksOf(props, link);
    const text = (s: string) => {
      if (s) out.push({ inline: { type: "text", text: s, ...(marks?.length ? { marks } : {}) } });
    };
    for (const c of elements(r)) {
      const f = field.stack.at(-1);
      if (c.name === "w:fldChar") {
        const kind = c.attrs["w:fldCharType"];
        if (kind === "begin") field.stack.push({ instr: "", phase: "instr", make: null });
        else if (kind === "separate" && f) {
          f.make = this.fieldOf(f.instr);
          f.phase = "result";
          if (f.make && f.make !== "toc") out.push({ inline: { type: "pageField", attrs: { kind: f.make } } });
        } else if (kind === "end") field.stack.pop();
        continue;
      }
      if (c.name === "w:instrText") {
        if (f && f.phase === "instr") f.instr += textOf(c);
        continue;
      }
      // The cached result of a field we made a node of (a page number) or a table of contents is not text.
      if (f && f.phase === "result" && f.make) continue;
      if (c.name === "w:t") text(textOf(c));
      else if (c.name === "w:tab") text(" ");
      else if (c.name === "w:noBreakHyphen") text("-");
      else if (c.name === "w:br" || c.name === "w:cr") {
        const type = c.attrs["w:type"];
        if (type === "page") out.push({ block: { type: "pageBreak" } });
        else if (type !== "column") out.push({ inline: { type: "hardBreak" } });
      } else if (c.name === "w:footnoteReference" || c.name === "w:endnoteReference") {
        const wid = c.attrs["w:id"] ?? "";
        if (this.parts.footnotes.has(c.name === "w:endnoteReference" ? `e${wid}` : wid)) {
          const key = c.name === "w:endnoteReference" ? `e${wid}` : wid;
          const id = this.footnoteIds.get(key) ?? newId();
          this.footnoteIds.set(key, id);
          out.push({ inline: { type: "footnoteRef", attrs: { id } } });
        }
      } else if (c.name === "w:drawing" || c.name === "mc:AlternateContent" || c.name === "w:pict" || c.name === "w:object") this.drawing(c, out);
    }
  }

  private drawing(d: XmlEl, out: Piece[]) {
    const find = (el: XmlEl, name: string, into: XmlEl[] = []): XmlEl[] => {
      if (el.name === name) into.push(el);
      for (const c of elements(el)) find(c, name, into);
      return into;
    };
    if (find(d, "w:txbxContent").length) this.notes.textBoxes += find(d, "w:txbxContent").length;
    const blip = find(d, "a:blip")[0];
    const rid = blip?.attrs["r:embed"];
    const rel = rid ? this.rels.get(rid) : undefined;
    if (!blip || !rel || rel.external) {
      if (!find(d, "w:txbxContent").length) {
        if (find(d, "c:chart").length || find(d, "dgm:relIds").length) this.notes.charts++;
        else if (find(d, "wps:wsp").length || find(d, "v:shape").length) this.notes.shapes++;
        else if (blip) this.notes.picturesLost++;
      }
      return;
    }
    const entry = rel.target.startsWith("/") ? rel.target.slice(1) : `word/${rel.target}`.replace(/\/\.\//g, "/");
    const ext = /\.([a-z0-9]+)$/i.exec(entry)?.[1]?.toLowerCase() ?? "";
    if (!MIME[ext] || !this.parts.entries.some((e) => e.name === entry)) {
      this.notes.picturesLost++;
      return;
    }
    const extent = find(d, "wp:extent")[0];
    const cx = Number(extent?.attrs.cx);
    const cy = Number(extent?.attrs.cy);
    const key = `rel:${entry}`;
    if (!this.pictures.some((p) => p.key === key)) this.pictures.push({ key, entry, type: MIME[ext]!, name: entry.split("/").pop() ?? "picture" });
    const alt = find(d, "wp:docPr")[0]?.attrs.descr ?? "";
    out.push({ block: { type: "image", attrs: { image: key, alt: alt.slice(0, 300), width: cx > 0 ? Math.round(cx / 9525) : null, height: cy > 0 ? Math.round(cy / 9525) : null, align: "center", caption: "" } } });
  }

  // ── paragraphs ──

  private style(p: XmlEl): string {
    const id = val(child(p, "w:pPr"), "w:pStyle");
    return (id && this.parts.styles.get(id)) || "";
  }

  private paragraphAttrs(props: XmlEl | undefined) {
    const attrs: Record<string, unknown> = {};
    const jc = val(props, "w:jc");
    if (jc === "center" || jc === "right" || jc === "end") attrs.textAlign = jc === "end" ? "right" : jc;
    else if (jc === "both" || jc === "distribute") attrs.textAlign = "justify";
    const sp = props && child(props, "w:spacing");
    if (sp) {
      if (sp.attrs["w:before"] !== undefined) attrs.spaceBefore = cleanSpace(Number(sp.attrs["w:before"]) / 20);
      if (sp.attrs["w:after"] !== undefined) attrs.spaceAfter = cleanSpace(Number(sp.attrs["w:after"]) / 20);
      if (sp.attrs["w:line"] !== undefined && (sp.attrs["w:lineRule"] ?? "auto") === "auto") {
        const ratio = cleanLineHeight(Number(sp.attrs["w:line"]) / 240);
        if (ratio && ratio !== 1.15) attrs.lineHeight = ratio;
      }
    }
    const ind = props && child(props, "w:ind");
    const left = Number(ind?.attrs["w:left"] ?? ind?.attrs["w:start"]);
    if (left > 0) attrs.indent = cleanIndent(Math.min(8, Math.round(left / (INDENT_STEP * 20))));
    return attrs;
  }

  /** The nodes a paragraph makes: itself, with pictures and page breaks as blocks between its parts. */
  paragraph(p: XmlEl, plain = false): JSONNode[] {
    const pieces: Piece[] = [];
    // A table of contents: its field (and what Word cached inside it) is one node.
    const deep = (el: XmlEl, name: string, into: XmlEl[] = []): XmlEl[] => {
      for (const c of elements(el)) (c.name === name ? into.push(c) : void 0, deep(c, name, into));
      return into;
    };
    const instr = deep(p, "w:instrText").map(textOf).join("");
    const chars = deep(p, "w:fldChar").map((c) => c.attrs["w:fldCharType"]);
    const begins = chars.filter((c) => c === "begin").length;
    const ends = chars.filter((c) => c === "end").length;
    if (this.skipping > 0) {
      this.skipping += begins - ends;
      return [];
    }
    if (/^\s*TOC\b/i.test(instr) && !this.region) {
      this.skipping = Math.max(0, begins - ends);
      return [{ type: "tableOfContents", attrs: { levels: 3 } }];
    }
    this.runs(p, undefined, pieces, { stack: [] });
    const props = child(p, "w:pPr");
    const out: JSONNode[] = [];
    const style = this.style(p);
    const attrs = this.paragraphAttrs(props);
    const heading = /^heading (\d)/.exec(style);
    let inline: JSONNode[] = [];
    const flush = () => {
      const hasText = inline.some((n) => n.type !== "hardBreak" && (n.type !== "text" || n.text!.trim()));
      if (!hasText) return void (inline = []);
      const trimmed = inline;
      inline = [];
      if (plain) return void out.push({ type: "paragraph", attrs: { textAlign: attrs.textAlign ?? null }, content: trimmed.length ? trimmed : undefined });
      if (heading) out.push({ type: "heading", attrs: { level: Math.min(6, Number(heading[1])), ...attrs }, content: trimmed });
      else {
        const role = style === "title" ? "title" : style === "subtitle" ? "subtitle" : null;
        const mono = trimmed.length > 0 && trimmed.every((n) => n.type === "hardBreak" || !n.text?.trim() || n.marks?.some((m) => m.type === "code"));
        if (/^(code|source code|html preformatted|preformatted)/.test(style) || (mono && trimmed.some((n) => n.marks?.some((m) => m.type === "code")))) {
          out.push({ type: "codeBlock", content: [{ type: "text", text: trimmed.map((n) => (n.type === "hardBreak" ? "\n" : (n.text ?? ""))).join("") }] });
        } else out.push({ type: "paragraph", attrs: { ...attrs, role }, content: trimmed.length ? trimmed : undefined });
      }
    };
    const pageBreakBefore = props && on(props, "w:pageBreakBefore");
    if (pageBreakBefore) out.push({ type: "pageBreak" });
    for (const piece of pieces) {
      if ("inline" in piece) inline.push(piece.inline);
      else {
        flush();
        out.push(piece.block);
      }
    }
    // A paragraph that is empty, or only breaks, is a gap in the layout: not kept.
    flush();
    // Lists and quotes: marked for the caller to gather.
    const lastPara = out.filter((n) => n.type === "paragraph" || n.type === "heading").at(-1);
    const num = props && child(props, "w:numPr");
    const numId = num && val(num, "w:numId");
    if (lastPara && !plain) {
      if (num && numId && numId !== "0") {
        const level = Number(val(num, "w:ilvl") ?? 0);
        const spec = this.parts.numbering.get(numId)?.get(level);
        if (spec && spec.kind !== "none") this.mark(lastPara, spec.kind, level, spec.type, spec.start);
      } else if (/^list (bullet|number)/.test(style)) {
        this.mark(lastPara, style.startsWith("list number") ? "ordered" : "bullet", Math.max(0, (Number(/(\d)$/.exec(style)?.[1]) || 1) - 1), "1", 1);
      } else if (/^(quote|quotations?|intense quote|block text|block quotation)/.test(style) && lastPara.type === "paragraph") (lastPara as JSONNode & { quote?: boolean }).quote = true;
    }
    // A section that ends here, and starts the next on a new page.
    const sect = props && child(props, "w:sectPr");
    if (sect) {
      this.notes.sections++;
      if (val(sect, "w:type") !== "continuous") out.push({ type: "pageBreak" });
    }
    return out;
  }

  private mark(para: JSONNode, kind: "bullet" | "ordered", level: number, type: string, start: number) {
    (para as JSONNode & { list?: { kind: string; level: number; type: string; start: number } }).list = { kind, level, type, start };
  }

  // ── blocks: lists and quotes gathered, tables ──

  /** The blocks of a body (or a cell): paragraphs, tables and content controls, with list paragraphs gathered into lists and quote paragraphs into quotes. */
  blocks(el: XmlEl, plain = false): JSONNode[] {
    const flat: JSONNode[] = [];
    const take = (e: XmlEl) => {
      for (const c of elements(e)) {
        if (c.name === "w:p") flat.push(...this.paragraph(c, plain));
        else if (c.name === "w:tbl") {
          if (this.skipping === 0) flat.push(plain ? this.flatTable(c) : this.table(c));
        } else if (c.name === "w:sdt") {
          const gallery = val(child(c, "w:sdtPr"), "w:docPartObj") ?? (child(child(c, "w:sdtPr") ?? c, "w:docPartObj") && val(child(child(c, "w:sdtPr")!, "w:docPartObj")!, "w:docPartGallery"));
          if (!plain && /table of contents/i.test(String(gallery ?? ""))) flat.push({ type: "tableOfContents", attrs: { levels: 3 } });
          else take(child(c, "w:sdtContent") ?? c);
        } else if (c.name === "w:ins" || c.name === "w:customXml") take(c);
        else if (c.name === "w:del") this.notes.deletions++;
      }
    };
    take(el);
    return plain ? flat : this.gather(flat);
  }

  private gather(flat: JSONNode[]): JSONNode[] {
    const out: JSONNode[] = [];
    for (let i = 0; i < flat.length; ) {
      const n = flat[i] as JSONNode & { list?: { kind: "bullet" | "ordered"; level: number; type: string; start: number }; quote?: boolean };
      if (n.list) {
        let j = i;
        while (j < flat.length && (flat[j] as { list?: unknown }).list) j++;
        const items = flat.slice(i, j) as (JSONNode & { list: { kind: "bullet" | "ordered"; level: number; type: string; start: number } })[];
        let k = 0;
        while (k < items.length) {
          const built = this.buildList(items, k, items[k]!.list.level);
          out.push(built.node);
          k = built.next;
        }
        i = j;
      } else if (n.quote) {
        const quote: JSONNode[] = [];
        while (i < flat.length && (flat[i] as { quote?: boolean }).quote) {
          const { quote: _q, ...plainPara } = flat[i++] as JSONNode & { quote?: boolean };
          quote.push(plainPara);
        }
        out.push({ type: "blockquote", content: quote });
      } else {
        out.push(n);
        i++;
      }
    }
    return out;
  }

  private buildList(items: (JSONNode & { list: { kind: "bullet" | "ordered"; level: number; type: string; start: number } })[], at: number, level: number): { node: JSONNode; next: number } {
    const first = items[at]!.list;
    const list: JSONNode = { type: first.kind === "bullet" ? "bulletList" : "orderedList", attrs: first.kind === "ordered" ? { start: first.start, type: first.type } : {}, content: [] };
    let i = at;
    while (i < items.length) {
      const it = items[i]!;
      if (it.list.level > level) {
        const built = this.buildList(items, i, it.list.level);
        const last = list.content!.at(-1) ?? (list.content!.push({ type: "listItem", content: [{ type: "paragraph" }] }), list.content!.at(-1)!);
        last.content!.push(built.node);
        i = built.next;
        continue;
      }
      if (it.list.level < level || it.list.kind !== first.kind) break;
      const { list: _l, ...para } = it as JSONNode & { list?: unknown };
      list.content!.push({ type: "listItem", content: [para as JSONNode] });
      i++;
    }
    return { node: list, next: i };
  }

  private flatTable(t: XmlEl): JSONNode {
    const words = elements(t, "w:tr").flatMap((r) => elements(r, "w:tc")).map((c) => textOf(c).trim()).filter(Boolean).join(" ");
    return { type: "paragraph", content: words ? [{ type: "text", text: words }] : undefined };
  }

  table(t: XmlEl): JSONNode {
    const grid = elements(child(t, "w:tblGrid") ?? t, "w:gridCol").map((g) => Number(g.attrs["w:w"]) || 0);
    const rows: JSONNode[] = [];
    // The cell that a merge down continues, by the column it starts in.
    const above = new Map<number, JSONNode>();
    for (const tr of elements(t, "w:tr")) {
      const header = !!child(child(tr, "w:trPr") ?? tr, "w:tblHeader");
      const cells: JSONNode[] = [];
      let col = 0;
      for (const tc of elements(tr, "w:tc")) {
        const props = child(tc, "w:tcPr");
        const span = Math.max(1, Number(val(props, "w:gridSpan")) || 1);
        const vm = props && child(props, "w:vMerge");
        if (vm && vm.attrs["w:val"] !== "restart") {
          const origin = above.get(col);
          if (origin) origin.attrs!.rowspan = (origin.attrs!.rowspan as number) + 1;
          col += span;
          continue;
        }
        const widths = grid.slice(col, col + span).map((w) => Math.round(w / 15)).filter((w) => w > 0);
        const fill = props && child(props, "w:shd")?.attrs["w:fill"];
        const bg = fill && fill !== "auto" ? cleanColor(`#${fill}`) : null;
        const body = this.blocks(tc);
        const cell: JSONNode = { type: header ? "tableHeader" : "tableCell", attrs: { colspan: span, rowspan: 1, colwidth: widths.length === span ? widths : null, background: bg === "#ffffff" ? null : bg }, content: body.length ? body : [{ type: "paragraph" }] };
        cells.push(cell);
        if (vm) above.set(col, cell);
        else above.delete(col);
        col += span;
      }
      if (cells.length) rows.push({ type: "tableRow", content: cells });
    }
    return { type: "table", content: rows.length ? rows : [{ type: "tableRow", content: [{ type: "tableCell", attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [{ type: "paragraph" }] }] }] };
  }

  /** A header, footer or footnote body as paragraphs. */
  plain(el: XmlEl): JSONNode[] {
    this.region = true;
    const out = this.blocks(el, true);
    this.region = false;
    return out;
  }
}

function closestPaper(w: number, h: number, notes: string[]): { size: Paper; landscape: boolean } {
  const landscape = w > h;
  const [a, b] = landscape ? [h, w] : [w, h];
  let best: Paper = "A4";
  let bestD = Infinity;
  for (const p of PAPERS) {
    const [pw, ph] = PAPER_TWIPS[p];
    const d = Math.hypot(pw - a, ph - b);
    if (d < bestD) (best = p), (bestD = d);
  }
  if (bestD > 60) notes.push(tr("The paper size ({w} × {h} cm) was set to {paper}, the nearest size Docs has.", { w: (a / 566.93).toFixed(1), h: (b / 566.93).toFixed(1), paper: best }));
  return { size: best, landscape };
}

/** A Word file's bytes as a document. Throws, in words for the person, when it is not one. */
export async function convertDocx(bytes: Uint8Array): Promise<Converted> {
  const entries = zipEntries(bytes);
  const documentXml = await readText(bytes, entries, "word/document.xml");
  if (documentXml === null) throw new Error(tr("This is not a Word document: it has no text part."));
  const [styles, numbering, rels, footnotes, endnotes, comments] = await Promise.all(["word/styles.xml", "word/numbering.xml", "word/_rels/document.xml.rels", "word/footnotes.xml", "word/endnotes.xml", "word/comments.xml"].map((n) => readText(bytes, entries, n)));
  const noteMap = new Map<string, XmlEl>();
  for (const [xml, prefix] of [[footnotes, ""], [endnotes, "e"]] as const) {
    if (!xml) continue;
    for (const f of elements(parseXml(xml), prefix ? "w:endnote" : "w:footnote")) {
      const id = f.attrs["w:id"];
      if (id && Number(id) > 0 && !f.attrs["w:type"]) noteMap.set(`${prefix}${id}`, f);
    }
  }
  const relations = relsOf(rels);
  const parts: Parts = { styles: styleNames(styles), numbering: numberingKinds(numbering), rels: relations, footnotes: noteMap, entries };
  const reader = new Reader(parts, relations);
  const body = child(parseXml(documentXml), "w:body");
  if (!body) throw new Error(tr("This Word document has no text."));
  const content = reader.blocks(body);
  const notesList: string[] = [];

  // Page setup: from the last section.
  const sect = child(body, "w:sectPr");
  let setup: PageSetup | null = null;
  const regions: Converted["regions"] = {};
  if (sect) {
    const sz = child(sect, "w:pgSz");
    const mar = child(sect, "w:pgMar");
    const w = Number(sz?.attrs["w:w"]) || 11906;
    const h = Number(sz?.attrs["w:h"]) || 16838;
    const landscape = sz?.attrs["w:orient"] === "landscape" || w > h;
    const paper = closestPaper(landscape ? Math.min(w, h) : w, landscape ? Math.max(w, h) : h, notesList);
    setup = cleanSetup({ size: paper.size, orientation: landscape ? "landscape" : "portrait", top: Number(mar?.attrs["w:top"]), right: Number(mar?.attrs["w:right"]), bottom: Number(mar?.attrs["w:bottom"]), left: Number(mar?.attrs["w:left"]), differentFirst: !!child(sect, "w:titlePg") });
    const cols = Number(child(sect, "w:cols")?.attrs["w:num"]);
    if (cols > 1) reader.notes.columns = true;
    for (const [tag, kinds] of [["w:headerReference", { default: "header", first: "firstHeader" }], ["w:footerReference", { default: "footer", first: "firstFooter" }]] as const) {
      for (const ref of elements(sect, tag)) {
        const region = (kinds as Record<string, string>)[ref.attrs["w:type"] ?? "default"] as keyof Converted["regions"] | undefined;
        const target = ref.attrs["r:id"] ? relations.get(ref.attrs["r:id"])?.target : undefined;
        if (!region || !target) continue;
        const xml = await readText(bytes, entries, target.startsWith("/") ? target.slice(1) : `word/${target}`);
        if (!xml) continue;
        const root = parseXml(xml);
        const paragraphs = new Reader(parts, relations).plain(root);
        // Word's empty header is one empty paragraph: no header.
        if (paragraphs.some((p) => p.content?.length)) regions[region] = { type: "doc", content: paragraphs };
      }
    }
    if (!setup.differentFirst) {
      delete regions.firstHeader;
      delete regions.firstFooter;
    }
  }

  // Footnote bodies, in the order of their references.
  const foot: Converted["footnotes"] = [];
  for (const [key, id] of reader.footnoteIds) {
    const f = noteMap.get(key);
    if (!f) continue;
    const r = new Reader(parts, relations);
    const paras = r.plain(f).filter((p) => p.type === "paragraph");
    // Word's own mark before the note's words leaves a space.
    const lead = paras[0]?.content;
    while (lead?.length && lead[0]!.type === "text" && !lead[0]!.text!.replace(/^\s+/, "")) lead.shift();
    if (lead?.[0]?.type === "text") lead[0].text = lead[0].text!.replace(/^\s+/, "");
    foot.push({ id, content: paras.length ? paras : [{ type: "paragraph" }] });
  }

  // What was not carried.
  const n = reader.notes;
  const count = (num: number, one: string, many: string) => (num === 1 ? one : tr(many, { n: num }));
  const commentCount = comments ? elements(parseXml(comments), "w:comment").length : 0;
  if (commentCount) notesList.push(count(commentCount, tr("1 comment was not carried: Docs documents keep comments on the page, not in the file."), "{n} comments were not carried: Docs documents keep comments on the page, not in the file."));
  if (n.deletions) notesList.push(count(n.deletions, tr("1 tracked deletion: the deleted words were left out and the inserted words kept."), "{n} tracked deletions: the deleted words were left out and the inserted words kept."));
  if (n.textBoxes) notesList.push(count(n.textBoxes, tr("1 text box was left out."), "{n} text boxes were left out."));
  if (n.shapes) notesList.push(count(n.shapes, tr("1 drawing shape was left out."), "{n} drawing shapes were left out."));
  if (n.equations) notesList.push(count(n.equations, tr("1 equation was left out."), "{n} equations were left out."));
  if (n.charts) notesList.push(count(n.charts, tr("1 chart or diagram was left out."), "{n} charts or diagrams were left out."));
  if (n.picturesLost) notesList.push(count(n.picturesLost, tr("1 picture could not be read and was left out."), "{n} pictures could not be read and were left out."));
  if (n.internalLinks) notesList.push(count(n.internalLinks, tr("1 link to a place inside the document was kept as plain text."), "{n} links to places inside the document were kept as plain text."));
  if (n.columns) notesList.push(tr("The page has columns: the text is in one column."));
  if (n.sections > 1) notesList.push(tr("The document has several sections: the page setup of the last one applies to all, and each section break became a page break."));
  if (!content.length && !Object.keys(regions).length) throw new Error(tr("This Word document has no text to import."));
  return { content, footnotes: foot, regions, setup, pictures: reader.pictures, notes: notesList };
}

/** Reads a picture of the file (by the key an image node holds). */
export async function readPicture(bytes: Uint8Array, entry: string): Promise<Uint8Array | null> {
  const entries = zipEntries(bytes);
  const e = entries.find((x) => x.name === entry);
  return e ? readEntry(bytes, e, 12 * 1024 * 1024) : null;
}
