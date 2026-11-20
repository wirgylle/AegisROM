// Поиск названия рома по хешу в DAT No-Intro / Redump через Go API (/api/dat/*).
// Хеш считается здесь, в браузере, по полному файлу; сами DAT лежат и ищутся на стороне Go.
//
// Title lookup by hash in No-Intro / Redump DATs through the Go API (/api/dat/*).
// Hashes are computed here, in the browser, over the whole file; DATs live and are searched in Go.

export type DatSource = 'no-intro' | 'redump' | 'tosec' | 'other';

export interface DatInfo {
  file: string;
  name: string;
  source: DatSource;
  system: string;
  games: number;
  roms: number;
  error?: string;
}

export interface DatStatus {
  dir: string;
  dats: DatInfo[];
  games: number;
  roms: number;
}

export interface DatQuery {
  id: string;
  system?: string;
  size?: number;
  crc32?: string;
  headerlessCrc32?: string;
  headerlessSize?: number;
  sha1?: string;
  serial?: string;
}

export interface DatMatch {
  id: string;
  matched: boolean;
  name?: string;
  romName?: string;
  source?: DatSource;
  datName?: string;
  datFile?: string;
  matchedBy?: 'sha1' | 'md5' | 'crc32' | 'crc32-headerless' | 'serial';
  badDump?: boolean;
  reason?: string;
}

// Что нужно знать о роме, чтобы посчитать хеш. / What we need to know about a ROM to hash it.
export interface DatHashInput {
  id: string;
  fileName: string;
  extension: string;
  consoleCode: string;
  system?: string;
  fileObj?: File;
  companionFiles?: File[];
  discs?: DatHashInput[];
}

// Диски больше этого размера целиком не хешируем (DVD PS2 ~4 ГБ) — только серийник.
// Discs above this size are not fully hashed (PS2 DVDs ~4 GB) — serial only.
export const MAX_FULL_HASH_BYTES = 1024 * 1024 * 1024;
// До этого размера дополнительно считаем SHA1 (нужен весь файл в памяти).
// Up to this size we also compute SHA1 (needs the whole file in memory).
const MAX_SHA1_BYTES = 64 * 1024 * 1024;
const CHUNK = 16 * 1024 * 1024;
const SERIAL_SCAN_BYTES = 4 * 1024 * 1024;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

// Потоковый CRC32: crcUpdate(~0, ...) ... затем crcFinish. / Streaming CRC32.
export function crcUpdate(crc: number, bytes: Uint8Array, from = 0): number {
  let c = crc;
  for (let i = from; i < bytes.length; i++) c = (c >>> 8) ^ CRC_TABLE[(c ^ bytes[i]) & 0xff];
  return c;
}

export function crcFinish(crc: number): string {
  return ((crc ^ -1) >>> 0).toString(16).padStart(8, '0').toUpperCase();
}

// Размер заголовка, который No-Intro не включает в хеш (headerless DAT).
// Size of the header that headerless No-Intro DATs leave out of the hash.
export function detectHeaderSkip(head: Uint8Array, ext: string, size: number): number {
  const e = ext.toLowerCase();
  if (head.length >= 16 && head[0] === 0x4e && head[1] === 0x45 && head[2] === 0x53 && head[3] === 0x1a) return 16; // iNES
  if (head.length >= 16 && head[0] === 0x46 && head[1] === 0x44 && head[2] === 0x53 && head[3] === 0x1a) return 16; // fwNES FDS
  if (head.length >= 64 && head[0] === 0x4c && head[1] === 0x59 && head[2] === 0x4e && head[3] === 0x58) return 64; // LYNX
  if (head.length >= 128 && new TextDecoder('latin1').decode(head.subarray(1, 10)) === 'ATARI7800') return 128;
  if ((e === '.smc' || e === '.sfc' || e === '.fig' || e === '.swc') && size % 1024 === 512 && size > 512) return 512;
  return 0;
}

interface FileHashes {
  size: number;
  crc32: string;
  headerlessCrc32?: string;
  headerlessSize?: number;
  sha1?: string;
}

async function hashWholeFile(file: File, ext: string, shouldStop?: () => boolean): Promise<FileHashes | null> {
  const size = file.size;
  if (size <= MAX_SHA1_BYTES) {
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    const crc32 = crcFinish(crcUpdate(~0, bytes));
    const skip = detectHeaderSkip(bytes, ext, size);
    const out: FileHashes = { size, crc32 };
    if (skip > 0) {
      out.headerlessCrc32 = crcFinish(crcUpdate(~0, bytes, skip));
      out.headerlessSize = size - skip;
    }
    try {
      if (globalThis.crypto?.subtle) {
        const digest = await crypto.subtle.digest('SHA-1', buf);
        out.sha1 = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
      }
    } catch {
      // SHA1 необязателен: CRC32 + размер достаточно. / SHA1 is optional.
    }
    return out;
  }
  let crc = ~0;
  for (let off = 0; off < size; off += CHUNK) {
    if (shouldStop?.()) return null;
    const part = new Uint8Array(await file.slice(off, Math.min(size, off + CHUNK)).arrayBuffer());
    crc = crcUpdate(crc, part);
  }
  return { size, crc32: crcFinish(crc) };
}

// ZIP: CRC32 и размер внутреннего файла берём из центрального каталога, распаковка не нужна.
// ZIP: CRC32 and size of the inner file come from the central directory, no unpacking.
export function readZipLargestEntry(cd: Uint8Array): { name: string; crc32: string; size: number } | null {
  const cdv = new DataView(cd.buffer, cd.byteOffset, cd.byteLength);
  let best: { name: string; crc32: string; size: number } | null = null;
  let p = 0;
  while (p + 46 <= cd.length && cdv.getUint32(p, true) === 0x02014b50) {
    const crc = cdv.getUint32(p + 16, true);
    const usize = cdv.getUint32(p + 24, true);
    const nameLen = cdv.getUint16(p + 28, true);
    const extraLen = cdv.getUint16(p + 30, true);
    const commentLen = cdv.getUint16(p + 32, true);
    const name = new TextDecoder('utf-8').decode(cd.subarray(p + 46, p + 46 + nameLen));
    const isDir = name.endsWith('/');
    if (!isDir && usize !== 0xffffffff && (!best || usize > best.size)) {
      best = { name, crc32: (crc >>> 0).toString(16).padStart(8, '0').toUpperCase(), size: usize };
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  return best;
}

async function hashZip(file: File): Promise<FileHashes | null> {
  const tailLen = Math.min(file.size, 65536 + 22);
  const tail = new Uint8Array(await file.slice(file.size - tailLen).arrayBuffer());
  const dv = new DataView(tail.buffer);
  let eocd = -1;
  for (let i = tail.length - 22; i >= 0; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;
  const cdSize = dv.getUint32(eocd + 12, true);
  const cdOff = dv.getUint32(eocd + 16, true);
  if (cdOff === 0xffffffff || cdOff + cdSize > file.size) return null;
  const cd = new Uint8Array(await file.slice(cdOff, cdOff + cdSize).arrayBuffer());
  const e = readZipLargestEntry(cd);
  return e ? { size: e.size, crc32: e.crc32 } : null;
}

// PARAM.SFO → DISC_ID (PSP/PS1 EBOOT.PBP). / PARAM.SFO → DISC_ID.
export function readSfoDiscId(sfo: Uint8Array): string {
  if (sfo.length < 20 || sfo[0] !== 0x00 || sfo[1] !== 0x50 || sfo[2] !== 0x53 || sfo[3] !== 0x46) return '';
  const dv = new DataView(sfo.buffer, sfo.byteOffset, sfo.byteLength);
  const keyTable = dv.getUint32(8, true);
  const dataTable = dv.getUint32(12, true);
  const count = dv.getUint32(16, true);
  const dec = new TextDecoder('latin1');
  for (let i = 0; i < count && 20 + i * 16 + 16 <= sfo.length; i++) {
    const at = 20 + i * 16;
    const kStart = keyTable + dv.getUint16(at, true);
    let kEnd = kStart;
    while (kEnd < sfo.length && sfo[kEnd] !== 0) kEnd++;
    if (dec.decode(sfo.subarray(kStart, kEnd)) !== 'DISC_ID') continue;
    const dStart = dataTable + dv.getUint32(at + 12, true);
    const dLen = dv.getUint32(at + 4, true);
    return dec.decode(sfo.subarray(dStart, Math.min(sfo.length, dStart + dLen))).replace(/\0/g, '').trim();
  }
  return '';
}

const BOOT_SERIAL_RE = /BOOT2?\s*=\s*cdrom0?:\\*([A-Z]{4})[_-]?(\d{3})\.?(\d{2})/i;
const PSP_SERIAL_RE = /\b(UL|UC|NP)([A-Z]{2})[-_](\d{5})\b/;

// Серийник из SYSTEM.CNF (PS1/PS2) или UMD_DATA.BIN (PSP) в начале образа.
// Serial from SYSTEM.CNF (PS1/PS2) or UMD_DATA.BIN (PSP) near the start of the image.
export function findDiscSerial(text: string): string {
  const m = text.match(BOOT_SERIAL_RE);
  if (m) return `${m[1].toUpperCase()}-${m[2]}${m[3]}`;
  const p = text.match(PSP_SERIAL_RE);
  if (p) return `${p[1]}${p[2]}-${p[3]}`;
  return '';
}

async function readSerial(file: File, ext: string): Promise<string> {
  try {
    if (ext === '.pbp') {
      const head = new Uint8Array(await file.slice(0, Math.min(file.size, 512 * 1024)).arrayBuffer());
      if (head.length < 40 || head[1] !== 0x50 || head[2] !== 0x42 || head[3] !== 0x50) return '';
      const sfoOff = new DataView(head.buffer).getUint32(8, true);
      return sfoOff < head.length ? readSfoDiscId(head.subarray(sfoOff)) : '';
    }
    const head = new Uint8Array(await file.slice(0, Math.min(file.size, SERIAL_SCAN_BYTES)).arrayBuffer());
    return findDiscSerial(new TextDecoder('latin1').decode(head));
  } catch {
    return '';
  }
}

export interface BuiltQuery {
  query?: DatQuery;
  // Почему хеш не посчитан или посчитан не весь. / Why the hash is missing or partial.
  note?: string;
}

const DISC_EXTS = new Set(['.bin', '.iso', '.img', '.cue', '.gdi', '.ccd', '.mds', '.mdf', '.bin+.cue', '.chd', '.pbp', '.cso', '.rvz', '.gcz', '.wbfs']);

// Собирает запрос к DAT для одного рома. / Builds the DAT query for one ROM.
export async function buildDatQuery(input: DatHashInput, shouldStop?: () => boolean): Promise<BuiltQuery> {
  const src = input.discs && input.discs.length > 0 ? input.discs[0] : input;
  const ext = (src.extension || '').toLowerCase();
  // Для CUE/GDI набора хешируем первый трек: в Redump у каждого трека свой хеш.
  // For CUE/GDI sets hash the first track: Redump lists a hash per track.
  const payload = src.companionFiles?.[0] || src.fileObj;
  if (!payload) return { note: 'файл недоступен для чтения (пересканируйте папку) / file not readable (rescan the folder)' };
  const payloadExt = (payload.name.match(/\.[^.]+$/)?.[0] || ext).toLowerCase();
  const base: DatQuery = { id: input.id, system: input.system };

  if (payloadExt === '.chd') {
    return {
      note: 'CHD сжат: Redump хранит хеши несжатых треков, сверка по хешу невозможна / CHD is compressed; Redump hashes uncompressed tracks',
    };
  }
  if (payloadExt === '.cso' || payloadExt === '.rvz' || payloadExt === '.gcz' || payloadExt === '.7z' || payloadExt === '.rar') {
    return { note: `${payloadExt}: сжатый формат, хеш не совпадёт с DAT / compressed format, hash will not match a DAT` };
  }
  if (payloadExt === '.pbp') {
    const serial = await readSerial(payload, '.pbp');
    return serial ? { query: { ...base, serial } } : { note: 'в PBP не найден DISC_ID / no DISC_ID in PBP' };
  }
  if (payloadExt === '.zip') {
    const h = await hashZip(payload);
    return h ? { query: { ...base, size: h.size, crc32: h.crc32 } } : { note: 'не удалось прочитать ZIP / cannot read ZIP' };
  }

  const isDisc = DISC_EXTS.has(payloadExt) || DISC_EXTS.has(ext);
  const serial = isDisc ? await readSerial(payload, payloadExt) : '';
  if (isDisc && payload.size > MAX_FULL_HASH_BYTES) {
    return serial
      ? { query: { ...base, serial } }
      : { note: 'образ больше 1 ГБ: полный хеш не считаем, серийник не найден / image over 1 GB: no full hash, no serial found' };
  }
  const h = await hashWholeFile(payload, payloadExt, shouldStop);
  if (!h) return { note: 'остановлено / stopped' };
  return {
    query: {
      ...base,
      size: h.size,
      crc32: h.crc32,
      headerlessCrc32: h.headerlessCrc32,
      headerlessSize: h.headerlessSize,
      sha1: h.sha1,
      serial: serial || undefined,
    },
  };
}

export async function fetchDatStatus(): Promise<DatStatus | null> {
  try {
    const resp = await fetch('/api/dat/status', { cache: 'no-store' });
    if (!resp.ok) return null;
    return (await resp.json()) as DatStatus;
  } catch {
    return null;
  }
}

export async function reloadDats(): Promise<DatStatus> {
  const resp = await fetch('/api/dat/reload', { method: 'POST' });
  if (!resp.ok) throw new Error(await resp.text());
  return (await resp.json()) as DatStatus;
}

export async function importDatFile(file: File): Promise<DatStatus> {
  const resp = await fetch(`/api/dat/import?name=${encodeURIComponent(file.name)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: file,
  });
  if (!resp.ok) throw new Error((await resp.text()).trim() || `HTTP ${resp.status}`);
  return (await resp.json()) as DatStatus;
}

// Автозагрузка DAT из libretro-database: No-Intro (картриджи) и Redump (диски).
// Auto-download of DATs from libretro-database: No-Intro (cartridges) and Redump (discs).
export interface LibretroDatFetchItem {
  system: string;
  set?: string;
  file?: string;
  games?: number;
  reason?: string;
}

export interface LibretroDatFetchResult {
  fetched: LibretroDatFetchItem[];
  skipped: LibretroDatFetchItem[];
  failed: LibretroDatFetchItem[];
  status: DatStatus;
}

export async function fetchLibretroDats(systems: string[], force = false): Promise<LibretroDatFetchResult> {
  const resp = await fetch('/api/dat/fetch-libretro', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ systems, force }),
  });
  if (!resp.ok) throw new Error((await resp.text()).trim() || `HTTP ${resp.status}`);
  const data = await resp.json();
  return {
    fetched: data.fetched || [],
    skipped: data.skipped || [],
    failed: data.failed || [],
    status: data.status,
  };
}

// Как aegiscore/dat.NormalizeSystem: убрать суффиксы в скобках, нижний регистр.
// Mirrors aegiscore/dat.NormalizeSystem: drop parenthesised suffixes, lowercase.
export function normalizeDatSystem(name: string): string {
  let s = (name || '').trim();
  for (;;) {
    const i = s.lastIndexOf('(');
    if (i <= 0 || !s.endsWith(')')) break;
    s = s.slice(0, i).trim();
  }
  return s.toLowerCase();
}

// Системы из списка, для которых нет ни одного загруженного DAT.
// Systems from the list that have no loaded DAT.
export function systemsWithoutDat(status: DatStatus | null, systems: string[]): string[] {
  const have = new Set(
    (status?.dats || []).filter((d) => !d.error && d.games > 0).map((d) => normalizeDatSystem(d.system || d.name))
  );
  const out: string[] = [];
  const seen = new Set<string>();
  for (const sys of systems) {
    const n = normalizeDatSystem(sys);
    if (!n || seen.has(n)) continue;
    seen.add(n);
    if (!have.has(n)) out.push(sys);
  }
  return out;
}

export interface LookupOptions {
  onProgress?: (done: number, total: number, fileName: string) => void;
  shouldStop?: () => boolean;
}

// Хеширует ромы и ищет их в DAT. Результат по id; для не найденных — reason.
// Если DAT не загружены, возвращает null (сверка пропускается).
// Hashes ROMs and looks them up in DATs. Returns results by id; misses carry a reason.
// Returns null when no DAT is loaded (lookup is skipped).
export async function lookupTitlesByHash(
  inputs: DatHashInput[],
  opts: LookupOptions = {}
): Promise<Map<string, DatMatch> | null> {
  const status = await fetchDatStatus();
  if (!status || status.games === 0) return null;

  const results = new Map<string, DatMatch>();
  const pending: DatQuery[] = [];
  const flush = async () => {
    if (pending.length === 0) return;
    const batch = pending.splice(0, pending.length);
    try {
      const resp = await fetch('/api/dat/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: batch }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      for (const m of (data.results || []) as DatMatch[]) if (m?.id) results.set(m.id, m);
    } catch (err) {
      for (const q of batch) results.set(q.id, { id: q.id, matched: false, reason: `сервер DAT недоступен / DAT server unavailable: ${String(err)}` });
    }
  };

  for (let i = 0; i < inputs.length; i++) {
    if (opts.shouldStop?.()) break;
    const input = inputs[i];
    opts.onProgress?.(i, inputs.length, input.fileName);
    let built: BuiltQuery;
    try {
      built = await buildDatQuery(input, opts.shouldStop);
    } catch (err) {
      built = { note: `ошибка чтения файла / read error: ${String(err)}` };
    }
    if (built.query) pending.push(built.query);
    else results.set(input.id, { id: input.id, matched: false, reason: built.note });
    if (pending.length >= 200) await flush();
  }
  await flush();
  opts.onProgress?.(inputs.length, inputs.length, '');
  return results;
}
