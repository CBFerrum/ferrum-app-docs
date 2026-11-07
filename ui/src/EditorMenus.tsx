// The menus at the caret while writing (menus.ts finds the trigger and owns the keys): `/` lists the
// blocks to put in the text, `@` the people and records to mention. Choosing replaces what was typed.
//
// A person picked from `@` is told: the platform tells people about comments, not about words in a
// text, so a short comment on the document names them once they are still mentioned a few seconds
// later (the bell and mail show its first words, and it opens the document).

import { useQuery } from "@tanstack/react-query";
import { type Editor, useEditorState } from "@tiptap/react";
import { AtSign, Calendar, FileText, Heading1, Heading2, Heading3, Info, ImagePlus, Lightbulb, List, ListChecks, ListOrdered, Minus, OctagonAlert, Pilcrow, Quote, SquareCode, Table, TriangleAlert, type LucideIcon } from "lucide-react";
import { type CSSProperties, type MutableRefObject, type ReactNode, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { api, errorMessage, formatMoment, initials, t } from "@ferrum/client";
import { toast, useDebounced } from "@ferrum/kit";
import { usePeople } from "@ferrum/records";
import { type Block, type BlockId, findBlocks } from "./blocks";
import { type CalloutKind } from "./callout";
import { docTitle } from "./livedocs";
import { type Pending, contextOf, findPeople, mentionLabel, mentionsIn, noticeBody, planNotices } from "./mention";
import { type Trigger, menuKey } from "./menus";

/** What the page asks of whichever menu is open (the plugin asks it for the keys). */
export interface MenuApi {
  count: () => number;
  choose: (index: number) => void;
}

export const NO_MENU: MenuApi = { count: () => 0, choose: () => undefined };

const ICONS: Record<BlockId, LucideIcon> = {
  text: Pilcrow,
  h1: Heading1,
  h2: Heading2,
  h3: Heading3,
  quote: Quote,
  code: SquareCode,
  bullets: List,
  numbers: ListOrdered,
  checklist: ListChecks,
  table: Table,
  note: Info,
  tip: Lightbulb,
  warning: TriangleAlert,
  alert: OctagonAlert,
  image: ImagePlus,
  divider: Minus,
  date: Calendar,
  mention: AtSign,
};

/** Puts block `id` where `range` was typed. */
export function runBlock(editor: Editor, id: BlockId, range: { from: number; to: number }, pickImages: () => void) {
  const chain = () => editor.chain().focus().deleteRange(range);
  switch (id) {
    case "text":
      return chain().setParagraph().run();
    case "h1":
    case "h2":
    case "h3":
      return chain().setHeading({ level: Number(id.slice(1)) as 1 | 2 | 3 }).run();
    case "quote":
      return chain().setBlockquote().run();
    case "code":
      return chain().setCodeBlock().run();
    case "bullets":
      return chain().toggleBulletList().run();
    case "numbers":
      return chain().toggleOrderedList().run();
    case "checklist":
      return chain().toggleTaskList().run();
    case "table":
      return chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
    case "note":
    case "tip":
    case "warning":
    case "alert":
      return chain().setCallout(id as CalloutKind).run();
    case "divider":
      return chain().setHorizontalRule().run();
    case "image":
      chain().run();
      return pickImages();
    case "date":
      return chain().insertContent(formatMoment(new Date(), { dateStyle: "long" })).run();
    case "mention":
      // The @ it types opens the menu of people and records.
      return chain().insertContent("@").run();
  }
}

type Open = Trigger & { index: number };

/** Where the menus show: under the caret, or above it when there is no room, and inside the screen. */
function Popup({ editor, at, children }: { editor: Editor; at: number; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CSSProperties>({ visibility: "hidden" });
  const place = useCallback(() => {
    const el = ref.current;
    if (!el || editor.isDestroyed) return;
    let c: { left: number; top: number; bottom: number };
    try {
      c = editor.view.coordsAtPos(at);
    } catch {
      return;
    }
    // The visual viewport is what is left of the screen above a phone's keyboard.
    const vv = window.visualViewport;
    const [x, y, w, h] = [vv?.offsetLeft ?? 0, vv?.offsetTop ?? 0, vv?.width ?? window.innerWidth, vv?.height ?? window.innerHeight];
    const left = Math.max(x + 8, Math.min(c.left, x + w - el.offsetWidth - 8));
    const below = c.bottom + 6;
    const above = c.top - 6 - el.offsetHeight;
    const top = below + el.offsetHeight <= y + h - 8 || above < y + 8 ? below : above;
    setStyle((s) => (s.left === left && s.top === top && s.visibility === "visible" ? s : { left, top, visibility: "visible" }));
  }, [editor, at]);
  useLayoutEffect(place);
  useEffect(() => {
    const vv = window.visualViewport;
    window.addEventListener("resize", place);
    document.addEventListener("scroll", place, true);
    vv?.addEventListener("resize", place);
    return () => {
      window.removeEventListener("resize", place);
      document.removeEventListener("scroll", place, true);
      vv?.removeEventListener("resize", place);
    };
  }, [place]);
  // A press on the menu must not take the caret away from the text.
  return (
    <div className="doc-pop" ref={ref} style={style} onMouseDown={(e) => e.preventDefault()}>
      {children}
    </div>
  );
}

export interface Choice {
  key: string;
  icon: ReactNode;
  title: string;
  hint?: string;
  group: string;
  run: () => void;
}

/** The list of a menu: groups of choices, one in view, and a line for screen readers. The editor names
 *  the one in view by its id (`${listId}-${index}`, menus.ts), so the ids count across the groups. */
export function Choices({ choices, index, listId, label, query, status }: { choices: Choice[]; index: number; listId: string; label: string; query: string; status?: ReactNode }) {
  useEffect(() => {
    document.getElementById(`${listId}-${index}`)?.scrollIntoView({ block: "nearest" });
  }, [listId, index, choices]);
  const groups: { name: string; items: { choice: Choice; at: number }[] }[] = [];
  choices.forEach((choice, at) => {
    const last = groups[groups.length - 1];
    if (last?.name === choice.group) last.items.push({ choice, at });
    else groups.push({ name: choice.group, items: [{ choice, at }] });
  });
  return (
    <>
      <div id={listId} className="doc-pop-list" role="listbox" aria-label={label}>
        {groups.map((g) => (
          <div key={g.name} role="group" aria-label={g.name}>
            {/* Groups are only named when nothing narrows the list. */}
            {!query && <div className="doc-pop-group" aria-hidden>{g.name}</div>}
            {g.items.map(({ choice, at }) => (
              <div key={choice.key} id={`${listId}-${at}`} role="option" aria-selected={at === index} className="doc-pop-item" onClick={choice.run}>
                <span className="doc-pop-icon" aria-hidden>
                  {choice.icon}
                </span>
                <span className="doc-pop-text">
                  <span className="doc-pop-title">{choice.title}</span>
                  {choice.hint && <span className="doc-pop-hint">{choice.hint}</span>}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
      {status}
      <div className="sr-only" role="status">
        {choices.length === 1 ? "1 choice." : `${choices.length} choices.`} {t("Use the up and down arrow keys, then Enter.")}
      </div>
    </>
  );
}

function SlashMenu({ editor, open, listId, menu, pickImages }: { editor: Editor; open: Open; listId: string; menu: MutableRefObject<MenuApi>; pickImages: () => void }) {
  const blocks = useMemo(() => findBlocks(open.query), [open.query]);
  const range = { from: open.from, to: open.to };
  const pick = (b: Block) => runBlock(editor, b.id, range, pickImages);
  useEffect(() => {
    menu.current = { count: () => blocks.length, choose: (i) => blocks[i] && pick(blocks[i]) };
    return () => {
      menu.current = NO_MENU;
    };
  });
  if (!blocks.length) return null;
  const choices: Choice[] = blocks.map((b) => {
    const Icon = ICONS[b.id];
    return { key: b.id, icon: <Icon size={16} />, title: b.title, hint: b.hint, group: b.group, run: () => pick(b) };
  });
  return (
    <Popup editor={editor} at={open.from}>
      <Choices choices={choices} index={open.index} listId={listId} label={t("Blocks")} query={open.query} />
    </Popup>
  );
}

/** A record the platform's search found (`/api/search`). */
interface Hit {
  kind: string;
  entity: string;
  id: string;
  title: string;
  subtitle?: string;
}

function MentionMenu({ editor, open, listId, menu, onMentioned }: { editor: Editor; open: Open; listId: string; menu: MutableRefObject<MenuApi>; onMentioned: (p: Pending) => void }) {
  const people = usePeople().data?.users;
  const query = open.query.trim();
  const found = useMemo(() => findPeople(people ?? [], query, 5), [people, query]);
  const typed = useDebounced(query, 200);
  // Records and documents of the workspace, as the bar's search finds them (what the person may read).
  const search = useQuery({
    queryKey: ["docs", "mention-search", typed],
    queryFn: ({ signal }) => api.get<{ results: Hit[] }>("/api/search", { q: typed, limit: 8 }, signal).then((r) => r.results.filter((h) => h.kind === "record")),
    enabled: typed.length >= 2,
    staleTime: 30_000,
    // The last answer stays until the next arrives, so the list does not flash empty between keys.
    placeholderData: (previous) => previous,
  });
  const records = (typed.length >= 2 ? search.data ?? [] : []).filter((h) => !people?.some((p) => p.id === h.id));

  const insert = (attrs: { kind: "person" | "record"; id: string; entity: string | null }, label: string) =>
    editor
      .chain()
      .focus()
      .insertContentAt({ from: open.from, to: open.to }, [{ type: "mention", attrs, content: [{ type: "text", text: label }] }, { type: "text", text: " " }])
      .run();

  const choices: Choice[] = [
    ...found.map((p): Choice => {
      const name = p.full_name || p.email;
      return {
        key: `p-${p.id}`,
        icon: <span className="doc-pop-avatar">{initials(name)}</span>,
        title: name,
        hint: p.full_name ? p.email : undefined,
        group: "People",
        run: () => {
          insert({ kind: "person", id: p.id, entity: null }, mentionLabel(name));
          onMentioned({ id: p.id, email: p.email, name });
        },
      };
    }),
    ...records.map(
      (h): Choice => ({
        key: `r-${h.entity}-${h.id}`,
        icon: <FileText size={16} />,
        title: docTitle(h.title),
        hint: h.subtitle,
        group: "Records and documents",
        run: () => insert({ kind: "record", id: h.id, entity: h.entity }, mentionLabel(docTitle(h.title))),
      }),
    ),
  ];
  useEffect(() => {
    menu.current = { count: () => choices.length, choose: (i) => choices[i]?.run() };
    return () => {
      menu.current = NO_MENU;
    };
  });
  const searching = typed.length >= 2 && (search.isFetching || typed !== query);
  if (!choices.length && !searching) return null;
  return (
    <Popup editor={editor} at={open.from}>
      {choices.length ? (
        <Choices
          choices={choices}
          index={open.index}
          listId={listId}
          label={t("People and records")}
          query={open.query}
          status={searching ? <div className="doc-pop-note">{t("Searching records…")}</div> : null}
        />
      ) : (
        <div className="doc-pop-note" role="status">
          {t("Looking for “{query}”…", { query })}
        </div>
      )}
    </Popup>
  );
}

/** The menu the caret is in, if any. `pickImages` opens the picture chooser; `onMentioned` hears of
 *  each person picked. */
export function EditorMenus({
  editor,
  menu,
  listId,
  pickImages,
  onMentioned,
}: {
  editor: Editor;
  menu: MutableRefObject<MenuApi>;
  listId: string;
  pickImages: () => void;
  onMentioned: (p: Pending) => void;
}) {
  const open = useEditorState({
    editor,
    selector: ({ editor: e }): Open | null => {
      const st = e.isFocused ? menuKey.getState(e.state) : undefined;
      return st?.trigger ? { ...st.trigger, index: st.index } : null;
    },
    equalityFn: (a, b) => a === b || (!!a && !!b && a.char === b.char && a.from === b.from && a.to === b.to && a.query === b.query && a.index === b.index),
  });
  if (!open) return null;
  return open.char === "/" ? (
    <SlashMenu editor={editor} open={open} listId={listId} menu={menu} pickImages={pickImages} />
  ) : (
    <MentionMenu editor={editor} open={open} listId={listId} menu={menu} onMentioned={onMentioned} />
  );
}

type Post = (action: string, body: Record<string, unknown>) => Promise<{ mentioned?: string[] }>;

/** How long after the last pick the people are told: long enough to take a mention back. */
const WAIT = 8000;

/** Tells the people picked from `@` that they are mentioned, once, when they still are. `post` adds a
 *  comment to the document; `url` is where it goes, for the last moments of a page that is closing. */
export function useMentionNotices(editor: Editor | null, file: string, myEmail: string | undefined, post: Post | null, url: string | null) {
  const pending = useRef(new Map<string, Pending>());
  // Told already on this visit: naming someone again in the same sitting does not tell them again.
  const told = useRef(new Set<string>());
  // The words around each pick when it was made, for a page that closes before the editor is read.
  const contexts = useRef(new Map<string, string>());
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const live = useRef({ editor, file, post, url });
  live.current = { editor, file, post, url };

  /** Sends what is pending. On a closing page the requests outlive it (`keepalive`). */
  const flush = useCallback(async (closing: boolean) => {
    clearTimeout(timer.current);
    const { editor: ed, file: f, post: send, url: to } = live.current;
    if (!pending.current.size || !send || !to) return;
    const notices = ed && !ed.isDestroyed ? planNotices(ed.state.doc, pending.current) : [...pending.current.values()].map((person) => ({ person, context: contexts.current.get(person.id) ?? "" }));
    pending.current = new Map();
    contexts.current = new Map();
    const sent: string[] = [];
    const missed: string[] = [];
    await Promise.all(
      notices.map(async ({ person, context }) => {
        const body = { file: f, body: noticeBody(context), mentions: [person.email] };
        try {
          if (closing) {
            await fetch(to, { method: "POST", keepalive: true, credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
            told.current.add(person.id);
            return;
          }
          const res = await send("add_comment", body);
          if ((res.mentioned ?? []).includes(person.email.toLowerCase())) {
            sent.push(person.name);
            told.current.add(person.id);
          } else missed.push(person.name);
        } catch (e) {
          toast(`${person.name} could not be told: ${errorMessage(e)}`, "error");
        }
      }),
    );
    if (sent.length) toast(`Told ${sent.join(", ")}`);
    if (missed.length) toast(`${missed.join(", ")} cannot open this document yet, so they were not told. Share it with them first.`, "info");
  }, []);

  useEffect(() => {
    const hide = () => document.visibilityState === "hidden" && void flush(true);
    const gone = () => void flush(true);
    document.addEventListener("visibilitychange", hide);
    addEventListener("pagehide", gone);
    return () => {
      document.removeEventListener("visibilitychange", hide);
      removeEventListener("pagehide", gone);
      // Leaving the page: whoever is still pending is told.
      void flush(false);
    };
  }, [flush]);

  return useCallback(
    (p: Pending) => {
      if (p.email.toLowerCase() === myEmail?.toLowerCase() || told.current.has(p.id)) return;
      pending.current.set(p.id, p);
      const ed = live.current.editor;
      const at = ed && !ed.isDestroyed ? mentionsIn(ed.state.doc).find((m) => m.attrs.id === p.id) : undefined;
      if (ed && at) contexts.current.set(p.id, contextOf(ed.state.doc, at.pos));
      clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(false), WAIT);
    },
    [flush, myEmail],
  );
}
