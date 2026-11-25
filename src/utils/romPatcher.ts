// Патчер ромов: IPS, UPS, BPS и xdelta (VCDIFF). Работает в браузере, без зависимостей.
// ROM patcher: IPS, UPS, BPS and xdelta (VCDIFF). Runs in the browser, no dependencies.
//
// Модуль без внешних зависимостей (только соседний xdeltaSecondary.ts), чтобы тестироваться через `node --test`.
// No external dependencies (only the sibling xdeltaSecondary.ts), so it can be tested with `node --test`.

import {
  SecondaryError,
  VCD_DJW_ID,
  VCD_FGK_ID,
  VCD_LZMA_ID,
  decodeDjw,
  decodeXzLzma2,
} from './xdeltaSecondary.ts';

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
// Ввод и вывод / Input and output
// ---------------------------------------------------------------------------
// Патчеры читают исходный ром кусками через PatchSource и пишут результат по порядку в PatchSink.
// Так большой образ (CD/DVD) не нужно целиком держать в памяти: в окне патчера источник —
// файл на диске, а результат пишется во временный файл (см. src/workers/patchWorker.ts).
// Patchers read the source ROM in pieces through PatchSource and write the result in order to
// PatchSink. A large disc image never has to sit in memory whole: in the patcher the source is a
// file on disk and the result goes to a temporary file (see src/workers/patchWorker.ts).

export interface PatchSource {
  readonly size: number;
  // Ровно len байт с позиции pos (pos + len <= size). Результат можно только читать.
  // Exactly len bytes from pos (pos + len <= size). Treat the result as read-only.
  read(pos: number, len: number): Uint8Array;
}

export interface PatchSink {
  // Сколько байт уже записано. / Bytes written so far.
  readonly size: number;
  // Дописать в конец. / Append.
  write(bytes: Uint8Array): void;
  // Прочитать уже записанное (pos + len <= size). / Read back what was written.
  read(pos: number, len: number): Uint8Array;
  // Начать заново (повтор без копирного заголовка). / Start over (retry without a copier header).
  reset(): void;
}

export class MemorySource implements PatchSource {
  bytes: Uint8Array;
  constructor(bytes: Uint8Array) {
    this.bytes = bytes;
  }
  get size() {
    return this.bytes.length;
  }
  read(pos: number, len: number): Uint8Array {
    return this.bytes.subarray(pos, pos + len);
  }
}

// Тот же источник без первых offset байт (ром без копирного заголовка). / Same source minus the first offset bytes.
export class OffsetSource implements PatchSource {
  inner: PatchSource;
  offset: number;
  constructor(inner: PatchSource, offset: number) {
    this.inner = inner;
    this.offset = offset;
  }
  get size() {
    return Math.max(0, this.inner.size - this.offset);
  }
  read(pos: number, len: number): Uint8Array {
    return this.inner.read(pos + this.offset, len);
  }
}

export class MemorySink implements PatchSink {
  buf: Uint8Array;
  size = 0;
  constructor(capacity = 0) {
    this.buf = new Uint8Array(capacity);
  }
  write(bytes: Uint8Array): void {
    const need = this.size + bytes.length;
    if (need > this.buf.length) {
      const grown = new Uint8Array(Math.max(need, this.buf.length * 2, 1024));
      grown.set(this.buf.subarray(0, this.size));
      this.buf = grown;
    }
    this.buf.set(bytes, this.size);
    this.size = need;
  }
  read(pos: number, len: number): Uint8Array {
    return this.buf.subarray(pos, pos + len);
  }
  reset(): void {
    this.size = 0;
  }
  data(): Uint8Array {
    return this.buf.length === this.size ? this.buf : this.buf.slice(0, this.size);
  }
}

const IO_CHUNK = 4 * 1024 * 1024;
const PROGRESS_STEP = 8 * 1024 * 1024;

// Продолжение CRC32 по куску (состояние без финального XOR). / Continue a CRC32 over a piece (raw state).
export function crc32Update(state: number, bytes: Uint8Array): number {
  let c = state;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return c >>> 0;
}

// CRC32 всего источника, кусками. / CRC32 of the whole source, chunk by chunk.
export function sourceCrc32(src: PatchSource, from = 0): number {
  let c = 0xffffffff;
  for (let pos = from; pos < src.size; pos += IO_CHUNK) {
    c = crc32Update(c, src.read(pos, Math.min(IO_CHUNK, src.size - pos)));
  }
  return (c ^ 0xffffffff) >>> 0;
}

// Байты источника с дополнением нулями за его концом. / Source bytes, zero-padded past its end.
function readPadded(src: PatchSource, from: number, len: number): Uint8Array {
  if (from + len <= src.size) return src.read(from, len);
  const out = new Uint8Array(len);
  if (from < src.size) out.set(src.read(from, src.size - from));
  return out;
}

// Обёртка вывода: считает CRC32 и прогресс. / Output wrapper: tracks CRC32 and progress.
class Out {
  sink: PatchSink;
  crc = 0xffffffff;
  onProgress?: (written: number) => void;
  nextReport = PROGRESS_STEP;
  constructor(sink: PatchSink, onProgress?: (written: number) => void) {
    this.sink = sink;
    this.onProgress = onProgress;
  }
  get pos() {
    return this.sink.size;
  }
  write(bytes: Uint8Array) {
    if (bytes.length === 0) return;
    this.crc = crc32Update(this.crc, bytes);
    this.sink.write(bytes);
    if (this.onProgress && this.sink.size >= this.nextReport) {
      this.nextReport = this.sink.size + PROGRESS_STEP;
      this.onProgress(this.sink.size);
    }
  }
  // Копия куска источника (за концом — нули). / Copy a source range (zeros past its end).
  copySource(src: PatchSource, from: number, len: number) {
    for (let done = 0; done < len; done += IO_CHUNK) {
      this.write(readPadded(src, from + done, Math.min(IO_CHUNK, len - done)));
    }
  }
  // Повтор уже записанного: from < pos, участок может перекрываться (RLE).
  // Repeat already written output: from < pos, the range may overlap (RLE).
  copyBack(from: number, len: number) {
    const period = this.pos - from;
    if (len <= period) {
      for (let done = 0; done < len; done += IO_CHUNK) {
        this.write(this.sink.read(from + done, Math.min(IO_CHUNK, len - done)).slice());
      }
      return;
    }
    const pattern = this.sink.read(from, period).slice();
    const block = new Uint8Array(Math.min(len, period * Math.max(1, Math.floor(IO_CHUNK / period))));
    for (let i = 0; i < block.length; i += period) block.set(pattern.subarray(0, Math.min(period, block.length - i)), i);
    for (let done = 0; done < len; done += block.length) {
      this.write(block.subarray(0, Math.min(block.length, len - done)));
    }
  }
  crc32(): number {
    return (this.crc ^ 0xffffffff) >>> 0;
  }
}

// ---------------------------------------------------------------------------
// IPS
// ---------------------------------------------------------------------------

function applyIps(src: PatchSource, patch: Uint8Array, out: Out): void {
  // Сначала разбираем записи: смещения в IPS 24-битные, поэтому правки лежат в первых ~16 МБ,
  // а остальной ром копируется как есть. / Parse records first: IPS offsets are 24-bit, so edits
  // sit in the first ~16 MB and the rest of the ROM is copied as is.
  const records: Array<{ offset: number; size: number; rle: boolean; value: number; at: number }> = [];
  let p = 5;
  let maxEnd = 0;
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
      records.push({ offset, size: count, rle: true, value: patch[p + 2], at: 0 });
      maxEnd = Math.max(maxEnd, offset + count);
      p += 3;
    } else {
      if (p + size > patch.length) throw new PatchError('corrupt', 'IPS: truncated data');
      records.push({ offset, size, rle: false, value: 0, at: p });
      maxEnd = Math.max(maxEnd, offset + size);
      p += size;
    }
  }
  // Расширение Lunar IPS: после EOF — 3 байта нового размера. / Lunar IPS extension: 3-byte truncate size after EOF.
  let finalLen = Math.max(src.size, maxEnd);
  if (p + 3 <= patch.length) {
    const trunc = (patch[p] << 16) | (patch[p + 1] << 8) | patch[p + 2];
    if (trunc > 0) finalLen = trunc;
  }
  const head = new Uint8Array(maxEnd);
  head.set(src.read(0, Math.min(src.size, maxEnd)));
  for (const r of records) {
    if (r.rle) head.fill(r.value, r.offset, r.offset + r.size);
    else head.set(patch.subarray(r.at, r.at + r.size), r.offset);
  }
  const headLen = Math.min(maxEnd, finalLen);
  out.write(head.subarray(0, headLen));
  if (finalLen > headLen) out.copySource(src, headLen, finalLen - headLen);
}

// ---------------------------------------------------------------------------
// UPS
// ---------------------------------------------------------------------------

function checkFooter(src: PatchSource, patch: Uint8Array, opts: ApplyOptions) {
  const end = patch.length - 12;
  const patchCrc = readU32LE(patch, end + 8);
  if (crc32(patch, 0, end + 8) !== patchCrc) throw new PatchError('corrupt', 'patch checksum mismatch');
  const srcCrc = readU32LE(patch, end);
  const tgtCrc = readU32LE(patch, end + 4);
  if (!opts.ignoreChecksums) {
    const actual = sourceCrc32(src);
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

function applyUps(src: PatchSource, patch: Uint8Array, out: Out, opts: ApplyOptions): void {
  if (patch.length < 4 + 12) throw new PatchError('corrupt', 'UPS: too short');
  const tgtCrc = checkFooter(src, patch, opts);
  const r = new ByuuReader(patch, 4);
  const sourceSize = r.varint();
  const targetSize = r.varint();
  if (!opts.ignoreChecksums && src.size !== sourceSize) {
    throw new PatchError('source_mismatch', `source size ${src.size} != ${sourceSize}`);
  }
  const end = patch.length - 12;
  let pos = 0;
  // Пишем по порядку: исходник до правки, затем XOR-участок. / Write in order: source up to a hunk, then the XOR run.
  const copyTo = (limit: number) => {
    const upto = Math.min(limit, targetSize);
    if (upto > out.pos) out.copySource(src, out.pos, upto - out.pos);
  };
  while (r.pos < end) {
    pos += r.varint();
    copyTo(pos);
    const start = r.pos;
    while (r.byte() !== 0) {
      /* до нулевого байта / up to the zero byte */
    }
    const count = r.pos - start; // вместе с нулём / including the zero
    if (pos < targetSize) {
      const n = Math.min(count, targetSize - pos);
      const bytes = readPadded(src, pos, n).slice();
      for (let i = 0; i < n; i++) bytes[i] ^= patch[start + i];
      out.write(bytes);
    }
    pos += count;
  }
  copyTo(targetSize);
  if (out.crc32() !== tgtCrc && !opts.ignoreChecksums) {
    throw new PatchError('target_mismatch', 'result CRC32 does not match the patch');
  }
}

// ---------------------------------------------------------------------------
// BPS
// ---------------------------------------------------------------------------

function applyBps(src: PatchSource, patch: Uint8Array, out: Out, opts: ApplyOptions): void {
  if (patch.length < 4 + 12) throw new PatchError('corrupt', 'BPS: too short');
  const tgtCrc = checkFooter(src, patch, opts);
  const r = new ByuuReader(patch, 4);
  const sourceSize = r.varint();
  const targetSize = r.varint();
  const metaLen = r.varint();
  r.pos += metaLen;
  if (!opts.ignoreChecksums && src.size !== sourceSize) {
    throw new PatchError('source_mismatch', `source size ${src.size} != ${sourceSize}`);
  }
  const end = patch.length - 12;
  let srcRel = 0;
  let tgtRel = 0;
  while (r.pos < end) {
    const data = r.varint();
    const cmd = data & 3;
    const length = Math.floor(data / 4) + 1;
    const outPos = out.pos;
    if (outPos + length > targetSize) throw new PatchError('corrupt', 'BPS: write past target size');
    if (cmd === 0) {
      // SourceRead
      out.copySource(src, outPos, length);
    } else if (cmd === 1) {
      // TargetRead
      if (r.pos + length > end) throw new PatchError('corrupt', 'BPS: truncated data');
      out.write(patch.subarray(r.pos, r.pos + length));
      r.pos += length;
    } else if (cmd === 2) {
      // SourceCopy
      const d = r.varint();
      srcRel += (d & 1 ? -1 : 1) * Math.floor(d / 2);
      if (srcRel < 0 || srcRel + length > src.size) throw new PatchError('corrupt', 'BPS: source copy out of range');
      out.copySource(src, srcRel, length);
      srcRel += length;
    } else {
      // TargetCopy (может перекрываться) / may overlap
      const d = r.varint();
      tgtRel += (d & 1 ? -1 : 1) * Math.floor(d / 2);
      if (tgtRel < 0 || tgtRel >= outPos) throw new PatchError('corrupt', 'BPS: target copy out of range');
      out.copyBack(tgtRel, length);
      tgtRel += length;
    }
  }
  if (out.pos !== targetSize) throw new PatchError('corrupt', 'BPS: result size mismatch');
  if (out.crc32() !== tgtCrc && !opts.ignoreChecksums) {
    throw new PatchError('target_mismatch', 'result CRC32 does not match the patch');
  }
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
  constructor(b: Uint8Array, pos = 0, end = b.length) {
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

interface VcWindow {
  winInd: number;
  segLen: number;
  segPos: number;
  targetLen: number;
  deltaInd: number;
  // Секции: данные, инструкции, адреса. / Sections: data, instructions, addresses.
  sections: [Uint8Array, Uint8Array, Uint8Array];
  checksum?: number;
}

const SECTION_NAMES = ['data', 'inst', 'addr'];

// Снимает вторичное сжатие с секций окон. / Removes secondary compression from window sections.
function decodeSecondary(windows: VcWindow[], secondId: number): void {
  for (let k = 0; k < 3; k++) {
    const bit = 1 << k;
    const pieces: Array<{ w: VcWindow; size: number; body: Uint8Array }> = [];
    for (const w of windows) {
      if (!(w.deltaInd & bit)) continue;
      const r = new VcReader(w.sections[k]);
      const size = r.int();
      if (size === 0) throw new PatchError('corrupt', `xdelta: empty ${SECTION_NAMES[k]} section`);
      pieces.push({ w, size, body: w.sections[k].subarray(r.pos) });
    }
    if (pieces.length === 0) continue;
    try {
      if (secondId === VCD_DJW_ID) {
        for (const pc of pieces) pc.w.sections[k] = decodeDjw(pc.body, pc.size);
      } else {
        // LZMA: один поток на вид секции через все окна. / LZMA: one stream per section kind across windows.
        let inLen = 0;
        let outLen = 0;
        for (const pc of pieces) {
          inLen += pc.body.length;
          outLen += pc.size;
        }
        const joined = new Uint8Array(inLen);
        let o = 0;
        for (const pc of pieces) {
          joined.set(pc.body, o);
          o += pc.body.length;
        }
        const plain = decodeXzLzma2(joined, outLen);
        o = 0;
        for (const pc of pieces) {
          pc.w.sections[k] = plain.subarray(o, o + pc.size);
          o += pc.size;
        }
      }
    } catch (err) {
      if (err instanceof SecondaryError) throw new PatchError('corrupt', `xdelta: ${err.message}`);
      throw err;
    }
  }
}

function applyVcdiff(src: PatchSource, patch: Uint8Array, out: Out): void {
  if (patch[3] !== 0x00) throw new PatchError('unsupported', 'VCDIFF: unknown version');
  const hdr = patch[4];
  let p = 5;
  let secondId = 0;
  if (hdr & 0x01) {
    secondId = patch[p++];
    if (secondId === VCD_FGK_ID) {
      throw new PatchError('unsupported', 'xdelta: FGK secondary compression is not supported (use -S lzma, -S djw or -S none)');
    }
    if (secondId !== VCD_DJW_ID && secondId !== VCD_LZMA_ID) {
      throw new PatchError('unsupported', `xdelta: unknown secondary compressor ${secondId}`);
    }
  }
  if (hdr & 0x02) throw new PatchError('unsupported', 'VCDIFF: custom code tables are not supported');
  if (hdr & 0x04) {
    const r = new VcReader(patch, p, patch.length);
    const appLen = r.int();
    p = r.pos + appLen;
  }

  // Сначала разбираем все окна (сжатые секции распаковываются вместе). / Parse all windows first.
  const windows: VcWindow[] = [];
  while (p < patch.length) {
    const h = new VcReader(patch, p, patch.length);
    const winInd = h.byte();
    let segLen = 0;
    let segPos = 0;
    if (winInd & 0x03) {
      segLen = h.int();
      segPos = h.int();
    }
    h.int(); // длина дельты / delta encoding length
    const targetLen = h.int();
    const deltaInd = h.byte();
    if (deltaInd & ~0x07) throw new PatchError('corrupt', 'VCDIFF: bad delta indicator');
    if (deltaInd !== 0 && secondId === 0) throw new PatchError('corrupt', 'VCDIFF: compressed section without a compressor');
    const dataLen = h.int();
    const instLen = h.int();
    const addrLen = h.int();
    let checksum: number | undefined;
    if (winInd & 0x04) {
      if (h.pos + 4 > patch.length) throw new PatchError('corrupt', 'VCDIFF: truncated window');
      checksum = ((patch[h.pos] << 24) | (patch[h.pos + 1] << 16) | (patch[h.pos + 2] << 8) | patch[h.pos + 3]) >>> 0;
      h.pos += 4;
    }
    const dataStart = h.pos;
    const instStart = dataStart + dataLen;
    const addrStart = instStart + instLen;
    const winEnd = addrStart + addrLen;
    if (winEnd > patch.length) throw new PatchError('corrupt', 'VCDIFF: truncated window');
    windows.push({
      winInd,
      segLen,
      segPos,
      targetLen,
      deltaInd,
      sections: [
        patch.subarray(dataStart, instStart),
        patch.subarray(instStart, addrStart),
        patch.subarray(addrStart, winEnd),
      ],
      checksum,
    });
    p = winEnd;
  }
  if (secondId !== 0) decodeSecondary(windows, secondId);

  for (const w of windows) {
    let segment: Uint8Array = new Uint8Array(0);
    if (w.winInd & 0x01) {
      if (w.segPos + w.segLen > src.size) throw new PatchError('source_mismatch', 'VCDIFF: source window out of range');
      segment = src.read(w.segPos, w.segLen);
    } else if (w.winInd & 0x02) {
      if (w.segPos + w.segLen > out.pos) throw new PatchError('corrupt', 'VCDIFF: target window out of range');
      segment = out.sink.read(w.segPos, w.segLen).slice();
    }
    const [dataSec, instSec, addrSec] = w.sections;
    const data = new VcReader(dataSec);
    const inst = new VcReader(instSec);
    const addr = new VcReader(addrSec);
    const targetLen = w.targetLen;
    const win = new Uint8Array(targetLen);
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
        if (data.pos + size > data.end) throw new PatchError('corrupt', 'VCDIFF: data section overrun');
        win.set(dataSec.subarray(data.pos, data.pos + size), o);
        data.pos += size;
        o += size;
      } else if (type === VC_RUN) {
        win.fill(data.byte(), o, o + size);
        o += size;
      } else {
        const a = decodeAddr(mode);
        if (a >= segLen + o) throw new PatchError('corrupt', 'VCDIFF: copy address out of range');
        for (let i = 0; i < size; i++) {
          const ai = a + i;
          win[o++] = ai < segLen ? segment[ai] : win[ai - segLen];
        }
      }
    };

    while (inst.pos < inst.end) {
      const ce = DEFAULT_CODE_TABLE[inst.byte()];
      run(ce.t1, ce.s1, ce.m1);
      run(ce.t2, ce.s2, ce.m2);
    }
    if (o !== targetLen) throw new PatchError('corrupt', 'VCDIFF: window size mismatch');
    if (w.checksum !== undefined && adler32(win) !== w.checksum) {
      throw new PatchError('target_mismatch', 'xdelta: window checksum mismatch (wrong source ROM?)');
    }
    out.write(win);
  }
}

// ---------------------------------------------------------------------------
// Общий вход / Entry point
// ---------------------------------------------------------------------------

export interface StreamApplyResult {
  format: PatchFormat;
  info: PatchInfo;
  crc32: string;
  size: number;
}

// Накладывает патч, читая источник кусками и записывая результат в sink.
// Applies a patch, reading the source in pieces and writing the result into sink.
export function applyPatchTo(
  src: PatchSource,
  patch: Uint8Array,
  sink: PatchSink,
  opts: ApplyOptions = {},
  onProgress?: (written: number) => void
): StreamApplyResult {
  const format = detectPatchFormat(patch);
  if (!format) throw new PatchError('unknown_format', 'unknown patch format');
  const out = new Out(sink, onProgress);
  if (format === 'ips') applyIps(src, patch, out);
  else if (format === 'ups') applyUps(src, patch, out, opts);
  else if (format === 'bps') applyBps(src, patch, out, opts);
  else applyVcdiff(src, patch, out);
  const info = readPatchInfo(patch) || { format };
  return { format, info, crc32: crcHex(out.crc32()), size: sink.size };
}

function hasCopierHeader(size: number): boolean {
  return size > 512 && size % 1024 === 512;
}

// Как applyPatchTo, но если CRC исходника не сошёлся, пробует ром без 512-байтного копирного заголовка
// (SNES .smc). Патчи BPS/UPS почти всегда делаются для рома без заголовка.
// Like applyPatchTo, but on a source CRC mismatch retries without a 512-byte copier header (SNES .smc).
// BPS/UPS patches are almost always made for the headerless ROM.
export function applyPatchSmartTo(
  src: PatchSource,
  patch: Uint8Array,
  sink: PatchSink,
  opts: ApplyOptions = {},
  onProgress?: (written: number) => void
): StreamApplyResult & { strippedHeader: boolean } {
  try {
    return { ...applyPatchTo(src, patch, sink, opts, onProgress), strippedHeader: false };
  } catch (err) {
    if (err instanceof PatchError && err.code === 'source_mismatch' && hasCopierHeader(src.size)) {
      sink.reset();
      return { ...applyPatchTo(new OffsetSource(src, 512), patch, sink, opts, onProgress), strippedHeader: true };
    }
    throw err;
  }
}

function expectedSize(src: Uint8Array, patch: Uint8Array): number {
  const info = readPatchInfo(patch);
  return info?.targetSize ?? src.length;
}

// Всё в памяти (тесты, маленькие ромы). / Everything in memory (tests, small ROMs).
export function applyPatch(src: Uint8Array, patch: Uint8Array, opts: ApplyOptions = {}): ApplyResult {
  const sink = new MemorySink(expectedSize(src, patch));
  const res = applyPatchTo(new MemorySource(src), patch, sink, opts);
  return { data: sink.data(), format: res.format, info: res.info, crc32: res.crc32 };
}

export function applyPatchSmart(
  src: Uint8Array,
  patch: Uint8Array,
  opts: ApplyOptions = {}
): ApplyResult & { strippedHeader: boolean } {
  const sink = new MemorySink(expectedSize(src, patch));
  const res = applyPatchSmartTo(new MemorySource(src), patch, sink, opts);
  return { data: sink.data(), format: res.format, info: res.info, crc32: res.crc32, strippedHeader: res.strippedHeader };
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
