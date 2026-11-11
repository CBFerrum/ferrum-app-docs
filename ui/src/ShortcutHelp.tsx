// Ctrl or ⌘ /: every keyboard shortcut the editor has, in the person's own key names, made from the table the
// key handlers use (keys.ts). Loaded when it is opened.

import { Fragment } from "react";
import { t } from "@ferrum/client";
import { Button, Dialog } from "@ferrum/kit";
import { Kbd } from "@ferrum/kit/primitives";
import { type KeyGroup, SHORTCUTS, isMac } from "./keys";
import { shortcut } from "./Tool";

const GROUPS: { id: KeyGroup; label: () => string }[] = [
  { id: "text", label: () => t("Text") },
  { id: "paragraph", label: () => t("Paragraphs and lists") },
  { id: "insert", label: () => t("Insert") },
  { id: "document", label: () => t("Document") },
];

export default function ShortcutHelp({ onClose }: { onClose: () => void }) {
  return (
    <Dialog open onClose={onClose} title={t("Keyboard shortcuts")} footer={<Button onClick={onClose}>{t("Close")}</Button>}>
      {/* Scrolls by itself, and can be scrolled from the keyboard. */}
      <div className="doc-keys" tabIndex={0} role="region" aria-label={t("Keyboard shortcuts")}>
        {GROUPS.map((g) => (
          <section key={g.id} aria-labelledby={`doc-keys-${g.id}`}>
            <h3 id={`doc-keys-${g.id}`} className="doc-keys-group">
              {g.label()}
            </h3>
            <dl className="doc-keys-list">
              {SHORTCUTS.filter((s) => s.group === g.id).map((s) => (
                <Fragment key={s.id}>
                  <dt>{s.label()}</dt>
                  <dd>
                    {((isMac() && s.mac) || s.keys).map((k, i) => (
                      <Fragment key={k}>
                        {i > 0 && <span className="faint"> {t("or")} </span>}
                        <Kbd>{shortcut(k)}</Kbd>
                      </Fragment>
                    ))}
                  </dd>
                </Fragment>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Dialog>
  );
}
