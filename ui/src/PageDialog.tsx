// File > Page setup: paper, orientation and margins, in the person's units (centimetres or inches by
// locale). The values go into the shared document when the person applies them, and everyone in the
// document sees the page change.

import { type FormEvent, useId, useState } from "react";
import type * as Y from "yjs";
import { t } from "@ferrum/client";
import { Button, Dialog, Field } from "@ferrum/kit";
import { MAX_MARGIN, MIN_MARGIN, MIN_TEXT, PAPERS, PAPER_NAMES, type Paper, type PageSetup, PRESETS, type Preset, type Unit, dims, formatLength, parseLength, presetOf, writeSetup } from "./page";

const SIDES = ["top", "bottom", "left", "right"] as const;
const sideName = (s: (typeof SIDES)[number]) => (s === "top" ? t("Top") : s === "bottom" ? t("Bottom") : s === "left" ? t("Left") : t("Right"));
const presetName = (p: Preset) => (p === "normal" ? t("Normal") : p === "narrow" ? t("Narrow") : t("Wide"));

export default function PageDialog({ doc, setup, unit, onClose }: { doc: Y.Doc; setup: PageSetup; unit: Unit; onClose: () => void }) {
  const id = useId();
  const [paper, setPaper] = useState<Paper>(setup.size);
  const [orientation, setOrientation] = useState(setup.orientation);
  const [first, setFirst] = useState(setup.differentFirst);
  const [text, setText] = useState<Record<(typeof SIDES)[number], string>>({ top: formatLength(setup.top, unit), bottom: formatLength(setup.bottom, unit), left: formatLength(setup.left, unit), right: formatLength(setup.right, unit) });
  const parsed = Object.fromEntries(SIDES.map((s) => [s, parseLength(text[s], unit)])) as Record<(typeof SIDES)[number], number | null>;
  const [w, h] = dims({ size: paper, orientation });
  const problem = (() => {
    for (const s of SIDES) {
      const v = parsed[s];
      if (v === null) return t("{side}: enter a length such as 2.5", { side: sideName(s) });
      if (v < MIN_MARGIN || v > MAX_MARGIN) return t("{side}: between {min} and {max} {unit}", { side: sideName(s), min: formatLength(MIN_MARGIN, unit), max: formatLength(MAX_MARGIN, unit), unit });
    }
    if (w - parsed.left! - parsed.right! < MIN_TEXT || h - parsed.top! - parsed.bottom! < MIN_TEXT) return t("The margins leave too little room for text");
    return null;
  })();
  const preset = problem ? null : presetOf({ top: parsed.top!, right: parsed.right!, bottom: parsed.bottom!, left: parsed.left! });
  const choose = (p: Preset) => setText(Object.fromEntries(SIDES.map((s) => [s, formatLength(PRESETS[p][s], unit)])) as typeof text);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (problem) return;
    writeSetup(doc, { size: paper, orientation, top: parsed.top!, right: parsed.right!, bottom: parsed.bottom!, left: parsed.left!, differentFirst: first });
    onClose();
  };
  // A small page with its text area, to see what the margins do.
  const scale = 120 / Math.max(w, h);
  const footer = (
    <>
      <Button onClick={onClose}>{t("Cancel")}</Button>
      <Button variant="primary" type="submit" form={`${id}-form`} disabled={!!problem}>
        {t("Apply")}
      </Button>
    </>
  );
  return (
    <Dialog open onClose={onClose} title={t("Page setup")} footer={footer}>
      <form id={`${id}-form`} onSubmit={submit} className="stack">
        <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 14rem" }} className="stack">
            <Field label={t("Paper size")} htmlFor={`${id}-paper`}>
              <select id={`${id}-paper`} className="input" value={paper} onChange={(e) => setPaper(e.target.value as Paper)} data-autofocus>
                {PAPERS.map((p) => (
                  <option key={p} value={p}>
                    {PAPER_NAMES[p]}
                  </option>
                ))}
              </select>
            </Field>
            <div role="group" aria-label={t("Orientation")} style={{ display: "flex", gap: 6 }}>
              <Button size="sm" aria-pressed={orientation === "portrait"} variant={orientation === "portrait" ? "primary" : "default"} onClick={() => setOrientation("portrait")}>
                {t("Portrait")}
              </Button>
              <Button size="sm" aria-pressed={orientation === "landscape"} variant={orientation === "landscape" ? "primary" : "default"} onClick={() => setOrientation("landscape")}>
                {t("Landscape")}
              </Button>
            </div>
          </div>
          <div aria-hidden style={{ position: "relative", inlineSize: w * scale, blockSize: h * scale, background: "var(--surface)", border: "1px solid var(--border-strong)", flex: "none" }}>
            {!problem && <div style={{ position: "absolute", insetBlockStart: parsed.top! * scale, insetBlockEnd: parsed.bottom! * scale, insetInlineStart: parsed.left! * scale, insetInlineEnd: parsed.right! * scale, border: "1px dashed var(--primary)" }} />}
          </div>
        </div>
        <Field label={t("Margins")} htmlFor={`${id}-preset`}>
          <select id={`${id}-preset`} className="input" value={preset ?? "custom"} onChange={(e) => e.target.value !== "custom" && choose(e.target.value as Preset)}>
            {(Object.keys(PRESETS) as Preset[]).map((p) => (
              <option key={p} value={p}>
                {presetName(p)}
              </option>
            ))}
            <option value="custom">{t("Custom")}</option>
          </select>
        </Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {SIDES.map((s) => (
            <Field key={s} label={t("{side} ({unit})", { side: sideName(s), unit: unit === "cm" ? t("cm") : t("in") })} htmlFor={`${id}-${s}`}>
              <input id={`${id}-${s}`} className="input" inputMode="decimal" value={text[s]} aria-invalid={parsed[s] === null || undefined} onChange={(e) => setText({ ...text, [s]: e.target.value })} />
            </Field>
          ))}
        </div>
        {problem && (
          <div role="alert" style={{ color: "var(--danger)", fontSize: "var(--text-sm)" }}>
            {problem}
          </div>
        )}
        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input type="checkbox" checked={first} onChange={(e) => setFirst(e.target.checked)} /> {t("Different header and footer on the first page")}
        </label>
      </form>
    </Dialog>
  );
}
