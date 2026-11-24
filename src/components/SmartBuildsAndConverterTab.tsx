import React, { useState, useMemo, useEffect } from 'react';
import {
  Sparkles,
  Eye,
  Filter,
  Plus,
  Trash2,
  CheckSquare,
  Square,
  FolderOutput,
  Cpu,
  ArrowRight,
  Layers,
  CheckCircle2,
  Download,
  Heart,
  Flame,
  ShieldAlert,
  Gamepad2,
  HardDrive,
  Dices,
  AlertTriangle,
  Save,
  Package,
  History,
  GitCompare,
  Wrench,
} from 'lucide-react';
import { BuildBiosStrip } from './BuildBiosStrip';
import { BuildContentsModal } from './BuildContentsModal';
import { copyBiosIntoBuild, loadBuildCopyBiosPref, saveBuildCopyBiosPref } from '../utils/biosScan';
import { UnifiedGameRow } from './FigmaConceptStudio';
import {
  BUILTIN_EXTENDED_GAMES,
  THEMATIC_BUILD_PRESETS,
  TARGET_SYSTEM_PROFILES,
  FLASH_DRIVE_CAPACITY_SPECS,
  FlashDriveCapacityTier,
  EnrichedBuildGame,
  ThematicBuildPreset,
  AgeRatingTag,
  DifficultyTag,
  BitnessGroupTag,
  enrichGameForBuild,
  describeFormatConversion,
  resolveTargetFolderForGame,
  convertCartridgeBinaryBuffer,
  streamCopyFileToWritable,
  streamConvertBin2352ToIsoWritable,
  streamConvertIso2048ToBinCueWritable,
  streamConvertRawDiscToBinCueWritable,
  buildCleanCueAndTrackPlan,
  calculateFlashDriveNetBudget,
  fitGamesToFlashCapacity,
  buildLuckyRandomSelectionUnderCapacity,
} from '../utils/buildsAndConverterEngine';
import type {
  PortMasterGame,
  PortMasterSourceConfig,
  SavedBuildItem,
  SavedBuildRecord,
  SyncDiffEntry,
} from '../types/aegis';
import {
  extractZipEntriesAsync,
  resolvePortMasterRootDirForProfile,
} from '../utils/portMasterEngine';
import {
  generateM3uPlaylistText,
} from '../utils/multiDiscEngine';
import {
  computeBuildSyncDiff,
  loadSavedBuildsLocal,
  syncSavedBuildsWithServer,
} from '../utils/syncAndBuildsStorage';
import { SyncDiffModal } from './SyncDiffModal';
import { BuildExportOptionsModal } from './BuildExportOptionsModal';
import {
  DirCache,
  copyFileToDir,
  createLimiter,
  defaultCopyConcurrency,
  runPool,
  throttle,
  type CopyOutcome,
} from '../utils/buildCopy';
import { romStem, syncRomSavesWithDevice } from '../utils/saveFiles';
import {
  MediaSourceIndex,
  buildGamelistXml,
  escapeXml,
  loadBuildExportOptions,
  planMediaTargets,
  profileMediaLayout,
  saveBuildExportOptions,
  type BuildExportOptions,
  type BuildGamelistGame,
  type BuildMediaKind,
} from '../utils/buildMedia';
import { GAMELIST_INFO_TAGS } from '../utils/gamelistXml';
import { isNativeFsEnabled, nativeCopyFile } from '../utils/nativeFs';

function formatDuration(ms: number): string {
  const sec = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
import {
  useI18n,
  localizeGenre,
  localizeDifficulty,
  localizePresetCategory,
} from '../i18n/translations';

interface SmartBuildsAndConverterTabProps {
  scannedRows: UnifiedGameRow[];
  modeShortCode: string;
  activeRunning: boolean;
  isNativeDesktopHost?: boolean;
  selectedGameId: string;
  onSelectGameId: (id: string) => void;
  onStartSimulatedTask: (taskLabel: string, steps: string[]) => void;
  onUpdateLiveProgress?: (running: boolean, pct: number, text: string) => void;
  onAddLog?: (msg: string) => void;
  portMasterCatalog?: PortMasterGame[];
  portMasterBuildSlugs?: string[];
  onRemoveBuildPort?: (slug: string) => void;
  onSetBuildPortSlugs?: (slugs: string[]) => void;
  portMasterSourceConfigs?: Record<string, PortMasterSourceConfig>;
  savedBuildsProp?: SavedBuildRecord[];
  onSavedBuildsChanged?: (next: SavedBuildRecord[]) => void;
}

// Extracts uncompressed (ZIP Method 0 / Store) entries from native chdman extractcd response
function extractStoredZipEntries(zipBytes: Uint8Array): Array<{ name: string; data: Uint8Array }> {
  const dv = new DataView(zipBytes.buffer, zipBytes.byteOffset, zipBytes.byteLength);
  let eocdOffset = -1;
  const searchStart = Math.max(0, zipBytes.byteLength - 65558);
  for (let i = zipBytes.byteLength - 22; i >= searchStart; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) return [];

  const totalEntries = dv.getUint16(eocdOffset + 10, true);
  let cdOffset = dv.getUint32(eocdOffset + 16, true);
  const dec = new TextDecoder('utf-8');
  const results: Array<{ name: string; data: Uint8Array }> = [];

  for (let idx = 0; idx < totalEntries && cdOffset + 46 <= zipBytes.byteLength; idx++) {
    if (dv.getUint32(cdOffset, true) !== 0x02014b50) break;
    const compSize = dv.getUint32(cdOffset + 20, true);
    const fnameLen = dv.getUint16(cdOffset + 28, true);
    const extraLen = dv.getUint16(cdOffset + 30, true);
    const commentLen = dv.getUint16(cdOffset + 32, true);
    const localHdrOff = dv.getUint32(cdOffset + 42, true);

    const fname = dec.decode(zipBytes.subarray(cdOffset + 46, cdOffset + 46 + fnameLen));
    cdOffset += 46 + fnameLen + extraLen + commentLen;

    if (localHdrOff + 30 <= zipBytes.byteLength && dv.getUint32(localHdrOff, true) === 0x04034b50) {
      const lFnameLen = dv.getUint16(localHdrOff + 26, true);
      const lExtraLen = dv.getUint16(localHdrOff + 28, true);
      const dataStart = localHdrOff + 30 + lFnameLen + lExtraLen;
      const dataEnd = Math.min(zipBytes.byteLength, dataStart + compSize);
      results.push({ name: fname, data: zipBytes.subarray(dataStart, dataEnd) });
    }
  }
  return results;
}

export const SmartBuildsAndConverterTab: React.FC<SmartBuildsAndConverterTabProps> = ({
  scannedRows,
  modeShortCode,
  activeRunning,
  isNativeDesktopHost = false,
  selectedGameId,
  onSelectGameId,
  onStartSimulatedTask,
  onUpdateLiveProgress,
  onAddLog,
  portMasterCatalog = [],
  portMasterBuildSlugs = [],
  onRemoveBuildPort,
  onSetBuildPortSlugs,
  portMasterSourceConfigs = {},
  savedBuildsProp,
  onSavedBuildsChanged,
}) => {
  const { t, tf, locale } = useI18n();

  // 4 Sub-views inside Builds:
  const [buildsSubTab, setBuildsSubTab] = useState<
    'presets' | 'custom_filter' | 'converter_export' | 'saved_builds'
  >('presets');

  const [savedBuilds, setSavedBuildsState] = useState<SavedBuildRecord[]>(() =>
    savedBuildsProp && savedBuildsProp.length > 0 ? savedBuildsProp : loadSavedBuildsLocal()
  );
  const [syncModalBuild, setSyncModalBuild] = useState<SavedBuildRecord | null>(null);
  // Сборка, открытая в окне «Посмотреть сборку». / Build shown in the "View build" window.
  const [viewBuildId, setViewBuildId] = useState<string | null>(null);
  const viewBuild = viewBuildId ? savedBuilds.find((b) => b.id === viewBuildId) || null : null;

  const setSavedBuilds = (next: SavedBuildRecord[]) => {
    setSavedBuildsState(next);
    onSavedBuildsChanged?.(next);
  };

  useEffect(() => {
    if (Array.isArray(savedBuildsProp)) {
      setSavedBuildsState(savedBuildsProp);
    }
  }, [savedBuildsProp]);

  useEffect(() => {
    if (!savedBuildsProp) {
      syncSavedBuildsWithServer()
        .then((list) => {
          if (Array.isArray(list) && list.length > 0) {
            setSavedBuildsState(list);
            onSavedBuildsChanged?.(list);
          }
        })
        .catch(() => {});
    }
  }, []);

  const queuedPortMasterGames = useMemo(() => {
    const slugSet = new Set(portMasterBuildSlugs);
    return portMasterCatalog.filter((g) => slugSet.has(g.slug));
  }, [portMasterCatalog, portMasterBuildSlugs]);

  const [presetCategoryFilter, setPresetCategoryFilter] = useState<
    'all' | 'age' | 'mood_audience' | 'genre' | 'bitness' | 'status'
  >('all');

  // Merge user's scanned ROMs with built-in catalog so all thematic categories (6+, 10+, 14+, 18+, girls, 8/16/32-bit) are rich and populated
  const allEnrichedGames: EnrichedBuildGame[] = useMemo(() => {
    const baseList =
      scannedRows.length > 0
        ? [
            ...scannedRows,
            ...BUILTIN_EXTENDED_GAMES.filter(
              (b) => !scannedRows.some((s) => s.title.toLowerCase() === b.title.toLowerCase())
            ),
          ]
        : BUILTIN_EXTENDED_GAMES;
    return baseList.map(enrichGameForBuild);
  }, [scannedRows]);

  // ==========================================================================
  // MULTI-PASS CUMULATIVE EXPORT QUEUE ("Задание на выгрузку")
  // ==========================================================================
  const [customBuildName, setCustomBuildName] = useState<string>(
    () => tf('builds.saved.defaultName', { profile: 'AegisROM v0.5' })
  );
  const [queuedGameIds, setQueuedGameIds] = useState<string[]>([
    'b_psx_1',
    'b_psx_2',
    'b_psx_3',
    'b_gen_1',
    'b_snes_1',
    'b_gba_1',
  ]);
  const [filterPassCount, setFilterPassCount] = useState<number>(1);

  const queuedGames = useMemo(() => {
    const setIds = new Set(queuedGameIds);
    return allEnrichedGames.filter((g) => setIds.has(g.id));
  }, [allEnrichedGames, queuedGameIds]);

  // ==========================================================================
  // MULTI-FILTER STATE FOR "СОБРАТЬ СВОЮ"
  // ==========================================================================
  const [filterConsole, setFilterConsole] = useState<string>('ALL');
  const [filterBitness, setFilterBitness] = useState<'ALL' | BitnessGroupTag>('ALL');
  const [filterAge, setFilterAge] = useState<'ALL' | AgeRatingTag>('ALL');
  const [filterDifficulty, setFilterDifficulty] = useState<'ALL' | DifficultyTag | 'girls'>('ALL');
  const [filterGenre, setFilterGenre] = useState<string>('ALL');
  const [filterRegion, setFilterRegion] = useState<string>('ALL');
  const [filterSearch, setFilterSearch] = useState<string>('');

  // Temporary checkboxes in the current filter view before clicking "Добавить в задание"
  const [checkedCandidateIds, setCheckedCandidateIds] = useState<Record<string, boolean>>({});

  const filteredCandidates = useMemo(() => {
    return allEnrichedGames.filter((g) => {
      if (filterConsole !== 'ALL' && g.consoleShort.toUpperCase() !== filterConsole) return false;
      if (filterBitness !== 'ALL' && g.bitnessGroup !== filterBitness) return false;
      if (filterAge !== 'ALL' && g.ageRating !== filterAge) return false;
      if (filterDifficulty === 'girls') {
        if (!g.girlsFavorite) return false;
      } else if (filterDifficulty !== 'ALL' && g.difficulty !== filterDifficulty) {
        return false;
      }
      if (filterGenre !== 'ALL') {
        const lg = g.genre.toLowerCase();
        if (filterGenre === 'fighting' && !lg.includes('файт') && !lg.includes('fight')) return false;
        if (filterGenre === 'racing' && !lg.includes('гонк') && !lg.includes('rac')) return false;
        if (filterGenre === 'platformer' && !lg.includes('платформ') && !lg.includes('platform')) return false;
        if (filterGenre === 'rpg' && !lg.includes('rpg') && !lg.includes('метроид') && !lg.includes('metroid')) return false;
        if (
          filterGenre === 'horror_action' &&
          !lg.includes('хоррор') &&
          !lg.includes('экшен') &&
          !lg.includes('стелс') &&
          !lg.includes('horror') &&
          !lg.includes('action') &&
          !lg.includes('stealth')
        )
          return false;
        if (
          filterGenre === 'cozy' &&
          !lg.includes('уютн') &&
          !lg.includes('сказк') &&
          !lg.includes('детск') &&
          !lg.includes('cozy') &&
          !lg.includes('fairy') &&
          !lg.includes('kids')
        )
          return false;
      }
      if (filterRegion !== 'ALL' && g.region.toUpperCase() !== filterRegion) return false;
      if (filterSearch.trim() !== '') {
        const q = filterSearch.toLowerCase();
        if (
          !g.title.toLowerCase().includes(q) &&
          !g.cleanFile.toLowerCase().includes(q) &&
          !g.genre.toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [
    allEnrichedGames,
    filterConsole,
    filterBitness,
    filterAge,
    filterDifficulty,
    filterGenre,
    filterRegion,
    filterSearch,
  ]);

  const checkedCandidatesCount = useMemo(() => {
    return filteredCandidates.filter((c) => checkedCandidateIds[c.id]).length;
  }, [filteredCandidates, checkedCandidateIds]);

  const handleToggleCandidateCheck = (id: string) => {
    setCheckedCandidateIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleSelectAllFilteredCandidates = (select: boolean) => {
    const next = { ...checkedCandidateIds };
    for (const c of filteredCandidates) {
      next[c.id] = select;
    }
    setCheckedCandidateIds(next);
  };

  const handleAddCheckedCandidatesToQueue = () => {
    const toAdd = filteredCandidates.filter((c) => checkedCandidateIds[c.id]).map((c) => c.id);
    if (toAdd.length === 0) return;

    setQueuedGameIds((prev) => Array.from(new Set([...prev, ...toAdd])));
    setFilterPassCount((p) => p + 1);
    onAddLog?.(
      tf('builds.custom.addedCheckedLog', {
        count: toAdd.length,
        pass: filterPassCount,
        total: new Set([...queuedGameIds, ...toAdd]).size,
      })
    );
  };

  const handleAddAllFilteredToQueue = () => {
    const toAdd = filteredCandidates.map((c) => c.id);
    if (toAdd.length === 0) return;
    setQueuedGameIds((prev) => Array.from(new Set([...prev, ...toAdd])));
    setFilterPassCount((p) => p + 1);
    onAddLog?.(tf('builds.custom.addedAllLog', { count: toAdd.length }));
  };

  // ==========================================================================
  // FLASH DRIVE CAPACITY CALCULATOR STATE (16 / 32 / 64 / 128 / 256 GB MINUS USED)
  // ==========================================================================
  const [flashCapacityTier, setFlashCapacityTier] = useState<FlashDriveCapacityTier>(64);
  const [customUsedSpaceGB, setCustomUsedSpaceGB] = useState<number>(6.0);
  const [presetCapacityOverrides, setPresetCapacityOverrides] = useState<
    Record<string, FlashDriveCapacityTier>
  >({});

  const handleSelectFlashTier = (tier: FlashDriveCapacityTier) => {
    setFlashCapacityTier(tier);
    const spec = FLASH_DRIVE_CAPACITY_SPECS.find((s) => s.nominalGB === tier);
    if (spec) {
      setCustomUsedSpaceGB(spec.defaultSystemUsedGB);
      if (tier === 0) {
        onAddLog?.(t('builds.flash.noLimitLog'));
      } else {
        const b = calculateFlashDriveNetBudget(tier, spec.defaultSystemUsedGB);
        onAddLog?.(
          tf('builds.flash.selectedTierLog', {
            tier,
            real: b.realFormattedGB,
            used: b.usedOrSystemGB,
            avail: b.netAvailableGB,
            mb: b.netAvailableMB,
          })
        );
      }
    }
  };

  const activeFlashBudget = useMemo(
    () => calculateFlashDriveNetBudget(flashCapacityTier, customUsedSpaceGB),
    [flashCapacityTier, customUsedSpaceGB]
  );

  // Dynamically discover all unique consoles present in the scanned/enriched library
  const availableConsolesInBuilds = useMemo(() => {
    const map = new Map<string, { code: string; name: string; count: number }>();
    for (const g of allEnrichedGames) {
      const code = g.consoleShort.toUpperCase();
      const prev = map.get(code);
      if (prev) {
        prev.count += 1;
      } else {
        map.set(code, { code, name: g.console || code, count: 1 });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [allEnrichedGames]);

  // Auto-build random selection from current filters under target flash capacity
  const handleLuckyRandomAutoBuild = (addDirectlyToQueue: boolean) => {
    if (filteredCandidates.length === 0) {
      onAddLog?.(t('builds.lucky.noMatchesErr'));
      return;
    }
    const targetTier = flashCapacityTier === 0 ? 64 : flashCapacityTier;
    const budget =
      flashCapacityTier === 0
        ? calculateFlashDriveNetBudget(64, 6.0)
        : activeFlashBudget;

    const { picked, totalPickedMB } = buildLuckyRandomSelectionUnderCapacity(
      filteredCandidates,
      budget.netAvailableMB
    );

    const nextChecks: Record<string, boolean> = {};
    for (const p of picked) {
      nextChecks[p.id] = true;
    }
    setCheckedCandidateIds(nextChecks);

    const consoleLabel = filterConsole === 'ALL' ? t('builds.presets.allConsoles') : filterConsole;
    const luckyTitle = tf('builds.lucky.buildTitleTpl', { console: consoleLabel, tier: targetTier });
    setCustomBuildName(luckyTitle);

    if (addDirectlyToQueue) {
      const pickedIds = picked.map((p) => p.id);
      setQueuedGameIds(pickedIds);
      setFilterPassCount((c) => c + 1);
      onAddLog?.(
        tf('builds.lucky.builtLog', {
          count: picked.length,
          mb: totalPickedMB,
          console: consoleLabel,
          tier: targetTier,
          avail: budget.netAvailableGB,
        })
      );
    } else {
      onAddLog?.(
        tf('builds.lucky.checkedLog', {
          count: picked.length,
          mb: totalPickedMB,
          tier: targetTier,
        })
      );
    }
  };

  const handleApplyPresetToQueue = (
    preset: ThematicBuildPreset,
    mode: 'append' | 'replace_and_convert' | 'open_in_filter'
  ) => {
    const rawMatched = allEnrichedGames.filter(preset.filterFn);
    const effectiveTier = presetCapacityOverrides[preset.id] ?? flashCapacityTier;
    const presetBudget =
      effectiveTier === flashCapacityTier
        ? activeFlashBudget
        : calculateFlashDriveNetBudget(effectiveTier);
    const matched = fitGamesToFlashCapacity(rawMatched, presetBudget.netAvailableMB);
    const matchedIds = matched.map((m) => m.id);
    const presetTitleLoc = t(`preset.${preset.id}.title`, preset.title);
    const capacitySuffix =
      effectiveTier > 0
        ? tf('builds.preset.capacitySuffix', {
            tier: effectiveTier,
            max: presetBudget.netAvailableGB,
          })
        : '';

    if (mode === 'open_in_filter') {
      const checkedMap: Record<string, boolean> = {};
      for (const m of matched) checkedMap[m.id] = true;
      setCheckedCandidateIds(checkedMap);
      setCustomBuildName(`${presetTitleLoc}${capacitySuffix}`);
      setBuildsSubTab('custom_filter');
      onAddLog?.(
        tf('builds.preset.openedLog', {
          title: presetTitleLoc,
          count: matched.length,
          suffix: capacitySuffix,
        })
      );
      return;
    }

    if (mode === 'append') {
      setQueuedGameIds((prev) => Array.from(new Set([...prev, ...matchedIds])));
      setFilterPassCount((p) => p + 1);
      onAddLog?.(
        tf('builds.preset.appendedLog', {
          title: presetTitleLoc,
          count: matched.length,
          suffix: capacitySuffix,
        })
      );
      return;
    }

    // replace_and_convert
    setQueuedGameIds(matchedIds);
    setCustomBuildName(`${presetTitleLoc}${capacitySuffix}`);
    setSelectedTargetProfileId(preset.recommendedTargetId);
    const recProfile =
      TARGET_SYSTEM_PROFILES.find((p) => p.id === preset.recommendedTargetId) ||
      TARGET_SYSTEM_PROFILES[0];
    setFormatOverrides(recProfile.defaultFormats);
    setBuildsSubTab('converter_export');
    onAddLog?.(
      tf('builds.preset.selectedLog', {
        title: presetTitleLoc,
        count: matched.length,
        suffix: capacitySuffix,
      })
    );
  };

  // ==========================================================================
  // TARGET SYSTEM & FORMAT CONVERTER STATE
  // ==========================================================================
  const [selectedTargetProfileId, setSelectedTargetProfileId] = useState<string>('r36s_arkos');
  const selectedProfile = useMemo(
    () =>
      TARGET_SYSTEM_PROFILES.find((p) => p.id === selectedTargetProfileId) ||
      TARGET_SYSTEM_PROFILES[0],
    [selectedTargetProfileId]
  );

  // Per-console target format overrides (e.g. PSX -> .chd or .iso or .bin+.cue or .pbp)
  const [formatOverrides, setFormatOverrides] = useState<Record<string, string>>(
    TARGET_SYSTEM_PROFILES[0].defaultFormats
  );

  const handleSelectTargetProfile = (profileId: string) => {
    setSelectedTargetProfileId(profileId);
    const found = TARGET_SYSTEM_PROFILES.find((p) => p.id === profileId);
    if (found) {
      setFormatOverrides({ ...found.defaultFormats });
      onAddLog?.(
        tf('builds.conv.targetSysChangedLog', {
          name: t(`profile.${found.id}.short`, found.shortName),
        })
      );
    }
  };

  const handleOverrideConsoleFormat = (consoleCode: string, newExt: string) => {
    setFormatOverrides((prev) => ({ ...prev, [consoleCode]: newExt }));
    onAddLog?.(tf('builds.conv.fmtChangedLog', { console: consoleCode, ext: newExt }));
  };

  // Native desktop chdman.exe status check
  const [chdmanStatus, setChdmanStatus] = useState<{
    checked: boolean;
    available: boolean;
    path: string;
  }>({ checked: false, available: false, path: '' });

  const refreshChdmanStatus = () => {
    fetch('/api/native/converter/status')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && data.ok) {
          setChdmanStatus({
            checked: true,
            available: Boolean(data.chdmanAvailable),
            path: data.chdmanPath || '',
          });
        } else {
          setChdmanStatus({ checked: true, available: false, path: '' });
        }
      })
      .catch(() => {
        setChdmanStatus({ checked: true, available: false, path: '' });
      });
  };

  useEffect(() => {
    refreshChdmanStatus();
  }, [isNativeDesktopHost]);

  const handleSelectChdmanExe = async () => {
    try {
      const resp = await fetch('/api/native/converter/select-chdman', { method: 'POST' });
      const data = await resp.json();
      setChdmanStatus({
        checked: true,
        available: Boolean(data.chdmanAvailable),
        path: data.chdmanPath || '',
      });
      if (data.chdmanAvailable) {
        onAddLog?.(tf('builds.conv.chdmanLinkedLog', { path: data.chdmanPath }));
      } else if (data.error) {
        onAddLog?.(tf('builds.conv.chdmanErrLog', { err: data.error }));
      }
    } catch (err) {
      onAddLog?.(tf('builds.conv.chdmanNativeOnlyLog', { err: String(err) }));
    }
  };

  // Compute full conversion plan for every game in the queue
  const [copyBiosToBuild, setCopyBiosToBuild] = useState<boolean>(() => loadBuildCopyBiosPref());
  // Окно параметров выгрузки (медиа, пропуск готовых) / Export settings dialog (media, skipping)
  const [exportOptionsOpen, setExportOptionsOpen] = useState(false);

  const conversionPlanRows = useMemo(() => {
    return queuedGames.map((g) => {
      const cShort = g.consoleShort.toUpperCase();
      const targetExt =
        formatOverrides[cShort] || selectedProfile.defaultFormats[cShort] || g.sourceExt;
      const rule = describeFormatConversion(cShort, g.sourceExt, targetExt);
      const { folderPath, outputFileName, cueFileName, baseWithRegion } = resolveTargetFolderForGame(
        selectedProfile,
        g,
        targetExt
      );
      const isMultiDisc = Boolean(g.isMultiDisc && g.discs && g.discs.length > 1);
      const discCount = isMultiDisc ? g.discs!.length : undefined;
      const m3uFileName = isMultiDisc ? `${baseWithRegion}.m3u` : undefined;
      const estimatedOutputMB = Math.max(0.1, Math.round(g.sizeMB * rule.sizeRatio * 10) / 10);
      const canConvertRightNow =
        rule.conversionKind === 'copy' ||
        rule.conversionKind === 'builtin_binary' ||
        (rule.conversionKind === 'chdman_required' && chdmanStatus.available);

      return {
        game: g,
        sourceExt: g.sourceExt,
        targetExt,
        rule,
        folderPath,
        outputFileName,
        cueFileName,
        baseWithRegion,
        isMultiDisc,
        discCount,
        m3uFileName,
        estimatedOutputMB,
        canConvertRightNow,
      };
    });
  }, [queuedGames, formatOverrides, selectedProfile, chdmanStatus.available]);

  const totalSourceMB = useMemo(
    () => Math.round(conversionPlanRows.reduce((acc, r) => acc + r.game.sizeMB, 0) * 10) / 10,
    [conversionPlanRows]
  );
  const totalTargetMB = useMemo(
    () =>
      Math.round(conversionPlanRows.reduce((acc, r) => acc + r.estimatedOutputMB, 0) * 10) / 10,
    [conversionPlanRows]
  );
  const convertedFilesCount = useMemo(
    () =>
      conversionPlanRows.filter(
        (r) => r.rule.actionType !== 'keep_as_is' && r.canConvertRightNow
      ).length,
    [conversionPlanRows]
  );
  const missingChdmanCount = useMemo(
    () =>
      conversionPlanRows.filter((r) => r.rule.requiresChdman && !chdmanStatus.available).length,
    [conversionPlanRows, chdmanStatus.available]
  );

  // Helper to persist current build configuration + target paths into Saved Builds history
  const persistCurrentBuildRecord = async (
    exportFolderName?: string,
    overrideItems?: SavedBuildItem[]
  ) => {
    const buildItems: SavedBuildItem[] =
      overrideItems ||
      conversionPlanRows.map((row) => ({
        gameId: row.game.id,
        title: row.game.title,
        consoleShort: row.game.consoleShort.toUpperCase(),
        cleanFile: row.game.cleanFile || row.game.oldFile,
        oldFile: row.game.oldFile || row.game.cleanFile,
        region: row.game.region || 'USA',
        crc32: row.game.crc32 || 'A1B2C3D4',
        sourceExt: row.sourceExt,
        targetExt: row.targetExt,
        folderPath: row.folderPath,
        targetPath:
          row.isMultiDisc && row.m3uFileName
            ? `${row.folderPath}/${row.baseWithRegion}/${row.m3uFileName}`
            : `${row.folderPath}/${row.cueFileName || row.outputFileName}`,
        discCount: row.discCount,
        m3uFileName: row.m3uFileName,
      }));

    const now = new Date().toISOString();
    const existingIdx = savedBuilds.findIndex(
      (b) => b.name.trim().toLowerCase() === customBuildName.trim().toLowerCase() &&
        b.targetProfileId === selectedProfile.id
    );

    const profileShort = t(`profile.${selectedProfile.id}.short`, selectedProfile.shortName);
    const record: SavedBuildRecord = {
      id: existingIdx >= 0 ? savedBuilds[existingIdx].id : `build_${Date.now()}`,
      name: customBuildName.trim() || tf('builds.saved.defaultName', { profile: profileShort }),
      targetProfileId: selectedProfile.id,
      targetProfileName: profileShort,
      exportFolderName:
        exportFolderName ||
        (existingIdx >= 0 ? savedBuilds[existingIdx].exportFolderName : undefined),
      flashCapacityTier,
      formatOverrides: { ...formatOverrides },
      createdAt: existingIdx >= 0 ? savedBuilds[existingIdx].createdAt : now,
      updatedAt: now,
      lastSyncedAt: now,
      items: buildItems,
      portMasterSlugs: [...portMasterBuildSlugs],
    };

    const nextList =
      existingIdx >= 0
        ? savedBuilds.map((b, idx) => (idx === existingIdx ? record : b))
        : [record, ...savedBuilds];

    const saved = await syncSavedBuildsWithServer(nextList);
    setSavedBuilds(saved);
    return record;
  };

  const handleSaveBuildSnapshotClick = async () => {
    const rec = await persistCurrentBuildRecord();
    onAddLog?.(
      tf('builds.saved.savedLog', {
        name: rec.name,
        roms: rec.items.length,
        pm: rec.portMasterSlugs.length,
      })
    );
  };

  const handleLoadSavedBuild = (b: SavedBuildRecord) => {
    setCustomBuildName(b.name);
    setSelectedTargetProfileId(b.targetProfileId);
    setFormatOverrides(b.formatOverrides || {});
    setFlashCapacityTier(b.flashCapacityTier || 64);

    // Match saved items by gameId or fallback by title + console
    const resolvedIds: string[] = [];
    for (const item of b.items) {
      const hit =
        allEnrichedGames.find((g) => g.id === item.gameId) ||
        allEnrichedGames.find(
          (g) =>
            g.consoleShort.toUpperCase() === item.consoleShort.toUpperCase() &&
            g.title.toLowerCase() === item.title.toLowerCase()
        );
      if (hit) resolvedIds.push(hit.id);
    }
    setQueuedGameIds(resolvedIds);
    if (onSetBuildPortSlugs && Array.isArray(b.portMasterSlugs)) {
      onSetBuildPortSlugs(b.portMasterSlugs);
    }
    setBuildsSubTab('converter_export');
    onAddLog?.(
      tf('builds.saved.loadedLog', {
        name: b.name,
        roms: resolvedIds.length,
        pm: b.portMasterSlugs?.length || 0,
      })
    );
  };

  const handleDeleteSavedBuild = async (buildId: string) => {
    const nextList = savedBuilds.filter((b) => b.id !== buildId);
    const saved = await syncSavedBuildsWithServer(nextList);
    setSavedBuilds(saved);
    onAddLog?.(t('builds.saved.deletedLog'));
  };

  // Удаление игры или порта из сохранённой сборки (файлы на флешке не трогаем).
  // Remove a game or port from a saved build (files on the drive stay untouched).
  const updateSavedBuild = async (build: SavedBuildRecord, patch: Partial<SavedBuildRecord>) => {
    const updated: SavedBuildRecord = { ...build, ...patch, updatedAt: new Date().toISOString() };
    const nextList = savedBuilds.map((b) => (b.id === build.id ? updated : b));
    setSavedBuilds(nextList);
    const saved = await syncSavedBuildsWithServer(nextList);
    setSavedBuilds(saved);
  };

  const handleRemoveBuildItem = async (build: SavedBuildRecord, index: number) => {
    const item = build.items[index];
    if (!item) return;
    await updateSavedBuild(build, { items: build.items.filter((_, i) => i !== index) });
    onAddLog?.(tf('builds.view.removedLog', { title: item.title, name: build.name }));
  };

  const handleRemoveBuildPort = async (build: SavedBuildRecord, slug: string) => {
    await updateSavedBuild(build, {
      portMasterSlugs: (build.portMasterSlugs || []).filter((s) => s !== slug),
    });
    onAddLog?.(tf('builds.view.removedLog', { title: slug, name: build.name }));
  };

  // Sync a saved build with updated ROMs from current Library and write updated files to the build directory by targetPath
  const handleExecuteBuildSync = async (
    build: SavedBuildRecord,
    entriesToSync: SyncDiffEntry[]
  ) => {
    const win = window as any;
    let buildRootHandle: any = null;
    if (typeof win.showDirectoryPicker === 'function') {
      try {
        buildRootHandle = await win.showDirectoryPicker({ mode: 'readwrite' });
      } catch (err: any) {
        if (err?.name === 'AbortError') return;
      }
    }

    const prof =
      TARGET_SYSTEM_PROFILES.find((p) => p.id === build.targetProfileId) ||
      TARGET_SYSTEM_PROFILES[0];

    if (!buildRootHandle) {
      // Honest .CMD updater script when browser FS picker is unavailable
      const lines = [
        '@echo off',
        'chcp 65001 >nul',
        `echo ${tf('builds.saved.syncCmdEchoStart', { name: build.name })}`,
      ];
      for (const ent of entriesToSync) {
        if (!ent.libraryRow || !ent.buildFolderPath) continue;
        const winDir = ent.buildFolderPath.replace(/\//g, '\\');
        const newSrc = ent.libraryRow.oldFile || ent.libraryRow.cleanFile;
        const targetExt =
          ent.buildTargetExt ||
          prof.defaultFormats[ent.consoleShort] ||
          ent.libraryRow.sourceExt ||
          '.chd';
        const enrichedLibRow = enrichGameForBuild(ent.libraryRow);
        const { outputFileName } = resolveTargetFolderForGame(prof, enrichedLibRow, targetExt);
        if (ent.buildOldFileName && ent.buildOldFileName !== outputFileName) {
          lines.push(`if exist "${winDir}\\${ent.buildOldFileName}" del /q "${winDir}\\${ent.buildOldFileName}"`);
        }
        lines.push(`if not exist "${winDir}" mkdir "${winDir}"`);
        lines.push(`if exist "${newSrc}" copy /y "${newSrc}" "${winDir}\\${outputFileName}" >nul`);
      }
      lines.push(`echo ${t('builds.saved.syncCmdEchoDone')}`);
      const blob = new Blob([lines.join('\r\n')], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Sync_Build_${build.id}.cmd`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 3000);
      onAddLog?.(
        tf('builds.saved.syncCmdDownloadedLog', {
          file: a.download,
          count: entriesToSync.length,
        })
      );
      return;
    }

    onUpdateLiveProgress?.(
      true,
      5,
      tf('builds.saved.syncProgressStart', {
        name: build.name,
        count: entriesToSync.length,
        folder: buildRootHandle.name,
      })
    );

    let updatedFilesCount = 0;
    let updatedMetadataCount = 0;
    const updatedBuildItems = [...build.items];

    for (let i = 0; i < entriesToSync.length; i++) {
      const ent = entriesToSync[i];
      const libRow = ent.libraryRow;
      if (!libRow) continue;

      const pct = Math.round(((i + 1) / entriesToSync.length) * 95);
      onUpdateLiveProgress?.(
        true,
        Math.max(8, pct),
        tf('builds.saved.syncProgressItem', {
          i: i + 1,
          total: entriesToSync.length,
          title: libRow.title,
          path: ent.buildTargetPath || '',
        })
      );

      const targetExt =
        ent.buildTargetExt ||
        build.formatOverrides[ent.consoleShort] ||
        prof.defaultFormats[ent.consoleShort] ||
        libRow.sourceExt ||
        '.chd';
      const enrichedLibRow = enrichGameForBuild(libRow);
      const { folderPath, outputFileName, cueFileName } = resolveTargetFolderForGame(
        prof,
        enrichedLibRow,
        targetExt
      );

      const segs = (ent.buildFolderPath || folderPath).split('/').filter(Boolean);
      let currDir = buildRootHandle;
      for (const seg of segs) {
        currDir = await currDir.getDirectoryHandle(seg, { create: true });
      }

      const finalOutName = cueFileName || outputFileName;

      // Remove old stale file if name/edition changed (e.g. Japan -> RUS)
      if (ent.buildOldFileName && ent.buildOldFileName !== finalOutName) {
        try {
          await currDir.removeEntry(ent.buildOldFileName);
        } catch {}
      }

      if (libRow.fileObj) {
        try {
          await copyFileToDir(libRow.fileObj, currDir, outputFileName, { diskCopy: nativeCopyFile });
          updatedFilesCount++;
          onAddLog?.(
            tf('builds.saved.syncUpdatedFile', {
              path: `${segs.join('/')}/${outputFileName}`,
            })
          );
        } catch (err) {
          onAddLog?.(
            tf('builds.saved.syncWriteErr', {
              file: outputFileName,
              err: String(err),
            })
          );
        }
      }

      // Update item inside saved build record
      const idxInBuild = updatedBuildItems.findIndex(
        (bi) => bi.targetPath === ent.buildTargetPath || bi.gameId === ent.libraryRow?.id
      );
      const newTargetPath = `${segs.join('/')}/${finalOutName}`;
      if (idxInBuild >= 0) {
        updatedBuildItems[idxInBuild] = {
          ...updatedBuildItems[idxInBuild],
          gameId: libRow.id,
          cleanFile: libRow.cleanFile || libRow.oldFile,
          oldFile: libRow.oldFile || libRow.cleanFile,
          region: libRow.region || 'USA',
          crc32: libRow.crc32 || 'A1B2C3D4',
          targetPath: newTargetPath,
        };
        updatedMetadataCount++;
      }
    }

    const updatedRecord: SavedBuildRecord = {
      ...build,
      exportFolderName: buildRootHandle.name,
      updatedAt: new Date().toISOString(),
      lastSyncedAt: new Date().toISOString(),
      items: updatedBuildItems,
    };
    const nextList = savedBuilds.map((b) => (b.id === build.id ? updatedRecord : b));
    const syncedList = await syncSavedBuildsWithServer(nextList);
    setSavedBuilds(syncedList);

    const doneMsg = tf('builds.saved.syncDoneLog', {
      name: build.name,
      files: updatedFilesCount,
      meta: updatedMetadataCount,
    });
    onUpdateLiveProgress?.(false, 100, doneMsg);
    onAddLog?.(doneMsg);
  };

  // ==========================================================================
  // EXECUTE REAL EXPORT + FOLDER HIERARCHY CREATION + GENUINE FORMAT CONVERSION + PORTMASTER
  // ==========================================================================
  const handleRunBuildExportAndConversion = async (opts: BuildExportOptions) => {
    if ((conversionPlanRows.length === 0 && queuedPortMasterGames.length === 0) || activeRunning)
      return;

    const win = window as any;
    let targetRootHandle: any = null;
    if (typeof win.showDirectoryPicker === 'function') {
      try {
        targetRootHandle = await win.showDirectoryPicker({ mode: 'readwrite' });
      } catch (err: any) {
        if (err?.name === 'AbortError') return;
      }
    }

    if (!targetRootHandle) {
      await persistCurrentBuildRecord();
      onStartSimulatedTask(
        tf('builds.conv.exportSimTitle', {
          name: customBuildName,
          roms: conversionPlanRows.length,
          pm: queuedPortMasterGames.length,
        }),
        [t('builds.conv.exportSimStep1'), t('builds.conv.exportSimStep2')]
      );
      return;
    }

    const startedAt = Date.now();
    let realConvertedCount = 0;
    let realCopiedCount = 0;
    let skippedExistingCount = 0;
    let skippedChdCount = 0;
    let errorCount = 0;
    let doneCount = 0;
    let noFileCount = 0;
    let mediaFilesCount = 0;
    let mediaMissingCount = 0;
    // Сохранения со сборкой (шаг 7 плана 0.6.0). / Saves with the build (0.6.0 plan, step 7).
    const savesSync = { toDevice: 0, fromDevice: 0, conflicts: 0 };
    const totalItems = conversionPlanRows.length;
    const exportedManifestItems: any[] = new Array(totalItems);

    // Папки, медиа и gamelist.xml / Folders, media and gamelist.xml
    const dirCache = new DirCache(targetRootHandle);
    const mediaIndex = new MediaSourceIndex();
    const mediaLayout = profileMediaLayout(selectedProfile.mediaFolders);
    const wantMedia = opts.includeMedia && mediaLayout !== 'none';
    const wantGamelist = opts.writeGamelist && selectedProfile.gamelistFormat === 'emulationstation_xml';
    const gamelistByFolder = new Map<string, BuildGamelistGame[]>();
    const preparedFolders = new Set<string>();
    const nativeMode = isNativeFsEnabled();
    const concurrency = defaultCopyConcurrency(nativeMode);
    const copyOpts = { skipSame: opts.skipExisting, diskCopy: nativeCopyFile };
    // Конвертации по одной, копирование параллельно. / Conversions one at a time, copies in parallel.
    const conversionLimit = createLimiter(1);

    // Прогресс не чаще 3 раз в секунду: раньше окно перерисовывалось на каждом куске файла.
    // Progress at most 3 times a second: the window used to re-render on every file chunk.
    const overallPct = () => Math.max(3, Math.round((doneCount / Math.max(1, totalItems)) * 95));
    const progressText = throttle((text: string) => {
      onUpdateLiveProgress?.(true, overallPct(), text);
    }, 300);
    const progressLog = throttle(() => {
      onAddLog?.(
        tf('bx.log.progress', {
          done: doneCount,
          total: totalItems,
          copied: realCopiedCount,
          skipped: skippedExistingCount,
          converted: realConvertedCount,
        })
      );
    }, 10000);

    onUpdateLiveProgress?.(
      true,
      3,
      tf('builds.conv.exportPrep', { total: totalItems, folder: targetRootHandle.name })
    );
    onAddLog?.(
      tf('builds.conv.exportStartLog', {
        name: customBuildName,
        total: totalItems,
        folder: targetRootHandle.name,
      })
    );
    onAddLog?.(
      tf('bx.log.mode', {
        n: concurrency,
        how: t(nativeMode ? 'bx.log.modeNative' : 'bx.log.modeBrowser'),
      })
    );

    // Медиа рома: найти рядом с исходником и положить в папки устройства.
    // A ROM's media: find it next to the source and put it into the device's folders.
    const copyGameMedia = async (
      item: (typeof conversionPlanRows)[number],
      destStem: string
    ): Promise<Partial<Record<BuildMediaKind, string>>> => {
      const rel: Partial<Record<BuildMediaKind, string>> = {};
      const g = item.game;
      const srcDir = g.parentHandle || g.discs?.[0]?.parentHandle;
      if (!srcDir) {
        mediaMissingCount++;
        return rel;
      }
      const names = [g.m3uFileName, g.multiDiscFolderName, g.discs?.[0]?.oldFile, g.isMultiDisc ? '' : g.oldFile].filter(
        (x): x is string => Boolean(x)
      );
      const primary = item.isMultiDisc ? names[0] || g.title : g.oldFile;
      const found = await mediaIndex.find(srcDir, primary, [...names, g.title]);
      const targets = planMediaTargets(mediaLayout, selectedProfile.mediaFolders, opts.mediaKinds, found, destStem);
      if (targets.length === 0) {
        mediaMissingCount++;
        return rel;
      }
      for (const tg of targets) {
        try {
          const dir = await dirCache.get(`${item.folderPath}/${tg.folder}`);
          const file = await tg.source.getFile();
          const outcome = await copyFileToDir(file, dir, tg.name, copyOpts);
          if (outcome === 'copied') mediaFilesCount++;
          rel[tg.kind] = `${tg.folder}/${tg.name}`;
        } catch {}
      }
      return rel;
    };

    const processItem = async (item: (typeof conversionPlanRows)[number], idx: number) => {
      try {
        const currDir = await dirCache.get(item.folderPath);
        if (!preparedFolders.has(item.folderPath)) {
          preparedFolders.add(item.folderPath);
          for (const mDir of selectedProfile.mediaFolders) {
            try {
              await dirCache.get(`${item.folderPath}/${mDir}`);
            } catch {}
          }
        }
        progressText(
          tf('bx.prog', { done: doneCount, total: totalItems, title: item.game.title })
        );
        const exportSinglePayloadToDir = async (
          destDirHandle: any,
          destFolderRelPath: string,
          stemWithRegion: string,
          srcFile: File,
          companionTracks: File[],
          cueText: string | undefined,
          unitSourceExt: string
        ): Promise<{ writtenRelPath: string; entryFileName: string; resultStatus: string }> => {
          const writeBytesToDest = async (fileName: string, data: BufferSource | string) => {
            const fh = await destDirHandle.getFileHandle(fileName, { create: true });
            const w = await fh.createWritable();
            await w.write(data);
            await w.close();
          };

          // Копия без конвертации. Строку в журнал пишем только для особых случаев (без chdman и т.п.):
          // 12 000 строк «скопировано» перерисовывали окно на каждой игре.
          // Copy without conversion. Only special cases (no chdman etc.) go to the log: 12 000
          // "copied" lines re-rendered the window for every game.
          const noteCopy = (notePrefix: string, msg: string) => {
            if (!notePrefix.startsWith('✔')) onAddLog?.(msg);
          };
          const countCopy = (outcomes: CopyOutcome[]) => {
            if (outcomes.some((o) => o === 'copied')) realCopiedCount++;
            else skippedExistingCount++;
          };
          const copyIntactUnit = async (notePrefix: string): Promise<{ rel: string; entry: string }> => {
            const srcLow = srcFile.name.toLowerCase();
            const isCueLikeDescriptor =
              srcLow.endsWith('.cue') || srcLow.endsWith('.ccd') || srcLow.endsWith('.mds') || srcLow.endsWith('.gdi');
            const hasCompanions = isCueLikeDescriptor && companionTracks.length > 0;

            if (hasCompanions) {
              if (srcLow.endsWith('.cue') && !companionTracks.some((f) => /\.(img|ccd|sub)$/i.test(f.name))) {
                const plan = buildCleanCueAndTrackPlan(stemWithRegion, companionTracks, cueText);
                const outcomes: CopyOutcome[] = [];
                for (let ti = 0; ti < plan.tracks.length; ti++) {
                  const tr = plan.tracks[ti];
                  outcomes.push(
                    await copyFileToDir(tr.file, destDirHandle, tr.outputName, {
                      ...copyOpts,
                      onProgress: (p) =>
                        progressText(
                          tf('builds.conv.copyingTrack', {
                            i: idx + 1,
                            total: totalItems,
                            ti: ti + 1,
                            tn: plan.tracks.length,
                            file: tr.outputName,
                            pct: p,
                          })
                        ),
                    })
                  );
                }
                const cleanCueName = `${stemWithRegion}.cue`;
                await writeBytesToDest(cleanCueName, plan.cueContent);
                countCopy(outcomes);
                noteCopy(notePrefix, `${notePrefix}: ${cleanCueName} (+${plan.tracks.length})`);
                return { rel: `${destFolderRelPath}/${cleanCueName}`, entry: cleanCueName };
              } else {
                const outcomes: CopyOutcome[] = [await copyFileToDir(srcFile, destDirHandle, srcFile.name, copyOpts)];
                for (let ti = 0; ti < companionTracks.length; ti++) {
                  const cf = companionTracks[ti];
                  outcomes.push(
                    await copyFileToDir(cf, destDirHandle, cf.name, {
                      ...copyOpts,
                      onProgress: (p) =>
                        progressText(
                          tf('builds.conv.copyingBundle', {
                            i: idx + 1,
                            total: totalItems,
                            file: cf.name,
                            pct: p,
                          })
                        ),
                    })
                  );
                }
                countCopy(outcomes);
                noteCopy(notePrefix, `${notePrefix}: ${srcFile.name} (+${companionTracks.length})`);
                return { rel: `${destFolderRelPath}/${srcFile.name}`, entry: srcFile.name };
              }
            } else {
              const origExtDot = srcFile.name.lastIndexOf('.');
              const origExt = origExtDot !== -1 ? srcFile.name.slice(origExtDot).toLowerCase() : unitSourceExt;
              const safeOutName = `${stemWithRegion}${origExt}`;
              const outcome = await copyFileToDir(srcFile, destDirHandle, safeOutName, {
                ...copyOpts,
                onProgress: (p) =>
                  progressText(
                    tf('builds.conv.copyingOrig', {
                      i: idx + 1,
                      total: totalItems,
                      file: safeOutName,
                      pct: p,
                    })
                  ),
              });
              countCopy([outcome]);
              noteCopy(notePrefix, `${notePrefix}: ${safeOutName}`);
              return { rel: `${destFolderRelPath}/${safeOutName}`, entry: safeOutName };
            }
          };

          const srcLow = srcFile.name.toLowerCase();
          const isDescriptor =
            srcLow.endsWith('.cue') ||
            srcLow.endsWith('.ccd') ||
            srcLow.endsWith('.mds') ||
            srcLow.endsWith('.gdi');
          const singleOutName =
            item.targetExt === '.bin+.cue'
              ? `${stemWithRegion}.cue`
              : `${stemWithRegion}${item.targetExt}`;

          // 1. REAL .bin+.cue / .img+.cue / .ccd+.img / .mdf+.mds / .gdi -> .iso
          if (item.rule.actionType === 'optical_bin_cue_to_iso') {
            const primaryBinFile = isDescriptor ? companionTracks[0] : srcFile;
            if (!primaryBinFile || primaryBinFile.size < 32768) {
              throw new Error(
                isDescriptor
                  ? tf('builds.conv.errMissingDataBin', { file: srcFile.name, size: srcFile.size })
                  : tf('builds.conv.errFileTooSmall', { file: srcFile.name, size: srcFile.size })
              );
            }
            const isoName = `${stemWithRegion}.iso`;
            const outFh = await destDirHandle.getFileHandle(isoName, { create: true });
            const outW = await outFh.createWritable();
            const { totalOutputBytes, layout } = await streamConvertBin2352ToIsoWritable(
              primaryBinFile,
              outW,
              cueText,
              (p) => {
                progressText(
                  tf('builds.conv.sectorToIsoProg', {
                    i: idx + 1,
                    total: totalItems,
                    file: layoutLabelPlaceholder(primaryBinFile.name),
                    pct: p,
                  })
                );
              }
            );
            await outW.close();
            realConvertedCount++;
            const outMB = (totalOutputBytes / (1024 * 1024)).toFixed(1);
            const extraAudioWarning =
              companionTracks.length > 1
                ? tf('builds.conv.sectorToIsoAudioNote', { count: companionTracks.length })
                : '';
            onAddLog?.(
              tf('builds.conv.sectorToIsoDone', {
                src: primaryBinFile.name,
                mode: layout.modeLabel,
                dst: isoName,
                mb: outMB,
                note: extraAudioWarning,
              })
            );
            return {
              writtenRelPath: `${destFolderRelPath}/${isoName}`,
              entryFileName: isoName,
              resultStatus: `converted_iso_${layout.modeLabel}`,
            };
          }

          // 2. REAL .iso -> .bin+.cue
          if (item.rule.actionType === 'optical_iso_to_bin_cue') {
            const binName = `${stemWithRegion}.bin`;
            const cueName = `${stemWithRegion}.cue`;
            const outFh = await destDirHandle.getFileHandle(binName, { create: true });
            const outW = await outFh.createWritable();
            const { totalOutputBytes, cueContent } = await streamConvertIso2048ToBinCueWritable(
              srcFile,
              outW,
              binName,
              (p) => {
                progressText(
                  tf('builds.conv.isoToBinProg', {
                    i: idx + 1,
                    total: totalItems,
                    pct: p,
                  })
                );
              }
            );
            await outW.close();
            await writeBytesToDest(cueName, cueContent);
            realConvertedCount++;
            onAddLog?.(
              tf('builds.conv.isoToBinDone', {
                src: srcFile.name,
                bin: binName,
                mb: (totalOutputBytes / (1024 * 1024)).toFixed(1),
                cue: cueName,
              })
            );
            return {
              writtenRelPath: `${destFolderRelPath}/${cueName}`,
              entryFileName: cueName,
              resultStatus: 'converted_bin_cue',
            };
          }

          // 2b. REAL .img+.cue / .ccd+.img / .mdf+.mds / .iso+.cue -> clean .bin+.cue
          if (item.rule.actionType === 'optical_raw_to_bin_cue') {
            const payloadSrc = isDescriptor ? companionTracks[0] : srcFile;
            if (!payloadSrc || payloadSrc.size < 32768) {
              throw new Error(
                tf('builds.conv.errMissingRawImg', { file: srcFile.name })
              );
            }
            const binName = `${stemWithRegion}.bin`;
            const cueName = `${stemWithRegion}.cue`;
            const outFh = await destDirHandle.getFileHandle(binName, { create: true });
            const outW = await outFh.createWritable();
            const { totalOutputBytes, cueContent, layout } = await streamConvertRawDiscToBinCueWritable(
              payloadSrc,
              outW,
              binName,
              cueText,
              (p) => {
                progressText(
                  tf('builds.conv.normToBinProg', {
                    i: idx + 1,
                    total: totalItems,
                    file: payloadSrc.name,
                    pct: p,
                  })
                );
              }
            );
            await outW.close();
            await writeBytesToDest(cueName, cueContent);
            realConvertedCount++;
            onAddLog?.(
              tf('builds.conv.normToBinDone', {
                src: payloadSrc.name,
                mode: layout.modeLabel,
                bin: binName,
                mb: (totalOutputBytes / (1024 * 1024)).toFixed(1),
                cue: cueName,
              })
            );
            return {
              writtenRelPath: `${destFolderRelPath}/${cueName}`,
              entryFileName: cueName,
              resultStatus: `normalized_bin_cue_${layout.modeLabel}`,
            };
          }

          // 3. CHD conversions (REAL chdman.exe only)
          if (item.rule.requiresChdman) {
            if (!chdmanStatus.available) {
              skippedChdCount++;
              const copied = await copyIntactUnit(`[no chdman] ${stemWithRegion}`);
              return {
                writtenRelPath: copied.rel,
                entryFileName: copied.entry,
                resultStatus: 'skipped_chdman_missing_copied_original',
              };
            }
            const form = new FormData();
            form.append('targetExt', item.targetExt);
            form.append('baseName', stemWithRegion);
            form.append('entryFile', srcFile, srcFile.name);
            for (const cf of companionTracks) {
              form.append('companionFiles', cf, cf.name);
            }
            progressText(
              tf('builds.conv.chdmanRunning', {
                i: idx + 1,
                total: totalItems,
                name: stemWithRegion,
                src: unitSourceExt,
                dst: item.targetExt,
              })
            );
            const resp = await fetch('/api/native/converter/chd', {
              method: 'POST',
              body: form,
            });
            if (!resp.ok) {
              const errTxt = await resp.text();
              throw new Error(`chdman error: ${errTxt}`);
            }
            const outMode = resp.headers.get('X-Output-Mode');
            const blobBuf = await resp.arrayBuffer();
            let finalEntry = singleOutName;
            if (outMode === 'zip-store') {
              const entries = extractStoredZipEntries(new Uint8Array(blobBuf));
              for (const ent of entries) {
                await writeBytesToDest(ent.name, ent.data as unknown as BufferSource);
              }
              finalEntry = `${stemWithRegion}.cue`;
            } else {
              await writeBytesToDest(singleOutName, blobBuf);
            }
            realConvertedCount++;
            onAddLog?.(
              tf('builds.conv.chdmanDone', {
                name: stemWithRegion,
                src: unitSourceExt,
                dst: item.targetExt,
                mb: (blobBuf.byteLength / (1024 * 1024)).toFixed(1),
              })
            );
            return {
              writtenRelPath: `${destFolderRelPath}/${finalEntry}`,
              entryFileName: finalEntry,
              resultStatus: 'converted_chdman',
            };
          }

          // 4. External PBP / CSO (no fake rename!)
          if (item.rule.conversionKind === 'external_pbp_cso') {
            skippedChdCount++;
            const copied = await copyIntactUnit(
              `[${item.rule.toolEngine}] ${stemWithRegion}`
            );
            return {
              writtenRelPath: copied.rel,
              entryFileName: copied.entry,
              resultStatus: 'skipped_external_tool_copied_original',
            };
          }

          // 5. Same-format copy
          if (item.rule.conversionKind === 'copy') {
            const copied = await copyIntactUnit(`✔ ${stemWithRegion}`);
            return {
              writtenRelPath: copied.rel,
              entryFileName: copied.entry,
              resultStatus: 'copied_intact',
            };
          }

          // 6. Cartridge binary header fixes
          const srcBuf = await srcFile.arrayBuffer();
          const convertedBuf = convertCartridgeBinaryBuffer(srcBuf, unitSourceExt, item.targetExt);
          await writeBytesToDest(singleOutName, convertedBuf);
          realConvertedCount++;
          onAddLog?.(
            tf('builds.conv.cartDone', {
              src: srcFile.name,
              srcExt: unitSourceExt,
              dst: singleOutName,
              dstExt: item.targetExt,
            })
          );
          return {
            writtenRelPath: `${destFolderRelPath}/${singleOutName}`,
            entryFileName: singleOutName,
            resultStatus: 'converted_cartridge_binary',
          };
        };

        let writtenRelativePath =
          item.isMultiDisc && item.m3uFileName
            ? `${item.folderPath}/${item.baseWithRegion}/${item.m3uFileName}`
            : `${item.folderPath}/${item.outputFileName}`;
        let actualResultStatus = 'manifest_only';
        let romWritten = false;
        const isConversion = item.rule.conversionKind !== 'copy';

        if (item.isMultiDisc && item.game.discs && item.game.discs.length > 1) {
          // Multi-disc game: dedicated subfolder + convert/copy every disc + write .m3u playlist!
          const subRelPath = `${item.folderPath}/${item.baseWithRegion}`;
          const gameSubDir = await dirCache.get(subRelPath);
          const m3uEntries: string[] = [];

          for (let dIdx = 0; dIdx < item.game.discs.length; dIdx++) {
            const disc = item.game.discs[dIdx];
            const discNum = disc.discNumber || dIdx + 1;
            const discStem = `${item.baseWithRegion} (Disc ${discNum})`;

            const discFile = disc.fileObj;
            if (discFile) {
              try {
                const runDisc = () =>
                  exportSinglePayloadToDir(
                    gameSubDir,
                    subRelPath,
                    discStem,
                    discFile,
                    disc.companionFiles || [],
                    disc.cueText,
                    disc.sourceExt || item.sourceExt
                  );
                const res = isConversion ? await conversionLimit(runDisc) : await runDisc();
                m3uEntries.push(res.entryFileName);
              } catch (discErr: any) {
                errorCount++;
                onAddLog?.(
                  tf('builds.conv.discErrLog', {
                    disc: discNum,
                    title: item.game.title,
                    err: String(discErr?.message || discErr),
                  })
                );
              }
            } else {
              const fallbackExt =
                item.targetExt === '.bin+.cue' ? '.cue' : item.targetExt || disc.sourceExt || '.chd';
              const discFileName = `${discStem}${fallbackExt}`;
              if (item.targetExt === '.bin+.cue') {
                const cueFh = await gameSubDir.getFileHandle(discFileName, { create: true });
                const cw = await cueFh.createWritable();
                await cw.write(
                  `FILE "${discStem}.bin" BINARY\r\n  TRACK 01 MODE2/2352\r\n    INDEX 01 00:00:00\r\n`
                );
                await cw.close();
              }
              m3uEntries.push(discFileName);
            }
          }

          const m3uName = item.m3uFileName || `${item.baseWithRegion}.m3u`;
          if (m3uEntries.length > 0) {
            const m3uFh = await gameSubDir.getFileHandle(m3uName, { create: true });
            const mw = await m3uFh.createWritable();
            await mw.write(generateM3uPlaylistText(m3uEntries));
            await mw.close();
            writtenRelativePath = `${subRelPath}/${m3uName}`;
            actualResultStatus = `multi_disc_${m3uEntries.length}_with_m3u`;
            romWritten = item.game.discs.some((d) => Boolean(d.fileObj));
            onAddLog?.(
              tf('builds.conv.multiDiscDone', {
                title: item.game.title,
                count: m3uEntries.length,
                path: `${subRelPath}/${m3uName}`,
              })
            );
          }
        } else if (item.game.fileObj) {
          try {
            const fileObj = item.game.fileObj;
            const runRom = () =>
              exportSinglePayloadToDir(
                currDir,
                item.folderPath,
                item.baseWithRegion,
                fileObj,
                item.game.companionFiles || [],
                item.game.cueText,
                item.sourceExt
              );
            const res = isConversion ? await conversionLimit(runRom) : await runRom();
            writtenRelativePath = res.writtenRelPath;
            actualResultStatus = res.resultStatus;
            romWritten = true;
            if (opts.syncSaves && item.game.parentHandle) {
              try {
                const sv = await syncRomSavesWithDevice(
                  item.game.parentHandle,
                  romStem(fileObj.name),
                  currDir,
                  romStem(res.entryFileName)
                );
                savesSync.toDevice += sv.toDevice;
                savesSync.fromDevice += sv.fromDevice;
                savesSync.conflicts += sv.conflicts;
              } catch {}
            }
          } catch (itemErr: any) {
            errorCount++;
            actualResultStatus = `error: ${String(itemErr?.message || itemErr)}`;
            onAddLog?.(
              tf('builds.conv.itemErrLog', {
                title: item.game.title,
                err: String(itemErr?.message || itemErr),
              })
            );
          }
        } else {
          // Built-in catalog reference item without local ROM file loaded from disk
          if (!item.game.id.startsWith('b_')) noFileCount++;
          if (item.cueFileName) {
            const cueFh = await currDir.getFileHandle(item.cueFileName, { create: true });
            const cw = await cueFh.createWritable();
            await cw.write(
              `FILE "${item.baseWithRegion}.bin" BINARY\r\n  TRACK 01 MODE2/2352\r\n    INDEX 01 00:00:00\r\n`
            );
            await cw.close();
          }
        }

        // Медиа и запись для gamelist.xml / Media and the gamelist.xml entry
        if (romWritten && (wantMedia || wantGamelist)) {
          const media = wantMedia ? await copyGameMedia(item, item.baseWithRegion) : {};
          if (wantGamelist) {
            const g = item.game;
            const srcDir = g.parentHandle || g.discs?.[0]?.parentHandle;
            const srcEntry = await mediaIndex.gamelistEntry(
              srcDir,
              item.isMultiDisc ? g.m3uFileName || g.discs?.[0]?.oldFile || '' : g.oldFile
            );
            const info: Record<string, string> = {};
            for (const tag of GAMELIST_INFO_TAGS) {
              if (srcEntry?.fields[tag]) info[tag] = srcEntry.fields[tag];
            }
            // Ручные правки редактора важнее. / Manual editor edits win.
            if (g.desc) info.desc = escapeXml(g.desc);
            if (g.developer) info.developer = escapeXml(g.developer);
            if (g.publisher) info.publisher = escapeXml(g.publisher);
            if (g.players) info.players = escapeXml(g.players);
            if (g.rating) info.rating = escapeXml(g.rating);
            const prefix = `${item.folderPath}/`;
            const relInConsole = writtenRelativePath.startsWith(prefix)
              ? writtenRelativePath.slice(prefix.length)
              : writtenRelativePath;
            const list = gamelistByFolder.get(item.folderPath) || [];
            list.push({ path: relInConsole, name: g.title, media, info });
            gamelistByFolder.set(item.folderPath, list);
          }
        }

        exportedManifestItems[idx] = {
          gameId: item.game.id,
          title: item.game.title,
          console: item.game.consoleShort,
          sourceFile: item.game.oldFile || item.game.cleanFile,
          cleanFile: item.game.cleanFile || item.game.oldFile,
          region: item.game.region || 'USA',
          crc32: item.game.crc32 || 'A1B2C3D4',
          sourceFormat: item.sourceExt,
          targetFormat: item.targetExt,
          folderPath: item.folderPath,
          targetPath: writtenRelativePath,
          discCount: item.discCount,
          m3uFileName: item.m3uFileName,
          conversionEngine: item.rule.toolEngine,
          resultStatus: actualResultStatus,
        };
      } catch (err: any) {
        errorCount++;
        onAddLog?.(
          tf('builds.conv.itemErrLog', {
            title: item.game.title,
            err: String(err?.message || err),
          })
        );
      } finally {
        doneCount++;
        progressText(tf('bx.prog', { done: doneCount, total: totalItems, title: item.game.title }));
        progressLog();
      }
    };

    try {
      await runPool(conversionPlanRows, concurrency, processItem);
      progressText.flush();
      progressLog.flush();

      // gamelist.xml по папкам консолей / gamelist.xml per console folder
      for (const [folder, games] of gamelistByFolder) {
        try {
          const dir = await dirCache.get(folder);
          let existing: string | null = null;
          try {
            existing = await (await (await dir.getFileHandle('gamelist.xml')).getFile()).text();
          } catch {}
          const fh = await dir.getFileHandle('gamelist.xml', { create: true });
          const w = await fh.createWritable();
          await w.write(buildGamelistXml(games, existing));
          await w.close();
          onAddLog?.(tf('bx.log.gamelist', { path: `${folder}/gamelist.xml`, count: games.length }));
        } catch (err) {
          onAddLog?.(tf('bx.log.gamelistErr', { path: folder, err: String(err) }));
        }
      }
      if (wantMedia) {
        onAddLog?.(tf('bx.log.media', { files: mediaFilesCount, missing: mediaMissingCount }));
      }
      if (noFileCount > 0) {
        onAddLog?.(tf('bx.log.noFileSummary', { count: noFileCount }));
      }
      if (savesSync.toDevice + savesSync.fromDevice > 0) {
        onAddLog?.(`💾 ${tf('sv.bx.log', savesSync)}`);
      }

      // ----------------------------------------------------------------------
      // PORTMASTER GAMES DEPLOYMENT (Unpack official .zip + copy game sources into exact required subfolder!)
      // ----------------------------------------------------------------------
      let portMasterDeployedCount = 0;
      if (queuedPortMasterGames.length > 0) {
        const { portsRoot, consoleLaunchNote } = resolvePortMasterRootDirForProfile(
          selectedProfile.id
        );
        const portsRootSegs = portsRoot.split('/').filter(Boolean);
        let portsRootHandle = targetRootHandle;
        for (const seg of portsRootSegs) {
          portsRootHandle = await portsRootHandle.getDirectoryHandle(seg, { create: true });
        }

        const writeRelPathUnderHandle = async (
          baseHandle: any,
          relPath: string,
          data: BufferSource | string
        ) => {
          const cleanSegs = relPath.replace(/\\/g, '/').split('/').filter(Boolean);
          if (cleanSegs.length === 0) return;
          let dirH = baseHandle;
          for (let s = 0; s < cleanSegs.length - 1; s++) {
            dirH = await dirH.getDirectoryHandle(cleanSegs[s], { create: true });
          }
          const fh = await dirH.getFileHandle(cleanSegs[cleanSegs.length - 1], { create: true });
          const w = await fh.createWritable();
          await w.write(data);
          await w.close();
        };

        const copyDirHandleRecursively = async (srcDirH: any, dstDirH: any) => {
          for await (const entry of srcDirH.values()) {
            if (entry.kind === 'directory') {
              const subDst = await dstDirH.getDirectoryHandle(entry.name, { create: true });
              await copyDirHandleRecursively(entry, subDst);
            } else if (entry.kind === 'file') {
              const fileObj = await entry.getFile();
              const fh = await dstDirH.getFileHandle(entry.name, { create: true });
              const w = await fh.createWritable();
              await streamCopyFileToWritable(fileObj, w);
              await w.close();
            }
          }
        };

        const pmReadmeLines: string[] = [
          '==================================================================',
          `AegisROM v0.6.0-dev (Beta) — PortMaster (${selectedProfile.shortName})`,
          '==================================================================',
          consoleLaunchNote,
          '',
        ];

        for (let pi = 0; pi < queuedPortMasterGames.length; pi++) {
          const port = queuedPortMasterGames[pi];
          onUpdateLiveProgress?.(
            true,
            92,
            tf('builds.conv.pmDeploying', {
              i: pi + 1,
              total: queuedPortMasterGames.length,
              title: port.title,
              root: portsRoot,
            })
          );

          try {
            const dlResp = await fetch(
              `/api/portmaster/download?url=${encodeURIComponent(port.downloadUrl)}`
            );
            if (!dlResp.ok) throw new Error(`HTTP ${dlResp.status}`);
            const zipBuf = new Uint8Array(await dlResp.arrayBuffer());
            const zipEntries = await extractZipEntriesAsync(zipBuf);

            let extractedFiles = 0;
            for (const ze of zipEntries) {
              if (ze.isDirectory) {
                const segs = ze.name.replace(/\\/g, '/').split('/').filter(Boolean);
                let dH = portsRootHandle;
                for (const s of segs) {
                  dH = await dH.getDirectoryHandle(s, { create: true });
                }
              } else {
                await writeRelPathUnderHandle(
                  portsRootHandle,
                  ze.name,
                  ze.data as unknown as BufferSource
                );
                extractedFiles++;
              }
            }

            // Create exact required data subfolder (e.g. ports/stardewvalley/gamedata) & copy attached user sources!
            const subRel = port.requiredDataTargetPath.replace(/^ports\/?/i, '');
            const subSegs = subRel.split('/').filter(Boolean);
            let dataTargetDirHandle = portsRootHandle;
            for (const s of subSegs) {
              dataTargetDirHandle = await dataTargetDirHandle.getDirectoryHandle(s, { create: true });
            }

            const srcCfg = portMasterSourceConfigs[port.slug];
            let copiedSourceFiles = 0;
            if (srcCfg?.dirHandle) {
              await copyDirHandleRecursively(srcCfg.dirHandle, dataTargetDirHandle);
              copiedSourceFiles = 1;
            } else if (srcCfg?.files && srcCfg.files.length > 0) {
              for (const sf of srcCfg.files) {
                const relWithoutRoot = sf.relPath.includes('/')
                  ? sf.relPath.slice(sf.relPath.indexOf('/') + 1)
                  : sf.relPath;
                const buf = await sf.file.arrayBuffer();
                await writeRelPathUnderHandle(dataTargetDirHandle, relWithoutRoot, buf);
                copiedSourceFiles++;
              }
            }

            portMasterDeployedCount++;
            pmReadmeLines.push(
              `• ${port.title} (${port.id}): ${extractedFiles} files -> ${portsRoot}/` +
                (port.readyToRun
                  ? ' [Ready-to-Run]'
                  : copiedSourceFiles > 0
                  ? ` [Assets copied to ${portsRoot}/${subRel}/]`
                  : ` [Copy assets to ${portsRoot}/${subRel}/]`)
            );
            onAddLog?.(
              tf('builds.conv.pmDeployedLog', {
                title: port.title,
                root: portsRoot,
                files: extractedFiles,
              }) +
                (copiedSourceFiles > 0
                  ? tf('builds.conv.pmDeployedSourcesLog', { path: `${portsRoot}/${subRel}` })
                  : '')
            );
          } catch (pmErr: any) {
            errorCount++;
            onAddLog?.(
              tf('builds.conv.pmDeployErrLog', {
                title: port.title,
                err: String(pmErr?.message || pmErr),
              })
            );
          }
        }

        await writeRelPathUnderHandle(
          portsRootHandle,
          'README_PORTMASTER_INSTALL.txt',
          pmReadmeLines.join('\r\n')
        );
      }

      // Persist build snapshot so user can always return & sync this build with Library!
      const manifestItems = exportedManifestItems.filter(Boolean);
      const savedItems: SavedBuildItem[] = manifestItems.map((m) => ({
        gameId: m.gameId,
        title: m.title,
        consoleShort: m.console,
        cleanFile: m.cleanFile,
        oldFile: m.sourceFile,
        region: m.region,
        crc32: m.crc32,
        sourceExt: m.sourceFormat,
        targetExt: m.targetFormat,
        folderPath: m.folderPath,
        targetPath: m.targetPath,
        discCount: m.discCount,
        m3uFileName: m.m3uFileName,
      }));
      await persistCurrentBuildRecord(targetRootHandle.name, savedItems);

      // BIOS: копируем проверенные файлы для консолей сборки / copy verified BIOS for the build's consoles
      let biosCopiedCount = 0;
      if (copyBiosToBuild && conversionPlanRows.length > 0) {
        try {
          const bios = await copyBiosIntoBuild(
            targetRootHandle,
            selectedProfile.id,
            conversionPlanRows.map((r) => r.game.consoleShort)
          );
          biosCopiedCount = bios.copied;
          if (bios.copied > 0) {
            onAddLog?.(tf('bios.build.copiedLog', { count: bios.copied, dir: bios.dir || '' }));
          } else if (bios.skipped && bios.skipped !== 'noFolder') {
            onAddLog?.(tf('bios.build.skippedLog', { reason: t(`bios.build.${bios.skipped}`) }));
          }
        } catch (err) {
          onAddLog?.(tf('bios.build.skippedLog', { reason: String(err) }));
        }
      }

      // Write build manifest into root of chosen export folder
      const manifestJson = JSON.stringify(
        {
          buildName: customBuildName,
          targetSystem: selectedProfile.name,
          exportedAt: new Date().toISOString(),
          totalGames: totalItems,
          realConvertedCount,
          realCopiedCount,
          portMasterDeployedCount,
          biosCopiedCount,
          skippedChdCount,
          skippedExistingCount,
          errorCount,
          items: manifestItems,
        },
        null,
        2
      );
      const mfHandle = await targetRootHandle.getFileHandle('aegisrom_build_manifest.json', {
        create: true,
      });
      const mw = await mfHandle.createWritable();
      await mw.write(manifestJson);
      await mw.close();

      const summaryMsg =
        tf('builds.conv.exportSummary', {
          name: customBuildName,
          conv: realConvertedCount,
          copy: realCopiedCount,
        }) +
        (portMasterDeployedCount > 0
          ? tf('builds.conv.exportSummaryPm', { count: portMasterDeployedCount })
          : '') +
        (skippedChdCount > 0
          ? tf('builds.conv.exportSummarySkipped', { count: skippedChdCount })
          : '') +
        (errorCount > 0 ? tf('builds.conv.exportSummaryErrs', { count: errorCount }) : '') +
        t('builds.conv.exportSummarySaved');
      onUpdateLiveProgress?.(false, 100, summaryMsg);
      onAddLog?.(summaryMsg);
      onAddLog?.(tf('bx.log.time', { time: formatDuration(Date.now() - startedAt) }));
    } catch (err) {
      const errMsg = tf('builds.conv.exportErrLog', { err: String(err) });
      onUpdateLiveProgress?.(false, 0, errMsg);
      onAddLog?.(errMsg);
    }
  };

  function layoutLabelPlaceholder(name: string): string {
    return name.length > 26 ? name.slice(0, 23) + '...' : name;
  }

  // Generate & download standalone Windows .CMD converter + exporter script (multi-track .cue/.bin safe, ZERO fake renames)
  const handleDownloadConverterScript = () => {
    if (conversionPlanRows.length === 0) return;

    const lines: string[] = [
      '@echo off',
      'chcp 65001 >nul',
      'echo ============================================================================',
      'echo  AegisROM v0.6.0-dev (Beta) - Real Build Converter & Folder Hierarchy Export',
      `echo  Build: ${customBuildName} (${conversionPlanRows.length})`,
      `echo  Target: ${selectedProfile.name}`,
      'echo  NOTE: Never performs fake extension renaming!',
      'echo ============================================================================',
      'echo.',
    ];

    for (const item of conversionPlanRows) {
      const winFolder = item.folderPath.replace(/\//g, '\\');
      lines.push(`if not exist "${winFolder}" mkdir "${winFolder}"`);
      for (const mDir of selectedProfile.mediaFolders) {
        lines.push(`if not exist "${winFolder}\\${mDir}" mkdir "${winFolder}\\${mDir}"`);
      }

      if (item.isMultiDisc && item.game.discs && item.game.discs.length > 1) {
        const subDir = `${winFolder}\\${item.baseWithRegion}`;
        const m3uName = item.m3uFileName || `${item.baseWithRegion}.m3u`;
        lines.push(`if not exist "${subDir}" mkdir "${subDir}"`);
        const discEchoes: string[] = [];
        for (let di = 0; di < item.game.discs.length; di++) {
          const d = item.game.discs[di];
          const dNum = d.discNumber || di + 1;
          const dStem = `${item.baseWithRegion} (Disc ${dNum})`;
          const srcDisc = d.oldFile || d.cleanFile;
          if (item.rule.actionType === 'optical_chd_to_iso') {
            lines.push(
              `if exist "chdman.exe" ( chdman.exe extractcd -f -i "${srcDisc}" -o "${subDir}\\${dStem}.cue" -ob "${subDir}\\${dStem}.bin" ) else ( if exist "${srcDisc}" copy /y "${srcDisc}" "${subDir}\\${dStem}.chd" >nul )`
            );
            discEchoes.push(`${dStem}.cue`);
          } else if (item.rule.actionType === 'optical_iso_to_chd') {
            lines.push(
              `if exist "chdman.exe" ( chdman.exe createcd -f -i "${srcDisc}" -o "${subDir}\\${dStem}.chd" ) else ( if exist "${srcDisc}" copy /y "${srcDisc}" "${subDir}\\" >nul )`
            );
            discEchoes.push(`${dStem}.chd`);
          } else {
            const outExt = item.targetExt === '.bin+.cue' ? '.cue' : item.targetExt || d.sourceExt || '.chd';
            lines.push(`if exist "${srcDisc}" copy /y "${srcDisc}" "${subDir}\\${dStem}${outExt}" >nul`);
            discEchoes.push(`${dStem}${outExt}`);
          }
        }
        lines.push(`(`);
        for (const fn of discEchoes) {
          lines.push(`  echo ${fn}`);
        }
        lines.push(`) > "${subDir}\\${m3uName}"`);
        continue;
      }

      const srcFile = item.game.oldFile || item.game.cleanFile;
      const dstPath = `${winFolder}\\${item.outputFileName}`;

      if (item.rule.actionType === 'optical_chd_to_iso') {
        const cueName = `${item.baseWithRegion}.cue`;
        const binName = `${item.baseWithRegion}.bin`;
        lines.push(`echo [CHD -^> BIN+CUE] "${srcFile}"`);
        lines.push(
          `if exist "chdman.exe" ( chdman.exe extractcd -f -i "${srcFile}" -o "${winFolder}\\${cueName}" -ob "${winFolder}\\${binName}" ) else ( echo [SKIP] chdman.exe missing )`
        );
      } else if (item.rule.actionType === 'optical_iso_to_chd') {
        lines.push(`echo [BIN+CUE/ISO -^> CHD v5] "${srcFile}" -^> "${dstPath}"`);
        lines.push(
          `if exist "chdman.exe" ( chdman.exe createcd -f -i "${srcFile}" -o "${dstPath}" ) else ( echo [SKIP] chdman.exe required for .chd! )`
        );
      } else if (item.game.companionFiles && item.game.companionFiles.length > 0 && item.targetExt === '.bin+.cue') {
        lines.push(`echo [SET ${item.sourceExt} (${item.game.companionFiles.length})] "${srcFile}"`);
        lines.push(`if exist "${srcFile}" copy /y "${srcFile}" "${winFolder}\\" >nul`);
        for (const cf of item.game.companionFiles) {
          lines.push(`if exist "${cf.name}" copy /y "${cf.name}" "${winFolder}\\" >nul`);
        }
      } else {
        lines.push(
          `echo [EXPORT ${item.sourceExt} -^> ${item.targetExt}] "${srcFile}" -^> "${dstPath}"`
        );
        lines.push(`if exist "${srcFile}" copy /y "${srcFile}" "${dstPath}" >nul`);
      }
    }

    lines.push('echo.');
    lines.push(`echo DONE! "${customBuildName}" (${conversionPlanRows.length})`);
    lines.push('pause');

    const blob = new Blob([lines.join('\r\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `AegisROM_Build_Converter_${selectedProfile.id}.cmd`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);

    onAddLog?.(
      tf('builds.conv.cmdDownloadedLog', {
        file: `AegisROM_Build_Converter_${selectedProfile.id}.cmd`,
        count: conversionPlanRows.length,
      })
    );
  };

  const visiblePresets = useMemo(() => {
    if (presetCategoryFilter === 'all') return THEMATIC_BUILD_PRESETS;
    return THEMATIC_BUILD_PRESETS.filter((p) => p.category === presetCategoryFilter);
  }, [presetCategoryFilter]);

  return (
    <div className="space-y-4">
      {/* ================================================================== */}
      {/* HEADER & 3-STEP WORKFLOW NAVIGATION BAR                            */}
      {/* ================================================================== */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-slate-200 dark:border-slate-800 pb-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            {t('builds.headerTitle')}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {t('builds.headerSubtitle')}
          </p>
        </div>

        {/* 4 Mode Switcher Pills */}
        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
          <button
            onClick={() => setBuildsSubTab('presets')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer transition ${
              buildsSubTab === 'presets'
                ? 'bg-blue-600 text-white shadow-2xs'
                : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-700'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{tf('builds.subtab.presets', { count: THEMATIC_BUILD_PRESETS.length })}</span>
          </button>

          <button
            onClick={() => setBuildsSubTab('custom_filter')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer transition ${
              buildsSubTab === 'custom_filter'
                ? 'bg-blue-600 text-white shadow-2xs'
                : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-700'
            }`}
          >
            <Filter className="w-3.5 h-3.5" />
            <span>{t('builds.subtab.custom')}</span>
          </button>

          <button
            onClick={() => setBuildsSubTab('converter_export')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer transition ${
              buildsSubTab === 'converter_export'
                ? 'bg-emerald-600 text-white shadow-2xs'
                : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-700'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>
              {tf('builds.subtab.converter', {
                count: `${queuedGames.length}${queuedPortMasterGames.length > 0 ? ` + ${queuedPortMasterGames.length} PM` : ''}`,
              })}
            </span>
          </button>

          <button
            onClick={() => setBuildsSubTab('saved_builds')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer transition ${
              buildsSubTab === 'saved_builds'
                ? 'bg-indigo-600 text-white shadow-2xs'
                : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-700'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>{tf('builds.subtab.saved', { count: savedBuilds.length })}</span>
          </button>
        </div>
      </div>

      {/* ================================================================== */}
      {/* FLASH DRIVE CAPACITY FILTER & CALCULATOR (16/32/64/128/256 GB)      */}
      {/* ================================================================== */}
      <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 rounded-xl p-3 space-y-2 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 font-semibold text-slate-800 dark:text-slate-100">
            <HardDrive className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
            <span>{t('builds.flash.title')}</span>
          </div>

          <div className="flex flex-wrap items-center gap-1">
            {([0, 16, 32, 64, 128, 256] as FlashDriveCapacityTier[]).map((tier) => {
              const isSelected = flashCapacityTier === tier;
              return (
                <button
                  key={tier}
                  type="button"
                  onClick={() => handleSelectFlashTier(tier)}
                  className={`px-2.5 py-1 rounded-lg font-mono font-bold text-xs cursor-pointer transition ${
                    isSelected
                      ? 'bg-blue-600 text-white shadow-2xs'
                      : 'bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-blue-500'
                  }`}
                >
                  {tier === 0 ? t('builds.flash.unlimitedBtn') : `${tier} ${t('builds.flash.gbSuffix')}`}
                </button>
              );
            })}
          </div>
        </div>

        {flashCapacityTier > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1.5 border-t border-slate-200/80 dark:border-slate-700/70 text-[11px]">
            <div className="flex flex-wrap items-center gap-3 text-slate-600 dark:text-slate-300 font-mono">
              <span>
                {t('builds.flash.nominal')} <strong>{flashCapacityTier} {t('builds.flash.gbSuffix')}</strong>
              </span>
              <span>·</span>
              <span>
                {t('builds.flash.realFs')}{' '}
                <strong>{activeFlashBudget.realFormattedGB} {t('builds.flash.gbSuffix')}</strong>
              </span>
              <span>·</span>
              <label className="inline-flex items-center gap-1.5">
                <span>{t('builds.flash.usedInput')}</span>
                <input
                  type="number"
                  min={0}
                  max={Math.max(1, activeFlashBudget.realFormattedGB - 1)}
                  step={0.5}
                  value={customUsedSpaceGB}
                  onChange={(e) => setCustomUsedSpaceGB(Math.max(0, parseFloat(e.target.value) || 0))}
                  className="w-16 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-1.5 py-0.5 text-center font-bold text-rose-600 dark:text-rose-400"
                />
              </label>
            </div>

            <div className="font-mono font-semibold text-emerald-700 dark:text-emerald-400">
              {tf('builds.flash.available', {
                gb: activeFlashBudget.netAvailableGB,
                mb: activeFlashBudget.netAvailableMB,
              })}
            </div>
          </div>
        )}
      </div>

      {/* ================================================================== */}
      {/* PERSISTENT STAGING QUEUE BANNER                                    */}
      {/* ================================================================== */}
      <div className="bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/70 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2.5 text-xs">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="px-2.5 py-1 rounded-lg bg-blue-600 text-white font-mono font-semibold shrink-0">
            {tf('builds.staging.queueBadge', { count: queuedGames.length })}
          </span>
          <div className="min-w-0">
            <div className="font-bold text-slate-900 dark:text-slate-100 truncate">
              {tf('builds.staging.sizeInfo', {
                name: customBuildName,
                gb: (totalSourceMB / 1024).toFixed(2),
                mb: totalSourceMB,
              })}
              {flashCapacityTier > 0 && (
                <span className="ml-2 text-emerald-700 dark:text-emerald-400 font-mono">
                  {tf('builds.staging.flashLimitInfo', {
                    tier: flashCapacityTier,
                    avail: activeFlashBudget.netAvailableGB,
                  })}
                </span>
              )}
            </div>
            <div className="text-[11px] text-slate-600 dark:text-slate-400 truncate">
              {t('builds.staging.multiPassHint')}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={handleSaveBuildSnapshotClick}
            disabled={queuedGames.length === 0 && queuedPortMasterGames.length === 0}
            title={t('builds.staging.saveTip')}
            className="bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 px-2.5 py-1.5 rounded-lg font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{t('builds.staging.saveBtn')}</span>
          </button>
          {queuedGames.length > 0 && (
            <button
              onClick={() => {
                setQueuedGameIds([]);
                onAddLog?.(t('builds.staging.clearedLog'));
              }}
              className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 hover:bg-rose-50 text-rose-600 dark:text-rose-400 border border-slate-200 dark:border-slate-700 font-bold cursor-pointer"
            >
              {t('builds.staging.clearBtn')}
            </button>
          )}
          <button
            onClick={() => setBuildsSubTab('converter_export')}
            className="bg-accent hover:bg-accent-hover text-white px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 cursor-pointer"
          >
            <span>{t('builds.staging.goConvertBtn')}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ================================================================== */}
      {/* SUB-TAB 1: 13 READY-MADE THEMATIC PRESETS                          */}
      {/* ================================================================== */}
      {buildsSubTab === 'presets' && (
        <div className="space-y-3.5">
          {/* Category Filter Bar */}
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { id: 'all', label: tf('builds.cat.all', { count: THEMATIC_BUILD_PRESETS.length }), icon: Layers },
              { id: 'age', label: t('builds.cat.age'), icon: ShieldAlert },
              {
                id: 'mood_audience',
                label: t('builds.cat.mood'),
                icon: Heart,
              },
              { id: 'genre', label: t('builds.cat.genre'), icon: Flame },
              { id: 'bitness', label: t('builds.cat.bitness'), icon: Gamepad2 },
              { id: 'status', label: t('builds.cat.status'), icon: Wrench },
            ].map((cat) => {
              const Icon = cat.icon;
              const active = presetCategoryFilter === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => setPresetCategoryFilter(cat.id as any)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer transition ${
                    active
                      ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{cat.label}</span>
                </button>
              );
            })}
          </div>

          {/* Presets Grid */}
          <div className="grid grid-cols-1 gap-3">
            {visiblePresets.map((preset) => {
              const rawMatchedGames = allEnrichedGames.filter(preset.filterFn);
              const effectivePresetTier =
                presetCapacityOverrides[preset.id] ?? flashCapacityTier;
              const presetBudget =
                effectivePresetTier === flashCapacityTier
                  ? activeFlashBudget
                  : calculateFlashDriveNetBudget(effectivePresetTier);
              const matchedGames = fitGamesToFlashCapacity(
                rawMatchedGames,
                presetBudget.netAvailableMB
              );
              const totalMB = Math.round(
                matchedGames.reduce((acc, g) => acc + g.sizeMB, 0)
              );
              const sizeStr =
                totalMB >= 1024
                  ? `${(totalMB / 1024).toFixed(2)} ${t('builds.flash.gbSuffix')}`
                  : `${totalMB} ${t('builds.flash.mbSuffix')}`;

              return (
                <div
                  key={preset.id}
                  className="border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 bg-slate-50/50 dark:bg-slate-800/40 hover:border-blue-400 dark:hover:border-blue-600 transition flex flex-col justify-between gap-3"
                >
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2 py-0.5 rounded-md text-[11px] font-semibold ${preset.badgeColor}`}
                        >
                          {t(`preset.${preset.id}.badge`, preset.badgeText)}
                        </span>
                        <span className="text-[11px] font-semibold text-slate-400">
                          {localizePresetCategory(preset.categoryLabel, t)}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {/* Per-Preset Flash Drive Capacity Filter */}
                        <div className="flex items-center gap-1 text-[11px]">
                          <span className="text-slate-500 font-semibold">{t('builds.preset.flashLabel')}</span>
                          <select
                            value={effectivePresetTier}
                            onChange={(e) =>
                              setPresetCapacityOverrides((prev) => ({
                                ...prev,
                                [preset.id]: Number(e.target.value) as FlashDriveCapacityTier,
                              }))
                            }
                            className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-1.5 py-0.5 font-mono font-bold text-[11px] text-blue-700 dark:text-blue-300"
                          >
                            <option value={0}>{t('builds.flash.unlimitedBtn')}</option>
                            <option value={16}>{tf('builds.flash.upToGb', { tier: 16, max: '11.6' })}</option>
                            <option value={32}>{tf('builds.flash.upToGb', { tier: 32, max: '25.2' })}</option>
                            <option value={64}>{tf('builds.flash.upToGb', { tier: 64, max: '53.6' })}</option>
                            <option value={128}>{tf('builds.flash.upToGb', { tier: 128, max: '110.7' })}</option>
                            <option value={256}>{tf('builds.flash.upToGb', { tier: 256, max: '226.4' })}</option>
                          </select>
                        </div>

                        <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                          {t('builds.preset.gamesCountLabel')} <strong>{matchedGames.length}</strong> · {t('builds.preset.sizeLabel')}{' '}
                          <strong>{sizeStr}</strong>
                        </span>
                      </div>
                    </div>

                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {t(`preset.${preset.id}.title`, preset.title)}
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                      {t(`preset.${preset.id}.sub`, preset.subtitle)}
                    </p>

                    {/* Preview Game Chips (Clicking any chip previews cover + video in right Inspector!) */}
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      {matchedGames.slice(0, 6).map((mg) => (
                        <button
                          key={mg.id}
                          type="button"
                          onClick={() => onSelectGameId(mg.id)}
                          title={t('builds.preset.chipTip')}
                          className={`px-2 py-0.5 rounded text-[11px] font-mono transition cursor-pointer ${
                            selectedGameId === mg.id
                              ? 'bg-blue-600 text-white font-bold'
                              : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-blue-500'
                          }`}
                        >
                          {mg.title} ({mg.consoleShort})
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-slate-200/70 dark:border-slate-800">
                    <button
                      onClick={() => handleApplyPresetToQueue(preset, 'open_in_filter')}
                      className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold cursor-pointer"
                    >
                      {t('builds.preset.openInFilterBtn')}
                    </button>

                    <button
                      onClick={() => handleApplyPresetToQueue(preset, 'append')}
                      className="px-3 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/70 hover:bg-blue-100 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 text-xs font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>{tf('builds.preset.addToQueueBtn', { count: matchedGames.length })}</span>
                    </button>

                    <button
                      onClick={() => handleApplyPresetToQueue(preset, 'replace_and_convert')}
                      className="bg-accent hover:bg-accent-hover text-white px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                    >
                      <span>
                        {effectivePresetTier > 0
                          ? tf('builds.preset.buildUnderBtn', { tier: effectivePresetTier })
                          : t('builds.preset.buildAllBtn')}
                      </span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* SUB-TAB 2: MULTI-PASS CUSTOM BUILDER                               */}
      {/* ================================================================== */}
      {buildsSubTab === 'custom_filter' && (
        <div className="space-y-3.5">
          {/* AUTO-BUILDER BANNER */}
          <div className="bg-amber-50/80 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800/80 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2.5 text-xs">
            <div className="space-y-0.5 min-w-0">
              <div className="font-semibold text-amber-950 dark:text-amber-200 flex items-center gap-1.5">
                <Dices className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                <span>{t('builds.lucky.title')}</span>
              </div>
              <div className="text-[11px] text-amber-800 dark:text-amber-300/90">
                {tf('builds.lucky.desc', {
                  budget:
                    flashCapacityTier > 0
                      ? tf('builds.lucky.budgetDetail', {
                          tier: flashCapacityTier,
                          avail: activeFlashBudget.netAvailableGB,
                          used: activeFlashBudget.usedOrSystemGB,
                        })
                      : t('builds.lucky.default64'),
                })}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => handleLuckyRandomAutoBuild(false)}
                className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 hover:bg-amber-100 border border-amber-400 dark:border-amber-700 text-amber-900 dark:text-amber-200 font-bold text-xs flex items-center gap-1.5 cursor-pointer"
              >
                <Dices className="w-3.5 h-3.5 text-amber-600" />
                <span>{t('builds.lucky.checkOnlyBtn')}</span>
              </button>

              <button
                type="button"
                onClick={() => handleLuckyRandomAutoBuild(true)}
                className="px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold text-xs flex items-center gap-1.5 cursor-pointer shadow-2xs"
              >
                <Dices className="w-3.5 h-3.5" />
                <span>
                  {tf('builds.lucky.buildNowBtn', {
                    tier: flashCapacityTier > 0 ? flashCapacityTier : 64,
                  })}
                </span>
              </button>
            </div>
          </div>

          {/* Multi-Filter Control Box */}
          <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <Filter className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span>{tf('builds.custom.stepTitle', { pass: filterPassCount })}</span>
              </div>
              <button
                onClick={() => {
                  setFilterConsole('ALL');
                  setFilterBitness('ALL');
                  setFilterAge('ALL');
                  setFilterDifficulty('ALL');
                  setFilterGenre('ALL');
                  setFilterRegion('ALL');
                  setFilterSearch('');
                }}
                className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
              >
                {t('builds.custom.resetFilters')}
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-xs">
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                  {tf('builds.custom.consoleLabel', { count: availableConsolesInBuilds.length })}
                </label>
                <select
                  value={filterConsole}
                  onChange={(e) => setFilterConsole(e.target.value)}
                  className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-1.5 font-semibold"
                >
                  <option value="ALL">
                    {tf('builds.custom.allConsoles', { count: allEnrichedGames.length })}
                  </option>
                  {availableConsolesInBuilds.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.name} ({c.code} · {c.count})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                  {t('builds.custom.bitnessLabel')}
                </label>
                <select
                  value={filterBitness}
                  onChange={(e) => setFilterBitness(e.target.value as any)}
                  className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-1.5 font-semibold"
                >
                  <option value="ALL">{t('builds.custom.anyBitness')}</option>
                  <option value="8-bit">{t('builds.custom.bit8Opt')}</option>
                  <option value="16-bit">{t('builds.custom.bit16Opt')}</option>
                  <option value="32/64-bit">{t('builds.custom.bit32Opt')}</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                  {t('builds.custom.ageLabel')}
                </label>
                <select
                  value={filterAge}
                  onChange={(e) => setFilterAge(e.target.value as any)}
                  className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-1.5 font-semibold"
                >
                  <option value="ALL">{t('builds.custom.anyAge')}</option>
                  <option value="6+">{t('builds.custom.age6Opt')}</option>
                  <option value="10+">{t('builds.custom.age10Opt')}</option>
                  <option value="14+">{t('builds.custom.age14Opt')}</option>
                  <option value="18+">{t('builds.custom.age18Opt')}</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                  {t('builds.custom.diffLabel')}
                </label>
                <select
                  value={filterDifficulty}
                  onChange={(e) => setFilterDifficulty(e.target.value as any)}
                  className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-1.5 font-semibold"
                >
                  <option value="ALL">{t('builds.custom.anyDiff')}</option>
                  <option value="easy_relax">{t('builds.custom.diffEasyOpt')}</option>
                  <option value="hardcore">{t('builds.custom.diffHardOpt')}</option>
                  <option value="girls">{t('builds.custom.audienceGirls')}</option>
                  <option value="medium">{t('builds.custom.diffMedOpt')}</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                  {t('builds.custom.genreLabel')}
                </label>
                <select
                  value={filterGenre}
                  onChange={(e) => setFilterGenre(e.target.value)}
                  className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-1.5 font-semibold"
                >
                  <option value="ALL">{t('builds.custom.anyGenre')}</option>
                  <option value="fighting">{t('builds.custom.genreFightOpt')}</option>
                  <option value="racing">{t('builds.custom.genreRaceOpt')}</option>
                  <option value="platformer">{t('builds.custom.genrePlatOpt')}</option>
                  <option value="rpg">{t('builds.custom.genreRpgOpt')}</option>
                  <option value="horror_action">{t('builds.custom.genreHorrorOpt')}</option>
                  <option value="cozy">{t('builds.custom.genreCozyOpt')}</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                  {t('builds.custom.searchLabel')}
                </label>
                <input
                  type="text"
                  value={filterSearch}
                  onChange={(e) => setFilterSearch(e.target.value)}
                  placeholder={t('builds.custom.searchPh')}
                  className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs"
                />
              </div>
            </div>

            {/* Action Bar for Checkboxes -> Add to Export Queue */}
            <div className="pt-2 border-t border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handleSelectAllFilteredCandidates(true)}
                  className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 hover:bg-slate-100 border border-slate-300 dark:border-slate-700 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <CheckSquare className="w-3.5 h-3.5 text-blue-600" />
                  <span>{tf('builds.custom.selectAllFiltered', { count: filteredCandidates.length })}</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectAllFilteredCandidates(false)}
                  className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 hover:bg-slate-100 border border-slate-300 dark:border-slate-700 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Square className="w-3.5 h-3.5 text-slate-400" />
                  <span>{t('builds.custom.unselectAll')}</span>
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleAddCheckedCandidatesToQueue}
                  disabled={checkedCandidatesCount === 0}
                  className="bg-accent hover:bg-accent-hover text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{tf('builds.custom.addCheckedBtn', { count: checkedCandidatesCount })}</span>
                </button>

                <button
                  type="button"
                  onClick={handleAddAllFilteredToQueue}
                  disabled={filteredCandidates.length === 0}
                  className="bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{tf('builds.custom.addAllBtn', { count: filteredCandidates.length })}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Filtered Games Table with Checkboxes */}
          <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                  <th className="py-2 px-3 w-9">{t('builds.custom.col.select')}</th>
                  <th className="py-2 px-3">{t('builds.custom.col.game')}</th>
                  <th className="py-2 px-3">{t('builds.custom.col.consoleBit')}</th>
                  <th className="py-2 px-3">{t('builds.custom.col.ageTags')}</th>
                  <th className="py-2 px-3">{t('builds.custom.col.sourceFmt')}</th>
                  <th className="py-2 px-3 text-right">{t('builds.custom.col.queueStatus')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                {filteredCandidates.map((g) => {
                  const isChecked = !!checkedCandidateIds[g.id];
                  const isInQueue = queuedGameIds.includes(g.id);
                  const isSelected = selectedGameId === g.id;
                  return (
                    <tr
                      key={g.id}
                      onClick={() => onSelectGameId(g.id)}
                      className={`cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-blue-50/80 dark:bg-blue-950/60'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                      }`}
                    >
                      <td
                        className="py-2 px-3"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleCandidateCheck(g.id);
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {}}
                          className="w-4 h-4 accent-blue-600 cursor-pointer"
                        />
                      </td>
                      <td className="py-2 px-3">
                        <div className="font-bold text-slate-900 dark:text-slate-100">
                          {g.title}
                        </div>
                        <div className="text-[11px] text-slate-500">{localizeGenre(g.genre, t)}</div>
                      </td>
                      <td className="py-2 px-3 font-mono">
                        <span className="font-bold text-slate-800 dark:text-slate-200">
                          {g.consoleShort}
                        </span>{' '}
                        <span className="text-slate-400">({g.bitnessGroup})</span>
                      </td>
                      <td className="py-2 px-3">
                        <div className="flex flex-wrap items-center gap-1">
                          <span className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 font-mono font-bold text-[10px]">
                            {g.ageRating}
                          </span>
                          <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px]">
                            {localizeDifficulty(g.difficulty, t)}
                          </span>
                          {g.girlsFavorite && (
                            <span className="px-1.5 py-0.5 rounded bg-pink-100 dark:bg-pink-950 text-pink-700 dark:text-pink-300 font-bold text-[10px]">
                              {t('builds.custom.girlsBadgeShort')}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2 px-3 font-mono text-slate-600 dark:text-slate-400">
                        {g.sourceExt} · {g.sizeMB >= 1024 ? `${(g.sizeMB / 1024).toFixed(2)} ${t('builds.flash.gbSuffix')}` : `${g.sizeMB} ${t('builds.flash.mbSuffix')}`}
                      </td>
                      <td className="py-2 px-3 text-right">
                        {isInQueue ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-bold text-[11px]">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>{t('builds.custom.inQueueBadge')}</span>
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setQueuedGameIds((prev) => [...prev, g.id]);
                            }}
                            className="px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 hover:bg-blue-100 font-bold text-[11px] cursor-pointer"
                          >
                            {t('builds.custom.addSingleBtn')}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* SUB-TAB 3: TARGET SYSTEM HIERARCHY & MULTI-FORMAT CONVERTER        */}
      {/* ================================================================== */}
      {buildsSubTab === 'converter_export' && (
        <div className="space-y-4">
          <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1">
                  {t('builds.conv.buildNameLabel')}
                </label>
                <input
                  type="text"
                  value={customBuildName}
                  onChange={(e) => setCustomBuildName(e.target.value)}
                  className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1">
                  {t('builds.conv.targetSystemLabel')}
                </label>
                <select
                  value={selectedTargetProfileId}
                  onChange={(e) => handleSelectTargetProfile(e.target.value)}
                  className="w-full bg-white dark:bg-slate-900 border border-blue-500 dark:border-blue-500 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-900 dark:text-slate-100"
                >
                  {TARGET_SYSTEM_PROFILES.map((prof) => (
                    <option key={prof.id} value={prof.id}>
                      {t(`profile.${prof.id}.name`, prof.name)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs space-y-1">
              <div className="font-bold text-blue-700 dark:text-blue-400">
                {t('builds.conv.hierarchyRuleLabel')} <code className="font-mono">{selectedProfile.hierarchyPattern}</code>
              </div>
              <div className="text-slate-600 dark:text-slate-400">
                {t(`profile.${selectedProfile.id}.desc`, selectedProfile.description)}
              </div>
            </div>

            {/* Step 2: Per-Console Format Converter Matrix */}
            <div className="space-y-1.5">
              <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                {t('builds.conv.matrixTitle')}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-xs">
                {(['PSX', 'PSP', 'GENESIS', 'SNES', 'GBA', 'NES'] as const).map((cCode) => {
                  const avail = selectedProfile.availableFormats[cCode] || ['.chd', '.iso'];
                  const currentTarget =
                    formatOverrides[cCode] || selectedProfile.defaultFormats[cCode] || avail[0];
                  return (
                    <div
                      key={cCode}
                      className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                    >
                      <div className="font-mono font-semibold text-[11px] text-slate-700 dark:text-slate-300 mb-1">
                        {tf('builds.conv.consoleFmtPrefix', { console: cCode })}
                      </div>
                      <select
                        value={currentTarget}
                        onChange={(e) => handleOverrideConsoleFormat(cCode, e.target.value)}
                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded px-1.5 py-1 font-mono font-bold text-xs text-blue-700 dark:text-blue-300"
                      >
                        {avail.map((ext) => (
                          <option key={ext} value={ext}>
                            {ext}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Honest Engine Status Banner */}
            <div className="p-2.5 rounded-lg bg-slate-100 dark:bg-slate-900/90 border border-slate-300 dark:border-slate-700 text-xs flex flex-wrap items-center justify-between gap-2">
              <div className="space-y-0.5 max-w-2xl">
                <div className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                  <Cpu className="w-3.5 h-3.5 text-blue-600" />
                  <span>{t('builds.conv.engineTitle')}</span>
                </div>
                <div className="text-[11px] text-slate-600 dark:text-slate-400">
                  {t('builds.conv.engineBuiltIn')}
                </div>
                <div className="text-[11px]">
                  {chdmanStatus.available ? (
                    <span className="text-emerald-700 dark:text-emerald-400 font-bold">
                      {tf('builds.conv.chdmanLinked', { path: chdmanStatus.path })}
                    </span>
                  ) : (
                    <span className="text-amber-700 dark:text-amber-400 font-semibold">
                      {t('builds.conv.chdmanMissing')}
                    </span>
                  )}
                </div>
              </div>
              {isNativeDesktopHost && (
                <button
                  type="button"
                  onClick={handleSelectChdmanExe}
                  className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-slate-700 border border-blue-400 dark:border-blue-600 text-blue-700 dark:text-blue-300 font-bold text-xs cursor-pointer shrink-0"
                >
                  {chdmanStatus.available
                    ? t('builds.conv.chdmanChangeBtn')
                    : t('builds.conv.chdmanPickBtn')}
                </button>
              )}
            </div>

            <BuildBiosStrip
              profileId={selectedProfile.id}
              consoleShorts={conversionPlanRows.map((r) => r.game.consoleShort)}
              enabled={copyBiosToBuild}
              onToggle={(on) => {
                setCopyBiosToBuild(on);
                saveBuildCopyBiosPref(on);
              }}
            />

            {/* Summary & Launch Buttons */}
            <div className="pt-2 border-t border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="font-mono text-slate-700 dark:text-slate-300">
                {tf('builds.conv.summaryStats', {
                  total: conversionPlanRows.length,
                  conv: convertedFilesCount,
                })}
                {missingChdmanCount > 0 && (
                  <span className="text-amber-700 dark:text-amber-400">
                    {tf('builds.conv.withoutChdman', { count: missingChdmanCount })}
                  </span>
                )}
                {tf('builds.conv.targetSizeVsSource', {
                  dst: totalTargetMB,
                  src: totalSourceMB,
                })}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleSaveBuildSnapshotClick}
                  disabled={
                    (conversionPlanRows.length === 0 && queuedPortMasterGames.length === 0) ||
                    activeRunning
                  }
                  className="bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 px-3 py-2 rounded-xl font-bold text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{t('builds.staging.saveBtn')}</span>
                </button>

                <button
                  type="button"
                  onClick={handleDownloadConverterScript}
                  disabled={conversionPlanRows.length === 0 || activeRunning}
                  className="px-3 py-2 rounded-xl bg-white dark:bg-slate-900 hover:bg-slate-100 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 font-bold text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
                >
                  <Download className="w-3.5 h-3.5 text-indigo-600" />
                  <span>{t('builds.conv.downloadCmdBtn')}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setExportOptionsOpen(true)}
                  disabled={
                    (conversionPlanRows.length === 0 && queuedPortMasterGames.length === 0) ||
                    activeRunning
                  }
                  className="bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded-xl font-semibold text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
                >
                  <FolderOutput className="w-4 h-4" />
                  <span>{t('builds.conv.exportNowBtn')}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Queued PortMaster Ports Section */}
          {queuedPortMasterGames.length > 0 && (() => {
            const { portsRoot, consoleLaunchNote } = resolvePortMasterRootDirForProfile(
              selectedProfile.id
            );
            return (
              <div className="border border-indigo-300 dark:border-indigo-800 rounded-xl p-3.5 bg-indigo-50/50 dark:bg-indigo-950/30 space-y-2.5 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-semibold text-indigo-900 dark:text-indigo-200 flex items-center gap-1.5">
                    <Package className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    <span>
                      {tf('builds.conv.pmSectionTitle', {
                        count: queuedPortMasterGames.length,
                        root: portsRoot,
                      })}
                    </span>
                  </div>
                  <span className="text-[11px] font-mono text-indigo-700 dark:text-indigo-300">
                    {t('builds.conv.pmSectionSub')}
                  </span>
                </div>
                <div className="text-[11px] text-slate-600 dark:text-slate-400">
                  {consoleLaunchNote}
                </div>
                <div className="divide-y divide-indigo-200/70 dark:divide-indigo-900 border border-indigo-200 dark:border-indigo-800 rounded-lg bg-white dark:bg-slate-900">
                  {queuedPortMasterGames.map((pm) => {
                    const srcCfg = portMasterSourceConfigs[pm.slug];
                    const targetInBuild = pm.requiredDataTargetPath.replace(/^ports/i, portsRoot);
                    return (
                      <div
                        key={pm.slug}
                        className="p-2.5 flex flex-wrap items-center justify-between gap-2"
                      >
                        <div className="min-w-0 space-y-0.5">
                          <div className="font-bold text-slate-900 dark:text-slate-100">
                            {pm.title}{' '}
                            <span className="font-mono text-[10px] text-indigo-600">({pm.id})</span>
                          </div>
                          <div className="text-[11px] font-mono text-emerald-700 dark:text-emerald-400">
                            {tf('builds.conv.pmBuildPath', { path: targetInBuild })} ·{' '}
                            {pm.readyToRun
                              ? t('builds.conv.pmRtrNote')
                              : srcCfg?.localPathLabel
                              ? tf('builds.conv.pmSourcesLinked', { path: srcCfg.localPathLabel })
                              : t('builds.conv.pmSourcesUnlinked')}
                          </div>
                        </div>
                        {onRemoveBuildPort && (
                          <button
                            type="button"
                            onClick={() => onRemoveBuildPort(pm.slug)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 cursor-pointer"
                            title={t('builds.conv.pmRemoveTip')}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* Detailed Conversion & Target Hierarchy Table */}
          <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="bg-slate-50 dark:bg-slate-800/80 px-3.5 py-2 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
              <span className="font-bold text-slate-800 dark:text-slate-200">
                {tf('builds.conv.planTitle', { count: conversionPlanRows.length })}
              </span>
              <button
                type="button"
                onClick={() => setBuildsSubTab('custom_filter')}
                className="text-blue-600 dark:text-blue-400 font-bold hover:underline cursor-pointer"
              >
                {t('builds.conv.addMoreBtn')}
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50/60 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-slate-500">
                    <th className="py-2 px-3">{t('builds.conv.col.gameAndSet')}</th>
                    <th className="py-2 px-3">{t('builds.conv.col.fmtConv')}</th>
                    <th className="py-2 px-3">{t('builds.conv.col.engineMode')}</th>
                    <th className="py-2 px-3">{t('builds.conv.col.targetPathFile')}</th>
                    <th className="py-2 px-3 w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                  {conversionPlanRows.map((row) => {
                    const isConverting = row.rule.actionType !== 'keep_as_is';
                    const isBlockedExternal =
                      row.rule.conversionKind === 'external_pbp_cso' ||
                      (row.rule.requiresChdman && !chdmanStatus.available);
                    const lowOld = row.game.oldFile.toLowerCase();
                    const isOpticalDesc =
                      lowOld.endsWith('.cue') ||
                      lowOld.endsWith('.ccd') ||
                      lowOld.endsWith('.mds') ||
                      lowOld.endsWith('.gdi');
                    const cueWarningMissingBin =
                      isOpticalDesc &&
                      (!row.game.companionFiles || row.game.companionFiles.length === 0) &&
                      Boolean(row.game.fileObj);

                    return (
                      <tr
                        key={row.game.id}
                        onClick={() => onSelectGameId(row.game.id)}
                        className="hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer"
                      >
                        <td className="py-2 px-3">
                          <div className="font-bold text-slate-900 dark:text-slate-100">
                            {row.game.title}{' '}
                            <span className="font-mono text-[10px] text-slate-400">
                              ({row.game.consoleShort})
                            </span>
                          </div>
                          <div className="text-[10px] font-mono text-slate-500">
                            {row.game.sizeMB >= 1024 ? `${(row.game.sizeMB / 1024).toFixed(2)} ${t('builds.flash.gbSuffix')}` : `${row.game.sizeMB} ${t('builds.flash.mbSuffix')}`}
                            {row.isMultiDisc && row.discCount
                              ? ` · ${tf('builds.conv.multiDiscRowSuffix', { count: row.discCount })}`
                              : row.game.trackCount && row.game.trackCount > 0
                              ? ` · ${tf('builds.conv.linkedTracksSuffix', {
                                  ext: row.sourceExt.replace(/^\./, ''),
                                  count: row.game.trackCount,
                                })}`
                              : ''}
                          </div>
                          {cueWarningMissingBin && (
                            <div className="text-[10px] text-rose-600 dark:text-rose-400 font-bold flex items-center gap-1 mt-0.5">
                              <AlertTriangle className="w-3 h-3" />
                              <span>{t('builds.conv.noBinWarning')}</span>
                            </div>
                          )}
                        </td>
                        <td className="py-2 px-3 font-mono">
                          <span
                            className={`px-1.5 py-0.5 rounded font-bold text-[11px] ${
                              isBlockedExternal
                                ? 'bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300'
                                : isConverting
                                ? 'bg-amber-100 dark:bg-amber-950 text-amber-900 dark:text-amber-300'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            {row.sourceExt} ➔ {row.targetExt}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-slate-600 dark:text-slate-400">
                          <div className="font-semibold text-[11px] text-slate-800 dark:text-slate-200">
                            {isBlockedExternal
                              ? tf('builds.conv.statusNeedEngine', { engine: row.rule.toolEngine })
                              : row.rule.conversionKind === 'builtin_binary'
                              ? tf('builds.conv.statusBuiltIn', { engine: row.rule.toolEngine })
                              : row.rule.requiresChdman
                              ? t('builds.conv.statusChdmanReady')
                              : `✔ ${row.rule.toolEngine}`}
                          </div>
                          <div className="text-[11px]">{row.rule.operationSummary}</div>
                        </td>
                        <td className="py-2 px-3 font-mono text-emerald-700 dark:text-emerald-400 font-semibold">
                          {row.isMultiDisc && row.m3uFileName
                            ? `${row.folderPath}/${row.baseWithRegion}/${row.m3uFileName} ${tf('builds.conv.multiDiscTargetNote', { count: row.discCount || 0 })}`
                            : isBlockedExternal
                            ? `${row.folderPath}/${row.game.oldFile || row.game.cleanFile} ${t('builds.conv.rawNoFakeNote')}`
                            : `${row.folderPath}/${row.cueFileName || row.outputFileName}`}
                        </td>
                        <td className="py-2 px-3 text-right">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setQueuedGameIds((prev) =>
                                prev.filter((id) => id !== row.game.id)
                              );
                            }}
                            title={t('builds.conv.removeFromQueueTip')}
                            className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* SUB-TAB 4: SAVED BUILDS & SYNC WITH LIBRARY                        */}
      {/* ================================================================== */}
      {buildsSubTab === 'saved_builds' && (
        <div className="space-y-3.5 text-xs">
          <div className="p-3.5 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 flex flex-wrap items-center justify-between gap-2.5">
            <div className="space-y-0.5 max-w-2xl">
              <div className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                <History className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <span>{t('builds.saved.sectionTitle')}</span>
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-300">
                {t('builds.saved.sectionDesc')}
              </p>
            </div>
            <button
              type="button"
              onClick={handleSaveBuildSnapshotClick}
              disabled={queuedGames.length === 0 && queuedPortMasterGames.length === 0}
              className="bg-accent hover:bg-accent-hover text-white px-3.5 py-2 rounded-xl font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{t('builds.saved.saveCurrentBtn')}</span>
            </button>
          </div>

          {savedBuilds.length === 0 ? (
            <div className="py-12 text-center border border-dashed border-slate-300 dark:border-slate-700 rounded-xl text-slate-500 space-y-2">
              <History className="w-8 h-8 mx-auto text-slate-400" />
              <div className="font-bold text-slate-700 dark:text-slate-300">
                {t('builds.saved.emptyHeading')}
              </div>
              <div className="text-[11px]">
                {t('builds.saved.emptySub')}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {savedBuilds.map((build) => {
                const pendingDiffs = computeBuildSyncDiff(build, allEnrichedGames);
                return (
                  <div
                    key={build.id}
                    className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {build.name}
                          </span>
                          <span className="px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300 font-bold text-[10px]">
                            {t(`profile.${build.targetProfileId}.short`, build.targetProfileName)}
                          </span>
                          {pendingDiffs.length > 0 ? (
                            <span className="px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-950 text-amber-900 dark:text-amber-300 font-bold text-[10px]">
                              {tf('builds.saved.updatesBadge', { count: pendingDiffs.length })}
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-bold text-[10px]">
                              {t('builds.saved.syncedBadge')}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] font-mono text-slate-500">
                          {tf('builds.saved.syncGamesCount', {
                            games: build.items.length,
                            pm: build.portMasterSlugs?.length || 0,
                          })}
                          {build.exportFolderName
                            ? tf('builds.saved.folderLabel', { folder: build.exportFolderName })
                            : ''}
                          {tf('builds.saved.syncUpdatedAt', {
                            date: new Date(build.updatedAt).toLocaleString(locale),
                          })}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => setViewBuildId(build.id)}
                          className="px-3 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 font-bold flex items-center gap-1.5 cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>{t('builds.view.openBtn')}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleLoadSavedBuild(build)}
                          className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold cursor-pointer"
                        >
                          {t('builds.saved.openInBuilderBtn')}
                        </button>

                        <button
                          type="button"
                          onClick={() => setSyncModalBuild(build)}
                          className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 cursor-pointer ${
                            pendingDiffs.length > 0
                              ? 'bg-amber-500 hover:bg-amber-600 text-slate-950 shadow-2xs'
                              : 'bg-emerald-600 text-white'
                          }`}
                        >
                          <GitCompare className="w-3.5 h-3.5" />
                          <span>
                            {t('builds.saved.syncWithLibBtn')}
                            {pendingDiffs.length > 0 ? ` (${pendingDiffs.length})` : ''}
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDeleteSavedBuild(build.id)}
                          title={t('builds.saved.deleteTip')}
                          className="p-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-rose-600 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Preview paths inside this build */}
                    <div className="flex flex-wrap gap-1.5">
                      {build.items.slice(0, 6).map((it, idx) => (
                        <span
                          key={`${it.gameId}_${idx}`}
                          className="px-2 py-0.5 rounded bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-[10px] text-slate-600 dark:text-slate-300"
                          title={tf('builds.conv.pathTooltip', { path: it.targetPath })}
                        >
                          {it.targetPath}
                        </span>
                      ))}
                      {build.items.length > 6 && (
                        <span className="px-2 py-0.5 text-[10px] font-mono text-slate-400">
                          {tf('builds.saved.moreItems', { count: build.items.length - 6 })}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <BuildContentsModal
        build={viewBuild}
        libraryGames={allEnrichedGames}
        portMasterCatalog={portMasterCatalog}
        onRemoveItem={handleRemoveBuildItem}
        onRemovePort={handleRemoveBuildPort}
        onClose={() => setViewBuildId(null)}
      />

      {/* Build Sync Discrepancy Modal */}
      <SyncDiffModal
        isOpen={Boolean(syncModalBuild)}
        mode="build_sync"
        onClose={() => setSyncModalBuild(null)}
        currentLibraryRows={allEnrichedGames}
        targetBuild={syncModalBuild}
        onExecuteBuildSync={handleExecuteBuildSync}
        onAddLog={onAddLog}
      />

      {exportOptionsOpen && (
        <BuildExportOptionsModal
          initial={loadBuildExportOptions()}
          profileName={selectedProfile.shortName}
          mediaLayout={profileMediaLayout(selectedProfile.mediaFolders)}
          supportsGamelist={selectedProfile.gamelistFormat === 'emulationstation_xml'}
          gameCount={conversionPlanRows.length}
          totalSizeLabel={
            totalSourceMB >= 1024 ? `${(totalSourceMB / 1024).toFixed(1)} GB` : `${totalSourceMB} MB`
          }
          onClose={() => setExportOptionsOpen(false)}
          onConfirm={(o) => {
            const prev = loadBuildExportOptions();
            const mediaUsable = profileMediaLayout(selectedProfile.mediaFolders) !== 'none';
            saveBuildExportOptions(mediaUsable ? o : { ...o, includeMedia: prev.includeMedia });
            setExportOptionsOpen(false);
            void handleRunBuildExportAndConversion(o);
          }}
        />
      )}
    </div>
  );
};
