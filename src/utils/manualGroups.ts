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

import { buildSeries, normalizeGameTitle, seriesKeyOf, type CollectionInput } from './gameCollections.ts';
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

export interface GroupSuggestion {
  /** Стабильный id для «отклонить». / Stable id used to reject. */
  id: string;
  kind: ManualGroupKind;
  /** Добавить в существующую ручную группу или создать новую серию. / Add to a manual group or create a series. */
  action: 'add' | 'create';
  groupId?: string;
  name: string;
  /** Игры, которые предлагается добавить. / Games proposed for the group. */
  gameIds: string[];
  gameKeys: string[];
  /** Для «create»: все игры будущей серии. / For "create": every game of the new series. */
  reason: 'same-game' | 'same-series' | 'common-prefix';
}

// Слова, на которых общий префикс не заканчивается: «Legend of …», «Kirby's …».
// Words a common prefix may not end with.
const STOP_TAIL = new Set(['of', 'and', 'the', 'a', 'an', 'to', 'in', 'on', 'no', 'de', 'la', 'le', 'vs', 'for', 's']);

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
  // 3. New series: automatic series sharing the first two words.
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
  for (const [prefix, list] of byPrefix) {
    if (list.length < 2) continue;
    const id = `new:${prefix}`;
    if (rejected.has(id)) continue;
    const members = list.flatMap((s) => s.members);
    const lead = list.find((s) => s.key === prefix)?.lead || list[0].lead;
    const keys: string[] = [];
    const ids: string[] = [];
    for (const m of members) {
      const k = gameKeyOf(m);
      if (!keys.includes(k)) {
        keys.push(k);
        ids.push(m.id);
      }
    }
    out.push({
      id,
      kind: 'series',
      action: 'create',
      name: titleCasePrefix(lead.title, 2),
      gameIds: ids,
      gameKeys: keys,
      reason: 'common-prefix',
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

export function acceptSuggestion(s: GroupSuggestion): void {
  if (s.action === 'add' && s.groupId) addToManualGroup(s.groupId, s.gameKeys);
  else createManualGroup(s.kind, s.name, s.gameKeys);
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
