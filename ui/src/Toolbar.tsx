// The formatting toolbar of a live document. One calm row: groups divided by separators, the less used
// ones in a "More" popover that takes whatever does not fit by width (on a phone nothing moves to
// it: the row scrolls, with the kit's edge cue). One tab stop for the row, arrow keys between the
// controls (and Home and End), every control named in a tooltip with its shortcut. The row follows the
// selection through one subscription (`useEditorState`), so typing does not redraw it unless what it
// shows changed.

import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  ArrowDownUp,
  Baseline,
  Bold,
  ChevronDown,
  Code,
  Ellipsis,
  Highlighter,
  ImagePlus,
  IndentDecrease,
  IndentIncrease,
  Italic,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  ListStart,
  Minus,
  Plus,
  Quote,
  Redo2,
  RemoveFormatting,
  SquareCode,
  Strikethrough,
  Subscript,
  Superscript,
  Table2,
  Underline,
  Undo2,
} from "lucide-react";
import { Fragment, type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { isolate, t } from "@ferrum/client";
import { Button, Dialog, Field } from "@ferrum/kit";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@ferrum/kit/primitives";
import { CALLOUTS, type CalloutKind, calloutKind } from "./callout";
import { DEFAULT_SIZE, FONTS, LINE_HEIGHTS, MAX_SIZE, MIN_SIZE, SIZES, cleanColor, cleanFontFamily, cleanFontSize, cleanLineHeight, cleanSpace, fontStack } from "./format";
import { Palette, gridKeys } from "./Palette";
import { Sep, Tip, Tool } from "./Tool";

const STYLES = [
  { id: "p", get label() { return t("Text"); } },
  { id: "title", get label() { return t("Title"); } },
  { id: "subtitle", get label() { return t("Subtitle"); } },
  { id: "h1", get label() { return t("Heading 1"); } },
  { id: "h2", get label() { return t("Heading 2"); } },
  { id: "h3", get label() { return t("Heading 3"); } },
  { id: "h4", get label() { return t("Heading 4"); } },
  { id: "h5", get label() { return t("Heading 5"); } },
  { id: "h6", get label() { return t("Heading 6"); } },
] as const;

/** The paragraph style of the selection: a heading's level, Title or Subtitle, or plain text. */
function styleOf(e: Editor): (typeof STYLES)[number]["id"] {
  for (let level = 1; level <= 6; level++) if (e.isActive("heading", { level })) return `h${level}` as "h1";
  const role = e.getAttributes("paragraph").role;
  return role === "title" || role === "subtitle" ? role : "p";
}

/** What the toolbar shows of the selection. Compared by value, so the row redraws only when it changes. */
function selectionState(e: Editor) {
  const text = e.getAttributes("textStyle");
  const block = e.isActive("heading") ? e.getAttributes("heading") : e.getAttributes("paragraph");
  const inList = e.isActive("bulletList") || e.isActive("orderedList");
  return {
    style: styleOf(e),
    font: cleanFontFamily(text.fontFamily),
    size: cleanFontSize(text.fontSize),
    color: cleanColor(text.color),
    marker: cleanColor(e.getAttributes("highlight").color),
    bold: e.isActive("bold"),
    italic: e.isActive("italic"),
    underline: e.isActive("underline"),
    strike: e.isActive("strike"),
    sub: e.isActive("subscript"),
    sup: e.isActive("superscript"),
    code: e.isActive("code"),
    highlight: e.isActive("highlight"),
    link: e.isActive("link"),
    bullet: e.isActive("bulletList"),
    ordered: e.isActive("orderedList"),
    task: e.isActive("taskList"),
    inList,
    bulletStyle: (e.getAttributes("bulletList").bullet as string | null) ?? "disc",
    numberStyle: (e.getAttributes("orderedList").type as string | null) ?? "1",
    quote: e.isActive("blockquote"),
    callout: e.isActive("blockquote") ? calloutKind(e.getAttributes("blockquote").callout) : null,
    codeBlock: e.isActive("codeBlock"),
    table: e.isActive("table"),
    left: e.isActive({ textAlign: "left" }),
    center: e.isActive({ textAlign: "center" }),
    right: e.isActive({ textAlign: "right" }),
    justify: e.isActive({ textAlign: "justify" }),
    lineHeight: cleanLineHeight(block.lineHeight),
    spaceBefore: cleanSpace(block.spaceBefore),
    spaceAfter: cleanSpace(block.spaceAfter),
    canUndo: e.can().undo(),
    canRedo: e.can().redo(),
  };
}
type Sel = ReturnType<typeof selectionState>;

/** A trigger button that opens a menu or palette: its text or icon, a chevron, and the tooltip. */
const TRIGGER = "doc-tool doc-drop";

export function Drop({ label, value, keys, className = "", children, editor, content }: { label: string; value?: string; keys?: string; className?: string; children: ReactNode; editor: Editor; content: ReactNode }) {
  return (
    <DropdownMenu>
      <Tip label={label} keys={keys}>
        <DropdownMenuTrigger asChild>
          <button type="button" className={`${TRIGGER} ${className}`} aria-label={value ? t("{label}: {value}", { label, value }) : label} onMouseDown={(e) => e.preventDefault()}>
            {children}
            <ChevronDown size={14} aria-hidden className="doc-chevron" />
          </button>
        </DropdownMenuTrigger>
      </Tip>
      <DropdownMenuContent
        align="start"
        className="doc-menu"
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          editor.commands.focus();
        }}
      >
        {content}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** A colour button: the icon over a bar in the colour in use, and the palette in a popover. */
export function ColorButton({ editor, label, kind, icon: I, current, noneLabel, onPick }: { editor: Editor; label: string; kind: string; icon: typeof Baseline; current: string | null; noneLabel: string; onPick: (c: string | null) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tip label={label}>
        <PopoverTrigger asChild>
          <button type="button" className={`${TRIGGER} doc-color`} aria-label={label} aria-expanded={open} aria-pressed={current !== null} onMouseDown={(e) => e.preventDefault()}>
            <span className="doc-color-icon">
              <I size={16} aria-hidden />
              <span className="doc-colorbar" style={{ background: current ?? "var(--border-strong)" }} aria-hidden />
            </span>
            <ChevronDown size={14} aria-hidden className="doc-chevron" />
          </button>
        </PopoverTrigger>
      </Tip>
      <PopoverContent
        align="start"
        className="doc-flyout"
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          editor.commands.focus();
        }}
      >
        <Palette
          kind={kind}
          current={current}
          noneLabel={noneLabel}
          onPick={(c) => {
            onPick(c);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

/** The font size: smaller, the number (type one and press Enter), larger, and the set to pick from. */
function SizeControl({ editor, size }: { editor: Editor; size: number | null }) {
  const shown = String(size ?? DEFAULT_SIZE);
  const [text, setText] = useState(shown);
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setText(shown);
  }, [shown, editing]);
  // Leaving the field with another size typed sets it (the caret stays where the person went); Enter
  // sets it and goes back to the text.
  const commit = (toText: boolean) => {
    const n = cleanFontSize(text);
    setEditing(false);
    if (n === null) setText(shown);
    else if (String(n) !== shown) (toText ? editor.chain().focus() : editor.chain()).setFontSize(n).run();
    if (toText) editor.commands.focus();
  };
  return (
    <div className="doc-size" role="group" aria-label={t("Font size")}>
      <Tool label={t("Decrease font size")} icon={Minus} keys="Mod-Shift-," disabled={(size ?? DEFAULT_SIZE) <= MIN_SIZE} onClick={() => editor.chain().focus().changeFontSize(-1).run()} />
      <Tip label={t("Font size")}>
        <input
          className="doc-size-input"
          inputMode="decimal"
          dir="ltr"
          aria-label={t("Font size")}
          value={text}
          maxLength={5}
          onFocus={() => setEditing(true)}
          onClick={(e) => e.currentTarget.select()}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => commit(false)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit(true);
            } else if (e.key === "Escape") {
              setText(shown);
              setEditing(false);
              editor.commands.focus();
            }
          }}
        />
      </Tip>
      <DropdownMenu>
        <Tip label={t("Sizes")}>
          <DropdownMenuTrigger asChild>
            <button type="button" className="doc-tool doc-size-list" aria-label={t("Sizes")} onMouseDown={(e) => e.preventDefault()}>
              <ChevronDown size={14} aria-hidden />
            </button>
          </DropdownMenuTrigger>
        </Tip>
        <DropdownMenuContent
          align="start"
          className="doc-menu doc-menu-sizes"
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            editor.commands.focus();
          }}
        >
          <DropdownMenuRadioGroup value={shown} onValueChange={(v) => editor.chain().focus().setFontSize(Number(v)).run()}>
            {(SIZES.includes(size ?? DEFAULT_SIZE) ? SIZES : [...SIZES, size!].sort((a, b) => a - b)).map((n) => (
              <DropdownMenuRadioItem key={n} value={String(n)}>
                {n}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <Tool label={t("Increase font size")} icon={Plus} keys="Mod-Shift-." disabled={(size ?? DEFAULT_SIZE) >= MAX_SIZE} onClick={() => editor.chain().focus().changeFontSize(1).run()} />
    </div>
  );
}

/** Insert a table: hover or arrow over a grid to choose its size. */
function TablePicker({ editor, active }: { editor: Editor; active: boolean }) {
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState<[number, number]>([3, 3]);
  const ROWS = 6;
  const COLS = 8;
  const insert = (rows: number, cols: number) => {
    setOpen(false);
    editor.chain().focus().insertTable({ rows, cols, withHeaderRow: true }).run();
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tip label={t("Insert a table")}>
        <PopoverTrigger asChild>
          <button type="button" className={TRIGGER} aria-label={t("Insert a table")} aria-expanded={open} aria-pressed={active} onMouseDown={(e) => e.preventDefault()}>
            <Table2 size={16} aria-hidden />
            <ChevronDown size={14} aria-hidden className="doc-chevron" />
          </button>
        </PopoverTrigger>
      </Tip>
      <PopoverContent
        align="start"
        className="doc-flyout"
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          editor.commands.focus();
        }}
      >
        <div className="doc-picker" role="group" aria-label={t("Table size")} onKeyDown={(e) => gridKeys(e, COLS)} onMouseLeave={() => setAt([0, 0])}>
          {Array.from({ length: ROWS * COLS }, (_, i) => {
            const r = Math.floor(i / COLS) + 1;
            const c = (i % COLS) + 1;
            return (
              <button
                key={i}
                type="button"
                data-cell
                tabIndex={i === 0 ? 0 : -1}
                className={`doc-picker-cell${r <= at[0] && c <= at[1] ? " is-on" : ""}`}
                aria-label={t("{rows} rows by {cols} columns", { rows: r, cols: c })}
                onMouseEnter={() => setAt([r, c])}
                onFocus={() => setAt([r, c])}
                onClick={() => insert(r, c)}
              />
            );
          })}
        </div>
        <div className="doc-picker-size" aria-live="polite">
          {at[0] ? t("{rows} × {cols}", { rows: at[0], cols: at[1] }) : t("Choose a size")}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Line spacing, and the space before and after a paragraph. */
function SpacingDialog({ editor, sel, onClose }: { editor: Editor; sel: Sel; onClose: () => void }) {
  const [line, setLine] = useState(sel.lineHeight ? String(sel.lineHeight) : "");
  const [before, setBefore] = useState(sel.spaceBefore === null ? "" : String(sel.spaceBefore));
  const [after, setAfter] = useState(sel.spaceAfter === null ? "" : String(sel.spaceAfter));
  const invalid = (v: string, ok: (x: string) => unknown) => v.trim() !== "" && ok(v) === null;
  const bad = invalid(line, cleanLineHeight) || invalid(before, cleanSpace) || invalid(after, cleanSpace);
  const save = (e: FormEvent) => {
    e.preventDefault();
    if (bad) return;
    editor
      .chain()
      .focus()
      .setLineHeight(line.trim() ? cleanLineHeight(line) : null)
      .setParagraphSpace({ before: before.trim() ? cleanSpace(before) : null, after: after.trim() ? cleanSpace(after) : null })
      .run();
    onClose();
  };
  const footer: ReactNode = (
    <>
      <Button onClick={onClose}>{t("Cancel")}</Button>
      <Button variant="primary" type="submit" form="doc-spacing-form" disabled={bad}>
        {t("Apply")}
      </Button>
    </>
  );
  return (
    <Dialog open onClose={onClose} title={t("Custom spacing")} footer={footer}>
      <form id="doc-spacing-form" onSubmit={save} className="stack">
        <Field label={t("Line spacing")} htmlFor="doc-spacing-line" hint={t("A number from 0.8 to 4; empty is the document's own")} error={invalid(line, cleanLineHeight) ? t("Use a number from 0.8 to 4") : undefined}>
          <input id="doc-spacing-line" className="input" inputMode="decimal" dir="ltr" value={line} onChange={(e) => setLine(e.target.value)} data-autofocus />
        </Field>
        <Field label={t("Space before paragraph (pt)")} htmlFor="doc-spacing-before" error={invalid(before, cleanSpace) ? t("Use a number from 0 to 200") : undefined}>
          <input id="doc-spacing-before" className="input" inputMode="decimal" dir="ltr" value={before} onChange={(e) => setBefore(e.target.value)} />
        </Field>
        <Field label={t("Space after paragraph (pt)")} htmlFor="doc-spacing-after" error={invalid(after, cleanSpace) ? t("Use a number from 0 to 200") : undefined}>
          <input id="doc-spacing-after" className="input" inputMode="decimal" dir="ltr" value={after} onChange={(e) => setAfter(e.target.value)} />
        </Field>
      </form>
    </Dialog>
  );
}

/** What fills the controls of the row, as the groups the row divides into (first to last: the order a
 *  group leaves for "More" is last first). `keep` groups never leave. */
interface Group {
  id: string;
  keep?: boolean;
  node: ReactNode;
}

const SEP_WIDTH = 9;
const MORE_WIDTH = 44;
/** Under this width the row scrolls instead of moving groups to "More". */
const SCROLL_BELOW = 720;

export function Toolbar({
  editor,
  pickImages,
  adding,
  suggesting,
  setSuggesting: setMode,
  onLink,
}: {
  editor: Editor;
  pickImages: () => void;
  adding: boolean;
  suggesting: boolean;
  setSuggesting: (on: boolean) => void;
  onLink: () => void;
}) {
  const s = useEditorState({ editor, selector: ({ editor: e }) => selectionState(e) });
  const [spacing, setSpacing] = useState(false);
  const run = () => editor.chain().focus();
  const bar = useRef<HTMLDivElement>(null);
  const [fitting, setFitting] = useState<number | null>(null);

  const closeToText = {
    onCloseAutoFocus: (e: Event) => {
      e.preventDefault();
      editor.commands.focus();
    },
  };
  const spacingItems = (
    <>
      <DropdownMenuRadioGroup value={s.lineHeight === null ? "" : String(s.lineHeight)} onValueChange={(v) => editor.chain().focus().setLineHeight(v ? Number(v) : null).run()}>
        <DropdownMenuRadioItem value="">{t("Document default")}</DropdownMenuRadioItem>
        {LINE_HEIGHTS.map((n) => (
          <DropdownMenuRadioItem key={n} value={String(n)}>
            {n === 1 ? t("Single") : n === 2 ? t("Double") : String(n)}
          </DropdownMenuRadioItem>
        ))}
        {s.lineHeight !== null && !LINE_HEIGHTS.includes(s.lineHeight) && <DropdownMenuRadioItem value={String(s.lineHeight)}>{String(s.lineHeight)}</DropdownMenuRadioItem>}
      </DropdownMenuRadioGroup>
      <DropdownMenuSeparator />
      <DropdownMenuItem onSelect={() => setSpacing(true)}>{t("Custom spacing…")}</DropdownMenuItem>
    </>
  );
  const listStyles = (
    <>
      <DropdownMenuRadioGroup value={s.bullet ? s.bulletStyle : ""} onValueChange={(v) => editor.chain().focus().updateAttributes("bulletList", { bullet: v === "disc" ? null : v }).run()}>
        <DropdownMenuRadioItem value="disc" disabled={!s.bullet}>
          {t("● Filled circles")}
        </DropdownMenuRadioItem>
        <DropdownMenuRadioItem value="circle" disabled={!s.bullet}>
          {t("○ Open circles")}
        </DropdownMenuRadioItem>
        <DropdownMenuRadioItem value="square" disabled={!s.bullet}>
          {t("■ Squares")}
        </DropdownMenuRadioItem>
      </DropdownMenuRadioGroup>
      <DropdownMenuSeparator />
      <DropdownMenuRadioGroup value={s.ordered ? s.numberStyle : ""} onValueChange={(v) => editor.chain().focus().updateAttributes("orderedList", { type: v }).run()}>
        <DropdownMenuRadioItem value="1" disabled={!s.ordered}>
          {t("1. 2. 3.")}
        </DropdownMenuRadioItem>
        <DropdownMenuRadioItem value="a" disabled={!s.ordered}>
          {t("a. b. c.")}
        </DropdownMenuRadioItem>
        <DropdownMenuRadioItem value="i" disabled={!s.ordered}>
          {t("i. ii. iii.")}
        </DropdownMenuRadioItem>
      </DropdownMenuRadioGroup>
    </>
  );

  const groups: Group[] = [
    {
      id: "history",
      keep: true,
      node: (
        <>
          <Drop editor={editor} label={t("Mode")} value={suggesting ? t("Suggesting") : t("Editing")} className="doc-drop-text" content={
            <DropdownMenuRadioGroup value={suggesting ? "suggest" : "edit"} onValueChange={(v) => setMode(v === "suggest")}>
              <DropdownMenuRadioItem value="edit">{t("Editing")}</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="suggest">{t("Suggesting")}</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          }>
            {suggesting ? t("Suggesting") : t("Editing")}
          </Drop>
          <Tool label={t("Undo")} icon={Undo2} keys="Mod-z" disabled={!s.canUndo} onClick={() => run().undo().run()} />
          <Tool label={t("Redo")} icon={Redo2} keys="Mod-Shift-z" disabled={!s.canRedo} onClick={() => run().redo().run()} />
        </>
      ),
    },
    {
      id: "type",
      keep: true,
      node: (
        <>
          <Drop
            editor={editor}
            label={t("Paragraph style")}
            value={STYLES.find((o) => o.id === s.style)!.label}
            className="doc-drop-text doc-drop-style"
            content={
              <DropdownMenuRadioGroup
                value={s.style}
                onValueChange={(v) => {
                  if (v === "p") run().setParagraphRole(null).run();
                  else if (v === "title" || v === "subtitle") run().setParagraphRole(v).run();
                  else run().setHeading({ level: Number(v.slice(1)) as 1 | 2 | 3 | 4 | 5 | 6 }).run();
                }}
              >
                {STYLES.map((o) => (
                  <DropdownMenuRadioItem key={o.id} value={o.id}>
                    {isolate(o.label)}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            }
          >
            {isolate(STYLES.find((o) => o.id === s.style)!.label)}
          </Drop>
          <Drop
            editor={editor}
            label={t("Font")}
            value={s.font === "Serif" ? t("Serif") : s.font === "Monospace" ? t("Monospace") : (s.font ?? t("Default"))}
            className="doc-drop-text doc-drop-font"
            content={
              <DropdownMenuRadioGroup value={s.font ?? ""} onValueChange={(v) => editor.chain().focus().setFontFamily(v || null).run()}>
                <DropdownMenuRadioItem value="">{t("Default")}</DropdownMenuRadioItem>
                {FONTS.map((f) => (
                  <DropdownMenuRadioItem key={f.name} value={f.name} style={{ fontFamily: f.stack }}>
                    {f.name === "Serif" ? t("Serif") : f.name === "Monospace" ? t("Monospace") : f.name}
                  </DropdownMenuRadioItem>
                ))}
                {s.font && !FONTS.some((f) => f.name === s.font) && (
                  <DropdownMenuRadioItem value={s.font} style={{ fontFamily: fontStack(s.font) ?? undefined }}>
                    {s.font}
                  </DropdownMenuRadioItem>
                )}
              </DropdownMenuRadioGroup>
            }
          >
            <span style={{ fontFamily: fontStack(s.font) ?? undefined }}>{s.font === "Serif" ? t("Serif") : s.font === "Monospace" ? t("Monospace") : (s.font ?? t("Default"))}</span>
          </Drop>
          <SizeControl editor={editor} size={s.size} />
        </>
      ),
    },
    {
      id: "character",
      keep: true,
      node: (
        <>
          <Tool label={t("Bold")} icon={Bold} keys="Mod-b" active={s.bold} onClick={() => run().toggleBold().run()} />
          <Tool label={t("Italic")} icon={Italic} keys="Mod-i" active={s.italic} onClick={() => run().toggleItalic().run()} />
          <Tool label={t("Underline")} icon={Underline} keys="Mod-u" active={s.underline} onClick={() => run().toggleUnderline().run()} />
          <ColorButton editor={editor} label={t("Text colour")} kind="text" icon={Baseline} current={s.color} noneLabel={t("Automatic")} onPick={(c) => editor.chain().focus().setTextColor(c).run()} />
          <ColorButton editor={editor} label={t("Highlight colour")} kind="highlight" icon={Highlighter} current={s.marker} noneLabel={t("None")} onPick={(c) => editor.chain().focus().setHighlightColor(c).run()} />
        </>
      ),
    },
    {
      id: "insert",
      keep: true,
      node: (
        <>
          <Tool label={s.link ? t("Edit link") : t("Link")} icon={Link2} keys="Mod-Shift-k" active={s.link} onClick={onLink} />
          <Tool label={adding ? t("Adding the image…") : t("Image")} icon={ImagePlus} disabled={adding} onClick={pickImages} />
          <TablePicker editor={editor} active={s.table} />
        </>
      ),
    },
    {
      id: "paragraph",
      keep: true,
      node: (
        <>
          <Tool label={t("Align left")} icon={AlignLeft} keys="Mod-Shift-l" active={s.left} onClick={() => run().setTextAlign("left").run()} />
          <Tool label={t("Center")} icon={AlignCenter} keys="Mod-Shift-e" active={s.center} onClick={() => run().setTextAlign("center").run()} />
          <Tool label={t("Align right")} icon={AlignRight} keys="Mod-Shift-r" active={s.right} onClick={() => run().setTextAlign("right").run()} />
          <Tool label={t("Justify")} icon={AlignJustify} keys="Mod-Shift-j" active={s.justify} onClick={() => run().setTextAlign("justify").run()} />
          <Drop editor={editor} label={t("Line and paragraph spacing")} content={spacingItems}>
            <ArrowDownUp size={16} aria-hidden />
          </Drop>
        </>
      ),
    },
    {
      id: "lists",
      node: (
        <>
          <Tool label={t("Bulleted list")} icon={List} keys="Mod-Shift-8" active={s.bullet} onClick={() => run().toggleBulletList().run()} />
          <Tool label={t("Numbered list")} icon={ListOrdered} keys="Mod-Shift-7" active={s.ordered} onClick={() => run().toggleOrderedList().run()} />
          <Tool label={t("Checklist")} icon={ListChecks} keys="Mod-Shift-9" active={s.task} onClick={() => run().toggleTaskList().run()} />
          <Drop editor={editor} label={t("List style")} content={listStyles}>
            <ListStart size={16} aria-hidden />
          </Drop>
          <Tool label={t("Decrease indent")} icon={IndentDecrease} keys="Mod-[" onClick={() => run().indentLess().run()} />
          <Tool label={t("Increase indent")} icon={IndentIncrease} keys="Mod-]" onClick={() => run().indentMore().run()} />
        </>
      ),
    },
    {
      id: "more-text",
      node: (
        <>
          <Tool label={t("Strikethrough")} icon={Strikethrough} keys="Mod-Shift-x" active={s.strike} onClick={() => run().toggleStrike().run()} />
          <Tool label={t("Subscript")} icon={Subscript} keys="Mod-," active={s.sub} onClick={() => run().toggleSubscript().run()} />
          <Tool label={t("Superscript")} icon={Superscript} keys="Mod-." active={s.sup} onClick={() => run().toggleSuperscript().run()} />
          <Tool label={t("Code")} icon={Code} keys="Mod-e" active={s.code} onClick={() => run().toggleCode().run()} />
          <Tool label={t("Clear formatting")} icon={RemoveFormatting} keys="Mod-\" onClick={() => run().clearFormatting().run()} />
        </>
      ),
    },
    {
      id: "blocks",
      node: (
        <>
          <Tool label={t("Quote")} icon={Quote} active={s.quote} onClick={() => run().toggleBlockquote().run()} />
          {s.quote && (
            <Drop
              editor={editor}
              label={t("Quote style")}
              value={s.callout ? t("{label} callout", { label: CALLOUTS.find((c) => c.id === s.callout)?.label ?? "" }) : t("Plain quote")}
              className="doc-drop-text"
              content={
                <DropdownMenuRadioGroup
                  value={s.callout ?? ""}
                  onValueChange={(v) => {
                    const kind: CalloutKind | null = calloutKind(v);
                    if (kind) run().setCallout(kind).run();
                    else run().unsetCallout().run();
                  }}
                >
                  <DropdownMenuRadioItem value="">{t("Plain quote")}</DropdownMenuRadioItem>
                  {CALLOUTS.map((c) => (
                    <DropdownMenuRadioItem key={c.id} value={c.id}>
                      {t("{label} callout", { label: c.label })}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              }
            >
              {s.callout ? t("{label} callout", { label: CALLOUTS.find((c) => c.id === s.callout)?.label ?? "" }) : t("Plain quote")}
            </Drop>
          )}
          <Tool label={t("Code block")} icon={SquareCode} active={s.codeBlock} onClick={() => run().toggleCodeBlock().run()} />
          <Tool label={t("Divider")} icon={Minus} onClick={() => run().setHorizontalRule().run()} />
        </>
      ),
    },
  ];

  // The groups on the row are those that fit; the rest wait in "More". `fitting` is how many groups
  // the row shows (null: all, before it is measured).
  const widths = useRef<number[]>([]);
  const refs = useRef<(HTMLDivElement | null)[]>([]);
  const shown = fitting === null ? groups.length : fitting;
  useLayoutEffect(() => {
    const el = bar.current;
    if (!el) return;
    const measure = () => {
      refs.current.forEach((g, i) => {
        if (g && g.offsetWidth > 0) widths.current[i] = g.offsetWidth;
      });
      const room = el.clientWidth - 8;
      if (room < SCROLL_BELOW || widths.current.length < groups.length) return setFitting(room < SCROLL_BELOW ? groups.length : null);
      const total = widths.current.reduce((a, w) => a + w + SEP_WIDTH, -SEP_WIDTH);
      if (total <= room) return setFitting(groups.length);
      let used = -SEP_WIDTH + MORE_WIDTH + SEP_WIDTH;
      let n = 0;
      for (let i = 0; i < groups.length; i++) {
        used += widths.current[i]! + SEP_WIDTH;
        if (used > room && !groups[i]!.keep) break;
        n = i + 1;
      }
      setFitting(n);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
    // The groups are rebuilt each time; what changes their width is the language, which reloads the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitting === null]);

  // One tab stop for the row; arrows, Home and End move along it.
  const active = useRef<HTMLElement | null>(null);
  const items = () => Array.from(bar.current?.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled)") ?? []).filter((el) => el.offsetParent !== null);
  useLayoutEffect(() => {
    const all = items();
    if (!active.current || !all.includes(active.current)) active.current = all[0] ?? null;
    for (const el of all) el.tabIndex = el === active.current ? 0 : -1;
  });
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key) || target.closest("[role=dialog], [role=menu], dialog")) return;
    if (target instanceof HTMLInputElement) {
      // In the size field the arrows move the caret until it is at the edge, and Home and End are the field's.
      if (e.key === "Home" || e.key === "End") return;
      const goesBack = (e.key === "ArrowLeft") !== (getComputedStyle(target).direction === "rtl");
      if (!(goesBack ? target.selectionStart === 0 && target.selectionEnd === 0 : target.selectionStart === target.value.length)) return;
    }
    const all = items();
    const at = all.indexOf(target.closest<HTMLElement>("button, input") ?? target);
    if (at < 0) return;
    const rtl = getComputedStyle(bar.current!).direction === "rtl";
    const next = e.key === "Home" ? 0 : e.key === "End" ? all.length - 1 : Math.max(0, Math.min(all.length - 1, at + ((e.key === "ArrowRight") !== rtl ? 1 : -1)));
    e.preventDefault();
    all[next]?.focus();
  };

  const waiting = groups.slice(shown);
  return (
    <div
      ref={bar}
      className={`doc-toolbar scroll-cue${suggesting ? " is-suggesting" : ""}`}
      role="toolbar"
      aria-label={t("Formatting")}
      aria-orientation="horizontal"
      onFocusCapture={(e) => {
        const el = (e.target as HTMLElement).closest<HTMLElement>("button, input");
        if (el && bar.current?.contains(el)) active.current = el;
      }}
      onKeyDown={onKeyDown}
    >
      {groups.map((g, i) => (
        <Fragment key={g.id}>
          {i > 0 && i < shown && <Sep />}
          <div ref={(el) => void (refs.current[i] = el)} className="doc-group" hidden={i >= shown} data-group={g.id}>
            {i < shown ? g.node : null}
          </div>
        </Fragment>
      ))}
      {waiting.length > 0 && (
        <div className="doc-group doc-more">
          <Sep />
          <Popover>
            <Tip label={t("More formatting")}>
              <PopoverTrigger asChild>
                <button type="button" className="doc-tool" aria-label={t("More formatting")} onMouseDown={(e) => e.preventDefault()}>
                  <Ellipsis size={16} aria-hidden />
                </button>
              </PopoverTrigger>
            </Tip>
            <PopoverContent align="end" className="doc-flyout doc-more-pop" {...closeToText}>
              {waiting.map((g) => (
                <div key={g.id} className="doc-group">
                  {g.node}
                </div>
              ))}
            </PopoverContent>
          </Popover>
        </div>
      )}
      {spacing && <SpacingDialog editor={editor} sel={s} onClose={() => setSpacing(false)} />}
    </div>
  );
}
