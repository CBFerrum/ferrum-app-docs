// Images in a document (Ferrum collaboration.md, C3): a node naming an image the document keeps in
// Drive (`image`, an id), with what it shows (`alt`) and its size. The page shows it from Drive; the
// document never holds an address, so it cannot send readers anywhere else, and only images that
// name a document's image are taken from pasted pages (others' pictures are added as files).

import { mergeAttributes, Node } from "@tiptap/core";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";

/** Where a document's image is shown from. */
export function imageUrl(file: string, image: string): string {
  return `/api/app/drive/files/${encodeURIComponent(file)}/images/${encodeURIComponent(image)}`;
}

/** The kinds Drive keeps in documents. */
export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];
/** The largest image a document takes. */
export const MAX_IMAGE = 10 * 1024 * 1024;

/** The image files among dropped or pasted ones. */
export function imageFiles(files: ArrayLike<File> | null | undefined): File[] {
  return Array.from(files ?? []).filter((f) => IMAGE_TYPES.includes(f.type));
}

/** Where an image sits: in its own line (left, centre, right) or beside the text that wraps round it. */
export const ALIGNS = ["left", "center", "right", "wrapLeft", "wrapRight"] as const;
export type ImageAlign = (typeof ALIGNS)[number];
export const cleanAlign = (v: unknown): ImageAlign => ((ALIGNS as readonly string[]).includes(v as string) ? (v as ImageAlign) : "center");
/** What an image may be drawn as wide, in pixels. */
export const MIN_WIDTH = 48;
export const MAX_WIDTH = 4000;
export const cleanWidth = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v >= 1 && v <= MAX_WIDTH ? Math.round(v) : null);
/** A caption: one line of plain words. */
export const cleanCaption = (v: unknown): string => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, 300) : "");

export interface ImageAttrs {
  image: string;
  alt?: string;
  width?: number | null;
  height?: number | null;
  align?: ImageAlign;
  caption?: string;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    docImage: {
      /** Adds an image at the selection; the caret goes to the text after it (a new paragraph
       *  when nothing follows), so typing on does not replace the image. */
      insertImage: (attrs: ImageAttrs) => ReturnType;
      /** Describes the selected image. */
      describeImage: (alt: string) => ReturnType;
      /** Where the selected image sits. */
      alignImage: (align: ImageAlign) => ReturnType;
      /** Words under the selected image. */
      captionImage: (caption: string) => ReturnType;
      /** Draws the selected image this wide (its height follows). */
      resizeImage: (width: number) => ReturnType;
      /** Puts another picture of the document in the selected image's place, keeping its alt text, place and caption. */
      replaceImage: (attrs: { image: string; width?: number | null; height?: number | null }) => ReturnType;
    };
  }
}

const number = (v: string | null) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
};

export const DocImage = Node.create<{ file: string }>({
  name: "image",
  group: "block",
  atom: true,
  // Not draggable: in Chrome a draggable atom is not selected by a click (move images by cut and
  // paste, which keeps their id).
  draggable: false,
  selectable: true,

  addOptions() {
    return { file: "" };
  },

  addAttributes() {
    return {
      image: { default: null, parseHTML: (el) => el.getAttribute("data-image"), renderHTML: () => ({}) },
      alt: { default: "", parseHTML: (el) => el.getAttribute("alt") ?? "", renderHTML: () => ({}) },
      width: { default: null, parseHTML: (el) => number(el.getAttribute("width")), renderHTML: () => ({}) },
      height: { default: null, parseHTML: (el) => number(el.getAttribute("height")), renderHTML: () => ({}) },
      align: { default: "center", parseHTML: (el) => cleanAlign(el.getAttribute("data-align")), renderHTML: () => ({}) },
      caption: { default: "", parseHTML: (el) => cleanCaption(el.getAttribute("data-caption")), renderHTML: () => ({}) },
    };
  },

  parseHTML() {
    // A document's own image (copied from this or another document); nothing from elsewhere.
    return [{ tag: "img[data-image]", getAttrs: (el) => (/^[0-9a-f-]{36}$/i.test(el.getAttribute("data-image") ?? "") ? null : false) }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const { image, alt, width, height, align, caption } = node.attrs as ImageAttrs;
    return [
      "img",
      mergeAttributes(HTMLAttributes, {
        "data-image": image,
        src: imageUrl(this.options.file, image),
        alt: alt ?? "",
        ...(width ? { width } : {}),
        ...(height ? { height } : {}),
        ...(cleanAlign(align) !== "center" ? { "data-align": cleanAlign(align) } : {}),
        ...(cleanCaption(caption) ? { "data-caption": cleanCaption(caption) } : {}),
        loading: "lazy",
        class: "doc-image",
      }),
    ];
  },

  // The page draws an image in a figure: handles at its corners to drag it to a size (the shape stays),
  // its words beneath. The shared document keeps only the attributes.
  addNodeView() {
    const file = this.options.file;
    return ({ node: first, getPos, editor }) => {
      let node = first;
      const dom = document.createElement("figure");
      dom.className = "doc-figure";
      const box = document.createElement("div");
      box.className = "doc-figure-box";
      const img = document.createElement("img");
      img.className = "doc-image";
      img.loading = "lazy";
      box.append(img);
      for (const corner of ["nw", "ne", "sw", "se"]) {
        const h = document.createElement("span");
        h.className = "doc-handle";
        h.dataset.corner = corner;
        h.setAttribute("aria-hidden", "true");
        box.append(h);
      }
      const words = document.createElement("figcaption");
      words.dir = "auto";
      dom.append(box, words);
      const draw = (n: typeof node) => {
        const a = n.attrs as ImageAttrs;
        img.src = imageUrl(file, a.image);
        img.alt = a.alt ?? "";
        img.dataset.image = a.image;
        if (a.width) img.width = a.width;
        else img.removeAttribute("width");
        if (a.height) img.height = a.height;
        else img.removeAttribute("height");
        img.style.removeProperty("width");
        dom.dataset.align = cleanAlign(a.align);
        words.textContent = cleanCaption(a.caption);
        words.hidden = !words.textContent;
      };
      draw(node);
      // Dragging a corner: the width follows the pointer (away from the image's middle widens it), the
      // height keeps the shape, and one step is written when the pointer is released.
      box.addEventListener("pointerdown", (e) => {
        const h = (e.target as HTMLElement).closest<HTMLElement>(".doc-handle");
        if (!h || e.button !== 0) return;
        e.preventDefault();
        const start = img.getBoundingClientRect();
        const sign = (h.dataset.corner!.endsWith("e") ? 1 : -1) * (getComputedStyle(dom).direction === "rtl" ? -1 : 1);
        const room = Math.min(MAX_WIDTH, dom.parentElement?.clientWidth ?? MAX_WIDTH);
        let width = start.width;
        h.setPointerCapture(e.pointerId);
        const move = (m: PointerEvent) => {
          width = Math.max(MIN_WIDTH, Math.min(room, start.width + sign * (m.clientX - e.clientX)));
          img.style.width = `${Math.round(width)}px`;
        };
        const stop = () => {
          h.removeEventListener("pointermove", move);
          h.removeEventListener("pointerup", stop);
          h.removeEventListener("pointercancel", stop);
          const pos = getPos();
          if (typeof pos === "number") editor.chain().focus().setNodeSelection(pos).resizeImage(Math.round(width)).run();
          img.style.removeProperty("width");
          draw(node);
        };
        h.addEventListener("pointermove", move);
        h.addEventListener("pointerup", stop);
        h.addEventListener("pointercancel", stop);
      });
      return {
        dom,
        update(n) {
          if (n.type !== node.type) return false;
          node = n;
          draw(n);
          return true;
        },
        selectNode: () => dom.classList.add("ProseMirror-selectednode"),
        deselectNode: () => dom.classList.remove("ProseMirror-selectednode"),
        stopEvent: (e) => !!(e.target as HTMLElement | null)?.closest?.(".doc-handle"),
        ignoreMutation: () => true,
      };
    };
  },

  addCommands() {
    return {
      alignImage:
        (align) =>
        ({ commands }) =>
          commands.updateAttributes(this.name, { align: cleanAlign(align) }),
      captionImage:
        (caption) =>
        ({ commands }) =>
          commands.updateAttributes(this.name, { caption: cleanCaption(caption) }),
      resizeImage:
        (width) =>
        ({ state, commands }) => {
          const w = cleanWidth(Math.max(MIN_WIDTH, width));
          const sel = state.selection;
          const a = (sel as NodeSelection).node?.attrs as ImageAttrs | undefined;
          if (!w || !a) return false;
          // The shape it was added with: its stored height over its stored width.
          const ratio = a.width && a.height ? a.height / a.width : null;
          return commands.updateAttributes(this.name, { width: w, height: ratio ? Math.max(1, Math.round(w * ratio)) : null });
        },
      replaceImage:
        (attrs) =>
        ({ commands }) =>
          commands.updateAttributes(this.name, { image: attrs.image, width: attrs.width ?? null, height: attrs.height ?? null }),
      insertImage:
        (attrs) =>
        ({ chain }) =>
          chain()
            .insertContent({ type: this.name, attrs })
            .command(({ tr, state }) => {
              const sel = tr.selection;
              if (!(sel instanceof NodeSelection) || sel.node.type.name !== this.name) return true;
              const after = sel.to;
              if (!tr.doc.resolve(after).nodeAfter?.isTextblock) tr.insert(after, state.schema.nodes.paragraph.create());
              tr.setSelection(TextSelection.create(tr.doc, after + 1));
              return true;
            })
            .run(),
      describeImage:
        (alt) =>
        ({ commands }) =>
          commands.updateAttributes(this.name, { alt: alt.trim() }),
    };
  },
});
