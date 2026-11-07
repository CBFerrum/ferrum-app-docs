import { t } from "@ferrum/client";
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
  { id: "text", get title() { return t("Text"); }, get hint() { return t("Plain paragraph"); }, group: "Text", keywords: ["paragraph", "plain", "normal"] },
  { id: "h1", get title() { return t("Heading 1"); }, get hint() { return t("Big section heading"); }, group: "Text", keywords: ["h1", "title", "header", "large"] },
  { id: "h2", get title() { return t("Heading 2"); }, get hint() { return t("Medium section heading"); }, group: "Text", keywords: ["h2", "subtitle", "header", "medium"] },
  { id: "h3", get title() { return t("Heading 3"); }, get hint() { return t("Small section heading"); }, group: "Text", keywords: ["h3", "subheading", "header", "small"] },
  { id: "quote", get title() { return t("Quote"); }, get hint() { return t("Quote someone or something"); }, group: "Text", keywords: ["blockquote", "cite", "citation"] },
  { id: "code", get title() { return t("Code block"); }, get hint() { return t("Code in a box of its own"); }, group: "Text", keywords: ["snippet", "monospace", "pre", "program"] },
  { id: "bullets", get title() { return t("Bulleted list"); }, get hint() { return t("A simple list"); }, group: "Lists and tables", keywords: ["list", "ul", "unordered", "points"] },
  { id: "numbers", get title() { return t("Numbered list"); }, get hint() { return t("A list in order"); }, group: "Lists and tables", keywords: ["list", "ol", "ordered", "steps"] },
  { id: "checklist", get title() { return t("Checklist"); }, get hint() { return t("Things to tick off"); }, group: "Lists and tables", keywords: ["todo", "task", "tasks", "checkbox", "to-do"] },
  { id: "table", get title() { return t("Table"); }, get hint() { return t("Rows and columns"); }, group: "Lists and tables", keywords: ["grid", "rows", "columns", "spreadsheet"] },
  { id: "note", get title() { return t("Note"); }, get hint() { return t("A callout for something to know"); }, group: "Callouts", keywords: ["callout", "info", "information", "box", "aside"] },
  { id: "tip", get title() { return t("Tip"); }, get hint() { return t("A callout for good advice"); }, group: "Callouts", keywords: ["callout", "hint", "advice", "success", "box"] },
  { id: "warning", get title() { return t("Warning"); }, get hint() { return t("A callout for something to watch"); }, group: "Callouts", keywords: ["callout", "caution", "careful", "box"] },
  { id: "alert", get title() { return t("Alert"); }, get hint() { return t("A callout for something serious"); }, group: "Callouts", keywords: ["callout", "danger", "error", "important", "box"] },
  { id: "image", get title() { return t("Image"); }, get hint() { return t("Upload a picture"); }, group: "Insert", keywords: ["picture", "photo", "img", "upload", "screenshot"] },
  { id: "divider", get title() { return t("Divider"); }, get hint() { return t("A line between sections"); }, group: "Insert", keywords: ["line", "rule", "hr", "separator", "break"] },
  { id: "date", get title() { return t("Today's date"); }, get hint() { return t("Put today's date in the text"); }, group: "Insert", keywords: ["day", "time", "calendar", "now"] },
  { id: "mention", get title() { return t("Mention"); }, get hint() { return t("Name a person or a record"); }, group: "Insert", keywords: ["person", "people", "at", "link", "record", "tag"] },
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
