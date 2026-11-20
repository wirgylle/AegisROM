// Сверка найденных файлов BIOS со справочником (чистая логика, без доступа к диску).
// Matches scanned BIOS files against the guide (pure logic, no disk access).
import { BIOS_GUIDE, type BiosGuideGroup, type BiosGuideSystem } from '../data/bios/biosGuide.ts';
import { LIBRETRO_BIOS_ROWS, LIBRETRO_BIOS_SYSTEMS } from '../data/bios/libretroSystemDat.ts';

export interface ScannedBiosFile {
  /** Путь относительно выбранной папки BIOS, через «/». */
  relPath: string;
  size: number;
  md5: string;
  crc32: string;
}

export interface KnownBiosEntry {
  system: string;
  path: string;
  size: number;
  crc32: string;
  md5: string;
}

/**
 * ok — файл на месте и хеш совпал;
 * wrongPlace — правильный файл лежит не в той подпапке;
 * wrongName — правильный дамп под другим именем;
 * otherBios — по имени совпал, но это другой известный BIOS;
 * unknownVersion — по имени совпал, но хеш не известен (плохой дамп или редкая ревизия);
 * missing — файла нет.
 */
export type BiosFileStatus = 'ok' | 'wrongPlace' | 'wrongName' | 'otherBios' | 'unknownVersion' | 'missing';

export interface BiosFileResult {
  expectedPath: string;
  region?: string;
  status: BiosFileStatus;
  /** Найденный файл, если есть. */
  found?: ScannedBiosFile;
  /** Для otherBios: чем файл является на самом деле. */
  actually?: KnownBiosEntry;
  expectedMd5: string[];
}

export type BiosGroupStatus = 'ok' | 'fixable' | 'warn' | 'missing';

export interface BiosGroupResult {
  group: BiosGuideGroup;
  status: BiosGroupStatus;
  files: BiosFileResult[];
}

export type BiosSystemStatus = 'ok' | 'fixable' | 'warn' | 'missing' | 'optionalMissing' | 'notNeeded' | 'info';

export interface BiosSystemResult {
  system: BiosGuideSystem;
  status: BiosSystemStatus;
  groups: BiosGroupResult[];
}

export interface BiosReport {
  systems: BiosSystemResult[];
  /** Известные по хешу файлы, которых нет в справочнике (другие системы). */
  recognizedExtra: { file: ScannedBiosFile; known: KnownBiosEntry }[];
  /** Файлы, которых нет в базе хешей. */
  unknown: ScannedBiosFile[];
}

const lc = (s: string) => s.toLowerCase();
const baseName = (p: string) => p.split('/').pop() || p;

let byMd5Cache: Map<string, KnownBiosEntry[]> | null = null;
let bySystemCache: Map<string, KnownBiosEntry[]> | null = null;

function indexes() {
  if (!byMd5Cache || !bySystemCache) {
    byMd5Cache = new Map();
    bySystemCache = new Map();
    for (const [sys, path, size, crc32, md5] of LIBRETRO_BIOS_ROWS) {
      const e: KnownBiosEntry = { system: LIBRETRO_BIOS_SYSTEMS[sys], path, size, crc32, md5 };
      const a = byMd5Cache.get(md5) || [];
      a.push(e);
      byMd5Cache.set(md5, a);
      const b = bySystemCache.get(e.system) || [];
      b.push(e);
      bySystemCache.set(e.system, b);
    }
  }
  return { byMd5: byMd5Cache, bySystem: bySystemCache };
}

export function lookupBiosByMd5(md5: string): KnownBiosEntry[] {
  return indexes().byMd5.get(lc(md5)) || [];
}

function expectedMd5For(system: BiosGuideSystem, path: string): string[] {
  const list = indexes().bySystem.get(system.datSystem || '') || [];
  const want = lc(path);
  return Array.from(new Set(list.filter((e) => lc(e.path) === want).map((e) => e.md5)));
}

function systemMd5Set(system: BiosGuideSystem): Set<string> {
  const list = indexes().bySystem.get(system.datSystem || '') || [];
  return new Set(list.map((e) => e.md5));
}

function checkFile(
  system: BiosGuideSystem,
  path: string,
  region: string | undefined,
  files: ScannedBiosFile[]
): BiosFileResult {
  const expectedMd5 = expectedMd5For(system, path);
  const want = lc(path);
  const exact = files.find((f) => lc(f.relPath) === want);
  if (exact) {
    if (expectedMd5.includes(exact.md5)) return { expectedPath: path, region, status: 'ok', found: exact, expectedMd5 };
    const other = lookupBiosByMd5(exact.md5)[0];
    if (other) return { expectedPath: path, region, status: 'otherBios', found: exact, actually: other, expectedMd5 };
    return { expectedPath: path, region, status: 'unknownVersion', found: exact, expectedMd5 };
  }
  const sameMd5 = files.filter((f) => expectedMd5.includes(f.md5));
  const sameName = sameMd5.find((f) => lc(baseName(f.relPath)) === lc(baseName(path)));
  if (sameName) return { expectedPath: path, region, status: 'wrongPlace', found: sameName, expectedMd5 };
  if (sameMd5[0]) return { expectedPath: path, region, status: 'wrongName', found: sameMd5[0], expectedMd5 };
  const nameOnly = files.find((f) => lc(baseName(f.relPath)) === lc(baseName(path)));
  if (nameOnly) {
    const other = lookupBiosByMd5(nameOnly.md5)[0];
    return {
      expectedPath: path,
      region,
      status: other ? 'otherBios' : 'unknownVersion',
      found: nameOnly,
      actually: other,
      expectedMd5,
    };
  }
  return { expectedPath: path, region, status: 'missing', expectedMd5 };
}

function checkGroup(system: BiosGuideSystem, group: BiosGuideGroup, files: ScannedBiosFile[]): BiosGroupResult {
  if (group.mode === 'anyFromSystem') {
    const set = systemMd5Set(system);
    const hits = files.filter((f) => set.has(f.md5));
    const results: BiosFileResult[] = hits.length
      ? hits.map((f) => ({ expectedPath: f.relPath, status: 'ok' as const, found: f, expectedMd5: [f.md5] }))
      : [{ expectedPath: group.files[0], status: 'missing' as const, expectedMd5: [] }];
    return { group, status: hits.length ? 'ok' : 'missing', files: results };
  }
  const results = group.files.map((p, i) => checkFile(system, p, group.regions?.[i], files));
  const has = (s: BiosFileStatus) => results.some((r) => r.status === s);
  const all = (pred: (r: BiosFileResult) => boolean) => results.every(pred);
  let status: BiosGroupStatus;
  if (group.mode === 'all') {
    if (all((r) => r.status === 'ok')) status = 'ok';
    else if (all((r) => r.status === 'ok' || r.status === 'wrongPlace' || r.status === 'wrongName')) status = 'fixable';
    else if (has('unknownVersion') || has('otherBios')) status = 'warn';
    else status = 'missing';
  } else {
    if (has('ok')) status = 'ok';
    else if (has('wrongPlace') || has('wrongName')) status = 'fixable';
    else if (has('unknownVersion') || has('otherBios')) status = 'warn';
    else status = 'missing';
  }
  return { group, status, files: results };
}

export function checkBiosSystem(system: BiosGuideSystem, files: ScannedBiosFile[]): BiosSystemResult {
  if (system.need === 'none') return { system, status: 'notNeeded', groups: [] };
  if (system.groups.length === 0) return { system, status: 'info', groups: [] };
  const groups = system.groups.map((g) => checkGroup(system, g, files));
  const req = groups.filter((g) => g.group.level === 'required');
  const pool = req.length > 0 ? req : groups;
  let status: BiosSystemStatus;
  if (pool.every((g) => g.status === 'ok')) status = 'ok';
  else if (pool.some((g) => g.status === 'missing')) status = system.need === 'required' ? 'missing' : 'optionalMissing';
  else if (pool.some((g) => g.status === 'warn')) status = 'warn';
  else status = 'fixable';
  return { system, status, groups };
}

export function buildBiosReport(files: ScannedBiosFile[], guide: BiosGuideSystem[] = BIOS_GUIDE): BiosReport {
  const normalized = files.map((f) => ({ ...f, relPath: f.relPath.replace(/\\/g, '/'), md5: lc(f.md5), crc32: lc(f.crc32) }));
  const systems = guide.map((s) => checkBiosSystem(s, normalized));
  const used = new Set<string>();
  for (const s of systems) for (const g of s.groups) for (const r of g.files) if (r.found) used.add(r.found.relPath);
  const guideSystems = new Set(guide.map((s) => s.datSystem).filter(Boolean) as string[]);
  const recognizedExtra: BiosReport['recognizedExtra'] = [];
  const unknown: ScannedBiosFile[] = [];
  for (const f of normalized) {
    if (used.has(f.relPath)) continue;
    const known = lookupBiosByMd5(f.md5);
    if (known.length === 0) unknown.push(f);
    else if (!known.some((k) => guideSystems.has(k.system))) recognizedExtra.push({ file: f, known: known[0] });
  }
  return { systems, recognizedExtra, unknown };
}

/**
 * Какие файлы скопировать в сборку для набора консолей: только подтверждённые хешем
 * (ok / wrongPlace / wrongName), под правильным именем и в правильной подпапке.
 */
export function biosFilesForConsoles(
  report: BiosReport,
  consoleKeys: string[]
): { from: string; to: string; system: string }[] {
  const keys = new Set(consoleKeys);
  const out: { from: string; to: string; system: string }[] = [];
  const seen = new Set<string>();
  for (const s of report.systems) {
    if (!s.system.consoleKeys.some((k) => keys.has(k))) continue;
    for (const g of s.groups) {
      // Один исходный файл копируем в группе один раз (первое ожидаемое имя в списке приоритетнее).
      const usedSources = new Set<string>();
      const ordered = [...g.files].sort((a, b) => Number(b.status === 'ok') - Number(a.status === 'ok'));
      for (const r of ordered) {
        if (!r.found || !(r.status === 'ok' || r.status === 'wrongPlace' || r.status === 'wrongName')) continue;
        if (usedSources.has(r.found.relPath)) continue;
        usedSources.add(r.found.relPath);
        const to = g.group.mode === 'anyFromSystem' ? r.found.relPath : r.expectedPath;
        if (seen.has(lc(to))) continue;
        seen.add(lc(to));
        out.push({ from: r.found.relPath, to, system: s.system.id });
      }
    }
  }
  return out;
}
