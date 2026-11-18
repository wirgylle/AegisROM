import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  RefreshCw,
  Search,
  Download,
  FolderOpen,
  BookOpen,
  Plus,
  CheckCircle2,
  X,
  ExternalLink,
  AlertTriangle,
  PackageCheck,
  Terminal,
  Cpu,
  Play,
  Library,
  Monitor,
} from 'lucide-react';
import type { PortMasterGame, PortMasterSourceConfig } from '../types/aegis';
import {
  getConsolePortMasterGuides,
  inferPortMasterPcTestPlan,
} from '../utils/portMasterEngine';
import { useI18n } from '../i18n/translations';

interface PortMasterTabProps {
  portMasterBuildSlugs: string[];
  onToggleBuildPort: (port: PortMasterGame) => void;
  libraryPortSlugs?: string[];
  onAddPortToLibrary?: (port: PortMasterGame) => void;
  isNativeDesktopHost?: boolean;
  emulatorCustomPaths?: Record<string, string>;
  libraryPath?: string;
  sourceConfigs: Record<string, PortMasterSourceConfig>;
  onUpdateSourceConfig: (slug: string, cfg: PortMasterSourceConfig) => void;
  onCatalogLoaded?: (games: PortMasterGame[]) => void;
  onAddLog?: (msg: string) => void;
}

const PAGE_SIZE = 30;

export const PortMasterTab: React.FC<PortMasterTabProps> = ({
  portMasterBuildSlugs,
  onToggleBuildPort,
  libraryPortSlugs = [],
  onAddPortToLibrary,
  isNativeDesktopHost = false,
  emulatorCustomPaths = {},
  libraryPath = '',
  sourceConfigs,
  onUpdateSourceConfig,
  onCatalogLoaded,
  onAddLog,
}) => {
  const { t, tf, locale } = useI18n();
  const [games, setGames] = useState<PortMasterGame[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorText, setErrorText] = useState<string>('');
  const [syncedAt, setSyncedAt] = useState<string>('');
  const [fromCache, setFromCache] = useState<boolean>(false);

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [rtrFilter, setRtrFilter] = useState<'all' | 'rtr' | 'needs_data' | 'in_build'>('all');
  const [consoleFilter, setConsoleFilter] = useState<string>('ALL');
  const [page, setPage] = useState<number>(1);
  const [downloadingSlug, setDownloadingSlug] = useState<string | null>(null);
  const [editingPathSlug, setEditingPathSlug] = useState<string | null>(null);
  const [draftPathValue, setDraftPathValue] = useState<string>('');

  const [guidePort, setGuidePort] = useState<PortMasterGame | null>(null);
  const [guideConsoleIdx, setGuideConsoleIdx] = useState<number>(0);
  const [pcTestPort, setPcTestPort] = useState<PortMasterGame | null>(null);
  const [pcTestStatus, setPcTestStatus] = useState<string>('');
  const [isRunningPcTest, setIsRunningPcTest] = useState<boolean>(false);

  const fallbackFolderInputRef = useRef<HTMLInputElement | null>(null);
  const pendingFallbackSlugRef = useRef<string | null>(null);

  const fetchCatalog = async (forceRefresh = false) => {
    setIsLoading(true);
    setErrorText('');
    try {
      const resp = await fetch(
        `/api/portmaster/catalog${forceRefresh ? '?refresh=1' : ''}`
      );
      if (!resp.ok) {
        const txt = await resp.text();
        throw new Error(txt || `HTTP ${resp.status}`);
      }
      const data = await resp.json();
      if (!data.ok || !Array.isArray(data.games)) {
        throw new Error(data.error || t('pm.errInvalidCatalog'));
      }
      setGames(data.games);
      setSyncedAt(data.syncedAt || '');
      setFromCache(Boolean(data.fromCache));
      onCatalogLoaded?.(data.games);
      onAddLog?.(
        `🕹 ${tf('pm.syncOkLog', {
          count: data.games.length,
          source: data.fromCache ? t('pm.fromCache') : t('pm.freshParse'),
        })}`
      );
    } catch (err: any) {
      const msg = String(err?.message || err);
      setErrorText(msg);
      onAddLog?.(`⚠ ${tf('pm.syncErrLog', { err: msg })}`);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCatalog(false);
  }, []);

  const filteredGames = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const buildSet = new Set(portMasterBuildSlugs);

    return games.filter((g) => {
      if (rtrFilter === 'rtr' && !g.readyToRun) return false;
      if (rtrFilter === 'needs_data' && g.readyToRun) return false;
      if (rtrFilter === 'in_build' && !buildSet.has(g.slug)) return false;

      if (consoleFilter !== 'ALL') {
        const matchAvail = g.availDevices.some((d) =>
          d.toLowerCase().includes(consoleFilter.toLowerCase())
        );
        const matchPretty = g.supportedConsolesPretty.some((p) =>
          p.toLowerCase().includes(consoleFilter.toLowerCase())
        );
        if (!matchAvail && !matchPretty) return false;
      }

      if (q) {
        const hit =
          g.title.toLowerCase().includes(q) ||
          g.slug.toLowerCase().includes(q) ||
          g.desc.toLowerCase().includes(q) ||
          g.genres.some((gn) => gn.toLowerCase().includes(q));
        if (!hit) return false;
      }

      return true;
    });
  }, [games, searchQuery, rtrFilter, consoleFilter, portMasterBuildSlugs]);

  const totalPages = Math.max(1, Math.ceil(filteredGames.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageGames = filteredGames.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE
  );

  useEffect(() => {
    setPage(1);
  }, [searchQuery, rtrFilter, consoleFilter]);

  const handleDownloadPortZip = async (port: PortMasterGame) => {
    setDownloadingSlug(port.slug);
    onAddLog?.(`⬇ ${tf('pm.dlStartLog', { title: port.title, id: port.id })}`);
    try {
      const url = `/api/portmaster/download?url=${encodeURIComponent(port.downloadUrl)}`;
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const blob = await resp.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objUrl;
      a.download = port.id.endsWith('.zip') ? port.id : `${port.slug}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(objUrl), 4000);

      const prevCfg = sourceConfigs[port.slug] || {
        slug: port.slug,
        localPathLabel: '',
      };
      onUpdateSourceConfig(port.slug, {
        ...prevCfg,
        downloadedZipAt: new Date().toLocaleTimeString(locale, { hour12: false }),
      });
      onAddLog?.(
        `✔ ${tf('pm.dlDoneLog', {
          file: a.download,
          mb: (blob.size / (1024 * 1024)).toFixed(2),
          target: port.requiredDataTargetPath,
        })}`
      );
    } catch (err: any) {
      onAddLog?.(
        `⛔ ${tf('pm.dlErrLog', { title: port.title, err: String(err?.message || err) })}`
      );
    } finally {
      setDownloadingSlug(null);
    }
  };

  const handlePickSourceFolder = async (port: PortMasterGame) => {
    const win = window as any;
    if (typeof win.showDirectoryPicker === 'function') {
      try {
        const dirHandle = await win.showDirectoryPicker({ mode: 'read' });
        const prevCfg = sourceConfigs[port.slug] || { slug: port.slug, localPathLabel: '' };
        onUpdateSourceConfig(port.slug, {
          ...prevCfg,
          slug: port.slug,
          localPathLabel: dirHandle.name,
          dirHandle,
          files: undefined,
        });
        onAddLog?.(
          `📁 ${tf('pm.pickFolderLog', {
            folder: dirHandle.name,
            title: port.title,
            target: port.requiredDataTargetPath,
          })}`
        );
        return;
      } catch (err: any) {
        if (err?.name === 'AbortError') return;
      }
    }

    pendingFallbackSlugRef.current = port.slug;
    fallbackFolderInputRef.current?.click();
  };

  const handleFallbackSourceFolderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files;
    const targetSlug = pendingFallbackSlugRef.current;
    if (!list || list.length === 0 || !targetSlug) return;
    const filesArr = Array.from(list).map((file) => ({
      file,
      relPath: (file as any).webkitRelativePath || file.name,
    }));
    const firstRel = filesArr[0]?.relPath || 'assets';
    const rootName = firstRel.includes('/') ? firstRel.split('/')[0] : 'folder';
    const prevCfg = sourceConfigs[targetSlug] || { slug: targetSlug, localPathLabel: '' };
    onUpdateSourceConfig(targetSlug, {
      ...prevCfg,
      slug: targetSlug,
      localPathLabel: `${rootName} (${filesArr.length})`,
      files: filesArr,
    });
    onAddLog?.(
      `📁 ${tf('pm.pickFallbackLog', {
        folder: rootName,
        count: filesArr.length,
        slug: targetSlug,
      })}`
    );
    pendingFallbackSlugRef.current = null;
    e.target.value = '';
  };

  const handleSaveManualSourcePath = (port: PortMasterGame) => {
    const prevCfg = sourceConfigs[port.slug] || { slug: port.slug, localPathLabel: '' };
    onUpdateSourceConfig(port.slug, {
      ...prevCfg,
      slug: port.slug,
      localPathLabel: draftPathValue.trim(),
    });
    setEditingPathSlug(null);
    if (draftPathValue.trim()) {
      onAddLog?.(
        `💾 ${tf('pm.manualPathLog', { title: port.title, path: draftPathValue.trim() })}`
      );
    }
  };

  const rtrCount = useMemo(() => games.filter((g) => g.readyToRun).length, [games]);
  const guidesForModal = useMemo(
    () => (guidePort ? getConsolePortMasterGuides(guidePort, tf) : []),
    [guidePort, tf]
  );
  const pcTestPlan = useMemo(
    () => (pcTestPort ? inferPortMasterPcTestPlan(pcTestPort, tf) : null),
    [pcTestPort, tf]
  );

  const downloadTextFile = (filename: string, text: string) => {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  };

  const handleDownloadPcTestScripts = (port: PortMasterGame) => {
    const plan = inferPortMasterPcTestPlan(port, tf);
    downloadTextFile(`Test_PortMaster_${port.slug}.cmd`, plan.cmdScript);
    downloadTextFile(`test_portmaster_${port.slug}.sh`, plan.wslScript);
    setPcTestStatus(`✔ ${tf('pm.scriptsDownloadedStatus', { slug: port.slug })}`);
    onAddLog?.(
      `📜 ${tf('pm.scriptsDownloadedLog', {
        title: port.title,
        emu: plan.emulatorDisplayName,
      })}`
    );
  };

  const handleLaunchPcTestNative = async (port: PortMasterGame) => {
    const plan = inferPortMasterPcTestPlan(port, tf);
    if (!isNativeDesktopHost) {
      handleDownloadPcTestScripts(port);
      return;
    }
    setIsRunningPcTest(true);
    setPcTestStatus('');
    const customExe = emulatorCustomPaths[plan.recommendedEmulatorId] || '';
    const shName = port.items.find((i) => i.toLowerCase().endsWith('.sh')) || `${port.slug}.sh`;
    const localSrc = sourceConfigs[port.slug]?.localPathLabel || '';
    onAddLog?.(
      `🧪 ${tf('pm.nativeStartLog', { title: port.title, emu: plan.emulatorDisplayName })}`
    );
    try {
      const resp = await fetch('/api/native/emulators/launch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          consoleCode: 'ports',
          emulatorId: plan.recommendedEmulatorId,
          exePath: customExe,
          coreFile: '',
          romFileName: shName,
          relativePath: localSrc || `ports/${shName}`,
          libraryPath,
          sdCardPath: '',
          isRetroArch: plan.recommendedEmulatorId === 'portmaster_retroarch',
        }),
      });
      const data = await resp.json();
      if (data && data.ok) {
        const okMsg = `✔ ${tf('pm.nativeOkStatus', { pid: data.pid, cmd: data.commandLine })}`;
        setPcTestStatus(okMsg);
        onAddLog?.(okMsg);
      } else {
        const errMsg = data?.error || t('pm.nativeRunnerMissing');
        setPcTestStatus(`⚠ ${errMsg}`);
        onAddLog?.(`⚠ PortMaster "${port.title}": ${errMsg}`);
      }
    } catch (err) {
      setPcTestStatus(`⛔ ${tf('pm.nativeErrPrefix', { err: String(err) })}`);
    } finally {
      setIsRunningPcTest(false);
    }
  };

  return (
    <div className="space-y-3.5 text-xs">
      <input
        ref={fallbackFolderInputRef}
        type="file"
        // @ts-expect-error webkitdirectory
        webkitdirectory="true"
        directory="true"
        multiple
        onChange={handleFallbackSourceFolderChange}
        className="hidden"
      />

      {/* Top Banner + Live Sync Button */}
      <div className="p-3.5 rounded-xl border border-indigo-300 dark:border-indigo-800 bg-indigo-50/70 dark:bg-indigo-950/30 flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1 max-w-2xl">
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-2 py-0.5 rounded-md bg-indigo-600 text-white font-mono font-extrabold text-[11px]">
              PortMaster ★
            </span>
            <h3 className="text-sm font-extrabold text-slate-900 dark:text-slate-100">
              {t('pm.bannerTitle')}
            </h3>
          </div>
          <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
            {t('pm.bannerSubtitle')} {tf('pm.loadedStatsLine', { total: games.length, rtr: rtrCount })}
          </p>
          {syncedAt && (
            <div className="text-[10px] font-mono text-indigo-700 dark:text-indigo-300">
              {t('pm.syncedAt')} {new Date(syncedAt).toLocaleString(locale)}{' '}
              ({fromCache ? t('pm.fromCache') : t('pm.freshParse')})
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <a
            href="https://portmaster.games/games.html"
            target="_blank"
            rel="noreferrer"
            className="px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-bold flex items-center gap-1.5 hover:bg-slate-100"
          >
            <span>portmaster.games</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>

          <button
            type="button"
            onClick={() => fetchCatalog(true)}
            disabled={isLoading}
            className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold flex items-center gap-1.5 cursor-pointer shadow-2xs disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>{t('pm.refreshBtn')}</span>
          </button>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2.5">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('pm.searchPlaceholder')}
            className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-xs"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <select
            value={rtrFilter}
            onChange={(e) => setRtrFilter(e.target.value as any)}
            className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 font-bold text-xs"
          >
            <option value="all">{t('pm.filter.all')} ({games.length})</option>
            <option value="rtr">{t('pm.filter.rtr')} ({rtrCount})</option>
            <option value="needs_data">{t('pm.filter.needsData')} ({games.length - rtrCount})</option>
            <option value="in_build">{t('pm.filter.inBuild')} ({portMasterBuildSlugs.length})</option>
          </select>

          <select
            value={consoleFilter}
            onChange={(e) => setConsoleFilter(e.target.value)}
            className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 font-bold text-xs"
          >
            <option value="ALL">{t('pm.allDevices')}</option>
            <option value="r36s">R36S / ArkOS</option>
            <option value="anbernic">Anbernic (MuOS / Knulli)</option>
            <option value="trimui">TrimUI Smart Pro</option>
            <option value="rgb30">PowKiddy RGB30</option>
            <option value="rocknix">ROCKNIX / JELOS</option>
          </select>
        </div>
      </div>

      {errorText && (
        <div className="p-3 rounded-xl border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{errorText}</span>
          </div>
          <button
            type="button"
            onClick={() => fetchCatalog(true)}
            className="px-2.5 py-1 rounded-lg bg-rose-600 text-white font-bold cursor-pointer"
          >
            {t('pm.retryBtn')}
          </button>
        </div>
      )}

      {/* Results Header & Pagination */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
        <span>
          {tf('pm.pageInfo', { page: safePage, total: totalPages, count: filteredGames.length })} ·{' '}
          {t('pm.inBuildCount')}{' '}
          <strong className="text-emerald-600 dark:text-emerald-400">{portMasterBuildSlugs.length}</strong>
        </span>
        {totalPages > 1 && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 font-bold disabled:opacity-40 cursor-pointer"
            >
              ← {t('pm.prevPage')}
            </button>
            <span className="font-mono font-bold">
              {safePage} / {totalPages}
            </span>
            <button
              type="button"
              disabled={safePage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 font-bold disabled:opacity-40 cursor-pointer"
            >
              {t('pm.nextPage')} →
            </button>
          </div>
        )}
      </div>

      {/* PortMaster Games List */}
      {isLoading && games.length === 0 ? (
        <div className="py-12 text-center text-slate-500 flex flex-col items-center gap-2">
          <RefreshCw className="w-6 h-6 animate-spin text-indigo-600" />
          <span>{t('pm.loadingCatalog')}</span>
        </div>
      ) : (
        <div className="space-y-2.5">
          {pageGames.map((port) => {
            const isInBuild = portMasterBuildSlugs.includes(port.slug);
            const srcCfg = sourceConfigs[port.slug];
            const sizeMB = port.sizeBytes > 0 ? `${(port.sizeBytes / (1024 * 1024)).toFixed(1)} ${t('size.mb')}` : 'ZIP';
            const isEditingHere = editingPathSlug === port.slug;

            return (
              <div
                key={port.id}
                className={`p-3 rounded-xl border transition space-y-2.5 ${
                  isInBuild
                    ? 'bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-400 dark:border-emerald-700'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
                }`}
              >
                <div className="flex flex-col sm:flex-row gap-3">
                  {/* Cover Thumbnail */}
                  <div className="w-20 h-20 rounded-lg bg-slate-950 overflow-hidden shrink-0 border border-slate-200 dark:border-slate-700 flex items-center justify-center relative">
                    {port.coverUrl ? (
                      <img
                        src={port.coverUrl}
                        alt={port.title}
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).style.display = 'none';
                        }}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Cpu className="w-6 h-6 text-indigo-400" />
                    )}
                  </div>

                  {/* Title, Badges, Description */}
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-extrabold text-slate-900 dark:text-slate-100">
                        {port.title}
                      </span>
                      {port.readyToRun ? (
                        <span className="px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-bold text-[10px]">
                          ✔ {t('pm.rtrBadge')}
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-950 text-amber-900 dark:text-amber-300 font-bold text-[10px]">
                          📁 {t('pm.needsDataBadge')}
                        </span>
                      )}
                      {port.genres.slice(0, 2).map((g) => (
                        <span
                          key={g}
                          className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-mono text-[10px]"
                        >
                          {g}
                        </span>
                      ))}
                      <span className="text-[10px] font-mono text-slate-400">
                        {sizeMB} · {port.dateUpdated || 'PortMaster'}
                      </span>
                    </div>

                    <p className="text-[11px] text-slate-600 dark:text-slate-400 line-clamp-2 leading-relaxed">
                      {port.desc || t('pm.defaultDesc')}
                    </p>

                    <div className="flex flex-wrap items-center gap-2 text-[10px] font-mono">
                      <span className="px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-bold">
                        {t('pm.targetFolder')} {port.requiredDataTargetPath}/
                      </span>
                      {srcCfg?.downloadedZipAt && (
                        <span className="px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-bold">
                          ✔ {t('pm.downloadedAt')} {srcCfg.downloadedZipAt}
                        </span>
                      )}
                      {srcCfg?.localPathLabel && (
                        <span className="px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-bold">
                          📂 {t('pm.sourceLinked')} {srcCfg.localPathLabel}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Per-Game Action Bar: Download | Source Path | Instructions | Add to Build */}
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
                  {isEditingHere ? (
                    <div className="flex flex-1 flex-wrap items-center gap-1.5">
                      <input
                        type="text"
                        value={draftPathValue}
                        onChange={(e) => setDraftPathValue(e.target.value)}
                        placeholder={t('pm.manualPathPlaceholder')}
                        className="flex-1 min-w-[200px] bg-white dark:bg-slate-900 border border-indigo-500 rounded-lg px-2.5 py-1 font-mono text-[11px]"
                      />
                      <button
                        type="button"
                        onClick={() => handleSaveManualSourcePath(port)}
                        className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white font-bold text-[11px] cursor-pointer"
                      >
                        {t('pm.saveBtn')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingPathSlug(null)}
                        className="px-2 py-1 rounded-lg bg-slate-200 dark:bg-slate-800 font-bold text-[11px] cursor-pointer"
                      >
                        {t('pm.cancelBtn')}
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleDownloadPortZip(port)}
                        disabled={downloadingSlug === port.slug}
                        title={t('pm.downloadSiteTip')}
                        className="px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-[11px] flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        {downloadingSlug === port.slug ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Download className="w-3.5 h-3.5" />
                        )}
                        <span>{downloadingSlug === port.slug ? t('pm.downloadingZip') : t('pm.downloadZipBtn')}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handlePickSourceFolder(port)}
                        title={t('pm.pickSourceTip')}
                        className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 font-bold text-[11px] flex items-center gap-1.5 cursor-pointer"
                      >
                        <FolderOpen className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                        <span>
                          {srcCfg?.localPathLabel ? t('pm.changeSourceBtn') : t('pm.pickSourceBtn')}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setEditingPathSlug(port.slug);
                          setDraftPathValue(srcCfg?.localPathLabel || '');
                        }}
                        className="px-2 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-600 dark:text-slate-300 font-mono text-[10px] cursor-pointer"
                        title={t('pm.manualPathTip')}
                      >
                        ⌨ {t('pm.manualPathBtn')}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setGuidePort(port);
                          setGuideConsoleIdx(0);
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 font-bold text-[11px] flex items-center gap-1.5 cursor-pointer"
                      >
                        <BookOpen className="w-3.5 h-3.5" />
                        <span>{t('pm.guideBtn')}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setPcTestPort(port);
                          setPcTestStatus('');
                        }}
                        title={t('pm.pcTestTip')}
                        className="px-2.5 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 border border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 font-bold text-[11px] flex items-center gap-1.5 cursor-pointer"
                      >
                        <Monitor className="w-3.5 h-3.5" />
                        <span>🧪 {t('pm.pcTestBtn')}</span>
                      </button>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-1.5">
                    {onAddPortToLibrary && (() => {
                      const inLib = libraryPortSlugs.includes(port.slug);
                      return (
                        <button
                          type="button"
                          onClick={() => onAddPortToLibrary(port)}
                          className={`px-3 py-1.5 rounded-lg font-extrabold text-[11px] flex items-center gap-1.5 cursor-pointer transition ${
                            inLib
                              ? 'bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-200 border border-blue-400 dark:border-blue-700'
                              : 'bg-blue-600 hover:bg-blue-700 text-white'
                          }`}
                        >
                          <Library className="w-3.5 h-3.5" />
                          <span>{inLib ? t('pm.inLibraryBtn') : t('pm.addLibraryBtn')}</span>
                        </button>
                      );
                    })()}

                    <button
                      type="button"
                      onClick={() => onToggleBuildPort(port)}
                      className={`px-3 py-1.5 rounded-lg font-extrabold text-[11px] flex items-center gap-1.5 cursor-pointer transition ${
                        isInBuild
                          ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                          : 'bg-slate-900 dark:bg-white hover:bg-blue-600 text-white dark:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      {isInBuild ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>{t('pm.inBuildBtn')}</span>
                        </>
                      ) : (
                        <>
                          <Plus className="w-3.5 h-3.5" />
                          <span>{t('pm.addBuildBtn')}</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Console-Specific PortMaster Instructions Modal */}
      {guidePort && (
        <div className="fixed inset-0 z-50 bg-slate-950/65 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-2xl max-w-3xl w-full max-h-[88vh] flex flex-col shadow-2xl overflow-hidden text-xs">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 bg-slate-50 dark:bg-slate-950/60">
              <div className="min-w-0">
                <div className="text-[11px] font-mono font-bold text-indigo-600 dark:text-indigo-400">
                  {t('pm.guideModal.title')} · {guidePort.id}
                </div>
                <h4 className="text-base font-extrabold text-slate-900 dark:text-slate-100 truncate">
                  {guidePort.title}
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setGuidePort(null)}
                className="p-1.5 rounded-lg bg-slate-200/70 dark:bg-slate-800 text-slate-700 dark:text-slate-300 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* Target Folder Hierarchy Box */}
              <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 space-y-1.5">
                <div className="font-extrabold text-blue-900 dark:text-blue-200 flex items-center gap-1.5">
                  <PackageCheck className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  <span>{t('pm.guideModal.hierarchyTitle')}</span>
                </div>
                <div className="font-mono text-[11px] bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-800 rounded-lg p-2.5 text-slate-800 dark:text-slate-200 space-y-0.5">
                  <div>📁 {guidePort.items.find((i) => i.endsWith('/')) || `${guidePort.slug}/`}</div>
                  <div>📜 {guidePort.items.find((i) => i.endsWith('.sh')) || `${guidePort.slug}.sh`}</div>
                  <div className="text-emerald-700 dark:text-emerald-400 font-bold">
                    📂 {guidePort.requiredDataTargetPath}/ ←{' '}
                    {guidePort.readyToRun ? t('pm.guideModal.rtrReady') : t('pm.guideModal.autoCopyAssets')}
                  </div>
                </div>
              </div>

              {/* Console Switcher Tabs */}
              <div className="space-y-2">
                <div className="font-extrabold text-slate-800 dark:text-slate-200">
                  {t('pm.guideModal.stepsTitle')}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {guidesForModal.map((g, idx) => (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => setGuideConsoleIdx(idx)}
                      className={`px-3 py-1.5 rounded-lg font-bold cursor-pointer ${
                        guideConsoleIdx === idx
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {g.consoleName} ({g.osName})
                    </button>
                  ))}
                </div>

                {guidesForModal[guideConsoleIdx] && (
                  <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2">
                    <div className="font-mono text-[11px] text-indigo-700 dark:text-indigo-300 font-bold">
                      {t('pm.guideModal.sdPathLabel')} {guidesForModal[guideConsoleIdx].portsPath}
                    </div>
                    <ol className="list-decimal pl-4 space-y-1.5 text-slate-700 dark:text-slate-300 leading-relaxed">
                      {guidesForModal[guideConsoleIdx].steps.map((st, idx) => (
                        <li key={idx}>{st}</li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>

              {/* Official PortMaster Raw Instructions */}
              <div className="space-y-1.5">
                <div className="font-extrabold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <Terminal className="w-3.5 h-3.5 text-slate-500" />
                  <span>{t('pm.guideModal.notesTitle')}</span>
                </div>
                <pre className="p-3 rounded-xl bg-slate-950 text-slate-200 font-mono text-[11px] whitespace-pre-wrap leading-relaxed overflow-x-auto">
                  {guidePort.instructionsRaw || guidePort.instructionsMd || t('pm.guideModal.noNotes')}
                </pre>
              </div>
            </div>

            <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => handleDownloadPortZip(guidePort)}
                className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>{t('pm.guideModal.downloadFilesBtn')} ({guidePort.id})</span>
              </button>
              <button
                type="button"
                onClick={() => setGuidePort(null)}
                className="px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-bold cursor-pointer"
              >
                {t('pm.close')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PC Test Runner Modal for PortMaster */}
      {pcTestPort && pcTestPlan && (
        <div className="fixed inset-0 z-50 bg-slate-950/65 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-2xl max-w-2xl w-full max-h-[88vh] flex flex-col shadow-2xl overflow-hidden text-xs">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 bg-emerald-50/60 dark:bg-emerald-950/30">
              <div className="min-w-0">
                <div className="text-[11px] font-mono font-bold text-emerald-700 dark:text-emerald-400">
                  {t('pm.pcModal.title')} · {pcTestPort.slug}
                </div>
                <h4 className="text-base font-extrabold text-slate-900 dark:text-slate-100 truncate">
                  {pcTestPort.title}
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setPcTestPort(null)}
                className="p-1.5 rounded-lg bg-slate-200/70 dark:bg-slate-800 text-slate-700 dark:text-slate-300 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-extrabold text-slate-900 dark:text-slate-100">
                    {t('pm.pcModal.engineLabel')} {pcTestPlan.engineName}
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded font-mono font-bold text-[10px] ${
                      pcTestPlan.canRunWithoutArmLinux
                        ? 'bg-emerald-600 text-white'
                        : 'bg-indigo-600 text-white'
                    }`}
                  >
                    {pcTestPlan.canRunWithoutArmLinux
                      ? `✔ ${t('pm.pcModal.nativeWinBadge')}`
                      : `🐧 ${t('pm.pcModal.wslBadge')}`}
                  </span>
                </div>
                <div className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                  {pcTestPlan.explanation}
                </div>
                <div className="font-mono text-[11px] text-blue-700 dark:text-blue-400">
                  {t('pm.pcModal.recommendedRuntime')} <strong>{pcTestPlan.emulatorDisplayName}</strong>
                  {emulatorCustomPaths[pcTestPlan.recommendedEmulatorId]
                    ? ` (${emulatorCustomPaths[pcTestPlan.recommendedEmulatorId]})`
                    : ''}
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="font-extrabold text-slate-800 dark:text-slate-200">
                  {t('pm.pcModal.shPreview')}
                </div>
                <pre className="p-3 rounded-xl bg-slate-950 text-emerald-300 font-mono text-[11px] whitespace-pre-wrap overflow-x-auto leading-relaxed">
                  {pcTestPlan.wslScript}
                </pre>
              </div>

              {pcTestStatus && (
                <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 text-blue-900 dark:text-blue-200 font-bold">
                  {pcTestStatus}
                </div>
              )}
            </div>

            <div className="px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                {isNativeDesktopHost && (
                  <button
                    type="button"
                    disabled={isRunningPcTest}
                    onClick={() => handleLaunchPcTestNative(pcTestPort)}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <Play className="w-3.5 h-3.5 fill-white" />
                    <span>{isRunningPcTest ? t('pm.pcModal.runningNative') : `▶ ${t('pm.pcModal.runNativeBtn')}`}</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleDownloadPcTestScripts(pcTestPort)}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>📜 {t('pm.pcModal.downloadScriptsBtn')}</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => setPcTestPort(null)}
                className="px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-bold cursor-pointer"
              >
                {t('pm.close')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
