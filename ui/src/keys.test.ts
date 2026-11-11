// @vitest-environment jsdom
import { Editor } from "@tiptap/core";
import { describe, expect, it, vi } from "vitest";
import { DocKeys, SHORTCUTS, matches, pageKey } from "./keys";
import { documentExtensions } from "./schema";

const ev = (o: Partial<KeyboardEvent>) => ({ key: "", code: "", metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...o }) as KeyboardEvent;

describe("the shortcut table", () => {
  it("names each key once and gives every key the editor handles something to do", () => {
    const all = SHORTCUTS.flatMap((s) => s.keys);
    expect(new Set(all).size).toBe(all.length);
    for (const s of SHORTCUTS) if (s.scope !== "native") expect(s.run, s.id).toBeTypeOf("function");
  });

  it("matches keys by their place for letters, and the modifiers exactly", () => {
    expect(matches(ev({ code: "KeyM", key: "µ", metaKey: true, altKey: true }), "Mod-Alt-m", true)).toBe(true);
    expect(matches(ev({ code: "KeyK", key: "k", ctrlKey: true }), "Mod-k", false)).toBe(true);
    expect(matches(ev({ code: "KeyK", key: "K", ctrlKey: true, shiftKey: true }), "Mod-k", false)).toBe(false);
    expect(matches(ev({ code: "KeyK", key: "k", metaKey: true }), "Mod-k", false)).toBe(false);
    expect(matches(ev({ code: "Slash", key: "/", ctrlKey: true }), "Mod-/", false)).toBe(true);
  });

  it("finds the page's keys, Replace being ⌘⇧H on a Mac", () => {
    vi.stubGlobal("navigator", { platform: "MacIntel", language: "en" });
    expect(pageKey(ev({ code: "KeyH", key: "h", metaKey: true, shiftKey: true }))?.id).toBe("replace");
    expect(pageKey(ev({ code: "KeyS", key: "s", metaKey: true }))?.id).toBe("save");
    vi.unstubAllGlobals();
    vi.stubGlobal("navigator", { platform: "Win32", language: "en" });
    expect(pageKey(ev({ code: "KeyH", key: "h", ctrlKey: true }))?.id).toBe("replace");
    expect(pageKey(ev({ code: "Slash", key: "/", ctrlKey: true }))?.id).toBe("help");
    vi.unstubAllGlobals();
  });

  it("binds every text key of the table in the editor, above the extensions' own", () => {
    const page = { link: vi.fn(), find: vi.fn(), replace: vi.fn(), comment: vi.fn(), save: vi.fn(), help: vi.fn(), bar: vi.fn() };
    const e = new Editor({ extensions: [...documentExtensions("f"), DocKeys.configure({ page: () => page })], content: "<p>Ship on Friday</p>" });
    e.commands.setTextSelection({ from: 1, to: 5 });
    expect(e.commands.keyboardShortcut("Mod-k")).toBe(true);
    expect(e.commands.keyboardShortcut("Mod-Shift-k")).toBe(true);
    expect(page.link).toHaveBeenCalledTimes(2);
    e.commands.keyboardShortcut("Mod-b");
    expect(e.isActive("bold")).toBe(true);
    e.commands.keyboardShortcut("Mod-Alt-2");
    expect(e.isActive("heading", { level: 2 })).toBe(true);
    e.commands.keyboardShortcut("Mod-Alt-0");
    expect(e.isActive("paragraph")).toBe(true);
    e.commands.setTextSelection(15);
    e.commands.keyboardShortcut("Mod-Enter");
    expect(e.state.doc.children.map((c) => c.type.name)).toContain("pageBreak");
    e.destroy();
  });
});
