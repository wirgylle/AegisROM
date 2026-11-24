// Настройки запуска скраппера: какие типы медиа качать и что делать с ромами, для которых
// медиа раньше не нашлось. Плюс учёт таких ромов (/api/scrape/misses), чтобы не шерстить их заново.
//
// Scraper run options: which media types to download and what to do with ROMs that had no media
// last time. Plus the record of such ROMs (/api/scrape/misses) so they are not searched again.

import type { MediaSlot } from './scrapePlan';
import { defaultSourceChoice, normalizeSourceChoice, type ScrapeSourceChoice } from './scrapeSources.ts';

export const MEDIA_SLOTS: MediaSlot[] = ['image', 'thumb', 'marquee', 'video'];

export interface ScrapeOptions {
  // Типы медиа: image = боксарт/обложка, thumb = скриншот, marquee = логотип/баннер, video = видео.
  slots: MediaSlot[];
  // false — ромы, для которых медиа не нашлось в прошлый раз, пропускаются.
  // false: ROMs that had no media last time are skipped.
  retryMisses: boolean;
  // Источники, их порядок и автопереход к следующему. / Sources, their order and fallback.
  sources: ScrapeSourceChoice;
}

export function defaultScrapeOptions(wantVideo = true): ScrapeOptions {
  return {
    slots: wantVideo ? [...MEDIA_SLOTS] : ['image', 'thumb', 'marquee'],
    retryMisses: false,
    sources: defaultSourceChoice(),
  };
}

const STORE_KEY = 'aegis.scrape.options.v1';

export function normalizeScrapeOptions(raw: unknown, fallback: ScrapeOptions): ScrapeOptions {
  if (!raw || typeof raw !== 'object') return fallback;
  const r = raw as Partial<ScrapeOptions>;
  const slots = Array.isArray(r.slots) ? MEDIA_SLOTS.filter((s) => r.slots!.includes(s)) : fallback.slots;
  return {
    slots: slots.length ? slots : fallback.slots,
    retryMisses: Boolean(r.retryMisses),
    sources: r.sources === undefined ? fallback.sources : normalizeSourceChoice(r.sources),
  };
}

export function loadScrapeOptions(fallback: ScrapeOptions): ScrapeOptions {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? normalizeScrapeOptions(JSON.parse(raw), fallback) : fallback;
  } catch {
    return fallback;
  }
}

export function saveScrapeOptions(o: ScrapeOptions): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(o));
  } catch {}
}

// Нужен ли ром скрапперу по выбранным типам: хотя бы один выбранный слот не рабочий.
// Слоты image и thumb аудит видит как один (обложка), marquee и video — отдельно.
// Does the ROM need scraping for the chosen types: at least one chosen slot is not working.
export function needsScrape(
  audit: { image: { status: string }; marquee: { status: string }; video: { status: string } },
  slots: MediaSlot[]
): boolean {
  const ok = (s: { status: string }) => s.status === 'valid';
  return slots.some((slot) => {
    if (slot === 'image' || slot === 'thumb') return !ok(audit.image);
    if (slot === 'marquee') return !ok(audit.marquee);
    return !ok(audit.video);
  });
}

export interface ScrapeMiss {
  code: string;
  at: number;
  title?: string;
  source?: string;
}

export async function fetchScrapeMisses(): Promise<Record<string, ScrapeMiss>> {
  try {
    const out = await (await fetch('/api/scrape/misses')).json();
    return (out && out.misses) || {};
  } catch {
    return {};
  }
}

export async function saveScrapeMisses(set: Record<string, ScrapeMiss>, clear: string[]): Promise<void> {
  if (!Object.keys(set).length && !clear.length) return;
  try {
    await fetch('/api/scrape/misses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ set, clear }),
    });
  } catch {}
}

// Пропустить ром как известный промах? Сетевые сбои не запоминаем как «нет медиа»:
// их стоит повторить. Если сейчас включён источник, которого не было при промахе
// (подключили ScreenScraper, выбрали папку Skraper), — тоже повторяем.
// Skip a ROM as a known miss? Network failures are not "no media" and are retried; so are misses
// recorded before a source that is active now (ScreenScraper connected, a Skraper folder chosen).
// active: true/false — старый вызов «ScreenScraper подключён»; массив — источники этого запуска.
// active: true/false is the old "ScreenScraper connected" call; an array is this run's sources.
export function skipKnownMiss(miss: ScrapeMiss | undefined, retryMisses: boolean, active: boolean | string[]): boolean {
  if (!miss || retryMisses) return false;
  if (miss.code === 'network' || miss.code === 'ss-limit' || miss.code === 'ss-auth') return false;
  const tried = new Set((miss.source || '').split('+').filter(Boolean));
  const now = Array.isArray(active) ? active : active ? ['screenscraper'] : [];
  if (now.some((s) => !tried.has(s))) return false;
  return true;
}

// «Медиа есть» для окна области по выбранным типам: у записи базы известны только обложка и видео,
// поэтому скриншот и логотип проверяются по обложке.
// "Has media" for the scope window by the chosen types: a database record only knows the cover and
// video, so screenshot and logo are checked by the cover.
export function rowHasScrapeMedia(row: { boxArtUrl?: string; videoUrl?: string }, slots: MediaSlot[]): boolean {
  const ok = (u?: string) => Boolean(u && u.trim() && !u.startsWith('blob:'));
  return slots.every((s) => (s === 'video' ? ok(row.videoUrl) : ok(row.boxArtUrl)));
}
