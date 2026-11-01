import { describe, expect, it } from "vitest";
import { type DocItem, carriesFiles, changedFrom, isDocument, isFolder, narrow, ordered, ownerName, pick, VIEWS } from "./docslist";
import { LIVE_DOC_TYPE } from "./livedocs";

const item = (id: string, extra: Partial<DocItem> = {}): DocItem => ({ id, name: `${id}.fdoc`, kind: "file", content_type: LIVE_DOC_TYPE, owner: "ana@acme.test", modified_at: "2026-11-01T09:00:00Z", permission: "Edit", ...extra });
// A Sunday afternoon in the person's own clock.
const now = new Date(2026, 10, 1, 15, 0, 0);
const at = (day: number, hour = 9) => new Date(2026, 9, day, hour).toISOString();

describe("Docs' lists", () => {
  it("tell documents from folders and other files", () => {
    expect([isDocument(item("a")), isDocument(item("b", { content_type: "application/pdf" })), isDocument(item("c", { kind: "folder", content_type: null })), isFolder(item("c", { kind: "folder" }))]).toEqual([true, false, false, true]);
  });

  it("take the choice a link names, else the first", () => {
    expect([pick(VIEWS, "shared"), pick(VIEWS, "nope"), pick(VIEWS, null)]).toEqual(["shared", "recent", "recent"]);
  });

  it("narrow to the owner chosen", () => {
    const list = [item("mine", { owner: "ANA@acme.test" }), item("theirs", { owner: "ben@acme.test" }), item("nobody", { owner: null })];
    const ids = (owner: "any" | "me" | "others") => narrow(list, { owner, changed: "any", me: "ana@acme.test" }).map((i) => i.id);
    expect([ids("any"), ids("me"), ids("others")]).toEqual([["mine", "theirs", "nobody"], ["mine"], ["theirs", "nobody"]]);
    // Without knowing who is asking, nothing is filtered by owner.
    expect(narrow(list, { owner: "me", changed: "any", me: undefined })).toHaveLength(3);
  });

  it("narrow to what changed lately, by the person's days", () => {
    const list = [item("today", { modified_at: new Date(2026, 10, 1, 8).toISOString() }), item("yesterday", { modified_at: new Date(2026, 9, 31, 22).toISOString() }), item("week", { modified_at: at(26) }), item("old", { modified_at: at(5) })];
    const ids = (changed: "any" | "today" | "7" | "30") => narrow(list, { owner: "any", changed, me: "x", now }).map((i) => i.id);
    expect(ids("today")).toEqual(["today"]);
    expect(ids("7")).toEqual(["today", "yesterday", "week"]);
    expect(ids("30")).toEqual(["today", "yesterday", "week", "old"]);
    expect(ids("any")).toHaveLength(4);
  });

  it("say the first day a choice covers, for Drive's search", () => {
    expect([changedFrom("any", now), changedFrom("today", now), changedFrom("7", now), changedFrom("30", now)]).toEqual([undefined, "2026-11-01", "2026-10-26", "2026-10-03"]);
  });

  it("keep the server's order unless asked for another", () => {
    const list = [item("b", { name: "Beta.fdoc", modified_at: at(5) }), item("a", { name: "alpha.fdoc", modified_at: at(9) }), item("c", { name: "Plan 10.fdoc", modified_at: at(1) }), item("d", { name: "Plan 2.fdoc", modified_at: at(3) })];
    expect(ordered(list, "default").map((i) => i.id)).toEqual(["b", "a", "c", "d"]);
    expect(ordered(list, "name").map((i) => i.id)).toEqual(["a", "b", "d", "c"]);
    expect(ordered(list, "changed").map((i) => i.id)).toEqual(["a", "b", "d", "c"]);
    expect(list.map((i) => i.id)).toEqual(["b", "a", "c", "d"]);
  });

  it("name an owner as a person would", () => {
    const people = [{ email: "ben@acme.test", full_name: "Ben Cole" }, { email: "cy@acme.test", full_name: "" }];
    expect([ownerName("ANA@acme.test", "ana@acme.test", people), ownerName("ben@acme.test", "ana@acme.test", people), ownerName("cy@acme.test", "ana@acme.test", people), ownerName("who@acme.test", undefined, people), ownerName(null, "ana@acme.test", people)]).toEqual(["You", "Ben Cole", "cy@acme.test", "who@acme.test", ""]);
  });

  it("know a drag of files from a drag of text", () => {
    expect([carriesFiles(["Files"]), carriesFiles(["text/plain", "Files"]), carriesFiles(["text/plain"]), carriesFiles(null)]).toEqual([true, true, false, false]);
  });
});
