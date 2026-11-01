// What Docs' home shows of Drive's lists: which of them are documents, who they belong to, how they
// are narrowed and ordered. Pure, so the choices (all kept in the page's address) are tested without
// a browser.

import { LIVE_DOC_TYPE } from "./livedocs";

/** A Drive item as the lists give it. */
export interface DocItem {
  id: string;
  name: string;
  kind?: "file" | "folder";
  content_type?: string | null;
  owner?: string | null;
  modified_at: string;
  modified_by?: string | null;
  permission: string;
  shared_by?: string | null;
  snippet?: string;
  starred?: boolean;
  /** Where search found it. */
  path?: string;
  is_team?: boolean;
}

export const isFolder = (i: DocItem) => i.kind === "folder";
export const isDocument = (i: DocItem) => i.kind !== "folder" && i.content_type === LIVE_DOC_TYPE;

export const VIEWS = [
  { id: "recent", label: "Recent" },
  { id: "shared", label: "Shared with me" },
  { id: "starred", label: "Starred" },
  { id: "all", label: "All documents" },
] as const;
export type View = (typeof VIEWS)[number]["id"];

export const OWNERS = [
  { id: "any", label: "Anyone" },
  { id: "me", label: "Me" },
  { id: "others", label: "Others" },
] as const;
export type Owner = (typeof OWNERS)[number]["id"];

export const CHANGES = [
  { id: "any", label: "Any time" },
  { id: "today", label: "Today" },
  { id: "7", label: "Past 7 days" },
  { id: "30", label: "Past 30 days" },
] as const;
export type Changed = (typeof CHANGES)[number]["id"];

export const SORTS = [
  { id: "default", label: "Default order" },
  { id: "changed", label: "Last changed" },
  { id: "name", label: "Name" },
] as const;
export type Sort = (typeof SORTS)[number]["id"];

/** The choice a link names, else the first (the default). */
export function pick<T extends { id: string }>(options: readonly T[], raw: string | null): T["id"] {
  return options.find((o) => o.id === raw)?.id ?? options[0]!.id;
}

/** The start of the day `back` days before `now`'s, in the person's own clock. */
function dayStart(now: Date, back: number): Date {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  d.setDate(d.getDate() - back);
  return d;
}

/** The day a choice of "changed" starts on, as YYYY-MM-DD (what Drive's search takes); none for any time. */
export function changedFrom(changed: Changed, now = new Date()): string | undefined {
  if (changed === "any") return undefined;
  const d = dayStart(now, changed === "today" ? 0 : Number(changed) - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** The items who own, and when changed, the choices allow. */
export function narrow(items: DocItem[], o: { owner: Owner; changed: Changed; me: string | undefined; now?: Date }): DocItem[] {
  const me = o.me?.toLowerCase();
  const since = o.changed === "any" ? null : dayStart(o.now ?? new Date(), o.changed === "today" ? 0 : Number(o.changed) - 1).getTime();
  return items.filter((i) => {
    if (o.owner !== "any" && me) {
      const mine = i.owner?.toLowerCase() === me;
      if (o.owner === "me" ? !mine : mine) return false;
    }
    return since === null || Date.parse(i.modified_at) >= since;
  });
}

/** The items in the order chosen; "default" keeps the server's (recent work first, newest share first). */
export function ordered(items: DocItem[], sort: Sort): DocItem[] {
  if (sort === "name") return [...items].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true }));
  if (sort === "changed") return [...items].sort((a, b) => Date.parse(b.modified_at) - Date.parse(a.modified_at));
  return items;
}

/** Whose a document is, in a name: "You", their name, else their address. */
export function ownerName(email: string | null | undefined, me: string | undefined, people: { email: string; full_name: string }[]): string {
  if (!email) return "";
  if (email.toLowerCase() === me?.toLowerCase()) return "You";
  return people.find((p) => p.email.toLowerCase() === email.toLowerCase())?.full_name || email;
}

/** Whether a drag carries files (and not, say, selected text). */
export const carriesFiles = (types: ArrayLike<string> | null | undefined) => Array.from(types ?? []).includes("Files");
