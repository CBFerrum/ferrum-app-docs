import { describe, expect, it } from "vitest";
import { docxToMarkdown, guardLine, renderBlocks } from "./docx";
import { importFile, pictureLinks, textToMarkdown, titleOf, withoutFrontMatter } from "./importing";
import { parseXml, textOf, unescapeXml } from "./xml";
import { readText, zipEntries } from "./zip";

// ── a Word file for the tests: a zip of parts, some stored, some deflated ──

const bytesOf = (s: string) => new TextEncoder().encode(s);

async function deflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new CompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** A zip of `files` (name → text); the names in `stored` are not compressed. */
async function zip(files: Record<string, string>, stored: string[] = []): Promise<Uint8Array> {
  const locals: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const raw = bytesOf(text);
    const method = stored.includes(name) ? 0 : 8;
    const data = method === 0 ? raw : await deflate(raw);
    const nm = bytesOf(name);
    const local = new Uint8Array(30 + nm.length + data.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(8, method, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, raw.length, true);
    lv.setUint16(26, nm.length, true);
    local.set(nm, 30);
    local.set(data, 30 + nm.length);
    const head = new Uint8Array(46 + nm.length);
    const hv = new DataView(head.buffer);
    hv.setUint32(0, 0x02014b50, true);
    hv.setUint16(4, 20, true);
    hv.setUint16(6, 20, true);
    hv.setUint16(10, method, true);
    hv.setUint32(20, data.length, true);
    hv.setUint32(24, raw.length, true);
    hv.setUint16(28, nm.length, true);
    hv.setUint32(42, offset, true);
    head.set(nm, 46);
    locals.push(local);
    central.push(head);
    offset += local.length;
  }
  const size = central.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, central.length, true);
  ev.setUint16(10, central.length, true);
  ev.setUint32(12, size, true);
  ev.setUint32(16, offset, true);
  const all = [...locals, ...central, end];
  const out = new Uint8Array(all.reduce((n, a) => n + a.length, 0));
  let at = 0;
  for (const a of all) {
    out.set(a, at);
    at += a.length;
  }
  return out;
}

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const run = (text: string, props = "") => `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ""}<w:t xml:space="preserve">${text}</w:t></w:r>`;
const para = (inner: string, props = "") => `<w:p>${props ? `<w:pPr>${props}</w:pPr>` : ""}${inner}</w:p>`;
const styled = (id: string) => `<w:pStyle w:val="${id}"/>`;
const listed = (numId: number, level: number) => `<w:numPr><w:ilvl w:val="${level}"/><w:numId w:val="${numId}"/></w:numPr>`;

const STYLES = `<?xml version="1.0"?><w:styles ${W}>
  <w:style w:styleId="Title"><w:name w:val="Title"/></w:style>
  <w:style w:styleId="Heading1"><w:name w:val="heading 1"/></w:style>
  <w:style w:styleId="Heading2"><w:name w:val="heading 2"/></w:style>
  <w:style w:styleId="MyHeading"><w:name w:val="My Heading"/><w:basedOn w:val="Heading2"/></w:style>
  <w:style w:styleId="Quote"><w:name w:val="Quote"/></w:style>
  <w:style w:styleId="SourceCode"><w:name w:val="Source Code"/></w:style>
</w:styles>`;
const NUMBERING = `<?xml version="1.0"?><w:numbering ${W}>
  <w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/></w:lvl><w:lvl w:ilvl="1"><w:numFmt w:val="bullet"/></w:lvl></w:abstractNum>
  <w:abstractNum w:abstractNumId="1"><w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/></w:lvl></w:abstractNum>
  <w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
  <w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>
</w:numbering>`;
const RELS = `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId9" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.com/a?b=1&amp;c=2" TargetMode="External"/>
  <Relationship Id="rId8" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="javascript:alert(1)" TargetMode="External"/>
</Relationships>`;

const cell = (text: string, props = "") => `<w:tc>${props ? `<w:tcPr>${props}</w:tcPr>` : ""}${para(run(text))}</w:tc>`;
const BODY = [
  para(run("Q4 plan"), styled("Title")),
  para(run("Why we do it"), styled("MyHeading")),
  para(run("Ship ") + run("live ", "<w:b/>") + run("documents", "<w:b/><w:i/>") + run(" with 5 * 3 and snake_case, ") + `<w:hyperlink r:id="rId9">${run("a link", "<w:strike/>")}</w:hyperlink>` + run(".") + "<w:r><w:br/></w:r>" + run("After a break.")),
  para(run("# not a heading")),
  para(run("First", "") , listed(1, 0)),
  para(run("Nested"), listed(1, 1)),
  para(run("Second"), listed(1, 0)),
  para(run("Step one"), listed(2, 0)),
  para(run("Step two"), listed(2, 0)),
  para(run("Said by someone"), styled("Quote")),
  para(run("fn main() {}", '<w:rFonts w:ascii="Consolas"/>'), styled("SourceCode")),
  para(run("let x = 1;", '<w:rFonts w:ascii="Consolas"/>'), styled("SourceCode")),
  `<w:tbl><w:tr>${cell("Owner")}${cell("Due | when")}</w:tr><w:tr>${cell("Ana")}${cell("Friday")}</w:tr><w:tr>${cell("All day", '<w:gridSpan w:val="2"/>')}</w:tr></w:tbl>`,
  para(run("Kept ") + "<w:del><w:r><w:delText>deleted</w:delText></w:r></w:del>" + "<w:ins>" + run("added") + "</w:ins>"),
  para("<w:r><w:drawing/></w:r>"),
  para(`<w:hyperlink r:id="rId8">${run("unsafe")}</w:hyperlink>`),
  para(""),
].join("");
const DOCUMENT = `<?xml version="1.0"?><w:document ${W}><w:body>${BODY}<w:sectPr/></w:body></w:document>`;

const docx = (document = DOCUMENT) =>
  zip({ "[Content_Types].xml": "<Types/>", "word/document.xml": document, "word/styles.xml": STYLES, "word/numbering.xml": NUMBERING, "word/_rels/document.xml.rels": RELS }, ["word/styles.xml"]);

describe("reading XML", () => {
  it("reads elements, attributes, text and entities", () => {
    const root = parseXml(`<?xml version="1.0"?><!-- c --><a x="1" y='2&amp;3'><b>one &lt;two&gt; &#65;&#x42;</b><c/><![CDATA[<raw>]]></a>`);
    expect(root.name).toBe("a");
    expect(root.attrs).toEqual({ x: "1", y: "2&3" });
    expect(textOf(root)).toBe("one <two> AB<raw>");
    expect(unescapeXml("&amp;lt; &unknown; &#0;")).toBe("&lt; &unknown; &#0;");
  });

  it("refuses what is broken rather than guess", () => {
    for (const bad of ["<a><b></a>", "<a>", "</a>", "<a x='1></a>", "", "text only"]) expect(() => parseXml(bad), bad).toThrow(/damaged/);
    expect(() => parseXml("<a>".repeat(300) + "</a>".repeat(300))).toThrow(/deeply/);
  });
});

describe("reading a zip", () => {
  it("lists its files and unpacks stored and deflated ones", async () => {
    const bytes = await zip({ "a.txt": "stored text", "dir/b.txt": "deflated deflated deflated" }, ["a.txt"]);
    const entries = zipEntries(bytes);
    expect(entries.map((e) => [e.name, e.method])).toEqual([["a.txt", 0], ["dir/b.txt", 8]]);
    expect(await readText(bytes, entries, "a.txt")).toBe("stored text");
    expect(await readText(bytes, entries, "dir/b.txt")).toBe("deflated deflated deflated");
    expect(await readText(bytes, entries, "missing")).toBeNull();
  });

  it("says plainly when it is not a zip", () => {
    expect(() => zipEntries(bytesOf("just some text, not a zip file at all"))).toThrow(/not a Word document/);
  });
});

describe("a Word document as Markdown", () => {
  it("keeps headings, looks, links, lists, quotes, code and tables", async () => {
    const { markdown, pictures } = await docxToMarkdown(await docx());
    expect(pictures).toBe(1);
    expect(markdown).toBe(
      [
        "# Q4 plan",
        "## Why we do it",
        "Ship **live** ***documents*** with 5 \\* 3 and snake\\_case, [~~a link~~](https://example.com/a?b=1&c=2).\\\nAfter a break.",
        "\\# not a heading",
        "- First\n  - Nested\n- Second",
        "1. Step one\n1. Step two",
        "> Said by someone",
        "```\nfn main() {}\nlet x = 1;\n```",
        "| Owner | Due \\| when |\n|---|---|\n| Ana | Friday |\n| All day |  |",
        "Kept added",
        "unsafe",
      ].join("\n\n"),
    );
  });

  it("takes tracked changes as they stand, and skips empty paragraphs and page layout", async () => {
    const doc = `<w:document ${W}><w:body>${para(run("Keep ") + "<w:del><w:r><w:delText>gone</w:delText></w:r></w:del>" + "<w:r><w:br w:type=\"page\"/></w:r>" + run("this"))}${para("")}${para(run("  "))}</w:body></w:document>`;
    expect((await docxToMarkdown(await docx(doc))).markdown).toBe("Keep this");
  });

  it("says why a file cannot be imported", async () => {
    await expect(docxToMarkdown(bytesOf("not a zip"))).rejects.toThrow(/not a Word document/);
    await expect(docxToMarkdown(await zip({ "other.xml": "<a/>" }))).rejects.toThrow(/no text part/);
    await expect(docxToMarkdown(await docx(`<w:document ${W}><w:body>${para("")}</w:body></w:document>`))).rejects.toThrow(/no text to import/);
    await expect(docxToMarkdown(await docx("<w:document><broken"))).rejects.toThrow(/damaged/);
  });

  it("keeps a line from being read as something else", () => {
    expect([guardLine("# x"), guardLine("> x"), guardLine("- x"), guardLine("1. x"), guardLine("2) x"), guardLine("---"), guardLine("plain"), guardLine("1990s")]).toEqual(["\\# x", "\\> x", "\\- x", "1\\. x", "2\\) x", "\\---", "plain", "1990s"]);
  });

  it("writes lists the server reads: nested by the width of the marker above", () => {
    const md = renderBlocks([
      { t: "item", kind: "ordered", level: 0, text: "one" },
      { t: "item", kind: "bullet", level: 1, text: "inside" },
      { t: "item", kind: "ordered", level: 0, text: "two\nsecond line" },
      { t: "item", kind: "bullet", level: 0, text: "bullets now" },
    ]);
    expect(md).toBe("1. one\n   - inside\n1. two\n   second line\n\n- bullets now");
  });
});

describe("making a document from a file", () => {
  const file = (name: string, content: BlobPart) => new File([content], name);

  it("names it after the file", () => {
    expect([titleOf("Q4 plan.docx"), titleOf("notes.v2.md"), titleOf("a/b\\c.txt"), titleOf(".md"), titleOf("x".repeat(200) + ".md").length]).toEqual(["Q4 plan", "notes.v2", "a b c", "Imported document", 120]);
  });

  it("reads Markdown as it is, without its front matter, and keeps a title it gives", async () => {
    const md = "---\ntitle: \"The plan\"\ntags: [a]\n---\n\n# Heading\n\nText with ![a chart](https://x.test/c.png) and\n\n```\n![not touched](x.png)\n```\n";
    const made = await importFile(file("plan.md", md));
    expect(made.title).toBe("The plan");
    expect(made.markdown).toBe("# Heading\n\nText with [a chart](https://x.test/c.png) and\n\n```\n![not touched](x.png)\n```\n");
    expect(made.notes).toEqual(["1 picture is a link now: documents keep pictures that are added to them."]);
    expect(withoutFrontMatter("# No front matter\n").markdown).toBe("# No front matter\n");
    expect(pictureLinks("![](a.png)").markdown).toBe("[picture](a.png)");
  });

  it("reads plain text as paragraphs, with nothing in it taken for Markdown", async () => {
    expect(textToMarkdown("A *star* here\nsecond line\n\n\n# not a heading\n- not a list")).toBe("A \\*star\\* here\\\nsecond line\n\n\\# not a heading\\\n\\- not a list");
    expect((await importFile(file("n.txt", "﻿hello\r\nworld"))).markdown).toBe("hello\\\nworld");
  });

  it("reads a Word file and tells what was left out", async () => {
    const made = await importFile(file("Report.docx", (await docx()) as BlobPart));
    expect(made.title).toBe("Report");
    expect(made.markdown.startsWith("# Q4 plan")).toBe(true);
    expect(made.notes).toEqual(["1 picture was left out: add it again in the document."]);
  });

  it("explains files it cannot make a document from", async () => {
    await expect(importFile(file("old.doc", "x"))).rejects.toThrow(/save it as \.docx/);
    await expect(importFile(file("letter.rtf", "x"))).rejects.toThrow(/\.rtf files cannot be imported/);
    await expect(importFile(file("photo.png", "x"))).rejects.toThrow(/Only Word documents/);
    await expect(importFile(file("empty.md", "  \n"))).rejects.toThrow(/no text/);
    await expect(importFile(file("big.md", "x".repeat((1 << 20) + 1)))).rejects.toThrow(/over 1 MB/);
  });
});
