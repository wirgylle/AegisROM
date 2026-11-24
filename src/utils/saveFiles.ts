// Сохранения рядом с ромом: какие файлы считаются сохранениями и как они едут за ромом
// при переименовании, 1G1R и замене версии (менеджер сохранений, шаг 2).
// Saves next to the ROM: which files are saves and how they follow the ROM on rename,
// 1G1R and version replacement (save manager, step 2).
//
// Та же логика на Go: aegiscore/saves.go (MoveRomSaves). Меняешь здесь — поменяй и там.
// Same logic in Go: aegiscore/saves.go (MoveRomSaves). Keep both in sync.

/** Папка истории рядом с ромом. / History folder next to the ROM. */
export const SAVE_HISTORY_DIR = '.aegis-saves';
/** Сколько прошлых версий каждого суффикса хранить. / Versions kept per suffix. */
export const SAVE_HISTORY_KEEP = 10;

/**
 * Файлы <имя рома><суффикс>, которые считаются сохранениями этого рома.
 * .srm (libretro), .sav/.rtc (mGBA, Gambatte), .dsv (DeSmuME), .eep/.fla/.sra/.mpk (N64),
 * .mcr/.mcd/_1.mcd/_2.mcd (карты памяти PS1), .state* (снимки состояния).
 */
export const SAVE_SUFFIXES: readonly string[] = [
  '.srm', '.sav', '.rtc', '.dsv', '.eep', '.fla', '.sra', '.mpk',
  '.mcr', '.mcd', '_1.mcd', '_2.mcd',
  '.state', '.state.auto',
  '.state1', '.state2', '.state3', '.state4', '.state5', '.state6', '.state7', '.state8', '.state9',
];

const SUFFIX_SET = new Set(SAVE_SUFFIXES);

export function isSaveSuffix(s: string): boolean {
  return SUFFIX_SET.has(String(s || '').toLowerCase());
}

/** Суффикс сохранения для файла рома с основой base, или '' если это не его сохранение. */
export function saveSuffixOf(fileName: string, romBase: string): string {
  const name = String(fileName || '');
  if (!romBase || name.length <= romBase.length) return '';
  if (name.slice(0, romBase.length).toLowerCase() !== romBase.toLowerCase()) return '';
  const rest = name.slice(romBase.length).toLowerCase();
  return SUFFIX_SET.has(rest) ? rest : '';
}

/** Похоже ли имя на файл сохранения хоть какого-то рома (для скана). */
export function looksLikeSaveFile(fileName: string): boolean {
  const low = String(fileName || '').toLowerCase();
  return SAVE_SUFFIXES.some((s) => low.length > s.length && low.endsWith(s));
}

/** Основа имени без последнего расширения, как у RetroArch. */
export function romStem(fileName: string): string {
  const base = String(fileName || '').split(/[\\/]/).pop() || '';
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(0, dot) : base;
}

const HISTORY_RE = /^(\d{8}-\d{6})(-\d+)?(.+)$/;

/** «20261120-131830-2.srm» → { stamp, suffix }. Чужие файлы → null. */
export function parseHistoryName(name: string): { stamp: string; suffix: string } | null {
  const m = HISTORY_RE.exec(String(name || ''));
  if (!m || !isSaveSuffix(m[3])) return null;
  return { stamp: m[1], suffix: m[3].toLowerCase() };
}

/** Отметка времени как в Go: ГГГГММДД-ччммсс по местному времени. */
export function formatSaveStamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/** «20261120-131830» → Date (местное время) или null. */
export function parseSaveStamp(stamp: string): Date | null {
  const m = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})$/.exec(stamp || '');
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
}

// ---------- работа с папками (File System Access API или shim nativeFs) ----------

/** Минимум от FileSystemDirectoryHandle, который здесь нужен. */
export interface SaveDirLike {
  name?: string;
  getFileHandle(name: string, opts?: { create?: boolean }): Promise<any>;
  getDirectoryHandle(name: string, opts?: { create?: boolean }): Promise<SaveDirLike>;
  removeEntry(name: string, opts?: { recursive?: boolean }): Promise<void>;
  values(): AsyncIterable<{ kind: string; name: string }>;
  isSameEntry?(other: any): Promise<boolean>;
}

export interface SaveCarryResult {
  moved: number;
  conflicts: number;
  history: number;
}

async function sameDir(a: SaveDirLike, b: SaveDirLike): Promise<boolean> {
  if (a === b) return true;
  try {
    if (typeof a.isSameEntry === 'function') return Boolean(await a.isSameEntry(b));
  } catch {}
  return false;
}

async function tryGetFile(dir: SaveDirLike, name: string): Promise<File | null> {
  try {
    const fh = await dir.getFileHandle(name);
    const f = await fh.getFile();
    return f as File;
  } catch {
    return null;
  }
}

async function tryGetDir(dir: SaveDirLike, name: string): Promise<SaveDirLike | null> {
  try {
    return await dir.getDirectoryHandle(name);
  } catch {
    return null;
  }
}

async function listNames(dir: SaveDirLike, kind: 'file' | 'directory' = 'file'): Promise<string[]> {
  const out: string[] = [];
  try {
    for await (const e of dir.values()) if (e.kind === kind) out.push(e.name);
  } catch {}
  return out;
}

async function writeBytes(dir: SaveDirLike, name: string, data: ArrayBuffer | Blob): Promise<void> {
  const fh = await dir.getFileHandle(name, { create: true });
  const w = await fh.createWritable();
  await w.write(data);
  await w.close();
}

async function freeHistoryName(hist: SaveDirLike, stamp: string, suffix: string): Promise<string> {
  const taken = new Set((await listNames(hist)).map((n) => n.toLowerCase()));
  let name = `${stamp}${suffix}`;
  for (let i = 2; taken.has(name.toLowerCase()); i++) name = `${stamp}-${i}${suffix}`;
  return name;
}

async function pruneHistory(hist: SaveDirLike, suffix: string, keep = SAVE_HISTORY_KEEP): Promise<void> {
  const names = (await listNames(hist))
    .filter((n) => parseHistoryName(n)?.suffix === suffix)
    .sort()
    .reverse();
  for (const n of names.slice(keep)) {
    try {
      await hist.removeEntry(n);
    } catch {}
  }
}

async function historyDir(dir: SaveDirLike, base: string): Promise<SaveDirLike> {
  const root = await dir.getDirectoryHandle(SAVE_HISTORY_DIR, { create: true });
  return root.getDirectoryHandle(base, { create: true });
}

async function backupBytes(
  dir: SaveDirLike,
  base: string,
  suffix: string,
  data: File,
  now: Date
): Promise<void> {
  const hist = await historyDir(dir, base);
  const name = await freeHistoryName(hist, formatSaveStamp(now), suffix);
  await writeBytes(hist, name, await data.arrayBuffer());
  await pruneHistory(hist, suffix);
}

async function sameContent(a: File, b: File): Promise<boolean> {
  if (a.size !== b.size) return false;
  const [x, y] = await Promise.all([a.arrayBuffer(), b.arrayBuffer()]);
  const ua = new Uint8Array(x);
  const ub = new Uint8Array(y);
  for (let i = 0; i < ua.length; i++) if (ua[i] !== ub[i]) return false;
  return true;
}

async function moveOrCopy(
  src: SaveDirLike,
  srcName: string,
  dst: SaveDirLike,
  dstName: string,
  file: File,
  mode: 'move' | 'copy',
  same: boolean
): Promise<void> {
  if (mode === 'move') {
    try {
      const fh = await src.getFileHandle(srcName);
      if (typeof fh?.move === 'function') {
        // move() сохраняет время изменения: оно нужно для выбора новее/старше.
        if (same) await fh.move(dstName);
        else await fh.move(dst, dstName);
        return;
      }
    } catch {}
  }
  await writeBytes(dst, dstName, await file.arrayBuffer());
  if (mode === 'move' && !(same && srcName.toLowerCase() === dstName.toLowerCase())) {
    await src.removeEntry(srcName);
  }
}

/**
 * Переносит (или копирует) сохранения рома и их историю при переименовании/переносе:
 * 1) .aegis-saves/<old>/ → .aegis-saves/<new>/;
 * 2) каждое сохранение сначала копируется в историю;
 * 3) если у нового имени уже есть своё сохранение, текущим остаётся более новое по времени,
 *    второе лежит в истории. Ничего не пропадает без копии.
 * Moves (or copies) a ROM's saves and history on rename/move. If the new name already has its
 * own save, the newer one by time stays current and the other is kept in history.
 */
export async function carryRomSaves(
  srcDir: SaveDirLike | null | undefined,
  dstDir: SaveDirLike | null | undefined,
  oldBase: string,
  newBase: string,
  opts: { mode?: 'move' | 'copy'; now?: Date } = {}
): Promise<SaveCarryResult> {
  const res: SaveCarryResult = { moved: 0, conflicts: 0, history: 0 };
  if (!srcDir || !dstDir || !oldBase || !newBase) return res;
  const mode = opts.mode || 'move';
  const now = opts.now || new Date();
  const same = await sameDir(srcDir, dstDir);
  if (same && oldBase === newBase) return res;

  // Быстрая проверка: есть ли вообще что переносить. / Anything to carry at all?
  const srcNames = await listNames(srcDir);
  const lowerOld = oldBase.toLowerCase();
  const ownSaves = srcNames.filter((n) => saveSuffixOf(n, oldBase));
  const histRoot = await tryGetDir(srcDir, SAVE_HISTORY_DIR);
  const oldHist = histRoot ? await tryGetDir(histRoot, oldBase) : null;
  if (ownSaves.length === 0 && !oldHist) return res;

  // 1. История. / History.
  if (oldHist && !(same && lowerOld === newBase.toLowerCase())) {
    const names = (await listNames(oldHist)).filter((n) => parseHistoryName(n));
    if (names.length > 0) {
      const newHist = await historyDir(dstDir, newBase);
      const touched = new Set<string>();
      for (const n of names) {
        const parsed = parseHistoryName(n)!;
        const f = await tryGetFile(oldHist, n);
        if (!f) continue;
        try {
          const target = await freeHistoryName(newHist, parsed.stamp, parsed.suffix);
          await writeBytes(newHist, target, await f.arrayBuffer());
          if (mode === 'move') await oldHist.removeEntry(n);
          res.history++;
          touched.add(parsed.suffix);
        } catch {}
      }
      for (const s of touched) await pruneHistory(newHist, s);
    }
    if (mode === 'move' && histRoot) {
      try {
        if ((await listNames(oldHist)).length === 0) await histRoot.removeEntry(oldBase);
        if ((await listNames(histRoot, 'directory')).length === 0 && (await listNames(histRoot)).length === 0) {
          await srcDir.removeEntry(SAVE_HISTORY_DIR);
        }
      } catch {}
    }
  }

  // 2–3. Сами сохранения. / The saves themselves.
  for (const srcName of ownSaves) {
    const sfx = saveSuffixOf(srcName, oldBase);
    const srcFile = await tryGetFile(srcDir, srcName);
    if (!srcFile) continue;
    const dstName = `${newBase}${srcName.slice(oldBase.length)}`;
    try {
      if (same && srcName.toLowerCase() === dstName.toLowerCase()) {
        // Только регистр. / Case-only rename.
        if (srcName !== dstName) await moveOrCopy(srcDir, srcName, dstDir, dstName, srcFile, mode, same);
        res.moved++;
        continue;
      }
      await backupBytes(dstDir, newBase, sfx, srcFile, now);
      const dstFile = await tryGetFile(dstDir, dstName);
      if (dstFile) {
        res.conflicts++;
        if (await sameContent(srcFile, dstFile)) {
          if (mode === 'move') await srcDir.removeEntry(srcName);
          res.moved++;
          continue;
        }
        if (srcFile.lastModified <= dstFile.lastModified) {
          // Своё сохранение цели новее: оставляем его, перенесённое уже в истории.
          if (mode === 'move') await srcDir.removeEntry(srcName);
          continue;
        }
        await backupBytes(dstDir, newBase, sfx, dstFile, now);
        await dstDir.removeEntry(dstName);
      }
      await moveOrCopy(srcDir, srcName, dstDir, dstName, srcFile, mode, same);
      res.moved++;
    } catch {}
  }
  return res;
}

/** Сколько видов сохранений у рома по набору имён файлов его папки (в нижнем регистре). */
export function countSavesForRom(namesInDirLower: Set<string> | undefined, romFileName: string): number {
  if (!namesInDirLower || namesInDirLower.size === 0) return 0;
  const base = romStem(romFileName).toLowerCase();
  let n = 0;
  for (const s of SAVE_SUFFIXES) if (namesInDirLower.has(`${base}${s}`)) n++;
  return n;
}

// ---------- сохранения со сборкой (шаг 7) / saves with a build (step 7) ----------

/**
 * Что переносим на устройство и обратно: игровые сохранения. Снимки состояний (.state*) не
 * переносим: RetroArch на приставке открывает их только с той же версией ядра.
 * What travels to the device and back: game saves. Save states (.state*) stay home: RetroArch on
 * a handheld opens them only with the same core version.
 */
export const DEVICE_SYNC_SUFFIXES: readonly string[] = SAVE_SUFFIXES.filter((s) => !s.startsWith('.state'));

export interface SaveSyncResult {
  toDevice: number;
  fromDevice: number;
  conflicts: number;
}

/**
 * Сверка сохранений рома между библиотекой и устройством при выгрузке сборки.
 * Есть только с одной стороны — копируется на другую. Есть с обеих и отличаются — текущим
 * становится более новое по времени, а обе версии остаются в истории библиотеки (.aegis-saves).
 * На устройство история не пишется.
 * Syncs a ROM's saves between the library and the device on build export. One side only: copied
 * over. Both sides and different: the newer by time wins on both sides; both versions are kept in
 * the library history. No history is written to the device.
 */
export async function syncRomSavesWithDevice(
  libDir: SaveDirLike | null | undefined,
  libBase: string,
  devDir: SaveDirLike | null | undefined,
  devBase: string,
  opts: { now?: Date } = {}
): Promise<SaveSyncResult> {
  const res: SaveSyncResult = { toDevice: 0, fromDevice: 0, conflicts: 0 };
  if (!libDir || !devDir || !libBase || !devBase) return res;
  const now = opts.now || new Date();
  const libNames = new Set((await listNames(libDir)).map((n) => n.toLowerCase()));
  const devNames = new Set((await listNames(devDir)).map((n) => n.toLowerCase()));
  for (const sfx of DEVICE_SYNC_SUFFIXES) {
    const libName = `${libBase}${sfx}`;
    const devName = `${devBase}${sfx}`;
    const hasLib = libNames.has(libName.toLowerCase());
    const hasDev = devNames.has(devName.toLowerCase());
    if (!hasLib && !hasDev) continue;
    try {
      const lib = hasLib ? await tryGetFile(libDir, libName) : null;
      const dev = hasDev ? await tryGetFile(devDir, devName) : null;
      if (lib && !dev) {
        await writeBytes(devDir, devName, await lib.arrayBuffer());
        res.toDevice++;
        continue;
      }
      if (dev && !lib) {
        await writeBytes(libDir, libName, await dev.arrayBuffer());
        res.fromDevice++;
        continue;
      }
      if (!lib || !dev || (await sameContent(lib, dev))) continue;
      res.conflicts++;
      if (dev.lastModified > lib.lastModified) {
        // На приставке играли позже: она главная, прежнее из библиотеки — в историю.
        await backupBytes(libDir, libBase, sfx, lib, now);
        await writeBytes(libDir, libName, await dev.arrayBuffer());
        res.fromDevice++;
      } else {
        // В библиотеке новее: версия с приставки — в историю библиотеки, на приставку новое.
        await backupBytes(libDir, libBase, sfx, dev, now);
        await writeBytes(devDir, devName, await lib.arrayBuffer());
        res.toDevice++;
      }
    } catch {}
  }
  return res;
}
