// Источники медиа для скраппера и порядок, в котором их пробовать.
// - local: готовые медиа из папки внешней программы (Skraper, ES-DE, Batocera и т. п.):
//   gamelist.xml и картинки/видео рядом. Без сети и без лимитов.
// - libretro: libretro-thumbnails (без учётной записи; боксарт, скриншот, титульный экран).
// - screenscraper: ScreenScraper по логину и паролю; лимиты запросов сервер сообщает сам.
// Если источник недоступен (нет папки, нет логина, кончился лимит), он пропускается, а при
// включённом «пробовать следующий» промахи одного источника ищутся в следующем.
//
// Media sources for the scraper and the order to try them in.
// - local: ready-made media from another program's folder (Skraper, ES-DE, Batocera…).
// - libretro: libretro-thumbnails, no account.
// - screenscraper: ScreenScraper with login and password; the server reports its own quotas.
// An unavailable source is skipped; with fallback on, one source's misses go to the next.

export type ScrapeSourceId = 'local' | 'libretro' | 'screenscraper';

export const SCRAPE_SOURCES: ScrapeSourceId[] = ['local', 'libretro', 'screenscraper'];

export interface ScrapeSourceChoice {
  // Порядок источников (все три, включённые и нет). / Source order (all three).
  order: ScrapeSourceId[];
  // Включённые источники. / Enabled sources.
  enabled: ScrapeSourceId[];
  // true — промахи источника ищем в следующем; false — только первый доступный.
  // true: a source's misses go to the next one; false: only the first available source.
  fallback: boolean;
}

export function defaultSourceChoice(): ScrapeSourceChoice {
  return { order: ['libretro', 'screenscraper', 'local'], enabled: ['libretro', 'screenscraper'], fallback: true };
}

export function normalizeSourceChoice(raw: unknown): ScrapeSourceChoice {
  const def = defaultSourceChoice();
  if (!raw || typeof raw !== 'object') return def;
  const r = raw as Partial<ScrapeSourceChoice>;
  const seen = new Set<ScrapeSourceId>();
  const order: ScrapeSourceId[] = [];
  for (const s of Array.isArray(r.order) ? r.order : []) {
    if (SCRAPE_SOURCES.includes(s) && !seen.has(s)) {
      seen.add(s);
      order.push(s);
    }
  }
  for (const s of def.order) if (!seen.has(s)) order.push(s);
  const enabled = Array.isArray(r.enabled) ? order.filter((s) => r.enabled!.includes(s)) : def.enabled;
  return { order, enabled, fallback: r.fallback === undefined ? def.fallback : Boolean(r.fallback) };
}

// Передвинуть источник на шаг вверх (-1) или вниз (+1). / Move a source one step up or down.
export function moveSource(c: ScrapeSourceChoice, id: ScrapeSourceId, dir: -1 | 1): ScrapeSourceChoice {
  const i = c.order.indexOf(id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= c.order.length) return c;
  const order = [...c.order];
  [order[i], order[j]] = [order[j], order[i]];
  return { ...c, order };
}

export function toggleSource(c: ScrapeSourceChoice, id: ScrapeSourceId, on: boolean): ScrapeSourceChoice {
  const set = new Set(c.enabled);
  if (on) set.add(id);
  else set.delete(id);
  return { ...c, enabled: c.order.filter((s) => set.has(s)) };
}

// Состояние источника на момент запуска. / Source state at run time.
export type SourceState =
  | 'ready'
  | 'no-folder' // local: папка не выбрана / folder not chosen
  | 'no-login' // screenscraper: нет логина / not connected
  | 'quota' // screenscraper: дневной лимит исчерпан / daily quota used up
  | 'offline'; // сервер приложения недоступен / app server unreachable

export interface SourceStatus {
  local: SourceState;
  libretro: SourceState;
  screenscraper: SourceState;
}

export interface SourcePlan {
  // Источники в порядке запуска. / Sources in run order.
  run: ScrapeSourceId[];
  // Включённые, но недоступные сейчас, с причиной. / Enabled but unavailable, with the reason.
  skipped: Array<{ id: ScrapeSourceId; state: SourceState }>;
}

export function planSources(c: ScrapeSourceChoice, status: SourceStatus): SourcePlan {
  const run: ScrapeSourceId[] = [];
  const skipped: SourcePlan['skipped'] = [];
  for (const id of c.order) {
    if (!c.enabled.includes(id)) continue;
    if (status[id] !== 'ready') {
      skipped.push({ id, state: status[id] });
      continue;
    }
    if (!c.fallback && run.length > 0) continue;
    run.push(id);
  }
  return { run, skipped };
}

// Лимит ScreenScraper из ответа ssuserInfos: сколько запросов осталось сегодня (null — неизвестно).
// ScreenScraper quota from ssuserInfos: requests left today (null: unknown).
export interface SsQuota {
  requestsToday: number;
  maxRequestsPerDay: number;
  maxThreads?: number;
  maxPerMin?: number;
}

export function ssRequestsLeft(q: SsQuota | null | undefined): number | null {
  if (!q || !(q.maxRequestsPerDay > 0)) return null;
  return Math.max(0, q.maxRequestsPerDay - Math.max(0, q.requestsToday || 0));
}
