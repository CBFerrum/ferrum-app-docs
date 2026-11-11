import { getSchema } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import { type JSONNode, convertDocx } from "./docximport";
import { documentExtensions } from "./schema";
import { regionExtensions } from "./regions";
import { bytesOf, zip } from "./testzip";

const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"';
const r = (text: string, props = "") => `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ""}<w:t xml:space="preserve">${text}</w:t></w:r>`;
const p = (inner: string, props = "") => `<w:p>${props ? `<w:pPr>${props}</w:pPr>` : ""}${inner}</w:p>`;
const STYLES = `<w:styles ${NS}><w:style w:styleId="Heading1"><w:name w:val="heading 1"/></w:style><w:style w:styleId="Title"><w:name w:val="Title"/></w:style><w:style w:styleId="Subtitle"><w:name w:val="Subtitle"/></w:style></w:styles>`;
const NUMBERING = `<w:numbering ${NS}><w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/></w:lvl><w:lvl w:ilvl="1"><w:numFmt w:val="bullet"/></w:lvl></w:abstractNum><w:abstractNum w:abstractNumId="1"><w:lvl w:ilvl="0"><w:start w:val="3"/><w:numFmt w:val="lowerLetter"/></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num></w:numbering>`;
const RELS = `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="x/hyperlink" Target="https://example.com/a" TargetMode="External"/><Relationship Id="rId2" Type="x/header" Target="header1.xml"/><Relationship Id="rId3" Type="x/footer" Target="footer1.xml"/><Relationship Id="rId4" Type="x/header" Target="header2.xml"/><Relationship Id="rId5" Type="x/image" Target="media/logo.png"/></Relationships>`;
const HEADER = `<w:hdr ${NS}>${p(r("Master services agreement"), '<w:jc w:val="right"/>')}</w:hdr>`;
const FIRST = `<w:hdr ${NS}>${p(r("Draft for review"))}</w:hdr>`;
const FOOTER = `<w:ftr ${NS}>${p(r("Page ") + '<w:fldSimple w:instr=" PAGE "><w:r><w:t>1</w:t></w:r></w:fldSimple>' + r(" of ") + '<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> NUMPAGES </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>9</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>', '<w:jc w:val="center"/>')}</w:ftr>`;
const FOOTNOTES = `<w:footnotes ${NS}><w:footnote w:type="separator" w:id="-1">${p("<w:r><w:separator/></w:r>")}</w:footnote><w:footnote w:id="1">${p('<w:r><w:footnoteRef/></w:r>' + r(" Registered in England."))}</w:footnote></w:footnotes>`;
const cell = (text: string, props = "") => `<w:tc>${props ? `<w:tcPr>${props}</w:tcPr>` : ""}${p(r(text))}</w:tc>`;
const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const IMG = `<w:r><w:drawing><wp:inline><wp:extent cx="1905000" cy="952500"/><wp:docPr id="1" name="Logo" descr="Company logo"/><a:graphic><a:graphicData><a:pic><a:blipFill><a:blip r:embed="rId5"/></a:blipFill></a:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;

const BODY = [
  p(r("Master services agreement"), '<w:pStyle w:val="Title"/>'),
  p(r("Warehousing"), '<w:pStyle w:val="Subtitle"/>'),
  p(r("Scope"), '<w:pStyle w:val="Heading1"/>'),
  p(r("Plain ") + r("styled", '<w:rFonts w:ascii="Georgia"/><w:b/><w:color w:val="1F2A44"/><w:sz w:val="28"/><w:highlight w:val="yellow"/>') + r("2", '<w:vertAlign w:val="superscript"/>') + `<w:hyperlink r:id="rId1">${r("link", "<w:u w:val=\"single\"/>")}</w:hyperlink><w:r><w:footnoteReference w:id="1"/></w:r>`, '<w:jc w:val="both"/><w:spacing w:before="240" w:after="120" w:line="360" w:lineRule="auto"/><w:ind w:left="720"/>'),
  p(r("Bullet one"), '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>'),
  p(r("Nested"), '<w:numPr><w:ilvl w:val="1"/><w:numId w:val="1"/></w:numPr>'),
  p(r("Lettered"), '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="2"/></w:numPr>'),
  p("<w:r><w:br w:type=\"page\"/></w:r>"),
  p(IMG),
  `<w:tbl><w:tblGrid><w:gridCol w:w="3000"/><w:gridCol w:w="3000"/></w:tblGrid><w:tr><w:trPr><w:tblHeader/></w:trPr>${cell("Head one", '<w:shd w:fill="D9E2F3"/>')}${cell("Head two")}</w:tr><w:tr>${cell("Merged down", '<w:vMerge w:val="restart"/>')}${cell("B")}</w:tr><w:tr>${cell("", "<w:vMerge/>")}${cell("C")}</w:tr><w:tr>${cell("Across", '<w:gridSpan w:val="2"/>')}</w:tr></w:tbl>`,
  p(r("Kept ") + "<w:del><w:r><w:delText>gone</w:delText></w:r></w:del>" + '<m:oMath xmlns:m="x"/>'),
  p('<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText> TOC \\o "1-3" </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>'),
  p(r("Scope 1")),
  p('<w:r><w:fldChar w:fldCharType="end"/></w:r>'),
  p(r("After the contents.")),
  p("", '<w:sectPr><w:type w:val="continuous"/></w:sectPr>'),
].join("");
const DOC = `<w:document ${NS}><w:body>${BODY}<w:sectPr><w:headerReference w:type="default" r:id="rId2"/><w:headerReference w:type="first" r:id="rId4"/><w:footerReference w:type="default" r:id="rId3"/><w:pgSz w:w="15840" w:h="12240" w:orient="landscape"/><w:pgMar w:top="1440" w:right="720" w:bottom="1440" w:left="720"/><w:titlePg/></w:sectPr></w:body></w:document>`;

const docx = (document = DOC, extra: Record<string, string> = {}) =>
  zip({ "[Content_Types].xml": "<Types/>", "word/document.xml": document, "word/styles.xml": STYLES, "word/numbering.xml": NUMBERING, "word/_rels/document.xml.rels": RELS, "word/header1.xml": HEADER, "word/header2.xml": FIRST, "word/footer1.xml": FOOTER, "word/footnotes.xml": FOOTNOTES, "word/comments.xml": `<w:comments ${NS}><w:comment w:id="0"/><w:comment w:id="1"/></w:comments>`, "word/media/logo.png": String.fromCharCode(...PNG), ...extra }, ["word/media/logo.png"]);

const walk = (n: JSONNode, f: (n: JSONNode) => void) => {
  f(n);
  n.content?.forEach((c) => walk(c, f));
};
const all = (nodes: JSONNode[]) => {
  const out: JSONNode[] = [];
  nodes.forEach((n) => walk(n, (x) => out.push(x)));
  return out;
};

describe("a Word file as a Docs document", () => {
  it("keeps styles, fonts, sizes, colours, highlight, sub- and superscript, alignment, spacing and indent", async () => {
    const c = await convertDocx(await docx());
    expect(c.content[0]).toMatchObject({ type: "paragraph", attrs: { role: "title" } });
    expect(c.content[1]).toMatchObject({ attrs: { role: "subtitle" } });
    expect(c.content[2]).toMatchObject({ type: "heading", attrs: { level: 1 } });
    const para = c.content[3]!;
    expect(para.attrs).toMatchObject({ textAlign: "justify", spaceBefore: 12, spaceAfter: 6, lineHeight: 1.5, indent: 1 });
    const styled = para.content!.find((n) => n.text === "styled")!;
    expect(styled.marks).toEqual(expect.arrayContaining([{ type: "bold" }, { type: "highlight", attrs: { color: "#ffff00" } }, { type: "textStyle", attrs: { color: "#1f2a44", fontFamily: "Georgia", fontSize: 14 } }]));
    expect(para.content!.find((n) => n.text === "2")!.marks).toEqual([{ type: "superscript" }]);
    const link = para.content!.find((n) => n.text === "link")!;
    expect(link.marks).toEqual(expect.arrayContaining([{ type: "underline" }, { type: "link", attrs: { href: "https://example.com/a" } }]));
  });

  it("keeps lists nested and numbered as they were", async () => {
    const c = await convertDocx(await docx());
    const lists = c.content.filter((n) => /List$/.test(n.type));
    expect(lists.map((l) => l.type)).toEqual(["bulletList", "orderedList"]);
    expect(lists[0]!.content![0]!.content!.map((x) => x.type)).toEqual(["paragraph", "bulletList"]);
    expect(lists[1]!.attrs).toEqual({ start: 3, type: "a" });
  });

  it("keeps tables: header row, merged cells, cell colour, column widths", async () => {
    const t = (await convertDocx(await docx())).content.find((n) => n.type === "table")!;
    const rows = t.content!;
    expect(rows[0]!.content![0]).toMatchObject({ type: "tableHeader", attrs: { background: "#d9e2f3", colwidth: [200] } });
    expect(rows[1]!.content![0]!.attrs).toMatchObject({ rowspan: 2 });
    expect(rows[2]!.content).toHaveLength(1);
    expect(rows[3]!.content![0]!.attrs).toMatchObject({ colspan: 2, colwidth: [200, 200] });
  });

  it("keeps the page setup, headers and footers with their fields, footnotes, page breaks, a picture and the contents", async () => {
    const c = await convertDocx(await docx());
    expect(c.setup).toMatchObject({ size: "Letter", orientation: "landscape", top: 1440, left: 720, differentFirst: true });
    expect(c.regions.header!.content![0]).toMatchObject({ attrs: { textAlign: "right" } });
    expect(c.regions.firstHeader!.content![0]!.content![0]!.text).toBe("Draft for review");
    expect(JSON.stringify(c.regions.footer)).toContain('"kind":"page"');
    expect(JSON.stringify(c.regions.footer)).toContain('"kind":"pages"');
    expect(JSON.stringify(c.regions.footer)).not.toContain('"text":"9"');
    expect(c.footnotes).toHaveLength(1);
    expect(c.footnotes[0]!.content[0]!.content![0]!.text!.trim()).toBe("Registered in England.");
    const ref = all(c.content).find((n) => n.type === "footnoteRef")!;
    expect(ref.attrs!.id).toBe(c.footnotes[0]!.id);
    expect(c.content.map((n) => n.type)).toEqual(expect.arrayContaining(["pageBreak", "image", "tableOfContents"]));
    expect(all(c.content).some((n) => n.text === "Scope 1")).toBe(false);
    expect(c.pictures).toEqual([{ key: "rel:word/media/logo.png", entry: "word/media/logo.png", type: "image/png", name: "logo.png" }]);
    expect(all(c.content).find((n) => n.type === "image")!.attrs).toMatchObject({ width: 200, height: 100, alt: "Company logo" });
  });

  it("makes nodes the editor's schema accepts", async () => {
    const c = await convertDocx(await docx());
    const schema = getSchema(documentExtensions("f"));
    const body = [...c.content.map((n) => (n.type === "image" ? { type: "paragraph" } : n)), { type: "paragraph" }, ...c.footnotes.map((f) => ({ type: "footnote", attrs: { id: f.id }, content: f.content }))];
    expect(() => schema.nodeFromJSON({ type: "doc", content: body }).check()).not.toThrow();
    const regions = getSchema(regionExtensions());
    for (const j of Object.values(c.regions)) expect(() => regions.nodeFromJSON(j).check()).not.toThrow();
  });

  it("says what it did not carry, as a list", async () => {
    const c = await convertDocx(await docx());
    expect(c.notes).toEqual(expect.arrayContaining(["2 comments were not carried: Docs documents keep comments on the page, not in the file.", "1 tracked deletion: the deleted words were left out and the inserted words kept.", "1 equation was left out."]));
  });

  it("falls back to the nearest paper, and says so", async () => {
    const doc = `<w:document ${NS}><w:body>${p(r("x"))}<w:sectPr><w:pgSz w:w="12000" w:h="17500"/></w:sectPr></w:body></w:document>`;
    const c = await convertDocx(await docx(doc));
    expect(c.setup!.size).toBe("A4");
    expect(c.notes.join(" ")).toMatch(/nearest size/);
  });

  it("refuses what is not a Word file, and an empty one", async () => {
    await expect(convertDocx(bytesOf("not a zip"))).rejects.toThrow(/not a Word document/);
    await expect(convertDocx(await docx(`<w:document ${NS}><w:body>${p("")}</w:body></w:document>`))).rejects.toThrow(/no text to import/);
  });
});
