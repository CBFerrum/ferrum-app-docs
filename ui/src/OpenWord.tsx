// `/docs/open/:file`: a Word file in Drive opened as a live document. Docs makes a new document beside the Word
// file (the Word file is never replaced), carries over what wave 2's importer can, says what it could not, and
// opens the new document. Drive offers this for .docx files ("Open as a Ferrum document"); anyone can also come
// here from a link.

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, FileText } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { api, errorMessage, fetchBlob, shell, t } from "@ferrum/client";
import { Button, ReaderSkeleton, StatePanel } from "@ferrum/kit";
import { type ItemInfo, allows, docTitle } from "./livedocs";

type Step = { at: "ask" } | { at: "working" } | { at: "done"; id: string; notes: string[] } | { at: "failed"; error: string };

export function OpenWordPage() {
  const { file } = useParams();
  const navigate = useNavigate();
  const info = useQuery({ queryKey: ["drive", "item", file], queryFn: ({ signal }) => api.get<ItemInfo>("/api/app/drive/item_info", { item: file }, signal), retry: false });
  const space = useQuery({ queryKey: ["drive", "space"], queryFn: ({ signal }) => api.get<{ id: string }>("/api/app/drive/space", undefined, signal) });
  const [step, setStep] = useState<Step>({ at: "ask" });
  useEffect(() => shell().title(t("Open as a Ferrum document")), []);
  if (info.error) return <StatePanel kind="failed" title={t("This file cannot be opened")} error={info.error} onRetry={() => void info.refetch()} action={<a href="/drive/">{t("Go to Drive")}</a>} />;
  if (!info.data || !file) return <ReaderSkeleton />;
  const name = info.data.name;
  const toDrive = info.data.parent ? `/drive/${encodeURIComponent(info.data.parent)}?item=${encodeURIComponent(file)}` : "/drive/";
  if (!/\.docx$/i.test(name)) return <StatePanel kind="empty" title={t("Only Word documents (.docx) open as a Ferrum document")} action={<a href={toDrive}>{t("Back to Drive")}</a>} />;
  const mayCreate = !!space.data && !!info.data.parent;

  const make = async () => {
    setStep({ at: "working" });
    try {
      const { importFile, fillDocument } = await import("./importing");
      const blob = await fetchBlob(`/api/app/drive/files/${encodeURIComponent(file)}/content`);
      const doc = await importFile(new File([blob], name, { type: blob.type }));
      const made = await api.post<{ id: string }>(`/api/v1/DriveSpace/${space.data!.id}/actions/create_document`, { title: doc.title, markdown: doc.markdown, folder: info.data!.parent });
      const more = doc.docx ? await fillDocument(made.id, doc.docx) : [];
      const notes = [...doc.notes, ...more];
      if (!notes.length) return navigate(`/d/${made.id}`, { replace: true });
      setStep({ at: "done", id: made.id, notes });
    } catch (e) {
      setStep({ at: "failed", error: errorMessage(e) });
    }
  };

  return (
    <div className="docs-open">
      <a className="btn btn-default btn-sm" href={toDrive}>
        <ArrowLeft size={16} aria-hidden /> {t("Back to Drive")}
      </a>
      <section className="docs-open-card" aria-labelledby="docs-open-title" aria-busy={step.at === "working"}>
        <FileText size={32} aria-hidden className="docs-open-icon" />
        <h1 id="docs-open-title" className="docs-open-title">
          {t("Open “{name}” as a Ferrum document", { name })}
        </h1>
        {step.at === "done" ? (
          <>
            <p role="status">{t("“{name}” is a Ferrum document now, beside the Word file. Some of it was not carried over:", { name: docTitle(name.replace(/\.docx$/i, ".fdoc")) })}</p>
            <ul className="docs-open-notes">
              {step.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
            <Button variant="primary" onClick={() => navigate(`/d/${step.id}`, { replace: true })} autoFocus>
              {t("Open the document")}
            </Button>
          </>
        ) : (
          <>
            <p>{t("A new document everyone can edit at once is made in the same folder. The Word file stays as it is.")}</p>
            {step.at === "failed" && (
              <p className="docs-open-error" role="alert">
                {t("The Word file could not be opened as a document. {e}", { e: step.error })}
              </p>
            )}
            <div className="docs-open-actions">
              <Button variant="primary" loading={step.at === "working"} disabled={!mayCreate || !allows(info.data.permission, "View")} onClick={() => void make()}>
                {step.at === "working" ? t("Making the document…") : t("Open as a Ferrum document")}
              </Button>
              <a className="btn btn-default" href={toDrive}>
                {t("Cancel")}
              </a>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
