import type { UnifiedGameRow } from '../components/FigmaConceptStudio';
import type { FlashDriveCapacityTier } from '../utils/buildsAndConverterEngine';

export interface PortMasterGame {
  id: string; // e.g. "stardewvalley.zip"
  slug: string; // e.g. "stardewvalley"
  title: string;
  desc: string;
  genres: string[];
  readyToRun: boolean;
  porter: string[];
  runtime: string[];
  requirements: string[];
  instructionsRaw: string;
  instructionsMd: string;
  requiredDataTargetPath: string; // e.g. "ports/stardewvalley/gamedata" or "ports/Half-Life/valve"
  requiredDataHint: string;
  items: string[]; // files/folders inside the zip
  availDevices: string[];
  supportedConsolesPretty: string[];
  coverUrl: string;
  screenshotUrl: string;
  downloadUrl: string;
  sizeBytes: number;
  dateUpdated: string;
  md5: string;
}

export interface PortMasterSourceConfig {
  slug: string;
  localPathLabel: string;
  dirHandle?: any; // FileSystemDirectoryHandle if selected via showDirectoryPicker
  files?: Array<{ file: File; relPath: string }>; // fallback files if selected via webkitdirectory
  downloadedZipAt?: string;
}

export type SyncDiffCategory =
  | 'new_rom'
  | 'different_edition'
  | 'library_only'
  | 'identical';

export type SyncResolutionAction =
  | 'add'
  | 'replace_library'
  | 'keep_both'
  | 'skip'
  | 'update_build';

export interface SyncDiffEntry {
  id: string;
  category: SyncDiffCategory;
  comparisonKey: string;
  consoleShort: string;
  title: string;
  externalRow?: UnifiedGameRow;
  libraryRow?: UnifiedGameRow;
  externalEditionLabel?: string;
  libraryEditionLabel?: string;
  diffReason: string;
  action: SyncResolutionAction;
  selected: boolean;
  // For build_sync mode:
  buildTargetPath?: string;
  buildFolderPath?: string;
  buildOldFileName?: string;
  buildTargetExt?: string;
}

export interface SavedBuildItem {
  gameId: string;
  title: string;
  consoleShort: string;
  cleanFile: string;
  oldFile: string;
  region: string;
  crc32: string;
  sourceExt: string;
  targetExt: string;
  folderPath: string;
  targetPath: string; // e.g. "psx/Tekken 3 (RUS).chd" or "psx/Final Fantasy VII (RUS)/Final Fantasy VII (RUS).m3u"
  discCount?: number;
  m3uFileName?: string;
}

export interface SavedBuildRecord {
  id: string;
  name: string;
  targetProfileId: string;
  targetProfileName: string;
  exportFolderName?: string;
  flashCapacityTier: FlashDriveCapacityTier;
  formatOverrides: Record<string, string>;
  createdAt: string;
  updatedAt: string;
  lastSyncedAt?: string;
  items: SavedBuildItem[];
  portMasterSlugs: string[];
}

export type FilenameTokenId = 'name' | 'year' | 'region' | 'bitness' | 'console';
export type FilenameTokenWrap = 'none' | 'parens' | 'brackets';
export type FilenameSeparator = ' ' | ' - ' | '_';

export interface FilenameTokenItem {
  id: FilenameTokenId;
  label: string;
  enabled: boolean;
  wrap: FilenameTokenWrap;
}

export interface FilenameConstructorConfig {
  tokens: FilenameTokenItem[];
  separator: FilenameSeparator;
  preserveRevision: boolean;
}

export interface BufferRomPreviewItem {
  id: string;
  originalFileName: string;
  relativePath: string;
  cleanTitle: string;
  year: number;
  region: string;
  bitness: string;
  consoleCode: string;
  extension: string;
  revision?: string;
  proposedFileName: string;
  targetFolderRelPath: string;
  actionLabel: string;
  isDuplicateOrJunk: boolean;
  fileSize: number;
  crc32: string;
}

export interface PortMasterPcRuntimeInfo {
  engineLabel: string;
  emulatorId: string;
  canRunNativeWindows: boolean;
  summary: string;
  commandPreview: string;
}

