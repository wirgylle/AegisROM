// Связи «ром в сборке → ром в библиотеке» для сверки сохранений по Wi-Fi.
// Выгрузка сборки в папку через Go пишет их в .aegis-saves-map.json в корне сборки, заливка
// по Wi-Fi (aegistransfer/saves.go) по ним находит сохранения в библиотеке. В браузерной версии
// путей на диске нет, и файл не пишется.
// "ROM in build → ROM in library" links for the Wi-Fi save sync. A build export into a Go-backed
// folder writes them to .aegis-saves-map.json at the build root; the Wi-Fi upload
// (aegistransfer/saves.go) uses them to find the library saves. The browser-only version has no
// disk paths, so the file is not written there.

export const SAVE_MAP_FILE = '.aegis-saves-map.json';

export interface SaveMapEntry {
  /** Полный путь рома в сборке / full path of the ROM in the build. */
  rom: string;
  /** Папка рома в библиотеке / ROM folder in the library. */
  libDir: string;
  /** Имя рома в библиотеке без расширения / library ROM name without extension. */
  libBase: string;
}

function nativeDirPath(dir: any): string {
  return dir && dir.__aegisNativeFs && typeof dir.path === 'string' ? dir.path : '';
}

function joinOs(dir: string, name: string): string {
  if (/[\\/]$/.test(dir)) return dir + name;
  const sep = dir.includes('\\') && !dir.includes('/') ? '\\' : '/';
  return `${dir}${sep}${name}`;
}

/**
 * Запись связи, если обе папки — нативные (с путём на диске), иначе null.
 * A link entry when both folders are native (have a disk path), else null.
 */
export function saveMapEntryFor(libDir: any, libBase: string, buildDir: any, buildFileName: string): SaveMapEntry | null {
  const lib = nativeDirPath(libDir);
  const build = nativeDirPath(buildDir);
  if (!lib || !build || !libBase || !buildFileName) return null;
  return { rom: joinOs(build, buildFileName), libDir: lib, libBase };
}

/** Новые записи поверх старых (ключ — путь рома). / New entries over old ones (keyed by ROM path). */
export function mergeSaveMap(existing: string | null | undefined, entries: SaveMapEntry[]): string {
  const byRom = new Map<string, SaveMapEntry>();
  if (existing) {
    try {
      const old = JSON.parse(existing);
      for (const e of Array.isArray(old?.entries) ? old.entries : []) {
        if (e && typeof e.rom === 'string' && typeof e.libDir === 'string' && typeof e.libBase === 'string') {
          byRom.set(e.rom.toLowerCase(), { rom: e.rom, libDir: e.libDir, libBase: e.libBase });
        }
      }
    } catch {}
  }
  for (const e of entries) byRom.set(e.rom.toLowerCase(), e);
  return JSON.stringify({ version: 1, entries: [...byRom.values()] }, null, 1);
}

/** Дописывает связи в корень сборки (только нативная папка). / Writes the links at the build root (native folder only). */
export async function writeSaveMap(rootDir: any, entries: SaveMapEntry[]): Promise<boolean> {
  if (!entries.length || !nativeDirPath(rootDir)) return false;
  let existing: string | null = null;
  try {
    const fh = await rootDir.getFileHandle(SAVE_MAP_FILE);
    existing = await (await fh.getFile()).text();
  } catch {}
  const fh = await rootDir.getFileHandle(SAVE_MAP_FILE, { create: true });
  const w = await fh.createWritable();
  await w.write(mergeSaveMap(existing, entries));
  await w.close();
  return true;
}
