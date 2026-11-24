// Ручные коллекции и серии и предложения после скана.
// Пользователь сам собирает коллекцию (одна игра на разных консолях) или серию (линейка игр),
// переименовывает их, добавляет и убирает игры, может вынуть игру из автоматической группы.
// После скана AegisROM ищет игры, которые похоже относятся к группе, и предлагает их добавить.
// Без подтверждения ничего не меняется: принять или отклонить решает пользователь.
// Ключ игры тот же, что у ручных правок: консоль + CRC32, иначе id строки.
//
// Manual collections and series, and suggestions after a scan.
// The user builds a collection (one game across consoles) or a series (a game line) by hand,
// renames it, adds and removes games, and can take a game out of an automatic group.
// After a scan AegisROM looks for games that seem to belong to a group and suggests adding them.
// Nothing changes without confirmation: the user accepts or rejects each suggestion.
// The game key is the same as for manual edits: console + CRC32, otherwise the row id.

import { buildCollections, buildSeries, normalizeGameTitle, seriesKeyOf, type CollectionInput } from './gameCollections.ts';
import { manualEditKey } from './manualEdits.ts';

export type ManualGroupKind = 'collection' | 'series';

export interface ManualGroup {
  id: string;
  kind: ManualGroupKind;
  name: string;
  /** Ключи игр (manualEditKey). / Game keys (manualEditKey). */
  members: string[];
  createdAt: number;
}

export interface ManualGroupsState {
  groups: ManualGroup[];
  /** Игры, вынутые из автоматической коллекции или серии. / Games taken out of an automatic group. */
  detached: Record<string, { collection?: boolean; series?: boolean }>;
  /** Отклонённые предложения. / Rejected suggestions. */
  rejected: string[];
}

export interface GroupRowLike extends CollectionInput {
  crc32?: string;
}

export const gameKeyOf = (row: { consoleShort?: string; crc32?: string; id: string }): string => manualEditKey(row);

export const manualCollectionKey = (id: string) => `m:c:${id}`;
export const manualSeriesKey = (id: string) => `m:s:${id}`;

// ---------------------------------------------------------------------------
// Чистая логика (тестируется без localStorage). / Pure logic (tested without localStorage).

export function emptyGroupsState(): ManualGroupsState {
  return { groups: [], detached: {}, rejected: [] };
}

/**
 * Накладывает ручные группы на строки: ставит manualCollection/manualSeries.
 * Строки без ручных групп возвращаются как есть (тот же объект).
 * Lays manual groups over rows. Rows without manual groups are returned as is.
 */
export function applyManualGroups<T extends GroupRowLike>(rows: readonly T[], state: ManualGroupsState): T[] {
  if (state.groups.length === 0 && Object.keys(state.detached).length === 0) return rows as T[];
  const colOf = new Map<string, ManualGroup>();
  const serOf = new Map<string, ManualGroup>();
  for (const g of state.groups) {
    const map = g.kind === 'collection' ? colOf : serOf;
    for (const k of g.members) if (!map.has(k)) map.set(k, g);
  }
  return rows.map((r) => {
    const key = gameKeyOf(r);
    const col = colOf.get(key);
    const ser = serOf.get(key);
    const det = state.detached[key];
    if (!col && !ser && !det) return r;
    const out: T = { ...r };
    if (col) {
      out.manualCollection = manualCollectionKey(col.id);
      out.manualCollectionLabel = col.name;
    } else if (det?.collection) {
      out.manualCollection = `#solo:${r.id}`;
    }
    if (ser) {
      out.manualSeries = manualSeriesKey(ser.id);
      out.manualSeriesLabel = ser.name;
    } else if (det?.series) {
      out.manualSeries = '';
    }
    return out;
  });
}

/**
 * Одна игра внутри предложения серии: все её версии (консоли, регионы).
 * One game inside a series suggestion: all its versions (consoles, regions).
 */
export interface SuggestionPart {
  title: string;
  consoles: string[];
  gameIds: string[];
  gameKeys: string[];
}

export interface GroupSuggestion {
  /** Стабильный id для «отклонить». / Stable id used to reject. */
  id: string;
  kind: ManualGroupKind;
  /** Добавить в существующую ручную группу или создать новую. / Add to a manual group or create a new one. */
  action: 'add' | 'create';
  groupId?: string;
  name: string;
  /** Игры, которые предлагается добавить. / Games proposed for the group. */
  gameIds: string[];
  gameKeys: string[];
  reason: 'same-game' | 'same-series' | 'common-prefix' | 'multi-console';
  /**
   * Для новой серии: игры серии, каждая со своими версиями. Так видно, где одна игра на
   * нескольких консолях (коллекция), а где разные игры (серия).
   * For a new series: its games, each with its versions, so a game on several consoles
   * (a collection) is told apart from different games (a series).
   */
  parts?: SuggestionPart[];
  /** Консоли коллекции. / Consoles of a collection. */
  consoles?: string[];
  /** Коллекция внутри предложенной серии: id этого предложения. / Collection inside a suggested series. */
  parentId?: string;
  /** Название серии, в которую входит коллекция. / Name of the series the collection belongs to. */
  seriesName?: string;
}

/** Правки предложения перед «Принять». / Edits to a suggestion before "Accept". */
export interface SuggestionEdit {
  name?: string;
  kind?: ManualGroupKind;
  /** Ключи игр, снятые галочкой. / Game keys the user unticked. */
  excluded?: readonly string[];
}

// Слова, на которых общий префикс не заканчивается: «Legend of …», «Kirby's …».
// Words a common prefix may not end with.
const STOP_TAIL = new Set(['of', 'and', 'the', 'a', 'an', 'to', 'in', 'on', 'no', 'de', 'la', 'le', 'vs', 'for', 's']);

/** Название без скобок региона и ревизии. / Title without region and revision brackets. */
export function plainTitle(title: string): string {
  return String(title || '').replace(/\[[^\]]*\]|\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim() || String(title || '');
}

function uniqueConsoles(rows: readonly { consoleShort?: string }[]): string[] {
  const out: string[] = [];
  for (const r of rows) {
    const c = String(r.consoleShort || '').toUpperCase();
    if (c && !out.includes(c)) out.push(c);
  }
  return out;
}

function titleCasePrefix(title: string, words: number): string {
  const raw = String(title || '')
    .replace(/\[[^\]]*\]|\([^)]*\)/g, ' ')
    .replace(/^\s*(the|a|an)\s+/i, '')
    .replace(/^disney'?s\s+/i, '')
    .split(/[\s\-–:]+/)
    .filter(Boolean)
    .slice(0, words)
    .join(' ')
    .replace(/[,.;:]+$/, '');
  return raw || title;
}

/**
 * Предложения: что добавить в ручные группы и какие новые серии создать.
 * rows — строки уже после applyManualGroups.
 * Suggestions: what to add to manual groups and which new series to create.
 * rows must already have manual groups applied.
 */
export function suggestGroups<T extends GroupRowLike>(rows: readonly T[], state: ManualGroupsState): GroupSuggestion[] {
  const rejected = new Set(state.rejected);
  const out: GroupSuggestion[] = [];
  const byGroup = new Map<string, ManualGroup>(state.groups.map((g) => [g.id, g]));

  // 1–2. Добавить в ручные группы игры с тем же названием или той же серией.
  // 1–2. Add games with the same title or the same series to manual groups.
  const memberCols = new Map<string, Set<string>>(); // groupId -> auto collection keys
  const memberSeries = new Map<string, Set<string>>(); // groupId -> auto series keys
  for (const r of rows) {
    const gid = r.manualCollection?.startsWith('m:c:') ? r.manualCollection.slice(4) : '';
    if (gid) {
      const set = memberCols.get(gid) || new Set<string>();
      const k = normalizeGameTitle(r.title);
      if (k) set.add(k);
      memberCols.set(gid, set);
    }
    const sid = r.manualSeries?.startsWith('m:s:') ? r.manualSeries.slice(4) : '';
    if (sid) {
      const set = memberSeries.get(sid) || new Set<string>();
      const k = seriesKeyOf(r.title) || normalizeGameTitle(r.title);
      if (k) set.add(k);
      memberSeries.set(sid, set);
    }
  }
  // Название ручной серии тоже основа: «Super Mario» ловит «Super Mario World».
  // The manual series name is a base too.
  for (const g of state.groups) {
    if (g.kind !== 'series') continue;
    const k = normalizeGameTitle(g.name);
    if (k.replace(/\s/g, '').length < 4) continue;
    const set = memberSeries.get(g.id) || new Set<string>();
    set.add(k);
    memberSeries.set(g.id, set);
  }
  const pending = new Map<string, GroupSuggestion>();
  const push = (groupId: string, r: T, reason: GroupSuggestion['reason']) => {
    const g = byGroup.get(groupId);
    if (!g) return;
    const key = gameKeyOf(r);
    const id = `add:${groupId}:${key}`;
    if (rejected.has(id)) return;
    const sid = `add:${groupId}`;
    let s = pending.get(sid);
    if (!s) {
      s = { id: sid, kind: g.kind, action: 'add', groupId, name: g.name, gameIds: [], gameKeys: [], reason };
      pending.set(sid, s);
    }
    if (!s.gameKeys.includes(key)) {
      s.gameKeys.push(key);
      s.gameIds.push(r.id);
    }
  };
  for (const r of rows) {
    const key = gameKeyOf(r);
    const det = state.detached[key];
    if (!r.manualCollection && !det?.collection) {
      const k = normalizeGameTitle(r.title);
      for (const [gid, keys] of memberCols) if (k && keys.has(k)) push(gid, r, 'same-game');
    }
    if (!r.manualSeries && !det?.series) {
      const sk = seriesKeyOf(r.title);
      const nk = normalizeGameTitle(r.title);
      for (const [gid, keys] of memberSeries) {
        let hit = false;
        for (const k of keys) {
          if ((sk && sk === k) || nk === k || nk.startsWith(k + ' ')) {
            hit = true;
            break;
          }
        }
        if (hit) push(gid, r, 'same-series');
      }
    }
  }
  // Каждая игра уходит в одно предложение каждого вида. / Each game goes to one suggestion per kind.
  for (const s of pending.values()) {
    // Ключи отдельных игр в id, чтобы отклонение одной не прятало будущие. / Per-game keys in the id.
    s.id = `add:${s.groupId}:${s.gameKeys.join('|')}`;
    out.push(s);
  }

  // 3. Новые серии: разные автоматические серии с общими первыми двумя словами
  //    («Super Mario Bros.», «Super Mario World» → «Super Mario»).
  //    В серии должно быть минимум две разные игры: одна игра на разных консолях — это коллекция.
  // 3. New series: automatic series sharing the first two words.
  //    A series needs at least two different games: one game on several consoles is a collection.
  const free = rows.filter((r) => !r.manualSeries && r.manualSeries !== '');
  const series = buildSeries(free);
  const byPrefix = new Map<string, typeof series>();
  for (const s of series) {
    if (s.key.startsWith('#')) continue;
    const words = s.key.split(' ').filter(Boolean);
    if (words.length < 2) continue;
    if (STOP_TAIL.has(words[1]) || STOP_TAIL.has(words[0])) continue;
    const prefix = words.slice(0, 2).join(' ');
    if (prefix.replace(/\s/g, '').length < 6) continue;
    const arr = byPrefix.get(prefix) || [];
    arr.push(s);
    byPrefix.set(prefix, arr);
  }
  // Серия, в которую входит игра (ручная или предложенная): для коллекций внутри серий.
  // The series a game belongs to (manual or suggested): for collections inside series.
  const seriesOfKey = new Map<string, { name: string; parentId?: string }>();
  for (const [prefix, list] of byPrefix) {
    if (list.length < 2) continue;
    const members = list.flatMap((s) => s.members);
    const parts: SuggestionPart[] = buildCollections(members).map((c) => {
      const keys: string[] = [];
      const ids: string[] = [];
      for (const m of c.members) {
        const k = gameKeyOf(m);
        if (!keys.includes(k)) {
          keys.push(k);
          ids.push(m.id);
        }
      }
      return { title: plainTitle(c.lead.title), consoles: c.consoles.slice(), gameIds: ids, gameKeys: keys };
    });
    if (parts.length < 2) continue;
    const id = `new:${prefix}`;
    const lead = list.find((s) => s.key === prefix)?.lead || list[0].lead;
    const name = titleCasePrefix(lead.title, 2);
    const rejectedSeries = rejected.has(id);
    for (const p of parts) for (const k of p.gameKeys) seriesOfKey.set(k, { name, parentId: rejectedSeries ? undefined : id });
    if (rejectedSeries) continue;
    out.push({
      id,
      kind: 'series',
      action: 'create',
      name,
      gameIds: parts.flatMap((p) => p.gameIds),
      gameKeys: parts.flatMap((p) => p.gameKeys),
      reason: 'common-prefix',
      parts,
    });
  }
  // Автоматические серии из двух и больше игр: Super Mario Bros. на NES и GBC внутри «Super Mario».
  // Automatic series of two or more games.
  for (const s of series) {
    if (s.games.length < 2 || s.key.startsWith('#')) continue;
    for (const m of s.members) {
      const k = gameKeyOf(m);
      if (!seriesOfKey.has(k)) seriesOfKey.set(k, { name: s.label });
    }
  }
  // Ручные серии тоже: коллекция внутри уже собранной серии.
  // Manual series too: a collection inside a series the user already made.
  for (const r of rows) {
    const sid = r.manualSeries?.startsWith('m:s:') ? r.manualSeries.slice(4) : '';
    const g = sid ? byGroup.get(sid) : undefined;
    if (g) seriesOfKey.set(gameKeyOf(r), { name: g.name });
  }

  // 4. Новые коллекции: одна и та же игра на двух и больше консолях внутри серии.
  //    Автоматически такие версии уже стоят вместе; ручная коллекция закрепляет их и даёт название.
  //    Игры вне серий не предлагаем, чтобы не засыпать окно сотнями очевидных пар.
  // 4. New collections: the same game on two or more consoles inside a series.
  //    Games outside series are not suggested, so the window is not flooded with obvious pairs.
  const freeCols = rows.filter((r) => !r.manualCollection && !state.detached[gameKeyOf(r)]?.collection);
  for (const c of buildCollections(freeCols)) {
    if (c.key.startsWith('#') || c.consoles.length < 2) continue;
    const id = `newc:${c.key}`;
    if (rejected.has(id)) continue;
    const keys: string[] = [];
    const ids: string[] = [];
    let ser: { name: string; parentId?: string } | undefined;
    for (const m of c.members) {
      const k = gameKeyOf(m);
      ser = ser || seriesOfKey.get(k);
      if (!keys.includes(k)) {
        keys.push(k);
        ids.push(m.id);
      }
    }
    if (!ser) continue;
    out.push({
      id,
      kind: 'collection',
      action: 'create',
      name: plainTitle(c.lead.title),
      gameIds: ids,
      gameKeys: keys,
      reason: 'multi-console',
      consoles: uniqueConsoles(c.members),
      parentId: ser.parentId,
      seriesName: ser.name,
    });
  }
  return out;
}

// Чистые изменения состояния. / Pure state changes.

export function withMembersAdded(state: ManualGroupsState, groupId: string, keys: readonly string[]): ManualGroupsState {
  const g = state.groups.find((x) => x.id === groupId);
  if (!g) return state;
  const add = new Set(keys);
  const groups = state.groups.map((x) => {
    if (x.id === groupId) return { ...x, members: Array.from(new Set([...x.members, ...keys])) };
    // Игра в одной ручной группе каждого вида. / A game is in one manual group of each kind.
    if (x.kind === g.kind && x.members.some((k) => add.has(k))) return { ...x, members: x.members.filter((k) => !add.has(k)) };
    return x;
  });
  const detached = { ...state.detached };
  for (const k of keys) {
    const d = detached[k];
    if (!d) continue;
    const next = { ...d };
    delete next[g.kind];
    if (next.collection || next.series) detached[k] = next;
    else delete detached[k];
  }
  return { ...state, groups, detached };
}

export function withMembersRemoved(state: ManualGroupsState, groupId: string, keys: readonly string[]): ManualGroupsState {
  const drop = new Set(keys);
  return {
    ...state,
    groups: state.groups.map((x) => (x.id === groupId ? { ...x, members: x.members.filter((k) => !drop.has(k)) } : x)),
  };
}

export function withDetached(state: ManualGroupsState, kind: ManualGroupKind, keys: readonly string[], on: boolean): ManualGroupsState {
  const detached = { ...state.detached };
  for (const k of keys) {
    const next = { ...(detached[k] || {}) };
    if (on) next[kind] = true;
    else delete next[kind];
    if (next.collection || next.series) detached[k] = next;
    else delete detached[k];
  }
  return { ...state, detached };
}

export function sanitizeGroupsState(input: unknown): ManualGroupsState {
  const out = emptyGroupsState();
  if (!input || typeof input !== 'object') return out;
  const src = input as Record<string, unknown>;
  if (Array.isArray(src.groups)) {
    for (const g of src.groups as Record<string, unknown>[]) {
      if (!g || typeof g !== 'object') continue;
      if (typeof g.id !== 'string' || (g.kind !== 'collection' && g.kind !== 'series')) continue;
      out.groups.push({
        id: g.id,
        kind: g.kind,
        name: typeof g.name === 'string' && g.name.trim() ? g.name.trim() : g.id,
        members: Array.isArray(g.members) ? (g.members as unknown[]).filter((k): k is string => typeof k === 'string') : [],
        createdAt: typeof g.createdAt === 'number' ? g.createdAt : 0,
      });
    }
  }
  if (src.detached && typeof src.detached === 'object') {
    for (const [k, v] of Object.entries(src.detached as Record<string, unknown>)) {
      if (!v || typeof v !== 'object') continue;
      const d = v as Record<string, unknown>;
      const e: { collection?: boolean; series?: boolean } = {};
      if (d.collection === true) e.collection = true;
      if (d.series === true) e.series = true;
      if (e.collection || e.series) out.detached[k] = e;
    }
  }
  if (Array.isArray(src.rejected)) out.rejected = (src.rejected as unknown[]).filter((x): x is string => typeof x === 'string');
  return out;
}

// ---------------------------------------------------------------------------
// Хранилище: localStorage + сохранение в файл базы. / Store: localStorage plus the database file.

const STORAGE_KEY = 'aegis.manualGroups.v1';
let state: ManualGroupsState = emptyGroupsState();
let loaded = false;
let version = 0;
const listeners = new Set<() => void>();

function storage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

function load() {
  if (loaded) return;
  loaded = true;
  const ls = storage();
  if (!ls) return;
  try {
    const raw = ls.getItem(STORAGE_KEY);
    if (raw) state = sanitizeGroupsState(JSON.parse(raw));
  } catch {
    // ignore
  }
}

function commit(next: ManualGroupsState) {
  state = next;
  const ls = storage();
  if (ls) {
    try {
      ls.setItem(STORAGE_KEY, JSON.stringify({ v: 1, ...state }));
    } catch {
      // ignore
    }
  }
  version++;
  for (const l of listeners) {
    try {
      l();
    } catch {
      // ignore
    }
  }
}

export function getManualGroupsState(): ManualGroupsState {
  load();
  return state;
}

export function getManualGroupsVersion(): number {
  load();
  return version;
}

export function subscribeManualGroups(listener: () => void): () => void {
  load();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function newId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function createManualGroup(kind: ManualGroupKind, name: string, keys: readonly string[]): string {
  load();
  const id = newId();
  const group: ManualGroup = { id, kind, name: name.trim() || id, members: [], createdAt: Date.now() };
  commit(withMembersAdded({ ...state, groups: [...state.groups, group] }, id, keys));
  return id;
}

export function renameManualGroup(id: string, name: string): void {
  load();
  const n = name.trim();
  if (!n) return;
  commit({ ...state, groups: state.groups.map((g) => (g.id === id ? { ...g, name: n } : g)) });
}

export function deleteManualGroup(id: string): void {
  load();
  commit({ ...state, groups: state.groups.filter((g) => g.id !== id) });
}

export function addToManualGroup(id: string, keys: readonly string[]): void {
  load();
  commit(withMembersAdded(state, id, keys));
}

export function removeFromManualGroup(id: string, keys: readonly string[]): void {
  load();
  commit(withMembersRemoved(state, id, keys));
}

export function setDetached(kind: ManualGroupKind, keys: readonly string[], on: boolean): void {
  load();
  commit(withDetached(state, kind, keys, on));
}

/**
 * Накладывает правки пользователя (название, вид, снятые игры). null — не осталось ни одной игры.
 * Applies user edits (name, kind, unticked games). null when no game is left.
 */
export function applySuggestionEdit(s: GroupSuggestion, edit?: SuggestionEdit): GroupSuggestion | null {
  if (!edit) return s.gameKeys.length ? s : null;
  const drop = new Set(edit.excluded || []);
  const gameKeys: string[] = [];
  const gameIds: string[] = [];
  s.gameKeys.forEach((k, i) => {
    if (drop.has(k)) return;
    gameKeys.push(k);
    gameIds.push(s.gameIds[i]);
  });
  if (gameKeys.length === 0) return null;
  const out: GroupSuggestion = { ...s, gameKeys, gameIds };
  if (s.action === 'create') {
    const name = (edit.name ?? '').trim();
    if (name) out.name = name;
    if (edit.kind) out.kind = edit.kind;
  }
  if (s.parts) {
    out.parts = s.parts
      .map((p) => {
        const keep = p.gameKeys.map((k, i) => [k, p.gameIds[i]] as const).filter(([k]) => !drop.has(k));
        return { ...p, gameKeys: keep.map((x) => x[0]), gameIds: keep.map((x) => x[1]) };
      })
      .filter((p) => p.gameKeys.length > 0);
  }
  return out;
}

export function acceptSuggestion(s: GroupSuggestion, edit?: SuggestionEdit): void {
  const e = applySuggestionEdit(s, edit);
  if (!e) return;
  if (e.action === 'add' && e.groupId) addToManualGroup(e.groupId, e.gameKeys);
  else createManualGroup(e.kind, e.name, e.gameKeys);
}

export function rejectSuggestion(s: GroupSuggestion): void {
  load();
  // «Добавить» отклоняется поштучно, чтобы новые игры потом снова предлагались.
  // "Add" is rejected per game, so new games are suggested again later.
  const ids = s.action === 'add' && s.groupId ? s.gameKeys.map((k) => `add:${s.groupId}:${k}`) : [s.id];
  commit({ ...state, rejected: Array.from(new Set([...state.rejected, ...ids])) });
}

export function exportManualGroups(): ManualGroupsState {
  load();
  return state;
}

/** Подмешивает группы из файла базы. Возвращает число групп. / Merges groups from a database file. */
export function importManualGroups(data: unknown): number {
  load();
  const incoming = sanitizeGroupsState(data);
  if (incoming.groups.length === 0 && Object.keys(incoming.detached).length === 0) return 0;
  const byId = new Map(state.groups.map((g) => [g.id, g]));
  for (const g of incoming.groups) byId.set(g.id, g);
  commit({
    groups: Array.from(byId.values()),
    detached: { ...state.detached, ...incoming.detached },
    rejected: Array.from(new Set([...state.rejected, ...incoming.rejected])),
  });
  return incoming.groups.length;
}

export function __resetManualGroupsForTests() {
  state = emptyGroupsState();
  loaded = true;
  version = 0;
  listeners.clear();
}
