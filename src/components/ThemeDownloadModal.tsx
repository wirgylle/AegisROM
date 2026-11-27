import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Download, ExternalLink, Loader2, Palette, X } from 'lucide-react';
import { useI18n } from '../i18n/translations';
import {
  OGA_RESOLUTIONS,
  ThemeExistsError,
  filterOgaByResolution,
  installThemeZip,
  installedThemeFolders,
  parseOgaGallery,
  parseOnionCatalog,
  themeCatalogUrl,
  themeDownloadUrl,
  type OgaResolution,
  type ThemeCatalogId,
  type ThemeEntry,
} from '../utils/themeCatalog';
import { fetchWithProgress, pctOf } from '../utils/portMasterInstall';

// Окно «Скачать темы» из починки флешки: каталог с превью, скачивание с прогрессом,
// установка только в новую папку внутри папки тем.
// "Download themes" window of the card repair tool: catalog with previews, download with
// progress, install only into a new folder inside the themes folder.

interface ThemeDownloadModalProps {
  catalog: ThemeCatalogId;
  // Папка тем на карте (уже существует). / The card's themes folder (already exists).
  themesDir: any;
  themesPath: string;
  onInstalled?: (folder: string, files: number) => void;
  onClose: () => void;
}

type Job = { phase: 'download' | 'unpack'; done: number; total: number } | { phase: 'done'; files: number } | { phase: 'error'; msg: string };

export const ThemeDownloadModal: React.FC<ThemeDownloadModalProps> = ({ catalog, themesDir, themesPath, onInstalled, onClose }) => {
  const { t, tf } = useI18n();
  const [themes, setThemes] = useState<ThemeEntry[]>([]);
  const [pages, setPages] = useState<string[]>([]);
  const [loadedPages, setLoadedPages] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [res, setRes] = useState<OgaResolution | 'all'>('640x480');
  const [query, setQuery] = useState('');
  const [installed, setInstalled] = useState<Set<string>>(new Set());
  const [jobs, setJobs] = useState<Record<string, Job>>({});

  const refreshInstalled = useCallback(async () => {
    try {
      setInstalled(await installedThemeFolders(themesDir));
    } catch {}
  }, [themesDir]);

  const loadPage = useCallback(
    async (page?: string) => {
      setLoading(true);
      setError('');
      try {
        const r = await fetch(themeCatalogUrl(catalog, page));
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const md = await r.text();
        if (catalog === 'oga') {
          setThemes(parseOgaGallery(md));
        } else {
          const parsed = parseOnionCatalog(md);
          setThemes((prev) => {
            const ids = new Set(prev.map((x) => x.id));
            return [...prev, ...parsed.themes.filter((x) => !ids.has(x.id))];
          });
          setPages((prev) => [...prev, ...parsed.pages.filter((p) => !prev.includes(p))]);
          setLoadedPages((prev) => [...prev, page || 'index.md']);
        }
      } catch (e) {
        setError(String((e as Error)?.message || e));
      } finally {
        setLoading(false);
      }
    },
    [catalog]
  );

  useEffect(() => {
    void loadPage();
    void refreshInstalled();
  }, [loadPage, refreshInstalled]);

  const visible = useMemo(() => {
    const base = catalog === 'oga' ? filterOgaByResolution(themes, res) : themes;
    const q = query.trim().toLowerCase();
    return q ? base.filter((x) => `${x.name} ${x.author}`.toLowerCase().includes(q)) : base;
  }, [themes, res, query, catalog]);

  const nextPage = pages.find((p) => !loadedPages.includes(p));
  const busy = Object.values(jobs).some((j) => j.phase === 'download' || j.phase === 'unpack');

  const install = async (entry: ThemeEntry) => {
    const set = (j: Job) => setJobs((prev) => ({ ...prev, [entry.id]: j }));
    set({ phase: 'download', done: 0, total: 0 });
    try {
      const zip = await fetchWithProgress(themeDownloadUrl(entry.downloadUrl), (done, total) => set({ phase: 'download', done, total }));
      set({ phase: 'unpack', done: 0, total: 0 });
      const r = await installThemeZip(themesDir, zip, entry, (done, total) => set({ phase: 'unpack', done, total }));
      set({ phase: 'done', files: r.files });
      onInstalled?.(r.folder, r.files);
      await refreshInstalled();
    } catch (e) {
      if (e instanceof ThemeExistsError) set({ phase: 'error', msg: tf('themes.exists', { folder: e.folder }) });
      else set({ phase: 'error', msg: String((e as Error)?.message || e) });
    }
  };

  const mb = (n: number) => (n / 1048576).toFixed(1);

  const statusLine = (j: Job | undefined) => {
    if (!j) return null;
    if (j.phase === 'download' || j.phase === 'unpack') {
      if (j.phase === 'unpack') return tf('themes.unpacking', { pct: Math.max(0, pctOf(j.done, j.total)) });
      const pct = pctOf(j.done, j.total);
      return pct >= 0 ? tf('themes.downloadingPct', { pct }) : tf('themes.downloadingMb', { mb: mb(j.done) });
    }
    if (j.phase === 'done') return tf('themes.installed', { files: j.files });
    return j.phase === 'error' ? j.msg : '';
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs" data-modal="themes">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between gap-3">
          <div className="flex items-start gap-2 min-w-0">
            <Palette className="w-5 h-5 text-violet-500 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">{t(`themes.title.${catalog}`)}</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{tf('themes.subtitle', { path: themesPath })}</p>
            </div>
          </div>
          <button onClick={onClose} aria-label={t('sd.plan.cancel')} className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-2 flex flex-wrap items-center gap-2 text-xs border-b border-slate-100 dark:border-slate-800">
          {catalog === 'oga' && (
            <label className="flex items-center gap-1.5">
              <span className="text-slate-600 dark:text-slate-300">{t('themes.screen')}</span>
              <select
                value={res}
                onChange={(e) => setRes(e.target.value as OgaResolution | 'all')}
                className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-1 font-semibold"
              >
                {OGA_RESOLUTIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                    {r === '640x480' ? ` (${t('themes.r36s')})` : ''}
                  </option>
                ))}
                <option value="all">{t('themes.allScreens')}</option>
              </select>
            </label>
          )}
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('themes.search')}
            className="flex-1 min-w-[140px] bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-1"
          />
          <span className="text-slate-500">{tf('themes.count', { count: visible.length })}</span>
        </div>

        <div className="overflow-y-auto px-5 py-3 text-xs">
          {error && <p className="p-2 mb-2 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300">{tf('themes.loadErr', { err: error })}</p>}
          {loading && themes.length === 0 && (
            <p className="flex items-center gap-1.5 text-slate-500">
              <Loader2 className="w-4 h-4 animate-spin" /> {t('themes.loading')}
            </p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {visible.map((x) => {
              const j = jobs[x.id];
              const isInstalled = installed.has(x.folderName.toLowerCase()) || j?.phase === 'done';
              const running = j?.phase === 'download' || j?.phase === 'unpack';
              const fit = catalog === 'oga' && res !== 'all' ? x.fit?.[res] : undefined;
              return (
                <div key={x.id} className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col">
                  <div className="aspect-[4/3] bg-slate-100 dark:bg-slate-800">
                    <img src={x.previewUrl} alt={x.name} loading="lazy" className="w-full h-full object-contain" />
                  </div>
                  <div className="p-2 flex-1 flex flex-col gap-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-bold text-slate-900 dark:text-slate-100 truncate">{x.name}</div>
                        <div className="text-slate-500 dark:text-slate-400 truncate">
                          {x.author}
                          {x.updated ? ` · ${x.updated}` : ''}
                        </div>
                      </div>
                      <a href={x.pageUrl} target="_blank" rel="noreferrer" className="text-slate-400 hover:text-slate-700 shrink-0" title={t('themes.page')}>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                    {fit && (
                      <span className={`self-start px-1.5 py-0.5 rounded font-semibold ${fit === 'yes' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
                        {t(fit === 'yes' ? 'themes.fitYes' : 'themes.fitUntested')}
                      </span>
                    )}
                    {j && j.phase !== 'done' && (
                      <div className={j.phase === 'error' ? 'text-rose-700 dark:text-rose-400' : 'text-slate-600 dark:text-slate-300'}>{statusLine(j)}</div>
                    )}
                    {running && (
                      <div className="h-1 rounded bg-slate-200 dark:bg-slate-700 overflow-hidden">
                        <div
                          className="h-full bg-violet-600 transition-all"
                          style={{ width: `${Math.max(5, pctOf(j.done, j.total) < 0 ? 50 : pctOf(j.done, j.total))}%` }}
                        />
                      </div>
                    )}
                    <div className="mt-auto pt-1">
                      {isInstalled ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-semibold">
                          <CheckCircle2 className="w-3.5 h-3.5" /> {j?.phase === 'done' ? statusLine(j) : t('themes.already')}
                        </span>
                      ) : (
                        <button
                          type="button"
                          disabled={running}
                          onClick={() => void install(x)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg font-bold bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50"
                        >
                          <Download className="w-3.5 h-3.5" /> {t('themes.install')}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {catalog === 'onion' && nextPage && (
            <div className="pt-3 text-center">
              <button
                type="button"
                disabled={loading}
                onClick={() => void loadPage(nextPage)}
                className="px-3 py-1.5 rounded-lg font-semibold border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
              >
                {t('themes.more')}
              </button>
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="text-slate-500 dark:text-slate-400">{t(`themes.footer.${catalog}`)}</span>
          <button
            onClick={onClose}
            disabled={busy}
            className="px-3 py-1.5 rounded-lg font-semibold border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
          >
            {t('sd.plan.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
};
