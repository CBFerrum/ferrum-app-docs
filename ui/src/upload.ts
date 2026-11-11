// Pictures going into a document: one path for a picked file, a dropped or pasted one, a picture
// inside pasted Word or Google Docs text, and a replacement. Each goes up to Drive, which keeps it for
// the document; the document holds its id, never the bytes.

import type { Editor } from "@tiptap/core";
import { api, errorMessage, t } from "@ferrum/client";
import { toast } from "@ferrum/kit";
import { IMAGE_TYPES, MAX_IMAGE } from "./image";

export interface Uploaded {
  id: string;
  width: number;
  height: number;
}

/** Sends one picture to Drive for `file`; says why and gives null when it cannot be kept. */
export async function uploadImage(file: string, f: File): Promise<Uploaded | null> {
  if (!IMAGE_TYPES.includes(f.type)) {
    toast(t("“{name}” is not a kind of picture documents keep (PNG, JPEG, GIF or WebP)", { name: f.name || t("The picture") }), "error");
    return null;
  }
  if (f.size > MAX_IMAGE) {
    toast(t("“{name}” is larger than 10 MB", { name: f.name || t("The picture") }), "error");
    return null;
  }
  try {
    return await api.post<Uploaded>(`/api/app/drive/files/${encodeURIComponent(file)}/images`, f);
  } catch (e) {
    toast(errorMessage(e), "error");
    return null;
  }
}

/** Adds image files to the document: each goes up to Drive, then into the text at the selection, in order. */
export async function addImages(editor: Editor, file: string, files: File[]) {
  for (const f of files) {
    const up = await uploadImage(file, f);
    if (up) editor.chain().focus().insertImage({ image: up.id, alt: "", width: up.width, height: up.height }).run();
  }
}

/** Puts a picked file in the place of the selected image. */
export async function replaceImageWith(editor: Editor, file: string, f: File) {
  const up = await uploadImage(file, f);
  if (up) editor.chain().focus().replaceImage({ image: up.id, width: up.width, height: up.height }).run();
}
