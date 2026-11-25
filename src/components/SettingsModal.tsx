import React, { useEffect, useState } from 'react';
import { Monitor, Moon, Settings, Sun, X } from 'lucide-react';
import { SUPPORTED_LANGUAGES, useI18n, type SupportedLanguage } from '../i18n/translations';
import {
  APP_SETTINGS_CHOICES,
  DEFAULT_APP_SETTINGS,
  loadAppSettings,
  saveAppSettings,
  type AppSettings,
} from '../utils/appSettings';
import { WindowModeSetting } from './WindowModeSetting';

// Окно «Настройки»: значения по умолчанию, с которыми приложение открывается каждый раз.
// Settings window: the defaults the app opens with every time.

type TabId = 'general' | 'rename' | 'scraper' | 'delete' | 'combine';

interface SettingsModalProps {
  onClose: () => void;
  onSaved?: (settings: AppSettings) => void;
}

const selectCls =
  'w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-100 cursor-pointer';

export function SettingsModal({ onClose, onSaved }: SettingsModalProps) {
  const { t, lang, setLang } = useI18n();
  const [draft, setDraft] = useState<AppSettings>(() => ({ ...loadAppSettings() }));
  const [langDraft, setLangDraft] = useState<SupportedLanguage>(lang);
  const [tab, setTab] = useState<TabId>('general');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const set = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const handleSave = () => {
    const saved = saveAppSettings(draft);
    if (langDraft !== lang) setLang(langDraft);
    onSaved?.(saved);
    onClose();
  };

  const tabs: { id: TabId; label: string }[] = [
    { id: 'general', label: t('settings.tab.general') },
    { id: 'rename', label: t('settings.tab.rename') },
    { id: 'scraper', label: t('settings.tab.scraper') },
    { id: 'delete', label: t('settings.tab.delete') },
    { id: 'combine', label: t('settings.tab.combine') },
  ];

  const field = (label: string, control: React.ReactNode) => (
    <label className="block">
      <span className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">{label}</span>
      {control}
    </label>
  );

  const check = (key: keyof AppSettings, label: string) => (
    <label className="flex items-start gap-2 cursor-pointer text-xs text-slate-800 dark:text-slate-100">
      <input
        type="checkbox"
        checked={Boolean(draft[key])}
        onChange={(e) => set(key, e.target.checked as any)}
        className="w-3.5 h-3.5 mt-0.5 accent-accent shrink-0"
      />
      <span>{label}</span>
    </label>
  );

  const hint = (text: string) => <p className="text-[11px] text-slate-500 dark:text-slate-400">{text}</p>;

  const themeOptions: { id: AppSettings['theme']; label: string; icon: React.ReactNode }[] = [
    { id: 'system', label: t('settings.theme.system'), icon: <Monitor className="w-3.5 h-3.5" /> },
    { id: 'light', label: t('settings.theme.light'), icon: <Sun className="w-3.5 h-3.5" /> },
    { id: 'dark', label: t('settings.theme.dark'), icon: <Moon className="w-3.5 h-3.5" /> },
  ];

  const sectionLabel: Record<AppSettings['startSection'], string> = {
    library: t('nav.library'),
    tools: t('nav.tools'),
    builds: t('nav.builds'),
    env: t('nav.env'),
  };
  const viewLabel: Record<AppSettings['libraryView'], string> = {
    presentation: t('header.view.a'),
    compact: t('header.view.b'),
    editor: t('header.view.c'),
  };
  const groupLabel: Record<AppSettings['sidebarGroupBy'], string> = {
    console: t('cat.byConsole'),
    bitness: t('cat.byBitness'),
    genre: t('cat.byGenre'),
    age: t('cat.byAge'),
    studio: t('studio.by'),
  };
  const catalogLabel: Record<AppSettings['catalogMode'], string> = {
    r36s_flat_console: t('tools.lib.catalogMode.flat'),
    gen_then_console: t('tools.lib.catalogMode.organized'),
    r36s_gen_direct: t('tools.lib.catalogMode.genDirect'),
  };
  const priorityLabel: Record<AppSettings['priorityPreset'], string> = {
    rus_first: t('tools.lib.priority.rusFirst'),
    usa_first: t('tools.lib.priority.usaFirst'),
    eur_first: t('tools.lib.priority.eurFirst'),
    jpn_first: t('tools.lib.priority.jpnFirst'),
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('settings.title')}
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl"
      >
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between gap-3 shrink-0">
          <div className="flex items-start gap-2 min-w-0">
            <Settings className="w-5 h-5 text-accent shrink-0 mt-0.5" />
            <div className="min-w-0">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">{t('settings.title')}</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{t('settings.intro')}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('settings.cancel')}
            title={t('settings.cancel')}
            className="w-8 h-8 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 flex items-center justify-center cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-col sm:flex-row min-h-0 flex-1">
          <nav
            className="flex sm:flex-col gap-1 p-2 sm:p-3 border-b sm:border-b-0 sm:border-r border-slate-200 dark:border-slate-800 overflow-x-auto sm:w-48 shrink-0"
            aria-label={t('settings.title')}
          >
            {tabs.map((tb) => (
              <button
                key={tb.id}
                type="button"
                onClick={() => setTab(tb.id)}
                aria-current={tab === tb.id ? 'page' : undefined}
                className={`text-left whitespace-nowrap sm:whitespace-normal px-2.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition ${
                  tab === tb.id
                    ? 'bg-accent-soft dark:bg-accent-soft-dark text-accent dark:text-accent-dark'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {tb.label}
              </button>
            ))}
          </nav>

          <div className="flex-1 min-w-0 overflow-y-auto p-4 space-y-4">
            {tab === 'general' && (
              <>
                <div>
                  <span className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                    {t('settings.theme')}
                  </span>
                  <div className="grid grid-cols-3 gap-0.5 p-0.5 bg-slate-100 dark:bg-slate-800 rounded-lg" role="radiogroup">
                    {themeOptions.map((o) => (
                      <button
                        key={o.id}
                        type="button"
                        role="radio"
                        aria-checked={draft.theme === o.id}
                        onClick={() => set('theme', o.id)}
                        className={`py-1.5 px-2 rounded-md text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition ${
                          draft.theme === o.id
                            ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-2xs'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                        }`}
                      >
                        {o.icon}
                        <span>{o.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {field(
                    t('settings.language'),
                    <select
                      value={langDraft}
                      onChange={(e) => setLangDraft(e.target.value as SupportedLanguage)}
                      className={selectCls}
                    >
                      {SUPPORTED_LANGUAGES.map((l) => (
                        <option key={l.code} value={l.code}>
                          {l.nativeLabel}
                        </option>
                      ))}
                    </select>
                  )}
                  {field(
                    t('settings.startSection'),
                    <select
                      value={draft.startSection}
                      onChange={(e) => set('startSection', e.target.value as AppSettings['startSection'])}
                      className={selectCls}
                    >
                      {APP_SETTINGS_CHOICES.startSection.map((v) => (
                        <option key={v} value={v}>
                          {sectionLabel[v]}
                        </option>
                      ))}
                    </select>
                  )}
                  {field(
                    t('settings.libraryView'),
                    <select
                      value={draft.libraryView}
                      onChange={(e) => set('libraryView', e.target.value as AppSettings['libraryView'])}
                      className={selectCls}
                    >
                      {APP_SETTINGS_CHOICES.libraryView.map((v) => (
                        <option key={v} value={v}>
                          {viewLabel[v]}
                        </option>
                      ))}
                    </select>
                  )}
                  {field(
                    t('settings.librarySort'),
                    <select
                      value={draft.librarySortBy}
                      onChange={(e) => set('librarySortBy', e.target.value as AppSettings['librarySortBy'])}
                      className={selectCls}
                    >
                      {APP_SETTINGS_CHOICES.librarySortBy.map((v) => (
                        <option key={v} value={v}>
                          {t(`lib.sort.${v}`)}
                        </option>
                      ))}
                    </select>
                  )}
                  {field(
                    t('settings.sidebarGroup'),
                    <select
                      value={draft.sidebarGroupBy}
                      onChange={(e) => set('sidebarGroupBy', e.target.value as AppSettings['sidebarGroupBy'])}
                      className={selectCls}
                    >
                      {APP_SETTINGS_CHOICES.sidebarGroupBy.map((v) => (
                        <option key={v} value={v}>
                          {groupLabel[v]}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <WindowModeSetting />
              </>
            )}

            {tab === 'rename' && (
              <>
                <div className="grid grid-cols-1 gap-3">
                  {field(
                    t('tools.lib.catalogMode'),
                    <select
                      value={draft.catalogMode}
                      onChange={(e) => set('catalogMode', e.target.value as AppSettings['catalogMode'])}
                      className={selectCls}
                    >
                      {APP_SETTINGS_CHOICES.catalogMode.map((v) => (
                        <option key={v} value={v}>
                          {catalogLabel[v]}
                        </option>
                      ))}
                    </select>
                  )}
                  {field(
                    t('tools.lib.priorityMode'),
                    <select
                      value={draft.priorityPreset}
                      onChange={(e) => set('priorityPreset', e.target.value as AppSettings['priorityPreset'])}
                      className={selectCls}
                    >
                      {APP_SETTINGS_CHOICES.priorityPreset.map((v) => (
                        <option key={v} value={v}>
                          {priorityLabel[v]}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <div className="space-y-2">
                  {check('renameOnSort', t('tools.lib.renameOnSort'))}
                  {check('autoGroupMultiDisc', t('tools.lib.multiDiscGroup'))}
                </div>
                {hint(t('settings.renameHint'))}
              </>
            )}

            {tab === 'scraper' && (
              <>
                <div className="space-y-2">
                  {check('autoScrapeAfterSort', t('tools.lib.autoScrape'))}
                  {check('scrapeShortVideos', t('tools.lib.scrapeVideos'))}
                </div>
                {hint(t('settings.scraperHint'))}
              </>
            )}

            {tab === 'delete' && (
              <>
                {check('deleteJunkPermanently', t('tools.lib.deleteDupsPerm'))}
                {hint(t('settings.deleteHint'))}
              </>
            )}

            {tab === 'combine' && (
              <>
                <div className="space-y-2">
                  <div className="text-xs font-bold text-slate-900 dark:text-slate-100">{t('settings.combineTitle')}</div>
                  {field(
                    t('tools.comb.bufferModeLabel'),
                    <select
                      value={draft.combineMoveMode}
                      onChange={(e) => set('combineMoveMode', e.target.value as AppSettings['combineMoveMode'])}
                      className={selectCls}
                    >
                      <option value="move">{t('tools.comb.bufferMode.move')}</option>
                      <option value="copy">{t('tools.comb.bufferMode.copy')}</option>
                    </select>
                  )}
                  {check('combineSortFolders', t('tools.comb.sortFolders'))}
                  {check('combineDedup1G1R', t('tools.comb.dedup1G1R'))}
                  {check('combineAddToLibrary', t('tools.comb.addToLibrary'))}
                </div>
                <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                  <div className="text-xs font-bold text-slate-900 dark:text-slate-100">{t('settings.sdTitle')}</div>
                  {field(
                    t('settings.sdFirmware'),
                    <select
                      value={draft.sdFirmwareId}
                      onChange={(e) => set('sdFirmwareId', e.target.value as AppSettings['sdFirmwareId'])}
                      className={selectCls}
                    >
                      {APP_SETTINGS_CHOICES.sdFirmwareId.map((v) => (
                        <option key={v} value={v}>
                          {t(`tools.sd.fw.${v}`)}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setDraft({ ...DEFAULT_APP_SETTINGS })}
            className="h-8 px-3 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            {t('settings.reset')}
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-8 px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              {t('settings.cancel')}
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="h-8 px-4 rounded-lg bg-accent hover:bg-accent-hover text-white text-xs font-semibold cursor-pointer"
            >
              {t('settings.save')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
