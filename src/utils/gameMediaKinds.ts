// Все виды медиа игры, которые выкачивает Skraper (и другие скрапперы), в одном словаре:
// папка или суффикс имени → вид. Из него берут «Упорядочить медиа» (куда перенести файл),
// галерея медиа в карточке игры и фильтр Библиотеки «Медиа».
//
// Skraper 1.4.x кладёт всё в <консоль>/media/<папка>/<ром>.<расш>. Папки у Valentin:
// boxes, fanart, images, manuals, maps, screenmarquee, screenshot, steamgrid, support,
// supporttexture, tipsandtricks, videos, wheels. Имена настраиваются, поэтому словарь шире.
//
// Раскладка проекта (после «Упорядочить медиа»), в духе Batocera:
//   images/<ром>-image   боксарт            images/<ром>-thumb       скриншот
//   images/<ром>-title   титульный экран    images/<ром>-mix         основное изображение (микс)
//   images/<ром>-box3d   3D-коробка         images/<ром>-boxback     задник коробки
//   images/<ром>-fanart  фон                images/<ром>-map         карта
//   images/<ром>-cartridge  носитель        images/<ром>-supporttexture  скан носителя
//   images/<ром>-steamgrid  Steam grid      images/<ром>-bezel       рамка
//   images/<ром>-tips    советы (картинка)  marquees/<ром>-marquee   логотип (wheel)
//   marquees/<ром>-screenmarquee  маркиза   videos/<ром>-video       видео
//   manuals/<ром>.pdf    мануал             manuals/<ром>-map.pdf, manuals/<ром>-tips.pdf|txt
//
// All game media kinds Skraper (and other scrapers) downloads, in one dictionary:
// folder or name suffix → kind. "Tidy media" (where a file goes), the game media gallery in the
// game card and the Library "Media" filter use it.
//
// Модуль без импортов, чтобы тесты шли через `node --test`.
// No imports, so tests run with `node --test`.

export type GameMediaKind =
  | 'boxart'
  | 'box3d'
  | 'boxback'
  | 'image'
  | 'snap'
  | 'title'
  | 'marquee'
  | 'screenmarquee'
  | 'steamgrid'
  | 'fanart'
  | 'support'
  | 'supporttexture'
  | 'map'
  | 'bezel'
  | 'video'
  | 'manual'
  | 'tips';

/** Порядок показа в галерее. / Gallery order. */
export const GAME_MEDIA_KINDS: readonly GameMediaKind[] = [
  'boxart',
  'box3d',
  'boxback',
  'image',
  'snap',
  'title',
  'video',
  'marquee',
  'screenmarquee',
  'steamgrid',
  'fanart',
  'support',
  'supporttexture',
  'map',
  'bezel',
  'manual',
  'tips',
];

/**
 * Виды, которые не годятся в обложку/скриншот/баннер карточки. Их картинки нельзя брать
 * обложкой, иначе у игры появится карта уровня или фон вместо боксарта.
 * Kinds that are not a card cover, screenshot or banner.
 */
export const NON_COVER_KINDS: ReadonlySet<GameMediaKind> = new Set<GameMediaKind>([
  'boxback',
  'screenmarquee',
  'steamgrid',
  'fanart',
  'support',
  'supporttexture',
  'map',
  'bezel',
  'manual',
  'tips',
]);

export const GAME_MEDIA_LABELS: Record<'en' | 'ru', Record<GameMediaKind, string>> = {
  en: {
    boxart: 'Box art',
    box3d: '3D box',
    boxback: 'Box back',
    image: 'Main image (mix)',
    snap: 'Screenshot',
    title: 'Title screen',
    marquee: 'Logo (wheel)',
    screenmarquee: 'Marquee',
    steamgrid: 'Steam grid',
    fanart: 'Fan art',
    support: 'Cartridge / disc',
    supporttexture: 'Cartridge / disc scan',
    map: 'Maps',
    bezel: 'Bezel',
    video: 'Video',
    manual: 'Manual',
    tips: 'Tips and tricks',
  },
  ru: {
    boxart: 'Обложка',
    box3d: '3D-коробка',
    boxback: 'Задник коробки',
    image: 'Основное изображение (микс)',
    snap: 'Скриншот',
    title: 'Титульный экран',
    marquee: 'Логотип (wheel)',
    screenmarquee: 'Маркиза',
    steamgrid: 'Steam grid',
    fanart: 'Фон (fanart)',
    support: 'Картридж / диск',
    supporttexture: 'Скан картриджа / диска',
    map: 'Карты',
    bezel: 'Рамка (bezel)',
    video: 'Видео',
    manual: 'Мануал',
    tips: 'Советы и секреты',
  },
};

export const IMAGE_EXTS: ReadonlySet<string> = new Set(['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.gif']);
export const VIDEO_EXTS: ReadonlySet<string> = new Set(['.mp4', '.webm', '.mkv', '.avi', '.mov', '.m4v']);
export const DOC_EXTS: ReadonlySet<string> = new Set(['.pdf']);
export const TEXT_EXTS: ReadonlySet<string> = new Set(['.txt']);

/** Папка → вид. Ключ в нижнем регистре. / Folder → kind, lowercase keys. */
export const GAME_MEDIA_DIR_KIND: Readonly<Record<string, GameMediaKind>> = {
  // Обложка / box art
  boxart: 'boxart',
  boxarts: 'boxart',
  named_boxarts: 'boxart',
  covers: 'boxart',
  cover: 'boxart',
  box2dfront: 'boxart',
  'box2d-front': 'boxart',
  box2d: 'boxart',
  'box-2d': 'boxart',
  box_2d: 'boxart',
  box: 'boxart',
  boxes: 'boxart',
  boxfront: 'boxart',
  thumbnails: 'boxart',
  // 3D-коробка / 3D box
  box3d: 'box3d',
  'box-3d': 'box3d',
  box_3d: 'box3d',
  boxes3d: 'box3d',
  '3dboxes': 'box3d',
  // Задник / box back
  boxback: 'boxback',
  boxbacks: 'boxback',
  'box-back': 'boxback',
  box2dback: 'boxback',
  // Основное изображение (микс Skraper) / main image (Skraper mix)
  images: 'image',
  image: 'image',
  mix: 'image',
  mixrbv1: 'image',
  mixrbv2: 'image',
  miximages: 'image',
  // Скриншот / screenshot
  snap: 'snap',
  snaps: 'snap',
  named_snaps: 'snap',
  screenshot: 'snap',
  screenshots: 'snap',
  snapshots: 'snap',
  ss: 'snap',
  // Титульный экран / title screen
  titles: 'title',
  titlescreen: 'title',
  titlescreens: 'title',
  titleshots: 'title',
  screenshottitle: 'title',
  'screenshot-title': 'title',
  named_titles: 'title',
  sstitle: 'title',
  // Логотип / logo (wheel)
  marquee: 'marquee',
  marquees: 'marquee',
  wheel: 'marquee',
  wheels: 'marquee',
  wheelhd: 'marquee',
  'wheel-hd': 'marquee',
  wheelcarbon: 'marquee',
  'wheel-carbon': 'marquee',
  wheelsteel: 'marquee',
  'wheel-steel': 'marquee',
  logos: 'marquee',
  named_logos: 'marquee',
  banners: 'marquee',
  // Маркиза ScreenScraper / ScreenScraper marquee
  screenmarquee: 'screenmarquee',
  screenmarquees: 'screenmarquee',
  screenmarqueesmall: 'screenmarquee',
  // Steam grid
  steamgrid: 'steamgrid',
  steamgrids: 'steamgrid',
  // Фон / fan art
  fanart: 'fanart',
  fanarts: 'fanart',
  backgrounds: 'fanart',
  // Носитель / cartridge, disc
  support: 'support',
  supports: 'support',
  cartridge: 'support',
  cartridges: 'support',
  carts: 'support',
  physicalmedia: 'support',
  supporttexture: 'supporttexture',
  supporttextures: 'supporttexture',
  'support-texture': 'supporttexture',
  // Карты / maps
  maps: 'map',
  map: 'map',
  // Рамки / bezels
  bezel: 'bezel',
  bezels: 'bezel',
  // Видео / video
  videos: 'video',
  video: 'video',
  snapvideos: 'video',
  'video-snaps': 'video',
  // Мануалы / manuals
  manuals: 'manual',
  manual: 'manual',
  docs: 'manual',
  // Советы / tips and tricks
  tipsandtricks: 'tips',
  'tips-and-tricks': 'tips',
  tips: 'tips',
};

/**
 * Папки раскладки проекта: в них вид решает суффикс имени (images/<ром>-fanart.png).
 * Project layout folders: there the name suffix decides the kind.
 */
export const LAYOUT_MEDIA_DIRS: ReadonlySet<string> = new Set(['images', 'marquees', 'videos', 'manuals']);

/** Суффикс имени → вид (раскладка проекта и ES/Batocera). / Name suffix → kind. */
const SUFFIX_KIND: Array<[RegExp, GameMediaKind]> = [
  [/[-_](supporttexture)$/i, 'supporttexture'],
  [/[-_](screenmarquee)$/i, 'screenmarquee'],
  [/[-_](steamgrid)$/i, 'steamgrid'],
  [/[-_](fanart)$/i, 'fanart'],
  [/[-_](cartridge|support)$/i, 'support'],
  [/[-_](boxback|box2dback)$/i, 'boxback'],
  [/[-_](box3d)$/i, 'box3d'],
  [/[-_](map|maps)$/i, 'map'],
  [/[-_](bezel)$/i, 'bezel'],
  [/[-_](tips|tipsandtricks)$/i, 'tips'],
  [/[-_ ](manual)$/i, 'manual'],
  [/[-_](video|snapvideo)$/i, 'video'],
  [/[-_](marquee|wheel|logo|wheelhd)$/i, 'marquee'],
  [/[-_](title|titleshot|titlescreen)$/i, 'title'],
  [/[-_](mix|mixrbv\d?)$/i, 'image'],
  [/[-_](thumb|snap|screenshot|ss)$/i, 'snap'],
  [/[-_](image|boxart|box|cover|box2d)$/i, 'boxart'],
];

export const extOfName = (name: string): string => {
  const i = name.lastIndexOf('.');
  return i < 0 ? '' : name.slice(i).toLowerCase();
};
const stemOfName = (name: string) => name.replace(/\.[^/.]+$/, '');

/** Расширение подходит виду. / The extension fits the kind. */
export function extFitsKind(kind: GameMediaKind, ext: string): boolean {
  switch (kind) {
    case 'video':
      return VIDEO_EXTS.has(ext);
    case 'manual':
      return DOC_EXTS.has(ext);
    case 'map':
      return IMAGE_EXTS.has(ext) || DOC_EXTS.has(ext);
    case 'tips':
      return IMAGE_EXTS.has(ext) || DOC_EXTS.has(ext) || TEXT_EXTS.has(ext);
    default:
      return IMAGE_EXTS.has(ext);
  }
}

/** Последняя папка пути в нижнем регистре. / The innermost folder, lowercase. */
export function lastDir(dirPath: string | undefined): string {
  return (
    String(dirPath || '')
      .split(/[\\/]/)
      .filter(Boolean)
      .pop() || ''
  ).toLowerCase();
}

export interface ClassifiedGameMedia {
  kind: GameMediaKind;
  /** Имя рома: без расширения и суффикса вида. / ROM stem: no extension, no kind suffix. */
  stem: string;
}

/**
 * Вид файла по папке и имени. В папках media/<вид>/ решает папка (имена там без суффиксов),
 * в раскладке проекта и в папке консоли — суффикс. null — не медиа или расширение не подходит.
 * File kind from its folder and name. In media/<kind>/ the folder decides, in the project layout
 * and the console folder the suffix does. null: not media or a wrong extension.
 */
export function classifyGameMediaFile(fileName: string, dirPath?: string): ClassifiedGameMedia | null {
  const ext = extOfName(fileName);
  if (!ext) return null;
  const base = stemOfName(fileName).trim();
  const parts = String(dirPath || '')
    .split(/[\\/]/)
    .filter(Boolean)
    .map((p) => p.toLowerCase());
  const dir = parts[parts.length - 1] || '';
  // media/images — папка Skraper (микс), а images/ рядом с ромами — раскладка проекта.
  // media/images is a Skraper folder (mix), images/ next to the ROMs is the project layout.
  const inContainer = parts.length >= 2 && GAME_MEDIA_CONTAINERS.includes(parts[parts.length - 2]);
  const layout = LAYOUT_MEDIA_DIRS.has(dir) && !inContainer;
  let bySuffix: GameMediaKind | null = null;
  let suffixStem = base;
  for (const [re, kind] of SUFFIX_KIND) {
    const m = base.match(re);
    if (m) {
      bySuffix = kind;
      suffixStem = base.slice(0, base.length - m[0].length).trim();
      break;
    }
  }
  const byDir = GAME_MEDIA_DIR_KIND[dir] || null;
  let kind: GameMediaKind | null;
  let stem = base;
  if (byDir && !layout && !(byDir === 'image' && bySuffix)) {
    // media/fanart/Игра.png. Суффикс снимаем, только если он о том же. / Strip a suffix only when it agrees.
    kind = byDir;
    if (bySuffix === byDir) stem = suffixStem;
  } else if (bySuffix) {
    kind = bySuffix;
    stem = suffixStem;
  } else if (layout && dir === 'videos' && VIDEO_EXTS.has(ext)) {
    kind = 'video';
  } else if (layout && dir === 'manuals' && DOC_EXTS.has(ext)) {
    kind = 'manual';
  } else if (layout && dir === 'images' && IMAGE_EXTS.has(ext)) {
    // images/Игра.png без суффикса: обложка по старой раскладке. / Plain images/Game.png: the cover.
    kind = 'boxart';
  } else if (layout && dir === 'marquees' && IMAGE_EXTS.has(ext)) {
    kind = 'marquee';
  } else {
    kind = null;
  }
  if (!kind || !extFitsKind(kind, ext) || !stem) return null;
  return { kind, stem };
}

/** Этот файл — не обложка (фон, карта, носитель…). / This file is not a cover (fan art, map…). */
export function isNonCoverMediaFile(fileName: string, dirPath?: string): boolean {
  const c = classifyGameMediaFile(fileName, dirPath);
  return Boolean(c && NON_COVER_KINDS.has(c.kind));
}

/**
 * Куда «Упорядочить медиа» кладёт файл вида kind для рома romStem (путь от папки консоли).
 * Where "Tidy media" puts a file of this kind for the ROM (path from the console folder).
 */
export function gameMediaTargetPath(kind: GameMediaKind, romStem: string, ext: string): string {
  const img = (suffix: string) => `images/${romStem}-${suffix}${ext}`;
  switch (kind) {
    case 'boxart':
      return img('image');
    case 'snap':
      return img('thumb');
    case 'title':
      return img('title');
    case 'image':
      return img('mix');
    case 'box3d':
      return img('box3d');
    case 'boxback':
      return img('boxback');
    case 'fanart':
      return img('fanart');
    case 'support':
      return img('cartridge');
    case 'supporttexture':
      return img('supporttexture');
    case 'steamgrid':
      return img('steamgrid');
    case 'bezel':
      return img('bezel');
    case 'marquee':
      return `marquees/${romStem}-marquee${ext}`;
    case 'screenmarquee':
      return `marquees/${romStem}-screenmarquee${ext}`;
    case 'video':
      return `videos/${romStem}-video${ext}`;
    case 'manual':
      return `manuals/${romStem}${ext}`;
    case 'map':
      return IMAGE_EXTS.has(ext) ? img('map') : `manuals/${romStem}-map${ext}`;
    case 'tips':
      return IMAGE_EXTS.has(ext) ? img('tips') : `manuals/${romStem}-tips${ext}`;
  }
}

/**
 * Ключ сравнения имён: без скобок, знаков и регистра. «Contra (USA)» и «contra» дают «contra».
 * Name comparison key: no brackets, punctuation or case.
 */
export function gameMediaNameKey(name: string): string {
  return String(name || '')
    .replace(/\[.*?\]|\(.*?\)/g, ' ')
    .replace(/[^a-z0-9а-яё]/gi, '')
    .toLowerCase();
}

/**
 * Файл относится к рому: имя совпадает с одним из stems точно (без регистра) или по ключу.
 * The file belongs to the ROM: its stem equals one of the ROM stems exactly or by key.
 */
export function mediaStemMatches(mediaStem: string, romStems: string[]): boolean {
  const low = mediaStem.trim().toLowerCase();
  if (!low) return false;
  if (romStems.some((s) => s.trim().toLowerCase() === low)) return true;
  const k = gameMediaNameKey(mediaStem);
  if (!k || /^\d+$/.test(k)) return false;
  return romStems.some((s) => gameMediaNameKey(s) === k);
}

/**
 * Папки, где искать медиа игры относительно папки консоли: раскладка проекта и media/<вид>.
 * Folders to look for a game's media in, relative to the console folder.
 */
export const GAME_MEDIA_CONTAINERS: readonly string[] = ['media', 'downloaded_media'];

/** Сводка видов медиа строки для фильтра. / The row's media kinds summary for the filter. */
export function sortGameMediaKinds(kinds: Iterable<string>): GameMediaKind[] {
  const set = new Set(kinds);
  return GAME_MEDIA_KINDS.filter((k) => set.has(k));
}

interface LookupDir {
  kind: string;
  name: string;
  values(): AsyncIterable<any>;
}

/**
 * Все медиа рома в папке консоли (через handle'ы): images/, marquees/, videos/, manuals/ и
 * media/<вид>/. Файлы — то, что вернул getFile().
 * Every media file of a ROM in the console folder (via handles).
 */
export async function listGameMediaInDir<F = File>(
  dir: LookupDir,
  romStems: string[]
): Promise<Array<{ kind: GameMediaKind; name: string; rel: string; file: F }>> {
  const out: Array<{ kind: GameMediaKind; name: string; rel: string; file: F }> = [];
  const folders: Array<{ handle: LookupDir; rel: string }> = [];
  try {
    for await (const e of dir.values()) {
      if (e.kind !== 'directory') continue;
      const low = String(e.name).toLowerCase();
      if (LAYOUT_MEDIA_DIRS.has(low)) folders.push({ handle: e, rel: e.name });
      else if (GAME_MEDIA_CONTAINERS.includes(low)) {
        try {
          for await (const sub of e.values()) {
            if (sub.kind === 'directory') folders.push({ handle: sub, rel: `${e.name}/${sub.name}` });
          }
        } catch {}
      }
    }
  } catch {
    return out;
  }
  for (const f of folders) {
    try {
      for await (const e of f.handle.values()) {
        if (e.kind !== 'file' || String(e.name).startsWith('.')) continue;
        const c = classifyGameMediaFile(e.name, f.rel);
        if (!c || !mediaStemMatches(c.stem, romStems)) continue;
        try {
          out.push({ kind: c.kind, name: e.name, rel: `${f.rel}/${e.name}`, file: await e.getFile() });
        } catch {}
      }
    } catch {}
  }
  out.sort((a, b) => GAME_MEDIA_KINDS.indexOf(a.kind) - GAME_MEDIA_KINDS.indexOf(b.kind) || a.rel.localeCompare(b.rel));
  return out;
}
