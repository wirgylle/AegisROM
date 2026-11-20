// Тесты ручных правок редактора: `npm test`.
// Editor manual edit tests: `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  __resetManualEditsForTests,
  applyManualEditToRow,
  applyManualEdits,
  getGamelistOriginal,
  getManualEdit,
  importManualEdits,
  manualEditKey,
  rememberGamelistOriginal,
  renderTitleTemplate,
  replaceInTitle,
  undoManualEdits,
} from './manualEdits.ts';

const row = (extra: Record<string, unknown> = {}) => ({
  id: 'psx/ff8.chd_100_ABCDEF12',
  title: 'FFVIII',
  consoleShort: 'PSX',
  crc32: 'abcdef12',
  region: 'USA',
  genre: 'RPG',
  year: 1999,
  boxArtUrl: 'https://example.org/ff8.png',
  ...extra,
});

test('manualEditKey: CRC переживает переименование, без CRC — id', () => {
  assert.equal(manualEditKey(row()), 'PSX::ABCDEF12');
  assert.equal(manualEditKey(row({ id: 'other/path.chd_1_ABCDEF12' })), 'PSX::ABCDEF12');
  assert.equal(manualEditKey(row({ crc32: '00000000' })), 'id::psx/ff8.chd_100_ABCDEF12');
  assert.equal(manualEditKey(row({ crc32: '' })), 'id::psx/ff8.chd_100_ABCDEF12');
});

test('applyManualEdits: правка, отмена, без правки строка та же', () => {
  __resetManualEditsForTests();
  const r = row();
  assert.equal(applyManualEditToRow(r), r);
  const key = manualEditKey(r);
  assert.equal(applyManualEdits([{ key, patch: { title: '  Final Fantasy VIII ', year: '1999-02-11', image: '' } }], 'edit'), 1);
  const e = applyManualEditToRow(r);
  assert.equal(e.title, 'Final Fantasy VIII');
  assert.equal(e.year, 1999);
  assert.equal(e.boxArtUrl, undefined);
  assert.deepEqual(e.manualFields, ['title', 'year', 'image']);
  // Повторный вызов отдаёт тот же объект. / Same object on repeat.
  assert.equal(applyManualEditToRow(r), e);
  // Пустое текстовое поле возвращает автоматическое. / Empty text returns to automatic.
  applyManualEdits([{ key, patch: { title: '' } }], 'clear');
  assert.equal(getManualEdit(key)?.title, undefined);
  assert.equal(undoManualEdits()?.label, 'clear');
  assert.equal(getManualEdit(key)?.title, 'Final Fantasy VIII');
  undoManualEdits();
  assert.equal(getManualEdit(key), undefined);
  assert.equal(undoManualEdits(), null);
});

test('applyManualEdits: без изменений шаг отмены не создаётся, рейтинг приводится к 0–1', () => {
  __resetManualEditsForTests();
  const key = 'PSX::ABCDEF12';
  applyManualEdits([{ key, patch: { rating: '8,5' } }], 'a');
  assert.equal(getManualEdit(key)?.rating, '0.85');
  assert.equal(applyManualEdits([{ key, patch: { rating: '0.85' } }], 'b'), 0);
  assert.equal(undoManualEdits()?.label, 'a');
  applyManualEdits([{ key, patch: { rating: '90' } }], 'c');
  assert.equal(getManualEdit(key)?.rating, '0.9');
});

test('reset и originals gamelist', () => {
  __resetManualEditsForTests();
  const key = 'PSX::ABCDEF12';
  applyManualEdits([{ key, patch: { desc: 'Новое описание' } }], 'a');
  rememberGamelistOriginal(key, 'desc', 'Old');
  rememberGamelistOriginal(key, 'desc', 'Новое описание');
  assert.equal(getGamelistOriginal(key, 'desc'), 'Old');
  applyManualEdits([{ key, patch: 'reset' }], 'reset');
  assert.equal(getManualEdit(key), undefined);
});

test('importManualEdits не затирает текущие правки', () => {
  __resetManualEditsForTests();
  applyManualEdits([{ key: 'A::11111111', patch: { title: 'Mine' } }], 'a');
  const n = importManualEdits({ edits: { 'A::11111111': { title: 'File' }, 'B::22222222': { genre: 'RPG', junk: 1 } } });
  assert.equal(n, 1);
  assert.equal(getManualEdit('A::11111111')?.title, 'Mine');
  assert.deepEqual(getManualEdit('B::22222222'), { genre: 'RPG' });
});

test('renderTitleTemplate и replaceInTitle', () => {
  const r = { title: 'Tekken 3', region: 'RUS', year: 1998, consoleShort: 'PSX', genre: 'Fighting' };
  assert.equal(renderTitleTemplate('{title} ({region})', r, 0), 'Tekken 3 (RUS)');
  assert.equal(renderTitleTemplate('{n:3} - {title} [{console}]', r, 6), '007 - Tekken 3 [PSX]');
  assert.equal(renderTitleTemplate('{title} ({year}) ()', { title: 'X' }, 0), 'X');
  assert.equal(replaceInTitle('FFVIII (USA)', 'FFVIII', 'Final Fantasy VIII', false), 'Final Fantasy VIII (USA)');
  assert.equal(replaceInTitle('the game', 'THE', 'A', true), 'A game');
});
