// Раскладка медиа Skraper и мануалы.
// Skraper 1.4.x кладёт медиа не в images/ и videos/ рядом с ромами, а глубже:
// <консоль>/media/images, media/videos, media/manuals, media/box2dfront, media/wheel… Имена
// подпапок настраиваются в Skraper, поэтому распознаём их по словарю, а не по одной схеме.
// Часть подпапок (fanart, maps, support, manuals) — не обложки: их картинки нельзя брать
// обложкой или скриншотом, иначе у игры появится карта уровня вместо боксарта.
//
// Skraper media layout and manuals.
// Skraper 1.4.x puts media deeper than images/ and videos/ next to the ROMs:
// <console>/media/images, media/videos, media/manuals, media/box2dfront, media/wheel… Folder names
// are configurable in Skraper, so they are recognized from a dictionary. Some folders (fanart,
// maps, support, manuals) are not covers: their images must not become a cover or screenshot.
//
// Модуль без импортов, чтобы тесты шли через `node --test`.
// No imports, so tests run with `node --test`.

/** Папки-контейнеры: внутри лежат папки по видам медиа. / Container folders holding per-kind folders. */
export const MEDIA_CONTAINER_DIRS = new Set(['media', 'downloaded_media']);

/** Папки с мануалами. / Manual folders. */
export const MANUAL_DIRS = new Set(['manuals', 'manual', 'docs']);

/** Расширения мануалов, которые открывает встроенный просмотр. / Manual extensions the viewer opens. */
export const MANUAL_EXTS = new Set(['.pdf']);

/**
 * Папки, картинки из которых не обложки и не скриншоты: фон, карты, картридж, задник коробки,
 * рамки, мануалы. Их пропускаем при поиске картинок рома.
 * Folders whose images are neither covers nor screenshots: fan art, maps, cartridge, box back,
 * bezels, manuals. They are skipped when looking for a ROM's images.
 */
export const NON_COVER_DIRS = new Set([
  'fanart',
  'fanarts',
  'maps',
  'map',
  'support',
  'supporttexture',
  'support-texture',
  'cartridge',
  'cartridges',
  'carts',
  'boxback',
  'box2dback',
  'box2dside',
  'boxside',
  'boxtexture',
  'box-texture',
  'bezel',
  'bezels',
  'extra',
  'extra1',
  'manuals',
  'manual',
  'docs',
  'magazines',
  'flyers',
]);

const extOf = (name: string): string => {
  const i = name.lastIndexOf('.');
  return i < 0 ? '' : name.slice(i).toLowerCase();
};

/** Последняя папка пути. / The innermost folder of a path. */
export function lastDirName(dirPath: string | undefined): string {
  return (
    String(dirPath || '')
      .split(/[\\/]/)
      .filter(Boolean)
      .pop() || ''
  ).toLowerCase();
}

/** Картинки из этой папки не годятся в обложки. / Images from this folder are not covers. */
export function isNonCoverDir(dirPath: string | undefined): boolean {
  return NON_COVER_DIRS.has(lastDirName(dirPath));
}

/**
 * Файл — мануал: PDF в папке manuals/ или с суффиксом -manual в имени.
 * The file is a manual: a PDF in a manuals/ folder or with a -manual suffix.
 */
export function isManualFile(fileName: string, dirPath?: string): boolean {
  if (!MANUAL_EXTS.has(extOf(fileName))) return false;
  if (MANUAL_DIRS.has(lastDirName(dirPath))) return true;
  return /[-_ ]manual$/i.test(fileName.replace(/\.[^/.]+$/, ''));
}

/** Имя рома из имени мануала: без расширения и суффикса -manual. / ROM stem from a manual file name. */
export function manualStem(fileName: string): string {
  return fileName
    .replace(/\.[^/.]+$/, '')
    .replace(/[-_ ]manual$/i, '')
    .trim();
}

/**
 * Где искать мануал относительно папки рома (и её родителя для многодисковых папок).
 * Where to look for a manual relative to the ROM folder (and its parent for multi-disc folders).
 */
export const MANUAL_SEARCH_DIRS: readonly string[] = [
  'manuals',
  'media/manuals',
  'manual',
  'media/manual',
  'downloaded_media/manuals',
];

/** Имена файлов мануала для рома. / Manual file names for a ROM. */
export function manualFileNames(romStem: string): string[] {
  const s = romStem.trim();
  if (!s) return [];
  return [`${s}.pdf`, `${s}-manual.pdf`, `${s}_manual.pdf`];
}

/** Индекс мануалов скана: ключ — имя рома в нижнем регистре. / Scan manual index keyed by lowercase ROM stem. */
export class ManualIndex<F> {
  private readonly byKey = new Map<string, { file: F; relPath: string }>();

  get size(): number {
    return this.byKey.size;
  }

  add(keys: Iterable<string>, file: F, relPath: string): void {
    for (const k of keys) {
      const key = String(k || '').trim().toLowerCase();
      if (key && !this.byKey.has(key)) this.byKey.set(key, { file, relPath });
    }
  }

  lookup(keys: Iterable<string>): { file: F; relPath: string } | undefined {
    for (const k of keys) {
      const key = String(k || '').trim().toLowerCase();
      if (!key) continue;
      const hit = this.byKey.get(key);
      if (hit) return hit;
    }
    return undefined;
  }
}

/**
 * Подпапки по видам внутри media/ (или самой папки консоли). Сначала папки консоли, потом media/*.
 * Per-kind folders: those of the console folder first, then media/*.
 */
export async function listMediaKindDirs<D extends { kind: string; name: string }>(
  dir: { values(): AsyncIterable<D> }
): Promise<Array<{ handle: D; relPath: string }>> {
  const out: Array<{ handle: D; relPath: string }> = [];
  const containers: D[] = [];
  for await (const e of dir.values()) {
    if (e.kind !== 'directory') continue;
    const low = e.name.toLowerCase();
    if (MEDIA_CONTAINER_DIRS.has(low)) containers.push(e);
    out.push({ handle: e, relPath: e.name });
  }
  for (const c of containers) {
    try {
      for await (const e of (c as any).values() as AsyncIterable<D>) {
        if (e.kind === 'directory') out.push({ handle: e, relPath: `${c.name}/${e.name}` });
      }
    } catch {}
  }
  return out;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Новое имя медиафайла при переименовании рома: «Старое.png» → «Новое.png»,
 * «Старое-manual.pdf» → «Новое-manual.pdf». Чужие файлы — null.
 * The new media file name when a ROM is renamed. Files of other ROMs: null.
 */
export function renamedMediaName(fileName: string, oldBase: string, newBase: string): string | null {
  if (!oldBase || !newBase || oldBase === newBase) return null;
  const m = fileName.match(new RegExp(`^${escapeRe(oldBase)}((?:[-_][A-Za-z0-9]+)?\\.[A-Za-z0-9]+)$`, 'i'));
  return m ? `${newBase}${m[1]}` : null;
}

interface RenameDir {
  kind: string;
  name: string;
  values(): AsyncIterable<any>;
  getFileHandle(name: string, opts?: { create?: boolean }): Promise<any>;
  removeEntry(name: string): Promise<void>;
}

/**
 * Переименовывает медиа рома во всех папках media/* (раскладка Skraper). Возвращает число файлов.
 * Renames a ROM's media in every media/* folder (Skraper layout). Returns the file count.
 */
export async function renameRomMediaInContainers(parentDir: RenameDir, oldBase: string, newBase: string): Promise<number> {
  let done = 0;
  const dirs: RenameDir[] = [];
  try {
    for await (const e of parentDir.values()) {
      if (e.kind !== 'directory' || !MEDIA_CONTAINER_DIRS.has(String(e.name).toLowerCase())) continue;
      for await (const sub of e.values()) if (sub.kind === 'directory') dirs.push(sub);
    }
  } catch {
    return done;
  }
  for (const d of dirs) {
    const pairs: Array<[string, string]> = [];
    try {
      for await (const f of d.values()) {
        if (f.kind !== 'file') continue;
        const next = renamedMediaName(f.name, oldBase, newBase);
        if (next) pairs.push([f.name, next]);
      }
    } catch {
      continue;
    }
    for (const [from, to] of pairs) {
      try {
        const src = await (await d.getFileHandle(from)).getFile();
        const dst = await d.getFileHandle(to, { create: true });
        const w = await dst.createWritable();
        await w.write(src);
        await w.close();
        if (from.toLowerCase() !== to.toLowerCase()) await d.removeEntry(from);
        done++;
      } catch {}
    }
  }
  return done;
}
