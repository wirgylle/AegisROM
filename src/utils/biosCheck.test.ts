import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBiosReport, biosFilesForConsoles, type ScannedBiosFile } from './biosCheck.ts';
import { normalizeBiosConsoleKey } from '../data/bios/biosGuide.ts';

const f = (relPath: string, md5: string, size = 524288): ScannedBiosFile => ({ relPath, md5, size, crc32: '00000000' });
const sys = (r: ReturnType<typeof buildBiosReport>, id: string) => r.systems.find((s) => s.system.id === id)!;

// MD5 из libretro System.dat.
const SCPH5501 = '490f666e1afb15b7362b406ed1cea246';
const SCPH5502 = '32736f17079d0b2b7024407c39bd3050';
const DC_BOOT = 'e10c53c2f8b90bab96ead2d368858623';
const PS2_70012 = '21038400dc633070a78ad53090c53017'; // ps2-0230a-20080220
const EXEC = '62e761035cb657903761800f4437b8af';
const GROM = '0cd5946c6473e42e8e4c2137785e427f';
const GBA = 'a860e8c0b6d573d191e4ec7db1b1e4f6';

test('PS1: correct file is ok, empty folder is a warning (not an error)', () => {
  assert.equal(sys(buildBiosReport([f('scph5501.bin', SCPH5501)]), 'psx').status, 'ok');
  assert.equal(sys(buildBiosReport([]), 'psx').status, 'optionalMissing');
});

test('PS1: right dump under a wrong name is fixable', () => {
  const r = sys(buildBiosReport([f('SCPH-5501 BIOS.bin', SCPH5501)]), 'psx');
  assert.equal(r.status, 'fixable');
  const hit = r.groups[0].files.find((x) => x.status === 'wrongName')!;
  assert.equal(hit.expectedPath, 'scph5501.bin');
});

test('PS1: name matches but it is another known BIOS', () => {
  const r = sys(buildBiosReport([f('scph5501.bin', SCPH5502)]), 'psx');
  const file = r.groups[0].files.find((x) => x.expectedPath === 'scph5501.bin')!;
  assert.equal(file.status, 'otherBios');
  assert.equal(file.actually?.path, 'scph5502.bin');
  // scph5502 правильный дамп под чужим именем → группа исправима
  assert.equal(r.status, 'fixable');
});

test('PS1: unknown hash under the right name is a warning', () => {
  const r = sys(buildBiosReport([f('scph5501.bin', 'ffffffffffffffffffffffffffffffff')]), 'psx');
  assert.equal(r.status, 'warn');
});

test('Dreamcast: file in root instead of dc/ is wrongPlace', () => {
  const r = sys(buildBiosReport([f('dc_boot.bin', DC_BOOT, 2097152)]), 'dreamcast');
  assert.equal(r.groups[0].files[0].status, 'wrongPlace');
  assert.equal(r.status, 'fixable');
  assert.equal(sys(buildBiosReport([f('dc/dc_boot.bin', DC_BOOT)]), 'dreamcast').status, 'ok');
});

test('PS2: any file name is accepted by hash', () => {
  assert.equal(sys(buildBiosReport([f('SCPH-70012.bin', PS2_70012, 4194304)]), 'ps2').status, 'ok');
  assert.equal(sys(buildBiosReport([]), 'ps2').status, 'missing');
});

test('Intellivision: mode all needs both files', () => {
  assert.equal(sys(buildBiosReport([f('exec.bin', EXEC)]), 'intellivision').status, 'missing');
  assert.equal(sys(buildBiosReport([f('exec.bin', EXEC), f('grom.bin', GROM)]), 'intellivision').status, 'ok');
});

test('no-BIOS consoles and info-only entries', () => {
  const r = buildBiosReport([]);
  assert.equal(sys(r, 'nobios').status, 'notNeeded');
  assert.equal(sys(r, 'ps3').status, 'info');
});

test('unknown and recognized extra files are reported', () => {
  const r = buildBiosReport([f('readme.txt', '00000000000000000000000000000000'), f('MSX.ROM', 'aa95aea2563cd5ec0a0919b44cc17d47')]);
  assert.equal(r.unknown.length, 1);
  assert.equal(r.recognizedExtra.length, 1);
  assert.equal(r.recognizedExtra[0].known.system, 'Microsoft - MSX');
});

test('build copy list: only verified files, renamed to the expected path', () => {
  const r = buildBiosReport([
    f('SCPH-5501 BIOS.bin', SCPH5501),
    f('dc_boot.bin', DC_BOOT),
    f('gba_bios.bin', GBA, 16384),
    f('scph5500.bin', 'ffffffffffffffffffffffffffffffff'),
  ]);
  const list = biosFilesForConsoles(r, ['psx', 'dreamcast']);
  assert.deepEqual(
    list.map((x) => `${x.from}->${x.to}`).sort(),
    ['SCPH-5501 BIOS.bin->scph5501.bin', 'dc_boot.bin->dc/dc_boot.bin'].sort()
  );
});

test('console key aliases', () => {
  assert.equal(normalizeBiosConsoleKey('PS1'), 'psx');
  assert.equal(normalizeBiosConsoleKey('SEGACD'), 'segacd');
  assert.equal(normalizeBiosConsoleKey('Mega-CD'), 'segacd');
  assert.equal(normalizeBiosConsoleKey('DC'), 'dreamcast');
});
