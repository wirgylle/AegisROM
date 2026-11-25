// Вторичное сжатие xdelta3: LZMA (xz-поток с LZMA2) и DJW (статический Хаффман).
// xdelta3 secondary compression: LZMA (an xz stream with LZMA2) and DJW (static Huffman).
//
// Как это устроено в xdelta3 (xdelta3-second.h, xdelta3-lzma.h, xdelta3-djw.h):
// How xdelta3 lays it out:
//   - сжатая секция окна = varint размера после распаковки + сжатые байты;
//     a compressed window section = varint of the decompressed size + compressed bytes;
//   - LZMA: на каждый вид секции (данные, инструкции, адреса) один xz-поток на весь патч.
//     Между окнами кодировщик делает LZMA_SYNC_FLUSH и не закрывает поток, поэтому куски
//     одного вида склеиваются и распаковываются как один поток;
//     LZMA: one xz stream per section kind (data, inst, addr) for the whole patch. The encoder
//     sync-flushes between windows and never finishes the stream, so the pieces of one kind are
//     joined and decoded as a single stream;
//   - DJW: каждая секция самостоятельна.
//     DJW: each section stands alone.
//
// Модуль без импортов, чтобы тестироваться через `node --test`.
// No imports, so it can be tested with `node --test`.

export class SecondaryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecondaryError';
  }
}

// ---------------------------------------------------------------------------
// xz + LZMA2
// ---------------------------------------------------------------------------

const XZ_MAGIC = [0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00];

class RangeDecoder {
  b: Uint8Array;
  pos: number;
  end: number;
  range = 0xffffffff;
  code = 0;
  constructor(b: Uint8Array, pos: number, end: number) {
    this.b = b;
    this.pos = pos;
    this.end = end;
    if (this.next() !== 0) throw new SecondaryError('LZMA: bad range coder start');
    for (let i = 0; i < 4; i++) this.code = ((this.code << 8) | this.next()) >>> 0;
    if (this.code === this.range) throw new SecondaryError('LZMA: bad range coder start');
  }
  next(): number {
    if (this.pos >= this.end) throw new SecondaryError('LZMA: unexpected end of chunk');
    return this.b[this.pos++];
  }
  normalize() {
    if (this.range < 0x1000000) {
      this.range = (this.range << 8) >>> 0;
      this.code = ((this.code << 8) | this.next()) >>> 0;
    }
  }
  bit(probs: Uint16Array, i: number): number {
    const p = probs[i];
    const bound = (this.range >>> 11) * p;
    let bit: number;
    if (this.code < bound) {
      this.range = bound;
      probs[i] = p + ((2048 - p) >>> 5);
      bit = 0;
    } else {
      this.range -= bound;
      this.code -= bound;
      probs[i] = p - (p >>> 5);
      bit = 1;
    }
    this.normalize();
    return bit;
  }
  direct(count: number): number {
    let res = 0;
    for (let i = 0; i < count; i++) {
      this.range >>>= 1;
      let bit = 0;
      if (this.code >= this.range) {
        this.code -= this.range;
        bit = 1;
      }
      res = res * 2 + bit;
      this.normalize();
    }
    return res;
  }
  tree(probs: Uint16Array, base: number, bits: number): number {
    let m = 1;
    for (let i = 0; i < bits; i++) m = (m << 1) | this.bit(probs, base + m);
    return m - (1 << bits);
  }
  reverseTree(probs: Uint16Array, base: number, bits: number): number {
    let m = 1;
    let sym = 0;
    for (let i = 0; i < bits; i++) {
      const bit = this.bit(probs, base + m);
      m = (m << 1) | bit;
      sym |= bit << i;
    }
    return sym;
  }
}

const PROB_INIT = 1024;
const POS_STATES_MAX = 16;

class LenDecoder {
  choice = new Uint16Array(2);
  low = new Uint16Array(POS_STATES_MAX << 3);
  mid = new Uint16Array(POS_STATES_MAX << 3);
  high = new Uint16Array(256);
  reset() {
    this.choice.fill(PROB_INIT);
    this.low.fill(PROB_INIT);
    this.mid.fill(PROB_INIT);
    this.high.fill(PROB_INIT);
  }
  decode(rc: RangeDecoder, posState: number): number {
    if (rc.bit(this.choice, 0) === 0) return rc.tree(this.low, posState << 3, 3);
    if (rc.bit(this.choice, 1) === 0) return 8 + rc.tree(this.mid, posState << 3, 3);
    return 16 + rc.tree(this.high, 0, 8);
  }
}

class LzmaState {
  lc = 0;
  lp = 0;
  pb = 0;
  literal = new Uint16Array(0x300 << 4);
  isMatch = new Uint16Array(12 << 4);
  isRep = new Uint16Array(12);
  isRepG0 = new Uint16Array(12);
  isRepG1 = new Uint16Array(12);
  isRepG2 = new Uint16Array(12);
  isRep0Long = new Uint16Array(12 << 4);
  posSlot = new Uint16Array(4 << 6);
  posSpecial = new Uint16Array(1 + 114);
  align = new Uint16Array(16);
  len = new LenDecoder();
  repLen = new LenDecoder();
  state = 0;
  rep0 = 0;
  rep1 = 0;
  rep2 = 0;
  rep3 = 0;

  setProps(props: number) {
    if (props > 224) throw new SecondaryError('LZMA: bad properties');
    this.lc = props % 9;
    props = Math.floor(props / 9);
    this.lp = props % 5;
    this.pb = Math.floor(props / 5);
    if (this.lc + this.lp > 4) throw new SecondaryError('LZMA2: lc + lp > 4');
    const need = 0x300 << (this.lc + this.lp);
    if (this.literal.length !== need) this.literal = new Uint16Array(need);
  }
  reset() {
    this.literal.fill(PROB_INIT);
    this.isMatch.fill(PROB_INIT);
    this.isRep.fill(PROB_INIT);
    this.isRepG0.fill(PROB_INIT);
    this.isRepG1.fill(PROB_INIT);
    this.isRepG2.fill(PROB_INIT);
    this.isRep0Long.fill(PROB_INIT);
    this.posSlot.fill(PROB_INIT);
    this.posSpecial.fill(PROB_INIT);
    this.align.fill(PROB_INIT);
    this.len.reset();
    this.repLen.reset();
    this.state = 0;
    this.rep0 = this.rep1 = this.rep2 = this.rep3 = 0;
  }

  // Распаковывает один LZMA-кусок LZMA2 в out[pos .. pos + size). / Decodes one LZMA2 LZMA chunk.
  decodeChunk(rc: RangeDecoder, out: Uint8Array, pos: number, size: number, dictStart: number): void {
    const end = pos + size;
    const pbMask = (1 << this.pb) - 1;
    const lpMask = (1 << this.lp) - 1;
    const lc = this.lc;
    while (pos < end) {
      const rel = pos - dictStart;
      const posState = rel & pbMask;
      const st = this.state;
      if (rc.bit(this.isMatch, (st << 4) + posState) === 0) {
        const prev = pos > dictStart ? out[pos - 1] : 0;
        const base = 0x300 * (((rel & lpMask) << lc) + (prev >>> (8 - lc)));
        let sym = 1;
        if (st >= 7) {
          let matchByte = out[pos - this.rep0 - 1];
          while (sym < 0x100) {
            const matchBit = (matchByte >>> 7) & 1;
            matchByte <<= 1;
            const bit = rc.bit(this.literal, base + ((1 + matchBit) << 8) + sym);
            sym = (sym << 1) | bit;
            if (matchBit !== bit) break;
          }
        }
        while (sym < 0x100) sym = (sym << 1) | rc.bit(this.literal, base + sym);
        out[pos++] = sym & 0xff;
        this.state = st < 4 ? 0 : st < 10 ? st - 3 : st - 6;
        continue;
      }
      let len: number;
      if (rc.bit(this.isRep, st) === 0) {
        len = this.len.decode(rc, posState);
        this.state = st < 7 ? 7 : 10;
        const dist = this.decodeDistance(rc, len);
        if (dist === 0xffffffff) throw new SecondaryError('LZMA2: unexpected end marker');
        this.rep3 = this.rep2;
        this.rep2 = this.rep1;
        this.rep1 = this.rep0;
        this.rep0 = dist;
      } else {
        if (pos === dictStart) throw new SecondaryError('LZMA: repeat at dictionary start');
        if (rc.bit(this.isRepG0, st) === 0) {
          if (rc.bit(this.isRep0Long, (st << 4) + posState) === 0) {
            this.state = st < 7 ? 9 : 11;
            out[pos] = out[pos - this.rep0 - 1];
            pos++;
            continue;
          }
        } else {
          let dist: number;
          if (rc.bit(this.isRepG1, st) === 0) {
            dist = this.rep1;
          } else {
            if (rc.bit(this.isRepG2, st) === 0) {
              dist = this.rep2;
            } else {
              dist = this.rep3;
              this.rep3 = this.rep2;
            }
            this.rep2 = this.rep1;
          }
          this.rep1 = this.rep0;
          this.rep0 = dist;
        }
        len = this.repLen.decode(rc, posState);
        this.state = st < 7 ? 8 : 11;
      }
      len += 2;
      const from = pos - this.rep0 - 1;
      if (from < dictStart) throw new SecondaryError('LZMA: match distance out of range');
      if (pos + len > end) throw new SecondaryError('LZMA2: match crosses chunk end');
      for (let i = 0; i < len; i++) out[pos + i] = out[from + i];
      pos += len;
    }
  }

  decodeDistance(rc: RangeDecoder, len: number): number {
    const lenState = len < 3 ? len : 3;
    const slot = rc.tree(this.posSlot, lenState << 6, 6);
    if (slot < 4) return slot;
    const numDirect = (slot >>> 1) - 1;
    let dist = (2 | (slot & 1)) * 2 ** numDirect;
    if (slot < 14) {
      dist += rc.reverseTree(this.posSpecial, dist - slot, numDirect);
    } else {
      dist += rc.direct(numDirect - 4) * 16;
      dist += rc.reverseTree(this.align, 0, 4);
    }
    return dist;
  }
}

function readXzVli(b: Uint8Array, p: { pos: number }, end: number): number {
  let v = 0;
  let mul = 1;
  for (let i = 0; i < 9; i++) {
    if (p.pos >= end) throw new SecondaryError('xz: truncated header');
    const x = b[p.pos++];
    v += (x & 0x7f) * mul;
    if (!(x & 0x80)) return v;
    mul *= 128;
  }
  throw new SecondaryError('xz: bad integer');
}

// Распаковывает xz-поток (один блок, фильтр LZMA2) ровно до outSize байт. Поток может быть
// не закрыт (так делает xdelta3). / Decodes an xz stream (one block, LZMA2 filter) to exactly
// outSize bytes. The stream may be left unfinished, as xdelta3 does.
export function decodeXzLzma2(input: Uint8Array, outSize: number): Uint8Array {
  const out = new Uint8Array(outSize);
  if (outSize === 0) return out;
  if (input.length < 12) throw new SecondaryError('xz: too short');
  for (let i = 0; i < 6; i++) if (input[i] !== XZ_MAGIC[i]) throw new SecondaryError('xz: bad magic');
  let p = 12;
  // Заголовок блока. / Block header.
  const hdrSize = (input[p] + 1) * 4;
  if (input[p] === 0) throw new SecondaryError('xz: no block');
  const hdrEnd = p + hdrSize;
  if (hdrEnd > input.length) throw new SecondaryError('xz: truncated block header');
  const flags = input[p + 1];
  const cur = { pos: p + 2 };
  if (flags & 0x40) readXzVli(input, cur, hdrEnd);
  if (flags & 0x80) readXzVli(input, cur, hdrEnd);
  const filters = (flags & 0x03) + 1;
  for (let f = 0; f < filters; f++) {
    const id = readXzVli(input, cur, hdrEnd);
    const propSize = readXzVli(input, cur, hdrEnd);
    if (id !== 0x21 || filters !== 1) throw new SecondaryError('xz: only a plain LZMA2 filter is supported');
    cur.pos += propSize;
  }
  p = hdrEnd;

  const lz = new LzmaState();
  let outPos = 0;
  let dictStart = 0;
  let needDictReset = true;
  let needProps = true;
  while (outPos < outSize) {
    if (p >= input.length) throw new SecondaryError('LZMA2: unexpected end of stream');
    const ctrl = input[p++];
    if (ctrl === 0x00) throw new SecondaryError('LZMA2: stream ended early');
    if (ctrl === 0x01 || ctrl === 0x02) {
      if (ctrl === 0x01) {
        dictStart = outPos;
        needDictReset = false;
      } else if (needDictReset) {
        throw new SecondaryError('LZMA2: missing dictionary reset');
      }
      if (p + 2 > input.length) throw new SecondaryError('LZMA2: truncated chunk');
      const size = ((input[p] << 8) | input[p + 1]) + 1;
      p += 2;
      if (p + size > input.length || outPos + size > outSize) throw new SecondaryError('LZMA2: bad stored chunk');
      out.set(input.subarray(p, p + size), outPos);
      p += size;
      outPos += size;
      continue;
    }
    if (ctrl < 0x80) throw new SecondaryError('LZMA2: bad control byte');
    if (p + 4 > input.length) throw new SecondaryError('LZMA2: truncated chunk');
    const unpacked = ((ctrl & 0x1f) << 16) + ((input[p] << 8) | input[p + 1]) + 1;
    const packed = ((input[p + 2] << 8) | input[p + 3]) + 1;
    p += 4;
    const reset = (ctrl >>> 5) & 3;
    if (reset === 3) {
      dictStart = outPos;
      needDictReset = false;
    } else if (needDictReset) {
      throw new SecondaryError('LZMA2: missing dictionary reset');
    }
    if (reset >= 2) {
      if (p >= input.length) throw new SecondaryError('LZMA2: truncated chunk');
      lz.setProps(input[p++]);
      needProps = false;
    } else if (needProps) {
      throw new SecondaryError('LZMA2: missing properties');
    }
    if (reset >= 1) lz.reset();
    if (p + packed > input.length) throw new SecondaryError('LZMA2: truncated chunk');
    if (outPos + unpacked > outSize) throw new SecondaryError('LZMA2: more data than expected');
    const rc = new RangeDecoder(input, p, p + packed);
    lz.decodeChunk(rc, out, outPos, unpacked, dictStart);
    outPos += unpacked;
    p += packed;
  }
  return out;
}

// ---------------------------------------------------------------------------
// DJW (xdelta3-djw.h)
// ---------------------------------------------------------------------------

const DJW_MAX_CODELEN = 20;
const DJW_TOTAL_CODES = DJW_MAX_CODELEN + 2;
const DJW_EXTRA_12OFFSET = 7;
const DJW_EXTRA_CODE_BITS = 4;
const DJW_CLCLEN_BITS = 4;
const DJW_MAX_CLCLEN = 15;
const DJW_GROUP_BITS = 3;
const DJW_SECTORSZ_BITS = 5;
const DJW_SECTORSZ_MULT = 5;
const DJW_GBCLEN_BITS = 3;
const DJW_MAX_GBCLEN = 7;
const ALPHABET = 256;
const DJW_12BASIC = [4, 5, 6, 7, 8];
const DJW_12EXTRA = [9, 10, 3, 11, 2, 12, 13, 1, 14, 15, 16, 17, 18, 19, 20];

class BitReader {
  b: Uint8Array;
  pos: number;
  end: number;
  cur = 0;
  mask = 0x100;
  constructor(b: Uint8Array, pos: number, end: number) {
    this.b = b;
    this.pos = pos;
    this.end = end;
  }
  bit(): number {
    if (this.mask === 0x100) {
      if (this.pos >= this.end) throw new SecondaryError('DJW: unexpected end of input');
      this.cur = this.b[this.pos++];
      this.mask = 1;
    }
    const v = this.cur & this.mask ? 1 : 0;
    this.mask <<= 1;
    return v;
  }
  bits(n: number): number {
    let v = 0;
    for (let i = 0; i < n; i++) v = (v << 1) | this.bit();
    return v;
  }
}

interface HuffDecoder {
  inorder: Uint8Array;
  base: number[];
  limit: number[];
  minLen: number;
  maxLen: number;
}

// Канонический код по длинам, как djw_build_decoder. / Canonical code from lengths, like djw_build_decoder.
function buildDecoder(clen: ArrayLike<number>, asize: number, absMax: number): HuffDecoder {
  const nr = new Array<number>(absMax + 2).fill(0);
  for (let i = 0; i < asize; i++) {
    if (clen[i] > absMax) throw new SecondaryError('DJW: code length out of range');
    nr[clen[i]]++;
  }
  let minLen = 1;
  while (minLen <= absMax && !nr[minLen]) minLen++;
  let maxLen = absMax;
  while (maxLen > 0 && !nr[maxLen]) maxLen--;
  const base = new Array<number>(absMax + 2).fill(0);
  const limit = new Array<number>(absMax + 2).fill(-1);
  const tmpBase = new Array<number>(absMax + 2).fill(0);
  const inorder = new Uint8Array(asize);
  if (minLen <= maxLen) {
    limit[minLen] = nr[minLen] - 1;
    for (let i = minLen + 1; i <= maxLen; i++) {
      const lastLimit = (limit[i - 1] + 1) << 1;
      tmpBase[i] = tmpBase[i - 1] + nr[i - 1];
      limit[i] = lastLimit + nr[i] - 1;
      base[i] = lastLimit - tmpBase[i];
    }
    for (let i = 0; i < asize; i++) {
      const l = clen[i];
      if (l !== 0) inorder[tmpBase[l]++] = i;
    }
  }
  return { inorder, base, limit, minLen, maxLen };
}

function decodeSymbol(br: BitReader, d: HuffDecoder, maxSym: number): number {
  let code = 0;
  let bits = 0;
  for (;;) {
    if (bits >= d.maxLen) throw new SecondaryError('DJW: invalid code');
    bits++;
    code = (code << 1) | br.bit();
    if (bits >= d.minLen && code <= d.limit[bits]) break;
  }
  if (d.base[bits] <= code) {
    const offset = code - d.base[bits];
    if (offset <= maxSym) return d.inorder[offset];
  }
  throw new SecondaryError('DJW: invalid code');
}

function mtfTake(mtf: Uint8Array, i: number): number {
  const sym = mtf[i];
  for (let k = i; k > 0; k--) mtf[k] = mtf[k - 1];
  mtf[0] = sym;
  return sym;
}

// MTF + коды повторов RUN_0/RUN_1, как djw_decode_1_2. / MTF plus RUN_0/RUN_1 repeat codes, like djw_decode_1_2.
function decode12(
  br: BitReader,
  d: HuffDecoder,
  mtf: Uint8Array,
  elts: number,
  skipOffset: number,
  values: Uint8Array
): void {
  let n = 0;
  let rep = 0;
  let pending = 0;
  let s = 0;
  while (n < elts) {
    if (skipOffset !== 0 && n >= skipOffset && values[n - skipOffset] === 0) {
      values[n++] = 0;
      continue;
    }
    if (rep !== 0) {
      values[n++] = mtf[0];
      rep--;
      continue;
    }
    if (pending !== 0) {
      values[n++] = mtfTake(mtf, pending);
      pending = 0;
      continue;
    }
    const sym = decodeSymbol(br, d, DJW_TOTAL_CODES);
    if (sym <= 1) {
      rep = (sym + 1) << s;
      s++;
    } else {
      pending = sym - 1;
      s = 0;
    }
  }
  if (rep !== 0) throw new SecondaryError('DJW: invalid repeat code');
}

// Распаковывает одну DJW-секцию ровно в outSize байт. / Decodes one DJW section to exactly outSize bytes.
export function decodeDjw(input: Uint8Array, outSize: number): Uint8Array {
  if (outSize === 0) throw new SecondaryError('DJW: invalid output size');
  const br = new BitReader(input, 0, input.length);
  const groups = br.bits(DJW_GROUP_BITS) + 1;
  const sectorSize = groups > 1 ? (br.bits(DJW_SECTORSZ_BITS) + 1) * DJW_SECTORSZ_MULT : outSize;
  const sectors = 1 + Math.floor((outSize - 1) / sectorSize);

  // Коды длин кодов. / Code-length codes.
  const numCodes = br.bits(DJW_EXTRA_CODE_BITS) + DJW_EXTRA_12OFFSET;
  const clClen = new Uint8Array(DJW_TOTAL_CODES);
  for (let i = 0; i < numCodes; i++) clClen[i] = br.bits(DJW_CLCLEN_BITS);
  const clDec = buildDecoder(clClen, DJW_TOTAL_CODES, DJW_MAX_CLCLEN);
  const clMtf = Uint8Array.from([0, ...DJW_12BASIC, ...DJW_12EXTRA]);

  const clen = new Uint8Array(ALPHABET * groups);
  decode12(br, clDec, clMtf, ALPHABET * groups, ALPHABET, clen);
  const decoders: HuffDecoder[] = [];
  for (let g = 0; g < groups; g++) {
    decoders.push(buildDecoder(clen.subarray(g * ALPHABET, (g + 1) * ALPHABET), ALPHABET, DJW_MAX_CODELEN));
  }

  let selectors: Uint8Array | null = null;
  if (groups > 1) {
    const selClen = new Uint8Array(groups + 1);
    const selMtf = new Uint8Array(groups + 1);
    for (let g = 0; g < groups + 1; g++) {
      selClen[g] = br.bits(DJW_GBCLEN_BITS);
      selMtf[g] = g;
    }
    const selDec = buildDecoder(selClen, groups + 1, DJW_MAX_GBCLEN);
    selectors = new Uint8Array(sectors);
    decode12(br, selDec, selMtf, sectors, 0, selectors);
  }

  const out = new Uint8Array(outSize);
  let o = 0;
  for (let c = 0; c < sectors; c++) {
    const g = selectors ? selectors[c] : 0;
    if (g >= groups) throw new SecondaryError('DJW: invalid group');
    const d = decoders[g];
    const n = Math.min(sectorSize, outSize - o);
    for (let i = 0; i < n; i++) out[o++] = decodeSymbol(br, d, ALPHABET);
  }
  return out;
}

export const VCD_DJW_ID = 1;
export const VCD_LZMA_ID = 2;
export const VCD_FGK_ID = 16;
