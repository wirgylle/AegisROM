// Тесты коллекций, серий и разбора Wikidata: `npm test`.
// Collections, series and Wikidata parsing tests: `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCollections, collectionKeyOf, indexCollections, normalizeGameTitle, seriesKeyOf, seriesSiblings } from './gameCollections.ts';
import { claimYear, lookupGameInfo, pickBestEntity, scoreCandidate } from './gameInfo.ts';

const g = (id: string, title: string, consoleShort: string, extra: Record<string, string> = {}) => ({ id, title, consoleShort, ...extra });

test('normalizeGameTitle: регионы, артикли, Disney', () => {
  assert.equal(normalizeGameTitle('Aladdin (USA)'), 'aladdin');
  assert.equal(normalizeGameTitle("Disney's Aladdin (Europe)"), 'aladdin');
  assert.equal(normalizeGameTitle('Legend of Zelda, The - A Link to the Past (USA)'), 'legend of zelda a link to the past');
  assert.equal(normalizeGameTitle('The Legend of Zelda: A Link to the Past'), 'legend of zelda a link to the past');
  assert.equal(normalizeGameTitle('Battletoads & Double Dragon'), 'battletoads and double dragon');
  assert.equal(normalizeGameTitle('Pokémon Red'), 'pokemon red');
  assert.equal(normalizeGameTitle('Final Fantasy VII (Disc 1)'), 'final fantasy vii');
  assert.equal(normalizeGameTitle('012 - Contra (U) [!].nes'), 'contra');
});

test('коллекция объединяет консоли, но не номера частей', () => {
  const list = [
    g('1', 'Aladdin', 'NES'),
    g('2', 'Sonic the Hedgehog 2', 'GENESIS'),
    g('3', 'Aladdin', 'SNES', { boxArtUrl: 'x' }),
    g('4', "Disney's Aladdin", 'GENESIS'),
    g('5', 'Sonic the Hedgehog', 'GENESIS'),
    g('6', 'Sonic the Hedgehog 2', 'GG'),
  ];
  const cols = buildCollections(list);
  assert.deepEqual(cols.map((c) => c.members.length), [3, 2, 1]);
  assert.equal(cols[0].lead.id, '3', 'обложка выигрывает');
  assert.deepEqual(cols[0].consoles, ['NES', 'SNES', 'GENESIS']);
  assert.notEqual(collectionKeyOf(list[1]), collectionKeyOf(list[4]));
});

test('хак не становится лицом коллекции', () => {
  const cols = buildCollections([
    g('h', 'Super Mario Bros. 3', 'NES', { modKind: 'hack', boxArtUrl: 'x' }),
    g('o', 'Super Mario Bros. 3', 'NES'),
  ]);
  assert.equal(cols.length, 1);
  assert.equal(cols[0].lead.id, 'o');
});

test('seriesKeyOf: номер, римские цифры, подзаголовок', () => {
  assert.equal(seriesKeyOf('Sonic the Hedgehog'), 'sonic the hedgehog');
  assert.equal(seriesKeyOf('Sonic the Hedgehog 3'), 'sonic the hedgehog');
  assert.equal(seriesKeyOf('Street Fighter II Turbo'), 'street fighter');
  assert.equal(seriesKeyOf('Castlevania: Bloodlines'), 'castlevania');
  assert.equal(seriesKeyOf('Ninja Gaiden II: The Dark Sword of Chaos'), 'ninja gaiden');
  assert.equal(seriesKeyOf('Mega Man X'), 'mega man x', 'X не считается номером');
  assert.equal(seriesKeyOf('Ys II'), '', 'слишком коротко');
});

test('seriesSiblings: Sonic 1/2/3 в одной серии, Aladdin отдельно', () => {
  const idx = indexCollections([
    g('a', 'Sonic the Hedgehog', 'GENESIS'),
    g('b', 'Sonic the Hedgehog 2', 'GENESIS'),
    g('c', 'Sonic the Hedgehog 3', 'GENESIS'),
    g('d', 'Aladdin', 'SNES'),
  ]);
  assert.deepEqual(seriesSiblings(idx, 'b').map((c) => c.lead.id), ['a', 'c']);
  assert.deepEqual(seriesSiblings(idx, 'd'), []);
});

const ent = (id: string, label: string, claims: Record<string, string[]>, extra: any = {}) => ({
  id,
  labels: { en: { value: label } },
  claims: Object.fromEntries(
    Object.entries(claims).map(([p, ids]) => [p, ids.map((v) => ({ mainsnak: { datavalue: { value: { id: v } } } }))])
  ),
  ...extra,
});

test('pickBestEntity: нужно точное название, консоль даёт бонус', () => {
  const film = ent('Q1', 'Aladdin', {});
  const nes = ent('Q2', 'Aladdin', { P31: ['Q7889'], P400: ['Q172742'] });
  const md = ent('Q3', 'Aladdin', { P31: ['Q7889'], P400: ['Q10676'] });
  const other = ent('Q4', 'Aladdin II', { P31: ['Q7889'], P400: ['Q10676'] });
  assert.equal(scoreCandidate(film, 'aladdin'), -1);
  assert.equal(pickBestEntity([film, nes, md, other], 'aladdin', 'Q10676')?.id, 'Q3');
  assert.equal(pickBestEntity([other], 'aladdin'), undefined);
});

test('claimYear берёт самую раннюю дату', () => {
  const e = {
    id: 'Q1',
    claims: {
      P577: [
        { mainsnak: { datavalue: { value: { time: '+1993-11-11T00:00:00Z' } } } },
        { mainsnak: { datavalue: { value: { time: '+1992-11-21T00:00:00Z' } } } },
      ],
    },
  };
  assert.equal(claimYear(e), 1992);
});

test('lookupGameInfo: полный проход на заглушке', async () => {
  const sonic2 = ent('Q10', 'Sonic the Hedgehog 2', { P31: ['Q7889'], P400: ['Q10676'], P179: ['Q100'] }, { sitelinks: { enwiki: { title: 'Sonic the Hedgehog 2' } } });
  const sonic1 = ent('Q11', 'Sonic the Hedgehog', { P31: ['Q7889'] });
  sonic1.claims.P577 = [{ mainsnak: { datavalue: { value: { time: '+1991-06-23T00:00:00Z' } } } }] as any;
  const sonic3 = ent('Q12', 'Sonic the Hedgehog 3', { P31: ['Q7889'] });
  const lib: Record<string, any> = { Q10: sonic2, Q11: sonic1, Q12: sonic3, Q100: ent('Q100', 'Sonic the Hedgehog', {}), Q10676: ent('Q10676', 'Sega Genesis', {}) };
  const urls: string[] = [];
  const fetcher = async (url: string) => {
    urls.push(url);
    const u = new URL(url);
    let body: any = {};
    if (u.hostname.endsWith('wikipedia.org')) body = { extract: 'A 1992 platform game.', content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Sonic_2' } } };
    else if (u.searchParams.get('list') === 'search') {
      const q = u.searchParams.get('srsearch') || '';
      body = { query: { search: (q.includes('P179=Q100') ? ['Q10', 'Q11', 'Q12'] : ['Q10']).map((title) => ({ title })) } };
    } else body = { entities: Object.fromEntries((u.searchParams.get('ids') || '').split('|').map((id) => [id, lib[id]])) };
    return { ok: true, status: 200, json: async () => body };
  };
  const info = await lookupGameInfo({ title: 'Sonic the Hedgehog 2 (World)', consoleShort: 'GENESIS', langs: ['ru', 'en'], fetcher });
  assert.ok(info);
  assert.equal(info.qid, 'Q10');
  assert.equal(info.extract, 'A 1992 platform game.');
  assert.deepEqual(info.platforms, [{ id: 'Q10676', label: 'Sega Genesis' }]);
  assert.deepEqual(info.series, [{ id: 'Q100', label: 'Sonic the Hedgehog' }]);
  assert.deepEqual(info.seriesGames.map((x) => x.id), ['Q11', 'Q12']);
  assert.ok(urls.every((x) => x.includes('wikipedia.org') || x.includes('origin=*')));
});
