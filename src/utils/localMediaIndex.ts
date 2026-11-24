// Источник «Готовые медиа»: картинки и видео, которые уже скачала другая программа
// (Skraper, ES-DE, Batocera, RetroBat и т. п.). Ищем в выбранной папке подпапку консоли
// (по имени папки ромов или коду системы), читаем её gamelist.xml и раскладку media-папок,
// и для каждого рома находим файлы по слотам: боксарт, скриншот, логотип, видео.
// Ничего не скачивается: файлы копируются в images/, marquees/, videos/ рядом с ромами.
//
// "Ready-made media" source: images and videos another program already downloaded
// (Skraper, ES-DE, Batocera, RetroBat…). In the chosen folder we find the console subfolder
// (by the ROM folder name or the system code), read its gamelist.xml and media folder layout,
// and for each ROM find files per slot. Nothing is downloaded: files are copied next to the ROMs.

import { normalizeGamelistPath, parseGamelistEntries, unescapeXml } from './gamelistXml.ts';
import type { MediaSlot } from './scrapePlan';

// Минимум интерфейса File System Access, который нам нужен (и нативный шим, и браузер).
// The File System Access subset we need (both the native shim and the browser).
export interface FileLike {
  kind: 'file';
  name: string;
  getFile(): Promise<{ text(): Promise<string>; arrayBuffer(): Promise<ArrayBuffer>; size?: number }>;
}
export interface DirLike {
  kind: 'directory';
  name: string;
  values(): AsyncIterable<FileLike | DirLike>;
}

export type LocalSlots = Partial<Record<MediaSlot, { handle: FileLike; path: string }>>;

export interface LocalConsoleIndex {
  dirName: string;
  // Ключ — имя рома без расширения в нижнем регистре. / Key: ROM name without extension, lowercase.
  byStem: Map<string, LocalSlots>;
  // Ключ — нормализованное название (без скобок, знаков, регистра). / Key: normalized title.
  byNorm: Map<string, LocalSlots>;
  mediaFiles: number;
  fromGamelist: number;
}

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp']);
const VIDEO_EXT = new Set(['.mp4', '.webm', '.mkv', '.avi', '.mov', '.m4v']);
const MAX_DEPTH = 4;

const extOf = (name: string) => {
  const i = name.lastIndexOf('.');
  return i < 0 ? '' : name.slice(i).toLowerCase();
};
const stemOf = (name: string) => name.replace(/\.[^/.]+$/, '');

// Суффиксы, которые программы добавляют к имени рома в имени картинки.
// Suffixes programs add to the ROM name in media file names.
const SUFFIX_SLOT: Array<[RegExp, MediaSlot]> = [
  [/-(image|boxart|box|cover|mix|miximage)$/i, 'image'],
  [/-(thumb|thumbnail|screenshot|snap|ss|titlescreen|title)$/i, 'thumb'],
  [/-(marquee|wheel|logo)$/i, 'marquee'],
  [/-(video|snapvideo)$/i, 'video'],
];

export function stripMediaSuffix(stem: string): { stem: string; slot: MediaSlot | null } {
  for (const [re, slot] of SUFFIX_SLOT) if (re.test(stem)) return { stem: stem.replace(re, ''), slot };
  return { stem, slot: null };
}

// Слот по папкам пути (снизу вверх): самая конкретная папка решает.
// Slot from the path folders, innermost first: the most specific folder wins.
const DIR_SLOT: Array<[RegExp, MediaSlot]> = [
  [/^(videos?|snapvideos?|video-?snaps?)$/i, 'video'],
  [/^(marquees?|wheels?|logos?|wheel-?carbon|wheel-?steel)$/i, 'marquee'],
  [/^(screenshots?|snaps?|ss|sstitle|titlescreens?|titleshots?|thumbnails?|thumbs?|named_snaps|named_titles)$/i, 'thumb'],
  [/^(box-?2d(front)?|box-?3d|boxart|boxfront|box_front|covers?|mix(images?)?|named_boxarts|fronts?)$/i, 'image'],
];

export function slotFromPath(relPath: string): MediaSlot | null {
  const parts = relPath.split('/').filter(Boolean);
  const file = parts.pop() || '';
  const ext = extOf(file);
  if (VIDEO_EXT.has(ext)) return 'video';
  if (!IMAGE_EXT.has(ext)) return null;
  const suffix = stripMediaSuffix(stemOf(file)).slot;
  if (suffix) return suffix;
  for (let i = parts.length - 1; i >= 0; i--) {
    for (const [re, slot] of DIR_SLOT) if (re.test(parts[i])) return slot === 'video' ? null : slot;
  }
  // Общая папка images/ без суффикса — боксарт. / A plain images/ folder without suffix: box art.
  if (parts.some((p) => /^(images?|media|downloaded_images)$/i.test(p))) return 'image';
  return null;
}

// Простая нормализация названия для сопоставления, если App не передал свою.
// Simple title normalization when App does not pass its own.
export function defaultNorm(name: string): string {
  return stemOf(name)
    .replace(/\[.*?\]|\(.*?\)/g, ' ')
    .replace(/[^a-z0-9а-яё]/gi, '')
    .toLowerCase();
}

// Теги gamelist.xml → слот; первые в списке важнее. / gamelist.xml tags to slots, first wins.
const TAG_SLOT: Array<[string, MediaSlot]> = [
  ['image', 'image'],
  ['boxart', 'image'],
  ['cover', 'image'],
  ['thumbnail', 'thumb'],
  ['screenshot', 'thumb'],
  ['titleshot', 'thumb'],
  ['marquee', 'marquee'],
  ['wheel', 'marquee'],
  ['video', 'video'],
];

async function walk(
  dir: DirLike,
  prefix: string,
  depth: number,
  files: Map<string, FileLike>,
  onDir?: (d: DirLike, rel: string) => void
): Promise<void> {
  for await (const e of dir.values()) {
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.kind === 'directory') {
      onDir?.(e, rel);
      if (depth < MAX_DEPTH) await walk(e, rel, depth + 1, files, onDir);
    } else {
      const ext = extOf(e.name);
      if (IMAGE_EXT.has(ext) || VIDEO_EXT.has(ext) || e.name.toLowerCase() === 'gamelist.xml') {
        files.set(rel.toLowerCase(), e);
      }
    }
  }
}

export async function buildLocalConsoleIndex(
  dir: DirLike,
  norm: (name: string) => string = defaultNorm
): Promise<LocalConsoleIndex> {
  const files = new Map<string, FileLike>();
  await walk(dir, '', 0, files);
  const byBase = new Map<string, string[]>();
  for (const rel of files.keys()) {
    const base = rel.split('/').pop()!;
    const list = byBase.get(base) || [];
    list.push(rel);
    byBase.set(base, list);
  }
  const byStem = new Map<string, LocalSlots>();
  const put = (stem: string, slot: MediaSlot, rel: string) => {
    const key = stem.toLowerCase();
    const cur = byStem.get(key) || {};
    if (cur[slot]) return;
    const handle = files.get(rel);
    if (!handle) return;
    cur[slot] = { handle, path: rel };
    byStem.set(key, cur);
  };
  // Путь из gamelist.xml: относительный к папке консоли; абсолютный — ищем по имени файла.
  // A gamelist.xml path: relative to the console folder; an absolute one is found by file name.
  const resolve = (raw: string): string | null => {
    const p = normalizeGamelistPath(raw);
    if (files.has(p)) return p;
    const base = unescapeXml(raw).replace(/\\/g, '/').split('/').pop()!.toLowerCase();
    const hits = byBase.get(base);
    return hits && hits.length === 1 ? hits[0] : null;
  };

  let fromGamelist = 0;
  const gl = files.get('gamelist.xml');
  if (gl) {
    try {
      const entries = parseGamelistEntries(await (await gl.getFile()).text());
      for (const e of entries) {
        const romStem = stemOf(unescapeXml(e.path).replace(/\\/g, '/').split('/').filter(Boolean).pop() || '');
        if (!romStem) continue;
        let any = false;
        for (const [tag, slot] of TAG_SLOT) {
          const v = e.fields[tag];
          if (!v) continue;
          const rel = resolve(v);
          if (!rel) continue;
          if (slot !== 'video' && !IMAGE_EXT.has(extOf(rel))) continue;
          put(romStem, slot, rel);
          any = true;
        }
        if (any) fromGamelist++;
      }
    } catch {
      // Битый gamelist.xml не мешает раскладке по папкам. / A broken gamelist.xml doesn't block the folder layout.
    }
  }

  let mediaFiles = 0;
  for (const rel of files.keys()) {
    if (rel === 'gamelist.xml' || rel.endsWith('/gamelist.xml')) continue;
    mediaFiles++;
    const slot = slotFromPath(rel);
    if (!slot) continue;
    const base = stemOf(rel.split('/').pop()!);
    put(stripMediaSuffix(base).stem, slot, rel);
  }

  const byNorm = new Map<string, LocalSlots>();
  for (const [stem, slots] of byStem) {
    const k = norm(stem);
    if (!k) continue;
    const cur = byNorm.get(k);
    byNorm.set(k, cur ? { ...slots, ...cur } : slots);
  }
  return { dirName: dir.name, byStem, byNorm, mediaFiles, fromGamelist };
}

// Найти медиа рома: сначала точное имя файла, потом нормализованное название.
// Find a ROM's media: the exact file name first, then the normalized title.
export function lookupLocalMedia(
  idx: LocalConsoleIndex,
  romStem: string,
  title: string,
  norm: (name: string) => string = defaultNorm
): LocalSlots | null {
  const exact = idx.byStem.get(romStem.toLowerCase());
  if (exact && Object.keys(exact).length) return exact;
  for (const k of [norm(romStem), norm(title)]) {
    // Чисто номерные имена («1942», «0012») по нормализованному ключу не сопоставляем.
    // Purely numeric names are not matched by the normalized key.
    if (!k || /^\d+$/.test(k)) continue;
    const hit = idx.byNorm.get(k);
    if (hit && Object.keys(hit).length) return hit;
  }
  return null;
}

// Папка консоли внутри выбранной папки. Имена-кандидаты: папка ромов, код консоли, система.
// Если подходящей подпапки нет, а в самой папке есть gamelist.xml — берём её саму.
// The console folder inside the chosen folder. Candidates: ROM folder name, console code, system.
// Without a matching subfolder, the folder itself is used if it has a gamelist.xml.
export async function findConsoleDir(root: DirLike, names: string[]): Promise<DirLike | null> {
  const wanted = names.map((n) => n.trim().toLowerCase()).filter(Boolean);
  if (wanted.includes(root.name.toLowerCase())) return root;
  const subs: DirLike[] = [];
  let rootHasGamelist = false;
  for await (const e of root.values()) {
    if (e.kind === 'directory') subs.push(e);
    else if (e.name.toLowerCase() === 'gamelist.xml') rootHasGamelist = true;
  }
  for (const w of wanted) {
    const hit = subs.find((d) => d.name.toLowerCase() === w);
    if (hit) return hit;
  }
  // ES-DE: downloaded_media/<система>/…; RetroBat/Batocera: roms/<система>/…
  for (const s of subs) {
    if (!/^(downloaded_media|roms|media)$/i.test(s.name)) continue;
    for await (const e of s.values()) {
      if (e.kind === 'directory' && wanted.includes(e.name.toLowerCase())) return e;
    }
  }
  return rootHasGamelist ? root : null;
}
