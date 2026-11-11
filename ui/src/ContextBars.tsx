// The small bars that float over the page beside what is selected: a table's (rows, columns, merge,
// split, header, cell colour, delete) while the cursor is in a table, an image's (where it sits, its
// size, words under it, what it shows, replace, delete) while one is selected. Each sits just above
// the thing it acts on, inside the page (so it scrolls with it), and goes when the selection leaves.

import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import { AlignVerticalJustifyCenter, CalendarDays, Captions, Columns3, Grid2x2, ListTree, ImageUp, Maximize2, PaintBucket, PanelLeft, PanelRight, PanelTop, Rows3, TableCellsMerge, TableCellsSplit, Trash2, AlignCenter, AlignLeft, AlignRight } from "lucide-react";
import { type FormEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { NodeSelection } from "@tiptap/pm/state";
import { t } from "@ferrum/client";
import { Button, Dialog, Field } from "@ferrum/kit";
import { DropdownMenuItem, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, Popover, PopoverContent, PopoverTrigger } from "@ferrum/kit/primitives";
import { cleanColor, cleanVAlign } from "./format";
import { cleanDate, dateText } from "./chips";
import { MAX_LEVELS } from "./pages";
import { type ImageAlign, IMAGE_TYPES, imageFiles } from "./image";
import { Drop, ColorButton } from "./Toolbar";
import { Tip, Tool } from "./Tool";
import { replaceImageWith } from "./upload";

interface Place {
  top: number;
  inline: number;
  width: number;
  /** The page's own width. */
  host: number;
}

/** Where a bar goes: just above `find`'s element (below it when the page's top is in the way), in the page's own coordinates. */
function usePlace(editor: Editor, find: (e: Editor) => HTMLElement | null): Place | null {
  const [place, setPlace] = useState<Place | null>(null);
  useEffect(() => {
    const update = () => {
      const el = editor.isDestroyed ? null : find(editor);
      const host = el?.closest<HTMLElement>(".doc-paper");
      if (!el || !host) return setPlace((p) => (p ? null : p));
      const r = el.getBoundingClientRect();
      const h = host.getBoundingClientRect();
      const rtl = getComputedStyle(host).direction === "rtl";
      const next = { top: Math.round(r.top - h.top), inline: Math.round(rtl ? h.right - r.right : r.left - h.left), width: Math.round(r.width), host: Math.round(h.width) };
      setPlace((p) => (p && p.top === next.top && p.inline === next.inline && p.width === next.width && p.host === next.host ? p : next));
    };
    update();
    editor.on("transaction", update);
    window.addEventListener("resize", update);
    return () => {
      editor.off("transaction", update);
      window.removeEventListener("resize", update);
    };
    // `find` is a module-level function of the caller.
  }, [editor, find]);
  return place;
}

/** `beside`: the bar stands in the margin next to the thing, when the page has room for it, so it covers none of the text. */
function Bar({ place, label, children, beside }: { place: Place; label: string; children: ReactNode; beside?: boolean }) {
  const room = beside && place.host - (place.inline + place.width) >= 56;
  return (
    <div className={`doc-float${room ? " doc-float-beside" : ""}`} role="toolbar" aria-label={label} aria-orientation={room ? "vertical" : "horizontal"} style={room ? { insetBlockStart: Math.max(4, place.top), insetInlineStart: place.inline + place.width + 8 } : { insetBlockStart: Math.max(4, place.top - 44), insetInlineStart: Math.max(0, place.inline) }}>
      {children}
    </div>
  );
}

const tableElement = (e: Editor) => {
  const { $from } = e.state.selection;
  for (let d = $from.depth; d > 0; d--) if ($from.node(d).type.name === "table") return e.view.nodeDOM($from.before(d)) as HTMLElement | null;
  return null;
};

export function TableBar({ editor }: { editor: Editor }) {
  const place = usePlace(editor, tableElement);
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const { $from } = e.state.selection;
      let header = false;
      for (let d = $from.depth; d > 0; d--) if ($from.node(d).type.name === "table") header = $from.node(d).firstChild?.firstChild?.type.name === "tableHeader";
      let borders = true;
      for (let d = $from.depth; d > 0; d--) if ($from.node(d).type.name === "table") borders = $from.node(d).attrs.borders !== "none";
      const cell = e.isActive("tableHeader") ? e.getAttributes("tableHeader") : e.getAttributes("tableCell");
      const align = e.isActive({ textAlign: "center" }) ? "center" : e.isActive({ textAlign: "right" }) ? "right" : "left";
      return { on: e.isActive("table"), header, borders, align, valign: cleanVAlign(cell.verticalAlign) ?? "top", merge: e.can().mergeCells(), split: e.can().splitCell(), fill: cleanColor(cell.background) };
    },
  });
  if (!s.on || !place) return null;
  const run = () => editor.chain().focus();
  return (
    <Bar place={place} label={t("Table")} beside>
      <Drop
        editor={editor}
        label={t("Row")}
        content={
          <>
            <DropdownMenuItem onSelect={() => run().addRowBefore().run()}>{t("Insert a row above")}</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => run().addRowAfter().run()}>{t("Insert a row below")}</DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onSelect={() => run().deleteRow().run()}>
              {t("Delete the row")}
            </DropdownMenuItem>
          </>
        }
      >
        <Rows3 size={16} aria-hidden />
      </Drop>
      <Drop
        editor={editor}
        label={t("Column")}
        content={
          <>
            <DropdownMenuItem onSelect={() => run().addColumnBefore().run()}>{t("Insert a column to the left")}</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => run().addColumnAfter().run()}>{t("Insert a column to the right")}</DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onSelect={() => run().deleteColumn().run()}>
              {t("Delete the column")}
            </DropdownMenuItem>
          </>
        }
      >
        <Columns3 size={16} aria-hidden />
      </Drop>
      <span className="doc-sep" aria-hidden />
      <Tool label={t("Merge cells")} icon={TableCellsMerge} disabled={!s.merge} onClick={() => run().mergeCells().run()} />
      <Tool label={t("Split cell")} icon={TableCellsSplit} disabled={!s.split} onClick={() => run().splitCell().run()} />
      <Tool label={t("Header row")} icon={PanelTop} active={s.header} onClick={() => run().toggleHeaderRow().run()} />
      <ColorButton editor={editor} label={t("Cell colour")} kind="cell" icon={PaintBucket} current={s.fill} noneLabel={t("No fill")} onPick={(c) => run().setCellBackground(c).run()} />
      <Drop
        editor={editor}
        label={t("Cell alignment")}
        content={
          <>
            <DropdownMenuRadioGroup value={s.align} onValueChange={(v) => run().setTextAlign(v).run()}>
              <DropdownMenuRadioItem value="left">{t("Align left")}</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="center">{t("Center")}</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="right">{t("Align right")}</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuRadioGroup value={s.valign} onValueChange={(v) => run().setCellAttribute("verticalAlign", cleanVAlign(v)).run()}>
              <DropdownMenuRadioItem value="top">{t("Top")}</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="middle">{t("Middle")}</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="bottom">{t("Bottom")}</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </>
        }
      >
        <AlignVerticalJustifyCenter size={16} aria-hidden />
      </Drop>
      <Tool label={t("Borders")} icon={Grid2x2} active={s.borders} onClick={() => run().updateAttributes("table", { borders: s.borders ? "none" : null }).run()} />
      <span className="doc-sep" aria-hidden />
      <Tool label={t("Delete the table")} icon={Trash2} danger onClick={() => run().deleteTable().run()} />
    </Bar>
  );
}

const imageElement = (e: Editor) => {
  const sel = e.state.selection;
  return sel instanceof NodeSelection && sel.node.type.name === "image" ? (e.view.nodeDOM(sel.from) as HTMLElement | null) : null;
};

/** What an image shows, for people who cannot see it (screen readers, and files that lose it). */
export function DescribeDialog({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const [alt, setAlt] = useState((editor.getAttributes("image").alt as string | undefined) ?? "");
  const save = (e: FormEvent) => {
    e.preventDefault();
    editor.chain().focus().describeImage(alt).run();
    onClose();
  };
  const footer: ReactNode = (
    <>
      <Button onClick={onClose}>{t("Cancel")}</Button>
      <Button variant="primary" type="submit" form="doc-describe-form">
        {t("Save")}
      </Button>
    </>
  );
  return (
    <Dialog open onClose={onClose} title={t("Describe the image")} footer={footer}>
      <form id="doc-describe-form" onSubmit={save}>
        <Field label={t("Description")} htmlFor="doc-describe-alt" hint={t("What it shows, in a sentence; leave empty for a decoration")}>
          <input id="doc-describe-alt" className="input" value={alt} maxLength={300} onChange={(e) => setAlt(e.target.value)} data-autofocus />
        </Field>
      </form>
    </Dialog>
  );
}

function CaptionButton({ editor, caption }: { editor: Editor; caption: string }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(caption);
  useEffect(() => setText(caption), [caption, open]);
  const save = (e: FormEvent) => {
    e.preventDefault();
    editor.chain().focus().captionImage(text).run();
    setOpen(false);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tip label={t("Caption")}>
        <PopoverTrigger asChild>
          <button type="button" className="doc-tool" aria-label={t("Caption")} aria-pressed={!!caption} aria-expanded={open} onMouseDown={(e) => e.preventDefault()}>
            <Captions size={16} aria-hidden />
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
        <form onSubmit={save} className="doc-caption-form">
          <label className="doc-palette-label" htmlFor="doc-caption">
            {t("Words under the image")}
          </label>
          <input id="doc-caption" className="input" value={text} maxLength={300} onChange={(e) => setText(e.target.value)} data-autofocus />
          <Button variant="primary" size="sm" type="submit">
            {t("Save")}
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}

export function ImageBar({ editor, file }: { editor: Editor; file: string }) {
  const place = usePlace(editor, imageElement);
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const sel = e.state.selection;
      const a = sel instanceof NodeSelection && sel.node.type.name === "image" ? (sel.node.attrs as { align?: ImageAlign; caption?: string }) : null;
      return { on: !!a, align: a?.align ?? "center", caption: a?.caption ?? "" };
    },
  });
  const [describing, setDescribing] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  if (!s.on || !place) return null;
  const run = () => editor.chain().focus();
  const align = (label: string, icon: typeof AlignLeft, value: ImageAlign) => <Tool label={label} icon={icon} active={s.align === value} onClick={() => run().alignImage(value).run()} />;
  const sized = (percent: number) => {
    const page = editor.view.dom.clientWidth;
    run().resizeImage(Math.round((page * percent) / 100)).run();
  };
  return (
    <Bar place={place} label={t("Image")}>
      {align(t("Align image left"), AlignLeft, "left")}
      {align(t("Align image centre"), AlignCenter, "center")}
      {align(t("Align image right"), AlignRight, "right")}
      {align(t("Wrap text, image on the left"), PanelLeft, "wrapLeft")}
      {align(t("Wrap text, image on the right"), PanelRight, "wrapRight")}
      <span className="doc-sep" aria-hidden />
      <Drop
        editor={editor}
        label={t("Image size")}
        content={[25, 50, 75, 100].map((p) => (
          <DropdownMenuItem key={p} onSelect={() => sized(p)}>
            {t("{percent}% of the page width", { percent: p })}
          </DropdownMenuItem>
        ))}
      >
        <Maximize2 size={16} aria-hidden />
      </Drop>
      <CaptionButton editor={editor} caption={s.caption} />
      <button type="button" className="doc-tool doc-tool-text" onMouseDown={(e) => e.preventDefault()} onClick={() => setDescribing(true)}>
        {t("Alt text")}
      </button>
      <Tool label={t("Replace the image")} icon={ImageUp} onClick={() => picker.current?.click()} />
      <span className="doc-sep" aria-hidden />
      <Tool label={t("Delete the image")} icon={Trash2} danger onClick={() => run().deleteSelection().run()} />
      <input
        ref={picker}
        type="file"
        accept={IMAGE_TYPES.join(",")}
        hidden
        onChange={(e) => {
          const [f] = imageFiles(e.target.files);
          e.target.value = "";
          if (f) void replaceImageWith(editor, file, f);
        }}
      />
      {describing && <DescribeDialog editor={editor} onClose={() => setDescribing(false)} />}
    </Bar>
  );
}

const selectedOf = (name: string) => (e: Editor) => {
  const sel = e.state.selection;
  return sel instanceof NodeSelection && sel.node.type.name === name ? (e.view.nodeDOM(sel.from) as HTMLElement | null) : null;
};
const dateElement = selectedOf("dateChip");
const contentsElement = selectedOf("tableOfContents");

/** A selected date chip: its date, to change. */
export function DateBar({ editor }: { editor: Editor }) {
  const place = usePlace(editor, dateElement);
  const date = useEditorState({ editor, selector: ({ editor: e }) => (dateElement(e) ? cleanDate(e.getAttributes("dateChip").date) : null) });
  if (!place || !date) return null;
  return (
    <Bar place={place} label={t("Date")}>
      <CalendarDays size={16} aria-hidden className="doc-bar-icon" />
      <label className="sr-only" htmlFor="doc-date-pick">
        {t("Date")}
      </label>
      <input id="doc-date-pick" type="date" className="input input-sm" value={date} onChange={(e) => cleanDate(e.target.value) && editor.chain().setDate(e.target.value).run()} />
      <span className="faint doc-bar-note">{dateText(date)}</span>
    </Bar>
  );
}

/** A selected contents block: how deep a heading it lists. */
export function ContentsBar({ editor }: { editor: Editor }) {
  const place = usePlace(editor, contentsElement);
  const levels = useEditorState({ editor, selector: ({ editor: e }) => (contentsElement(e) ? (e.getAttributes("tableOfContents").levels as number) : null) });
  if (!place || !levels) return null;
  return (
    <Bar place={place} label={t("Contents")}>
      <Drop
        editor={editor}
        label={t("Headings listed")}
        value={t("Down to heading {level}", { level: levels })}
        className="doc-drop-text"
        content={
          <DropdownMenuRadioGroup value={String(levels)} onValueChange={(v) => editor.chain().focus().updateAttributes("tableOfContents", { levels: Number(v) }).run()}>
            {Array.from({ length: MAX_LEVELS }, (_, i) => (
              <DropdownMenuRadioItem key={i} value={String(i + 1)}>
                {t("Down to heading {level}", { level: i + 1 })}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        }
      >
        <ListTree size={16} aria-hidden /> {t("Down to heading {level}", { level: levels })}
      </Drop>
      <Tool label={t("Delete the contents")} icon={Trash2} danger onClick={() => editor.chain().focus().deleteSelection().run()} />
    </Bar>
  );
}
