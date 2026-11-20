import React, { useState, useEffect, useRef, useCallback, useDeferredValue, useTransition, useMemo } from 'react';
import {
  Database,
  Wrench,
  Share2,
  Gamepad2,
  Play,
  ExternalLink,
  FileCode2,
  Search,
  HardDrive,
  OctagonX,
  Sun,
  Moon,
  Sparkles,
  FolderInput,
  FolderOpen,
  Layers,
  FolderSearch,
  Undo2,
  RefreshCw,
  ScrollText,
  X,
  Copy,
  Trash2,
  CheckCircle2,
  Download,
  Upload,
  Archive,
  GitCompare,
  Plus,
  Globe,
  Scissors,
  AlertTriangle,
  Check,
  Wand2,
  Coffee,
} from 'lucide-react';
import { GameInspectorCoverVideo } from './GameInspectorCoverVideo';
import { DatFilesPanel } from './DatFilesPanel';
import { PatcherPanel } from './PatcherPanel';
import {
  APP_FULL_TITLE,
  DOWNLOAD_SETUP_URL,
  DOWNLOAD_ZIP_URL,
  SETUP_EXE_FILENAME,
  SUPPORT_URL,
  ZIP_PKG_FILENAME,
} from '../version';
import { SmartBuildsAndConverterTab } from './SmartBuildsAndConverterTab';
import {
  EnvironmentEmulatorsTab,
  resolvePriorityEmulatorForConsole,
} from './EnvironmentEmulatorsTab';
import {
  BUILTIN_EXTENDED_GAMES,
  enrichGameForBuild,
} from '../utils/buildsAndConverterEngine';
import { downloadXmlTemplateFile } from './XmlMappingModal';
import { SyncDiffModal } from './SyncDiffModal';
import { FilenameConstructorCard } from './FilenameConstructorCard';
import { DEFAULT_FILENAME_CONFIG } from '../utils/filenameConstructor';
import { modGroup, type RomModGroup, type RomModKind } from '../utils/romHacks';

// Порядок при сортировке по статусу. / Order when sorting by status.
const MOD_SORT_RANK: Record<RomModGroup, number> = { original: 1, translation: 2, hack: 3, patched: 4 };
import {
  isDeadOrLocalBlobUrl,
  saveMultiDbsToIndexedDB,
  loadMultiDbsFromIndexedDB,
} from '../utils/persistentHandles';
import { VirtualizedLibraryViews, type LibraryCollectionBadge } from './VirtualizedLibraryViews';
import { EditorToolbar, GameEditModal, useManualEditsVersion } from './LibraryEditor';
import { applyManualEditToRow, exportManualEdits, importManualEdits } from '../utils/manualEdits';
import { CollectionModal } from './CollectionModal';
import { GameRelationsPanel } from './GameRelationsPanel';
import { buildCollections, indexCollections, seriesSiblings } from '../utils/gameCollections';
import { inferPortMasterPcTestPlan } from '../utils/portMasterEngine';
import {
  SUPPORTED_LANGUAGES,
  useI18n,
  localizeGenre,
  tStatic,
  tfStatic,
  type SupportedLanguage,
} from '../i18n/translations';
import {
  buildSyncComparisonKey,
  loadSavedBuildsLocal,
  syncSavedBuildsWithServer,
} from '../utils/syncAndBuildsStorage';
import type {
  BufferRomPreviewItem,
  FilenameConstructorConfig,
  PortMasterGame,
  PortMasterSourceConfig,
  SavedBuildItem,
  SavedBuildRecord,
  SyncDiffEntry,
} from '../types/aegis';

export type FigmaConceptId = 'concept_a_sidebar' | 'concept_b_split' | 'concept_c_workbench';

const SHORT_COLLATOR = new Intl.Collator('en', { sensitivity: 'base', numeric: true });

import {
  collapseMultiDiscUnifiedRows,
} from '../utils/multiDiscEngine';
import { WorkbenchContextPanel, type HoveredTool } from './WorkbenchContextPanel';
import { QuickTestModal, type QuickTestRequest } from './QuickTestModal';
import { resolveQuickTestCore, pickCueDataTrack, pickBiosForRegion, fileExt } from '../utils/quickTest';
import { getVerifiedBiosFiles } from '../utils/biosScan';

export interface MultiDiscEntry {
  id: string;
  discNumber: number;
  title: string;
  oldFile: string;
  cleanFile: string;
  relativePath?: string;
  size: string;
  totalBytes?: number;
  crc32: string;
  sourceExt?: string;
  fileObj?: File;
  companionFiles?: File[];
  cueText?: string;
}

function sanitizeDatabasesForStorage<T extends { rows: UnifiedGameRow[] }>(dbs: T[]): T[] {
  return dbs.map((u) => ({
    ...u,
    rows: Array.isArray(u.rows)
      ? u.rows.map((r) => ({
          ...r,
          fileObj: undefined,
          companionFiles: undefined,
          discs: Array.isArray(r.discs)
            ? r.discs.map((d) => ({
                ...d,
                fileObj: undefined,
                companionFiles: undefined,
              }))
            : undefined,
          boxArtUrl: isDeadOrLocalBlobUrl(r.boxArtUrl) ? undefined : r.boxArtUrl,
          videoUrl: isDeadOrLocalBlobUrl(r.videoUrl) ? undefined : r.videoUrl,
        }))
      : [],
  }));
}

function persistDatabasesSafely<T extends { rows: UnifiedGameRow[] }>(dbs: T[]): void {
  const clean = sanitizeDatabasesForStorage(dbs);
  // Always persist asynchronously to IndexedDB (handles large libraries without UI lag or the 5MB localStorage limit)
  void saveMultiDbsToIndexedDB(clean);

  // Only mirror compact libraries to localStorage to avoid synchronous JSON.stringify blocking on large libraries
  const totalRows = clean.reduce((sum, d) => sum + (d.rows?.length || 0), 0);
  if (totalRows <= 400) {
    try {
      localStorage.setItem('aegisrom_v0_5_multi_dbs', JSON.stringify(clean));
    } catch {}
  }
}

export interface UnifiedGameRow {
  id: string;
  // Откуда взято название: gamelist | factory | header | filename | index-strip | libretro-exact | libretro-fuzzy.
  titleSource?: string;
  // Почему настоящее название не найдено (пусто, если найдено).
  titleNote?: string;
  // Хак / перевод / патч: вид, тег, язык перевода и описание отличий (utils/romHacks.ts).
  // Hack / translation / patch: kind, tag, translation language and what differs (utils/romHacks.ts).
  modKind?: string;
  modTag?: string;
  modLang?: string;
  modNote?: string;
  title: string;
  oldFile: string;
  cleanFile: string;
  console: string;
  consoleShort: string;
  bitness: string;
  region: string;
  genre: string;
  year: number;
  size: string;
  crc32: string;
  serial: string;
  emulator: string;
  status: string;
  boxArtUrl?: string;
  videoUrl?: string;
  fileObj?: File;
  companionFiles?: File[];
  cueText?: string;
  totalBytes?: number;
  trackCount?: number;
  sourceExt?: string;
  relativePath?: string;
  portMasterSlug?: string;
  portMasterDataPath?: string;
  discNumber?: number;
  discCount?: number;
  isMultiDisc?: boolean;
  multiDiscFolderName?: string;
  m3uFileName?: string;
  discs?: MultiDiscEntry[];
  // Ручные правки редактора (utils/manualEdits.ts) и поля gamelist.xml, которые они задают.
  // Editor manual edits (utils/manualEdits.ts) and the gamelist.xml fields they set.
  developer?: string;
  publisher?: string;
  players?: string;
  rating?: string;
  desc?: string;
  manualFields?: string[];
  manualMedia?: Partial<Record<'image' | 'thumbnail' | 'marquee' | 'video', string>>;
}

interface FigmaConceptStudioProps {
  /** Tour / setup wizard: switch to a section (and Tools sub-tab) when nonce changes. */
  navigateRequest?: {
    target: { tab: 'library' | 'tools' | 'builds' | 'env'; toolsMode?: 'library' | 'sd_folder' | 'combine' };
    nonce: number;
  } | null;
  /** Opens the first-run setup wizard again (top bar wand button). */
  onOpenSetupWizard?: () => void;
  selectedConcept: FigmaConceptId;
  onSelectConcept: (id: FigmaConceptId) => void;
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
  onOpenXmlModal: () => void;
  // Real operations & state from App.tsx
  selectedFolderName?: string;
  libraryPath?: string;
  onSelectLibraryPath?: () => void;
  onImportLibrary?: () => void;
  onExportLibrary?: () => void;
  romsCount?: number;
  scannedRows?: UnifiedGameRow[];
  isAnyProcessRunning?: boolean;
  progressPct?: number;
  currentActionText?: string;
  pendingRestoreHandles?: Array<{ key: string; folderName: string }>;
  onRestoreSavedPermissions?: () => void;
  /** Bumped by App when a library/scan folder becomes readable; re-resolves local media. */
  mediaAccessVersion?: number;
  /** True when App holds a granted library or scan folder handle. */
  hasMediaFolderAccess?: boolean;
  onResolveMediaForDbRows?: (
    rows: UnifiedGameRow[],
    libraryPathHint?: string
  ) => Promise<UnifiedGameRow[]>;
  logs?: string[];
  onClearLogs?: () => void;
  onEmergencyStop?: () => void;
  onSelectAndScanFolder?: () => void;
  onAddFolderToLibrary?: () => void;
  onScanExternalSourceForDiff?: () => Promise<{
    sourceName: string;
    rows: UnifiedGameRow[];
  } | null>;
  lastScanMode?: 'append' | 'replace';
  scanRevision?: number;
  onOrganizeCatalog?: () => void;
  onGroupMultiDiscFolders?: () => void;
  autoGroupMultiDisc?: boolean;
  onChangeAutoGroupMultiDisc?: (val: boolean) => void;
  onScrapeMedia?: () => void;
  onOnlineRename?: () => void;
  // Системы Libretro из библиотеки (для автозагрузки DAT). / Libretro systems in the library (DAT auto-download).
  datSystems?: string[];
  onScanPhantomFolders?: () => void;
  onRepairSdCard?: (firmwareId?: string) => void;
  sdTargetFolderName?: string;
  onSelectSdFolder?: () => void;
  onScanSdFolder?: () => void;
  sdFirmwareId?: string;
  onChangeSdFirmwareId?: (firmwareId: string) => void;
  onMassDeleteRoms?: (targetIds: string[]) => void;
  onMassMoveRoms?: (targetIds: string[]) => void;
  /** Редактор: записать gamelist.xml в папках этих ромов. / Editor: write gamelist.xml in these ROMs' folders. */
  onEditorWriteGamelist?: (targetIds: string[]) => void;
  /** Редактор: скраппер только для этих ромов. / Editor: run the scraper for these ROMs only. */
  onEditorScrapeMedia?: (targetIds: string[]) => void;
  onMassSplitRoms?: (
    splitMode: 'by_console' | 'alphabetical' | 'disc_vs_cartridge' | 'multidisc_subfolders'
  ) => void;
  onUndo?: () => void;
  canUndo?: boolean;
  catalogMode?: 'gen_then_console' | 'r36s_gen_direct' | 'r36s_flat_console';
  onChangeCatalogMode?: (mode: 'gen_then_console' | 'r36s_gen_direct' | 'r36s_flat_console') => void;
  priorityPreset?: string;
  onChangePriorityPreset?: (preset: string) => void;
  autoScrapeAfterSort?: boolean;
  onChangeAutoScrape?: (val: boolean) => void;
  scrapeShortVideos?: boolean;
  onChangeScrapeShortVideos?: (val: boolean) => void;
  deleteJunkPermanently?: boolean;
  onChangeDeleteJunk?: (val: boolean) => void;
  filenameConfig?: FilenameConstructorConfig;
  onChangeFilenameConfig?: (cfg: FilenameConstructorConfig) => void;
  sortTargetFolderName?: string;
  onSelectSortTargetFolder?: () => void;
  onApplySortRulesInFolder?: (renameUsingConstructor: boolean) => void;
  bufferFolderName?: string;
  onSelectBufferFolder?: () => void;
  combineTargetFolderName?: string;
  onSelectCombineTargetFolder?: () => void;
  combineMoveMode?: 'move' | 'copy';
  onChangeCombineMoveMode?: (mode: 'move' | 'copy') => void;
  combineDedup1G1R?: boolean;
  onChangeCombineDedup1G1R?: (val: boolean) => void;
  combineSortFolders?: boolean;
  onChangeCombineSortFolders?: (val: boolean) => void;
  combineAddToLibrary?: boolean;
  onChangeCombineAddToLibrary?: (val: boolean) => void;
  bufferPreviewItems?: BufferRomPreviewItem[];
  onRunBufferAutoProcess?: () => void;
  onDownloadBufferCmdScript?: () => void;
  isNativeDesktopHost?: boolean;
  onDownloadExe?: () => void;
  onDownloadZip?: () => void;
  onAddLog?: (msg: string) => void;
  emulatorCustomPaths?: Record<string, string>;
  starredEmulatorsByConsole?: Record<string, string>;
  onUpdateEmulatorConfig?: (
    customPaths: Record<string, string>,
    starredMap: Record<string, string>
  ) => void;
}

function buildSampleDefaultGames(): UnifiedGameRow[] {
  const mb = (v: string) => `${v} ${tStatic('size.mb')}`;
  const gb = (v: string) => `${v} ${tStatic('size.gb')}`;
  return [
    {
      id: 'g1',
      title: 'Tekken 3',
      oldFile: '000634 (World).chd',
      cleanFile: 'Tekken 3.chd',
      console: 'PlayStation 1',
      consoleShort: 'PSX',
      bitness: '32-bit',
      region: 'RUS',
      genre: 'Fighting',
      year: 1998,
      size: mb('418'),
      crc32: '8F4E2C19',
      serial: 'SLUS-00402',
      emulator: 'DuckStation ★',
      status: tStatic('xml.status.matched'),
      boxArtUrl: 'https://thumbnails.libretro.com/Sony%20-%20PlayStation/Named_Boxarts/Tekken%203%20(USA).png',
      videoUrl: 'https://archive.org/download/SonyPlaystationVideoSnaps/Tekken%203%20%28USA%29.mp4',
    },
    {
      id: 'g2',
      title: 'Legacy of Kain: Soul Reaver',
      oldFile: '000001 (World).chd',
      cleanFile: 'Legacy of Kain - Soul Reaver.chd',
      console: 'PlayStation 1',
      consoleShort: 'PSX',
      bitness: '32-bit',
      region: 'RUS',
      genre: 'Adventure',
      year: 1999,
      size: mb('382'),
      crc32: '3A91C04B',
      serial: 'SLUS-00708',
      emulator: 'DuckStation ★',
      status: tStatic('xml.status.matched'),
      boxArtUrl:
        'https://thumbnails.libretro.com/Sony%20-%20PlayStation/Named_Boxarts/Legacy%20of%20Kain%20-%20Soul%20Reaver%20(USA).png',
      videoUrl:
        'https://archive.org/download/SonyPlaystationVideoSnaps/Legacy%20of%20Kain%20-%20Soul%20Reaver%20%28USA%29.mp4',
    },
    {
      id: 'g3',
      title: 'Castlevania: Symphony of the Night',
      oldFile: '000089 (World).chd',
      cleanFile: 'Castlevania - Symphony of the Night.chd',
      console: 'PlayStation 1',
      consoleShort: 'PSX',
      bitness: '32-bit',
      region: 'RUS',
      genre: 'RPG / Adventure',
      year: 1997,
      size: mb('356'),
      crc32: '7D12E801',
      serial: 'SLUS-00067',
      emulator: 'RetroArch (SwanStation)',
      status: tStatic('app.scan.mediaCovered'),
      boxArtUrl:
        'https://thumbnails.libretro.com/Sony%20-%20PlayStation/Named_Boxarts/Castlevania%20-%20Symphony%20of%20the%20Night%20(USA).png',
      videoUrl:
        'https://archive.org/download/SonyPlaystationVideoSnaps/Castlevania%20-%20Symphony%20of%20the%20Night%20%28USA%29.mp4',
    },
    {
      id: 'g4',
      title: 'Comix Zone',
      oldFile: 'Comix_Zone_RU.md',
      cleanFile: 'Comix Zone (RUS).md',
      console: 'Sega Mega Drive',
      consoleShort: 'GENESIS',
      bitness: '16-bit',
      region: 'RUS',
      genre: 'Action',
      year: 1995,
      size: mb('2.0'),
      crc32: '9C02F11A',
      serial: 'MK-1563',
      emulator: 'RetroArch (Genesis Plus GX) ★',
      status: tStatic('app.scan.keep1g1rReason'),
      boxArtUrl:
        'https://thumbnails.libretro.com/Sega%20-%20Mega%20Drive%20-%20Genesis/Named_Boxarts/Comix%20Zone%20(USA).png',
      videoUrl:
        'https://archive.org/download/genesissnaps/Comix%20Zone%20%28USA%29.mp4',
    },
    {
      id: 'g5',
      title: 'Metroid Fusion',
      oldFile: '0042_Metroid_Fusion.gba',
      cleanFile: 'Metroid Fusion.gba',
      console: 'Game Boy Advance',
      consoleShort: 'GBA',
      bitness: '32-bit',
      region: 'USA',
      genre: 'Platformer',
      year: 2002,
      size: mb('8.0'),
      crc32: '6B14E092',
      serial: 'AGB-AMTE',
      emulator: 'mGBA ★',
      status: tStatic('app.scan.mediaCovered'),
      boxArtUrl:
        'https://thumbnails.libretro.com/Nintendo%20-%20Game%20Boy%20Advance/Named_Boxarts/Metroid%20Fusion%20(USA).png',
      videoUrl:
        'https://archive.org/download/gbasnaps/Metroid%20Fusion%20%28USA%29.mp4',
    },
    {
      id: 'g6',
      title: 'Gran Turismo 2',
      oldFile: '000215 (World).chd',
      cleanFile: 'Gran Turismo 2.chd',
      console: 'PlayStation 1',
      consoleShort: 'PSX',
      bitness: '32-bit',
      region: 'RUS',
      genre: 'Racing',
      year: 1999,
      size: mb('512'),
      crc32: '4E81A20C',
      serial: 'SCUS-94455',
      emulator: 'DuckStation ★',
      status: tStatic('xml.status.matched'),
      boxArtUrl:
        'https://thumbnails.libretro.com/Sony%20-%20PlayStation/Named_Boxarts/Gran%20Turismo%202%20(USA)%20(Arcade%20Mode).png',
      videoUrl:
        'https://archive.org/download/SonyPlaystationVideoSnaps/Gran%20Turismo%202%20%28USA%29%20%28Simulation%20Mode%29.mp4',
    },
    {
      id: 'g7',
      title: 'Chrono Trigger',
      oldFile: 'Chrono_Trigger_JP.sfc',
      cleanFile: 'Chrono Trigger (RUS).sfc',
      console: 'Super Nintendo',
      consoleShort: 'SNES',
      bitness: '16-bit',
      region: 'RUS',
      genre: 'RPG / Adventure',
      year: 1995,
      size: mb('4.0'),
      crc32: '2D91F80A',
      serial: 'SNS-ACTP',
      emulator: 'RetroArch (Snes9x) ★',
      status: tStatic('app.scan.keep1g1rReason'),
      boxArtUrl:
        'https://thumbnails.libretro.com/Nintendo%20-%20Super%20Nintendo%20Entertainment%20System/Named_Boxarts/Chrono%20Trigger%20(USA).png',
      videoUrl:
        'https://archive.org/download/snapssnaps/Chrono%20Trigger%20%28USA%29.mp4',
    },
    {
      id: 'g8',
      title: 'Metal Gear Solid',
      oldFile: `000112 (World).chd (${tfStatic('lib.discsRangeLabel', { count: 2 })})`,
      cleanFile: `Metal Gear Solid (RUS)/Metal Gear Solid (RUS).m3u (${tfStatic('lib.multiDiscCount', { count: 2 })})`,
      console: 'PlayStation 1',
      consoleShort: 'PSX',
      bitness: '32-bit',
      region: 'RUS',
      genre: 'Action',
      year: 1998,
      size: gb('1.18'),
      totalBytes: Math.round(1.18 * 1024 * 1024 * 1024),
      crc32: '5F19C30E',
      serial: 'SLUS-00594',
      emulator: 'DuckStation ★',
      status: tfStatic('app.multi.inlineBadge', {
        discs: tfStatic('lib.multiDiscCount', { count: 2 }),
        path: 'Metal Gear Solid (RUS).m3u',
      }),
      isMultiDisc: true,
      discCount: 2,
      multiDiscFolderName: 'Metal Gear Solid (RUS)',
      m3uFileName: 'Metal Gear Solid (RUS).m3u',
      relativePath: 'psx/Metal Gear Solid (RUS)/Metal Gear Solid (RUS).m3u',
      discs: [
        {
          id: 'g8_d1',
          discNumber: 1,
          title: 'Metal Gear Solid (Disc 1)',
          oldFile: '000112 (Disc 1).chd',
          cleanFile: 'Metal Gear Solid (RUS) (Disc 1).chd',
          relativePath: 'psx/Metal Gear Solid (RUS)/Metal Gear Solid (RUS) (Disc 1).chd',
          size: mb('640'),
          totalBytes: 640 * 1024 * 1024,
          crc32: '5F19C30E',
          sourceExt: '.chd',
        },
        {
          id: 'g8_d2',
          discNumber: 2,
          title: 'Metal Gear Solid (Disc 2)',
          oldFile: '000113 (Disc 2).chd',
          cleanFile: 'Metal Gear Solid (RUS) (Disc 2).chd',
          relativePath: 'psx/Metal Gear Solid (RUS)/Metal Gear Solid (RUS) (Disc 2).chd',
          size: mb('568'),
          totalBytes: 568 * 1024 * 1024,
          crc32: '5F19C30F',
          sourceExt: '.chd',
        },
      ],
      boxArtUrl:
        'https://thumbnails.libretro.com/Sony%20-%20PlayStation/Named_Boxarts/Metal%20Gear%20Solid%20(USA)%20(Disc%201).png',
      videoUrl:
        'https://archive.org/download/SonyPlaystationVideoSnaps/Metal%20Gear%20Solid%20%28USA%29%20%28Disc%201%29.mp4',
    },
    {
      id: 'g9',
      title: 'Final Fantasy VII',
      oldFile: `Final Fantasy VII (RUS) (Disc 1).chd (${tfStatic('lib.discsRangeLabel', { count: 3 })})`,
      cleanFile: `Final Fantasy VII (RUS)/Final Fantasy VII (RUS).m3u (${tfStatic('lib.multiDiscCount', { count: 3 })})`,
      console: 'PlayStation 1',
      consoleShort: 'PSX',
      bitness: '32-bit',
      region: 'RUS',
      genre: 'RPG / Adventure',
      year: 1997,
      size: gb('1.42'),
      totalBytes: Math.round(1.42 * 1024 * 1024 * 1024),
      crc32: 'FF7D0001',
      serial: 'SCUS-94163',
      emulator: 'DuckStation ★',
      status: tfStatic('app.multi.inlineBadge', {
        discs: tfStatic('lib.multiDiscCount', { count: 3 }),
        path: 'Final Fantasy VII (RUS).m3u',
      }),
      isMultiDisc: true,
      discCount: 3,
      multiDiscFolderName: 'Final Fantasy VII (RUS)',
      m3uFileName: 'Final Fantasy VII (RUS).m3u',
      relativePath: 'psx/Final Fantasy VII (RUS)/Final Fantasy VII (RUS).m3u',
      discs: [
        {
          id: 'g9_d1',
          discNumber: 1,
          title: 'Final Fantasy VII (Disc 1)',
          oldFile: 'Final Fantasy VII (RUS) (Disc 1).chd',
          cleanFile: 'Final Fantasy VII (RUS) (Disc 1).chd',
          relativePath: 'psx/Final Fantasy VII (RUS)/Final Fantasy VII (RUS) (Disc 1).chd',
          size: mb('485'),
          totalBytes: 485 * 1024 * 1024,
          crc32: 'FF7D0001',
          sourceExt: '.chd',
        },
        {
          id: 'g9_d2',
          discNumber: 2,
          title: 'Final Fantasy VII (Disc 2)',
          oldFile: 'Final Fantasy VII (RUS) (Disc 2).chd',
          cleanFile: 'Final Fantasy VII (RUS) (Disc 2).chd',
          relativePath: 'psx/Final Fantasy VII (RUS)/Final Fantasy VII (RUS) (Disc 2).chd',
          size: mb('492'),
          totalBytes: 492 * 1024 * 1024,
          crc32: 'FF7D0002',
          sourceExt: '.chd',
        },
        {
          id: 'g9_d3',
          discNumber: 3,
          title: 'Final Fantasy VII (Disc 3)',
          oldFile: 'Final Fantasy VII (RUS) (Disc 3).chd',
          cleanFile: 'Final Fantasy VII (RUS) (Disc 3).chd',
          relativePath: 'psx/Final Fantasy VII (RUS)/Final Fantasy VII (RUS) (Disc 3).chd',
          size: mb('478'),
          totalBytes: 478 * 1024 * 1024,
          crc32: 'FF7D0003',
          sourceExt: '.chd',
        },
      ],
      boxArtUrl:
        'https://thumbnails.libretro.com/Sony%20-%20PlayStation/Named_Boxarts/Final%20Fantasy%20VII%20(USA)%20(Disc%201).png',
      videoUrl:
        'https://archive.org/download/SonyPlaystationVideoSnaps/Final%20Fantasy%20VII%20%28USA%29%20%28Disc%201%29.mp4',
    },
  ];
}

export const FigmaConceptStudio: React.FC<FigmaConceptStudioProps> = ({
  navigateRequest,
  onOpenSetupWizard,
  selectedConcept,
  onSelectConcept,
  isDarkMode,
  onToggleDarkMode,
  onOpenXmlModal,
  selectedFolderName = '',
  libraryPath = 'D:/AegisROM_MasterLibrary',
  onSelectLibraryPath,
  onImportLibrary,
  onExportLibrary,
  scannedRows = [],
  isAnyProcessRunning = false,
  progressPct = 0,
  currentActionText = '',
  pendingRestoreHandles = [],
  onRestoreSavedPermissions,
  mediaAccessVersion = 0,
  hasMediaFolderAccess = false,
  onResolveMediaForDbRows,
  logs = [],
  onClearLogs,
  onEmergencyStop,
  onSelectAndScanFolder,
  onAddFolderToLibrary,
  onScanExternalSourceForDiff,
  lastScanMode = 'append',
  scanRevision = 0,
  onOrganizeCatalog,
  onGroupMultiDiscFolders,
  autoGroupMultiDisc = true,
  onChangeAutoGroupMultiDisc,
  onScrapeMedia,
  onOnlineRename,
  datSystems,
  onScanPhantomFolders,
  onRepairSdCard,
  sdTargetFolderName = '',
  onSelectSdFolder,
  onScanSdFolder,
  sdFirmwareId = 'r36s_arkos',
  onChangeSdFirmwareId,
  onMassDeleteRoms,
  onMassMoveRoms,
  onEditorWriteGamelist,
  onEditorScrapeMedia,
  onMassSplitRoms,
  onUndo,
  canUndo = false,
  catalogMode = 'r36s_flat_console',
  onChangeCatalogMode,
  priorityPreset = 'rus_first',
  onChangePriorityPreset,
  autoScrapeAfterSort = true,
  onChangeAutoScrape,
  scrapeShortVideos = true,
  onChangeScrapeShortVideos,
  deleteJunkPermanently = false,
  onChangeDeleteJunk,
  filenameConfig = DEFAULT_FILENAME_CONFIG,
  onChangeFilenameConfig,
  sortTargetFolderName = '',
  onSelectSortTargetFolder,
  onApplySortRulesInFolder,
  bufferFolderName = '',
  onSelectBufferFolder,
  combineTargetFolderName = '',
  onSelectCombineTargetFolder,
  combineMoveMode = 'move',
  onChangeCombineMoveMode,
  combineDedup1G1R = true,
  onChangeCombineDedup1G1R,
  combineSortFolders = true,
  onChangeCombineSortFolders,
  combineAddToLibrary = true,
  onChangeCombineAddToLibrary,
  bufferPreviewItems = [],
  onRunBufferAutoProcess,
  onDownloadBufferCmdScript,
  isNativeDesktopHost = false,
  onDownloadExe,
  onDownloadZip,
  onAddLog,
  emulatorCustomPaths = {},
  starredEmulatorsByConsole = {},
  onUpdateEmulatorConfig,
}) => {
  const { lang, setLang, locale, t, tf } = useI18n();
  const activeCollator = useMemo(
    () => new Intl.Collator(locale, { sensitivity: 'base', numeric: true }),
    [locale]
  );
  const [previewTab, setPreviewTab] = useState<'library' | 'tools' | 'builds' | 'env'>('library');
  const [toolsMode, setToolsMode] = useState<'library' | 'sd_folder' | 'combine'>('library');
  useEffect(() => {
    if (!navigateRequest) return;
    setPreviewTab(navigateRequest.target.tab);
    if (navigateRequest.target.toolsMode) setToolsMode(navigateRequest.target.toolsMode);
  }, [navigateRequest?.nonce]);
  const [renameOnSortRules, setRenameOnSortRules] = useState<boolean>(true);
  const [librarySyncModalOpen, setLibrarySyncModalOpen] = useState<boolean>(false);
  const [selectedDiscIndex, setSelectedDiscIndex] = useState<number | null>(null);
  const [quickTestReq, setQuickTestReq] = useState<QuickTestRequest | null>(null);
  const [envInitialSubTab, setEnvInitialSubTab] = useState<'emulators' | 'bios'>('emulators');
  // Подвкладка «BIOS» открывается один раз по ссылке из быстрого теста, дальше снова «Эмуляторы».
  useEffect(() => {
    if (previewTab !== 'env') setEnvInitialSubTab('emulators');
  }, [previewTab]);

  // Shared Saved Builds state across Library (+ button Modal) and Builds tab
  const [savedBuilds, setSavedBuilds] = useState<SavedBuildRecord[]>(() => loadSavedBuildsLocal());
  const [addToBuildGame, setAddToBuildGame] = useState<UnifiedGameRow | null>(null);
  const [newBuildNameInput, setNewBuildNameInput] = useState<string>('');

  // Mass Operations state in Combine tab
  const [massFilter, setMassFilter] = useState<
    'checked' | 'duplicates_1g1r' | 'region_jpn' | 'bad_dumps' | 'console_active'
  >('checked');
  const [massSplitMode, setMassSplitMode] = useState<
    'by_console' | 'alphabetical' | 'disc_vs_cartridge' | 'multidisc_subfolders'
  >('by_console');
  const [confirmMassDelete, setConfirmMassDelete] = useState<boolean>(false);

  useEffect(() => {
    let active = true;
    void syncSavedBuildsWithServer().then((serverList) => {
      if (active && serverList.length > 0) {
        setSavedBuilds(serverList);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const handleSavedBuildsChanged = useCallback((next: SavedBuildRecord[]) => {
    setSavedBuilds(next);
    void syncSavedBuildsWithServer(next);
  }, []);

  const buildItemFromGame = (game: UnifiedGameRow): SavedBuildItem => {
    const consoleFolder = (game.consoleShort || 'psx').toLowerCase();
    const ext =
      game.sourceExt ||
      (game.cleanFile.includes('.')
        ? game.cleanFile.slice(game.cleanFile.lastIndexOf('.')).toLowerCase()
        : '.rom');
    const cleanFileName = (game.cleanFile || game.oldFile || `${game.title}${ext}`)
      .split(/[\\/]/)
      .pop()!
      .replace(/\s*\(\d+\s+диск[^)]*\)$/i, '')
      .trim();
    const isMulti = Boolean(game.isMultiDisc && game.multiDiscFolderName && game.m3uFileName);
    const targetPath = isMulti
      ? `${consoleFolder}/${game.multiDiscFolderName}/${game.m3uFileName}`
      : `${consoleFolder}/${cleanFileName}`;
    return {
      gameId: game.id,
      title: game.title,
      consoleShort: game.consoleShort.toUpperCase(),
      cleanFile: cleanFileName,
      oldFile: game.oldFile,
      region: game.region || 'USA',
      crc32: game.crc32 || 'A1B2C3D4',
      sourceExt: ext,
      targetExt: ext,
      folderPath: consoleFolder,
      targetPath,
      discCount: game.discCount || game.discs?.length,
      m3uFileName: game.m3uFileName,
    };
  };

  const handleAddGameToBuild = (
    game: UnifiedGameRow,
    existingBuildId: string | null,
    customNewName?: string
  ) => {
    const newItem = buildItemFromGame(game);
    const nowIso = new Date().toISOString();

    if (existingBuildId) {
      const nextBuilds = savedBuilds.map((b) => {
        if (b.id !== existingBuildId) return b;
        const already = b.items.some(
          (it) =>
            it.gameId === game.id ||
            (it.consoleShort === newItem.consoleShort &&
              buildSyncComparisonKey(it.title, it.cleanFile) ===
                buildSyncComparisonKey(game.title, game.cleanFile))
        );
        if (already) return b;
        return {
          ...b,
          updatedAt: nowIso,
          items: [...b.items, newItem],
        };
      });
      handleSavedBuildsChanged(nextBuilds);
      const targetName =
        savedBuilds.find((b) => b.id === existingBuildId)?.name || t('builds.saved.defaultName');
      onAddLog?.(
        tf('lib.addToBuildSuccessLog', {
          title: game.title,
          console: game.consoleShort,
          build: targetName,
        })
      );
      setAddToBuildGame(null);
      return;
    }

    const trimmedName = (customNewName || '').trim();
    if (!trimmedName) return;
    const createdBuild: SavedBuildRecord = {
      id: `build_${Date.now()}`,
      name: trimmedName,
      targetProfileId: 'r36s_arkos',
      targetProfileName: 'R36S (ArkOS / DarkOS)',
      flashCapacityTier: 64,
      formatOverrides: {},
      createdAt: nowIso,
      updatedAt: nowIso,
      items: [newItem],
      portMasterSlugs: [],
    };
    handleSavedBuildsChanged([createdBuild, ...savedBuilds]);
    onAddLog?.(
      tf('lib.newBuildAndAddLog', {
        build: trimmedName,
        title: game.title,
        console: game.consoleShort,
      })
    );
    setNewBuildNameInput('');
    setAddToBuildGame(null);
  };

  // Shared PortMaster state across Environment (tab 4) and Builds (tab 3)
  const [portMasterCatalog, setPortMasterCatalog] = useState<PortMasterGame[]>([]);
  const [portMasterBuildSlugs, setPortMasterBuildSlugs] = useState<string[]>([]);
  const [portMasterSourceConfigs, setPortMasterSourceConfigs] = useState<
    Record<string, PortMasterSourceConfig>
  >({});

  const handleTogglePortMasterBuild = (port: PortMasterGame) => {
    setPortMasterBuildSlugs((prev) => {
      const exists = prev.includes(port.slug);
      const next = exists ? prev.filter((s) => s !== port.slug) : [...prev, port.slug];
      onAddLog?.(
        exists
          ? tf('lib.pmRemovedFromBuildLog', { title: port.title })
          : tf('lib.pmAddedToBuildLog', { title: port.title, path: port.requiredDataTargetPath })
      );
      return next;
    });
  };

  // Dynamic Sidebar Grouping Mode: 'console' | 'bitness' | 'genre' | 'age'
  const [sidebarGroupBy, setSidebarGroupBy] = useState<
    'console' | 'bitness' | 'genre' | 'age'
  >('console');
  const [activeSidebarFilterKey, setActiveSidebarFilterKey] = useState<string>('ALL');

  // Library Main Sorting Mode: 'title' | 'console' | 'bitness' | 'genre' | 'age' | 'size'
  const [librarySortBy, setLibrarySortBy] = useState<
    'title' | 'console' | 'bitness' | 'genre' | 'age' | 'size' | 'status'
  >('title');
  // Фильтр по статусу: оригиналы, переводы, хаки, прочие патчи. / Status filter: originals, translations, hacks, other patches.
  const [libraryModFilter, setLibraryModFilter] = useState<'all' | 'modded' | RomModGroup>('all');
  // Коллекции: в «Все» одна карточка на игру, версии с других консолей под кнопкой.
  // Collections: in "All" one card per game, versions from other consoles behind a button.
  const [groupCollections, setGroupCollections] = useState<boolean>(() => {
    try {
      return localStorage.getItem('aegis.lib.collections') !== '0';
    } catch {
      return true;
    }
  });
  const [collectionModalLeadId, setCollectionModalLeadId] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedGameId, setSelectedGameId] = useState<string>('g1');
  const [checkedGameIds, setCheckedGameIds] = useState<Record<string, boolean>>({
    g1: true,
    g2: true,
    g3: true,
    g6: true,
    g7: true,
    g8: true,
  });

  // ==========================================================================
  // MULTI-DATABASE SWITCHER & OPEN DB BY FILE WITHOUT RE-SCANNING
  // ==========================================================================
  interface NamedDatabaseEntry {
    id: string;
    name: string;
    pathHint: string;
    updatedAt: string;
    rows: UnifiedGameRow[];
  }

  const [savedDatabases, setSavedDatabases] = useState<NamedDatabaseEntry[]>(() => {
    const sampleDefaultGames = buildSampleDefaultGames();
    const portableSubset = BUILTIN_EXTENDED_GAMES.filter((g) =>
      ['GBA', 'NES', 'GENESIS', 'SNES'].includes(g.consoleShort.toUpperCase())
    );
    const defaultDbs: NamedDatabaseEntry[] = [
      {
        id: 'db_master_full',
        name: tStatic('lib.defaultDbFullName'),
        pathHint: 'D:/AegisROM_MasterLibrary/aegisrom_db.json',
        updatedAt: '2026-11-13',
        rows: [
          ...sampleDefaultGames,
          ...BUILTIN_EXTENDED_GAMES.filter((b) => !sampleDefaultGames.some((d) => d.title === b.title)),
        ],
      },
      {
        id: 'db_portable_retro',
        name: tStatic('lib.defaultDbPortableName'),
        pathHint: 'E:/Portable_Collection/aegisrom_portable_db.json',
        updatedAt: '2026-11-13',
        rows: portableSubset,
      },
    ];
    try {
      const raw =
        localStorage.getItem('aegisrom_v0_5_multi_dbs') ||
        localStorage.getItem('aegisrom_v5_multi_dbs');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return sanitizeDatabasesForStorage(parsed);
        }
      }
    } catch {}
    return defaultDbs;
  });

  const [activeDbId, setActiveDbId] = useState<string>('db_master_full');
  const openDbFileInputRef = useRef<HTMLInputElement | null>(null);
  const mainScrollRef = useRef<HTMLElement | null>(null);
  const hydratedDbIdsRef = useRef<Set<string>>(new Set());
  const [, startUiTransition] = useTransition();
  const deferredSearchQuery = useDeferredValue(searchQuery);

  // Asynchronously restore large databases from IndexedDB without blocking first paint
  useEffect(() => {
    let alive = true;
    loadMultiDbsFromIndexedDB().then((idbDbs) => {
      if (!alive || !idbDbs || idbDbs.length === 0) return;
      const sanitized = sanitizeDatabasesForStorage(idbDbs as NamedDatabaseEntry[]);
      setSavedDatabases((prev) => {
        const prevMax = prev.reduce((m, d) => Math.max(m, d.rows?.length || 0), 0);
        const idbMax = sanitized.reduce((m, d) => Math.max(m, d.rows?.length || 0), 0);
        // Only adopt IDB state if current live state hasn't scanned something larger yet
        if (prevMax <= 50 && idbMax >= prevMax) {
          const firstLarge = sanitized.find((d) => (d.rows?.length || 0) > 40) || sanitized[0];
          if (firstLarge) {
            setActiveDbId(firstLarge.id);
            if (firstLarge.rows?.[0]) setSelectedGameId(firstLarge.rows[0].id);
          }
          return sanitized;
        }
        return prev;
      });
    });
    return () => {
      alive = false;
    };
  }, []);

  const libraryPortSlugs = React.useMemo(() => {
    const slugs: string[] = [];
    const db = savedDatabases.find((d) => d.id === activeDbId) || savedDatabases[0];
    for (const r of db?.rows || []) {
      if (r.portMasterSlug) slugs.push(r.portMasterSlug);
    }
    return slugs;
  }, [savedDatabases, activeDbId]);

  const handleAddPortMasterToLibrary = (port: PortMasterGame) => {
    const newRow: UnifiedGameRow = {
      id: `pm_lib_${port.slug}`,
      title: port.title,
      oldFile: `${port.slug}.sh`,
      cleanFile: `${port.title}.sh`,
      console: t('cat.portmasterName'),
      consoleShort: 'PORTS',
      bitness: '64-bit',
      region: 'PORT',
      genre: port.genres?.[0] || t('app.port.genreFallback'),
      year: 2022,
      size: port.readyToRun ? t('app.port.rtrSize') : t('app.port.dataSize'),
      crc32: port.md5 ? port.md5.slice(0, 8).toUpperCase() : 'PORTMAST',
      serial: `PM-${port.slug.toUpperCase().slice(0, 12)}`,
      emulator: port.readyToRun ? 'PortMaster (PC / Box64 / LÖVE) ★' : 'PortMaster (WSL2 / PC) ★',
      status: port.readyToRun ? t('app.port.rtrStatus') : t('app.port.needsDataStatus'),
      boxArtUrl: port.coverUrl,
      sourceExt: '.sh',
      relativePath: `ports/${port.slug}.sh`,
      portMasterSlug: port.slug,
      portMasterDataPath: port.requiredDataTargetPath,
    };
    let nextActionMsg = '';
    setSavedDatabases((prev) => {
      const updated = prev.map((db, idx) => {
        if (db.id !== activeDbId && !(activeDbId === '' && idx === 0)) return db;
        const existsIdx = db.rows.findIndex(
          (r) => r.portMasterSlug === port.slug || r.id === newRow.id
        );
        let nextRows: UnifiedGameRow[];
        if (existsIdx >= 0) {
          nextRows = db.rows.filter((_, i) => i !== existsIdx);
          nextActionMsg = tf('lib.portRemovedLog', { title: port.title });
        } else {
          nextRows = [newRow, ...db.rows];
          nextActionMsg = tf('lib.portAddedLog', { title: port.title });
        }
        return {
          ...db,
          updatedAt: new Date().toLocaleTimeString(locale, { hour12: false }),
          rows: nextRows,
        };
      });
      persistDatabasesSafely(updated);
      return updated;
    });
    if (nextActionMsg) {
      onAddLog?.(nextActionMsg);
    }
  };

  const hydrateDbRowsMedia = async (
    targetDbId: string,
    rows: UnifiedGameRow[],
    pathHint?: string
  ) => {
    if (!onResolveMediaForDbRows || rows.length === 0) return;
    const needsHydration = rows.some(
      (r) => !r.boxArtUrl || isDeadOrLocalBlobUrl(r.boxArtUrl) || isDeadOrLocalBlobUrl(r.videoUrl)
    );
    if (!needsHydration) return;
    const hydrated = await onResolveMediaForDbRows(rows, pathHint);
    setSavedDatabases((prev) => {
      const updated = prev.map((db) =>
        db.id === targetDbId ? { ...db, rows: hydrated } : db
      );
      persistDatabasesSafely(updated);
      return updated;
    });
  };

  // Sync scannedRows from App.tsx into savedDatabases WITHOUT wiping existing DB in append mode!
  useEffect(() => {
    if (!scannedRows || scannedRows.length === 0) return;

    const nowTime = new Date().toLocaleTimeString(locale, { hour12: false });
    setSavedDatabases((prev) => {
      const targetId =
        lastScanMode === 'append' && prev.some((d) => d.id === activeDbId && d.id !== 'db_master_full' && d.id !== 'db_portable_retro')
          ? activeDbId
          : 'db_scanned_live';

      const existingTarget = prev.find((d) => d.id === targetId);
      let nextRows: UnifiedGameRow[] = scannedRows;

      if (lastScanMode === 'append' && existingTarget) {
        const mapByKey = new Map<string, UnifiedGameRow>();
        for (const r of existingTarget.rows) {
          const k = `${r.consoleShort.toUpperCase()}::${r.id}`;
          mapByKey.set(k, r);
        }
        for (const r of scannedRows) {
          const k = `${r.consoleShort.toUpperCase()}::${r.id}`;
          mapByKey.set(k, r);
        }
        nextRows = Array.from(mapByKey.values());
      }

      const scanDbName =
        targetId === 'db_scanned_live'
          ? tf('lib.scannedDbName', {
              folder: selectedFolderName || t('app.defaultFolderLabel'),
              count: nextRows.length,
            })
          : tf('lib.combinedDbName', { count: nextRows.length });

      const nextEntry: NamedDatabaseEntry = {
        id: targetId,
        name: scanDbName,
        pathHint: existingTarget?.pathHint || `${selectedFolderName || libraryPath}/aegisrom_db.json`,
        updatedAt: nowTime,
        rows: nextRows,
      };

      const others = prev.filter((d) => d.id !== targetId);
      const nextList = [nextEntry, ...others];
      persistDatabasesSafely(nextList);
      return nextList;
    });

    if (
      lastScanMode === 'replace' ||
      activeDbId === 'db_master_full' ||
      activeDbId === 'db_portable_retro'
    ) {
      setActiveDbId('db_scanned_live');
    }
    setActiveSidebarFilterKey('ALL');
  }, [scannedRows, scanRevision, lastScanMode, selectedFolderName, libraryPath]);

  // Apply selective sync diff changes (from SyncDiffModal) into active DB cleanly
  const handleApplyLibrarySyncEntries = (
    entriesToApply: SyncDiffEntry[],
    sourceName: string
  ) => {
    setSavedDatabases((prev) =>
      prev.map((db) => {
        if (db.id !== activeDbId && db !== prev[0]) return db;
        const nextRows = [...db.rows];
        let added = 0;
        let replaced = 0;
        let keptBoth = 0;

        for (const ent of entriesToApply) {
          if (!ent.externalRow) continue;
          if (ent.action === 'add') {
            nextRows.push({
              ...ent.externalRow,
              status: tf('lib.addedFromSyncStatus', { source: sourceName }),
            });
            added++;
          } else if (ent.action === 'replace_library' && ent.libraryRow) {
            const idx = nextRows.findIndex((r) => r.id === ent.libraryRow!.id);
            const replacement = {
              ...ent.externalRow,
              status: tf('lib.replacedFromSyncStatus', {
                label: ent.externalEditionLabel || ent.externalRow.region,
              }),
            };
            if (idx >= 0) nextRows[idx] = replacement;
            else nextRows.push(replacement);
            replaced++;
          } else if (ent.action === 'keep_both') {
            nextRows.push({
              ...ent.externalRow,
              id: `${ent.externalRow.id}_ed_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              status: tf('lib.extraEditionStatus', {
                label: ent.externalEditionLabel || ent.externalRow.region,
              }),
            });
            keptBoth++;
          }
        }

        onAddLog?.(
          tf('lib.syncAppliedLog', {
            source: sourceName,
            added,
            replaced,
            kept: keptBoth,
          })
        );

        return {
          ...db,
          updatedAt: new Date().toLocaleTimeString(locale, { hour12: false }),
          rows: nextRows,
        };
      })
    );
  };

  // Open an existing Database file (.json) directly without scanning folders!
  const handleOpenDatabaseFromFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      let loadedRows: UnifiedGameRow[] = [];

      if (parsed && !Array.isArray(parsed) && parsed.manualEdits) {
        const n = importManualEdits(parsed.manualEdits);
        if (n > 0) onAddLog?.(tf('ed.importedLog', { count: n }));
      }
      if (Array.isArray(parsed)) {
        loadedRows = parsed;
      } else if (parsed && Array.isArray(parsed.rows)) {
        loadedRows = parsed.rows;
      } else if (parsed && Array.isArray(parsed.records)) {
        loadedRows = parsed.records.map((rec: any, idx: number) => ({
          id: rec.id || `dbfile_${idx}`,
          title: rec.title || rec.cleanTitle || rec.fileName || `Game #${idx + 1}`,
          oldFile: rec.sdCardFileName || rec.fileName || 'rom.chd',
          cleanFile: rec.fileName || rec.canonicalName || 'rom.chd',
          console: rec.console || (rec.consoleCode ? rec.consoleCode.toUpperCase() : 'PlayStation 1'),
          consoleShort: (rec.consoleShort || rec.consoleCode || 'PSX').toUpperCase(),
          bitness: rec.bitness || rec.generationShort || '32-bit',
          region: rec.region || (rec.isRussian ? 'RUS' : 'USA'),
          genre: rec.genre || t('genre.action'),
          year: Number(rec.year) || 1998,
          size:
            rec.size ||
            (rec.fileSize
              ? `${(rec.fileSize / (1024 * 1024)).toFixed(1)} ${t('size.mb')}`
              : `350 ${t('size.mb')}`),
          crc32: rec.crc32 || 'A1B2C3D4',
          serial: rec.serial || rec.crc32 || 'SLUS-00001',
          emulator: rec.emulator || 'RetroArch ★',
          status: t('lib.loadedFromFileStatus'),
          boxArtUrl: rec.boxArtUrl || rec.scrapedBoxArtUrl,
          videoUrl: rec.videoUrl || rec.scrapedVideoUrl,
        }));
      }

      if (loadedRows.length > 0) {
        const collapsedLoaded = collapseMultiDiscUnifiedRows(loadedRows);
        const sanitizedRows = collapsedLoaded.map((r) => ({
          ...r,
          boxArtUrl: isDeadOrLocalBlobUrl(r.boxArtUrl) ? undefined : r.boxArtUrl,
          videoUrl: isDeadOrLocalBlobUrl(r.videoUrl) ? undefined : r.videoUrl,
        }));
        const newDbId = `db_file_${Date.now()}`;
        const pathHint = parsed?.libraryPath || libraryPath || file.name;
        const newEntry: NamedDatabaseEntry = {
          id: newDbId,
          name: tf('lib.fileDbName', { file: file.name, count: sanitizedRows.length }),
          pathHint,
          updatedAt: new Date().toLocaleTimeString(locale, { hour12: false }),
          rows: sanitizedRows,
        };
        setSavedDatabases((prev) => {
          const updated = [newEntry, ...prev];
          persistDatabasesSafely(updated);
          return updated;
        });
        setActiveDbId(newDbId);
        setActiveSidebarFilterKey('ALL');
        setSelectedGameId(sanitizedRows[0].id);
        onAddLog?.(
          tf('lib.dbOpenedLog', { file: file.name, count: sanitizedRows.length })
        );
        void hydrateDbRowsMedia(newDbId, sanitizedRows, pathHint);
      } else {
        onAddLog?.(tf('lib.dbEmptyFileLog', { file: file.name }));
      }
    } catch (err) {
      onAddLog?.(tf('lib.dbReadErrLog', { file: file.name, err: String(err) }));
    }
    e.target.value = '';
  };

  // Save current active database to a portable .json file (so new app versions can open it immediately without scanning)
  const handleSaveDatabaseToFile = () => {
    const currentDb = savedDatabases.find((d) => d.id === activeDbId) || savedDatabases[0];
    const payload = {
      aegisDatabaseFormat: '0.5',
      databaseName: currentDb?.name || 'AegisROM Library Database',
      libraryPath: effectiveLibraryPath,
      exportedAt: new Date().toISOString(),
      totalGames: gamesSource.length,
      // Ручные правки редактора хранятся отдельно от строк. / Editor manual edits are kept apart from rows.
      manualEdits: exportManualEdits(),
      rows: gamesSource.map((g) => ({
        ...g,
        fileObj: undefined,
        companionFiles: undefined,
        discs: Array.isArray(g.discs)
          ? g.discs.map((d) => ({
              ...d,
              fileObj: undefined,
              companionFiles: undefined,
            }))
          : undefined,
        boxArtUrl: isDeadOrLocalBlobUrl(g.boxArtUrl) ? undefined : g.boxArtUrl,
        videoUrl: isDeadOrLocalBlobUrl(g.videoUrl) ? undefined : g.videoUrl,
      })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeName = (currentDb?.name || 'aegisrom_db')
      .replace(/[^a-zA-Z0-9а-яА-Я_-]/g, '_')
      .slice(0, 40);
    a.download = `${safeName}.aegisdb.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
    onAddLog?.(
      tf('lib.dbSavedLog', {
        name: currentDb?.name || 'AegisDB',
        count: gamesSource.length,
        file: `${safeName}.aegisdb.json`,
      })
    );
  };

  const [isLogModalOpen, setIsLogModalOpen] = useState<boolean>(false);
  const [copiedLogs, setCopiedLogs] = useState<boolean>(false);

  // Local simulated task state when user runs a quick operation without a mounted disk handle
  const [simRunning, setSimRunning] = useState<boolean>(false);
  const [simProgress, setSimProgress] = useState<number>(0);
  const [simActionText, setSimActionText] = useState<string>('');
  const simTimerRef = useRef<number | null>(null);

  const activeDbEntry =
    savedDatabases.find((d) => d.id === activeDbId) || savedDatabases[0];

  const defaultSampleGames = useMemo(
    () => buildSampleDefaultGames(),
    [lang]
  );

  const rawGamesSource =
    activeDbEntry && activeDbEntry.rows.length > 0
      ? activeDbEntry.rows
      : scannedRows.length > 0
      ? scannedRows
      : defaultSampleGames;

  const gamesSource = React.useMemo(() => {
    if (activeDbEntry?.id === 'db_master_full') {
      const sampleMap = new Map(defaultSampleGames.map((g) => [g.id, g]));
      return rawGamesSource.map((r) => sampleMap.get(r.id) || r);
    }
    return rawGamesSource;
  }, [rawGamesSource, activeDbEntry?.id, defaultSampleGames]);

  // Ручные правки редактора поверх строк базы. / Editor manual edits laid over the database rows.
  const manualEditsVersion = useManualEditsVersion();
  const enrichedGamesSource = React.useMemo(
    () => gamesSource.map((g) => enrichGameForBuild(applyManualEditToRow(g))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [gamesSource, manualEditsVersion]
  );
  const [editorEditIds, setEditorEditIds] = useState<string[] | null>(null);
  const editorEditGames = React.useMemo(() => {
    if (!editorEditIds) return [];
    const set = new Set(editorEditIds);
    return enrichedGamesSource.filter((g) => set.has(g.id));
  }, [editorEditIds, enrichedGamesSource]);
  const openEditorForOne = useCallback((id: string) => setEditorEditIds([id]), []);

  const effectiveLibraryPath =
    selectedFolderName || activeDbEntry?.pathHint || libraryPath || 'D:/AegisROM_MasterLibrary';

  // Compute dynamic sidebar items from ALL games actually present in the active database!
  const dynamicSidebarGroups = React.useMemo(() => {
    const map = new Map<string, { key: string; label: string; count: number }>();

    for (const g of enrichedGamesSource) {
      let key = '';
      let label = '';
      if (sidebarGroupBy === 'console') {
        key = g.consoleShort.toUpperCase();
        label = `${g.console || g.consoleShort} (${key})`;
      } else if (sidebarGroupBy === 'bitness') {
        key = g.bitnessGroup;
        label =
          g.bitnessGroup === '8-bit'
            ? t('cat.bit8')
            : g.bitnessGroup === '16-bit'
            ? t('cat.bit16')
            : t('cat.bit32_64');
      } else if (sidebarGroupBy === 'genre') {
        const primaryGenre = (g.genre || t('app.miscGenre')).split('/')[0].trim();
        key = primaryGenre;
        label = localizeGenre(primaryGenre, t);
      } else {
        // 'age'
        key = g.ageRating;
        label =
          g.ageRating === '6+'
            ? t('cat.age6')
            : g.ageRating === '10+'
            ? t('cat.age10')
            : g.ageRating === '14+'
            ? t('cat.age14')
            : t('cat.age18');
      }

      const prev = map.get(key);
      if (prev) {
        prev.count += 1;
      } else {
        map.set(key, { key, label, count: 1 });
      }
    }

    const list = Array.from(map.values());
    if (sidebarGroupBy === 'age') {
      const order: Record<string, number> = { '6+': 1, '10+': 2, '14+': 3, '18+': 4 };
      list.sort((a, b) => (order[a.key] || 99) - (order[b.key] || 99));
    } else if (sidebarGroupBy === 'bitness') {
      const order: Record<string, number> = { '8-bit': 1, '16-bit': 2, '32/64-bit': 3 };
      list.sort((a, b) => (order[a.key] || 99) - (order[b.key] || 99));
    } else {
      list.sort((a, b) => b.count - a.count || activeCollator.compare(a.label, b.label));
    }

    return list;
  }, [enrichedGamesSource, sidebarGroupBy, t, activeCollator]);

  const filteredGames = React.useMemo(() => {
    const q = deferredSearchQuery.trim().toLowerCase();
    const hasQuery = q.length > 0;
    const filtered: typeof enrichedGamesSource = [];

    for (let i = 0; i < enrichedGamesSource.length; i++) {
      const g = enrichedGamesSource[i];
      if (activeSidebarFilterKey !== 'ALL') {
        if (sidebarGroupBy === 'console' && g.consoleShort.toUpperCase() !== activeSidebarFilterKey) {
          continue;
        }
        if (sidebarGroupBy === 'bitness' && g.bitnessGroup !== activeSidebarFilterKey) {
          continue;
        }
        if (sidebarGroupBy === 'genre') {
          const primaryGenre = (g.genre || t('app.miscGenre')).split('/')[0].trim();
          if (primaryGenre !== activeSidebarFilterKey) continue;
        }
        if (sidebarGroupBy === 'age' && g.ageRating !== activeSidebarFilterKey) {
          continue;
        }
      }
      if (libraryModFilter !== 'all') {
        const grp = modGroup((g.modKind as RomModKind) || 'original');
        if (libraryModFilter === 'modded' ? grp === 'original' : grp !== libraryModFilter) continue;
      }
      if (hasQuery) {
        const hit =
          g.title.toLowerCase().includes(q) ||
          g.oldFile.toLowerCase().includes(q) ||
          g.cleanFile.toLowerCase().includes(q) ||
          g.serial.toLowerCase().includes(q) ||
          g.genre.toLowerCase().includes(q) ||
          g.console.toLowerCase().includes(q);
        if (!hit) continue;
      }
      filtered.push(g);
    }

    const ageRank: Record<string, number> = { '6+': 1, '10+': 2, '14+': 3, '18+': 4 };
    const bitRank: Record<string, number> = { '8-bit': 1, '16-bit': 2, '32/64-bit': 3 };

    filtered.sort((a, b) => {
      if (librarySortBy === 'title') {
        return activeCollator.compare(a.title, b.title);
      }
      if (librarySortBy === 'console') {
        return (
          SHORT_COLLATOR.compare(a.consoleShort, b.consoleShort) ||
          activeCollator.compare(a.title, b.title)
        );
      }
      if (librarySortBy === 'bitness') {
        return (
          (bitRank[a.bitnessGroup] || 9) - (bitRank[b.bitnessGroup] || 9) ||
          activeCollator.compare(a.title, b.title)
        );
      }
      if (librarySortBy === 'genre') {
        return (
          activeCollator.compare(a.genre, b.genre) ||
          activeCollator.compare(a.title, b.title)
        );
      }
      if (librarySortBy === 'age') {
        return (
          (ageRank[a.ageRating] || 9) - (ageRank[b.ageRating] || 9) ||
          activeCollator.compare(a.title, b.title)
        );
      }
      if (librarySortBy === 'size') {
        return b.sizeMB - a.sizeMB;
      }
      if (librarySortBy === 'status') {
        return (
          (MOD_SORT_RANK[modGroup((a.modKind as RomModKind) || 'original')] || 9) -
            (MOD_SORT_RANK[modGroup((b.modKind as RomModKind) || 'original')] || 9) ||
          activeCollator.compare(a.title, b.title)
        );
      }
      return 0;
    });

    return filtered;
  }, [enrichedGamesSource, activeSidebarFilterKey, sidebarGroupBy, deferredSearchQuery, librarySortBy, libraryModFilter, t, activeCollator]);

  // В редакторе (таблица файлов) нужны все файлы, поэтому там коллекции не сворачиваются.
  // The editor (file table) needs every file, so collections are not collapsed there.
  const collectionsActive =
    groupCollections && activeSidebarFilterKey === 'ALL' && selectedConcept !== 'concept_c_workbench';

  const groupedLibraryView = React.useMemo(() => {
    if (!collectionsActive) return null;
    const cols = buildCollections(filteredGames);
    const badges = new Map<string, LibraryCollectionBadge>();
    const leadOf = new Map<string, string>();
    const membersByLead = new Map<string, typeof filteredGames>();
    for (const c of cols) {
      badges.set(c.lead.id, { count: c.members.length, consoles: c.consoles });
      membersByLead.set(c.lead.id, c.members);
      for (const m of c.members) leadOf.set(m.id, c.lead.id);
    }
    return { games: cols.map((c) => c.lead), badges, leadOf, membersByLead };
  }, [collectionsActive, filteredGames]);

  // Индекс по всей библиотеке для правой панели (не зависит от фильтров).
  // Whole-library index for the right panel (does not depend on filters).
  const libraryCollectionIndex = React.useMemo(
    () => indexCollections(enrichedGamesSource),
    [enrichedGamesSource]
  );
  const libraryLeadByKey = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const [k, c] of libraryCollectionIndex.byKey) m.set(k, c.lead.id);
    return m;
  }, [libraryCollectionIndex]);

  const selectedGame = React.useMemo(
    () =>
      enrichedGamesSource.find((g) => g.id === selectedGameId) ||
      BUILTIN_EXTENDED_GAMES.find((g) => g.id === selectedGameId) ||
      filteredGames[0] ||
      enrichedGamesSource[0],
    [enrichedGamesSource, selectedGameId, filteredGames]
  );

  // Compute matched items for Mass Operations inside Combine Tab
  const massMatchedGames = React.useMemo(() => {
    if (massFilter === 'checked') {
      return enrichedGamesSource.filter((g) => Boolean(checkedGameIds[g.id]));
    }
    if (massFilter === 'region_jpn') {
      return enrichedGamesSource.filter((g) =>
        ['JPN', 'JAPAN', 'JP'].includes((g.region || '').toUpperCase())
      );
    }
    if (massFilter === 'bad_dumps') {
      return enrichedGamesSource.filter((g) => {
        const hay = `${g.oldFile} ${g.cleanFile} ${g.status}`.toLowerCase();
        return (
          hay.includes('beta') ||
          hay.includes('proto') ||
          hay.includes('[b') ||
          hay.includes('bad') ||
          hay.includes('hack') ||
          hay.includes('bootleg')
        );
      });
    }
    if (massFilter === 'duplicates_1g1r') {
      const seen = new Set<string>();
      const dups: typeof enrichedGamesSource = [];
      for (const g of enrichedGamesSource) {
        const key = `${g.consoleShort.toUpperCase()}::${buildSyncComparisonKey(
          g.title,
          g.cleanFile || g.oldFile
        )}`;
        if (seen.has(key)) {
          dups.push(g);
        } else {
          seen.add(key);
        }
      }
      return dups;
    }
    // 'console_active': use current filteredGames
    return filteredGames;
  }, [massFilter, enrichedGamesSource, checkedGameIds, filteredGames]);

  const modeShortCode = t(`header.viewShort.${selectedConcept}`);

  const handleSelectGame = useCallback((id: string) => {
    setSelectedGameId(id);
    setSelectedDiscIndex(null);
  }, []);

  const toggleCheckGame = useCallback((id: string) => {
    setCheckedGameIds((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const updateLiveTaskProgress = (running: boolean, pct: number, text: string) => {
    if (simTimerRef.current) {
      window.clearInterval(simTimerRef.current);
      simTimerRef.current = null;
    }
    setSimRunning(running);
    setSimProgress(Math.max(0, Math.min(100, pct)));
    if (text) setSimActionText(text);
  };

  const startSimulatedProgressTask = (taskLabel: string, steps: string[]) => {
    if (simTimerRef.current) {
      window.clearInterval(simTimerRef.current);
    }
    setSimRunning(true);
    setSimProgress(6);
    setSimActionText(steps[0] || taskLabel);
    onAddLog?.(`▶ ${tf('status.simStarted', { label: taskLabel })}`);

    let currentPct = 6;
    simTimerRef.current = window.setInterval(() => {
      currentPct += 12;
      if (currentPct >= 100) {
        if (simTimerRef.current) window.clearInterval(simTimerRef.current);
        simTimerRef.current = null;
        setSimProgress(100);
        const doneMsg = `✔ ${tf('status.simDone', { label: taskLabel })}`;
        setSimActionText(doneMsg);
        onAddLog?.(doneMsg);
        window.setTimeout(() => {
          setSimRunning(false);
          setSimProgress(0);
        }, 1200);
      } else {
        setSimProgress(currentPct);
        const stepIdx = Math.min(
          steps.length - 1,
          Math.floor((currentPct / 100) * steps.length)
        );
        const stepText = steps[stepIdx] || taskLabel;
        setSimActionText(stepText);
        if (currentPct === 30 || currentPct === 66) {
          onAddLog?.(`[${currentPct}%] ${stepText}`);
        }
      }
    }, 280);
  };

  const handleStopAll = () => {
    if (simTimerRef.current) {
      window.clearInterval(simTimerRef.current);
      simTimerRef.current = null;
    }
    setSimRunning(false);
    setSimProgress(0);
    setSimActionText(`⏹ ${t('status.stoppedByUser')}`);
    onEmergencyStop?.();
  };

  useEffect(() => {
    return () => {
      if (simTimerRef.current) window.clearInterval(simTimerRef.current);
    };
  }, []);

  // Clear old simulated action text whenever a real background operation starts so the bottom bar shows the live task
  useEffect(() => {
    if (isAnyProcessRunning) {
      if (simTimerRef.current) {
        window.clearInterval(simTimerRef.current);
        simTimerRef.current = null;
      }
      setSimRunning(false);
      setSimActionText('');
    }
  }, [isAnyProcessRunning]);

  // Automatically hydrate cover art & video previews for active DB when permissions are granted or DB is loaded
  // A newly granted folder invalidates earlier attempts: they ran without local access.
  const lastMediaAccessVersionRef = useRef(mediaAccessVersion);
  useEffect(() => {
    if (!activeDbEntry || activeDbEntry.rows.length === 0) return;
    if (lastMediaAccessVersionRef.current !== mediaAccessVersion) {
      lastMediaAccessVersionRef.current = mediaAccessVersion;
      hydratedDbIdsRef.current.clear();
    }
    if (pendingRestoreHandles.length === 0 && !hydratedDbIdsRef.current.has(activeDbEntry.id)) {
      const hasStaleOrMissing = activeDbEntry.rows.some(
        (r) => !r.boxArtUrl || isDeadOrLocalBlobUrl(r.boxArtUrl) || isDeadOrLocalBlobUrl(r.videoUrl)
      );
      if (hasStaleOrMissing) {
        hydratedDbIdsRef.current.add(activeDbEntry.id);
        void hydrateDbRowsMedia(activeDbEntry.id, activeDbEntry.rows, activeDbEntry.pathHint);
      }
    }
  }, [activeDbEntry?.id, pendingRestoreHandles.length, mediaAccessVersion]);

  // Keep native desktop Go server alive via regular heartbeat while window is open
  useEffect(() => {
    if (
      !isNativeDesktopHost &&
      window.location.hostname !== '127.0.0.1' &&
      window.location.hostname !== 'localhost'
    ) {
      return;
    }
    const ping = () => {
      fetch('/api/native/heartbeat', { method: 'POST' }).catch(() => {});
    };
    ping();
    const id = window.setInterval(ping, 3000);
    return () => window.clearInterval(id);
  }, [isNativeDesktopHost]);

  // Effective progress & single-line status text for the bottom bar
  const activeRunning = isAnyProcessRunning || simRunning;
  const activePct = isAnyProcessRunning ? Math.max(progressPct, 5) : simRunning ? simProgress : 0;

  const latestLogLine =
    logs.length > 0
      ? logs[logs.length - 1]
      : t('status.readyIdle');

  const statusLineText = isAnyProcessRunning
    ? currentActionText || latestLogLine
    : simRunning
    ? simActionText || latestLogLine
    : currentActionText || simActionText || latestLogLine;

  // Narrow windows (<1024px): the inspector slides over the content; open it when a game is picked.
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const inspectorSkipFirstRef = useRef(true);
  useEffect(() => {
    if (inspectorSkipFirstRef.current) {
      inspectorSkipFirstRef.current = false;
      return;
    }
    // Only the Library shows the game inspector; other sections select games without opening it.
    if (previewTab === 'library') setInspectorOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGameId]);
  useEffect(() => {
    setInspectorOpen(false);
  }, [previewTab]);

  // Tools: the right panel describes the tool under the pointer / keyboard focus.
  const [hoveredTool, setHoveredTool] = useState<HoveredTool | null>(null);
  useEffect(() => {
    setHoveredTool(null);
  }, [previewTab, toolsMode]);
  const handleToolHover = (e: React.SyntheticEvent) => {
    const el = (e.target as HTMLElement).closest?.('[data-tool]') as HTMLElement | null;
    if (!el) return;
    const id = el.dataset.tool || '';
    if (hoveredTool?.id === id) return;
    const label = (el.textContent || el.getAttribute('title') || '').trim();
    setHoveredTool({ id, label });
  };
  const contextStats = React.useMemo(() => {
    const consoles = new Set<string>();
    let noCover = 0;
    let multiDisc = 0;
    for (const g of enrichedGamesSource) {
      if (g.consoleShort) consoles.add(g.consoleShort.toUpperCase());
      if (!g.boxArtUrl) noCover++;
      if (g.isMultiDisc || (g.discs && g.discs.length > 1)) multiDisc++;
    }
    return { consoles: consoles.size, noCover, multiDisc };
  }, [enrichedGamesSource]);
  const showContextPanel = previewTab !== 'library';
  useEffect(() => {
    if (!inspectorOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setInspectorOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [inspectorOpen]);

  const handleCopyLogs = () => {
    navigator.clipboard.writeText(logs.join('\n')).catch(() => {});
    setCopiedLogs(true);
    setTimeout(() => setCopiedLogs(false), 2000);
  };

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 select-none transition-colors">
      {/* ==================================================================== */}
      {/* TOP BAR (Exact match to user screenshot + Journal & Install buttons) */}
      {/* ==================================================================== */}
      <header className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-4 h-12 flex items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 shrink-0 z-20">
        <div className="flex items-center gap-2.5 min-w-0" title={APP_FULL_TITLE}>
          <img src="/aegisrom-icon.png" alt="" className="w-6 h-6 rounded-md shrink-0" />
          <span className="text-sm font-bold tracking-tight truncate">{APP_FULL_TITLE}</span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {!isNativeDesktopHost && (
            <a
              href={DOWNLOAD_ZIP_URL}
              download={ZIP_PKG_FILENAME}
              onClick={() => onDownloadZip?.()}
              title={`${t('header.downloadZip')} · ${ZIP_PKG_FILENAME}`}
              className="h-8 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition"
            >
              <Archive className="w-4 h-4" />
              <span className="hidden xl:inline">{t('header.downloadZip')}</span>
            </a>
          )}

          {!isNativeDesktopHost && (
            <a
              href={DOWNLOAD_SETUP_URL}
              download={SETUP_EXE_FILENAME}
              onClick={() => onDownloadExe?.()}
              title={`${t('header.setupExe')} · ${SETUP_EXE_FILENAME}`}
              className="h-8 px-2.5 rounded-lg bg-accent hover:bg-accent-hover text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition"
            >
              <Download className="w-4 h-4" />
              <span className="hidden xl:inline">{t('header.setupExe')}</span>
            </a>
          )}

          {SUPPORT_URL && (
            <a
              href={SUPPORT_URL}
              target="_blank"
              rel="noopener noreferrer"
              title={`${t('coffee.button')}. ${t('coffee.hint')}`}
              aria-label={t('coffee.button')}
              className="h-8 px-2.5 rounded-lg border border-amber-300/70 dark:border-amber-700/60 hover:bg-amber-50 dark:hover:bg-amber-950/40 text-amber-700 dark:text-amber-300 text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition"
            >
              <Coffee className="w-4 h-4" />
              <span className="hidden 2xl:inline">{t('coffee.button')}</span>
            </a>
          )}

          {onOpenSetupWizard && (
            <button
              type="button"
              onClick={onOpenSetupWizard}
              title={t('header.setupWizard')}
              aria-label={t('header.setupWizard')}
              className="w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center cursor-pointer transition"
            >
              <Wand2 className="w-4 h-4" />
            </button>
          )}

          {/* System Language Switcher directly next to Theme Toggle */}
          <div className="h-8 flex items-center gap-1 border border-slate-200 dark:border-slate-700 rounded-lg px-2 text-xs">
            <Globe className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0" />
            <select
              value={lang}
              onChange={(e) => setLang(e.target.value as SupportedLanguage)}
              title={t('header.langLabel')}
              aria-label={t('header.langLabel')}
              className="bg-transparent text-slate-800 dark:text-slate-100 text-xs font-semibold cursor-pointer pr-0.5 max-w-[9.5rem]"
            >
              {SUPPORTED_LANGUAGES.map((l) => (
                <option key={l.code} value={l.code} className="bg-white text-slate-900 dark:bg-slate-900 dark:text-slate-100">
                  {l.shortCode} · {l.nativeLabel}
                </option>
              ))}
            </select>
          </div>

          {/* Theme Switcher Button */}
          <button
            onClick={onToggleDarkMode}
            className="w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center cursor-pointer transition"
            title={isDarkMode ? t('header.themeLight') : t('header.themeDark')}
            aria-label={isDarkMode ? t('header.themeLight') : t('header.themeDark')}
          >
            {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* Hidden File Input for Opening a Ready Database File (.json) Without Scanning */}
      <input
        ref={openDbFileInputRef}
        type="file"
        accept=".json"
        onChange={handleOpenDatabaseFromFile}
        className="hidden"
      />

      {/* ==================================================================== */}
      {/* MAIN 12-COLUMN WORKSPACE (Fills remaining height above status bar)   */}
      {/* ==================================================================== */}
      <div className="aegis-shell flex-1">
        {/* LEFT COLUMN: Sidebar — same in every view; collapses to an icon rail below 1280px */}
        {(
          <aside className="aegis-nav bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 px-3 py-3 flex flex-col min-h-0 overflow-hidden gap-4">
            {(
              <div className="aegis-nav-sections shrink-0">
                <nav className="space-y-0.5" aria-label={t('header.sections')}>
                  {[
                    {
                      id: 'library',
                      label: t('nav.library'),
                      icon: Database,
                      count: String(enrichedGamesSource.length),
                    },
                    { id: 'tools', label: t('nav.tools'), icon: Wrench },
                    { id: 'builds', label: t('nav.builds'), icon: Share2 },
                    { id: 'env', label: t('nav.env'), icon: Gamepad2 },
                  ].map((tab) => {
                    const Icon = tab.icon;
                    const active = previewTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        onClick={() => setPreviewTab(tab.id as any)}
                        title={tab.label}
                        aria-current={active ? 'page' : undefined}
                        className={`aegis-nav-item w-full flex items-center justify-between px-3 h-9 rounded-lg text-[13px] font-semibold transition-colors cursor-pointer ${
                          active
                            ? 'bg-accent-soft text-accent dark:bg-accent-soft-dark dark:text-accent-dark'
                            : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        <span className="flex items-center gap-2.5">
                          <Icon className="w-4 h-4 shrink-0" />
                          <span className="aegis-nav-label">{tab.label}</span>
                        </span>
                        {tab.count && (
                          <span
                            className={`aegis-nav-count text-xs tabular-nums ${
                              active ? 'text-accent dark:text-accent-dark' : 'text-slate-500 dark:text-slate-400'
                            }`}
                          >
                            {tab.count}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </nav>
              </div>
            )}

            {/* DYNAMIC GROUPING & FILTERING OF ALL ROMS FOUND IN THE DATABASE (Full-height list) */}
            <div className="aegis-nav-cats flex-1 flex flex-col min-h-0 w-full">
              <div className="flex items-center justify-between px-3 mb-1.5 shrink-0">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {t('cat.title')}
                </span>
              </div>

              {/* 4-Mode Grouping Switcher */}
              <div className="grid grid-cols-2 gap-0.5 p-0.5 bg-slate-100 dark:bg-slate-800 rounded-lg mb-2 text-[11px] font-semibold shrink-0">
                {[
                  { id: 'console', label: t('cat.byConsole') },
                  { id: 'bitness', label: t('cat.byBitness') },
                  { id: 'genre', label: t('cat.byGenre') },
                  { id: 'age', label: t('cat.byAge') },
                ].map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => {
                      startUiTransition(() => {
                        setSidebarGroupBy(mode.id as any);
                        setActiveSidebarFilterKey('ALL');
                        if (previewTab !== 'library' && previewTab !== 'tools') {
                          setPreviewTab('library');
                        }
                      });
                    }}
                    className={`py-1 px-1.5 rounded-md text-center cursor-pointer transition ${
                      sidebarGroupBy === mode.id
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-2xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto space-y-0.5 pr-1">
                <button
                  onClick={() => {
                    startUiTransition(() => {
                      setActiveSidebarFilterKey('ALL');
                      if (previewTab !== 'library' && previewTab !== 'tools') {
                        setPreviewTab('library');
                      }
                    });
                  }}
                  className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-[13px] transition-colors cursor-pointer ${
                    activeSidebarFilterKey === 'ALL'
                      ? 'bg-accent-soft dark:bg-accent-soft-dark text-accent dark:text-accent-dark font-semibold'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <span className="truncate">
                    {sidebarGroupBy === 'console'
                      ? t('cat.allConsole')
                      : sidebarGroupBy === 'bitness'
                      ? t('cat.allBitness')
                      : sidebarGroupBy === 'genre'
                      ? t('cat.allGenre')
                      : t('cat.allAge')}
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                    {enrichedGamesSource.length}
                  </span>
                </button>

                {dynamicSidebarGroups.map((grp) => (
                  <button
                    key={grp.key}
                    onClick={() => {
                      startUiTransition(() => {
                        setActiveSidebarFilterKey(grp.key);
                        if (previewTab !== 'library' && previewTab !== 'tools') {
                          setPreviewTab('library');
                        }
                      });
                    }}
                    className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-[13px] transition-colors cursor-pointer ${
                      activeSidebarFilterKey === grp.key
                        ? 'bg-accent-soft dark:bg-accent-soft-dark text-accent dark:text-accent-dark font-semibold'
                        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                    title={grp.label}
                  >
                    <span className="truncate">{grp.label}</span>
                    <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums ml-1.5">
                      {grp.count}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </aside>
        )}

        {/* CENTER WORKSPACE COLUMN (Scrollable content area) */}
        <main
          ref={mainScrollRef}
          className="min-w-0 min-h-0 p-5 bg-slate-50 dark:bg-slate-950 overflow-y-auto space-y-3.5"
        >
          {/* ============================================================ */}
          {/* TAB 1: БИБЛИОТЕКА (Чистое отображение ромов + Открыть/Сохранить БД + «+» в сборку) */}
          {/* ============================================================ */}
          {previewTab === 'library' && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2.5 pb-2.5 border-b border-slate-200 dark:border-slate-800">
                <div>
                  <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 flex items-baseline gap-2 flex-wrap">
                    <span>{t('lib.title')}</span>
                    <span className="text-sm font-medium text-slate-500 dark:text-slate-400 tabular-nums">
                      {filteredGames.length === enrichedGamesSource.length
                        ? `${enrichedGamesSource.length} ${t('lib.gamesSuffix')}`
                        : `${filteredGames.length} ${t('lib.gamesOf')} ${enrichedGamesSource.length} ${t('lib.gamesSuffix')}`}
                      {groupedLibraryView && groupedLibraryView.games.length < filteredGames.length
                        ? ` · ${groupedLibraryView.games.length} ${t('coll.countSuffix')}`
                        : ''}
                    </span>
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 break-all">
                    {t('lib.activeDb')} <strong className="text-slate-700 dark:text-slate-200">{activeDbEntry?.name}</strong> · {t('lib.activePath')} <code className="font-mono">{effectiveLibraryPath}</code>
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {/* Library view switcher (tiles / compact list / editor) */}
                  <div
                    className="flex items-center gap-0.5 p-0.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800"
                    role="group"
                    aria-label={t('header.viewLabel')}
                  >
                    {(
                      [
                        ['concept_a_sidebar', t('header.view.a')],
                        ['concept_b_split', t('header.view.b')],
                        ['concept_c_workbench', t('header.view.c')],
                      ] as const
                    ).map(([cid, label]) => (
                      <button
                        key={cid}
                        type="button"
                        onClick={() => onSelectConcept(cid)}
                        aria-pressed={selectedConcept === cid}
                        className={`h-7 px-2.5 rounded-md text-xs font-semibold transition cursor-pointer ${
                          selectedConcept === cid
                            ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-2xs'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  {/* Category filter: replaces the sidebar list when the sidebar is collapsed (<1280px) */}
                  <select
                    value={activeSidebarFilterKey}
                    onChange={(e) => {
                      const key = e.target.value;
                      startUiTransition(() => setActiveSidebarFilterKey(key));
                    }}
                    aria-label={t('cat.title')}
                    className="xl:hidden h-8 max-w-[14rem] bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 text-xs font-semibold text-slate-800 dark:text-slate-100"
                  >
                    <option value="ALL">
                      {sidebarGroupBy === 'console'
                        ? t('cat.allConsole')
                        : sidebarGroupBy === 'bitness'
                        ? t('cat.allBitness')
                        : sidebarGroupBy === 'genre'
                        ? t('cat.allGenre')
                        : t('cat.allAge')}{' '}
                      ({enrichedGamesSource.length})
                    </option>
                    {dynamicSidebarGroups.map((grp) => (
                      <option key={grp.key} value={grp.key}>
                        {grp.label} ({grp.count})
                      </option>
                    ))}
                  </select>

                  {/* Collections toggle */}
                  <button
                    type="button"
                    onClick={() => {
                      const next = !groupCollections;
                      setGroupCollections(next);
                      try {
                        localStorage.setItem('aegis.lib.collections', next ? '1' : '0');
                      } catch {
                        // ignore
                      }
                    }}
                    aria-pressed={groupCollections}
                    title={t('coll.toggleHint')}
                    className={`h-8 px-2.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition ${
                      groupCollections
                        ? 'bg-accent text-white border-accent'
                        : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>{t('coll.toggle')}</span>
                  </button>

                  {/* Sorting Dropdown */}
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="text-slate-500 dark:text-slate-400 font-semibold">{t('lib.sort')}</span>
                    <select
                      value={librarySortBy}
                      onChange={(e) => setLibrarySortBy(e.target.value as any)}
                      className="h-8 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 text-xs font-semibold text-slate-800 dark:text-slate-100"
                    >
                      <option value="title">{t('lib.sort.title')}</option>
                      <option value="console">{t('lib.sort.console')}</option>
                      <option value="bitness">{t('lib.sort.bitness')}</option>
                      <option value="genre">{t('lib.sort.genre')}</option>
                      <option value="age">{t('lib.sort.age')}</option>
                      <option value="size">{t('lib.sort.size')}</option>
                      <option value="status">{t('lib.sort.status')}</option>
                    </select>
                  </div>

                  {/* Status Filter (hacks / translations / patches) */}
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="text-slate-500 dark:text-slate-400 font-semibold">{t('lib.modFilter')}</span>
                    <select
                      value={libraryModFilter}
                      onChange={(e) => setLibraryModFilter(e.target.value as any)}
                      className="h-8 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 text-xs font-semibold text-slate-800 dark:text-slate-100"
                    >
                      <option value="all">{t('lib.modFilter.all')}</option>
                      <option value="original">{t('lib.modFilter.original')}</option>
                      <option value="modded">{t('lib.modFilter.modded')}</option>
                      <option value="translation">{t('lib.modFilter.translation')}</option>
                      <option value="hack">{t('lib.modFilter.hack')}</option>
                      <option value="patched">{t('lib.modFilter.patched')}</option>
                    </select>
                  </div>

                  <div className="relative w-full sm:w-52">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder={t('lib.searchPlaceholder')}
                      className="w-full h-8 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg pl-8 pr-3 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
                    />
                  </div>
                </div>
              </div>

              {/* 1-CLICK PERSISTENT PERMISSION RECOVERY BANNER */}
              {pendingRestoreHandles.length > 0 && onRestoreSavedPermissions && (
                <div className="bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-700 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2.5">
                  <div className="text-xs text-amber-950 dark:text-amber-200 leading-snug min-w-0 flex-1">
                    <strong>🔓 {t('lib.restoreAccessTitle')} {pendingRestoreHandles.length}:</strong>{' '}
                    <span className="font-mono">
                      {pendingRestoreHandles.map((h) => `«${h.folderName}»`).join(', ')}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={onRestoreSavedPermissions}
                    className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold cursor-pointer shrink-0 shadow-2xs"
                  >
                    🔓 {t('lib.restoreAccessBtn')}
                  </button>
                  <div className="basis-full text-[11px] text-amber-900/80 dark:text-amber-300/80 leading-snug">
                    {t('lib.restoreAccessHint')}
                  </div>
                </div>
              )}

              {/* DB opened but no library folder is known: covers can't be read from disk */}
              {pendingRestoreHandles.length === 0 &&
                !hasMediaFolderAccess &&
                onSelectLibraryPath &&
                !isAnyProcessRunning &&
                (activeDbEntry?.rows.length || 0) > 0 &&
                activeDbEntry?.id !== 'db_master_full' &&
                activeDbEntry?.id !== 'db_portable_retro' &&
                activeDbEntry?.rows.some((r) => !r.boxArtUrl) && (
                  <div className="bg-sky-50 dark:bg-sky-950/40 border border-sky-300 dark:border-sky-800 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2.5">
                    <div className="text-xs text-sky-950 dark:text-sky-200 leading-snug min-w-0 flex-1">
                      {t('lib.mediaFolderMissing')}
                    </div>
                    <button
                      type="button"
                      onClick={onSelectLibraryPath}
                      className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold cursor-pointer shrink-0 shadow-2xs"
                    >
                      📁 {t('lib.mediaFolderPickBtn')}
                    </button>
                  </div>
                )}

              {/* CLEAN DATABASE FILE BAR (Switch DB + Open .json + Save .json ONLY) */}
              {/* Narrow: label/select stacked on the left, Open/Save stacked on the right, row by row.
                  Wide: everything on one line. See .aegis-dbbar in index.css. */}
              <div className="aegis-dbbar-wrap bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-xl p-2.5">
               <div className="aegis-dbbar">
                <div className="contents">
                  <span className="aegis-dbbar-label text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 shrink-0">
                    <Database className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                    <span>{t('lib.activeDb')}</span>
                  </span>
                  <select
                    value={activeDbId}
                    onChange={(e) => {
                      const newId = e.target.value;
                      setActiveDbId(newId);
                      setActiveSidebarFilterKey('ALL');
                      const found = savedDatabases.find((d) => d.id === newId);
                      if (found) {
                        const displayName =
                          found.id === 'db_master_full'
                            ? t('lib.defaultDbFullName')
                            : found.id === 'db_portable_retro'
                            ? t('lib.defaultDbPortableName')
                            : found.name;
                        if (found.rows[0]) setSelectedGameId(found.rows[0].id);
                        onAddLog?.(
                          `🔄 ${tf('lib.switchedDbLog', { name: displayName, count: found.rows.length })}`
                        );
                        void hydrateDbRowsMedia(found.id, found.rows, found.pathHint);
                      }
                    }}
                    className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 h-8 text-xs font-semibold text-slate-900 dark:text-slate-100 aegis-dbbar-select min-w-0 w-full"
                  >
                    {savedDatabases.map((db) => {
                      const displayName =
                        db.id === 'db_master_full'
                          ? t('lib.defaultDbFullName')
                          : db.id === 'db_portable_retro'
                          ? t('lib.defaultDbPortableName')
                          : db.name;
                      return (
                        <option key={db.id} value={db.id}>
                          {displayName} ({db.rows.length} {t('lib.gamesSuffix')})
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div className="contents">
                  <button
                    onClick={() => openDbFileInputRef.current?.click()}
                    disabled={activeRunning}
                    className="aegis-dbbar-open h-8 px-2.5 rounded-lg bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition disabled:opacity-50"
                  >
                    <FolderOpen className="w-3.5 h-3.5 shrink-0" />
                    <span>{t('lib.openDb')}</span>
                  </button>

                  <button
                    onClick={handleSaveDatabaseToFile}
                    disabled={activeRunning}
                    className="aegis-dbbar-save h-8 px-2.5 rounded-lg bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition disabled:opacity-50"
                  >
                    <Download className="w-3.5 h-3.5 shrink-0" />
                    <span>{t('lib.saveDb')}</span>
                  </button>
                </div>
               </div>
              </div>

              {selectedConcept === 'concept_c_workbench' && (
                <EditorToolbar
                  visibleGames={filteredGames}
                  allGames={enrichedGamesSource}
                  checkedGameIds={checkedGameIds}
                  onSetChecked={setCheckedGameIds}
                  onEdit={setEditorEditIds}
                  onWriteGamelist={onEditorWriteGamelist}
                  onScrapeMedia={onEditorScrapeMedia}
                  onMoveRoms={scannedRows.length > 0 ? onMassMoveRoms : undefined}
                  onAddLog={onAddLog}
                  busy={activeRunning}
                />
              )}

              {/* VIRTUALIZED + BUFFERED VIEWS WITH «+» ADD-TO-BUILD BUTTON */}
              <VirtualizedLibraryViews
                onEditGame={openEditorForOne}
                games={groupedLibraryView ? groupedLibraryView.games : filteredGames}
                viewMode={selectedConcept}
                scrollContainerRef={mainScrollRef}
                selectedGameId={
                  (selectedGame && groupedLibraryView?.leadOf.get(selectedGame.id)) || selectedGame?.id || ''
                }
                collections={groupedLibraryView?.badges}
                onOpenCollection={setCollectionModalLeadId}
                checkedGameIds={checkedGameIds}
                onSelectGame={handleSelectGame}
                onToggleCheck={toggleCheckGame}
                onAddToBuild={(game) => {
                  setAddToBuildGame(game);
                  setNewBuildNameInput('');
                }}
              />
            </>
          )}

          {/* ============================================================ */}
          {/* TAB 2: ИНСТРУМЕНТЫ (3 Sub-Tabs: Библиотека | Флешка/Папка | Комбайн) */}
          {/* ============================================================ */}
          {previewTab === 'tools' && (
            <div className="space-y-4" onMouseOver={handleToolHover} onFocus={handleToolHover}>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
                <div>
                  <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    {t('tools.title')}
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {t('tools.subtitle')}
                  </p>
                </div>

                <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
                  <button
                    onClick={() => setToolsMode('library')}
                    className={`px-3 py-1.5 rounded-md text-xs font-bold cursor-pointer transition ${
                      toolsMode === 'library'
                        ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-2xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    {t('tools.tab.library')}
                  </button>
                  <button
                    onClick={() => setToolsMode('sd_folder')}
                    className={`px-3 py-1.5 rounded-md text-xs font-bold cursor-pointer transition ${
                      toolsMode === 'sd_folder'
                        ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-2xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    {t('tools.tab.sdFolder')}
                  </button>
                  <button
                    onClick={() => setToolsMode('combine')}
                    className={`px-3 py-1.5 rounded-md text-xs font-bold cursor-pointer transition ${
                      toolsMode === 'combine'
                        ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-2xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    {t('tools.tab.combine')}
                  </button>
                </div>
              </div>

              {/* ======================================================== */}
              {/* SUB-TAB 1: БИБЛИОТЕКА                                    */}
              {/* ======================================================== */}
              {toolsMode === 'library' && (
                <div className="space-y-4">
                  {/* Location & Scanning + Import/Export */}
                  <div className="bg-slate-50/80 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-3.5 space-y-2.5 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-slate-900 dark:text-slate-100">
                          {t('tools.lib.locationTitle')}
                        </div>
                        <div className="text-[11px] font-mono text-blue-700 dark:text-blue-400 truncate mt-0.5">
                          📁 {effectiveLibraryPath}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button data-tool="importDb"
                          type="button"
                          onClick={() => onImportLibrary?.()}
                          disabled={activeRunning}
                          className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                          <Upload className="w-3.5 h-3.5 text-indigo-600" />
                          <span>{t('tools.lib.importDbXml')}</span>
                        </button>
                        <button data-tool="exportDb"
                          type="button"
                          onClick={() => onExportLibrary?.()}
                          disabled={activeRunning}
                          className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                          <Download className="w-3.5 h-3.5 text-emerald-600" />
                          <span>{t('tools.lib.exportDbXml')}</span>
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <button data-tool="pickLibrary"
                        type="button"
                        onClick={onSelectLibraryPath || onSelectAndScanFolder}
                        disabled={activeRunning}
                        className="bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 px-3 py-2 rounded-lg font-bold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <FolderInput className="w-3.5 h-3.5 shrink-0" />
                        <span>{t('tools.lib.pickLocation')}</span>
                      </button>

                      <button data-tool="fullScan"
                        type="button"
                        onClick={onSelectAndScanFolder}
                        disabled={activeRunning}
                        className="bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 px-3 py-2 rounded-lg font-bold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <FolderOpen className="w-3.5 h-3.5 shrink-0" />
                        <span>{t('tools.lib.fullScan')}</span>
                      </button>

                      <button data-tool="addFolder"
                        type="button"
                        onClick={onAddFolderToLibrary || onSelectAndScanFolder}
                        disabled={activeRunning}
                        className="bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 px-3 py-2 rounded-lg font-bold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <Plus className="w-3.5 h-3.5 shrink-0" />
                        <span>{t('tools.lib.addFolder')}</span>
                      </button>
                    </div>
                  </div>

                  {/* Smart Media Scraper Banner (~1.5KB placeholder check) */}
                  <div className="bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/70 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="font-semibold text-emerald-950 dark:text-emerald-200 flex items-center gap-1.5">
                        <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>{t('tools.lib.scraperTitle')}</span>
                      </div>
                      <p className="text-[11px] text-emerald-800 dark:text-emerald-300 leading-relaxed">
                        {t('tools.lib.scraperDesc')}
                      </p>
                    </div>
                    <button data-tool="scraper"
                      type="button"
                      onClick={() => {
                        if (scannedRows.length > 0 && onScrapeMedia) {
                          onScrapeMedia();
                        } else {
                          startSimulatedProgressTask(
                            t('tools.lib.scraperTitle'),
                            [
                              t('tools.sim.scraper1'),
                              t('tools.sim.scraper2'),
                              t('tools.sim.scraper3'),
                            ]
                          );
                        }
                      }}
                      disabled={activeRunning}
                      className="bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 px-3.5 py-2 rounded-xl font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0"
                    >
                      <Sparkles className="w-3.5 h-3.5 shrink-0" />
                      <span>{t('tools.lib.runScraper')}</span>
                    </button>
                  </div>

                  <DatFilesPanel disabled={activeRunning} systems={datSystems} />

                  <PatcherPanel disabled={activeRunning} />

                  {/* Core Library Action Grid: 1G1R, Online Rename, XML Rename, Phantom Cleanup, Multi-Disc .M3U */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                    <button data-tool="g1r"
                      type="button"
                      onClick={() => {
                        if (scannedRows.length > 0 && onOrganizeCatalog) {
                          onOrganizeCatalog();
                        } else {
                          startSimulatedProgressTask('1G1R', [
                            t('tools.sim.g1r1'),
                            t('tools.sim.g1r2'),
                            t('tools.sim.g1r3'),
                          ]);
                        }
                      }}
                      disabled={activeRunning}
                      className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 font-semibold cursor-pointer disabled:opacity-50"
                    >
                      <Layers className="w-4 h-4 shrink-0" />
                      <span>{t('tools.lib.run1G1R')}</span>
                    </button>

                    <button data-tool="onlineRename"
                      type="button"
                      onClick={() => {
                        if (scannedRows.length > 0 && onOnlineRename) {
                          onOnlineRename();
                        } else {
                          startSimulatedProgressTask(t('tools.lib.onlineRename'), [
                            t('tools.sim.online1'),
                            t('tools.sim.online2'),
                            t('tools.sim.online3'),
                          ]);
                        }
                      }}
                      disabled={activeRunning}
                      className="bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 flex items-center gap-2 px-3.5 py-2.5 rounded-xl font-bold cursor-pointer disabled:opacity-50"
                    >
                      <Globe className="w-4 h-4 shrink-0" />
                      <span>{t('tools.lib.onlineRename')}</span>
                    </button>

                    <div className="flex items-center gap-1.5">
                      <button data-tool="xmlRename"
                        type="button"
                        onClick={onOpenXmlModal}
                        disabled={activeRunning}
                        className="bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 flex-1 flex items-center gap-2 px-3.5 py-2.5 rounded-xl font-bold cursor-pointer disabled:opacity-50"
                      >
                        <FileCode2 className="w-4 h-4 shrink-0" />
                        <span className="truncate">{t('tools.lib.xmlRename')}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => downloadXmlTemplateFile()}
                        title={t('tools.lib.xmlTemplate')}
                        className="px-2.5 py-2.5 rounded-xl bg-white dark:bg-slate-900 hover:bg-slate-100 border border-slate-300 dark:border-slate-700 text-emerald-700 dark:text-emerald-400 font-bold cursor-pointer shrink-0"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                    </div>

                    <button data-tool="cleanup"
                      type="button"
                      onClick={() => {
                        if (scannedRows.length > 0 && onScanPhantomFolders) {
                          onScanPhantomFolders();
                        } else {
                          startSimulatedProgressTask(t('tools.lib.cleanupPhantom'), [
                            t('tools.sim.phantom1'),
                            t('tools.sim.phantom2'),
                          ]);
                        }
                      }}
                      disabled={activeRunning}
                      className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/50 hover:bg-rose-100 text-rose-800 dark:text-rose-300 border border-rose-300 dark:border-rose-800 font-bold cursor-pointer disabled:opacity-50"
                    >
                      <FolderSearch className="w-4 h-4 shrink-0" />
                      <span>{t('tools.lib.cleanupPhantom')}</span>
                    </button>

                    <button data-tool="multiDisc"
                      type="button"
                      onClick={() => {
                        if (scannedRows.length > 0 && onGroupMultiDiscFolders) {
                          onGroupMultiDiscFolders();
                        } else {
                          startSimulatedProgressTask(t('tools.lib.multiDiscGroup'), [
                            t('tools.sim.multi1'),
                            t('tools.sim.multi2'),
                          ]);
                        }
                      }}
                      disabled={activeRunning}
                      className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 hover:bg-indigo-100 text-indigo-900 dark:text-indigo-200 border border-indigo-300 dark:border-indigo-700 font-bold cursor-pointer disabled:opacity-50"
                    >
                      <FolderOpen className="w-4 h-4 shrink-0" />
                      <span>{t('tools.lib.multiDiscGroup')}</span>
                    </button>

                    <label className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={autoGroupMultiDisc}
                        onChange={(e) => onChangeAutoGroupMultiDisc?.(e.target.checked)}
                        className="w-4 h-4 accent-indigo-600"
                      />
                      <span>{t('tools.lib.autoMultiDiscLabel')}</span>
                    </label>
                  </div>

                  {canUndo && onUndo && (
                    <button data-tool="undo"
                      onClick={onUndo}
                      className="w-full py-2 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-800 dark:text-slate-200 text-xs font-bold flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Undo2 className="w-3.5 h-3.5" />
                      <span>{t('tools.lib.undoBtn')}</span>
                    </button>
                  )}

                  {/* Filename Constructor (Used by Online Rename, XML Rename, and Fast Sorting) */}
                  <FilenameConstructorCard
                    config={filenameConfig}
                    onChange={(next) => onChangeFilenameConfig?.(next)}
                    sampleTitle={selectedGame?.title || 'Tekken 3'}
                    sampleYear={selectedGame?.year || 1998}
                    sampleRegion={selectedGame?.region || 'RUS'}
                    sampleBitness={selectedGame?.bitness || '32-bit'}
                    sampleConsole={selectedGame?.consoleShort || 'PSX'}
                    sampleExt={selectedGame?.sourceExt || '.chd'}
                  />

                  {/* Fast Sorting & Folder Organization Rules Card */}
                  <div className="space-y-3 bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 rounded-xl p-4 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="font-semibold text-slate-900 dark:text-slate-100">
                          {t('tools.lib.sortRulesTitle')}
                        </div>
                        <div className="text-[11px] font-mono text-blue-700 dark:text-blue-400 truncate">
                          📁 {sortTargetFolderName || selectedFolderName || effectiveLibraryPath}
                        </div>
                      </div>
                      <button data-tool="pickLibrary"
                        type="button"
                        onClick={onSelectSortTargetFolder}
                        disabled={activeRunning}
                        className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 hover:bg-blue-50 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <FolderOpen className="w-3.5 h-3.5 text-blue-600" />
                        <span>{t('tools.lib.pickLocation')}</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1">
                          {t('tools.lib.catalogMode')}
                        </label>
                        <select
                          value={catalogMode}
                          onChange={(e) => onChangeCatalogMode?.(e.target.value as any)}
                          className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 font-semibold"
                        >
                          <option value="r36s_flat_console">{t('tools.lib.catalogMode.flat')}</option>
                          <option value="gen_then_console">{t('tools.lib.catalogMode.organized')}</option>
                          <option value="r36s_gen_direct">{t('tools.lib.catalogMode.genDirect')}</option>
                        </select>
                      </div>

                      <div>
                        <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1">
                          {t('tools.lib.priorityMode')}
                        </label>
                        <select
                          value={priorityPreset}
                          onChange={(e) => onChangePriorityPreset?.(e.target.value)}
                          className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 font-semibold"
                        >
                          <option value="rus_first">{t('tools.lib.priority.rusFirst')}</option>
                          <option value="usa_first">{t('tools.lib.priority.usaFirst')}</option>
                          <option value="eur_first">{t('tools.lib.priority.eurFirst')}</option>
                          <option value="jpn_first">{t('tools.lib.priority.jpnFirst')}</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                      <label className="flex items-center gap-2 cursor-pointer font-semibold">
                        <input
                          type="checkbox"
                          checked={renameOnSortRules}
                          onChange={(e) => setRenameOnSortRules(e.target.checked)}
                          className="w-3.5 h-3.5 accent-indigo-600"
                        />
                        <span>{t('tools.lib.renameOnSort')}</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={autoScrapeAfterSort}
                          onChange={(e) => onChangeAutoScrape?.(e.target.checked)}
                          className="w-3.5 h-3.5 accent-blue-600"
                        />
                        <span>{t('tools.lib.autoScrape')}</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={scrapeShortVideos}
                          onChange={(e) => onChangeScrapeShortVideos?.(e.target.checked)}
                          className="w-3.5 h-3.5 accent-blue-600"
                        />
                        <span>{t('tools.lib.scrapeVideos')}</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={deleteJunkPermanently}
                          onChange={(e) => onChangeDeleteJunk?.(e.target.checked)}
                          className="w-3.5 h-3.5 accent-rose-600"
                        />
                        <span>{t('tools.lib.deleteDupsPerm')}</span>
                      </label>
                    </div>

                    <button data-tool="applySort"
                      type="button"
                      onClick={() => onApplySortRulesInFolder?.(renameOnSortRules)}
                      disabled={activeRunning}
                      className="bg-accent hover:bg-accent-hover text-white w-full py-2.5 px-4 rounded-xl font-semibold text-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      <span>
                        {t('tools.lib.applySort')} («{sortTargetFolderName || selectedFolderName || t('nav.library')}»)
                      </span>
                    </button>
                  </div>
                </div>
              )}

              {/* ======================================================== */}
              {/* SUB-TAB 2: ФЛЕШКА / ПАПКА (SD Card & External Folder)    */}
              {/* ======================================================== */}
              {toolsMode === 'sd_folder' && (
                <div className="space-y-4 text-xs">
                  {/* SD Card / Folder Location + Scan + Diff Sync */}
                  <div className="bg-slate-50/80 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-3.5 space-y-2.5">
                    <div className="font-semibold text-slate-900 dark:text-slate-100">
                      {t('tools.sd.locationTitle')}
                    </div>
                    <div className="text-[11px] font-mono text-amber-700 dark:text-amber-400 truncate bg-white dark:bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700">
                      💾 {sdTargetFolderName || selectedFolderName || 'EASYROMS (E:\\)'}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <button data-tool="sdPick"
                        type="button"
                        onClick={onSelectSdFolder || onSelectAndScanFolder}
                        disabled={activeRunning}
                        className="bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 px-3 py-2 rounded-lg font-bold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <FolderInput className="w-3.5 h-3.5 shrink-0" />
                        <span>{t('tools.sd.pickLocation')}</span>
                      </button>

                      <button data-tool="sdScan"
                        type="button"
                        onClick={onScanSdFolder || onSelectAndScanFolder}
                        disabled={activeRunning}
                        className="bg-accent hover:bg-accent-hover text-white px-3 py-2 rounded-lg font-bold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <FolderOpen className="w-3.5 h-3.5 shrink-0" />
                        <span>{t('tools.sd.scanBtn')}</span>
                      </button>

                      <button data-tool="sdDiff"
                        type="button"
                        onClick={() => setLibrarySyncModalOpen(true)}
                        disabled={activeRunning}
                        className="px-3 py-2 rounded-lg bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 font-semibold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <GitCompare className="w-3.5 h-3.5 shrink-0" />
                        <span>{t('tools.sd.diffSyncBtn')}</span>
                      </button>
                    </div>
                  </div>

                  {/* SD Card Maintenance Tools Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <button data-tool="scraper"
                      type="button"
                      onClick={() => {
                        if (scannedRows.length > 0 && onScrapeMedia) {
                          onScrapeMedia();
                        } else {
                          startSimulatedProgressTask(t('tools.sd.scraperBtn'), [
                            t('tools.sim.sdScrap1'),
                            t('tools.sim.sdScrap2'),
                          ]);
                        }
                      }}
                      disabled={activeRunning}
                      className="bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 flex items-center gap-2 px-3.5 py-2.5 rounded-xl font-bold cursor-pointer disabled:opacity-50"
                    >
                      <Sparkles className="w-4 h-4 shrink-0" />
                      <span>{t('tools.sd.scraperBtn')}</span>
                    </button>

                    <button data-tool="g1r"
                      type="button"
                      onClick={() => {
                        if (scannedRows.length > 0 && onOrganizeCatalog) {
                          onOrganizeCatalog();
                        } else {
                          startSimulatedProgressTask(t('tools.sd.dedupBtn'), [
                            t('tools.sim.sdDedup1'),
                            t('tools.sim.sdDedup2'),
                          ]);
                        }
                      }}
                      disabled={activeRunning}
                      className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 font-semibold cursor-pointer disabled:opacity-50"
                    >
                      <Layers className="w-4 h-4 shrink-0" />
                      <span>{t('tools.sd.dedupBtn')}</span>
                    </button>

                    <button data-tool="onlineRename"
                      type="button"
                      onClick={() => {
                        if (scannedRows.length > 0 && onOnlineRename) {
                          onOnlineRename();
                        } else {
                          startSimulatedProgressTask(t('tools.sd.onlineRenameBtn'), [
                            t('tools.sim.sdOnline1'),
                          ]);
                        }
                      }}
                      disabled={activeRunning}
                      className="bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 flex items-center gap-2 px-3.5 py-2.5 rounded-xl font-bold cursor-pointer disabled:opacity-50"
                    >
                      <Globe className="w-4 h-4 shrink-0" />
                      <span>{t('tools.sd.onlineRenameBtn')}</span>
                    </button>

                    <button data-tool="xmlRename"
                      type="button"
                      onClick={onOpenXmlModal}
                      disabled={activeRunning}
                      className="bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 flex items-center gap-2 px-3.5 py-2.5 rounded-xl font-bold cursor-pointer disabled:opacity-50"
                    >
                      <FileCode2 className="w-4 h-4 shrink-0" />
                      <span>{t('tools.sd.xmlRenameBtn')}</span>
                    </button>

                    <button data-tool="cleanup"
                      type="button"
                      onClick={() => {
                        if (scannedRows.length > 0 && onScanPhantomFolders) {
                          onScanPhantomFolders();
                        } else {
                          startSimulatedProgressTask(t('tools.sd.cleanupBtn'), [
                            t('tools.sim.sdPhantom1'),
                          ]);
                        }
                      }}
                      disabled={activeRunning}
                      className="sm:col-span-2 flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/50 hover:bg-rose-100 text-rose-800 dark:text-rose-300 border border-rose-300 dark:border-rose-800 font-bold cursor-pointer disabled:opacity-50"
                    >
                      <FolderSearch className="w-4 h-4 shrink-0" />
                      <span>{t('tools.sd.cleanupBtn')}</span>
                    </button>
                  </div>

                  {/* Multi-Console SD Card Repair Card */}
                  <div className="bg-amber-50/70 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800 rounded-xl p-4 space-y-3">
                    <div className="font-semibold text-amber-950 dark:text-amber-200 flex items-center gap-2">
                      <Wrench className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>{t('tools.sd.repairTitle')}</span>
                    </div>

                    <div>
                      <label className="block font-bold text-amber-900 dark:text-amber-300 mb-1">
                        {t('tools.sd.repairFirmware')}
                      </label>
                      <select
                        value={sdFirmwareId}
                        onChange={(e) => onChangeSdFirmwareId?.(e.target.value)}
                        className="w-full bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-700 rounded-lg px-3 py-2 font-bold text-slate-900 dark:text-slate-100"
                      >
                        <option value="r36s_arkos">{t('tools.sd.fw.r36s_arkos')}</option>
                        <option value="anbernic_muos">{t('tools.sd.fw.anbernic_muos')}</option>
                        <option value="anbernic_knulli">{t('tools.sd.fw.anbernic_knulli')}</option>
                        <option value="rocknix">{t('tools.sd.fw.rocknix')}</option>
                        <option value="miyoo_onion">{t('tools.sd.fw.miyoo_onion')}</option>
                        <option value="trimui_crossmix">{t('tools.sd.fw.trimui_crossmix')}</option>
                      </select>
                    </div>

                    <button data-tool="sdRepair"
                      type="button"
                      onClick={() => {
                        if (onRepairSdCard && (scannedRows.length > 0 || sdTargetFolderName)) {
                          onRepairSdCard(sdFirmwareId);
                        } else {
                          startSimulatedProgressTask(`${t('tools.sd.repairTitle')} (${sdFirmwareId})`, [
                            tf('tools.sim.sdRepair1', { fw: sdFirmwareId }),
                            t('tools.sim.sdRepair2'),
                            t('tools.sim.sdRepair3'),
                          ]);
                        }
                      }}
                      disabled={activeRunning}
                      className="bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 w-full py-2.5 px-4 rounded-xl font-semibold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      <Wrench className="w-4 h-4 shrink-0" />
                      <span>{t('tools.sd.repairBtn')}</span>
                    </button>
                  </div>
                </div>
              )}

              {/* ======================================================== */}
              {/* SUB-TAB 3: COMBINE (Buffer Auto-Sort + Mass File Ops)    */}
              {/* ======================================================== */}
              {toolsMode === 'combine' && (
                <div className="space-y-4">
                  {/* Clear human explanation */}
                  <div className="bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-xl p-3.5 text-xs space-y-1 aegis-ctx-inline">
                    <div className="text-sm font-semibold text-blue-950 dark:text-blue-200">
                      {t('tools.comb.bufferTitle')}
                    </div>
                    <p className="text-blue-900/80 dark:text-blue-300/90 leading-relaxed">
                      {t('tools.comb.bufferDesc')}
                    </p>
                  </div>

                  {/* Step 1: Buffer & Target Folder Pickers */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3 space-y-2">
                      <div className="font-semibold text-slate-800 dark:text-slate-200">
                        {t('tools.comb.bufferFromLabel')}
                      </div>
                      <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate bg-slate-50 dark:bg-slate-800 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700">
                        {bufferFolderName
                          ? `📥 ${bufferFolderName} (${bufferPreviewItems.length})`
                          : '—'}
                      </div>
                      <button data-tool="bufferPick"
                        type="button"
                        onClick={onSelectBufferFolder}
                        disabled={activeRunning}
                        className="bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 w-full py-2 px-3 rounded-lg font-bold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <FolderInput className="w-3.5 h-3.5" />
                        <span>{t('tools.comb.bufferPick')}</span>
                      </button>
                    </div>

                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3 space-y-2">
                      <div className="font-semibold text-slate-800 dark:text-slate-200">
                        {t('tools.comb.targetToLabel')}
                      </div>
                      <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate bg-slate-50 dark:bg-slate-800 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700">
                        📁 {combineTargetFolderName || effectiveLibraryPath}
                      </div>
                      <button data-tool="targetPick"
                        type="button"
                        onClick={onSelectCombineTargetFolder}
                        disabled={activeRunning}
                        className="bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 w-full py-2 px-3 rounded-lg font-bold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <FolderOpen className="w-3.5 h-3.5" />
                        <span>{t('tools.comb.targetPick')}</span>
                      </button>
                    </div>
                  </div>

                  {/* Step 2: Filename Constructor */}
                  <FilenameConstructorCard
                    config={filenameConfig}
                    onChange={(next) => onChangeFilenameConfig?.(next)}
                    sampleTitle={bufferPreviewItems[0]?.cleanTitle || selectedGame?.title || 'Tekken 3'}
                    sampleYear={bufferPreviewItems[0]?.year || selectedGame?.year || 1998}
                    sampleRegion={bufferPreviewItems[0]?.region || selectedGame?.region || 'USA'}
                    sampleBitness={bufferPreviewItems[0]?.bitness || selectedGame?.bitness || '32-bit'}
                    sampleConsole={bufferPreviewItems[0]?.consoleCode || selectedGame?.consoleShort || 'PSX'}
                    sampleExt={bufferPreviewItems[0]?.extension || '.chd'}
                  />

                  {/* Step 3: Folder Sorting + Buffer Mode Options */}
                  <div className="bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 space-y-3 text-xs">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1">
                          {t('tools.lib.catalogMode')}
                        </label>
                        <select
                          value={catalogMode}
                          onChange={(e) => onChangeCatalogMode?.(e.target.value as any)}
                          className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 font-semibold"
                        >
                          <option value="r36s_flat_console">{t('tools.lib.catalogMode.flat')}</option>
                          <option value="gen_then_console">{t('tools.lib.catalogMode.organized')}</option>
                          <option value="r36s_gen_direct">{t('tools.lib.catalogMode.genDirect')}</option>
                        </select>
                      </div>

                      <div>
                        <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1">
                          {t('tools.comb.bufferModeLabel')}
                        </label>
                        <select
                          value={combineMoveMode}
                          onChange={(e) => onChangeCombineMoveMode?.(e.target.value as 'move' | 'copy')}
                          className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 font-semibold"
                        >
                          <option value="move">{t('tools.comb.bufferMode.move')}</option>
                          <option value="copy">{t('tools.comb.bufferMode.copy')}</option>
                        </select>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-x-5 gap-y-2">
                      <label className="flex items-center gap-2 cursor-pointer font-semibold">
                        <input
                          type="checkbox"
                          checked={combineSortFolders}
                          onChange={(e) => onChangeCombineSortFolders?.(e.target.checked)}
                          className="w-3.5 h-3.5 accent-blue-600"
                        />
                        <span>{t('tools.comb.sortFolders')}</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer font-semibold">
                        <input
                          type="checkbox"
                          checked={combineDedup1G1R}
                          onChange={(e) => onChangeCombineDedup1G1R?.(e.target.checked)}
                          className="w-3.5 h-3.5 accent-blue-600"
                        />
                        <span>{t('tools.comb.dedup1G1R')}</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer font-semibold">
                        <input
                          type="checkbox"
                          checked={combineAddToLibrary}
                          onChange={(e) => onChangeCombineAddToLibrary?.(e.target.checked)}
                          className="w-3.5 h-3.5 accent-blue-600"
                        />
                        <span>{t('tools.comb.addToLibrary')}</span>
                      </label>
                    </div>
                  </div>

                  {/* Step 4: Live Preview & Action Buttons */}
                  <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-white dark:bg-slate-900">
                    <div className="bg-slate-50 dark:bg-slate-800/80 px-3.5 py-2 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        {t('tools.comb.previewTitle')} ({bufferPreviewItems.length})
                      </span>
                      <span className="text-[11px] font-mono text-slate-500">
                        {bufferFolderName || effectiveLibraryPath}
                      </span>
                    </div>

                    <div className="max-h-48 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                      {bufferPreviewItems.length === 0 ? (
                        <div className="p-4 text-center text-slate-500">
                          {t('tools.comb.previewEmpty')}
                        </div>
                      ) : (
                        bufferPreviewItems.slice(0, 40).map((item) => (
                          <div
                            key={item.id}
                            className="px-3.5 py-2 flex flex-wrap items-center justify-between gap-2 hover:bg-slate-50 dark:hover:bg-slate-800/40"
                          >
                            <div className="min-w-0 flex-1 font-mono truncate text-rose-600 dark:text-rose-400">
                              {item.originalFileName}
                            </div>
                            <span className="text-slate-400 shrink-0">→</span>
                            <div
                              className={`min-w-0 flex-[1.4] font-mono font-bold truncate ${
                                item.isDuplicateOrJunk
                                  ? 'text-amber-600 dark:text-amber-400'
                                  : 'text-emerald-700 dark:text-emerald-400'
                              }`}
                            >
                              {item.targetFolderRelPath}/{item.proposedFileName}
                            </div>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 shrink-0">
                              {item.actionLabel}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5">
                    <button data-tool="runBuffer"
                      type="button"
                      onClick={() => onRunBufferAutoProcess?.()}
                      disabled={activeRunning}
                      className="bg-accent hover:bg-accent-hover text-white flex-1 min-w-[240px] py-2.5 px-4 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      <Play className="w-4 h-4 fill-white shrink-0" />
                      <span>{t('tools.comb.runBuffer')}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onDownloadBufferCmdScript?.()}
                      disabled={activeRunning || bufferPreviewItems.length === 0}
                      className="py-2.5 px-3.5 rounded-xl bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <Download className="w-3.5 h-3.5 text-emerald-600" />
                      <span>.CMD</span>
                    </button>
                  </div>

                  {/* ======================================================== */}
                  {/* MASS FILE OPERATIONS CARD (Delete / Move / Split)        */}
                  {/* ======================================================== */}
                  <div className="bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-xl p-4 space-y-3 text-xs">
                    <div>
                      <div className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2 text-sm">
                        <Scissors className="w-4 h-4 text-rose-600 shrink-0" />
                        <span>{t('tools.comb.massTitle')}</span>
                      </div>
                      <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">
                        {t('tools.comb.massDesc')}
                      </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1">
                          {t('tools.comb.massFilter')}
                        </label>
                        <select
                          value={massFilter}
                          onChange={(e) => {
                            setMassFilter(e.target.value as any);
                            setConfirmMassDelete(false);
                          }}
                          className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 font-semibold"
                        >
                          <option value="checked">
                            {tf('tools.comb.massFilter.checked', {
                              count: Object.values(checkedGameIds).filter(Boolean).length,
                            })}
                          </option>
                          <option value="duplicates_1g1r">{t('tools.comb.massFilter.duplicates')}</option>
                          <option value="region_jpn">{t('tools.comb.massFilter.jpn')}</option>
                          <option value="bad_dumps">{t('tools.comb.massFilter.bad')}</option>
                          <option value="console_active">
                            {tf('tools.comb.massFilter.active', { count: filteredGames.length })}
                          </option>
                        </select>
                      </div>

                      <div>
                        <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1">
                          {t('tools.comb.massSplitMode')}
                        </label>
                        <select
                          value={massSplitMode}
                          onChange={(e) => setMassSplitMode(e.target.value as any)}
                          className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 font-semibold"
                        >
                          <option value="by_console">{t('tools.comb.split.byConsole')}</option>
                          <option value="alphabetical">{t('tools.comb.split.alpha')}</option>
                          <option value="disc_vs_cartridge">{t('tools.comb.split.discVsCart')}</option>
                          <option value="multidisc_subfolders">{t('tools.comb.split.multiDisc')}</option>
                        </select>
                      </div>
                    </div>

                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 flex flex-wrap items-center justify-between gap-2">
                      <span className="font-bold text-slate-700 dark:text-slate-200">
                        {t('tools.comb.matchedCount')}{' '}
                        <strong className="text-blue-600 dark:text-blue-400 font-mono">
                          {massMatchedGames.length}
                        </strong>
                      </span>
                      <span className="text-[11px] font-mono text-slate-500 truncate max-w-md">
                        {massMatchedGames
                          .slice(0, 3)
                          .map((m) => m.cleanFile || m.oldFile)
                          .join(' · ') || '—'}
                      </span>
                    </div>

                    {confirmMassDelete && (
                      <div className="bg-rose-50 dark:bg-rose-950/60 border border-rose-300 dark:border-rose-700 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2 text-rose-900 dark:text-rose-200 font-bold">
                          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                          <span>
                            {tf('tools.comb.confirmDeleteMsg', { count: massMatchedGames.length })}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              const ids = massMatchedGames.map((g) => g.id);
                              setConfirmMassDelete(false);
                              if (scannedRows.length > 0 && onMassDeleteRoms) {
                                onMassDeleteRoms(ids);
                              } else {
                                const idSet = new Set(ids);
                                setSavedDatabases((prev) => {
                                  const next = prev.map((db) =>
                                    db.id === activeDbId
                                      ? { ...db, rows: db.rows.filter((r) => !idSet.has(r.id)) }
                                      : db
                                  );
                                  persistDatabasesSafely(next);
                                  return next;
                                });
                                onAddLog?.(`🗑 ${tf('tools.comb.deletedLog', { count: ids.length })}`);
                              }
                            }}
                            className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-semibold cursor-pointer"
                          >
                            {tf('tools.comb.confirmDeleteBtn', { count: massMatchedGames.length })}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmMassDelete(false)}
                            className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-bold cursor-pointer"
                          >
                            {t('tools.comb.cancelBtn')}
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <button data-tool="massDelete"
                        type="button"
                        disabled={activeRunning || massMatchedGames.length === 0}
                        onClick={() => setConfirmMassDelete(true)}
                        className="py-2 px-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40"
                      >
                        <Trash2 className="w-3.5 h-3.5 shrink-0" />
                        <span>{t('tools.comb.massDeleteBtn')} ({massMatchedGames.length})</span>
                      </button>

                      <button data-tool="massMove"
                        type="button"
                        disabled={activeRunning || massMatchedGames.length === 0}
                        onClick={() => {
                          const ids = massMatchedGames.map((g) => g.id);
                          if (scannedRows.length > 0 && onMassMoveRoms) {
                            onMassMoveRoms(ids);
                          } else {
                            startSimulatedProgressTask(
                              `${t('tools.comb.massMoveBtn')} (${ids.length})`,
                              [
                                tf('tools.sim.move1', { count: ids.length }),
                                t('tools.sim.move2'),
                              ]
                            );
                          }
                        }}
                        className="bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 py-2 px-3 rounded-xl font-bold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40"
                      >
                        <FolderInput className="w-3.5 h-3.5 shrink-0" />
                        <span>{t('tools.comb.massMoveBtn')} ({massMatchedGames.length})</span>
                      </button>

                      <button data-tool="massSplit"
                        type="button"
                        disabled={activeRunning}
                        onClick={() => {
                          if (scannedRows.length > 0 && onMassSplitRoms) {
                            onMassSplitRoms(massSplitMode);
                          } else {
                            startSimulatedProgressTask(
                              `${t('tools.comb.massSplitBtn')} (${massSplitMode})`,
                              [
                                tf('tools.sim.split1', { mode: massSplitMode }),
                                t('tools.sim.split2'),
                              ]
                            );
                          }
                        }}
                        className="bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 py-2 px-3 rounded-xl font-bold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40"
                      >
                        <Scissors className="w-3.5 h-3.5 shrink-0" />
                        <span>{t('tools.comb.massSplitBtn')}</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ============================================================ */}
          {/* TAB 3: СБОРКИ (Thematic Presets + Custom Queue + Converter)  */}
          {/* ============================================================ */}
          {previewTab === 'builds' && (
            <SmartBuildsAndConverterTab
              scannedRows={gamesSource}
              modeShortCode={modeShortCode}
              activeRunning={activeRunning}
              isNativeDesktopHost={!!isNativeDesktopHost}
              selectedGameId={selectedGameId}
              onSelectGameId={setSelectedGameId}
              onStartSimulatedTask={startSimulatedProgressTask}
              onUpdateLiveProgress={updateLiveTaskProgress}
              onAddLog={onAddLog}
              portMasterCatalog={portMasterCatalog}
              portMasterBuildSlugs={portMasterBuildSlugs}
              onRemoveBuildPort={(slug) =>
                setPortMasterBuildSlugs((prev) => prev.filter((s) => s !== slug))
              }
              onSetBuildPortSlugs={setPortMasterBuildSlugs}
              portMasterSourceConfigs={portMasterSourceConfigs}
              savedBuildsProp={savedBuilds}
              onSavedBuildsChanged={handleSavedBuildsChanged}
            />
          )}

          {/* ============================================================ */}
          {/* TAB 4: СРЕДА (Real Emulators, Exe Bindings & PortMaster ★)   */}
          {/* ============================================================ */}
          {previewTab === 'env' && (
            <EnvironmentEmulatorsTab
              modeShortCode={modeShortCode}
              isNativeDesktopHost={!!isNativeDesktopHost}
              emulatorCustomPaths={emulatorCustomPaths}
              starredEmulatorsByConsole={starredEmulatorsByConsole}
              onUpdateEmulatorConfig={(customPaths, starredMap) => {
                onUpdateEmulatorConfig?.(customPaths, starredMap);
              }}
              onAddLog={onAddLog}
              portMasterBuildSlugs={portMasterBuildSlugs}
              onToggleBuildPort={handleTogglePortMasterBuild}
              portMasterSourceConfigs={portMasterSourceConfigs}
              onUpdatePortMasterSourceConfig={(slug, cfg) =>
                setPortMasterSourceConfigs((prev) => ({ ...prev, [slug]: cfg }))
              }
              onPortMasterCatalogLoaded={setPortMasterCatalog}
              libraryPortSlugs={libraryPortSlugs}
              onAddPortToLibrary={handleAddPortMasterToLibrary}
              libraryPath={effectiveLibraryPath}
              initialSubTab={envInitialSubTab}
            />
          )}
        </main>

        {/* RIGHT COLUMN: GAME INSPECTOR WITH COVER ART + HOVER VIDEO PREVIEW */}
        <div
          className="aegis-insp-backdrop absolute inset-0 z-30 bg-slate-900/30"
          data-open={inspectorOpen}
          onClick={() => setInspectorOpen(false)}
          aria-hidden="true"
        />
        <aside
          className="aegis-insp min-w-0 p-5 bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 flex flex-col justify-between gap-4 overflow-y-auto"
          data-open={inspectorOpen}
          data-ctx={showContextPanel}
          aria-label={showContextPanel ? t('ctx.panelLabel') : t('insp.header')}
        >
          {showContextPanel && (
            <WorkbenchContextPanel
              section={previewTab as 'tools' | 'builds' | 'env'}
              toolsMode={toolsMode}
              hoveredTool={hoveredTool}
              gameCount={enrichedGamesSource.length}
              consoleCount={contextStats.consoles}
              noCoverCount={contextStats.noCover}
              multiDiscCount={contextStats.multiDisc}
              libraryPath={effectiveLibraryPath}
              sdFolderName={sdTargetFolderName || selectedFolderName || ''}
              bufferFolderName={bufferFolderName}
              bufferItemCount={bufferPreviewItems.length}
              savedBuilds={savedBuilds}
              buildPortCount={portMasterBuildSlugs.length}
              assignedEmulatorCount={Object.keys(starredEmulatorsByConsole || {}).length}
              customExeCount={Object.values(emulatorCustomPaths || {}).filter(Boolean).length}
              portCatalogCount={portMasterCatalog.length}
              libraryPortCount={libraryPortSlugs.length}
              running={activeRunning}
              progressPct={activePct}
              statusText={statusLineText}
              logs={logs}
            />
          )}
          {!showContextPanel && selectedGame && (() => {
            const resolvedEmu = resolvePriorityEmulatorForConsole(
              selectedGame.consoleShort,
              emulatorCustomPaths,
              starredEmulatorsByConsole
            );
            const activeEmuName = `${resolvedEmu.option.name.split(' (')[0]} ★`;

            const hasMultiDisc = Boolean(selectedGame.discs && selectedGame.discs.length > 1);
            const activeDiscObj =
              hasMultiDisc && selectedDiscIndex !== null && selectedGame.discs
                ? selectedGame.discs[selectedDiscIndex] || selectedGame.discs[0]
                : null;

            const handleLaunchGame = async () => {
              const targetRom = activeDiscObj
                ? activeDiscObj.cleanFile || activeDiscObj.oldFile
                : hasMultiDisc && selectedGame.m3uFileName
                ? selectedGame.m3uFileName
                : selectedGame.oldFile || selectedGame.cleanFile;
              const targetRelPath = activeDiscObj
                ? activeDiscObj.relativePath || ''
                : selectedGame.relativePath || '';
              if (isNativeDesktopHost) {
                onAddLog?.(
                  `▶ ${tf('insp.launchLog', {
                    title: selectedGame.title,
                    rom: targetRom,
                    emu: resolvedEmu.option.name,
                  })}`
                );
                try {
                  const resp = await fetch('/api/native/emulators/launch', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      consoleCode: selectedGame.consoleShort,
                      emulatorId: resolvedEmu.option.id,
                      exePath: resolvedEmu.exePath,
                      coreFile: resolvedEmu.option.isUniversalRetroArch
                        ? resolvedEmu.option.coreOrBinary
                        : '',
                      romFileName: targetRom,
                      relativePath: targetRelPath,
                      libraryPath: effectiveLibraryPath,
                      sdCardPath: selectedFolderName || '',
                      isRetroArch: Boolean(resolvedEmu.option.isUniversalRetroArch),
                    }),
                  });
                  const data = await resp.json();
                  if (data && data.ok) {
                    updateLiveTaskProgress(
                      false,
                      100,
                      `✔ ${tf('insp.launchOk', {
                        pid: data.pid,
                        title: selectedGame.title,
                        emu: resolvedEmu.option.name,
                      })}`
                    );
                    onAddLog?.(
                      `✔ ${tf('insp.launchOkLog', {
                        pid: data.pid,
                        cmd: data.commandLine,
                      })}`
                    );
                  } else {
                    const errTxt = data?.error || t('insp.launchErrNotFound');
                    updateLiveTaskProgress(false, 0, `⚠ ${errTxt}`);
                    onAddLog?.(`⚠ ${tf('insp.launchCancelled', { err: errTxt })}`);
                  }
                } catch (err) {
                  onAddLog?.(`⛔ ${tf('insp.launchProcessErr', { err: String(err) })}`);
                }
                return;
              }

              // Browser fallback: create an honest, ready-to-run .CMD launcher script instead of fake animation
              const romArg = targetRelPath
                ? targetRelPath.replace(/\//g, '\\')
                : targetRom;
              const cliResolved = resolvedEmu.option.cliTemplate
                .replace(resolvedEmu.option.defaultExePath, resolvedEmu.exePath)
                .replace('{ROM_PATH}', romArg);
              const cmdLines = [
                '@echo off',
                'chcp 65001 >nul',
                `echo ${tf('insp.cmdEcho', {
                  title: selectedGame.title,
                  console: selectedGame.consoleShort,
                })}`,
                cliResolved,
                'if errorlevel 1 pause',
              ];
              const blob = new Blob([cmdLines.join('\r\n')], { type: 'text/plain;charset=utf-8' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `Play_${selectedGame.title.replace(/[^a-zA-Z0-9а-яА-Я_-]/g, '_').slice(0, 40)}.cmd`;
              document.body.appendChild(a);
              a.click();
              a.remove();
              setTimeout(() => URL.revokeObjectURL(url), 3000);
              onAddLog?.(
                `📜 ${tf('insp.browserCmdLog', {
                  title: selectedGame.title,
                  cli: cliResolved,
                })}`
              );
            };

            // «Запуск»: встроенное WASM-ядро прямо в окне приложения (основной способ).
            const qtDisc =
              activeDiscObj || (hasMultiDisc && selectedGame.discs ? selectedGame.discs[0] : null);
            const qtFileName = qtDisc
              ? qtDisc.cleanFile || qtDisc.oldFile
              : selectedGame.oldFile || selectedGame.cleanFile;
            const qtCore = resolveQuickTestCore(selectedGame.consoleShort, qtFileName);
            const handleQuickTest = async () => {
              if (!qtCore) return;
              // BIOS из раздела «BIOS»: только проверенные по MD5. Запрос доступа к папке
              // допустим только по клику, поэтому берём их здесь, а не в окне теста.
              let biosFile: File | null = null;
              if (qtCore.biosKey) {
                try {
                  const list = await getVerifiedBiosFiles(qtCore.biosKey, true);
                  biosFile = pickBiosForRegion(list, selectedGame.region)?.file || null;
                } catch {
                  biosFile = null;
                }
              }
              const src = qtDisc || selectedGame;
              let file: File | undefined | null = src.fileObj;
              if (file && fileExt(file.name) === 'cue') {
                file = pickCueDataTrack(src.cueText, src.companionFiles);
              }
              // В десктопе ром лежит на диске: и файл, и сохранения берём по этому адресу.
              const romRef = isNativeDesktopHost
                ? {
                    romFileName: qtFileName,
                    relativePath: (qtDisc ? qtDisc.relativePath : selectedGame.relativePath) || '',
                    consoleCode: selectedGame.consoleShort,
                    libraryPath: effectiveLibraryPath || '',
                    sdCardPath: selectedFolderName || '',
                  }
                : null;
              setQuickTestReq({
                title: selectedGame.title,
                consoleShort: selectedGame.consoleShort,
                core: qtCore,
                biosFile,
                saveTarget: romRef,
                source: file
                  ? { kind: 'file', file }
                  : romRef
                  ? { kind: 'native', ...romRef }
                  : { kind: 'pick' },
              });
            };

            return (
              <>
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded-md px-2 py-0.5">
                      {selectedGame.consoleShort} · {selectedGame.bitness}
                      {hasMultiDisc && selectedGame.discs
                        ? ` · ${tf('lib.multiDiscCount', { count: selectedGame.discs.length })}`
                        : ''}
                    </span>
                    <button
                      type="button"
                      onClick={() => setInspectorOpen(false)}
                      className="lg:hidden w-8 h-8 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 flex items-center justify-center cursor-pointer"
                      title={t('status.close')}
                      aria-label={t('status.close')}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Cover Art that plays Short Gameplay Video on Hover! */}
                  <GameInspectorCoverVideo
                    title={selectedGame.title}
                    consoleCode={selectedGame.consoleShort}
                    genre={selectedGame.genre}
                    year={selectedGame.year}
                    region={selectedGame.region}
                    boxArtUrl={selectedGame.boxArtUrl}
                    videoUrl={selectedGame.videoUrl}
                  />

                  <div>
                    <h3 className="text-lg font-bold leading-snug text-slate-900 dark:text-slate-100">
                      {selectedGame.title}
                    </h3>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {localizeGenre(selectedGame.genre, t)} · {selectedGame.year}
                      {t('lib.yearSuffix')} · {selectedGame.size} · {t('insp.serialPrefix')} {selectedGame.serial}
                    </div>
                  </div>

                  <div className="space-y-2 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5">
                    <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800 gap-2">
                      <span className="text-slate-500 dark:text-slate-400 shrink-0">{t('insp.oldFile')}</span>
                      <span className="font-mono text-rose-600 dark:text-rose-400 truncate">
                        {activeDiscObj ? activeDiscObj.oldFile : selectedGame.oldFile}
                      </span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800 gap-2">
                      <span className="text-slate-500 dark:text-slate-400 shrink-0">
                        {hasMultiDisc ? t('insp.multiDiscFolder') : t('insp.cleanFile')}
                      </span>
                      <span className="font-mono font-bold text-slate-900 dark:text-slate-100 truncate">
                        {activeDiscObj ? activeDiscObj.cleanFile : selectedGame.cleanFile}
                      </span>
                    </div>
                    {selectedGame.titleSource && (
                      <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800 gap-2">
                        <span className="text-slate-500 dark:text-slate-400 shrink-0">{t('insp.titleSource')}</span>
                        <span className="text-slate-900 dark:text-slate-100 truncate">
                          {t(`title.src.${selectedGame.titleSource}`, selectedGame.titleSource)}
                        </span>
                      </div>
                    )}
                    {selectedGame.modKind && selectedGame.modKind !== 'original' && (
                      <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800 gap-2">
                        <span className="text-slate-500 dark:text-slate-400 shrink-0">{t('insp.modStatus')}</span>
                        <span className="text-violet-600 dark:text-violet-400 text-right" title={selectedGame.modNote}>
                          <span className="font-bold">
                            {t(`hack.kind.${selectedGame.modKind}`, selectedGame.modKind)}
                            {selectedGame.modTag ? ` [${selectedGame.modTag}]` : ''}
                          </span>
                          {selectedGame.modNote && <span className="block">{selectedGame.modNote}</span>}
                        </span>
                      </div>
                    )}
                    {(!selectedGame.modKind || selectedGame.modKind === 'original') && selectedGame.modNote && (
                      <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800 gap-2">
                        <span className="text-slate-500 dark:text-slate-400 shrink-0">{t('insp.modStatus')}</span>
                        <span className="text-emerald-600 dark:text-emerald-400 text-right">{selectedGame.modNote}</span>
                      </div>
                    )}
                    {selectedGame.titleNote && (
                      <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800 gap-2">
                        <span className="text-slate-500 dark:text-slate-400 shrink-0">{t('insp.titleNote')}</span>
                        <span className="text-amber-600 dark:text-amber-400 text-right" title={selectedGame.titleNote}>
                          {selectedGame.titleNote}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800 gap-2">
                      <span className="text-slate-500 dark:text-slate-400 shrink-0">{t('insp.priorityEmu')}</span>
                      <span className="font-bold text-blue-600 dark:text-blue-400 truncate" title={resolvedEmu.exePath}>
                        {activeEmuName}
                      </span>
                    </div>
                    <div className="flex justify-between py-1 gap-2">
                      <span className="text-slate-500 dark:text-slate-400 shrink-0">{t('insp.exePath')}</span>
                      <span className="font-mono text-[11px] text-slate-600 dark:text-slate-400 truncate" title={resolvedEmu.exePath}>
                        {resolvedEmu.exePath}
                      </span>
                    </div>
                  </div>

                  {/* Versions, series and description */}
                  <GameRelationsPanel
                    game={selectedGame}
                    versions={
                      libraryCollectionIndex.byKey.get(libraryCollectionIndex.keyOfId.get(selectedGame.id) || '')?.members || [selectedGame]
                    }
                    series={seriesSiblings(libraryCollectionIndex, selectedGame.id)}
                    libraryLeadByKey={libraryLeadByKey}
                    onSelect={handleSelectGame}
                  />

                  {/* Multi-Disc Folder & Disc List Switcher */}
                  {hasMultiDisc && selectedGame.discs && (
                    <div className="bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800/80 rounded-xl p-3 space-y-2 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-indigo-950 dark:text-indigo-200">
                          💿 {t('insp.multiDiscTitle')} ({tf('lib.multiDiscCount', { count: selectedGame.discs.length })})
                        </span>
                        <button
                          type="button"
                          onClick={() => setSelectedDiscIndex(null)}
                          className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold cursor-pointer transition ${
                            selectedDiscIndex === null
                              ? 'bg-indigo-600 text-white'
                              : 'bg-white dark:bg-slate-900 border border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300'
                          }`}
                        >
                          {t('insp.playlistM3U')}
                        </button>
                      </div>

                      <div className="text-[11px] font-mono text-indigo-900/80 dark:text-indigo-300 truncate">
                        📁 {selectedGame.consoleShort.toLowerCase()}/{selectedGame.multiDiscFolderName}/
                      </div>

                      <div className="space-y-1 max-h-36 overflow-y-auto pr-0.5">
                        {selectedGame.discs.map((disc, dIdx) => {
                          const isActive = selectedDiscIndex === dIdx;
                          return (
                            <button
                              key={disc.id}
                              type="button"
                              onClick={() => setSelectedDiscIndex(isActive ? null : dIdx)}
                              className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg border text-left font-mono text-[11px] cursor-pointer transition ${
                                isActive
                                  ? 'bg-indigo-600 text-white border-indigo-600'
                                  : 'bg-white dark:bg-slate-900 border-indigo-200/80 dark:border-indigo-800/70 text-slate-800 dark:text-slate-200 hover:border-indigo-400'
                              }`}
                            >
                              <span className="truncate font-semibold">
                                {t('insp.discLabel')} {disc.discNumber}: {disc.cleanFile || disc.oldFile}
                              </span>
                              <span className={`shrink-0 tabular-nums ${isActive ? 'text-indigo-100' : 'text-slate-500 dark:text-slate-400'}`}>
                                {disc.size}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {(selectedGame.consoleShort.toUpperCase() === 'PORTS' ||
                    selectedGame.consoleShort.toUpperCase() === 'PORTMASTER') && (() => {
                    const slugGuess =
                      selectedGame.portMasterSlug ||
                      selectedGame.oldFile.replace(/\.sh$/i, '').replace(/\s+/g, '');
                    const pcPlan = inferPortMasterPcTestPlan(
                      {
                        slug: slugGuess,
                        title: selectedGame.title,
                        runtime: [],
                        requirements: [],
                        instructionsRaw: selectedGame.status,
                        requiredDataTargetPath: selectedGame.portMasterDataPath || `ports/${slugGuess}`,
                        items: [selectedGame.oldFile || `${slugGuess}.sh`],
                      },
                      tf
                    );
                    return (
                      <div className="bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl p-3 space-y-2 text-xs">
                        <div className="font-semibold text-emerald-900 dark:text-emerald-200">
                          🧪 {t('insp.pmTestTitle')} {pcPlan.emulatorDisplayName}
                        </div>
                        <div className="text-[11px] text-emerald-800 dark:text-emerald-300 leading-relaxed">
                          {pcPlan.explanation}
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              const blob = new Blob([pcPlan.cmdScript], {
                                type: 'text/plain;charset=utf-8',
                              });
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement('a');
                              a.href = url;
                              a.download = `Test_Port_${slugGuess}.cmd`;
                              document.body.appendChild(a);
                              a.click();
                              a.remove();
                              setTimeout(() => URL.revokeObjectURL(url), 2500);
                              onAddLog?.(
                                `🧪 ${tf('insp.pcTestDownloadedLog', {
                                  title: selectedGame.title,
                                  emu: pcPlan.emulatorDisplayName,
                                })}`
                              );
                            }}
                            className="bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 px-2.5 py-1.5 rounded-lg font-bold text-[11px] cursor-pointer"
                          >
                            📜 {t('insp.pmDownloadCmd')}
                          </button>
                          <button
                            type="button"
                            onClick={() => setPreviewTab('env')}
                            className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-300 font-bold text-[11px] cursor-pointer"
                          >
                            🎮 {t('insp.pmOpenEnv')}
                          </button>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                <div className="flex flex-wrap items-stretch gap-2">
                  {/* «Запуск» — встроенное WASM-ядро, основной способ. Внешний эмулятор — запасной, ниже. */}
                  {/* Play uses the built-in WASM core (primary); the external emulator is a secondary option below. */}
                  <button
                    type="button"
                    onClick={qtCore ? handleQuickTest : handleLaunchGame}
                    title={
                      qtCore
                        ? tf('qt.buttonHint', { core: qtCore.label })
                        : `${tf('qt.unsupported', { console: selectedGame.consoleShort })} (${activeEmuName})`
                    }
                    className="flex-1 min-w-[12rem] h-10 px-4 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer transition"
                  >
                    <Play className="w-4 h-4 fill-white shrink-0" />
                    <span className="truncate">
                      {qtCore
                        ? t('qt.button')
                        : isNativeDesktopHost
                        ? t('insp.launchNative')
                        : t('insp.launchCmd')}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setAddToBuildGame(selectedGame);
                      setNewBuildNameInput('');
                    }}
                    title={t('lib.addToBuild')}
                    className="h-10 px-3.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-100 text-sm font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition"
                  >
                    <Plus className="w-4 h-4" />
                    <span>{t('lib.addToBuild')}</span>
                  </button>

                  {qtCore && (
                    <button
                      type="button"
                      onClick={handleLaunchGame}
                      title={
                        isNativeDesktopHost
                          ? `${t('insp.launchExternalHint')}: ${resolvedEmu.exePath}`
                          : `${t('insp.launchCmd')}: ${selectedGame.title}`
                      }
                      className="basis-full inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:underline cursor-pointer max-w-full"
                    >
                      <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">
                        {isNativeDesktopHost
                          ? tf('insp.launchExternal', { emu: activeEmuName })
                          : t('insp.launchCmd')}
                      </span>
                    </button>
                  )}
                </div>
              </>
            );
          })()}
        </aside>
      </div>

      {/* ==================================================================== */}
      {/* SINGLE-LINE BOTTOM STATUS BAR WITH INTEGRATED COLOR PROGRESS FILL    */}
      {/* ("снизу одной строкой показывать текущее действие и в этой же строке */}
      {/*  заполнение цветом прогресса всего задания")                         */}
      {/* ==================================================================== */}
      <footer className="relative h-10 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 flex items-center justify-between gap-4 overflow-hidden shrink-0 z-20">
        {/* Background Color Fill of the Entire Task Progress inside the same single row */}
        <div
          className={`absolute inset-y-0 left-0 pointer-events-none transition-all duration-200 ${
            activeRunning
              ? 'bg-blue-500/25 dark:bg-blue-500/35 border-r-2 border-blue-600 dark:border-blue-400'
              : 'bg-transparent'
          }`}
          style={{ width: `${activeRunning ? Math.min(100, Math.max(activePct, 4)) : 0}%` }}
        />

        {/* Subtle bottom accent progress line */}
        {activeRunning && (
          <div
            className="absolute bottom-0 left-0 h-0.5 bg-blue-600 dark:bg-blue-400 transition-all duration-200 pointer-events-none"
            style={{ width: `${Math.min(100, Math.max(activePct, 4))}%` }}
          />
        )}

        {/* Foreground Single-Line Current Action Text */}
        <div className="relative z-10 flex items-center gap-2.5 min-w-0 flex-1 text-xs">
          {activeRunning ? (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-blue-600 text-white font-mono font-semibold text-[11px] shrink-0 shadow-2xs">
              <RefreshCw className="w-3 h-3 animate-spin" />
              <span>{activePct}%</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-mono font-bold text-[11px] shrink-0">
              <CheckCircle2 className="w-3 h-3" />
              <span>{t('status.ready')}</span>
            </span>
          )}

          <div
            className="text-slate-600 dark:text-slate-300 truncate"
            title={statusLineText}
          >
            {statusLineText}
          </div>
        </div>

        {/* Right Side Controls in the Same Single Row: Separate Journal Button + STOP Button */}
        <div className="relative z-10 flex items-center gap-2 shrink-0">
          <button
            onClick={() => setIsLogModalOpen(true)}
            title={t('status.journalTitle')}
            className="h-7 px-2.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold text-xs flex items-center gap-1.5 cursor-pointer transition"
          >
            <ScrollText className="w-3.5 h-3.5" />
            <span>{t('header.journal')} ({logs.length})</span>
          </button>

          {/* STOP is shown only while a task is running, so red keeps meaning "something is happening" */}
          {activeRunning && (
            <button
              onClick={handleStopAll}
              title={t('status.stop')}
              className="h-7 px-3 rounded-md bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs flex items-center gap-1.5 cursor-pointer transition"
            >
              <OctagonX className="w-3.5 h-3.5" />
              <span>{t('status.stop')}</span>
            </button>
          )}
        </div>
      </footer>

      {/* ==================================================================== */}
      {/* ADD GAME TO BUILD MODAL («+» в библиотеке / инспекторе)               */}
      {/* ==================================================================== */}
      {editorEditGames.length > 0 && (
        <GameEditModal
          games={editorEditGames}
          onClose={() => setEditorEditIds(null)}
          onSaved={onEditorWriteGamelist}
          onAddLog={onAddLog}
        />
      )}

      {collectionModalLeadId && groupedLibraryView?.membersByLead.get(collectionModalLeadId) && (
        <CollectionModal
          title={
            groupedLibraryView.membersByLead.get(collectionModalLeadId)!.find((m) => m.id === collectionModalLeadId)?.title || ''
          }
          members={groupedLibraryView.membersByLead.get(collectionModalLeadId)!}
          selectedId={selectedGame?.id || ''}
          onPick={(id) => {
            handleSelectGame(id);
            setCollectionModalLeadId(null);
          }}
          onClose={() => setCollectionModalLeadId(null)}
        />
      )}

      {quickTestReq && (
        <QuickTestModal
          request={quickTestReq}
          onClose={() => setQuickTestReq(null)}
          onAddLog={onAddLog}
          onOpenBios={() => {
            setQuickTestReq(null);
            setEnvInitialSubTab('bios');
            setPreviewTab('env');
          }}
        />
      )}

      {addToBuildGame && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-2xl max-w-lg w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  {t('buildModal.title')}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  <strong className="text-slate-800 dark:text-slate-200">{addToBuildGame.title}</strong> ({addToBuildGame.consoleShort}) · {t('buildModal.subtitle')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAddToBuildGame(null)}
                className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {addToBuildGame.isMultiDisc && addToBuildGame.discs && addToBuildGame.discs.length > 1 && (
              <div className="bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800 rounded-xl px-3 py-2 text-xs text-indigo-900 dark:text-indigo-200 font-semibold">
                💿 {t('buildModal.discsNote')} ({addToBuildGame.discs.length})
              </div>
            )}

            <div className="space-y-2">
              <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                {t('buildModal.existing')} ({savedBuilds.length})
              </div>
              {savedBuilds.length === 0 ? (
                <div className="text-xs text-slate-500 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-center">
                  {t('buildModal.noExisting')}
                </div>
              ) : (
                <div className="max-h-52 overflow-y-auto space-y-1.5 pr-0.5">
                  {savedBuilds.map((bld) => {
                    const alreadyIn = bld.items.some(
                      (it) =>
                        it.gameId === addToBuildGame.id ||
                        (it.consoleShort.toUpperCase() === addToBuildGame.consoleShort.toUpperCase() &&
                          buildSyncComparisonKey(it.title, it.cleanFile) ===
                            buildSyncComparisonKey(addToBuildGame.title, addToBuildGame.cleanFile))
                    );
                    return (
                      <div
                        key={bld.id}
                        className="flex items-center justify-between gap-2.5 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="font-bold text-slate-900 dark:text-slate-100 truncate">
                            {bld.name}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">
                            {bld.items.length} {t('lib.gamesSuffix')} · {bld.targetProfileName}
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={alreadyIn}
                          onClick={() => handleAddGameToBuild(addToBuildGame, bld.id)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 shrink-0 transition ${
                            alreadyIn
                              ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 cursor-default'
                              : 'bg-blue-600 cursor-pointer'
                          }`}
                        >
                          {alreadyIn ? (
                            <>
                              <Check className="w-3.5 h-3.5" />
                              <span>{t('buildModal.alreadyAdded')}</span>
                            </>
                          ) : (
                            <>
                              <Plus className="w-3.5 h-3.5" />
                              <span>{t('buildModal.addBtn')}</span>
                            </>
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2">
              <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                {t('buildModal.newTitle')}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newBuildNameInput}
                  onChange={(e) => setNewBuildNameInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newBuildNameInput.trim()) {
                      handleAddGameToBuild(addToBuildGame, null, newBuildNameInput);
                    }
                  }}
                  placeholder={t('buildModal.newPlaceholder')}
                  className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-600"
                />
                <button
                  type="button"
                  disabled={!newBuildNameInput.trim()}
                  onClick={() => handleAddGameToBuild(addToBuildGame, null, newBuildNameInput)}
                  className="bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer disabled:opacity-40 shrink-0"
                >
                  {t('buildModal.createAndAdd')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* SEPARATE LOG MODAL WINDOW                                            */}
      {/* ==================================================================== */}
      {isLogModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-2xl max-w-3xl w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <ScrollText className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                <div>
                  <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    {t('status.journalTitle')}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    ({logs.length})
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopyLogs}
                  className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>{copiedLogs ? t('status.copied') : t('status.copy')}</span>
                </button>
                {onClearLogs && (
                  <button
                    onClick={onClearLogs}
                    className="px-3 py-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/60 hover:bg-rose-100 text-rose-700 dark:text-rose-300 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{t('status.clear')}</span>
                  </button>
                )}
                <button
                  onClick={() => setIsLogModalOpen(false)}
                  className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div
              className={`rounded-xl px-3.5 py-2.5 border text-xs flex items-center justify-between gap-3 ${
                activeRunning
                  ? 'bg-blue-50 dark:bg-blue-950/60 border-blue-300 dark:border-blue-700 text-blue-950 dark:text-blue-200'
                  : 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0 font-mono font-bold truncate">
                {activeRunning ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-600 dark:text-blue-400 shrink-0" />
                ) : (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                )}
                <span className="truncate">
                  {activeRunning ? `⏳ (${activePct}%): ` : '✔ '}
                  {statusLineText}
                </span>
              </div>
            </div>

            <div className="font-mono text-xs text-slate-800 dark:text-slate-200 h-80 overflow-y-auto space-y-1.5 bg-slate-50 dark:bg-slate-950 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 select-text">
              {logs.length === 0 ? (
                <div className="text-slate-400 py-8 text-center">—</div>
              ) : (
                logs.map((line, idx) => (
                  <div key={idx} className="leading-relaxed border-b border-slate-200/40 dark:border-slate-800/40 pb-1">
                    {line}
                  </div>
                ))
              )}
            </div>

            <div className="flex items-center justify-end pt-1">
              <button
                onClick={() => setIsLogModalOpen(false)}
                className="bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded-xl text-xs font-bold cursor-pointer"
              >
                {t('status.close')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Library External Source Sync & Discrepancy Modal */}
      <SyncDiffModal
        isOpen={librarySyncModalOpen}
        mode="library_sync"
        onClose={() => setLibrarySyncModalOpen(false)}
        currentLibraryRows={gamesSource}
        onScanExternalSourceFolder={onScanExternalSourceForDiff}
        onApplyLibrarySync={handleApplyLibrarySyncEntries}
        onAddLog={onAddLog}
      />
    </div>
  );
};
