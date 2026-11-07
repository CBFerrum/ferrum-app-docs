// The bar for find and replace, under the toolbar (find.ts keeps the matches and marks them in the
// text). Enter goes to the next match, Shift+Enter to the one before, Escape closes it and returns
// to the text. Anyone may find; whoever may change the text may replace.

import { type Editor, useEditorState } from "@tiptap/react";
import { CaseSensitive, ChevronDown, ChevronUp, Replace, X } from "lucide-react";
import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import { Button, toast } from "@ferrum/kit";
import { findKey, replaceAll, replaceOne, setFind } from "./find";
import { Sep, Tool } from "./Tool";
import { t } from "@ferrum/client";

/** The words selected in one paragraph, to search for when the bar opens. */
function selectedWords(editor: Editor): string {
  const { from, to, empty } = editor.state.selection;
  if (empty || !editor.state.doc.resolve(from).sameParent(editor.state.doc.resolve(to))) return "";
  const words = editor.state.doc.textBetween(from, to, " ").trim();
  return words.length <= 80 ? words : "";
}

export function FindBar({
  editor,
  canReplace,
  replacing,
  setReplacing,
  focus,
  onClose,
}: {
  editor: Editor;
  canReplace: boolean;
  replacing: boolean;
  setReplacing: (on: boolean) => void;
  /** Changes each time the bar is asked for again: the field takes the focus. */
  focus: number;
  onClose: () => void;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [typed, setTyped] = useState(() => selectedWords(editor) || (findKey.getState(editor.state)?.query ?? ""));
  const [withText, setWithText] = useState("");
  const f = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const st = findKey.getState(e.state);
      return { query: st?.query ?? "", matchCase: st?.matchCase ?? false, count: st?.matches.length ?? 0, current: st?.current ?? -1, more: st?.more ?? false };
    },
    equalityFn: (a, b) => !!b && a.query === b.query && a.matchCase === b.matchCase && a.count === b.count && a.current === b.current && a.more === b.more,
  });

  // What is typed here is what is searched for (and the words selected when the bar opened).
  useEffect(() => {
    if (!editor.isDestroyed) editor.view.dispatch(setFind(editor.state, { query: typed }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typed, editor]);
  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, [focus]);
  // The match in view comes into view as it changes.
  useEffect(() => {
    if (f.current < 0 || editor.isDestroyed) return;
    const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
    editor.view.dom.querySelector<HTMLElement>(".doc-found-current")?.scrollIntoView({ block: "center", behavior: calm ? "auto" : "smooth" });
  }, [editor, f.current, f.query, f.matchCase]);
  // Closing clears the marks.
  useEffect(
    () => () => {
      if (!editor.isDestroyed) editor.view.dispatch(setFind(editor.state, { query: "" }));
    },
    [editor],
  );

  const go = (by: number) => {
    if (f.count) editor.view.dispatch(setFind(editor.state, { current: f.current + by }));
  };
  const close = () => {
    onClose();
    editor.commands.focus();
  };
  const replaceThis = () => {
    const tr = replaceOne(editor.state, withText);
    if (tr) editor.view.dispatch(tr);
  };
  const replaceEvery = () => {
    const tr = replaceAll(editor.state, withText);
    if (!tr) return;
    editor.view.dispatch(tr);
    toast(`Replaced ${tr.steps.length} ${tr.steps.length === 1 ? "match" : "matches"}`);
  };
  const onFindKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      go(e.shiftKey ? -1 : 1);
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  };
  const status = !f.query ? "" : f.count === 0 ? "No matches" : `${f.current + 1} of ${f.count}${f.more ? "+" : ""}`;

  return (
    <div className="doc-find" role="search" aria-label={t("Find in the document")}>
      <div className="doc-find-row">
        <label className="sr-only" htmlFor={`${id}-find`}>
          {t("Find in the document")}
        </label>
        <input id={`${id}-find`} ref={input} className="input doc-find-input" type="search" placeholder={t("Find in the document")} autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} onKeyDown={onFindKey} />
        <span className="doc-find-count" role="status" aria-live="polite">
          {status}
        </span>
        <Tool label={t("Previous match (Shift+Enter)")} icon={ChevronUp} disabled={!f.count} onClick={() => go(-1)} />
        <Tool label={t("Next match (Enter)")} icon={ChevronDown} disabled={!f.count} onClick={() => go(1)} />
        <Tool label={t("Match case")} icon={CaseSensitive} active={f.matchCase} onClick={() => editor.view.dispatch(setFind(editor.state, { matchCase: !f.matchCase }))} />
        {canReplace && (
          <>
            <Sep />
            <Tool label={replacing ? "Hide replace" : "Replace…"} icon={Replace} active={replacing} onClick={() => setReplacing(!replacing)} />
          </>
        )}
        <Tool label={t("Close find")} icon={X} onClick={close} />
      </div>
      {canReplace && replacing && (
        <div className="doc-find-row">
          <label className="sr-only" htmlFor={`${id}-with`}>
            {t("Replace with")}
          </label>
          <input
            id={`${id}-with`}
            className="input doc-find-input"
            type="text"
            placeholder={t("Replace with")}
            autoComplete="off"
            value={withText}
            onChange={(e) => setWithText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                replaceThis();
              } else if (e.key === "Escape") {
                e.preventDefault();
                close();
              }
            }}
          />
          <Button size="sm" disabled={!f.count} onClick={replaceThis}>
            {t("Replace")}
          </Button>
          <Button size="sm" disabled={!f.count} onClick={replaceEvery}>
            {t("Replace all")}
          </Button>
        </div>
      )}
    </div>
  );
}
