// Настройки запуска скраппера: какие типы медиа качать и что делать с ромами, для которых
// медиа раньше не нашлось. Плюс учёт таких ромов (/api/scrape/misses), чтобы не шерстить их заново.
//
// Scraper run options: which media types to download and what to do with ROMs that had no media
// last time. Plus the record of such ROMs (/api/scrape/misses) so they are not searched again.

import type { MediaSlot } from './scrapePlan';

export const MEDIA_SLOTS: MediaSlot[] = ['image', 'thumb', 'marquee', 'video'];

export interface ScrapeOptions {
  // Типы медиа: image = боксарт/обложка, thumb = скриншот, marquee = логотип/баннер, video = видео.
  slots: MediaSlot[];
  // false — ромы, для которых медиа не нашлось в прошлый раз, пропускаются.
  // false: ROMs that had no media last time are skipped.
  retryMisses: boolean;
}

export function defaultScrapeOptions(wantVideo = true): ScrapeOptions {
  return { slots: wantVideo ? [...MEDIA_SLOTS] : ['image', 'thumb', 'marquee'], retryMisses: false };
}

const STORE_KEY = 'aegis.scrape.options.v1';

export function normalizeScrapeOptions(raw: unknown, fallback: ScrapeOptions): ScrapeOptions {
  if (!raw || typeof raw !== 'object') return fallback;
  const r = raw as Partial<ScrapeOptions>;
  const slots = Array.isArray(r.slots) ? MEDIA_SLOTS.filter((s) => r.slots!.includes(s)) : fallback.slots;
  return { slots: slots.length ? slots : fallback.slots, retryMisses: Boolean(r.retryMisses) };
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
// их стоит повторить. ScreenScraper подключили после промаха — тоже повторяем.
// Skip a ROM as a known miss? Network failures are not "no media" and are retried; so are misses
// recorded before ScreenScraper was connected.
export function skipKnownMiss(miss: ScrapeMiss | undefined, retryMisses: boolean, ssConfigured: boolean): boolean {
  if (!miss || retryMisses) return false;
  if (miss.code === 'network' || miss.code === 'ss-limit' || miss.code === 'ss-auth') return false;
  if (ssConfigured && !(miss.source || '').includes('screenscraper')) return false;
  return true;
}
