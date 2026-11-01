// A document's versions as Drive keeps them, and which two the history page compares. Pure, so the
// choices are tested without a browser.

/** One of Drive's `list_versions`, newest first there. */
export interface Version {
  id: string;
  version: number;
  size: number;
  author: string | null;
  comment: string | null;
  created_at: string;
  /** The newest saved version. */
  current: boolean;
}

/** What a side of a comparison is: a saved version, the text as it is now (which may be ahead of the
 *  newest saved version while people are typing), or nothing (before the first version). */
export type Which = number | "current" | "start";

/** What the chosen version is compared with: the one before it, the text now, or another version. */
export type Against = "previous" | "current" | number;

export function parseAgainst(raw: string | null): Against {
  if (raw === "current") return "current";
  const n = Number(raw);
  return raw && Number.isInteger(n) && n > 0 ? n : "previous";
}

/** The version a link names, else the newest. */
export function chosen(versions: Version[], raw: string | null): Version | null {
  const n = Number(raw);
  return versions.find((v) => v.version === n) ?? versions[0] ?? null;
}

/** The older and the newer side of comparing version `v` with `against`. */
export function sides(versions: Version[], v: number, against: Against): { older: Which; newer: Which } {
  if (against === "current") return { older: v, newer: "current" };
  if (typeof against === "number" && against !== v && versions.some((x) => x.version === against)) {
    return against < v ? { older: against, newer: v } : { older: v, newer: against };
  }
  const before = versions
    .map((x) => x.version)
    .filter((n) => n < v)
    .sort((a, b) => b - a)[0];
  return { older: before ?? "start", newer: v };
}

/** What a side is called above its page. */
export const sideName = (w: Which) => (w === "current" ? "The text now" : w === "start" ? "Nothing yet" : `Version ${w}`);

/** A size in plain units. */
export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** The change in words, as a sentence: "12 words added, 3 removed". */
export function summary(added: number, removed: number): string {
  const n = (c: number) => `${c} ${c === 1 ? "word" : "words"}`;
  if (!added && !removed) return "No changes in the words";
  return [added ? `${n(added)} added` : "", removed ? (added ? `${removed} removed` : `${n(removed)} removed`) : ""].filter(Boolean).join(", ");
}
