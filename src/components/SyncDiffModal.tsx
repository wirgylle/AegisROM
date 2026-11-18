import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  X,
  FolderOpen,
  HardDrive,
  Cloud,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  ArrowRight,
  GitCompare,
  Plus,
  Copy,
  FileCheck2,
} from 'lucide-react';
import type { UnifiedGameRow } from './FigmaConceptStudio';
import type {
  SavedBuildRecord,
  SyncDiffEntry,
  SyncResolutionAction,
} from '../types/aegis';
import {
  computeLibrarySyncDiff,
  computeBuildSyncDiff,
} from '../utils/syncAndBuildsStorage';
import { useI18n } from '../i18n/translations';

interface SyncDiffModalProps {
  isOpen: boolean;
  mode: 'library_sync' | 'build_sync';
  onClose: () => void;
  currentLibraryRows: UnifiedGameRow[];
  // library_sync props:
  onScanExternalSourceFolder?: () => Promise<{
    sourceName: string;
    rows: UnifiedGameRow[];
  } | null>;
  onApplyLibrarySync?: (
    entriesToApply: SyncDiffEntry[],
    sourceName: string
  ) => Promise<void> | void;
  // build_sync props:
  targetBuild?: SavedBuildRecord | null;
  onExecuteBuildSync?: (
    build: SavedBuildRecord,
    entriesToSync: SyncDiffEntry[]
  ) => Promise<void>;
  onAddLog?: (msg: string) => void;
}

export const SyncDiffModal: React.FC<SyncDiffModalProps> = ({
  isOpen,
  mode,
  onClose,
  currentLibraryRows,
  onScanExternalSourceFolder,
  onApplyLibrarySync,
  targetBuild,
  onExecuteBuildSync,
  onAddLog,
}) => {
  const { t, tf } = useI18n();
  const [sourceKind, setSourceKind] = useState<'folder_usb' | 'cloud_json'>('folder_usb');
  const [sourceLabel, setSourceLabel] = useState<string>('');
  const [cloudJsonUrl, setCloudJsonUrl] = useState<string>('');
  const [isScanningSource, setIsScanningSource] = useState<boolean>(false);
  const [isApplying, setIsApplying] = useState<boolean>(false);
  const [activeFilterTab, setActiveFilterTab] = useState<
    'all_diffs' | 'new_rom' | 'different_edition' | 'library_only' | 'identical'
  >('all_diffs');
  const [diffRows, setDiffRows] = useState<SyncDiffEntry[]>([]);
  const jsonFileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    if (mode === 'build_sync' && targetBuild) {
      const diffs = computeBuildSyncDiff(targetBuild, currentLibraryRows);
      setDiffRows(diffs);
      setSourceLabel(tf('sync.libTargetLabel', { name: targetBuild.name }));
      setActiveFilterTab('all_diffs');
    } else if (mode === 'library_sync') {
      setDiffRows([]);
      setSourceLabel('');
      setActiveFilterTab('all_diffs');
    }
  }, [isOpen, mode, targetBuild, currentLibraryRows, tf]);

  if (!isOpen) return null;

  const newRomsCount = diffRows.filter((d) => d.category === 'new_rom').length;
  const diffEditionCount = diffRows.filter((d) => d.category === 'different_edition').length;
  const libraryOnlyCount = diffRows.filter((d) => d.category === 'library_only').length;
  const identicalCount = diffRows.filter((d) => d.category === 'identical').length;
  const selectedCount = diffRows.filter(
    (d) => d.selected && d.action !== 'skip'
  ).length;

  const visibleDiffs = diffRows.filter((d) => {
    if (activeFilterTab === 'all_diffs') {
      return d.category === 'new_rom' || d.category === 'different_edition';
    }
    return d.category === activeFilterTab;
  });

  const handleScanExternalFolderClick = async () => {
    if (!onScanExternalSourceFolder || isScanningSource) return;
    setIsScanningSource(true);
    try {
      const res = await onScanExternalSourceFolder();
      if (res && res.rows) {
        setSourceLabel(tf('sync.folderSourceLabel', { name: res.sourceName, count: res.rows.length }));
        const computed = computeLibrarySyncDiff(res.rows, currentLibraryRows);
        setDiffRows(computed);
        const nCount = computed.filter((x) => x.category === 'new_rom').length;
        const eCount = computed.filter((x) => x.category === 'different_edition').length;
        onAddLog?.(
          `🔄 ${tf('sync.loadedSourceLog', {
            source: res.sourceName,
            total: res.rows.length,
            newCount: nCount,
            diffCount: eCount,
          })}`
        );
      }
    } finally {
      setIsScanningSource(false);
    }
  };

  const parseJsonTextToRows = (rawText: string): UnifiedGameRow[] => {
    const parsed = JSON.parse(rawText);
    const list: any[] = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.rows)
      ? parsed.rows
      : Array.isArray(parsed?.records)
      ? parsed.records
      : Array.isArray(parsed?.roms)
      ? parsed.roms
      : [];

    return list.map((rec: any, idx: number) => ({
      id: rec.id || `ext_json_${idx}_${Date.now()}`,
      title: rec.title || rec.cleanTitle || rec.fileName || `Game #${idx + 1}`,
      oldFile: rec.oldFile || rec.sdCardFileName || rec.fileName || 'rom.chd',
      cleanFile: rec.cleanFile || rec.canonicalName || rec.fileName || 'rom.chd',
      console:
        rec.console ||
        (rec.consoleCode ? String(rec.consoleCode).toUpperCase() : 'PlayStation 1'),
      consoleShort: String(rec.consoleShort || rec.consoleCode || 'PSX').toUpperCase(),
      bitness: rec.bitness || rec.generationShort || '32-bit',
      region: rec.region || (rec.isRussian ? 'RUS' : 'USA'),
      genre: rec.genre || t('genre.other'),
      year: Number(rec.year || rec.releaseYear) || 1998,
      size:
        rec.size ||
        (rec.fileSize
          ? `${(Number(rec.fileSize) / (1024 * 1024)).toFixed(1)} ${t('size.mb')}`
          : `4.0 ${t('size.mb')}`),
      crc32: rec.crc32 || rec.headerlessCrc32 || 'A1B2C3D4',
      serial: rec.serial || rec.crc32 || 'SLUS-00001',
      emulator: rec.emulator || 'RetroArch ★',
      status: rec.status || t('sync.label.inSource'),
      boxArtUrl: rec.boxArtUrl || rec.scrapedBoxArtUrl,
      videoUrl: rec.videoUrl || rec.scrapedVideoUrl,
      sourceExt:
        rec.sourceExt ||
        rec.extension ||
        (rec.cleanFile && rec.cleanFile.includes('.')
          ? rec.cleanFile.slice(rec.cleanFile.lastIndexOf('.')).toLowerCase()
          : undefined),
      totalBytes: rec.totalBytes || rec.fileSize,
    }));
  };

  const handleLoadJsonFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsScanningSource(true);
    try {
      const txt = await file.text();
      const rows = parseJsonTextToRows(txt);
      setSourceLabel(tf('sync.fileSourceLabel', { name: file.name, count: rows.length }));
      const computed = computeLibrarySyncDiff(rows, currentLibraryRows);
      setDiffRows(computed);
      onAddLog?.(
        tf('sync.loadedFileLog', {
          file: file.name,
          total: rows.length,
          diffs: computed.filter(
            (x) => x.category === 'new_rom' || x.category === 'different_edition'
          ).length,
        })
      );
    } catch (err) {
      onAddLog?.(`⛔ ${tf('sync.errFileRead', { err: String(err) })}`);
    } finally {
      setIsScanningSource(false);
      e.target.value = '';
    }
  };

  const handleFetchCloudUrl = async () => {
    const url = cloudJsonUrl.trim();
    if (!url || isScanningSource) return;
    setIsScanningSource(true);
    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const txt = await resp.text();
      const rows = parseJsonTextToRows(txt);
      setSourceLabel(tf('sync.urlSourceLabel', { count: rows.length }));
      const computed = computeLibrarySyncDiff(rows, currentLibraryRows);
      setDiffRows(computed);
      onAddLog?.(tf('sync.cloudUrlDoneLog', { total: rows.length }));
    } catch (err) {
      onAddLog?.(`⛔ ${tf('sync.errUrlFetch', { err: String(err) })}`);
    } finally {
      setIsScanningSource(false);
    }
  };

  const toggleRowSelected = (id: string) => {
    setDiffRows((prev) =>
      prev.map((d) => (d.id === id ? { ...d, selected: !d.selected } : d))
    );
  };

  const changeRowAction = (id: string, action: SyncResolutionAction) => {
    setDiffRows((prev) =>
      prev.map((d) =>
        d.id === id ? { ...d, action, selected: action !== 'skip' } : d
      )
    );
  };

  const selectAllVisible = (selected: boolean) => {
    const visibleIds = new Set(visibleDiffs.map((v) => v.id));
    setDiffRows((prev) =>
      prev.map((d) =>
        visibleIds.has(d.id) && d.action !== 'skip' ? { ...d, selected } : d
      )
    );
  };

  const handleApply = async () => {
    const chosen = diffRows.filter((d) => d.selected && d.action !== 'skip');
    if (chosen.length === 0 || isApplying) return;
    setIsApplying(true);
    try {
      if (mode === 'library_sync' && onApplyLibrarySync) {
        await onApplyLibrarySync(chosen, sourceLabel || t('sync.label.inSource'));
      } else if (mode === 'build_sync' && targetBuild && onExecuteBuildSync) {
        await onExecuteBuildSync(targetBuild, chosen);
      }
      onClose();
    } finally {
      setIsApplying(false);
    }
  };

  const addCount = diffRows.filter((d) => d.selected && d.action === 'add').length;
  const replCount = diffRows.filter((d) => d.selected && d.action === 'replace_library').length;
  const bothCount = diffRows.filter((d) => d.selected && d.action === 'keep_both').length;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/65 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-2xl max-w-5xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden text-xs">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 bg-slate-50 dark:bg-slate-950/60">
          <div className="flex items-center gap-2.5 min-w-0">
            <GitCompare className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0" />
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-slate-100 truncate">
                {mode === 'library_sync'
                  ? t('sync.title.lib')
                  : tf('sync.title.build', { name: targetBuild?.name || '' })}
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                {mode === 'library_sync'
                  ? t('sync.subtitle.lib')
                  : tf('sync.subtitle.build', {
                      profile: targetBuild?.targetProfileName || targetBuild?.targetProfileId || 'Profile',
                    })}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg bg-slate-200/70 dark:bg-slate-800 hover:bg-slate-300 text-slate-700 dark:text-slate-300 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Source Picker (for library_sync) */}
        {mode === 'library_sync' && (
          <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/60 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setSourceKind('folder_usb')}
                  className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 cursor-pointer transition ${
                    sourceKind === 'folder_usb'
                      ? 'bg-blue-600 text-white'
                      : 'bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <HardDrive className="w-3.5 h-3.5" />
                  <span>{t('sync.src.folder')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSourceKind('cloud_json')}
                  className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 cursor-pointer transition ${
                    sourceKind === 'cloud_json'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <Cloud className="w-3.5 h-3.5" />
                  <span>{t('sync.src.json')}</span>
                </button>
              </div>

              {sourceLabel && (
                <span className="px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 font-mono font-bold text-[11px]">
                  {tf('sync.srcPrefix', { label: sourceLabel })}
                </span>
              )}
            </div>

            {sourceKind === 'folder_usb' ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] text-slate-600 dark:text-slate-400">
                  {t('sync.subtitle.lib')} ({currentLibraryRows.length})
                </span>
                <button
                  type="button"
                  onClick={handleScanExternalFolderClick}
                  disabled={isScanningSource}
                  className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-extrabold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isScanningSource ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <FolderOpen className="w-4 h-4" />
                  )}
                  <span>
                    {isScanningSource ? t('sync.scanning') : t('sync.pickFolderBtn')}
                  </span>
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={jsonFileInputRef}
                  type="file"
                  accept=".json"
                  onChange={handleLoadJsonFile}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => jsonFileInputRef.current?.click()}
                  disabled={isScanningSource}
                  className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  <span>{t('sync.pickFileBtn')}</span>
                </button>
                <span className="text-slate-400">{t('sync.orUrlLabel')}</span>
                <input
                  type="text"
                  value={cloudJsonUrl}
                  onChange={(e) => setCloudJsonUrl(e.target.value)}
                  placeholder={t('sync.urlPlaceholder')}
                  className="flex-1 min-w-[200px] bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 font-mono text-[11px]"
                />
                <button
                  type="button"
                  onClick={handleFetchCloudUrl}
                  disabled={!cloudJsonUrl.trim() || isScanningSource}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold cursor-pointer disabled:opacity-40"
                >
                  {isScanningSource ? t('sync.fetchingUrl') : t('sync.fetchUrlBtn')}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Filter & Summary Strip */}
        <div className="px-5 py-2.5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 bg-white dark:bg-slate-900">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setActiveFilterTab('all_diffs')}
              className={`px-2.5 py-1 rounded-lg font-bold cursor-pointer ${
                activeFilterTab === 'all_diffs'
                  ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
              }`}
            >
              {tf('sync.filter.all', { count: newRomsCount + diffEditionCount })}
            </button>
            {mode === 'library_sync' && (
              <button
                type="button"
                onClick={() => setActiveFilterTab('new_rom')}
                className={`px-2.5 py-1 rounded-lg font-bold cursor-pointer ${
                  activeFilterTab === 'new_rom'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300'
                }`}
              >
                {tf('sync.filter.new', { count: newRomsCount })}
              </button>
            )}
            <button
              type="button"
              onClick={() => setActiveFilterTab('different_edition')}
              className={`px-2.5 py-1 rounded-lg font-bold cursor-pointer ${
                activeFilterTab === 'different_edition'
                  ? 'bg-amber-500 text-slate-950'
                  : 'bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300'
              }`}
            >
              {tf('sync.filter.diff', { count: diffEditionCount })}
            </button>
            {mode === 'library_sync' && (
              <>
                <button
                  type="button"
                  onClick={() => setActiveFilterTab('library_only')}
                  className={`px-2.5 py-1 rounded-lg font-bold cursor-pointer ${
                    activeFilterTab === 'library_only'
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {tf('sync.filter.libOnly', { count: libraryOnlyCount })}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveFilterTab('identical')}
                  className={`px-2.5 py-1 rounded-lg font-bold cursor-pointer ${
                    activeFilterTab === 'identical'
                      ? 'bg-slate-700 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                  }`}
                >
                  {tf('sync.filter.same', { count: identicalCount })}
                </button>
              </>
            )}
          </div>

          {visibleDiffs.length > 0 && (
            <div className="flex items-center gap-2 text-[11px]">
              <button
                type="button"
                onClick={() => selectAllVisible(true)}
                className="font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
              >
                {t('sync.selectAll')}
              </button>
              <span className="text-slate-300">|</span>
              <button
                type="button"
                onClick={() => selectAllVisible(false)}
                className="font-bold text-slate-500 hover:underline cursor-pointer"
              >
                {t('sync.unselectAll')}
              </button>
            </div>
          )}
        </div>

        {/* Discrepancies List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-slate-50/40 dark:bg-slate-950/40">
          {diffRows.length === 0 ? (
            <div className="py-16 text-center space-y-2 text-slate-500">
              {mode === 'build_sync' ? (
                <>
                  <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
                  <div className="text-sm font-bold text-slate-800 dark:text-slate-200">
                    {tf('sync.emptyBuildDiff', { name: targetBuild?.name || '' })}
                  </div>
                </>
              ) : (
                <>
                  <GitCompare className="w-10 h-10 text-blue-500 mx-auto" />
                  <div className="text-sm font-bold text-slate-800 dark:text-slate-200 max-w-md mx-auto">
                    {t('sync.emptySourceDiff')}
                  </div>
                </>
              )}
            </div>
          ) : visibleDiffs.length === 0 ? (
            <div className="py-12 text-center text-slate-500">
              {t('sync.noMatchesFilter')}
            </div>
          ) : (
            visibleDiffs.map((entry) => {
              const isNew = entry.category === 'new_rom';
              const isEdition = entry.category === 'different_edition';
              return (
                <div
                  key={entry.id}
                  className={`p-3 rounded-xl border transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    entry.selected
                      ? 'bg-white dark:bg-slate-900 border-blue-400 dark:border-blue-600 shadow-2xs'
                      : 'bg-white/70 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800'
                  }`}
                >
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    {entry.action !== 'skip' ? (
                      <input
                        type="checkbox"
                        checked={entry.selected}
                        onChange={() => toggleRowSelected(entry.id)}
                        className="w-4 h-4 mt-1 accent-blue-600 cursor-pointer shrink-0"
                      />
                    ) : (
                      <FileCheck2 className="w-4 h-4 mt-1 text-slate-400 shrink-0" />
                    )}

                    <div className="min-w-0 space-y-1 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="px-1.5 py-0.5 rounded bg-slate-900 dark:bg-slate-800 text-white font-mono font-bold text-[10px]">
                          {entry.consoleShort}
                        </span>
                        <span className="font-extrabold text-slate-900 dark:text-slate-100 text-xs sm:text-sm truncate">
                          {entry.title}
                        </span>
                        {isNew && (
                          <span className="px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-bold text-[10px]">
                            {t('sync.badge.newRom')}
                          </span>
                        )}
                        {isEdition && (
                          <span className="px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-950 text-amber-900 dark:text-amber-300 font-bold text-[10px]">
                            {t('sync.badge.otherEdition')}
                          </span>
                        )}
                      </div>

                      <div className="text-[11px] text-slate-600 dark:text-slate-400">
                        {entry.diffReason}
                      </div>

                      <div className="flex flex-wrap items-center gap-2 font-mono text-[10px]">
                        {mode === 'build_sync' ? (
                          <>
                            <span className="px-1.5 py-0.5 rounded bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300">
                              {t('sync.label.inBuild')} {entry.externalEditionLabel} ({entry.buildOldFileName})
                            </span>
                            <ArrowRight className="w-3 h-3 text-slate-400" />
                            <span className="px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-bold">
                              {t('sync.label.inLibrary')} {entry.libraryEditionLabel}
                            </span>
                            {entry.buildTargetPath && (
                              <span className="text-blue-600 dark:text-blue-400">
                                {entry.buildTargetPath}
                              </span>
                            )}
                          </>
                        ) : (
                          <>
                            {entry.libraryEditionLabel && (
                              <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                                {t('sync.label.inDb')} {entry.libraryEditionLabel}
                              </span>
                            )}
                            {entry.libraryEditionLabel && entry.externalEditionLabel && (
                              <ArrowRight className="w-3 h-3 text-slate-400" />
                            )}
                            {entry.externalEditionLabel && (
                              <span className="px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/70 text-blue-800 dark:text-blue-300 font-bold">
                                {t('sync.label.inSource')} {entry.externalEditionLabel}
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Per-row action selector */}
                  {mode === 'library_sync' && isEdition && (
                    <div className="shrink-0">
                      <select
                        value={entry.action}
                        onChange={(e) =>
                          changeRowAction(entry.id, e.target.value as SyncResolutionAction)
                        }
                        className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 font-bold text-[11px]"
                      >
                        <option value="replace_library">{t('sync.action.replaceLibrary')}</option>
                        <option value="keep_both">{t('sync.action.keepBoth')}</option>
                        <option value="skip">{t('sync.action.skip')}</option>
                      </select>
                    </div>
                  )}

                  {mode === 'library_sync' && isNew && (
                    <div className="shrink-0">
                      <select
                        value={entry.action}
                        onChange={(e) =>
                          changeRowAction(entry.id, e.target.value as SyncResolutionAction)
                        }
                        className="bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-300 dark:border-emerald-700 rounded-lg px-2.5 py-1.5 font-bold text-[11px] text-emerald-800 dark:text-emerald-300"
                      >
                        <option value="add">{t('sync.action.add')}</option>
                        <option value="skip">{t('sync.action.skip')}</option>
                      </select>
                    </div>
                  )}

                  {mode === 'build_sync' && (
                    <div className="shrink-0">
                      <span className="px-2.5 py-1 rounded-lg bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-bold text-[11px]">
                        {t('sync.action.updateBuild')}
                      </span>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 flex flex-wrap items-center justify-between gap-3">
          <div className="text-[11px] text-slate-600 dark:text-slate-400">
            {mode === 'build_sync'
              ? tf('sync.footerBuildHint', { count: selectedCount })
              : tf('sync.footerLibHint', {
                  count: selectedCount,
                  add: addCount,
                  repl: replCount,
                  both: bothCount,
                })}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold cursor-pointer"
            >
              {t('sync.close')}
            </button>

            <button
              type="button"
              onClick={handleApply}
              disabled={selectedCount === 0 || isApplying}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-40"
            >
              {isApplying ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : mode === 'library_sync' ? (
                <Plus className="w-4 h-4" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
              <span>
                {mode === 'library_sync'
                  ? tf('sync.applyLibChangesBtn', { count: selectedCount })
                  : tf('sync.applyBuildBtn', { count: selectedCount })}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
