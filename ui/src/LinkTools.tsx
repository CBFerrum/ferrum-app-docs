// Links: the panel that opens with Ctrl or ⌘ K (a web address, a heading in this document, or another
// Ferrum document found by its title), and the card over a link (where it goes, open, edit, remove). Both
// float over the page, in its own coordinates, as the table and image bars do (ContextBars.tsx).

import { getMarkRange, type Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import { useQuery } from "@tanstack/react-query";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { api, isolate, t } from "@ferrum/client";
import { Button, Spinner } from "@ferrum/kit";
import { headingsOf } from "./outline";
import { type DocItem, isDocument } from "./docslist";
import { docTitle } from "./livedocs";
import { cleanHref, docHref, headingByAnchor, targetOf } from "./links";
import { goTo, newId } from "./pages";

export interface LinkEnv {
  /** This document (a link to itself is a heading link). */
  file: string;
  openDoc: (id: string) => void;
}

/** Where the caret or `rect` is, in the coordinates of the page the bars float in. */
function placeAt(editor: Editor, rect: { top: number; bottom: number; left: number; right: number }): { top: number; inline: number } | null {
  const host = editor.view.dom.closest<HTMLElement>(".doc-paper");
  if (!host) return null;
  const h = host.getBoundingClientRect();
  const rtl = getComputedStyle(host).direction === "rtl";
  return { top: Math.round(rect.bottom - h.top + 6), inline: Math.max(0, Math.round(rtl ? h.right - rect.right : rect.left - h.left)) };
}

const linkRange = (editor: Editor, pos: number) => getMarkRange(editor.state.doc.resolve(pos), editor.schema.marks.link!);

type Tab = "web" | "heading" | "doc";

export function LinkPanel({ editor, env, onClose }: { editor: Editor; env: LinkEnv; onClose: () => void }) {
  const first = useRef(editor.state.selection);
  const range = first.current.empty ? linkRange(editor, first.current.from) : null;
  const current = (editor.getAttributes("link").href as string | undefined) ?? "";
  const target = current ? targetOf(current) : null;
  const [tab, setTab] = useState<Tab>(target?.kind === "heading" ? "heading" : target?.kind === "doc" ? "doc" : "web");
  const [href, setHref] = useState(target?.kind === "web" ? current : "");
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const bare = first.current.empty && !range;
  const at = placeAt(editor, editor.view.coordsAtPos(range ? range.from : first.current.from));
  useEffect(() => input.current?.focus(), [tab]);

  const apply = (to: string, label: string) => {
    const chain = editor.chain().focus();
    if (bare) chain.insertContent({ type: "text", text: text.trim() || label, marks: [{ type: "link", attrs: { href: to } }] }).run();
    else if (range) chain.setTextSelection(range).setLink({ href: to }).run();
    else chain.extendMarkRange("link").setLink({ href: to }).run();
    onClose();
  };
  const remove = () => {
    const chain = editor.chain().focus();
    if (range) chain.setTextSelection(range);
    chain.extendMarkRange("link").unsetLink().run();
    onClose();
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const clean = cleanHref(href);
    if (!href.trim()) return current ? remove() : onClose();
    if (!clean) return setError(t("Links go to web pages (https://…) or email addresses."));
    apply(clean, clean.replace(/^(https?:\/\/|mailto:)/i, ""));
  };
  const chooseHeading = (pos: number, label: string) => {
    const node = editor.state.doc.nodeAt(pos);
    if (!node) return;
    let anchor = node.attrs.anchor as string | null;
    if (!anchor) {
      anchor = newId();
      editor.view.dispatch(editor.state.tr.setNodeAttribute(pos, "anchor", anchor));
    }
    apply(`#${anchor}`, label);
  };
  const headings = tab === "heading" ? headingsOf(editor.state.doc).filter((h) => h.text.toLowerCase().includes(query.trim().toLowerCase())) : [];
  const docs = useQuery({
    queryKey: ["docs", "link-search", query.trim()],
    enabled: tab === "doc",
    staleTime: 30_000,
    queryFn: async ({ signal }) => {
      const r = query.trim()
        ? await api.get<{ items: DocItem[] }>("/api/app/drive/search", { query: query.trim(), live: true, limit: 20, sort: "modified" }, signal)
        : await api.get<{ items: DocItem[] }>("/api/app/drive/recent", { live: true, limit: 20 }, signal);
      return r.items.filter((i) => isDocument(i) && i.id !== env.file);
    },
  });
  if (!at) return null;
  const tabs: [Tab, string][] = [
    ["web", t("Web address")],
    ["heading", t("Heading")],
    ["doc", t("Document")],
  ];
  return (
    <div className="doc-linkpanel" role="dialog" aria-label={current ? t("Edit link") : t("Add a link")} style={{ insetBlockStart: at.top, insetInlineStart: at.inline }} onKeyDown={(e) => e.key === "Escape" && (e.preventDefault(), e.stopPropagation(), onClose(), editor.commands.focus())}>
      <div className="doc-linkpanel-tabs" role="group" aria-label={t("What to link to")} style={{ display: "flex", gap: 4 }}>
        {tabs.map(([id, label]) => (
          <Button key={id} size="sm" variant={tab === id ? "primary" : "default"} aria-pressed={tab === id} onClick={() => (setTab(id), setError(null))}>
            {label}
          </Button>
        ))}
      </div>
      {bare && <input className="input" aria-label={t("Text to show")} placeholder={t("Text to show")} value={text} onChange={(e) => setText(e.target.value)} />}
      {tab === "web" ? (
        <form onSubmit={submit} className="stack" style={{ gap: 8 }}>
          <input ref={input} className="input" type="text" inputMode="url" aria-label={t("Address")} placeholder="https://example.com" value={href} aria-invalid={!!error || undefined} onChange={(e) => setHref(e.target.value)} />
          {error && <div className="doc-linkpanel-hint" role="alert">{error}</div>}
          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
            {current && (
              <Button type="button" variant="danger" size="sm" onClick={remove}>
                {t("Remove link")}
              </Button>
            )}
            <Button type="submit" variant="primary" size="sm">
              {t("Apply")}
            </Button>
          </div>
        </form>
      ) : (
        <>
          <input ref={input} className="input" type="search" aria-label={tab === "heading" ? t("Find a heading") : t("Find a document by its title")} placeholder={tab === "heading" ? t("Find a heading") : t("Find a document by its title")} value={query} onChange={(e) => setQuery(e.target.value)} />
          <ul className="doc-linkpanel-list" aria-label={tab === "heading" ? t("Headings in this document") : t("Documents")}>
            {tab === "heading" &&
              headings.map((h) => (
                <li key={h.pos}>
                  <button type="button" style={{ paddingInlineStart: 8 + (h.level - 1) * 10 }} onClick={() => chooseHeading(h.pos, h.text)}>
                    {isolate(h.text)}
                  </button>
                </li>
              ))}
            {tab === "doc" &&
              (docs.data ?? []).map((d) => (
                <li key={d.id}>
                  <button type="button" onClick={() => apply(docHref(d.id), docTitle(d.name))}>
                    {isolate(docTitle(d.name))}
                  </button>
                </li>
              ))}
          </ul>
          {tab === "doc" && docs.isFetching && <Spinner />}
          {((tab === "heading" && !headings.length) || (tab === "doc" && !docs.isFetching && !(docs.data ?? []).length)) && <div className="doc-linkpanel-hint">{tab === "heading" ? t("No headings yet: make a heading first.") : t("No documents found.")}</div>}
          {current && (
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <Button size="sm" variant="danger" onClick={remove}>
                {t("Remove link")}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** What a link goes to, in words. */
function Where({ editor, href }: { editor: Editor; href: string }) {
  const target = targetOf(href);
  const doc = useQuery({
    queryKey: ["drive", "item", target.kind === "doc" ? target.id : null],
    enabled: target.kind === "doc",
    retry: false,
    queryFn: ({ signal }) => api.get<{ name: string }>("/api/app/drive/item_info", { item: (target as { id: string }).id }, signal),
  });
  if (target.kind === "heading") {
    const h = headingByAnchor(editor.state.doc, target.anchor);
    return <span className="doc-linkcard-target">{h ? isolate(t("Heading: {text}", { text: h.text })) : t("This heading is no longer in the document")}</span>;
  }
  if (target.kind === "doc") return <span className="doc-linkcard-target">{doc.data ? isolate(t("Document: {title}", { title: docTitle(doc.data.name) })) : doc.isError ? t("A document you cannot open") : t("Document")}</span>;
  return (
    <span className="doc-linkcard-target" dir="ltr">
      {href}
    </span>
  );
}

/** The card over a link: while the pointer is on it or the caret is in it. */
export function LinkCard({ editor, env, editable, edit }: { editor: Editor; env: LinkEnv; editable: boolean; edit: () => void }) {
  const caret = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const s = e.state.selection;
      if (!s.empty || !e.isActive("link")) return null;
      const r = linkRange(e, s.from);
      return r ? { href: e.getAttributes("link").href as string, from: r.from, to: r.to } : null;
    },
    equalityFn: (a, b) => a?.href === b?.href && a?.from === b?.from && a?.to === b?.to,
  });
  const [hover, setHover] = useState<{ href: string; from: number; to: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    const dom = editor.view.dom;
    const over = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest<HTMLAnchorElement>("a[href]");
      clearTimeout(timer.current);
      if (!a) return void (timer.current = setTimeout(() => setHover(null), 350));
      timer.current = setTimeout(() => {
        try {
          const pos = editor.view.posAtDOM(a, 0);
          const r = linkRange(editor, pos + 1) ?? linkRange(editor, pos);
          if (r) setHover({ href: a.getAttribute("href") ?? "", from: r.from, to: r.to });
        } catch {
          setHover(null);
        }
      }, 250);
    };
    dom.addEventListener("mouseover", over);
    return () => {
      dom.removeEventListener("mouseover", over);
      clearTimeout(timer.current);
    };
  }, [editor]);
  const shown = hover ?? caret;
  if (!shown || editor.isDestroyed || shown.to > editor.state.doc.content.size) return null;
  const rect = editor.view.coordsAtPos(shown.from);
  const at = placeAt(editor, { ...rect, bottom: rect.bottom + 2 });
  if (!at) return null;
  const target = targetOf(shown.href);
  const open = () => {
    if (target.kind === "heading") {
      const h = headingByAnchor(editor.state.doc, target.anchor);
      if (h) goTo(editor.view, h.pos);
    } else if (target.kind === "doc") env.openDoc(target.id);
    else window.open(shown.href, "_blank", "noopener,noreferrer");
  };
  return (
    <div className="doc-linkcard" role="group" aria-label={t("Link")} style={{ insetBlockStart: at.top, insetInlineStart: at.inline }} onMouseEnter={() => clearTimeout(timer.current)} onMouseLeave={() => (timer.current = setTimeout(() => setHover(null), 350))}>
      <Where editor={editor} href={shown.href} />
      <Button size="sm" onClick={open}>
        {t("Open")}
      </Button>
      {editable && (
        <>
          <Button
            size="sm"
            onClick={() => {
              editor.chain().focus().setTextSelection(Math.min(shown.from + 1, shown.to)).run();
              setHover(null);
              edit();
            }}
          >
            {t("Edit")}
          </Button>
          <Button
            size="sm"
            variant="danger"
            onClick={() => {
              editor.chain().focus().setTextSelection({ from: shown.from, to: shown.to }).unsetLink().run();
              setHover(null);
            }}
          >
            {t("Remove")}
          </Button>
        </>
      )}
    </div>
  );
}
