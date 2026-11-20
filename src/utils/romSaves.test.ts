import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nativeRomQuery, saveBaseName, sameBytes } from './romSaves.ts';

test('saveBaseName follows RetroArch naming', () => {
  assert.equal(saveBaseName('Chrono Trigger (USA).sfc'), 'Chrono Trigger (USA)');
  assert.equal(saveBaseName('psx/Final Fantasy VIII (Disc 1).cue'), 'Final Fantasy VIII (Disc 1)');
  assert.equal(saveBaseName('C:\\Roms\\gba\\Game.v1.1.gba'), 'Game.v1.1');
  assert.equal(saveBaseName(''), 'game');
});

test('sameBytes', () => {
  assert.equal(sameBytes(undefined, new Uint8Array([1])), false);
  assert.equal(sameBytes(new Uint8Array([1, 2]), new Uint8Array([1, 2])), true);
  assert.equal(sameBytes(new Uint8Array([1, 2]), new Uint8Array([1, 3])), false);
});

test('nativeRomQuery keeps every field', () => {
  const q = new URLSearchParams(
    nativeRomQuery({ romFileName: 'A & B.nes', relativePath: 'nes/A & B.nes', consoleCode: 'NES', libraryPath: 'D:/Roms', sdCardPath: '' })
  );
  assert.equal(q.get('romFileName'), 'A & B.nes');
  assert.equal(q.get('libraryPath'), 'D:/Roms');
  assert.equal(q.get('sdCardPath'), '');
});
