// `/docs/d/:file/history`: a document's versions, read. The list of versions is on one side; beside
// the version chosen is the one it is compared with (the version before it, the text now, or any
// other), the words that changed marked in both, and a way to step from change to change. A version
// of a live document is restored as a copy beside it, never over it: its editors hold the current
// text, and the copy loses nothing of theirs.
//
// Drive keeps the versions (`list_versions`, and each version's content from `files/{id}/content`);
// the page draws them with the editor's own schema, read only.

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getSchema } from "@tiptap/core";
import type { Node as PMNode, Schema } from "@tiptap/pm/model";
import { EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet, EditorView } from "@tiptap/pm/view";
import { yDocToProsemirrorJSON } from "@tiptap/y-tiptap";
import { ArrowLeft, ChevronDown, ChevronUp } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import * as Y from "yjs";
import { api, download, errorMessage, fetchBlob, formatDateTime, relativeTime, t, isolate } from "@ferrum/client";
import { Alert, Badge, Button, EmptyState, ErrorState, Menu, MenuItem, Spinner, toast, useShellTitle } from "@ferrum/kit";
import { usePeople } from "@ferrum/records";
import { type Range, compare } from "./compare";
import { type ItemInfo, allows, docTitle } from "./livedocs";
import { documentExtensions } from "./schema";
import { type Version, type Which, chosen, fileSize, parseAgainst, sideName, sides, summary } from "./versions";
import "./livedoc.css";

/** The text of a version (or of the document now) as ProseMirror JSON, read from the Yjs state Drive
 *  keeps. Versions never change, so they are kept for the visit. */
function useText(file: string, which: Which | null) {
  return useQuery({
    queryKey: ["docs", "version-text", file, which],
    enabled: which !== null && which !== "start",
    staleTime: which === "current" ? 0 : Infinity,
    queryFn: async ({ signal }): Promise<unknown> => {
      const path = `/api/app/drive/files/${encodeURIComponent(file)}/content${typeof which === "number" ? `?version=${which}` : ""}`;
      const bytes = new Uint8Array(await (await fetchBlob(path, signal)).arrayBuffer());
      const shared = new Y.Doc();
      // A document nobody has typed in yet is an empty file.
      if (bytes.length) Y.applyUpdate(shared, bytes);
      return yDocToProsemirrorJSON(shared, "default");
    },
  });
}

/** No places to mark (one array, so a page is not drawn again for want of a new one). */
const NONE: Range[] = [];

function asDoc(schema: Schema, json: unknown): PMNode {
  const doc = schema.nodeFromJSON(json);
  return doc.childCount ? doc : schema.topNodeType.createAndFill()!;
}

/** A page of a version, read only, with the words that differ marked. */
function Page({ doc, marks, kind, at, label }: { doc: PMNode; marks: Range[]; kind: "removed" | "added"; at: number | null; label: string }) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const decorations = DecorationSet.create(
      doc,
      marks.filter((r) => r.to > r.from).map((r) => Decoration.inline(r.from, r.to, { class: `doc-diff doc-diff-${kind}` })),
    );
    const v = new EditorView(el, { state: EditorState.create({ doc }), editable: () => false, attributes: { class: "doc-body" }, decorations: () => decorations });
    view.current = v;
    return () => {
      v.destroy();
      view.current = null;
    };
  }, [doc, marks, kind]);
  // The change in view comes to the middle of the page (and not further than the page's own scroll).
  useEffect(() => {
    const v = view.current;
    if (!v || at === null) return;
    try {
      const { node } = v.domAtPos(Math.min(at, v.state.doc.content.size));
      const el = node instanceof HTMLElement ? node : node.parentElement;
      const box = host.current;
      if (!el || !box) return;
      const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
      const top = el.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop - box.clientHeight / 3;
      box.scrollTo({ top: Math.max(0, top), behavior: calm ? "auto" : "smooth" });
    } catch {
      // A place that is not in the page: it stays where it is.
    }
  }, [at, doc, marks]);
  return <div className="doc-version-page" ref={host} tabIndex={0} role="region" aria-label={label} />;
}

export function HistoryPage() {
  const { file = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [step, setStep] = useState(0);
  const [narrow, setNarrow] = useState<"older" | "newer">("newer");
  const people = usePeople().data?.users ?? [];
  const info = useQuery({
    queryKey: ["drive", "item", file],
    queryFn: ({ signal }) => api.get<ItemInfo>("/api/app/drive/item_info", { item: file }, signal),
  });
  const space = useQuery({
    queryKey: ["drive", "space"],
    queryFn: ({ signal }) => api.get<{ id: string; root_folder: string }>("/api/app/drive/space", undefined, signal),
  });
  const list = useQuery({
    queryKey: ["docs", "versions", file],
    queryFn: ({ signal }) => api.get<{ versions: Version[] }>("/api/app/drive/list_versions", { file }, signal).then((r) => r.versions),
    // Versions are written while people edit: coming back shows the newest.
    staleTime: 0,
  });
  const title = info.data ? docTitle(info.data.name) : "";
  useShellTitle(title ? t("Version history: {title}", { title }) : t("Version history"));

  const versions = list.data ?? [];
  const version = chosen(versions, params.get("v"));
  const against = parseAgainst(params.get("with"));
  const pair = version ? sides(versions, version.version, against) : null;
  const olderText = useText(file, pair?.older ?? null);
  const newerText = useText(file, pair?.newer ?? null);
  const schema = useMemo(() => getSchema(documentExtensions(file)), [file]);
  const read = (w: Which | undefined, q: typeof olderText): { doc?: PMNode; error?: unknown; loading: boolean } => {
    if (w === undefined) return { loading: true };
    if (w === "start") return { doc: asDoc(schema, { type: "doc", content: [] }), loading: false };
    if (q.error) return { error: q.error, loading: false };
    if (!q.data) return { loading: true };
    try {
      return { doc: asDoc(schema, q.data), loading: false };
    } catch {
      return { error: new Error("It uses something this page cannot show."), loading: false };
    }
  };
  const older = useMemo(() => read(pair?.older, olderText), [pair?.older, olderText.data, olderText.error, schema]); // eslint-disable-line react-hooks/exhaustive-deps
  const newer = useMemo(() => read(pair?.newer, newerText), [pair?.newer, newerText.data, newerText.error, schema]); // eslint-disable-line react-hooks/exhaustive-deps
  const diff = useMemo(() => (older.doc && newer.doc ? compare(older.doc, newer.doc) : null), [older.doc, newer.doc]);
  const where = diff?.changes[Math.min(step, diff.changes.length - 1)];
  // A new comparison starts at its first change.
  const comparing = `${file}|${pair?.older}|${pair?.newer}`;
  useEffect(() => setStep(0), [comparing]);

  const name = (email: string | null) => people.find((p) => p.email.toLowerCase() === email?.toLowerCase())?.full_name || email || "Someone";
  const choose = (n: number) => setParams({ v: String(n), ...(against === "previous" ? {} : { with: String(against) }) }, { replace: true });
  const compareWith = (value: string) => setParams({ v: String(version?.version), ...(value === "previous" ? {} : { with: value }) }, { replace: true });
  const content = `/api/app/drive/files/${encodeURIComponent(file)}/content`;
  const save = async (format: "docx" | "pdf" | "html" | "txt") => {
    try {
      await download(content, `${title}.${format}`, { format, version: version?.version });
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  };
  const canRestore = !!info.data && allows(info.data.permission, "Edit") && !!space.data;
  const restore = async () => {
    if (!version || !space.data) return;
    try {
      const made = await api.post<{ id: string; name: string }>(`/api/v1/DriveSpace/${space.data.id}/actions/restore_version`, { file, version: version.version });
      void qc.invalidateQueries({ queryKey: ["drive"] });
      toast(t("Made “{value}” from version {version}", { value: docTitle(made.name), version: version.version }));
      navigate(`/d/${made.id}`, { state: { from: "docs" } });
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  };
  const when = (v: Version) => (
    <time dateTime={v.created_at} title={formatDateTime(v.created_at)}>
      {isolate(relativeTime(v.created_at))}
    </time>
  );
  const pageLabel = (w: Which | undefined) => {
    const v = typeof w === "number" ? versions.find((x) => x.version === w) : undefined;
    return v ? `${sideName(w!)}, ${name(v.author)}` : sideName(w ?? "start");
  };

  const back = (
    <Link className="btn btn-default btn-sm" to={`/d/${file}`} state={{ from: "docs" }}>
      <ArrowLeft size={16} aria-hidden /> {t("Back to the document")}
    </Link>
  );
  let body;
  if (list.error || info.error) {
    body = <ErrorState error={list.error ?? info.error} title={t("The versions could not be loaded")} onRetry={() => void Promise.all([list.refetch(), info.refetch()])} />;
  } else if (!list.data || !info.data) {
    body = <Spinner label={t("Loading the versions")} />;
  } else if (!version || !pair) {
    body = (
      <EmptyState title={t("No versions yet")} icon="file">
        <p className="muted">{t("A version is saved when the last person leaves the document, and every ten minutes while people type.")}</p>
      </EmptyState>
    );
  } else {
    const failed = older.error ?? newer.error;
    body = (
      <div className="doc-history-body">
        <nav className="doc-versions" aria-label={t("Versions")}>
          <ul>
            {versions.map((v) => (
              <li key={v.id}>
                <button type="button" className="doc-version" aria-current={v.version === version.version ? "true" : undefined} onClick={() => choose(v.version)}>
                  <span className="doc-version-name">
                    {t("Version {version}", { version: v.version })} {v.current && <Badge tone="blue">{t("Latest saved")}</Badge>}
                  </span>
                  <span className="doc-version-meta">
                    {when(v)} · {isolate(name(v.author))}
                  </span>
                  <span className="doc-version-meta">{isolate([v.comment, fileSize(v.size)].filter(Boolean).join(" · "))}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <section className="doc-compare" aria-label={t("{value} compared with {value2}", { value: sideName(pair.older), value2: sideName(pair.newer) })}>
          <div className="doc-compare-bar">
            <label className="doc-compare-with">
              <span>{t("Compare version {version} with", { version: version.version })}</span>
              <select className="input" value={against === "previous" || against === "current" ? against : String(against)} onChange={(e) => compareWith(e.target.value)}>
                <option value="previous">{t("The version before it")}</option>
                <option value="current">{t("The text now")}</option>
                {versions
                  .filter((v) => v.version !== version.version)
                  .map((v) => (
                    <option key={v.id} value={String(v.version)}>
                      {t("Version {version}", { version: v.version })}
                    </option>
                  ))}
              </select>
            </label>
            <div className="doc-compare-steps">
              <span role="status" aria-live="polite" className="doc-compare-count">
                {diff ? (diff.changes.length ? t("Change {value} of {length}", { value: Math.min(step, diff.changes.length - 1) + 1, length: diff.changes.length }) : t("No changes")) : ""}
              </span>
              <Button size="sm" aria-label={t("Previous change")} disabled={!diff || diff.changes.length < 2} onClick={() => setStep((s) => (s - 1 + diff!.changes.length) % diff!.changes.length)}>
                <ChevronUp size={16} aria-hidden />
              </Button>
              <Button size="sm" aria-label={t("Next change")} disabled={!diff || diff.changes.length < 2} onClick={() => setStep((s) => (s + 1) % diff!.changes.length)}>
                <ChevronDown size={16} aria-hidden />
              </Button>
            </div>
            <div className="doc-compare-actions">
              <Menu label={t("Download")} ariaLabel={`Download version ${version.version}`} buttonClass="btn btn-default btn-sm">
                {(close) => (
                  <>
                    {(
                      [
                        ["docx", "Word (.docx)"],
                        ["pdf", "PDF"],
                        ["html", "Web page (.html)"],
                        ["txt", "Text (.txt)"],
                      ] as const
                    ).map(([format, label]) => (
                      <MenuItem
                        key={format}
                        onSelect={() => {
                          close();
                          void save(format);
                        }}
                      >
                        {isolate(label)}
                      </MenuItem>
                    ))}
                  </>
                )}
              </Menu>
              <Button size="sm" variant="primary" disabled={!canRestore} title={canRestore ? t("Makes a new document from this version; the document keeps its text") : t("Restoring needs permission to edit the document")} onClick={() => void restore()}>
                {t("Restore as a copy")}
              </Button>
            </div>
          </div>
          <p className="doc-compare-summary">{diff ? summary(diff.wordsAdded, diff.wordsRemoved) : " "}</p>
          {failed ? (
            <Alert tone="error">{t("This version could not be opened:")} {isolate(errorMessage(failed))}</Alert>
          ) : (
            <>
              <div className="doc-pane-tabs" role="group" aria-label={t("Which page to show")}>
                <button type="button" className="btn btn-default btn-sm" aria-pressed={narrow === "older"} onClick={() => setNarrow("older")}>
                  {isolate(sideName(pair.older))}
                </button>
                <button type="button" className="btn btn-default btn-sm" aria-pressed={narrow === "newer"} onClick={() => setNarrow("newer")}>
                  {isolate(sideName(pair.newer))}
                </button>
              </div>
              <div className="doc-compare-panes" data-pane={narrow}>
                {(
                  [
                    ["older", pair.older, older, "removed", where?.older.from],
                    ["newer", pair.newer, newer, "added", where?.newer.from],
                  ] as const
                ).map(([side, w, text, kind, at]) => (
                  <div key={side} className={`doc-compare-pane doc-compare-${side}`}>
                    <h2 className="doc-compare-head">
                      {isolate(sideName(w))}
                      {typeof w === "number" && (
                        <span className="faint">
                          {isolate(" ")}
                          · {when(versions.find((v) => v.version === w)!)} · {isolate(name(versions.find((v) => v.version === w)!.author))}
                        </span>
                      )}
                    </h2>
                    {text.doc ? <Page doc={text.doc} marks={(kind === "removed" ? diff?.removed : diff?.added) ?? NONE} kind={kind} at={at ?? null} label={pageLabel(w)} /> : <Spinner label={t("Loading {value}", { value: sideName(w).toLowerCase() })} />}
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      </div>
    );
  }

  return (
    <div className="doc-history">
      <header className="doc-bar">
        {back}
        <h1 className="doc-history-title">
          {t("Version history")}{title && <span className="faint"> · {isolate(title)}</span>}
        </h1>
      </header>
      {body}
    </div>
  );
}
