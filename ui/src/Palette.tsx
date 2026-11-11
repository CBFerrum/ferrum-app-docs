// The colour palette for text, highlight and cells: ten hues in five shades, black, greys and white,
// "None" (the automatic colour, or no fill), the colours this person used last, and a hex field. The
// swatches are one tab stop: arrow keys move over them (up and down by a row of ten).

import { type KeyboardEvent, useState } from "react";
import { Ban } from "lucide-react";
import { isolate, t } from "@ferrum/client";
import { GREYS, HUES, SHADES, cleanColor } from "./format";
import { remember, remembered } from "./local";

const HUE_NAMES: Record<(typeof HUES)[number]["id"], () => string> = {
  red: () => t("Red"),
  orange: () => t("Orange"),
  yellow: () => t("Yellow"),
  green: () => t("Green"),
  teal: () => t("Teal"),
  cyan: () => t("Cyan"),
  blue: () => t("Blue"),
  indigo: () => t("Indigo"),
  purple: () => t("Purple"),
  pink: () => t("Pink"),
};
const SHADE_NAMES = [() => t("lightest"), () => t("light"), () => t("medium"), () => t("dark"), () => t("darkest")];
const GREY_NAMES = [() => t("Black"), () => t("Grey 90%"), () => t("Grey 75%"), () => t("Grey 60%"), () => t("Grey 40%"), () => t("Grey 30%"), () => t("Grey 20%"), () => t("Grey 15%"), () => t("Grey 6%"), () => t("White")];

/** The colours a person used last for this purpose, newest first. */
export function recentColors(kind: string): string[] {
  try {
    const raw: unknown = JSON.parse(remembered(`docs.recent.${kind}`) ?? "[]");
    return Array.isArray(raw) ? raw.map(cleanColor).filter((c): c is string => !!c).slice(0, 8) : [];
  } catch {
    return [];
  }
}
function noteRecent(kind: string, color: string) {
  remember(`docs.recent.${kind}`, JSON.stringify([color, ...recentColors(kind).filter((c) => c !== color)].slice(0, 8)));
}

/** Moves the focus over `.doc-swatch` buttons by arrow keys (`columns` to a row). */
export function gridKeys(e: KeyboardEvent<HTMLElement>, columns: number) {
  const keys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"];
  if (!keys.includes(e.key)) return;
  const cells = Array.from(e.currentTarget.querySelectorAll<HTMLElement>("[data-cell]"));
  const at = cells.indexOf(document.activeElement as HTMLElement);
  if (at < 0) return;
  const rtl = getComputedStyle(e.currentTarget).direction === "rtl" ? -1 : 1;
  const step = { ArrowLeft: -rtl, ArrowRight: rtl, ArrowUp: -columns, ArrowDown: columns, Home: -at, End: cells.length - 1 - at }[e.key]!;
  const next = Math.max(0, Math.min(cells.length - 1, at + step));
  e.preventDefault();
  cells[next]?.focus();
}

export function Palette({ kind, current, noneLabel, onPick }: { kind: string; current: string | null; noneLabel: string; onPick: (color: string | null) => void }) {
  const [hexText, setHex] = useState("");
  const [bad, setBad] = useState(false);
  const recent = recentColors(kind);
  const pick = (c: string | null) => {
    if (c) noteRecent(kind, c);
    onPick(c);
  };
  const swatch = (c: string, label: string, i: number, tab = false) => (
    <button key={`${label}-${i}`} type="button" className="doc-swatch" data-cell tabIndex={tab ? 0 : -1} style={{ background: c }} aria-label={label} aria-pressed={c === current} title={label} onClick={() => pick(c)} />
  );
  const apply = () => {
    const c = cleanColor(hexText.startsWith("#") ? hexText : `#${hexText}`);
    setBad(!c);
    if (c) pick(c);
  };
  return (
    <div className="doc-palette" role="group" aria-label={kind === "text" ? t("Text colour") : kind === "highlight" ? t("Highlight colour") : t("Cell colour")}>
      <button type="button" className="doc-palette-none" onClick={() => pick(null)} aria-pressed={current === null}>
        <Ban size={14} aria-hidden /> {isolate(noneLabel)}
      </button>
      <div className="doc-swatches" onKeyDown={(e) => gridKeys(e, 10)}>
        {GREYS.map((c, i) => swatch(c, GREY_NAMES[i]!(), i, i === 0))}
        {SHADES.flatMap((row, s) => row.map((c, h) => swatch(c, t("{hue}, {shade}", { hue: HUE_NAMES[HUES[h]!.id](), shade: SHADE_NAMES[s]!() }), s * 10 + h)))}
      </div>
      {recent.length > 0 && (
        <>
          <div className="doc-palette-label">{t("Recent")}</div>
          <div className="doc-swatches doc-swatches-recent" onKeyDown={(e) => gridKeys(e, 8)}>
            {recent.map((c, i) => swatch(c, t("Recent colour {value}", { value: c }), i, i === 0))}
          </div>
        </>
      )}
      <form
        className="doc-palette-hex"
        onSubmit={(e) => {
          e.preventDefault();
          apply();
        }}
      >
        <label className="doc-palette-label" htmlFor={`doc-hex-${kind}`}>
          {t("Custom colour")}
        </label>
        <input id={`doc-hex-${kind}`} className="input" dir="ltr" inputMode="text" placeholder="#1F4E79" maxLength={9} value={hexText} aria-invalid={bad || undefined} onChange={(e) => setHex(e.target.value)} />
      </form>
    </div>
  );
}
