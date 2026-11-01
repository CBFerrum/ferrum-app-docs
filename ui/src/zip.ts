// Reading files out of a zip (a Word file is one), with what the browser has: the directory is read
// by hand, and deflate is undone by `DecompressionStream`. Nothing is extracted to disk or run, and
// no part may grow past a limit when unpacked.

export interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  size: number;
  offset: number;
}

const NOT_ZIP = "This is not a Word document: a .docx file is a zip, and this one could not be read as one.";

/** The files in a zip, from its central directory (zip64 is not read). */
export function zipEntries(bytes: Uint8Array): ZipEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  // The end record is in the last 64 KB.
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new Error(NOT_ZIP);
  const count = view.getUint16(end + 10, true);
  let p = view.getUint32(end + 16, true);
  const names = new TextDecoder();
  const out: ZipEntry[] = [];
  for (let n = 0; n < count; n++) {
    if (p + 46 > bytes.length || view.getUint32(p, true) !== 0x02014b50) throw new Error(NOT_ZIP);
    const nameLength = view.getUint16(p + 28, true);
    const extraLength = view.getUint16(p + 30, true);
    const commentLength = view.getUint16(p + 32, true);
    out.push({
      name: names.decode(bytes.subarray(p + 46, p + 46 + nameLength)),
      method: view.getUint16(p + 10, true),
      compressedSize: view.getUint32(p + 20, true),
      size: view.getUint32(p + 24, true),
      offset: view.getUint32(p + 42, true),
    });
    p += 46 + nameLength + extraLength + commentLength;
  }
  return out;
}

/** The most one part may be once unpacked: text parts of documents are far below it. */
export const MAX_PART = 40 * 1024 * 1024;

/** One file of a zip, unpacked. */
export async function readEntry(bytes: Uint8Array, entry: ZipEntry, limit = MAX_PART): Promise<Uint8Array> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (entry.offset + 30 > bytes.length || view.getUint32(entry.offset, true) !== 0x04034b50) throw new Error(NOT_ZIP);
  const start = entry.offset + 30 + view.getUint16(entry.offset + 26, true) + view.getUint16(entry.offset + 28, true);
  const data = bytes.subarray(start, start + entry.compressedSize);
  if (entry.method === 0) {
    if (data.length > limit) throw new Error("A part of the file is too large to read.");
    return data;
  }
  if (entry.method !== 8) throw new Error("The file uses a kind of compression this page cannot read.");
  if (entry.size > limit) throw new Error("A part of the file is too large to read.");
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > limit) {
      void reader.cancel();
      throw new Error("A part of the file is too large to read.");
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

/** The text of the file `name` in the zip, or null if it has none by that name. */
export async function readText(bytes: Uint8Array, entries: ZipEntry[], name: string): Promise<string | null> {
  const entry = entries.find((e) => e.name === name);
  return entry ? new TextDecoder().decode(await readEntry(bytes, entry)) : null;
}
