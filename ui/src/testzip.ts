// A zip builder for tests: a Word file made by hand (name -> text; the names in `stored` are not compressed).

export const bytesOf = (s: string) => new TextEncoder().encode(s);

async function deflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new CompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** A zip of `files` (name → text); the names in `stored` are not compressed. */
export async function zip(files: Record<string, string>, stored: string[] = []): Promise<Uint8Array> {
  const locals: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const raw = bytesOf(text);
    const method = stored.includes(name) ? 0 : 8;
    const data = method === 0 ? raw : await deflate(raw);
    const nm = bytesOf(name);
    const local = new Uint8Array(30 + nm.length + data.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(8, method, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, raw.length, true);
    lv.setUint16(26, nm.length, true);
    local.set(nm, 30);
    local.set(data, 30 + nm.length);
    const head = new Uint8Array(46 + nm.length);
    const hv = new DataView(head.buffer);
    hv.setUint32(0, 0x02014b50, true);
    hv.setUint16(4, 20, true);
    hv.setUint16(6, 20, true);
    hv.setUint16(10, method, true);
    hv.setUint32(20, data.length, true);
    hv.setUint32(24, raw.length, true);
    hv.setUint16(28, nm.length, true);
    hv.setUint32(42, offset, true);
    head.set(nm, 46);
    locals.push(local);
    central.push(head);
    offset += local.length;
  }
  const size = central.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, central.length, true);
  ev.setUint16(10, central.length, true);
  ev.setUint32(12, size, true);
  ev.setUint32(16, offset, true);
  const all = [...locals, ...central, end];
  const out = new Uint8Array(all.reduce((n, a) => n + a.length, 0));
  let at = 0;
  for (const a of all) {
    out.set(a, at);
    at += a.length;
  }
  return out;
}

