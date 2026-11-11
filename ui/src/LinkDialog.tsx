// The dialog behind the toolbar's Link button and Ctrl+K: where the selected words go.

import type { Editor } from "@tiptap/core";
import { type FormEvent, type ReactNode, useState } from "react";
import { t } from "@ferrum/client";
import { Button, Dialog, Field } from "@ferrum/kit";

/** The web and mail only: anything else a reader could not follow safely. */
export function cleanHref(raw: string): string | null {
  const href = raw.trim();
  if (!href) return null;
  if (/^(https?:|mailto:)/i.test(href)) return href;
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return null;
  return href.includes("@") && !href.includes("/") ? `mailto:${href}` : `https://${href}`;
}

export function LinkDialog({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const current = (editor.getAttributes("link").href as string | undefined) ?? "";
  const [href, setHref] = useState(current);
  const [error, setError] = useState<string | null>(null);
  const save = (e: FormEvent) => {
    e.preventDefault();
    const clean = cleanHref(href);
    if (!href.trim()) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return onClose();
    }
    if (!clean) return setError("Links go to web pages (https://…) or email addresses.");
    editor.chain().focus().extendMarkRange("link").setLink({ href: clean }).run();
    onClose();
  };
  const footer: ReactNode = (
    <>
      {current && (
        <Button
          variant="danger"
          onClick={() => {
            editor.chain().focus().extendMarkRange("link").unsetLink().run();
            onClose();
          }}
        >
          {t("Remove link")}
        </Button>
      )}
      <Button onClick={onClose}>{t("Cancel")}</Button>
      <Button variant="primary" type="submit" form="doc-link-form">
        {t("Save")}
      </Button>
    </>
  );
  return (
    <Dialog open onClose={onClose} title={current ? t("Edit link") : t("Add a link")} footer={footer}>
      <form id="doc-link-form" onSubmit={save}>
        <Field label={t("Address")} htmlFor="doc-link-href" error={error ?? undefined}>
          <input
            id="doc-link-href"
            className="input"
            type="text"
            inputMode="url"
            placeholder="https://example.com"
            value={href}
            aria-invalid={!!error || undefined}
            aria-describedby={error ? "doc-link-href-error" : undefined}
            onChange={(e) => setHref(e.target.value)}
            data-autofocus
          />
        </Field>
      </form>
    </Dialog>
  );
}
