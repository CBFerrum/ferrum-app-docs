// A document made from a file: a Word document (.docx), Markdown or plain text. The server makes a
// live document from Markdown (Drive's `create_document`), so a file is turned into Markdown here, in
// the browser, and sent as that. This module is loaded when somebody imports, not with the page.

import { MAX_MARKDOWN, docxToMarkdown, guardLine } from "./docx";
import { t } from "@ferrum/client";

/** What the file chooser offers. */
export const IMPORT_TYPES = ".docx,.md,.markdown,.txt,text/markdown,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** The largest file read: a Word file is a zip, and its text is a small part of it. */
export const MAX_FILE = 25 * 1024 * 1024;

export interface Made {
  title: string;
  markdown: string;
  /** Things left out or changed that the person should know. */
  notes: string[];
}

/** The document's name from the file's: without the extension, at most 120 characters. */
export function titleOf(fileName: string): string {
  const stem = fileName.replace(/\.[A-Za-z0-9]{1,8}$/, "").replace(/[\\/]+/g, " ").replace(/\s+/g, " ").trim();
  return (stem || t("Imported document")).slice(0, 120).trim();
}

/** A Markdown file's front matter (`---` lines at the top), which is not the text: its title, if it has one. */
export function withoutFrontMatter(md: string): { markdown: string; title?: string } {
  const m = /^---[ \t]*\n([\s\S]*?)\n(?:---|\.\.\.)[ \t]*(?:\n|$)/.exec(md);
  if (!m) return { markdown: md };
  const title = /^title:\s*(.+?)\s*$/m.exec(m[1]!)?.[1]?.replace(/^(["'])(.*)\1$/, "$2");
  return { markdown: md.slice(m[0].length).replace(/^\n+/, ""), title: title || undefined };
}

/** Pictures in Markdown become links to where they were (documents keep pictures that are uploaded to
 *  them, not addresses); code stays as it is. */
export function pictureLinks(md: string): { markdown: string; changed: number } {
  let fence = "";
  let changed = 0;
  const lines = md.split("\n").map((line) => {
    const f = /^\s*(`{3,}|~{3,})/.exec(line)?.[1];
    if (f) {
      if (!fence) fence = f[0]!;
      else if (f[0] === fence) fence = "";
      return line;
    }
    if (fence) return line;
    return line.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_, alt: string, src: string) => {
      changed++;
      return `[${alt.trim() || "picture"}](${src})`;
    });
  });
  return { markdown: lines.join("\n"), changed };
}

/** Plain text as paragraphs: blank lines divide them, a line break inside one stays a break, and
 *  nothing in it means Markdown. */
export function textToMarkdown(text: string): string {
  const escape = (s: string) => s.replace(/[\\`*_[\]~<|]/g, "\\$&");
  return text
    .split(/\n{2,}/)
    .map((p) => p.split("\n").map((l) => guardLine(escape(l.trimEnd()))).join("\\\n").trim())
    .filter(Boolean)
    .join("\n\n");
}

const KIND_OF = (name: string) => /\.([A-Za-z0-9]+)$/.exec(name)?.[1]?.toLowerCase() ?? "";

/** The document a file makes. Throws, in words for the person, when it cannot be one. */
export async function importFile(file: File): Promise<Made> {
  const kind = KIND_OF(file.name);
  if (kind === "doc") throw new Error(t("Word 97–2003 files (.doc) cannot be imported. Open it in Word and save it as .docx first."));
  if (["odt", "rtf", "pages", "pdf"].includes(kind)) throw new Error(`.${kind} files cannot be imported. Save it as a Word document (.docx) or as Markdown first.`);
  if (!["docx", "md", "markdown", "txt", "text"].includes(kind)) throw new Error(t("Only Word documents (.docx), Markdown (.md) and text (.txt) files can be imported."));
  if (file.size > MAX_FILE) throw new Error(t("The file is over {value} MB, which is more than can be imported.", { value: MAX_FILE >> 20 }));
  const bytes = new Uint8Array(await file.arrayBuffer());
  const notes: string[] = [];
  let title = titleOf(file.name);
  let markdown: string;
  if (kind === "docx") {
    const made = await docxToMarkdown(bytes);
    markdown = made.markdown;
    if (made.pictures) notes.push((made.pictures === 1 ? t("1 picture was left out: add it again in the document.") : t("{pictures} pictures were left out: add them again in the document.", { pictures: made.pictures })));
  } else {
    const text = new TextDecoder().decode(bytes).replace(/^﻿/, "").replace(/\r\n?/g, "\n");
    if (kind === "txt" || kind === "text") markdown = textToMarkdown(text);
    else {
      const front = withoutFrontMatter(text);
      const pictures = pictureLinks(front.markdown);
      markdown = pictures.markdown;
      title = front.title?.slice(0, 120) ?? title;
      if (pictures.changed) notes.push((pictures.changed === 1 ? t("1 picture is a link now: documents keep pictures that are added to them.") : t("{changed} pictures are a link now: documents keep pictures that are added to them.", { changed: pictures.changed })));
    }
  }
  if (!markdown.trim()) throw new Error(t("The file has no text to import."));
  if (new TextEncoder().encode(markdown).length > MAX_MARKDOWN) throw new Error(t("This file is too long to import: the text is over 1 MB."));
  return { title, markdown, notes };
}
