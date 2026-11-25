// Медиа для сборки: поиск обложек, баннеров и видео рядом с ромом и раскладка по папкам
// целевого устройства, плюс gamelist.xml для EmulationStation.
//
// Media for builds: finds covers, banners and videos next to a ROM, lays them out in the
// target device's folders, and writes gamelist.xml for EmulationStation.

import {
  GAMELIST_INFO_TAGS,
  type GamelistEntry,
  findGamelistEntry,
  indexGamelistEntries,
  normalizeGamelistPath,
  parseGamelistEntries,
  splitRelativeMediaPath,
} from './gamelistXml.ts';
import { listMediaKindDirs } from './skraperMedia.ts';
import { type MediaKind, type MediaSet, mediaSetOf } from './mediaKinds.ts';

export type BuildMediaKind = 'image' | 'thumbnail' | 'marquee' | 'video';
export const BUILD_MEDIA_KINDS: BuildMediaKind[] = ['thumbnail', 'image', 'marquee', 'video'];

export interface BuildExportOptions {
  includeMedia: boolean;
  mediaKinds: Record<BuildMediaKind, boolean>;
  /** Не перезаписывать файл того же размера. / Do not rewrite a same-size file. */
  skipExisting: boolean;
  /** gamelist.xml для профилей EmulationStation. / gamelist.xml for EmulationStation profiles. */
  writeGamelist: boolean;
  /** Сохранения (.srm, .sav…) туда и обратно, см. utils/saveFiles.ts. / Saves both ways. */
  syncSaves: boolean;
}

export const DEFAULT_BUILD_EXPORT_OPTIONS: BuildExportOptions = {
  includeMedia: true,
  mediaKinds: { thumbnail: true, image: true, marquee: true, video: false },
  skipExisting: true,
  writeGamelist: true,
  syncSaves: true,
};

const OPTIONS_KEY = 'aegisrom_build_export_options_v1';

export function loadBuildExportOptions(): BuildExportOptions {
  try {
    const raw = localStorage.getItem(OPTIONS_KEY);
    if (!raw) return { ...DEFAULT_BUILD_EXPORT_OPTIONS, mediaKinds: { ...DEFAULT_BUILD_EXPORT_OPTIONS.mediaKinds } };
    const v = JSON.parse(raw);
    return {
      includeMedia: typeof v.includeMedia === 'boolean' ? v.includeMedia : DEFAULT_BUILD_EXPORT_OPTIONS.includeMedia,
      mediaKinds: { ...DEFAULT_BUILD_EXPORT_OPTIONS.mediaKinds, ...(v.mediaKinds || {}) },
      skipExisting: typeof v.skipExisting === 'boolean' ? v.skipExisting : DEFAULT_BUILD_EXPORT_OPTIONS.skipExisting,
      writeGamelist: typeof v.writeGamelist === 'boolean' ? v.writeGamelist : DEFAULT_BUILD_EXPORT_OPTIONS.writeGamelist,
      syncSaves: typeof v.syncSaves === 'boolean' ? v.syncSaves : DEFAULT_BUILD_EXPORT_OPTIONS.syncSaves,
    };
  } catch {
    return { ...DEFAULT_BUILD_EXPORT_OPTIONS, mediaKinds: { ...DEFAULT_BUILD_EXPORT_OPTIONS.mediaKinds } };
  }
}

export function saveBuildExportOptions(o: BuildExportOptions): void {
  try {
    localStorage.setItem(OPTIONS_KEY, JSON.stringify(o));
  } catch {}
}

// ---------------------------------------------------------------------------
// Раскладка на устройстве / Layout on the device
// ---------------------------------------------------------------------------

/**
 * es: images/{rom}-image.png, images/{rom}-thumb.png, marquees/{rom}-marquee.png, videos/{rom}-video.mp4
 * covers: covers/{rom}.png, marquees/{rom}.png, videos/{rom}.mp4
 * single: Imgs/{rom}.png (одна картинка / one picture)
 */
export type MediaLayout = 'es' | 'covers' | 'single' | 'none';

export function profileMediaLayout(mediaFolders: readonly string[]): MediaLayout {
  const lower = mediaFolders.map((f) => f.toLowerCase());
  if (lower.includes('images')) return 'es';
  if (lower.includes('covers')) return 'covers';
  if (lower.includes('imgs')) return 'single';
  return 'none';
}

export interface FoundMedia {
  /** Возвращает файл. / Returns the file. */
  getFile: () => Promise<File>;
  /** Расширение с точкой, в нижнем регистре. / Lower-case extension with the dot. */
  ext: string;
}

export interface MediaTarget {
  kind: BuildMediaKind;
  /** Подпапка в папке консоли. / Subfolder inside the console folder. */
  folder: string;
  name: string;
  source: FoundMedia;
}

/**
 * Какие файлы и куда положить. stem — имя рома в сборке без расширения.
 * Which files go where. stem is the ROM's name in the build without extension.
 */
export function planMediaTargets(
  layout: MediaLayout,
  mediaFolders: readonly string[],
  wanted: Record<BuildMediaKind, boolean>,
  found: Partial<Record<BuildMediaKind, FoundMedia>>,
  stem: string
): MediaTarget[] {
  const out: MediaTarget[] = [];
  const has = (k: BuildMediaKind) => Boolean(wanted[k] && found[k]);
  const folderNamed = (name: string, fallback: string) =>
    mediaFolders.find((f) => f.toLowerCase() === name) || fallback;

  if (layout === 'es') {
    const images = folderNamed('images', 'images');
    const marquees = mediaFolders.some((f) => f.toLowerCase() === 'marquees') ? folderNamed('marquees', 'marquees') : images;
    const videos = folderNamed('videos', 'videos');
    if (has('image')) out.push({ kind: 'image', folder: images, name: `${stem}-image${found.image!.ext}`, source: found.image! });
    if (has('thumbnail'))
      out.push({ kind: 'thumbnail', folder: images, name: `${stem}-thumb${found.thumbnail!.ext}`, source: found.thumbnail! });
    if (has('marquee'))
      out.push({ kind: 'marquee', folder: marquees, name: `${stem}-marquee${found.marquee!.ext}`, source: found.marquee! });
    if (has('video')) out.push({ kind: 'video', folder: videos, name: `${stem}-video${found.video!.ext}`, source: found.video! });
    return out;
  }

  if (layout === 'covers' || layout === 'single') {
    const cover = has('thumbnail') ? found.thumbnail! : has('image') ? found.image! : undefined;
    const coverFolder = layout === 'covers' ? folderNamed('covers', 'covers') : folderNamed('imgs', 'Imgs');
    if (cover) out.push({ kind: has('thumbnail') ? 'thumbnail' : 'image', folder: coverFolder, name: `${stem}${cover.ext}`, source: cover });
    if (layout === 'covers') {
      if (has('marquee') && mediaFolders.some((f) => f.toLowerCase() === 'marquees'))
        out.push({ kind: 'marquee', folder: folderNamed('marquees', 'marquees'), name: `${stem}${found.marquee!.ext}`, source: found.marquee! });
      if (has('video') && mediaFolders.some((f) => f.toLowerCase() === 'videos'))
        out.push({ kind: 'video', folder: folderNamed('videos', 'videos'), name: `${stem}${found.video!.ext}`, source: found.video! });
    }
    return out;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Поиск медиа рядом с ромом / Finding media next to a ROM
// ---------------------------------------------------------------------------

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.gif']);
const VIDEO_EXTS = new Set(['.mp4', '.webm', '.mkv', '.avi', '.m4v']);

/** Папки с медиа рядом с ромами и вид медиа по умолчанию для файлов без суффикса. */
/** Media folders next to ROMs and the default kind for files without a suffix. */
const MEDIA_DIRS: Record<string, BuildMediaKind> = {
  images: 'image',
  image: 'image',
  snap: 'image',
  snaps: 'image',
  screenshots: 'image',
  screenshot: 'image',
  titles: 'image',
  downloaded_images: 'image',
  download_images: 'image',
  media: 'image',
  // Skraper: мини-картинки, коллажи, титульный экран. / Skraper: mixes and title screens.
  mix: 'image',
  mixrbv1: 'image',
  mixrbv2: 'image',
  miximages: 'image',
  screenshottitle: 'image',
  box3d: 'image',
  boxart: 'thumbnail',
  boxarts: 'thumbnail',
  box2dfront: 'thumbnail',
  boxfront: 'thumbnail',
  covers: 'thumbnail',
  cover: 'thumbnail',
  thumbnails: 'thumbnail',
  imgs: 'thumbnail',
  marquees: 'marquee',
  marquee: 'marquee',
  wheel: 'marquee',
  wheels: 'marquee',
  wheelhd: 'marquee',
  wheelcarbon: 'marquee',
  wheelsteel: 'marquee',
  logos: 'marquee',
  videos: 'video',
  video: 'video',
};

const SUFFIX_KIND: Array<[string, BuildMediaKind]> = [
  ['-image', 'image'],
  ['_image', 'image'],
  ['-screenshot', 'image'],
  ['-snap', 'image'],
  ['-thumb', 'thumbnail'],
  ['_thumb', 'thumbnail'],
  ['-boxart', 'thumbnail'],
  ['-box', 'thumbnail'],
  ['-cover', 'thumbnail'],
  ['-marquee', 'marquee'],
  ['-wheel', 'marquee'],
  ['-logo', 'marquee'],
  ['-video', 'video'],
  ['_video', 'video'],
];

function extOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot).toLowerCase();
}

function stemOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return (dot === -1 ? name : name.slice(0, dot)).trim().toLowerCase();
}

/**
 * Разбирает имя медиафайла: стем рома и вид. dirKind — вид по папке.
 * Parses a media file name: the ROM stem and the kind. dirKind is the folder's kind.
 */
export function classifyMediaFileName(
  fileName: string,
  dirKind: BuildMediaKind
): { stem: string; kind: BuildMediaKind } | null {
  const ext = extOf(fileName);
  const isVideo = VIDEO_EXTS.has(ext);
  if (!isVideo && !IMAGE_EXTS.has(ext)) return null;
  let stem = stemOf(fileName);
  let kind: BuildMediaKind | null = null;
  for (const [sfx, k] of SUFFIX_KIND) {
    if (stem.endsWith(sfx)) {
      stem = stem.slice(0, -sfx.length).trim();
      kind = k;
      break;
    }
  }
  if (isVideo) kind = 'video';
  else if (!kind || kind === 'video') kind = dirKind === 'video' ? 'image' : dirKind;
  if (!stem) return null;
  return { stem, kind };
}

type StemIndex = Map<string, Partial<Record<BuildMediaKind, FoundMedia>>>;

interface DirMediaInfo {
  gamelist: Map<string, GamelistEntry> | null;
  byStem: StemIndex;
}

/**
 * Индекс медиа по папкам ромов: gamelist.xml и папки images/videos/... читаются один раз.
 * Media index per ROM folder: gamelist.xml and images/videos/... are read once.
 */
export class MediaSourceIndex {
  private readonly dirs = new Map<any, Promise<DirMediaInfo>>();

  private load(dir: any): Promise<DirMediaInfo> {
    let p = this.dirs.get(dir);
    if (!p) {
      p = this.read(dir);
      this.dirs.set(dir, p);
    }
    return p;
  }

  private async read(dir: any): Promise<DirMediaInfo> {
    let gamelist: Map<string, GamelistEntry> | null = null;
    const byStem: StemIndex = new Map();
    try {
      const fh = await dir.getFileHandle('gamelist.xml');
      const text = await (await fh.getFile()).text();
      gamelist = indexGamelistEntries(parseGamelistEntries(text));
    } catch {}
    try {
      // Папки консоли и media/* (Skraper кладёт всё в <консоль>/media/<вид>/).
      // The console's folders and media/* (Skraper puts everything in <console>/media/<kind>/).
      for (const { handle: entry } of await listMediaKindDirs<any>(dir)) {
        const low = String(entry.name).toLowerCase();
        const dirKind = MEDIA_DIRS[low];
        if (!dirKind) continue;
        try {
          for await (const f of entry.values()) {
            if (f.kind !== 'file') continue;
            const c = classifyMediaFileName(f.name, dirKind);
            if (!c) continue;
            const slot = byStem.get(c.stem) || {};
            if (!slot[c.kind]) {
              slot[c.kind] = { getFile: () => f.getFile(), ext: extOf(f.name) };
              byStem.set(c.stem, slot);
            }
          }
        } catch {}
      }
    } catch {}
    return { gamelist, byStem };
  }

  /** Запись gamelist.xml для рома, если есть. / The ROM's gamelist.xml entry, if any. */
  async gamelistEntry(dir: any, romFileName: string): Promise<GamelistEntry | undefined> {
    if (!dir) return undefined;
    const info = await this.load(dir);
    return info.gamelist ? findGamelistEntry(info.gamelist, romFileName) : undefined;
  }

  /**
   * Медиа рома: сначала пути из gamelist.xml, затем файлы по имени рома.
   * verify: путь из gamelist.xml берётся, только если файл есть, иначе ищем по имени.
   * A ROM's media: gamelist.xml paths first, then files named after the ROM.
   * verify: a gamelist.xml path counts only if the file exists, else the name lookup is used.
   */
  async find(
    dir: any,
    romFileName: string,
    extraStems: string[] = [],
    verify = false
  ): Promise<Partial<Record<BuildMediaKind, FoundMedia>>> {
    const out: Partial<Record<BuildMediaKind, FoundMedia>> = {};
    if (!dir) return out;
    const info = await this.load(dir);

    const entry = info.gamelist ? findGamelistEntry(info.gamelist, romFileName) : undefined;
    if (entry) {
      for (const kind of BUILD_MEDIA_KINDS) {
        const rel = entry.fields[kind];
        if (!rel) continue;
        const parts = splitRelativeMediaPath(rel);
        if (!parts) continue;
        if (verify && !(await existsInDir(dir, parts))) continue;
        const name = parts[parts.length - 1];
        out[kind] = {
          ext: extOf(name),
          getFile: async () => {
            let d = dir;
            for (let i = 0; i < parts.length - 1; i++) d = await d.getDirectoryHandle(parts[i]);
            return (await d.getFileHandle(name)).getFile();
          },
        };
      }
    }

    const stems = [stemOf(romFileName), ...extraStems.map((s) => s.trim().toLowerCase())].filter(Boolean);
    for (const s of stems) {
      const slot = info.byStem.get(s);
      if (!slot) continue;
      for (const kind of BUILD_MEDIA_KINDS) {
        if (!out[kind] && slot[kind]) out[kind] = slot[kind];
      }
    }
    return out;
  }
}

// ---------------------------------------------------------------------------
// gamelist.xml сборки / The build's gamelist.xml
// ---------------------------------------------------------------------------

export function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export interface BuildGamelistGame {
  /** Путь относительно папки консоли без "./". / Path relative to the console folder, without "./". */
  path: string;
  name: string;
  /** Медиа: путь относительно папки консоли. / Media: path relative to the console folder. */
  media: Partial<Record<BuildMediaKind, string>>;
  /** Поля из исходного gamelist.xml, уже экранированные. / Fields from the source gamelist.xml, already escaped. */
  info?: Record<string, string>;
}

function relPathForXml(p: string): string {
  return './' + p.replace(/\\/g, '/').replace(/^(\.\/)+/, '');
}

/**
 * gamelist.xml с играми сборки. Записи существующего файла для других ромов сохраняются.
 * gamelist.xml with the build's games. Entries of the existing file for other ROMs are kept.
 */
export function buildGamelistXml(games: BuildGamelistGame[], existingXml?: string | null): string {
  const ours = new Set(games.map((g) => normalizeGamelistPath(g.path)));
  const kept = existingXml
    ? parseGamelistEntries(existingXml).filter((e) => !ours.has(normalizeGamelistPath(e.path)))
    : [];
  const lines: string[] = ['<?xml version="1.0"?>', '<gameList>'];
  for (const e of kept) lines.push(`\t${e.raw.trim()}`);
  for (const g of games) {
    lines.push('\t<game>');
    lines.push(`\t\t<path>${escapeXml(relPathForXml(g.path))}</path>`);
    lines.push(`\t\t<name>${escapeXml(g.name)}</name>`);
    for (const kind of ['image', 'thumbnail', 'marquee', 'video'] as BuildMediaKind[]) {
      const m = g.media[kind];
      if (m) lines.push(`\t\t<${kind}>${escapeXml(relPathForXml(m))}</${kind}>`);
    }
    for (const tag of GAMELIST_INFO_TAGS) {
      const v = g.info?.[tag];
      if (v) lines.push(`\t\t<${tag}>${v}</${tag}>`);
    }
    lines.push('\t</game>');
  }
  lines.push('</gameList>', '');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Медиа из библиотеки: ссылки строки базы / Library media: the database row's links
// ---------------------------------------------------------------------------

/** Поля строки, где Библиотека хранит медиа. / Row fields where the Library keeps media. */
export interface BuildMediaRow {
  media?: MediaSet;
  boxArtUrl?: string;
  videoUrl?: string;
  /** Ручные правки редактора (utils/manualEdits.ts). / Editor manual edits. */
  manualMedia?: Partial<Record<BuildMediaKind, string>>;
}

/** Виды Библиотеки по порядку для каждого вида сборки. / Library kinds in order for each build kind. */
const LIBRARY_KINDS_FOR: Record<Exclude<BuildMediaKind, 'video'>, MediaKind[]> = {
  thumbnail: ['boxart'],
  image: ['image', 'snap', 'title'],
  marquee: ['marquee'],
};

/**
 * Локальная ли ссылка (файл на этом компьютере): blob: сеанса или /api/native/fs/media.
 * Ссылки в интернет (libretro, ScreenScraper) сборка не скачивает.
 * Is the link local (a file on this computer): a session blob: or /api/native/fs/media.
 * The build does not download internet links (libretro, ScreenScraper).
 */
export function isLocalMediaUrl(url?: string): boolean {
  return Boolean(url && (url.startsWith('blob:') || url.includes('/api/native/fs/media')));
}

/**
 * Ссылки медиа строки по видам сборки, только локальные. Порядок: правка редактора, media, boxArtUrl/videoUrl.
 * The row's media links by build kind, local only. Order: editor edit, media, boxArtUrl/videoUrl.
 */
export function rowMediaUrls(row: BuildMediaRow | undefined): Partial<Record<BuildMediaKind, string>> {
  const out: Partial<Record<BuildMediaKind, string>> = {};
  if (!row) return out;
  const set = mediaSetOf(row);
  for (const kind of BUILD_MEDIA_KINDS) {
    const manual = row.manualMedia?.[kind];
    if (isLocalMediaUrl(manual)) {
      out[kind] = manual;
      continue;
    }
    if (kind === 'video') {
      if (isLocalMediaUrl(row.videoUrl)) out.video = row.videoUrl;
      continue;
    }
    for (const lk of LIBRARY_KINDS_FOR[kind]) {
      if (isLocalMediaUrl(set[lk])) {
        out[kind] = set[lk];
        break;
      }
    }
  }
  return out;
}

const TYPE_EXT: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/bmp': '.bmp',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
};

/** Расширение по ссылке: path=… для нативной, иначе пусто. / Extension from a link: path=… for native, else empty. */
export function extOfMediaUrl(url: string): string {
  const q = url.indexOf('path=');
  if (q === -1) return '';
  let p = url.slice(q + 5).split('&')[0];
  try {
    p = decodeURIComponent(p.replace(/\+/g, ' '));
  } catch {}
  const name = p.split(/[\\/]/).pop() || '';
  const ext = extOf(name);
  return IMAGE_EXTS.has(ext) || VIDEO_EXTS.has(ext) ? ext : '';
}

/** Загрузчик ссылок; в тестах подменяется. / Link fetcher; replaced in tests. */
export type MediaUrlFetch = (url: string, init?: { method?: string }) => Promise<Response>;

/**
 * Медиа по ссылке из базы. Проверка: файл отвечает (HEAD для нативной ссылки), расширение берём из пути
 * или из Content-Type. null — файла нет.
 * Media from a database link. Check: the file answers (HEAD for a native link); the extension comes
 * from the path or from Content-Type. null: the file is missing.
 */
export async function probeMediaUrl(url: string, fetchUrl: MediaUrlFetch, kind: BuildMediaKind): Promise<FoundMedia | null> {
  try {
    const res = await fetchUrl(url, url.startsWith('blob:') ? undefined : { method: 'HEAD' });
    if (!res.ok) return null;
    const type = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    // Тело blob: не читаем, только заголовки. / The blob: body is not read, headers only.
    try {
      await res.body?.cancel();
    } catch {}
    const ext = extOfMediaUrl(url) || TYPE_EXT[type] || (kind === 'video' ? '.mp4' : '.png');
    return {
      ext,
      getFile: async () => {
        const r = await fetchUrl(url);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const blob = await r.blob();
        return new File([blob], `media${ext}`, { type: blob.type || type });
      },
    };
  } catch {
    return null;
  }
}

/** Проверяет, что файл по пути из gamelist.xml есть. / Checks that the gamelist.xml path's file exists. */
async function existsInDir(dir: any, parts: string[]): Promise<boolean> {
  try {
    let d = dir;
    for (let i = 0; i < parts.length - 1; i++) d = await d.getDirectoryHandle(parts[i]);
    await d.getFileHandle(parts[parts.length - 1]);
    return true;
  } catch {
    return false;
  }
}

export interface ResolveGameMediaInput {
  index: MediaSourceIndex;
  /** Папка рома (handle), если есть. / The ROM's folder handle, if any. */
  dir: any;
  romFileName: string;
  extraStems?: string[];
  row?: BuildMediaRow;
  fetchUrl?: MediaUrlFetch;
}

/**
 * Медиа игры для сборки из тех же источников, что у Библиотеки. По каждому виду берётся первый
 * существующий файл: 1) ссылка из базы (то, что видно в карточке), 2) путь из gamelist.xml,
 * 3) файл с именем рома в images/, videos/, media/* и т. п. Одна функция и для подсчёта в окне,
 * и для копирования, поэтому число в окне совпадает с тем, что будет скопировано.
 *
 * A game's media for the build from the same sources as the Library. For each kind the first
 * existing file wins: 1) the database link (what the card shows), 2) the gamelist.xml path,
 * 3) a file named after the ROM in images/, videos/, media/* etc. One function for both the count
 * in the dialog and the copy, so the count matches what gets copied.
 */
export async function resolveGameMedia(input: ResolveGameMediaInput): Promise<Partial<Record<BuildMediaKind, FoundMedia>>> {
  const { index, dir, romFileName, extraStems = [], row } = input;
  const fetchUrl: MediaUrlFetch | undefined =
    input.fetchUrl || (typeof fetch === 'function' ? (u, init) => fetch(u, init as RequestInit) : undefined);
  const out: Partial<Record<BuildMediaKind, FoundMedia>> = {};

  const urls = rowMediaUrls(row);
  if (fetchUrl) {
    await Promise.all(
      BUILD_MEDIA_KINDS.map(async (kind) => {
        const u = urls[kind];
        if (!u) return;
        const m = await probeMediaUrl(u, fetchUrl, kind);
        if (m) out[kind] = m;
      })
    );
  }
  if (BUILD_MEDIA_KINDS.every((k) => out[k]) || !dir) return out;

  const local = await index.find(dir, romFileName, extraStems, true);
  for (const kind of BUILD_MEDIA_KINDS) {
    if (!out[kind] && local[kind]) out[kind] = local[kind];
  }
  return out;
}
