// Тесты ручных коллекций/серий и предложений: `npm test`.
// Manual collections/series and suggestions tests: `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCollections, buildSeries, groupMembership } from './gameCollections.ts';
import {
  applyManualGroups,
  emptyGroupsState,
  gameKeyOf,
  suggestGroups,
  withDetached,
  withMembersAdded,
  withMembersRemoved,
  sanitizeGroupsState,
  type ManualGroupsState,
} from './manualGroups.ts';

const g = (id: string, title: string, consoleShort: string, crc32 = '') => ({ id, title, consoleShort, crc32 });

const lib = [
  g('1', 'Super Mario Bros. (World)', 'NES', '3337EC46'),
  g('2', 'Super Mario Bros. 3 (USA)', 'NES', '2E6301ED'),
  g('3', 'Super Mario World (USA)', 'SNES', 'B19ED489'),
  g('4', 'Super Mario Kart (USA)', 'SNES', 'CD80DB86'),
  g('5', 'Aladdin (USA)', 'SNES', 'AAAAAAA1'),
  g('6', 'Disney\'s Aladdin (Europe)', 'MD', 'AAAAAAA2'),
  g('7', 'Final Fantasy VII (USA)', 'PS1', 'BBBBBBB1'),
  g('8', 'Final Fantasy Tactics (USA)', 'PS1', 'BBBBBBB2'),
  g('9', 'Bust-A-Move (USA)', 'SNES', 'CCCCCCC1'),
  g('10', 'Puzzle Bobble (Japan)', 'SNES', 'CCCCCCC2'),
];

const withGroup = (s: ManualGroupsState, id: string, kind: 'collection' | 'series', name: string, ids: string[]) =>
  withMembersAdded(
    { ...s, groups: [...s.groups, { id, kind, name, members: [], createdAt: 0 }] },
    id,
    ids.map((i) => gameKeyOf(lib.find((x) => x.id === i)!))
  );

test('ручная коллекция объединяет разные названия одной игры', () => {
  const st = withGroup(emptyGroupsState(), 'bub', 'collection', 'Puzzle Bobble', ['9', '10']);
  const rows = applyManualGroups(lib, st);
  const cols = buildCollections(rows);
  const bub = cols.find((c) => c.members.some((m) => m.id === '9'))!;
  assert.equal(bub.members.length, 2);
  assert.equal(bub.label, 'Puzzle Bobble');
  assert.ok(groupMembership(rows).inCollection.has('10'));
});

test('ручная серия важнее автоматической и даёт своё название', () => {
  const st = withGroup(emptyGroupsState(), 'mario', 'series', 'Mario', ['1', '2', '3', '4']);
  const series = buildSeries(applyManualGroups(lib, st));
  const mario = series.find((s) => s.members.some((m) => m.id === '3'))!;
  assert.equal(mario.label, 'Mario');
  assert.equal(mario.manual, true);
  assert.equal(mario.games.length, 4);
});

test('вынутая из серии игра стоит отдельно', () => {
  const key = gameKeyOf(lib[7]);
  const st = withDetached(emptyGroupsState(), 'series', [key], true);
  const series = buildSeries(applyManualGroups(lib, st));
  const ff = series.find((s) => s.members.some((m) => m.id === '7'))!;
  assert.ok(!ff.members.some((m) => m.id === '8'));
  // Без отсоединения Tactics в серии Final Fantasy. / Without it Tactics joins Final Fantasy.
  const auto = buildSeries(lib).find((s) => s.members.some((m) => m.id === '7'))!;
  assert.ok(auto.members.some((m) => m.id === '8'));
});

test('игра в одной ручной группе каждого вида', () => {
  let st = withGroup(emptyGroupsState(), 'a', 'series', 'A', ['1']);
  st = withGroup(st, 'b', 'series', 'B', ['1']);
  assert.deepEqual(st.groups.find((x) => x.id === 'a')!.members, []);
  st = withMembersRemoved(st, 'b', [gameKeyOf(lib[0])]);
  assert.deepEqual(st.groups.find((x) => x.id === 'b')!.members, []);
});

test('предложения: новая серия по общему началу названия', () => {
  const sug = suggestGroups(applyManualGroups(lib, emptyGroupsState()), emptyGroupsState());
  const mario = sug.find((s) => s.id === 'new:super mario');
  assert.ok(mario, JSON.stringify(sug));
  assert.equal(mario!.name, 'Super Mario');
  assert.deepEqual(new Set(mario!.gameIds), new Set(['1', '2', '3', '4']));
  // «Final Fantasy» уже одна серия — не предлагаем. / Already one series: no suggestion.
  assert.ok(!sug.some((s) => s.name.startsWith('Final')));
});

test('предложения: добавить версию с другой консоли в ручную коллекцию', () => {
  const extra = [...lib, g('11', 'Puzzle Bobble (Europe)', 'GB', 'DDDDDDD1')];
  const st = withMembersAdded(
    { ...emptyGroupsState(), groups: [{ id: 'bub', kind: 'collection', name: 'Puzzle Bobble', members: [], createdAt: 0 }] },
    'bub',
    [gameKeyOf(lib[8]), gameKeyOf(lib[9])]
  );
  const sug = suggestGroups(applyManualGroups(extra, st), st);
  const add = sug.find((s) => s.action === 'add' && s.groupId === 'bub');
  assert.ok(add);
  assert.deepEqual(add!.gameIds, ['11']);
  // Отклонённое по игре больше не предлагается. / A rejected game is not suggested again.
  const st2 = { ...st, rejected: [`add:bub:${gameKeyOf(extra[10])}`] };
  assert.ok(!suggestGroups(applyManualGroups(extra, st2), st2).some((s) => s.groupId === 'bub'));
});

test('предложения: ручная серия по названию ловит новые игры', () => {
  const st = withGroup(emptyGroupsState(), 'mario', 'series', 'Super Mario', ['1']);
  const sug = suggestGroups(applyManualGroups(lib, st), st);
  const add = sug.find((s) => s.groupId === 'mario');
  assert.ok(add);
  assert.deepEqual(new Set(add!.gameIds), new Set(['2', '3', '4']));
  // Отклонённая новая серия не возвращается. / A rejected new series does not come back.
  const st2 = { ...emptyGroupsState(), rejected: ['new:super mario'] };
  assert.ok(!suggestGroups(lib, st2).some((s) => s.id === 'new:super mario'));
});

test('sanitizeGroupsState отбрасывает мусор', () => {
  const s = sanitizeGroupsState({ groups: [{ id: 'x', kind: 'bad' }, { id: 'y', kind: 'series', name: ' Y ', members: ['k', 1] }], detached: { k: { series: true, x: 1 } }, rejected: ['r', 2] });
  assert.equal(s.groups.length, 1);
  assert.equal(s.groups[0].name, 'Y');
  assert.deepEqual(s.groups[0].members, ['k']);
  assert.deepEqual(s.detached, { k: { series: true } });
  assert.deepEqual(s.rejected, ['r']);
});

test('studioOf / studioKeyOf', async () => {
  const { studioOf, studioKeyOf, NO_STUDIO } = await import('./studio.ts');
  assert.equal(studioOf({ developer: 'Sonic Team / Sega Technical Institute' }), 'Sonic Team');
  assert.equal(studioOf({ developer: '', publisher: 'Konami' }), 'Konami');
  assert.equal(studioOf({ developer: 'Official Release', publisher: 'Capcom, Nintendo' }), 'Capcom');
  assert.equal(studioKeyOf({ developer: 'Capcom Co., Ltd.' }), studioKeyOf({ developer: 'capcom co' }));
  assert.equal(studioKeyOf({}), NO_STUDIO);
});
