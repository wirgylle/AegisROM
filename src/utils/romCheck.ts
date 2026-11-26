// Проверка ромов: на месте ли файлы, не обрезаны ли, есть ли всё для запуска.
// Читает только заголовки и концы файлов (быстро), без полного хеширования. CHD можно дополнительно
// прогнать через «chdman verify» в нативном окне (deepChd).
//
// ROM check: are the files in place, not truncated, is everything needed to run them there.
// Reads only headers and file tails (fast), no full hashing. In the native window a CHD can also be
// run through "chdman verify" (deepChd).

import { crc32 } from './romPatcher.ts';

export type RomCheckLevel = 'ok' | 'warn' | 'error';

export interface RomCheckIssue {
  level: 'warn' | 'error';
  /** Ключ текста: rc.issue.<code>. / Text key: rc.issue.<code>. */
  code: string;
  params?: Record<string, string | number>;
  /** Какой файл (для многодисковых и треков). / Which file (for multi-disc games and tracks). */
  file?: string;
}

/** Файл с именем: File или LazyFile из нативной прослойки. / A named file: File or a native LazyFile. */
export type NamedBlob = Blob & { name: string };

export interface RomCheckTarget {
  id: string;
  title: string;
  /** Код консоли в нижнем регистре (psx, gba, ...). / Lower-case console code. */
  console: string;
  relativePath: string;
  file?: NamedBlob | null;
  companions?: NamedBlob[];
  cueText?: string;
  /** Папка файла (FileSystemDirectoryHandle или нативный). / The file's folder handle. */
  parentHandle?: any;
  discs?: RomCheckTarget[];
  discNumber?: number;
  /** Запись есть в базе, а файла на диске нет. / The record exists, the file is not on disk. */
  missing?: boolean;
}

export interface RomCheckResult {
  id: string;
  title: string;
  console: string;
  path: string;
  level: RomCheckLevel;
  issues: RomCheckIssue[];
  /** Что можно исправить (см. romCheckActions.ts). / What can be fixed (see romCheckActions.ts). */
  fixes?: ('cue' | 'm3u' | 'makeCue' | 'rebuildChd')[];
  /** Есть путь на диске: можно показать в папке. / Has a disk path: can be shown in its folder. */
  canReveal?: boolean;
  /** Файлы на месте: можно удалить. / Files are there: can be deleted. */
  canDelete?: boolean;
  /** Итог последнего действия. / The outcome of the last action. */
  outcome?: { state: 'fixed' | 'deleted' | 'error'; text: string };
}

export type RomCheckAction = 'fix' | 'delete' | 'reveal';

export interface ChdVerifyAnswer {
  error?: string;
  info?: { tracks?: { number: number; type: string }[]; kind?: string };
  issues?: { level: 'warn' | 'error'; code: string; text: string }[];
  deep?: { ran: boolean; ok?: boolean; error?: string; output?: string };
}

export interface RomCheckOptions {
  /** Полная проверка CHD через chdman (долго). / Full CHD check via chdman (slow). */
  deepChd?: boolean;
  /** Вызов Go: /api/native/converter/verify. null — нет нативного окна. / Go call; null without the native window. */
  verifyChd?: ((file: NamedBlob, console: string, deep: boolean) => Promise<ChdVerifyAnswer | null>) | null;
  signal?: { aborted: boolean };
  onProgress?: (done: number, total: number, title: string) => void;
}

const DISC_CONSOLES = new Set(['psx', 'ps2', 'psp', 'segacd', 'saturn', 'dc', 'dreamcast', 'pcecd', 'pcfx', '3do', 'neocd', 'cdi']);
const ISO9660_CONSOLES = new Set(['psx', 'ps2', 'psp', 'segacd', 'saturn', 'pcecd', 'pcfx', '3do', 'cdi']);
const SYNC = [0x00, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x00];

const extOf = (name: string) => {
  const i = name.lastIndexOf('.');
  return i === -1 ? '' : name.slice(i).toLowerCase();
};
const baseOf = (p: string) => p.replace(/\\/g, '/').split('/').pop() || p;
const stemOf = (name: string) => name.replace(/\.[^/.]+$/, '');

async function readBytes(b: Blob, start: number, len: number): Promise<Uint8Array> {
  const end = Math.min(b.size, Math.max(0, start) + len);
  if (start >= end) return new Uint8Array(0);
  return new Uint8Array(await b.slice(Math.max(0, start), end).arrayBuffer());
}

async function readText(b: Blob, max = 1024 * 1024): Promise<string> {
  const bytes = await readBytes(b, 0, max);
  let s = new TextDecoder('utf-8').decode(bytes);
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  return s;
}

const ascii = (u: Uint8Array, from: number, len: number) =>
  String.fromCharCode(...Array.from(u.subarray(from, from + len)));

const be32 = (u: Uint8Array, o: number) => ((u[o] << 24) | (u[o + 1] << 16) | (u[o + 2] << 8) | u[o + 3]) >>> 0;
const le32 = (u: Uint8Array, o: number) => (u[o] | (u[o + 1] << 8) | (u[o + 2] << 16) | (u[o + 3] << 24)) >>> 0;
const le16 = (u: Uint8Array, o: number) => u[o] | (u[o + 1] << 8);
const be64 = (u: Uint8Array, o: number) => be32(u, o) * 2 ** 32 + be32(u, o + 4);
const le64 = (u: Uint8Array, o: number) => le32(u, o) + le32(u, o + 4) * 2 ** 32;

/** Файл рядом с ромом: среди парных или в той же папке. / A file next to the ROM: among companions or in the same folder. */
async function findNearby(t: RomCheckTarget, name: string): Promise<NamedBlob | null> {
  const want = baseOf(name).toLowerCase();
  const hit = (t.companions || []).find((f) => f.name.toLowerCase() === want);
  if (hit) return hit;
  const parts = name.replace(/\\/g, '/').split('/').filter(Boolean);
  let dir = t.parentHandle;
  if (!dir) return null;
  try {
    for (let i = 0; i < parts.length - 1; i++) {
      if (parts[i] === '.') continue;
      dir = await dir.getDirectoryHandle(parts[i]);
    }
    const last = parts[parts.length - 1];
    try {
      return (await (await dir.getFileHandle(last)).getFile()) as NamedBlob;
    } catch {
      // Регистр букв: перебор папки. / Letter case: walk the folder.
      for await (const entry of dir.values()) {
        if (entry.kind === 'file' && String(entry.name).toLowerCase() === last.toLowerCase()) {
          return (await entry.getFile()) as NamedBlob;
        }
      }
    }
  } catch {}
  return null;
}

function cueSectorSize(mode: string): number {
  const m = mode.toUpperCase();
  if (m === 'MODE1/2048') return 2048;
  if (m === 'MODE2/2336') return 2336;
  if (m === 'CDG') return 2448;
  return 2352;
}

/** Разбор .cue: файлы и режим первой дорожки каждого файла. / .cue parsing: files and each file's first track mode. */
export function parseCue(text: string): { file: string; mode: string }[] {
  const out: { file: string; mode: string }[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    const f = /^FILE\s+(?:"([^"]+)"|(\S+))/i.exec(line);
    if (f) {
      out.push({ file: f[1] || f[2], mode: '' });
      continue;
    }
    const tr = /^TRACK\s+\d+\s+(\S+)/i.exec(line);
    if (tr && out.length > 0 && !out[out.length - 1].mode) out[out.length - 1].mode = tr[1];
  }
  return out;
}

export interface ChdHeaderInfo {
  version: number;
  codecs: string[];
  logicalBytes: number;
  hunkBytes: number;
  hasParent: boolean;
  truncated: boolean;
  kind: 'cd' | 'gd' | 'dvd' | 'hd' | 'unknown';
  tracks: { number: number; type: string; frames: number }[];
}

const fourCC = (v: number) =>
  String.fromCharCode((v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff);

/** Заголовок и метаданные CHD (как aegiscore/chd.go). null — не CHD. / CHD header and metadata (as aegiscore/chd.go). null: not a CHD. */
export async function inspectChd(file: Blob): Promise<ChdHeaderInfo | null> {
  const size = file.size;
  const h = await readBytes(file, 0, 124);
  if (h.length < 16 || ascii(h, 0, 8) !== 'MComprHD') return null;
  const info: ChdHeaderInfo = {
    version: be32(h, 12),
    codecs: [],
    logicalBytes: 0,
    hunkBytes: 0,
    hasParent: false,
    truncated: false,
    kind: 'unknown',
    tracks: [],
  };
  let metaOffset = 0;
  if (info.version === 5) {
    if (h.length < 124) return { ...info, truncated: true };
    for (let i = 0; i < 4; i++) {
      const c = be32(h, 16 + i * 4);
      if (c) info.codecs.push(fourCC(c));
    }
    info.logicalBytes = be64(h, 32);
    const mapOffset = be64(h, 40);
    metaOffset = be64(h, 48);
    info.hunkBytes = be32(h, 56);
    info.hasParent = h.subarray(104, 124).some((b) => b !== 0);
    if (!mapOffset || mapOffset >= size) info.truncated = true;
    else if (info.codecs.length === 0) {
      const hunks = info.hunkBytes ? Math.ceil(info.logicalBytes / info.hunkBytes) : 0;
      info.truncated = mapOffset + hunks * 4 > size;
    } else {
      const mh = await readBytes(file, mapOffset, 16);
      info.truncated = mh.length < 16 || mapOffset + 16 + be32(mh, 0) > size;
    }
  } else if (info.version === 3 || info.version === 4) {
    if (h.length < 48) return { ...info, truncated: true };
    info.codecs = [['none', 'zlib', 'zlib+', 'avhuff'][be32(h, 20)] || `codec${be32(h, 20)}`];
    info.logicalBytes = be64(h, 28);
    metaOffset = be64(h, 36);
    info.hunkBytes = info.version === 4 ? be32(h, 44) : h.length >= 80 ? be32(h, 76) : 0;
    info.hasParent = (be32(h, 16) & 1) !== 0;
  } else {
    return info;
  }
  if (metaOffset && metaOffset >= size) info.truncated = true;
  let off = metaOffset;
  for (let guard = 0; off && guard < 512; guard++) {
    if (off + 16 > size) {
      info.truncated = true;
      break;
    }
    const mh = await readBytes(file, off, 16);
    const tag = fourCC(be32(mh, 0));
    const len = be32(mh, 4) & 0xffffff;
    const next = be64(mh, 8);
    if (tag === 'CHT2' || tag === 'CHTR' || tag === 'CHGT' || tag === 'CHCD') {
      info.kind = tag === 'CHGT' ? 'gd' : info.kind === 'unknown' ? 'cd' : info.kind;
      if (tag !== 'CHCD' && len > 0 && len < 4096) {
        const txt = new TextDecoder().decode(await readBytes(file, off + 16, len)).replace(/\0+$/, '');
        const num = /TRACK:(\d+)/.exec(txt);
        const type = /TYPE:(\S+)/.exec(txt);
        const frames = /FRAMES:(\d+)/.exec(txt);
        if (num) info.tracks.push({ number: +num[1], type: type?.[1] || '', frames: frames ? +frames[1] : 0 });
      }
    } else if (tag === 'DVD ') info.kind = 'dvd';
    else if (tag === 'GDDD' && info.kind === 'unknown') info.kind = 'hd';
    off = next;
  }
  return info;
}

/** Замечания к CHD для консоли (как CheckCHDForConsole в Go). / CHD findings for a console (as CheckCHDForConsole in Go). */
export function chdIssues(info: ChdHeaderInfo, console: string): RomCheckIssue[] {
  const out: RomCheckIssue[] = [];
  if (info.truncated) out.push({ level: 'error', code: 'chdTruncated' });
  if (info.version < 5) out.push({ level: 'warn', code: 'chdOldVersion', params: { v: info.version } });
  if (info.hasParent) out.push({ level: 'error', code: 'chdParent' });
  const z = info.codecs.find((c) => c === 'zstd' || c === 'cdzs');
  if (z) out.push({ level: 'warn', code: 'chdZstd', params: { codec: z } });
  const c = console.toLowerCase();
  if (c === 'psx') {
    if (info.kind === 'dvd' || info.kind === 'hd') out.push({ level: 'error', code: 'chdDvdForCd' });
    const t1 = info.tracks.find((t) => t.number === 1);
    if (t1 && !['MODE2_RAW', 'MODE1_RAW', 'AUDIO'].includes(t1.type)) {
      out.push({ level: 'error', code: 'chdCookedTrack', params: { type: t1.type } });
    }
  } else if (c === 'psp' && info.kind === 'cd') {
    out.push({ level: 'error', code: 'chdCdForDvd' });
  }
  if (!info.truncated && info.tracks.length === 0 && (info.kind === 'cd' || info.kind === 'unknown') && DISC_CONSOLES.has(c) && c !== 'psp' && c !== 'ps2') {
    out.push({ level: 'error', code: 'chdNoTracks' });
  }
  return out;
}

async function checkZip(f: Blob, issues: RomCheckIssue[]) {
  const size = f.size;
  const head = await readBytes(f, 0, 4);
  const tailLen = Math.min(size, 65557);
  const tail = await readBytes(f, size - tailLen, tailLen);
  let eocd = -1;
  for (let i = tail.length - 22; i >= 0; i--) {
    if (tail[i] === 0x50 && tail[i + 1] === 0x4b && tail[i + 2] === 0x05 && tail[i + 3] === 0x06) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) {
    issues.push({ level: 'error', code: 'zipBroken' });
    return;
  }
  const entries = le16(tail, eocd + 10);
  const cdSize = le32(tail, eocd + 12);
  const cdOffset = le32(tail, eocd + 16);
  if (entries === 0) {
    issues.push({ level: 'error', code: 'archiveEmpty' });
    return;
  }
  if (ascii(head, 0, 4) !== 'PK\x03\x04') issues.push({ level: 'error', code: 'zipBroken' });
  const zip64 = cdSize === 0xffffffff || cdOffset === 0xffffffff || entries === 0xffff;
  if (!zip64 && cdOffset + cdSize > size - (tail.length - eocd)) issues.push({ level: 'error', code: 'archiveTruncated' });
}

async function check7z(f: Blob, issues: RomCheckIssue[]) {
  const h = await readBytes(f, 0, 32);
  const sig = [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c];
  if (h.length < 32 || !sig.every((b, i) => h[i] === b)) {
    issues.push({ level: 'error', code: 'archiveBroken' });
    return;
  }
  if (crc32(h, 12, 32) >>> 0 !== le32(h, 8)) {
    issues.push({ level: 'error', code: 'archiveBroken' });
    return;
  }
  const nextOffset = le64(h, 12);
  const nextSize = le64(h, 20);
  if (nextSize === 0) issues.push({ level: 'error', code: 'archiveEmpty' });
  else if (32 + nextOffset + nextSize > f.size) issues.push({ level: 'error', code: 'archiveTruncated' });
}

function crc16Modbus(u: Uint8Array, from: number, to: number): number {
  let crc = 0xffff;
  for (let i = from; i < to; i++) {
    crc ^= u[i];
    for (let k = 0; k < 8; k++) crc = crc & 1 ? (crc >>> 1) ^ 0xa001 : crc >>> 1;
  }
  return crc & 0xffff;
}

async function checkCartridge(f: NamedBlob, ext: string, issues: RomCheckIssue[]) {
  const h = await readBytes(f, 0, 0x200);
  const size = f.size;
  switch (ext) {
    case '.nes': {
      if (ascii(h, 0, 4) !== 'NES\x1a') {
        issues.push({ level: 'warn', code: 'nesNoHeader' });
        return;
      }
      const prg = h[4] * 16384;
      const chr = h[5] * 8192;
      const trainer = h[6] & 4 ? 512 : 0;
      const nes2 = (h[7] & 0x0c) === 0x08;
      if (!nes2 && 16 + trainer + prg + chr > size) {
        issues.push({ level: 'error', code: 'romTruncated', params: { expected: 16 + trainer + prg + chr, actual: size } });
      }
      return;
    }
    case '.gba': {
      if (h.length < 0xc0) {
        issues.push({ level: 'error', code: 'romTooSmall', params: { size } });
        return;
      }
      let chk = 0;
      for (let i = 0xa0; i <= 0xbc; i++) chk = (chk - h[i]) & 0xff;
      chk = (chk - 0x19) & 0xff;
      if (chk !== h[0xbd] || h[0xb2] !== 0x96) issues.push({ level: 'warn', code: 'headerChecksum' });
      return;
    }
    case '.gb':
    case '.gbc': {
      if (h.length < 0x150) {
        issues.push({ level: 'error', code: 'romTooSmall', params: { size } });
        return;
      }
      let x = 0;
      for (let i = 0x134; i <= 0x14c; i++) x = (x - h[i] - 1) & 0xff;
      if (x !== h[0x14d]) issues.push({ level: 'warn', code: 'headerChecksum' });
      const code = h[0x148];
      if (code <= 8) {
        const expected = 32768 << code;
        if (size < expected) issues.push({ level: 'error', code: 'romTruncated', params: { expected, actual: size } });
      }
      return;
    }
    case '.nds': {
      if (h.length < 0x160) {
        issues.push({ level: 'error', code: 'romTooSmall', params: { size } });
        return;
      }
      if (crc16Modbus(h, 0, 0x15e) !== le16(h, 0x15e)) issues.push({ level: 'warn', code: 'headerChecksum' });
      const used = le32(h, 0x80);
      if (used > 0 && used > size) issues.push({ level: 'error', code: 'romTruncated', params: { expected: used, actual: size } });
      return;
    }
    case '.md':
    case '.gen': {
      if (ascii(h, 0x100, 4) !== 'SEGA' && ascii(h, 0x101, 4) !== 'SEGA') issues.push({ level: 'warn', code: 'mdNoHeader' });
      return;
    }
    case '.z64':
    case '.n64':
    case '.v64': {
      const m = be32(h, 0);
      if (![0x80371240, 0x37804012, 0x40123780].includes(m)) issues.push({ level: 'warn', code: 'n64Magic' });
      return;
    }
  }
}

async function checkIso(t: RomCheckTarget, f: NamedBlob, issues: RomCheckIssue[]) {
  const c = t.console;
  const size = f.size;
  if (size % 2048 !== 0 && size % 2352 !== 0 && size % 2448 !== 0) {
    issues.push({ level: 'warn', code: 'sectorMisaligned', params: { file: f.name, size, ss: 2048 } });
  }
  if (!ISO9660_CONSOLES.has(c)) return;
  const cooked = await readBytes(f, 16 * 2048, 48);
  if (ascii(cooked, 1, 5) === 'CD001') {
    if (c === 'psx') issues.push({ level: 'warn', code: 'psxIso2048' });
    return;
  }
  const raw = await readBytes(f, 16 * 2352, 64);
  if (SYNC.every((b, i) => raw[i] === b) && (ascii(raw, 25, 5) === 'CD001' || ascii(raw, 17, 5) === 'CD001')) return;
  issues.push({ level: 'warn', code: 'isoNoPvd' });
}

async function checkDataTrack(file: NamedBlob, mode: string, issues: RomCheckIssue[]) {
  const ss = cueSectorSize(mode);
  if (file.size === 0) {
    issues.push({ level: 'error', code: 'trackEmpty', params: { file: file.name } });
    return;
  }
  if (file.size % ss !== 0) issues.push({ level: 'warn', code: 'sectorMisaligned', params: { file: file.name, size: file.size, ss } });
  if (ss === 2352 && !/^AUDIO$/i.test(mode)) {
    const h = await readBytes(file, 0, 12);
    if (!SYNC.every((b, i) => h[i] === b)) issues.push({ level: 'warn', code: 'noSync', params: { file: file.name } });
  }
}

async function checkSingle(t: RomCheckTarget, opts: RomCheckOptions): Promise<RomCheckIssue[]> {
  const issues: RomCheckIssue[] = [];
  const f = t.file;
  if (t.missing || !f) {
    issues.push({ level: 'error', code: 'missing' });
    return issues;
  }
  try {
    await readBytes(f, 0, 16);
  } catch {
    issues.push({ level: 'error', code: 'unreadable' });
    return issues;
  }
  if (f.size === 0) {
    issues.push({ level: 'error', code: 'empty' });
    return issues;
  }
  const ext = extOf(f.name);
  const c = t.console;
  switch (ext) {
    case '.cue': {
      const text = t.cueText || (await readText(f));
      const files = parseCue(text);
      if (files.length === 0) {
        issues.push({ level: 'error', code: 'cueEmpty' });
        break;
      }
      for (const ref of files) {
        const tf = await findNearby(t, ref.file);
        if (!tf) issues.push({ level: 'error', code: 'cueMissingFile', params: { file: ref.file } });
        else await checkDataTrack(tf, ref.mode || 'MODE2/2352', issues);
      }
      break;
    }
    case '.gdi': {
      const lines = (await readText(f)).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      const count = parseInt(lines[0] || '0', 10);
      const tracks = lines.slice(1);
      if (!count || tracks.length < count) issues.push({ level: 'error', code: 'gdiBroken' });
      for (const line of tracks) {
        const m = /^\d+\s+\d+\s+\d+\s+\d+\s+(?:"([^"]+)"|(\S+))/.exec(line);
        const name = m?.[1] || m?.[2];
        if (name && !(await findNearby(t, name))) issues.push({ level: 'error', code: 'cueMissingFile', params: { file: name } });
      }
      break;
    }
    case '.ccd': {
      const img = await findNearby(t, `${stemOf(f.name)}.img`);
      if (!img) issues.push({ level: 'error', code: 'cueMissingFile', params: { file: `${stemOf(f.name)}.img` } });
      else await checkDataTrack(img, img.size % 2448 === 0 && img.size % 2352 !== 0 ? 'CDG' : 'MODE2/2352', issues);
      break;
    }
    case '.mds': {
      if (!(await findNearby(t, `${stemOf(f.name)}.mdf`))) {
        issues.push({ level: 'error', code: 'cueMissingFile', params: { file: `${stemOf(f.name)}.mdf` } });
      }
      break;
    }
    case '.m3u': {
      const lines = (await readText(f))
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith('#'));
      if (lines.length === 0) issues.push({ level: 'error', code: 'm3uEmpty' });
      for (const line of lines) {
        if (!(await findNearby(t, line))) issues.push({ level: 'error', code: 'm3uMissing', params: { file: line } });
      }
      break;
    }
    case '.iso':
      await checkIso(t, f, issues);
      break;
    case '.bin':
    case '.img':
      if (DISC_CONSOLES.has(c)) {
        const comp = (t.companions || []).length > 0;
        if (!comp && !(await findNearby(t, `${stemOf(f.name)}.cue`))) issues.push({ level: 'warn', code: 'binNoCue' });
        await checkDataTrack(f, 'MODE2/2352', issues);
      }
      break;
    case '.chd': {
      const info = await inspectChd(f);
      if (!info) {
        issues.push({ level: 'error', code: 'chdNotChd' });
        break;
      }
      issues.push(...chdIssues(info, c));
      if (opts.deepChd && opts.verifyChd && !info.truncated) {
        const ans = await opts.verifyChd(f, c, true).catch(() => null);
        if (ans?.deep?.ran && ans.deep.ok === false) {
          issues.push({ level: 'error', code: 'chdVerifyFailed', params: { msg: (ans.deep.output || ans.deep.error || '').trim().split('\n').pop() || '' } });
        } else if (ans && ans.deep && !ans.deep.ran) {
          issues.push({ level: 'warn', code: 'chdVerifySkipped' });
        }
      }
      break;
    }
    case '.zip':
      await checkZip(f, issues);
      break;
    case '.7z':
      await check7z(f, issues);
      break;
    case '.rar': {
      const h = await readBytes(f, 0, 7);
      if (ascii(h, 0, 6) !== 'Rar!\x1a\x07') issues.push({ level: 'error', code: 'archiveBroken' });
      break;
    }
    default:
      await checkCartridge(f, ext, issues);
  }
  return issues;
}

const levelOf = (issues: RomCheckIssue[]): RomCheckLevel =>
  issues.some((i) => i.level === 'error') ? 'error' : issues.length > 0 ? 'warn' : 'ok';

/** Проверяет одну игру (многодисковую — по дискам). / Checks one game (a multi-disc one disc by disc). */
export async function checkRom(t: RomCheckTarget, opts: RomCheckOptions = {}): Promise<RomCheckResult> {
  let issues: RomCheckIssue[] = [];
  if (t.discs && t.discs.length > 1) {
    const nums = t.discs.map((d, i) => d.discNumber || i + 1).sort((a, b) => a - b);
    for (let i = 0; i < nums.length; i++) {
      if (nums[i] !== i + 1) {
        issues.push({ level: 'warn', code: 'discGap', params: { list: nums.join(', ') } });
        break;
      }
    }
    for (const d of t.discs) {
      const di = await checkSingle({ ...d, console: d.console || t.console }, opts);
      const label = d.file?.name || baseOf(d.relativePath);
      issues.push(...di.map((x) => ({ ...x, file: x.file || label })));
    }
  } else {
    issues = await checkSingle(t, opts);
  }
  return { id: t.id, title: t.title, console: t.console, path: t.relativePath, level: levelOf(issues), issues };
}

export interface RomCheckReport {
  checkedAt: string;
  deepChd: boolean;
  results: RomCheckResult[];
  counts: Record<RomCheckLevel, number>;
  /** Консоли, где нужен BIOS и он не найден. / Consoles that need a BIOS which was not found. */
  biosMissing: string[];
  /** Раздел BIOS ещё не проверялся. / The BIOS section was never checked. */
  biosUnchecked: boolean;
  stopped: boolean;
}

export async function runRomCheck(targets: RomCheckTarget[], opts: RomCheckOptions = {}): Promise<RomCheckReport> {
  const results: RomCheckResult[] = [];
  let stopped = false;
  for (let i = 0; i < targets.length; i++) {
    if (opts.signal?.aborted) {
      stopped = true;
      break;
    }
    const t = targets[i];
    opts.onProgress?.(i, targets.length, t.title);
    try {
      results.push(await checkRom(t, opts));
    } catch (e: any) {
      results.push({
        id: t.id,
        title: t.title,
        console: t.console,
        path: t.relativePath,
        level: 'error',
        issues: [{ level: 'error', code: 'unreadable', params: { msg: String(e?.message || e) } }],
      });
    }
  }
  opts.onProgress?.(results.length, targets.length, '');
  const counts: Record<RomCheckLevel, number> = { ok: 0, warn: 0, error: 0 };
  for (const r of results) counts[r.level]++;
  return {
    checkedAt: new Date().toISOString(),
    deepChd: Boolean(opts.deepChd),
    results,
    counts,
    biosMissing: [],
    biosUnchecked: false,
    stopped,
  };
}

/** Текст отчёта для файла. tr переводит код замечания. / Report text for a file. tr translates an issue code. */
export function formatRomCheckReport(
  report: RomCheckReport,
  tr: (issue: RomCheckIssue) => string,
  labels: { title: string; ok: string; warn: string; error: string; bios: string }
): string {
  const lines: string[] = [
    `${labels.title} — ${report.checkedAt}`,
    `${labels.error}: ${report.counts.error}  ${labels.warn}: ${report.counts.warn}  ${labels.ok}: ${report.counts.ok}`,
  ];
  if (report.biosMissing.length) lines.push(`${labels.bios}: ${report.biosMissing.join(', ')}`);
  lines.push('');
  const order: RomCheckLevel[] = ['error', 'warn'];
  for (const lvl of order) {
    for (const r of report.results.filter((x) => x.level === lvl)) {
      lines.push(`[${lvl === 'error' ? labels.error : labels.warn}] ${r.title} (${r.console.toUpperCase()}) — ${r.path}`);
      for (const is of r.issues) lines.push(`    ${is.file ? `${is.file}: ` : ''}${tr(is)}`);
    }
  }
  return lines.join('\r\n') + '\r\n';
}
