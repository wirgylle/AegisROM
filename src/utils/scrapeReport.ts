// Отчёт скраппера по причинам промахов и следующий шаг, который стоит сделать.
// Scraper report grouped by miss reason, and the next step worth taking.

// Коды совпадают с aegiscore.Miss* и кодами ScreenScraper в aegisapi/screenscraper.go.
// Codes match aegiscore.Miss* and the ScreenScraper codes in aegisapi/screenscraper.go.
export type MissReason = 'no-title' | 'not-in-db' | 'network' | 'no-system' | 'ss-auth' | 'ss-limit';

export const MISS_REASONS: MissReason[] = ['no-title', 'not-in-db', 'network', 'no-system', 'ss-auth', 'ss-limit'];

export interface ScrapeMissLike {
  matched?: boolean;
  matchedCanonicalTitle?: string;
  reasonCode?: string;
  reason?: string;
}

// Старый сервер не присылает reasonCode: восстанавливаем по тексту причины.
// An older server sends no reasonCode: derive it from the reason text.
export function missReasonOf(m: ScrapeMissLike | undefined): MissReason {
  const code = (m?.reasonCode || '') as MissReason;
  if (MISS_REASONS.includes(code)) return code;
  const r = (m?.reason || '').toLowerCase();
  if (r.includes('номер') || r.includes('нет слов') || r.includes('нет исходного')) return 'no-title';
  if (r.includes('недоступен')) return 'network';
  if (r.includes('нет индекса') || r.includes('пуст')) return 'no-system';
  return 'not-in-db';
}

export interface ScrapeReport {
  // Сколько ромов искали онлайн (без тех, у кого медиа уже было).
  looked: number;
  libretro: number;
  screenscraper: number;
  // Найдено в папке готовых медиа (Skraper и т. п.). / Found in the ready-made media folder.
  local: number;
  // Не найдено нигде, по причине последнего источника, который пробовали.
  missed: Record<MissReason, number>;
  // ScreenScraper был настроен на момент запуска.
  ssConfigured: boolean;
  // ScreenScraper остановлен (логин или лимит) — не все промахи Libretro проверены там.
  ssStopped: '' | 'ss-auth' | 'ss-limit';
}

export function emptyScrapeReport(ssConfigured: boolean): ScrapeReport {
  return {
    looked: 0,
    libretro: 0,
    screenscraper: 0,
    local: 0,
    missed: { 'no-title': 0, 'not-in-db': 0, network: 0, 'no-system': 0, 'ss-auth': 0, 'ss-limit': 0 },
    ssConfigured,
    ssStopped: '',
  };
}

export function totalMissed(r: ScrapeReport): number {
  return MISS_REASONS.reduce((s, k) => s + r.missed[k], 0);
}

export type ScrapeNextStep = 'rename' | 'setup-screenscraper' | 'retry' | 'check-screenscraper';

// Что предложить после скраппера, в порядке пользы:
// 1) номерные/мусорные имена — онлайн-переименование по DAT (хеш) даст название;
// 2) ScreenScraper не настроен, а промахи «нет в базе» есть — подключить его (ищет по CRC);
// 3) логин или лимит ScreenScraper — проверить настройки / подождать сутки;
// 4) сеть — запустить ещё раз.
// What to offer after a run, most useful first.
export function nextScrapeSteps(r: ScrapeReport): ScrapeNextStep[] {
  const out: ScrapeNextStep[] = [];
  if (r.missed['no-title'] > 0) out.push('rename');
  if (!r.ssConfigured && (r.missed['not-in-db'] > 0 || r.missed['no-title'] > 0)) out.push('setup-screenscraper');
  if (r.ssStopped || r.missed['ss-auth'] > 0 || r.missed['ss-limit'] > 0) out.push('check-screenscraper');
  if (r.missed.network > 0) out.push('retry');
  return out;
}

export interface SsRomLike {
  id: string;
  fileName: string;
  fileSize: number;
  crc32?: string;
  extension?: string;
  region?: string;
  isMultiDisc?: boolean;
  discs?: SsRomLike[];
}

// CRC в сканере считается по первым 16 МБ; для архивов это CRC архива, а не рома.
// Поэтому CRC шлём только для несжатых файлов до 16 МБ, иначе ScreenScraper ищет по имени и размеру.
// The scanner hashes the first 16 MB only, and for archives it's the archive's CRC.
// So CRC is sent only for uncompressed files up to 16 MB; otherwise ScreenScraper uses name and size.
const ARCHIVE_EXT = new Set(['.zip', '.7z', '.rar', '.chd', '.cso', '.rvz', '.pbp']);
const CRC_LIMIT = 16 * 1024 * 1024;

export function screenScraperItem(rom: SsRomLike, libretroSystem: string) {
  const src = rom.isMultiDisc && rom.discs && rom.discs.length > 0 ? rom.discs[0] : rom;
  const ext = (src.extension || src.fileName.slice(src.fileName.lastIndexOf('.'))).toLowerCase();
  const crcOk = Boolean(src.crc32) && /^[0-9a-f]{8}$/i.test(src.crc32 || '') && !ARCHIVE_EXT.has(ext) && src.fileSize > 0 && src.fileSize <= CRC_LIMIT;
  return {
    id: rom.id,
    libretroSystem,
    romName: src.fileName,
    romSize: src.fileSize,
    crc: crcOk ? (src.crc32 as string) : '',
    region: rom.region || '',
  };
}

// Ссылки ScreenScraper — относительные пути на наш сервер; их не надо заворачивать в общий прокси.
// ScreenScraper links are relative paths to our own server; don't wrap them in the generic proxy.
export function mediaFetchUrl(remoteUrl: string): string {
  if (remoteUrl.startsWith('/api/')) return remoteUrl;
  return `/api/r36s/proxy-media?url=${encodeURIComponent(remoteUrl)}`;
}
