// Каталоги тем для «Починки флешки» и установка темы в папку тем на карте.
// ArkOS / dArkOS: тот же каталог, что читает ThemeMaster на устройстве
// (Jetup13/Emulationstation-OGA-Theme-Gallery), тема = архив репозитория автора.
// Onion: официальный репозиторий OnionUI/Themes, тема = готовый zip из release/.
// Ничего существующего не перезаписываем: тема ставится только в новую папку.
//
// Theme catalogs for the card repair tool and installing a theme into the card's themes
// folder. ArkOS / dArkOS: the catalog ThemeMaster reads on the device, a theme is the
// author's repository archive. Onion: the official OnionUI/Themes repository, a theme is a
// packaged zip from release/. Nothing existing is overwritten: a theme only goes into a
// new folder.

import { forEachZipEntry, listZipNames } from './zipReader.ts';
import { safeZipPath } from './portMasterInstall.ts';

export type ThemeCatalogId = 'oga' | 'onion';

export const OGA_RESOLUTIONS = ['480x320', '640x480', '854x480', '960x544', '720x720'] as const;
export type OgaResolution = (typeof OGA_RESOLUTIONS)[number];
export type ThemeFit = 'yes' | 'no' | 'untested';

export interface ThemeEntry {
  id: string;
  catalog: ThemeCatalogId;
  name: string;
  author: string;
  // Страница темы у автора. / The theme's page.
  pageUrl: string;
  previewUrl: string;
  downloadUrl: string;
  // Имя папки темы на карте. / Theme folder name on the card.
  folderName: string;
  // Только для каталога OGA. / OGA catalog only.
  fit?: Partial<Record<OgaResolution, ThemeFit>>;
  updated?: string;
}

const fitOf = (s: string): ThemeFit => {
  const v = s.trim().toLowerCase();
  if (v === 'yes') return 'yes';
  if (v === 'no') return 'no';
  return 'untested';
};

// Таблица README галереи: | [Имя](https://github.com/owner/repo) | ![](preview) |480|640|854|960|720|
// The gallery README table.
export function parseOgaGallery(md: string): ThemeEntry[] {
  const out: ThemeEntry[] = [];
  const seen = new Set<string>();
  for (const line of md.split(/\r?\n/)) {
    if (!line.trim().startsWith('|')) continue;
    const m = line.match(/^\s*\|\s*\[([^\]]+)\]\((https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?))\/?\)\s*\|\s*!\[[^\]]*\]\(([^)\s]+)\)\s*\|(.*)$/);
    if (!m) continue;
    const [, name, pageUrl, owner, repo, previewUrl, rest] = m;
    const key = `${owner}/${repo}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const cells = rest.split('|').map((c) => c.trim());
    const fit: Partial<Record<OgaResolution, ThemeFit>> = {};
    OGA_RESOLUTIONS.forEach((r, i) => {
      if (cells[i] !== undefined && cells[i] !== '') fit[r] = fitOf(cells[i]);
    });
    out.push({
      id: `oga:${key}`,
      catalog: 'oga',
      name: name.trim(),
      author: owner,
      pageUrl,
      previewUrl,
      downloadUrl: `https://codeload.github.com/${owner}/${repo}/zip/HEAD`,
      folderName: repo,
      fit,
    });
  }
  return out;
}

const decodeEntities = (s: string) =>
  s
    .replace(/&#0?13;/g, '\n')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');

// Страница каталога Onion: <a href=".../release/X.zip"><img title="Name: …&#013;Author: …" src="preview">.
// An Onion catalog page.
export function parseOnionCatalog(md: string): { themes: ThemeEntry[]; pages: string[] } {
  const themes: ThemeEntry[] = [];
  const re = /<a href="(https:\/\/raw\.githubusercontent\.com\/OnionUI\/Themes\/main\/release\/([^"]+?\.zip))">\s*<img title="([^"]*)"[^>]*?src="([^"]+)"/g;
  let m: RegExpExecArray | null;
  const seen = new Set<string>();
  while ((m = re.exec(md))) {
    const [, downloadUrl, zipEnc, titleRaw, previewUrl] = m;
    if (seen.has(downloadUrl)) continue;
    seen.add(downloadUrl);
    const title = decodeEntities(titleRaw);
    const field = (k: string) => (title.match(new RegExp(`^${k}:\\s*(.+)$`, 'm'))?.[1] || '').trim();
    let folder = zipEnc;
    try {
      folder = decodeURIComponent(zipEnc);
    } catch {}
    folder = folder.replace(/\.zip$/i, '');
    themes.push({
      id: `onion:${folder.toLowerCase()}`,
      catalog: 'onion',
      name: field('Name') || folder,
      author: field('Author'),
      pageUrl: `https://github.com/OnionUI/Themes/tree/main/themes/${zipEnc.replace(/\.zip$/i, '')}`,
      previewUrl,
      downloadUrl,
      folderName: folder,
      updated: field('Last updated') || undefined,
    });
  }
  const pages: string[] = [];
  for (const p of md.matchAll(/\]\((index-\d{2}-[0-9a-f]{2}\.md)\)/g)) if (!pages.includes(p[1])) pages.push(p[1]);
  return { themes, pages };
}

// Подходит ли тема к экрану: «да» сначала, потом «не проверена», «нет» скрываем.
// Whether a theme fits the screen: "yes" first, then "untested"; "no" is hidden.
export function filterOgaByResolution(list: ThemeEntry[], res: OgaResolution | 'all'): ThemeEntry[] {
  if (res === 'all') return list;
  const rank = (t: ThemeEntry) => (t.fit?.[res] === 'yes' ? 0 : t.fit?.[res] === 'no' ? 2 : 1);
  return list.filter((t) => rank(t) < 2).sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

// Куда встанет тема и как резать пути архива.
// Where a theme goes and how archive paths are cut.
export interface ThemeInstallLayout {
  // Папки верхнего уровня, которые появятся в папке тем. / Top folders that will appear in themes.
  folders: string[];
  // Сколько первых сегментов пути отрезать. / How many leading path segments to drop.
  strip: number;
  // Во что обернуть все записи (null — как в архиве). / Folder to wrap entries in (null: as in the archive).
  wrap: string | null;
}

// Архив репозитория GitHub всегда обёрнут в «repo-HEAD/»: обёртку срезаем и кладём в папку темы.
// Zip Onion распаковывается в Themes как есть (так сказано в OnionUI/Themes); в паке бывает
// несколько тем, каждая своей папкой. Если в корне архива лежат файлы, оборачиваем в папку
// с именем архива, чтобы не мусорить в Themes.
// A GitHub repository archive is always wrapped in "repo-HEAD/": drop it, put into the theme folder.
// An Onion zip is extracted into Themes as is (as OnionUI/Themes says); a pack holds several
// themes, each in its own folder. If files sit at the archive root, wrap them in a folder named
// after the archive so Themes stays clean.
export function planThemeLayout(entry: Pick<ThemeEntry, 'catalog' | 'folderName'>, names: string[]): ThemeInstallLayout {
  const segs = names.map((n) => safeZipPath(n)).filter((s): s is string[] => Boolean(s));
  const isDirName = (top: string) => segs.some((s) => s[0] === top && s.length > 1) || names.some((n) => n.replace(/\\/g, '/') === `${top}/`);
  const tops = [...new Set(segs.map((s) => s[0]))];
  const rootFiles = tops.filter((t) => !isDirName(t));
  if (entry.catalog === 'oga') {
    const singleTop = tops.length === 1 && rootFiles.length === 0;
    return { folders: [entry.folderName], strip: singleTop ? 1 : 0, wrap: entry.folderName };
  }
  if (tops.length > 0 && rootFiles.length === 0) return { folders: tops, strip: 0, wrap: null };
  return { folders: [entry.folderName], strip: 0, wrap: entry.folderName };
}

export class ThemeExistsError extends Error {
  folder: string;
  constructor(folder: string) {
    super(`theme-exists: ${folder}`);
    this.folder = folder;
  }
}

async function findChild(dir: any, name: string): Promise<any | null> {
  for await (const e of dir.values()) if (String(e.name).toLowerCase() === name.toLowerCase()) return e;
  return null;
}

// Установлена ли уже тема (есть папка с таким именем). / Whether the theme folder already exists.
export async function installedThemeFolders(themesDir: any): Promise<Set<string>> {
  const out = new Set<string>();
  for await (const e of themesDir.values()) if (e.kind === 'directory') out.add(String(e.name).toLowerCase());
  return out;
}

/**
 * Распаковывает тему в папку тем. Если хоть одна из её папок уже есть, ничего не пишет.
 * Unpacks a theme into the themes folder. If any of its folders exists, writes nothing.
 */
export async function installThemeZip(
  themesDir: any,
  zip: Uint8Array,
  entry: Pick<ThemeEntry, 'catalog' | 'folderName'>,
  onProgress?: (done: number, total: number) => void,
): Promise<{ folder: string; folders: string[]; files: number }> {
  const layout = planThemeLayout(entry, listZipNames(zip));
  for (const f of layout.folders) {
    const fs = safeZipPath(f);
    if (!fs || fs.length !== 1) throw new Error(`bad theme folder: ${f}`);
    if (await findChild(themesDir, f)) throw new ThemeExistsError(f);
  }
  let files = 0;
  const dirCache = new Map<string, any>([['', themesDir]]);
  const ensure = async (segs: string[]) => {
    let key = '';
    let cur = themesDir;
    for (const s of segs) {
      key = key ? `${key}/${s}` : s;
      let next = dirCache.get(key);
      if (!next) {
        next = await cur.getDirectoryHandle(s, { create: true });
        dirCache.set(key, next);
      }
      cur = next;
    }
    return cur;
  };
  for (const f of layout.folders) await ensure([f]);
  await forEachZipEntry(zip, async (e, idx, total) => {
    const raw = safeZipPath(e.name);
    const rest = raw ? raw.slice(layout.strip) : null;
    const segs = rest && rest.length > 0 ? (layout.wrap ? [layout.wrap, ...rest] : rest) : null;
    if (segs) {
      if (e.isDirectory) await ensure(segs);
      else if (segs.length > 1) {
        const dir = await ensure(segs.slice(0, -1));
        const fh = await dir.getFileHandle(segs[segs.length - 1], { create: true });
        const w = await fh.createWritable();
        await w.write(e.data as unknown as BufferSource);
        await w.close();
        files++;
      }
    }
    onProgress?.(idx + 1, total);
  });
  return { folder: layout.folders.join(', '), folders: layout.folders, files };
}

export const themeCatalogUrl = (catalog: ThemeCatalogId, page?: string) =>
  `/api/themes/catalog?src=${catalog}${page ? `&page=${encodeURIComponent(page)}` : ''}`;
export const themeDownloadUrl = (url: string) => `/api/themes/download?url=${encodeURIComponent(url)}`;
