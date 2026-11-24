// Область операции: на каких записях базы запускать переименование, 1G1R, скраппер и др.
// Чтобы не перебирать всю библиотеку каждый раз, пользователь сужает список: по консоли,
// битности, папке, отдельным играм, коллекциям и сериям, только без медиа или только новые.
// Внутри одного признака условия идут через ИЛИ (SNES или NES), между признаками через И
// (SNES и только без медиа). Игры, коллекции и серии считаются одним выбором: запись
// попадает, если она входит хотя бы в одно из них.
//
// Operation scope: which database records rename, 1G1R, the scraper and others run on.
// So the whole library is not walked every time, the user narrows the list: by console,
// bitness, folder, single games, collections and series, only without media or only new.
// Values of one criterion are OR-ed (SNES or NES), criteria are AND-ed (SNES and only
// without media). Games, collections and series form one selection: a record is in if it
// belongs to at least one of them.
//
// Модуль без импортов из React, чтобы тесты шли через `node --test`.
// No React imports, so tests run with `node --test`.

import { buildCollections, buildSeries, collectionKeyOf, type CollectionInput } from './gameCollections.ts';

/** Операции, у которых есть свой выбор области. / Operations with their own scope. */
export type ScopeOperation = 'scrape' | 'rename' | 'g1r' | 'organize' | 'multiDisc' | 'phantom' | 'build' | 'other';

export interface OperationScope {
  /** Коды консолей (consoleShort, верхний регистр). Пусто = все. / Console codes, upper case. Empty = all. */
  consoles: string[];
  /** Битность / поколение, как в записи. Пусто = все. / Bitness as stored in the record. Empty = all. */
  bitness: string[];
  /** Папки (относительный путь от корня библиотеки). Пусто = все. / Folders relative to the library root. Empty = all. */
  folders: string[];
  /** Отдельные игры (id записей). / Single games (record ids). */
  gameIds: string[];
  /** Коллекции (collectionKeyOf). / Collections (collectionKeyOf). */
  collectionKeys: string[];
  /** Серии (ключ из buildSeries). / Series (key from buildSeries). */
  seriesKeys: string[];
  /** Только записи без медиа. / Only records without media. */
  onlyMissingMedia: boolean;
  /** Только записи, которые эта операция ещё не обрабатывала. / Only records this operation has not processed yet. */
  onlyNew: boolean;
}

/** Минимум полей записи базы, нужный фильтру. / The record fields the filter needs. */
export interface ScopeRow extends CollectionInput {
  bitness?: string;
  relativePath?: string;
  videoUrl?: string;
}

export interface ScopeFilterOptions<T extends ScopeRow> {
  /** Id записей, уже обработанных операцией (для onlyNew). / Ids already processed by the operation (for onlyNew). */
  processedIds?: ReadonlySet<string>;
  /** Есть ли у записи медиа. По умолчанию: есть обложка. / Whether a record has media. Default: has a cover. */
  hasMedia?: (row: T) => boolean;
}

export function emptyScope(): OperationScope {
  return {
    consoles: [],
    bitness: [],
    folders: [],
    gameIds: [],
    collectionKeys: [],
    seriesKeys: [],
    onlyMissingMedia: false,
    onlyNew: false,
  };
}

/** Область не сужена: вся библиотека. / Scope is not narrowed: the whole library. */
export function isWholeLibrary(s: OperationScope): boolean {
  return (
    s.consoles.length === 0 &&
    s.bitness.length === 0 &&
    s.folders.length === 0 &&
    s.gameIds.length === 0 &&
    s.collectionKeys.length === 0 &&
    s.seriesKeys.length === 0 &&
    !s.onlyMissingMedia &&
    !s.onlyNew
  );
}

/** Папка записи без имени файла, через «/». / The record's folder without the file name, with "/". */
export function folderOfRow(row: Pick<ScopeRow, 'relativePath'>): string {
  const p = String(row.relativePath || '').replace(/\\/g, '/');
  const slash = p.lastIndexOf('/');
  return slash > 0 ? p.slice(0, slash) : '';
}

function inFolder(folder: string, wanted: string): boolean {
  const w = wanted.replace(/\\/g, '/').replace(/\/+$/, '');
  if (!w) return true;
  const f = folder.toLowerCase();
  const wl = w.toLowerCase();
  return f === wl || f.startsWith(wl + '/');
}

export function defaultHasMedia(row: Pick<ScopeRow, 'boxArtUrl'>): boolean {
  const u = String(row.boxArtUrl || '');
  return u.length > 0 && !u.startsWith('blob:');
}

/** Ключи серий для каждой записи. / Series key of every record. */
export function seriesKeyByRowId<T extends ScopeRow>(rows: readonly T[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const s of buildSeries(rows)) {
    for (const m of s.members) out.set(m.id, s.key);
  }
  return out;
}

/**
 * Записи, которые попадают в область. Порядок исходного списка сохраняется.
 * The records inside the scope. The source order is kept.
 */
export function filterRowsByScope<T extends ScopeRow>(
  rows: readonly T[],
  scope: OperationScope,
  opts: ScopeFilterOptions<T> = {}
): T[] {
  if (isWholeLibrary(scope)) return rows.slice();
  const consoles = new Set(scope.consoles.map((c) => c.toUpperCase()));
  const bitness = new Set(scope.bitness);
  const gameIds = new Set(scope.gameIds);
  const colKeys = new Set(scope.collectionKeys);
  const serKeys = new Set(scope.seriesKeys);
  const hasPick = gameIds.size > 0 || colKeys.size > 0 || serKeys.size > 0;
  const seriesOf = serKeys.size > 0 ? seriesKeyByRowId(rows) : null;
  const hasMedia = opts.hasMedia || defaultHasMedia;
  const processed = opts.processedIds;

  return rows.filter((r) => {
    if (consoles.size > 0 && !consoles.has(String(r.consoleShort || '').toUpperCase())) return false;
    if (bitness.size > 0 && !bitness.has(String(r.bitness || ''))) return false;
    if (scope.folders.length > 0) {
      const f = folderOfRow(r);
      if (!scope.folders.some((w) => inFolder(f, w))) return false;
    }
    if (hasPick) {
      const picked =
        gameIds.has(r.id) ||
        (colKeys.size > 0 && colKeys.has(collectionKeyOf(r))) ||
        (seriesOf !== null && serKeys.has(seriesOf.get(r.id) || ''));
      if (!picked) return false;
    }
    if (scope.onlyMissingMedia && hasMedia(r)) return false;
    if (scope.onlyNew && processed && processed.has(r.id)) return false;
    return true;
  });
}

export interface ScopeFacet {
  key: string;
  label: string;
  count: number;
}

export interface ScopeFacets {
  consoles: ScopeFacet[];
  bitness: ScopeFacet[];
  folders: ScopeFacet[];
  collections: ScopeFacet[];
  series: ScopeFacet[];
}

function countBy<T>(rows: readonly T[], keyOf: (r: T) => string, labelOf?: (r: T) => string): ScopeFacet[] {
  const map = new Map<string, ScopeFacet>();
  for (const r of rows) {
    const key = keyOf(r);
    if (!key) continue;
    const f = map.get(key);
    if (f) f.count++;
    else map.set(key, { key, label: labelOf ? labelOf(r) : key, count: 1 });
  }
  return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
}

/**
 * Значения для окна выбора: консоли, битность, папки, коллекции (2+ версии) и серии (2+ игры).
 * Choices for the scope window: consoles, bitness, folders, collections (2+ versions) and series (2+ games).
 */
export function buildScopeFacets<T extends ScopeRow>(rows: readonly T[]): ScopeFacets {
  const collections = buildCollections(rows)
    .filter((c) => c.members.length > 1)
    .map((c) => ({ key: c.key, label: c.lead.title, count: c.members.length }))
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
  const series = buildSeries(rows)
    .filter((s) => s.games.length > 1)
    .map((s) => ({ key: s.key, label: s.label || s.lead.title, count: s.members.length }))
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
  return {
    consoles: countBy(rows, (r) => String(r.consoleShort || '').toUpperCase()),
    bitness: countBy(rows, (r) => String(r.bitness || '')),
    folders: countBy(rows, folderOfRow),
    collections,
    series,
  };
}

/** Короткая строка для журнала. / Short line for the log. */
export function describeScope(s: OperationScope): string {
  if (isWholeLibrary(s)) return '*';
  const parts: string[] = [];
  if (s.consoles.length) parts.push(s.consoles.join('+'));
  if (s.bitness.length) parts.push(s.bitness.join('+'));
  if (s.folders.length) parts.push(s.folders.join('+'));
  const picks = s.gameIds.length + s.collectionKeys.length + s.seriesKeys.length;
  if (picks) parts.push(`#${picks}`);
  if (s.onlyMissingMedia) parts.push('no-media');
  if (s.onlyNew) parts.push('new');
  return parts.join(' · ');
}
