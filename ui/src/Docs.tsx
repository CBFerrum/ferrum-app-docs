// `/docs/`: documents people write together (the Docs app, over Drive's documents edited live).
// Start one blank, from a template or from a Word or Markdown file (also dropped on the page); find
// yours: recent, shared with you, starred, all, in your folders and your teams', or by what they
// say (Drive's search, which shows where it found the words). What is shown lives in the address:
// the list, the folder, the search and its filters, so a link brings someone to the same page.

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Folder, MoreHorizontal, Star, Upload } from "lucide-react";
import { type DragEvent, type FormEvent, useCallback, useEffect, useId, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { api, errorMessage, formatDateTime, relativeTime, shell, t as tr, isolate } from "@ferrum/client";
import { Badge, EmptyState, ErrorState, FamilyNav, Icon, Menu, MenuItem, Spinner, confirmDialog, toast, useCanIntent, useDebounced, useLiveEntity, useShellTitle } from "@ferrum/kit";
import { can, useMe, useMetaIndex, usePeople } from "@ferrum/records";
import { CHANGES, type DocItem, OWNERS, SORTS, VIEWS, carriesFiles, changedFrom, isDocument, isFolder, narrow, ordered, ownerName, pick } from "./docslist";
import { allows, docTitle, snippetParts } from "./livedocs";
import { presenceLabel, useFilesPresence } from "./presence";
import "./docs.css";

interface Template {
  id: string;
  name: string;
  category?: string | null;
  description?: string | null;
}

/** What a list of Drive gave: its items, and for a folder where it is. */
interface Listing {
  items: DocItem[];
  folder?: { id: string; name: string; permission: string };
  crumbs?: { id: string; name: string }[];
  /** There are more than were asked for. */
  more?: boolean;
}

export function DocsPage() {
  useShellTitle(tr("Docs"));
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const id = useId();
  const me = useMe().data?.user.email;
  const people = usePeople().data?.users ?? [];
  const canShare = useCanIntent("share", "file");
  const view = pick(VIEWS, params.get("view"));
  const folderId = params.get("folder");
  const query = params.get("q") ?? "";
  const owner = pick(OWNERS, params.get("owner"));
  const changed = pick(CHANGES, params.get("changed"));
  const sort = pick(SORTS, params.get("sort"));
  const filtered = owner !== "any" || changed !== "any";
  const [typed, setTyped] = useState(query);
  const [busy, setBusy] = useState<string | null>(null);
  // Files held over the page: enters and leaves of its parts are counted, to know when they are out.
  const over = useRef(0);
  const [dragging, setDragging] = useState(false);
  const chooser = useRef<HTMLInputElement>(null);
  const meta = useMetaIndex().data;
  const manages = !!meta?.entities.some((e) => e.name === "DocsTemplate" && can(e.permissions, "create"));

  /** Changes what the address says (a value that is the default is left out); filters and searches
   *  replace the page in history, moving to another list or folder adds to it. */
  const set = (change: Record<string, string | null>, replace = false) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(change)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    setParams(p, { replace });
  };
  // Typing searches after a short pause; a link or the back button brings its own words.
  const pause = useDebounced(typed.trim(), 350);
  useEffect(() => {
    if (pause !== query) set({ q: pause || null }, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pause]);
  useEffect(() => setTyped(query), [query]);

  const space = useQuery({
    queryKey: ["drive", "space"],
    queryFn: ({ signal }) => api.get<{ id: string; root_folder: string }>("/api/app/drive/space", undefined, signal),
  });
  const teams = useQuery({
    queryKey: ["drive", "teams"],
    queryFn: ({ signal }) => api.get<{ teams: { id: string; name: string }[] }>("/api/app/drive/usage", undefined, signal).then((r) => r.teams),
  });
  const templates = useQuery({
    queryKey: ["docs", "templates"],
    queryFn: ({ signal }) =>
      api
        .get<{ rows: Template[] }>(
          "/api/v1/DocsTemplate",
          { filters: JSON.stringify([["is_active", "=", true]]), sort: "sort_order asc", fields: "name,category,description", limit: 50 },
          signal,
        )
        .then((r) => r.rows),
  });
  const listKey = ["docs", "list", { view, folderId, query, owner, changed, sort }];
  const docs = useQuery({
    queryKey: listKey,
    // A search narrowed to "mine" needs to know who that is.
    enabled: owner !== "me" || !!me,
    queryFn: async ({ signal }): Promise<Listing> => {
      const from = changedFrom(changed);
      const narrowed = { owner: owner === "me" ? me : undefined, modified_from: from };
      if (query || (!folderId && view === "all")) {
        const r = await api.get<{ items: DocItem[]; has_more: boolean }>(
          "/api/app/drive/search",
          { query: query || undefined, live: true, folder: folderId ?? undefined, sort: sort === "name" ? "name" : "modified", limit: query ? 50 : 100, ...narrowed },
          signal,
        );
        return { items: r.items, more: r.has_more };
      }
      if (folderId) {
        const r = await api.get<{ items: DocItem[]; folder: Listing["folder"]; breadcrumbs: Listing["crumbs"]; total: number; limit: number }>(
          "/api/app/drive/list_folder",
          { folder: folderId, limit: 200, sort: sort === "changed" ? "modified" : "name", order: sort === "changed" ? "desc" : "asc" },
          signal,
        );
        return { items: r.items, folder: r.folder, crumbs: r.breadcrumbs, more: r.total > r.limit };
      }
      const path = view === "shared" ? "shared_with_me" : view === "starred" ? "starred" : "recent";
      const r = await api.get<{ items: DocItem[] }>(`/api/app/drive/${path}`, { live: true, ...(view === "recent" ? { limit: 50 } : {}) }, signal);
      return { items: r.items };
    },
    // Fresh on every visit: coming back from a document shows what changed.
    staleTime: 0,
  });
  useLiveEntity("DriveFile", useCallback(() => void qc.invalidateQueries({ queryKey: ["docs", "list"] }), [qc]));

  const listing = docs.data;
  const shown = ordered(narrow((listing?.items ?? []).filter((i) => isDocument(i) || isFolder(i)), { owner, changed, me }), sort);
  // In a folder, its folders come first.
  const rows = folderId ? [...shown.filter(isFolder), ...shown.filter((i) => !isFolder(i))] : shown.filter((i) => !isFolder(i));
  const present = useFilesPresence(rows.filter((r) => !isFolder(r)).map((r) => r.id)).data ?? {};
  const inFolder = folderId ? listing?.folder : undefined;
  const mayCreate = !inFolder || allows(inFolder.permission, "Edit");

  const act = (action: string, body: Record<string, unknown>) => api.post<{ id: string }>(`/api/v1/DriveSpace/${space.data?.id}/actions/${action}`, body);
  const open = (made: { id: string }) => navigate(`/d/${made.id}`, { state: { from: "docs" } });
  const create = async (template: Template | null) => {
    setBusy(template?.id ?? "blank");
    try {
      open(
        template
          ? await api.post<{ id: string }>(`/api/v1/DocsTemplate/${template.id}/actions/create_document`, folderId ? { folder: folderId } : {})
          : await api.post<{ id: string }>("/api/app/drive/new", undefined, { query: { kind: "fdoc", folder: folderId } }),
      );
    } catch (e) {
      toast(errorMessage(e), "error");
      setBusy(null);
    }
  };
  /** A document from each Word or Markdown file: one opens at once, several are added to the list. */
  const importFiles = async (files: File[]) => {
    if (!files.length || busy) return;
    if (!space.data) return toast(tr("Docs is still loading: try again in a moment"), "info");
    if (!mayCreate) return toast(tr("You can only read this folder: open one of yours to import into"), "error");
    setBusy("import");
    const made: { id: string }[] = [];
    try {
      const { importFile } = await import("./importing");
      for (const f of files) {
        try {
          const doc = await importFile(f);
          made.push(await act("create_document", { title: doc.title, markdown: doc.markdown, ...(folderId ? { folder: folderId } : {}) }));
          for (const note of doc.notes) toast(`“${f.name}”: ${note}`, "info");
        } catch (e) {
          toast(tr("“{name}” was not imported. {e}", { name: f.name, e: errorMessage(e) }), "error");
        }
      }
    } catch (e) {
      toast(errorMessage(e), "error");
    }
    setBusy(null);
    if (made.length === 1) open(made[0]!);
    else if (made.length) {
      toast(tr("Imported {length} documents", { length: made.length }));
      void qc.invalidateQueries({ queryKey: ["docs", "list"] });
    }
  };
  const drop = (e: DragEvent) => {
    if (!carriesFiles(e.dataTransfer.types)) return;
    e.preventDefault();
    over.current = 0;
    setDragging(false);
    void importFiles(Array.from(e.dataTransfer.files));
  };

  /** The list with this item changed, now; the server's answer follows. */
  const patch = (fn: (items: DocItem[]) => DocItem[]) => qc.setQueryData<Listing>(listKey, (d) => d && { ...d, items: fn(d.items) });
  const star = async (d: DocItem) => {
    const on = !d.starred;
    patch((items) => (on || view !== "starred" || folderId || query ? items.map((i) => (i.id === d.id ? { ...i, starred: on } : i)) : items.filter((i) => i.id !== d.id)));
    try {
      await act(on ? "star" : "unstar", { item: d.id });
    } catch (e) {
      toast(errorMessage(e), "error");
      void qc.invalidateQueries({ queryKey: ["docs", "list"] });
    }
  };
  const trash = async (d: DocItem) => {
    const ok = await confirmDialog({ title: tr("Move “{value}” to the trash?", { value: docTitle(d.name) }), message: tr("It leaves your lists. Drive keeps it in the trash for a while, where it can be restored."), confirmLabel: tr("Move to the trash"), danger: true });
    if (!ok) return;
    patch((items) => items.filter((i) => i.id !== d.id));
    try {
      await act("trash", { item: d.id });
      toast(tr("Moved to the trash"));
    } catch (e) {
      toast(errorMessage(e), "error");
      void qc.invalidateQueries({ queryKey: ["docs", "list"] });
    }
  };

  const clear = () => set({ q: null, owner: null, changed: null, sort: null }, true);
  const where = inFolder ? `in “${inFolder.name}”` : "";
  const heading = query ? tr("Documents matching “{query}”", { query }) : folderId ? (inFolder ? inFolder.name : tr("Folder")) : VIEWS.find((v) => v.id === view)!.label;
  // The folder a rail entry opens, and whether the page is inside it.
  const top = listing?.crumbs?.[0]?.id ?? folderId;
  /** The address of another list or folder: the choices stay, the search goes. */
  const to = (change: Record<string, string | null>) => {
    const p = new URLSearchParams(params);
    p.delete("q");
    for (const [k, v] of Object.entries(change)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    return `?${p}`;
  };
  const railLink = (label: string, change: Record<string, string | null>, active: boolean, icon: "view" | "folder") => (
    <li key={label + (change.folder ?? change.view ?? "")}>
      <Link to={to(change)} className="docs-rail-item" aria-current={active ? "page" : undefined}>
        {icon === "folder" ? <Folder size={16} aria-hidden /> : <FileText size={16} aria-hidden />}
        <span>{isolate(label)}</span>
      </Link>
    </li>
  );
  const submit = (e: FormEvent) => {
    e.preventDefault();
    set({ q: typed.trim() || null }, true);
  };
  const emptyTitle = query
    ? tr("No document matches “{query}”", { query })
    : filtered
      ? tr("No document matches these choices")
      : folderId
        ? tr("No documents in this folder")
        : view === "shared"
          ? tr("Nothing shared with you yet")
          : view === "starred"
            ? tr("No starred documents")
            : tr("No documents yet");

  return (
    <div
      className="docs-page"
      onDragEnter={(e) => {
        if (!carriesFiles(e.dataTransfer.types)) return;
        over.current++;
        setDragging(true);
      }}
      onDragOver={(e) => {
        if (!carriesFiles(e.dataTransfer.types)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={(e) => {
        if (!carriesFiles(e.dataTransfer.types)) return;
        over.current = Math.max(0, over.current - 1);
        if (!over.current) setDragging(false);
      }}
      onDrop={drop}
    >
      <FamilyNav />
      <div className="page-head">
        <h1 className="page-title">{tr("Docs")}</h1>
        {manages && (
          <a href="/open/DocsTemplate" className="btn btn-default btn-sm">
            {tr("Manage templates")}
          </a>
        )}
      </div>

      <section aria-labelledby={`${id}-start`}>
        <h2 id={`${id}-start`} className="docs-heading">
          {tr("Start a document")}{where && <span className="faint"> {isolate(where)}</span>}
        </h2>
        {!mayCreate && <p className="muted">{tr("You can only read this folder. Open one of yours to start a document.")}</p>}
        <div className="docs-gallery">
          <button type="button" className="docs-template docs-template-blank" disabled={!!busy || !mayCreate} onClick={() => void create(null)}>
            <span className="docs-template-sheet" aria-hidden>
              <Icon name="plus" size={20} />
            </span>
            <span className="docs-template-name">{busy === "blank" ? tr("Opening…") : tr("Blank document")}</span>
          </button>
          <button type="button" className="docs-template docs-template-blank" disabled={!!busy || !mayCreate} onClick={() => chooser.current?.click()} aria-label={tr("Import a Word or Markdown file as a new document")}>
            <span className="docs-template-sheet" aria-hidden>
              <Upload size={20} />
            </span>
            <span className="docs-template-name">{busy === "import" ? tr("Importing…") : tr("Import a file")}</span>
            <span className="faint docs-template-category">{tr("Word or Markdown")}</span>
          </button>
          {templates.data?.map((t) => (
            <button
              key={t.id}
              type="button"
              className="docs-template"
              disabled={!!busy || !mayCreate}
              title={t.description ?? undefined}
              onClick={() => void create(t)}
              aria-label={tr("New document from the template {name}{value}", { name: t.name, value: t.description ? `: ${t.description}` : "" })}
            >
              <span className="docs-template-sheet" aria-hidden>
                <span />
                <span />
                <span />
              </span>
              <span className="docs-template-name">{busy === t.id ? tr("Opening…") : t.name}</span>
              {t.category && <span className="faint docs-template-category">{isolate(t.category)}</span>}
            </button>
          ))}
        </div>
        {templates.error && <p className="muted">{tr("Templates are not available:")} {isolate(errorMessage(templates.error))}</p>}
        <input
          ref={chooser}
          type="file"
          hidden
          multiple
          accept=".docx,.md,.markdown,.txt,text/markdown,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = "";
            void importFiles(files);
          }}
        />
      </section>

      <div className="docs-browse">
        <nav className="docs-rail" aria-label={tr("Where your documents are")}>
          <ul>
            {VIEWS.map((v) => railLink(v.label, { view: v.id === "recent" ? null : v.id, folder: null }, !folderId && view === v.id, "view"))}
          </ul>
          <h2 className="docs-rail-title">{tr("Folders")}</h2>
          <ul>
            {space.data && railLink("My documents", { folder: space.data.root_folder, view: null }, !!top && top === space.data.root_folder, "folder")}
            {teams.data?.map((t) => railLink(t.name, { folder: t.id, view: null }, top === t.id, "folder"))}
          </ul>
        </nav>

        <section className="docs-list-section" aria-labelledby={`${id}-list`}>
          <h2 id={`${id}-list`} className="docs-heading">
            {isolate(heading)}
          </h2>
          {inFolder && listing?.crumbs && (
            <nav aria-label={tr("Folder path")}>
              <ol className="docs-crumbs">
                {listing.crumbs.map((c, i) => (
                  <li key={c.id}>
                    {i === listing.crumbs!.length - 1 ? (
                      <span aria-current="page">{isolate(c.name)}</span>
                    ) : (
                      <Link className="docs-crumb" to={to({ folder: c.id })}>
                        {isolate(c.name)}
                      </Link>
                    )}
                  </li>
                ))}
              </ol>
            </nav>
          )}
          <div className="docs-bar">
            <form role="search" className="docs-search" onSubmit={submit}>
              <label htmlFor={`${id}-q`} className="sr-only">
                {tr("Search documents")}
              </label>
              <input id={`${id}-q`} className="input" type="search" placeholder={folderId ? tr("Search this folder by title or words inside") : tr("Search by title or words inside")} value={typed} onChange={(e) => setTyped(e.target.value)} />
            </form>
            <div className="docs-chips" role="group" aria-label={tr("Narrow the list")}>
              <label className="docs-chip">
                <span>{tr("Owner")}</span>
                <select value={owner} onChange={(e) => set({ owner: e.target.value === "any" ? null : e.target.value }, true)}>
                  {OWNERS.map((o) => (
                    <option key={o.id} value={o.id}>
                      {isolate(o.label)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="docs-chip">
                <span>{tr("Changed")}</span>
                <select value={changed} onChange={(e) => set({ changed: e.target.value === "any" ? null : e.target.value }, true)}>
                  {CHANGES.map((o) => (
                    <option key={o.id} value={o.id}>
                      {isolate(o.label)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="docs-chip">
                <span>{tr("Order")}</span>
                <select value={sort} onChange={(e) => set({ sort: e.target.value === "default" ? null : e.target.value }, true)}>
                  {SORTS.map((o) => (
                    <option key={o.id} value={o.id}>
                      {isolate(o.label)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
          {docs.error ? (
            <ErrorState error={docs.error} title={tr("Documents are not available")} onRetry={() => void docs.refetch()} />
          ) : !docs.data ? (
            <Spinner label={tr("Loading documents")} />
          ) : !rows.length ? (
            <EmptyState title={emptyTitle} icon="file">
              {query || filtered ? (
                <button type="button" className="btn btn-default btn-sm" onClick={clear}>
                  {tr("Clear the search and choices")}
                </button>
              ) : view === "starred" && !folderId ? (
                <p className="muted">{tr("Star a document to find it here again.")}</p>
              ) : mayCreate ? (
                <p className="muted">{tr("Start one above, blank, from a template or from a file.")}</p>
              ) : null}
            </EmptyState>
          ) : (
            <>
              <ul className="docs-list" aria-label={heading}>
                {rows.map((d) => {
                  const folder = isFolder(d);
                  const here = present[d.id] ?? [];
                  const title = folder ? d.name : docTitle(d.name);
                  const who = ownerName(d.shared_by ?? d.owner, me, people);
                  return (
                    <li key={d.id} className="docs-row">
                      {folder ? <Folder aria-hidden size={20} className="docs-row-icon" /> : <FileText aria-hidden size={20} className="docs-row-icon" />}
                      <div className="docs-row-main">
                        {folder ? (
                          <Link to={to({ folder: d.id })} className="docs-title">
                            {isolate(title)}
                          </Link>
                        ) : (
                          <Link to={`/d/${d.id}`} state={{ from: "docs" }} className="docs-title">
                            {isolate(title)}
                          </Link>
                        )}
                        {d.is_team && <Badge>{tr("Team folder")}</Badge>}
                        {here.length > 0 && (
                          <Badge tone="green" title={presenceLabel(here)}>
                            {isolate(presenceLabel(here))}
                          </Badge>
                        )}
                        {!folder && (d.permission === "View" || d.permission === "Comment") ? <Badge>{tr("View only")}</Badge> : null}
                      </div>
                      {d.snippet && (
                        <p className="docs-snippet">
                          {snippetParts(d.snippet).map((p, i) => (p.hit ? <mark key={i}>{isolate(p.text)}</mark> : <span key={i}>{isolate(p.text)}</span>))}
                        </p>
                      )}
                      <div className="faint docs-meta">
                        {folder ? tr("Folder") : `${d.shared_by ? "Shared by " : ""}${who}${who ? " · " : ""}`}
                        {!folder && (
                          <time dateTime={d.modified_at} title={formatDateTime(d.modified_at)}>
                            {tr("Changed")} {isolate(relativeTime(d.modified_at))}
                          </time>
                        )}
                        {!folder && d.modified_by ? tr(" by {value}", { value: ownerName(d.modified_by, me, people) }) : ""}
                        {d.path && query ? ` · ${d.path}` : ""}
                      </div>
                      {!folder && (
                        <div className="docs-row-actions">
                          <button type="button" className="docs-icon-btn" aria-pressed={!!d.starred} aria-label={d.starred ? tr("Remove the star from {title}", { title }) : tr("Star {title}", { title })} title={d.starred ? tr("Starred") : tr("Star")} onClick={() => void star(d)}>
                            <Star size={16} aria-hidden fill={d.starred ? "currentColor" : "none"} />
                          </button>
                          <Menu ariaLabel={`Actions for ${title}`} label={<MoreHorizontal size={16} aria-hidden />} buttonClass="docs-icon-btn">
                            {(close) => (
                              <>
                                <MenuItem
                                  onSelect={() => {
                                    close();
                                    navigate(`/d/${d.id}`, { state: { from: "docs" } });
                                  }}
                                >
                                  {tr("Open")}
                                </MenuItem>
                                <MenuItem
                                  onSelect={() => {
                                    close();
                                    navigate(`/d/${d.id}/history`);
                                  }}
                                >
                                  {tr("Version history")}
                                </MenuItem>
                                {canShare && allows(d.permission, "Manage") && (
                                  <MenuItem
                                    onSelect={() => {
                                      close();
                                      void shell()
                                        .intent({ action: "share", type: "file", data: { id: d.id, name: d.name } })
                                        .catch((e: unknown) => toast(errorMessage(e), "error"));
                                    }}
                                  >
                                    {tr("Share…")}
                                  </MenuItem>
                                )}
                                {allows(d.permission, "Edit") && (
                                  <MenuItem
                                    danger
                                    onSelect={() => {
                                      close();
                                      void trash(d);
                                    }}
                                  >
                                    {tr("Move to the trash")}
                                  </MenuItem>
                                )}
                              </>
                            )}
                          </Menu>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
              {listing?.more && <p className="muted docs-more">{tr("Only the first {length} are shown. Search, or narrow the list, to find the rest.", { length: rows.length })}</p>}
            </>
          )}
        </section>
      </div>

      {dragging && (
        <div className="docs-drop" aria-hidden>
          <div className="docs-drop-box">
            <Upload size={28} />
            <strong>{tr("Drop a Word or Markdown file to make a document from it")}</strong>
          </div>
        </div>
      )}
    </div>
  );
}

/** `/docs/new` (the bar's Create menu): a blank document, then its editor. */
export function NewDocument() {
  const navigate = useNavigate();
  const started = useRef(false);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const start = () =>
      api.post<{ id: string }>("/api/app/drive/new", undefined, { query: { kind: "fdoc" } }).then(
        (made) => navigate(`/d/${made.id}`, { replace: true, state: { from: "docs" } }),
        (e: unknown) => setError(e),
      );
    // A page the browser renders ahead of a click creates nothing until it is shown.
    const ahead = (document as Document & { prerendering?: boolean }).prerendering;
    if (ahead) document.addEventListener("prerenderingchange", () => void start(), { once: true });
    else void start();
  }, [navigate]);
  if (error) return <ErrorState error={error} title={tr("The document could not be started")} />;
  return <Spinner label={tr("Starting a document")} />;
}
