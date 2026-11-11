// The page of an open document, as the editor page uses it: the page setup (shared, live), the print
// style kept current for the browser's print (print.ts), and the layout the browser's engine gives
// (layout.ts), measured a moment after the text stops changing.

import type { Editor } from "@tiptap/core";
import { yXmlFragmentToProsemirrorJSON } from "@tiptap/y-tiptap";
import { type RefObject, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type * as Y from "yjs";
import { type Layout, measure } from "./layout";
import { type PageSetup, cleanSetup, readSetup, pageMap } from "./page";
import { linesOf, printStyle } from "./print";
import { REGIONS } from "./regions";

/** The page setup of a shared document, current. */
export function usePageSetup(doc: Y.Doc): PageSetup {
  const cache = useRef<{ key: string; value: PageSetup } | null>(null);
  const get = () => {
    const value = readSetup(doc);
    const key = JSON.stringify(value);
    if (cache.current?.key !== key) cache.current = { key, value };
    return cache.current.value;
  };
  return useSyncExternalStore(
    (fn) => {
      pageMap(doc).observe(fn);
      return () => pageMap(doc).unobserve(fn);
    },
    get,
  );
}

const locale = () => navigator.language || document.documentElement.lang || "en";

/** Keeps the page's print style (`@page` size, margins, header and footer) made from the setup and the
 *  regions while the document is open, and made again just before printing (the date is today's). */
export function usePrintStyle(doc: Y.Doc, setup: PageSetup, title: string): () => void {
  const build = useRef<() => void>(() => undefined);
  useEffect(() => {
    const style = document.createElement("style");
    style.id = "docs-print-style";
    document.head.append(style);
    build.current = () => {
      const regions = Object.fromEntries(REGIONS.map((r) => [r, linesOf(yXmlFragmentToProsemirrorJSON(doc.getXmlFragment(r)))])) as Record<(typeof REGIONS)[number], ReturnType<typeof linesOf>>;
      style.textContent = printStyle(cleanSetup({ ...setup }), regions, { title, date: new Date().toLocaleDateString(locale(), { dateStyle: "long" }) });
    };
    build.current();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const later = () => {
      clearTimeout(timer);
      timer = setTimeout(() => build.current(), 200);
    };
    const frags = REGIONS.map((r) => doc.getXmlFragment(r));
    for (const f of frags) f.observeDeep(later);
    const before = () => build.current();
    window.addEventListener("beforeprint", before);
    return () => {
      clearTimeout(timer);
      for (const f of frags) f.unobserveDeep(later);
      window.removeEventListener("beforeprint", before);
      style.remove();
    };
  }, [doc, setup, title]);
  return () => build.current();
}

/** The layout of the document as the printer will cut it. `marks`: also where each page starts on the
 *  sheet (only when the sheet is as wide as the paper). Null until measured. */
export function usePageLayout(editor: Editor | null, sheet: RefObject<HTMLElement | null>, setup: PageSetup, marks: boolean, on: boolean): Layout | null {
  const [layout, setLayout] = useState<Layout | null>(null);
  useEffect(() => {
    if (!editor || !on) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let run = 0;
    const go = () => {
      const el = sheet.current;
      if (!el || editor.isDestroyed) return;
      const mine = ++run;
      void measure(editor.view.dom, el, setup, marks).then((l) => {
        if (!alive || mine !== run) return;
        if (!l) return void (timer = setTimeout(go, 300));
        setLayout((old) => (old && old.pages === l.pages && old.marks.length === l.marks.length && old.marks.every((m, i) => m.top === l.marks[i]!.top && m.page === l.marks[i]!.page) ? old : l));
      });
    };
    const later = () => {
      clearTimeout(timer);
      timer = setTimeout(go, 400);
    };
    editor.on("update", later);
    const ro = new ResizeObserver(later);
    if (sheet.current) ro.observe(sheet.current);
    void document.fonts?.ready.then(later);
    later();
    return () => {
      alive = false;
      clearTimeout(timer);
      editor.off("update", later);
      ro.disconnect();
    };
  }, [editor, sheet, setup, marks, on]);
  return layout;
}
