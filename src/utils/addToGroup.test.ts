// Тесты окна «В коллекцию или серию»: `npm test`.
// "Add to collection or series" tests: `npm test`.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { addRomsToGroup, buildGroupOptions, filterGroupOptions, hasExactGroup, undoAddRoms } from './addToGroup.ts';
import {
  __resetManualGroupsForTests,
  applyManualGroups,
  createManualGroup,
  gameKeyOf,
  getManualGroupsState,
  setDetached,
} from './manualGroups.ts';

const g = (id: string, title: string, consoleShort: string, crc32: string) => ({ id, title, consoleShort, crc32 });

const lib = [
  g('1', 'Final Fantasy VII (USA)', 'PS1', 'A1'),
  g('2', 'Final Fantasy VII (Europe)', 'PS1', 'A2'),
  g('3', 'Final Fantasy Tactics (USA)', 'PS1', 'A3'),
  g('4', 'Tekken 3 (USA)', 'PS1', 'B1'),
  g('5', 'Tekken 3 (Europe)', 'PS1', 'B2'),
  g('6', 'Mystic Quest (USA)', 'SNES', 'C1'),
];

const rows = () => applyManualGroups(lib, getManualGroupsState());
const key = (id: string) => gameKeyOf(lib.find((x) => x.id === id)!);

beforeEach(() => __resetManualGroupsForTests());

test('список: авто-коллекции и авто-серии, отметка «уже здесь» / auto groups and contains flag', () => {
  const opts = buildGroupOptions(rows(), getManualGroupsState(), ['4']);
  const tekken = opts.find((o) => o.kind === 'collection' && o.name.startsWith('Tekken 3'));
  assert.ok(tekken);
  assert.equal(tekken!.source, 'auto');
  assert.equal(tekken!.contains, true);
  const ff = opts.find((o) => o.kind === 'series' && /final fantasy/i.test(o.name));
  assert.ok(ff);
  assert.equal(ff!.contains, false);
  assert.equal(ff!.count, 2);
});

test('фильтр: по началу слова, вид, ручные выше / filter by word prefix and kind', () => {
  createManualGroup('series', 'Final Fantasy Mystic', []);
  const opts = buildGroupOptions(rows(), getManualGroupsState(), ['6']);
  const hits = filterGroupOptions(opts, 'fant');
  assert.ok(hits.length >= 2);
  assert.ok(hits.every((o) => /fant/i.test(o.name)));
  assert.equal(filterGroupOptions(opts, 'fant', 'collection').some((o) => o.kind === 'series'), false);
  assert.equal(filterGroupOptions(opts, 'zzz').length, 0);
  assert.ok(hasExactGroup(opts, 'final fantasy mystic', 'series'));
  assert.ok(!hasExactGroup(opts, 'final fantasy mystic', 'collection'));
});

test('добавить в авто-серию: создаётся ручная с составом + ром, отмена удаляет / auto series → manual, undo', () => {
  const opts = buildGroupOptions(rows(), getManualGroupsState(), ['6']);
  const ff = opts.find((o) => o.kind === 'series' && o.source === 'auto' && /final fantasy/i.test(o.name))!;
  const undo = addRomsToGroup(getManualGroupsState(), [key('6')], { option: ff })!;
  const st = getManualGroupsState();
  assert.equal(st.groups.length, 1);
  assert.equal(st.groups[0].kind, 'series');
  assert.ok(st.groups[0].members.includes(key('6')));
  assert.ok(st.groups[0].members.includes(key('1')));
  const after = buildGroupOptions(rows(), st, ['6']).find((o) => o.id === `m:${st.groups[0].id}`)!;
  assert.equal(after.contains, true);
  undoAddRoms(undo);
  assert.equal(getManualGroupsState().groups.length, 0);
});

test('перенос между ручными группами и отмена возвращает назад / move between manual groups and undo', () => {
  const a = createManualGroup('collection', 'A', [key('6')]);
  const b = createManualGroup('collection', 'B', []);
  setDetached('series', [key('6')], true);
  const opt = buildGroupOptions(rows(), getManualGroupsState(), ['6']).find((o) => o.groupId === b)!;
  const undo = addRomsToGroup(getManualGroupsState(), [key('6')], { option: opt })!;
  let st = getManualGroupsState();
  assert.deepEqual(st.groups.find((x) => x.id === a)!.members, []);
  assert.deepEqual(st.groups.find((x) => x.id === b)!.members, [key('6')]);
  undoAddRoms(undo);
  st = getManualGroupsState();
  assert.deepEqual(st.groups.find((x) => x.id === a)!.members, [key('6')]);
  assert.deepEqual(st.groups.find((x) => x.id === b)!.members, []);
  assert.equal(st.detached[key('6')]?.series, true);
});

test('создать новую из поиска / create a new group from the search', () => {
  const undo = addRomsToGroup(getManualGroupsState(), [key('6')], { create: 'series', name: '  Mana  ' })!;
  const st = getManualGroupsState();
  assert.equal(st.groups[0].name, 'Mana');
  assert.equal(undo.createdId, st.groups[0].id);
  assert.equal(addRomsToGroup(st, [key('6')], { create: 'series', name: '   ' }), null);
});
