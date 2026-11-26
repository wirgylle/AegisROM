// Значки коллекций и серий по всей Библиотеке: `npm test`.
// Library-wide collection and series badges: `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasCollectionBadge, hasSeriesBadge, indexLibraryGroups } from './gameCollections.ts';

const g = (id: string, title: string, consoleShort: string, extra: Record<string, string> = {}) => ({ id, title, consoleShort, ...extra });

test('indexLibraryGroups: Battletoads на разных консолях — коллекция и серия', () => {
  const lib = [
    g('1', 'Battletoads (USA)', 'NES'),
    g('2', 'Battletoads (Europe)', 'GB'),
    g('3', 'Battletoads II: The Dark Queen (USA)', 'SNES'),
    g('4', 'Contra (USA)', 'NES'),
  ];
  const idx = indexLibraryGroups(lib);
  const c = idx.collectionOf.get('1');
  assert.ok(hasCollectionBadge(c));
  assert.equal(c!.members.length, 2);
  assert.deepEqual(c!.consoles, ['NES', 'GB']);
  // Тот же индекс при «выбранной консоли»: значок считается по всей Библиотеке.
  assert.equal(idx.collectionOf.get('2'), c);
  const s = idx.seriesOf.get('3');
  assert.ok(hasSeriesBadge(s));
  assert.equal(s!.games.length, 2);
  assert.equal(idx.seriesOf.get('1'), s);
  assert.ok(!hasCollectionBadge(idx.collectionOf.get('4')));
  assert.ok(!hasSeriesBadge(idx.seriesOf.get('4')));
});

test('indexLibraryGroups: ручная коллекция из одного рома даёт значок', () => {
  const lib = [
    g('1', 'Battletoads (USA)', 'NES', { manualCollection: 'm:c:bt', manualCollectionLabel: 'Battletoads' }),
    g('2', 'Contra (USA)', 'NES'),
  ];
  const idx = indexLibraryGroups(lib);
  const c = idx.collectionOf.get('1');
  assert.ok(hasCollectionBadge(c));
  assert.equal(c!.label, 'Battletoads');
});

test('indexLibraryGroups: ручная серия даёт значок серии', () => {
  const lib = [
    g('1', 'Battletoads (USA)', 'NES', { manualSeries: 'm:s:rare', manualSeriesLabel: 'Rare' }),
    g('2', 'Contra (USA)', 'NES'),
  ];
  const idx = indexLibraryGroups(lib);
  assert.ok(hasSeriesBadge(idx.seriesOf.get('1')));
  assert.equal(idx.seriesOf.get('1')!.label, 'Rare');
});
