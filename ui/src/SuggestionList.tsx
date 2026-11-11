// The suggestions beside a live document: what each proposes (words added and removed, a paragraph boundary as
// ¶, formatting by name), who and when, and Accept or Reject; all of them, or all of one person's, at once.
// Loaded when a document has suggestions (CommentRail.tsx). Settling is one transaction (one undo) and is
// spoken to screen readers.

import type { Editor } from "@tiptap/react";
import { useState } from "react";
import { formatDateTime, isolate, t } from "@ferrum/client";
import { Button, announce } from "@ferrum/kit";
import { type Suggestion, settle } from "./suggest";

/** The words for what a format suggestion changed (suggest.ts `formats`). */
export function formatLabel(key: string): string {
  if (key.startsWith("-")) return t("{what} removed", { what: formatLabel(key.slice(1)) });
  const heading = /^type:heading:(\d)$/.exec(key);
  if (heading) return t("Heading {level}", { level: Number(heading[1]) });
  const words: Record<string, () => string> = {
    bold: () => t("Bold"),
    italic: () => t("Italic"),
    underline: () => t("Underline"),
    strike: () => t("Strikethrough"),
    code: () => t("Code"),
    subscript: () => t("Subscript"),
    superscript: () => t("Superscript"),
    link: () => t("Link"),
    highlight: () => t("Highlight colour"),
    color: () => t("Text colour"),
    fontSize: () => t("Font size"),
    fontFamily: () => t("Font"),
    textAlign: () => t("Alignment"),
    lineHeight: () => t("Line spacing"),
    spacing: () => t("Paragraph spacing"),
    indent: () => t("Indent"),
    role: () => t("Paragraph style"),
    bullet: () => t("List style"),
    numberStyle: () => t("List style"),
    start: () => t("Start number"),
    continues: () => t("Continue numbering"),
    dir: () => t("Text direction"),
    "type:paragraph": () => t("Text"),
    "type:orderedList": () => t("Numbered list"),
    "type:bulletList": () => t("Bulleted list"),
  };
  return words[key]?.() ?? key;
}

function What({ s }: { s: Suggestion }) {
  const formats = [...new Set(s.formats.map(formatLabel))].join(", ");
  return (
    <>
      {s.deleted && s.inserted ? (
        <>
          {t("Replace")} <del className="doc-del">{isolate(s.deleted)}</del> {t("with")} <ins className="doc-ins">{isolate(s.inserted)}</ins>
        </>
      ) : s.inserted ? (
        <>
          {t("Add")} <ins className="doc-ins">{isolate(s.inserted)}</ins>
        </>
      ) : s.deleted ? (
        <>
          {t("Remove")} <del className="doc-del">{isolate(s.deleted)}</del>
        </>
      ) : null}
      {formats && (
        <>
          {(s.inserted || s.deleted) && " · "}
          {t("Format: {what}", { what: formats })}
        </>
      )}
    </>
  );
}

export default function SuggestionList({ editor, proposals, canEdit }: { editor: Editor; proposals: Suggestion[]; canEdit: boolean }) {
  const [who, setWho] = useState("");
  const people = [...new Map(proposals.map((s) => [s.user, s.name || t("Someone")])).entries()];
  const shown = who && people.some(([id]) => id === who) ? proposals.filter((s) => s.user === who) : proposals;
  const decide = (ids: string[], accept: boolean) => {
    if (!ids.length) return;
    editor.view.dispatch(settle(editor.state, ids, accept));
    const n = ids.length;
    announce(accept ? (n === 1 ? t("Suggestion accepted") : t("{n} suggestions accepted", { n })) : n === 1 ? t("Suggestion rejected") : t("{n} suggestions rejected", { n }));
  };
  const show = (s: Suggestion) => editor.chain().setTextSelection({ from: s.from, to: Math.min(s.to, editor.state.doc.content.size) }).scrollIntoView().run();
  return (
    <section className="doc-proposals" aria-label={t("Suggestions")}>
      <div className="doc-proposals-head">
        <strong>{t("Suggestions ({length})", { length: proposals.length })}</strong>
        {people.length > 1 && (
          <select className="input input-sm doc-proposals-who" aria-label={t("Suggestions from")} value={who} onChange={(e) => setWho(e.target.value)}>
            <option value="">{t("Everyone")}</option>
            {people.map(([id, name]) => (
              <option key={id} value={id}>
                {isolate(name)}
              </option>
            ))}
          </select>
        )}
        {canEdit && shown.length > 1 && (
          <span className="doc-thread-actions">
            <Button size="sm" variant="ghost" onClick={() => decide(shown.map((s) => s.id), true)}>
              {who ? t("Accept all from {name}", { name: shown[0]!.name || t("Someone") }) : t("Accept all")}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => decide(shown.map((s) => s.id), false)}>
              {who ? t("Reject all from {name}", { name: shown[0]!.name || t("Someone") }) : t("Reject all")}
            </Button>
          </span>
        )}
      </div>
      <ul className="doc-threads">
        {shown.map((s) => (
          <li key={s.id} className="doc-thread doc-proposal">
            <button type="button" className="doc-proposal-what" onClick={() => show(s)}>
              <What s={s} />
            </button>
            <div className="doc-thread-head">
              <strong>{isolate(s.name || t("Someone"))}</strong>
              {s.at && (
                <time className="faint" dateTime={s.at}>
                  {isolate(formatDateTime(s.at))}
                </time>
              )}
            </div>
            {canEdit && (
              <div className="doc-thread-actions">
                <Button size="sm" variant="ghost" onClick={() => decide([s.id], false)} aria-label={t("Reject the suggestion by {name}", { name: s.name || t("someone") })}>
                  {t("Reject")}
                </Button>
                <Button size="sm" onClick={() => decide([s.id], true)} aria-label={t("Accept the suggestion by {name}", { name: s.name || t("someone") })}>
                  {t("Accept")}
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
