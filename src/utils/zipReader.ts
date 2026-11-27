// Чтение ZIP без библиотек: Store и Deflate (DecompressionStream). Записи отдаются по одной,
// чтобы распакованный архив не держать в памяти целиком.
// ZIP reader without libraries: Store and Deflate (DecompressionStream). Entries are handed out
// one by one so the unpacked archive is never held in memory whole.

export interface ZipEntry {
  name: string;
  isDirectory: boolean;
  data: Uint8Array;
}

// Коды ошибок: текст для человека подставляет вызывающий.
// Error codes: the caller maps them to text for people.
export const ZIP_ERR_INVALID = 'zip-invalid';
export const ZIP_ERR_NO_DECOMPRESS = 'zip-no-decompression';
export const ZIP_ERR_METHOD = 'zip-unsupported-method';

export class ZipError extends Error {
  code: string;
  constructor(code: string, detail = '') {
    super(detail ? `${code}: ${detail}` : code);
    this.code = code;
  }
}

async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const DS = (globalThis as any).DecompressionStream;
  if (typeof DS !== 'function') throw new ZipError(ZIP_ERR_NO_DECOMPRESS);
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const stream = new Blob([copy]).stream().pipeThrough(new DS('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Сколько записей в архиве (для прогресса). / Entry count in the archive (for progress). */
export function countZipEntries(zip: Uint8Array): number {
  const dv = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const eocd = findEocd(dv, zip.byteLength);
  return eocd < 0 ? 0 : dv.getUint16(eocd + 10, true);
}

/** Имена записей без распаковки (по центральному каталогу). / Entry names without inflating. */
export function listZipNames(zip: Uint8Array): string[] {
  const dv = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const eocd = findEocd(dv, zip.byteLength);
  if (eocd < 0) throw new ZipError(ZIP_ERR_INVALID);
  const total = dv.getUint16(eocd + 10, true);
  let cd = dv.getUint32(eocd + 16, true);
  const dec = new TextDecoder('utf-8');
  const out: string[] = [];
  for (let idx = 0; idx < total && cd + 46 <= zip.byteLength; idx++) {
    if (dv.getUint32(cd, true) !== 0x02014b50) break;
    const nameLen = dv.getUint16(cd + 28, true);
    const extraLen = dv.getUint16(cd + 30, true);
    const commentLen = dv.getUint16(cd + 32, true);
    out.push(dec.decode(zip.subarray(cd + 46, cd + 46 + nameLen)));
    cd += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

function findEocd(dv: DataView, len: number): number {
  const searchStart = Math.max(0, len - 65558);
  for (let i = len - 22; i >= searchStart; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) return i;
  }
  return -1;
}

/**
 * Обходит записи архива по порядку. Неподдерживаемый метод сжатия — ошибка, а не тихий пропуск.
 * Walks archive entries in order. An unsupported compression method is an error, not a silent skip.
 */
export async function forEachZipEntry(
  zip: Uint8Array,
  onEntry: (entry: ZipEntry, index: number, total: number) => Promise<void> | void
): Promise<number> {
  const dv = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const eocd = findEocd(dv, zip.byteLength);
  if (eocd < 0) throw new ZipError(ZIP_ERR_INVALID);

  const total = dv.getUint16(eocd + 10, true);
  let cd = dv.getUint32(eocd + 16, true);
  const dec = new TextDecoder('utf-8');
  let seen = 0;

  for (let idx = 0; idx < total && cd + 46 <= zip.byteLength; idx++) {
    if (dv.getUint32(cd, true) !== 0x02014b50) break;
    const method = dv.getUint16(cd + 10, true);
    const compSize = dv.getUint32(cd + 20, true);
    const nameLen = dv.getUint16(cd + 28, true);
    const extraLen = dv.getUint16(cd + 30, true);
    const commentLen = dv.getUint16(cd + 32, true);
    const localOff = dv.getUint32(cd + 42, true);
    const name = dec.decode(zip.subarray(cd + 46, cd + 46 + nameLen));
    cd += 46 + nameLen + extraLen + commentLen;

    if (name.endsWith('/')) {
      await onEntry({ name, isDirectory: true, data: new Uint8Array(0) }, idx, total);
      seen++;
      continue;
    }
    if (localOff + 30 > zip.byteLength || dv.getUint32(localOff, true) !== 0x04034b50) {
      throw new ZipError(ZIP_ERR_INVALID, name);
    }
    const lNameLen = dv.getUint16(localOff + 26, true);
    const lExtraLen = dv.getUint16(localOff + 28, true);
    const start = localOff + 30 + lNameLen + lExtraLen;
    const raw = zip.subarray(start, Math.min(zip.byteLength, start + compSize));

    let data: Uint8Array;
    if (method === 0) data = raw;
    else if (method === 8) data = await inflateRaw(raw);
    else throw new ZipError(ZIP_ERR_METHOD, `${name} (method ${method})`);

    await onEntry({ name, isDirectory: false, data }, idx, total);
    seen++;
  }
  return seen;
}
