// Тесты слияния рома сеанса с записью базы: `npm test`. / Session ROM + database record merge tests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeSessionRowIntoDbRow } from './sessionRowMerge.ts';

const base = {
  id: 'r1',
  title: 'Super Metroid',
  oldFile: 'Super Metroid (USA).sfc',
  cleanFile: 'Super Metroid (USA).sfc',
  console: 'SNES',
  consoleShort: 'SNES',
  bitness: '16-bit',
  region: 'USA',
  genre: 'Action',
  year: 1994,
  size: '3 MB',
  crc32: 'AAAA',
  serial: '',
  emulator: '',
  status: '',
} as any;

test('mergeSessionRowIntoDbRow keeps the ROM folder handle and media for the build', () => {
  const handle = { kind: 'directory', name: 'snes' };
  const db = { ...base, genre: 'Metroidvania', media: { boxart: '/api/native/fs/media?path=D%3A%2Fb.png' } };
  const session = { ...base, fileObj: {}, parentHandle: handle, media: { snap: 'blob:s' } };
  const out = mergeSessionRowIntoDbRow(session, db);
  assert.equal(out.parentHandle, handle, 'without it the build found media for 2 of 13363 games');
  assert.deepEqual(out.media, { boxart: '/api/native/fs/media?path=D%3A%2Fb.png', snap: 'blob:s' });
  assert.equal(out.genre, 'Metroidvania', 'database fields are kept');
  assert.equal(out.fileObj, session.fileObj);
});

test('mergeSessionRowIntoDbRow keeps database media when the session has none', () => {
  const db = { ...base, media: { boxart: 'x' } };
  assert.deepEqual(mergeSessionRowIntoDbRow({ ...base }, db).media, { boxart: 'x' });
});
