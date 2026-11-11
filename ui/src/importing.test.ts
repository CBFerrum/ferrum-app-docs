import { describe, expect, it } from "vitest";
import { guardLine } from "./docx";
import { importFile, pictureLinks, textToMarkdown, titleOf, withoutFrontMatter } from "./importing";
import { parseXml, textOf, unescapeXml } from "./xml";
import { readText, zipEntries } from "./zip";

import { bytesOf, zip } from "./testzip";

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
  <w:style w:styleId="BlockQuotation"><w:name w:val="Block Quotation"/></w:style>
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
  para(run("And by another"), styled("BlockQuotation")),
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

describe("Markdown from text", () => {
  it("keeps a line from being read as something else", () => {
    expect([guardLine("# x"), guardLine("> x"), guardLine("- x"), guardLine("1. x"), guardLine("2) x"), guardLine("---"), guardLine("plain"), guardLine("1990s")]).toEqual(["\\# x", "\\> x", "\\- x", "1\\. x", "2\\) x", "\\---", "plain", "1990s"]);
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
    // A Word file is made into the document itself (fillDocument), not into Markdown.
    expect(made.docx?.converted.content[0]).toMatchObject({ type: "paragraph", attrs: { role: "title" } });
    expect(made.notes).toEqual(["1 tracked deletion: the deleted words were left out and the inserted words kept."]);
  });

  it("explains files it cannot make a document from", async () => {
    await expect(importFile(file("old.doc", "x"))).rejects.toThrow(/save it as \.docx/);
    await expect(importFile(file("letter.rtf", "x"))).rejects.toThrow(/\.rtf files cannot be imported/);
    await expect(importFile(file("photo.png", "x"))).rejects.toThrow(/Only Word documents/);
    await expect(importFile(file("empty.md", "  \n"))).rejects.toThrow(/no text/);
    await expect(importFile(file("big.md", "x".repeat((1 << 20) + 1)))).rejects.toThrow(/over 1 MB/);
  });
});
