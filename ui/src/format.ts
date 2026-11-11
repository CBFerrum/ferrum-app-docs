// Character and paragraph formatting for a document (the word processor's everyday set): font family
// and size, text and highlight colour, sub- and superscript, line spacing, space around a paragraph,
// indent, cell colour, and clearing it all. What the shared document stores is a validated value, never
// a style string: values arrive from the clipboard and from other people's browsers, so every one is
// checked when it is read (paste) and again when it is drawn (a hostile update from another client
// cannot put CSS on the page). Pure checks are exported and tested (format.test.ts).
//
// The marks and attributes are all unknown to an older client. Such a client does not drop the text:
// y-tiptap fails to project the document ("There is no mark type textStyle") and leaves the shared
// document as it is (format.test.ts shows it), so the loss is a page that does not open until it is
// reloaded, never a document that is rewritten without the styles.

import { Extension } from "@tiptap/core";
import { Highlight } from "@tiptap/extension-highlight";
import { Subscript } from "@tiptap/extension-subscript";
import { TableView } from "@tiptap/extension-table";
import { Superscript } from "@tiptap/extension-superscript";
import { TextStyle } from "@tiptap/extension-text-style";
import { columnResizing } from "@tiptap/pm/tables";
import type { Editor } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

// ── colours ──

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const RGB = /^rgba?\(\s*(\d{1,3})\s*[,\s]\s*(\d{1,3})\s*[,\s]\s*(\d{1,3})\s*(?:[,/]\s*(\d*\.?\d+%?)\s*)?\)$/i;
// The basic names Word writes; anything else a name could be is refused rather than guessed.
const NAMED: Record<string, string> = {
  black: "#000000",
  white: "#ffffff",
  silver: "#c0c0c0",
  gray: "#808080",
  grey: "#808080",
  maroon: "#800000",
  red: "#ff0000",
  purple: "#800080",
  fuchsia: "#ff00ff",
  magenta: "#ff00ff",
  green: "#008000",
  lime: "#00ff00",
  olive: "#808000",
  yellow: "#ffff00",
  navy: "#000080",
  blue: "#0000ff",
  teal: "#008080",
  aqua: "#00ffff",
  cyan: "#00ffff",
  orange: "#ffa500",
};

const two = (n: number) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0");

/** A colour as `#rrggbb`, or null for anything else: not a colour, fully transparent, or the
 *  automatic colour (`windowtext`, `inherit`…). Alpha is dropped: a document colour is solid. */
export function cleanColor(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  if (v.length > 40) return null;
  if (HEX.test(v)) {
    const h = v.slice(1);
    if (h.length === 8 && parseInt(h.slice(6), 16) === 0) return null;
    if (h.length === 3) return `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`;
    return `#${h.slice(0, 6)}`;
  }
  const m = RGB.exec(v);
  if (m) {
    const a = m[4] === undefined ? 1 : m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    if (!(a > 0)) return null;
    if ([m[1], m[2], m[3]].some((c) => +c! > 255)) return null;
    return `#${two(+m[1]!)}${two(+m[2]!)}${two(+m[3]!)}`;
  }
  return NAMED[v] ?? null;
}

/** A colour read from pasted text: black is the automatic colour (every Word and Google paragraph
 *  says black), so it is not kept as a choice. */
export const pastedColor = (value: unknown) => {
  const c = cleanColor(value);
  return c === "#000000" ? null : c;
};

// ── fonts ──

export interface Font {
  /** What the document keeps, and the menu shows. */
  name: string;
  stack: string;
}

/** The families offered: the interface's own sans stack (the default, kept as nothing), a serif and a
 *  monospace stack, and the common names with fallbacks, none of which needs a download. */
export const FONTS: Font[] = [
  { name: "Serif", stack: 'ui-serif, Georgia, "Times New Roman", serif' },
  { name: "Monospace", stack: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" },
  { name: "Arial", stack: "Arial, Helvetica, sans-serif" },
  { name: "Georgia", stack: 'Georgia, "Times New Roman", serif' },
  { name: "Times New Roman", stack: '"Times New Roman", Times, serif' },
  { name: "Courier New", stack: '"Courier New", Courier, monospace' },
  { name: "Verdana", stack: "Verdana, Geneva, sans-serif" },
  { name: "Trebuchet MS", stack: '"Trebuchet MS", Helvetica, sans-serif' },
];
const GENERIC: Record<string, string | null> = { serif: "Serif", "ui-serif": "Serif", monospace: "Monospace", "ui-monospace": "Monospace", "sans-serif": null, "system-ui": null, "ui-sans-serif": null, "-apple-system": null, inherit: null, initial: null };
const FAMILY = /^[\p{L}\p{N} _.-]{1,60}$/u;

/** A family name to keep, from a name or from a CSS list (the first family counts): one of the
 *  offered ones in its own spelling, or a plain name (letters, digits, spaces) a reader's computer
 *  may have; null for the default and for anything with punctuation that could be CSS. */
export function cleanFontFamily(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 300) return null;
  const first = value.split(",")[0]!.trim().replace(/^["']+|["']+$/g, "").trim();
  if (!first) return null;
  const lower = first.toLowerCase();
  if (lower in GENERIC) return GENERIC[lower]!;
  const known = FONTS.find((f) => f.name.toLowerCase() === lower);
  if (known) return known.name;
  return FAMILY.test(first) && !/^(url|expression|import)$/i.test(first) ? first : null;
}

/** The CSS for a kept family name (validated again here). */
export function fontStack(name: unknown): string | null {
  const n = cleanFontFamily(name);
  if (!n) return null;
  const known = FONTS.find((f) => f.name === n);
  if (known) return known.stack;
  const generic = /mono|courier|consol/i.test(n) ? "monospace" : /serif|georgia|times|cambria|garamond|book|palatino/i.test(n) && !/sans/i.test(n) ? "serif" : "sans-serif";
  return `"${n}", ${generic}`;
}

// ── sizes (points) ──

/** The size menu's set (Google Docs'), the document's own size, and the bounds a size may have. */
export const SIZES = [8, 9, 10, 11, 12, 14, 18, 24, 30, 36, 48, 60, 72, 96];
export const DEFAULT_SIZE = 11;
export const MIN_SIZE = 6;
export const MAX_SIZE = 200;

/** A size in points (a number, `12pt`, or `16px`), rounded to a half point; null outside the bounds. */
export function cleanFontSize(value: unknown): number | null {
  let pt: number;
  if (typeof value === "number") pt = value;
  else if (typeof value === "string") {
    const m = /^\s*(\d{1,3}(?:\.\d+)?)\s*(pt|px)?\s*$/i.exec(value);
    if (!m) return null;
    pt = m[2]?.toLowerCase() === "px" ? parseFloat(m[1]!) * 0.75 : parseFloat(m[1]!);
  } else return null;
  if (!Number.isFinite(pt)) return null;
  pt = Math.round(pt * 2) / 2;
  return pt >= MIN_SIZE && pt <= MAX_SIZE ? pt : null;
}

/** The next size up or down the menu's set from `from` (the document's own size when none). */
export function stepSize(from: number | null | undefined, direction: 1 | -1): number {
  const cur = from ?? DEFAULT_SIZE;
  if (direction > 0) return SIZES.find((s) => s > cur) ?? Math.min(MAX_SIZE, Math.floor(cur) + 1);
  return [...SIZES].reverse().find((s) => s < cur) ?? Math.max(MIN_SIZE, Math.ceil(cur) - 1);
}

// ── paragraphs ──

export const LINE_HEIGHTS = [1, 1.15, 1.5, 2];
const POINTS = { pt: 1, px: 0.75, in: 72, cm: 28.346, mm: 2.8346 } as const;

/** A line height as a ratio of the text size (`1.5`, `150%`); null for the document's own. */
export function cleanLineHeight(value: unknown): number | null {
  let n: number;
  if (typeof value === "number") n = value;
  else if (typeof value === "string") {
    const m = /^\s*(\d*\.?\d+)\s*(%)?\s*$/.exec(value);
    if (!m) return null;
    n = m[2] ? parseFloat(m[1]!) / 100 : parseFloat(m[1]!);
  } else return null;
  if (!Number.isFinite(n)) return null;
  n = Math.round(n * 100) / 100;
  return n >= 0.8 && n <= 4 ? n : null;
}

/** Space above or below a paragraph in points (`6pt`, `0cm`, `8px`); null outside 0 to 200. */
export function cleanSpace(value: unknown): number | null {
  let n: number;
  if (typeof value === "number") n = value;
  else if (typeof value === "string") {
    const m = /^\s*(\d*\.?\d+)\s*(pt|px|in|cm|mm)?\s*$/i.exec(value);
    if (!m) return null;
    n = parseFloat(m[1]!) * POINTS[(m[2]?.toLowerCase() ?? "pt") as keyof typeof POINTS];
  } else return null;
  if (!Number.isFinite(n)) return null;
  n = Math.round(n);
  return n >= 0 && n <= 200 ? n : null;
}

/** An indent in levels of 36pt (half an inch), 0 to 8. */
export const INDENT_STEP = 36;
export const MAX_INDENT = 8;
export function cleanIndent(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isInteger(n) && n >= 1 && n <= MAX_INDENT ? n : null;
}
/** The indent a pasted left margin means (`36pt`, `0.5in`): the nearest level, none under half of one. */
export function indentOf(margin: unknown): number | null {
  const pt = cleanSpace(typeof margin === "string" && /^\s*\d/.test(margin) ? margin : null);
  return pt === null ? null : cleanIndent(Math.round(pt / INDENT_STEP));
}

// ── lists ──

export const BULLETS = ["disc", "circle", "square"] as const;
export const NUMBERS = ["1", "a", "i"] as const;
export const cleanBullet = (v: unknown) => (BULLETS as readonly string[]).includes(v as string) && v !== "disc" ? (v as string) : null;
export const cleanNumbering = (v: unknown) => ((NUMBERS as readonly string[]).includes(v as string) ? (v as string) : "1");

// ── palette ──

const hex = (h: number, s: number, l: number) => {
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return Math.round(255 * (l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return `#${two(f(0))}${two(f(8))}${two(f(4))}`;
};

/** Ten hues in five shades each (lightest to darkest), then black, greys and white: the colours a
 *  document can take without typing one. */
export const HUES = [
  { id: "red", h: 4 },
  { id: "orange", h: 28 },
  { id: "yellow", h: 48 },
  { id: "green", h: 135 },
  { id: "teal", h: 175 },
  { id: "cyan", h: 195 },
  { id: "blue", h: 215 },
  { id: "indigo", h: 245 },
  { id: "purple", h: 275 },
  { id: "pink", h: 325 },
] as const;
const LIGHTNESS = [88, 72, 52, 36, 22];
export const SHADES = LIGHTNESS.map((l) => HUES.map(({ h }) => hex(h, 72, l)));
export const GREYS = ["#000000", "#262626", "#434343", "#666666", "#999999", "#b7b7b7", "#cccccc", "#d9d9d9", "#efefef", "#ffffff"];

// ── the extensions ──

/** The value of a style on this element or, for a span inside a span, on the nearest one around it. */
const styled = (el: HTMLElement, prop: "color" | "fontFamily" | "fontSize" | "backgroundColor") => {
  for (let e: HTMLElement | null = el; e; e = e.parentElement?.closest("span") ?? null) if (e.style[prop]) return e.style[prop];
  return "";
};

/** Character styles: one mark, `textStyle`, with the family, size and colour. */
export const DocTextStyle = TextStyle.extend({
  addOptions() {
    return { HTMLAttributes: {}, mergeNestedSpanStyles: false };
  },
  addAttributes() {
    return {
      color: {
        default: null,
        parseHTML: (el: HTMLElement) => pastedColor(styled(el, "color")),
        renderHTML: (a: Record<string, unknown>) => (cleanColor(a.color) ? { style: `color: ${cleanColor(a.color)}` } : {}),
      },
      fontFamily: {
        default: null,
        parseHTML: (el: HTMLElement) => cleanFontFamily(styled(el, "fontFamily")),
        renderHTML: (a: Record<string, unknown>) => (fontStack(a.fontFamily) ? { style: `font-family: ${fontStack(a.fontFamily)}` } : {}),
      },
      fontSize: {
        default: null,
        parseHTML: (el: HTMLElement) => {
          const s = cleanFontSize(styled(el, "fontSize"));
          return s === DEFAULT_SIZE ? null : s;
        },
        renderHTML: (a: Record<string, unknown>) => (cleanFontSize(a.fontSize) ? { style: `font-size: ${cleanFontSize(a.fontSize)}pt` } : {}),
      },
    };
  },
  parseHTML() {
    return [
      {
        tag: "span",
        consuming: false,
        // A span that says nothing this document keeps (Word's are full of `mso-` styles) is not a mark.
        getAttrs: (el: HTMLElement | string) => {
          if (typeof el === "string" || !el.hasAttribute("style")) return false;
          const says = pastedColor(styled(el, "color")) || cleanFontFamily(styled(el, "fontFamily")) || (cleanFontSize(styled(el, "fontSize")) ?? DEFAULT_SIZE) !== DEFAULT_SIZE;
          return says ? {} : false;
        },
      },
    ];
  },
});

/** Highlight in any colour (a highlight with none is the document's yellow). */
export const DocHighlight = Highlight.extend({
  addAttributes() {
    return {
      color: {
        default: null,
        parseHTML: (el: HTMLElement) => cleanColor(el.getAttribute("data-color")) ?? cleanColor(el.style.backgroundColor),
        renderHTML: (a: Record<string, unknown>) => {
          const c = cleanColor(a.color);
          return c ? { "data-color": c, style: `background-color: ${c}; color: inherit` } : {};
        },
      },
    };
  },
  parseHTML() {
    return [
      { tag: "mark" },
      // Google Docs and Word say highlight as a background on a span.
      { tag: "span", consuming: false, getAttrs: (el: HTMLElement | string) => (typeof el !== "string" && cleanColor(el.style.backgroundColor) ? {} : false) },
    ];
  },
  // Replace and Find own the ⌘⇧H keys; the toolbar's colour menu is the way to a highlight.
  addKeyboardShortcuts: () => ({}),
});

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    docFormat: {
      setFontFamily: (name: string | null) => ReturnType;
      setFontSize: (pt: number | null) => ReturnType;
      changeFontSize: (direction: 1 | -1) => ReturnType;
      setTextColor: (color: string | null) => ReturnType;
      setHighlightColor: (color: string | null) => ReturnType;
      setLineHeight: (ratio: number | null) => ReturnType;
      setParagraphSpace: (space: { before?: number | null; after?: number | null }) => ReturnType;
      indentMore: () => ReturnType;
      indentLess: () => ReturnType;
      clearFormatting: () => ReturnType;
      setCellBackground: (color: string | null) => ReturnType;
    };
  }
}

const BLOCKS = ["paragraph", "heading"];
const CHARACTER_MARKS = ["bold", "italic", "underline", "strike", "code", "highlight", "textStyle", "subscript", "superscript"];

const style = (rules: [string, string | number | null][]) => {
  const s = rules.filter(([, v]) => v !== null).map(([k, v]) => `${k}: ${v}`);
  return s.length ? { style: s.join("; ") } : {};
};

export const Formatting = Extension.create({
  name: "docFormatting",

  addGlobalAttributes() {
    return [
      {
        types: BLOCKS,
        attributes: {
          lineHeight: {
            default: null,
            parseHTML: (el: HTMLElement) => cleanLineHeight(el.style.lineHeight),
            renderHTML: (a: Record<string, unknown>) => style([["line-height", cleanLineHeight(a.lineHeight)]]),
          },
          spaceBefore: {
            default: null,
            parseHTML: (el: HTMLElement) => cleanSpace(el.style.marginTop),
            renderHTML: (a: Record<string, unknown>) => {
              const n = cleanSpace(a.spaceBefore);
              return style([["margin-block-start", n === null ? null : `${n}pt`]]);
            },
          },
          spaceAfter: {
            default: null,
            parseHTML: (el: HTMLElement) => cleanSpace(el.style.marginBottom),
            renderHTML: (a: Record<string, unknown>) => {
              const n = cleanSpace(a.spaceAfter);
              return style([["margin-block-end", n === null ? null : `${n}pt`]]);
            },
          },
          indent: {
            default: null,
            parseHTML: (el: HTMLElement) => indentOf(el.style.marginLeft) ?? indentOf(el.style.marginInlineStart),
            renderHTML: (a: Record<string, unknown>) => {
              const n = cleanIndent(a.indent);
              return style([["margin-inline-start", n === null ? null : `${n * INDENT_STEP}pt`]]);
            },
          },
        },
      },
      {
        types: ["tableCell", "tableHeader"],
        attributes: {
          background: {
            default: null,
            parseHTML: (el: HTMLElement) => cleanColor(el.getAttribute("data-background")) ?? pastedBackground(el),
            renderHTML: (a: Record<string, unknown>) => {
              const c = cleanColor(a.background);
              return c ? { "data-background": c, style: `background-color: ${c}` } : {};
            },
          },
        },
      },
      {
        types: ["tableCell", "tableHeader"],
        attributes: {
          // Where the cell's content sits: top (absent), middle or bottom. Its horizontal place is its paragraphs' alignment, as in Word.
          verticalAlign: {
            default: null,
            parseHTML: (el: HTMLElement) => cleanVAlign(el.getAttribute("data-valign") ?? el.style.verticalAlign),
            renderHTML: (a: Record<string, unknown>) => (cleanVAlign(a.verticalAlign) ? { "data-valign": cleanVAlign(a.verticalAlign)! } : {}),
          },
        },
      },
      {
        types: ["table"],
        attributes: {
          // "none": the table is drawn without borders (absent: with them).
          borders: {
            default: null,
            parseHTML: (el: HTMLElement) => (el.getAttribute("data-borders") === "none" ? "none" : null),
            renderHTML: (a: Record<string, unknown>) => (a.borders === "none" ? { "data-borders": "none" } : {}),
          },
        },
      },
      {
        types: ["orderedList"],
        attributes: {
          // Numbering goes on from the numbered list before it at the same depth (its `start` is then ignored).
          continues: {
            default: null,
            parseHTML: (el: HTMLElement) => (el.hasAttribute("data-continues") ? true : null),
            renderHTML: (a: Record<string, unknown>) => (a.continues === true ? { "data-continues": "" } : {}),
          },
        },
      },
      {
        types: ["bulletList"],
        attributes: {
          bullet: {
            default: null,
            parseHTML: (el: HTMLElement) => cleanBullet(el.style.listStyleType),
            renderHTML: (a: Record<string, unknown>) => style([["list-style-type", cleanBullet(a.bullet)]]),
          },
        },
      },
    ];
  },

  addCommands() {
    const textStyle = (attrs: Record<string, unknown>) => ({ chain }: { chain: () => ReturnType<Editor["chain"]> }) => chain().setMark("textStyle", attrs).removeEmptyTextStyle().run();
    const blocks = (attrs: Record<string, unknown>) => ({ chain }: { chain: () => ReturnType<Editor["chain"]> }) => {
      let c = chain();
      for (const type of BLOCKS) c = c.updateAttributes(type, attrs);
      return c.run();
    };
    return {
      setFontFamily: (name) => textStyle({ fontFamily: cleanFontFamily(name) }),
      setFontSize: (pt) => textStyle({ fontSize: pt === DEFAULT_SIZE ? null : cleanFontSize(pt) }),
      changeFontSize:
        (direction) =>
        ({ editor, commands }) => {
          const next = stepSize(cleanFontSize(editor.getAttributes("textStyle").fontSize), direction);
          return commands.setFontSize(next);
        },
      setTextColor: (color) => textStyle({ color: cleanColor(color) }),
      setHighlightColor:
        (color) =>
        ({ chain }) => {
          const c = cleanColor(color);
          return c ? chain().setMark("highlight", { color: c }).run() : chain().unsetMark("highlight").run();
        },
      setLineHeight: (ratio) => blocks({ lineHeight: cleanLineHeight(ratio) }),
      setParagraphSpace: ({ before, after }) => blocks({ ...(before !== undefined ? { spaceBefore: cleanSpace(before) } : {}), ...(after !== undefined ? { spaceAfter: cleanSpace(after) } : {}) }),
      indentMore:
        () =>
        ({ editor, chain }) => {
          if (editor.isActive("listItem") || editor.isActive("taskItem")) return editor.commands.sinkListItem(editor.isActive("taskItem") ? "taskItem" : "listItem");
          const next = Math.min(MAX_INDENT, (cleanIndent(editor.getAttributes("paragraph").indent ?? editor.getAttributes("heading").indent) ?? 0) + 1);
          let c = chain();
          for (const type of BLOCKS) c = c.updateAttributes(type, { indent: next });
          return c.run();
        },
      indentLess:
        () =>
        ({ editor, chain }) => {
          if (editor.isActive("listItem") || editor.isActive("taskItem")) return editor.commands.liftListItem(editor.isActive("taskItem") ? "taskItem" : "listItem");
          const next = (cleanIndent(editor.getAttributes("paragraph").indent ?? editor.getAttributes("heading").indent) ?? 0) - 1;
          let c = chain();
          for (const type of BLOCKS) c = c.updateAttributes(type, { indent: next > 0 ? next : null });
          return c.run();
        },
      // Character formatting and the paragraph's own (alignment, spacing, indent) go; links, suggestions,
      // headings and lists stay: they are what the text is, not how it looks.
      clearFormatting:
        () =>
        ({ chain }) => {
          let c = chain();
          for (const m of CHARACTER_MARKS) c = c.unsetMark(m);
          for (const type of BLOCKS) c = c.updateAttributes(type, { textAlign: null, lineHeight: null, spaceBefore: null, spaceAfter: null, indent: null });
          return c.run();
        },
      setCellBackground:
        (color) =>
        ({ commands }) => {
          const c = cleanColor(color);
          return commands.setCellAttribute("background", c);
        },
    };
  },
  // Its keys are in keys.ts, with every other shortcut.
  addProseMirrorPlugins() {
    return [listNumbersPlugin()];
  },
});

/** A cell's vertical place: middle or bottom (top is the default, stored as nothing). */
export const cleanVAlign = (v: unknown): "middle" | "bottom" | null => (v === "middle" || v === "bottom" ? v : null);

/** The number each numbered list starts at, a list that continues taking up where the one before it at its depth
 *  ended. Lists that do not continue keep their own `start`. */
export function listNumbers(doc: PMNode): Map<number, number> {
  const next = new Map<number, number>();
  const out = new Map<number, number>();
  doc.descendants((node, pos) => {
    if (node.type.name !== "orderedList") return true;
    const depth = doc.resolve(pos).depth;
    const own = Number.isInteger(node.attrs.start) && (node.attrs.start as number) >= 0 ? (node.attrs.start as number) : 1;
    const first = node.attrs.continues === true && next.has(depth) ? next.get(depth)! : own;
    out.set(pos, first);
    next.set(depth, first + node.childCount);
    return true;
  });
  return out;
}

/** Draws what a node's own element cannot: a continued list's first number (`start`), and a table without borders
 *  (the table's element is the column-resizing view's, which draws no attributes). As decorations: ProseMirror owns
 *  the elements, so they are not set by hand. */
export function listNumbersPlugin(): Plugin {
  const cache = new WeakMap<PMNode, DecorationSet>();
  return new Plugin({
    key: new PluginKey("docListNumbers"),
    props: {
      decorations(state) {
        let set = cache.get(state.doc);
        if (!set) {
          const decos: Decoration[] = [];
          for (const [pos, n] of listNumbers(state.doc)) {
            const node = state.doc.nodeAt(pos);
            if (node?.attrs.continues === true) decos.push(Decoration.node(pos, pos + node.nodeSize, { start: String(n) }));
          }
          state.doc.descendants((node, pos) => {
            if (node.type.name === "table" && node.attrs.borders === "none") decos.push(Decoration.node(pos, pos + node.nodeSize, { "data-borders": "none" }));
            return node.isBlock && !node.isTextblock;
          });
          set = DecorationSet.create(state.doc, decos);
          cache.set(state.doc, set);
        }
        return set;
      },
    },
  });
}

/** A cell's pasted colour: Word writes `background:#D9E2F3` or `bgcolor`; white is no colour. */
function pastedBackground(el: HTMLElement): string | null {
  const c = cleanColor(el.style.backgroundColor) ?? cleanColor(el.getAttribute("bgcolor"));
  return c === "#ffffff" ? null : c;
}

/** Columns dragged to a width. TableKit adds this only to an editor that is editable when it is made, and
 *  the live editor becomes editable once the document has loaded, so the plugin is added here (it does
 *  nothing while the editor is read-only). */
export const ColumnResize = Extension.create({
  name: "docColumnResize",
  addProseMirrorPlugins() {
    return [columnResizing({ handleWidth: 5, cellMinWidth: 25, defaultCellMinWidth: 25, View: TableView, lastColumnResizable: true })];
  },
});

/** The extensions of this file, for the schema. */
export const formattingExtensions = () => [DocTextStyle, DocHighlight, Subscript, Superscript, Formatting];
