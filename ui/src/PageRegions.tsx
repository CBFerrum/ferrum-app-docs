// The header and the footer, edited in place at the top and the bottom of the page. Each is a small
// editor on its own fragment of the shared document (regions.ts), so co-editors see it change as they
// see the text. A bar over the one being edited has bold, italic, underline, alignment and the fields the
// printer fills in; "Different first page" is the page setting (page.ts) and brings the first page's own
// pair.

import { Collaboration } from "@tiptap/extension-collaboration";
import { Placeholder } from "@tiptap/extensions";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import { AlignCenter, AlignLeft, AlignRight, Bold, Italic, Underline } from "lucide-react";
import { useEffect, useState } from "react";
import type * as Y from "yjs";
import { t } from "@ferrum/client";
import { Button } from "@ferrum/kit";
import { DropdownMenuItem } from "@ferrum/kit/primitives";
import { stamp } from "./compat";
import { type PageSetup, writeSetup } from "./page";
import { FIELDS, type Region, fieldLabel, regionExtensions } from "./regions";
import { Drop } from "./Toolbar";
import { Tool } from "./Tool";

const LABELS: Record<Region, () => string> = {
  header: () => t("Header"),
  footer: () => t("Footer"),
  firstHeader: () => t("First page header"),
  firstFooter: () => t("First page footer"),
};

export function PageRegion({ doc, name, editable, setup }: { doc: Y.Doc; name: Region; editable: boolean; setup: PageSetup }) {
  const label = LABELS[name]();
  const [focused, setFocused] = useState(false);
  const editor = useEditor(
    {
      editable,
      extensions: [...regionExtensions(), Placeholder.configure({ placeholder: label }), Collaboration.configure({ document: doc, field: name })],
      editorProps: { attributes: { "aria-label": label, spellcheck: "true" } },
      onUpdate: ({ editor: e }) => e.isEmpty || stamp(doc),
      onFocus: () => setFocused(true),
      onBlur: ({ event }) => {
        // Pressing a button of the region's own bar leaves the text but not the region.
        const next = (event as FocusEvent | undefined)?.relatedTarget as HTMLElement | null;
        if (!next?.closest?.(".doc-region")) setFocused(false);
      },
    },
    [doc, name],
  );
  useEffect(() => {
    if (editor && editor.isEditable !== editable) editor.setEditable(editable);
  }, [editor, editable]);
  const empty = useEditorState({ editor, selector: ({ editor: e }) => !e || e.isEmpty }) ?? true;
  // A reader has no use for an empty region.
  if (!editable && empty) return null;
  const footer = name === "footer" || name === "firstFooter";
  return (
    <div className={`doc-region doc-region-${footer ? "footer" : "header"}${name.startsWith("first") ? " doc-region-first" : ""}`} data-region={name}>
      {editable && <span className="doc-region-label">{label}</span>}
      {editable && focused && editor && <RegionBar editor={editor} doc={doc} setup={setup} />}
      <EditorContent editor={editor} />
    </div>
  );
}

function RegionBar({ editor, doc, setup }: { editor: Editor; doc: Y.Doc; setup: PageSetup }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({ bold: e.isActive("bold"), italic: e.isActive("italic"), underline: e.isActive("underline"), left: !e.isActive({ textAlign: "center" }) && !e.isActive({ textAlign: "right" }), center: e.isActive({ textAlign: "center" }), right: e.isActive({ textAlign: "right" }) }),
  });
  const run = () => editor.chain().focus();
  return (
    <div className="doc-float doc-region-bar" role="toolbar" aria-label={t("Header and footer")}>
      <Tool label={t("Bold")} icon={Bold} keys="Mod-b" active={s.bold} onClick={() => run().toggleBold().run()} />
      <Tool label={t("Italic")} icon={Italic} keys="Mod-i" active={s.italic} onClick={() => run().toggleItalic().run()} />
      <Tool label={t("Underline")} icon={Underline} keys="Mod-u" active={s.underline} onClick={() => run().toggleUnderline().run()} />
      <Tool label={t("Align left")} icon={AlignLeft} active={s.left} onClick={() => run().setTextAlign("left").run()} />
      <Tool label={t("Align centre")} icon={AlignCenter} active={s.center} onClick={() => run().setTextAlign("center").run()} />
      <Tool label={t("Align right")} icon={AlignRight} active={s.right} onClick={() => run().setTextAlign("right").run()} />
      <Drop
        editor={editor}
        label={t("Insert a field")}
        className="doc-drop-text"
        content={FIELDS.map((f) => (
          <DropdownMenuItem key={f} onSelect={() => run().insertContent({ type: "pageField", attrs: { kind: f } }).run()}>
            {fieldLabel(f)}
          </DropdownMenuItem>
        ))}
      >
        {t("Insert field")}
      </Drop>
      <Button size="sm" aria-pressed={setup.differentFirst} onMouseDown={(e) => e.preventDefault()} onClick={() => writeSetup(doc, { ...setup, differentFirst: !setup.differentFirst })}>
        {t("Different first page")}
      </Button>
    </div>
  );
}
