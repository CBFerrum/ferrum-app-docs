import * as decoding from "lib0/decoding";
import * as encoding from "lib0/encoding";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as awarenessProtocol from "y-protocols/awareness";
import * as syncProtocol from "y-protocols/sync";
import * as Y from "yjs";
import { CoeditSession, type Keeper, type SocketLike, backoff, othersIn, socketUrl } from "./coedit";
import { statusText } from "./LiveDoc";

/** A socket the test drives: what the page sent, and the server's side of the conversation. */
class FakeSocket implements SocketLike {
  binaryType = "blob";
  readyState = 0;
  sent: (string | Uint8Array)[] = [];
  onopen: ((e: unknown) => void) | null = null;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onclose: ((e: { code: number; reason: string }) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  constructor(readonly url: string) {}
  send(data: string | Uint8Array) {
    this.sent.push(data);
  }
  close() {
    this.readyState = 3;
  }
  open() {
    this.readyState = 1;
    this.onopen?.({});
  }
  text(v: unknown) {
    this.onmessage?.({ data: JSON.stringify(v) });
  }
  binary(b: Uint8Array) {
    this.onmessage?.({ data: b.slice().buffer });
  }
  drop(code = 1006) {
    this.readyState = 3;
    this.onclose?.({ code, reason: "" });
  }
  binaries() {
    return this.sent.filter((m): m is Uint8Array => typeof m !== "string");
  }
}

/** The server's copy of the document, answering the page as coedit.rs does. */
function server(doc: Y.Doc) {
  const step1 = () => {
    const e = encoding.createEncoder();
    encoding.writeVarUint(e, 0);
    syncProtocol.writeSyncStep1(e, doc);
    return encoding.toUint8Array(e);
  };
  /** Takes the page's messages: answers its step 1, applies its changes. Returns the answers. */
  const take = (msgs: Uint8Array[]) => {
    const answers: Uint8Array[] = [];
    for (const m of msgs) {
      const d = decoding.createDecoder(m);
      if (decoding.readVarUint(d) !== 0) continue;
      const e = encoding.createEncoder();
      encoding.writeVarUint(e, 0);
      syncProtocol.readSyncMessage(d, e, doc, "page");
      if (encoding.length(e) > 1) answers.push(encoding.toUint8Array(e));
    }
    return answers;
  };
  return { step1, take };
}

const ready = { ready: true, access: "write", user: { id: "u1", name: "Ana Rao", color: "#1d4ed8" } };
const words = (doc: Y.Doc) => doc.getText("t").toString();

describe("documents edited together", () => {
  let sockets: FakeSocket[];
  let session: CoeditSession;
  const open = () => {
    session = new CoeditSession("ws://erp.test/ws/docs/drive/d1", () => "token-1", (url) => {
      const s = new FakeSocket(url);
      sockets.push(s);
      return s;
    });
    return sockets[sockets.length - 1];
  };
  /** Connects as the server would: ready, its step 1, its answer to the page's step 1. */
  const connect = (ws: FakeSocket, srv: ReturnType<typeof server>, access = "write") => {
    ws.open();
    ws.text({ ...ready, access });
    ws.binary(srv.step1());
    for (const a of srv.take(ws.binaries())) ws.binary(a);
  };

  beforeEach(() => {
    sockets = [];
    vi.useFakeTimers();
  });
  afterEach(() => {
    session?.destroy();
    vi.useRealTimers();
  });

  it("signs in with the first message, never in the address", () => {
    const ws = open();
    expect(ws.url).toBe("ws://erp.test/ws/docs/drive/d1");
    ws.open();
    expect(ws.sent).toEqual([JSON.stringify({ auth: "token-1" })]);
    expect(socketUrl("drive", "a b", { protocol: "https:", host: "erp.test" })).toBe("wss://erp.test/ws/docs/drive/a%20b");
  });

  it("lets the session cookie sign in on an app's own pages, and stops when signed out", () => {
    const ws = new FakeSocket("ws://erp.test/ws/docs/drive/d1");
    session = new CoeditSession(ws.url, () => null, () => (sockets.push(ws), ws));
    ws.open();
    expect(ws.sent.filter((m) => typeof m === "string" && m.includes("auth"))).toEqual([]);
    session.destroy();
    const gone = new CoeditSession(ws.url, () => undefined, () => new FakeSocket(ws.url));
    expect(gone.getState()).toMatchObject({ closed: true });
    gone.destroy();
  });

  it("loads the server's content and is saved once the server says so", () => {
    const remote = new Y.Doc();
    remote.getText("t").insert(0, "Hello");
    const srv = server(remote);
    const ws = open();
    connect(ws, srv);
    expect(words(session.doc)).toBe("Hello");
    expect(session.state).toMatchObject({ online: true, loaded: true, access: "write", me: ready.user });
    expect(session.state.unsaved).toBe(true);
    ws.text({ stored: 1 });
    expect(session.state.unsaved).toBe(false);
    session.doc.getText("t").insert(5, " world");
    expect(session.state.unsaved).toBe(true);
    srv.take(ws.binaries());
    expect(words(remote)).toBe("Hello world");
    ws.text({ stored: 2 });
    expect(session.state.unsaved).toBe(false);
  });

  it("keeps changes made offline and sends them when the connection is back", () => {
    const remote = new Y.Doc();
    const srv = server(remote);
    const ws = open();
    connect(ws, srv);
    ws.text({ stored: 1 });
    session.doc.getText("t").insert(0, "sent but not stored ");
    ws.drop();
    expect(session.state).toMatchObject({ online: false, unsaved: true });
    session.doc.getText("t").insert(0, "offline ");
    vi.advanceTimersByTime(30_000);
    expect(sockets.length).toBe(2);
    const again = sockets[1];
    connect(again, srv);
    expect(words(remote)).toBe(words(session.doc));
    expect(words(remote)).toBe("offline sent but not stored ");
    expect(session.state.unsaved).toBe(true);
    again.text({ stored: 1 });
    expect(session.state.unsaved).toBe(false);
  });

  it("stops for good when the document is gone or access ended", () => {
    const ws = open();
    ws.open();
    ws.drop(4404);
    expect(session.state).toMatchObject({ closed: true, online: false });
    expect(session.state.error).toMatch(/does not exist/);
    vi.advanceTimersByTime(120_000);
    expect(sockets.length).toBe(1);
  });

  it("says when changes cannot be saved because access is now view only", () => {
    const srv = server(new Y.Doc());
    const ws = open();
    connect(ws, srv);
    ws.drop();
    session.doc.getText("t").insert(0, "typed while away");
    vi.advanceTimersByTime(30_000);
    connect(sockets[1], srv, "read");
    expect(session.state.access).toBe("read");
    expect(session.state.error).toMatch(/not saved/);
  });

  it("sends only its own cursor, and notices a connection that died silently", () => {
    const ws = open();
    connect(ws, server(new Y.Doc()));
    const before = ws.sent.length;
    const other = new awarenessProtocol.Awareness(new Y.Doc());
    other.setLocalState({ user: { id: "u2", name: "Raj Patel", color: "#047857" } });
    const e = encoding.createEncoder();
    encoding.writeVarUint(e, 1);
    encoding.writeVarUint8Array(e, awarenessProtocol.encodeAwarenessUpdate(other, [other.clientID]));
    ws.binary(encoding.toUint8Array(e));
    expect(othersIn(session.awareness).map((p) => p.name)).toEqual(["Raj Patel"]);
    expect(ws.sent.length, "someone else's cursor is not sent back").toBe(before);
    session.awareness.setLocalStateField("cursor", 3);
    expect(ws.sent.length).toBe(before + 1);
    vi.advanceTimersByTime(20_000);
    expect(ws.sent.length, "a question keeps the line checked").toBe(before + 2);
    vi.advanceTimersByTime(40_000);
    expect(session.state.online).toBe(false);
    vi.advanceTimersByTime(30_000);
    expect(sockets.length).toBe(2);
    other.destroy();
  });

  it("stops promising to keep changes when the browser cannot, until it can again", async () => {
    let full = true;
    const keeper: Keeper = {
      load: async () => null,
      save: async () => {
        if (full) throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
      },
      drop: async () => undefined,
    };
    session = new CoeditSession("ws://erp.test/ws/docs/drive/d1", () => "token-1", (url) => {
      const s = new FakeSocket(url);
      sockets.push(s);
      return s;
    }, keeper);
    const ws = sockets[0]!;
    connect(ws, server(new Y.Doc()));
    ws.text({ stored: 1 });
    ws.drop();
    expect(session.keeps).toBe(true);
    session.doc.getText("t").insert(0, "written offline");
    await vi.advanceTimersByTimeAsync(500);
    expect(session.state.keepFailed).toBe(true);
    expect(session.keeps).toBe(false);
    expect(statusText(session.state, session.keeps)).toBe("Offline: your changes are kept in this tab until the connection is back");
    full = false;
    session.doc.getText("t").insert(0, "more ");
    await vi.advanceTimersByTimeAsync(500);
    expect(session.keeps).toBe(true);
  });

  it("lets go of a kept copy it cannot read, rather than failing at every visit", async () => {
    const key = "ws://erp.test/ws/docs/drive/d1|u1";
    const kept = new Map<string, Uint8Array>([[key, new Uint8Array(12).fill(255)]]);
    const keeper: Keeper = { load: async (k) => kept.get(k) ?? null, save: async (k, s) => void kept.set(k, s), drop: async (k) => void kept.delete(k) };
    session = new CoeditSession("ws://erp.test/ws/docs/drive/d1", () => "token-1", (url) => {
      const s = new FakeSocket(url);
      sockets.push(s);
      return s;
    }, keeper);
    connect(sockets[0]!, server(new Y.Doc()));
    await vi.advanceTimersByTimeAsync(10);
    expect(kept.has(key)).toBe(false);
    expect(session.state).toMatchObject({ error: null, loaded: true });
  });

  it("keeps unsaved changes in the browser for the next visit, and forgets them once stored", async () => {
    // The browser's store, as IndexedDB would keep it (merging what tabs keep).
    const kept = new Map<string, Uint8Array>();
    const keeper: Keeper = {
      load: async (k) => kept.get(k) ?? null,
      save: async (k, s) => void kept.set(k, kept.has(k) ? Y.mergeUpdates([kept.get(k)!, s]) : s),
      drop: async (k) => void kept.delete(k),
    };
    const remote = new Y.Doc();
    const srv = server(remote);
    const visit = (user = ready.user) => {
      session = new CoeditSession("ws://erp.test/ws/docs/drive/d1", () => "token-1", (url) => {
        const s = new FakeSocket(url);
        sockets.push(s);
        return s;
      }, keeper);
      const ws = sockets[sockets.length - 1];
      ws.open();
      return { ws, user };
    };
    const key = "ws://erp.test/ws/docs/drive/d1|u1";
    expect(new CoeditSession("ws://x/ws/docs/drive/d", () => null, () => new FakeSocket("x"), null).keeps).toBe(false);

    // Typed offline, then the tab is closed: the browser keeps it.
    let { ws } = visit();
    expect(session.keeps).toBe(true);
    connect(ws, srv);
    ws.text({ stored: 1 });
    ws.drop();
    session.doc.getText("t").insert(0, "written on the train");
    await vi.advanceTimersByTimeAsync(500);
    expect(kept.has(key)).toBe(true);
    session.destroy();
    expect(words(remote)).toBe("");

    // Someone else signing in on this browser does not get it.
    ({ ws } = visit());
    ws.text({ ...ready, user: { id: "u2", name: "Raj Patel", color: "#047857" } });
    await vi.advanceTimersByTimeAsync(10);
    expect(words(session.doc)).toBe("");
    session.destroy();

    // The next visit sends it; once stored, the browser forgets it.
    ({ ws } = visit());
    connect(ws, srv);
    await vi.advanceTimersByTimeAsync(10);
    for (const a of srv.take(ws.binaries())) ws.binary(a);
    expect(words(remote)).toBe("written on the train");
    ws.text({ stored: 9 });
    await vi.advanceTimersByTimeAsync(500);
    expect(kept.has(key)).toBe(false);
    session.destroy();

    // With view access only, what was kept is let go, and the person is told.
    kept.set(key, Y.encodeStateAsUpdate((() => {
      const d = new Y.Doc();
      d.getText("t").insert(0, "too late");
      return d;
    })()));
    ({ ws } = visit());
    connect(ws, srv, "read");
    await vi.advanceTimersByTimeAsync(10);
    expect(session.state.error).toMatch(/not saved/);
    expect(kept.has(key)).toBe(false);
    expect(words(session.doc)).not.toContain("too late");
  });

  it("waits longer after each failure, up to 30 seconds", () => {
    expect([0, 1, 2, 10].map((a) => backoff(a, () => 1))).toEqual([1000, 2000, 4000, 30_000]);
    expect(backoff(3, () => 0)).toBe(4000);
  });
});
