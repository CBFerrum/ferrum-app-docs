// @vitest-environment jsdom
import { Editor } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import { hasForeignImages, hasWords, localizeImages, normalizePastedHtml } from "./paste";
import { documentExtensions } from "./schema";

/** What the clipboard carries as `text/html` when a few paragraphs are copied in Word for Windows. */
const WORD = `<html xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta http-equiv=Content-Type content="text/html; charset=utf-8"><meta name=ProgId content=Word.Document><meta name=Generator content="Microsoft Word 15">
<!--[if gte mso 9]><xml><o:OfficeDocumentSettings><o:AllowPNG/></o:OfficeDocumentSettings></xml><![endif]-->
<style><!-- /* Style Definitions */ p.MsoNormal, li.MsoNormal {margin-top:0cm;margin-right:0cm;margin-bottom:8.0pt;margin-left:0cm;line-height:107%;font-size:11.0pt;font-family:"Calibri",sans-serif;} --></style></head>
<body lang=EN-US style='tab-interval:36.0pt;word-wrap:break-word'>
<!--StartFragment-->
<h1 style='margin-top:12.0pt;margin-right:0cm;margin-bottom:0cm;margin-left:0cm;line-height:107%'><span style='font-size:16.0pt;line-height:107%;font-family:"Calibri Light",sans-serif;color:#2F5496'>Supplier onboarding policy<o:p></o:p></span></h1>
<p class=MsoNormal style='margin-left:36.0pt'><b><span style='font-size:12.0pt;line-height:107%;font-family:"Georgia",serif;color:#C00000'>Important:</span></b><span style='font-size:11.0pt;line-height:107%'> every <i>new</i> supplier is <u>checked</u> against <a href="https://example.com/sanctions">the list</a>. H<sub>2</sub>O and x<sup>2</sup>, <span style='background:yellow;mso-highlight:yellow'>marked</span>.<o:p></o:p></span></p>
<p class=MsoListParagraphCxSpFirst style='margin-bottom:0cm;text-indent:-18.0pt;line-height:normal;mso-list:l0 level1 lfo1'><![if !supportLists]><span style='font-family:Symbol;mso-fareast-font-family:Symbol;mso-bidi-font-family:Symbol'><span style='mso-list:Ignore'>·<span style='font:7.0pt "Times New Roman"'>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; </span></span></span><![endif]>Collect the tax certificate<o:p></o:p></p>
<p class=MsoListParagraphCxSpMiddle style='margin-left:72.0pt;margin-bottom:0cm;text-indent:-18.0pt;line-height:normal;mso-list:l0 level2 lfo1'><![if !supportLists]><span style='font-family:"Courier New";mso-fareast-font-family:"Courier New"'><span style='mso-list:Ignore'>o<span style='font:7.0pt "Times New Roman"'>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; </span></span></span><![endif]>Valid for the current year<o:p></o:p></p>
<p class=MsoListParagraphCxSpLast style='margin-bottom:0cm;text-indent:-18.0pt;line-height:normal;mso-list:l0 level1 lfo1'><![if !supportLists]><span style='font-family:Symbol'><span style='mso-list:Ignore'>·<span style='font:7.0pt "Times New Roman"'>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; </span></span></span><![endif]>Record the bank details<o:p></o:p></p>
<p class=MsoNormal><o:p>&nbsp;</o:p></p>
<p class=MsoListParagraphCxSpFirst style='text-indent:-18.0pt;mso-list:l1 level1 lfo2'><![if !supportLists]><span style='mso-list:Ignore'>1.<span style='font:7.0pt "Times New Roman"'>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; </span></span><![endif]>Request the form<o:p></o:p></p>
<p class=MsoListParagraphCxSpLast style='text-indent:-18.0pt;mso-list:l1 level1 lfo2'><![if !supportLists]><span style='mso-list:Ignore'>2.<span style='font:7.0pt "Times New Roman"'>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; </span></span><![endif]>Approve it<o:p></o:p></p>
<table class=MsoTableGrid border=1 cellspacing=0 cellpadding=0 style='border-collapse:collapse;border:none'>
 <tr><td width=156 valign=top style='width:117.0pt;border:solid windowtext 1.0pt;background:#D9E2F3;padding:0cm 5.4pt 0cm 5.4pt'><p class=MsoNormal style='margin-bottom:0cm;line-height:normal'><b>Supplier</b><o:p></o:p></p></td>
 <td width=156 valign=top style='width:117.0pt;border:solid windowtext 1.0pt;background:#D9E2F3'><p class=MsoNormal style='margin-bottom:0cm;line-height:normal'><b>Status</b><o:p></o:p></p></td></tr>
 <tr><td width=156 colspan=2 valign=top style='width:234.0pt;border:solid windowtext 1.0pt'><p class=MsoNormal style='margin-bottom:0cm;line-height:normal'>Northwind Traders<o:p></o:p></p></td></tr>
</table>
<!--EndFragment-->
</body></html>`;

/** What the clipboard carries as `text/html` when text is copied in Google Docs in Chrome. */
const GOOGLE = `<meta charset='utf-8'><meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-4f3c1d2e-7fff-1234-abcd-0123456789ab"><h1 dir="ltr" style="line-height:1.38;margin-top:20pt;margin-bottom:6pt;"><span style="font-size:20pt;font-family:Arial,sans-serif;color:#000000;background-color:transparent;font-weight:400;font-style:normal;font-variant:normal;text-decoration:none;vertical-align:baseline;white-space:pre;white-space:pre-wrap;">Q4 board update</span></h1><p dir="ltr" style="line-height:1.38;margin-top:0pt;margin-bottom:0pt;"><span style="font-size:11pt;font-family:Arial,sans-serif;color:#000000;background-color:transparent;font-weight:700;font-style:normal;font-variant:normal;text-decoration:none;vertical-align:baseline;white-space:pre;white-space:pre-wrap;">Revenue</span><span style="font-size:11pt;font-family:Arial,sans-serif;color:#000000;background-color:transparent;font-weight:400;font-style:italic;font-variant:normal;text-decoration:none;vertical-align:baseline;white-space:pre;white-space:pre-wrap;"> grew, see the </span><a href="https://www.google.com/url?q=https://example.com/report&amp;sa=D&amp;source=editors&amp;ust=1731300000000000&amp;usg=AOvVaw3x" style="text-decoration:none;"><span style="font-size:11pt;font-family:Arial,sans-serif;color:#1155cc;background-color:transparent;font-weight:400;font-style:normal;font-variant:normal;text-decoration:underline;-webkit-text-decoration-skip:none;text-decoration-skip-ink:none;vertical-align:baseline;white-space:pre;white-space:pre-wrap;">report</span></a><span style="font-size:11pt;font-family:Arial,sans-serif;color:#ff0000;background-color:#ffff00;font-weight:400;font-style:normal;font-variant:normal;text-decoration:line-through;vertical-align:super;white-space:pre;white-space:pre-wrap;">2</span></p><br /><ul style="margin-top:0;margin-bottom:0;padding-inline-start:48px;"><li dir="ltr" style="list-style-type:disc;font-size:11pt;font-family:Arial,sans-serif;color:#000000;background-color:transparent;font-weight:400;" aria-level="1"><p dir="ltr" style="line-height:1.38;margin-top:0pt;margin-bottom:0pt;" role="presentation"><span style="font-size:11pt;font-family:Arial,sans-serif;color:#000000;background-color:transparent;">Margin up two points</span></p></li><li dir="ltr" style="list-style-type:disc;" aria-level="1"><p dir="ltr" style="line-height:1.38;margin-top:0pt;margin-bottom:0pt;" role="presentation"><span style="font-size:11pt;font-family:Arial,sans-serif;color:#000000;">Costs flat</span></p></li></ul><div dir="ltr" style="margin-left:0pt;" align="left"><table style="border:none;border-collapse:collapse;table-layout:fixed;width:468pt"><colgroup><col width="234" /><col width="234" /></colgroup><tbody><tr style="height:0pt"><td style="border-left:solid #000000 1pt;border-right:solid #000000 1pt;vertical-align:top;background-color:#d9d9d9;padding:5pt 5pt 5pt 5pt;overflow:hidden;overflow-wrap:break-word;"><p dir="ltr" style="line-height:1.38;margin-top:0pt;margin-bottom:0pt;"><span style="font-size:11pt;font-family:Arial,sans-serif;color:#000000;font-weight:700;">Region</span></p></td><td style="vertical-align:top;padding:5pt 5pt 5pt 5pt;"><p dir="ltr" style="line-height:1.38;margin-top:0pt;margin-bottom:0pt;"><span style="font-size:11pt;font-family:Arial,sans-serif;color:#000000;">EMEA</span></p></td></tr></tbody></table></div></b>`;

const parse = (html: string) => {
  const e = new Editor({ extensions: documentExtensions("f"), content: normalizePastedHtml(html) });
  const json = e.getJSON();
  e.destroy();
  return json;
};
type N = { type: string; attrs?: Record<string, unknown>; marks?: { type: string; attrs?: Record<string, unknown> }[]; content?: N[]; text?: string };
const flat = (n: N): N[] => [n, ...(n.content ?? []).flatMap(flat)];
const marksOf = (doc: N, text: string) => flat(doc).find((n) => n.text === text)?.marks?.map((m) => m.type) ?? [];

describe("pasting from Word", () => {
  const doc = parse(WORD) as N;
  it("keeps headings without the source's font, and a paragraph's indent", () => {
    const h = doc.content![0]!;
    expect(h.type).toBe("heading");
    expect(h.attrs).toMatchObject({ level: 1, lineHeight: 1.07, spaceBefore: 12, spaceAfter: 0 });
    // The heading's own colour is a choice; its font and size are the document's heading style.
    expect(h.content![0]!.marks).toEqual([{ type: "textStyle", attrs: { color: "#2f5496", fontFamily: null, fontSize: null } }]);
    const p = doc.content![1]!;
    expect(p.attrs).toMatchObject({ indent: 1 });
  });
  it("keeps bold, italic, underline, links, sub- and superscript, colours, fonts, sizes and highlight", () => {
    expect(marksOf(doc, "Important:")).toEqual(expect.arrayContaining(["bold", "textStyle"]));
    const important = flat(doc).find((n) => n.text === "Important:")!.marks!.find((m) => m.type === "textStyle")!;
    expect(important.attrs).toEqual({ color: "#c00000", fontFamily: "Georgia", fontSize: 12 });
    expect(marksOf(doc, "new")).toContain("italic");
    expect(marksOf(doc, "checked")).toContain("underline");
    expect(flat(doc).find((n) => n.text === "the list")!.marks![0]).toMatchObject({ type: "link", attrs: { href: "https://example.com/sanctions" } });
    expect(marksOf(doc, "2")).toEqual(expect.arrayContaining(["subscript"]));
    expect(flat(doc).filter((n) => n.marks?.some((m) => m.type === "superscript"))).toHaveLength(1);
    expect(flat(doc).find((n) => n.text === "marked")!.marks).toEqual([{ type: "highlight", attrs: { color: "#ffff00" } }]);
  });
  it("turns list paragraphs into nested bulleted and numbered lists", () => {
    const lists = doc.content!.filter((n) => n.type === "bulletList" || n.type === "orderedList");
    expect(lists.map((l) => l.type)).toEqual(["bulletList", "orderedList"]);
    const bullets = lists[0]!;
    expect(bullets.content).toHaveLength(2);
    const first = bullets.content![0]!;
    expect(flat(first).filter((n) => n.type === "bulletList")).toHaveLength(1);
    expect(flat(first).map((n) => n.text).filter(Boolean)).toEqual(["Collect the tax certificate", "Valid for the current year"]);
    expect(flat(bullets.content![1]!).map((n) => n.text).filter(Boolean)).toEqual(["Record the bank details"]);
    expect(lists[1]!.content).toHaveLength(2);
    // No marker text is left in the words.
    expect(JSON.stringify(doc)).not.toMatch(/·|&nbsp;|Symbol/);
  });
  it("keeps tables with cell colour and merged cells", () => {
    const table = doc.content!.find((n) => n.type === "table")!;
    const cells = flat(table).filter((n) => n.type === "tableCell" || n.type === "tableHeader");
    expect(cells).toHaveLength(3);
    expect(cells[0]!.attrs).toMatchObject({ background: "#d9e2f3" });
    expect(cells[2]!.attrs).toMatchObject({ colspan: 2, background: null });
  });
  it("leaves nothing of Word's markup in the words", () => {
    expect(JSON.stringify(doc)).not.toMatch(/mso-|StartFragment|OfficeDocument|Style Definitions|supportLists/);
  });
});

describe("pasting from Google Docs", () => {
  const doc = parse(GOOGLE) as N;
  it("drops the wrapper and keeps the heading, with its spacing", () => {
    expect(doc.content![0]).toMatchObject({ type: "heading", attrs: { level: 1, lineHeight: 1.38, spaceBefore: 20, spaceAfter: 6 } });
    expect(JSON.stringify(doc.content![0])).not.toMatch(/Arial|"fontSize":20/);
  });
  it("keeps bold, italic, strike, superscript, colour, highlight and the link's real address", () => {
    expect(marksOf(doc, "Revenue")).toContain("bold");
    expect(marksOf(doc, " grew, see the ")).toContain("italic");
    const link = flat(doc).find((n) => n.text === "report")!;
    expect(link.marks!.find((m) => m.type === "link")).toMatchObject({ attrs: { href: "https://example.com/report" } });
    expect(marksOf(doc, "2")).toEqual(expect.arrayContaining(["strike", "superscript", "highlight", "textStyle"]));
    expect(flat(doc).find((n) => n.text === "2")!.marks!.find((m) => m.type === "textStyle")!.attrs).toMatchObject({ color: "#ff0000" });
  });
  it("keeps black as the automatic colour and the default size as no size", () => {
    const revenue = flat(doc).find((n) => n.text === "Revenue")!.marks!.find((m) => m.type === "textStyle");
    expect(revenue?.attrs).toMatchObject({ color: null, fontSize: null, fontFamily: "Arial" });
  });
  it("keeps lists and tables, with the cell's colour", () => {
    const ul = doc.content!.find((n) => n.type === "bulletList")!;
    expect(ul.content).toHaveLength(2);
    const cells = flat(doc.content!.find((n) => n.type === "table")!).filter((n) => n.type === "tableCell" || n.type === "tableHeader");
    expect(cells).toHaveLength(2);
    expect(cells[0]!.attrs).toMatchObject({ background: "#d9d9d9" });
    expect(cells[1]!.attrs).toMatchObject({ background: null });
  });
});

describe("pasting hostile HTML", () => {
  it("keeps the words and none of the script or style", () => {
    const doc = parse(`<p style="color:red;background:url(https://x.test/a);margin-left:expression(alert(1))" onclick="alert(1)"><span style="font-family:Arial;position:absolute;font-size:9999px">hello</span><script>alert(1)</script><img src="javascript:alert(1)" onerror="alert(1)"><a href="javascript:alert(1)">link</a></p>`);
    const out = JSON.stringify(doc);
    expect(out).toContain("hello");
    expect(out).not.toMatch(/javascript|alert|url\(|expression|position|9999/);
  });
});

describe("pictures in pasted HTML", () => {
  const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
  it("are told apart from a document's own", () => {
    expect(hasForeignImages(`<p>x</p><img src="${png}">`)).toBe(true);
    expect(hasForeignImages(`<img data-image="0b8f1c2e-1111-4222-8333-444455556666">`)).toBe(false);
    expect(hasForeignImages("<p>no pictures</p>")).toBe(false);
    expect(hasWords(`<img src="${png}">`)).toBe(false);
    expect(hasWords(`<p>a</p><img src="${png}">`)).toBe(true);
  });
  it("go up and take the place of the pictures they were, and are counted when they cannot", async () => {
    const sent: File[] = [];
    const id = "0b8f1c2e-1111-4222-8333-444455556666";
    const { html, skipped } = await localizeImages(`<p>before</p><img src="${png}" width="400"><p>after</p><img src="file:///C:/Users/a/pic.png"><img src="${png}" width="30">`, async (f) => {
      sent.push(f);
      return sent.length === 1 ? { id, width: 100, height: 50 } : null;
    });
    expect(sent).toHaveLength(2);
    expect(sent[0]!.type).toBe("image/png");
    expect(skipped).toBe(2);
    expect(html).toContain(`data-image="${id}"`);
    expect(html).not.toContain("file:");
    expect(html.indexOf("before")).toBeLessThan(html.indexOf(id));
    expect(html.indexOf(id)).toBeLessThan(html.indexOf("after"));
    // The picture's width is never more than what was kept.
    expect(html).toMatch(/width="100"[^>]*height="50"|height="50"[^>]*width="100"/);
  });
});
