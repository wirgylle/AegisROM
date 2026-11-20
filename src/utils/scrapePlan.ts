// Решения скрапера: что качать и какие ссылки на медиа оставить у рома.
// Правило: рабочее медиа не трогаем, пока замена не скачана и не проверена.
//
// Scraper decisions: what to download and which media URLs a ROM keeps.
// Rule: working media is never touched until a replacement is downloaded and verified.

export type MediaSlot = 'image' | 'thumb' | 'marquee' | 'video';

export interface SlotAuditLike {
  status: 'valid' | 'placeholder' | 'missing';
}

export interface AuditLike {
  image: SlotAuditLike;
  marquee: SlotAuditLike;
  video: SlotAuditLike;
}

// Какие слоты качать. Слот с рабочим файлом пропускаем: раньше при отсутствии одного видео
// перекачивалась и рабочая обложка, иногда чужая (нечёткое совпадение названия).
// Which slots to download. A slot with a working file is skipped: a missing video used to
// re-download a working cover too, sometimes a wrong one (fuzzy title match).
export function slotsToDownload(audit: AuditLike | null, wantVideo: boolean): Set<MediaSlot> {
  const out = new Set<MediaSlot>();
  if (!audit) {
    out.add('image');
    out.add('thumb');
    out.add('marquee');
    if (wantVideo) out.add('video');
    return out;
  }
  if (audit.image.status !== 'valid') {
    out.add('image');
    out.add('thumb');
  }
  if (audit.marquee.status !== 'valid') out.add('marquee');
  if (wantVideo && audit.video.status !== 'valid') out.add('video');
  return out;
}

export interface ScrapeServerResult {
  matched?: boolean;
  matchedCanonicalTitle?: string;
  boxArtUrl?: string;
  snapUrl?: string;
  marqueeUrl?: string;
  videoUrl?: string;
  reason?: string;
}

export interface RomMediaUrls {
  scrapedBoxArtUrl?: string;
  scrapedSnapUrl?: string;
  scrapedMarqueeUrl?: string;
  scrapedVideoUrl?: string;
}

export function isScrapeMatched(m: ScrapeServerResult | undefined): boolean {
  return Boolean(m && m.matched !== false && m.matchedCanonicalTitle);
}

// Новые ссылки рома после скрапа.
// - Есть папка на диске: ссылку меняем только для слота, файл которого реально сохранён.
// - Только сессия без диска: берём ссылку сервера, если название найдено и ссылка не пустая.
// Иначе остаётся старая ссылка.
//
// New ROM URLs after a scrape.
// - With a folder on disk: a URL changes only for a slot whose file was actually saved.
// - Session only: take the server URL when the title matched and the URL is not empty.
// Otherwise the old URL stays.
export function mergeScrapedUrls(
  prev: RomMediaUrls,
  m: ScrapeServerResult,
  saved: Partial<Record<MediaSlot, boolean>> | null
): RomMediaUrls {
  const matched = isScrapeMatched(m);
  const pick = (slot: MediaSlot, next: string | undefined, old: string | undefined) => {
    if (!next) return old;
    if (saved) return saved[slot] ? next : old;
    return matched ? next : old;
  };
  return {
    scrapedBoxArtUrl: pick('image', m.boxArtUrl, prev.scrapedBoxArtUrl),
    scrapedSnapUrl: pick('thumb', m.snapUrl, prev.scrapedSnapUrl),
    scrapedMarqueeUrl: pick('marquee', m.marqueeUrl, prev.scrapedMarqueeUrl),
    scrapedVideoUrl: pick('video', m.videoUrl, prev.scrapedVideoUrl),
  };
}

// Название пригодно для поиска по имени: хотя бы 2 латинские/кириллические буквы и не
// «кракозябры» (символ замены U+FFFD или типичный mojibake UTF-8 → CP1251/CP1252).
// A title is usable for name search: at least 2 Latin/Cyrillic letters and no mojibake.
export function isReadableTitle(title: string): boolean {
  const t = (title || '').trim();
  if (!t) return false;
  if (/�/.test(t)) return false;
  // UTF-8, прочитанный как CP1252 ("Ð§ÐµÑ€"), как CP1251 ("РўРµС‚") или как Latin-1 ("Ã©").
  // UTF-8 read as CP1252 ("Ð§ÐµÑ€"), CP1251 ("РўРµС‚") or Latin-1 ("Ã©").
  const count = (re: RegExp) => (t.match(re) || []).length;
  if (count(/[ÐÑ][\u0080-\u00BF\u0152\u0153\u0160\u0161\u0178\u017D\u017E\u0192\u02C6\u02DC\u2013-\u2026\u2030\u2039\u203A\u20AC\u2122]/g) >= 2) return false;
  if (count(/[РС][\u0402-\u040F\u0452-\u045F\u0490\u0491\u00A0-\u00BF\u2013-\u2122]/g) >= 3) return false;
  if (count(/Ã[\u0080-\u00BF]/g) >= 2) return false;
  const letters = (t.match(/[a-zA-Zа-яА-ЯёЁ]/g) || []).length;
  return letters >= 2 && !/^[\d\s_\-.#()\[\]]+$/.test(t);
}

// С чего начать скраппер из «Инструментов».
// - В сеансе есть отсканированные ромы: качаем для них.
// - Ромов нет (библиотека открыта из базы после перезапуска), но папка библиотеки известна:
//   сначала сканируем её, иначе писать медиа некуда.
// - Папки нет: честно просим её выбрать. Раньше здесь шла имитация прогресса, которая
//   ничего не скачивала.
//
// How to start the scraper from Tools.
// - Scanned ROMs in this session: scrape them.
// - No ROMs (library opened from the database after a restart) but the library folder is known:
//   scan it first, otherwise there is nowhere to write media.
// - No folder: ask for one. This used to run a fake progress bar that downloaded nothing.
export type ScrapeStart = 'scrape' | 'scanThenScrape' | 'needFolder';

export function planScrapeStart(hasScannedRoms: boolean, hasLibraryFolder: boolean): ScrapeStart {
  if (hasScannedRoms) return 'scrape';
  return hasLibraryFolder ? 'scanThenScrape' : 'needFolder';
}
