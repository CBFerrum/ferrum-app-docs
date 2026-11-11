// @vitest-environment jsdom
import { Editor, getSchema } from "@tiptap/core";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { FORMAT, checkFormat, readFormat, stamp } from "./compat";
import { NewerFormat } from "./NewerFormat";
import { pageMap } from "./page";
import { documentExtensions } from "./schema";

const schema = getSchema(documentExtensions("f"));

/** A document as a newer client would have written it: a node and a mark this schema does not have. */
function newerDoc(): Y.Doc {
  const doc = new Y.Doc();
  const frag = doc.getXmlFragment("default");
  const p = new Y.XmlElement("paragraph");
  const text = new Y.XmlText();
  p.insert(0, [text]);
  frag.insert(0, [p, new Y.XmlElement("mysteryBlock")]);
  text.insert(0, "Words that matter", { mysteryMark: true });
  return doc;
}

describe("a document from a newer Docs", () => {
  it("is recognised by the node and the mark this client does not know", () => {
    const c = checkFormat(newerDoc(), schema);
    expect(c.ok).toBe(false);
    if (!c.ok) {
      expect(c.why).toBe("unknown-content");
      expect(c.unknown).toEqual(expect.arrayContaining(["node mysteryBlock", "mark mysteryMark"]));
    }
  });

  it("is recognised by its recorded format alone", () => {
    const doc = new Y.Doc();
    pageMap(doc).set("format", FORMAT + 1);
    expect(checkFormat(doc, schema)).toMatchObject({ ok: false, why: "newer-format" });
  });

  it("is not touched by the check, nor by an editor that is not bound to it: no update is sent and the bytes are the same", () => {
    const doc = newerDoc();
    const sent: Uint8Array[] = [];
    doc.on("update", (u: Uint8Array) => sent.push(u));
    const before = Y.encodeStateAsUpdate(doc);
    const c = checkFormat(doc, schema);
    // What the page does with it: an editor on the same schema, read only and without the shared binding.
    const e = new Editor({ extensions: documentExtensions("f"), editable: false });
    e.destroy();
    expect(c.ok).toBe(false);
    expect(sent).toHaveLength(0);
    expect(Array.from(Y.encodeStateAsUpdate(doc))).toEqual(Array.from(before));
  });

  it("shows a state that says so, offers a reload, and never says Saved", () => {
    const html = renderToStaticMarkup(<NewerFormat download={() => undefined} />);
    expect(html).toContain("This document uses features from a newer version of Docs");
    expect(html).toContain("Reload");
    expect(html).not.toContain("Saved");
    expect(html).not.toContain("Download as");
  });

  it("offers Word and PDF once a reload has been tried", () => {
    sessionStorage.setItem("docs.reloaded", "1");
    const html = renderToStaticMarkup(<NewerFormat download={() => undefined} />);
    expect(html).toContain("needs updating");
    expect(html).toContain("Download as Word");
    expect(html).toContain("Download as PDF");
    sessionStorage.removeItem("docs.reloaded");
  });
});

describe("a document this client wrote", () => {
  it("passes, and records the format once it uses a feature of it", () => {
    const doc = new Y.Doc();
    expect(readFormat(doc)).toBe(1);
    expect(checkFormat(doc, schema).ok).toBe(true);
    stamp(doc);
    expect(readFormat(doc)).toBe(FORMAT);
  });
});
