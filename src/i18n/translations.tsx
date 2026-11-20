import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { EN, type TranslationDict } from './locales/en';
import { RU } from './locales/ru';
import { DE } from './locales/de';
import { ES } from './locales/es';
import { JA } from './locales/ja';
import { ZH } from './locales/zh';
import { SR } from './locales/sr';
import { FR } from './locales/fr';
import { IT } from './locales/it';
import { SETUP_STRINGS } from './locales/setup';
import { BIOS_STRINGS } from './biosStrings';
import { COLLECTION_STRINGS } from './collectionStrings';
import { SAVE_STRINGS } from './saveStrings';

export type SupportedLanguage =
  | 'en'
  | 'de'
  | 'es'
  | 'ja'
  | 'zh'
  | 'ru'
  | 'sr'
  | 'fr'
  | 'it';

export interface LanguageMeta {
  code: SupportedLanguage;
  nativeLabel: string;
  shortCode: string;
}

export const SUPPORTED_LANGUAGES: LanguageMeta[] = [
  { code: 'ru', nativeLabel: 'Русский', shortCode: 'RU' },
  { code: 'en', nativeLabel: 'English', shortCode: 'EN' },
  { code: 'de', nativeLabel: 'Deutsch', shortCode: 'DE' },
  { code: 'es', nativeLabel: 'Español', shortCode: 'ES' },
  { code: 'ja', nativeLabel: '日本語', shortCode: 'JA' },
  { code: 'zh', nativeLabel: '中文', shortCode: 'ZH' },
  { code: 'sr', nativeLabel: 'Srpski (latinica)', shortCode: 'SR' },
  { code: 'fr', nativeLabel: 'Français', shortCode: 'FR' },
  { code: 'it', nativeLabel: 'Italiano', shortCode: 'IT' },
];

export const LOCALE_MAP: Record<SupportedLanguage, string> = {
  ru: 'ru-RU',
  en: 'en-US',
  de: 'de-DE',
  es: 'es-ES',
  ja: 'ja-JP',
  zh: 'zh-CN',
  sr: 'sr-Latn-RS',
  fr: 'fr-FR',
  it: 'it-IT',
};

const LANG_STORAGE_KEY = 'aegisrom_lang';

export function detectSystemLanguage(): SupportedLanguage {
  try {
    const saved = localStorage.getItem(LANG_STORAGE_KEY);
    if (saved && SUPPORTED_LANGUAGES.some((l) => l.code === saved)) {
      return saved as SupportedLanguage;
    }
    const candidates = [
      ...(Array.isArray(navigator.languages) ? navigator.languages : []),
      navigator.language,
    ].filter(Boolean);
    for (const raw of candidates) {
      const base = raw.toLowerCase().split(/[-_]/)[0];
      if (SUPPORTED_LANGUAGES.some((l) => l.code === base)) {
        return base as SupportedLanguage;
      }
    }
  } catch {}
  return 'en';
}

// Отдельные файлы строк (мастер настройки, BIOS) подмешиваются сюда.
// Separate string files (setup wizard, BIOS) are merged here.
const EN_ALL = { ...EN, ...SETUP_STRINGS.en, ...BIOS_STRINGS.en, ...COLLECTION_STRINGS.en, ...SAVE_STRINGS.en };

const DICTS: Record<SupportedLanguage, TranslationDict> = {
  ru: { ...RU, ...SETUP_STRINGS.ru, ...BIOS_STRINGS.ru, ...COLLECTION_STRINGS.ru, ...SAVE_STRINGS.ru },
  en: EN_ALL,
  de: { ...DE, ...SETUP_STRINGS.de, ...BIOS_STRINGS.de },
  es: { ...ES, ...SETUP_STRINGS.es, ...BIOS_STRINGS.es },
  ja: { ...JA, ...SETUP_STRINGS.ja, ...BIOS_STRINGS.ja },
  zh: { ...ZH, ...SETUP_STRINGS.zh, ...BIOS_STRINGS.zh },
  sr: { ...SR, ...SETUP_STRINGS.sr, ...BIOS_STRINGS.sr },
  fr: { ...FR, ...SETUP_STRINGS.fr, ...BIOS_STRINGS.fr },
  it: { ...IT, ...SETUP_STRINGS.it, ...BIOS_STRINGS.it },
};

let activeLangRuntime: SupportedLanguage = detectSystemLanguage();

export function getActiveLanguage(): SupportedLanguage {
  return activeLangRuntime;
}

export function getActiveLocale(): string {
  return LOCALE_MAP[activeLangRuntime] || 'en-US';
}

export function tStatic(key: string, fallback?: string): string {
  const dict = DICTS[activeLangRuntime] as Record<string, string>;
  return dict?.[key] ?? (EN_ALL as Record<string, string>)[key] ?? fallback ?? key;
}

export function tfStatic(
  key: string,
  vars?: Record<string, string | number>,
  fallback?: string
): string {
  const dict = DICTS[activeLangRuntime] as Record<string, string>;
  let txt = dict?.[key] ?? (EN_ALL as Record<string, string>)[key] ?? fallback ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      txt = txt.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }
  return txt;
}

export interface I18nContextValue {
  lang: SupportedLanguage;
  locale: string;
  setLang: (lang: SupportedLanguage) => void;
  t: (key: string, fallback?: string) => string;
  tf: (
    key: string,
    vars?: Record<string, string | number>,
    fallback?: string
  ) => string;
}

const I18nContext = createContext<I18nContextValue>({
  lang: 'en',
  locale: 'en-US',
  setLang: () => {},
  t: (key, fallback) => (EN_ALL as Record<string, string>)[key] || fallback || key,
  tf: (key, vars, fallback) => {
    let txt = (EN_ALL as Record<string, string>)[key] || fallback || key;
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        txt = txt.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
      }
    }
    return txt;
  },
});

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lang, setLangState] = useState<SupportedLanguage>(() => {
    const initial = detectSystemLanguage();
    activeLangRuntime = initial;
    return initial;
  });

  const setLang = useCallback((next: SupportedLanguage) => {
    activeLangRuntime = next;
    setLangState(next);
    try {
      localStorage.setItem(LANG_STORAGE_KEY, next);
      document.documentElement.lang = LOCALE_MAP[next] || next;
    } catch {}
  }, []);

  useEffect(() => {
    try {
      document.documentElement.lang = LOCALE_MAP[lang] || lang;
    } catch {}
  }, [lang]);

  const t = useCallback(
    (key: string, fallback?: string): string => {
      const dict = DICTS[lang] as Record<string, string>;
      return dict?.[key] ?? (EN_ALL as Record<string, string>)[key] ?? fallback ?? key;
    },
    [lang]
  );

  const tf = useCallback(
    (
      key: string,
      vars?: Record<string, string | number>,
      fallback?: string
    ): string => {
      const dict = DICTS[lang] as Record<string, string>;
      let txt = dict?.[key] ?? (EN_ALL as Record<string, string>)[key] ?? fallback ?? key;
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          txt = txt.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
        }
      }
      return txt;
    },
    [lang]
  );

  return (
    <I18nContext.Provider
      value={{
        lang,
        locale: LOCALE_MAP[lang] || 'en-US',
        setLang,
        t,
        tf,
      }}
    >
      {children}
    </I18nContext.Provider>
  );
};

export function useI18n(): I18nContextValue {
  return useContext(I18nContext);
}

/**
 * Localizes genre strings extracted from catalogs or ROM metadata across all 9 languages.
 */
export function localizeGenre(rawGenre: string | undefined, t: (k: string, fb?: string) => string): string {
  const g = (rawGenre || '').trim().toLowerCase();
  if (!g || g === 'прочее' || g === 'other' || g === 'arcade' || g === 'classic') {
    return t('genre.other', rawGenre);
  }
  if (g.includes('portmaster')) return t('genre.portmaster', rawGenre);
  if (g.includes('rpg') || g.includes('ролев')) return t('genre.rpg', rawGenre);
  if (g.includes('файтинг') || g.includes('fighting')) return t('genre.fighting', rawGenre);
  if (g.includes('гонк') || g.includes('racing')) return t('genre.racing', rawGenre);
  if (g.includes('платформ') || g.includes('platform')) return t('genre.platformer', rawGenre);
  if (g.includes('шутер') || g.includes('shooter')) return t('genre.shooter', rawGenre);
  if (g.includes('приключ') || g.includes('adventure')) return t('genre.adventure', rawGenre);
  if (g.includes('стратег') || g.includes('тактик') || g.includes('strategy') || g.includes('tactic')) {
    return t('genre.strategy', rawGenre);
  }
  if (g.includes('спорт') || g.includes('sport')) return t('genre.sports', rawGenre);
  if (g.includes('хоррор') || g.includes('выжив') || g.includes('horror') || g.includes('survival')) {
    return t('genre.horror', rawGenre);
  }
  if (g.includes('головолом') || g.includes('логик') || g.includes('puzzle')) {
    return t('genre.puzzle', rawGenre);
  }
  if (g.includes('экш') || g.includes('action') || g.includes('beat')) {
    return t('genre.action', rawGenre);
  }
  return rawGenre || t('genre.other');
}

export function localizeDifficulty(
  diff: string | undefined,
  t: (k: string, fb?: string) => string
): string {
  if (diff === 'easy_relax') return t('diff.easy_relax');
  if (diff === 'hardcore') return t('diff.hardcore');
  return t('diff.medium');
}

export function localizePresetCategory(
  category: string,
  t: (k: string, fb?: string) => string
): string {
  const c = category.toLowerCase();
  if (c.includes('возраст') || c.includes('age')) return t('preset.cat.age');
  if (c.includes('сложн') || c.includes('diff')) return t('preset.cat.difficulty');
  if (c.includes('аудитор') || c.includes('aud')) return t('preset.cat.audience');
  if (c.includes('жанр') || c.includes('genre')) return t('preset.cat.genre');
  if (c.includes('поколен') || c.includes('gen')) return t('preset.cat.generation');
  if (c.includes('статус') || c.includes('status')) return t('preset.cat.status');
  return category;
}
