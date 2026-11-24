// «В коллекцию или серию»: список групп для окна поиска на карточке рома.
// В списке и ручные группы, и автоматические (по названиям). Выбор автоматической группы
// превращает её в ручную с тем же составом плюс выбранный ром, иначе ром в неё не «прибить».
// Отмена возвращает прежнее состояние: убирает ром из новой группы, возвращает в старую.
//
// "Add to collection or series": the group list for the search window on a ROM card.
// The list holds manual groups and automatic ones (built from titles). Picking an automatic
// group turns it into a manual one with the same members plus the ROM, since an automatic
// group cannot hold a ROM by itself. Undo restores the previous state.

import { buildCollections, buildSeries, normalizeGameTitle } from './gameCollections.ts';
import {
  addToManualGroup,
  createManualGroup,
  deleteManualGroup,
  gameKeyOf,
  removeFromManualGroup,
  setDetached,
  type GroupRowLike,
  type ManualGroupKind,
  type ManualGroupsState,
} from './manualGroups.ts';

export interface GroupOption {
  /** 'm:<groupId>' | 'ac:<collectionKey>' | 'as:<seriesKey>' */
  id: string;
  kind: ManualGroupKind;
  source: 'manual' | 'auto';
  /** Для ручной группы. / For a manual group. */
  groupId?: string;
  name: string;
  /** Коллекция: число версий; серия: число игр. / Collection: versions; series: games. */
  count: number;
  consoles: string[];
  /** Ключи участников автоматической группы. / Member keys of an automatic group. */
  memberKeys: string[];
  /** Все выбранные ромы уже в группе. / Every target ROM is already in the group. */
  contains: boolean;
}

/**
 * Строит список групп. rows — вся Библиотека после applyManualGroups.
 * Builds the group list. rows is the whole Library after applyManualGroups.
 */
export function buildGroupOptions<T extends GroupRowLike>(
  rows: readonly T[],
  state: ManualGroupsState,
  targetIds: readonly string[]
): GroupOption[] {
  const out: GroupOption[] = [];
  const seenManual = new Set<string>();

  for (const c of buildCollections(rows)) {
    const manualId = c.key.startsWith('m:c:') ? c.key.slice(4) : '';
    if (!manualId && c.members.length < 2) continue;
    const ids = c.members.map((m) => m.id);
    const contains = targetIds.length > 0 && targetIds.every((id) => ids.includes(id));
    if (manualId) {
      const g = state.groups.find((x) => x.id === manualId);
      if (!g) continue;
      seenManual.add(manualId);
      out.push({ id: `m:${manualId}`, kind: 'collection', source: 'manual', groupId: manualId, name: g.name, count: c.members.length, consoles: c.consoles, memberKeys: [], contains });
    } else {
      out.push({
        id: `ac:${c.key}`,
        kind: 'collection',
        source: 'auto',
        name: c.lead.title,
        count: c.members.length,
        consoles: c.consoles,
        memberKeys: Array.from(new Set(c.members.map((m) => gameKeyOf(m)))),
        contains,
      });
    }
  }

  for (const s of buildSeries(rows)) {
    if (s.key.startsWith('#solo:')) continue;
    const manualId = s.key.startsWith('m:s:') ? s.key.slice(4) : '';
    if (!manualId && s.games.length < 2) continue;
    const contains = targetIds.length > 0 && targetIds.every((id) => s.members.some((m) => m.id === id));
    if (manualId) {
      const g = state.groups.find((x) => x.id === manualId);
      if (!g) continue;
      seenManual.add(manualId);
      out.push({ id: `m:${manualId}`, kind: 'series', source: 'manual', groupId: manualId, name: g.name, count: s.games.length, consoles: s.consoles, memberKeys: [], contains });
    } else {
      out.push({
        id: `as:${s.key}`,
        kind: 'series',
        source: 'auto',
        name: s.label,
        count: s.games.length,
        consoles: s.consoles,
        memberKeys: Array.from(new Set(s.members.map((m) => gameKeyOf(m)))),
        contains,
      });
    }
  }

  // Пустые ручные группы (ни одной игры в текущей базе) тоже можно выбрать.
  // Empty manual groups (no game in the current database) can be picked too.
  for (const g of state.groups) {
    if (seenManual.has(g.id)) continue;
    out.push({ id: `m:${g.id}`, kind: g.kind, source: 'manual', groupId: g.id, name: g.name, count: 0, consoles: [], memberKeys: [], contains: false });
  }
  return out;
}

function rank(name: string, q: string): number {
  const n = normalizeGameTitle(name) || name.toLowerCase();
  const low = name.toLowerCase();
  if (n === q || low === q) return 0;
  if (n.startsWith(q) || low.startsWith(q)) return 1;
  if (n.split(' ').some((w) => w.startsWith(q)) || low.split(/\s+/).some((w) => w.startsWith(q))) return 2;
  if (n.includes(q) || low.includes(q)) return 3;
  return -1;
}

/**
 * Фильтр и порядок: совпадение по началу выше, затем группы с ромом, ручные выше авто.
 * Filter and order: prefix matches first, then groups holding the ROM, manual before auto.
 */
export function filterGroupOptions(options: readonly GroupOption[], query: string, kind: ManualGroupKind | 'all' = 'all'): GroupOption[] {
  const raw = query.trim().toLowerCase();
  const q = normalizeGameTitle(raw) || raw;
  const scored: { o: GroupOption; r: number }[] = [];
  for (const o of options) {
    if (kind !== 'all' && o.kind !== kind) continue;
    const r = q ? Math.min(...[rank(o.name, q), rank(o.name, raw)].filter((x) => x >= 0), 99) : 0;
    if (q && r === 99) continue;
    scored.push({ o, r });
  }
  scored.sort(
    (a, b) =>
      a.r - b.r ||
      Number(b.o.contains) - Number(a.o.contains) ||
      (a.o.source === b.o.source ? 0 : a.o.source === 'manual' ? -1 : 1) ||
      a.o.name.localeCompare(b.o.name, undefined, { numeric: true, sensitivity: 'base' })
  );
  return scored.map((s) => s.o);
}

/** Есть ли группа ровно с таким названием и видом. / Whether a group with this exact name and kind exists. */
export function hasExactGroup(options: readonly GroupOption[], name: string, kind: ManualGroupKind): boolean {
  const n = name.trim().toLowerCase();
  return options.some((o) => o.kind === kind && o.name.trim().toLowerCase() === n);
}

/** Как отменить добавление. / How to undo an add. */
export interface AddUndo {
  kind: ManualGroupKind;
  keys: string[];
  /** Группа создана этим действием. / The group was created by this action. */
  createdId?: string;
  groupId: string;
  /** Где ромы были раньше (ручные группы того же вида). / Where the ROMs were before. */
  prev: { groupId: string; keys: string[] }[];
  /** Ключи, которые были вынуты из авто-группы этого вида. / Keys that were detached. */
  prevDetached: string[];
}

function snapshot(state: ManualGroupsState, kind: ManualGroupKind, keys: readonly string[]) {
  const set = new Set(keys);
  const prev = state.groups
    .filter((g) => g.kind === kind)
    .map((g) => ({ groupId: g.id, keys: g.members.filter((k) => set.has(k)) }))
    .filter((p) => p.keys.length > 0);
  const prevDetached = keys.filter((k) => state.detached[k]?.[kind]);
  return { prev, prevDetached };
}

/**
 * Добавляет ромы в выбранную группу (или создаёт новую с именем newName).
 * Adds the ROMs to the picked group (or creates a new one named newName).
 */
export function addRomsToGroup(
  state: ManualGroupsState,
  keys: readonly string[],
  pick: { option: GroupOption } | { create: ManualGroupKind; name: string }
): AddUndo | null {
  const uniq = Array.from(new Set(keys));
  if (uniq.length === 0) return null;
  if ('create' in pick) {
    const name = pick.name.trim();
    if (!name) return null;
    const snap = snapshot(state, pick.create, uniq);
    const id = createManualGroup(pick.create, name, uniq);
    return { kind: pick.create, keys: uniq, createdId: id, groupId: id, ...snap };
  }
  const o = pick.option;
  const snap = snapshot(state, o.kind, uniq);
  if (o.source === 'manual' && o.groupId) {
    addToManualGroup(o.groupId, uniq);
    return { kind: o.kind, keys: uniq, groupId: o.groupId, ...snap };
  }
  const id = createManualGroup(o.kind, o.name, Array.from(new Set([...o.memberKeys, ...uniq])));
  return { kind: o.kind, keys: uniq, createdId: id, groupId: id, ...snap };
}

/** Отменяет addRomsToGroup. / Undoes addRomsToGroup. */
export function undoAddRoms(u: AddUndo): void {
  if (u.createdId) deleteManualGroup(u.createdId);
  else removeFromManualGroup(u.groupId, u.keys);
  for (const p of u.prev) addToManualGroup(p.groupId, p.keys);
  if (u.prevDetached.length > 0) setDetached(u.kind, u.prevDetached, true);
}
