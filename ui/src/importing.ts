// A document made from a file: a Word document (.docx), Markdown or plain text. The server makes a
// live document from Markdown (Drive's `create_document`), so a file is turned into Markdown here, in
// the browser, and sent as that. This module is loaded when somebody imports, not with the page.

import { MAX_MARKDOWN, guardLine } from "./docx";
import { type Converted, convertDocx, readPicture } from "./docximport";
import { getSchema } from "@tiptap/core";
import { prosemirrorJSONToYXmlFragment } from "@tiptap/y-tiptap";
import * as Y from "yjs";
import { CoeditSession, socketUrl } from "./coedit";
import { writeSetup } from "./page";
import { REGIONS, regionExtensions } from "./regions";
import { documentExtensions } from "./schema";
import { uploadImage } from "./upload";
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
  /** A Word file's content, which the page puts in the document once it is made (fillDocument). */
  docx?: { converted: Converted; bytes: Uint8Array };
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
  let docx: Made["docx"];
  if (kind === "docx") {
    // A Word file is made into the document itself, not into Markdown: the server is given a placeholder and
    // the page fills the document in (fillDocument).
    const converted = await convertDocx(bytes);
    notes.push(...converted.notes);
    docx = { converted, bytes };
    markdown = t("Importing…");
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
  return { title, markdown, notes, docx };
}

/** Replaces the picture placeholders of the converted blocks with the uploaded pictures; a picture that could not be kept is removed (and counted). */
function withPictures(nodes: JSONLike[], found: Map<string, { id: string; width: number; height: number }>, lost: { n: number }): JSONLike[] {
  const out: JSONLike[] = [];
  for (const n of nodes) {
    if (n.type === "image") {
      const up = found.get(String(n.attrs?.image));
      if (!up) {
        lost.n++;
        continue;
      }
      const w = (n.attrs?.width as number | null) ?? up.width;
      out.push({ ...n, attrs: { ...n.attrs, image: up.id, width: Math.min(w, up.width), height: Math.round((Math.min(w, up.width) * up.height) / Math.max(1, up.width)) } });
    } else out.push(n.content ? { ...n, content: withPictures(n.content, found, lost) } : n);
  }
  return out;
}
interface JSONLike {
  type: string;
  attrs?: Record<string, unknown>;
  content?: JSONLike[];
}

/** Puts a Word file's content in the (new) document `id`: the pictures go up to Drive, the text, the page setup, the header and footer and the footnotes go into the shared document through a session like any editor's, and this waits until the server has stored them. Returns what could not be carried over. */
export async function fillDocument(id: string, docx: NonNullable<Made["docx"]>): Promise<string[]> {
  const { converted, bytes } = docx;
  const notes: string[] = [];
  const found = new Map<string, { id: string; width: number; height: number }>();
  for (const pic of converted.pictures) {
    const data = await readPicture(bytes, pic.entry);
    const up = data ? await uploadImage(id, new File([data as BlobPart], pic.name, { type: pic.type })) : null;
    if (up) found.set(pic.key, up);
  }
  const lost = { n: 0 };
  const body = withPictures(converted.content as JSONLike[], found, lost);
  if (lost.n) notes.push(lost.n === 1 ? t("1 picture could not be added to the document.") : t("{n} pictures could not be added to the document.", { n: lost.n }));
  // The text ends in a paragraph, then the footnotes (the document's shape: block+ footnote*).
  if (body.at(-1)?.type !== "paragraph") body.push({ type: "paragraph" });
  const doc = { type: "doc", content: [...body, ...converted.footnotes.map((f) => ({ type: "footnote", attrs: { id: f.id }, content: f.content }))] };
  const schema = getSchema(documentExtensions(id));
  schema.nodeFromJSON(doc).check();
  const made = new Y.Doc();
  prosemirrorJSONToYXmlFragment(schema, doc, made.getXmlFragment("default"));
  const regionSchema = getSchema(regionExtensions());
  for (const r of REGIONS) {
    const json = converted.regions[r];
    if (json) {
      regionSchema.nodeFromJSON(json).check();
      prosemirrorJSONToYXmlFragment(regionSchema, json, made.getXmlFragment(r));
    }
  }
  if (converted.setup) writeSetup(made, converted.setup);
  const session = new CoeditSession(socketUrl("drive", id), () => null);
  try {
    await until(session, (s) => s.loaded && s.access === "write", 20000, t("The new document could not be opened to fill it in."));
    const frag = session.doc.getXmlFragment("default");
    session.doc.transact(() => frag.delete(0, frag.length));
    Y.applyUpdate(session.doc, Y.encodeStateAsUpdate(made));
    await until(session, (s) => !s.unsaved, 30000, t("The document was made, but its content may not have been saved: open it to check."));
  } finally {
    session.destroy();
  }
  return notes;
}

function until(session: CoeditSession, ok: (s: ReturnType<CoeditSession["getState"]>) => boolean, ms: number, failure: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => (off(), reject(new Error(failure))), ms);
    const check = () => {
      if (ok(session.getState())) (off(), resolve());
    };
    const off = () => {
      clearTimeout(timer);
      unsub();
    };
    const unsub = session.subscribe(check);
    check();
  });
}
