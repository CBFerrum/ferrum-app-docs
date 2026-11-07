// A long document's contents beside its page: the headings, in order, each a jump; the one in view
// is marked. Anyone who may open the document sees it.

import { type Editor, useEditorState } from "@tiptap/react";
import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { type Heading, depthOf, headingInView, headingsOf, sameHeadings } from "./outline";
import { t, isolate } from "@ferrum/client";

/** Headings count as reached when they are this far (px) from the top of the screen: below the
 *  bar and the toolbar. */
const LINE = 130;

export function Contents({ editor, onHide }: { editor: Editor; onHide: () => void }) {
  const headings = useEditorState({ editor, selector: ({ editor: e }) => headingsOf(e.state.doc), equalityFn: sameHeadings }) ?? [];
  const [at, setAt] = useState(0);

  // Which heading the reader is at, as the page scrolls (inside any scrolling box) or resizes.
  useEffect(() => {
    if (!headings.length) return;
    let frame = 0;
    const look = () => {
      frame = 0;
      const tops = headings.map((h) => {
        try {
          const el = editor.view.nodeDOM(h.pos);
          return el instanceof HTMLElement ? el.getBoundingClientRect().top : Infinity;
        } catch {
          return Infinity;
        }
      });
      setAt(headingInView(tops, LINE));
    };
    const ask = () => {
      if (!frame) frame = requestAnimationFrame(look);
    };
    ask();
    document.addEventListener("scroll", ask, true);
    addEventListener("resize", ask);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("scroll", ask, true);
      removeEventListener("resize", ask);
    };
  }, [editor, headings]);

  const go = (h: Heading, i: number) => {
    setAt(i);
    const el = editor.view.nodeDOM(h.pos);
    const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (el instanceof HTMLElement) el.scrollIntoView({ block: "start", behavior: calm ? "auto" : "smooth" });
    // Where the text can be changed, the caret goes to the heading: typing carries on there.
    if (editor.isEditable) editor.chain().focus(h.pos + 1, { scrollIntoView: false }).run();
  };

  return (
    <nav className="doc-toc" aria-label={t("Contents")}>
      <div className="doc-toc-head">
        <strong>{t("Contents")}</strong>
        <button type="button" className="doc-tool" aria-label={t("Hide the contents")} title={t("Hide the contents")} onClick={onHide}>
          <X size={16} aria-hidden />
        </button>
      </div>
      {headings.length ? (
        <ol className="doc-toc-list">
          {headings.map((h, i) => (
            <li key={h.pos} style={{ paddingInlineStart: `${depthOf(headings, h) * 14}px` }}>
              <button type="button" className="doc-toc-item" aria-current={i === at ? "location" : undefined} title={h.text} onClick={() => go(h, i)}>
                {isolate(h.text)}
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <p className="doc-toc-empty">{t("Headings you add to the text appear here, to jump to.")}</p>
      )}
    </nav>
  );
}
