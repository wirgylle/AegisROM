import React, { useState, useEffect, useMemo } from 'react';
import {
  Star,
  ExternalLink,
  FolderSearch,
  CheckCircle2,
  AlertTriangle,
  Monitor,
  Pencil,
  RotateCcw,
  Terminal,
  RefreshCw,
  Package,
  ArrowRight,
} from 'lucide-react';
import {
  EMULATOR_CATALOG,
  EXTENDED_CONSOLE_CATALOG,
  type EmulatorOption,
} from '../data/consoleSteamCatalog';
import { PortMasterTab } from './PortMasterTab';
import type { PortMasterGame, PortMasterSourceConfig } from '../types/aegis';
import { useI18n } from '../i18n/translations';

// Maps short console codes ('PSX', 'GENESIS', 'GC', etc.) to canonical keys in EXTENDED_CONSOLE_CATALOG / EMULATOR_CATALOG
export function normalizeConsoleKeyForEmulator(consoleShort: string): string {
  const low = (consoleShort || '').toLowerCase().trim();
  const aliasMap: Record<string, string> = {
    ps1: 'psx',
    psx: 'psx',
    playstation: 'psx',
    md: 'genesis',
    megadrive: 'genesis',
    genesis: 'genesis',
    sfc: 'snes',
    snes: 'snes',
    fc: 'nes',
    famicom: 'nes',
    nes: 'nes',
    gc: 'gamecube',
    gamecube: 'gamecube',
    fbneo: 'arcade',
    mame: 'arcade',
    neogeo: 'arcade',
    sms: 'mastersystem',
    gg: 'gamegear',
    pce: 'pcengine',
    dc: 'dreamcast',
  };
  return aliasMap[low] || low;
}

// Resolves which EmulatorOption is currently prioritized (★) for a given console, plus its resolved .exe path
export function resolvePriorityEmulatorForConsole(
  consoleShort: string,
  customPaths: Record<string, string> = {},
  starredByConsole: Record<string, string> = {}
): { option: EmulatorOption; exePath: string; isStarred: boolean } {
  const cKey = normalizeConsoleKeyForEmulator(consoleShort);
  const starredId = starredByConsole[cKey];

  const matching = EMULATOR_CATALOG.filter((e) => e.supportedConsoles.includes(cKey));
  const fallbackDefaultId = EXTENDED_CONSOLE_CATALOG[cKey]?.defaultEmulatorId;

  const chosen =
    (starredId && matching.find((m) => m.id === starredId)) ||
    (fallbackDefaultId && matching.find((m) => m.id === fallbackDefaultId)) ||
    matching[0] ||
    EMULATOR_CATALOG[0];

  const customForId = customPaths[chosen.id];
  const customRa = chosen.isUniversalRetroArch ? customPaths['retroarch'] : undefined;
  const exePath = customForId || customRa || chosen.defaultExePath;

  return {
    option: chosen,
    exePath,
    isStarred: Boolean(chosen),
  };
}

interface EnvironmentEmulatorsTabProps {
  modeShortCode: string;
  isNativeDesktopHost: boolean;
  emulatorCustomPaths: Record<string, string>;
  starredEmulatorsByConsole: Record<string, string>;
  onUpdateEmulatorConfig: (
    customPaths: Record<string, string>,
    starredMap: Record<string, string>
  ) => void;
  onAddLog?: (msg: string) => void;
  portMasterBuildSlugs?: string[];
  onToggleBuildPort?: (port: PortMasterGame) => void;
  libraryPortSlugs?: string[];
  onAddPortToLibrary?: (port: PortMasterGame) => void;
  libraryPath?: string;
  portMasterSourceConfigs?: Record<string, PortMasterSourceConfig>;
  onUpdatePortMasterSourceConfig?: (slug: string, cfg: PortMasterSourceConfig) => void;
  onPortMasterCatalogLoaded?: (games: PortMasterGame[]) => void;
}

export const EnvironmentEmulatorsTab: React.FC<EnvironmentEmulatorsTabProps> = ({
  modeShortCode,
  isNativeDesktopHost,
  emulatorCustomPaths,
  starredEmulatorsByConsole,
  onUpdateEmulatorConfig,
  onAddLog,
  portMasterBuildSlugs = [],
  onToggleBuildPort,
  libraryPortSlugs = [],
  onAddPortToLibrary,
  libraryPath = '',
  portMasterSourceConfigs = {},
  onUpdatePortMasterSourceConfig,
  onPortMasterCatalogLoaded,
}) => {
  const { t, tf } = useI18n();
  const [envSubTab, setEnvSubTab] = useState<'emulators' | 'portmaster'>('emulators');
  const [detectedPaths, setDetectedPaths] = useState<Record<string, string>>({});
  const [installedCores, setInstalledCores] = useState<string[]>([]);
  const [scanChecked, setScanChecked] = useState<boolean>(false);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [selectedConsoleFilter, setSelectedConsoleFilter] = useState<string>('ALL');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftPath, setDraftPath] = useState<string>('');

  const syncToNativeBackend = (
    customPaths: Record<string, string>,
    starredByConsole: Record<string, string>
  ) => {
    if (!isNativeDesktopHost) return;
    fetch('/api/native/emulators/save-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customPaths, starredByConsole }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && data.ok) {
          setDetectedPaths(data.detectedPaths || {});
          setInstalledCores(data.installedCores || []);
        }
      })
      .catch(() => {});
  };

  const scanEmulatorsOnPC = async (silent = false) => {
    setIsScanning(true);
    try {
      const resp = await fetch('/api/native/emulators/status');
      if (resp.ok) {
        const data = await resp.json();
        if (data && data.ok) {
          setDetectedPaths(data.detectedPaths || {});
          setInstalledCores(data.installedCores || []);
          setScanChecked(true);
          if (
            data.customPaths &&
            Object.keys(data.customPaths).length > 0 &&
            Object.keys(emulatorCustomPaths).length === 0
          ) {
            onUpdateEmulatorConfig(data.customPaths, starredEmulatorsByConsole);
          }
          if (!silent) {
            const countFound = Object.keys(data.detectedPaths || {}).length;
            const coresCount = (data.installedCores || []).length;
            onAddLog?.(
              tf('env.scanLogDetail', { found: countFound, cores: coresCount })
            );
          }
          return;
        }
      }
      setScanChecked(true);
    } catch {
      setScanChecked(true);
    } finally {
      setIsScanning(false);
    }
  };

  useEffect(() => {
    if (isNativeDesktopHost) {
      scanEmulatorsOnPC(true);
    } else {
      setScanChecked(true);
    }
  }, [isNativeDesktopHost]);

  const handleBrowseExe = async (emu: EmulatorOption) => {
    if (!isNativeDesktopHost) {
      setEditingId(emu.id);
      setDraftPath(
        emulatorCustomPaths[emu.id] ||
          (emu.isUniversalRetroArch ? emulatorCustomPaths['retroarch'] : '') ||
          emu.defaultExePath
      );
      onAddLog?.(t('env.browserBrowseLog'));
      return;
    }

    try {
      const resp = await fetch('/api/native/emulators/browse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          emulatorId: emu.isUniversalRetroArch ? 'retroarch' : emu.id,
          emulatorName: emu.isUniversalRetroArch ? 'RetroArch (retroarch.exe)' : t(`emu.name.${emu.id}`, emu.name),
        }),
      });
      const data = await resp.json();
      if (data && data.ok && data.exePath) {
        const keyToSave = emu.isUniversalRetroArch ? 'retroarch' : emu.id;
        const nextCustom = { ...emulatorCustomPaths, [keyToSave]: data.exePath };
        onUpdateEmulatorConfig(nextCustom, starredEmulatorsByConsole);
        setDetectedPaths(data.detectedPaths || {});
        setInstalledCores(data.installedCores || []);
        onAddLog?.(tf('env.exePickedNativeLog', { name: t(`emu.name.${emu.id}`, emu.name), path: data.exePath }));
      } else if (data?.error) {
        onAddLog?.(tf('env.browseErrLog', { err: data.error }));
      }
    } catch (err) {
      onAddLog?.(tf('env.browseExErrLog', { err: String(err) }));
    }
  };

  const handleSaveInlinePath = (emu: EmulatorOption) => {
    const trimmed = draftPath.trim();
    const keyToSave = emu.isUniversalRetroArch ? 'retroarch' : emu.id;
    const nextCustom = { ...emulatorCustomPaths };
    if (trimmed) {
      nextCustom[keyToSave] = trimmed;
    } else {
      delete nextCustom[keyToSave];
    }
    onUpdateEmulatorConfig(nextCustom, starredEmulatorsByConsole);
    syncToNativeBackend(nextCustom, starredEmulatorsByConsole);
    setEditingId(null);
    onAddLog?.(
      tf('env.pathUpdatedLog', { name: t(`emu.name.${emu.id}`, emu.name), path: trimmed || emu.defaultExePath })
    );
  };

  const handleResetPath = (emu: EmulatorOption) => {
    const keyToSave = emu.isUniversalRetroArch ? 'retroarch' : emu.id;
    const nextCustom = { ...emulatorCustomPaths };
    delete nextCustom[keyToSave];
    onUpdateEmulatorConfig(nextCustom, starredEmulatorsByConsole);
    syncToNativeBackend(nextCustom, starredEmulatorsByConsole);
    onAddLog?.(tf('env.resetLog', { name: t(`emu.name.${emu.id}`, emu.name) }));
  };

  const handleSetStarredForConsole = (consoleCode: string, emu: EmulatorOption) => {
    const cKey = normalizeConsoleKeyForEmulator(consoleCode);
    const nextStarred = { ...starredEmulatorsByConsole, [cKey]: emu.id };
    onUpdateEmulatorConfig(emulatorCustomPaths, nextStarred);
    syncToNativeBackend(emulatorCustomPaths, nextStarred);
    onAddLog?.(
      tf('env.priorityChangedLog', { console: cKey.toUpperCase(), name: t(`emu.name.${emu.id}`, emu.name) })
    );
  };

  const allConsoleFilterOptions = useMemo(() => {
    const set = new Set<string>();
    for (const e of EMULATOR_CATALOG) {
      for (const c of e.supportedConsoles) set.add(c);
    }
    return Array.from(set);
  }, []);

  const visibleEmulators = useMemo(() => {
    if (selectedConsoleFilter === 'ALL') return EMULATOR_CATALOG;
    return EMULATOR_CATALOG.filter((e) => e.supportedConsoles.includes(selectedConsoleFilter));
  }, [selectedConsoleFilter]);

  const installedCount = useMemo(() => {
    return EMULATOR_CATALOG.filter((e) => {
      if (e.isUniversalRetroArch) {
        return Boolean(detectedPaths['retroarch'] || detectedPaths[e.id]);
      }
      return Boolean(detectedPaths[e.id]);
    }).length;
  }, [detectedPaths]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-slate-200 dark:border-slate-800 pb-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            {t('env.title')}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {t('env.subtitle')}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
            <button
              type="button"
              onClick={() => setEnvSubTab('emulators')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition ${
                envSubTab === 'emulators'
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-700'
              }`}
            >
              {t('env.tab.emulators')} ({EMULATOR_CATALOG.length})
            </button>
            <button
              type="button"
              onClick={() => setEnvSubTab('portmaster')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer transition ${
                envSubTab === 'portmaster'
                  ? 'bg-indigo-600 text-white shadow-2xs'
                  : 'text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100/70 dark:hover:bg-indigo-950/60'
              }`}
            >
              <Package className="w-3.5 h-3.5" />
              <span>{t('env.tab.portmaster')}</span>
              {portMasterBuildSlugs.length > 0 && (
                <span className="px-1.5 py-0.2 rounded bg-emerald-500 text-white font-mono text-[10px]">
                  {portMasterBuildSlugs.length}
                </span>
              )}
            </button>
          </div>

          {envSubTab === 'emulators' && (
            <button
              type="button"
              onClick={() => scanEmulatorsOnPC(false)}
              disabled={isScanning || !isNativeDesktopHost}
              title={
                isNativeDesktopHost
                  ? t('env.scanPcTip')
                  : t('env.scanLogBrowserErr')
              }
              className="bg-accent hover:bg-accent-hover text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin' : ''}`} />
              <span>{isScanning ? t('env.scanningPcBtn') : t('env.scanPcBtn')}</span>
            </button>
          )}
        </div>
      </div>

      {envSubTab === 'portmaster' ? (
        <PortMasterTab
          portMasterBuildSlugs={portMasterBuildSlugs}
          onToggleBuildPort={(port) => onToggleBuildPort?.(port)}
          libraryPortSlugs={libraryPortSlugs}
          onAddPortToLibrary={onAddPortToLibrary}
          isNativeDesktopHost={isNativeDesktopHost}
          emulatorCustomPaths={emulatorCustomPaths}
          libraryPath={libraryPath}
          sourceConfigs={portMasterSourceConfigs}
          onUpdateSourceConfig={(slug, cfg) => onUpdatePortMasterSourceConfig?.(slug, cfg)}
          onCatalogLoaded={onPortMasterCatalogLoaded}
          onAddLog={onAddLog}
        />
      ) : (
        <>
      {/* Honest Host Environment Status Banner */}
      <div
        className={`p-3 rounded-xl border text-xs flex flex-wrap items-center justify-between gap-2.5 ${
          isNativeDesktopHost
            ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800'
            : 'bg-amber-50/80 dark:bg-amber-950/30 border-amber-300 dark:border-amber-800'
        }`}
      >
        <div className="space-y-0.5 max-w-2xl">
          {isNativeDesktopHost ? (
            <>
              <div className="font-semibold text-emerald-900 dark:text-emerald-200 flex items-center gap-1.5">
                <Monitor className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>{t('env.nativeReadyBadge')}</span>
              </div>
              <div className="text-[11px] text-emerald-800 dark:text-emerald-300">
                {tf('env.nativeBannerDesc', {
                  found: installedCount,
                  total: EMULATOR_CATALOG.length,
                  cores: installedCores.length,
                })}
              </div>
            </>
          ) : (
            <>
              <div className="font-semibold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                <span>{t('env.browserNoticeBadge')}</span>
              </div>
              <div className="text-[11px] text-amber-800 dark:text-amber-300">
                {t('env.browserBannerDesc')}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Console Filter Strip */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs font-bold text-slate-600 dark:text-slate-400 mr-1">
          {t('env.platformFilter')}
        </span>
        <button
          type="button"
          onClick={() => setSelectedConsoleFilter('ALL')}
          className={`px-2.5 py-1 rounded-lg text-xs font-bold cursor-pointer transition ${
            selectedConsoleFilter === 'ALL'
              ? 'bg-blue-600 text-white'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200'
          }`}
        >
          {tf('env.allPlatforms', { count: EMULATOR_CATALOG.length })}
        </button>
        {allConsoleFilterOptions.map((cCode) => {
          const cnt = EMULATOR_CATALOG.filter((e) => e.supportedConsoles.includes(cCode)).length;
          return (
            <button
              key={cCode}
              type="button"
              onClick={() => setSelectedConsoleFilter(cCode)}
              className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold uppercase cursor-pointer transition ${
                selectedConsoleFilter === cCode
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200'
              }`}
            >
              {cCode} ({cnt})
            </button>
          );
        })}
      </div>

      {/* Emulator Cards */}
      <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        {/* Highlighted Dedicated PortMaster Row among Emulators */}
        <div className="p-3.5 bg-indigo-50/70 dark:bg-indigo-950/35 space-y-2 text-xs border-l-4 border-l-indigo-600">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="space-y-1 min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 font-bold text-slate-900 dark:text-slate-100">
                <Package className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                <span className="text-sm font-semibold">{t('env.pmBadgeTitle')}</span>
                <span className="px-2 py-0.5 rounded bg-indigo-600 text-white font-mono text-[10px]">
                  {t('env.pmRowParserBadge')}
                </span>
                {portMasterBuildSlugs.length > 0 && (
                  <span className="px-2 py-0.5 rounded bg-emerald-600 text-white font-mono text-[10px]">
                    {tf('env.pmRowInBuild', { count: portMasterBuildSlugs.length })}
                  </span>
                )}
              </div>
              <div className="text-slate-600 dark:text-slate-300 leading-relaxed">
                {t('env.pmBadgeDesc')}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <a
                href="https://portmaster.games/games.html"
                target="_blank"
                rel="noreferrer"
                className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-semibold flex items-center gap-1"
              >
                <span>portmaster.games</span>
                <ExternalLink className="w-3 h-3" />
              </a>
              <button
                type="button"
                onClick={() => setEnvSubTab('portmaster')}
                className="bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 px-3.5 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <span>{t('env.pmOpenCatalogBtn')}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {visibleEmulators.map((emu) => {
          const customExe =
            emulatorCustomPaths[emu.id] ||
            (emu.isUniversalRetroArch ? emulatorCustomPaths['retroarch'] : undefined);
          const detectedExe =
            detectedPaths[emu.id] ||
            (emu.isUniversalRetroArch ? detectedPaths['retroarch'] : undefined);
          const effectiveExe = customExe || detectedExe || emu.defaultExePath;

          const hasDetectedExe = Boolean(detectedExe);
          const coreDll = emu.isUniversalRetroArch ? emu.coreOrBinary : '';
          const hasCoreDll =
            !emu.isUniversalRetroArch ||
            installedCores.some((c) => c.toLowerCase() === coreDll.toLowerCase());

          const starredForConsoles = emu.supportedConsoles.filter((c) => {
            const { option } = resolvePriorityEmulatorForConsole(
              c,
              emulatorCustomPaths,
              starredEmulatorsByConsole
            );
            return option.id === emu.id;
          });
          const isStarredAnywhere = starredForConsoles.length > 0;
          const isEditing = editingId === emu.id;

          return (
            <div
              key={emu.id}
              className="p-3.5 bg-white dark:bg-slate-900 space-y-2.5 text-xs"
            >
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2.5">
                <div className="space-y-1 min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 font-bold text-slate-900 dark:text-slate-100">
                    <Star
                      className={`w-4 h-4 shrink-0 ${
                        isStarredAnywhere ? 'text-amber-500 fill-amber-400' : 'text-slate-400'
                      }`}
                    />
                    <span className="text-sm">{t(`emu.name.${emu.id}`, emu.name)}</span>
                    {emu.isUniversalRetroArch && (
                      <span className="px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-950 text-indigo-800 dark:text-indigo-300 font-mono text-[10px]">
                        Libretro: {emu.coreOrBinary}
                      </span>
                    )}
                  </div>
                  <div className="text-slate-600 dark:text-slate-400 leading-relaxed">
                    {t(`emu.desc.${emu.id}`, emu.description)}
                  </div>
                </div>

                {/* Honest Verified Status Badge + Website Link */}
                <div className="flex items-center gap-2 shrink-0">
                  {isNativeDesktopHost && scanChecked ? (
                    hasDetectedExe ? (
                      hasCoreDll ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-mono font-bold text-[11px]">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>{t('env.status.found')}</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-100 dark:bg-amber-950 text-amber-900 dark:text-amber-300 font-mono font-bold text-[11px]">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          <span>{t('env.status.exeNoCore')} ({coreDll})</span>
                        </span>
                      )
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-mono font-semibold text-[11px]">
                        <span>{t('env.status.notFound')}</span>
                      </span>
                    )
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-mono font-semibold text-[11px]">
                      <span>{isStarredAnywhere ? t('env.status.templateReady') : t('env.status.readyToBind')}</span>
                    </span>
                  )}

                  <a
                    href={emu.downloadUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold flex items-center gap-1"
                  >
                    <span>{emu.websiteLabel}</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>

              {/* Priority Star Assignment Per Supported Console */}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-semibold text-slate-500">
                  {t('env.setDefaultBtn')}:
                </span>
                {emu.supportedConsoles.map((cCode) => {
                  const isPriorityHere = starredForConsoles.includes(cCode);
                  return (
                    <button
                      key={cCode}
                      type="button"
                      onClick={() => handleSetStarredForConsole(cCode, emu)}
                      title={
                        isPriorityHere
                          ? tf('env.priorityForConsole', { console: cCode.toUpperCase() })
                          : tf('env.makePriorityForConsole', { console: cCode.toUpperCase() })
                      }
                      className={`px-2 py-0.5 rounded-md font-mono font-bold text-[11px] uppercase flex items-center gap-1 cursor-pointer transition ${
                        isPriorityHere
                          ? 'bg-amber-100 dark:bg-amber-950/80 text-amber-900 dark:text-amber-300 border border-amber-400 dark:border-amber-700'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-amber-50 dark:hover:bg-slate-700 border border-transparent'
                      }`}
                    >
                      <span>{isPriorityHere ? '★' : '☆'}</span>
                      <span>{cCode}</span>
                    </button>
                  );
                })}
              </div>

              {/* Executable Path + Browse / Edit Controls */}
              <div className="bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-lg p-2.5 flex flex-wrap items-center justify-between gap-2">
                {isEditing ? (
                  <div className="flex-1 flex flex-wrap items-center gap-1.5 min-w-0">
                    <input
                      type="text"
                      value={draftPath}
                      onChange={(e) => setDraftPath(e.target.value)}
                      placeholder={emu.defaultExePath}
                      className="flex-1 min-w-[220px] bg-white dark:bg-slate-900 border border-blue-500 rounded px-2 py-1 font-mono text-[11px]"
                    />
                    <button
                      type="button"
                      onClick={() => handleSaveInlinePath(emu)}
                      className="px-2.5 py-1 rounded bg-emerald-600 text-white font-bold text-[11px] cursor-pointer"
                    >
                      {t('env.saveBtn')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="px-2 py-1 rounded bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-[11px] cursor-pointer"
                    >
                      {t('env.cancelBtn')}
                    </button>
                  </div>
                ) : (
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="text-[11px] font-mono text-slate-700 dark:text-slate-300 truncate">
                      <span className="text-slate-400">EXE: </span>
                      <span className={customExe || hasDetectedExe ? 'font-bold text-slate-900 dark:text-white' : ''}>
                        {effectiveExe}
                      </span>
                    </div>
                    <div className="text-[10px] font-mono text-slate-500 truncate flex items-center gap-1">
                      <Terminal className="w-3 h-3 shrink-0" />
                      <span>{emu.cliTemplate}</span>
                    </div>
                  </div>
                )}

                {!isEditing && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleBrowseExe(emu)}
                      className="bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 px-2.5 py-1 rounded-md font-bold text-[11px] flex items-center gap-1 cursor-pointer"
                    >
                      <FolderSearch className="w-3 h-3" />
                      <span>{t('env.browseExeBtn')}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(emu.id);
                        setDraftPath(effectiveExe);
                      }}
                      title={t('env.editPathTip')}
                      className="p-1.5 rounded-md bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 cursor-pointer"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                    {customExe && (
                      <button
                        type="button"
                        onClick={() => handleResetPath(emu)}
                        title={t('env.resetPathTip')}
                        className="p-1.5 rounded-md bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-rose-600 hover:bg-rose-50 cursor-pointer"
                      >
                        <RotateCcw className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
        </>
      )}
    </div>
  );
};
