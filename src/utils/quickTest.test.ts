import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveQuickTestCore, pickBiosForRegion, pickCueDataTrack, emulatorJsLanguage } from './quickTest.ts';

test('ядро по коду консоли и по расширению', () => {
  assert.equal(resolveQuickTestCore('NES')?.core, 'fceumm');
  assert.equal(resolveQuickTestCore('SFC')?.core, 'snes9x');
  assert.equal(resolveQuickTestCore('MD')?.core, 'genesis_plus_gx');
  assert.equal(resolveQuickTestCore('GENESIS')?.biosRequired, undefined);
  assert.equal(resolveQuickTestCore('PSX')?.biosKey, 'psx');
  assert.equal(resolveQuickTestCore('PCE')?.core, 'mednafen_pce');
  assert.equal(resolveQuickTestCore('unknown', 'Game.gba')?.core, 'mgba');
  assert.equal(resolveQuickTestCore('N64', 'Game.z64'), null);
});

test('CD-приставки требуют BIOS', () => {
  const scd = resolveQuickTestCore('SEGACD');
  assert.equal(scd?.core, 'genesis_plus_gx');
  assert.equal(scd?.biosRequired, true);
  assert.equal(scd?.biosKey, 'segacd');
  assert.equal(resolveQuickTestCore('Mega-CD')?.biosKey, 'segacd');
  const pcecd = resolveQuickTestCore('PCENGINECD');
  assert.equal(pcecd?.core, 'mednafen_pce');
  assert.equal(pcecd?.biosRequired, true);
  assert.deepEqual(pcecd?.exts.includes('cue'), false);
});

test('BIOS Sega CD по региону игры', () => {
  const list = [{ path: 'bios_CD_U.bin' }, { path: 'bios_CD_E.bin' }, { path: 'bios_CD_J.bin' }];
  assert.equal(pickBiosForRegion(list, 'USA')?.path, 'bios_CD_U.bin');
  assert.equal(pickBiosForRegion(list, 'Europe')?.path, 'bios_CD_E.bin');
  assert.equal(pickBiosForRegion(list, 'RUS')?.path, 'bios_CD_E.bin');
  assert.equal(pickBiosForRegion(list, 'Japan')?.path, 'bios_CD_J.bin');
  assert.equal(pickBiosForRegion(list, '')?.path, 'bios_CD_U.bin');
  assert.equal(pickBiosForRegion([{ path: 'syscard3.pce' }], 'USA')?.path, 'syscard3.pce');
  assert.equal(pickBiosForRegion([], 'USA'), null);
});

test('первый трек из CUE', () => {
  const t1 = new File(['a'], 'Game (Track 1).bin');
  const t2 = new File(['b'], 'Game (Track 2).bin');
  const cue = 'FILE "Game (Track 1).bin" BINARY\n  TRACK 01 MODE1/2352\nFILE "Game (Track 2).bin" BINARY\n';
  assert.equal(pickCueDataTrack(cue, [t2, t1])?.name, 'Game (Track 1).bin');
  assert.equal(pickCueDataTrack('', [t2])?.name, 'Game (Track 2).bin');
  assert.equal(pickCueDataTrack(cue, []), null);
});

test('язык плеера', () => {
  assert.equal(emulatorJsLanguage('ru'), 'ru-RU');
  assert.equal(emulatorJsLanguage('sr'), '');
});
