// Pasting from Word, Google Docs and web pages. The clipboard's `text/html` is tidied before the
// editor reads it (Word's list paragraphs become lists, Google's wrapper and link redirects go, a
// heading loses the font its source gave it), then read through the schema, whose marks and
// attributes keep only validated values (format.ts): what the schema cannot say is dropped, never
// stored as a style string. Pictures inside the paste go up to Drive and into the text where they
// were (upload.ts); the ones that cannot be fetched are counted, so the person is told.

import { Extension } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";
import type { Uploaded } from "./upload";

const LIST_STYLE = /mso-list:\s*(?!Ignore)[^;]*?level(\d+)/i;

/** Whether the marker a Word list paragraph starts with (`1.`, `a)`, `i.`, a bullet glyph) is a number. */
function numbering(marker: string): { ordered: boolean; type: string; start: number | null } {
  const m = /^\(?\s*([0-9]+|[a-z]+)\s*[.)]/i.exec(marker.trim());
  if (!m) return { ordered: false, type: "1", start: null };
  const k = m[1]!;
  if (/^\d+$/.test(k)) return { ordered: true, type: "1", start: Number(k) };
  if (/^[ivxlcdm]+$/i.test(k) && (k.length > 1 || k.toLowerCase() === "i")) return { ordered: true, type: "i", start: null };
  return { ordered: true, type: "a", start: null };
}

/** Word writes a list as paragraphs with `mso-list: l0 level2 lfo1` and the number or bullet in a span
 *  (`mso-list: Ignore`); this makes them the nested lists they are. */
function listsOf(root: HTMLElement) {
  const doc = root.ownerDocument;
  for (const parent of [root, ...root.querySelectorAll<HTMLElement>("div, td, th, blockquote")]) {
    let run: HTMLElement[] = [];
    const flush = () => {
      if (!run.length) return;
      const stack: { level: number; list: HTMLElement; ordered: boolean }[] = [];
      let top: HTMLElement | null = null;
      for (const p of run) {
        const level = Number(LIST_STYLE.exec(p.getAttribute("style") ?? "")![1]);
        const mark = p.querySelector<HTMLElement>('[style*="mso-list:Ignore" i], [style*="mso-list: Ignore" i]');
        const kind = numbering(mark?.textContent ?? "");
        mark?.remove();
        while (stack.length && (stack.at(-1)!.level > level || (stack.at(-1)!.level === level && stack.at(-1)!.ordered !== kind.ordered))) stack.pop();
        if (!stack.length || stack.at(-1)!.level < level) {
          const list = doc.createElement(kind.ordered ? "ol" : "ul");
          if (kind.ordered && kind.type !== "1") list.setAttribute("type", kind.type);
          if (kind.ordered && kind.start && kind.start > 1) list.setAttribute("start", String(kind.start));
          const outer = stack.at(-1);
          if (outer) (outer.list.lastElementChild ?? outer.list.appendChild(doc.createElement("li"))).append(list);
          else if (top) top.after(list);
          else run[0]!.before(list);
          if (!outer) top = list;
          stack.push({ level, list, ordered: kind.ordered });
        }
        const li = doc.createElement("li");
        const para = doc.createElement("p");
        para.append(...Array.from(p.childNodes));
        li.append(para);
        stack.at(-1)!.list.append(li);
        p.remove();
      }
      run = [];
    };
    for (const child of Array.from(parent.children) as HTMLElement[]) {
      if (child.tagName === "P" && LIST_STYLE.test(child.getAttribute("style") ?? "")) run.push(child);
      else flush();
    }
    flush();
  }
}

/** Google Docs sends links through its own redirect (`google.com/url?q=…`); the page they go to is the link. */
function unredirect(href: string): string {
  try {
    const u = new URL(href);
    if (/^(www\.)?google\.[a-z.]+$/.test(u.hostname) && u.pathname === "/url") {
      const q = u.searchParams.get("q");
      if (q && /^https?:\/\//i.test(q)) return q;
    }
  } catch {
    // Not an address: left to the link's own check.
  }
  return href;
}

const unwrap = (el: Element) => el.replaceWith(...Array.from(el.childNodes));

/** The pasted HTML, tidied (see the top of this file). Pure apart from the DOM it builds. */
export function normalizePastedHtml(html: string): string {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const body = parsed.body;
  // Word's conditional comments and fields, and what is never text.
  const walker = parsed.createTreeWalker(body, NodeFilter.SHOW_COMMENT);
  const comments: Node[] = [];
  while (walker.nextNode()) comments.push(walker.currentNode);
  for (const c of comments) c.parentNode?.removeChild(c);
  for (const el of body.querySelectorAll("o\\:p")) unwrap(el);
  for (const el of body.querySelectorAll("style, script, meta, link, title, xml")) el.remove();
  // Google's wrapper: `<b style="font-weight:normal" id="docs-internal-guid-…">` around everything.
  for (const el of body.querySelectorAll('[id^="docs-internal-guid"]')) unwrap(el);
  // Old markup for colour and face.
  for (const f of body.querySelectorAll<HTMLElement>("font")) {
    const span = parsed.createElement("span");
    const rules = [f.getAttribute("color") ? `color:${f.getAttribute("color")}` : "", f.getAttribute("face") ? `font-family:${f.getAttribute("face")}` : ""].filter(Boolean);
    if (rules.length) span.setAttribute("style", rules.join(";"));
    span.append(...Array.from(f.childNodes));
    f.replaceWith(span);
  }
  listsOf(body);
  // A heading is the document's heading, not the source's font.
  for (const h of body.querySelectorAll("h1, h2, h3, h4, h5, h6")) {
    for (const s of h.querySelectorAll<HTMLElement>("[style]")) {
      s.style.removeProperty("font-size");
      s.style.removeProperty("font-family");
      s.style.removeProperty("font-weight");
    }
    (h as HTMLElement).style?.removeProperty("font-size");
  }
  for (const a of body.querySelectorAll<HTMLAnchorElement>("a[href]")) a.setAttribute("href", unredirect(a.getAttribute("href") ?? ""));
  return body.innerHTML;
}

/** The pictures of pasted HTML that are not already a document's own and are not a link: `data:` ones
 *  (Word and Docs embed small pictures) and web ones. */
const foreign = (img: HTMLImageElement) => !img.hasAttribute("data-image") && !!img.getAttribute("src");

export function hasForeignImages(html: string): boolean {
  return Array.from(new DOMParser().parseFromString(html, "text/html").images).some(foreign);
}

/** A `data:` picture as a file, decoded here (the page's content policy does not let it be fetched). */
function dataPicture(src: string): File | null {
  const m = /^data:(image\/(?:png|jpeg|gif|webp));base64,([A-Za-z0-9+/=\s]+)$/i.exec(src);
  if (!m) return null;
  try {
    const bin = atob(m[2]!.replace(/\s+/g, ""));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new File([bytes], "pasted-picture", { type: m[1]!.toLowerCase() });
  } catch {
    return null;
  }
}

/** The picture a paste names: a `data:` one, or a web one if the page and its policy allow reading it from here. */
async function fetchPicture(src: string): Promise<File | null> {
  if (src.startsWith("data:")) return dataPicture(src);
  if (!/^https?:/i.test(src)) return null;
  try {
    const r = await fetch(src, { credentials: "omit", signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    const blob = await r.blob();
    return new File([blob], "pasted-picture", { type: blob.type });
  } catch {
    return null;
  }
}

/** Uploads the foreign pictures of pasted HTML through `upload` and returns HTML whose pictures are the
 *  document's own, in the same places; `skipped` counts the ones that could not be kept (a computer's
 *  own file, a page that refuses to be read from here, a picture that is too large). */
export async function localizeImages(html: string, upload: (f: File) => Promise<Uploaded | null>): Promise<{ html: string; skipped: number }> {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  let skipped = 0;
  for (const img of Array.from(parsed.images).filter(foreign)) {
    const f = await fetchPicture(img.getAttribute("src") ?? "");
    const up = f ? await upload(f) : null;
    if (!up) {
      skipped++;
      img.remove();
      continue;
    }
    const ratio = Number(img.getAttribute("width")) > 0 ? Number(img.getAttribute("width")) : up.width;
    img.setAttribute("data-image", up.id);
    img.removeAttribute("src");
    img.setAttribute("width", String(Math.round(Math.min(ratio, up.width))));
    img.setAttribute("height", String(Math.round((Math.min(ratio, up.width) * up.height) / Math.max(1, up.width))));
    img.setAttribute("alt", img.getAttribute("alt") ?? "");
  }
  return { html: parsed.body.innerHTML, skipped };
}

/** Whether the clipboard's HTML says something besides pictures: a copied picture is HTML with just an `img`. */
export function hasWords(html: string): boolean {
  return (new DOMParser().parseFromString(html, "text/html").body.textContent ?? "").trim() !== "";
}

/** The editor's paste: the tidy-up above for everything that comes in as HTML. */
export const PasteTidy = Extension.create({
  name: "docPaste",
  addProseMirrorPlugins() {
    return [new Plugin({ props: { transformPastedHTML: normalizePastedHtml } })];
  },
});
