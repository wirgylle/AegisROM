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

// Случай из отчёта: три версии одной игры на разных консолях и одна другая игра с тем же началом.
// The reported case: three versions of one game on different consoles and one other game.
const jungle = [
  g('j1', 'Jungle Book, The (USA)', 'NES', 'E0000001'),
  g('j2', 'Jungle Book, The (USA)', 'SNES', 'E0000002'),
  g('j3', 'Jungle Book, The (Europe)', 'MD', 'E0000003'),
  g('j4', 'Jungle Book Groove Party (Europe)', 'PS1', 'E0000004'),
];

test('предложения: серия показывает игры с версиями, коллекция внутри серии предлагается отдельно', async () => {
  const { applySuggestionEdit } = await import('./manualGroups.ts');
  const sug = suggestGroups(jungle, emptyGroupsState());
  const ser = sug.find((s) => s.kind === 'series' && s.action === 'create');
  assert.ok(ser, JSON.stringify(sug));
  assert.equal(ser!.parts!.length, 2);
  const book = ser!.parts!.find((p) => p.gameIds.includes('j1'))!;
  assert.deepEqual(book.consoles, ['NES', 'SNES', 'MD']);
  assert.equal(book.title, 'Jungle Book, The');
  const col = sug.find((s) => s.kind === 'collection');
  assert.ok(col, JSON.stringify(sug));
  assert.equal(col!.reason, 'multi-console');
  assert.equal(col!.parentId, ser!.id);
  assert.deepEqual(new Set(col!.gameIds), new Set(['j1', 'j2', 'j3']));
  // Правка состава перед «Принять»: сняли Groove Party и сменили вид на коллекцию.
  const e = applySuggestionEdit(ser!, { excluded: [gameKeyOf(jungle[3])], kind: 'collection', name: ' Книга джунглей ' })!;
  assert.equal(e.kind, 'collection');
  assert.equal(e.name, 'Книга джунглей');
  assert.deepEqual(e.gameIds, ['j1', 'j2', 'j3']);
  assert.equal(e.parts!.length, 1);
  assert.equal(applySuggestionEdit(col!, { excluded: col!.gameKeys }), null);
});

test('предложения: одна игра на разных консолях без серии — не серия', () => {
  const only = jungle.slice(0, 3);
  const sug = suggestGroups(only, emptyGroupsState());
  assert.ok(!sug.some((s) => s.kind === 'series'), JSON.stringify(sug));
  // И не засыпаем окно коллекциями вне серий. / No collection outside a series either.
  assert.equal(sug.length, 0);
});

test('предложения: коллекция внутри ручной серии и после отклонения серии', () => {
  const st = withMembersAdded(
    { ...emptyGroupsState(), groups: [{ id: 'jb', kind: 'series', name: 'Jungle Book', members: [], createdAt: 0 }] },
    'jb',
    jungle.map(gameKeyOf)
  );
  const sug = suggestGroups(applyManualGroups(jungle, st), st);
  const col = sug.find((s) => s.kind === 'collection')!;
  assert.ok(col);
  assert.equal(col.seriesName, 'Jungle Book');
  assert.equal(col.parentId, undefined);
  const st2 = { ...emptyGroupsState(), rejected: ['new:jungle book'] };
  const sug2 = suggestGroups(jungle, st2);
  assert.ok(!sug2.some((s) => s.kind === 'series'));
  assert.ok(sug2.some((s) => s.kind === 'collection' && !s.parentId));
});

test('предложения: коллекция внутри автоматической серии', () => {
  const rows = [
    g('m1', 'Super Mario Bros. (World)', 'NES', 'F0000001'),
    g('m2', 'Super Mario Bros. (Europe)', 'GBC', 'F0000002'),
    g('m3', 'Super Mario Bros. 3 (USA)', 'NES', 'F0000003'),
  ];
  const col = suggestGroups(rows, emptyGroupsState()).find((s) => s.kind === 'collection');
  assert.ok(col);
  assert.deepEqual(col!.consoles, ['NES', 'GBC']);
  assert.equal(col!.seriesName, 'Super Mario Bros');
});
