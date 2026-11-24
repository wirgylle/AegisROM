// Тесты выгрузки/загрузки данных игр: `npm test`.
// Game data export/import tests: `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  changesToPatches,
  parseCsv,
  parseGameData,
  parseXml,
  planGameDataImport,
  toCsv,
  toXml,
  type GameDataRow,
} from './gameDataIO.ts';

const rows: GameDataRow[] = [
  {
    id: 'a',
    title: 'Sonic the Hedgehog',
    console: 'Sega Genesis',
    consoleShort: 'GENESIS',
    crc32: 'f9394e97',
    region: 'USA',
    genre: 'Platform',
    year: 1991,
    developer: 'Sonic Team',
    rating: '0.9',
    desc: 'Fast; "blue"\nhedgehog',
    oldFile: 'Sonic the Hedgehog (USA).md',
    relativePath: 'genesis/Sonic the Hedgehog (USA).md',
  },
  {
    id: 'b',
    title: 'Tetris',
    consoleShort: 'GB',
    crc32: '00000000',
    year: 0,
    oldFile: 'Tetris.gb',
  },
  {
    id: 'c',
    title: 'Tetris',
    consoleShort: 'NES',
    crc32: '',
    oldFile: 'Tetris.gb',
  },
];

test('CSV: выгрузка и обратное чтение без потерь / CSV round trip', () => {
  const csv = toCsv(rows);
  assert.ok(csv.startsWith('﻿'));
  const back = parseCsv(csv);
  assert.equal(back.length, 3);
  assert.equal(back[0].key, 'GENESIS::F9394E97');
  assert.equal(back[0].desc, 'Fast; "blue"\nhedgehog');
  assert.equal(back[1].key, 'id::b');
  assert.equal(back[1].year, '');
  const plan = planGameDataImport(back, rows);
  assert.equal(plan.matched, 3);
  assert.equal(plan.changes.length, 0);
});

test('XML: выгрузка и обратное чтение / XML round trip', () => {
  const xml = toXml(rows, '2026-01-01');
  const back = parseXml(xml);
  assert.equal(back.length, 3);
  assert.equal(back[0].desc, 'Fast; "blue"\nhedgehog');
  assert.equal(planGameDataImport(back, rows).changes.length, 0);
});

test('Изменения, пустые ячейки и нормализация / Changes, empty cells, normalization', () => {
  const csv = 'key,genre,year,rating,developer\nGENESIS::F9394E97,Action,1992,8,\n';
  const plan = planGameDataImport(parseCsv(csv), rows);
  const byField = Object.fromEntries(plan.changes.map((c) => [c.field, c]));
  assert.equal(byField.genre.to, 'Action');
  assert.equal(byField.year.to, '1992');
  assert.equal(byField.rating.to, '0.8');
  assert.equal(byField.developer, undefined, 'пустая ячейка ничего не меняет');
  assert.equal(plan.changedGames, 1);
  assert.deepEqual(changesToPatches(plan.changes), [
    { key: 'GENESIS::F9394E97', patch: { genre: 'Action', year: '1992', rating: '0.8' } },
  ]);
});

test('Сопоставление по консоли+CRC и по имени файла / Match by console+CRC and file name', () => {
  const csv = [
    'console;crc32;file;genre',
    'genesis;F9394E97;;Platformer',
    ';;Tetris.gb;Puzzle',
    'NES;;Tetris.gb;Puzzle',
    ';;Unknown.zip;Puzzle',
  ].join('\n');
  const plan = planGameDataImport(parseCsv(csv), rows);
  assert.equal(plan.matched, 2);
  assert.equal(plan.ambiguous.length, 1);
  assert.equal(plan.unmatched.length, 1);
  assert.equal(plan.unmatched[0].label, 'Unknown.zip');
  assert.deepEqual(
    plan.changes.map((c) => [c.rowId, c.to]),
    [
      ['a', 'Platformer'],
      ['c', 'Puzzle'],
    ]
  );
});

test('Чужой gamelist.xml / Foreign gamelist.xml', () => {
  const xml = `<?xml version="1.0"?>
<gameList>
  <game id="1" source="ScreenScraper.fr">
    <path>./Sonic the Hedgehog (USA).md</path>
    <name>Sonic The Hedgehog</name>
    <desc><![CDATA[Speed & rings]]></desc>
    <releasedate>19910623T000000</releasedate>
    <developer>Sonic Team</developer>
    <publisher>Sega</publisher>
    <genre>Platform</genre>
    <players>1</players>
    <image>./images/x.png</image>
  </game>
</gameList>`;
  const recs = parseGameData(xml, 'gamelist.xml');
  assert.equal(recs[0].title, 'Sonic The Hedgehog');
  assert.equal(recs[0].year, '19910623T000000');
  const plan = planGameDataImport(recs, rows);
  const fields = plan.changes.map((c) => `${c.field}=${c.to}`).sort();
  assert.deepEqual(fields, ['desc=Speed & rings', 'players=1', 'publisher=Sega', 'title=Sonic The Hedgehog']);
});

test('Дубль в файле: последняя запись побеждает / Duplicate: last record wins', () => {
  const csv = 'key;genre\nGENESIS::F9394E97;A\nGENESIS::F9394E97;B\n';
  const plan = planGameDataImport(parseCsv(csv), rows);
  assert.equal(plan.duplicates, 1);
  assert.equal(plan.changes.length, 1);
  assert.equal(plan.changes[0].to, 'B');
});
