// Тесты области операций: `npm test`. / Operation scope tests: `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildScopeFacets,
  emptyScope,
  filterRowsByScope,
  folderOfRow,
  isWholeLibrary,
  type OperationScope,
} from './operationScope.ts';

const rows = [
  { id: 'a', title: 'Sonic the Hedgehog', consoleShort: 'GENESIS', bitness: '16-bit', relativePath: 'genesis/Sonic.md', boxArtUrl: 'x.png' },
  { id: 'b', title: 'Sonic the Hedgehog 2', consoleShort: 'GENESIS', bitness: '16-bit', relativePath: 'genesis/Sonic 2.md' },
  { id: 'c', title: 'Aladdin', consoleShort: 'SNES', bitness: '16-bit', relativePath: 'snes/Aladdin.sfc' },
  { id: 'd', title: 'Aladdin', consoleShort: 'NES', bitness: '8-bit', relativePath: 'nes/hackroms/Aladdin.nes', boxArtUrl: 'y.png' },
  { id: 'e', title: '1942', consoleShort: 'NES', bitness: '8-bit', relativePath: 'nes/1942.nes' },
];

const scope = (p: Partial<OperationScope>): OperationScope => ({ ...emptyScope(), ...p });
const ids = (list: { id: string }[]) => list.map((r) => r.id);

test('empty scope keeps the whole library', () => {
  assert.equal(isWholeLibrary(emptyScope()), true);
  assert.deepEqual(ids(filterRowsByScope(rows, emptyScope())), ['a', 'b', 'c', 'd', 'e']);
});

test('values of one criterion are OR-ed, criteria are AND-ed', () => {
  assert.deepEqual(ids(filterRowsByScope(rows, scope({ consoles: ['nes', 'SNES'] }))), ['c', 'd', 'e']);
  assert.deepEqual(
    ids(filterRowsByScope(rows, scope({ consoles: ['NES', 'SNES'], onlyMissingMedia: true }))),
    ['c', 'e']
  );
  assert.deepEqual(ids(filterRowsByScope(rows, scope({ bitness: ['8-bit'] }))), ['d', 'e']);
});

test('folder matches the folder and its subfolders, not a name prefix', () => {
  assert.deepEqual(ids(filterRowsByScope(rows, scope({ folders: ['nes'] }))), ['d', 'e']);
  assert.deepEqual(ids(filterRowsByScope(rows, scope({ folders: ['nes/hackroms'] }))), ['d']);
  assert.deepEqual(ids(filterRowsByScope(rows, scope({ folders: ['ne'] }))), []);
  assert.equal(folderOfRow({ relativePath: 'psx\\FF8\\disc1.chd' }), 'psx/FF8');
});

test('games, collections and series form one selection', () => {
  const facets = buildScopeFacets(rows);
  const aladdin = facets.collections.find((c) => c.label === 'Aladdin');
  assert.ok(aladdin);
  assert.equal(aladdin!.count, 2);
  const sonic = facets.series.find((s) => s.count === 2);
  assert.ok(sonic);
  assert.deepEqual(
    ids(filterRowsByScope(rows, scope({ collectionKeys: [aladdin!.key], gameIds: ['e'] }))),
    ['c', 'd', 'e']
  );
  assert.deepEqual(ids(filterRowsByScope(rows, scope({ seriesKeys: [sonic!.key] }))), ['a', 'b']);
  // Выбор + консоль: только NES-версия коллекции. / Pick + console: only the NES version.
  assert.deepEqual(
    ids(filterRowsByScope(rows, scope({ collectionKeys: [aladdin!.key], consoles: ['NES'] }))),
    ['d']
  );
});

test('only new skips records the operation has processed', () => {
  const done = new Set(['a', 'c']);
  assert.deepEqual(
    ids(filterRowsByScope(rows, scope({ onlyNew: true }), { processedIds: done })),
    ['b', 'd', 'e']
  );
});

test('facets count consoles and folders', () => {
  const f = buildScopeFacets(rows);
  assert.deepEqual(
    f.consoles.map((c) => `${c.key}:${c.count}`),
    ['GENESIS:2', 'NES:2', 'SNES:1']
  );
  assert.ok(f.folders.some((x) => x.key === 'nes/hackroms' && x.count === 1));
});
