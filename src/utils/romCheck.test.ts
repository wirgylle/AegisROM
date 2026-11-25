// Тесты проверки ромов: `npm test`. / ROM check tests: `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, truncateSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkRom, chdIssues, inspectChd, parseCue, type NamedBlob } from './romCheck.ts';

const named = (bytes: Uint8Array, name: string): NamedBlob => {
  const b = new Blob([bytes]) as NamedBlob;
  Object.defineProperty(b, 'name', { value: name });
  return b;
};

const rawSector = () => {
  const s = new Uint8Array(2352);
  s[0] = 0;
  s.fill(0xff, 1, 11);
  s[15] = 2;
  return s;
};

test('parseCue reads files and first track modes', () => {
  const cue = 'FILE "a (Track 1).bin" BINARY\r\n  TRACK 01 MODE2/2352\r\nFILE b.bin BINARY\r\n  TRACK 02 AUDIO\r\n';
  assert.deepEqual(parseCue(cue), [
    { file: 'a (Track 1).bin', mode: 'MODE2/2352' },
    { file: 'b.bin', mode: 'AUDIO' },
  ]);
});

test('cue with a missing track is an error, a misaligned track a warning', async () => {
  const cue = named(new TextEncoder().encode('FILE "g.bin" BINARY\r\n  TRACK 01 MODE2/2352\r\nFILE "g2.bin" BINARY\r\n  TRACK 02 AUDIO\r\n'), 'g.cue');
  const bin = named(new Uint8Array([...rawSector(), 1, 2, 3]), 'g.bin');
  const r = await checkRom({ id: '1', title: 'G', console: 'psx', relativePath: 'psx/g.cue', file: cue, companions: [bin] });
  assert.equal(r.level, 'error');
  assert.deepEqual(r.issues.map((i) => i.code).sort(), ['cueMissingFile', 'sectorMisaligned']);
});

test('missing record and empty file', async () => {
  assert.equal((await checkRom({ id: '1', title: 'G', console: 'gba', relativePath: 'x', missing: true })).issues[0].code, 'missing');
  const r = await checkRom({ id: '1', title: 'G', console: 'gba', relativePath: 'x', file: named(new Uint8Array(0), 'x.gba') });
  assert.equal(r.issues[0].code, 'empty');
});

test('zip without end record is broken', async () => {
  const r = await checkRom({ id: '1', title: 'G', console: 'nes', relativePath: 'x', file: named(new Uint8Array([0x50, 0x4b, 3, 4, 0, 0, 0, 0]), 'x.zip') });
  assert.equal(r.issues[0].code, 'zipBroken');
});

test('gb truncated against header ROM size', async () => {
  const rom = new Uint8Array(0x8000);
  rom[0x148] = 2; // 128 KB
  let x = 0;
  for (let i = 0x134; i <= 0x14c; i++) x = (x - rom[i] - 1) & 0xff;
  rom[0x14d] = x;
  const r = await checkRom({ id: '1', title: 'G', console: 'gb', relativePath: 'x', file: named(rom, 'x.gb') });
  assert.deepEqual(r.issues.map((i) => i.code), ['romTruncated']);
});

test('multi-disc: gap in numbering and a missing m3u target', async () => {
  const d1 = named(new Uint8Array(4096), 'G (Disc 1).iso');
  const r = await checkRom({
    id: 'm',
    title: 'G',
    console: 'saturn',
    relativePath: 'g.m3u',
    discs: [
      { id: 'a', title: 'G', console: 'saturn', relativePath: 'a', file: d1, discNumber: 1 },
      { id: 'b', title: 'G', console: 'saturn', relativePath: 'b', missing: true, discNumber: 3 },
    ],
  });
  assert.ok(r.issues.some((i) => i.code === 'discGap'));
  assert.ok(r.issues.some((i) => i.code === 'missing'));
});

// С настоящим chdman: ISO 2048 → CHD MODE1 даёт ошибку для PS1, обрезанный CHD тоже.
// With a real chdman: ISO 2048 → MODE1 CHD is an error for PS1, so is a truncated CHD.
test('CHD inspection with chdman', (t) => {
  try {
    execFileSync('chdman', ['--help'], { stdio: 'ignore' });
  } catch (e: any) {
    if (e?.code === 'ENOENT') return t.skip('chdman not installed');
  }
  const dir = mkdtempSync(join(tmpdir(), 'aegis-rc-'));
  const iso = join(dir, 'g.iso');
  writeFileSync(iso, new Uint8Array(2048 * 300).map((_, i) => (i * 7) & 0xff));
  execFileSync('chdman', ['createcd', '-f', '-c', 'cdlz,cdzl,cdfl', '-i', iso, '-o', join(dir, 'g.chd')], { stdio: 'ignore' });
  return (async () => {
    const blob = named(new Uint8Array(readFileSync(join(dir, 'g.chd'))), 'g.chd');
    const info = await inspectChd(blob);
    assert.ok(info);
    assert.equal(info!.kind, 'cd');
    assert.equal(info!.tracks[0].type, 'MODE1');
    assert.equal(info!.truncated, false);
    assert.deepEqual(chdIssues(info!, 'psx').map((i) => i.code), ['chdCookedTrack']);
    assert.deepEqual(chdIssues(info!, 'saturn'), []);
    const size = readFileSync(join(dir, 'g.chd')).length;
    truncateSync(join(dir, 'g.chd'), size - 50);
    const cut = await inspectChd(named(new Uint8Array(readFileSync(join(dir, 'g.chd'))), 'g.chd'));
    assert.equal(cut!.truncated, true);
  })();
});
