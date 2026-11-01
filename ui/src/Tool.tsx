// The small buttons of the editor's toolbar and find bar. They do not take the caret away from the
// text when pressed.

import type { LucideIcon } from "lucide-react";

export function Tool({ label, icon: I, active, onClick, disabled }: { label: string; icon: LucideIcon; active?: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" className="doc-tool" aria-label={label} title={label} aria-pressed={active} disabled={disabled} onMouseDown={(e) => e.preventDefault()} onClick={onClick}>
      <I size={16} aria-hidden />
    </button>
  );
}

export function Sep() {
  return <span className="doc-sep" aria-hidden />;
}
