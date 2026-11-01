// Callouts: a quote with a kind (`note`, `tip`, `warning`, `alert`), drawn as a box that makes a point
// stand out. It is the editor's own quote with one more attribute, so the server (exports, Markdown,
// agents) reads a callout as the quote it is and loses only the colour; nothing it does with the
// shared document changes.

import { Extension } from "@tiptap/core";

export const CALLOUTS = [
  { id: "note", label: "Note" },
  { id: "tip", label: "Tip" },
  { id: "warning", label: "Warning" },
  { id: "alert", label: "Alert" },
] as const;

export type CalloutKind = (typeof CALLOUTS)[number]["id"];

/** A kind this editor knows, else none: the shared document is anyone's input, so only these draw. */
export const calloutKind = (value: unknown): CalloutKind | null => CALLOUTS.find((c) => c.id === value)?.id ?? null;

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    callout: {
      /** Makes the quote at the selection a callout of `kind`, or wraps the selected blocks in one. */
      setCallout: (kind: CalloutKind) => ReturnType;
      /** Turns the callout at the selection back into a plain quote. */
      unsetCallout: () => ReturnType;
    };
  }
}

export const Callouts = Extension.create({
  name: "callouts",

  addGlobalAttributes() {
    return [
      {
        types: ["blockquote"],
        attributes: {
          callout: {
            default: null,
            parseHTML: (el: HTMLElement) => calloutKind(el.getAttribute("data-callout")),
            renderHTML: (attrs: Record<string, unknown>) => {
              const kind = calloutKind(attrs.callout);
              return kind ? { "data-callout": kind, class: `doc-callout doc-callout-${kind}` } : {};
            },
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      setCallout:
        (kind) =>
        ({ editor, commands }) =>
          editor.isActive("blockquote") ? commands.updateAttributes("blockquote", { callout: kind }) : commands.wrapIn("blockquote", { callout: kind }),
      unsetCallout:
        () =>
        ({ commands }) =>
          commands.updateAttributes("blockquote", { callout: null }),
    };
  },
});
