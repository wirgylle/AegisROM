/**
 * Настройки приложения по умолчанию / App default settings.
 *
 * RU: То, что раньше было зашито в коде как «оптимальное», теперь выбирает
 * пользователь в окне «Настройки». Значения применяются при каждом открытии
 * приложения. В течение сеанса переключатели в разделах меняют только текущий
 * сеанс, а не эти значения. Хранится в localStorage (ключ ниже) и зеркалится
 * на диск через nativeStorage.ts.
 *
 * EN: What used to be hard-coded as "optimal" is now picked by the user in the
 * Settings window. Values are applied on every app start. During a session the
 * toggles in each section change only that session, not these values. Stored
 * in localStorage (key below) and mirrored to disk by nativeStorage.ts.
 */

export const APP_SETTINGS_STORAGE_KEY = 'aegisrom_settings_v1';

export type ThemePreference = 'system' | 'light' | 'dark';
export type StartSection = 'library' | 'tools' | 'builds' | 'env';
export type LibraryViewMode = 'presentation' | 'compact' | 'editor';
export type LibrarySortBy = 'title' | 'console' | 'bitness' | 'genre' | 'age' | 'size' | 'status' | 'studio';
export type SidebarGroupBy = 'console' | 'bitness' | 'genre' | 'age' | 'studio';
export type CatalogMode = 'gen_then_console' | 'r36s_gen_direct' | 'r36s_flat_console';
export type PriorityPreset = 'rus_first' | 'usa_first' | 'eur_first' | 'jpn_first';
export type CombineMoveMode = 'move' | 'copy';
export type SdFirmwareId =
  | 'r36s_arkos'
  | 'anbernic_muos'
  | 'anbernic_knulli'
  | 'rocknix'
  | 'miyoo_onion'
  | 'trimui_crossmix';

export interface AppSettings {
  // Общие / General
  theme: ThemePreference;
  startSection: StartSection;
  libraryView: LibraryViewMode;
  librarySortBy: LibrarySortBy;
  sidebarGroupBy: SidebarGroupBy;
  // Сортировка и переименование / Sorting and renaming
  catalogMode: CatalogMode;
  priorityPreset: PriorityPreset;
  renameOnSort: boolean;
  autoGroupMultiDisc: boolean;
  // Скраппер / Scraper
  autoScrapeAfterSort: boolean;
  scrapeShortVideos: boolean;
  // Удаление / Deletion
  deleteJunkPermanently: boolean;
  // Комбайн / Combine
  combineMoveMode: CombineMoveMode;
  combineSortFolders: boolean;
  combineDedup1G1R: boolean;
  combineAddToLibrary: boolean;
  // Флешка / SD card
  sdFirmwareId: SdFirmwareId;
}

/** Заводские значения: ровно то, что было зашито до окна настроек. / Factory values: exactly what was hard-coded before. */
export const DEFAULT_APP_SETTINGS: Readonly<AppSettings> = Object.freeze({
  theme: 'system',
  startSection: 'library',
  libraryView: 'presentation',
  librarySortBy: 'title',
  sidebarGroupBy: 'console',
  catalogMode: 'r36s_flat_console',
  priorityPreset: 'rus_first',
  renameOnSort: true,
  autoGroupMultiDisc: true,
  autoScrapeAfterSort: true,
  scrapeShortVideos: true,
  deleteJunkPermanently: false,
  combineMoveMode: 'move',
  combineSortFolders: true,
  combineDedup1G1R: true,
  combineAddToLibrary: true,
  sdFirmwareId: 'r36s_arkos',
});

/** Допустимые значения полей-списков. / Allowed values of the enum fields. */
export const APP_SETTINGS_CHOICES = {
  theme: ['system', 'light', 'dark'],
  startSection: ['library', 'tools', 'builds', 'env'],
  libraryView: ['presentation', 'compact', 'editor'],
  librarySortBy: ['title', 'console', 'bitness', 'genre', 'age', 'size', 'status', 'studio'],
  sidebarGroupBy: ['console', 'bitness', 'genre', 'age', 'studio'],
  catalogMode: ['r36s_flat_console', 'gen_then_console', 'r36s_gen_direct'],
  priorityPreset: ['rus_first', 'usa_first', 'eur_first', 'jpn_first'],
  combineMoveMode: ['move', 'copy'],
  sdFirmwareId: [
    'r36s_arkos',
    'anbernic_muos',
    'anbernic_knulli',
    'rocknix',
    'miyoo_onion',
    'trimui_crossmix',
  ],
} as const satisfies { [K in keyof AppSettings]?: readonly AppSettings[K][] };

/**
 * Берёт из сырых данных только известные поля с допустимыми значениями,
 * остальное заполняет заводскими. Старые или битые файлы настроек не ломают запуск.
 * Keeps only known fields with valid values and fills the rest with factory
 * values, so old or broken settings never break the start.
 */
export function normalizeAppSettings(raw: unknown): AppSettings {
  const out: AppSettings = { ...DEFAULT_APP_SETTINGS };
  if (!raw || typeof raw !== 'object') return out;
  const src = raw as Record<string, unknown>;
  for (const key of Object.keys(DEFAULT_APP_SETTINGS) as (keyof AppSettings)[]) {
    const value = src[key];
    const choices = (APP_SETTINGS_CHOICES as Record<string, readonly string[] | undefined>)[key];
    if (choices) {
      if (typeof value === 'string' && choices.includes(value)) (out as any)[key] = value;
    } else if (typeof value === 'boolean') {
      (out as any)[key] = value;
    }
  }
  return out;
}

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

let cached: AppSettings | null = null;
const listeners = new Set<() => void>();

export function loadAppSettings(): AppSettings {
  if (cached) return cached;
  let parsed: unknown = null;
  try {
    const text = storage()?.getItem(APP_SETTINGS_STORAGE_KEY);
    if (text) parsed = JSON.parse(text);
  } catch {
    parsed = null;
  }
  cached = normalizeAppSettings(parsed);
  return cached;
}

export function saveAppSettings(next: AppSettings): AppSettings {
  const normalized = normalizeAppSettings(next);
  cached = normalized;
  try {
    storage()?.setItem(APP_SETTINGS_STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    // Нет доступа к хранилищу: значения живут до закрытия. / No storage: values last until close.
  }
  listeners.forEach((fn) => fn());
  return normalized;
}

export function updateAppSettings(patch: Partial<AppSettings>): AppSettings {
  return saveAppSettings({ ...loadAppSettings(), ...patch });
}

export function subscribeAppSettings(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Тёмная ли тема с учётом системы. / Whether the dark theme is on, honouring the OS. */
export function resolveDarkMode(theme: ThemePreference, systemPrefersDark: boolean): boolean {
  return theme === 'dark' || (theme === 'system' && systemPrefersDark);
}

/** Сброс кэша (для тестов). / Reset the cache (for tests). */
export function __resetAppSettingsCache(): void {
  cached = null;
}
