// The header and footer of a document: small rich-text regions (paragraphs with a few character styles
// and alignment, and fields that print as the page number, the page count, the date and the title). Each is
// its own fragment of the shared document ("header", "footer", and "firstHeader", "firstFooter" when the
// first page has its own), edited in place at the top and the bottom of the page.

import { Node } from "@tiptap/core";
import type { AnyExtension } from "@tiptap/core";
import { StarterKit } from "@tiptap/starter-kit";
import { TextAlign } from "@tiptap/extension-text-align";
import { t } from "@ferrum/client";
import { DocTextStyle } from "./format";

export const REGIONS = ["header", "footer", "firstHeader", "firstFooter"] as const;
export type Region = (typeof REGIONS)[number];

export const FIELDS = ["page", "pages", "date", "title"] as const;
export type Field = (typeof FIELDS)[number];
export const cleanField = (v: unknown): Field => ((FIELDS as readonly string[]).includes(v as string) ? (v as Field) : "page");
export const fieldLabel = (f: Field) => (f === "page" ? t("Page number") : f === "pages" ? t("Page count") : f === "date" ? t("Date") : t("Document title"));

/** A value the printed page fills in: the number of the page, how many there are, today's date, the title. */
export const PageField = Node.create({
  name: "pageField",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      kind: {
        default: "page",
        parseHTML: (el: HTMLElement) => cleanField(el.getAttribute("data-field")),
        renderHTML: (a: Record<string, unknown>) => ({ "data-field": cleanField(a.kind) }),
      },
    };
  },
  parseHTML() {
    return [{ tag: "span[data-field]" }];
  },
  renderHTML({ node }) {
    const kind = cleanField(node.attrs.kind);
    return ["span", { "data-field": kind, class: "doc-field", "data-label": fieldLabel(kind) }];
  },
});

/** The schema of a region: paragraphs, bold, italic, underline, font, size and colour, alignment, fields. */
export function regionExtensions(): AnyExtension[] {
  return [
    StarterKit.configure({
      undoRedo: false,
      blockquote: false,
      bulletList: false,
      orderedList: false,
      listItem: false,
      listKeymap: false,
      codeBlock: false,
      code: false,
      heading: false,
      horizontalRule: false,
      strike: false,
      link: false,
      hardBreak: false,
      dropcursor: false,
      gapcursor: false,
    }),
    DocTextStyle,
    TextAlign.configure({ types: ["paragraph"] }),
    PageField,
  ];
}
