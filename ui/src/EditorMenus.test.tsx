import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { type Choice, Choices } from "./EditorMenus";

const choice = (key: string, group: string, title = key): Choice => ({ key, group, title, hint: `About ${title}`, icon: <i />, run: () => undefined });
const list = [choice("a", "Text"), choice("b", "Text"), choice("c", "Lists"), choice("d", "Insert")];
const html = (query: string, index: number, choices = list) => renderToStaticMarkup(<Choices choices={choices} index={index} listId="menu-1" label="Blocks" query={query} />);

describe("a menu at the caret", () => {
  it("numbers its choices across the groups, as the editor names the one in view", () => {
    const out = html("", 2);
    expect([...out.matchAll(/id="(menu-1-\d)"/g)].map((m) => m[1])).toEqual(["menu-1-0", "menu-1-1", "menu-1-2", "menu-1-3"]);
    // Only the one in view is selected.
    expect(out.match(/aria-selected="true"/g)).toHaveLength(1);
    expect(out).toMatch(/id="menu-1-2"[^>]*aria-selected="true"/);
    expect(out).toContain('role="listbox"');
    expect(out).toContain('id="menu-1"');
    expect(out.match(/role="option"/g)).toHaveLength(4);
    expect(out.match(/role="group"/g)).toHaveLength(3);
  });

  it("names its groups until something narrows the list", () => {
    expect(html("", 0)).toContain('class="doc-pop-group"');
    expect(html("te", 0)).not.toContain("doc-pop-group");
  });

  it("tells screen readers how many choices there are", () => {
    expect(html("", 0)).toContain("4 choices.");
    expect(html("", 0, [choice("only", "Text")])).toContain("1 choice.");
  });

  it("says what each choice is and what it does", () => {
    const out = html("", 0, [choice("h1", "Text", "Heading 1")]);
    expect(out).toContain("Heading 1");
    expect(out).toContain("About Heading 1");
  });
});
