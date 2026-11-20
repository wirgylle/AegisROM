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

const ROMAN: Record<string, true> = { ii: true, iii: true, iv: true, v: true, vi: true, vii: true, viii: true, ix: true };

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
export function collectionKeyOf(g: Pick<CollectionInput, 'title' | 'cleanFile' | 'oldFile' | 'id'>): string {
  return normalizeGameTitle(g.title) || normalizeGameTitle(g.cleanFile || '') || normalizeGameTitle(g.oldFile || '') || `#${g.id}`;
}

export interface GameCollection<T extends CollectionInput = CollectionInput> {
  key: string;
  seriesKey: string;
  /** Карточка, которая показывается в сетке. / The card shown in the grid. */
  lead: T;
  members: T[];
  consoles: string[];
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
      c = { key, seriesKey: seriesKeyOf(g.title), lead: g, members: [], consoles: [] };
      byKey.set(key, c);
      order.push(c);
    }
    c.members.push(g);
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
