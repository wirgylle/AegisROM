// Тесты патчера: `npm test`. / Patcher tests: `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyPatch,
  applyPatchSmart,
  applyPatchSmartTo,
  applyPatchTo,
  crc32Update,
  MemorySink,
  MemorySource,
  type PatchSink,
  type PatchSource,
  buildPatchedFileName,
  crc32,
  detectPatchFormat,
  PatchError,
  readPatchInfo,
} from './romPatcher.ts';
import { decodeDjw, decodeXzLzma2 } from './xdeltaSecondary.ts';

const enc = (s: string) => new TextEncoder().encode(s);

function concat(...parts: Array<Uint8Array | number[]>): Uint8Array {
  const arrs = parts.map((p) => (p instanceof Uint8Array ? p : Uint8Array.from(p)));
  const out = new Uint8Array(arrs.reduce((n, a) => n + a.length, 0));
  let o = 0;
  for (const a of arrs) {
    out.set(a, o);
    o += a.length;
  }
  return out;
}

function u32le(n: number): number[] {
  return [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];
}

// Varint byuu (UPS/BPS).
function byuu(n: number): number[] {
  const out: number[] = [];
  for (;;) {
    const x = n & 0x7f;
    n = Math.floor(n / 128);
    if (n === 0) {
      out.push(0x80 | x);
      break;
    }
    out.push(x);
    n--;
  }
  return out;
}

function withFooter(body: Uint8Array, src: Uint8Array, dst: Uint8Array): Uint8Array {
  const head = concat(body, u32le(crc32(src)), u32le(crc32(dst)));
  return concat(head, u32le(crc32(head)));
}

// Простой UPS-кодировщик (XOR-разница). / Simple UPS encoder (XOR diff).
function makeUps(src: Uint8Array, dst: Uint8Array): Uint8Array {
  const body: number[] = [...enc('UPS1'), ...byuu(src.length), ...byuu(dst.length)];
  let last = 0;
  let i = 0;
  const len = Math.max(src.length, dst.length);
  while (i < len) {
    const a = i < src.length ? src[i] : 0;
    const b = i < dst.length ? dst[i] : 0;
    if (a === b) {
      i++;
      continue;
    }
    body.push(...byuu(i - last));
    while (i < len) {
      const x = (i < src.length ? src[i] : 0) ^ (i < dst.length ? dst[i] : 0);
      if (x === 0) break;
      body.push(x);
      i++;
    }
    body.push(0);
    i++;
    last = i;
  }
  return withFooter(Uint8Array.from(body), src, dst);
}

const SRC = enc('HELLO WORLD, THIS IS A CLEAN ROM IMAGE!!');
const DST = enc('HELLO MIR!!, THIS IS A PATCHED ROM IMAGE!!+EXTRA');

test('detects formats', () => {
  assert.equal(detectPatchFormat(enc('PATCHxxxEOF')), 'ips');
  assert.equal(detectPatchFormat(enc('UPS1....')), 'ups');
  assert.equal(detectPatchFormat(enc('BPS1....')), 'bps');
  assert.equal(detectPatchFormat(Uint8Array.from([0xd6, 0xc3, 0xc4, 0, 0])), 'vcdiff');
  assert.equal(detectPatchFormat(enc('nothing')), null);
});

test('IPS: plain record, RLE record, growth and truncate', () => {
  const patch = concat(
    enc('PATCH'),
    [0x00, 0x00, 0x06, 0x00, 0x03],
    enc('MIR'),
    [0x00, 0x00, 0x28, 0x00, 0x00, 0x00, 0x04, 0x2b], // RLE: 4 × '+' at 0x28
    enc('EOF')
  );
  const out = applyPatch(SRC, patch);
  assert.equal(new TextDecoder().decode(out.data), 'HELLO MIRLD, THIS IS A CLEAN ROM IMAGE!!++++');
  const truncated = concat(enc('PATCH'), enc('EOF'), [0x00, 0x00, 0x05]);
  assert.equal(new TextDecoder().decode(applyPatch(SRC, truncated).data), 'HELLO');
});

test('IPS: missing EOF is reported as corrupt', () => {
  assert.throws(() => applyPatch(SRC, concat(enc('PATCH'), [0, 0, 1, 0, 1, 0x41])), PatchError);
});

test('UPS: round trip and checksum checks', () => {
  const patch = makeUps(SRC, DST);
  const info = readPatchInfo(patch);
  assert.equal(info?.format, 'ups');
  assert.equal(info?.sourceSize, SRC.length);
  assert.equal(info?.targetSize, DST.length);
  const out = applyPatch(SRC, patch);
  assert.deepEqual(out.data, DST);
  assert.equal(out.crc32, info?.targetCrc32);
  assert.throws(() => applyPatch(enc('WRONG ROM'), patch), (e: PatchError) => e.code === 'source_mismatch');
  assert.throws(() => applyPatch(DST, patch), (e: PatchError) => e.code === 'already_patched');
});

test('applyPatchSmart strips a 512-byte copier header on source mismatch', () => {
  const clean = new Uint8Array(1024).map((_, i) => i & 0xff);
  const target = new Uint8Array(clean);
  target[10] = 0xee;
  const headered = concat(new Uint8Array(512), clean);
  const res = applyPatchSmart(headered, makeUps(clean, target));
  assert.equal(res.strippedHeader, true);
  assert.deepEqual(res.data, target);
});

test('BPS: all four commands and metadata', () => {
  // Цель: «HELLO » (SourceRead 6) + «MIR!!» (TargetRead) + «, THIS IS A » (SourceCopy с 11)
  // + «PATCHED» (TargetRead) + « ROM IMAGE!!» (SourceCopy с 28) + «+EXTRA» (TargetRead).
  const meta = enc('<patch author="test"/>');
  const cmd = (c: number, len: number) => byuu(((len - 1) << 2) | c);
  const rel = (delta: number) => byuu((Math.abs(delta) << 1) | (delta < 0 ? 1 : 0));
  const body = concat(
    enc('BPS1'),
    byuu(SRC.length),
    byuu(DST.length),
    byuu(meta.length),
    meta,
    cmd(0, 6),
    cmd(1, 5),
    enc('MIR!!'),
    cmd(2, 12),
    rel(11),
    cmd(1, 7),
    enc('PATCHED'),
    cmd(2, 12),
    rel(28 - 23),
    cmd(1, 6),
    enc('+EXTRA')
  );
  const patch = withFooter(body, SRC, DST);
  const info = readPatchInfo(patch);
  assert.equal(info?.metadata, '<patch author="test"/>');
  const out = applyPatch(SRC, patch);
  assert.equal(new TextDecoder().decode(out.data), new TextDecoder().decode(DST));
});

test('BPS: TargetCopy may overlap (run of bytes)', () => {
  const src = enc('A');
  const dst = enc('ABABABAB');
  const cmd = (c: number, len: number) => byuu(((len - 1) << 2) | c);
  const body = concat(
    enc('BPS1'),
    byuu(src.length),
    byuu(dst.length),
    byuu(0),
    cmd(1, 2),
    enc('AB'),
    cmd(3, 6),
    byuu(0)
  );
  assert.deepEqual(applyPatch(src, withFooter(body, src, dst)).data, dst);
});

// VCDIFF integer (base-128, big-endian).
function vcInt(n: number): number[] {
  const out = [n & 0x7f];
  n = Math.floor(n / 128);
  while (n > 0) {
    out.unshift(0x80 | (n & 0x7f));
    n = Math.floor(n / 128);
  }
  return out;
}

test('VCDIFF: ADD, COPY from source, COPY from target (overlap) and RUN', () => {
  const src = enc('0123456789');
  // Цель: «0123» (COPY src 0..4) + «xy» (ADD) + «xyxy» (COPY HERE-2, перекрытие) + «zzz» (RUN).
  const target = enc('0123xyxyxyzzz');
  const data = [...enc('xy'), 0x7a];
  // Коды стандартной таблицы: COPY size 4 mode 0 = 20; ADD size 2 = 3; COPY size 4 mode 1 (HERE) = 36; RUN = 0.
  const inst = [20, 3, 36, 0, ...vcInt(3)];
  const addr = [...vcInt(0), ...vcInt(2)];
  const winBody = [
    ...vcInt(target.length),
    0x00,
    ...vcInt(data.length),
    ...vcInt(inst.length),
    ...vcInt(addr.length),
  ];
  const patch = Uint8Array.from([
    0xd6, 0xc3, 0xc4, 0x00, 0x00,
    0x01, // VCD_SOURCE
    ...vcInt(src.length),
    ...vcInt(0),
    ...vcInt(winBody.length + data.length + inst.length + addr.length),
    ...winBody,
    ...data,
    ...inst,
    ...addr,
  ]);
  const out = applyPatch(src, patch);
  assert.equal(new TextDecoder().decode(out.data), '0123xyxyxyzzz');
});

const hex = (h: string) => Uint8Array.from(h.match(/../g)!.map((x) => parseInt(x, 16)));

// Окно VCDIFF целиком (заголовок + секции). / A whole VCDIFF window (header + sections).
function vcWindow(
  winInd: number,
  seg: [number, number] | null,
  targetLen: number,
  deltaInd: number,
  data: Uint8Array | number[],
  inst: Uint8Array | number[],
  addr: Uint8Array | number[]
): number[] {
  const body = [
    ...vcInt(targetLen),
    deltaInd,
    ...vcInt(data.length),
    ...vcInt(inst.length),
    ...vcInt(addr.length),
  ];
  return [
    winInd,
    ...(seg ? [...vcInt(seg[0]), ...vcInt(seg[1])] : []),
    ...vcInt(body.length + data.length + inst.length + addr.length),
    ...body,
    ...data,
    ...inst,
    ...addr,
  ];
}

// Сжатая секция xdelta3: varint размера после распаковки + сжатые байты.
// An xdelta3 compressed section: varint of the decompressed size + compressed bytes.
const secSection = (size: number, body: Uint8Array) => concat(vcInt(size), body);

test('VCDIFF: LZMA secondary compression, one stream per section kind across windows', () => {
  // xz-потоки (CHECK_NONE, LZMA2), как у xdelta3 -S lzma. Данные обоих окон: «xyz» + «hello»,
  // инструкции: окно 1 как в тесте выше, окно 2 — ADD 5 (код 6).
  // xz streams (CHECK_NONE, LZMA2) as xdelta3 -S lzma makes them.
  const dataXz = hex(
    'fd377a585a000000ff12d9410200210116000000742fe5a301000778797a68656c6c6f000001180840a546ac06729e7a010000000000595a'
  );
  const instXz = hex(
    'fd377a585a000000ff12d9410200210116000000742fe5a301000514032400030600000000011606c9a57dd506729e7a010000000000595a'
  );
  // Поток режется между окнами в произвольном месте: декодер склеивает куски одного вида.
  // The stream is split between windows anywhere: the decoder joins pieces of one kind.
  const src = enc('0123456789');
  const w1 = vcWindow(
    0x01,
    [src.length, 0],
    13,
    0x03,
    secSection(3, dataXz.subarray(0, 30)),
    secSection(5, instXz.subarray(0, 25)),
    [...vcInt(0), ...vcInt(2)]
  );
  const w2 = vcWindow(0x00, null, 5, 0x03, secSection(5, dataXz.subarray(30)), secSection(1, instXz.subarray(25)), []);
  const patch = Uint8Array.from([0xd6, 0xc3, 0xc4, 0x00, 0x01, 0x02, ...w1, ...w2]);
  const out = applyPatch(src, patch);
  assert.equal(new TextDecoder().decode(out.data), '0123xyxyxyzzzhello');
});

test('decodeXzLzma2 decodes real LZMA chunks (matches, reps, literals)', () => {
  const txt = concat(
    ...Array.from({ length: 6 }, () => enc('AegisROM xdelta LZMA test. ')),
    ...Array.from({ length: 3 }, () => enc('ABCABCABCABCABCD0123456789'))
  );
  const xz = hex(
    'fd377a585a000000ff12d9410200210116000000742fe5a3e000ef00355d00209948e6b99403e0dd2a4b980c09dcb97ca784bdc288f082cb6ee9fd5de6481af194684d6e8d60405aac6960e5a4ad9b549f14c90000000000000149f00100000041b88a1ba8000afc020000000000595a'
  );
  assert.deepEqual(decodeXzLzma2(xz, txt.length), txt);
  // Незакрытый поток (без конца блока и индекса, как пишет xdelta3) тоже читается.
  // An unfinished stream (no block end or index, as xdelta3 writes it) decodes too.
  assert.deepEqual(decodeXzLzma2(xz.subarray(0, 84), txt.length), txt);
  assert.throws(() => decodeXzLzma2(xz.subarray(0, 40), txt.length));
});

// --- DJW: маленький кодировщик по образцу xdelta3-djw.h / a tiny encoder after xdelta3-djw.h ---

class BitWriter {
  bytes: number[] = [];
  cur = 0;
  mask = 1;
  bit(b: number) {
    if (b) this.cur |= this.mask;
    if (this.mask === 0x80) {
      this.bytes.push(this.cur);
      this.cur = 0;
      this.mask = 1;
    } else this.mask <<= 1;
  }
  bits(v: number, n: number) {
    for (let i = n - 1; i >= 0; i--) this.bit((v >>> i) & 1);
  }
  done(): Uint8Array {
    if (this.mask !== 1) this.bytes.push(this.cur);
    return Uint8Array.from(this.bytes);
  }
}

// Длины по Хаффману (без ограничения, данные маленькие). / Huffman lengths (no limit; the data is small).
function huffLengths(freq: number[]): number[] {
  const len = freq.map(() => 0);
  const used = freq.map((f, i) => ({ f, syms: [i] })).filter((n) => n.f > 0);
  if (used.length === 1) {
    len[used[0].syms[0]] = 1;
    return len;
  }
  let nodes = used;
  while (nodes.length > 1) {
    nodes.sort((a, b) => a.f - b.f);
    const [a, b] = nodes.splice(0, 2);
    for (const s of [...a.syms, ...b.syms]) len[s]++;
    nodes.push({ f: a.f + b.f, syms: [...a.syms, ...b.syms] });
  }
  return len;
}

function canonical(len: number[]): number[] {
  const codes = len.map(() => 0);
  let code = 0;
  const max = Math.max(...len);
  for (let l = 1; l <= max; l++) {
    for (let s = 0; s < len.length; s++) if (len[s] === l) codes[s] = code++;
    code <<= 1;
  }
  return codes;
}

// MTF + RUN_0/RUN_1 (djw_compute_mtf_1_2). / MTF plus RUN_0/RUN_1.
function mtf12(values: number[], mtfInit: number[]): number[] {
  const mtf = [...mtfInit];
  const out: number[] = [];
  let run = 0;
  const flush = () => {
    while (run >= 1) {
      run -= 1;
      out.push(run & 1);
      run >>= 1;
    }
    run = 0;
  };
  for (const v of values) {
    const i = mtf.indexOf(v);
    if (i === 0) {
      run++;
      continue;
    }
    flush();
    out.push(i + 1);
    mtf.splice(i, 1);
    mtf.unshift(v);
  }
  flush();
  return out;
}

const CL_MTF = [0, 4, 5, 6, 7, 8, 9, 10, 3, 11, 2, 12, 13, 1, 14, 15, 16, 17, 18, 19, 20];

function encodeDjw(data: Uint8Array, groupLens: number[][], sectorCode = 0, selectors: number[] = []): Uint8Array {
  const w = new BitWriter();
  const groups = groupLens.length;
  w.bits(groups - 1, 3);
  if (groups > 1) w.bits(sectorCode, 5);
  // Длины кодов всех групп одним списком; у групп 2+ нули там, где нуль у группы 1, не кодируются.
  // Code lengths of all groups in one list; for groups 2+ zeros where group 1 is zero are implied.
  const clValues: number[] = [];
  for (let g = 0; g < groups; g++) {
    for (let s = 0; s < 256; s++) {
      if (g > 0 && groupLens[0][s] === 0) continue;
      clValues.push(groupLens[g][s]);
    }
  }
  const clSyms = mtf12(clValues, CL_MTF);
  const clFreq = new Array(22).fill(0);
  for (const s of clSyms) clFreq[s]++;
  const clLen = huffLengths(clFreq);
  const clCodes = canonical(clLen);
  const numCodes = Math.max(7, clLen.reduce((m, l, i) => (l ? i + 1 : m), 0));
  w.bits(numCodes - 7, 4);
  for (let i = 0; i < numCodes; i++) w.bits(clLen[i], 4);
  for (const s of clSyms) w.bits(clCodes[s], clLen[s]);
  if (groups > 1) {
    const selSyms = mtf12(selectors, Array.from({ length: groups + 1 }, (_, i) => i));
    const selFreq = new Array(groups + 1).fill(0);
    for (const s of selSyms) selFreq[s]++;
    const selLen = huffLengths(selFreq);
    const selCodes = canonical(selLen);
    for (let g = 0; g < groups + 1; g++) w.bits(selLen[g], 3);
    for (const s of selSyms) w.bits(selCodes[s], selLen[s]);
  }
  const codes = groupLens.map(canonical);
  const sectorSize = groups > 1 ? (sectorCode + 1) * 5 : data.length;
  for (let i = 0; i < data.length; i++) {
    const g = groups > 1 ? selectors[Math.floor(i / sectorSize)] : 0;
    w.bits(codes[g][data[i]], groupLens[g][data[i]]);
  }
  return w.done();
}

function freqOf(data: Uint8Array): number[] {
  const f = new Array(256).fill(0);
  for (const b of data) f[b]++;
  return f;
}

test('decodeDjw: one group (static Huffman, MTF and run codes)', () => {
  const data = enc('aaaaaaaabbbbccd aegisrom aegisrom aegisrom!!');
  const packed = encodeDjw(data, [huffLengths(freqOf(data))]);
  assert.ok(packed.length < data.length);
  assert.deepEqual(decodeDjw(packed, data.length), data);
});

test('decodeDjw: two groups with sector selectors', () => {
  const data = concat(enc('aaaaaaaaaaaaaaaaaaaa'), enc('zzzzzzzzzzaazzzzzzzz'), enc('aaaaaaaaaaaaaaaaaaaz'));
  const f = freqOf(data);
  const g0 = huffLengths(f); // общая таблица / shared table
  // Вторая таблица: те же символы, другие длины (z короче). / Second table: same symbols, z gets the short code.
  const g1 = g0.map((l, s) => (l === 0 ? 0 : s === 'z'.charCodeAt(0) ? 1 : s === 'a'.charCodeAt(0) ? 2 : 2));
  // Сектор 10 байт (код 1 → (1+1)*5). / Sector of 10 bytes.
  const selectors = [0, 0, 1, 0, 0, 0];
  const packed = encodeDjw(data, [g0, g1], 1, selectors);
  assert.deepEqual(decodeDjw(packed, data.length), data);
});

test('VCDIFF: DJW secondary compression per section', () => {
  const src = enc('0123456789');
  const data = enc('xyz');
  const inst = Uint8Array.from([20, 3, 36, 0, 3]);
  const dj = (b: Uint8Array) => secSection(b.length, encodeDjw(b, [huffLengths(freqOf(b))]));
  const w = vcWindow(0x01, [src.length, 0], 13, 0x03, dj(data), dj(inst), [...vcInt(0), ...vcInt(2)]);
  const patch = Uint8Array.from([0xd6, 0xc3, 0xc4, 0x00, 0x01, 0x01, ...w]);
  assert.equal(new TextDecoder().decode(applyPatch(src, patch).data), '0123xyxyxyzzz');
});

test('VCDIFF: FGK and unknown compressors are reported as unsupported', () => {
  for (const id of [16, 9]) {
    const patch = Uint8Array.from([0xd6, 0xc3, 0xc4, 0x00, 0x01, id]);
    assert.throws(() => applyPatch(SRC, patch), (e: PatchError) => e.code === 'unsupported');
  }
});

// --- Большие ромы / Large ROMs ---

// Виртуальный ром: байт = (pos * 7) & 0xff, ничего не хранит. Запоминает самое большое чтение.
// Virtual ROM: byte = (pos * 7) & 0xff, stores nothing. Remembers the largest single read.
class VirtualSource implements PatchSource {
  size: number;
  maxRead = 0;
  constructor(size: number) {
    this.size = size;
  }
  read(pos: number, len: number): Uint8Array {
    this.maxRead = Math.max(this.maxRead, len);
    const b = new Uint8Array(len);
    for (let i = 0; i < len; i++) b[i] = ((pos + i) * 7) & 0xff;
    return b;
  }
}

// Вывод без хранения: только CRC и размер. / Output that keeps nothing but CRC and size.
class CountingSink implements PatchSink {
  size = 0;
  crc = 0xffffffff;
  write(bytes: Uint8Array) {
    this.crc = crc32Update(this.crc, bytes);
    this.size += bytes.length;
  }
  read(): Uint8Array {
    throw new Error('not kept');
  }
  reset() {
    this.size = 0;
    this.crc = 0xffffffff;
  }
}

test('IPS on a 600 MB ROM streams in pieces (no 512 MB limit, no whole-file reads)', () => {
  const size = 600 * 1024 * 1024;
  const src = new VirtualSource(size);
  const patch = Uint8Array.from([...enc('PATCH'), 0x00, 0x00, 0x10, 0x00, 0x02, 0xaa, 0xbb, ...enc('EOF')]);
  const sink = new CountingSink();
  const res = applyPatchTo(src, patch, sink);
  assert.equal(res.size, size);
  assert.ok(src.maxRead <= 4 * 1024 * 1024, `max read ${src.maxRead}`);
  // Ожидаемый CRC: тот же поток с правкой по смещению 0x10. / Expected CRC: same stream with the edit at 0x10.
  let c = 0xffffffff;
  for (let pos = 0; pos < size; pos += 4 * 1024 * 1024) {
    const b = src.read(pos, Math.min(4 * 1024 * 1024, size - pos));
    if (pos === 0) {
      b[0x10] = 0xaa;
      b[0x11] = 0xbb;
    }
    c = crc32Update(c, b);
  }
  assert.equal(res.crc32, ((c ^ 0xffffffff) >>> 0).toString(16).padStart(8, '0'));
});

test('BPS SourceRead/TargetCopy and UPS work through PatchSource/PatchSink', () => {
  const src = enc('ABCDEFGHIJKLMNOPQRSTUVWXYZ');
  const dst = enc('ABCDEFGH--------IJKLMNOPQRSTUVWXYZ');
  const ups = makeUps(src, dst);
  const sink = new MemorySink();
  const res = applyPatchTo(new MemorySource(src), ups, sink);
  assert.deepEqual(sink.data(), dst);
  assert.equal(res.crc32, ((crc32(dst) >>> 0).toString(16).padStart(8, '0')));
});

test('applyPatchSmartTo resets the sink before retrying without a copier header', () => {
  const header = new Uint8Array(512).fill(0xee);
  const dst = enc('HELLO MIR!!, THIS IS A PATCHED ROM IMAGE!!+EXTRA');
  const ups = makeUps(SRC, dst);
  const padded = new Uint8Array(1024 - SRC.length).fill(0);
  const clean = concat(SRC, padded);
  const ups2 = makeUps(clean, concat(dst, new Uint8Array(1024 - dst.length)));
  const sink = new MemorySink();
  const res = applyPatchSmartTo(new MemorySource(concat(header, clean)), ups2, sink);
  assert.equal(res.strippedHeader, true);
  assert.equal(sink.size, 1024);
  void ups;
});

test('buildPatchedFileName appends the tag', () => {
  assert.equal(buildPatchedFileName('Game (USA).sfc', 'T+Rus'), 'Game (USA) [T+Rus].sfc');
  assert.equal(buildPatchedFileName('Game.nes', '[Hack]'), 'Game [Hack].nes');
});
