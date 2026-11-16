// A date in the text as a chip: stored as the date itself (`2026-11-12`), drawn in the reader's own language
// and calendar, so it reads right in another locale and the exporters can write it as they like. Today's date
// from the `/` menu or Insert; the date is changed from the chip's small bar (ContextBars.tsx).

import { Node, mergeAttributes } from "@tiptap/core";
import { formatMoment, fromZonedInput, t, toZonedInput } from "@ferrum/client";
import { suggestingRefuses } from "./suggest";

/** A date as `YYYY-MM-DD` when it is a real one, else null. */
export function cleanDate(v: unknown): string | null {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T12:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v ? null : v;
}

/** Today on the clock the page shows times on (the person's own zone, else the workspace's), as stored. */
export function today(now = new Date()): string {
  return toZonedInput(now.toISOString()).slice(0, 10);
}

/** The date as the reader says it ("12 November 2026", "١٢ نوفمبر ٢٠٢٦"): noon of that day on the clock it is shown on, so
 *  no time zone moves the day. */
export function dateText(date: string): string {
  return formatMoment(fromZonedInput(`${date}T12:00`), { dateStyle: "long" });
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    dateChip: {
      insertDate: (date?: string) => ReturnType;
      setDate: (date: string) => ReturnType;
    };
  }
}

export const DateChip = Node.create({
  name: "dateChip",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      date: {
        default: null,
        parseHTML: (el: HTMLElement) => cleanDate(el.getAttribute("datetime")),
        renderHTML: (a: Record<string, unknown>) => (cleanDate(a.date) ? { datetime: cleanDate(a.date)! } : {}),
      },
    };
  },
  parseHTML() {
    return [{ tag: "time[data-date-chip]" }];
  },
  renderHTML({ node, HTMLAttributes }) {
    const date = cleanDate(node.attrs.date);
    return ["time", mergeAttributes(HTMLAttributes, { "data-date-chip": "", class: "doc-chip doc-date" }), date ? dateText(date) : t("No date")];
  },
  renderText({ node }) {
    const date = cleanDate(node.attrs.date);
    return date ? dateText(date) : "";
  },
  addCommands() {
    return {
      insertDate:
        (date) =>
        ({ commands, editor, dispatch }) =>
          dispatch && suggestingRefuses(editor) ? false : commands.insertContent({ type: "dateChip", attrs: { date: cleanDate(date) ?? today() } }),
      setDate:
        (date) =>
        ({ commands }) =>
          cleanDate(date) ? commands.updateAttributes("dateChip", { date: cleanDate(date) }) : false,
    };
  },
});
