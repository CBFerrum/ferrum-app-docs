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

export interface ImageAttrs {
  image: string;
  alt?: string;
  width?: number | null;
  height?: number | null;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    docImage: {
      /** Adds an image at the selection; the caret goes to the text after it (a new paragraph
       *  when nothing follows), so typing on does not replace the image. */
      insertImage: (attrs: ImageAttrs) => ReturnType;
      /** Describes the selected image. */
      describeImage: (alt: string) => ReturnType;
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
    };
  },

  parseHTML() {
    // A document's own image (copied from this or another document); nothing from elsewhere.
    return [{ tag: "img[data-image]", getAttrs: (el) => (/^[0-9a-f-]{36}$/i.test(el.getAttribute("data-image") ?? "") ? null : false) }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const { image, alt, width, height } = node.attrs as ImageAttrs;
    return [
      "img",
      mergeAttributes(HTMLAttributes, {
        "data-image": image,
        src: imageUrl(this.options.file, image),
        alt: alt ?? "",
        ...(width ? { width } : {}),
        ...(height ? { height } : {}),
        loading: "lazy",
        class: "doc-image",
      }),
    ];
  },

  addCommands() {
    return {
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
