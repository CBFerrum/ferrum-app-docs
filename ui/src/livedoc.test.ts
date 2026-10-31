import { describe, expect, it } from "vitest";
import { initials } from "@ferrum/client";
import { textThreads, type DriveComment } from "./comments";
import { allows, docTitle, snippetParts } from "./livedocs";
import { cleanHref, statusText } from "./LiveDoc";

describe("live documents", () => {
  it("are named without their extension", () => {
    expect([docTitle("Q4 plan.fdoc"), docTitle("notes.FDOC"), docTitle("a.fdoc.txt")]).toEqual(["Q4 plan", "notes", "a.fdoc.txt"]);
    expect([initials("Ana Rao"), initials("  raj  "), initials("Mary Ann de la Cruz"), initials("")]).toEqual(["AR", "R", "MC", "?"]);
  });

  it("follow Drive's permissions", () => {
    expect([allows("Manage", "Edit"), allows("Edit", "Edit"), allows("Comment", "Edit"), allows("View", "Manage")]).toEqual([true, true, false, false]);
  });

  it("show where search found their words", () => {
    expect(snippetParts("Risks · The «venue» may «move»")).toEqual([
      { text: "Risks · The ", hit: false },
      { text: "venue", hit: true },
      { text: " may ", hit: false },
      { text: "move", hit: true },
    ]);
    expect(snippetParts("no markers")).toEqual([{ text: "no markers", hit: false }]);
  });

  it("say whether everything typed is saved", () => {
    const s = { online: true, loaded: true, unsaved: false, closed: false };
    expect(statusText(s)).toBe("Saved");
    expect(statusText({ ...s, unsaved: true })).toBe("Saving…");
    expect(statusText({ ...s, online: false })).toBe("Reconnecting…");
    expect(statusText({ ...s, online: false, unsaved: true })).toMatch(/^Offline: your changes are kept in this tab/);
    expect(statusText({ ...s, online: false, unsaved: true }, true)).toMatch(/^Offline: your changes are kept in this browser/);
    expect(statusText({ ...s, loaded: false })).toBe("Opening…");
    expect(statusText({ ...s, closed: true })).toBe("Not connected");
  });

  it("gather comments on the text into threads", () => {
    const c = (id: string, extra: Partial<DriveComment>): DriveComment => ({
      id, author: "a@x.test", body: id, created_at: "2026-10-31T10:00:00Z", mine: false, reply_to: null, anchor: null, quote: null, resolved_by: null, resolved_at: null, ...extra,
    });
    const anchor = { from: {}, to: {} };
    const list = [c("file-wide", {}), c("t1", { anchor, quote: "a" }), c("r1", { reply_to: "t1" }), c("t2", { anchor, quote: "b" }), c("r2", { reply_to: "t1" })];
    const threads = textThreads(list);
    expect(threads.map((t) => [t.root.id, t.replies.map((r) => r.id)])).toEqual([["t1", ["r1", "r2"]], ["t2", []]]);
  });

  it("link only to the web and to mail", () => {
    expect(cleanHref("example.com/a")).toBe("https://example.com/a");
    expect(cleanHref(" https://x.test ")).toBe("https://x.test");
    expect(cleanHref("ana@acme.test")).toBe("mailto:ana@acme.test");
    expect(cleanHref("mailto:ana@acme.test")).toBe("mailto:ana@acme.test");
    expect(cleanHref("javascript:alert(1)")).toBeNull();
    expect(cleanHref("data:text/html,x")).toBeNull();
    expect(cleanHref("  ")).toBeNull();
  });
});
