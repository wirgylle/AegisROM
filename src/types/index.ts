export type ConsolePlatform =
  | 'all'
  | 'nes'
  | 'snes'
  | 'genesis'
  | 'gba'
  | 'gb'
  | 'gbc'
  | 'n64'
  | 'psx'
  | 'arcade'
  | 'pce';

export interface PlatformInfo {
  id: ConsolePlatform;
  name: string;
  shortName: string;
  company: string;
  releaseYear: number;
  extensions: string[];
  defaultCore: string;
  color: string;
  datSource: 'No-Intro' | 'Redump' | 'MAME';
  totalDatEntries: number;
}

export type RomStatus = 'verified' | 'renamed' | 'duplicate_clone' | 'junk_bad_dump' | 'unknown';

export interface DatEntry {
  id: string;
  title: string;
  canonicalName: string;
  platform: ConsolePlatform;
  crc32: string;
  md5: string;
  sha1: string;
  size: number;
  region: 'USA' | 'Europe' | 'Japan' | 'World' | 'Germany' | 'France' | 'Spain' | 'Italy' | 'Other';
  parentTitle?: string;
  revision?: string;
  languages?: string[];
  isBadDump?: boolean;
  isHack?: boolean;
  isPrototype?: boolean;
  isUnlicensed?: boolean;
}

export interface ScrapedMetadata {
  title: string;
  developer: string;
  publisher: string;
  releaseDate: string;
  genre: string;
  rating: string;
  score: number;
  boxArtUrl: string;
  screenshotUrl: string;
  synopsis: string;
  players: string;
}

export interface RomItem {
  id: string;
  fileName: string;
  filePath: string;
  fileSize: number;
  detectedPlatform: ConsolePlatform;
  crc32: string;
  headerlessCrc32?: string;
  archiveEntryName?: string;
  md5?: string;
  sha1?: string;
  status: RomStatus;
  matchedDat?: DatEntry;
  suggestedName?: string;
  is1G1RWinner?: boolean;
  cloneGroup?: string;
  quarantineReason?: string;
  metadata?: ScrapedMetadata;
  handle?: FileSystemFileHandle | null;
  file?: File | null;
}

export interface RegionPriorityConfig {
  order: string[]; // e.g. ['USA', 'Europe', 'Japan', 'World', 'Other']
  preferRevisions: boolean;
  excludeBadDumps: boolean;
  excludePrototypes: boolean;
  excludeHacks: boolean;
  excludeUnlicensed: boolean;
  excludeTranslations: boolean;
}

export interface EmulatorProfile {
  id: string;
  name: string;
  type: 'retroarch' | 'standalone';
  platform: ConsolePlatform;
  executableName: string;
  coreName?: string;
  launchArguments: string;
  defaultInstallPath: string;
}

export interface ScanStats {
  totalFiles: number;
  totalBytes: number;
  verifiedCount: number;
  needRenameCount: number;
  cloneDuplicatesCount: number;
  junkCount: number;
  unknownCount: number;
  scanTimeMs: number;
}
