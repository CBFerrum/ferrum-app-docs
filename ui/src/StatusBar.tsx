// Under the page: how many words and characters the document has (and the selection, when there is
// one), and how many pages the browser's layout makes of it at the page setup's paper.

import type { Editor } from "@tiptap/core";
import { useEffect, useState } from "react";
import { t } from "@ferrum/client";
import type { PageSetup } from "./page";

interface Counts {
  words: number;
  chars: number;
  selWords: number;
  selChars: number;
}

const count = (editor: Editor): Counts => {
  const c = editor.storage.characterCount as { words: (o?: { node?: unknown }) => number; characters: (o?: { node?: unknown }) => number };
  const { from, to, empty } = editor.state.selection;
  const sel = empty ? null : editor.state.doc.cut(from, to);
  return { words: c.words(), chars: c.characters(), selWords: sel ? c.words({ node: sel }) : 0, selChars: sel ? c.characters({ node: sel }) : 0 };
};

export function StatusBar({ editor, pages, setup }: { editor: Editor; pages: number | null; setup: PageSetup }) {
  const [n, setN] = useState<Counts>(() => count(editor));
  // Counting reads all the text: once the typing pauses.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const later = () => {
      clearTimeout(timer);
      timer = setTimeout(() => !editor.isDestroyed && setN(count(editor)), 250);
    };
    editor.on("update", later);
    editor.on("selectionUpdate", later);
    later();
    return () => {
      clearTimeout(timer);
      editor.off("update", later);
      editor.off("selectionUpdate", later);
    };
  }, [editor]);
  const nf = new Intl.NumberFormat();
  return (
    <div className="doc-statusbar" role="status" aria-label={t("Document statistics")}>
      <span>{n.selChars ? t("{selected} of {words} words", { selected: nf.format(n.selWords), words: nf.format(n.words) }) : n.words === 1 ? t("1 word") : t("{words} words", { words: nf.format(n.words) })}</span>
      <span>{n.selChars ? t("{selected} of {chars} characters", { selected: nf.format(n.selChars), chars: nf.format(n.chars) }) : t("{chars} characters", { chars: nf.format(n.chars) })}</span>
      {pages !== null && <span title={t("As the printer will cut it")}>{pages === 1 ? t("1 page") : t("{pages} pages", { pages })}</span>}
      <span>{t("{paper}, {orientation}", { paper: setup.size, orientation: setup.orientation === "landscape" ? t("landscape") : t("portrait") })}</span>
    </div>
  );
}
