// Коллекции и серии в Библиотеке.
// Коллекция: одна и та же игра на разных консолях, в разных регионах, ревизиях и хаках
// (Aladdin на NES, SNES и Mega Drive). Серия: разные игры одной линейки (Sonic, Sonic 2, Sonic 3).
// Связи строятся только по нормализованному названию, которое уже есть у рома
// (DAT No-Intro/Redump, gamelist, онлайн-переименование). Ничего не угадываем по жанру или году.
//
// Collections and series in the Library.
// Collection: the same game on several consoles, regions, revisions and hacks
// (Aladdin on NES, SNES and Mega Drive). Series: different games of one line (Sonic, Sonic 2, Sonic 3).
// Links come only from the normalised title the ROM already has
// (No-Intro/Redump DAT, gamelist, online rename). Nothing is guessed from genre or year.
//
// Модуль без импортов, чтобы тесты шли через `node --test`.
// No imports, so tests run with `node --test`.

export interface CollectionInput {
  id: string;
  title: string;
  cleanFile?: string;
  oldFile?: string;
  consoleShort: string;
  modKind?: string;
  boxArtUrl?: string;
  /**
   * Ручные группы (utils/manualGroups.ts). Ключ коллекции/серии, заданный пользователем, и название.
   * Пустая строка в manualSeries — игру вынули из автоматической серии.
   * Manual groups (utils/manualGroups.ts): user-set collection/series key and name.
   * An empty manualSeries means the game was taken out of its automatic series.
   */
  manualCollection?: string;
  manualCollectionLabel?: string;
  manualSeries?: string;
  manualSeriesLabel?: string;
}

/** Приводит название к ключу сравнения. / Turns a title into a comparison key. */
export function normalizeGameTitle(title: string): string {
  let s = String(title || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
  s = s
    .replace(/\.(zip|7z|rar|nes|sfc|smc|md|gen|bin|cue|chd|iso|gba|gbc|gb|n64|z64|v64|pce|sms|gg|a26|pbp|cso|m3u)$/i, '')
    .replace(/^\s*(?:#?\d{1,5}\s*[-._)\]]+\s*)/, '')
    .replace(/\[[^\]]*\]|\([^)]*\)|\{[^}]*\}/g, ' ')
    // No-Intro: «Legend of Zelda, The - A Link to the Past».
    .replace(/,\s*(the|a|an)\b(?=\s*(?:[-:–]|$))/g, ' ')
    .replace(/&/g, ' and ')
    .replace(/[’'`´]/g, '')
    .replace(/[^a-z0-9а-яё]+/gi, ' ')
    .trim();
  // «Aladdin, The» и «The Aladdin», «Disney's Aladdin» и «Aladdin».
  // "Aladdin, The" vs "The Aladdin", "Disney's Aladdin" vs "Aladdin".
  s = s
    .replace(/^(the|a|an)\s+/, '')
    .replace(/\s+(the|a|an)$/, '')
    .replace(/^disneys\s+/, '')
    .replace(/\s+(disc|disk|cd)\s*\d+(\s+of\s+\d+)?$/, '')
    .trim();
  return s.replace(/\s+/g, ' ');
}

// X одна не номер: «Mega Man X» — отдельная серия. / A lone X is not a number: "Mega Man X" is its own series.
const ROMAN: Record<string, true> = {
  ii: true, iii: true, iv: true, v: true, vi: true, vii: true, viii: true, ix: true,
  xi: true, xii: true, xiii: true, xiv: true, xv: true, xvi: true,
};

function isPartNumber(tok: string): boolean {
  return /^\d{1,2}$/.test(tok) || ROMAN[tok] === true;
}

/**
 * Ключ серии: название до подзаголовка и до номера части.
 * «Sonic the Hedgehog 2» → «sonic the hedgehog», «Castlevania: Bloodlines» → «castlevania».
 * Series key: the title before the subtitle and the part number.
 */
export function seriesKeyOf(title: string): string {
  const raw = String(title || '')
    .replace(/\[[^\]]*\]|\([^)]*\)/g, ' ')
    .split(/\s*:\s+|\s+-\s+|\s+–\s+/)[0];
  const tokens = normalizeGameTitle(raw).split(' ').filter(Boolean);
  if (tokens.length === 0) return '';
  let cut = tokens.length;
  for (let i = 1; i < tokens.length; i++) {
    if (isPartNumber(tokens[i])) {
      cut = i;
      break;
    }
  }
  const base = tokens.slice(0, cut).join(' ');
  return base.replace(/\s/g, '').length >= 4 ? base : '';
}

/** Ключ коллекции (одна игра на всех консолях). / Collection key (one game on every console). */
export function collectionKeyOf(
  g: Pick<CollectionInput, 'title' | 'cleanFile' | 'oldFile' | 'id'> & { manualCollection?: string }
): string {
  if (g.manualCollection) return g.manualCollection;
  return normalizeGameTitle(g.title) || normalizeGameTitle(g.cleanFile || '') || normalizeGameTitle(g.oldFile || '') || `#${g.id}`;
}

export interface GameCollection<T extends CollectionInput = CollectionInput> {
  key: string;
  seriesKey: string;
  /** Карточка, которая показывается в сетке. / The card shown in the grid. */
  lead: T;
  members: T[];
  consoles: string[];
  /** Название ручной коллекции. / Manual collection name. */
  label?: string;
}

function leadRank(g: CollectionInput): number {
  const original = !g.modKind || g.modKind === 'original';
  return (original ? 0 : 2) + (g.boxArtUrl ? 0 : 1);
}

/**
 * Группирует уже отфильтрованный и отсортированный список. Порядок коллекций идёт
 * по первому участнику, поэтому сортировка Библиотеки сохраняется.
 * Groups an already filtered and sorted list. Collections keep the order of their
 * first member, so the Library sort order is kept.
 */
export function buildCollections<T extends CollectionInput>(games: readonly T[]): GameCollection<T>[] {
  const byKey = new Map<string, GameCollection<T>>();
  const order: GameCollection<T>[] = [];
  for (const g of games) {
    const key = collectionKeyOf(g);
    let c = byKey.get(key);
    if (!c) {
      c = { key, seriesKey: g.manualSeries !== undefined ? g.manualSeries : seriesKeyOf(g.title), lead: g, members: [], consoles: [] };
      if (g.manualCollection && g.manualCollectionLabel) c.label = g.manualCollectionLabel;
      byKey.set(key, c);
      order.push(c);
    }
    c.members.push(g);
    // Ручная серия у любой версии игры переносит в неё всю игру. / A manual series on any version moves the whole game.
    if (g.manualSeries && !String(c.seriesKey).startsWith('m:')) c.seriesKey = g.manualSeries;
    const cs = (g.consoleShort || '').toUpperCase();
    if (cs && !c.consoles.includes(cs)) c.consoles.push(cs);
    if (leadRank(g) < leadRank(c.lead)) c.lead = g;
  }
  return order;
}

export interface CollectionIndex<T extends CollectionInput = CollectionInput> {
  byKey: Map<string, GameCollection<T>>;
  keyOfId: Map<string, string>;
  bySeries: Map<string, GameCollection<T>[]>;
}

/** Индекс по всей Библиотеке для инспектора. / Index over the whole Library for the inspector. */
export function indexCollections<T extends CollectionInput>(games: readonly T[]): CollectionIndex<T> {
  const list = buildCollections(games);
  const byKey = new Map<string, GameCollection<T>>();
  const keyOfId = new Map<string, string>();
  const bySeries = new Map<string, GameCollection<T>[]>();
  for (const c of list) {
    byKey.set(c.key, c);
    for (const m of c.members) keyOfId.set(m.id, c.key);
    if (c.seriesKey) {
      const arr = bySeries.get(c.seriesKey);
      if (arr) arr.push(c);
      else bySeries.set(c.seriesKey, [c]);
    }
  }
  return { byKey, keyOfId, bySeries };
}

/** Другие игры той же серии в Библиотеке. / Other games of the same series in the Library. */
export function seriesSiblings<T extends CollectionInput>(index: CollectionIndex<T>, gameId: string): GameCollection<T>[] {
  const key = index.keyOfId.get(gameId);
  if (!key) return [];
  const own = index.byKey.get(key);
  if (!own || !own.seriesKey) return [];
  return (index.bySeries.get(own.seriesKey) || []).filter((c) => c.key !== key);
}

// ---------------------------------------------------------------------------
// Серии: вся линейка игры. Final Fantasy, Final Fantasy VII, Final Fantasy Tactics,
// Final Fantasy X-2 — одна серия «Final Fantasy». Коллекция же — одна игра на разных консолях.
// Series: the whole line of a game. A collection is one game across consoles.

export interface GameSeries<T extends CollectionInput = CollectionInput> {
  key: string;
  /** Название серии для карточки. / Series name for the card. */
  label: string;
  lead: T;
  /** Игры серии (каждая — коллекция версий). / Games of the series (each a collection of versions). */
  games: GameCollection<T>[];
  members: T[];
  consoles: string[];
  /** Серия создана вручную. / The series was made by hand. */
  manual?: boolean;
}

/**
 * Название серии из названия игры: «Final Fantasy VIII (USA)» → «Final Fantasy»,
 * «Castlevania: Bloodlines» → «Castlevania». Сохраняет регистр исходника.
 * Series name from a game title, keeping the original case.
 */
export function seriesLabelOf(title: string, seriesKey: string): string {
  const raw = String(title || '')
    .replace(/\[[^\]]*\]|\([^)]*\)/g, ' ')
    .split(/\s*:\s+|\s+-\s+|\s+–\s+/)[0]
    .replace(/\s+/g, ' ')
    .trim();
  const want = seriesKey.split(' ').filter(Boolean).length;
  const words = raw.split(' ');
  // Берём столько слов исходника, сколько слов в ключе (артикль в начале ключ не считает).
  // Take as many source words as the key has (a leading article is not in the key).
  const lead = /^(the|a|an)$/i.test(words[0] || '') ? 1 : 0;
  let out = words.slice(0, lead + want).join(' ').replace(/[,.;]+$/, '');
  if (normalizeGameTitle(out) !== seriesKey) {
    out = seriesKey.replace(/(^|\s)(\S)/g, (_m, sp, ch) => sp + ch.toUpperCase());
  }
  return out;
}

function startsWithWords(full: string, prefix: string): boolean {
  return full === prefix || full.startsWith(prefix + ' ');
}

/**
 * Группирует отфильтрованный список по сериям. Основа серии — ключ серии игры, у которой
 * в названии есть номер части или подзаголовок, либо который встречается у двух и больше игр.
 * Игра попадает в самую короткую подходящую основу: «Final Fantasy Tactics» → «final fantasy».
 * Groups a filtered list by series. A series base is the series key of a game with a part
 * number or subtitle, or one shared by two or more games. A game joins the shortest base
 * its title starts with.
 */
export function buildSeries<T extends CollectionInput>(games: readonly T[]): GameSeries<T>[] {
  const cols = buildCollections(games);
  const keyCount = new Map<string, number>();
  const bases = new Set<string>();
  const manualLabel = new Map<string, string>();
  for (const c of cols) {
    for (const m of c.members) {
      if (m.manualSeries && m.manualSeriesLabel && !manualLabel.has(m.manualSeries)) manualLabel.set(m.manualSeries, m.manualSeriesLabel);
    }
  }
  const isManual = (c: GameCollection<T>) => manualLabel.has(c.seriesKey) || c.seriesKey.startsWith('m:');
  const isDetached = (c: GameCollection<T>) => c.members.some((m) => m.manualSeries === '');
  for (const c of cols) {
    if (!c.seriesKey || isManual(c)) continue;
    keyCount.set(c.seriesKey, (keyCount.get(c.seriesKey) || 0) + 1);
    if (c.seriesKey !== c.key) bases.add(c.seriesKey);
  }
  for (const [k, n] of keyCount) if (n > 1) bases.add(k);
  const sortedBases = Array.from(bases).sort((a, b) => a.length - b.length);

  const byKey = new Map<string, GameSeries<T>>();
  const order: GameSeries<T>[] = [];
  for (const c of cols) {
    // Ручная серия важнее автоматической; вынутая из серии игра стоит отдельно.
    // A manual series wins over the automatic one; a detached game stands alone.
    const base = isManual(c)
      ? c.seriesKey
      : isDetached(c)
      ? `#solo:${c.key}`
      : sortedBases.find((b) => startsWithWords(c.key, b)) || c.seriesKey || c.key;
    let s = byKey.get(base);
    if (!s) {
      s = { key: base, label: '', lead: c.lead, games: [], members: [], consoles: [] };
      byKey.set(base, s);
      order.push(s);
    }
    s.games.push(c);
    s.members.push(...c.members);
    for (const cs of c.consoles) if (!s.consoles.includes(cs)) s.consoles.push(cs);
  }
  for (const s of order) {
    // Лицо серии: первая часть (название ровно как серия), иначе первая по порядку с обложкой.
    // Series lead: the first entry (title equal to the series), else the first with box art.
    const exact = s.games.find((c) => c.key === s.key);
    const withArt = s.games.find((c) => c.lead.boxArtUrl);
    s.lead = (exact || withArt || s.games[0]).lead;
    const ml = manualLabel.get(s.key);
    s.label = ml || (s.games.length > 1 ? seriesLabelOf(s.lead.title, s.key) : s.games[0].label || s.lead.title);
    if (ml) s.manual = true;
  }
  return order;
}

// ---------------------------------------------------------------------------
// Фильтр Библиотеки по группам: что показывать — игры из коллекций, из серий, одиночные.
// Можно отметить несколько пунктов. Принадлежность считается по всей Библиотеке, поэтому
// фильтр работает и когда слева выбрана одна консоль.
// Library group filter: show games from collections, from series, single games, any mix.
// Membership is computed over the whole Library, so the filter also works inside one console.

export interface LibraryGroupFilter {
  collections: boolean;
  series: boolean;
  singles: boolean;
}

export const GROUP_FILTER_ALL: LibraryGroupFilter = { collections: true, series: true, singles: true };

export interface GroupMembership {
  /** id ромов, у игры которых 2+ версии (консоли, регионы, хаки). / ROM ids whose game has 2+ versions. */
  inCollection: Set<string>;
  /** id ромов из серий с 2+ играми. / ROM ids from series with 2+ games. */
  inSeries: Set<string>;
}

export function groupMembership<T extends CollectionInput>(games: readonly T[]): GroupMembership {
  const inCollection = new Set<string>();
  const inSeries = new Set<string>();
  for (const s of buildSeries(games)) {
    if (s.games.length > 1) for (const m of s.members) inSeries.add(m.id);
    for (const c of s.games) {
      if (c.members.length > 1) for (const m of c.members) inCollection.add(m.id);
    }
  }
  return { inCollection, inSeries };
}

export function isGroupFilterAll(f: LibraryGroupFilter): boolean {
  return f.collections && f.series && f.singles;
}

export function passesGroupFilter(id: string, m: GroupMembership, f: LibraryGroupFilter): boolean {
  if (isGroupFilterAll(f)) return true;
  const col = m.inCollection.has(id);
  const ser = m.inSeries.has(id);
  return (f.collections && col) || (f.series && ser) || (f.singles && !col && !ser);
}
