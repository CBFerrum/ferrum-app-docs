// `/docs/d/:file`: a Drive document everyone with access edits at once (Ferrum
// docs/plan/collaboration.md, C3). TipTap on a Yjs document the platform keeps in sync (coedit.ts)
// with everyone's cursors; Drive keeps the file: who may open it, sharing, comments, versions and
// exports. Sharing is Drive's share dialog (the `share file` intent) and comments and history are
// Drive's panel beside the document (docs/plan/apps-ui.md §11.3, §11.4).

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Collaboration } from "@tiptap/extension-collaboration";
import { CollaborationCaret } from "@tiptap/extension-collaboration-caret";
import { CharacterCount, Placeholder } from "@tiptap/extensions";
import { getSchema } from "@tiptap/core";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import { ArrowLeft, TableOfContents } from "lucide-react";
import { Search } from "lucide-react";
import { type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, Suspense, lazy, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Link, useBlocker, useLocation, useNavigate, useParams } from "react-router";
import { ApiError, api, download, errorMessage, initials, saveBlob, shell, t, isolate } from "@ferrum/client";
import { Alert, Badge, Button, Dialog, Field, Menu, MenuItem, ReaderSkeleton, SaveStatus, type SaveState, StatePanel, announce, confirmDialog, toast, useCanIntent } from "@ferrum/kit";
import { can, useMe, useMetaIndex } from "@ferrum/records";
import { CoeditSession, type CoeditState, othersIn, socketUrl } from "./coedit";
import { CommentRail, type Draft, commentsQuery } from "./CommentRail";
import { DocComments, anchorOf, textThreads } from "./comments";
import { Contents } from "./Contents";
import { Find } from "./find";
import { FindBar } from "./FindBar";
import { IMAGE_TYPES, imageFiles } from "./image";
import { ImageBar, TableBar } from "./ContextBars";
import { remember, remembered } from "./local";
import { ColumnResize } from "./format";
import { PasteTidy, hasForeignImages, hasWords, localizeImages } from "./paste";
import { Toolbar } from "./Toolbar";
import { type Compat, checkFormat, formatOf, readFormat, stamp } from "./compat";
import { NewerFormat } from "./NewerFormat";
import { LinkCard, LinkPanel } from "./LinkTools";
import { PageRegion } from "./PageRegions";
import { StatusBar } from "./StatusBar";
import { dims, isUnset, paperFor, PRESETS, toPx, unitFor, writeSetup } from "./page";
import { goTo, insertFootnoteAndJump } from "./pages";
import { headingByAnchor, targetOf } from "./links";
import { usePageLayout, usePageSetup, usePrintStyle } from "./usePages";
import { addImages, uploadImage } from "./upload";
import { type ItemInfo, allows, docTitle } from "./livedocs";
import { openMention } from "./mention";
import { Menus } from "./menus";
import { EditorMenus, type MenuApi, NO_MENU, useMentionNotices } from "./EditorMenus";
import { usePresence } from "./presence";
import { documentExtensions } from "./schema";
import { Tips } from "./Tool";
import { Suggestions, refusalText, setSuggesting, suggestionsIn } from "./suggest";
import { DocKeys, type PageActions, pageKey } from "./keys";
import "./livedoc.css";

// The page setup dialog is loaded when somebody opens it.
const PageDialog = lazy(() => import("./PageDialog"));
// So is the list of keyboard shortcuts.
const ShortcutHelp = lazy(() => import("./ShortcutHelp"));

export { cleanHref } from "./links";

/** Drive's panel of a file's comments and history (a contextual side panel of Drive). */
const DETAILS_PANEL = "drive.details";

/** Whether a key was pressed in a field of the page other than the text and the find bar. */
function inOtherField(target: EventTarget | null): boolean {
  const el = target instanceof HTMLElement ? target : null;
  if (!el || el.closest(".doc-body, .doc-find")) return false;
  return el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
}

/** What the bar says about the document's connection and saving; `keeps`: the browser keeps
 *  unsaved changes beyond this tab. */
export function statusText(s: Pick<CoeditState, "online" | "loaded" | "unsaved" | "closed">, keeps = false): string {
  if (s.closed) return t("Not connected");
  if (!s.loaded) return t("Opening…");
  if (!s.online) return s.unsaved ? (keeps ? t("Offline: your changes are kept in this browser until the connection is back") : t("Offline: your changes are kept in this tab until the connection is back")) : t("Reconnecting…");
  return s.unsaved ? t("Saving…") : t("Saved");
}

/** The kit's save state for what the bar says, or null where the bar says something else (not
 *  connected, opening, reconnecting). Only "saved" once the server has stored everything; changes
 *  kept in this browser are "local", and changes held only in this tab are just unsaved. */
export function saveState(s: Pick<CoeditState, "online" | "loaded" | "unsaved" | "closed">, keeps = false): SaveState | null {
  if (s.closed || !s.loaded) return null;
  if (!s.online) return s.unsaved ? (keeps ? "local" : "draft") : null;
  return s.unsaved ? "saving" : "saved";
}

export function LiveDocPage() {
  const { file } = useParams();
  const [session, setSession] = useState<CoeditSession | null>(null);
  useEffect(() => {
    if (!file) return;
    // The socket's handshake carries the browser's session cookie.
    const s = new CoeditSession(socketUrl("drive", file), () => null);
    setSession(s);
    return () => {
      setSession(null);
      s.destroy();
    };
  }, [file]);
  const info = useQuery({
    queryKey: ["drive", "item", file],
    queryFn: ({ signal }) => api.get<ItemInfo>("/api/app/drive/item_info", { item: file }, signal),
    retry: false,
  });
  if (info.error) {
    return (
      <StatePanel
        kind={info.error instanceof ApiError && info.error.status === 403 ? "denied" : "failed"}
        title={t("This document cannot be opened")}
        error={info.error}
        onRetry={() => void info.refetch()}
        action={<a href="/drive/">{t("Go to Drive")}</a>}
      />
    );
  }
  if (!file || !session || !info.data) return <ReaderSkeleton />;
  return <LiveDoc key={file} file={file} session={session} info={info.data} />;
}

function LiveDoc({ file, session, info }: { file: string; session: CoeditSession; info: ItemInfo }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const state = useSyncExternalStore(session.subscribe, session.getState);
  const here = useHere(session);
  const space = useQuery({
    queryKey: ["drive", "space"],
    queryFn: ({ signal }) => api.get<{ id: string; root_folder: string }>("/api/app/drive/space", undefined, signal),
  });
  const [details, setDetails] = useState(() => shell().sidepanel.current() === "details");
  const [templating, setTemplating] = useState(false);
  const canShare = useCanIntent("share", "file");
  const location = useLocation();
  const meta = useMetaIndex().data;
  // Whether this client can read what is stored (compat.ts): checked once the content has arrived and before
  // the editor is bound to it, and again as others change it.
  const schema = useMemo(() => getSchema(documentExtensions(file)), [file]);
  const [recheck, setRecheck] = useState(0);
  const compat: Compat = useMemo(() => (state.loaded ? checkFormat(session.doc, schema) : { ok: true }), [state.loaded, recheck, session.doc, schema]);
  useEffect(() => {
    if (!state.loaded) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const later = () => {
      clearTimeout(timer);
      timer = setTimeout(() => setRecheck((n) => n + 1), 600);
    };
    session.doc.on("update", later);
    return () => {
      clearTimeout(timer);
      session.doc.off("update", later);
    };
  }, [state.loaded, session.doc]);
  const ready = state.loaded && compat.ok;
  const canWrite = ready && state.access === "write" && !state.closed;
  const title = docTitle(info.name);
  // The editor, for pasted and dropped images (its handlers are set when it is made).
  const current = useRef<Editor | null>(null);
  // A suggested paragraph or formatting change needs format 3 at once: a format 2 client would read it as a real change.
  // What the page does for the keys of keys.ts (filled below, once the page's functions exist).
  const pageKeys = useRef<PageActions>({ link: () => undefined, find: () => undefined, replace: () => undefined, comment: () => undefined, save: () => undefined, help: () => undefined });
  const [helping, setHelping] = useState(false);
  const tracked = useRef(() => undefined as void);
  tracked.current = () => stamp(session.doc, 3);
  // Whether the paste that is coming is the words alone (Ctrl or ⌘ Shift V).
  const plain = useRef(false);
  // Comments on the text: one being written, and the thread in view (a click in its text shows it).
  const [draft, setDraft] = useState<Draft | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const activate = useRef<(id: string | null) => void>(() => undefined);
  activate.current = setActive;
  // Suggesting: what this person types is proposed, signed with their name.
  const [suggesting, setMode] = useState(false);
  // The menus at the caret open while the text takes typing; the open one answers for the keys.
  const typing = useRef(false);
  typing.current = canWrite && !suggesting;
  const menu = useRef<MenuApi>(NO_MENU);
  const listId = useId();
  // Pictures are chosen from one hidden field, by the toolbar and by the `/` menu.
  const picker = useRef<HTMLInputElement>(null);
  const [adding, setAdding] = useState(false);
  // The contents beside the page (a choice the browser remembers), and find and replace above it.
  const [contents, setContents] = useState(() => remembered("docs.contents") === "1");
  const [finding, setFinding] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [findFocus, setFindFocus] = useState(0);
  // Links: the panel (Ctrl or ⌘ K), and opening another document from a link.
  const [linking, setLinking] = useState(false);
  const openDoc = useRef<(id: string) => void>(() => undefined);
  openDoc.current = (id) => navigate(`/d/${id}`);
  const [paging, setPaging] = useState(false);
  const setup = usePageSetup(session.doc);
  const paper = useRef<HTMLDivElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState(0);

  const made = useEditor(
    {
      editable: false,
      extensions: [
        ...documentExtensions(file),
        PasteTidy,
        ColumnResize,
        Placeholder.configure({ placeholder: t("Type / for blocks and @ to mention someone, or just start writing") }),
        DocComments.configure({ onActivate: (id) => activate.current(id) }),
        Suggestions.configure({ onRefused: (why) => toast(refusalText(why)), onTracked: () => tracked.current() }),
        Find,
        CharacterCount,
        DocKeys.configure({ page: pageKeys }),
        Menus.configure({ hooks: { enabled: () => typing.current, count: () => menu.current.count(), choose: (i) => menu.current.choose(i), listId } }),
        // Bound to the shared text only once it is known to be readable (compat.ts): binding is what projects it.
        ...(ready
          ? [
              Collaboration.configure({ document: session.doc, field: "default" }),
              // ui-lint-allow raw-color: fallback for a collaborator's own (server-chosen) cursor colour
              CollaborationCaret.configure({ provider: session, user: { name: "", color: "#64748b" } }),
            ]
          : []),
      ],
      editorProps: {
        // `data-ferrum-keys`: the platform's bar leaves Ctrl or ⌘ K to the text (the link panel).
        attributes: { class: "doc-body", "aria-label": t("{title}, document", { title }), spellcheck: "true", "data-ferrum-keys": "mod+k" },
        // Ctrl or ⌘ with Shift and V pastes the words alone: the editor does that itself, so what follows
        // (pictures in pasted text going up to Drive) stands aside. Every other key is in keys.ts.
        handleDOMEvents: {
          keydown: (_view, e) => {
            plain.current = (e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "v";
            return false;
          },
        },
        // Pictures pasted or dropped in go up to Drive and into the text; so do the pictures inside pasted
        // Word or Google Docs text, in the places they were. Word and Excel send a picture of the text
        // beside the text: the text wins.
        handlePaste: (view, event) => {
          const ed = current.current;
          const data = event.clipboardData;
          if (!ed || !data || plain.current) return false;
          const html = data.getData("text/html");
          const images = imageFiles(data.files);
          if (images.length && !hasWords(html) && !data.getData("text/plain").trim()) {
            event.preventDefault();
            void addImages(ed, file, images);
            return true;
          }
          if (html && hasForeignImages(html)) {
            event.preventDefault();
            void localizeImages(html, (f) => uploadImage(file, f)).then(({ html: kept, skipped }) => {
              if (skipped) toast(skipped === 1 ? t("1 picture in what you pasted could not be added: add it to the document as a file") : t("{n} pictures in what you pasted could not be added: add them to the document as files", { n: skipped }), "info");
              if (!view.isDestroyed) view.pasteHTML(kept);
            });
            return true;
          }
          return false;
        },
        handleDrop: (view, event, _slice, moved) => {
          const images = moved ? [] : imageFiles(event.dataTransfer?.files);
          const ed = current.current;
          if (!images.length || !ed) return false;
          event.preventDefault();
          const at = view.posAtCoords({ left: event.clientX, top: event.clientY });
          if (at) ed.commands.setTextSelection(at.pos);
          void addImages(ed, file, images);
          return true;
        },
        // Links and the records named in the text open with Ctrl or ⌘ held (a plain click places the
        // cursor in a link and selects a mention); where nothing is being edited, a click opens a record.
        handleClick: (view, _pos, event) => {
          const target = event.target as HTMLElement | null;
          const a = target?.closest("a[href]");
          if (a && (event.metaKey || event.ctrlKey || !view.editable)) {
            const href = a.getAttribute("href") ?? "";
            const to = targetOf(href);
            if (to.kind === "heading") {
              const h = headingByAnchor(view.state.doc, to.anchor);
              if (h) goTo(view, h.pos);
            } else if (to.kind === "doc") openDoc.current(to.id);
            else window.open(href, "_blank", "noopener,noreferrer");
            return true;
          }
          const m = target?.closest<HTMLElement>('[data-mention="record"]');
          if (m && (!view.editable || event.metaKey || event.ctrlKey)) return openMention({ kind: "record", id: m.dataset.id ?? null, entity: m.dataset.entity ?? null });
          return false;
        },
      },
    },
    [session, ready],
  );
  // An editor made before the content could be read has no shared binding: nothing is editable until the bound one is made.
  const bound = !!made && made.extensionManager.extensions.some((x) => x.name === "collaboration");
  const editor = ready && !bound ? null : made;
  const editable = canWrite && bound;
  useEffect(() => {
    current.current = editor;
  }, [editor]);
  useEffect(() => {
    if (editor && editor.isEditable !== editable) editor.setEditable(editable);
  }, [editor, editable]);
  useEffect(() => {
    if (editor && ready && state.me) editor.commands.updateUser({ name: state.me.name, color: state.me.color });
  }, [editor, ready, state.me]);

  // The page: as wide as the paper where the screen has room, else as wide as the screen. A new empty document
  // takes its person's usual paper (Letter for en-US, A4 elsewhere) the first time an editor opens it; a document
  // that never had a page keeps the A4 it has always been exported as.
  useEffect(() => {
    const el = paper.current;
    if (!el) return;
    const measure = () => {
      const cs = getComputedStyle(el);
      setRoom(el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    if (!editor || !editable || !state.loaded || !isUnset(session.doc) || session.doc.getXmlFragment("default").length > 0) return;
    const lang = navigator.language || document.documentElement.lang || "en";
    writeSetup(session.doc, { size: paperFor(lang), orientation: "portrait", ...PRESETS.normal, differentFirst: false });
  }, [editor, editable, state.loaded, session.doc]);
  const [pageW, pageH] = dims(setup).map(toPx) as [number, number];
  const real = room >= pageW;
  const printNow = usePrintStyle(session.doc, setup, title);
  const layout = usePageLayout(editor, sheet, setup, real, ready);
  // The first use of a format 2 feature raises the document's recorded format (compat.ts).
  useEffect(() => {
    if (!editor || !editable) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (editor.isDestroyed) return;
        const n = formatOf(editor.state.doc);
        if (readFormat(session.doc) < n) stamp(session.doc, n);
      }, 1000);
    };
    editor.on("update", check);
    check();
    return () => {
      clearTimeout(timer);
      editor.off("update", check);
    };
  }, [editor, editable, session.doc]);
  const unit = unitFor(navigator.language || document.documentElement.lang || "en");
  // Drive's lists show who has the file open.
  usePresence(file, state.loaded ? (state.access === "write" ? "edit" : "view") : null);

  // Leaving with changes the server has not stored yet, where the browser cannot keep them.
  const blocker = useBlocker(({ currentLocation, nextLocation }) => !session.keeps && state.unsaved && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => {
    if (blocker.state !== "blocked") return;
    void confirmDialog({
      title: t("Leave before your changes are saved?"),
      message: state.online ? t("Your latest changes are still being saved.") : t("You are offline: changes typed since the connection dropped are only in this tab."),
      confirmLabel: t("Leave"),
      danger: true,
    }).then((ok) => (ok ? blocker.proceed() : blocker.reset()));
  }, [blocker, state.online]);
  useEffect(() => {
    if (!state.unsaved || session.keeps) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [state.unsaved, session.keeps]);
  // The page's keys (keys.ts): find and replace stay the browser's while the person types in another field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = pageKey(e);
      if (!k || ((k.id === "find" || k.id === "replace") && inOtherField(e.target))) return;
      e.preventDefault();
      k.run?.(current.current as Editor, pageKeys.current);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  /** Ctrl or ⌘ S: said once, quietly, then only to screen readers. */
  const savedOnce = useRef(false);
  const saveKey = () => {
    const text = state.unsaved ? t("Saving: Docs saves as you type") : t("Saved: Docs saves as you type");
    if (savedOnce.current) return announce(text);
    savedOnce.current = true;
    toast(text, "info");
  };

  const act = (action: string, body: Record<string, unknown>) => api.post<{ id: string; mentioned?: string[] }>(`/api/v1/DriveSpace/${space.data?.id}/actions/${action}`, body);
  const content = `/api/app/drive/files/${file}/content`;
  const exportAs = async (format: "html" | "pdf" | "docx" | "txt") => {
    try {
      await download(content, `${title}.${format}`, { format });
      if (format === "txt") suggestionsNote();
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  };
  /** Text and Markdown carry the words only, so suggestions waiting show up as both the old and the new. */
  const suggestionsNote = () => {
    if (pending > 0) toast(t("{pending} {value} still waiting: the file has the words as suggested and as they were", { pending, value: pending === 1 ? t("suggestion is") : t("suggestions are") }), "info");
  };
  const exportMarkdown = async () => {
    try {
      const r = await api.get<{ content: string }>("/api/app/drive/read_document", { file, format: "markdown" });
      saveBlob(new Blob([r.content], { type: "text/markdown;charset=utf-8" }), `${title}.md`);
      suggestionsNote();
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  };
  /** Paste what the clipboard holds as plain words (the menu's own way; the keys are Ctrl or ⌘ Shift V). */
  const pastePlain = async () => {
    try {
      const words = await navigator.clipboard.readText();
      if (!words || !current.current) return;
      current.current.commands.focus();
      current.current.view.pasteText(words);
    } catch {
      toast(t("The browser did not allow reading the clipboard: press Ctrl+Shift+V (⌘⇧V on a Mac) to paste without formatting"), "info");
    }
  };
  const copy = async () => {
    try {
      const made = await act("copy", { item: file, to: info.parent, name: t("Copy of {name}", { name: info.name }) });
      toast(t("Copy made"));
      navigate(`/d/${made.id}`);
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  };
  const canEdit = allows(info.permission, "Edit");
  const canComment = allows(info.permission, "Comment") && !!space.data;
  const account = useMe().data;
  // People picked from `@` are told, by a comment, when they are still mentioned a few seconds on.
  const notified = useMentionNotices(editor, file, account?.user.email, space.data ? act : null, space.data ? `/api/v1/DriveSpace/${space.data.id}/actions/add_comment` : null);
  const pickImages = () => picker.current?.click();
  const addPictures = (files: File[]) => {
    if (!editor || !files.length) return;
    setAdding(true);
    void addImages(editor, file, files).finally(() => setAdding(false));
  };
  const selected = useEditorState({ editor, selector: ({ editor: e }) => !!e && !e.state.selection.empty }) ?? false;
  const threads = useQuery({ ...commentsQuery(file), enabled: state.loaded });
  useEffect(() => {
    if (editor && !editor.isDestroyed) editor.view.dispatch(setSuggesting(editor.state, suggesting && editable, state.me ? { id: state.me.id, name: state.me.name } : null));
  }, [editor, suggesting, editable, state.me]);
  const pending = useEditorState({ editor, selector: ({ editor: e }) => (e ? suggestionsIn(e.state.doc).length : 0) }) ?? 0;
  const railShown = !!draft || pending > 0 || textThreads(threads.data ?? []).length > 0;
  // The contents are drawn once the text is (the column is not made before).
  const tocShown = contents && !!editor && state.loaded;
  /** A comment on the selected words (Ctrl+Alt+M). */
  const startComment = () => {
    const a = editor ? anchorOf(editor.state) : null;
    if (!a) return toast(t("Select the words to comment on"));
    setActive(null);
    setDraft(a);
  };
  /** Opens find (and, when asked and allowed, replace), and puts the caret in its field. */
  const openFind = (withReplace: boolean) => {
    setFinding(true);
    setReplacing(withReplace && editable);
    setFindFocus((n) => n + 1);
  };
  pageKeys.current = {
    link: () => editable && setLinking(true),
    find: () => openFind(false),
    replace: () => openFind(true),
    comment: startComment,
    save: saveKey,
    help: () => setHelping(true),
  } as PageActions;
  const showContents = (on: boolean) => {
    setContents(on);
    remember("docs.contents", on ? "1" : "0");
  };
  // Back where the person came from: Docs, or the document's folder in Drive (another app's page).
  const fromDocs = (location.state as { from?: string } | null)?.from === "docs";
  const toDrive = info.parent ? `/drive/${encodeURIComponent(info.parent)}?item=${encodeURIComponent(file)}` : "/drive/";
  const keepsTemplates = !!meta?.entities.some((e) => e.name === "DocsTemplate" && can(e.permissions, "create"));
  useEffect(() => shell().title(title), [title]);
  // The panel closes from its own button too.
  useEffect(() => {
    const off = shell().on("sidepanel", (id) => setDetails(id === "details"));
    return () => off?.();
  }, []);
  const share = () =>
    void shell()
      .intent({ action: "share", type: "file", data: { id: info.id, name: info.name } })
      .catch((e: unknown) => toast(errorMessage(e), "error"));
  const toggleDetails = async () => {
    if (details) {
      shell().sidepanel.close();
      setDetails(false);
      return;
    }
    // Where the shell has no side panels (or none from Drive): the file's details in Drive.
    if (await shell().sidepanel.open({ id: DETAILS_PANEL, context: { file } })) setDetails(true);
    else window.location.assign(toDrive);
  };

  return (
    <Tips>
    <div className="doc-page">
      <header className="doc-bar">
        {fromDocs ? (
          <Link className="btn btn-default btn-sm" to="/" aria-label={t("Back to Docs")}>
            <ArrowLeft size={16} aria-hidden /> {t("Docs")}
          </Link>
        ) : (
          <a className="btn btn-default btn-sm" href={toDrive} aria-label={t("Back to Drive")}>
            <ArrowLeft size={16} aria-hidden /> {t("Drive")}
          </a>
        )}
        <Title name={info.name} canRename={canEdit && !!space.data} rename={(name) => act("rename", { item: file, name }).then(() => qc.invalidateQueries({ queryKey: ["drive"] }))} />
        {!compat.ok ? (
          <span className="doc-status" role="status">
            {t("Read only: newer format")}
          </span>
        ) : saveState(state, session.keeps) ? (
          <span title={statusText(state, session.keeps)}>
            <SaveStatus state={saveState(state, session.keeps)!} />
          </span>
        ) : (
          <span className="doc-status" role="status" aria-live="polite">
            {isolate(statusText(state, session.keeps))}
          </span>
        )}
        {state.loaded && state.access === "read" && <Badge>{t("View only")}</Badge>}
        <People people={here} />
        <div className="doc-bar-end">
          <Button size="sm" aria-pressed={contents} onClick={() => showContents(!contents)} title={t("Contents: the headings, to jump to")}>
            <TableOfContents size={16} aria-hidden /> {t("Contents")}
          </Button>
          <Button size="sm" onClick={() => openFind(false)} title={t("Find in the document (Ctrl+F)")}>
            <Search size={16} aria-hidden /> {t("Find")}
          </Button>
          {allows(info.permission, "Manage") && canShare && (
            <Button size="sm" onClick={share}>
              {t("Share")}
            </Button>
          )}
          {canComment && (
            <Button size="sm" disabled={!selected} onClick={startComment} title={t("Comment on the selected words (Ctrl+Alt+M)")}>
              {t("Comment")}
            </Button>
          )}
          <Button size="sm" aria-pressed={details} onClick={() => void toggleDetails()}>
            {t("Comments and history")}
          </Button>
          {editor && editable && (
            <Menu label={t("Edit")} ariaLabel={t("Edit menu")} buttonClass="btn btn-default btn-sm">
              {(close) => {
                const item = (run: () => unknown) => () => {
                  close();
                  void run();
                };
                return (
                  <>
                    <MenuItem onSelect={item(() => editor.chain().focus().undo().run())}>{t("Undo")}</MenuItem>
                    <MenuItem onSelect={item(() => editor.chain().focus().redo().run())}>{t("Redo")}</MenuItem>
                    <MenuItem onSelect={item(() => (editor.commands.focus(), document.execCommand("cut")))}>{t("Cut")}</MenuItem>
                    <MenuItem onSelect={item(() => (editor.commands.focus(), document.execCommand("copy")))}>{t("Copy")}</MenuItem>
                    <MenuItem onSelect={item(pastePlain)}>{t("Paste without formatting")}</MenuItem>
                    <MenuItem onSelect={item(() => editor.chain().focus().selectAll().run())}>{t("Select all")}</MenuItem>
                    <MenuItem onSelect={item(() => openFind(false))}>{t("Find")}</MenuItem>
                    <MenuItem onSelect={item(() => openFind(true))}>{t("Find and replace")}</MenuItem>
                  </>
                );
              }}
            </Menu>
          )}
          {editor && editable && (
            <Menu label={t("Insert")} ariaLabel={t("Insert menu")} buttonClass="btn btn-default btn-sm">
              {(close) => {
                const item = (run: () => unknown) => () => {
                  close();
                  void run();
                };
                const run = () => editor.chain().focus();
                return (
                  <>
                    <MenuItem onSelect={item(pickImages)}>{t("Image")}</MenuItem>
                    <MenuItem onSelect={item(() => run().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run())}>{t("Table")}</MenuItem>
                    <MenuItem onSelect={item(() => setLinking(true))}>{t("Link")}</MenuItem>
                    <MenuItem onSelect={item(() => run().insertPageBreak().run())}>{t("Page break")}</MenuItem>
                    <MenuItem onSelect={item(() => run().insertContents().run())}>{t("Table of contents")}</MenuItem>
                    <MenuItem onSelect={item(() => insertFootnoteAndJump(editor))}>{t("Footnote")}</MenuItem>
                    <MenuItem onSelect={item(() => run().setHorizontalRule().run())}>{t("Divider")}</MenuItem>
                  </>
                );
              }}
            </Menu>
          )}
          <Menu label={t("File")} ariaLabel={t("File menu")} buttonClass="btn btn-default btn-sm">
            {(close) => {
              const item = (run: () => unknown) => () => {
                close();
                void run();
              };
              return (
                <>
                  <MenuItem onSelect={item(() => exportAs("html"))}>{t("Download as web page (.html)")}</MenuItem>
                  <MenuItem onSelect={item(() => exportAs("pdf"))}>{t("Download as PDF")}</MenuItem>
                  <MenuItem onSelect={item(() => exportAs("docx"))}>{t("Download as Word (.docx)")}</MenuItem>
                  <MenuItem onSelect={item(() => exportAs("txt"))}>{t("Download as text (.txt)")}</MenuItem>
                  <MenuItem onSelect={item(exportMarkdown)}>{t("Download as Markdown (.md)")}</MenuItem>
                  {editable && <MenuItem onSelect={item(() => setPaging(true))}>{t("Page setup…")}</MenuItem>}
                  <MenuItem onSelect={item(() => (printNow(), window.print()))}>{t("Print")}</MenuItem>
                  <MenuItem onSelect={item(() => navigate(`/d/${file}/history`))}>{t("Version history")}</MenuItem>
                  {space.data && info.parent && <MenuItem onSelect={item(copy)}>{t("Make a copy")}</MenuItem>}
                  {keepsTemplates && <MenuItem onSelect={item(() => setTemplating(true))}>{t("Save as a template")}</MenuItem>}
                  <MenuItem onSelect={item(() => setHelping(true))}>{t("Keyboard shortcuts")}</MenuItem>
                </>
              );
            }}
          </Menu>
        </div>
      </header>
      {state.error && <Alert tone={state.closed ? "error" : "warning"}>{isolate(state.error)}</Alert>}
      <div className="doc-tools">
        {editor && editable && <Toolbar editor={editor} pickImages={pickImages} adding={adding} suggesting={suggesting} setSuggesting={setMode} onLink={() => setLinking(true)} />}
        {editor && finding && state.loaded && <FindBar editor={editor} canReplace={editable} replacing={replacing} setReplacing={setReplacing} focus={findFocus} onClose={() => setFinding(false)} />}
      </div>
      <div className={`doc-main${tocShown ? " doc-main-toc" : ""}${railShown ? " doc-main-rail" : ""}`}>
        {editor && tocShown && <Contents editor={editor} onHide={() => showContents(false)} />}
        {!compat.ok ? (
          <NewerFormat download={(f) => void exportAs(f)} />
        ) : (
        <div className="doc-paper" ref={paper}>
          {!state.loaded && !state.closed && <ReaderSkeleton />}
          <div
            ref={sheet}
            className="doc-sheet"
            hidden={!state.loaded}
            style={
              {
                "--sheet-w": real ? `${pageW}px` : "100%",
                "--sheet-h": real ? `${pageH}px` : "60vh",
                "--mt": `${real ? toPx(setup.top) : Math.min(toPx(setup.top), 48)}px`,
                "--mb": `${real ? toPx(setup.bottom) : Math.min(toPx(setup.bottom), 48)}px`,
                "--ml": `${real ? toPx(setup.left) : Math.min(toPx(setup.left), 24)}px`,
                "--mr": `${real ? toPx(setup.right) : Math.min(toPx(setup.right), 24)}px`,
              } as React.CSSProperties
            }
          >
            {ready && setup.differentFirst && <PageRegion doc={session.doc} name="firstHeader" editable={editable && !suggesting} setup={setup} />}
            {ready && <PageRegion doc={session.doc} name="header" editable={editable && !suggesting} setup={setup} />}
            <EditorContent className="doc-sheet-text" editor={editor} hidden={!state.loaded} />
            {ready && <PageRegion doc={session.doc} name="footer" editable={editable && !suggesting} setup={setup} />}
            {ready && setup.differentFirst && <PageRegion doc={session.doc} name="firstFooter" editable={editable && !suggesting} setup={setup} />}
            {real && layout?.marks.map((m) => <div key={m.page} className="doc-pagemark" style={{ insetBlockStart: m.top }} data-label={t("Page {page}", { page: m.page })} aria-hidden />)}
          </div>
          {editor && editable && <EditorMenus editor={editor} menu={menu} listId={listId} pickImages={pickImages} onMentioned={notified} />}
          {editor && editable && !suggesting && (
            <>
              <TableBar editor={editor} />
              <ImageBar editor={editor} file={file} />
            </>
          )}
          {editor && state.loaded && !linking && <LinkCard editor={editor} env={{ file, openDoc: (id) => openDoc.current(id) }} editable={editable} edit={() => setLinking(true)} />}
          {editor && linking && <LinkPanel editor={editor} env={{ file, openDoc: (id) => openDoc.current(id) }} onClose={() => setLinking(false)} />}
        </div>
        )}
        {editor && state.loaded && (
          <CommentRail
            editor={editor}
            file={file}
            canComment={canComment}
            canEdit={editable}
            canManage={allows(info.permission, "Manage")}
            act={act}
            draft={draft}
            onDraftDone={() => setDraft(null)}
            active={active}
            setActive={setActive}
          />
        )}
      </div>
      {editor && ready && <StatusBar editor={editor} pages={layout?.pages ?? null} setup={setup} />}
      <input
        ref={picker}
        type="file"
        accept={IMAGE_TYPES.join(",")}
        multiple
        hidden
        onChange={(e) => {
          const files = imageFiles(e.target.files);
          e.target.value = "";
          addPictures(files);
        }}
      />
      {paging && (
        <Suspense fallback={<ReaderSkeleton />}>
          <PageDialog doc={session.doc} setup={setup} unit={unit} onClose={() => setPaging(false)} />
        </Suspense>
      )}
      {helping && (
        <Suspense fallback={null}>
          <ShortcutHelp onClose={() => setHelping(false)} />
        </Suspense>
      )}
      {templating && <TemplateDialog file={file} title={title} unsaved={state.unsaved} onClose={() => setTemplating(false)} />}
    </div>
    </Tips>
  );
}

/** Everyone else in the document now, one entry per person. */
function useHere(session: CoeditSession) {
  const [people, setPeople] = useState(() => othersIn(session.awareness));
  useEffect(() => {
    const changed = () => setPeople(othersIn(session.awareness));
    session.awareness.on("change", changed);
    changed();
    return () => session.awareness.off("change", changed);
  }, [session]);
  return people;
}

function People({ people }: { people: { client: number; name: string; color: string }[] }) {
  if (!people.length) return null;
  const shown = people.slice(0, 5);
  const names = people.map((p) => p.name).join(", ");
  return (
    <div className="doc-people" role="group" aria-label={t("Also here: {names}", { names })} title={t("Also here: {names}", { names })}>
      {shown.map((p) => (
        <span key={p.client} className="doc-person" style={{ background: p.color }} aria-hidden>
          {isolate(initials(p.name))}
        </span>
      ))}
      {people.length > shown.length && (
        <span className="doc-person doc-person-more" aria-hidden>
          +{people.length - shown.length}
        </span>
      )}
    </div>
  );
}

/** The name, renamed in place (Enter or leaving the field). */
function Title({ name, canRename, rename }: { name: string; canRename: boolean; rename: (name: string) => Promise<unknown> }) {
  const [value, setValue] = useState(docTitle(name));
  useEffect(() => setValue(docTitle(name)), [name]);
  const commit = async () => {
    const next = value.trim();
    if (!next || next === docTitle(name)) return setValue(docTitle(name));
    try {
      await rename(`${next}.fdoc`);
      toast(t("Renamed"));
    } catch (e) {
      toast(errorMessage(e), "error");
      setValue(docTitle(name));
    }
  };
  if (!canRename) return <h1 className="doc-title doc-title-static">{isolate(docTitle(name))}</h1>;
  return (
    <input
      className="doc-title"
      aria-label={t("Document name")}
      value={value}
      maxLength={240}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => void commit()}
      onKeyDown={(e: ReactKeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          setValue(docTitle(name));
          e.currentTarget.blur();
        }
      }}
    />
  );
}

const CATEGORIES = ["General", "Meetings", "Projects", "Product", "Reports"];

/** Docs Managers: this document as a template (its content as its editors left it). */
function TemplateDialog({ file, title, unsaved, onClose }: { file: string; title: string; unsaved: boolean; onClose: () => void }) {
  const [name, setName] = useState(title);
  const [category, setCategory] = useState("General");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post("/api/v1/DocsTemplate", { name: name.trim(), category, description: description.trim() || null, source_document: file });
      await qc.invalidateQueries({ queryKey: ["docs", "templates"] });
      toast(t("“{name}” is a template in Docs", { name: name.trim() }));
      onClose();
    } catch (err) {
      toast(errorMessage(err), "error");
      setBusy(false);
    }
  };
  const footer: ReactNode = (
    <>
      <Button onClick={onClose}>{t("Cancel")}</Button>
      <Button variant="primary" type="submit" form="doc-template-form" loading={busy} disabled={!name.trim()}>
        {t("Save template")}
      </Button>
    </>
  );
  return (
    <Dialog open onClose={onClose} title={t("Save as a template")} footer={footer}>
      <form id="doc-template-form" onSubmit={save} className="stack">
        {unsaved && <Alert tone="warning">{t("The last few changes are still being saved; the template takes what is saved when you press Save.")}</Alert>}
        <Field label={t("Template name")} htmlFor="doc-template-name" required>
          <input id="doc-template-name" className="input" value={name} maxLength={140} onChange={(e) => setName(e.target.value)} data-autofocus />
        </Field>
        <Field label={t("Category")} htmlFor="doc-template-category">
          <select id="doc-template-category" className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((c) => (
              <option key={c}>{isolate(c)}</option>
            ))}
          </select>
        </Field>
        <Field label={t("Description")} htmlFor="doc-template-description" hint={t("One line in the template gallery")}>
          <input id="doc-template-description" className="input" value={description} maxLength={280} onChange={(e) => setDescription(e.target.value)} />
        </Field>
      </form>
    </Dialog>
  );
}
