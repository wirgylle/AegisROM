// Виды медиа в Библиотеке: боксарт, скриншот, титульный экран, баннер (marquee, wheel, логотип)
// и «основное изображение», вид которого по имени файла не понять.
// Раньше Библиотека брала первую попавшуюся картинку с подходящим именем, поэтому у одной
// игры был боксарт, у другой скриншот, у третьей баннер. Теперь каждая картинка получает вид,
// а карточка показывает тот, что выбран в настройках вида.
//
// Media kinds in the Library: box art, screenshot, title screen, banner (marquee, wheel, logo)
// and the "main image" whose kind the file name does not tell.
// The Library used to take the first image with a matching name, so one game showed box art,
// another a screenshot, a third a banner. Now every image gets a kind and the card shows the
// kind picked in the view settings.
//
// Модуль без импортов, чтобы тесты шли через `node --test`.
// No imports, so tests run with `node --test`.

export type MediaKind = 'boxart' | 'snap' | 'title' | 'marquee' | 'image';

export const MEDIA_KINDS: readonly MediaKind[] = ['boxart', 'snap', 'title', 'marquee', 'image'];

export type MediaSet = Partial<Record<MediaKind, string>>;

// Высота кадра к ширине. / Frame height to width.
export const MEDIA_FRAME_RATIO: Record<MediaKind, number> = {
  boxart: 4 / 3,
  snap: 3 / 4,
  title: 3 / 4,
  marquee: 1 / 2.4,
  image: 3 / 4,
};

// Чем заменить выбранный вид, если его нет у игры. / What replaces the picked kind when a game lacks it.
const FALLBACK_ORDER: Record<MediaKind, MediaKind[]> = {
  boxart: ['boxart', 'image', 'title', 'snap', 'marquee'],
  snap: ['snap', 'image', 'title', 'boxart', 'marquee'],
  title: ['title', 'snap', 'image', 'boxart', 'marquee'],
  marquee: ['marquee', 'boxart', 'image', 'title', 'snap'],
  image: ['image', 'boxart', 'snap', 'title', 'marquee'],
};

const SUFFIX_KIND: Array<[RegExp, MediaKind]> = [
  [/[-_](thumb|thumbnail|boxart|box|box2d|box2dfront|boxfront|cover|front)$/, 'boxart'],
  [/[-_](snap|screenshot|screen|ss)$/, 'snap'],
  [/[-_](title|titlescreen|sstitle)$/, 'title'],
  [/[-_](marquee|wheel|logo|banner|wheelhd)$/, 'marquee'],
  [/[-_](image|mix|mixrbv\d?)$/, 'image'],
];

const DIR_KIND: Record<string, MediaKind> = {
  boxart: 'boxart',
  boxarts: 'boxart',
  named_boxarts: 'boxart',
  covers: 'boxart',
  cover: 'boxart',
  box2dfront: 'boxart',
  box2d: 'boxart',
  box: 'boxart',
  boxfront: 'boxart',
  'box-2d': 'boxart',
  box_2d: 'boxart',
  'box2d-front': 'boxart',
  thumbnails: 'boxart',
  snap: 'snap',
  snaps: 'snap',
  named_snaps: 'snap',
  screenshots: 'snap',
  screenshot: 'snap',
  ss: 'snap',
  snapshots: 'snap',
  titles: 'title',
  titlescreen: 'title',
  titleshots: 'title',
  // Skraper: «Screenshot title» и варианты колёс. / Skraper: "Screenshot title" and wheel variants.
  screenshottitle: 'title',
  'screenshot-title': 'title',
  titlescreens: 'title',
  named_titles: 'title',
  sstitle: 'title',
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
};

/** Имя файла без расширения и без суффикса вида. / File stem without extension and kind suffix. */
export function stripMediaSuffix(fileName: string): string {
  const base = String(fileName || '').replace(/\.[^/.]+$/, '').trim();
  const low = base.toLowerCase();
  for (const [re] of SUFFIX_KIND) {
    const m = low.match(re);
    if (m) return base.slice(0, base.length - m[0].length).trim();
  }
  return base;
}

/**
 * Вид картинки по имени файла и папке. Суффикс точнее папки: images/Игра-marquee.png — баннер.
 * «-image» и картинка без суффикса в images/ — «основное изображение»: в одних наборах это
 * боксарт, в других скриншот или коллаж.
 * Image kind from the file name and folder. A suffix beats the folder. "-image" and a plain
 * file in images/ are the "main image": box art in some packs, a screenshot or mix in others.
 */
export function classifyMediaName(fileName: string, dirName?: string): MediaKind {
  const low = String(fileName || '').replace(/\.[^/.]+$/, '').trim().toLowerCase();
  for (const [re, kind] of SUFFIX_KIND) {
    if (kind !== 'image' && re.test(low)) return kind;
  }
  const dir = String(dirName || '')
    .split(/[\\/]/)
    .filter(Boolean)
    .pop()
    ?.toLowerCase();
  if (dir && DIR_KIND[dir]) return DIR_KIND[dir];
  return 'image';
}

/**
 * Вид по ссылке: thumbnails.libretro.com/<система>/Named_Snaps/… — скриншот,
 * /api/native/fs/media?path=… — по пути файла. Неизвестно — null.
 * Kind from a URL: libretro folder names, or the file path of a native media URL. Unknown: null.
 */
export function classifyMediaUrl(url?: string): MediaKind | null {
  if (!url || url.startsWith('blob:') || url.startsWith('data:')) return null;
  let path = url;
  const q = url.indexOf('path=');
  if (q !== -1) {
    try {
      path = decodeURIComponent(url.slice(q + 5).split('&')[0]);
    } catch {
      path = url.slice(q + 5);
    }
  } else {
    try {
      path = decodeURIComponent(url.split('?')[0]);
    } catch {
      path = url.split('?')[0];
    }
  }
  const parts = path.split(/[\\/]/).filter(Boolean);
  const file = parts.pop() || '';
  const dir = parts.pop() || '';
  const byName = classifyMediaName(file, dir);
  if (byName !== 'image') return byName;
  return DIR_KIND[dir.toLowerCase()] ? DIR_KIND[dir.toLowerCase()] : null;
}

export interface MediaRowLike {
  media?: MediaSet;
  boxArtUrl?: string;
  manualMedia?: Partial<Record<'image' | 'thumbnail' | 'marquee' | 'video', string>>;
}

/**
 * Все известные картинки строки по видам. Старые строки без `media` дают только boxArtUrl:
 * вид берётся из ссылки, иначе это «основное изображение».
 * All known images of a row by kind. Old rows without `media` only have boxArtUrl: its kind
 * comes from the URL, else it is the "main image".
 */
export function mediaSetOf(row: MediaRowLike): MediaSet {
  const out: MediaSet = {};
  if (row.media) {
    for (const k of MEDIA_KINDS) {
      const v = row.media[k];
      if (v) out[k] = v;
    }
  }
  if (row.boxArtUrl && !Object.values(out).includes(row.boxArtUrl)) {
    const kind = classifyMediaUrl(row.boxArtUrl) || 'image';
    if (!out[kind]) out[kind] = row.boxArtUrl;
  }
  return out;
}

export interface PickedMedia {
  url: string;
  kind: MediaKind;
}

/**
 * Кандидаты для показа по порядку: выбранный вид, затем замены (если разрешены).
 * Карточка берёт следующий, если картинка не загрузилась.
 * Candidates in order: the picked kind, then replacements (when allowed).
 * The card moves to the next one when an image fails to load.
 */
export function mediaCandidates(set: MediaSet, kind: MediaKind, allowFallback: boolean): PickedMedia[] {
  const order = allowFallback ? FALLBACK_ORDER[kind] : [kind];
  const out: PickedMedia[] = [];
  const seen = new Set<string>();
  for (const k of order) {
    const url = set[k];
    if (url && !seen.has(url)) {
      seen.add(url);
      out.push({ url, kind: k });
    }
  }
  return out;
}

/** Картинка для старого поля boxArtUrl: боксарт в первую очередь. / Image for the legacy boxArtUrl: box art first. */
export function preferredCoverUrl(set: MediaSet): string | undefined {
  return mediaCandidates(set, 'boxart', true)[0]?.url;
}

/** Убирает blob:-ссылки перед сохранением базы. / Drops blob: URLs before the database is saved. */
export function stripBlobMedia(set?: MediaSet): MediaSet | undefined {
  if (!set) return undefined;
  const out: MediaSet = {};
  let any = false;
  for (const k of MEDIA_KINDS) {
    const v = set[k];
    if (v && !v.startsWith('blob:')) {
      out[k] = v;
      any = true;
    }
  }
  return any ? out : undefined;
}

// ---------------------------------------------------------------------------
// Индекс локальных картинок по ключу имени и виду. / Local image index by name key and kind.
//
// «-thumb» по соглашению EmulationStation — боксарт, а «-image» — основное изображение.
// Скраппер AegisROM раньше писал наоборот (боксарт в -image, скриншот в -thumb), поэтому
// если у игры есть обе картинки, вид решает размер (pickBoxartOfPair).
// By EmulationStation convention "-thumb" is box art and "-image" the main image. The AegisROM
// scraper wrote it the other way round, so when a game has both, their sizes decide.

type Slot<F> = Partial<Record<MediaKind, F>> & { thumb?: F };

export class MediaKindIndex<F> {
  private map = new Map<string, Slot<F>>();

  /** Регистрирует файл под ключами имени. / Registers a file under its name keys. */
  addFile(keys: Iterable<string>, fileName: string, dirName: string | undefined, file: F): void {
    const low = String(fileName || '').replace(/\.[^/.]+$/, '').toLowerCase();
    const isThumb = /[-_](thumb|thumbnail)$/.test(low);
    const kind = classifyMediaName(fileName, dirName);
    for (const k of keys) {
      if (!k) continue;
      let slot = this.map.get(k);
      if (!slot) {
        slot = {};
        this.map.set(k, slot);
      }
      if (isThumb) {
        if (!slot.thumb) slot.thumb = file;
      } else if (!slot[kind]) {
        slot[kind] = file;
      }
    }
  }

  private gather(keys: Iterable<string>): Slot<F> {
    const out: Slot<F> = {};
    for (const k of keys) {
      if (!k) continue;
      const slot = this.map.get(k);
      if (!slot) continue;
      for (const kind of MEDIA_KINDS) {
        if (!out[kind] && slot[kind]) out[kind] = slot[kind];
      }
      if (!out.thumb && slot.thumb) out.thumb = slot.thumb;
    }
    return out;
  }

  /**
   * Файлы по видам. readSize читает размер картинки (нужен, только если есть и -image, и -thumb).
   * Files by kind. readSize reads an image size (only needed when both -image and -thumb exist).
   */
  async lookup(
    keys: Iterable<string>,
    readSize?: (file: F) => Promise<{ w: number; h: number } | null>
  ): Promise<Partial<Record<MediaKind, F>>> {
    const g = this.gather(keys);
    const out: Partial<Record<MediaKind, F>> = {};
    for (const kind of MEDIA_KINDS) if (g[kind]) out[kind] = g[kind];
    if (!g.thumb) return out;
    if (out.image && !out.boxart && readSize) {
      let pick = -1;
      try {
        pick = pickBoxartOfPair(await readSize(out.image), await readSize(g.thumb));
      } catch {
        pick = -1;
      }
      if (pick === 0) {
        out.boxart = out.image;
        if (!out.snap) out.snap = g.thumb;
        delete out.image;
        return out;
      }
      if (pick === 1) {
        out.boxart = g.thumb;
        if (!out.snap) out.snap = out.image;
        delete out.image;
        return out;
      }
    }
    if (!out.boxart) out.boxart = g.thumb;
    else if (!out.image) out.image = g.thumb;
    return out;
  }

  get size(): number {
    return this.map.size;
  }
}

/** Читает размер картинки из начала File/Blob. / Reads an image size from the head of a File/Blob. */
export async function readImageSize(file: Blob): Promise<{ w: number; h: number } | null> {
  try {
    const head = new Uint8Array(await file.slice(0, 65536).arrayBuffer());
    return imageSizeFromBytes(head);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Размер картинки по заголовку файла (PNG, JPEG, WebP, BMP), без декодирования.
// Image size from the file header (PNG, JPEG, WebP, BMP), without decoding.

export function imageSizeFromBytes(b: Uint8Array): { w: number; h: number } | null {
  if (b.length < 26) return null;
  const u16be = (i: number) => (b[i] << 8) | b[i + 1];
  const u16le = (i: number) => b[i] | (b[i + 1] << 8);
  const u32be = (i: number) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
  const u32le = (i: number) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;
  // PNG: IHDR сразу после сигнатуры. / PNG: IHDR right after the signature.
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    return { w: u32be(16), h: u32be(20) };
  }
  // BMP
  if (b[0] === 0x42 && b[1] === 0x4d) {
    return { w: Math.abs(u32le(18) | 0), h: Math.abs(u32le(22) | 0) };
  }
  // WebP
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45) {
    const tag = String.fromCharCode(b[12], b[13], b[14], b[15]);
    if (tag === 'VP8X' && b.length >= 30) return { w: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)), h: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)) };
    if (tag === 'VP8 ' && b.length >= 30) return { w: u16le(26) & 0x3fff, h: u16le(28) & 0x3fff };
    if (tag === 'VP8L' && b.length >= 25) {
      const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
      return { w: (bits & 0x3fff) + 1, h: ((bits >> 14) & 0x3fff) + 1 };
    }
    return null;
  }
  // JPEG: ищем маркер SOF. / JPEG: look for an SOF marker.
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = b[i + 1];
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0xff) {
        i += marker === 0xff ? 1 : 2;
        continue;
      }
      const len = u16be(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { w: u16be(i + 7), h: u16be(i + 5) };
      }
      i += 2 + len;
    }
  }
  return null;
}

/**
 * Две «основные» картинки одной игры (например Игра-image.png и Игра-thumb.png из разных наборов):
 * какая из них боксарт. Боксарт обычно крупнее скриншота (снимок экрана в родном разрешении,
 * 256–640 точек), а при близком размере он более вытянут вверх. Возвращает индекс боксарта
 * (0 или 1) или -1, если размеры не прочитались.
 * Two "main" images of one game: which one is box art. Box art is usually larger than a
 * native-resolution screenshot; at a similar size it is the taller one. Returns the box art
 * index (0 or 1), or -1 when the sizes are unknown.
 */
export function pickBoxartOfPair(a: { w: number; h: number } | null, b: { w: number; h: number } | null): number {
  if (!a || !b || !a.w || !a.h || !b.w || !b.h) return -1;
  const areaA = a.w * a.h;
  const areaB = b.w * b.h;
  const big = Math.max(areaA, areaB);
  const small = Math.min(areaA, areaB);
  if (big > small * 1.35) return areaA > areaB ? 0 : 1;
  const ra = a.h / a.w;
  const rb = b.h / b.w;
  if (Math.abs(ra - rb) < 0.05) return -1;
  return ra > rb ? 0 : 1;
}
