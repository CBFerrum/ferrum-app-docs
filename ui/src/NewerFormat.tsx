// What a document shows when it was written by a newer Docs than this one (compat.ts): never an empty
// page, never "Saved". A reload gets the newest interface; if that was already tried in this session the
// workspace's Docs needs updating, and the document can still be taken as Word or PDF.

import { t } from "@ferrum/client";
import { Button, StatePanel } from "@ferrum/kit";

const KEY = "docs.reloaded";
const tried = () => {
  try {
    return sessionStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
};

export function NewerFormat({ download }: { download: (format: "docx" | "pdf") => void }) {
  const again = tried();
  const reload = () => {
    try {
      sessionStorage.setItem(KEY, "1");
    } catch {
      // Without session storage the message stays the first one.
    }
    location.reload();
  };
  return (
    <StatePanel
      kind="failed"
      title={t("This document uses features from a newer version of Docs")}
      error={again ? t("This workspace's Docs needs updating before it can open this document. Ask an administrator to update it. Until then you can download the document.") : t("Reload to get the latest version.")}
      action={
        again ? (
          <span style={{ display: "inline-flex", gap: 8 }}>
            <Button onClick={() => download("docx")}>{t("Download as Word (.docx)")}</Button>
            <Button onClick={() => download("pdf")}>{t("Download as PDF")}</Button>
          </span>
        ) : (
          <Button variant="primary" onClick={reload}>
            {t("Reload")}
          </Button>
        )
      }
    />
  );
}
