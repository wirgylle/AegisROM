// Работа с папкой BIOS на диске через File System Access API: обход, хеши, копирование.
// BIOS folder on disk via the File System Access API: walk, hash, copy.
import { md5Hex } from './md5';
import { calculateCRC32 } from './hasher';
import { buildBiosReport, biosFilesForConsoles, type ScannedBiosFile } from './biosCheck';
import { normalizeBiosConsoleKey } from '../data/bios/biosGuide';
import { checkOrRequestHandlePermission, loadDirectoryHandleRecord } from './persistentHandles';

export const BIOS_HANDLE_KEY = 'bios_root';
const CACHE_KEY = 'aegisrom_bios_scan_v1';
/** Самый крупный BIOS в базе ~4 МБ (PS2) и ~3 МБ архивы; больше 64 МБ — точно не BIOS. */
const MAX_FILE_BYTES = 64 * 1024 * 1024;
const MAX_FILES = 4000;
const MAX_DEPTH = 4;

export interface BiosScanCache {
  folderName: string;
  checkedAt: string;
  files: ScannedBiosFile[];
}

export async function scanBiosDirectory(
  root: any,
  onProgress?: (done: number, current: string) => void
): Promise<ScannedBiosFile[]> {
  const out: ScannedBiosFile[] = [];
  const walk = async (dir: any, prefix: string, depth: number) => {
    for await (const entry of dir.values()) {
      if (out.length >= MAX_FILES) return;
      if (entry.name.startsWith('.')) continue;
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.kind === 'directory') {
        if (depth < MAX_DEPTH) await walk(entry, rel, depth + 1);
        continue;
      }
      try {
        const file: File = await entry.getFile();
        if (file.size === 0 || file.size > MAX_FILE_BYTES) continue;
        const bytes = new Uint8Array(await file.arrayBuffer());
        out.push({ relPath: rel, size: file.size, md5: md5Hex(bytes), crc32: calculateCRC32(bytes) });
        onProgress?.(out.length, rel);
      } catch {
        // Нет доступа к файлу — пропускаем.
      }
    }
  };
  await walk(root, '', 0);
  return out;
}

export async function resolveFile(root: any, relPath: string): Promise<File> {
  const segs = relPath.split('/').filter(Boolean);
  let dir = root;
  for (let i = 0; i < segs.length - 1; i++) dir = await dir.getDirectoryHandle(segs[i]);
  const fh = await dir.getFileHandle(segs[segs.length - 1]);
  return fh.getFile();
}

export async function writeFileUnder(root: any, relPath: string, data: Blob): Promise<void> {
  const segs = relPath.split('/').filter(Boolean);
  let dir = root;
  for (let i = 0; i < segs.length - 1; i++) dir = await dir.getDirectoryHandle(segs[i], { create: true });
  const fh = await dir.getFileHandle(segs[segs.length - 1], { create: true });
  const w = await fh.createWritable();
  await w.write(data);
  await w.close();
}

/** Копирует файлы из srcRoot в destRoot (можно в ту же папку — для исправления имени). */
export async function copyBiosFiles(
  srcRoot: any,
  destRoot: any,
  list: { from: string; to: string }[],
  onEach?: (item: { from: string; to: string }, ok: boolean, err?: string) => void
): Promise<number> {
  let ok = 0;
  for (const item of list) {
    try {
      const file = await resolveFile(srcRoot, item.from);
      await writeFileUnder(destRoot, item.to, file);
      ok++;
      onEach?.(item, true);
    } catch (err) {
      onEach?.(item, false, String(err));
    }
  }
  return ok;
}

export function saveBiosScanCache(cache: BiosScanCache): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {}
}

export function loadBiosScanCache(): BiosScanCache | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    return v && Array.isArray(v.files) ? (v as BiosScanCache) : null;
  } catch {
    return null;
  }
}

/** Папка BIOS на устройстве для профиля сборки (относительно корня выгрузки). null — BIOS не копируем. */
export function biosDirForBuildProfile(profileId: string): string | null {
  switch (profileId) {
    case 'r36s_arkos':
      return 'bios';
    case 'miyoo_anbernic':
      return 'BIOS';
    case 'steamdeck_emudeck':
      return 'Emulation/bios';
    case 'psx_duckstation_iso':
      return 'bios';
    default:
      return null;
  }
}

/**
 * Проверенные BIOS для консоли из сохранённой папки (по последней проверке).
 * Для других модулей, например быстрого теста в EmulatorJS. Без запроса разрешения:
 * если доступ к папке не выдан в этой сессии, вернёт [] (allowPrompt=true — только по клику).
 * Первый элемент — предпочтительный файл (порядок как в справочнике).
 */
export async function getVerifiedBiosFiles(
  consoleShort: string,
  allowPrompt = false
): Promise<{ path: string; file: File }[]> {
  const cache = loadBiosScanCache();
  if (!cache) return [];
  const rec = await loadDirectoryHandleRecord(BIOS_HANDLE_KEY);
  if (!rec?.handle) return [];
  const perm = await checkOrRequestHandlePermission(rec.handle, 'read', allowPrompt);
  if (perm !== 'granted') return [];
  const list = biosFilesForConsoles(buildBiosReport(cache.files), [normalizeBiosConsoleKey(consoleShort)]);
  const out: { path: string; file: File }[] = [];
  for (const item of list) {
    try {
      const f = await resolveFile(rec.handle, item.from);
      out.push({ path: item.to, file: new File([f], item.to.split('/').pop() || f.name) });
    } catch {}
  }
  return out;
}

const COPY_PREF_KEY = 'aegisrom_build_copy_bios';

export function loadBuildCopyBiosPref(): boolean {
  try {
    return localStorage.getItem(COPY_PREF_KEY) !== '0';
  } catch {
    return true;
  }
}

export function saveBuildCopyBiosPref(on: boolean): void {
  try {
    localStorage.setItem(COPY_PREF_KEY, on ? '1' : '0');
  } catch {}
}

/**
 * Копирует проверенные BIOS для консолей сборки в папку BIOS целевого устройства.
 * Доступ к папке BIOS лучше выдать заранее (кнопка в BuildBiosStrip): после долгой выгрузки
 * браузер может уже не показать запрос.
 */
export async function copyBiosIntoBuild(
  targetRoot: any,
  profileId: string,
  consoleShorts: string[]
): Promise<{ copied: number; dir: string | null; skipped?: 'noFolder' | 'noScan' | 'noAccess' | 'nothing' }> {
  const dir = biosDirForBuildProfile(profileId);
  if (!dir) return { copied: 0, dir, skipped: 'noFolder' };
  const cache = loadBiosScanCache();
  if (!cache) return { copied: 0, dir, skipped: 'noScan' };
  const rec = await loadDirectoryHandleRecord(BIOS_HANDLE_KEY);
  if (!rec?.handle) return { copied: 0, dir, skipped: 'noScan' };
  let perm = await checkOrRequestHandlePermission(rec.handle, 'read', false);
  if (perm !== 'granted') {
    try {
      perm = await checkOrRequestHandlePermission(rec.handle, 'read', true);
    } catch {}
  }
  if (perm !== 'granted') return { copied: 0, dir, skipped: 'noAccess' };
  const keys = Array.from(new Set(consoleShorts.map(normalizeBiosConsoleKey)));
  const list = biosFilesForConsoles(buildBiosReport(cache.files), keys);
  if (list.length === 0) return { copied: 0, dir, skipped: 'nothing' };
  let destRoot = targetRoot;
  for (const seg of dir.split('/').filter(Boolean)) destRoot = await destRoot.getDirectoryHandle(seg, { create: true });
  const copied = await copyBiosFiles(rec.handle, destRoot, list);
  return { copied, dir };
}
