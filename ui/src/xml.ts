// A small XML reader for the parts of a Word file: elements, attributes and text, with the five named
// entities and numeric ones. No doctype entities, no scripts, no network: what is read is only the
// tree. Elements keep their prefix (`w:p`).

export interface XmlEl {
  name: string;
  attrs: Record<string, string>;
  children: (XmlEl | string)[];
}

const NAMED: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

/** Text with its entities replaced (unknown ones stay as written). */
export function unescapeXml(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (whole, ref: string) => {
    if (ref[0] === "#") {
      const code = ref[1] === "x" ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10);
      return Number.isInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return NAMED[ref] ?? whole;
  });
}

const MAX_DEPTH = 200;
const ATTR = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

/** The root element of `src`. */
export function parseXml(src: string): XmlEl {
  const root: XmlEl = { name: "#root", attrs: {}, children: [] };
  const open: XmlEl[] = [root];
  let i = 0;
  const fail = (why: string): never => {
    throw new Error(`The file's XML is damaged (${why}).`);
  };
  while (i < src.length) {
    const lt = src.indexOf("<", i);
    const text = src.slice(i, lt < 0 ? src.length : lt);
    if (text) open[open.length - 1]!.children.push(unescapeXml(text));
    if (lt < 0) break;
    if (src.startsWith("<!--", lt)) {
      const end = src.indexOf("-->", lt + 4);
      if (end < 0) fail("a comment never ends");
      i = end + 3;
    } else if (src.startsWith("<![CDATA[", lt)) {
      const end = src.indexOf("]]>", lt + 9);
      if (end < 0) fail("a CDATA section never ends");
      open[open.length - 1]!.children.push(src.slice(lt + 9, end));
      i = end + 3;
    } else if (src.startsWith("<?", lt)) {
      const end = src.indexOf("?>", lt + 2);
      if (end < 0) fail("a declaration never ends");
      i = end + 2;
    } else if (src.startsWith("<!", lt)) {
      // A doctype: skipped, with nothing from it used.
      const end = src.indexOf(">", lt + 2);
      if (end < 0) fail("a declaration never ends");
      i = end + 1;
    } else if (src.startsWith("</", lt)) {
      const end = src.indexOf(">", lt + 2);
      if (end < 0) fail("a tag never ends");
      const name = src.slice(lt + 2, end).trim();
      const top = open.pop();
      if (!top || top.name !== name || open.length === 0) fail(`</${name}> closes nothing`);
      i = end + 1;
    } else {
      // A start tag runs to the next > outside its quoted values.
      let end = lt + 1;
      let quote = "";
      for (; end < src.length; end++) {
        const c = src[end]!;
        if (quote) {
          if (c === quote) quote = "";
        } else if (c === '"' || c === "'") quote = c;
        else if (c === ">") break;
      }
      if (end >= src.length) fail("a tag never ends");
      const inner = src.slice(lt + 1, end);
      const self = inner.endsWith("/");
      const body = self ? inner.slice(0, -1) : inner;
      const name = /^[^\s/]+/.exec(body)?.[0] ?? fail("a tag has no name");
      const attrs: Record<string, string> = {};
      for (const m of body.slice(name.length).matchAll(ATTR)) attrs[m[1]!] = unescapeXml(m[2] ?? m[3] ?? "");
      const el: XmlEl = { name, attrs, children: [] };
      open[open.length - 1]!.children.push(el);
      if (!self) {
        if (open.length > MAX_DEPTH) fail("elements are nested too deeply");
        open.push(el);
      }
      i = end + 1;
    }
  }
  if (open.length !== 1) fail("an element is not closed");
  const first = root.children.find((c): c is XmlEl => typeof c !== "string");
  if (!first) fail("there is no element");
  return first!;
}

/** The elements among `el`'s children, optionally only those named `name`. */
export function elements(el: XmlEl, name?: string): XmlEl[] {
  return el.children.filter((c): c is XmlEl => typeof c !== "string" && (name === undefined || c.name === name));
}

/** The first child named `name`. */
export const child = (el: XmlEl, name: string): XmlEl | undefined => elements(el, name)[0];

/** All the text under `el`. */
export function textOf(el: XmlEl): string {
  return el.children.map((c) => (typeof c === "string" ? c : textOf(c))).join("");
}
