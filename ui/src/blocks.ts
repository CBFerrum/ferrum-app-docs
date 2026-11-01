// What the `/` menu offers: the blocks a document is made of, in words a person would use to look
// for them. Pure, so the order and the search are tested without a browser; what each one does to
// the editor is EditorMenus.tsx.

export type BlockId =
  | "text"
  | "h1"
  | "h2"
  | "h3"
  | "bullets"
  | "numbers"
  | "checklist"
  | "table"
  | "note"
  | "tip"
  | "warning"
  | "alert"
  | "quote"
  | "code"
  | "divider"
  | "image"
  | "date"
  | "mention";

export interface Block {
  id: BlockId;
  title: string;
  /** One line under the title. */
  hint: string;
  group: "Text" | "Lists and tables" | "Callouts" | "Insert";
  /** Other words people look for it by. */
  keywords: string[];
}

export const BLOCKS: Block[] = [
  { id: "text", title: "Text", hint: "Plain paragraph", group: "Text", keywords: ["paragraph", "plain", "normal"] },
  { id: "h1", title: "Heading 1", hint: "Big section heading", group: "Text", keywords: ["h1", "title", "header", "large"] },
  { id: "h2", title: "Heading 2", hint: "Medium section heading", group: "Text", keywords: ["h2", "subtitle", "header", "medium"] },
  { id: "h3", title: "Heading 3", hint: "Small section heading", group: "Text", keywords: ["h3", "subheading", "header", "small"] },
  { id: "quote", title: "Quote", hint: "Quote someone or something", group: "Text", keywords: ["blockquote", "cite", "citation"] },
  { id: "code", title: "Code block", hint: "Code in a box of its own", group: "Text", keywords: ["snippet", "monospace", "pre", "program"] },
  { id: "bullets", title: "Bulleted list", hint: "A simple list", group: "Lists and tables", keywords: ["list", "ul", "unordered", "points"] },
  { id: "numbers", title: "Numbered list", hint: "A list in order", group: "Lists and tables", keywords: ["list", "ol", "ordered", "steps"] },
  { id: "checklist", title: "Checklist", hint: "Things to tick off", group: "Lists and tables", keywords: ["todo", "task", "tasks", "checkbox", "to-do"] },
  { id: "table", title: "Table", hint: "Rows and columns", group: "Lists and tables", keywords: ["grid", "rows", "columns", "spreadsheet"] },
  { id: "note", title: "Note", hint: "A callout for something to know", group: "Callouts", keywords: ["callout", "info", "information", "box", "aside"] },
  { id: "tip", title: "Tip", hint: "A callout for good advice", group: "Callouts", keywords: ["callout", "hint", "advice", "success", "box"] },
  { id: "warning", title: "Warning", hint: "A callout for something to watch", group: "Callouts", keywords: ["callout", "caution", "careful", "box"] },
  { id: "alert", title: "Alert", hint: "A callout for something serious", group: "Callouts", keywords: ["callout", "danger", "error", "important", "box"] },
  { id: "image", title: "Image", hint: "Upload a picture", group: "Insert", keywords: ["picture", "photo", "img", "upload", "screenshot"] },
  { id: "divider", title: "Divider", hint: "A line between sections", group: "Insert", keywords: ["line", "rule", "hr", "separator", "break"] },
  { id: "date", title: "Today's date", hint: "Put today's date in the text", group: "Insert", keywords: ["day", "time", "calendar", "now"] },
  { id: "mention", title: "Mention", hint: "Name a person or a record", group: "Insert", keywords: ["person", "people", "at", "link", "record", "tag"] },
];

/** The blocks that match what was typed after the slash, best first: a title starting with it, a word
 *  of the title, another name for it, then anywhere. Nothing typed: all of them, in order. */
export function findBlocks(query: string, blocks: Block[] = BLOCKS): Block[] {
  const q = query.trim().toLowerCase();
  if (!q) return blocks;
  const rank = (b: Block) => {
    const title = b.title.toLowerCase();
    if (title.startsWith(q)) return 0;
    if (title.split(/\s+/).some((w) => w.startsWith(q))) return 1;
    if (b.keywords.some((k) => k.startsWith(q))) return 2;
    if (title.includes(q)) return 3;
    return b.keywords.some((k) => k.includes(q)) ? 4 : -1;
  };
  return blocks
    .map((block, order) => ({ block, order, r: rank(block) }))
    .filter((x) => x.r >= 0)
    .sort((a, b) => a.r - b.r || a.order - b.order)
    .map((x) => x.block);
}
