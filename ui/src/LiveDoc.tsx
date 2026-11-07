// `/docs/d/:file`: a Drive document everyone with access edits at once (Ferrum
// docs/plan/collaboration.md, C3). TipTap on a Yjs document the platform keeps in sync (coedit.ts)
// with everyone's cursors; Drive keeps the file: who may open it, sharing, comments, versions and
// exports. Sharing is Drive's share dialog (the `share file` intent) and comments and history are
// Drive's panel beside the document (docs/plan/apps-ui.md §11.3, §11.4).

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Collaboration } from "@tiptap/extension-collaboration";
import { CollaborationCaret } from "@tiptap/extension-collaboration-caret";
import { Placeholder } from "@tiptap/extensions";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowLeft,
  Bold,
  Code,
  Highlighter,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  Quote,
  Redo2,
  Search,
  SquareCode,
  Strikethrough,
  TableOfContents,
  Underline,
  Undo2,
} from "lucide-react";
import { type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { Link, useBlocker, useLocation, useNavigate, useParams } from "react-router";
import { api, download, errorMessage, initials, openPrint, saveBlob, shell, t } from "@ferrum/client";
import { Alert, Badge, Button, Dialog, EmptyState, Field, Menu, MenuItem, Spinner, confirmDialog, toast, useCanIntent } from "@ferrum/kit";
import { can, useMe, useMetaIndex } from "@ferrum/records";
import { CALLOUTS, type CalloutKind, calloutKind } from "./callout";
import { CoeditSession, type CoeditState, othersIn, socketUrl } from "./coedit";
import { CommentRail, type Draft, commentsQuery } from "./CommentRail";
import { DocComments, anchorOf, textThreads } from "./comments";
import { Contents } from "./Contents";
import { Find } from "./find";
import { FindBar } from "./FindBar";
import { IMAGE_TYPES, MAX_IMAGE, imageFiles } from "./image";
import { type ItemInfo, allows, docTitle } from "./livedocs";
import { openMention } from "./mention";
import { Menus } from "./menus";
import { EditorMenus, type MenuApi, NO_MENU, useMentionNotices } from "./EditorMenus";
import { usePresence } from "./presence";
import { documentExtensions } from "./schema";
import { Sep, Tool } from "./Tool";
import { Suggestions, setSuggesting, suggestionsIn } from "./suggest";
import "./livedoc.css";

/** Drive's panel of a file's comments and history (a contextual side panel of Drive). */
const DETAILS_PANEL = "drive.details";

/** Adds image files to the document: each goes up to Drive (the document keeps it), then into the
 *  text at the selection, in order. */
async function addImages(editor: Editor, file: string, files: File[]) {
  for (const f of files) {
    if (f.size > MAX_IMAGE) {
      toast(`“${f.name}” is larger than 10 MB`, "error");
      continue;
    }
    try {
      const up = await api.post<{ id: string; width: number; height: number }>(`/api/app/drive/files/${encodeURIComponent(file)}/images`, f);
      editor.chain().focus().insertImage({ image: up.id, alt: "", width: up.width, height: up.height }).run();
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  }
}

/** A small choice the browser remembers for this person (nothing where it refuses). */
function remembered(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function remember(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // The choice just lasts until the page closes.
  }
}

/** Whether a key was pressed in a field of the page other than the text and the find bar. */
function inOtherField(target: EventTarget | null): boolean {
  const el = target instanceof HTMLElement ? target : null;
  if (!el || el.closest(".doc-body, .doc-find")) return false;
  return el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
}

/** What the bar says about the document's connection and saving; `keeps`: the browser keeps
 *  unsaved changes beyond this tab. */
export function statusText(s: Pick<CoeditState, "online" | "loaded" | "unsaved" | "closed">, keeps = false): string {
  if (s.closed) return "Not connected";
  if (!s.loaded) return "Opening…";
  if (!s.online) return s.unsaved ? `Offline: your changes are kept in this ${keeps ? "browser" : "tab"} until the connection is back` : "Reconnecting…";
  return s.unsaved ? "Saving…" : "Saved";
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
      <EmptyState title={t("This document cannot be opened")} icon="file">
        <p className="muted">{errorMessage(info.error)}</p>
        <a href="/drive/">{t("Go to Drive")}</a>
      </EmptyState>
    );
  }
  if (!file || !session || !info.data) return <Spinner label={t("Opening the document")} />;
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
  const editable = state.loaded && state.access === "write" && !state.closed;
  const title = docTitle(info.name);
  // The editor, for pasted and dropped images (its handlers are set when it is made).
  const current = useRef<Editor | null>(null);
  // Comments on the text: one being written, and the thread in view (a click in its text shows it).
  const [draft, setDraft] = useState<Draft | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const activate = useRef<(id: string | null) => void>(() => undefined);
  activate.current = setActive;
  // Suggesting: what this person types is proposed, signed with their name.
  const [suggesting, setMode] = useState(false);
  // The menus at the caret open while the text takes typing; the open one answers for the keys.
  const typing = useRef(false);
  typing.current = editable && !suggesting;
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

  const editor = useEditor(
    {
      editable: false,
      extensions: [
        ...documentExtensions(file),
        Placeholder.configure({ placeholder: "Type / for blocks and @ to mention someone, or just start writing" }),
        DocComments.configure({ onActivate: (id) => activate.current(id) }),
        Suggestions.configure({ onRefused: () => toast(t("While suggesting, only words change: switch to Editing to change formatting or structure")) }),
        Find,
        Menus.configure({ hooks: { enabled: () => typing.current, count: () => menu.current.count(), choose: (i) => menu.current.choose(i), listId } }),
        Collaboration.configure({ document: session.doc, field: "default" }),
        CollaborationCaret.configure({ provider: session, user: { name: "", color: "#64748b" } }),
      ],
      editorProps: {
        attributes: { class: "doc-body", "aria-label": `${title}, document`, spellcheck: "true" },
        // Pictures pasted or dropped in go up to Drive and into the text.
        handlePaste: (_view, event) => {
          const images = imageFiles(event.clipboardData?.files);
          if (!images.length || !current.current) return false;
          event.preventDefault();
          void addImages(current.current, file, images);
          return true;
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
          if (a && (event.metaKey || event.ctrlKey)) {
            window.open(a.getAttribute("href") ?? "", "_blank", "noopener,noreferrer");
            return true;
          }
          const m = target?.closest<HTMLElement>('[data-mention="record"]');
          if (m && (!view.editable || event.metaKey || event.ctrlKey)) return openMention({ kind: "record", id: m.dataset.id ?? null, entity: m.dataset.entity ?? null });
          return false;
        },
      },
    },
    [session],
  );
  useEffect(() => {
    current.current = editor;
  }, [editor]);
  useEffect(() => {
    if (editor && editor.isEditable !== editable) editor.setEditable(editable);
  }, [editor, editable]);
  useEffect(() => {
    if (editor && state.me) editor.commands.updateUser({ name: state.me.name, color: state.me.color });
  }, [editor, state.me]);

  // Drive's lists show who has the file open.
  usePresence(file, state.loaded ? (state.access === "write" ? "edit" : "view") : null);

  // Leaving with changes the server has not stored yet, where the browser cannot keep them.
  const blocker = useBlocker(({ currentLocation, nextLocation }) => !session.keeps && state.unsaved && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => {
    if (blocker.state !== "blocked") return;
    void confirmDialog({
      title: "Leave before your changes are saved?",
      message: state.online ? "Your latest changes are still being saved." : "You are offline: changes typed since the connection dropped are only in this tab.",
      confirmLabel: "Leave",
      danger: true,
    }).then((ok) => (ok ? blocker.proceed() : blocker.reset()));
  }, [blocker, state.online]);
  useEffect(() => {
    if (!state.unsaved || session.keeps) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [state.unsaved, session.keeps]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.altKey && e.code === "KeyM") {
        e.preventDefault();
        startRef.current();
        return;
      }
      // Ctrl+F finds, and Ctrl+H (⌘⇧H on a Mac, where ⌘H hides the app) replaces, unless the person is
      // typing in some other field of the page: then the browser's own find stays theirs.
      const key = e.key.toLowerCase();
      const mac = /Mac|iPhone|iPad/.test(navigator.platform);
      const wantsFind = (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && key === "f";
      const wantsReplace = mac ? e.metaKey && e.shiftKey && !e.altKey && key === "h" : e.ctrlKey && !e.altKey && !e.shiftKey && key === "h";
      if ((wantsFind || wantsReplace) && !inOtherField(e.target)) {
        e.preventDefault();
        findRef.current(wantsReplace);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        toast(state.unsaved ? "Saving: changes are saved as you type" : "Saved: changes are saved as you type");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state.unsaved]);

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
    if (pending > 0) toast(`${pending} ${pending === 1 ? "suggestion is" : "suggestions are"} still waiting: the file has the words as suggested and as they were`, "info");
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
  const copy = async () => {
    try {
      const made = await act("copy", { item: file, to: info.parent, name: `Copy of ${info.name}` });
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
  const startRef = useRef(startComment);
  startRef.current = startComment;
  /** Opens find (and, when asked and allowed, replace), and puts the caret in its field. */
  const openFind = (withReplace: boolean) => {
    setFinding(true);
    setReplacing(withReplace && editable);
    setFindFocus((n) => n + 1);
  };
  const findRef = useRef(openFind);
  findRef.current = openFind;
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
        <span className="doc-status" role="status" aria-live="polite">
          {statusText(state, session.keeps)}
        </span>
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
          <Menu label={t("File")} ariaLabel="File menu" buttonClass="btn btn-default btn-sm">
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
                  <MenuItem onSelect={item(() => openPrint(`${content}?format=html&inline=1`).catch((e: unknown) => toast(errorMessage(e), "error")))}>{t("Print")}</MenuItem>
                  <MenuItem onSelect={item(() => navigate(`/d/${file}/history`))}>{t("Version history")}</MenuItem>
                  {space.data && info.parent && <MenuItem onSelect={item(copy)}>{t("Make a copy")}</MenuItem>}
                  {keepsTemplates && <MenuItem onSelect={item(() => setTemplating(true))}>{t("Save as a template")}</MenuItem>}
                </>
              );
            }}
          </Menu>
        </div>
      </header>
      {state.error && <Alert tone={state.closed ? "error" : "warning"}>{state.error}</Alert>}
      <div className="doc-tools">
        {editor && editable && <Toolbar editor={editor} pickImages={pickImages} adding={adding} suggesting={suggesting} setSuggesting={setMode} />}
        {editor && finding && state.loaded && <FindBar editor={editor} canReplace={editable} replacing={replacing} setReplacing={setReplacing} focus={findFocus} onClose={() => setFinding(false)} />}
      </div>
      <div className={`doc-main${tocShown ? " doc-main-toc" : ""}${railShown ? " doc-main-rail" : ""}`}>
        {editor && tocShown && <Contents editor={editor} onHide={() => showContents(false)} />}
        <div className="doc-paper">
          {!state.loaded && !state.closed && <Spinner label={t("Loading the document")} />}
          <EditorContent editor={editor} hidden={!state.loaded} />
          {editor && editable && <EditorMenus editor={editor} menu={menu} listId={listId} pickImages={pickImages} onMentioned={notified} />}
        </div>
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
      {templating && <TemplateDialog file={file} title={title} unsaved={state.unsaved} onClose={() => setTemplating(false)} />}
    </div>
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
    <div className="doc-people" role="group" aria-label={`Also here: ${names}`} title={`Also here: ${names}`}>
      {shown.map((p) => (
        <span key={p.client} className="doc-person" style={{ background: p.color }} aria-hidden>
          {initials(p.name)}
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
  if (!canRename) return <h1 className="doc-title doc-title-static">{docTitle(name)}</h1>;
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

const STYLES = [
  { id: "p", label: "Text" },
  { id: "h1", label: "Heading 1" },
  { id: "h2", label: "Heading 2" },
  { id: "h3", label: "Heading 3" },
] as const;

function Toolbar({
  editor,
  pickImages,
  adding,
  suggesting,
  setSuggesting: setMode,
}: {
  editor: Editor;
  pickImages: () => void;
  adding: boolean;
  suggesting: boolean;
  setSuggesting: (on: boolean) => void;
}) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      style: e.isActive("heading", { level: 1 }) ? "h1" : e.isActive("heading", { level: 2 }) ? "h2" : e.isActive("heading", { level: 3 }) ? "h3" : "p",
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      underline: e.isActive("underline"),
      strike: e.isActive("strike"),
      code: e.isActive("code"),
      highlight: e.isActive("highlight"),
      link: e.isActive("link"),
      bullet: e.isActive("bulletList"),
      ordered: e.isActive("orderedList"),
      task: e.isActive("taskList"),
      quote: e.isActive("blockquote"),
      callout: e.isActive("blockquote") ? calloutKind(e.getAttributes("blockquote").callout) : null,
      codeBlock: e.isActive("codeBlock"),
      table: e.isActive("table"),
      left: e.isActive({ textAlign: "left" }),
      center: e.isActive({ textAlign: "center" }),
      right: e.isActive({ textAlign: "right" }),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
      image: e.isActive("image"),
    }),
  });
  const [linking, setLinking] = useState(false);
  const [describing, setDescribing] = useState(false);
  const run = () => editor.chain().focus();
  return (
    <div className={`doc-toolbar${suggesting ? " is-suggesting" : ""}`} role="toolbar" aria-label={t("Formatting")}>
      <label className="sr-only" htmlFor="doc-mode">
        {t("Mode")}
      </label>
      <select id="doc-mode" className="doc-style doc-mode" value={suggesting ? "suggest" : "edit"} onChange={(e) => setMode(e.target.value === "suggest")}>
        <option value="edit">{t("Editing")}</option>
        <option value="suggest">{t("Suggesting")}</option>
      </select>
      <Sep />
      <Tool label={t("Undo")} icon={Undo2} disabled={!s.canUndo} onClick={() => run().undo().run()} />
      <Tool label={t("Redo")} icon={Redo2} disabled={!s.canRedo} onClick={() => run().redo().run()} />
      <Sep />
      <label className="sr-only" htmlFor="doc-style">
        {t("Paragraph style")}
      </label>
      <select
        id="doc-style"
        className="doc-style"
        value={s.style}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "p") run().setParagraph().run();
          else run().setHeading({ level: Number(v.slice(1)) as 1 | 2 | 3 }).run();
        }}
      >
        {STYLES.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
      <Sep />
      <Tool label={t("Bold")} icon={Bold} active={s.bold} onClick={() => run().toggleBold().run()} />
      <Tool label={t("Italic")} icon={Italic} active={s.italic} onClick={() => run().toggleItalic().run()} />
      <Tool label={t("Underline")} icon={Underline} active={s.underline} onClick={() => run().toggleUnderline().run()} />
      <Tool label={t("Strikethrough")} icon={Strikethrough} active={s.strike} onClick={() => run().toggleStrike().run()} />
      <Tool label={t("Highlight")} icon={Highlighter} active={s.highlight} onClick={() => run().toggleHighlight().run()} />
      <Tool label={t("Code")} icon={Code} active={s.code} onClick={() => run().toggleCode().run()} />
      <Tool label={s.link ? "Edit link" : "Link"} icon={Link2} active={s.link} onClick={() => setLinking(true)} />
      <Tool label={adding ? "Adding the image…" : "Image"} icon={ImagePlus} disabled={adding} onClick={pickImages} />
      {s.image && (
        <button type="button" className="doc-tool doc-tool-text" onMouseDown={(e) => e.preventDefault()} onClick={() => setDescribing(true)}>
          {t("Describe image")}
        </button>
      )}
      <Sep />
      <Tool label={t("Bulleted list")} icon={List} active={s.bullet} onClick={() => run().toggleBulletList().run()} />
      <Tool label={t("Numbered list")} icon={ListOrdered} active={s.ordered} onClick={() => run().toggleOrderedList().run()} />
      <Tool label={t("Checklist")} icon={ListChecks} active={s.task} onClick={() => run().toggleTaskList().run()} />
      <Tool label={t("Quote")} icon={Quote} active={s.quote} onClick={() => run().toggleBlockquote().run()} />
      {s.quote && (
        <>
          <label className="sr-only" htmlFor="doc-callout">
            {t("Quote style")}
          </label>
          <select
            id="doc-callout"
            className="doc-style"
            value={s.callout ?? ""}
            onChange={(e) => {
              const kind: CalloutKind | null = calloutKind(e.target.value);
              if (kind) run().setCallout(kind).run();
              else run().unsetCallout().run();
            }}
          >
            <option value="">{t("Plain quote")}</option>
            {CALLOUTS.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label} callout
              </option>
            ))}
          </select>
        </>
      )}
      <Tool label={t("Code block")} icon={SquareCode} active={s.codeBlock} onClick={() => run().toggleCodeBlock().run()} />
      <Tool label={t("Divider")} icon={Minus} onClick={() => run().setHorizontalRule().run()} />
      <Sep />
      <Tool label={t("Align left")} icon={AlignLeft} active={s.left} onClick={() => run().setTextAlign("left").run()} />
      <Tool label={t("Center")} icon={AlignCenter} active={s.center} onClick={() => run().setTextAlign("center").run()} />
      <Tool label={t("Align right")} icon={AlignRight} active={s.right} onClick={() => run().setTextAlign("right").run()} />
      <Sep />
      <Menu label={t("Table")} ariaLabel="Table" buttonClass="doc-tool doc-tool-text">
        {(close) => {
          const item = (go: () => boolean, label: string, needsTable = true) =>
            (!needsTable || s.table) && (
              <MenuItem
                onSelect={() => {
                  close();
                  go();
                }}
              >
                {label}
              </MenuItem>
            );
          return (
            <>
              {item(() => run().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(), "Insert a table", false)}
              {item(() => run().addRowAfter().run(), "Add a row below")}
              {item(() => run().addColumnAfter().run(), "Add a column to the right")}
              {item(() => run().deleteRow().run(), "Delete the row")}
              {item(() => run().deleteColumn().run(), "Delete the column")}
              {item(() => run().deleteTable().run(), "Delete the table")}
            </>
          );
        }}
      </Menu>
      {linking && <LinkDialog editor={editor} onClose={() => setLinking(false)} />}
      {describing && <DescribeDialog editor={editor} onClose={() => setDescribing(false)} />}
    </div>
  );
}

/** What an image shows, for people who cannot see it (screen readers, and files that lose it). */
function DescribeDialog({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const [alt, setAlt] = useState((editor.getAttributes("image").alt as string | undefined) ?? "");
  const save = (e: FormEvent) => {
    e.preventDefault();
    editor.chain().focus().describeImage(alt).run();
    onClose();
  };
  const footer: ReactNode = (
    <>
      <Button onClick={onClose}>{t("Cancel")}</Button>
      <Button variant="primary" type="submit" form="doc-describe-form">
        {t("Save")}
      </Button>
    </>
  );
  return (
    <Dialog open onClose={onClose} title={t("Describe the image")} footer={footer}>
      <form id="doc-describe-form" onSubmit={save}>
        <Field label={t("Description")} htmlFor="doc-describe-alt" hint={t("What it shows, in a sentence; leave empty for a decoration")}>
          <input id="doc-describe-alt" className="input" value={alt} maxLength={300} onChange={(e) => setAlt(e.target.value)} data-autofocus />
        </Field>
      </form>
    </Dialog>
  );
}

/** The web and mail only: anything else a reader could not follow safely. */
export function cleanHref(raw: string): string | null {
  const href = raw.trim();
  if (!href) return null;
  if (/^(https?:|mailto:)/i.test(href)) return href;
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return null;
  return href.includes("@") && !href.includes("/") ? `mailto:${href}` : `https://${href}`;
}

function LinkDialog({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const current = (editor.getAttributes("link").href as string | undefined) ?? "";
  const [href, setHref] = useState(current);
  const [error, setError] = useState<string | null>(null);
  const save = (e: FormEvent) => {
    e.preventDefault();
    const clean = cleanHref(href);
    if (!href.trim()) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return onClose();
    }
    if (!clean) return setError("Links go to web pages (https://…) or email addresses.");
    editor.chain().focus().extendMarkRange("link").setLink({ href: clean }).run();
    onClose();
  };
  const footer: ReactNode = (
    <>
      {current && (
        <Button
          variant="danger"
          onClick={() => {
            editor.chain().focus().extendMarkRange("link").unsetLink().run();
            onClose();
          }}
        >
          {t("Remove link")}
        </Button>
      )}
      <Button onClick={onClose}>{t("Cancel")}</Button>
      <Button variant="primary" type="submit" form="doc-link-form">
        {t("Save")}
      </Button>
    </>
  );
  return (
    <Dialog open onClose={onClose} title={current ? "Edit link" : "Add a link"} footer={footer}>
      <form id="doc-link-form" onSubmit={save}>
        <Field label={t("Address")} htmlFor="doc-link-href" error={error ?? undefined}>
          <input
            id="doc-link-href"
            className="input"
            type="text"
            inputMode="url"
            placeholder="https://example.com"
            value={href}
            aria-invalid={!!error || undefined}
            aria-describedby={error ? "doc-link-href-error" : undefined}
            onChange={(e) => setHref(e.target.value)}
            data-autofocus
          />
        </Field>
      </form>
    </Dialog>
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
      toast(`“${name.trim()}” is a template in Docs`);
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
              <option key={c}>{c}</option>
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
