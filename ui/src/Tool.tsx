// The small buttons of the editor's toolbar, its menus and find bar. They do not take the caret away
// from the text when pressed, name themselves in a tooltip with their shortcut, and show "pressed" with
// a mark under the button as well as the fill, so colour is never the only signal.

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Kbd, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@ferrum/kit/primitives";

const mac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

/** A shortcut as the person's own keyboard names it: "Mod-Shift-b" as "Ctrl+Shift+B" or "⌘⇧B". */
export function shortcut(keys: string): string {
  const parts = keys.split(/-(?=.)/);
  const names: Record<string, [string, string]> = { Mod: ["Ctrl", "⌘"], Shift: ["Shift", "⇧"], Alt: ["Alt", "⌥"] };
  const out = parts.map((p) => (names[p] ? names[p]![mac ? 1 : 0] : p.length === 1 ? p.toUpperCase() : p));
  return mac ? out.join("") : out.join("+");
}

/** Where tooltips share their delay: around the toolbar and the bars that float over the page. */
export function Tips({ children }: { children: ReactNode }) {
  return <TooltipProvider delayDuration={400}>{children}</TooltipProvider>;
}

/** The tooltip for a control: its name, and its shortcut when it has one. */
export function Tip({ label, keys, children }: { label: string; keys?: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="bottom">
        {label}
        {keys && <Kbd className="ms-2">{shortcut(keys)}</Kbd>}
      </TooltipContent>
    </Tooltip>
  );
}

export function Tool({ label, icon: I, active, onClick, disabled, keys, danger }: { label: string; icon: LucideIcon; active?: boolean; onClick: () => void; disabled?: boolean; keys?: string; danger?: boolean }) {
  return (
    <Tip label={label} keys={keys}>
      <button type="button" className={`doc-tool${danger ? " doc-tool-danger" : ""}`} aria-label={label} aria-pressed={active} disabled={disabled} onMouseDown={(e) => e.preventDefault()} onClick={onClick}>
        <I size={16} aria-hidden />
      </button>
    </Tip>
  );
}

export function Sep() {
  return <span className="doc-sep" aria-hidden />;
}
