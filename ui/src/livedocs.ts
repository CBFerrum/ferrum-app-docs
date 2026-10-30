// Documents edited together live (Drive's `.fdoc` files; Ferrum docs/plan/collaboration.md, C3):
// what Docs' pages share without loading the editor, and what Drive says about a file.

/** Drive's type for them. */
export const LIVE_DOC_TYPE = "application/vnd.ferrum.doc";

export const isLiveDoc = (name: string) => /\.fdoc$/i.test(name);

/** The name people see: without `.fdoc`. */
export function docTitle(name: string): string {
  return name.replace(/\.fdoc$/i, "");
}

/** A Drive item as `/api/app/drive/item_info` describes it. */
export interface ItemInfo {
  id: string;
  name: string;
  kind: "file" | "folder";
  parent: string | null;
  owner?: string | null;
  modified_at: string;
  modified_by?: string | null;
  permission: string;
  content_type?: string | null;
}

const LEVELS = ["View", "Comment", "Edit", "Manage"];
/** Whether a Drive permission includes `needed`. */
export const allows = (permission: string, needed: string) => LEVELS.indexOf(permission) >= LEVELS.indexOf(needed);

/** A search snippet's parts: the words found are between « and » (Drive's search). */
export function snippetParts(snippet: string): { text: string; hit: boolean }[] {
  return snippet
    .split(/(«[^»]*»)/g)
    .filter(Boolean)
    .map((p) => (p.startsWith("«") && p.endsWith("»") ? { text: p.slice(1, -1), hit: true } : { text: p, hit: false }));
}
