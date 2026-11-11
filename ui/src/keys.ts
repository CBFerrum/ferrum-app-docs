// Every keyboard shortcut the editor has, in one table: the editor's key handlers are made from it
// (`DocKeys`, and the page's own keys in LiveDoc.tsx through `pageKey`), and so are the tooltips' key names
// and the shortcut list (ShortcutHelp.tsx), so the list cannot say a key the editor does not have.
// `text` keys act in the text; `page` keys anywhere on the page; `native` keys are the browser's own (listed,
// not handled here).

import { type Editor, Extension } from "@tiptap/core";
import { t } from "@ferrum/client";
import { insertFootnoteAndJump } from "./pages";

export type KeyGroup = "text" | "paragraph" | "insert" | "document";

/** What the page does for a `page` key, and for the text keys that open something of the page's. */
export interface PageActions {
  link: () => void;
  find: () => void;
  replace: () => void;
  comment: () => void;
  save: () => void;
  help: () => void;
}

export interface Shortcut {
  id: string;
  label: () => string;
  group: KeyGroup;
  /** In ProseMirror's names ("Mod-Shift-k"); the first is the one shown. */
  keys: string[];
  /** On a Mac, when they differ (⌘H hides the app, so Replace is ⌘⇧H). */
  mac?: string[];
  scope: "text" | "page" | "native";
  run?: (e: Editor, page: PageActions) => boolean;
}

export const SHORTCUTS: Shortcut[] = [
  { id: "bold", label: () => t("Bold"), group: "text", keys: ["Mod-b"], scope: "text", run: (e) => e.commands.toggleBold() },
  { id: "italic", label: () => t("Italic"), group: "text", keys: ["Mod-i"], scope: "text", run: (e) => e.commands.toggleItalic() },
  { id: "underline", label: () => t("Underline"), group: "text", keys: ["Mod-u"], scope: "text", run: (e) => e.commands.toggleUnderline() },
  { id: "strike", label: () => t("Strikethrough"), group: "text", keys: ["Mod-Shift-x", "Alt-Shift-5"], scope: "text", run: (e) => e.commands.toggleStrike() },
  { id: "code", label: () => t("Code"), group: "text", keys: ["Mod-e"], scope: "text", run: (e) => e.commands.toggleCode() },
  { id: "subscript", label: () => t("Subscript"), group: "text", keys: ["Mod-,"], scope: "text", run: (e) => e.commands.toggleSubscript() },
  { id: "superscript", label: () => t("Superscript"), group: "text", keys: ["Mod-."], scope: "text", run: (e) => e.commands.toggleSuperscript() },
  { id: "bigger", label: () => t("Increase font size"), group: "text", keys: ["Mod-Shift-.", "Mod-Shift->"], scope: "text", run: (e) => e.commands.changeFontSize(1) },
  { id: "smaller", label: () => t("Decrease font size"), group: "text", keys: ["Mod-Shift-,", "Mod-Shift-<"], scope: "text", run: (e) => e.commands.changeFontSize(-1) },
  { id: "clear", label: () => t("Clear formatting"), group: "text", keys: ["Mod-\\"], scope: "text", run: (e) => e.commands.clearFormatting() },
  { id: "left", label: () => t("Align left"), group: "paragraph", keys: ["Mod-Shift-l"], scope: "text", run: (e) => e.commands.setTextAlign("left") },
  { id: "center", label: () => t("Center"), group: "paragraph", keys: ["Mod-Shift-e"], scope: "text", run: (e) => e.commands.setTextAlign("center") },
  { id: "right", label: () => t("Align right"), group: "paragraph", keys: ["Mod-Shift-r"], scope: "text", run: (e) => e.commands.setTextAlign("right") },
  { id: "justify", label: () => t("Justify"), group: "paragraph", keys: ["Mod-Shift-j"], scope: "text", run: (e) => e.commands.setTextAlign("justify") },
  { id: "normal", label: () => t("Text"), group: "paragraph", keys: ["Mod-Alt-0"], scope: "text", run: (e) => e.commands.setParagraphRole(null) },
  ...([1, 2, 3, 4, 5, 6] as const).map((level) => ({ id: `h${level}`, label: () => t("Heading {level}", { level }), group: "paragraph" as const, keys: [`Mod-Alt-${level}`], scope: "text" as const, run: (e: Editor) => e.commands.setHeading({ level }) })),
  { id: "bullets", label: () => t("Bulleted list"), group: "paragraph", keys: ["Mod-Shift-8"], scope: "text", run: (e) => e.commands.toggleBulletList() },
  { id: "numbers", label: () => t("Numbered list"), group: "paragraph", keys: ["Mod-Shift-7"], scope: "text", run: (e) => e.commands.toggleOrderedList() },
  { id: "checklist", label: () => t("Checklist"), group: "paragraph", keys: ["Mod-Shift-9"], scope: "text", run: (e) => e.commands.toggleTaskList() },
  { id: "indent", label: () => t("Increase indent"), group: "paragraph", keys: ["Mod-]"], scope: "text", run: (e) => e.commands.indentMore() },
  { id: "outdent", label: () => t("Decrease indent"), group: "paragraph", keys: ["Mod-["], scope: "text", run: (e) => e.commands.indentLess() },
  { id: "link", label: () => t("Link"), group: "insert", keys: ["Mod-k", "Mod-Shift-k"], scope: "text", run: (_e, p) => (p.link(), true) },
  { id: "pagebreak", label: () => t("Page break"), group: "insert", keys: ["Mod-Enter"], scope: "text", run: (e) => e.commands.insertPageBreak() },
  { id: "footnote", label: () => t("Footnote"), group: "insert", keys: ["Mod-Alt-f"], scope: "text", run: (e) => insertFootnoteAndJump(e) },
  { id: "linebreak", label: () => t("Line break"), group: "insert", keys: ["Shift-Enter"], scope: "native" },
  { id: "undo", label: () => t("Undo"), group: "document", keys: ["Mod-z"], scope: "text", run: (e) => e.commands.undo() },
  { id: "redo", label: () => t("Redo"), group: "document", keys: ["Mod-Shift-z", "Mod-y"], scope: "text", run: (e) => e.commands.redo() },
  { id: "plain", label: () => t("Paste without formatting"), group: "document", keys: ["Mod-Shift-v"], scope: "native" },
  { id: "find", label: () => t("Find"), group: "document", keys: ["Mod-f"], scope: "page", run: (_e, p) => (p.find(), true) },
  { id: "replace", label: () => t("Find and replace"), group: "document", keys: ["Mod-h"], mac: ["Mod-Shift-h"], scope: "page", run: (_e, p) => (p.replace(), true) },
  { id: "comment", label: () => t("Comment"), group: "document", keys: ["Mod-Alt-m"], scope: "page", run: (_e, p) => (p.comment(), true) },
  { id: "print", label: () => t("Print"), group: "document", keys: ["Mod-p"], scope: "native" },
  { id: "save", label: () => t("Save"), group: "document", keys: ["Mod-s"], scope: "page", run: (_e, p) => (p.save(), true) },
  { id: "help", label: () => t("Keyboard shortcuts"), group: "document", keys: ["Mod-/"], scope: "page", run: (_e, p) => (p.help(), true) },
];

export const isMac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

/** The keys of shortcut `id` on this keyboard. */
export function keysOf(id: string): string[] {
  const s = SHORTCUTS.find((x) => x.id === id);
  if (!s) return [];
  return (isMac() && s.mac) || s.keys;
}

/** The key shown for shortcut `id` (tooltips). */
export const keyOf = (id: string): string | undefined => keysOf(id)[0];

/** Whether a key event is `keys` ("Mod-Shift-k"): the modifiers exactly, the key by its place for letters and digits
 *  (⌥ on a Mac changes the character). */
export function matches(e: Pick<KeyboardEvent, "key" | "code" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey">, keys: string, mac = isMac()): boolean {
  const parts = keys.split(/-(?=.)/);
  const key = parts.pop()!;
  const want = new Set(parts);
  const mod = want.has("Mod");
  if ((mac ? e.metaKey : e.ctrlKey) !== mod || (mac ? e.ctrlKey : e.metaKey) || e.altKey !== want.has("Alt") || e.shiftKey !== want.has("Shift")) return false;
  if (/^[a-z]$/i.test(key)) return e.code === `Key${key.toUpperCase()}` || e.key.toLowerCase() === key.toLowerCase();
  if (/^\d$/.test(key)) return e.code === `Digit${key}` || e.key === key;
  if (key === "/") return e.code === "Slash" || e.key === "/";
  return e.key === key;
}

/** The `page` shortcut a key event is, if any. */
export function pageKey(e: KeyboardEvent): Shortcut | null {
  return SHORTCUTS.find((s) => s.scope === "page" && ((isMac() && s.mac) || s.keys).some((k) => matches(e, k))) ?? null;
}

/** The text's shortcuts, from the table. Above the extensions' own (a shortcut the table names is its). */
export const DocKeys = Extension.create<{ page: { current: PageActions } }>({
  name: "docKeys",
  priority: 1000,
  addOptions() {
    const none = () => undefined;
    return { page: { current: { link: none, find: none, replace: none, comment: none, save: none, help: none } } };
  },
  addKeyboardShortcuts() {
    const out: Record<string, () => boolean> = {};
    for (const s of SHORTCUTS) {
      if (s.scope !== "text" || !s.run) continue;
      for (const k of s.keys) out[k] = () => this.editor.isEditable && s.run!(this.editor, this.options.page.current);
    }
    return out;
  },
});
