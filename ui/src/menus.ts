// The menus that open at the caret as you type: `/` for blocks and `@` for people and records.
// This file finds the trigger in the text and owns the keys; the menus themselves (what they list,
// how they look, what choosing does) are EditorMenus.tsx.
//
// A trigger is a `/` or `@` that starts a word, followed by what has been typed since. It closes when
// the caret leaves it, when nothing matches, or on Escape, which also keeps it from opening again
// on the same character. Where the text is not being typed in (read only, suggesting) there is none.

import { Extension } from "@tiptap/core";
import type { ResolvedPos } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";

export interface Trigger {
  char: "/" | "@";
  /** Where the trigger character is. */
  from: number;
  /** The caret: the end of what has been typed. */
  to: number;
  /** What follows the character. */
  query: string;
}

/** Stands in for an inline node (a mention, a break) in the text before the caret. */
const OBJECT = "￼";
/** The longest query: past it the person is writing, not searching. */
const MAX = 30;

/** The text of `$pos`'s textblock up to `$pos`, each inline node as one character of its own. */
export function textBefore($pos: ResolvedPos): string {
  let out = "";
  $pos.parent.forEach((child, offset) => {
    if (offset >= $pos.parentOffset) return;
    out += child.isText ? child.text!.slice(0, $pos.parentOffset - offset) : OBJECT;
  });
  return out;
}

// A trigger starts a word: after nothing, a space, another node, or an opening bracket or quote
// (so "and/or" and "ana@acme.test" are just words). Its query runs to the caret and holds no second
// `/` or `@`, and does not start with a space.
const SLASH = new RegExp(`(^|[\\s${OBJECT}])\\/((?:[^\\s/${OBJECT}][^/\\n${OBJECT}]{0,${MAX - 2}})?)$`);
const AT = new RegExp(`(^|[\\s${OBJECT}(\\[{"'“‘])@((?:[^\\s@${OBJECT}][^@\\n${OBJECT}]{0,${MAX - 2}})?)$`);

/** The trigger the caret is in, if any. */
export function findTrigger($pos: ResolvedPos): Trigger | null {
  const parent = $pos.parent;
  if (!parent.isTextblock || parent.type.spec.code) return null;
  if ($pos.marks().some((m) => m.type.name === "code")) return null;
  const before = textBefore($pos);
  for (const [char, re] of [["/", SLASH], ["@", AT]] as const) {
    const m = re.exec(before);
    if (m) return { char, from: $pos.pos - 1 - m[2]!.length, to: $pos.pos, query: m[2]! };
  }
  return null;
}

export interface MenuState {
  trigger: Trigger | null;
  /** The choice the keys are on. */
  index: number;
  /** The place where Escape closed a menu: it stays closed there. */
  dismissed: number | null;
}

export const menuKey = new PluginKey<MenuState>("docMenus");

/** What the menus ask of the page that shows them. */
export interface MenuHooks {
  /** Whether menus may open now: the text takes typing, and is not being suggested. */
  enabled: () => boolean;
  /** How many choices the open menu has; none leaves every key to the editor. */
  count: () => number;
  /** Takes choice `index` of the open menu. */
  choose: (index: number) => void;
  /** The ids of the choices are `${listId}-${index}`, and the editor names the one in view. */
  listId: string;
}

const sameTrigger = (a: Trigger | null, b: Trigger | null) => a === b || (!!a && !!b && a.char === b.char && a.from === b.from && a.query === b.query);

/** The plugin behind the menus; `hooks` is asked afresh each time, so the page may change them. */
export function menuPlugin(hooks: () => MenuHooks): Plugin<MenuState> {
  return new Plugin<MenuState>({
    key: menuKey,
    state: {
      init: () => ({ trigger: null, index: 0, dismissed: null }),
      apply(tr, before, _old, state) {
        const meta = tr.getMeta(menuKey) as { index?: number; dismiss?: boolean } | undefined;
        if (!meta && !tr.docChanged && !tr.selectionSet) return before;
        let dismissed = before.dismissed;
        if (meta?.dismiss && before.trigger) dismissed = before.trigger.from;
        const found = hooks().enabled() && state.selection.empty ? findTrigger(state.selection.$from) : null;
        if (!found) dismissed = null;
        const trigger = found && found.from !== dismissed ? found : null;
        const index = meta?.index ?? (sameTrigger(trigger, before.trigger) ? before.index : 0);
        return { trigger, index, dismissed };
      },
    },
    props: {
      handleKeyDown(view, event) {
        const st = menuKey.getState(view.state);
        if (!st?.trigger || event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return false;
        const n = hooks().count();
        if (!n) return false;
        const go = (index: number) => view.dispatch(view.state.tr.setMeta(menuKey, { index }));
        switch (event.key) {
          case "ArrowDown":
            go((st.index + 1) % n);
            return true;
          case "ArrowUp":
            go((st.index - 1 + n) % n);
            return true;
          case "Enter":
          case "Tab":
            hooks().choose(Math.min(st.index, n - 1));
            return true;
          case "Escape":
            view.dispatch(view.state.tr.setMeta(menuKey, { dismiss: true }));
            return true;
          default:
            return false;
        }
      },
      // The editor names the choice in view, for screen readers.
      attributes(state): Record<string, string> {
        const st = menuKey.getState(state);
        if (!st?.trigger || !hooks().count()) return {};
        return { "aria-haspopup": "listbox", "aria-expanded": "true", "aria-controls": hooks().listId, "aria-activedescendant": `${hooks().listId}-${st.index}` };
      },
    },
  });
}

export const Menus = Extension.create<{ hooks: MenuHooks }>({
  name: "docMenus",

  addOptions() {
    return { hooks: { enabled: () => false, count: () => 0, choose: () => undefined, listId: "doc-menu" } };
  },

  addProseMirrorPlugins() {
    return [menuPlugin(() => this.options.hooks)];
  },
});
