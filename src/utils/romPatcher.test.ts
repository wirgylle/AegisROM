// Тесты патчера: `npm test`. / Patcher tests: `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyPatch,
  applyPatchSmart,
  buildPatchedFileName,
  crc32,
  detectPatchFormat,
  PatchError,
  readPatchInfo,
} from './romPatcher.ts';

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

test('VCDIFF: secondary compression is reported as unsupported', () => {
  const patch = Uint8Array.from([0xd6, 0xc3, 0xc4, 0x00, 0x01, 0x02]);
  assert.throws(() => applyPatch(SRC, patch), (e: PatchError) => e.code === 'unsupported');
});

test('buildPatchedFileName appends the tag', () => {
  assert.equal(buildPatchedFileName('Game (USA).sfc', 'T+Rus'), 'Game (USA) [T+Rus].sfc');
  assert.equal(buildPatchedFileName('Game.nes', '[Hack]'), 'Game [Hack].nes');
});
