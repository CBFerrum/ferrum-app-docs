// Downloads of a live document, and what the format could not carry. The server's exports answer with
// `x-ferrum-not-carried: a; b` (files) or a `not_carried` list (Markdown, `read_document`); after the download
// the person is told once, in their words, in a notice that stays until dismissed. A server that does not say
// (today's) says nothing, and nothing is shown.

import { bootstrap, download, queryString, saveBlob, t } from "@ferrum/client";
import { toast } from "@ferrum/kit";

/** The list a `x-ferrum-not-carried` header names: `;`-separated, trimmed, without empties or repeats. */
export function parseNotCarried(header: string | null | undefined): string[] {
  if (!header) return [];
  return [...new Set(header.split(";").map((s) => s.trim()).filter(Boolean))].slice(0, 40);
}

/** The server's English names for what a format could not carry, in the person's words. */
const WORDS: Record<string, () => string> = {
  comments: () => t("comments"),
  fonts: () => t("fonts"),
  "text sizes": () => t("text sizes"),
  "text colours": () => t("text colours"),
  highlights: () => t("highlights"),
  underline: () => t("underline"),
  "subscript and superscript": () => t("subscript and superscript"),
  alignment: () => t("alignment"),
  "line spacing": () => t("line spacing"),
  "paragraph spacing": () => t("paragraph spacing"),
  indents: () => t("indents"),
  "title and subtitle styles": () => t("title and subtitle styles"),
  callouts: () => t("callouts"),
  "list styles": () => t("list styles"),
  "page setup": () => t("page setup"),
  "header and footer": () => t("header and footer"),
  "page breaks": () => t("page breaks"),
  "cell colours": () => t("cell colours"),
  "column widths": () => t("column widths"),
  "merged cells": () => t("merged cells"),
  "image sizes": () => t("image sizes"),
  "image alignment": () => t("image alignment"),
  "suggested changes": () => t("suggested changes"),
  "links to headings": () => t("links to headings"),
  "links to other documents": () => t("links to other documents"),
  "images (no address to link them to)": () => t("images (no address to link them to)"),
};

const FORMATS: Record<string, () => string> = {
  docx: () => t("The Word file"),
  pdf: () => t("The PDF"),
  html: () => t("The web page"),
  txt: () => t("The text file"),
  md: () => t("The Markdown file"),
};

/** What the person is told, or null when everything was carried. */
export function notCarriedText(format: string, items: string[]): string | null {
  if (!items.length) return null;
  const what = items.map((i) => WORDS[i]?.() ?? i).join(", ");
  return t("{file} could not carry: {what}", { file: (FORMATS[format] ?? FORMATS.docx!)(), what });
}

/** Tells the person what the download could not carry; it stays until they dismiss it. */
export function tellNotCarried(format: string, items: string[]): void {
  const text = notCarriedText(format, items);
  if (text) toast(text, "info", { duration: 2 ** 31 - 1 });
}

/** Downloads an export of the API as a file, and returns what it could not carry (from its response header). It
 *  reads the whole file before saving it, as the kit's `download` does; on any failure the kit's `download` is
 *  asked instead, so errors are reported (and sessions renewed) as everywhere else. */
export async function downloadExport(path: string, fileName: string, query: Record<string, string>): Promise<string[]> {
  let res: Response | null = null;
  try {
    const headers: Record<string, string> = {};
    const app = bootstrap()?.app;
    if (app) headers["x-ferrum-ui"] = `${app.id}@${app.version}`;
    res = await fetch(path + queryString(query), { credentials: "same-origin", headers });
  } catch {
    res = null;
  }
  if (!res?.ok) {
    await download(path, fileName, query);
    return [];
  }
  const named = /filename="?([^";]+)"?/i.exec(res.headers.get("content-disposition") ?? "")?.[1];
  saveBlob(await res.blob(), named ?? fileName);
  return parseNotCarried(res.headers.get("x-ferrum-not-carried"));
}

/** A `not_carried` list from a JSON answer, kept only if it is a list of words. */
export function notCarriedField(v: unknown): string[] {
  return Array.isArray(v) ? parseNotCarried(v.filter((x) => typeof x === "string").join(";")) : [];
}

