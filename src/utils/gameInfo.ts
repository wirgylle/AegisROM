// Описание игры, платформы и серия из открытых баз Wikidata и Wikipedia.
// Без ключей и регистрации, CORS разрешён (origin=*). Запрос идёт только при выборе игры
// в инспекторе, ответ кэшируется в localStorage. Совпадение ищем по названию среди
// элементов «видеоигра» (Q7889); консоль даёт бонус, но не обязательна.
//
// Game description, platforms and series from the open Wikidata and Wikipedia databases.
// No keys or sign-up, CORS is allowed (origin=*). A request is made only when a game is
// selected in the inspector, and the answer is cached in localStorage. We match by title among
// "video game" items (Q7889); the console adds a bonus but is not required.
//
// Импортирует только gameCollections, чтобы тесты шли через `node --test`.

import { normalizeGameTitle } from './gameCollections.ts';

const WD_API = 'https://www.wikidata.org/w/api.php';
const VIDEO_GAME = 'Q7889';

/**
 * Консоль AegisROM → элемент Wikidata. Нужен только для бонуса при выборе совпадения
 * и для отметки «есть в библиотеке», поэтому ошибка в одном id ничего не ломает.
 * AegisROM console → Wikidata item. Used only as a match bonus and to mark
 * "in your library", so a wrong id here breaks nothing.
 */
export const CONSOLE_WIKIDATA: Record<string, string> = {
  nes: 'Q172742',
  snes: 'Q183259',
  n64: 'Q184839',
  gb: 'Q186437',
  gbc: 'Q203992',
  gba: 'Q188642',
  nds: 'Q170323',
  gc: 'Q182172',
  genesis: 'Q10676',
  mastersystem: 'Q209868',
  gamegear: 'Q751719',
  segacd: 'Q1047516',
  sega32x: 'Q1063978',
  saturn: 'Q200912',
  dreamcast: 'Q184198',
  psx: 'Q10677',
  ps2: 'Q10680',
  psp: 'Q170325',
  pcengine: 'Q1057377',
  atari2600: 'Q206261',
};

const CONSOLE_ALIASES: Record<string, string> = {
  fc: 'nes',
  famicom: 'nes',
  sfc: 'snes',
  md: 'genesis',
  megadrive: 'genesis',
  gen: 'genesis',
  sms: 'mastersystem',
  gg: 'gamegear',
  pce: 'pcengine',
  tg16: 'pcengine',
  ps1: 'psx',
  playstation: 'psx',
  a26: 'atari2600',
  scd: 'segacd',
  megacd: 'segacd',
  '32x': 'sega32x',
  ngc: 'gc',
  gamecube: 'gc',
  ds: 'nds',
  dc: 'dreamcast',
};

export function consoleKey(consoleShort: string): string {
  const k = String(consoleShort || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return CONSOLE_ALIASES[k] || k;
}

export function consoleWikidataId(consoleShort: string): string | undefined {
  return CONSOLE_WIKIDATA[consoleKey(consoleShort)];
}

/** Обратная карта: элемент Wikidata → консоль AegisROM. / Reverse map: Wikidata item → AegisROM console. */
export function consoleOfWikidataId(qid: string): string | undefined {
  for (const [k, v] of Object.entries(CONSOLE_WIKIDATA)) if (v === qid) return k;
  return undefined;
}

export interface WdRef {
  id: string;
  label: string;
}

export interface GameInfo {
  /** Элемент Wikidata. / Wikidata item. */
  qid: string;
  label: string;
  /** Короткое описание Wikidata (одна строка). / Wikidata one-line description. */
  shortDescription?: string;
  /** Выдержка из Wikipedia. / Wikipedia extract. */
  extract?: string;
  extractLang?: string;
  wikiUrl?: string;
  wikidataUrl: string;
  year?: number;
  platforms: WdRef[];
  series: WdRef[];
  /** Другие игры серии из Wikidata, по дате выхода. / Other series games from Wikidata, by release date. */
  seriesGames: Array<WdRef & { year?: number; seriesId: string }>;
}

// ---------------------------------------------------------------------------
// Разбор ответов Wikidata. / Parsing Wikidata answers.
// ---------------------------------------------------------------------------

type WdEntity = {
  id: string;
  labels?: Record<string, { value: string }>;
  descriptions?: Record<string, { value: string }>;
  aliases?: Record<string, Array<{ value: string }>>;
  claims?: Record<string, Array<{ mainsnak?: { datavalue?: { value?: any } } }>>;
  sitelinks?: Record<string, { title: string }>;
};

export function pickLang<T>(map: Record<string, T> | undefined, langs: string[]): T | undefined {
  if (!map) return undefined;
  for (const l of langs) if (map[l]) return map[l];
  return undefined;
}

export function claimIds(e: WdEntity, prop: string): string[] {
  const out: string[] = [];
  for (const c of e.claims?.[prop] || []) {
    const id = c.mainsnak?.datavalue?.value?.id;
    if (typeof id === 'string' && !out.includes(id)) out.push(id);
  }
  return out;
}

export function claimYear(e: WdEntity, prop = 'P577'): number | undefined {
  let best: number | undefined;
  for (const c of e.claims?.[prop] || []) {
    const t = c.mainsnak?.datavalue?.value?.time;
    const m = typeof t === 'string' ? /^([+-]\d{4,})-/.exec(t) : null;
    if (m) {
      const y = parseInt(m[1], 10);
      if (Number.isFinite(y) && (best === undefined || y < best)) best = y;
    }
  }
  return best;
}

/**
 * Оценка кандидата: точное название (на любом из языков или в синонимах) обязательно,
 * консоль и статья в Wikipedia дают бонус. Возвращает -1, если название не совпало.
 * Candidate score: an exact title (any label or alias) is required; the console and a
 * Wikipedia article add a bonus. Returns -1 when the title does not match.
 */
export function scoreCandidate(e: WdEntity, wantKey: string, consoleQid?: string): number {
  const names: string[] = [];
  for (const v of Object.values(e.labels || {})) names.push(v.value);
  for (const arr of Object.values(e.aliases || {})) for (const a of arr) names.push(a.value);
  const exact = names.some((n) => normalizeGameTitle(n) === wantKey);
  if (!exact) return -1;
  if (!claimIds(e, 'P31').length) return -1;
  let score = 10;
  if (consoleQid && claimIds(e, 'P400').includes(consoleQid)) score += 5;
  if (e.sitelinks?.enwiki || e.sitelinks?.ruwiki) score += 2;
  return score;
}

export function pickBestEntity(entities: WdEntity[], wantKey: string, consoleQid?: string): WdEntity | undefined {
  let best: WdEntity | undefined;
  let bestScore = -1;
  for (const e of entities) {
    const s = scoreCandidate(e, wantKey, consoleQid);
    if (s > bestScore) {
      best = e;
      bestScore = s;
    }
  }
  return bestScore >= 0 ? best : undefined;
}

// ---------------------------------------------------------------------------
// Сеть. / Network.
// ---------------------------------------------------------------------------

type FetchLike = (url: string, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<any> }>;

function wdUrl(params: Record<string, string>): string {
  const q = new URLSearchParams({ format: 'json', origin: '*', ...params });
  return `${WD_API}?${q.toString()}`;
}

async function getJson(fetcher: FetchLike, url: string, signal?: AbortSignal): Promise<any> {
  const r = await fetcher(url, { signal });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function searchItems(fetcher: FetchLike, query: string, limit: number, signal?: AbortSignal): Promise<string[]> {
  const data = await getJson(
    fetcher,
    wdUrl({ action: 'query', list: 'search', srsearch: query, srlimit: String(limit), srnamespace: '0' }),
    signal
  );
  return (data?.query?.search || []).map((s: any) => String(s.title)).filter((id: string) => /^Q\d+$/.test(id));
}

async function getEntities(
  fetcher: FetchLike,
  ids: string[],
  props: string,
  langs: string[],
  signal?: AbortSignal
): Promise<WdEntity[]> {
  const out: WdEntity[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    if (!chunk.length) continue;
    const data = await getJson(
      fetcher,
      wdUrl({
        action: 'wbgetentities',
        ids: chunk.join('|'),
        props,
        languages: langs.join('|'),
        sitefilter: langs.map((l) => `${l}wiki`).join('|'),
      }),
      signal
    );
    for (const e of Object.values(data?.entities || {})) {
      if (e && typeof (e as any).id === 'string' && !(e as any).missing) out.push(e as WdEntity);
    }
  }
  return out;
}

async function wikiSummary(
  fetcher: FetchLike,
  lang: string,
  title: string,
  signal?: AbortSignal
): Promise<{ extract?: string; url?: string } | undefined> {
  const url = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`;
  try {
    const data = await getJson(fetcher, url, signal);
    const extract = typeof data?.extract === 'string' ? data.extract.trim() : '';
    if (!extract) return undefined;
    return { extract, url: data?.content_urls?.desktop?.page || `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title)}` };
  } catch {
    return undefined;
  }
}

export interface LookupOptions {
  title: string;
  consoleShort: string;
  /** Языки по порядку, например ['ru', 'en']. / Languages in order, e.g. ['ru', 'en']. */
  langs: string[];
  signal?: AbortSignal;
  fetcher?: FetchLike;
}

/** Ищет игру в Wikidata. undefined, если точного совпадения нет. / Looks the game up; undefined when there is no exact match. */
export async function lookupGameInfo(opts: LookupOptions): Promise<GameInfo | undefined> {
  const fetcher: FetchLike = opts.fetcher || ((u, i) => fetch(u, i) as any);
  const langs = Array.from(new Set([...opts.langs, 'en']));
  const wantKey = normalizeGameTitle(opts.title);
  if (!wantKey) return undefined;
  const consoleQid = consoleWikidataId(opts.consoleShort);
  const cleanTitle = opts.title.replace(/\[[^\]]*\]|\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();

  const ids = await searchItems(fetcher, `${cleanTitle} haswbstatement:P31=${VIDEO_GAME}`, 8, opts.signal);
  if (!ids.length) return undefined;
  const candidates = await getEntities(fetcher, ids, 'labels|aliases|descriptions|claims|sitelinks', langs, opts.signal);
  const best = pickBestEntity(candidates, wantKey, consoleQid);
  if (!best) return undefined;

  const platformIds = claimIds(best, 'P400');
  const seriesIds = claimIds(best, 'P179');

  // Другие игры серии: элементы, у которых P179 = эта серия.
  // Other series games: items whose P179 is this series.
  const seriesGameIds: Array<{ id: string; seriesId: string }> = [];
  for (const sid of seriesIds.slice(0, 2)) {
    const found = await searchItems(fetcher, `haswbstatement:P179=${sid}`, 50, opts.signal);
    for (const id of found) if (id !== best.id && !seriesGameIds.some((x) => x.id === id)) seriesGameIds.push({ id, seriesId: sid });
  }

  const labelIds = Array.from(new Set([...platformIds, ...seriesIds]));
  const labelEntities = labelIds.length ? await getEntities(fetcher, labelIds, 'labels', langs, opts.signal) : [];
  const seriesEntities = seriesGameIds.length
    ? await getEntities(fetcher, seriesGameIds.map((x) => x.id), 'labels|claims', langs, opts.signal)
    : [];
  const labelOf = (id: string, list: WdEntity[]) => pickLang(list.find((e) => e.id === id)?.labels, langs)?.value || id;

  let extract: string | undefined;
  let extractLang: string | undefined;
  let wikiUrl: string | undefined;
  for (const l of langs) {
    const link = best.sitelinks?.[`${l}wiki`]?.title;
    if (!link) continue;
    const s = await wikiSummary(fetcher, l, link, opts.signal);
    if (s?.extract) {
      extract = s.extract;
      extractLang = l;
      wikiUrl = s.url;
      break;
    }
  }

  const seriesGames = seriesEntities
    .filter((e) => claimIds(e, 'P31').length > 0)
    .map((e) => ({
      id: e.id,
      label: pickLang(e.labels, langs)?.value || e.id,
      year: claimYear(e),
      seriesId: seriesGameIds.find((x) => x.id === e.id)?.seriesId || '',
    }))
    .sort((a, b) => (a.year ?? 9999) - (b.year ?? 9999) || a.label.localeCompare(b.label));

  return {
    qid: best.id,
    label: pickLang(best.labels, langs)?.value || opts.title,
    shortDescription: pickLang(best.descriptions, langs)?.value,
    extract,
    extractLang,
    wikiUrl,
    wikidataUrl: `https://www.wikidata.org/wiki/${best.id}`,
    year: claimYear(best),
    platforms: platformIds.map((id) => ({ id, label: labelOf(id, labelEntities) })),
    series: seriesIds.map((id) => ({ id, label: labelOf(id, labelEntities) })),
    seriesGames,
  };
}

// ---------------------------------------------------------------------------
// Кэш. / Cache.
// ---------------------------------------------------------------------------

const CACHE_PREFIX = 'aegis.gameinfo.v1:';
const HIT_TTL_MS = 30 * 24 * 3600 * 1000;
const MISS_TTL_MS = 24 * 3600 * 1000;

export function gameInfoCacheKey(title: string, consoleShort: string, lang: string): string {
  return `${CACHE_PREFIX}${lang}:${consoleKey(consoleShort)}:${normalizeGameTitle(title)}`;
}

/** null = известно, что совпадения нет; undefined = в кэше нет. / null = known miss; undefined = not cached. */
export function readGameInfoCache(key: string): GameInfo | null | undefined {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    if (!raw) return undefined;
    const rec = JSON.parse(raw) as { at: number; info: GameInfo | null };
    const ttl = rec.info ? HIT_TTL_MS : MISS_TTL_MS;
    if (!rec || typeof rec.at !== 'number' || Date.now() - rec.at > ttl) return undefined;
    return rec.info;
  } catch {
    return undefined;
  }
}

export function writeGameInfoCache(key: string, info: GameInfo | null): void {
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify({ at: Date.now(), info }));
  } catch {
    // Переполнение хранилища не критично. / A full storage is not critical.
  }
}
