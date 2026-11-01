// What a document is made of: the nodes and marks everything that shows one shares (the live editor,
// and the pages of its version history), so what one can draw the other can. Behaviour that only
// the live editor has (cursors, comments, suggesting, menus) is added in LiveDoc.tsx.

import type { AnyExtension } from "@tiptap/core";
import { Highlight } from "@tiptap/extension-highlight";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { TableKit } from "@tiptap/extension-table";
import { TextAlign } from "@tiptap/extension-text-align";
import { StarterKit } from "@tiptap/starter-kit";
import { Callouts } from "./callout";
import { DocImage } from "./image";
import { Mention } from "./mention";
import { Deletion, Insertion } from "./suggest";

/** The extensions that define the document's schema; `file` is the document images are kept with. */
export function documentExtensions(file: string): AnyExtension[] {
  return [
    // The shared document has its own undo (Collaboration's), not the editor's.
    StarterKit.configure({ undoRedo: false, link: { openOnClick: false, autolink: true, defaultProtocol: "https" } }),
    Highlight,
    TaskList,
    TaskItem.configure({ nested: true }),
    // Tables keep equal columns.
    TableKit.configure({ table: { resizable: false } }),
    TextAlign.configure({ types: ["heading", "paragraph"] }),
    DocImage.configure({ file }),
    Insertion,
    Deletion,
    Callouts,
    Mention,
  ];
}
