// Патчер ромов: IPS, UPS, BPS и xdelta (VCDIFF). Работает в браузере, без зависимостей.
// ROM patcher: IPS, UPS, BPS and xdelta (VCDIFF). Runs in the browser, no dependencies.
//
// Модуль самодостаточный (без импортов), чтобы его можно было тестировать через `node --test`.
// The module is self-contained (no imports) so it can be tested with `node --test`.

export type PatchFormat = 'ips' | 'ups' | 'bps' | 'vcdiff';

export const PATCH_EXTENSIONS = ['.ips', '.ups', '.bps', '.xdelta', '.vcdiff', '.delta'];

export interface PatchInfo {
  format: PatchFormat;
  // CRC32 исходного и итогового рома (UPS, BPS). В IPS и VCDIFF их нет.
  // CRC32 of the source and target ROM (UPS, BPS). IPS and VCDIFF don't carry them.
  sourceCrc32?: string;
  targetCrc32?: string;
  sourceSize?: number;
  targetSize?: number;
  // Метаданные BPS (часто XML с автором и названием). / BPS metadata (often XML with author and title).
  metadata?: string;
}

export type PatchErrorCode =
  | 'unknown_format'
  | 'corrupt'
  | 'source_mismatch'
  | 'already_patched'
  | 'target_mismatch'
  | 'unsupported';

export class PatchError extends Error {
  code: PatchErrorCode;
  constructor(code: PatchErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = 'PatchError';
  }
}

export interface ApplyOptions {
  // Не проверять CRC исходного рома (UPS/BPS). / Skip the source ROM CRC check (UPS/BPS).
  ignoreChecksums?: boolean;
}

export interface ApplyResult {
  data: Uint8Array;
  format: PatchFormat;
  info: PatchInfo;
  // Итоговый CRC32 (8 hex, нижний регистр). / Resulting CRC32 (8 hex chars, lowercase).
  crc32: string;
}

// ---------------------------------------------------------------------------
// CRC32 / Adler-32
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array, from = 0, to = bytes.length): number {
  let c = 0xffffffff;
  for (let i = from; i < to; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function crcHex(n: number): string {
  return (n >>> 0).toString(16).padStart(8, '0');
}

function adler32(bytes: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (let i = 0; i < bytes.length; i++) {
    a = (a + bytes[i]) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

function readU32LE(b: Uint8Array, p: number): number {
  return (b[p] | (b[p + 1] << 8) | (b[p + 2] << 16) | (b[p + 3] << 24)) >>> 0;
}

function ascii(b: Uint8Array, from: number, len: number): string {
  let s = '';
  for (let i = from; i < from + len && i < b.length; i++) s += String.fromCharCode(b[i]);
  return s;
}

// ---------------------------------------------------------------------------
// Определение формата / Format detection
// ---------------------------------------------------------------------------

export function detectPatchFormat(patch: Uint8Array): PatchFormat | null {
  if (patch.length >= 8 && ascii(patch, 0, 5) === 'PATCH') return 'ips';
  if (patch.length >= 4 && ascii(patch, 0, 4) === 'UPS1') return 'ups';
  if (patch.length >= 4 && ascii(patch, 0, 4) === 'BPS1') return 'bps';
  if (patch.length >= 5 && patch[0] === 0xd6 && patch[1] === 0xc3 && patch[2] === 0xc4) return 'vcdiff';
  return null;
}

export function isPatchFileName(name: string): boolean {
  const low = name.toLowerCase();
  return PATCH_EXTENSIONS.some((ext) => low.endsWith(ext));
}

// Varint UPS/BPS (byuu). / UPS/BPS varint (byuu encoding).
class ByuuReader {
  b: Uint8Array;
  pos: number;
  constructor(b: Uint8Array, start: number) {
    this.b = b;
    this.pos = start;
  }
  byte(): number {
    if (this.pos >= this.b.length) throw new PatchError('corrupt', 'unexpected end of patch');
    return this.b[this.pos++];
  }
  varint(): number {
    let data = 0;
    let shift = 1;
    for (;;) {
      const x = this.byte();
      data += (x & 0x7f) * shift;
      if (x & 0x80) break;
      shift *= 128;
      data += shift;
      if (shift > 2 ** 48) throw new PatchError('corrupt', 'varint overflow');
    }
    return data;
  }
}

// Читает заголовок патча без применения. / Reads the patch header without applying it.
export function readPatchInfo(patch: Uint8Array): PatchInfo | null {
  const format = detectPatchFormat(patch);
  if (!format) return null;
  if (format === 'ips' || format === 'vcdiff') return { format };
  if (patch.length < 4 + 12) return null;
  const r = new ByuuReader(patch, 4);
  try {
    const sourceSize = r.varint();
    const targetSize = r.varint();
    let metadata: string | undefined;
    if (format === 'bps') {
      const metaLen = r.varint();
      if (metaLen > 0) {
        const raw = patch.subarray(r.pos, r.pos + metaLen);
        metadata = new TextDecoder('utf-8', { fatal: false }).decode(raw).trim() || undefined;
      }
    }
    const end = patch.length - 12;
    return {
      format,
      sourceSize,
      targetSize,
      sourceCrc32: crcHex(readU32LE(patch, end)),
      targetCrc32: crcHex(readU32LE(patch, end + 4)),
      metadata,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// IPS
// ---------------------------------------------------------------------------

function applyIps(src: Uint8Array, patch: Uint8Array): Uint8Array {
  let out = new Uint8Array(src);
  let len = src.length;
  let p = 5;
  const ensure = (size: number) => {
    if (size <= out.length) return;
    const grown = new Uint8Array(Math.max(size, out.length * 2));
    grown.set(out.subarray(0, len));
    out = grown;
  };
  for (;;) {
    if (p + 3 > patch.length) throw new PatchError('corrupt', 'IPS: missing EOF marker');
    if (patch[p] === 0x45 && patch[p + 1] === 0x4f && patch[p + 2] === 0x46) {
      p += 3;
      break;
    }
    if (p + 5 > patch.length) throw new PatchError('corrupt', 'IPS: truncated record');
    const offset = (patch[p] << 16) | (patch[p + 1] << 8) | patch[p + 2];
    const size = (patch[p + 3] << 8) | patch[p + 4];
    p += 5;
    if (size === 0) {
      if (p + 3 > patch.length) throw new PatchError('corrupt', 'IPS: truncated RLE record');
      const count = (patch[p] << 8) | patch[p + 1];
      const value = patch[p + 2];
      p += 3;
      ensure(offset + count);
      out.fill(value, offset, offset + count);
      len = Math.max(len, offset + count);
    } else {
      if (p + size > patch.length) throw new PatchError('corrupt', 'IPS: truncated data');
      ensure(offset + size);
      out.set(patch.subarray(p, p + size), offset);
      len = Math.max(len, offset + size);
      p += size;
    }
  }
  // Расширение Lunar IPS: после EOF — 3 байта нового размера. / Lunar IPS extension: 3-byte truncate size after EOF.
  if (p + 3 <= patch.length) {
    const trunc = (patch[p] << 16) | (patch[p + 1] << 8) | patch[p + 2];
    if (trunc > 0) {
      ensure(trunc);
      len = trunc;
    }
  }
  return out.slice(0, len);
}

// ---------------------------------------------------------------------------
// UPS
// ---------------------------------------------------------------------------

function checkFooter(src: Uint8Array, patch: Uint8Array, opts: ApplyOptions) {
  const end = patch.length - 12;
  const patchCrc = readU32LE(patch, end + 8);
  if (crc32(patch, 0, end + 8) !== patchCrc) throw new PatchError('corrupt', 'patch checksum mismatch');
  const srcCrc = readU32LE(patch, end);
  const tgtCrc = readU32LE(patch, end + 4);
  if (!opts.ignoreChecksums) {
    const actual = crc32(src);
    if (actual !== srcCrc) {
      if (actual === tgtCrc) throw new PatchError('already_patched', 'ROM is already patched');
      throw new PatchError(
        'source_mismatch',
        `source CRC32 ${crcHex(actual)} does not match expected ${crcHex(srcCrc)}`
      );
    }
  }
  return tgtCrc;
}

function applyUps(src: Uint8Array, patch: Uint8Array, opts: ApplyOptions): Uint8Array {
  if (patch.length < 4 + 12) throw new PatchError('corrupt', 'UPS: too short');
  const tgtCrc = checkFooter(src, patch, opts);
  const r = new ByuuReader(patch, 4);
  const sourceSize = r.varint();
  const targetSize = r.varint();
  if (!opts.ignoreChecksums && src.length !== sourceSize) {
    throw new PatchError('source_mismatch', `source size ${src.length} != ${sourceSize}`);
  }
  const out = new Uint8Array(targetSize);
  out.set(src.subarray(0, Math.min(src.length, targetSize)));
  const end = patch.length - 12;
  let pos = 0;
  while (r.pos < end) {
    pos += r.varint();
    for (;;) {
      const x = r.byte();
      if (x === 0) {
        pos++;
        break;
      }
      if (pos < targetSize) out[pos] ^= x;
      pos++;
    }
  }
  if (crc32(out) !== tgtCrc && !opts.ignoreChecksums) {
    throw new PatchError('target_mismatch', 'result CRC32 does not match the patch');
  }
  return out;
}

// ---------------------------------------------------------------------------
// BPS
// ---------------------------------------------------------------------------

function applyBps(src: Uint8Array, patch: Uint8Array, opts: ApplyOptions): Uint8Array {
  if (patch.length < 4 + 12) throw new PatchError('corrupt', 'BPS: too short');
  const tgtCrc = checkFooter(src, patch, opts);
  const r = new ByuuReader(patch, 4);
  const sourceSize = r.varint();
  const targetSize = r.varint();
  const metaLen = r.varint();
  r.pos += metaLen;
  if (!opts.ignoreChecksums && src.length !== sourceSize) {
    throw new PatchError('source_mismatch', `source size ${src.length} != ${sourceSize}`);
  }
  const out = new Uint8Array(targetSize);
  const end = patch.length - 12;
  let outPos = 0;
  let srcRel = 0;
  let tgtRel = 0;
  while (r.pos < end) {
    const data = r.varint();
    const cmd = data & 3;
    const length = Math.floor(data / 4) + 1;
    if (outPos + length > targetSize) throw new PatchError('corrupt', 'BPS: write past target size');
    if (cmd === 0) {
      // SourceRead
      for (let i = 0; i < length; i++) {
        out[outPos] = outPos < src.length ? src[outPos] : 0;
        outPos++;
      }
    } else if (cmd === 1) {
      // TargetRead
      if (r.pos + length > end) throw new PatchError('corrupt', 'BPS: truncated data');
      out.set(patch.subarray(r.pos, r.pos + length), outPos);
      r.pos += length;
      outPos += length;
    } else if (cmd === 2) {
      // SourceCopy
      const d = r.varint();
      srcRel += (d & 1 ? -1 : 1) * Math.floor(d / 2);
      if (srcRel < 0 || srcRel + length > src.length) throw new PatchError('corrupt', 'BPS: source copy out of range');
      for (let i = 0; i < length; i++) out[outPos++] = src[srcRel++];
    } else {
      // TargetCopy (может перекрываться — копируем побайтно) / may overlap — copy byte by byte
      const d = r.varint();
      tgtRel += (d & 1 ? -1 : 1) * Math.floor(d / 2);
      if (tgtRel < 0 || tgtRel >= outPos) throw new PatchError('corrupt', 'BPS: target copy out of range');
      for (let i = 0; i < length; i++) out[outPos++] = out[tgtRel++];
    }
  }
  if (crc32(out) !== tgtCrc && !opts.ignoreChecksums) {
    throw new PatchError('target_mismatch', 'result CRC32 does not match the patch');
  }
  return out;
}

// ---------------------------------------------------------------------------
// VCDIFF (RFC 3284), формат xdelta3 / the xdelta3 format
// ---------------------------------------------------------------------------

const VC_NOOP = 0;
const VC_ADD = 1;
const VC_RUN = 2;
const VC_COPY = 3;

interface CodeEntry {
  t1: number;
  s1: number;
  m1: number;
  t2: number;
  s2: number;
  m2: number;
}

// Стандартная таблица кодов из RFC 3284, раздел 5.6. / Default code table, RFC 3284 section 5.6.
const DEFAULT_CODE_TABLE: CodeEntry[] = (() => {
  const t: CodeEntry[] = [];
  const e = (t1: number, s1: number, m1: number, t2 = VC_NOOP, s2 = 0, m2 = 0) =>
    t.push({ t1, s1, m1, t2, s2, m2 });
  e(VC_RUN, 0, 0);
  for (let s = 0; s <= 17; s++) e(VC_ADD, s, 0);
  for (let m = 0; m <= 8; m++) {
    e(VC_COPY, 0, m);
    for (let s = 4; s <= 18; s++) e(VC_COPY, s, m);
  }
  for (let m = 0; m <= 5; m++)
    for (let as = 1; as <= 4; as++) for (let cs = 4; cs <= 6; cs++) e(VC_ADD, as, 0, VC_COPY, cs, m);
  for (let m = 6; m <= 8; m++) for (let as = 1; as <= 4; as++) e(VC_ADD, as, 0, VC_COPY, 4, m);
  for (let m = 0; m <= 8; m++) e(VC_COPY, 4, m, VC_ADD, 1, 0);
  return t;
})();

class VcReader {
  b: Uint8Array;
  pos: number;
  end: number;
  constructor(b: Uint8Array, pos: number, end: number) {
    this.b = b;
    this.pos = pos;
    this.end = end;
  }
  byte(): number {
    if (this.pos >= this.end) throw new PatchError('corrupt', 'VCDIFF: unexpected end of section');
    return this.b[this.pos++];
  }
  int(): number {
    let v = 0;
    for (let i = 0; i < 10; i++) {
      const x = this.byte();
      v = v * 128 + (x & 0x7f);
      if (!(x & 0x80)) return v;
    }
    throw new PatchError('corrupt', 'VCDIFF: integer too long');
  }
}

function applyVcdiff(src: Uint8Array, patch: Uint8Array): Uint8Array {
  if (patch[3] !== 0x00) throw new PatchError('unsupported', 'VCDIFF: unknown version');
  const hdr = patch[4];
  let p = 5;
  if (hdr & 0x01) {
    throw new PatchError(
      'unsupported',
      'xdelta: secondary compression is not supported (create the patch with xdelta3 -S none)'
    );
  }
  if (hdr & 0x02) throw new PatchError('unsupported', 'VCDIFF: custom code tables are not supported');
  if (hdr & 0x04) {
    const r = new VcReader(patch, p, patch.length);
    const appLen = r.int();
    p = r.pos + appLen;
  }

  const chunks: Uint8Array[] = [];
  let total = 0;
  // Готовый результат целиком нужен для окон с VCD_TARGET. / Full output so far is needed for VCD_TARGET windows.
  const outputSoFar = () => {
    if (chunks.length === 1) return chunks[0];
    const all = new Uint8Array(total);
    let o = 0;
    for (const c of chunks) {
      all.set(c, o);
      o += c.length;
    }
    chunks.length = 0;
    chunks.push(all);
    return all;
  };

  while (p < patch.length) {
    const h = new VcReader(patch, p, patch.length);
    const winInd = h.byte();
    let segment: Uint8Array = new Uint8Array(0);
    if (winInd & 0x03) {
      const segLen = h.int();
      const segPos = h.int();
      const base = winInd & 0x01 ? src : outputSoFar();
      if (segPos + segLen > base.length) throw new PatchError('source_mismatch', 'VCDIFF: source window out of range');
      segment = base.subarray(segPos, segPos + segLen);
    }
    h.int(); // длина дельты / delta encoding length
    const targetLen = h.int();
    const deltaInd = h.byte();
    if (deltaInd !== 0) throw new PatchError('unsupported', 'xdelta: compressed sections are not supported');
    const dataLen = h.int();
    const instLen = h.int();
    const addrLen = h.int();
    let checksum: number | undefined;
    if (winInd & 0x04) {
      checksum = ((patch[h.pos] << 24) | (patch[h.pos + 1] << 16) | (patch[h.pos + 2] << 8) | patch[h.pos + 3]) >>> 0;
      h.pos += 4;
    }
    const dataStart = h.pos;
    const instStart = dataStart + dataLen;
    const addrStart = instStart + instLen;
    const winEnd = addrStart + addrLen;
    if (winEnd > patch.length) throw new PatchError('corrupt', 'VCDIFF: truncated window');

    const data = new VcReader(patch, dataStart, instStart);
    const inst = new VcReader(patch, instStart, addrStart);
    const addr = new VcReader(patch, addrStart, winEnd);
    const out = new Uint8Array(targetLen);
    let o = 0;
    const near = [0, 0, 0, 0];
    let nextNear = 0;
    const same = new Array<number>(3 * 256).fill(0);
    const segLen = segment.length;

    const decodeAddr = (mode: number): number => {
      const here = segLen + o;
      let a: number;
      if (mode === 0) a = addr.int();
      else if (mode === 1) a = here - addr.int();
      else if (mode < 2 + 4) a = near[mode - 2] + addr.int();
      else a = same[(mode - 6) * 256 + addr.byte()];
      near[nextNear] = a;
      nextNear = (nextNear + 1) % 4;
      same[a % (3 * 256)] = a;
      return a;
    };

    const run = (type: number, size: number, mode: number) => {
      if (type === VC_NOOP) return;
      if (size === 0) size = inst.int();
      if (o + size > targetLen) throw new PatchError('corrupt', 'VCDIFF: write past window');
      if (type === VC_ADD) {
        if (data.pos + size > instStart) throw new PatchError('corrupt', 'VCDIFF: data section overrun');
        out.set(patch.subarray(data.pos, data.pos + size), o);
        data.pos += size;
        o += size;
      } else if (type === VC_RUN) {
        out.fill(data.byte(), o, o + size);
        o += size;
      } else {
        const a = decodeAddr(mode);
        for (let i = 0; i < size; i++) {
          const ai = a + i;
          out[o++] = ai < segLen ? segment[ai] : out[ai - segLen];
        }
      }
    };

    while (inst.pos < addrStart) {
      const ce = DEFAULT_CODE_TABLE[inst.byte()];
      run(ce.t1, ce.s1, ce.m1);
      run(ce.t2, ce.s2, ce.m2);
    }
    if (o !== targetLen) throw new PatchError('corrupt', 'VCDIFF: window size mismatch');
    if (checksum !== undefined && adler32(out) !== checksum) {
      throw new PatchError('target_mismatch', 'xdelta: window checksum mismatch (wrong source ROM?)');
    }
    chunks.push(out);
    total += out.length;
    p = winEnd;
  }
  return outputSoFar();
}

// ---------------------------------------------------------------------------
// Общий вход / Entry point
// ---------------------------------------------------------------------------

export function applyPatch(src: Uint8Array, patch: Uint8Array, opts: ApplyOptions = {}): ApplyResult {
  const format = detectPatchFormat(patch);
  if (!format) throw new PatchError('unknown_format', 'unknown patch format');
  let data: Uint8Array;
  if (format === 'ips') data = applyIps(src, patch);
  else if (format === 'ups') data = applyUps(src, patch, opts);
  else if (format === 'bps') data = applyBps(src, patch, opts);
  else data = applyVcdiff(src, patch);
  const info = readPatchInfo(patch) || { format };
  return { data, format, info, crc32: crcHex(crc32(data)) };
}

// Как applyPatch, но если CRC исходника не сошёлся, пробует ром без 512-байтного копирного заголовка
// (SNES .smc). Патчи BPS/UPS почти всегда делаются для рома без заголовка.
// Like applyPatch, but on a source CRC mismatch retries without a 512-byte copier header (SNES .smc).
// BPS/UPS patches are almost always made for the headerless ROM.
export function applyPatchSmart(
  src: Uint8Array,
  patch: Uint8Array,
  opts: ApplyOptions = {}
): ApplyResult & { strippedHeader: boolean } {
  try {
    return { ...applyPatch(src, patch, opts), strippedHeader: false };
  } catch (err) {
    const headered = src.length > 512 && src.length % 1024 === 512;
    if (err instanceof PatchError && err.code === 'source_mismatch' && headered) {
      return { ...applyPatch(src.subarray(512), patch, opts), strippedHeader: true };
    }
    throw err;
  }
}

// Имя файла результата: имя исходника + тег. «Game (USA).sfc» + «T+Rus» → «Game (USA) [T+Rus].sfc».
// Output file name: source stem + tag.
export function buildPatchedFileName(sourceName: string, tag: string): string {
  const dot = sourceName.lastIndexOf('.');
  const stem = dot > 0 ? sourceName.slice(0, dot) : sourceName;
  const ext = dot > 0 ? sourceName.slice(dot) : '';
  const cleanTag = tag.replace(/[[\]]/g, '').trim();
  if (!cleanTag) return sourceName;
  return `${stem} [${cleanTag}]${ext}`.replace(/[<>:"/\\|?*]/g, '_');
}
