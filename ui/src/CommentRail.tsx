// The comments beside a live document (Ferrum collaboration.md, C3): threads on its text, in the
// order their text comes, the one in view marked in the text; a new thread on the selected words;
// replies with @mentions; resolving and reopening. Drive keeps them (comments.ts says how); its
// panel ("Comments and history") keeps comments on the whole file.

import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { type Editor, useEditorState } from "@tiptap/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, errorMessage, formatDateTime } from "@ferrum/client";
import { Button, confirmDialog, toast, useLiveEntity } from "@ferrum/kit";
import { Composer, usePeople } from "@ferrum/records";
import { type Anchor, type DriveComment, type Thread, commentsKey, rangeOf, textThreads } from "./comments";
import { type Suggestion, settle, suggestionsIn } from "./suggest";

type Act = (action: string, params: Record<string, unknown>) => Promise<{ id?: string }>;

export interface Draft {
  anchor: Anchor;
  quote: string;
}

export function commentsQuery(file: string) {
  return queryOptions({
    queryKey: ["drive", "comments", file],
    queryFn: ({ signal }) => api.get<{ comments: DriveComment[] }>("/api/app/drive/list_comments", { file }, signal).then((r) => r.comments),
    // Others' comments arrive without a reload.
    refetchInterval: 20_000,
  });
}

export function CommentRail({
  editor,
  file,
  canComment,
  canEdit,
  canManage,
  act,
  draft,
  onDraftDone,
  active,
  setActive,
}: {
  editor: Editor;
  file: string;
  canComment: boolean;
  /** May accept and reject suggestions. */
  canEdit: boolean;
  canManage: boolean;
  act: Act;
  draft: Draft | null;
  onDraftDone: () => void;
  active: string | null;
  setActive: (id: string | null) => void;
}) {
  const qc = useQueryClient();
  const q = useQuery(commentsQuery(file));
  const people = usePeople().data?.users ?? [];
  const [showResolved, setShowResolved] = useState(false);
  const all = useMemo(() => textThreads(q.data ?? []), [q.data]);
  const open = all.filter((t) => !t.root.resolved_at);
  const resolved = all.filter((t) => t.root.resolved_at);
  const openKey = open.map((t) => t.root.id).join();
  // The open threads' text is marked; the one in view more strongly.
  useEffect(() => {
    if (editor.isDestroyed) return;
    editor.view.dispatch(editor.state.tr.setMeta(commentsKey, { threads: open.map((t) => ({ id: t.root.id, anchor: t.root.anchor! })), active }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, openKey, active]);
  // Where each thread's text is now, as the document changes.
  const places = useEditorState({
    editor,
    selector: ({ editor: e }) => new Map(open.map((t) => [t.root.id, e ? rangeOf(e.state, t.root.anchor!) : null] as const)),
    equalityFn: (a, b) => !!b && a.size === b.size && [...a].every(([id, r]) => b.get(id)?.from === r?.from && b.get(id)?.to === r?.to),
  });
  const ordered = [...open].sort((a, b) => (places.get(a.root.id)?.from ?? Infinity) - (places.get(b.root.id)?.from ?? Infinity));
  const refresh = () => qc.invalidateQueries({ queryKey: ["drive", "comments", file] });
  // Comments made meanwhile (also the ones that tell people they are mentioned) show at once; the
  // timer in `commentsQuery` stays for where live updates do not reach.
  useLiveEntity("DriveComment", useCallback(() => void qc.invalidateQueries({ queryKey: ["drive", "comments", file] }), [qc, file]));
  const mentions = (ids: string[]) => people.filter((p) => ids.includes(p.id)).map((p) => p.email);
  const name = (email: string | null) => people.find((p) => p.email === email)?.full_name || email || "Someone";

  /** The thread in view: its text selected and scrolled to. */
  const show = (t: Thread) => {
    setActive(t.root.id);
    const r = places.get(t.root.id);
    if (r) editor.chain().setTextSelection(r).scrollIntoView().run();
  };
  const start = async (body: string, ids: string[]) => {
    if (!draft) return false;
    try {
      const made = await act("add_comment", { file, body, mentions: mentions(ids), anchor: draft.anchor, quote: draft.quote });
      await refresh();
      onDraftDone();
      if (made.id) setActive(made.id);
      return true;
    } catch (e) {
      toast(errorMessage(e), "error");
      return false;
    }
  };
  const reply = (t: Thread) => async (body: string, ids: string[]) => {
    try {
      await act("add_comment", { file, body, mentions: mentions(ids), reply_to: t.root.id });
      await refresh();
      return true;
    } catch (e) {
      toast(errorMessage(e), "error");
      return false;
    }
  };
  const resolve = async (t: Thread, resolved: boolean) => {
    try {
      await act("resolve_comment", { comment: t.root.id, resolved });
      if (resolved && active === t.root.id) setActive(null);
      await refresh();
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  };
  const remove = async (c: DriveComment, thread: boolean) => {
    const ok = await confirmDialog({ title: thread ? "Delete this thread and its replies?" : "Delete this reply?", confirmLabel: "Delete", danger: true });
    if (!ok) return;
    try {
      await act("delete_comment", { comment: c.id });
      await refresh();
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  };

  const one = (c: DriveComment, thread: boolean) => (
    <div className="doc-thread-comment" key={c.id}>
      <div className="doc-thread-head">
        <strong>{name(c.author)}</strong>
        <time className="faint" dateTime={c.created_at}>
          {formatDateTime(c.created_at)}
        </time>
        {(c.mine || canManage) && (
          <button type="button" className="doc-thread-link" onClick={() => void remove(c, thread)} aria-label={thread ? "Delete the thread" : "Delete the reply"}>
            Delete
          </button>
        )}
      </div>
      <p className="doc-thread-body">{c.body}</p>
    </div>
  );

  // Suggestions, from the document itself (the marks everyone shares).
  const proposals = useEditorState({
    editor,
    selector: ({ editor: e }) => (e ? suggestionsIn(e.state.doc) : []),
    equalityFn: (a, b) => !!b && JSON.stringify(a) === JSON.stringify(b),
  });
  const decide = (s: Suggestion, accept: boolean) => editor.view.dispatch(settle(editor.state, s.id, accept));
  const decideAll = (accept: boolean) => {
    for (const s of [...proposals].reverse()) editor.view.dispatch(settle(editor.state, s.id, accept));
  };
  const showProposal = (s: Suggestion) => editor.chain().setTextSelection({ from: s.from, to: s.to }).scrollIntoView().run();

  if (!draft && !all.length && !proposals.length) return null;
  return (
    <aside className="doc-rail" aria-label="Comments and suggestions on the text">
      {proposals.length > 0 && (
        <section className="doc-proposals" aria-label="Suggestions">
          <div className="doc-proposals-head">
            <strong>Suggestions ({proposals.length})</strong>
            {canEdit && proposals.length > 1 && (
              <span className="doc-thread-actions">
                <Button size="sm" variant="ghost" onClick={() => decideAll(true)}>
                  Accept all
                </Button>
                <Button size="sm" variant="ghost" onClick={() => decideAll(false)}>
                  Reject all
                </Button>
              </span>
            )}
          </div>
          <ul className="doc-threads">
            {proposals.map((s) => (
              <li key={s.id} className="doc-thread doc-proposal">
                <button type="button" className="doc-proposal-what" onClick={() => showProposal(s)}>
                  {s.deleted && s.inserted ? (
                    <>
                      Replace <del className="doc-del">{s.deleted}</del> with <ins className="doc-ins">{s.inserted}</ins>
                    </>
                  ) : s.inserted ? (
                    <>
                      Add <ins className="doc-ins">{s.inserted}</ins>
                    </>
                  ) : (
                    <>
                      Remove <del className="doc-del">{s.deleted}</del>
                    </>
                  )}
                </button>
                <div className="doc-thread-head">
                  <strong>{s.name || "Someone"}</strong>
                  {s.at && (
                    <time className="faint" dateTime={s.at}>
                      {formatDateTime(s.at)}
                    </time>
                  )}
                </div>
                {canEdit && (
                  <div className="doc-thread-actions">
                    <Button size="sm" variant="ghost" onClick={() => decide(s, false)}>
                      Reject
                    </Button>
                    <Button size="sm" onClick={() => decide(s, true)}>
                      Accept
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
      {draft && (
        <section className="doc-thread is-active" aria-label="New comment">
          <blockquote className="doc-thread-quote">{draft.quote}</blockquote>
          <Composer people={people} onPost={start} />
          <Button size="sm" variant="ghost" onClick={onDraftDone}>
            Cancel
          </Button>
        </section>
      )}
      <ul className="doc-threads">
        {ordered.map((t) => {
          const here = places.get(t.root.id);
          return (
            <li key={t.root.id} className={`doc-thread${active === t.root.id ? " is-active" : ""}`}>
              <button type="button" className="doc-thread-quote" onClick={() => show(t)} aria-label={`Show the text: ${t.root.quote ?? ""}`}>
                {t.root.quote}
              </button>
              {!here && <p className="faint">The text it was on has been removed.</p>}
              {one(t.root, true)}
              {t.replies.map((r) => one(r, false))}
              {canComment && active === t.root.id && <Composer people={people} onPost={reply(t)} />}
              <div className="doc-thread-actions">
                {canComment && active !== t.root.id && (
                  <Button size="sm" variant="ghost" onClick={() => show(t)}>
                    Reply
                  </Button>
                )}
                {canComment && (
                  <Button size="sm" onClick={() => void resolve(t, true)}>
                    Resolve
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {resolved.length > 0 && (
        <details className="doc-resolved" open={showResolved} onToggle={(e) => setShowResolved(e.currentTarget.open)}>
          <summary>Resolved ({resolved.length})</summary>
          <ul className="doc-threads">
            {resolved.map((t) => (
              <li key={t.root.id} className="doc-thread is-resolved">
                <blockquote className="doc-thread-quote">{t.root.quote}</blockquote>
                {one(t.root, true)}
                {t.replies.map((r) => one(r, false))}
                <p className="faint">Resolved by {name(t.root.resolved_by)}</p>
                {canComment && (
                  <Button size="sm" variant="ghost" onClick={() => void resolve(t, false)}>
                    Reopen
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </aside>
  );
}
