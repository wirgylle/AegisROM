import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  FolderOpen,
  Download,
  Sparkles,
  CheckCircle2,
  Copy,
  Trash2,
  Search,
  RefreshCw,
  Undo2,
  AlertTriangle,
  FileSpreadsheet,
  ShieldCheck,
  Film,
  Image as ImageIcon,
  Layers,
  Eye,
  X,
  FileSignature,
  FolderSearch,
  Archive,
  CheckSquare,
  Square,
  Info,
  Wrench,
  Database,
  Gamepad2,
  FolderInput,
  Share2,
  OctagonX,
  FileCode2,
  Sun,
  Moon,
  LayoutGrid,
  List,
  Table as TableIcon,
} from 'lucide-react';
import { computeCRC32Hex } from './utils/crc32';
import {
  fetchDatStatus,
  fetchLibretroDats,
  lookupTitlesByHash,
  systemsWithoutDat,
  type DatMatch,
} from './utils/datHashLookup';
import {
  isReadableTitle,
  isScrapeMatched,
  mergeScrapedUrls,
  slotsToDownload,
  type MediaSlot,
} from './utils/scrapePlan';
import {
  findGamelistEntry,
  indexGamelistEntries,
  normalizeGamelistPath,
  parseGamelistEntries,
  relativeFileExists,
  unescapeXml,
  type GamelistEntry,
} from './utils/gamelistXml';
import {
  ConsoleSteamTabs,
  type PersistentDbState,
  type PersistentRomRecord,
} from './components/ConsoleSteamTabs';
import { EXTENDED_CONSOLE_CATALOG, inferGenreAndYear } from './data/consoleSteamCatalog';
import { FACTORY_NUMBER_TO_TITLE_MAP } from './data/r36sFactoryGamelistMap';
import {
  XmlMappingModal,
  extractCoreNumberKey,
  type SelectableXmlMapping,
} from './components/XmlMappingModal';
import {
  FigmaConceptStudio,
  type FigmaConceptId,
  type MultiDiscEntry,
  type UnifiedGameRow,
} from './components/FigmaConceptStudio';
import { APP_VERSION } from './version';
import type {
  BufferRomPreviewItem,
  FilenameConstructorConfig,
} from './types/aegis';
import {
  formatRomFilenameByConfig,
  formatRomStemByConfig,
  loadFilenameConstructorConfig,
  normalizeDiskOutputExt,
  normalizeRegionTag,
  saveFilenameConstructorConfig,
  FILENAME_CONSTRUCTOR_PRESETS,
} from './utils/filenameConstructor';
import {
  SetupWizard,
  SetupRunPanel,
  SETUP_DONE_STORAGE_KEY,
  INSTALL_MODE_STORAGE_KEY,
  type SetupFolderKind,
  type SetupWizardResult,
  type SetupPickResult,
  type SetupRunState,
  type SetupStage,
  type TourTarget,
} from './components/SetupWizard';
import {
  buildDiscTargetFilename,
  buildMultiDiscFolderName,
  extractDiscNumberAndBaseTitle,
  generateM3uPlaylistText,
  parseM3uPlaylistLines,
} from './utils/multiDiscEngine';
import {
  saveDirectoryHandle,
  listAllSavedDirectoryHandles,
  findSavedHandleMatchingPath,
  checkOrRequestHandlePermission,
  collectLocalMediaFromHandle,
  type StoredDirHandleRecord,
  isDeadOrLocalBlobUrl,
} from './utils/persistentHandles';
import {
  auditRomMediaOnDisk,
  isFetchedMediaPayloadValid,
  type FolderMediaSignatureStats,
  type RomMediaAuditResult,
} from './utils/mediaPlaceholderDetector';
import { useI18n, tStatic, tfStatic, getActiveLocale } from './i18n/translations';
import {
  HACKROMS_DIR,
  describeRomMod,
  detectRomMod,
  isInPatchFolder,
  isModded,
  linkPatchesToRom,
  modTag,
  refineModWithDat,
  type PatchFileRef,
  type RomModInfo,
} from './utils/romHacks';
import { isPatchFileName, readPatchInfo } from './utils/romPatcher';
import { HackMoveModal, type HackMoveCandidate } from './components/HackMoveModal';

interface ConsoleMeta {
  code: string;
  displayName: string;
  generationFolder: string;
  generationShort: string;
  libretroSystem: string;
  archiveVideoId: string;
}

const CONSOLE_CATALOG: Record<string, ConsoleMeta> = {
  nes: {
    code: 'nes',
    displayName: 'Nintendo NES / Dendy',
    generationFolder: '1_8bit (NES, Famicom, MasterSystem, Atari)',
    generationShort: '8-bit',
    libretroSystem: 'Nintendo - Nintendo Entertainment System',
    archiveVideoId: 'nessnaps',
  },
  famicom: {
    code: 'famicom',
    displayName: 'Nintendo Famicom',
    generationFolder: '1_8bit (NES, Famicom, MasterSystem, Atari)',
    generationShort: '8-bit',
    libretroSystem: 'Nintendo - Nintendo Entertainment System',
    archiveVideoId: 'NintendoFamicomVideoSnaps',
  },
  fds: {
    code: 'fds',
    displayName: 'Famicom Disk System',
    generationFolder: '1_8bit (NES, Famicom, MasterSystem, Atari)',
    generationShort: '8-bit',
    libretroSystem: 'Nintendo - Family Computer Disk System',
    archiveVideoId: 'nessnaps',
  },
  mastersystem: {
    code: 'mastersystem',
    displayName: 'Sega Master System',
    generationFolder: '1_8bit (NES, Famicom, MasterSystem, Atari)',
    generationShort: '8-bit',
    libretroSystem: 'Sega - Master System - Mark III',
    archiveVideoId: 'mastersystemsnaps',
  },
  atari2600: {
    code: 'atari2600',
    displayName: 'Atari 2600',
    generationFolder: '1_8bit (NES, Famicom, MasterSystem, Atari)',
    generationShort: '8-bit',
    libretroSystem: 'Atari - 2600',
    archiveVideoId: 'atari7800snaps',
  },
  atari7800: {
    code: 'atari7800',
    displayName: 'Atari 7800',
    generationFolder: '1_8bit (NES, Famicom, MasterSystem, Atari)',
    generationShort: '8-bit',
    libretroSystem: 'Atari - 7800',
    archiveVideoId: 'atari7800snaps',
  },
  snes: {
    code: 'snes',
    displayName: 'Super Nintendo (SNES / SFC)',
    generationFolder: '2_16bit (SNES, MegaDrive, PCEngine, Arcade)',
    generationShort: '16-bit',
    libretroSystem: 'Nintendo - Super Nintendo Entertainment System',
    archiveVideoId: 'snapssnaps',
  },
  genesis: {
    code: 'genesis',
    displayName: 'Sega Mega Drive / Genesis',
    generationFolder: '2_16bit (SNES, MegaDrive, PCEngine, Arcade)',
    generationShort: '16-bit',
    libretroSystem: 'Sega - Mega Drive - Genesis',
    archiveVideoId: 'genesissnaps',
  },
  pcengine: {
    code: 'pcengine',
    displayName: 'NEC PC Engine / TurboGrafx-16',
    generationFolder: '2_16bit (SNES, MegaDrive, PCEngine, Arcade)',
    generationShort: '16-bit',
    libretroSystem: 'NEC - PC Engine - TurboGrafx 16',
    archiveVideoId: 'pcenginesnaps',
  },
  sega32x: {
    code: 'sega32x',
    displayName: 'Sega 32X',
    generationFolder: '2_16bit (SNES, MegaDrive, PCEngine, Arcade)',
    generationShort: '16-bit',
    libretroSystem: 'Sega - 32X',
    archiveVideoId: '32xsnaps',
  },
  arcade: {
    code: 'arcade',
    displayName: 'Arcade / FBNeo / NeoGeo',
    generationFolder: '2_16bit (SNES, MegaDrive, PCEngine, Arcade)',
    generationShort: '16-bit',
    libretroSystem: 'FBNeo - Arcade Games',
    archiveVideoId: 'neogeosnaps_202302',
  },
  gb: {
    code: 'gb',
    displayName: 'Nintendo Game Boy',
    generationFolder: '3_Portable (GB, GBC, GBA, NDS, PSP, GameGear)',
    generationShort: 'Handheld',
    libretroSystem: 'Nintendo - Game Boy',
    archiveVideoId: 'gbcsnaps',
  },
  gbc: {
    code: 'gbc',
    displayName: 'Nintendo Game Boy Color',
    generationFolder: '3_Portable (GB, GBC, GBA, NDS, PSP, GameGear)',
    generationShort: 'Handheld',
    libretroSystem: 'Nintendo - Game Boy Color',
    archiveVideoId: 'gbcsnaps',
  },
  gba: {
    code: 'gba',
    displayName: 'Nintendo Game Boy Advance',
    generationFolder: '3_Portable (GB, GBC, GBA, NDS, PSP, GameGear)',
    generationShort: 'Handheld',
    libretroSystem: 'Nintendo - Game Boy Advance',
    archiveVideoId: 'gbasnaps',
  },
  nds: {
    code: 'nds',
    displayName: 'Nintendo DS',
    generationFolder: '3_Portable (GB, GBC, GBA, NDS, PSP, GameGear)',
    generationShort: 'Handheld',
    libretroSystem: 'Nintendo - Nintendo DS',
    archiveVideoId: 'gbasnaps',
  },
  psp: {
    code: 'psp',
    displayName: 'Sony PlayStation Portable (PSP)',
    generationFolder: '3_Portable (GB, GBC, GBA, NDS, PSP, GameGear)',
    generationShort: 'Handheld',
    libretroSystem: 'Sony - PlayStation Portable',
    archiveVideoId: 'SonyPSPVideoSnaps',
  },
  gamegear: {
    code: 'gamegear',
    displayName: 'Sega Game Gear',
    generationFolder: '3_Portable (GB, GBC, GBA, NDS, PSP, GameGear)',
    generationShort: 'Handheld',
    libretroSystem: 'Sega - Game Gear',
    archiveVideoId: 'gamegearsnaps',
  },
  lynx: {
    code: 'lynx',
    displayName: 'Atari Lynx',
    generationFolder: '3_Portable (GB, GBC, GBA, NDS, PSP, GameGear)',
    generationShort: 'Handheld',
    libretroSystem: 'Atari - Lynx',
    archiveVideoId: 'atari7800snaps',
  },
  psx: {
    code: 'psx',
    displayName: 'Sony PlayStation 1',
    generationFolder: '4_32_64bit_3D (PlayStation 1, Nintendo 64)',
    generationShort: '32/64-bit 3D',
    libretroSystem: 'Sony - PlayStation',
    archiveVideoId: 'SonyPlaystationVideoSnaps',
  },
  n64: {
    code: 'n64',
    displayName: 'Nintendo 64',
    generationFolder: '4_32_64bit_3D (PlayStation 1, Nintendo 64)',
    generationShort: '32/64-bit 3D',
    libretroSystem: 'Nintendo - Nintendo 64',
    archiveVideoId: 'n64snaps',
  },
  dreamcast: {
    code: 'dreamcast',
    displayName: 'Sega Dreamcast',
    generationFolder: '5_128bit_6thGen (PS2, Dreamcast, GameCube, Xbox)',
    generationShort: '128-bit 3D',
    libretroSystem: 'Sega - Dreamcast',
    archiveVideoId: 'dreamcastsnaps',
  },
  ps2: {
    code: 'ps2',
    displayName: 'Sony PlayStation 2',
    generationFolder: '5_128bit_6thGen (PS2, Dreamcast, GameCube, Xbox)',
    generationShort: '128-bit 3D',
    libretroSystem: 'Sony - PlayStation 2',
    archiveVideoId: 'SonyPlaystation2VideoSnaps',
  },
  gc: {
    code: 'gc',
    displayName: 'Nintendo GameCube',
    generationFolder: '5_128bit_6thGen (PS2, Dreamcast, GameCube, Xbox)',
    generationShort: '128-bit 3D',
    libretroSystem: 'Nintendo - GameCube',
    archiveVideoId: 'gamecubesnaps',
  },
  xbox: {
    code: 'xbox',
    displayName: 'Microsoft Xbox (Original / 360)',
    generationFolder: '5_128bit_6thGen (PS2, Dreamcast, GameCube, Xbox)',
    generationShort: '128-bit 3D',
    libretroSystem: 'Microsoft - Xbox',
    archiveVideoId: 'xboxsnaps',
  },
  wii: {
    code: 'wii',
    displayName: 'Nintendo Wii',
    generationFolder: '6_HD_Modern (PS3, Switch, Wii)',
    generationShort: 'HD / Modern',
    libretroSystem: 'Nintendo - Wii',
    archiveVideoId: 'wiisnaps',
  },
  ps3: {
    code: 'ps3',
    displayName: 'Sony PlayStation 3 (CFW / HEN / RPCS3)',
    generationFolder: '6_HD_Modern (PS3, Switch, Wii)',
    generationShort: 'HD / Modern',
    libretroSystem: 'Sony - PlayStation 3',
    archiveVideoId: 'ps3snaps',
  },
  switch: {
    code: 'switch',
    displayName: 'Nintendo Switch (Atmosphere / Ryujinx)',
    generationFolder: '6_HD_Modern (PS3, Switch, Wii)',
    generationShort: 'HD / Modern',
    libretroSystem: 'Nintendo - Switch',
    archiveVideoId: 'switchsnaps',
  },
  ports: {
    code: 'ports',
    displayName: 'PortMaster (PC / Linux Ports)',
    generationFolder: '7_PortMaster (PC_Linux Ports)',
    generationShort: '32/64-bit 3D',
    libretroSystem: 'DOOM',
    archiveVideoId: 'dosboxsnaps',
  },
};

const EXT_TO_DEFAULT_CONSOLE: Record<string, string> = {
  '.sfc': 'snes',
  '.smc': 'snes',
  '.fig': 'snes',
  '.swc': 'snes',
  '.nes': 'nes',
  '.unf': 'nes',
  '.fds': 'fds',
  '.md': 'genesis',
  '.gen': 'genesis',
  '.smd': 'genesis',
  '.bin': 'psx',
  '.32x': 'sega32x',
  '.sms': 'mastersystem',
  '.gg': 'gamegear',
  '.gba': 'gba',
  '.agb': 'gba',
  '.gb': 'gb',
  '.gbc': 'gbc',
  '.z64': 'n64',
  '.n64': 'n64',
  '.v64': 'n64',
  '.nds': 'nds',
  '.iso': 'psx',
  '.cue': 'psx',
  '.img': 'psx',
  '.ccd': 'psx',
  '.sub': 'psx',
  '.mdf': 'psx',
  '.mds': 'psx',
  '.toc': 'psx',
  '.m3u': 'psx',
  '.chd': 'psx',
  '.pbp': 'psx',
  '.cso': 'psp',
  '.pce': 'pcengine',
  '.sgx': 'pcengine',
  '.a26': 'atari2600',
  '.a78': 'atari7800',
  '.lnx': 'lynx',
  '.zip': 'arcade',
  '.gdi': 'dreamcast',
  '.cdi': 'dreamcast',
  '.rvz': 'gc',
  '.gcm': 'gc',
  '.wbfs': 'wii',
  '.xiso': 'xbox',
  '.pkg': 'ps3',
  '.nsp': 'switch',
  '.xci': 'switch',
  '.nsz': 'switch',
};

const PS1_SERIAL_DICTIONARY: Record<string, string> = {
  'SCUS-94163': 'Final Fantasy VII',
  'SCUS-94164': 'Final Fantasy VII (Disc 2)',
  'SCUS-94165': 'Final Fantasy VII (Disc 3)',
  'SLUS-00892': 'Final Fantasy VIII',
  'SLUS-01251': 'Final Fantasy IX',
  'SLUS-00594': 'Metal Gear Solid',
  'SLUS-00776': 'Metal Gear Solid (Disc 2)',
  'SLUS-00067': 'Castlevania - Symphony of the Night',
  'SCUS-94228': 'Spyro the Dragon',
  'SCUS-94425': 'Spyro 2 - Riptos Rage!',
  'SCUS-94467': 'Spyro - Year of the Dragon',
  'SCUS-94900': 'Crash Bandicoot',
  'SCUS-94154': 'Crash Bandicoot 2 - Cortex Strikes Back',
  'SCUS-94244': 'Crash Bandicoot - Warped',
  'SCUS-94426': 'Crash Team Racing',
  'SCUS-94571': 'Crash Bash',
  'SLUS-00402': 'Tekken 3',
  'SLUS-00213': 'Tekken 2',
  'SLUS-00006': 'Tekken',
  'SLUS-00748': 'Resident Evil 2',
  'SLUS-00923': 'Resident Evil 3 - Nemesis',
  'SLUS-00170': 'Resident Evil',
  'SLUS-00707': 'Silent Hill',
  'SCUS-94194': 'Gran Turismo',
  'SCUS-94455': 'Gran Turismo 2 (Arcade Mode)',
  'SCUS-94488': 'Gran Turismo 2 (Simulation Mode)',
  'SLUS-00869': 'Tony Hawks Pro Skater',
  'SLUS-01066': 'Tony Hawks Pro Skater 2',
  'SLUS-01419': 'Tony Hawks Pro Skater 3',
  'SLUS-00339': 'Tomb Raider',
  'SLUS-00437': 'Tomb Raider II',
  'SLUS-00691': 'Tomb Raider III',
  'SLUS-00724': 'Dino Crisis',
  'SLUS-01279': 'Dino Crisis 2',
  'SLUS-00662': 'Parasite Eve',
  'SLUS-01042': 'Parasite Eve II',
  'SLUS-01041': 'Chrono Cross',
  'SLUS-00664': 'Xenogears',
  'SLUS-00958': 'Vagrant Story',
  'SCUS-94491': 'The Legend of Dragoon',
  'SCUS-94240': 'MediEvil',
  'SCUS-94564': 'MediEvil II',
  'SLUS-00611': 'Driver',
  'SLUS-01161': 'Driver 2',
  'SCUS-94249': 'Twisted Metal 2',
  'SCUS-94304': 'Twisted Metal III',
  'SCUS-94560': 'Twisted Metal 4',
  'SCUS-94248': 'Syphon Filter',
  'SCUS-94451': 'Syphon Filter 2',
  'SCUS-94640': 'Syphon Filter 3',
  'SLUS-01115': 'Spider-Man',
  'SLUS-01378': 'Spider-Man 2 - Enter Electro',
  'SLUS-00705': 'Pepsiman',
  'SLPS-01762': 'Pepsiman',
  'SLUS-00845': 'Mortal Kombat 4',
  'SLUS-00330': 'Mortal Kombat Trilogy',
  'SLUS-00779': 'Vigilante 8',
  'SLUS-00988': 'Vigilante 8 - 2nd Offense',
  'SLUS-00615': 'Need for Speed III - Hot Pursuit',
  'SLUS-00826': 'Need for Speed - High Stakes',
  'SLUS-01104': 'Need for Speed - Porsche Unleashed',
  'SLUS-01031': 'Medal of Honor',
  'SLUS-01270': 'Medal of Honor - Underground',
  'SLUS-00551': 'Diablo',
  'SLUS-00782': 'Legacy of Kain - Soul Reaver',
  'SLUS-00014': 'Rayman',
  'SLUS-01235': 'Rayman 2 - The Great Escape',
  'SLUS-00561': 'Mega Man X4',
  'SLUS-01334': 'Mega Man X5',
  'SLUS-01395': 'Mega Man X6',
  'SLUS-00453': 'Mega Man 8',
  'SLUS-00603': 'Mega Man Legends',
  'SLUS-01140': 'Mega Man Legends 2',
  'SLUS-00975': 'Jackie Chan Stuntmaster',
  'SLUS-01176': 'WWE SmackDown! 2 - Know Your Role',
  'SLUS-00765': 'Quake II',
  'SLUS-00077': 'Doom',
  'SLUS-00922': 'Fighting Force',
  'SLUS-00665': 'Hogs of War',
  'SLUS-00886': 'Worms Armageddon',
  'SLUS-01441': 'Worms World Party',
  'SLUS-00972': '007 - Tomorrow Never Dies',
  'SLUS-01207': '007 - The World Is Not Enough',
  'SLUS-01300': '007 Racing',
  'SLES-02512': '007 - Tomorrow Never Dies',
  'SLES-03134': '007 - The World Is Not Enough',
  'SLES-03363': '007 Racing',
  'SCES-00344': 'Crash Bandicoot',
  'SCES-00967': 'Crash Bandicoot 2 - Cortex Strikes Back',
  'SCES-01420': 'Crash Bandicoot 3 - Warped',
  'SCES-02105': 'Crash Team Racing',
  'SCES-02834': 'Crash Bash',
  'SCES-01430': 'Spyro the Dragon',
  'SCES-02104': 'Spyro 2 - Gateway to Glimmer',
  'SCES-02835': 'Spyro - Year of the Dragon',
  'SCES-01237': 'Tekken 3',
  'SCES-00255': 'Tekken 2',
  'SCES-00005': 'Tekken',
  'SCES-00867': 'Final Fantasy VII',
  'SLES-01880': 'Final Fantasy VIII',
  'SLES-02965': 'Final Fantasy IX',
  'SLES-01370': 'Metal Gear Solid',
  'SLES-00524': 'Castlevania - Symphony of the Night',
  'SLES-00972': 'Resident Evil 2',
  'SLES-02529': 'Resident Evil 3 - Nemesis',
  'SLES-01514': 'Silent Hill',
  'SCES-00984': 'Gran Turismo',
  'SCES-02380': 'Gran Turismo 2',
  'SLES-02055': 'Tony Hawks Pro Skater',
  'SLES-02908': 'Tony Hawks Pro Skater 2',
  'SLES-03645': 'Tony Hawks Pro Skater 3',
  'SLES-01816': 'Driver',
  'SLES-02993': 'Driver 2',
  'SCES-01910': 'Syphon Filter',
  'SCES-02612': 'Syphon Filter 2',
  'SCES-03692': 'Syphon Filter 3',
  'SCES-01492': 'MediEvil',
  'SCES-02544': 'MediEvil 2',
  'SLES-01906': 'Dino Crisis',
  'SLES-03221': 'Dino Crisis 2',
  'SLES-02830': 'Medal of Honor',
  'SLES-03185': 'Medal of Honor - Underground',
  'SLES-01404': 'Diablo',
  'SLES-02389': 'Hogs of War',
  'SLES-01919': 'Worms Armageddon',
  'SLES-03804': 'Worms World Party',
};

// Откуда взято название рома (показывается в карточке игры и журнале).
type TitleSource =
  | 'gamelist'
  | 'factory'
  | 'header'
  | 'filename'
  | 'index-strip'
  | 'libretro-exact'
  | 'libretro-fuzzy'
  | 'dat-nointro'
  | 'dat-redump'
  | 'dat';

interface ScannedRomFile {
  id: string;
  relativePath: string;
  sourceSubfolder: string;
  fileName: string;
  cleanTitle: string;
  extractedInternalTitle: string;
  isNumberedName: boolean;
  comparisonKey: string;
  canonicalName: string;
  extension: string;
  consoleCode: string;
  generationFolder: string;
  generationShort: string;
  fileSize: number;
  crc32: string;
  headerlessCrc32: string;
  region: string;
  isRussian: boolean;
  isFromTopFolder: boolean;
  revision: string;
  status: 'verified' | 'duplicate_clone' | 'junk_bad_dump';
  is1G1RWinner: boolean;
  reason: string;
  scrapedBoxArtUrl?: string;
  scrapedSnapUrl?: string;
  scrapedMarqueeUrl?: string;
  scrapedVideoUrl?: string;
  mediaStatus: string;
  discNumber?: number | null;
  discCount?: number;
  isMultiDisc?: boolean;
  multiDiscFolderName?: string;
  m3uFileName?: string;
  discs?: ScannedRomFile[];
  fileObj?: File;
  companionFiles?: File[];
  cueText?: string;
  parentHandle?: any;
  targetDirHandle?: any;
  titleSource?: TitleSource;
  // Почему настоящее название не найдено (пусто, если найдено).
  titleNote?: string;
  // Хак, перевод или пропатченный ром (см. utils/romHacks.ts).
  // Hack, translation or patched ROM (see utils/romHacks.ts).
  mod?: RomModInfo;
}

interface PhantomFolderCandidate {
  id: string;
  relPath: string;
  folderName: string;
  parentConsole: string;
  categoryReason: string;
  fileCount: number;
  totalSizeBytes: number;
  checked: boolean;
  parentDirHandle?: any;
}

interface UndoAction {
  fromDirHandle: any;
  fromName: string;
  toDirHandle: any;
  toName: string;
  fileData: ArrayBuffer;
}

const REGION_REGEX =
  /\((USA|Europe|Japan|World|Russia|Rus|Ru|Germany|France|Spain|Italy|Australia|Asia|Korea|Brazil|China|En,Fr,De|En,Ja|U|E|J|W|UE|JU)\)/i;
const RUS_TAG_REGEX =
  /(\[rus\]|\(rus\)|\(ru\)|\[r-rus\]|\[russian\]|\(russian\)|_rus\b|\.rus\b|\brus\b|рус)/i;
const REVISION_REGEX = /\((Rev\s*[0-9A-Z]+|v[0-9]+\.[0-9]+|Alt\s*[0-9]*)\)/i;
// [h] (хак) и [t] (трейнер) — не мусор: их распознаёт utils/romHacks.ts.
// [h] (hack) and [t] (trainer) are not junk: utils/romHacks.ts handles them.
const JUNK_REGEX =
  /\[(b[0-9]*|p[0-9]*|o[0-9]*)\]|\((Pirate|Bootleg|Corrupt|Bad)\)/i;
const LEADING_NUM_REGEX = /^[\s\[\(#]*(\d{1,10})[\s\])\._-]+/;
const PURE_NUMBERED_ROM_REGEX =
  /^(?:rom[_\-\s]*|game[_\-\s]*|track[_\-\s]*|file[_\-\s]*|psx[_\-\s]*|ps1[_\-\s]*|no[_\-\s]*|#)?0*(\d{1,10})(?:[_\-\s]*(?:disc|cd|d|part|track)?[_\-\s]*\d*)?$/i;
const PREFIXED_SEQ_ROM_REGEX = /^[\s\[\(#]*0*(\d{1,10})[\s\])\._-]+(.*)$/;
const PS1_SERIAL_REGEX =
  /\b(SLUS|SCUS|SLES|SCES|SLPS|SLPM|SCPS|PAPX|PCPX|LSP|SIPS|ESPM)[_.\-\s]?(\d{3})[_.\-\s]?(\d{2})\b/i;

const NOISE_WORDS = new Set([
  'the',
  'and',
  'version',
  'edition',
  'rus',
  'russian',
  'ru',
  'eng',
  'english',
  'usa',
  'eur',
  'europe',
  'japan',
  'jpn',
  'world',
  'rev',
  'v1',
  'v2',
  'top',
  'top100',
  'рус',
  'русская',
  'версия',
  'перевод',
]);

const OFFICIAL_R36S_MEDIA_DIRS = new Set(['images', 'marquees', 'videos']);

// Защищённые системные и консольные папки флешки R36S (EASYROMS), удаление которых ломает монтирование ArkOS / DarkOS
const PROTECTED_R36S_DIRS = new Set([
  'bios',
  'tools',
  'themes',
  'ports',
  'launchimages',
  'bgmusic',
  'backup',
  'saves',
  'savestates',
  'screenshots',
  'movies',
  'music',
  'easyroms',
  'roms',
  'roms2',
  'anbernic',
  'arkos',
  'darkos',
  'emuelec',
  'retroarch',
  'gamedata',
  'nes',
  'famicom',
  'fds',
  'snes',
  'sfc',
  'gb',
  'gbc',
  'gba',
  'nds',
  'n64',
  'megadrive',
  'genesis',
  'mastersystem',
  'gamegear',
  'sega32x',
  'segacd',
  'dreamcast',
  'saturn',
  'psx',
  'ps1',
  'psp',
  'pcengine',
  'pce',
  'arcade',
  'mame',
  'fbneo',
  'neogeo',
  'cps1',
  'cps2',
  'cps3',
  'atari2600',
  'atari5200',
  'atari7800',
  'lynx',
  'pico8',
  'tic80',
  'scummvm',
  'dos',
  'openbor',
  'solarus',
  'easyrpg',
]);

const PHANTOM_MEDIA_DIR_KEYS: Record<string, Parameters<typeof tStatic>[0]> = {
  download_images: 'app.phan.dirDesc.download_images',
  downloaded_images: 'app.phan.dirDesc.downloaded_images',
  downloaded_media: 'app.phan.dirDesc.downloaded_media',
  boxart: 'app.phan.dirDesc.boxart',
  snaps: 'app.phan.dirDesc.snaps',
  snap: 'app.phan.dirDesc.snaps',
  wheels: 'app.phan.dirDesc.wheels',
  wheel: 'app.phan.dirDesc.wheels',
  titles: 'app.phan.dirDesc.titles',
  covers: 'app.phan.dirDesc.covers',
  mix: 'app.phan.dirDesc.mix',
  miximages: 'app.phan.dirDesc.mix',
  fanart: 'app.phan.dirDesc.fanart',
  manuals: 'app.phan.dirDesc.manuals',
  carts: 'app.phan.dirDesc.carts',
  '3dboxes': 'app.phan.dirDesc.3dboxes',
};

// Исключение для игр про Агента 007 (James Bond 007), чтобы не отрезать "007" и не попадать в цикл переименования
function isJamesBond007Game(text: string): boolean {
  const lower = text.toLowerCase().trim();
  const bondKeywords = [
    'james bond',
    'agent 007',
    'агент 007',
    'tomorrow never dies',
    'world is not enough',
    'goldeneye',
    '007 racing',
    'nightfire',
    'everything or nothing',
    'from russia with love',
    'agent under fire',
    'goldfinger',
    'licence to kill',
    'live and let die',
    'the duel',
    'quantum of solace',
    'blood stone',
  ];
  if (bondKeywords.some((kw) => lower.includes(kw))) {
    return true;
  }
  const m = lower.match(LEADING_NUM_REGEX);
  if (m && m[1] === '007') {
    const rest = lower.slice(m[0].length).trim();
    if (rest.length >= 3) return true;
  }
  return false;
}

function stripLeadingIndexExcept007(s: string): string {
  if (isJamesBond007Game(s)) {
    const m = s.match(LEADING_NUM_REGEX);
    if (m && m[1] !== '007') {
      const rest = s.slice(m[0].length).trim();
      if (rest.toLowerCase().startsWith('007')) {
        return rest;
      }
    }
    return s;
  }
  let res = s;
  for (let i = 0; i < 2; i++) {
    const m = res.match(LEADING_NUM_REGEX);
    if (!m) break;
    if (m[1] === '007') break;
    const candidateRest = res.slice(m[0].length).trim();
    // КРИТИЧЕСКИЙ ФИКС v4.3.1: Никогда не отрезаем номер, если после удаления тегов (USA)/(World) остается пустая строка!
    // Иначе 500 ненайденных файлов переименовываются в одно и то же имя без номера!
    const withoutTags = candidateRest.replace(/\[.*?\]|\(.*?\)/g, '').trim();
    const letterCount = (withoutTags.match(/[a-zA-Zа-яА-ЯёЁ]/g) || []).length;
    if (letterCount < 2) {
      break;
    }
    res = candidateRest;
  }
  return res;
}

function isNumberedRomFilename(
  fileName: string,
  extractedTitle = '',
  inSequentialFolder = false
): boolean {
  const base = fileName.replace(/\.[^/.]+$/, '').trim();
  const baseNoTags = base.replace(/\[.*?\]|\(.*?\)/g, '').trim();
  // Исключение 007: если файл уже называется "007 - Tomorrow Never Dies", не переименовываем повторно
  if (isJamesBond007Game(base) && base.length > 5) {
    const m = base.match(PREFIXED_SEQ_ROM_REGEX);
    if (!m || m[1] === '7' || base.trim().startsWith('007')) {
      return false;
    }
  }
  if (PURE_NUMBERED_ROM_REGEX.test(base) || PURE_NUMBERED_ROM_REGEX.test(baseNoTags)) {
    return true;
  }
  const stripped = stripLeadingIndexExcept007(baseNoTags).trim();
  if (stripped.length <= 1) return true;
  if (inSequentialFolder && PREFIXED_SEQ_ROM_REGEX.test(baseNoTags)) {
    return true;
  }
  return false;
}

function markSequentialNumberedRoms(items: ScannedRomFile[]): ScannedRomFile[] {
  const numsByDir = new Map<string, Set<number>>();
  for (const r of items) {
    const base = r.fileName.replace(/\.[^/.]+$/, '').trim();
    let numStr = '';
    const m1 = base.match(PURE_NUMBERED_ROM_REGEX);
    if (m1 && m1[1]) {
      numStr = m1[1];
    } else {
      const m2 = base.match(PREFIXED_SEQ_ROM_REGEX);
      if (m2 && m2[1]) {
        const rawLead = base.match(LEADING_NUM_REGEX);
        if (!(rawLead && rawLead[1] === '007' && isJamesBond007Game(base))) {
          numStr = m2[1];
        }
      }
    }
    if (numStr) {
      const n = parseInt(numStr, 10);
      if (!Number.isNaN(n) && n >= 0 && n <= 999999999) {
        const set = numsByDir.get(r.sourceSubfolder) || new Set<number>();
        set.add(n);
        numsByDir.set(r.sourceSubfolder, set);
      }
    }
  }

  const sequentialDirs = new Set<string>();
  for (const [dir, set] of numsByDir.entries()) {
    const sorted = Array.from(set).sort((a, b) => a - b);
    if (sorted.length >= 2) {
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i] - sorted[i - 1] <= 2) {
          sequentialDirs.add(dir);
          break;
        }
      }
    }
  }

  return items.map((r) => {
    const inSeq = sequentialDirs.has(r.sourceSubfolder);
    const isNum = isNumberedRomFilename(r.fileName, r.extractedInternalTitle, inSeq);
    return {
      ...r,
      isNumberedName: isNum,
    };
  });
}

function sanitizeAsciiTitle(bytes: Uint8Array): string {
  const chars: string[] = [];
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (b === 0) break;
    if (b >= 32 && b <= 126) {
      chars.push(String.fromCharCode(b));
    } else if (b === 9 || b === 10 || b === 13) {
      chars.push(' ');
    }
  }
  const s = chars.join('').replace(/\s+/g, ' ').trim();
  const letters = (s.match(/[a-zA-Z0-9]/g) || []).length;
  if (letters < 2) return '';
  return s;
}

function parseParamSFO(sfo: Uint8Array): string {
  if (sfo.length < 20) return '';
  if (sfo[0] !== 0x00 || sfo[1] !== 0x50 || sfo[2] !== 0x53 || sfo[3] !== 0x46) {
    return '';
  }
  const dv = new DataView(sfo.buffer, sfo.byteOffset, sfo.byteLength);
  const keyTableOffset = dv.getUint32(8, true);
  const dataTableOffset = dv.getUint32(12, true);
  const numEntries = dv.getUint32(16, true);
  if (numEntries > 256 || keyTableOffset >= sfo.length || dataTableOffset >= sfo.length) {
    return '';
  }

  let discID = '';
  for (let i = 0; i < numEntries; i++) {
    const entryPos = 20 + i * 16;
    if (entryPos + 16 > sfo.length) break;
    const keyOff = dv.getUint16(entryPos, true);
    const dataLen = dv.getUint32(entryPos + 4, true);
    const dataOff = dv.getUint32(entryPos + 12, true);

    const kStart = keyTableOffset + keyOff;
    if (kStart >= sfo.length) continue;
    let kEnd = kStart;
    while (kEnd < sfo.length && sfo[kEnd] !== 0) kEnd++;
    const keyName = new TextDecoder('utf-8').decode(sfo.subarray(kStart, kEnd));

    const dStart = dataTableOffset + dataOff;
    const dEnd = Math.min(dStart + dataLen, sfo.length);
    if (dStart >= sfo.length || dEnd <= dStart) continue;

    let rawVal = new TextDecoder('utf-8', { fatal: false })
      .decode(sfo.subarray(dStart, dEnd))
      .replace(/\0/g, '')
      .trim();

    if (
      keyName === 'TITLE' &&
      rawVal.length > 1 &&
      !PURE_NUMBERED_ROM_REGEX.test(rawVal)
    ) {
      return rawVal;
    }
    if (keyName === 'DISC_ID' && rawVal.length >= 4) {
      discID = rawVal;
    }
  }

  if (discID) {
    const norm = discID.toUpperCase().replace(/_/g, '-');
    const formatted =
      norm.length === 9 && !norm.includes('-') ? `${norm.slice(0, 4)}-${norm.slice(4)}` : norm;
    if (PS1_SERIAL_DICTIONARY[formatted]) {
      return PS1_SERIAL_DICTIONARY[formatted];
    }
  }
  return '';
}

function extractPS1MemoryCardTitleFromBuffer(buf: Uint8Array): string {
  for (let i = 0; i + 96 <= buf.length; i++) {
    if (buf[i] === 0x53 && buf[i + 1] === 0x43 && (buf[i + 2] === 0x11 || buf[i + 2] === 0x12 || buf[i + 2] === 0x13)) {
      const numIcons = buf[i + 3];
      if (numIcons < 1 || numIcons > 3) continue;
      const raw = buf.subarray(i + 4, i + 68);
      const chars: string[] = [];
      let j = 0;
      while (j < raw.length && raw[j] !== 0) {
        if (raw[j] === 0x82 && j + 1 < raw.length) {
          const b2 = raw[j + 1];
          if (b2 >= 0x4f && b2 <= 0x58) {
            chars.push(String.fromCharCode(0x30 + (b2 - 0x4f)));
            j += 2;
            continue;
          }
          if (b2 >= 0x60 && b2 <= 0x79) {
            chars.push(String.fromCharCode(0x41 + (b2 - 0x60)));
            j += 2;
            continue;
          }
          if (b2 >= 0x81 && b2 <= 0x9a) {
            chars.push(String.fromCharCode(0x61 + (b2 - 0x81)));
            j += 2;
            continue;
          }
        }
        if (raw[j] === 0x81 && j + 1 < raw.length) {
          const b2 = raw[j + 1];
          if (b2 === 0x40) chars.push(' ');
          else if (b2 === 0x46) chars.push(':');
          else if (b2 === 0x5b || b2 === 0x7c) chars.push('-');
          j += 2;
          continue;
        }
        if (raw[j] >= 32 && raw[j] <= 126) {
          chars.push(String.fromCharCode(raw[j]));
        }
        j++;
      }
      const decoded = chars.join('').replace(/\s+/g, ' ').trim();
      const letters = (decoded.match(/[a-zA-Z]/g) || []).length;
      if (
        decoded.length >= 4 &&
        letters >= 3 &&
        !PURE_NUMBERED_ROM_REGEX.test(decoded) &&
        !decoded.toUpperCase().includes('MEMORY CARD')
      ) {
        return decoded;
      }
    }
  }
  return '';
}

async function extractInternalBinaryRomTitle(
  file: File,
  ext: string,
  consoleCode: string
): Promise<string> {
  try {
    const headSize = Math.min(file.size, 2 * 1024 * 1024);
    const sliceBuf = await file.slice(0, headSize).arrayBuffer();
    const buf = new Uint8Array(sliceBuf);
    if (buf.length < 32) return '';
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

    if (
      buf.length >= 40 &&
      buf[0] === 0x00 &&
      buf[1] === 0x50 &&
      buf[2] === 0x42 &&
      buf[3] === 0x50
    ) {
      const sfoOffset = dv.getUint32(8, true);
      if (sfoOffset > 0 && sfoOffset + 32 < buf.length) {
        const title = parseParamSFO(buf.subarray(sfoOffset));
        if (title && !PURE_NUMBERED_ROM_REGEX.test(title)) return title;
      }
      const psarOffset = dv.getUint32(0x24, true);
      if (psarOffset > 0 && psarOffset < file.size) {
        const psarSlice = await file
          .slice(psarOffset, Math.min(file.size, psarOffset + 512 * 1024))
          .arrayBuffer();
        const psarText = new TextDecoder('latin1').decode(new Uint8Array(psarSlice));
        const pm = psarText.match(PS1_SERIAL_REGEX);
        if (pm) {
          const code = `${pm[1].toUpperCase()}-${pm[2]}${pm[3]}`;
          if (PS1_SERIAL_DICTIONARY[code]) return PS1_SERIAL_DICTIONARY[code];
        }
      }
    }

    if (ext === '.gba' || ext === '.agb' || consoleCode === 'gba') {
      if (buf.length >= 0xb0) {
        const t = sanitizeAsciiTitle(buf.subarray(0xa0, 0xac));
        if (t.length >= 3 && !PURE_NUMBERED_ROM_REGEX.test(t)) return t;
      }
    }

    if (ext === '.gb' || ext === '.gbc' || consoleCode === 'gb' || consoleCode === 'gbc') {
      if (buf.length >= 0x144) {
        const t = sanitizeAsciiTitle(buf.subarray(0x134, 0x143));
        if (t.length >= 3 && !PURE_NUMBERED_ROM_REGEX.test(t)) return t;
      }
    }

    if (ext === '.md' || ext === '.gen' || consoleCode === 'genesis') {
      if (buf.length >= 0x180) {
        let t = sanitizeAsciiTitle(buf.subarray(0x150, 0x180));
        if (t.length < 3) {
          t = sanitizeAsciiTitle(buf.subarray(0x120, 0x150));
        }
        if (t.length >= 3 && !PURE_NUMBERED_ROM_REGEX.test(t)) return t;
      }
    }

    if (ext === '.z64' || ext === '.n64' || ext === '.v64' || consoleCode === 'n64') {
      if (buf.length >= 0x34) {
        const t = sanitizeAsciiTitle(buf.subarray(0x20, 0x34));
        if (t.length >= 3 && !PURE_NUMBERED_ROM_REGEX.test(t)) return t;
      }
    }

    if (ext === '.sfc' || ext === '.smc' || consoleCode === 'snes') {
      const skip = buf.length % 1024 === 512 ? 512 : 0;
      for (const off of [skip + 0x7fc0, skip + 0xffc0]) {
        if (buf.length >= off + 21) {
          const t = sanitizeAsciiTitle(buf.subarray(off, off + 21));
          if (t.length >= 3 && !PURE_NUMBERED_ROM_REGEX.test(t)) return t;
        }
      }
    }

    if (ext === '.nds' || consoleCode === 'nds') {
      if (buf.length >= 0x70) {
        const bannerOff = dv.getUint32(0x68, true);
        if (bannerOff > 0 && bannerOff + 0x440 <= file.size) {
          const bSlice = await file.slice(bannerOff + 0x340, bannerOff + 0x440).arrayBuffer();
          const u16 = new Uint16Array(bSlice);
          const chars: string[] = [];
          for (let i = 0; i < u16.length; i++) {
            if (u16[i] === 0) break;
            if (u16[i] === 10 || u16[i] === 13) chars.push(' ');
            else chars.push(String.fromCharCode(u16[i]));
          }
          const title = chars.join('').replace(/\s+/g, ' ').trim();
          if (title.length >= 3 && !PURE_NUMBERED_ROM_REGEX.test(title)) return title;
        }
        const shortT = sanitizeAsciiTitle(buf.subarray(0, 12));
        if (shortT.length >= 3 && !PURE_NUMBERED_ROM_REGEX.test(shortT)) return shortT;
      }
    }

    if (
      consoleCode === 'psx' ||
      consoleCode === 'psp' ||
      ['.bin', '.iso', '.chd', '.pbp', '.cue', '.img', '.mdf'].includes(ext)
    ) {
      const latinText = new TextDecoder('latin1').decode(buf);
      const match = latinText.match(PS1_SERIAL_REGEX);
      if (match) {
        const code = `${match[1].toUpperCase()}-${match[2]}${match[3]}`;
        if (PS1_SERIAL_DICTIONARY[code]) {
          return PS1_SERIAL_DICTIONARY[code];
        }
      }

      const cdIdx = latinText.indexOf('\x01CD001');
      if (cdIdx !== -1 && cdIdx + 190 <= buf.length) {
        const volID = sanitizeAsciiTitle(buf.subarray(cdIdx + 40, cdIdx + 72))
          .replace(/_/g, ' ')
          .trim();

        // Follow ISO9660 Root Directory LBA (at cdIdx + 158) to find SYSTEM.CNF and PS1 boot executable
        const rootLBA = dv.getUint32(cdIdx + 158, true);
        if (rootLBA >= 16 && rootLBA < 400000) {
          const sectorSize = cdIdx >= 16 * 2352 ? 2352 : 2048;
          const dataOffInSector = sectorSize === 2352 ? cdIdx % 2352 : 0;
          const rootOff = rootLBA * sectorSize;
          if (rootOff + 16384 <= file.size) {
            const rootSlice = await file.slice(rootOff, rootOff + 16384).arrayBuffer();
            const rootBytes = new Uint8Array(rootSlice);
            const rootText = new TextDecoder('latin1').decode(rootBytes);
            const rm = rootText.match(PS1_SERIAL_REGEX);
            if (rm) {
              const code = `${rm[1].toUpperCase()}-${rm[2]}${rm[3]}`;
              if (PS1_SERIAL_DICTIONARY[code]) return PS1_SERIAL_DICTIONARY[code];
            }
            // Scan ISO9660 directory entries for SYSTEM.CNF
            let pos = 0;
            while (pos + 34 < rootBytes.length) {
              const recLen = rootBytes[pos];
              if (recLen === 0) {
                pos = (Math.floor(pos / 2048) + 1) * 2048;
                continue;
              }
              if (pos + recLen > rootBytes.length) break;
              const nameLen = rootBytes[pos + 32];
              if (nameLen > 0 && pos + 33 + nameLen <= pos + recLen) {
                const entryName = new TextDecoder('latin1')
                  .decode(rootBytes.subarray(pos + 33, pos + 33 + nameLen))
                  .toUpperCase();
                const entryLBA = new DataView(
                  rootBytes.buffer,
                  rootBytes.byteOffset + pos + 2,
                  4
                ).getUint32(0, true);
                if (entryName.startsWith('SYSTEM.CNF') && entryLBA > 16) {
                  const cnfOff = entryLBA * sectorSize + dataOffInSector;
                  if (cnfOff + 2048 <= file.size) {
                    const cnfSlice = await file.slice(cnfOff, cnfOff + 2048).arrayBuffer();
                    const cnfText = new TextDecoder('latin1').decode(new Uint8Array(cnfSlice));
                    const cm = cnfText.match(PS1_SERIAL_REGEX);
                    if (cm) {
                      const code = `${cm[1].toUpperCase()}-${cm[2]}${cm[3]}`;
                      if (PS1_SERIAL_DICTIONARY[code]) return PS1_SERIAL_DICTIONARY[code];
                    }
                  }
                }
              }
              pos += recLen;
            }
          }
        }

        if (
          volID.length >= 3 &&
          !['PLAYSTATION', 'CDROM', 'PSX', 'NEW', 'UNTITLED', 'SONY', 'GAME'].includes(
            volID.toUpperCase()
          ) &&
          !PURE_NUMBERED_ROM_REGEX.test(volID)
        ) {
          return volID;
        }
      }

      const mcTitle = extractPS1MemoryCardTitleFromBuffer(buf);
      if (mcTitle) return mcTitle;
    }
  } catch {}
  return '';
}

function parseGamelistXmlString(xmlContent: string): Map<string, string> {
  const map = new Map<string, string>();
  const gameBlockRegex = /<game\b[^>]*>([\s\S]*?)<\/game>/gi;
  const pathTagRegex = /<path>([\s\S]*?)<\/path>/i;
  const nameTagRegex = /<name>([\s\S]*?)<\/name>/i;

  let m: RegExpExecArray | null;
  while ((m = gameBlockRegex.exec(xmlContent)) !== null) {
    const block = m[1];
    const pm = block.match(pathTagRegex);
    const nm = block.match(nameTagRegex);
    if (!pm || !nm) continue;

    let rawPath = pm[1].trim().replace(/\\/g, '/');
    const slashIdx = rawPath.lastIndexOf('/');
    if (slashIdx !== -1) rawPath = rawPath.slice(slashIdx + 1);
    const gameName = nm[1]
      .replace(/&amp;/g, '&')
      .replace(/&apos;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .trim();

    // Never allow a pure number like "000001" in gamelist.xml to overwrite or shadow real internal ROM titles!
    if (!rawPath || !gameName || PURE_NUMBERED_ROM_REGEX.test(gameName)) continue;
    const lowerBase = rawPath.toLowerCase();
    map.set(lowerBase, gameName);
    const noExt = lowerBase.replace(/\.[^/.]+$/, '');
    map.set(noExt, gameName);
  }
  return map;
}

function detectConsoleFromPathAndExt(relPath: string, ext: string): string {
  const parts = relPath.toLowerCase().split('/');
  for (let i = parts.length - 2; i >= 0; i--) {
    const seg = parts[i];
    if ((seg === 'famicom' || seg === 'fc') && (ext === '.nes' || ext === '.unf' || ext === '.zip')) {
      return 'famicom';
    }
    if (seg === 'fds') return 'fds';
    if ((seg === 'nes' || seg === 'dendy') && (ext === '.nes' || ext === '.unf' || ext === '.zip')) {
      return 'nes';
    }
    if (['snes', 'sfc', 'superfamicom'].includes(seg)) return 'snes';
    if (['gba', 'game boy advance', 'gameboy advance'].includes(seg)) return 'gba';
    if (['gbc', 'game boy color', 'gameboy color'].includes(seg)) return 'gbc';
    if (['gb', 'game boy', 'gameboy'].includes(seg)) return 'gb';
    if (['megadrive', 'genesis', 'md'].includes(seg)) return 'genesis';
    if (['mastersystem', 'sms'].includes(seg)) return 'mastersystem';
    if (['gamegear', 'gg'].includes(seg)) return 'gamegear';
    if (['sega32x', '32x'].includes(seg)) return 'sega32x';
    if (['pcengine', 'pce', 'turbografx', 'tg16'].includes(seg)) return 'pcengine';
    if (['psx', 'ps1', 'playstation', 'ps'].includes(seg)) return 'psx';
    if (seg === 'psp') return 'psp';
    if (['nds', 'ds'].includes(seg)) return 'nds';
    if (['n64', 'nintendo64'].includes(seg)) return 'n64';
    if (['arcade', 'mame', 'fbneo', 'neogeo', 'cps'].includes(seg)) return 'arcade';
    if (['ports', 'portmaster'].includes(seg)) return 'ports';
  }
  if (ext === '.sh' && relPath.toLowerCase().includes('port')) return 'ports';
  return EXT_TO_DEFAULT_CONSOLE[ext] || 'arcade';
}

function analyzeSubfolderContext(relPath: string): {
  sourceSubfolder: string;
  isRusFolder: boolean;
  isTopFolder: boolean;
} {
  const slashIdx = relPath.lastIndexOf('/');
  const sub = slashIdx !== -1 ? relPath.slice(0, slashIdx) : tStatic('cat.rootFolder');
  const lower = sub.toLowerCase();
  const isRusFolder =
    lower.includes('rus') ||
    lower.includes('рус') ||
    lower.includes('perevod') ||
    lower.includes('перевод');
  const isTopFolder =
    lower.includes('top') ||
    lower.includes('best') ||
    lower.includes('лучш') ||
    lower.includes('100');
  return { sourceSubfolder: sub, isRusFolder, isTopFolder };
}

function prettifyBinaryHeaderTitle(raw: string): string {
  const cleaned = raw
    .replace(/[\x00-\x1f\x7f-\x9f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return '';
  const letters = (cleaned.match(/[a-zA-Zа-яА-ЯёЁ]/g) || []).length;
  if (letters < 2) return '';
  // If internal binary header is ALL CAPS (e.g. "CASTLEVANIA ARIA" or "TEKKENTHREE"), convert cleanly to Title Case
  const hasLower = /[a-zа-яё]/.test(cleaned);
  if (!hasLower && cleaned.length >= 4) {
    return cleaned
      .toLowerCase()
      .replace(/(^|\s|[-:])([a-zа-яё])/g, (_, sep, ch) => `${sep}${ch.toUpperCase()}`);
  }
  return cleaned;
}

function extractCleanTitle(fileName: string): string {
  const originalBase = fileName.replace(/\.[^/.]+$/, '').trim();
  const withoutTags = originalBase.replace(/\[.*?\]|\(.*?\)/g, '').trim();
  if (PURE_NUMBERED_ROM_REGEX.test(originalBase) || PURE_NUMBERED_ROM_REGEX.test(withoutTags)) {
    return withoutTags || originalBase;
  }
  const base = stripLeadingIndexExcept007(withoutTags || originalBase);
  // Keep legitimate dots in titles like "Dr. Mario", "Ms. Pac-Man", "G.I. Joe"; normalize underscores and multi-spaces
  const stripped = base
    .replace(/\[.*?\]|\(.*?\)/g, ' ')
    .replace(/_+/g, ' ')
    .replace(/\s+-\s+/g, ' - ')
    .replace(/\s+/g, ' ')
    .trim();
  const tokens = stripped.split(/\s+/).filter(Boolean);
  const filtered = tokens.filter((t) => {
    const up = t.toUpperCase();
    return ![
      'USA',
      'EUR',
      'EUROPE',
      'JAPAN',
      'JPN',
      // 'WORLD' не вырезаем: это часть названий (Super Mario World), а (World) в скобках уже убран.
      'RUS',
      'RUSSIAN',
      'RU',
      'V1',
      'V1.0',
      'V1.1',
      'TOP100',
      'РУС',
      'РУССКАЯ',
      'ВЕРСИЯ',
    ].includes(up);
  });
  const candidate = (filtered.length > 0 ? filtered.join(' ') : stripped)
    .replace(/^[\s\-–—]+|[\s\-–—]+$/g, '')
    .trim();
  const letters = (candidate.match(/[a-zA-Zа-яА-ЯёЁ]/g) || []).length;
  if (!candidate || (letters < 2 && !PURE_NUMBERED_ROM_REGEX.test(candidate))) {
    return withoutTags || originalBase;
  }
  return candidate;
}

function buildComparisonKey(cleanTitle: string): string {
  let s = ` ${stripLeadingIndexExcept007(cleanTitle.toLowerCase())} `;
  s = s
    .replace(/\bviii\b/g, '8')
    .replace(/\bvii\b/g, '7')
    .replace(/\bvi\b/g, '6')
    .replace(/\biv\b/g, '4')
    .replace(/\biii\b/g, '3')
    .replace(/\bii\b/g, '2');

  const words = s
    .split(/[^a-z0-9а-яё]+/i)
    .filter((w) => w.length > 0 && !NOISE_WORDS.has(w));
  return words.join('') || cleanTitle.toLowerCase().replace(/\s+/g, '');
}

function tokenizeNormalized(title: string): string[] {
  return title
    .toLowerCase()
    .split(/[^a-z0-9а-яё]+/i)
    .filter((w) => w.length > 1 && !NOISE_WORDS.has(w));
}

function areTitlesSameGame(titleA: string, titleB: string, keyA: string, keyB: string): boolean {
  if (keyA === keyB) return true;
  if (titleA.trim().toLowerCase() === titleB.trim().toLowerCase()) return true;
  const toksA = new Set(tokenizeNormalized(titleA));
  const toksB = new Set(tokenizeNormalized(titleB));
  if (toksA.size < 2 || toksB.size < 2) return false;
  let common = 0;
  for (const t of toksA) {
    if (toksB.has(t)) common++;
  }
  const union = toksA.size + toksB.size - common;
  return union > 0 && common / union >= 0.85;
}

function parseRegion(fileName: string, isRus: boolean): string {
  if (isRus) return 'Russia';
  const m = fileName.match(REGION_REGEX);
  if (m && m[1]) {
    const r = m[1].toUpperCase();
    if (['U', 'US', 'USA', 'UE', 'JU'].includes(r)) return 'USA';
    if (['E', 'EUR', 'EUROPE', 'EN,FR,DE'].includes(r)) return 'Europe';
    if (['J', 'JPN', 'JAPAN', 'EN,JA'].includes(r)) return 'Japan';
    if (['W', 'WORLD'].includes(r)) return 'World';
    if (['RUSSIA', 'RUS', 'RU'].includes(r)) return 'Russia';
    return m[1];
  }
  const lower = fileName.toLowerCase();
  if (lower.includes('usa')) return 'USA';
  if (lower.includes('eur') || lower.includes('pal')) return 'Europe';
  if (lower.includes('jap') || lower.includes('jpn')) return 'Japan';
  return 'World';
}

function parseRevision(fileName: string): string {
  const m = fileName.match(REVISION_REGEX);
  return m && m[1] ? m[1] : '';
}

// Название из DAT («Final Fantasy VII (USA) (Disc 1)») → чистое название, регион и ревизия.
// DAT name → clean title, region and revision.
function titleFromDatMatch(m: DatMatch, isRussian: boolean) {
  const name = m.name || '';
  const disc = extractDiscNumberAndBaseTitle(name);
  return {
    title: extractCleanTitle(disc.baseNameWithoutDisc || name),
    region: parseRegion(name, isRussian),
    revision: parseRevision(name),
    source: (m.source === 'no-intro' ? 'dat-nointro' : m.source === 'redump' ? 'dat-redump' : 'dat') as TitleSource,
  };
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} ${tStatic('size.b')}`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} ${tStatic('size.kb')}`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} ${tStatic('size.mb')}`;
}

function scoreRomCandidate(r: ScannedRomFile, priority: string[]): number {
  let score = 0;
  const idx = priority.findIndex((p) => p.toLowerCase() === r.region.toLowerCase());
  if (idx !== -1) {
    score += (priority.length - idx) * 100;
  }
  if (r.isRussian && priority[0]?.toLowerCase() === 'russia') {
    score += 60;
  }
  if (r.revision) score += 15;
  if (r.isFromTopFolder) score += 10;
  if (r.extension !== '.zip') score += 5;
  // Из двух одинаковых копий хака оставляем ту, что уже в hackroms/.
  // Of two identical copies of a hack, keep the one already in hackroms/.
  if (r.mod?.inHackFolder) score += 20;
  return score;
}

function deduplicateAcrossSubfolders(
  items: ScannedRomFile[],
  priorityList: string[]
): ScannedRomFile[] {
  const seqMarked = markSequentialNumberedRoms(items);
  const cloned: ScannedRomFile[] = seqMarked.map((it) => ({
    ...it,
    status: JUNK_REGEX.test(it.fileName) ? 'junk_bad_dump' : 'verified',
    is1G1RWinner: !JUNK_REGEX.test(it.fileName),
    reason: JUNK_REGEX.test(it.fileName)
      ? tStatic('app.scan.badDumpReason')
      : tStatic('app.scan.keep1g1rReason'),
  }));

  const seenCrc = new Map<string, number>();
  for (let i = 0; i < cloned.length; i++) {
    const item = cloned[i];
    if (item.status === 'junk_bad_dump') continue;
    const key = `${item.consoleCode}::crc::${item.headerlessCrc32}`;
    const firstIdx = seenCrc.get(key);
    if (firstIdx !== undefined) {
      const first = cloned[firstIdx];
      if (scoreRomCandidate(item, priorityList) > scoreRomCandidate(first, priorityList)) {
        first.status = 'duplicate_clone';
        first.is1G1RWinner = false;
        first.reason = tfStatic('app.scan.dupCrcReason', { folder: item.sourceSubfolder });
        seenCrc.set(key, i);
      } else {
        item.status = 'duplicate_clone';
        item.is1G1RWinner = false;
        item.reason = tfStatic('app.scan.dupCrcReason', { folder: first.sourceSubfolder });
      }
    } else {
      seenCrc.set(key, i);
    }
  }

  // Хаки, переводы и пропатченные ромы — не дубли оригинала: в сравнение по названию не идут.
  // Точные копии (тот же CRC) отсеяны выше. Тем, что лежат не в hackroms/, предлагаем перенос.
  // Hacks, translations and patched ROMs are not duplicates of the original: they skip title matching.
  // Exact copies (same CRC) were removed above. Those outside hackroms/ get a move suggestion.
  for (const item of cloned) {
    if (item.status !== 'verified' || !isModded(item.mod)) continue;
    item.reason = item.mod!.inHackFolder
      ? tStatic('app.scan.hackKeptReason')
      : tfStatic('app.scan.hackMoveReason', { dir: HACKROMS_DIR });
  }

  const groups = new Map<string, ScannedRomFile[]>();
  for (const item of cloned) {
    if (item.status !== 'verified' || isModded(item.mod)) continue;
    const discSuffix = item.discNumber ? `::disc_${item.discNumber}` : '';
    const gKey = `${item.consoleCode}::title::${item.comparisonKey}${discSuffix}`;
    const list = groups.get(gKey) || [];
    list.push(item);
    groups.set(gKey, list);
  }

  for (const group of groups.values()) {
    if (group.length <= 1) continue;
    let best = group[0];
    let bestScore = scoreRomCandidate(best, priorityList);

    for (let i = 1; i < group.length; i++) {
      const sc = scoreRomCandidate(group[i], priorityList);
      if (sc > bestScore) {
        bestScore = sc;
        best = group[i];
      }
    }

    for (const item of group) {
      if (item.id === best.id) {
        item.is1G1RWinner = true;
        item.status = 'verified';
        item.reason = tfStatic('app.scan.bestFolderReason', {
          count: group.length,
          region: best.region,
        });
      } else {
        item.is1G1RWinner = false;
        item.status = 'duplicate_clone';
        item.reason = tfStatic('app.scan.dupFolderReason', {
          src: item.sourceSubfolder,
          best: best.sourceSubfolder,
        });
      }
    }
  }

  const winnersByConsole = new Map<string, ScannedRomFile[]>();
  for (const item of cloned) {
    if (item.status !== 'verified' || isModded(item.mod)) continue;
    const arr = winnersByConsole.get(item.consoleCode) || [];
    arr.push(item);
    winnersByConsole.set(item.consoleCode, arr);
  }

  for (const list of winnersByConsole.values()) {
    for (let a = 0; a < list.length; a++) {
      const itemA = list[a];
      if (itemA.status !== 'verified') continue;
      for (let b = a + 1; b < list.length; b++) {
        const itemB = list[b];
        if (itemB.status !== 'verified') continue;
        // Different discs of the same multi-disc game (e.g. Disc 1 vs Disc 2) must NEVER be deduplicated against each other
        if ((itemA.discNumber || 0) !== (itemB.discNumber || 0)) continue;
        if (
          areTitlesSameGame(
            itemA.cleanTitle,
            itemB.cleanTitle,
            itemA.comparisonKey,
            itemB.comparisonKey
          )
        ) {
          if (scoreRomCandidate(itemB, priorityList) > scoreRomCandidate(itemA, priorityList)) {
            itemA.status = 'duplicate_clone';
            itemA.is1G1RWinner = false;
            itemA.reason = tfStatic('app.scan.repeatReason', { kept: itemB.fileName });
            break;
          } else {
            itemB.status = 'duplicate_clone';
            itemB.is1G1RWinner = false;
            itemB.reason = tfStatic('app.scan.repeatReason', { kept: itemA.fileName });
          }
        }
      }
    }
  }

  return cloned;
}

function expandMultiDiscScannedRoms(items: ScannedRomFile[]): ScannedRomFile[] {
  const expanded: ScannedRomFile[] = [];
  for (const item of items) {
    if (item.isMultiDisc && Array.isArray(item.discs) && item.discs.length > 0) {
      for (const d of item.discs) {
        expanded.push({
          ...d,
          scrapedBoxArtUrl: d.scrapedBoxArtUrl || item.scrapedBoxArtUrl,
          scrapedSnapUrl: d.scrapedSnapUrl || item.scrapedSnapUrl,
          scrapedMarqueeUrl: d.scrapedMarqueeUrl || item.scrapedMarqueeUrl,
          scrapedVideoUrl: d.scrapedVideoUrl || item.scrapedVideoUrl,
        });
      }
    } else {
      expanded.push(item);
    }
  }
  return expanded;
}

function collapseMultiDiscScannedRoms(
  items: ScannedRomFile[],
  cfg: FilenameConstructorConfig
): ScannedRomFile[] {
  const passthrough: ScannedRomFile[] = [];
  const groups = new Map<string, ScannedRomFile[]>();

  for (const item of items) {
    if (item.isMultiDisc && Array.isArray(item.discs) && item.discs.length > 1) {
      passthrough.push(item);
      continue;
    }
    const parsedDisc =
      item.discNumber != null
        ? item.discNumber
        : extractDiscNumberAndBaseTitle(item.fileName).discNumber;

    if (item.status !== 'verified' || parsedDisc == null) {
      passthrough.push(item);
      continue;
    }

    const normReg = normalizeRegionTag(item.region, item.isRussian);
    const gKey = `${item.consoleCode}::${item.comparisonKey}::${item.isRussian ? 'RUS' : normReg}`;
    const arr = groups.get(gKey) || [];
    arr.push({ ...item, discNumber: parsedDisc });
    groups.set(gKey, arr);
  }

  const collapsed: ScannedRomFile[] = [...passthrough];
  for (const group of groups.values()) {
    if (group.length <= 1) {
      collapsed.push(group[0]);
      continue;
    }

    // Deduplicate same discNumber within group if needed, then sort Disc 1 -> Disc N
    const byDiscNum = new Map<number, ScannedRomFile>();
    for (const d of group) {
      const dn = d.discNumber || 1;
      if (!byDiscNum.has(dn)) {
        byDiscNum.set(dn, d);
      }
    }
    const sorted = Array.from(byDiscNum.values()).sort(
      (a, b) => (a.discNumber || 1) - (b.discNumber || 1)
    );
    if (sorted.length <= 1) {
      collapsed.push(...sorted);
      continue;
    }

    const first = sorted[0];
    const normReg = normalizeRegionTag(first.region, first.isRussian);
    const folderName = buildMultiDiscFolderName(first.cleanTitle, normReg, first.isRussian);
    const m3uName = `${folderName}.m3u`;

    // Apply constructor naming order if configured while ensuring (Disc N) + dedicated folder
    const { releaseYear } = inferGenreAndYear(first.cleanTitle, first.consoleCode);
    const meta = CONSOLE_CATALOG[first.consoleCode] || CONSOLE_CATALOG.psx;
    const baseStemByCfg = formatRomStemByConfig(
      {
        cleanTitle: first.cleanTitle,
        year: releaseYear || 1998,
        region: first.region,
        isRussian: first.isRussian,
        bitness: meta.generationShort,
        consoleCode: first.consoleCode,
        revision: first.revision,
        modTag: modTag(first.mod),
      },
      cfg
    );
    const effectiveFolderName =
      baseStemByCfg && baseStemByCfg.length >= 2 ? baseStemByCfg : folderName;
    const effectiveM3uName = `${effectiveFolderName}.m3u`;

    const updatedDiscs = sorted.map((d, idx) => {
      const dn = d.discNumber || idx + 1;
      const outExt = normalizeDiskOutputExt(d.extension);
      const discCanon = buildDiscTargetFilename(effectiveFolderName, dn, outExt);
      return {
        ...d,
        discNumber: dn,
        canonicalName: discCanon,
      };
    });

    const totalSize = updatedDiscs.reduce((sum, d) => sum + d.fileSize, 0);
    const boxArt =
      updatedDiscs.find((d) => d.scrapedBoxArtUrl)?.scrapedBoxArtUrl || first.scrapedBoxArtUrl;
    const videoUrl =
      updatedDiscs.find((d) => d.scrapedVideoUrl)?.scrapedVideoUrl || first.scrapedVideoUrl;
    const marqueeUrl =
      updatedDiscs.find((d) => d.scrapedMarqueeUrl)?.scrapedMarqueeUrl || first.scrapedMarqueeUrl;
    const snapUrl =
      updatedDiscs.find((d) => d.scrapedSnapUrl)?.scrapedSnapUrl || first.scrapedSnapUrl;

    collapsed.push({
      ...first,
      id: `multidisc_${first.consoleCode}_${first.comparisonKey}_${first.isRussian ? 'RUS' : normReg}`,
      fileName: updatedDiscs[0].fileName,
      canonicalName: effectiveM3uName,
      fileSize: totalSize,
      isMultiDisc: true,
      discCount: updatedDiscs.length,
      discNumber: null,
      multiDiscFolderName: effectiveFolderName,
      m3uFileName: effectiveM3uName,
      discs: updatedDiscs,
      scrapedBoxArtUrl: boxArt,
      scrapedVideoUrl: videoUrl,
      scrapedMarqueeUrl: marqueeUrl,
      scrapedSnapUrl: snapUrl,
      mediaStatus: tfStatic('app.multi.inlineBadge', {
        discs: tfStatic('lib.multiDiscCount', { count: updatedDiscs.length }),
        path: `${effectiveFolderName}/${effectiveM3uName}`,
      }),
    });
  }

  return collapsed;
}

export function App() {
  const { lang, t, tf } = useI18n();
  const [selectedFolderName, setSelectedFolderName] = useState<string>('');
  const [rootDirHandle, setRootDirHandle] = useState<any>(null);
  const [roms, setRoms] = useState<ScannedRomFile[]>([]);
  const romsRef = useRef<ScannedRomFile[]>([]);
  const [lastScanMode, setLastScanMode] = useState<'append' | 'replace'>('append');
  const [scanRevision, setScanRevision] = useState<number>(0);
  const scanModeRef = useRef<'append' | 'replace'>('append');
  const [isScanning, setIsScanning] = useState(false);
  const [isOrganizing, setIsOrganizing] = useState(false);
  const [isRenamingNumbered, setIsRenamingNumbered] = useState(false);
  const [isScraping, setIsScraping] = useState(false);
  const [isCleaningMedia, setIsCleaningMedia] = useState(false);
  const [isScanningPhantoms, setIsScanningPhantoms] = useState(false);
  const [isRepairingSd, setIsRepairingSd] = useState(false);
  const [isApplyingXml, setIsApplyingXml] = useState(false);
  const [isProcessingBuffer, setIsProcessingBuffer] = useState(false);
  const [xmlModalOpen, setXmlModalOpen] = useState(false);
  const [progressPct, setProgressPct] = useState(0);

  const [filenameConfig, setFilenameConfig] = useState<FilenameConstructorConfig>(() =>
    loadFilenameConstructorConfig()
  );
  const filenameConfigRef = useRef<FilenameConstructorConfig>(filenameConfig);

  const [sortTargetDirHandle, setSortTargetDirHandle] = useState<any>(null);
  const [sortTargetFolderName, setSortTargetFolderName] = useState<string>('');

  const [sdTargetDirHandle, setSdTargetDirHandle] = useState<any>(null);
  const [sdTargetFolderName, setSdTargetFolderName] = useState<string>('');
  const [sdFirmwareId, setSdFirmwareId] = useState<
    'r36s_arkos' | 'anbernic_muos' | 'anbernic_knulli' | 'rocknix' | 'miyoo_onion' | 'trimui_crossmix'
  >('r36s_arkos');

  const [bufferDirHandle, setBufferDirHandle] = useState<any>(null);
  const [bufferFolderName, setBufferFolderName] = useState<string>('');
  const [bufferScannedRoms, setBufferScannedRoms] = useState<ScannedRomFile[]>([]);
  const [combineTargetDirHandle, setCombineTargetDirHandle] = useState<any>(null);
  const [combineTargetFolderName, setCombineTargetFolderName] = useState<string>('');
  const [combineMoveMode, setCombineMoveMode] = useState<'move' | 'copy'>('move');
  const [combineDedup1G1R, setCombineDedup1G1R] = useState<boolean>(true);
  const [combineSortFolders, setCombineSortFolders] = useState<boolean>(true);
  const [combineAddToLibrary, setCombineAddToLibrary] = useState<boolean>(true);

  const stopRequestedRef = useRef<boolean>(false);
  // Системы, для которых в libretro-database нет DAT (не спрашиваем повторно в этой сессии).
  // Systems without a DAT in libretro-database (not asked again this session).
  const libretroDatUnsupportedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    romsRef.current = roms;
  }, [roms]);

  useEffect(() => {
    filenameConfigRef.current = filenameConfig;
  }, [filenameConfig]);

  const [phantomModalOpen, setPhantomModalOpen] = useState(false);
  const [phantomFolders, setPhantomFolders] = useState<PhantomFolderCandidate[]>([]);
  const [isDeletingPhantoms, setIsDeletingPhantoms] = useState(false);

  const [catalogMode, setCatalogMode] = useState<
    'gen_then_console' | 'r36s_gen_direct' | 'r36s_flat_console'
  >('r36s_flat_console');
  const [priorityPreset, setPriorityPreset] = useState<string>('rus_first');
  const [autoScrapeAfterSort, setAutoScrapeAfterSort] = useState(true);
  const [scrapeShortVideos, setScrapeShortVideos] = useState(true);
  const [deleteJunkPermanently, setDeleteJunkPermanently] = useState(false);
  const [autoGroupMultiDisc, setAutoGroupMultiDisc] = useState(true);
  const autoGroupMultiDiscRef = useRef<boolean>(true);
  useEffect(() => {
    autoGroupMultiDiscRef.current = autoGroupMultiDisc;
  }, [autoGroupMultiDisc]);

  const [statusFilter, setStatusFilter] = useState<
    'all' | 'verified' | 'duplicate_clone' | 'junk_bad_dump' | 'numbered'
  >('all');
  const [searchQuery, setSearchQuery] = useState('');

  const [previewRom, setPreviewRom] = useState<ScannedRomFile | null>(null);

  const [activeMainTab, setActiveMainTab] = useState<
    'figma_studio' | 'library' | 'r36s_tools' | 'export_builder' | 'emulators'
  >('figma_studio');
  const [selectedFigmaConcept, setSelectedFigmaConcept] =
    useState<FigmaConceptId>('concept_a_sidebar');
  const [isDarkMode, setIsDarkMode] = useState<boolean>(false);
  const [isNativeDesktopHost, setIsNativeDesktopHost] = useState<boolean>(false);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode);
  }, [isDarkMode]);

  useEffect(() => {
    let mounted = true;
    fetch('/api/native/status')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (mounted && data?.nativeDesktop === true) {
          setIsNativeDesktopHost(true);
        }
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  const currentSystemViewMode: 'presentation' | 'compact' | 'editor' =
    selectedFigmaConcept === 'concept_a_sidebar'
      ? 'presentation'
      : selectedFigmaConcept === 'concept_b_split'
      ? 'compact'
      : 'editor';

  const handleSetSystemViewMode = (mode: 'presentation' | 'compact' | 'editor') => {
    if (mode === 'presentation') setSelectedFigmaConcept('concept_a_sidebar');
    else if (mode === 'compact') setSelectedFigmaConcept('concept_b_split');
    else setSelectedFigmaConcept('concept_c_workbench');
  };

  const [toolsSubTab, setToolsSubTab] = useState<'flash_and_xml' | 'combain'>('flash_and_xml');
  const [isSyncingDb, setIsSyncingDb] = useState(false);
  const [dbState, setDbState] = useState<PersistentDbState>({
    version: APP_VERSION,
    masterLibraryPath: 'D:/AegisROM_MasterLibrary',
    sdCardMountPath: 'E:/EASYROMS',
    bufferZonePath: 'D:/AegisROM_MasterLibrary/_Combain_Inbox',
    lastSyncedAt: new Date().toISOString(),
    preferredRegionOrder: ['Russia', 'USA', 'Europe', 'Japan'],
    emulatorCustomPaths: {},
    starredEmulatorsByConsole: {
      nes: 'retroarch_fceumm',
      snes: 'retroarch_snes9x',
      genesis: 'retroarch_genesis_plus_gx',
      gba: 'mgba_standalone',
      psx: 'duckstation',
      ps2: 'pcsx2',
      ps3: 'rpcs3',
      switch: 'ryujinx',
      xbox: 'xemu',
    },
    records: [],
  });

  // Always-current DB state for long async chains (setup wizard: scan -> transfer -> save),
  // where closures would otherwise see the state from the render they started in.
  const dbStateRef = useRef<PersistentDbState>(dbState);
  useEffect(() => {
    dbStateRef.current = dbState;
  }, [dbState]);

  const [downloadStatus, setDownloadStatus] = useState<string>('');

  const [undoStack, setUndoStack] = useState<UndoAction[]>([]);
  // Хаки, которые 1G1R предлагает перенести в hackroms/. / Hacks that 1G1R offers to move into hackroms/.
  const [hackMoveCandidates, setHackMoveCandidates] = useState<HackMoveCandidate[]>([]);
  const [logs, setLogs] = useState<string[]>(() => [
    tStatic('app.init.log1'),
    tStatic('app.init.log2'),
    tStatic('app.init.log3'),
  ]);

  const [libraryDirHandle, setLibraryDirHandle] = useState<any>(null);
  const fallbackInputRef = useRef<HTMLInputElement | null>(null);
  const importLibraryFileInputRef = useRef<HTMLInputElement | null>(null);
  const [currentActionText, setCurrentActionText] = useState<string>('');
  const [pendingRestoreHandles, setPendingRestoreHandles] = useState<
    Array<{ key: string; folderName: string }>
  >([]);

  const isAnyProcessRunning =
    isScanning ||
    isOrganizing ||
    isRenamingNumbered ||
    isScraping ||
    isCleaningMedia ||
    isRepairingSd ||
    isApplyingXml ||
    isProcessingBuffer;

  const handleEmergencyStop = () => {
    stopRequestedRef.current = true;
    // Immediately unlock all UI state flags so buttons never stay disabled after clicking STOP!
    setIsScanning(false);
    setIsOrganizing(false);
    setIsRenamingNumbered(false);
    setIsScraping(false);
    setIsCleaningMedia(false);
    setIsRepairingSd(false);
    setIsApplyingXml(false);
    setIsProcessingBuffer(false);
    setIsScanningPhantoms(false);
    const stopMsg = t('status.stoppedByUser');
    setCurrentActionText(stopMsg);
    addLog(stopMsg);
  };

  const addLog = (msg: string) => {
    const ts = new Date().toLocaleTimeString(getActiveLocale(), { hour12: false });
    setLogs((prev) => [...prev.slice(-250), `[${ts}] ${msg}`]);
  };

  // Bumped whenever a library/scan folder handle becomes usable, so an already opened DB
  // re-resolves its local covers and videos without a rescan.
  const [mediaAccessVersion, setMediaAccessVersion] = useState(0);
  const restoreInFlightRef = useRef(false);

  const applyGrantedHandle = (rec: StoredDirHandleRecord) => {
    if (rec.key === 'library_root') {
      setLibraryDirHandle(rec.handle);
      setRootDirHandle((prev: any) => prev || rec.handle);
      setSelectedFolderName((prev) => prev || rec.folderName);
    } else if (rec.key === 'scan_root') {
      setRootDirHandle(rec.handle);
      setSelectedFolderName(rec.folderName);
    } else if (rec.key === 'sort_target') {
      setSortTargetDirHandle(rec.handle);
      setSortTargetFolderName(rec.folderName);
    } else if (rec.key === 'sd_target') {
      setSdTargetDirHandle(rec.handle);
      setSdTargetFolderName(rec.folderName);
    } else if (rec.key === 'buffer_source') {
      setBufferDirHandle(rec.handle);
      setBufferFolderName(rec.folderName);
    } else if (rec.key === 'combine_target') {
      setCombineTargetDirHandle(rec.handle);
      setCombineTargetFolderName(rec.folderName);
    }
  };

  // Library first: it is the folder covers and videos are read from.
  const HANDLE_PRIORITY = ['library_root', 'scan_root', 'sort_target', 'combine_target', 'sd_target', 'buffer_source'];
  const sortHandleRecords = (records: StoredDirHandleRecord[]) =>
    [...records].sort((a, b) => {
      const ia = HANDLE_PRIORITY.indexOf(a.key);
      const ib = HANDLE_PRIORITY.indexOf(b.key);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });

  /**
   * Re-grants every saved folder. With allowPrompt the browser shows its permission dialog
   * (needs a user gesture). Chrome/Edge offer "Allow on every visit" there, after which the
   * folders open silently on every launch. One prompt per distinct folder: handles that point
   * to the same directory (library_root and scan_root usually do) share the grant.
   */
  const restoreSavedFolderPermissions = async (allowPrompt: boolean) => {
    const records = sortHandleRecords(await listAllSavedDirectoryHandles());
    const stillPrompt: Array<{ key: string; folderName: string }> = [];
    const grantedNames: string[] = [];
    const grantedHandles: any[] = [];
    let mediaRootGranted = false;

    for (const rec of records) {
      let perm = await checkOrRequestHandlePermission(rec.handle, 'readwrite', false);
      if (perm === 'prompt' && allowPrompt) {
        let sameAsGranted = false;
        for (const g of grantedHandles) {
          try {
            if (typeof g.isSameEntry === 'function' && (await g.isSameEntry(rec.handle))) {
              sameAsGranted = true;
              break;
            }
          } catch {}
        }
        // Same directory already granted: the re-query above should have returned granted;
        // don't open a second dialog for it.
        if (!sameAsGranted) {
          perm = await checkOrRequestHandlePermission(rec.handle, 'readwrite', true);
        }
      }
      if (perm === 'granted') {
        applyGrantedHandle(rec);
        grantedHandles.push(rec.handle);
        grantedNames.push(rec.folderName);
        if (rec.key === 'library_root' || rec.key === 'scan_root') mediaRootGranted = true;
      } else if (perm === 'prompt') {
        stillPrompt.push({ key: rec.key, folderName: rec.folderName });
      }
    }

    setPendingRestoreHandles(stillPrompt);
    if (mediaRootGranted) setMediaAccessVersion((v) => v + 1);
    return { grantedNames: Array.from(new Set(grantedNames)), stillPrompt };
  };

  // Restore persisted FileSystemDirectoryHandles from IndexedDB on launch
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { grantedNames } = await restoreSavedFolderPermissions(false);
      if (!mounted) return;
      if (grantedNames.length > 0) {
        addLog(tf('app.perm.restoredLog', { names: grantedNames.join(', ') }));
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const handleRestoreSavedFolderPermissions = async () => {
    if (restoreInFlightRef.current) return;
    restoreInFlightRef.current = true;
    try {
      const { grantedNames } = await restoreSavedFolderPermissions(true);
      if (grantedNames.length > 0) {
        const msg = tf('app.perm.grantedLog', { names: grantedNames.join(', ') });
        setCurrentActionText(msg);
        addLog(msg);
      }
    } finally {
      restoreInFlightRef.current = false;
    }
  };

  // The browser only shows the permission dialog inside a user gesture. While saved folders
  // still wait for permission, the first click or key press anywhere in the app asks for them,
  // so covers load right after opening a DB instead of after a trip to Tools.
  const pendingRestoreCount = pendingRestoreHandles.length;
  useEffect(() => {
    if (pendingRestoreCount === 0) return;
    const onGesture = (e: Event) => {
      if (e instanceof KeyboardEvent && (e.key === 'Escape' || e.repeat)) return;
      window.removeEventListener('click', onGesture, true);
      window.removeEventListener('keydown', onGesture, true);
      void handleRestoreSavedFolderPermissions();
    };
    window.addEventListener('click', onGesture, true);
    window.addEventListener('keydown', onGesture, true);
    return () => {
      window.removeEventListener('click', onGesture, true);
      window.removeEventListener('keydown', onGesture, true);
    };
  }, [pendingRestoreCount]);

  // Hydrates expired blob: URLs / missing covers & videos when opening an existing DB file (.json) without re-scanning
  const handleResolveMediaForDbRows = async (
    rows: UnifiedGameRow[],
    libraryPathHint?: string
  ): Promise<UnifiedGameRow[]> => {
    if (!rows || rows.length === 0) return rows;

    const cleanedRows = rows.map((r) => ({
      ...r,
      boxArtUrl: isDeadOrLocalBlobUrl(r.boxArtUrl) ? undefined : r.boxArtUrl,
      videoUrl: isDeadOrLocalBlobUrl(r.videoUrl) ? undefined : r.videoUrl,
    }));

    // 1. Check Native Desktop Host local disk resolver (/api/native/fs/resolve-media)
    // Priority: first 80 items immediately so visible screen paints instantly (<50ms)
    const afterNative = [...cleanedRows];
    if (isNativeDesktopHost) {
      try {
        const resp = await fetch('/api/native/fs/resolve-media', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            libraryPath: libraryPathHint || dbState.masterLibraryPath || selectedFolderName,
            items: cleanedRows.slice(0, 80).map((r) => ({
              id: r.id,
              title: r.title,
              oldFile: r.oldFile,
              cleanFile: r.cleanFile,
              consoleShort: r.consoleShort,
              relativePath: r.relativePath || '',
            })),
          }),
        });
        if (resp.ok) {
          const data = await resp.json();
          const map = new Map<string, { boxArtUrl?: string; videoUrl?: string }>();
          for (const it of data?.results || []) {
            map.set(it.id, it);
          }
          for (let i = 0; i < Math.min(80, afterNative.length); i++) {
            const m = map.get(afterNative[i].id);
            if (m) {
              afterNative[i] = {
                ...afterNative[i],
                boxArtUrl: m.boxArtUrl || afterNative[i].boxArtUrl,
                videoUrl: m.videoUrl || afterNative[i].videoUrl,
              };
            }
          }
        }
      } catch {}
    }

    // 2. Check Browser IndexedDB saved FileSystemDirectoryHandle if permission is granted
    let activeHandle = libraryDirHandle || rootDirHandle;
    if (!activeHandle) {
      const savedRec = await findSavedHandleMatchingPath(
        libraryPathHint || selectedFolderName || dbState.masterLibraryPath
      );
      if (savedRec) {
        const perm = await checkOrRequestHandlePermission(savedRec.handle, 'read', false);
        if (perm === 'granted') {
          activeHandle = savedRec.handle;
        }
      }
    }

    if (activeHandle) {
      try {
        const mediaIdx = await collectLocalMediaFromHandle(activeHandle, 3);
        const CHUNK_SIZE = 350;
        for (let i = 0; i < afterNative.length; i++) {
          const r = afterNative[i];
          const oldStem = (r.oldFile || '').replace(/\.[^/.]+$/, '').toLowerCase();
          const cleanStem = (r.cleanFile || '').replace(/\.[^/.]+$/, '').toLowerCase();
          const titleNorm = r.title.toLowerCase().replace(/[^a-z0-9а-яё]/gi, '');

          let imgFile: File | undefined;
          let vidFile: File | undefined;
          for (const k of [oldStem, cleanStem, r.title.toLowerCase(), titleNorm]) {
            if (!k) continue;
            if (!imgFile && mediaIdx.imagesByStem.has(k)) imgFile = mediaIdx.imagesByStem.get(k);
            if (!vidFile && mediaIdx.videosByStem.has(k)) vidFile = mediaIdx.videosByStem.get(k);
          }
          if (imgFile || vidFile) {
            afterNative[i] = {
              ...r,
              boxArtUrl: imgFile ? URL.createObjectURL(imgFile) : r.boxArtUrl,
              videoUrl: vidFile ? URL.createObjectURL(vidFile) : r.videoUrl,
            };
          }
          // Yield to event loop every 350 items on large DBs so UI stays completely responsive
          if (i > 0 && i % CHUNK_SIZE === 0) {
            await new Promise((res) => setTimeout(res, 0));
          }
        }
      } catch {}
    }

    // 3. Fallback online hydration via /api/r36s/scrape-batch (capped to immediate visible screen window + buffer)
    const needRemote = afterNative
      .slice(0, 80)
      .filter((r) => (!r.boxArtUrl || !r.videoUrl) && r.consoleShort.toUpperCase() !== 'PORTS');
    if (needRemote.length > 0) {
      try {
        const payload = needRemote.map((r) => {
          const cKey = r.consoleShort.toLowerCase();
          const meta = CONSOLE_CATALOG[cKey] || CONSOLE_CATALOG.psx;
          return {
            id: r.id,
            cleanTitle: r.title,
            comparisonKey: buildComparisonKey(r.title),
            region: r.region || 'USA',
            libretroSystem: meta.libretroSystem,
            archiveVideoId: meta.archiveVideoId,
          };
        });
        const resp = await fetch('/api/r36s/scrape-batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: payload }),
        });
        if (resp.ok) {
          const data = await resp.json();
          const resMap = new Map<string, any>();
          for (const item of data?.results || []) {
            resMap.set(item.id, item);
          }
          for (let i = 0; i < Math.min(80, afterNative.length); i++) {
            const m = resMap.get(afterNative[i].id);
            if (m) {
              afterNative[i] = {
                ...afterNative[i],
                boxArtUrl: afterNative[i].boxArtUrl || m.boxArtUrl,
                videoUrl: afterNative[i].videoUrl || m.videoUrl,
              };
            }
          }
        }
      } catch {}
    }

    return afterNative;
  };

  useEffect(() => {
    let mounted = true;
    fetch('/api/db/state')
      .then((r) => r.json())
      .then((data: PersistentDbState) => {
        if (mounted && data && Array.isArray(data.records)) {
          setDbState(data);
        }
      })
      .catch(() => {
        try {
          const cached =
            localStorage.getItem('aegisrom_v0_5_db') ||
            localStorage.getItem('aegisrom_v5_db');
          if (cached && mounted) {
            setDbState(JSON.parse(cached));
          }
        } catch {}
      });
    return () => {
      mounted = false;
    };
  }, []);

  const handleUpdateDbState = async (next: PersistentDbState) => {
    dbStateRef.current = next;
    setDbState(next);
    if ((next.records?.length || 0) <= 400) {
      try {
        localStorage.setItem('aegisrom_v0_5_db', JSON.stringify(next));
      } catch {}
    }
    try {
      await fetch('/api/db/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: next }),
      });
    } catch {}
  };

  const handleSyncDatabase = async () => {
    if (isSyncingDb) return;
    setIsSyncingDb(true);
    try {
      const updated: PersistentDbState = {
        ...dbState,
        lastSyncedAt: new Date().toISOString(),
      };
      const resp = await fetch('/api/db/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: updated }),
      });
      const data = await resp.json();
      if (data?.state) {
        setDbState(data.state);
      } else {
        setDbState(updated);
      }
      addLog(
        tf('app.db.deltaSyncLog', { count: dbState.records.length })
      );
    } catch {
      addLog(t('app.db.cacheSyncLog'));
    } finally {
      setIsSyncingDb(false);
    }
  };

  const handleResetSeedDatabase = async () => {
    setIsSyncingDb(true);
    try {
      const resp = await fetch('/api/db/reset-seed', { method: 'POST' });
      const data = await resp.json();
      if (data?.state) {
        setDbState(data.state);
        addLog(
          tf('app.db.restoredLog', { count: data.state.records.length })
        );
      }
    } catch {}
    setIsSyncingDb(false);
  };

  const syncScannedRomsIntoDb = (
    deduplicated: ScannedRomFile[],
    folderTitle: string,
    replaceAll = false
  ) => {
    const dbState = dbStateRef.current;
    const winners = deduplicated.filter((r) => r.status === 'verified');
    if (winners.length === 0 && !replaceAll) return;

    const existingByKey = new Map<string, PersistentRomRecord>();
    const existingById = new Map<string, string>();

    if (!replaceAll) {
      for (const rec of dbState.records) {
        const k = `${rec.consoleCode}::${rec.comparisonKey}`;
        existingByKey.set(k, rec);
        existingById.set(rec.id, k);
      }
    }

    for (const w of winners) {
      const extMeta = EXTENDED_CONSOLE_CATALOG[w.consoleCode] || EXTENDED_CONSOLE_CATALOG.psx;
      const { genre, releaseYear } = inferGenreAndYear(w.cleanTitle, w.consoleCode);
      const discSuffix = !w.isMultiDisc && w.discNumber ? `::disc_${w.discNumber}` : '';
      const key = `${w.consoleCode}::${w.comparisonKey}${discSuffix}`;

      // Prune any previous record referencing this exact ROM ID under an old key (prevents DB doubling after rename/sort!)
      const scanId = `scan_${w.id}`;
      const oldKeyForId = existingById.get(scanId) || existingById.get(w.id);
      if (oldKeyForId && oldKeyForId !== key) {
        existingByKey.delete(oldKeyForId);
      }
      const prev = existingByKey.get(key);

      const boxArtUrl =
        w.scrapedBoxArtUrl ||
        prev?.boxArtUrl ||
        `https://thumbnails.libretro.com/${encodeURIComponent(
          extMeta.libretroSystem
        )}/Named_Boxarts/${encodeURIComponent(w.cleanTitle)}.png`;

      existingByKey.set(key, {
        id: prev?.id || scanId,
        title: w.cleanTitle,
        cleanTitle: w.cleanTitle,
        comparisonKey: w.comparisonKey,
        consoleCode: w.consoleCode,
        generationShort:
          extMeta.generationShort === 'Handheld'
            ? tStatic('cat.portableGen')
            : extMeta.generationShort,
        bitness: extMeta.bitness,
        genre: prev?.genre || genre,
        releaseYear: prev?.releaseYear || releaseYear,
        region: w.region,
        language: w.isRussian ? 'RUS' : w.region === 'Japan' ? 'JPN' : 'ENG',
        isRussian: w.isRussian,
        fileName: w.canonicalName,
        masterPath: `${dbState.masterLibraryPath}/${w.consoleCode}/${w.canonicalName}`,
        sdCardPath: `${folderTitle}/${w.relativePath}`,
        sdCardFileName: w.fileName,
        sdCardRegion: w.region,
        sdCardLanguage: w.isRussian ? 'RUS' : w.region === 'Japan' ? 'JPN' : 'ENG',
        hasUpgradeCandidate: w.isNumberedName,
        upgradeSelected: w.isNumberedName,
        upgradeReason: w.isNumberedName
          ? tf('app.db.upgradeNumberedReason', {
              old: w.fileName,
              next: w.canonicalName,
            })
          : undefined,
        fileSize: w.fileSize,
        crc32: w.headerlessCrc32,
        dependencies: [w.canonicalName],
        preferredEmulatorId:
          dbState.starredEmulatorsByConsole[w.consoleCode] || extMeta.defaultEmulatorId,
        boxArtUrl,
        lastSyncedAt: new Date().toISOString(),
      });
    }

    const nextState: PersistentDbState = {
      ...dbState,
      sdCardMountPath: folderTitle || dbState.sdCardMountPath,
      lastSyncedAt: new Date().toISOString(),
      records: Array.from(existingByKey.values()),
    };
    handleUpdateDbState(nextState);
  };

  const getPriorityArray = (preset: string): string[] => {
    switch (preset) {
      case 'usa_first':
        return ['USA', 'Europe', 'Russia', 'Japan', 'World'];
      case 'eur_first':
        return ['Europe', 'USA', 'Russia', 'Japan', 'World'];
      case 'jpn_first':
        return ['Japan', 'USA', 'Europe', 'Russia', 'World'];
      default:
        return ['Russia', 'USA', 'Europe', 'Japan', 'World'];
    }
  };

  const handlePriorityChange = (newPreset: string) => {
    setPriorityPreset(newPreset);
    if (roms.length > 0) {
      const expanded = expandMultiDiscScannedRoms(roms);
      const deduped = deduplicateAcrossSubfolders(expanded, getPriorityArray(newPreset));
      const collapsed = collapseMultiDiscScannedRoms(deduped, filenameConfigRef.current);
      romsRef.current = collapsed;
      setRoms(collapsed);
      addLog(t('app.db.reDedupLog'));
    }
  };

  const handleDownloadExe = () => {
    setDownloadStatus(t('app.download.setupStart'));
    addLog(t('app.download.setupDoneLog'));
    setTimeout(() => {
      setDownloadStatus(t('app.download.setupDoneStatus'));
    }, 800);
  };

  const handleDownloadZip = () => {
    setDownloadStatus(t('app.download.zipStart'));
    addLog(t('app.download.zipDoneLog'));
    setTimeout(() => {
      setDownloadStatus(t('app.download.zipDoneStatus'));
    }, 800);
  };

  const parseCueFileReferences = (cueText: string): string[] => {
    const refs: string[] = [];
    const seen = new Set<string>();
    const quotedRe = /^\s*FILE\s+"([^"]+)"/gim;
    let m: RegExpExecArray | null;
    while ((m = quotedRe.exec(cueText)) !== null) {
      const raw = m[1].replace(/\\/g, '/').split('/').pop()?.trim();
      if (raw && !seen.has(raw.toLowerCase())) {
        seen.add(raw.toLowerCase());
        refs.push(raw);
      }
    }
    if (refs.length === 0) {
      const unquotedRe = /^\s*FILE\s+(\S+)\s+(?:BINARY|MOTOROLA|AIFF|WAVE|MP3)/gim;
      while ((m = unquotedRe.exec(cueText)) !== null) {
        const raw = m[1].replace(/\\/g, '/').split('/').pop()?.trim();
        if (raw && !seen.has(raw.toLowerCase())) {
          seen.add(raw.toLowerCase());
          refs.push(raw);
        }
      }
    }
    return refs;
  };

  interface DiscoveredScanEntry {
    file: File;
    relPath: string;
    parentHandle: any;
    gamelistMap?: Map<string, string>;
    companionFiles?: File[];
    cueText?: string;
    pairedFormatExt?: string;
  }

  // Pairs optical disc descriptors (.cue, .ccd, .mds, .gdi) with their actual track images (.bin, .img, .iso, .mdf, .sub, .wav)
  // so 1 KB descriptors never appear alone and track images aren't duplicated as separate games.
  const pairDiscCueAndTrackFiles = async (
    entries: DiscoveredScanEntry[]
  ): Promise<DiscoveredScanEntry[]> => {
    const byFolder = new Map<string, DiscoveredScanEntry[]>();
    for (const entry of entries) {
      const slash = entry.relPath.lastIndexOf('/');
      const folderKey = slash !== -1 ? entry.relPath.slice(0, slash).toLowerCase() : '';
      const arr = byFolder.get(folderKey) || [];
      arr.push(entry);
      byFolder.set(folderKey, arr);
    }

    const claimedTrackRelPaths = new Set<string>();

    for (const folderEntries of byFolder.values()) {
      const trackCandidates = folderEntries.filter((e) => {
        const ln = e.file.name.toLowerCase();
        return (
          ln.endsWith('.bin') ||
          ln.endsWith('.img') ||
          ln.endsWith('.iso') ||
          ln.endsWith('.raw') ||
          ln.endsWith('.wav') ||
          ln.endsWith('.sub') ||
          ln.endsWith('.mdf')
        );
      });
      const byExactName = new Map<string, DiscoveredScanEntry>();
      for (const tc of trackCandidates) {
        byExactName.set(tc.file.name.toLowerCase(), tc);
      }

      // 1. Pair .cue sheets with .bin / .img / .iso / .wav (+ claim sibling CloneCD .ccd/.sub if same stem)
      const cueEntries = folderEntries.filter((e) => e.file.name.toLowerCase().endsWith('.cue'));
      for (const cueEntry of cueEntries) {
        let cueText = '';
        try {
          cueText = await cueEntry.file.text();
        } catch {}
        cueEntry.cueText = cueText;

        const refs = parseCueFileReferences(cueText);
        const matchedTracks: File[] = [];
        const matchedSet = new Set<string>();

        for (const refName of refs) {
          const hit = byExactName.get(refName.toLowerCase());
          if (hit && !matchedSet.has(hit.relPath)) {
            matchedTracks.push(hit.file);
            matchedSet.add(hit.relPath);
            claimedTrackRelPaths.add(hit.relPath);
          }
        }

        const cueStem = cueEntry.file.name.replace(/\.cue$/i, '').toLowerCase();
        if (matchedTracks.length === 0) {
          const stemTracks = trackCandidates
            .filter((tc) => {
              if (claimedTrackRelPaths.has(tc.relPath)) return false;
              const tName = tc.file.name.toLowerCase();
              if (tName.endsWith('.sub')) return false;
              const tStem = tName.replace(/\.[^/.]+$/, '');
              return (
                tStem === cueStem ||
                tStem.startsWith(`${cueStem} (track`) ||
                tStem.startsWith(`${cueStem}_track`)
              );
            })
            .sort((a, b) => a.file.name.localeCompare(b.file.name, undefined, { numeric: true }));

          for (const st of stemTracks) {
            matchedTracks.push(st.file);
            claimedTrackRelPaths.add(st.relPath);
          }
        }

        // Attach sibling .ccd/.sub of the same stem (CloneCD bundles often include both .cue and .ccd alongside .img)
        for (const sibling of folderEntries) {
          if (claimedTrackRelPaths.has(sibling.relPath)) continue;
          const sLow = sibling.file.name.toLowerCase();
          const sStem = sLow.replace(/\.[^/.]+$/, '');
          if (sStem === cueStem && (sLow.endsWith('.ccd') || sLow.endsWith('.sub'))) {
            claimedTrackRelPaths.add(sibling.relPath);
            if (matchedTracks.length > 0) {
              matchedTracks.push(sibling.file);
            }
          }
        }

        if (matchedTracks.length > 0) {
          cueEntry.companionFiles = matchedTracks;
          const primaryName = matchedTracks[0].name.toLowerCase();
          cueEntry.pairedFormatExt = primaryName.endsWith('.img')
            ? '.img+.cue'
            : primaryName.endsWith('.iso')
            ? '.iso+.cue'
            : '.bin+.cue';
        }
      }

      // 2. Pair standalone CloneCD .ccd (when no .cue claimed it) -> .img + .sub
      const ccdEntries = folderEntries.filter(
        (e) => e.file.name.toLowerCase().endsWith('.ccd') && !claimedTrackRelPaths.has(e.relPath)
      );
      for (const ccdEntry of ccdEntries) {
        const stem = ccdEntry.file.name.replace(/\.ccd$/i, '').toLowerCase();
        const imgMatch = trackCandidates.find(
          (tc) =>
            !claimedTrackRelPaths.has(tc.relPath) &&
            tc.file.name.toLowerCase() === `${stem}.img`
        );
        const subMatch = trackCandidates.find(
          (tc) =>
            !claimedTrackRelPaths.has(tc.relPath) &&
            tc.file.name.toLowerCase() === `${stem}.sub`
        );
        if (imgMatch) {
          const comps = [imgMatch.file];
          claimedTrackRelPaths.add(imgMatch.relPath);
          if (subMatch) {
            comps.push(subMatch.file);
            claimedTrackRelPaths.add(subMatch.relPath);
          }
          ccdEntry.companionFiles = comps;
          ccdEntry.pairedFormatExt = '.ccd+.img';
          ccdEntry.cueText = `FILE "${imgMatch.file.name}" BINARY\r\n  TRACK 01 MODE2/2352\r\n    INDEX 01 00:00:00\r\n`;
        }
      }

      // 3. Pair Alcohol 120% .mds + .mdf
      const mdsEntries = folderEntries.filter(
        (e) => e.file.name.toLowerCase().endsWith('.mds') && !claimedTrackRelPaths.has(e.relPath)
      );
      for (const mdsEntry of mdsEntries) {
        const stem = mdsEntry.file.name.replace(/\.mds$/i, '').toLowerCase();
        const mdfMatch = trackCandidates.find(
          (tc) =>
            !claimedTrackRelPaths.has(tc.relPath) &&
            tc.file.name.toLowerCase() === `${stem}.mdf`
        );
        if (mdfMatch) {
          claimedTrackRelPaths.add(mdfMatch.relPath);
          mdsEntry.companionFiles = [mdfMatch.file];
          mdsEntry.pairedFormatExt = '.mdf+.mds';
          mdsEntry.cueText = `FILE "${mdfMatch.file.name}" BINARY\r\n  TRACK 01 MODE2/2352\r\n    INDEX 01 00:00:00\r\n`;
        }
      }

      // 4. Pair Dreamcast .gdi + track01.bin / track02.raw / ...
      const gdiEntries = folderEntries.filter((e) => e.file.name.toLowerCase().endsWith('.gdi'));
      for (const gdiEntry of gdiEntries) {
        try {
          const gdiTxt = await gdiEntry.file.text();
          const gdiRefs: string[] = [];
          for (const line of gdiTxt.split(/\r?\n/)) {
            const m = line.match(/"([^"]+\.(?:bin|raw|iso))"/i) || line.match(/\s([^\s"]+\.(?:bin|raw|iso))\s+\d+\s*$/i);
            if (m && m[1]) gdiRefs.push(m[1].replace(/\\/g, '/').split('/').pop()!.trim());
          }
          const matchedGdi: File[] = [];
          for (const rName of gdiRefs) {
            const hit = byExactName.get(rName.toLowerCase());
            if (hit && !claimedTrackRelPaths.has(hit.relPath)) {
              claimedTrackRelPaths.add(hit.relPath);
              matchedGdi.push(hit.file);
            }
          }
          if (matchedGdi.length > 0) {
            gdiEntry.companionFiles = matchedGdi;
            gdiEntry.pairedFormatExt = '.gdi';
          }
        } catch {}
      }
    }

    // 5. Absorb .m3u playlist files when any of their referenced discs already exist in the scan
    // so scanning an organized multi-disc folder never creates an extra bogus 1 KB ROM row.
    const allDiscNames = new Set(entries.map((e) => e.file.name.toLowerCase()));
    const m3uEntries = entries.filter((e) => e.file.name.toLowerCase().endsWith('.m3u'));
    for (const m3uEntry of m3uEntries) {
      try {
        const m3uTxt = await m3uEntry.file.text();
        const refs = parseM3uPlaylistLines(m3uTxt);
        const matchesExistingDisc = refs.some((ref) => {
          const base = ref.split('/').pop()?.toLowerCase() || '';
          return base && allDiscNames.has(base);
        });
        if (matchesExistingDisc || refs.length > 0) {
          claimedTrackRelPaths.add(m3uEntry.relPath);
        }
      } catch {}
    }

    return entries.filter((e) => !claimedTrackRelPaths.has(e.relPath));
  };

  // Патчи из patch/: BPS и UPS хранят CRC32 исходника и результата, по ним связываем ромы и патчи.
  // Patches from patch/: BPS and UPS store source and target CRC32, used to link ROMs and patches.
  const linkScannedPatches = async (
    inspected: ScannedRomFile[],
    patchFiles: Array<{ file: File; relPath: string }>
  ) => {
    if (patchFiles.length === 0) return;
    const patchRefs: PatchFileRef[] = [];
    for (const p of patchFiles) {
      try {
        if (p.file.size > 64 * 1024 * 1024) continue;
        const info = readPatchInfo(new Uint8Array(await p.file.arrayBuffer()));
        if (!info) continue;
        patchRefs.push({
          name: p.file.name,
          relativePath: p.relPath,
          sourceCrc32: info.sourceCrc32,
          targetCrc32: info.targetCrc32,
        });
      } catch {}
    }
    for (let k = 0; k < inspected.length; k++) {
      const it = inspected[k];
      if (!it.mod) continue;
      inspected[k] = {
        ...it,
        mod: linkPatchesToRom(it.mod, [it.crc32, it.headerlessCrc32], patchRefs),
      };
    }
    addLog(tf('app.scan.patchesFound', { count: patchRefs.length }));
  };

  const inspectFileObject = async (
    file: File,
    relativePath: string,
    parentHandle?: any,
    gamelistMap?: Map<string, string>,
    companionFiles?: File[],
    cueText?: string,
    pairedFormatExt?: string
  ): Promise<ScannedRomFile | null> => {
    const dotIdx = file.name.lastIndexOf('.');
    if (dotIdx === -1) return null;
    const rawExt = file.name.slice(dotIdx).toLowerCase();
    if (!EXT_TO_DEFAULT_CONSOLE[rawExt]) return null;

    const hasCompanions = Array.isArray(companionFiles) && companionFiles.length > 0;
    const isPairedOpticalSet =
      hasCompanions && (rawExt === '.cue' || rawExt === '.ccd' || rawExt === '.mds' || rawExt === '.gdi');
    const effectiveExt = isPairedOpticalSet ? pairedFormatExt || '.bin+.cue' : rawExt;
    const payloadFile = isPairedOpticalSet ? companionFiles[0] : file;
    const payloadExt = isPairedOpticalSet
      ? payloadFile.name.toLowerCase().endsWith('.img')
        ? '.img'
        : '.bin'
      : rawExt;
    const combinedFileSize = isPairedOpticalSet
      ? file.size + companionFiles.reduce((sum, cf) => sum + cf.size, 0)
      : file.size;

    const hashLimit = Math.min(payloadFile.size, 16 * 1024 * 1024);
    const buf = await payloadFile.slice(0, hashLimit).arrayBuffer();
    const bytes = new Uint8Array(buf);
    const crc32 = computeCRC32Hex(bytes, 0);

    let skip = 0;
    if (
      payloadExt === '.nes' &&
      bytes.length >= 16 &&
      bytes[0] === 0x4e &&
      bytes[1] === 0x45 &&
      bytes[2] === 0x53 &&
      bytes[3] === 0x1a
    ) {
      skip = 16;
    } else if (
      (payloadExt === '.smc' || payloadExt === '.sfc') &&
      bytes.length % 1024 === 512 &&
      bytes.length > 512
    ) {
      skip = 512;
    }
    const headerlessCrc32 = skip > 0 ? computeCRC32Hex(bytes, skip) : crc32;

    const consoleCode = detectConsoleFromPathAndExt(relativePath, payloadExt);
    const meta = CONSOLE_CATALOG[consoleCode] || CONSOLE_CATALOG.nes;
    const localizedGenShort =
      meta.generationShort === 'Handheld' ? tStatic('cat.portableGen') : meta.generationShort;
    const { sourceSubfolder, isRusFolder, isTopFolder } = analyzeSubfolderContext(relativePath);
    const isRussian = RUS_TAG_REGEX.test(file.name) || isRusFolder;

    let extractedInternalTitle = '';
    let extractedSource: TitleSource | undefined;
    const lowerName = file.name.toLowerCase();
    const baseNoExt = lowerName.replace(/\.[^/.]+$/, '');
    const coreNumKey = extractCoreNumberKey(file.name);

    if (gamelistMap) {
      extractedInternalTitle =
        gamelistMap.get(lowerName) ||
        gamelistMap.get(baseNoExt) ||
        (coreNumKey ? gamelistMap.get(coreNumKey) || gamelistMap.get(`${coreNumKey}${rawExt}`) : '') ||
        '';
      if (extractedInternalTitle) extractedSource = 'gamelist';
    }

    const fileDiscInfo = extractDiscNumberAndBaseTitle(file.name);
    const filenameClean = extractCleanTitle(fileDiscInfo.baseNameWithoutDisc || file.name);
    const filenameLetterCount = (filenameClean.match(/[a-zA-Zа-яА-ЯёЁ]/g) || []).length;
    const prelimNumbered = isNumberedRomFilename(file.name, extractedInternalTitle, false);
    if (!extractedInternalTitle && prelimNumbered) {
      if (FACTORY_NUMBER_TO_TITLE_MAP[baseNoExt]) {
        extractedInternalTitle = FACTORY_NUMBER_TO_TITLE_MAP[baseNoExt];
      } else if (coreNumKey && FACTORY_NUMBER_TO_TITLE_MAP[coreNumKey]) {
        extractedInternalTitle = FACTORY_NUMBER_TO_TITLE_MAP[coreNumKey];
      }
      if (extractedInternalTitle) extractedSource = 'factory';
    }
    // Only fall back to binary ROM headers when the filename is numbered/opaque (never overwrite clean human-readable filenames with 12-char uppercase cart codes!)
    if (!extractedInternalTitle && (prelimNumbered || filenameLetterCount < 3)) {
      const rawBinTitle = await extractInternalBinaryRomTitle(
        payloadFile,
        payloadExt,
        consoleCode
      );
      if (rawBinTitle) {
        extractedInternalTitle = prettifyBinaryHeaderTitle(rawBinTitle);
        if (extractedInternalTitle) extractedSource = 'header';
      }
    }

    const titleDiscInfo = extractedInternalTitle
      ? extractDiscNumberAndBaseTitle(extractedInternalTitle)
      : { discNumber: null, discTag: '', baseNameWithoutDisc: '' };
    const discNumber = fileDiscInfo.discNumber ?? titleDiscInfo.discNumber;

    const numbered = isNumberedRomFilename(file.name, extractedInternalTitle, false);
    const region = parseRegion(extractedInternalTitle || file.name, isRussian);
    const revision = parseRevision(file.name);
    const usesExtractedTitle = Boolean(
      extractedInternalTitle && (prelimNumbered || filenameLetterCount < 3 || gamelistMap)
    );
    const cleanTitle = usesExtractedTitle
      ? extractCleanTitle(titleDiscInfo.baseNameWithoutDisc || extractedInternalTitle)
      : filenameClean;
    const titleSource: TitleSource = usesExtractedTitle && extractedSource ? extractedSource : 'filename';
    const titleNote =
      numbered && !extractedInternalTitle ? t('title.note.numberedNotFound') : '';
    const comparisonKey = buildComparisonKey(cleanTitle);

    let canonExt = rawExt;
    if (rawExt === '.smc') canonExt = '.sfc';
    if (rawExt === '.gen' || rawExt === '.smd') canonExt = '.md';

    const hasValidAlphabeticTitle =
      !PURE_NUMBERED_ROM_REGEX.test(cleanTitle) &&
      (cleanTitle.match(/[a-zA-Zа-яА-ЯёЁ]/g) || []).length >= 2;

    const { releaseYear } = inferGenreAndYear(cleanTitle, consoleCode);
    const mod = detectRomMod(file.name, relativePath);
    let canonicalName = file.name;
    if (hasValidAlphabeticTitle) {
      canonicalName = formatRomFilenameByConfig(
        {
          cleanTitle,
          year: releaseYear || 1998,
          region,
          isRussian,
          bitness: localizedGenShort,
          consoleCode,
          extension: canonExt,
          revision,
          modTag: modTag(mod),
        },
        filenameConfigRef.current
      );
      if (discNumber !== null) {
        canonicalName = buildDiscTargetFilename(
          canonicalName.replace(/\.[^/.]+$/, ''),
          discNumber,
          canonExt
        );
      }
    }

    const isJunk = JUNK_REGEX.test(file.name);
    const titleForArt = extractedInternalTitle
      ? extractCleanTitle(titleDiscInfo.baseNameWithoutDisc || extractedInternalTitle)
      : cleanTitle;
    const defaultBoxArtUrl = hasValidAlphabeticTitle
      ? `https://thumbnails.libretro.com/${encodeURIComponent(
          meta.libretroSystem
        )}/Named_Boxarts/${encodeURIComponent(titleForArt)} (USA).png`
      : undefined;

    const cueMissingBinNote =
      (rawExt === '.cue' || rawExt === '.ccd' || rawExt === '.mds') && !hasCompanions
        ? tf('app.scan.noPairWarning', { ext: rawExt })
        : '';

    const setBadge = effectiveExt.replace(/^\./, '');

    return {
      id: `${relativePath}_${combinedFileSize}_${crc32}`,
      relativePath,
      sourceSubfolder,
      fileName: file.name,
      cleanTitle,
      extractedInternalTitle,
      isNumberedName: numbered,
      comparisonKey,
      canonicalName,
      extension: effectiveExt,
      consoleCode,
      generationFolder: meta.generationFolder,
      generationShort: localizedGenShort,
      fileSize: combinedFileSize,
      crc32,
      headerlessCrc32,
      region,
      isRussian,
      isFromTopFolder: isTopFolder,
      revision,
      status: isJunk ? 'junk_bad_dump' : 'verified',
      is1G1RWinner: !isJunk,
      reason: isJunk ? t('app.scan.badDumpReason') : t('app.scan.keep1g1rReason'),
      scrapedBoxArtUrl: defaultBoxArtUrl,
      discNumber,
      mediaStatus: cueMissingBinNote
        ? cueMissingBinNote
        : extractedInternalTitle
        ? tf('app.scan.recognizedMedia', {
            paired: isPairedOpticalSet
              ? ` (${setBadge} · ${companionFiles.length})`
              : '',
            title: extractedInternalTitle,
          })
        : numbered
        ? t('app.scan.numberedStatus')
        : isPairedOpticalSet
        ? tf('app.scan.setReadyStatus', {
            badge: setBadge,
            count: companionFiles.length,
          })
        : t('app.scan.readyToScrape'),
      fileObj: file,
      companionFiles,
      cueText,
      parentHandle,
      titleSource,
      titleNote,
      mod,
    };
  };

  // Helper to index local image/video files found in images/, videos/, download_images/, etc.
  const registerLocalMediaFile = (
    file: File,
    imgMap: Map<string, File>,
    vidMap: Map<string, File>
  ) => {
    const dot = file.name.lastIndexOf('.');
    if (dot === -1) return;
    const ext = file.name.slice(dot).toLowerCase();
    const isImg = ['.png', '.jpg', '.jpeg', '.bmp', '.webp'].includes(ext);
    const isVid = ['.mp4', '.webm', '.mkv'].includes(ext);
    if (!isImg && !isVid) return;

    let stem = file.name.slice(0, dot).trim();
    const suffixes = [
      '-image',
      '-thumb',
      '-boxart',
      '-marquee',
      '-video',
      '-snap',
      '_image',
      '_thumb',
      '_video',
    ];
    for (const sfx of suffixes) {
      if (stem.toLowerCase().endsWith(sfx)) {
        stem = stem.slice(0, stem.length - sfx.length).trim();
        break;
      }
    }

    const keys = new Set<string>();
    keys.add(stem.toLowerCase());
    const coreKey = extractCoreNumberKey(stem);
    if (coreKey) keys.add(coreKey.toLowerCase());
    const compKey = buildComparisonKey(extractCleanTitle(stem));
    if (compKey && compKey.length >= 2) keys.add(compKey);

    const targetMap = isImg ? imgMap : vidMap;
    for (const k of keys) {
      if (!targetMap.has(k)) {
        targetMap.set(k, file);
      }
    }
  };

  const attachLocalMediaToRom = (
    rom: ScannedRomFile,
    imgMap: Map<string, File>,
    vidMap: Map<string, File>
  ): ScannedRomFile => {
    const baseNoExt = rom.fileName.replace(/\.[^/.]+$/, '').trim().toLowerCase();
    const coreKey = extractCoreNumberKey(rom.fileName)?.toLowerCase();
    const candidateKeys = [
      baseNoExt,
      coreKey,
      rom.cleanTitle.toLowerCase(),
      rom.comparisonKey,
    ].filter(Boolean) as string[];

    let matchedImgFile: File | undefined;
    let matchedVidFile: File | undefined;

    for (const k of candidateKeys) {
      if (!matchedImgFile && imgMap.has(k)) matchedImgFile = imgMap.get(k);
      if (!matchedVidFile && vidMap.has(k)) matchedVidFile = vidMap.get(k);
    }

    let boxArtUrl = rom.scrapedBoxArtUrl;
    let videoUrl = rom.scrapedVideoUrl;
    let mediaStatus = rom.mediaStatus;

    if (matchedImgFile) {
      boxArtUrl = URL.createObjectURL(matchedImgFile);
    }
    if (matchedVidFile) {
      videoUrl = URL.createObjectURL(matchedVidFile);
    }
    if (matchedImgFile && matchedVidFile) {
      mediaStatus = t('app.scan.localMediaBoth');
    } else if (matchedImgFile) {
      mediaStatus = t('app.scan.localMediaCover');
    } else if (matchedVidFile) {
      mediaStatus = t('app.scan.localMediaVideo');
    }

    return {
      ...rom,
      scrapedBoxArtUrl: boxArtUrl,
      scrapedVideoUrl: videoUrl,
      mediaStatus,
    };
  };

  // Automatically resolves official Libretro BoxArt covers and Archive.org .mp4 short gameplay videos
  // right after scanning a folder so images & videos immediately appear in the Library and Inspector!
  const autoEnrichMediaFromBatchScraper = async (
    scannedList: ScannedRomFile[],
    folderTitle: string
  ) => {
    if (scannedList.length === 0) return;
    try {
      setCurrentActionText(
        tf('app.scan.enriching', { count: scannedList.length })
      );
      const payload = scannedList.slice(0, 250).map((w) => {
        const meta = CONSOLE_CATALOG[w.consoleCode] || CONSOLE_CATALOG.psx;
        return {
          id: w.id,
          cleanTitle: w.extractedInternalTitle
            ? extractCleanTitle(w.extractedInternalTitle)
            : w.cleanTitle,
          comparisonKey: w.comparisonKey,
          region: w.region,
          libretroSystem: meta.libretroSystem,
          archiveVideoId: meta.archiveVideoId,
        };
      });

      const resp = await fetch('/api/r36s/scrape-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: payload }),
      });
      if (!resp.ok) return;
      const data = await resp.json();
      const matchMap = new Map<string, any>();
      for (const res of data.results || []) {
        matchMap.set(res.id, res);
      }
      if (matchMap.size === 0) return;

      let enrichedImages = 0;
      let enrichedVideos = 0;

      const enrichedById = new Map<string, ScannedRomFile>();

      const updatedBatch = scannedList.map((r) => {
        const m = matchMap.get(r.id);
        if (!m) return r;
        const hasLocalBlobImg = r.scrapedBoxArtUrl?.startsWith('blob:');
        const hasLocalBlobVid = r.scrapedVideoUrl?.startsWith('blob:');

        const nextBoxArt = hasLocalBlobImg ? r.scrapedBoxArtUrl : m.boxArtUrl || r.scrapedBoxArtUrl;
        const nextVideo = hasLocalBlobVid ? r.scrapedVideoUrl : m.videoUrl || r.scrapedVideoUrl;

        if (nextBoxArt) enrichedImages++;
        if (nextVideo) enrichedVideos++;

        const enrichedItem: ScannedRomFile = {
          ...r,
          scrapedBoxArtUrl: nextBoxArt,
          scrapedSnapUrl: m.snapUrl || r.scrapedSnapUrl,
          scrapedMarqueeUrl: m.marqueeUrl || r.scrapedMarqueeUrl,
          scrapedVideoUrl: nextVideo,
          mediaStatus:
            nextBoxArt && nextVideo
              ? t('app.scan.mediaBoth')
              : nextBoxArt
              ? t('app.scan.mediaCovered')
              : r.mediaStatus,
        };
        enrichedById.set(enrichedItem.id, enrichedItem);
        return enrichedItem;
      });

      const mergedFinal =
        romsRef.current.length > 0
          ? romsRef.current.map((existing) => enrichedById.get(existing.id) || existing)
          : updatedBatch;

      romsRef.current = mergedFinal;
      setRoms(mergedFinal);
      setScanRevision((n) => n + 1);
      syncScannedRomsIntoDb(mergedFinal, folderTitle, false);
      const doneEnrichMsg = tf('app.scan.enrichedDone', {
        covers: enrichedImages,
        videos: enrichedVideos,
      });
      setCurrentActionText(doneEnrichMsg);
      addLog(doneEnrichMsg);
    } catch {}
  };

  // Выбор главного пути к Библиотеке (где хранятся xml, db, roms, images, videos)
  const handleSelectLibraryPath = async () => {
    if (isAnyProcessRunning) return;

    const win = window as any;
    if (typeof win.showDirectoryPicker === 'function') {
      try {
        const dirHandle = await win.showDirectoryPicker({ mode: 'readwrite' });
        await saveDirectoryHandle('library_root', dirHandle, dirHandle.name);
        await saveDirectoryHandle('scan_root', dirHandle, dirHandle.name);
        setPendingRestoreHandles((prev) =>
          prev.filter((h) => h.key !== 'library_root' && h.key !== 'scan_root')
        );
        setLibraryDirHandle(dirHandle);
        if (!rootDirHandle) {
          setRootDirHandle(dirHandle);
        }
        setSelectedFolderName(dirHandle.name);
        setMediaAccessVersion((v) => v + 1);

        // Создаем стандартную структуру папок Библиотеки AegisROM v0.5 (roms, images, marquees, videos, xml)
        try {
          await dirHandle.getDirectoryHandle('roms', { create: true });
          await dirHandle.getDirectoryHandle('images', { create: true });
          await dirHandle.getDirectoryHandle('marquees', { create: true });
          await dirHandle.getDirectoryHandle('videos', { create: true });
        } catch {}

        const newLibPath = tf('app.lib.pathBadge', { name: dirHandle.name });
        const nextDb: PersistentDbState = {
          ...dbState,
          masterLibraryPath: dirHandle.name,
          sdCardMountPath: dirHandle.name,
          lastSyncedAt: new Date().toISOString(),
        };

        try {
          const dbFh = await dirHandle.getFileHandle('aegisrom_db.json');
          const dbFile = await dbFh.getFile();
          const parsed = JSON.parse(await dbFile.text());
          if (parsed && Array.isArray(parsed.records) && parsed.records.length > 0) {
            nextDb.records = parsed.records;
            addLog(
              tf('app.lib.loadedFromDirLog', {
                dir: dirHandle.name,
                count: parsed.records.length,
              })
            );
          }
        } catch {
          try {
            const dbFh = await dirHandle.getFileHandle('aegisrom_db.json', { create: true });
            const w = await dbFh.createWritable();
            await w.write(JSON.stringify(nextDb, null, 2));
            await w.close();
          } catch {}
        }

        await handleUpdateDbState(nextDb);
        addLog(tf('app.lib.pathSelectedLog', { path: newLibPath }));

        // Сканируем ромы и локальные обложки/видео внутри выбранной папки библиотеки
        await scanDirectoryHandleRecursively(dirHandle);
        return;
      } catch (err: any) {
        if (err?.name === 'AbortError') return;
      }
    }

    fallbackInputRef.current?.click();
  };

  // Импорт базы данных (.json), списка игр (.xml) в Библиотеку
  const handleImportLibraryFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    let importedCount = 0;
    const importedRoms: ScannedRomFile[] = [...roms];

    for (const file of Array.from(files)) {
      const lower = file.name.toLowerCase();
      try {
        const text = await file.text();
        if (lower.endsWith('.json')) {
          const parsed = JSON.parse(text);
          if (parsed && Array.isArray(parsed.records)) {
            await handleUpdateDbState({
              ...dbState,
              ...parsed,
              lastSyncedAt: new Date().toISOString(),
            });
            for (const rec of parsed.records as PersistentRomRecord[]) {
              const meta = CONSOLE_CATALOG[rec.consoleCode] || CONSOLE_CATALOG.psx;
              importedRoms.push({
                id: rec.id || `imp_${rec.fileName}_${importedRoms.length}`,
                relativePath: rec.sdCardPath || rec.fileName,
                sourceSubfolder: rec.consoleCode,
                fileName: rec.sdCardFileName || rec.fileName,
                cleanTitle: rec.cleanTitle || rec.title,
                extractedInternalTitle: rec.title,
                isNumberedName: false,
                comparisonKey: rec.comparisonKey || buildComparisonKey(rec.title),
                canonicalName: rec.fileName,
                extension: rec.fileName.slice(rec.fileName.lastIndexOf('.')) || '.chd',
                consoleCode: rec.consoleCode || 'psx',
                generationFolder: meta.generationFolder,
                generationShort:
                  (rec.generationShort || meta.generationShort) === 'Handheld'
                    ? t('cat.portableGen')
                    : rec.generationShort || meta.generationShort,
                fileSize: rec.fileSize || 350 * 1024 * 1024,
                crc32: rec.crc32 || 'A1B2C3D4',
                headerlessCrc32: rec.crc32 || 'A1B2C3D4',
                region: rec.region || 'RUS',
                isRussian: Boolean(rec.isRussian),
                isFromTopFolder: false,
                revision: '',
                status: 'verified',
                is1G1RWinner: true,
                reason: t('app.lib.importedJsonReason'),
                scrapedBoxArtUrl: rec.boxArtUrl,
                mediaStatus: t('app.lib.importedJsonStatus'),
              });
              importedCount++;
            }
          }
        } else if (lower.endsWith('.xml')) {
          const xmlMap = parseGamelistXmlString(text);
          xmlMap.forEach((gameTitle, romKey) => {
            if (!romKey.includes('.')) return;
            const clean = extractCleanTitle(gameTitle);
            const ext = romKey.slice(romKey.lastIndexOf('.')) || '.chd';
            const consoleCode = EXT_TO_DEFAULT_CONSOLE[ext] || 'psx';
            const meta = CONSOLE_CATALOG[consoleCode] || CONSOLE_CATALOG.psx;
            importedRoms.push({
              id: `xml_${romKey}_${importedRoms.length}`,
              relativePath: romKey,
              sourceSubfolder: consoleCode,
              fileName: romKey,
              cleanTitle: clean,
              extractedInternalTitle: gameTitle,
              isNumberedName: false,
              comparisonKey: buildComparisonKey(clean),
              canonicalName: `${clean}${ext}`,
              extension: ext,
              consoleCode,
              generationFolder: meta.generationFolder,
              generationShort:
                meta.generationShort === 'Handheld'
                  ? t('cat.portableGen')
                  : meta.generationShort,
              fileSize: 400 * 1024 * 1024,
              crc32: 'XMLMATCH',
              headerlessCrc32: 'XMLMATCH',
              region: 'USA',
              isRussian: false,
              isFromTopFolder: false,
              revision: '',
              status: 'verified',
              is1G1RWinner: true,
              reason: t('app.lib.importedXmlReason'),
              scrapedBoxArtUrl: `https://thumbnails.libretro.com/${encodeURIComponent(
                meta.libretroSystem
              )}/Named_Boxarts/${encodeURIComponent(clean)} (USA).png`,
              mediaStatus: tf('app.lib.importedXmlStatus', { title: gameTitle }),
            });
            importedCount++;
          });
        }
      } catch (err) {
        addLog(tf('app.lib.importErrLog', { file: file.name, err: String(err) }));
      }
    }

    if (importedCount > 0) {
      const expandedImp = expandMultiDiscScannedRoms(importedRoms);
      const dedup = deduplicateAcrossSubfolders(expandedImp, getPriorityArray(priorityPreset));
      const collapsedImp = collapseMultiDiscScannedRoms(dedup, filenameConfigRef.current);
      romsRef.current = collapsedImp;
      setRoms(collapsedImp);
      syncScannedRomsIntoDb(collapsedImp, dbState.masterLibraryPath);
      addLog(tf('app.lib.importDoneLog', { count: importedCount }));
      await autoEnrichMediaFromBatchScraper(collapsedImp, dbState.masterLibraryPath);
    }
    e.target.value = '';
  };

  // Экспорт Библиотеки (сохранение aegisrom_db.json и gamelist.xml в папку Библиотеки и скачивание резервной копии)
  const handleExportLibrary = async () => {
    const activeHandle = libraryDirHandle || rootDirHandle;
    const exportRecords = roms.length > 0 ? roms : [];

    // Формируем gamelist.xml по текущим играм Библиотеки
    const xmlLines: string[] = ['<?xml version="1.0" encoding="utf-8"?>', '<gameList>'];
    if (exportRecords.length > 0) {
      for (const r of exportRecords.filter((x) => x.status === 'verified')) {
        const stem = r.canonicalName.replace(/\.[^/.]+$/, '');
        xmlLines.push('\t<game>');
        xmlLines.push(`\t\t<path>./${escapeXml(r.canonicalName)}</path>`);
        xmlLines.push(`\t\t<name>${escapeXml(r.extractedInternalTitle || r.cleanTitle)}</name>`);
        xmlLines.push(`\t\t<image>./images/${escapeXml(stem)}-image.png</image>`);
        xmlLines.push(`\t\t<marquee>./marquees/${escapeXml(stem)}-marquee.png</marquee>`);
        xmlLines.push(`\t\t<video>./videos/${escapeXml(stem)}-video.mp4</video>`);
        xmlLines.push('\t</game>');
      }
    } else {
      for (const rec of dbState.records) {
        const stem = rec.fileName.replace(/\.[^/.]+$/, '');
        xmlLines.push('\t<game>');
        xmlLines.push(`\t\t<path>./${escapeXml(rec.fileName)}</path>`);
        xmlLines.push(`\t\t<name>${escapeXml(rec.title)}</name>`);
        xmlLines.push(`\t\t<image>./images/${escapeXml(stem)}-image.png</image>`);
        xmlLines.push(`\t\t<video>./videos/${escapeXml(stem)}-video.mp4</video>`);
        xmlLines.push('\t</game>');
      }
    }
    xmlLines.push('</gameList>');
    const xmlContent = xmlLines.join('\n');
    const jsonContent = JSON.stringify(
      {
        ...dbState,
        exportedAt: new Date().toISOString(),
        totalRoms: roms.length || dbState.records.length,
      },
      null,
      2
    );

    if (activeHandle) {
      try {
        const dbFh = await activeHandle.getFileHandle('aegisrom_db.json', { create: true });
        const dbW = await dbFh.createWritable();
        await dbW.write(jsonContent);
        await dbW.close();

        const xmlFh = await activeHandle.getFileHandle('gamelist.xml', { create: true });
        const xmlW = await xmlFh.createWritable();
        await xmlW.write(xmlContent);
        await xmlW.close();

        addLog(tf('app.lib.exportDirectLog', { dir: activeHandle.name }));
      } catch {}
    }

    const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'aegisrom_library_db.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);

    const xmlBlob = new Blob([xmlContent], { type: 'application/xml;charset=utf-8' });
    const xmlUrl = URL.createObjectURL(xmlBlob);
    const xmlA = document.createElement('a');
    xmlA.href = xmlUrl;
    xmlA.download = 'gamelist.xml';
    document.body.appendChild(xmlA);
    xmlA.click();
    xmlA.remove();
    setTimeout(() => URL.revokeObjectURL(xmlUrl), 3000);

    addLog(
      tf('app.lib.exportDoneLog', {
        path: selectedFolderName || dbState.masterLibraryPath,
      })
    );
  };

  const mergeRomsIncremental = (
    prevRoms: ScannedRomFile[],
    incomingRoms: ScannedRomFile[]
  ): ScannedRomFile[] => {
    const byIdentity = new Map<string, ScannedRomFile>();
    const makeKey = (r: ScannedRomFile) =>
      `${r.consoleCode}::${r.fileName.toLowerCase()}::${r.fileSize}::${r.crc32}`;

    for (const prev of expandMultiDiscScannedRoms(prevRoms)) {
      byIdentity.set(makeKey(prev), prev);
    }
    for (const inc of expandMultiDiscScannedRoms(incomingRoms)) {
      const k = makeKey(inc);
      const existing = byIdentity.get(k);
      if (existing) {
        byIdentity.set(k, {
          ...existing,
          ...inc,
          scrapedBoxArtUrl: inc.scrapedBoxArtUrl || existing.scrapedBoxArtUrl,
          scrapedVideoUrl: inc.scrapedVideoUrl || existing.scrapedVideoUrl,
        });
      } else {
        byIdentity.set(k, inc);
      }
    }

    const deduped = deduplicateAcrossSubfolders(
      Array.from(byIdentity.values()),
      getPriorityArray(priorityPreset)
    );
    return collapseMultiDiscScannedRoms(deduped, filenameConfigRef.current);
  };

  const handleSelectAndScanFolder = async (mode: 'append' | 'replace' = 'replace') => {
    if (isAnyProcessRunning) return;
    scanModeRef.current = mode;
    setLastScanMode(mode);

    const win = window as any;
    if (typeof win.showDirectoryPicker === 'function') {
      try {
        const dirHandle = await win.showDirectoryPicker({ mode: 'readwrite' });
        await saveDirectoryHandle('scan_root', dirHandle, dirHandle.name);
        setPendingRestoreHandles((prev) => prev.filter((h) => h.key !== 'scan_root'));
        if (mode === 'replace' || !rootDirHandle) {
          setRootDirHandle(dirHandle);
          setSelectedFolderName(dirHandle.name);
        }
        if (!libraryDirHandle) {
          await saveDirectoryHandle('library_root', dirHandle, dirHandle.name);
          setLibraryDirHandle(dirHandle);
        }
        await scanDirectoryHandleRecursively(dirHandle, mode);
        return;
      } catch (err: any) {
        if (err?.name === 'AbortError') return;
      }
    }

    fallbackInputRef.current?.click();
  };

  const handleAddFolderToLibrary = async () => {
    await handleSelectAndScanFolder('append');
  };

  // Scan an external USB drive or folder strictly for Sync & Discrepancies comparison (without modifying active Library)
  const scanExternalSourceForDiff = async (): Promise<{
    sourceName: string;
    rows: UnifiedGameRow[];
  } | null> => {
    const win = window as any;
    let discovered: DiscoveredScanEntry[] = [];
    let sourceName = t('app.extFolderDefault');

    if (typeof win.showDirectoryPicker === 'function') {
      try {
        const extHandle = await win.showDirectoryPicker({ mode: 'read' });
        sourceName = extHandle.name || t('app.extFolderDefault');
        addLog(tf('app.ext.sourceFoundLog', { name: sourceName }));

        const walkExt = async (dirHandle: any, prefix: string) => {
          let localGamelist: Map<string, string> | undefined;
          try {
            const glHandle = await dirHandle.getFileHandle('gamelist.xml');
            const glFile = await glHandle.getFile();
            localGamelist = parseGamelistXmlString(await glFile.text());
          } catch {}

          for await (const entry of dirHandle.values()) {
            if (entry.name.startsWith('.')) continue;
            const lower = entry.name.toLowerCase();
            if (entry.kind === 'directory') {
              if (
                [
                  'images',
                  'videos',
                  'marquees',
                  'snap',
                  'boxart',
                  'downloaded_images',
                  'download_images',
                  '_duplicates_1g1r',
                  '_baddumps_junk',
                  'system volume information',
                  '$recycle.bin',
                ].includes(lower)
              ) {
                continue;
              }
              const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
              await walkExt(entry, rel);
            } else if (entry.kind === 'file') {
              const dot = entry.name.lastIndexOf('.');
              const ext = dot !== -1 ? entry.name.slice(dot).toLowerCase() : '';
              const relCandidate = prefix ? `${prefix}/${entry.name}` : entry.name;
              const isPortScript = ext === '.sh' && relCandidate.toLowerCase().includes('port');
              if (EXT_TO_DEFAULT_CONSOLE[ext] || isPortScript) {
                const file = await entry.getFile();
                discovered.push({
                  file,
                  relPath: relCandidate,
                  parentHandle: dirHandle,
                  gamelistMap: localGamelist,
                });
              }
            }
          }
        };

        const rootLow = sourceName.toLowerCase();
        await walkExt(extHandle, CONSOLE_CATALOG[rootLow] ? sourceName : '');
      } catch (err: any) {
        if (err?.name === 'AbortError') return null;
      }
    }

    if (discovered.length === 0 && typeof win.showDirectoryPicker !== 'function') {
      const files = await new Promise<File[]>((resolve) => {
        const inp = document.createElement('input');
        inp.type = 'file';
        inp.multiple = true;
        inp.setAttribute('webkitdirectory', 'true');
        inp.setAttribute('directory', 'true');
        inp.onchange = () => resolve(Array.from(inp.files || []));
        inp.click();
      });
      if (files.length === 0) return null;
      const firstRel = (files[0] as any).webkitRelativePath || files[0].name;
      sourceName = firstRel.includes('/') ? firstRel.split('/')[0] : t('app.extFolderDefault');
      for (const f of files) {
        const dot = f.name.lastIndexOf('.');
        const ext = dot !== -1 ? f.name.slice(dot).toLowerCase() : '';
        if (!EXT_TO_DEFAULT_CONSOLE[ext]) continue;
        const rel = (f as any).webkitRelativePath || f.name;
        discovered.push({ file: f, relPath: rel, parentHandle: undefined });
      }
    }

    if (discovered.length === 0) {
      addLog(tf('app.ext.noRomsLog', { name: sourceName }));
      return { sourceName, rows: [] };
    }

    const paired = await pairDiscCueAndTrackFiles(discovered);
    const inspected: ScannedRomFile[] = [];
    for (const entry of paired) {
      const item = await inspectFileObject(
        entry.file,
        entry.relPath,
        entry.parentHandle,
        entry.gamelistMap,
        entry.companionFiles,
        entry.cueText,
        entry.pairedFormatExt
      );
      if (item) inspected.push(item);
    }

    const collapsedDiff = collapseMultiDiscScannedRoms(inspected, filenameConfigRef.current);
    const rows = collapsedDiff.map(convertScannedRomToUnifiedRow);
    addLog(tf('app.ext.doneLog', { name: sourceName, count: rows.length }));
    return { sourceName, rows };
  };

  const scanDirectoryHandleRecursively = async (
    rootHandle: any,
    mode: 'append' | 'replace' = scanModeRef.current
  ) => {
    stopRequestedRef.current = false;
    setIsScanning(true);
    setProgressPct(5);
    const startScanMsg =
      mode === 'append'
        ? tf('app.scan.appending', { name: rootHandle.name })
        : tf('app.scan.scanning', { name: rootHandle.name });
    setCurrentActionText(startScanMsg);
    addLog(startScanMsg);

    const discovered: Array<{
      file: File;
      relPath: string;
      parentHandle: any;
      gamelistMap?: Map<string, string>;
    }> = [];
    const localImageFilesMap = new Map<string, File>();
    const localVideoFilesMap = new Map<string, File>();
    // Файлы патчей из папок patch/. / Patch files from patch/ folders.
    const discoveredPatches: Array<{ file: File; relPath: string }> = [];

    const rootFolderTitle = rootHandle.name.toLowerCase();
    const prefixStart = CONSOLE_CATALOG[rootFolderTitle] ? rootHandle.name : '';

    async function walkMediaFolderHandle(mediaDirHandle: any) {
      try {
        for await (const mEntry of mediaDirHandle.values()) {
          if (stopRequestedRef.current) break;
          if (mEntry.kind === 'file') {
            try {
              const mFile = await mEntry.getFile();
              registerLocalMediaFile(mFile, localImageFilesMap, localVideoFilesMap);
            } catch {}
          }
        }
      } catch {}
    }

    async function walkHandle(dirHandle: any, prefix: string) {
      if (stopRequestedRef.current) return;
      setCurrentActionText(tf('app.scan.walkingDir', { dir: prefix || dirHandle.name }));
      let localGamelist: Map<string, string> | undefined;
      try {
        const glHandle = await dirHandle.getFileHandle('gamelist.xml');
        const glFile = await glHandle.getFile();
        const xmlText = await glFile.text();
        localGamelist = parseGamelistXmlString(xmlText);
      } catch {}

      for await (const entry of dirHandle.values()) {
        if (stopRequestedRef.current) break;
        if (entry.name.startsWith('.')) continue;
        const lowerName = entry.name.toLowerCase();
        if (entry.kind === 'directory') {
          if (
            OFFICIAL_R36S_MEDIA_DIRS.has(lowerName) ||
            Boolean(PHANTOM_MEDIA_DIR_KEYS[lowerName]) ||
            ['images', 'videos', 'marquees', 'snap', 'boxart', 'downloaded_images', 'download_images'].includes(
              lowerName
            )
          ) {
            await walkMediaFolderHandle(entry);
            continue;
          }
          if (
            [
              '_duplicates_1g1r',
              '_baddumps_junk',
              '_quarantine_1g1r_clones',
              'banners',
              'system volume information',
              '$recycle.bin',
            ].includes(lowerName)
          ) {
            continue;
          }
          const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
          await walkHandle(entry, rel);
        } else if (entry.kind === 'file') {
          const dot = entry.name.lastIndexOf('.');
          const ext = dot !== -1 ? entry.name.slice(dot).toLowerCase() : '';
          const relCandidate = prefix ? `${prefix}/${entry.name}` : entry.name;
          const isPortScript = ext === '.sh' && relCandidate.toLowerCase().includes('port');
          if (isPatchFileName(entry.name) && isInPatchFolder(relCandidate)) {
            try {
              discoveredPatches.push({ file: await entry.getFile(), relPath: relCandidate });
            } catch {}
          } else if (EXT_TO_DEFAULT_CONSOLE[ext] || isPortScript) {
            const file = await entry.getFile();
            discovered.push({
              file,
              relPath: relCandidate,
              parentHandle: dirHandle,
              gamelistMap: localGamelist,
            });
          } else if (
            ['.png', '.jpg', '.jpeg', '.bmp', '.webp', '.mp4', '.webm'].includes(ext)
          ) {
            try {
              const mFile = await entry.getFile();
              registerLocalMediaFile(mFile, localImageFilesMap, localVideoFilesMap);
            } catch {}
          }
        }
      }
    }

    try {
      await walkHandle(rootHandle, prefixStart);
      if (stopRequestedRef.current) {
        addLog(t('app.scan.stoppedLog'));
        return;
      }

      const pairedDiscovered = await pairDiscCueAndTrackFiles(discovered);
      const pairedCueCount = pairedDiscovered.filter((d) => d.companionFiles && d.companionFiles.length > 0).length;
      const foundMsg = tf('app.scan.foundSummary', {
        name: rootHandle.name,
        total: pairedDiscovered.length,
        paired: pairedCueCount > 0 ? tf('app.scan.pairedNote', { count: pairedCueCount }) : '',
        covers: localImageFilesMap.size,
        videos: localVideoFilesMap.size,
      });
      setCurrentActionText(foundMsg);
      addLog(foundMsg);

      const inspected: ScannedRomFile[] = [];
      for (let i = 0; i < pairedDiscovered.length; i++) {
        if (stopRequestedRef.current) {
          addLog(
            tf('app.scan.stoppedAtLog', { i, total: pairedDiscovered.length })
          );
          break;
        }
        const entry = pairedDiscovered[i];
        if (i % 3 === 0 || i === pairedDiscovered.length - 1) {
          setCurrentActionText(
            tf('app.scan.analyzing', {
              i: i + 1,
              total: pairedDiscovered.length,
              file: entry.file.name,
            })
          );
        }
        const item = await inspectFileObject(
          entry.file,
          entry.relPath,
          entry.parentHandle,
          entry.gamelistMap,
          entry.companionFiles,
          entry.cueText,
          entry.pairedFormatExt
        );
        if (item) {
          inspected.push(attachLocalMediaToRom(item, localImageFilesMap, localVideoFilesMap));
        }
        if (pairedDiscovered.length > 0) {
          setProgressPct(Math.round(((i + 1) / pairedDiscovered.length) * 100));
        }
      }

      await linkScannedPatches(inspected, discoveredPatches);

      const deduplicatedIncoming = deduplicateAcrossSubfolders(
        inspected,
        getPriorityArray(priorityPreset)
      );
      let nextRoms =
        mode === 'append' && romsRef.current.length > 0
          ? mergeRomsIncremental(romsRef.current, deduplicatedIncoming)
          : collapseMultiDiscScannedRoms(deduplicatedIncoming, filenameConfigRef.current);

      // When appending a folder into an active Library and autoGroupMultiDisc is enabled,
      // automatically place multi-disc sets into their own subfolder + .m3u inside the Library root!
      let autoGroupedCount = 0;
      const destLibRoot =
        libraryDirHandle || (rootDirHandle && rootDirHandle !== rootHandle ? rootDirHandle : null);
      if (mode === 'append' && autoGroupMultiDiscRef.current && destLibRoot && destLibRoot !== rootHandle) {
        const updatedList = [...nextRoms];
        for (let idx = 0; idx < updatedList.length; idx++) {
          const r = updatedList[idx];
          if (r.status !== 'verified' || !r.isMultiDisc || !r.discs || r.discs.length < 2) continue;
          const hasAnyFile = r.discs.some((d) => Boolean(d.fileObj));
          if (!hasAnyFile) continue;
          try {
            const consoleTarget = await resolveConsoleTargetDirHandle(destLibRoot, r);
            const groupedItem = await writeMultiDiscSetToConsoleDir(
              r,
              consoleTarget.dirHandle,
              consoleTarget.subPath,
              false
            );
            updatedList[idx] = groupedItem;
            await writeGamelistXmlToHandle(
              consoleTarget.dirHandle,
              updatedList.filter(
                (x) =>
                  x.status === 'verified' &&
                  x.consoleCode === r.consoleCode &&
                  (x.targetDirHandle || x.parentHandle) === consoleTarget.dirHandle
              )
            );
            autoGroupedCount++;
          } catch {}
        }
        nextRoms = updatedList;
      }

      romsRef.current = nextRoms;
      setRoms(nextRoms);
      setLastScanMode(mode);
      setScanRevision((n) => n + 1);
      syncScannedRomsIntoDb(nextRoms, rootHandle.name, mode === 'replace');

      const multiDiscGamesCount = nextRoms.filter((r) => r.isMultiDisc && r.status === 'verified').length;
      const numberedCount = deduplicatedIncoming.filter((r) => r.isNumberedName).length;
      const scanDoneMsg = `✔ ${
        mode === 'append'
          ? tf('app.scan.appendedStatus', {
              name: rootHandle.name,
              added: deduplicatedIncoming.length,
              total: nextRoms.length,
              grouped:
                autoGroupedCount > 0
                  ? tf('app.scan.groupedNote', { count: autoGroupedCount })
                  : '',
              numbered: numberedCount,
            })
          : tf('app.scan.verifiedStatus', {
              verified: nextRoms.filter((r) => r.status === 'verified').length,
              multi:
                multiDiscGamesCount > 0
                  ? tf('app.scan.multiDiscNote', { count: multiDiscGamesCount })
                  : '',
              numbered: numberedCount,
            })
      }`;
      setCurrentActionText(scanDoneMsg);
      addLog(scanDoneMsg);
      await autoEnrichMediaFromBatchScraper(nextRoms, rootHandle.name);
    } catch (err) {
      addLog(tf('app.scan.errLog', { err: String(err) }));
    } finally {
      setIsScanning(false);
      setProgressPct(100);
    }
  };

  const handleFallbackDirectoryInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    const mode = scanModeRef.current;
    stopRequestedRef.current = false;
    setIsScanning(true);
    if (mode === 'replace') {
      setRootDirHandle(null);
    }
    setProgressPct(5);

    const files = Array.from(fileList);
    const firstRel = (files[0] as any).webkitRelativePath || files[0].name;
    const rootName = firstRel.includes('/') ? firstRel.split('/')[0] : t('app.scan.defaultSelectedFolder');
    if (mode === 'replace' || !selectedFolderName) {
      setSelectedFolderName(rootName);
    }
    const fbStartMsg = tf('app.scan.subFilesCount', {
      prefix:
        mode === 'append'
          ? tf('app.scan.subAdding', { name: rootName })
          : tf('app.scan.subScanning', { name: rootName }),
      count: files.length,
    });
    setCurrentActionText(fbStartMsg);
    addLog(fbStartMsg);

    const gamelistByFolder = new Map<string, Map<string, string>>();
    const localImageFilesMap = new Map<string, File>();
    const localVideoFilesMap = new Map<string, File>();

    for (const f of files) {
      const lowerName = f.name.toLowerCase();
      if (lowerName === 'gamelist.xml') {
        const rel = (f as any).webkitRelativePath || f.name;
        const slash = rel.lastIndexOf('/');
        const folderKey = slash !== -1 ? rel.slice(0, slash).toLowerCase() : '';
        try {
          const txt = await f.text();
          gamelistByFolder.set(folderKey, parseGamelistXmlString(txt));
        } catch {}
      } else {
        const dot = lowerName.lastIndexOf('.');
        const ext = dot !== -1 ? lowerName.slice(dot) : '';
        if (['.png', '.jpg', '.jpeg', '.bmp', '.webp', '.mp4', '.webm'].includes(ext)) {
          registerLocalMediaFile(f, localImageFilesMap, localVideoFilesMap);
        }
      }
    }

    const rawDiscovered: DiscoveredScanEntry[] = [];
    const fallbackPatches: Array<{ file: File; relPath: string }> = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const dot = f.name.lastIndexOf('.');
      const ext = dot !== -1 ? f.name.slice(dot).toLowerCase() : '';
      const rel = (f as any).webkitRelativePath || f.name;
      const isPortScript = ext === '.sh' && rel.toLowerCase().includes('port');
      if (isPatchFileName(f.name) && isInPatchFolder(rel)) {
        fallbackPatches.push({ file: f, relPath: rel });
        continue;
      }
      if (!EXT_TO_DEFAULT_CONSOLE[ext] && !isPortScript) continue;
      const lowerRel = rel.toLowerCase();
      if (
        lowerRel.includes('/_duplicates_1g1r/') ||
        lowerRel.includes('/_baddumps_junk/') ||
        lowerRel.includes('/images/') ||
        lowerRel.includes('/download_images/') ||
        lowerRel.includes('/downloaded_images/') ||
        lowerRel.includes('/marquees/') ||
        lowerRel.includes('/banners/') ||
        lowerRel.includes('/videos/')
      ) {
        continue;
      }
      const slash = rel.lastIndexOf('/');
      const folderKey = slash !== -1 ? rel.slice(0, slash).toLowerCase() : '';
      rawDiscovered.push({
        file: f,
        relPath: rel,
        parentHandle: undefined,
        gamelistMap: gamelistByFolder.get(folderKey),
      });
    }

    const pairedDiscovered = await pairDiscCueAndTrackFiles(rawDiscovered);
    const inspected: ScannedRomFile[] = [];
    for (let i = 0; i < pairedDiscovered.length; i++) {
      if (stopRequestedRef.current) {
        addLog(
          tf('app.scan.stoppedAtLog', { i, total: pairedDiscovered.length })
        );
        break;
      }
      const entry = pairedDiscovered[i];
      const item = await inspectFileObject(
        entry.file,
        entry.relPath,
        undefined,
        entry.gamelistMap,
        entry.companionFiles,
        entry.cueText,
        entry.pairedFormatExt
      );
      if (item) {
        inspected.push(attachLocalMediaToRom(item, localImageFilesMap, localVideoFilesMap));
      }
      if (i % 5 === 0 || i === pairedDiscovered.length - 1) {
        setProgressPct(Math.round(((i + 1) / Math.max(1, pairedDiscovered.length)) * 100));
      }
    }

    await linkScannedPatches(inspected, fallbackPatches);

    const deduplicatedIncoming = deduplicateAcrossSubfolders(
      inspected,
      getPriorityArray(priorityPreset)
    );
    const nextRoms =
      mode === 'append' && romsRef.current.length > 0
        ? mergeRomsIncremental(romsRef.current, deduplicatedIncoming)
        : collapseMultiDiscScannedRoms(deduplicatedIncoming, filenameConfigRef.current);

    romsRef.current = nextRoms;
    setRoms(nextRoms);
    setLastScanMode(mode);
    setScanRevision((n) => n + 1);
    syncScannedRomsIntoDb(nextRoms, rootName, mode === 'replace');
    setIsScanning(false);
    setProgressPct(100);
    addLog(
      `✔ ${
        mode === 'append'
          ? tf('app.scan.subAddedDone', {
              name: rootName,
              added: deduplicatedIncoming.length,
              total: nextRoms.length,
            })
          : tf('app.scan.subVerifiedDone', { total: nextRoms.length })
      }`
    );
    await autoEnrichMediaFromBatchScraper(nextRoms, rootName);
    e.target.value = '';
  };

  const handleRenameNumberedRoms = async () => {
    if (roms.length === 0 || isAnyProcessRunning) return;

    stopRequestedRef.current = false;
    setIsRenamingNumbered(true);
    setProgressPct(10);
    const startRenMsg = t('app.rename.numStartStatus');
    setCurrentActionText(startRenMsg);
    addLog(startRenMsg);

    let renamedCount = 0;
    let skippedUnresolvedCount = 0;
    let skipped007Count = 0;
    const updatedRoms = [...roms];
    // Подробно пишем в журнал первые пропуски, остальные — одной строкой (причина есть в карточке игры).
    const SKIP_LOG_LIMIT = 30;
    const markUnresolved = (idx: number, note: string) => {
      skippedUnresolvedCount++;
      updatedRoms[idx] = { ...updatedRoms[idx], titleNote: note };
      if (skippedUnresolvedCount <= SKIP_LOG_LIMIT) {
        addLog(tf('app.rename.skipLog', { file: updatedRoms[idx].fileName, reason: note }));
      }
    };

    // КРИТИЧЕСКИЙ ФИКС v4.3.1: Отслеживаем занятые имена файлов в каждой папке, чтобы НИКОГДА не переименовать 2 файла в одно и то же имя!
    const usedNamesInDir = new Map<string, Set<string>>();
    for (const item of updatedRoms) {
      const dKey = item.sourceSubfolder.toLowerCase();
      const set = usedNamesInDir.get(dKey) || new Set<string>();
      set.add(item.fileName.toLowerCase());
      usedNamesInDir.set(dKey, set);
    }

    try {
      for (let i = 0; i < updatedRoms.length; i++) {
        if (stopRequestedRef.current) {
          addLog(tf('app.rename.numStoppedLog', { i, total: updatedRoms.length }));
          break;
        }

        const r = updatedRoms[i];
        const baseNoExt = r.fileName.replace(/\.[^/.]+$/, '').trim();
        const lowerBaseNoExt = baseNoExt.toLowerCase();

        // Защита от зацикливания для уже переименованных игр про Агента 007
        if (
          isJamesBond007Game(baseNoExt) &&
          baseNoExt.length > 5 &&
          !PURE_NUMBERED_ROM_REGEX.test(baseNoExt)
        ) {
          const m = baseNoExt.match(PREFIXED_SEQ_ROM_REGEX);
          if (!m || m[1] === '7' || baseNoExt.startsWith('007')) {
            skipped007Count++;
            continue;
          }
        }

        const isTarget = r.isNumberedName || Boolean(r.extractedInternalTitle);
        if (!isTarget) continue;

        let realTitle = r.extractedInternalTitle;
        let realSource: TitleSource | undefined = realTitle ? r.titleSource : undefined;
        if (!realTitle && FACTORY_NUMBER_TO_TITLE_MAP[lowerBaseNoExt]) {
          realTitle = FACTORY_NUMBER_TO_TITLE_MAP[lowerBaseNoExt];
          realSource = 'factory';
        }
        let headerTried = false;
        if (!realTitle && (r.companionFiles?.[0] || r.fileObj)) {
          headerTried = true;
          const payload = r.companionFiles?.[0] || r.fileObj!;
          const payloadExt = r.companionFiles?.length ? '.bin' : r.extension;
          realTitle = await extractInternalBinaryRomTitle(payload, payloadExt, r.consoleCode);
          if (realTitle) realSource = 'header';
        }
        if (!realTitle) {
          const stripped = stripLeadingIndexExcept007(baseNoExt).trim();
          const strippedNoTags = stripped.replace(/\[.*?\]|\(.*?\)/g, '').trim();
          const letters = (strippedNoTags.match(/[a-zA-Zа-яА-ЯёЁ]/g) || []).length;
          if (letters >= 2 && stripped.toLowerCase() !== lowerBaseNoExt) {
            realTitle = stripped;
            realSource = 'index-strip';
          }
        }

        // Если для файла не найдено настоящее буквенное название игры — ПРОПУСКАЕМ его, НИКОГДА не переименовывая в пустое имя без номера!
        if (!realTitle) {
          markUnresolved(
            i,
            headerTried
              ? t('title.note.numberedNotFound')
              : t('title.note.noFileAccess')
          );
          continue;
        }
        if (
          PURE_NUMBERED_ROM_REGEX.test(realTitle) ||
          realTitle.toLowerCase().includes('notgame') ||
          realTitle.toLowerCase().includes('pas un jeu')
        ) {
          markUnresolved(i, tf('title.note.badTitle', { title: realTitle }));
          continue;
        }

        const cleanReal = extractCleanTitle(realTitle);
        const letterCheck = (cleanReal.match(/[a-zA-Zа-яА-ЯёЁ]/g) || []).length;
        if (letterCheck < 2 || PURE_NUMBERED_ROM_REGEX.test(cleanReal)) {
          markUnresolved(i, tf('title.note.badTitle', { title: realTitle }));
          continue;
        }

        const metaForRom = inferGenreAndYear(cleanReal, r.consoleCode);
        let safeBase = formatRomStemByConfig(
          {
            cleanTitle: cleanReal,
            consoleCode: r.consoleCode,
            bitness: CONSOLE_CATALOG[r.consoleCode]?.generationShort,
            region: r.region,
            isRussian: r.isRussian,
            year: metaForRom.releaseYear,
            modTag: modTag(r.mod),
          },
          filenameConfig
        );

        const dKey = r.sourceSubfolder.toLowerCase();
        const dirSet = usedNamesInDir.get(dKey) || new Set<string>();
        const outExt = normalizeDiskOutputExt(r.extension);
        let newFileName = `${safeBase}${outExt}`;

        if (newFileName.toLowerCase() === r.fileName.toLowerCase()) continue;

        // Если такое имя уже занято другим файлом (например, два диска или два региона одной игры), добавляем [000593], чтобы не было конфликта!
        if (dirSet.has(newFileName.toLowerCase())) {
          safeBase = `${safeBase} [${baseNoExt}]`;
          newFileName = `${safeBase}${outExt}`;
        }
        dirSet.delete(r.fileName.toLowerCase());
        dirSet.add(newFileName.toLowerCase());
        usedNamesInDir.set(dKey, dirSet);

        const oldBaseNoExt = r.fileName.replace(/\.[^/.]+$/, '');

        if (rootDirHandle && r.parentHandle && r.fileObj) {
          try {
            const rawBuf = await r.fileObj.arrayBuffer();
            const newFh = await r.parentHandle.getFileHandle(newFileName, { create: true });
            const writable = await newFh.createWritable();
            await writable.write(rawBuf);
            await writable.close();
            await r.parentHandle.removeEntry(r.fileName);

            // Переименовываем также файл сохранения .srm рядом с ромом, если он есть
            try {
              const oldSrmHandle = await r.parentHandle.getFileHandle(`${oldBaseNoExt}.srm`);
              const srmFile = await oldSrmHandle.getFile();
              const srmBuf = await srmFile.arrayBuffer();
              const newSrmHandle = await r.parentHandle.getFileHandle(`${safeBase}.srm`, {
                create: true,
              });
              const sw = await newSrmHandle.createWritable();
              await sw.write(srmBuf);
              await sw.close();
              await r.parentHandle.removeEntry(`${oldBaseNoExt}.srm`);
            } catch {}

            // В заводском XML R36S обложки, -marquee.png и -thumb.png лежат внутри папки images/!
            const mediaPairs: Array<{ folder: string; suffixes: string[] }> = [
              {
                folder: 'images',
                suffixes: [
                  '.png',
                  '-image.png',
                  '-thumb.png',
                  '-marquee.png',
                  '.bmp',
                  '.jpg',
                  '-image.jpg',
                ],
              },
              { folder: 'marquees', suffixes: ['-marquee.png', '.png'] },
              { folder: 'videos', suffixes: ['-video.mp4', '.mp4'] },
            ];

            for (const mp of mediaPairs) {
              try {
                const mDir = await r.parentHandle.getDirectoryHandle(mp.folder);
                for (const sfx of mp.suffixes) {
                  try {
                    const oldMediaHandle = await mDir.getFileHandle(`${oldBaseNoExt}${sfx}`);
                    const mFile = await oldMediaHandle.getFile();
                    const mBuf = await mFile.arrayBuffer();
                    const newMediaHandle = await mDir.getFileHandle(`${safeBase}${sfx}`, {
                      create: true,
                    });
                    const mw = await newMediaHandle.createWritable();
                    await mw.write(mBuf);
                    await mw.close();
                    await mDir.removeEntry(`${oldBaseNoExt}${sfx}`);
                  } catch {}
                }
              } catch {}
            }
          } catch {}
        }

        updatedRoms[i] = {
          ...r,
          fileName: newFileName,
          cleanTitle: cleanReal,
          extractedInternalTitle: realTitle,
          isNumberedName: false,
          comparisonKey: buildComparisonKey(cleanReal),
          canonicalName: newFileName,
          mediaStatus: tf('app.rename.itemStatus', { name: safeBase }),
          titleSource: realSource || r.titleSource,
          titleNote: '',
        };
        renamedCount++;
        addLog(`${t('app.rename.logPrefix')} ${r.fileName} -> ${newFileName}`);
        setProgressPct(Math.round(((i + 1) / updatedRoms.length) * 100));
      }

      const reDeduplicated = deduplicateAcrossSubfolders(
        updatedRoms,
        getPriorityArray(priorityPreset)
      );
      setRoms(reDeduplicated);

      if (rootDirHandle && renamedCount > 0 && !stopRequestedRef.current) {
        const byConsoleHandle = new Map<any, ScannedRomFile[]>();
        for (const r of reDeduplicated) {
          if (r.status !== 'verified') continue;
          const h = r.targetDirHandle || r.parentHandle;
          if (!h) continue;
          const arr = byConsoleHandle.get(h) || [];
          arr.push(r);
          byConsoleHandle.set(h, arr);
        }
        for (const [cHandle, cRoms] of byConsoleHandle.entries()) {
          await writeGamelistXmlToHandle(cHandle, cRoms);
        }
      }

      if (skippedUnresolvedCount > SKIP_LOG_LIMIT) {
        addLog(tf('app.rename.skipMore', { count: skippedUnresolvedCount - SKIP_LOG_LIMIT }));
      }
      addLog(
        tf('app.rename.numDoneMsg', {
          renamed: renamedCount,
          skipped: skippedUnresolvedCount,
          kept007: skipped007Count,
        })
      );
    } catch (err) {
      addLog(tf('app.rename.numErrLog', { err: String(err) }));
    } finally {
      setIsRenamingNumbered(false);
      setProgressPct(100);
    }
  };

  // Применение выбранных галочками сопоставлений из единого окна переименования (XML + Заголовки)
  const handleApplyXmlMappings = async (
    selectedMappings: SelectableXmlMapping[],
    sourceXmlLabel: string
  ) => {
    if (selectedMappings.length === 0 || isApplyingXml) return;

    stopRequestedRef.current = false;
    setIsApplyingXml(true);
    setProgressPct(5);
    const startXmlMsg = tf('app.rename.xmlStartMsg', {
      source: sourceXmlLabel,
      count: selectedMappings.length,
    });
    setCurrentActionText(startXmlMsg);
    addLog(startXmlMsg);

    const mapByLowerFile = new Map<string, SelectableXmlMapping>();
    const mapByCoreKey = new Map<string, SelectableXmlMapping>();
    for (const m of selectedMappings) {
      mapByLowerFile.set(m.actualDiskFileName.toLowerCase(), m);
      mapByLowerFile.set(m.fileName.toLowerCase(), m);
      mapByLowerFile.set(m.stem.toLowerCase(), m);
      if (m.coreNumberKey) {
        mapByCoreKey.set(m.coreNumberKey, m);
      }
    }

    let renamedInFolder = 0;

    try {
      if (rootDirHandle) {
        for (let i = 0; i < selectedMappings.length; i++) {
          if (stopRequestedRef.current) {
            addLog(
              tf('app.rename.xmlStoppedLog', { i, total: selectedMappings.length })
            );
            break;
          }
          const m = selectedMappings[i];
          setCurrentActionText(
            tf('app.rename.xmlProg', {
              i: i + 1,
              total: selectedMappings.length,
              src: m.actualDiskFileName,
              dst: m.proposedFileName,
            })
          );
          if (i % 10 === 0) {
            setProgressPct(Math.round(((i + 1) / selectedMappings.length) * 90));
          }

          // Try finding the file under actualDiskFileName (e.g. "000001 (World).chd"), or "000001.chd"
          const candidateNames = Array.from(
            new Set([
              m.actualDiskFileName,
              m.fileName,
              `${m.coreNumberKey} (World)${m.ext || '.chd'}`,
              `${m.stem} (World)${m.ext || '.chd'}`,
            ])
          );

          let foundDiskName = '';
          let oldRomHandle: any = null;
          for (const cand of candidateNames) {
            try {
              oldRomHandle = await rootDirHandle.getFileHandle(cand);
              foundDiskName = cand;
              break;
            } catch {}
          }

          if (!oldRomHandle || !foundDiskName) continue;

          try {
            const sameName = foundDiskName.toLowerCase() === m.proposedFileName.toLowerCase();
            if (!sameName) {
              if (typeof oldRomHandle.move === 'function') {
                await oldRomHandle.move(rootDirHandle, m.proposedFileName);
              } else {
                const romFile = await oldRomHandle.getFile();
                const newRomHandle = await rootDirHandle.getFileHandle(m.proposedFileName, {
                  create: true,
                });
                const rw = await newRomHandle.createWritable();
                await romFile.stream().pipeTo(rw);
                await rootDirHandle.removeEntry(foundDiskName);
              }
            }
            renamedInFolder++;

            const mediaCandidateStems = Array.from(
              new Set([
                m.stem,
                m.coreNumberKey,
                foundDiskName.replace(/\.[^/.]+$/, ''),
              ].filter(Boolean))
            );

            try {
              const imgDir = await rootDirHandle.getDirectoryHandle('images');
              for (const oldSt of mediaCandidateStems) {
                for (const sfx of ['.png', '-image.png', '-marquee.png', '-thumb.png', '.bmp', '.jpg']) {
                  try {
                    const oldImg = await imgDir.getFileHandle(`${oldSt}${sfx}`);
                    const imgF = await oldImg.getFile();
                    const imgBuf = await imgF.arrayBuffer();
                    const newImg = await imgDir.getFileHandle(`${m.proposedBaseName}${sfx}`, {
                      create: true,
                    });
                    const iw = await newImg.createWritable();
                    await iw.write(imgBuf);
                    await iw.close();
                    if (`${oldSt}${sfx}`.toLowerCase() !== `${m.proposedBaseName}${sfx}`.toLowerCase()) {
                      await imgDir.removeEntry(`${oldSt}${sfx}`);
                    }
                  } catch {}
                }
              }
            } catch {}

            try {
              const vidDir = await rootDirHandle.getDirectoryHandle('videos');
              for (const oldSt of mediaCandidateStems) {
                for (const sfx of ['-video.mp4', '.mp4']) {
                  try {
                    const oldVid = await vidDir.getFileHandle(`${oldSt}${sfx}`);
                    const vidF = await oldVid.getFile();
                    const vidBuf = await vidF.arrayBuffer();
                    const newVid = await vidDir.getFileHandle(`${m.proposedBaseName}${sfx}`, {
                      create: true,
                    });
                    const vw = await newVid.createWritable();
                    await vw.write(vidBuf);
                    await vw.close();
                    if (`${oldSt}${sfx}`.toLowerCase() !== `${m.proposedBaseName}${sfx}`.toLowerCase()) {
                      await vidDir.removeEntry(`${oldSt}${sfx}`);
                    }
                  } catch {}
                }
              }
            } catch {}
          } catch {}
        }
      }

      if (romsRef.current.length > 0) {
        const nextRoms = romsRef.current.map((r) => {
          const baseLower = r.fileName.replace(/\.[^/.]+$/, '').toLowerCase();
          const coreKey = extractCoreNumberKey(r.fileName);
          const matched =
            mapByLowerFile.get(r.fileName.toLowerCase()) ||
            mapByLowerFile.get(baseLower) ||
            (coreKey ? mapByCoreKey.get(coreKey) : undefined);
          if (!matched) return r;
          const newNameWithCurrentExt = `${matched.proposedBaseName}${r.extension}`;
          return {
            ...r,
            fileName: newNameWithCurrentExt,
            cleanTitle: matched.proposedBaseName,
            extractedInternalTitle: matched.name,
            isNumberedName: false,
            comparisonKey: buildComparisonKey(matched.proposedBaseName),
            canonicalName: newNameWithCurrentExt,
            mediaStatus: tf('app.rename.itemStatus', { name: matched.proposedBaseName }),
          };
        });
        romsRef.current = nextRoms;
        setRoms(nextRoms);
        setLastScanMode('replace');
        setScanRevision((n) => n + 1);
        syncScannedRomsIntoDb(nextRoms, selectedFolderName || dbState.masterLibraryPath, true);
      }

      addLog(
        tf('app.rename.xmlDoneMsg', {
          renamed: renamedInFolder,
          total: selectedMappings.length,
        })
      );
      setXmlModalOpen(false);
    } catch (err) {
      addLog(tf('app.rename.xmlErrLog', { err: String(err) }));
    } finally {
      setIsApplyingXml(false);
      setProgressPct(100);
    }
  };

  // Генерация готового .CMD скрипта для Windows (поддерживает и 000001.chd, и 000001 (World).chd)
  const handleExportBatForXmlMappings = (selectedMappings: SelectableXmlMapping[]) => {
    if (selectedMappings.length === 0) return;

    const lines: string[] = [
      '@echo off',
      'chcp 65001 >nul',
      'echo ============================================================================',
      `echo  ${tf('app.rename.xmlCmdHdrTitle', { count: selectedMappings.length })}`,
      `echo  ${t('app.rename.xmlCmdHdrSub')}`,
      'echo ============================================================================',
      'echo.',
      'if not exist "gamelist_factory_backup.xml" if exist "gamelist.xml" copy /y "gamelist.xml" "gamelist_factory_backup.xml" >nul',
      '',
    ];

    const xmlLines: string[] = ['<?xml version="1.0" encoding="utf-8"?>', '<gameList>'];

    for (const m of selectedMappings) {
      const oldStem = m.coreNumberKey || m.stem;
      const newStem = m.proposedBaseName;
      const ext = m.ext || '.chd';

      lines.push(`if exist "${m.actualDiskFileName}" (`);
      lines.push(`  echo [${t('app.rename.xmlCmdTag')}] "${m.actualDiskFileName}" -^> "${m.proposedFileName}"`);
      lines.push(`  ren "${m.actualDiskFileName}" "${m.proposedFileName}"`);
      lines.push(`)`);
      if (m.actualDiskFileName.toLowerCase() !== `${oldStem}${ext}`.toLowerCase()) {
        lines.push(`if exist "${oldStem}${ext}" ren "${oldStem}${ext}" "${m.proposedFileName}"`);
      }
      if (m.actualDiskFileName.toLowerCase() !== `${oldStem} (World)${ext}`.toLowerCase()) {
        lines.push(
          `if exist "${oldStem} (World)${ext}" ren "${oldStem} (World)${ext}" "${m.proposedFileName}"`
        );
      }

      lines.push(`if exist "${oldStem}.srm" ren "${oldStem}.srm" "${newStem}.srm"`);
      lines.push(`if exist "images\\${oldStem}.png" ren "images\\${oldStem}.png" "${newStem}.png"`);
      lines.push(`if exist "images\\${oldStem}.bmp" ren "images\\${oldStem}.bmp" "${newStem}.bmp"`);
      lines.push(
        `if exist "images\\${oldStem}-image.png" ren "images\\${oldStem}-image.png" "${newStem}-image.png"`
      );
      lines.push(
        `if exist "images\\${oldStem}-marquee.png" ren "images\\${oldStem}-marquee.png" "${newStem}-marquee.png"`
      );
      lines.push(
        `if exist "images\\${oldStem}-thumb.png" ren "images\\${oldStem}-thumb.png" "${newStem}-thumb.png"`
      );
      lines.push(
        `if exist "videos\\${oldStem}-video.mp4" ren "videos\\${oldStem}-video.mp4" "${newStem}-video.mp4"`
      );

      const imgExt = m.image.toLowerCase().endsWith('.bmp') ? '.bmp' : '.png';
      xmlLines.push('\t<game>');
      xmlLines.push(`\t\t<path>./${escapeXml(m.proposedFileName)}</path>`);
      xmlLines.push(`\t\t<name>${escapeXml(m.name)}</name>`);
      if (m.genre) xmlLines.push(`\t\t<genre>${escapeXml(m.genre)}</genre>`);
      if (m.image) xmlLines.push(`\t\t<image>./images/${escapeXml(newStem)}${imgExt}</image>`);
      if (m.video) xmlLines.push(`\t\t<video>./videos/${escapeXml(newStem)}-video.mp4</video>`);
      if (m.marquee)
        xmlLines.push(`\t\t<marquee>./images/${escapeXml(newStem)}-marquee.png</marquee>`);
      if (m.thumbnail)
        xmlLines.push(`\t\t<thumbnail>./images/${escapeXml(newStem)}-thumb.png</thumbnail>`);
      xmlLines.push('\t</game>');
    }

    xmlLines.push('</gameList>');

    const xmlBlob = new Blob([xmlLines.join('\n')], { type: 'application/xml;charset=utf-8' });
    const xmlUrl = URL.createObjectURL(xmlBlob);
    const xmlA = document.createElement('a');
    xmlA.href = xmlUrl;
    xmlA.download = 'gamelist_renamed_v0.5.xml';
    document.body.appendChild(xmlA);
    xmlA.click();
    xmlA.remove();
    setTimeout(() => URL.revokeObjectURL(xmlUrl), 3000);

    lines.push(
      'if exist "gamelist_renamed_v0.5.xml" copy /y "gamelist_renamed_v0.5.xml" "gamelist.xml" >nul'
    );
    lines.push('echo.');
    lines.push(
      `echo ${tf('app.rename.xmlCmdFooterDone', { count: selectedMappings.length })}`
    );
    lines.push('pause');

    const batBlob = new Blob([lines.join('\r\n')], { type: 'text/plain;charset=utf-8' });
    const batUrl = URL.createObjectURL(batBlob);
    const batA = document.createElement('a');
    batA.href = batUrl;
    batA.download = 'Rename_PSX_From_XML_v0.5.cmd';
    document.body.appendChild(batA);
    batA.click();
    batA.remove();
    setTimeout(() => URL.revokeObjectURL(batUrl), 3000);

    addLog(
      tf('app.rename.xmlCmdDownloaded', { count: selectedMappings.length })
    );
  };

  const handleRepairR36SSDCard = async (
    firmwareOverride?:
      | 'r36s_arkos'
      | 'anbernic_muos'
      | 'anbernic_knulli'
      | 'rocknix'
      | 'miyoo_onion'
      | 'trimui_crossmix'
  ) => {
    const fw = firmwareOverride || sdFirmwareId;
    if (isRepairingSd || isScanning || isOrganizing) return;
    setIsRepairingSd(true);
    setProgressPct(15);

    const fwProfiles: Record<
      string,
      { label: string; romsPrefix: string; dirs: string[]; mediaDirs: string[] }
    > = {
      r36s_arkos: {
        label: 'R36S / Powkiddy (ArkOS / DarkOS — EASYROMS)',
        romsPrefix: '',
        dirs: [
          'bios',
          'tools',
          'themes',
          'ports',
          'launchimages',
          'bgmusic',
          'backup',
          'saves',
          'savestates',
          'nes',
          'snes',
          'gb',
          'gbc',
          'gba',
          'nds',
          'n64',
          'megadrive',
          'mastersystem',
          'gamegear',
          'pcengine',
          'psx',
          'psp',
          'arcade',
        ],
        mediaDirs: ['images', 'marquees', 'videos'],
      },
      anbernic_muos: {
        label: 'Anbernic XX / H700 (muOS — SD2:/ROMS)',
        romsPrefix: '',
        dirs: [
          'MUOS/bios',
          'MUOS/save',
          'MUOS/info/catalogue',
          'ports',
          'nes',
          'snes',
          'gb',
          'gbc',
          'gba',
          'nds',
          'megadrive',
          'psx',
          'psp',
          'arcade',
        ],
        mediaDirs: ['images', 'videos'],
      },
      anbernic_knulli: {
        label: 'Anbernic / TrimUI (KNULLI / Batocera — roms/)',
        romsPrefix: 'roms',
        dirs: [
          'bios',
          'saves',
          'themes',
          'roms/nes',
          'roms/snes',
          'roms/gb',
          'roms/gbc',
          'roms/gba',
          'roms/nds',
          'roms/n64',
          'roms/megadrive',
          'roms/psx',
          'roms/psp',
          'roms/ports',
          'roms/fbneo',
        ],
        mediaDirs: ['images', 'videos', 'marquees'],
      },
      rocknix: {
        label: 'ROCKNIX / JELOS (Powkiddy / Anbernic / Odin)',
        romsPrefix: 'roms',
        dirs: [
          'roms/bios',
          'roms/ports',
          'roms/nes',
          'roms/snes',
          'roms/gba',
          'roms/nds',
          'roms/n64',
          'roms/megadrive',
          'roms/psx',
          'roms/psp',
          'roms/arcade',
        ],
        mediaDirs: ['images', 'videos', 'marquees'],
      },
      miyoo_onion: {
        label: 'Miyoo Mini / Plus (OnionOS — Roms/ + Imgs/)',
        romsPrefix: 'Roms',
        dirs: [
          'BIOS',
          'Saves',
          'Roms/FC',
          'Roms/SFC',
          'Roms/GB',
          'Roms/GBC',
          'Roms/GBA',
          'Roms/MD',
          'Roms/PS',
          'Roms/ARCADE',
          'Roms/PORTS',
        ],
        mediaDirs: ['Imgs'],
      },
      trimui_crossmix: {
        label: 'TrimUI Smart Pro / Brick (CrossMix OS)',
        romsPrefix: 'Roms',
        dirs: [
          'BIOS',
          'Imgs',
          'Roms/FC',
          'Roms/SFC',
          'Roms/GB',
          'Roms/GBC',
          'Roms/GBA',
          'Roms/MD',
          'Roms/PS',
          'Roms/PSP',
          'Roms/N64',
          'Roms/NDS',
          'Roms/PORTS',
        ],
        mediaDirs: ['Imgs'],
      },
    };

    const profile = fwProfiles[fw] || fwProfiles.r36s_arkos;
    setCurrentActionText(tf('app.sd.repairStartStatus', { label: profile.label }));
    addLog(tf('app.sd.repairStartLog', { label: profile.label }));

    let restoredRoms = 0;
    let recreatedDirs = 0;
    let cleanedWinJunk = 0;
    const activeSdHandle = sdTargetDirHandle || rootDirHandle;

    const ensureNestedDir = async (base: any, relPath: string) => {
      let cur = base;
      for (const seg of relPath.split('/').filter(Boolean)) {
        cur = await cur.getDirectoryHandle(seg, { create: true });
      }
      return cur;
    };

    try {
      if (activeSdHandle) {
        const rootLower = activeSdHandle.name.toLowerCase();
        const isSingleConsoleRoot = Boolean(CONSOLE_CATALOG[rootLower]);

        if (!isSingleConsoleRoot) {
          for (const dName of profile.dirs) {
            try {
              const dh = await ensureNestedDir(activeSdHandle, dName);
              recreatedDirs++;
              const leaf = dName.split('/').pop()?.toLowerCase() || '';
              if (
                CONSOLE_CATALOG[leaf] ||
                ['megadrive', 'ps', 'fc', 'sfc', 'md', 'fbneo'].includes(leaf)
              ) {
                for (const mDir of profile.mediaDirs) {
                  await dh.getDirectoryHandle(mDir, { create: true });
                }
              }
            } catch {}
          }
        } else {
          for (const mDir of profile.mediaDirs) {
            await activeSdHandle.getDirectoryHandle(mDir, { create: true });
            recreatedDirs++;
          }
        }

        const wrapperPrefixes = [
          'organized',
          '1_8bit',
          '2_16bit',
          '3_portable',
          '4_32_64bit',
          '_duplicates_1g1r',
        ];

        async function rescueFromWrapperDir(dirHandle: any, relPrefix: string) {
          for await (const entry of dirHandle.values()) {
            const rel = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
            if (entry.kind === 'directory') {
              await rescueFromWrapperDir(entry, rel);
            } else if (entry.kind === 'file') {
              const dot = entry.name.lastIndexOf('.');
              const ext = dot !== -1 ? entry.name.slice(dot).toLowerCase() : '';
              if (EXT_TO_DEFAULT_CONSOLE[ext]) {
                try {
                  const consoleCode = detectConsoleFromPathAndExt(rel, ext);
                  const destRel = profile.romsPrefix ? `${profile.romsPrefix}/${consoleCode}` : consoleCode;
                  const destConsoleHandle = isSingleConsoleRoot
                    ? activeSdHandle
                    : await ensureNestedDir(activeSdHandle, destRel);
                  if (typeof entry.move === 'function') {
                    await entry.move(destConsoleHandle, entry.name);
                  } else {
                    const f = await entry.getFile();
                    const newFh = await destConsoleHandle.getFileHandle(entry.name, { create: true });
                    const w = await newFh.createWritable();
                    if (typeof f.stream === 'function' && typeof w.getWriter !== 'function') {
                      await f.stream().pipeTo(w);
                    } else {
                      await w.write(await f.arrayBuffer());
                      await w.close();
                    }
                    await dirHandle.removeEntry(entry.name);
                  }
                  restoredRoms++;
                } catch {}
              }
            }
          }
        }

        for await (const entry of activeSdHandle.values()) {
          const lower = entry.name.toLowerCase();
          if (entry.kind === 'directory') {
            if (wrapperPrefixes.some((p) => lower.startsWith(p))) {
              await rescueFromWrapperDir(entry, entry.name);
              try {
                await activeSdHandle.removeEntry(entry.name, { recursive: true });
              } catch {}
            } else if (lower === 'system volume information' || lower === '$recycle.bin') {
              try {
                await activeSdHandle.removeEntry(entry.name, { recursive: true });
                cleanedWinJunk++;
              } catch {}
            }
          } else if (entry.kind === 'file') {
            if (['thumbs.db', 'desktop.ini', 'indexervolumeguid', '._.ds_store', '.ds_store'].includes(lower)) {
              try {
                await activeSdHandle.removeEntry(entry.name);
                cleanedWinJunk++;
              } catch {}
            }
          }
        }
      }

      // Generate portable exFAT/FAT32 Dirty-Bit + directory repair helper for the selected handheld OS
      const batLines = [
        '@echo off',
        'chcp 65001 >nul',
        'echo ============================================================================',
        `echo  ${tf('app.sd.cmdTitle', { label: profile.label })}`,
        'echo ============================================================================',
        `set /p DRIVE="${t('app.sd.cmdPromptDrive')}"`,
        'set DRIVE=%DRIVE:~0,1%',
        `echo ${t('app.sd.cmdStep1')}`,
        'chkdsk %DRIVE%: /f',
        `echo ${t('app.sd.cmdStep2')}`,
        ...profile.dirs.map((d) => `if not exist "%DRIVE%:\\${d.replace(/\//g, '\\')}" mkdir "%DRIVE%:\\${d.replace(/\//g, '\\')}"`),
        `echo ${t('app.sd.cmdStep3')}`,
        'del /s /q /f "%DRIVE%:\\Thumbs.db" "%DRIVE%:\\desktop.ini" 2>nul',
        `echo ${t('app.sd.cmdDone')}`,
        'pause',
      ];

      const blob = new Blob([batLines.join('\r\n')], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Repair_SD_${fw}.cmd`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2500);

      const doneMsg = tf('app.sd.repairDoneMsg', {
        label: profile.label,
        dirs: recreatedDirs,
        roms: restoredRoms,
        junk: cleanedWinJunk,
      });
      setCurrentActionText(doneMsg);
      addLog(doneMsg);

      if (activeSdHandle) {
        await scanDirectoryHandleRecursively(activeSdHandle, 'replace');
      }
    } catch (err) {
      addLog(tf('app.sd.repairErrLog', { label: profile.label, err: String(err) }));
    } finally {
      setIsRepairingSd(false);
      setProgressPct(100);
    }
  };

  const handleScanPhantomFolders = async () => {
    if (isScanningPhantoms || isDeletingPhantoms) return;

    if (!rootDirHandle) {
      const demoPhantoms: PhantomFolderCandidate[] = [
        {
          id: 'phantom_1',
          relPath: 'psx/download_images',
          folderName: 'download_images',
          parentConsole: 'psx',
          categoryReason: t(PHANTOM_MEDIA_DIR_KEYS['download_images']),
          fileCount: 142,
          totalSizeBytes: 38 * 1024 * 1024,
          checked: true,
        },
        {
          id: 'phantom_2',
          relPath: 'gba/download_images',
          folderName: 'download_images',
          parentConsole: 'gba',
          categoryReason: t(PHANTOM_MEDIA_DIR_KEYS['download_images']),
          fileCount: 95,
          totalSizeBytes: 21 * 1024 * 1024,
          checked: true,
        },
        {
          id: 'phantom_3',
          relPath: 'snes/downloaded_images',
          folderName: 'downloaded_images',
          parentConsole: 'snes',
          categoryReason: t(PHANTOM_MEDIA_DIR_KEYS['downloaded_images']),
          fileCount: 64,
          totalSizeBytes: 14 * 1024 * 1024,
          checked: true,
        },
      ];
      setPhantomFolders(demoPhantoms);
      setPhantomModalOpen(true);
      addLog(t('app.phan.modalOpenedLog'));
      return;
    }

    setIsScanningPhantoms(true);
    addLog(t('app.phan.scanStartStatus'));

    const found: PhantomFolderCandidate[] = [];

    async function walkPhantomDirs(dirHandle: any, relPrefix: string) {
      for await (const entry of dirHandle.values()) {
        if (entry.kind !== 'directory' || entry.name.startsWith('.')) continue;
        const lower = entry.name.toLowerCase();
        if (lower === '_duplicates_1g1r' || lower === '_baddumps_junk') continue;

        const rel = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;

        if (OFFICIAL_R36S_MEDIA_DIRS.has(lower)) continue;

        if (PHANTOM_MEDIA_DIR_KEYS[lower]) {
          let fCount = 0;
          let totalBytes = 0;
          for await (const sub of entry.values()) {
            if (sub.kind === 'file') {
              fCount++;
              try {
                const f = await sub.getFile();
                totalBytes += f.size;
              } catch {}
            }
          }
          found.push({
            id: rel,
            relPath: rel,
            folderName: entry.name,
            parentConsole: relPrefix || rootDirHandle.name,
            categoryReason: t(PHANTOM_MEDIA_DIR_KEYS[lower]),
            fileCount: fCount,
            totalSizeBytes: totalBytes,
            checked: true,
            parentDirHandle: dirHandle,
          });
          continue;
        }

        // Никогда не предлагаем удалить системные и консольные папки R36S (даже если они пустые!)
        if (PROTECTED_R36S_DIRS.has(lower)) {
          await walkPhantomDirs(entry, rel);
          continue;
        }

        let hasRoms = false;
        let fCount = 0;
        let totalBytes = 0;
        for await (const sub of entry.values()) {
          if (sub.kind === 'file') {
            fCount++;
            const dot = sub.name.lastIndexOf('.');
            const ext = dot !== -1 ? sub.name.slice(dot).toLowerCase() : '';
            if (EXT_TO_DEFAULT_CONSOLE[ext]) {
              hasRoms = true;
            }
            try {
              const f = await sub.getFile();
              totalBytes += f.size;
            } catch {}
          }
        }

        if (!hasRoms && fCount === 0) {
          found.push({
            id: rel,
            relPath: rel,
            folderName: entry.name,
            parentConsole: relPrefix || rootDirHandle.name,
            categoryReason: t('app.phan.emptyReason'),
            fileCount: 0,
            totalSizeBytes: 0,
            checked: true,
            parentDirHandle: dirHandle,
          });
        } else {
          await walkPhantomDirs(entry, rel);
        }
      }
    }

    try {
      await walkPhantomDirs(rootDirHandle, '');
      setPhantomFolders(found);
      setPhantomModalOpen(true);
      addLog(tf('app.phan.scanDoneMsg', { count: found.length }));
    } catch (err) {
      addLog(tf('app.phan.scanErrLog', { err: String(err) }));
    } finally {
      setIsScanningPhantoms(false);
    }
  };

  const handleTogglePhantomCheck = (id: string) => {
    setPhantomFolders((prev) =>
      prev.map((p) => (p.id === id ? { ...p, checked: !p.checked } : p))
    );
  };

  const handleSelectAllPhantoms = (selectAll: boolean) => {
    setPhantomFolders((prev) => prev.map((p) => ({ ...p, checked: selectAll })));
  };

  const handleDeleteSelectedPhantoms = async () => {
    const selected = phantomFolders.filter((p) => p.checked);
    if (selected.length === 0 || isDeletingPhantoms) return;

    setIsDeletingPhantoms(true);
    setCurrentActionText(tf('app.phan.delStartStatus', { count: selected.length }));
    let rescuedImages = 0;
    let deletedDirs = 0;

    try {
      for (const item of selected) {
        if (!item.parentDirHandle) {
          deletedDirs++;
          continue;
        }
        try {
          const phantomHandle = await item.parentDirHandle.getDirectoryHandle(item.folderName);
          const validImagesHandle = await item.parentDirHandle.getDirectoryHandle('images', {
            create: true,
          });

          for await (const entry of phantomHandle.values()) {
            if (entry.kind !== 'file') continue;
            const dot = entry.name.lastIndexOf('.');
            const ext = dot !== -1 ? entry.name.slice(dot).toLowerCase() : '';
            if (['.png', '.jpg', '.jpeg'].includes(ext)) {
              let existsInValid = false;
              try {
                await validImagesHandle.getFileHandle(entry.name);
                existsInValid = true;
              } catch {}
              if (!existsInValid) {
                const f = await entry.getFile();
                const buf = await f.arrayBuffer();
                const newFh = await validImagesHandle.getFileHandle(entry.name, { create: true });
                const w = await newFh.createWritable();
                await w.write(buf);
                await w.close();
                rescuedImages++;
              }
            }
          }

          await item.parentDirHandle.removeEntry(item.folderName, { recursive: true });
          deletedDirs++;
          addLog(tf('app.phan.removedDirLog', { path: item.relPath }));
        } catch {}
      }

      setPhantomFolders((prev) => prev.filter((p) => !p.checked));
      addLog(
        tf('app.phan.delDoneMsg', {
          dirs: deletedDirs,
          rescued: rescuedImages,
        })
      );
      if (phantomFolders.filter((p) => !p.checked).length === 0) {
        setPhantomModalOpen(false);
      }
    } catch (err) {
      addLog(tf('app.phan.delErrLog', { err: String(err) }));
    } finally {
      setIsDeletingPhantoms(false);
    }
  };

  const computeCanonicalNameForRom = (
    r: ScannedRomFile,
    cfg: FilenameConstructorConfig = filenameConfigRef.current
  ): string => {
    const meta = CONSOLE_CATALOG[r.consoleCode] || CONSOLE_CATALOG.psx;
    const baseTitle = r.cleanTitle || extractCleanTitle(r.fileName);
    const hasAlpha =
      !PURE_NUMBERED_ROM_REGEX.test(baseTitle) &&
      (baseTitle.match(/[a-zA-Zа-яА-ЯёЁ]/g) || []).length >= 2;
    if (!hasAlpha) return r.fileName;

    const { releaseYear } = inferGenreAndYear(baseTitle, r.consoleCode);
    let outExt = normalizeDiskOutputExt(r.extension);
    if (outExt === '.smc') outExt = '.sfc';
    if (outExt === '.gen' || outExt === '.smd') outExt = '.md';

    return formatRomFilenameByConfig(
      {
        cleanTitle: baseTitle,
        year: releaseYear || 1998,
        region: r.region,
        isRussian: r.isRussian,
        bitness: meta.generationShort,
        consoleCode: r.consoleCode,
        extension: outExt,
        revision: r.revision,
        modTag: modTag(r.mod),
      },
      cfg
    );
  };

  const updateRomWithFilenameConfig = (
    r: ScannedRomFile,
    cfg: FilenameConstructorConfig
  ): ScannedRomFile => {
    if (r.isMultiDisc && Array.isArray(r.discs) && r.discs.length > 1) {
      const meta = CONSOLE_CATALOG[r.consoleCode] || CONSOLE_CATALOG.psx;
      const { releaseYear } = inferGenreAndYear(r.cleanTitle, r.consoleCode);
      const baseStem = formatRomStemByConfig(
        {
          cleanTitle: r.cleanTitle,
          year: releaseYear || 1998,
          region: r.region,
          isRussian: r.isRussian,
          bitness: meta.generationShort,
          consoleCode: r.consoleCode,
          revision: r.revision,
          modTag: modTag(r.mod),
        },
        cfg
      );
      const folderName =
        baseStem && baseStem.length >= 2
          ? baseStem
          : buildMultiDiscFolderName(
              r.cleanTitle,
              normalizeRegionTag(r.region, r.isRussian),
              r.isRussian
            );
      const m3uName = `${folderName}.m3u`;
      return {
        ...r,
        multiDiscFolderName: folderName,
        m3uFileName: m3uName,
        canonicalName: m3uName,
        discs: r.discs.map((d, idx) => ({
          ...d,
          canonicalName: buildDiscTargetFilename(
            folderName,
            d.discNumber || idx + 1,
            normalizeDiskOutputExt(d.extension)
          ),
        })),
      };
    }
    const baseName = computeCanonicalNameForRom(r, cfg);
    if (r.discNumber != null) {
      return {
        ...r,
        canonicalName: buildDiscTargetFilename(
          baseName.replace(/\.[^/.]+$/, ''),
          r.discNumber,
          normalizeDiskOutputExt(r.extension)
        ),
      };
    }
    return {
      ...r,
      canonicalName: baseName,
    };
  };

  const handleChangeFilenameConfig = (nextConfig: FilenameConstructorConfig) => {
    setFilenameConfig(nextConfig);
    filenameConfigRef.current = nextConfig;
    saveFilenameConstructorConfig(nextConfig);

    if (romsRef.current.length > 0) {
      setRoms((prev) => prev.map((r) => updateRomWithFilenameConfig(r, nextConfig)));
    }
    if (bufferScannedRoms.length > 0) {
      setBufferScannedRoms((prev) => prev.map((r) => updateRomWithFilenameConfig(r, nextConfig)));
    }
  };

  const resolveFolderPathForCatalogMode = (
    consoleCode: string,
    generationFolder: string,
    mode: 'gen_then_console' | 'r36s_gen_direct' | 'r36s_flat_console' = catalogMode
  ): string => {
    if (mode === 'gen_then_console') {
      return `Organized/${generationFolder}/${consoleCode}`;
    }
    if (mode === 'r36s_gen_direct') {
      return `${generationFolder}/${consoleCode}`;
    }
    return consoleCode;
  };

  const resolveConsoleTargetDirHandle = async (
    baseRootHandle: any,
    r: ScannedRomFile
  ): Promise<{ dirHandle: any; subPath: string }> => {
    if (catalogMode === 'gen_then_console') {
      const orgRoot = await baseRootHandle.getDirectoryHandle('Organized', { create: true });
      const genHandle = await orgRoot.getDirectoryHandle(r.generationFolder, { create: true });
      const dirHandle = await genHandle.getDirectoryHandle(r.consoleCode, { create: true });
      return { dirHandle, subPath: `Organized/${r.generationFolder}/${r.consoleCode}` };
    }
    if (catalogMode === 'r36s_gen_direct') {
      const genHandle = await baseRootHandle.getDirectoryHandle(r.generationFolder, { create: true });
      const dirHandle = await genHandle.getDirectoryHandle(r.consoleCode, { create: true });
      return { dirHandle, subPath: `${r.generationFolder}/${r.consoleCode}` };
    }
    if (baseRootHandle.name.toLowerCase() === r.consoleCode) {
      return { dirHandle: baseRootHandle, subPath: r.consoleCode };
    }
    const dirHandle = await baseRootHandle.getDirectoryHandle(r.consoleCode, { create: true });
    return { dirHandle, subPath: r.consoleCode };
  };

  const handleSelectSortTargetFolder = async () => {
    const win = window as any;
    if (typeof win.showDirectoryPicker !== 'function') {
      addLog(t('app.sort.browserNoWriteLog'));
      return;
    }
    try {
      const handle = await win.showDirectoryPicker({ mode: 'readwrite' });
      await saveDirectoryHandle('sort_target', handle, handle.name);
      setPendingRestoreHandles((prev) => prev.filter((h) => h.key !== 'sort_target'));
      setSortTargetDirHandle(handle);
      setSortTargetFolderName(handle.name);
      addLog(tf('app.sort.folderSelectedLog', { name: handle.name }));
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        addLog(tf('app.sort.folderErrLog', { err: String(err) }));
      }
    }
  };

  const handleApplySortRulesInFolder = async (renameUsingConstructor = true) => {
    if (isAnyProcessRunning) return;

    let activeTargetHandle = sortTargetDirHandle || rootDirHandle || libraryDirHandle;
    const win = window as any;

    // If user hasn't picked any folder yet, immediately prompt them right here!
    if (!activeTargetHandle && typeof win.showDirectoryPicker === 'function') {
      try {
        activeTargetHandle = await win.showDirectoryPicker({ mode: 'readwrite' });
        setSortTargetDirHandle(activeTargetHandle);
        setSortTargetFolderName(activeTargetHandle.name);
      } catch (err: any) {
        if (err?.name === 'AbortError') return;
      }
    }

    if (activeTargetHandle) {
      // If active target handle differs from scanned rootDirHandle or roms are empty, scan it first
      let workingRoms = romsRef.current;
      if (workingRoms.length === 0 || (sortTargetDirHandle && sortTargetDirHandle !== rootDirHandle)) {
        setRootDirHandle(activeTargetHandle);
        setSelectedFolderName(activeTargetHandle.name);
        await scanDirectoryHandleRecursively(activeTargetHandle, 'replace');
        workingRoms = romsRef.current;
      }

      if (workingRoms.length === 0) {
        addLog(tf('app.sort.noRomsInDirLog', { name: activeTargetHandle.name }));
        return;
      }

      const expandedWorking = expandMultiDiscScannedRoms(workingRoms);
      const reDeduped = deduplicateAcrossSubfolders(
        expandedWorking,
        getPriorityArray(priorityPreset)
      );
      const collapsedReady = collapseMultiDiscScannedRoms(reDeduped, filenameConfigRef.current).map(
        (r) =>
          renameUsingConstructor
            ? updateRomWithFilenameConfig(r, filenameConfigRef.current)
            : r
      );
      romsRef.current = collapsedReady;
      setRoms(collapsedReady);
      await handleOrganizeCatalog(activeTargetHandle, collapsedReady, renameUsingConstructor);
      return;
    }

    // Fallback when browser lacks FS Access API
    if (romsRef.current.length > 0) {
      generateWindowsCatalogBatScript(
        romsRef.current.map((r) => ({
          ...r,
          canonicalName: renameUsingConstructor ? computeCanonicalNameForRom(r) : r.fileName,
        }))
      );
    } else {
      fallbackInputRef.current?.click();
    }
  };

  const isSameDirHandle = async (a: any, b: any): Promise<boolean> => {
    if (!a || !b) return false;
    if (a === b) return true;
    try {
      if (typeof a.isSameEntry === 'function') {
        return Boolean(await a.isSameEntry(b));
      }
    } catch {}
    return String(a.name || '').toLowerCase() === String(b.name || '').toLowerCase() && false;
  };

  const tryFastMoveFile = async (
    srcDirHandle: any,
    fileName: string,
    destDirHandle: any,
    newFileName: string
  ): Promise<boolean> => {
    if (!srcDirHandle || !destDirHandle) return false;
    try {
      const fh = await srcDirHandle.getFileHandle(fileName);
      if (typeof fh?.move === 'function') {
        if (await isSameDirHandle(srcDirHandle, destDirHandle)) {
          await fh.move(newFileName);
        } else {
          await fh.move(destDirHandle, newFileName);
        }
        return true;
      }
    } catch {}
    return false;
  };

  const streamWriteFileToDir = async (
    file: File,
    destDirHandle: any,
    newFileName: string
  ) => {
    const newFh = await destDirHandle.getFileHandle(newFileName, { create: true });
    const writable = await newFh.createWritable();
    if (typeof file.stream === 'function') {
      await file.stream().pipeTo(writable);
    } else {
      await writable.write(await file.arrayBuffer());
      await writable.close();
    }
  };

  const writeRomWithCompanionsToDir = async (
    r: ScannedRomFile,
    targetDirHandle: any,
    safeNewName: string,
    allowFastMove = false
  ) => {
    if (!r.fileObj) return;
    const isPaired = Array.isArray(r.companionFiles) && r.companionFiles.length > 0;
    const stem = safeNewName.replace(/\.[^/.]+$/, '');

    if (isPaired && r.cueText && safeNewName.toLowerCase().endsWith('.cue')) {
      let updatedCue = r.cueText;
      for (let idx = 0; idx < r.companionFiles!.length; idx++) {
        const compFile = r.companionFiles![idx];
        const compExt = compFile.name.slice(compFile.name.lastIndexOf('.')).toLowerCase() || '.bin';
        const newCompName =
          r.companionFiles!.length === 1
            ? `${stem}${compExt}`
            : `${stem} (Track ${String(idx + 1).padStart(2, '0')})${compExt}`;

        const movedComp =
          allowFastMove &&
          r.parentHandle &&
          (await tryFastMoveFile(r.parentHandle, compFile.name, targetDirHandle, newCompName));
        if (!movedComp) {
          await streamWriteFileToDir(compFile, targetDirHandle, newCompName);
          if (allowFastMove && r.parentHandle) {
            try {
              await r.parentHandle.removeEntry(compFile.name);
            } catch {}
          }
        }

        const escapedOld = compFile.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        updatedCue = updatedCue.replace(new RegExp(escapedOld, 'gi'), newCompName);
      }

      const cueFh = await targetDirHandle.getFileHandle(safeNewName, { create: true });
      const cueWritable = await cueFh.createWritable();
      await cueWritable.write(updatedCue);
      await cueWritable.close();
      if (
        allowFastMove &&
        r.parentHandle &&
        (!(await isSameDirHandle(r.parentHandle, targetDirHandle)) ||
          r.fileName.toLowerCase() !== safeNewName.toLowerCase())
      ) {
        try {
          await r.parentHandle.removeEntry(r.fileName);
        } catch {}
      }
      return;
    }

    if (allowFastMove && !isPaired && r.parentHandle) {
      const movedFast = await tryFastMoveFile(
        r.parentHandle,
        r.fileName,
        targetDirHandle,
        safeNewName
      );
      if (movedFast) return;
    }

    await streamWriteFileToDir(r.fileObj, targetDirHandle, safeNewName);

    if (isPaired) {
      for (const compFile of r.companionFiles!) {
        const movedComp =
          allowFastMove &&
          r.parentHandle &&
          (await tryFastMoveFile(r.parentHandle, compFile.name, targetDirHandle, compFile.name));
        if (!movedComp) {
          await streamWriteFileToDir(compFile, targetDirHandle, compFile.name);
          if (allowFastMove && r.parentHandle) {
            try {
              await r.parentHandle.removeEntry(compFile.name);
            } catch {}
          }
        }
      }
    }

    if (
      allowFastMove &&
      r.parentHandle &&
      (!(await isSameDirHandle(r.parentHandle, targetDirHandle)) ||
        r.fileName.toLowerCase() !== safeNewName.toLowerCase())
    ) {
      try {
        await r.parentHandle.removeEntry(r.fileName);
      } catch {}
    }
  };

  // Places all discs of a multi-disc game into <consoleDirHandle>/<multiDiscFolderName>/ + generates <multiDiscFolderName>.m3u
  const writeMultiDiscSetToConsoleDir = async (
    r: ScannedRomFile,
    consoleDirHandle: any,
    consoleSubPath: string,
    moveSourceFiles: boolean,
    renameUsingConstructor = true
  ): Promise<ScannedRomFile> => {
    const discsList = r.discs && r.discs.length > 0 ? r.discs : [r];
    const normReg = normalizeRegionTag(r.region, r.isRussian);
    const folderName = (
      r.multiDiscFolderName || buildMultiDiscFolderName(r.cleanTitle, normReg, r.isRussian)
    )
      .replace(/[<>:"/\\|?*]/g, '_')
      .trim();
    const m3uName = `${folderName}.m3u`;

    const gameSubDir = await consoleDirHandle.getDirectoryHandle(folderName, { create: true });
    const m3uDiscFilenames: string[] = [];
    const updatedDiscs: ScannedRomFile[] = [];

    for (let idx = 0; idx < discsList.length; idx++) {
      const d = discsList[idx];
      const discNum = d.discNumber || idx + 1;
      const outExt = normalizeDiskOutputExt(d.extension);
      const discTargetName = (
        renameUsingConstructor
          ? buildDiscTargetFilename(folderName, discNum, outExt)
          : d.fileName
      )
        .replace(/[<>:"/\\|?*]/g, '_')
        .trim();

      if (d.fileObj) {
        const sameSubDir = await isSameDirHandle(d.parentHandle, gameSubDir);
        if (!sameSubDir || d.fileName !== discTargetName) {
          await writeRomWithCompanionsToDir(d, gameSubDir, discTargetName, moveSourceFiles);
        }
      }

      m3uDiscFilenames.push(discTargetName);
      updatedDiscs.push({
        ...d,
        discNumber: discNum,
        fileName: discTargetName,
        canonicalName: discTargetName,
        sourceSubfolder: `${consoleSubPath}/${folderName}`,
        relativePath: `${consoleSubPath}/${folderName}/${discTargetName}`,
        parentHandle: gameSubDir,
        targetDirHandle: gameSubDir,
      });
    }

    const m3uFh = await gameSubDir.getFileHandle(m3uName, { create: true });
    const m3uW = await m3uFh.createWritable();
    await m3uW.write(generateM3uPlaylistText(m3uDiscFilenames));
    await m3uW.close();

    return {
      ...r,
      fileName: updatedDiscs[0]?.fileName || r.fileName,
      canonicalName: m3uName,
      isMultiDisc: true,
      discCount: updatedDiscs.length,
      multiDiscFolderName: folderName,
      m3uFileName: m3uName,
      discs: updatedDiscs,
      sourceSubfolder: `${consoleSubPath}/${folderName}`,
      relativePath: `${consoleSubPath}/${folderName}/${m3uName}`,
      parentHandle: gameSubDir,
      targetDirHandle: consoleDirHandle,
      mediaStatus: tf('app.multi.statusBadge', {
        discs: tf('lib.multiDiscCount', { count: updatedDiscs.length }),
        path: `${folderName}/${m3uName}`,
      }),
    };
  };

  // 1-click button: move/group all multi-disc games into their own dedicated subfolder + .m3u
  const handleGroupMultiDiscFolders = async () => {
    if (isAnyProcessRunning) return;
    const currentRoms = romsRef.current;
    const multiItems = currentRoms.filter(
      (r) => r.status === 'verified' && r.isMultiDisc && Array.isArray(r.discs) && r.discs.length > 1
    );

    if (multiItems.length === 0) {
      addLog(t('app.multi.noneLog'));
      return;
    }

    let activeRoot = rootDirHandle || libraryDirHandle || sortTargetDirHandle;
    const win = window as any;
    if (!activeRoot && typeof win.showDirectoryPicker === 'function') {
      try {
        activeRoot = await win.showDirectoryPicker({ mode: 'readwrite' });
        setRootDirHandle(activeRoot);
        setSelectedFolderName(activeRoot.name);
      } catch (err: any) {
        if (err?.name === 'AbortError') return;
      }
    }

    if (!activeRoot) {
      generateWindowsCatalogBatScript(multiItems);
      return;
    }

    stopRequestedRef.current = false;
    setIsOrganizing(true);
    setProgressPct(10);
    setCurrentActionText(tf('app.multi.startStatus', { count: multiItems.length }));
    addLog(tf('app.multi.startLog', { count: multiItems.length }));

    try {
      const updatedRoms = [...currentRoms];
      const touchedConsoleHandles = new Set<any>();
      let groupedGames = 0;
      let groupedDiscs = 0;

      for (let mIdx = 0; mIdx < multiItems.length; mIdx++) {
        if (stopRequestedRef.current) break;
        const r = multiItems[mIdx];
        const globalIdx = updatedRoms.findIndex((x) => x.id === r.id);
        if (globalIdx === -1) continue;

        setCurrentActionText(
          `📁 [${mIdx + 1}/${multiItems.length}] ${r.cleanTitle} (${tf('lib.multiDiscCount', {
            count: r.discs?.length || 2,
          })}) ➔ ${r.multiDiscFolderName}/`
        );
        setProgressPct(Math.max(12, Math.round(((mIdx + 1) / multiItems.length) * 90)));

        const { dirHandle: consoleDirHandle, subPath } = await resolveConsoleTargetDirHandle(
          activeRoot,
          r
        );
        const grouped = await writeMultiDiscSetToConsoleDir(
          r,
          consoleDirHandle,
          subPath,
          true,
          true
        );
        updatedRoms[globalIdx] = grouped;
        touchedConsoleHandles.add(consoleDirHandle);
        groupedGames++;
        groupedDiscs += grouped.discs?.length || 2;
        addLog(
          tf('app.multi.packedLog', {
            title: grouped.cleanTitle,
            discs: grouped.discs?.length || 2,
            path: `${subPath}/${grouped.multiDiscFolderName}/${grouped.m3uFileName}`,
          })
        );
      }

      for (const cHandle of touchedConsoleHandles) {
        const cRoms = updatedRoms.filter(
          (x) => x.status === 'verified' && (x.targetDirHandle || x.parentHandle) === cHandle
        );
        await writeGamelistXmlToHandle(cHandle, cRoms);
      }

      romsRef.current = updatedRoms;
      setRoms(updatedRoms);
      setLastScanMode('replace');
      setScanRevision((n) => n + 1);
      syncScannedRomsIntoDb(updatedRoms, activeRoot.name, true);

      const doneMsg = tf('app.multi.doneMsg', { games: groupedGames, discs: groupedDiscs });
      setCurrentActionText(doneMsg);
      addLog(doneMsg);
    } catch (err) {
      addLog(tf('app.multi.errLog', { err: String(err) }));
    } finally {
      setIsOrganizing(false);
      setProgressPct(100);
    }
  };

  // Helper to move companion media files (.srm, images/, marquees/, videos/) on rename without blocking UI
  const renameMediaAndSavesForRom = async (
    srcConsoleDir: any,
    destConsoleDir: any,
    oldBaseNoExt: string,
    newBaseNoExt: string
  ) => {
    if (!srcConsoleDir || !destConsoleDir) return;
    if (oldBaseNoExt.toLowerCase() === newBaseNoExt.toLowerCase()) {
      if (await isSameDirHandle(srcConsoleDir, destConsoleDir)) return;
    }

    try {
      const movedSrm = await tryFastMoveFile(
        srcConsoleDir,
        `${oldBaseNoExt}.srm`,
        destConsoleDir,
        `${newBaseNoExt}.srm`
      );
      if (!movedSrm) {
        const oldSrm = await srcConsoleDir.getFileHandle(`${oldBaseNoExt}.srm`);
        const f = await oldSrm.getFile();
        await streamWriteFileToDir(f, destConsoleDir, `${newBaseNoExt}.srm`);
        try {
          await srcConsoleDir.removeEntry(`${oldBaseNoExt}.srm`);
        } catch {}
      }
    } catch {}

    const mediaPairs: Array<{ folder: string; suffixes: string[] }> = [
      {
        folder: 'images',
        suffixes: ['.png', '-image.png', '-thumb.png', '-marquee.png', '.bmp', '.jpg', '-image.jpg'],
      },
      { folder: 'marquees', suffixes: ['-marquee.png', '.png'] },
      { folder: 'videos', suffixes: ['-video.mp4', '.mp4'] },
    ];

    for (const mp of mediaPairs) {
      try {
        const srcMedia = await srcConsoleDir.getDirectoryHandle(mp.folder);
        const destMedia =
          (await isSameDirHandle(srcConsoleDir, destConsoleDir))
            ? srcMedia
            : await destConsoleDir.getDirectoryHandle(mp.folder, { create: true });
        for (const sfx of mp.suffixes) {
          const oldName = `${oldBaseNoExt}${sfx}`;
          const newName = `${newBaseNoExt}${sfx}`;
          if (oldName.toLowerCase() === newName.toLowerCase() && srcMedia === destMedia) continue;
          const moved = await tryFastMoveFile(srcMedia, oldName, destMedia, newName);
          if (!moved) {
            try {
              const oldF = await (await srcMedia.getFileHandle(oldName)).getFile();
              await streamWriteFileToDir(oldF, destMedia, newName);
              await srcMedia.removeEntry(oldName);
            } catch {}
          }
        }
      } catch {}
    }
  };

  const handleOrganizeCatalog = async (
    overrideRootHandle?: any,
    overrideRoms?: ScannedRomFile[],
    renameUsingConstructor = true
  ) => {
    const activeRoms = overrideRoms || romsRef.current;
    const activeRoot = overrideRootHandle || rootDirHandle;
    if (activeRoms.length === 0 || isOrganizing || isScraping || isCleaningMedia) return;

    if (activeRoot) {
      stopRequestedRef.current = false;
      setIsOrganizing(true);
      setProgressPct(5);
      const startOrgMsg = tf('app.sort.startMsg', { name: activeRoot.name, mode: catalogMode });
      setCurrentActionText(startOrgMsg);
      addLog(startOrgMsg);
      let moved = 0;
      let skippedInPlace = 0;
      let removedDups = 0;
      const newUndoBatch: UndoAction[] = [];
      const updatedRoms = [...activeRoms];
      const consoleDirCache = new Map<string, { dirHandle: any; subPath: string }>();

      const getCachedConsoleDir = async (r: ScannedRomFile) => {
        const cacheKey = `${catalogMode}::${r.generationFolder}::${r.consoleCode}`;
        const hit = consoleDirCache.get(cacheKey);
        if (hit) return hit;
        const resolved = await resolveConsoleTargetDirHandle(activeRoot, r);
        try {
          await resolved.dirHandle.getDirectoryHandle('images', { create: true });
          await resolved.dirHandle.getDirectoryHandle('marquees', { create: true });
          await resolved.dirHandle.getDirectoryHandle('videos', { create: true });
        } catch {}
        consoleDirCache.set(cacheKey, resolved);
        return resolved;
      };

      try {
        for (let i = 0; i < updatedRoms.length; i++) {
          if (stopRequestedRef.current) break;
          const r = updatedRoms[i];
          if (r.status === 'verified' || !r.parentHandle || !r.fileObj) continue;

          if (deleteJunkPermanently) {
            try {
              await r.parentHandle.removeEntry(r.fileName);
              for (const cf of r.companionFiles || []) {
                try {
                  await r.parentHandle.removeEntry(cf.name);
                } catch {}
              }
              removedDups++;
              addLog(tf('app.sort.delJunkLog', { path: r.relativePath }));
            } catch {}
            continue;
          }

          const qFolder =
            r.status === 'junk_bad_dump' ? '_BadDumps_Junk' : '_Duplicates_1G1R';
          const qRoot = await activeRoot.getDirectoryHandle(qFolder, { create: true });
          const targetDirHandle = await qRoot.getDirectoryHandle(r.consoleCode, { create: true });

          const dupFileName = `${r.fileName.replace(/\.[^/.]+$/, '')}_${r.headerlessCrc32.slice(
            0,
            6
          )}${normalizeDiskOutputExt(r.extension)}`;
          await writeRomWithCompanionsToDir(r, targetDirHandle, dupFileName, true);

          newUndoBatch.push({
            fromDirHandle: targetDirHandle,
            fromName: dupFileName,
            toDirHandle: r.parentHandle,
            toName: r.fileName,
            fileData: new ArrayBuffer(0),
          });
          removedDups++;
          addLog(
            tf('app.sort.movedDupLog', {
              path: r.relativePath,
              target: `${qFolder}/${r.consoleCode}`,
            })
          );
        }

        const verifiedIndices = updatedRoms
          .map((item, idx) => ({ item, idx }))
          .filter(
            (x) =>
              x.item.status === 'verified' &&
              ((x.item.parentHandle && x.item.fileObj) ||
                (x.item.isMultiDisc && x.item.discs?.some((d) => d.parentHandle && d.fileObj)))
          );

        for (let v = 0; v < verifiedIndices.length; v++) {
          if (stopRequestedRef.current) break;
          const i = verifiedIndices[v].idx;
          const r = updatedRoms[i];

          const consoleTarget = await getCachedConsoleDir(r);
          let targetDirHandle = consoleTarget.dirHandle;
          let targetSubPath = consoleTarget.subPath;
          // Хаки и переводы раскладываются в <консоль>/hackroms/. / Hacks and translations go to <console>/hackroms/.
          const toHackDir = isModded(r.mod) && !r.isMultiDisc;
          if (toHackDir) {
            targetDirHandle = await targetDirHandle.getDirectoryHandle(HACKROMS_DIR, { create: true });
            targetSubPath = `${targetSubPath}/${HACKROMS_DIR}`;
          }
          const movedMod = toHackDir && r.mod ? { ...r.mod, inHackFolder: true } : r.mod;

          // Multi-disc game -> place all discs inside dedicated subfolder + create .m3u playlist
          if (r.isMultiDisc && Array.isArray(r.discs) && r.discs.length > 1) {
            if (v % 3 === 0 || v === verifiedIndices.length - 1) {
              setCurrentActionText(
                tf('app.sort.multiDiscProg', {
                  i: v + 1,
                  total: verifiedIndices.length,
                  title: r.cleanTitle,
                })
              );
              setProgressPct(Math.round(((v + 1) / Math.max(1, verifiedIndices.length)) * 90));
            }
            const grouped = await writeMultiDiscSetToConsoleDir(
              r,
              targetDirHandle,
              targetSubPath,
              true,
              renameUsingConstructor
            );
            updatedRoms[i] = grouped;
            moved += grouped.discs?.length || r.discs.length;
            continue;
          }

          const desiredName = renameUsingConstructor
            ? computeCanonicalNameForRom(r)
            : r.fileName;
          const safeNewName = desiredName.replace(/[<>:"/\\|?*]/g, '_').trim();

          if (v % 10 === 0 || v === verifiedIndices.length - 1) {
            setCurrentActionText(
              tf('app.sort.sortingProg', {
                i: v + 1,
                total: verifiedIndices.length,
                file: safeNewName,
              })
            );
            setProgressPct(Math.round(((v + 1) / Math.max(1, verifiedIndices.length)) * 90));
          }

          const inSameDir = await isSameDirHandle(r.parentHandle, targetDirHandle);
          const sameNameExact = safeNewName === r.fileName;

          if (inSameDir && sameNameExact) {
            skippedInPlace++;
            updatedRoms[i] = {
              ...r,
              fileName: safeNewName,
              canonicalName: safeNewName,
              sourceSubfolder: targetSubPath,
              relativePath: `${targetSubPath}/${safeNewName}`,
              parentHandle: targetDirHandle,
              targetDirHandle,
              mod: movedMod,
            };
            continue;
          }

          const oldStem = r.fileName.replace(/\.[^/.]+$/, '');
          const newStem = safeNewName.replace(/\.[^/.]+$/, '');

          await writeRomWithCompanionsToDir(r, targetDirHandle, safeNewName, true);
          await renameMediaAndSavesForRom(r.parentHandle, targetDirHandle, oldStem, newStem);

          newUndoBatch.push({
            fromDirHandle: targetDirHandle,
            fromName: safeNewName,
            toDirHandle: r.parentHandle,
            toName: r.fileName,
            fileData: new ArrayBuffer(0),
          });
          moved++;

          updatedRoms[i] = {
            ...r,
            fileName: safeNewName,
            canonicalName: safeNewName,
            sourceSubfolder: targetSubPath,
            relativePath: `${targetSubPath}/${safeNewName}`,
            parentHandle: targetDirHandle,
            targetDirHandle,
            mod: movedMod,
          };
        }

        // Only keep verified/active items when deleteJunkPermanently or duplicates removed so DB does not retain ghosts
        const cleanedRoms = updatedRoms.filter(
          (r) => r.status === 'verified' || !deleteJunkPermanently
        );

        // Write updated gamelist.xml for each target console folder
        const byConsoleHandle = new Map<any, ScannedRomFile[]>();
        for (const r of cleanedRoms) {
          if (r.status !== 'verified') continue;
          const h = r.targetDirHandle || r.parentHandle;
          if (!h) continue;
          const arr = byConsoleHandle.get(h) || [];
          arr.push(r);
          byConsoleHandle.set(h, arr);
        }
        for (const [cHandle, cRoms] of byConsoleHandle.entries()) {
          await writeGamelistXmlToHandle(cHandle, cRoms);
        }

        romsRef.current = cleanedRoms;
        setRoms(cleanedRoms);
        // Critical fix: use 'replace' mode so sorting/organizing replaces the active DB entries instead of doubling them!
        setLastScanMode('replace');
        setScanRevision((n) => n + 1);
        setUndoStack(newUndoBatch);
        syncScannedRomsIntoDb(cleanedRoms, activeRoot.name, true);
        const orgDoneMsg = tf('app.sort.doneMsg', {
          moved,
          skipped: skippedInPlace,
          removed: removedDups,
        });
        setCurrentActionText(orgDoneMsg);
        addLog(orgDoneMsg);

        await handleCleanOrphanedMediaInternal(activeRoot);
      } catch (err) {
        addLog(tf('app.sort.errLog', { err: String(err) }));
      } finally {
        setIsOrganizing(false);
        setProgressPct(100);
      }

      if (autoScrapeAfterSort) {
        await handleScrapeR36SMedia(updatedRoms);
      }
      return;
    }

    if (autoScrapeAfterSort) {
      await handleScrapeR36SMedia(activeRoms, true);
    } else {
      generateWindowsCatalogBatScript(activeRoms);
    }
  };

  // =========================================================================
  // 1G1R: ТОЛЬКО ОТБОР ДУБЛЕЙ (без сортировки, переименования и скрапинга)
  // =========================================================================
  const handleRun1G1R = async () => {
    if (isAnyProcessRunning) return;
    const activeRoms = romsRef.current;
    if (activeRoms.length === 0) {
      const msg = t('app.g1r.noRoms');
      setCurrentActionText(msg);
      addLog(msg);
      return;
    }
    const activeRoot = rootDirHandle;
    if (!activeRoot) {
      const msg = t('app.g1r.noFolder');
      setCurrentActionText(msg);
      addLog(msg);
      return;
    }

    stopRequestedRef.current = false;
    setIsOrganizing(true);
    setProgressPct(0);
    const startMsg = tf('app.g1r.start', { name: activeRoot.name });
    setCurrentActionText(startMsg);
    addLog(startMsg);

    let moved = 0;
    let noAccess = 0;
    let failed = 0;
    const newUndoBatch: UndoAction[] = [];
    const movedIds = new Set<string>();
    const touchedDirs = new Set<any>();

    try {
      // Пересчитываем дубли по текущей библиотеке: статусы могли устареть после переименований.
      const expanded = expandMultiDiscScannedRoms(activeRoms);
      const deduped = deduplicateAcrossSubfolders(expanded, getPriorityArray(priorityPreset));
      const losers = deduped.filter((r) => r.status !== 'verified');
      const keptCount = deduped.length - losers.length;

      for (let i = 0; i < losers.length; i++) {
        if (stopRequestedRef.current) break;
        const r = losers[i];
        setCurrentActionText(
          tf('app.g1r.progress', { i: i + 1, total: losers.length, file: r.fileName })
        );
        setProgressPct(Math.round(((i + 1) / Math.max(1, losers.length)) * 95));

        if (!r.parentHandle || !r.fileObj) {
          noAccess++;
          addLog(tf('app.g1r.noAccessLog', { path: r.relativePath || r.fileName }));
          continue;
        }

        try {
          if (deleteJunkPermanently) {
            await r.parentHandle.removeEntry(r.fileName);
            for (const cf of r.companionFiles || []) {
              try {
                await r.parentHandle.removeEntry(cf.name);
              } catch {}
            }
            addLog(tf('app.sort.delJunkLog', { path: r.relativePath }));
          } else {
            const qFolder =
              r.status === 'junk_bad_dump' ? '_BadDumps_Junk' : '_Duplicates_1G1R';
            const qRoot = await activeRoot.getDirectoryHandle(qFolder, { create: true });
            const targetDirHandle = await qRoot.getDirectoryHandle(r.consoleCode, {
              create: true,
            });
            const dupFileName = `${r.fileName.replace(/\.[^/.]+$/, '')}_${r.headerlessCrc32.slice(
              0,
              6
            )}${normalizeDiskOutputExt(r.extension)}`;
            await writeRomWithCompanionsToDir(r, targetDirHandle, dupFileName, true);
            newUndoBatch.push({
              fromDirHandle: targetDirHandle,
              fromName: dupFileName,
              toDirHandle: r.parentHandle,
              toName: r.fileName,
              fileData: new ArrayBuffer(0),
            });
            addLog(
              tf('app.sort.movedDupLog', {
                path: r.relativePath,
                target: `${qFolder}/${r.consoleCode}`,
              })
            );
          }
          moved++;
          movedIds.add(r.id);
          touchedDirs.add(r.parentHandle);
        } catch (err) {
          failed++;
          addLog(tf('app.g1r.errItemLog', { path: r.relativePath || r.fileName, err: String(err) }));
        }
      }

      // Убранные файлы больше не лежат в библиотеке: убираем их из списка.
      const remaining = collapseMultiDiscScannedRoms(
        deduped.filter((r) => !movedIds.has(r.id)),
        filenameConfigRef.current
      );

      // gamelist.xml переписываем только в папках, откуда что-то ушло.
      const byConsoleHandle = new Map<any, ScannedRomFile[]>();
      for (const r of remaining) {
        if (r.status !== 'verified') continue;
        const h = r.targetDirHandle || r.parentHandle;
        if (!h || !touchedDirs.has(h)) continue;
        const arr = byConsoleHandle.get(h) || [];
        arr.push(r);
        byConsoleHandle.set(h, arr);
      }
      for (const [cHandle, cRoms] of byConsoleHandle.entries()) {
        await writeGamelistXmlToHandle(cHandle, cRoms);
      }

      romsRef.current = remaining;
      setRoms(remaining);
      setLastScanMode('replace');
      setScanRevision((n) => n + 1);
      if (newUndoBatch.length > 0) setUndoStack(newUndoBatch);
      syncScannedRomsIntoDb(remaining, activeRoot.name, true);

      const doneMsg = tf(stopRequestedRef.current ? 'app.g1r.stopped' : 'app.g1r.done', {
        found: losers.length,
        moved,
        kept: keptCount,
        noAccess,
        failed,
      });
      setCurrentActionText(doneMsg);
      addLog(doneMsg);

      // Хаки и переводы не удаляем как дубли, а предлагаем перенести в hackroms/.
      // Hacks and translations are not removed as duplicates; we offer to move them into hackroms/.
      if (!stopRequestedRef.current) {
        const hackCandidates = remaining.filter(
          (r) =>
            r.status === 'verified' &&
            isModded(r.mod) &&
            !r.mod!.inHackFolder &&
            !r.isMultiDisc &&
            r.parentHandle &&
            r.fileObj
        );
        if (hackCandidates.length > 0) {
          addLog(tf('app.g1r.hacksFound', { count: hackCandidates.length, dir: HACKROMS_DIR }));
          setHackMoveCandidates(
            hackCandidates.map((r) => {
              const dir = r.relativePath.includes('/')
                ? r.relativePath.slice(0, r.relativePath.lastIndexOf('/'))
                : '';
              return {
                id: r.id,
                fileName: r.fileName,
                relativePath: r.relativePath,
                targetPath: `${dir ? `${dir}/` : ''}${HACKROMS_DIR}/`,
                description: describeRomMod(r.mod, tf),
              };
            })
          );
        }
      }
    } catch (err) {
      addLog(tf('app.g1r.errLog', { err: String(err) }));
    } finally {
      setIsOrganizing(false);
      setProgressPct(100);
    }
  };

  // Перенос выбранных хаков в hackroms/ рядом с ромом (в папке консоли).
  // Moves the chosen hacks into hackroms/ next to the ROM (inside the console folder).
  const handleMoveHacksToHackroms = async (ids: string[]) => {
    if (isAnyProcessRunning || ids.length === 0) return;
    const idSet = new Set(ids);
    setIsOrganizing(true);
    setProgressPct(0);
    let moved = 0;
    let failed = 0;
    const newUndoBatch: UndoAction[] = [];
    const touchedDirs = new Set<any>();
    const updated = [...romsRef.current];
    try {
      const targets = updated
        .map((r, idx) => ({ r, idx }))
        .filter((x) => idSet.has(x.r.id) && x.r.parentHandle && x.r.fileObj);
      for (let k = 0; k < targets.length; k++) {
        if (stopRequestedRef.current) break;
        const { r, idx } = targets[k];
        setCurrentActionText(
          tf('app.g1r.progress', { i: k + 1, total: targets.length, file: r.fileName })
        );
        setProgressPct(Math.round(((k + 1) / Math.max(1, targets.length)) * 95));
        try {
          const hackDir = await r.parentHandle.getDirectoryHandle(HACKROMS_DIR, { create: true });
          await writeRomWithCompanionsToDir(r, hackDir, r.fileName, true);
          const stem = r.fileName.replace(/\.[^/.]+$/, '');
          await renameMediaAndSavesForRom(r.parentHandle, hackDir, stem, stem);
          newUndoBatch.push({
            fromDirHandle: hackDir,
            fromName: r.fileName,
            toDirHandle: r.parentHandle,
            toName: r.fileName,
            fileData: new ArrayBuffer(0),
          });
          touchedDirs.add(r.parentHandle);
          const dir = r.relativePath.includes('/')
            ? r.relativePath.slice(0, r.relativePath.lastIndexOf('/'))
            : '';
          const sub = `${dir ? `${dir}/` : ''}${HACKROMS_DIR}`;
          let fileObj = r.fileObj;
          try {
            fileObj = await (await hackDir.getFileHandle(r.fileName)).getFile();
          } catch {}
          updated[idx] = {
            ...r,
            parentHandle: hackDir,
            targetDirHandle: hackDir,
            fileObj,
            sourceSubfolder: sub,
            relativePath: `${sub}/${r.fileName}`,
            reason: t('app.scan.hackKeptReason'),
            mod: r.mod ? { ...r.mod, inHackFolder: true } : r.mod,
          };
          moved++;
          addLog(tf('app.sort.movedDupLog', { path: r.relativePath, target: sub }));
        } catch (err) {
          failed++;
          addLog(tf('app.g1r.errItemLog', { path: r.relativePath || r.fileName, err: String(err) }));
        }
      }

      // gamelist.xml в исходных папках больше не должен ссылаться на перенесённые файлы.
      // gamelist.xml in the source folders must no longer list the moved files.
      for (const h of touchedDirs) {
        const left = updated.filter(
          (x) => x.status === 'verified' && (x.targetDirHandle || x.parentHandle) === h
        );
        await writeGamelistXmlToHandle(h, left);
      }

      romsRef.current = updated;
      setRoms(updated);
      setLastScanMode('replace');
      setScanRevision((n) => n + 1);
      if (newUndoBatch.length > 0) setUndoStack(newUndoBatch);
      if (rootDirHandle) syncScannedRomsIntoDb(updated, rootDirHandle.name, true);
      const msg = tf('app.g1r.hacksMoved', { moved, failed, dir: HACKROMS_DIR });
      setCurrentActionText(msg);
      addLog(msg);
    } finally {
      setHackMoveCandidates([]);
      setIsOrganizing(false);
      setProgressPct(100);
    }
  };

  // =========================================================================
  // BUFFER AUTO-PROCESSOR (АВТО-РАЗБОР БУФЕРНОЙ ПАПКИ + КОНСТРУКТОР ИМЁН)
  // =========================================================================
  // Inspect + 1G1R-dedupe raw buffer entries (shared by the Combain tool and the setup wizard).
  const inspectBufferEntries = async (entries: DiscoveredScanEntry[]): Promise<ScannedRomFile[]> => {
    const paired = await pairDiscCueAndTrackFiles(entries);
    const inspected: ScannedRomFile[] = [];
    for (const e of paired) {
      if (stopRequestedRef.current) break;
      const item = await inspectFileObject(
        e.file,
        e.relPath,
        e.parentHandle,
        e.gamelistMap,
        e.companionFiles,
        e.cueText,
        e.pairedFormatExt
      );
      if (item) inspected.push(item);
    }
    return collapseMultiDiscScannedRoms(
      deduplicateAcrossSubfolders(inspected, getPriorityArray(priorityPreset)),
      filenameConfigRef.current
    );
  };

  // Walk a buffer folder handle and collect ROM entries (skips quarantine and media folders).
  const walkBufferDirHandle = async (handle: any): Promise<DiscoveredScanEntry[]> => {
    const entries: DiscoveredScanEntry[] = [];
    const walkBuf = async (dh: any, prefix: string) => {
      let glMap: Map<string, string> | undefined;
      try {
        const glH = await dh.getFileHandle('gamelist.xml');
        glMap = parseGamelistXmlString(await (await glH.getFile()).text());
      } catch {}
      for await (const entry of dh.values()) {
        if (stopRequestedRef.current) return;
        if (entry.name.startsWith('.')) continue;
        if (entry.kind === 'directory') {
          const low = entry.name.toLowerCase();
          if (['_duplicates_1g1r', '_baddumps_junk', 'images', 'videos', 'marquees'].includes(low)) continue;
          await walkBuf(entry, prefix ? `${prefix}/${entry.name}` : entry.name);
        } else if (entry.kind === 'file') {
          const dot = entry.name.lastIndexOf('.');
          const ext = dot !== -1 ? entry.name.slice(dot).toLowerCase() : '';
          if (EXT_TO_DEFAULT_CONSOLE[ext]) {
            const file = await entry.getFile();
            entries.push({
              file,
              relPath: prefix ? `${prefix}/${entry.name}` : entry.name,
              parentHandle: dh,
              gamelistMap: glMap,
            });
          }
        }
      }
    };
    await walkBuf(handle, '');
    return entries;
  };

  const handleSelectBufferFolder = async () => {
    if (isAnyProcessRunning) return;
    const win = window as any;

    const processDiscoveredBuffer = async (
      entries: DiscoveredScanEntry[],
      folderTitle: string,
      dirHandle: any
    ) => {
      if (!dirHandle) stopRequestedRef.current = false;
      const deduped = await inspectBufferEntries(entries);
      setBufferDirHandle(dirHandle);
      setBufferFolderName(folderTitle);
      setBufferScannedRoms(deduped);
      addLog(
        tf('app.buf.scannedLog', {
          name: folderTitle,
          total: deduped.length,
          uniq: deduped.filter((x) => x.status === 'verified').length,
        })
      );
    };

    if (typeof win.showDirectoryPicker === 'function') {
      try {
        const handle = await win.showDirectoryPicker({ mode: 'readwrite' });
        await saveDirectoryHandle('buffer_source', handle, handle.name);
        setPendingRestoreHandles((prev) => prev.filter((h) => h.key !== 'buffer_source'));
        stopRequestedRef.current = false;
        const entries = await walkBufferDirHandle(handle);
        await processDiscoveredBuffer(entries, handle.name, handle);
        return;
      } catch (err: any) {
        if (err?.name === 'AbortError') return;
      }
    }

    // Fallback input directory picker
    const files = await new Promise<File[]>((resolve) => {
      const inp = document.createElement('input');
      inp.type = 'file';
      inp.multiple = true;
      inp.setAttribute('webkitdirectory', 'true');
      inp.setAttribute('directory', 'true');
      inp.onchange = () => resolve(Array.from(inp.files || []));
      inp.click();
    });
    if (files.length === 0) return;
    const firstRel = (files[0] as any).webkitRelativePath || files[0].name;
    const folderTitle = firstRel.includes('/')
      ? firstRel.split('/')[0]
      : t('app.bufferFolderDefault');
    const entries: DiscoveredScanEntry[] = [];
    for (const f of files) {
      const dot = f.name.lastIndexOf('.');
      const ext = dot !== -1 ? f.name.slice(dot).toLowerCase() : '';
      if (!EXT_TO_DEFAULT_CONSOLE[ext]) continue;
      entries.push({
        file: f,
        relPath: (f as any).webkitRelativePath || f.name,
        parentHandle: undefined,
      });
    }
    await processDiscoveredBuffer(entries, folderTitle, null);
  };

  const handleSelectCombineTargetFolder = async () => {
    const win = window as any;
    if (typeof win.showDirectoryPicker !== 'function') {
      addLog(t('app.buf.needCmdLog'));
      return;
    }
    try {
      const handle = await win.showDirectoryPicker({ mode: 'readwrite' });
      await saveDirectoryHandle('combine_target', handle, handle.name);
      setPendingRestoreHandles((prev) => prev.filter((h) => h.key !== 'combine_target'));
      setCombineTargetDirHandle(handle);
      setCombineTargetFolderName(handle.name);
      addLog(tf('app.buf.targetSelectedLog', { name: handle.name }));
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        addLog(tf('app.buf.targetErrLog', { err: String(err) }));
      }
    }
  };

  const bufferPreviewItems: BufferRomPreviewItem[] = useMemo(() => {
    const sourceList = bufferScannedRoms.length > 0 ? bufferScannedRoms : roms;
    const existingKeys = new Set(
      roms.filter((r) => r.status === 'verified').map((r) => `${r.consoleCode}::${r.comparisonKey}`)
    );

    return sourceList.map((r) => {
      const meta = CONSOLE_CATALOG[r.consoleCode] || CONSOLE_CATALOG.psx;
      const { releaseYear } = inferGenreAndYear(r.cleanTitle, r.consoleCode);
      const proposedName = computeCanonicalNameForRom(r, filenameConfig);
      const targetFolder = combineSortFolders
        ? resolveFolderPathForCatalogMode(r.consoleCode, meta.generationFolder, catalogMode)
        : t('cat.rootFolder');

      const isFromBuffer = bufferScannedRoms.length > 0;
      const matchesExisting =
        isFromBuffer && existingKeys.has(`${r.consoleCode}::${r.comparisonKey}`);

      let actionLabel = t('app.buf.actRenameSort');
      if (r.status === 'junk_bad_dump') {
        actionLabel = deleteJunkPermanently ? t('app.buf.actDelJunk') : t('app.buf.actToJunk');
      } else if (r.status === 'duplicate_clone') {
        actionLabel = combineDedup1G1R
          ? t('app.buf.actQuarantine')
          : t('app.buf.actCopyRename');
      } else if (matchesExisting) {
        actionLabel = tf('app.buf.actUpdateReplace', {
          reg: normalizeRegionTag(r.region, r.isRussian),
        });
      }

      return {
        id: r.id,
        originalFileName: r.fileName,
        relativePath: r.relativePath,
        cleanTitle: r.cleanTitle,
        year: releaseYear || 1998,
        region: normalizeRegionTag(r.region, r.isRussian),
        bitness: meta.generationShort,
        consoleCode: r.consoleCode.toUpperCase(),
        extension: r.extension,
        revision: r.revision,
        proposedFileName: proposedName,
        targetFolderRelPath: targetFolder,
        actionLabel,
        isDuplicateOrJunk: r.status !== 'verified',
        fileSize: r.fileSize,
        crc32: r.headerlessCrc32,
      };
    });
  }, [bufferScannedRoms, roms, filenameConfig, catalogMode, combineSortFolders, combineDedup1G1R, deleteJunkPermanently, lang]);

  const handleDownloadBufferCmdScript = () => {
    const sourceList = bufferScannedRoms.length > 0 ? bufferScannedRoms : roms;
    if (sourceList.length === 0) {
      addLog(t('app.buf.needFolderLog'));
      return;
    }

    const lines: string[] = [
      '@echo off',
      'chcp 65001 >nul',
      'echo ============================================================================',
      `echo  ${tf('app.buf.cmdTitle', { count: sourceList.length })}`,
      'echo ============================================================================',
      '',
    ];

    for (const r of sourceList) {
      const meta = CONSOLE_CATALOG[r.consoleCode] || CONSOLE_CATALOG.psx;
      const winRel = r.relativePath.replace(/\//g, '\\');
      if (r.status !== 'verified' && combineDedup1G1R) {
        if (deleteJunkPermanently) {
          lines.push(`if exist "${winRel}" del /f /q "${winRel}"`);
        } else {
          const qDir = `_Duplicates_1G1R\\${r.consoleCode}`;
          lines.push(`if not exist "${qDir}" mkdir "${qDir}"`);
          lines.push(`if exist "${winRel}" move /y "${winRel}" "${qDir}\\${r.fileName}" >nul`);
        }
        continue;
      }

      if (r.isMultiDisc && Array.isArray(r.discs) && r.discs.length > 1) {
        const folderName = (
          r.multiDiscFolderName ||
          buildMultiDiscFolderName(r.cleanTitle, normalizeRegionTag(r.region, r.isRussian), r.isRussian)
        )
          .replace(/[<>:"/\\|?*]/g, '_')
          .trim();
        const m3uName = `${folderName}.m3u`;
        const destBase = combineSortFolders
          ? resolveFolderPathForCatalogMode(r.consoleCode, meta.generationFolder, catalogMode).replace(/\//g, '\\')
          : '.';
        const gameDir = destBase === '.' ? folderName : `${destBase}\\${folderName}`;
        lines.push(`if not exist "${gameDir}" mkdir "${gameDir}"`);
        const opCmd = combineMoveMode === 'move' ? 'move /y' : 'copy /y';
        const discEchoes: string[] = [];
        for (let di = 0; di < r.discs.length; di++) {
          const d = r.discs[di];
          const dWinRel = d.relativePath.replace(/\//g, '\\');
          const discFile = buildDiscTargetFilename(
            folderName,
            d.discNumber || di + 1,
            normalizeDiskOutputExt(d.extension)
          ).replace(/[<>:"/\\|?*]/g, '_');
          lines.push(`if exist "${dWinRel}" ${opCmd} "${dWinRel}" "${gameDir}\\${discFile}" >nul`);
          discEchoes.push(discFile);
        }
        lines.push(`(`);
        for (const fn of discEchoes) {
          lines.push(`  echo ${fn}`);
        }
        lines.push(`) > "${gameDir}\\${m3uName}"`);
        continue;
      }

      const newName = computeCanonicalNameForRom(r, filenameConfig);
      const destDir = combineSortFolders
        ? resolveFolderPathForCatalogMode(r.consoleCode, meta.generationFolder, catalogMode).replace(/\//g, '\\')
        : '.';
      if (destDir !== '.') {
        lines.push(`if not exist "${destDir}" mkdir "${destDir}"`);
      }
      const opCmd = combineMoveMode === 'move' ? 'move /y' : 'copy /y';
      lines.push(
        `if exist "${winRel}" ${opCmd} "${winRel}" "${destDir === '.' ? newName : `${destDir}\\${newName}`}" >nul`
      );
    }

    lines.push(`echo ${t('app.buf.cmdDone')}`);
    lines.push('pause');

    const blob = new Blob([lines.join('\r\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'AutoSort_Buffer_AegisROM.cmd';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
    addLog(tf('app.buf.cmdDownloadedLog', { count: sourceList.length }));
  };

  /**
   * Combain: copy/move buffer ROMs into the library, sorted by console and renamed.
   * `override` lets the setup wizard run it in one async chain with explicit inputs
   * instead of state that has not re-rendered yet.
   */
  const combineMoveModeState = combineMoveMode;
  const combineDedup1G1RState = combineDedup1G1R;
  const combineSortFoldersState = combineSortFolders;
  const combineAddToLibraryState = combineAddToLibrary;
  const filenameConfigState = filenameConfig;
  const handleRunBufferAutoProcess = async (override?: {
    sourceList: ScannedRomFile[];
    targetHandle: any;
    moveMode: 'move' | 'copy';
    filenameConfig?: FilenameConstructorConfig;
    sourceName?: string;
  }): Promise<{ moved: number; dups: number } | void> => {
    if (isAnyProcessRunning && !override) return;
    const sourceList =
      override?.sourceList ??
      (bufferScannedRoms.length > 0 ? bufferScannedRoms : romsRef.current);
    const combineMoveMode = override?.moveMode ?? combineMoveModeState;
    const combineDedup1G1R = override ? true : combineDedup1G1RState;
    const combineSortFolders = override ? true : combineSortFoldersState;
    const combineAddToLibrary = override ? true : combineAddToLibraryState;
    const filenameConfig = override?.filenameConfig ?? filenameConfigState;

    if (sourceList.length === 0) {
      if (override) return;
      await handleSelectBufferFolder();
      return;
    }

    const activeTargetHandle =
      override?.targetHandle ||
      combineTargetDirHandle ||
      sortTargetDirHandle ||
      libraryDirHandle ||
      rootDirHandle;

    if (!activeTargetHandle) {
      handleDownloadBufferCmdScript();
      return;
    }

    stopRequestedRef.current = false;
    setIsProcessingBuffer(true);
    setProgressPct(5);
    const startBufMsg = tf('app.buf.startMsg', {
      src: override
        ? override.sourceName || t('app.bufferFolderDefault')
        : bufferFolderName || selectedFolderName || t('app.bufferFolderDefault'),
      count: sourceList.length,
      dst: activeTargetHandle.name,
    });
    setCurrentActionText(startBufMsg);
    addLog(startBufMsg);

    const processedWinners: ScannedRomFile[] = [];
    let movedOrCopied = 0;
    let quarantinedDups = 0;
    let removedFromBuffer = 0;

    try {
      for (let i = 0; i < sourceList.length; i++) {
        if (stopRequestedRef.current) break;
        const r = sourceList[i];
        setCurrentActionText(
          tf('app.buf.itemProg', {
            i: i + 1,
            total: sourceList.length,
            file: r.fileName,
          })
        );
        setProgressPct(Math.max(8, Math.round(((i + 1) / sourceList.length) * 90)));

        if (!r.fileObj) continue;

        if (r.status !== 'verified' && combineDedup1G1R) {
          if (deleteJunkPermanently) {
            if (combineMoveMode === 'move' && r.parentHandle) {
              try {
                await r.parentHandle.removeEntry(r.fileName);
                removedFromBuffer++;
              } catch {}
            }
            quarantinedDups++;
            continue;
          }

          const qFolder = r.status === 'junk_bad_dump' ? '_BadDumps_Junk' : '_Duplicates_1G1R';
          const qRoot = await activeTargetHandle.getDirectoryHandle(qFolder, { create: true });
          const qConsole = await qRoot.getDirectoryHandle(r.consoleCode, { create: true });
          const dupName = `${r.fileName.replace(/\.[^/.]+$/, '')}_${r.headerlessCrc32.slice(0, 6)}${normalizeDiskOutputExt(r.extension)}`;
          await writeRomWithCompanionsToDir(r, qConsole, dupName);

          if (combineMoveMode === 'move' && r.parentHandle) {
            try {
              await r.parentHandle.removeEntry(r.fileName);
              for (const cf of r.companionFiles || []) {
                try {
                  await r.parentHandle.removeEntry(cf.name);
                } catch {}
              }
              removedFromBuffer++;
            } catch {}
          }
          quarantinedDups++;
          continue;
        }

        const meta = CONSOLE_CATALOG[r.consoleCode] || CONSOLE_CATALOG.psx;
        const relFolder = combineSortFolders
          ? resolveFolderPathForCatalogMode(r.consoleCode, meta.generationFolder, catalogMode)
          : '';
        let destDirHandle = activeTargetHandle;
        for (const seg of relFolder.split('/').filter(Boolean)) {
          destDirHandle = await destDirHandle.getDirectoryHandle(seg, { create: true });
        }

        await destDirHandle.getDirectoryHandle('images', { create: true });
        await destDirHandle.getDirectoryHandle('marquees', { create: true });
        await destDirHandle.getDirectoryHandle('videos', { create: true });

        if (r.isMultiDisc && Array.isArray(r.discs) && r.discs.length > 1) {
          const grouped = await writeMultiDiscSetToConsoleDir(
            r,
            destDirHandle,
            relFolder || t('cat.rootFolder'),
            combineMoveMode === 'move',
            true
          );
          movedOrCopied += grouped.discs?.length || r.discs.length;
          if (combineMoveMode === 'move') {
            removedFromBuffer += grouped.discs?.length || r.discs.length;
          }
          addLog(
            tf('app.buf.logMultiDisc', {
              title: grouped.cleanTitle,
              discs: tf('lib.discShort', { count: grouped.discs?.length || 2 }),
              path: grouped.relativePath,
            })
          );
          processedWinners.push(grouped);
          continue;
        }

        const newFileName = computeCanonicalNameForRom(r, filenameConfig);
        await writeRomWithCompanionsToDir(r, destDirHandle, newFileName);

        if (
          combineMoveMode === 'move' &&
          r.parentHandle &&
          (r.parentHandle !== destDirHandle || r.fileName.toLowerCase() !== newFileName.toLowerCase())
        ) {
          try {
            await r.parentHandle.removeEntry(r.fileName);
            for (const cf of r.companionFiles || []) {
              try {
                await r.parentHandle.removeEntry(cf.name);
              } catch {}
            }
            removedFromBuffer++;
          } catch {}
        }

        movedOrCopied++;
        const nextPath = relFolder ? `${relFolder}/${newFileName}` : newFileName;
        addLog(tf('app.buf.logToLib', { src: r.fileName, dst: nextPath }));

        processedWinners.push({
          ...r,
          fileName: newFileName,
          canonicalName: newFileName,
          sourceSubfolder: relFolder || t('cat.rootFolder'),
          relativePath: nextPath,
          parentHandle: destDirHandle,
          targetDirHandle: destDirHandle,
          mediaStatus: tf('app.buf.statusResolved', { file: newFileName }),
        });
      }

      // Write updated gamelist.xml per target console folder
      const byConsoleHandle = new Map<any, ScannedRomFile[]>();
      for (const pw of processedWinners) {
        const h = pw.targetDirHandle || pw.parentHandle;
        if (!h) continue;
        const arr = byConsoleHandle.get(h) || [];
        arr.push(pw);
        byConsoleHandle.set(h, arr);
      }
      for (const [cHandle, cRoms] of byConsoleHandle.entries()) {
        await writeGamelistXmlToHandle(cHandle, cRoms);
      }

      if (combineAddToLibrary && processedWinners.length > 0) {
        const merged =
          romsRef.current.length > 0
            ? mergeRomsIncremental(romsRef.current, processedWinners)
            : processedWinners;
        romsRef.current = merged;
        setRoms(merged);
        setLastScanMode('append');
        setScanRevision((n) => n + 1);
        syncScannedRomsIntoDb(merged, activeTargetHandle.name, false);
      }

      if (!override && combineMoveMode === 'move' && bufferScannedRoms.length > 0) {
        setBufferScannedRoms([]);
      }

      addLog(
        tf('app.buf.doneMsg', {
          moved: movedOrCopied,
          dups: quarantinedDups,
          cleaned: removedFromBuffer,
        })
      );

      if (autoScrapeAfterSort && processedWinners.length > 0) {
        await autoEnrichMediaFromBatchScraper(processedWinners, activeTargetHandle.name);
      }
    } catch (err) {
      addLog(tf('app.buf.errLog', { err: String(err) }));
    } finally {
      setIsProcessingBuffer(false);
      setProgressPct(100);
    }
    return { moved: movedOrCopied, dups: quarantinedDups };
  };

  // ==========================================================================
  // Мастер первоначальной настройки / first-run setup wizard (roadmap 0.5.8)
  // ==========================================================================
  const [setupWizardOpen, setSetupWizardOpen] = useState(false);
  const [setupWizardKey, setSetupWizardKey] = useState(0);
  const setupHandlesRef = useRef<Record<SetupFolderKind, any>>({
    library: null,
    storage: null,
    own: null,
  });
  const [setupFolders, setSetupFolders] = useState<Record<SetupFolderKind, string | null>>({
    library: null,
    storage: null,
    own: null,
  });
  const [setupOwnConflict, setSetupOwnConflict] = useState(false);
  const [setupRun, setSetupRun] = useState<SetupRunState | null>(null);
  const [setupTourOpen, setSetupTourOpen] = useState(false);
  const [navigateRequest, setNavigateRequest] = useState<{
    target: TourTarget;
    nonce: number;
  } | null>(null);
  const setupRunningRef = useRef(false);
  const setupFsSupported =
    typeof window !== 'undefined' && typeof (window as any).showDirectoryPicker === 'function';

  const markSetupDone = () => {
    try {
      localStorage.setItem(SETUP_DONE_STORAGE_KEY, new Date().toISOString());
    } catch {}
  };

  // First launch: open the wizard unless this install already has a library
  // (saved folder handles or cached DB records from an earlier version).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (localStorage.getItem(SETUP_DONE_STORAGE_KEY)) return;
      } catch {
        return;
      }
      let existing = false;
      try {
        const raw = localStorage.getItem('aegisrom_v0_5_db');
        if (raw && (JSON.parse(raw)?.records?.length || 0) > 0) existing = true;
      } catch {}
      if (!existing) {
        try {
          existing = (await listAllSavedDirectoryHandles()).length > 0;
        } catch {}
      }
      if (cancelled) return;
      if (existing) markSetupDone();
      else setSetupWizardOpen(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleOpenSetupWizard = () => {
    if (setupRunningRef.current) return;
    const storage = sortTargetDirHandle || combineTargetDirHandle || null;
    setupHandlesRef.current = { library: libraryDirHandle || null, storage, own: null };
    setSetupFolders({
      library: libraryDirHandle?.name || null,
      storage: storage?.name || null,
      own: null,
    });
    setSetupOwnConflict(false);
    setSetupWizardKey((k) => k + 1);
    setSetupWizardOpen(true);
  };

  // True when the two folders are the same or one lies inside the other.
  const areDirHandlesOverlapping = async (a: any, b: any): Promise<boolean> => {
    if (!a || !b) return false;
    try {
      if (typeof a.isSameEntry === 'function' && (await a.isSameEntry(b))) return true;
    } catch {}
    try {
      if (typeof a.resolve === 'function' && (await a.resolve(b)) !== null) return true;
      if (typeof b.resolve === 'function' && (await b.resolve(a)) !== null) return true;
    } catch {}
    return false;
  };

  const handleSetupPickFolder = async (kind: SetupFolderKind): Promise<SetupPickResult> => {
    const win = window as any;
    if (typeof win.showDirectoryPicker !== 'function') return { ok: false };
    try {
      const handle = await win.showDirectoryPicker({ mode: 'readwrite', id: `aegis-setup-${kind}` });
      setupHandlesRef.current = { ...setupHandlesRef.current, [kind]: handle };
      setSetupFolders((prev) => ({ ...prev, [kind]: handle.name }));
      const { storage, own } = setupHandlesRef.current;
      setSetupOwnConflict(await areDirHandlesOverlapping(storage, own));
      return { ok: true };
    } catch (err: any) {
      if (err?.name === 'AbortError') return { ok: false };
      return { ok: false, error: String(err?.message || err) };
    }
  };

  const handleSetupClearFolder = (kind: SetupFolderKind) => {
    setupHandlesRef.current = { ...setupHandlesRef.current, [kind]: null };
    setSetupFolders((prev) => ({ ...prev, [kind]: null }));
    if (kind === 'own' || kind === 'storage') setSetupOwnConflict(false);
  };

  const handleSetupLater = () => {
    markSetupDone();
    setSetupWizardOpen(false);
  };

  const updateSetupStage = (id: SetupStage['id'], patch: Partial<SetupStage>) => {
    setSetupRun((prev) =>
      prev
        ? { ...prev, stages: prev.stages.map((st) => (st.id === id ? { ...st, ...patch } : st)) }
        : prev
    );
  };

  const handleSetupStop = () => {
    handleEmergencyStop();
    setSetupRun((prev) =>
      prev
        ? {
            ...prev,
            stopped: true,
            stages: prev.stages.map((st) =>
              st.status === 'pending' || st.status === 'running'
                ? { ...st, status: 'skipped' as const }
                : st
            ),
          }
        : prev
    );
  };

  const handleTourNavigate = (target: TourTarget) => {
    setNavigateRequest({ target, nonce: Date.now() });
  };

  /**
   * Builds the library step by step with the existing tools:
   * library file -> scan ROM storage -> scan own ROMs -> copy/move + sort + rename -> save.
   * Runs in the background while the tour is shown.
   */
  const runInitialSetupPipeline = async (result: SetupWizardResult) => {
    if (setupRunningRef.current) return;
    const { library, storage } = setupHandlesRef.current;
    const own = setupOwnConflict ? null : setupHandlesRef.current.own;
    if (!library || !storage) return;
    setupRunningRef.current = true;
    setSetupWizardOpen(false);
    markSetupDone();
    try {
      localStorage.setItem(INSTALL_MODE_STORAGE_KEY, result.installMode);
    } catch {}

    setSetupRun({
      stages: [
        { id: 'library', status: 'pending' },
        { id: 'scanStorage', status: 'pending' },
        { id: 'scanOwn', status: own ? 'pending' : 'skipped' },
        { id: 'transfer', status: own ? 'pending' : 'skipped' },
        { id: 'save', status: 'pending' },
      ],
      transferMode: result.ownMode,
      finished: false,
      stopped: false,
    });
    setSetupTourOpen(true);
    setNavigateRequest({ target: { tab: 'library' }, nonce: Date.now() });
    addLog(t('setup.log.start'));
    stopRequestedRef.current = false;
    const stopped = () => stopRequestedRef.current;
    const errText = (e: any) => String(e?.message || e);
    const verifiedCount = () => romsRef.current.filter((r) => r.status === 'verified').length;

    let cfg = filenameConfigRef.current;
    if (result.renamePresetId) {
      const preset = FILENAME_CONSTRUCTOR_PRESETS.find((p) => p.id === result.renamePresetId);
      if (preset) {
        handleChangeFilenameConfig(preset.config);
        cfg = preset.config;
      }
    }

    try {
      // 1. Library file
      updateSetupStage('library', { status: 'running' });
      try {
        await saveDirectoryHandle('library_root', library, library.name);
        setPendingRestoreHandles((prev) => prev.filter((h) => h.key !== 'library_root'));
        setLibraryDirHandle(library);
        setMediaAccessVersion((v) => v + 1);
        await handleUpdateDbState({
          ...dbStateRef.current,
          masterLibraryPath: library.name,
          sdCardMountPath: storage.name,
          lastSyncedAt: new Date().toISOString(),
        });
        const dbFh = await library.getFileHandle('aegisrom_db.json', { create: true });
        if ((await dbFh.getFile()).size === 0) {
          const w = await dbFh.createWritable();
          await w.write(JSON.stringify(dbStateRef.current, null, 2));
          await w.close();
        }
        updateSetupStage('library', { status: 'done', detail: library.name });
      } catch (e) {
        updateSetupStage('library', { status: 'error', detail: errText(e) });
      }
      if (stopped()) return;

      // 2. Scan the ROM storage (ROMs already there become the library)
      updateSetupStage('scanStorage', { status: 'running', detail: storage.name });
      for (const key of ['scan_root', 'sort_target', 'combine_target']) {
        await saveDirectoryHandle(key, storage, storage.name);
      }
      setPendingRestoreHandles((prev) =>
        prev.filter((h) => !['scan_root', 'sort_target', 'combine_target'].includes(h.key))
      );
      setRootDirHandle(storage);
      setSelectedFolderName(storage.name);
      setSortTargetDirHandle(storage);
      setSortTargetFolderName(storage.name);
      setCombineTargetDirHandle(storage);
      setCombineTargetFolderName(storage.name);
      scanModeRef.current = 'replace';
      await scanDirectoryHandleRecursively(storage, 'replace');
      if (stopped()) return;
      updateSetupStage('scanStorage', {
        status: 'done',
        detail: tf('setup.stage.found', { count: verifiedCount() }),
      });

      // 3-4. Own ROMs: scan, then copy/move into the storage sorted by console and renamed
      if (own) {
        updateSetupStage('scanOwn', { status: 'running', detail: own.name });
        let found: ScannedRomFile[] = [];
        let scanOwnFailed = false;
        try {
          await saveDirectoryHandle('buffer_source', own, own.name);
          setPendingRestoreHandles((prev) => prev.filter((h) => h.key !== 'buffer_source'));
          setBufferDirHandle(own);
          setBufferFolderName(own.name);
          setIsScanning(true);
          setCurrentActionText(tf('app.scan.scanning', { name: own.name }));
          found = await inspectBufferEntries(await walkBufferDirHandle(own));
        } catch (e) {
          scanOwnFailed = true;
          updateSetupStage('scanOwn', { status: 'error', detail: errText(e) });
        } finally {
          setIsScanning(false);
        }
        if (stopped()) return;
        if (!scanOwnFailed) {
          updateSetupStage('scanOwn', {
            status: 'done',
            detail: tf('setup.stage.found', { count: found.length }),
          });
        }

        if (found.length > 0) {
          updateSetupStage('transfer', { status: 'running' });
          try {
            const res = await handleRunBufferAutoProcess({
              sourceList: found,
              targetHandle: storage,
              moveMode: result.ownMode,
              filenameConfig: cfg,
              sourceName: own.name,
            });
            if (stopped()) return;
            updateSetupStage('transfer', {
              status: 'done',
              detail: res ? tf('setup.stage.placed', { count: res.moved, dups: res.dups }) : '',
            });
          } catch (e) {
            updateSetupStage('transfer', { status: 'error', detail: errText(e) });
          }
        } else {
          updateSetupStage('transfer', { status: 'skipped' });
        }
      }
      if (stopped()) return;

      // 5. Save the library file next to the chosen folder
      updateSetupStage('save', { status: 'running' });
      try {
        const dbFh = await library.getFileHandle('aegisrom_db.json', { create: true });
        const w = await dbFh.createWritable();
        await w.write(
          JSON.stringify(
            { ...dbStateRef.current, exportedAt: new Date().toISOString() },
            null,
            2
          )
        );
        await w.close();
        updateSetupStage('save', { status: 'done', detail: 'aegisrom_db.json' });
      } catch (e) {
        updateSetupStage('save', { status: 'error', detail: errText(e) });
      }

      const count = verifiedCount();
      setSetupRun((prev) => (prev ? { ...prev, finished: true, gamesCount: count } : prev));
      addLog(tf('setup.log.done', { count }));
    } finally {
      setupRunningRef.current = false;
      if (stopRequestedRef.current) {
        addLog(t('setup.log.stopped'));
        setSetupRun((prev) =>
          prev
            ? {
                ...prev,
                stopped: true,
                stages: prev.stages.map((st) =>
                  st.status === 'pending' || st.status === 'running'
                    ? { ...st, status: 'skipped' as const }
                    : st
                ),
              }
            : prev
        );
      }
    }
  };

  const handleCleanOrphanedMedia = async () => {
    if (isScanning || isOrganizing || isScraping || isCleaningMedia) return;

    if (!rootDirHandle) {
      addLog(t('app.orphan.needDirLog'));
      return;
    }

    setIsCleaningMedia(true);
    setCurrentActionText(t('app.orphan.startStatus'));
    addLog(t('app.orphan.startLog'));
    try {
      const deletedCount = await handleCleanOrphanedMediaInternal(rootDirHandle);
      const orphanDone = tf('app.orphan.doneMsg', { count: deletedCount });
      setCurrentActionText(orphanDone);
      addLog(orphanDone);
    } catch (err) {
      addLog(tf('app.orphan.errLog', { err: String(err) }));
    } finally {
      setIsCleaningMedia(false);
    }
  };

  const handleCleanOrphanedMediaInternal = async (rootHandle: any): Promise<number> => {
    let deletedCount = 0;
    const mediaFolderNames = new Set([
      'images',
      'marquees',
      'banners',
      'videos',
      'snap',
      'boxart',
      'wheels',
    ]);
    const suffixes = [
      '-image',
      '-thumb',
      '-marquee',
      '-video',
      '-banner',
      '-boxart',
      '-snap',
      '-wheel',
      '-fanart',
    ];

    async function walkForMediaDirs(dirHandle: any) {
      const activeRomBases = new Set<string>();
      const activeRomNorms = new Set<string>();
      const subMediaHandles: Array<{ name: string; handle: any }> = [];
      const subDirHandles: any[] = [];

      for await (const entry of dirHandle.values()) {
        if (entry.name.startsWith('.')) continue;
        const lower = entry.name.toLowerCase();
        if (entry.kind === 'directory') {
          if (lower === '_duplicates_1g1r' || lower === '_baddumps_junk') continue;
          if (mediaFolderNames.has(lower)) {
            subMediaHandles.push({ name: entry.name, handle: entry });
          } else {
            subDirHandles.push(entry);
          }
        } else if (entry.kind === 'file') {
          const dot = entry.name.lastIndexOf('.');
          const ext = dot !== -1 ? entry.name.slice(dot).toLowerCase() : '';
          if (EXT_TO_DEFAULT_CONSOLE[ext]) {
            const base = entry.name.slice(0, dot).toLowerCase();
            activeRomBases.add(base);
            activeRomNorms.add(buildComparisonKey(extractCleanTitle(entry.name)));
          }
        }
      }

      for (const mFolder of subMediaHandles) {
        const toDelete: string[] = [];
        for await (const mEntry of mFolder.handle.values()) {
          if (mEntry.kind !== 'file') continue;
          const dot = mEntry.name.lastIndexOf('.');
          if (dot === -1) continue;
          const mExt = mEntry.name.slice(dot).toLowerCase();
          if (!['.png', '.jpg', '.jpeg', '.mp4', '.avi', '.mkv', '.gif'].includes(mExt)) {
            continue;
          }

          let stripped = mEntry.name.slice(0, dot);
          for (const sfx of suffixes) {
            if (stripped.toLowerCase().endsWith(sfx)) {
              stripped = stripped.slice(0, stripped.length - sfx.length);
              break;
            }
          }

          const hasExactRom = activeRomBases.has(stripped.toLowerCase());
          const hasNormRom = activeRomNorms.has(buildComparisonKey(extractCleanTitle(stripped)));

          if (!hasExactRom && !hasNormRom) {
            toDelete.push(mEntry.name);
          }
        }

        for (const delName of toDelete) {
          try {
            await mFolder.handle.removeEntry(delName);
            deletedCount++;
            addLog(tf('app.orphan.removedFileLog', { folder: mFolder.name, file: delName }));
          } catch {}
        }
      }

      for (const subDir of subDirHandles) {
        await walkForMediaDirs(subDir);
      }
    }

    await walkForMediaDirs(rootHandle);
    return deletedCount;
  };

  const handleScrapeR36SMedia = async (
    targetList: ScannedRomFile[] = romsRef.current,
    exportBatAfter = false
  ) => {
    const winners = targetList.filter((r) => r.status === 'verified');
    if (winners.length === 0 || isScraping) return;

    stopRequestedRef.current = false;
    setIsScraping(true);
    setProgressPct(4);
    const startScrapeMsg = tf('app.scrape.auditing', {
      i: 0,
      total: winners.length,
      skipped: 0,
      stubs: 0,
    });
    setCurrentActionText(startScrapeMsg);
    addLog(startScrapeMsg);

    try {
      // Phase 1: Smart Placeholder Audit on disk before scraping!
      const statsCache = new Map<string, FolderMediaSignatureStats>();
      const romsNeedingScrape: ScannedRomFile[] = [];
      const placeholderReasonsById = new Map<string, string>();
      // Аудит по ромам: какие слоты уже рабочие и не должны перекачиваться.
      // Per-ROM audit: which slots already work and must not be re-downloaded.
      const auditsById = new Map<string, RomMediaAuditResult>();
      // gamelist.xml каждой папки: обложки там могут называться не по имени рома.
      // Each folder's gamelist.xml: covers there may be named differently from the ROM.
      const gamelistIdxCache = new Map<any, Map<string, GamelistEntry>>();
      const gamelistIndexFor = async (dirHandle: any) => {
        let idx = gamelistIdxCache.get(dirHandle);
        if (!idx) {
          idx = new Map();
          try {
            const fh = await dirHandle.getFileHandle('gamelist.xml');
            idx = indexGamelistEntries(parseGamelistEntries(await (await fh.getFile()).text()));
          } catch {}
          gamelistIdxCache.set(dirHandle, idx);
        }
        return idx;
      };
      let skippedRealMediaCount = 0;
      let placeholderDetectedCount = 0;
      let missingMediaCount = 0;

      for (let i = 0; i < winners.length; i++) {
        if (stopRequestedRef.current) break;
        const w = winners[i];
        const consoleDirHandle = w.targetDirHandle || w.parentHandle;

        if (consoleDirHandle) {
          const romBaseNoExt = (
            w.isMultiDisc && w.multiDiscFolderName
              ? w.multiDiscFolderName
              : w.fileName.replace(/\.[^/.]+$/, '')
          ).trim();
          const audit = await auditRomMediaOnDisk(
            consoleDirHandle,
            romBaseNoExt,
            w.cleanTitle,
            scrapeShortVideos,
            statsCache
          );
          // Медиа, на которое ссылается gamelist.xml, тоже считается рабочим.
          // Media referenced by gamelist.xml also counts as working.
          const glEntry = findGamelistEntry(
            await gamelistIndexFor(consoleDirHandle),
            w.isMultiDisc && w.m3uFileName ? w.m3uFileName : w.fileName
          );
          if (glEntry) {
            const imgRef = glEntry.fields.image || glEntry.fields.thumbnail;
            if (audit.image.status !== 'valid' && imgRef && (await relativeFileExists(consoleDirHandle, imgRef))) {
              audit.image = { status: 'valid', reason: 'gamelist.xml', fileName: unescapeXml(imgRef) };
            }
            const mqRef = glEntry.fields.marquee;
            if (audit.marquee.status !== 'valid' && mqRef && (await relativeFileExists(consoleDirHandle, mqRef))) {
              audit.marquee = { status: 'valid', reason: 'gamelist.xml', fileName: unescapeXml(mqRef) };
            }
            const vRef = glEntry.fields.video;
            if (audit.video.status !== 'valid' && vRef && (await relativeFileExists(consoleDirHandle, vRef))) {
              audit.video = { status: 'valid', reason: 'gamelist.xml', fileName: unescapeXml(vRef) };
            }
            audit.isFullyValid =
              audit.image.status === 'valid' && (!scrapeShortVideos || audit.video.status === 'valid');
          }
          auditsById.set(w.id, audit);
          if (audit.isFullyValid) {
            skippedRealMediaCount++;
            continue;
          }
          if (audit.image.status === 'placeholder' || audit.video.status === 'placeholder') {
            placeholderDetectedCount++;
          } else {
            missingMediaCount++;
          }
          placeholderReasonsById.set(w.id, audit.summaryReason);
          romsNeedingScrape.push(w);
        } else {
          // URL-only session check: treat known tiny/dead URLs as needing scrape
          if (
            w.scrapedBoxArtUrl &&
            !isDeadOrLocalBlobUrl(w.scrapedBoxArtUrl) &&
            (!scrapeShortVideos || w.scrapedVideoUrl)
          ) {
            skippedRealMediaCount++;
          } else {
            missingMediaCount++;
            romsNeedingScrape.push(w);
          }
        }

        if (i % 15 === 0 || i === winners.length - 1) {
          setProgressPct(Math.max(5, Math.round(((i + 1) / winners.length) * 30)));
          setCurrentActionText(
            tf('app.scrape.auditing', {
              i: i + 1,
              total: winners.length,
              skipped: skippedRealMediaCount,
              stubs: placeholderDetectedCount,
            })
          );
        }
      }

      addLog(
        tf('app.scrape.auditSummary', {
          skipped: skippedRealMediaCount,
          stubs: placeholderDetectedCount,
          missing: missingMediaCount,
        })
      );

      if (romsNeedingScrape.length === 0) {
        const allOkMsg = tf('app.scrape.allOk', { count: skippedRealMediaCount });
        setCurrentActionText(allOkMsg);
        addLog(allOkMsg);
        return;
      }

      const payload = romsNeedingScrape.map((w) => {
        const meta = CONSOLE_CATALOG[w.consoleCode] || CONSOLE_CATALOG.nes;
        return {
          id: w.id,
          cleanTitle: w.cleanTitle,
          comparisonKey: w.comparisonKey,
          region: w.region,
          libretroSystem: meta.libretroSystem,
          archiveVideoId: meta.archiveVideoId,
        };
      });

      const resp = await fetch('/api/r36s/scrape-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: payload }),
      });
      const data = await resp.json();
      const matchMap = new Map<string, any>();
      for (const res of data.results || []) {
        matchMap.set(res.id, res);
      }

      const nextRoms = [...targetList];
      let downloadedMediaCount = 0;
      let unmatchedCount = 0;

      for (let i = 0; i < nextRoms.length; i++) {
        if (stopRequestedRef.current) break;
        const r = nextRoms[i];
        const m = matchMap.get(r.id);
        if (!m) continue;
        setCurrentActionText(
          tf('app.scrape.downloading', {
            i: downloadedMediaCount + 1,
            total: romsNeedingScrape.length,
            title: r.cleanTitle,
          })
        );

        const titleMatched = isScrapeMatched(m);
        const officialTitle = titleMatched ? m.matchedCanonicalTitle : r.cleanTitle;
        const newCanonicalName = computeCanonicalNameForRom({ ...r, cleanTitle: officialTitle });
        const auditReason = placeholderReasonsById.get(r.id);

        // Качаем только слоты без рабочего файла и только для найденного названия.
        // Файл пишется лишь после проверки скачанного (saveRemoteMediaToHandle), так что
        // рабочее медиа не затирается, если замена не скачалась.
        // Download only slots without a working file, and only for a matched title.
        // A file is written only after the download is verified, so working media is never
        // overwritten by a failed replacement.
        const consoleDirHandle = r.targetDirHandle || r.parentHandle;
        const activeRoot = rootDirHandle || sdTargetDirHandle || libraryDirHandle;
        const hasDisk = Boolean(activeRoot && consoleDirHandle);
        const saved: Partial<Record<MediaSlot, boolean>> | null = hasDisk ? {} : null;
        if (hasDisk && titleMatched && saved) {
          const slots = slotsToDownload(auditsById.get(r.id) || null, scrapeShortVideos);
          const romBaseNoExt = (
            r.isMultiDisc && r.multiDiscFolderName
              ? r.multiDiscFolderName
              : r.fileName.replace(/\.[^/.]+$/, '')
          ).trim();
          const dirFor = async (name: string) => {
            try {
              return await consoleDirHandle.getDirectoryHandle(name, { create: true });
            } catch {
              return null;
            }
          };
          const jobs: Array<[MediaSlot, string | undefined, string, string, 'image' | 'video']> = [
            ['image', m.boxArtUrl, 'images', `${romBaseNoExt}-image.png`, 'image'],
            ['thumb', m.snapUrl, 'images', `${romBaseNoExt}-thumb.png`, 'image'],
            ['marquee', m.marqueeUrl, 'marquees', `${romBaseNoExt}-marquee.png`, 'image'],
            ['video', m.videoUrl, 'videos', `${romBaseNoExt}-video.mp4`, 'video'],
          ];
          for (const [slot, url, folder, fileName, kind] of jobs) {
            if (!url || !slots.has(slot)) continue;
            const dh = await dirFor(folder);
            if (!dh) continue;
            saved[slot] = await saveRemoteMediaToHandle(url, dh, fileName, kind);
          }
        }

        const savedSlots = saved ? (Object.keys(saved) as MediaSlot[]).filter((k) => saved[k]) : [];
        const gotSomething = saved ? savedSlots.length > 0 : titleMatched;
        if (!titleMatched) unmatchedCount++;
        if (gotSomething) downloadedMediaCount++;

        nextRoms[i] = {
          ...r,
          ...mergeScrapedUrls(r, m, saved),
          cleanTitle: officialTitle,
          canonicalName: newCanonicalName,
          titleSource: titleMatched
            ? m.titleSource === 'libretro-fuzzy'
              ? 'libretro-fuzzy'
              : 'libretro-exact'
            : r.titleSource,
          titleNote: titleMatched ? '' : m.reason || r.titleNote,
          mediaStatus: !titleMatched
            ? tf('app.scrape.notMatchedStatus', { reason: m.reason || t('title.note.onlineNoMatch') })
            : saved && !gotSomething
            ? t('app.scrape.nothingSavedStatus')
            : auditReason
            ? tf('app.scrape.reDownloadedStatus', { reason: auditReason })
            : saved
            ? tf('app.scrape.savedStatus', { slots: savedSlots.join(', ') })
            : m.videoUrl
            ? '✔ images/ + marquees/ + videos/'
            : '✔ images/ + marquees/',
        };

        setProgressPct(30 + Math.round(((downloadedMediaCount) / Math.max(1, romsNeedingScrape.length)) * 65));
      }

      const activeRoot = rootDirHandle || sdTargetDirHandle || libraryDirHandle;
      if (activeRoot) {
        const byConsoleHandle = new Map<any, ScannedRomFile[]>();
        for (const r of nextRoms) {
          if (r.status !== 'verified') continue;
          const h = r.targetDirHandle || r.parentHandle;
          if (!h) continue;
          const arr = byConsoleHandle.get(h) || [];
          arr.push(r);
          byConsoleHandle.set(h, arr);
        }
        for (const [cHandle, cRoms] of byConsoleHandle.entries()) {
          await writeGamelistXmlToHandle(cHandle, cRoms);
        }
      }

      romsRef.current = nextRoms;
      setRoms(nextRoms);
      setLastScanMode('replace');
      setScanRevision((n) => n + 1);
      addLog(
        tf('app.scrape.doneLog', {
          skipped: skippedRealMediaCount,
          downloaded: downloadedMediaCount,
        })
      );
      if (unmatchedCount > 0) {
        addLog(tf('app.scrape.unmatchedSummary', { count: unmatchedCount }));
      }

      if (exportBatAfter) {
        generateWindowsCatalogBatScript(nextRoms);
      }
    } catch (err) {
      addLog(tf('app.scrape.errLog', { err: String(err) }));
    } finally {
      setIsScraping(false);
      setProgressPct(100);
    }
  };

  const saveRemoteMediaToHandle = async (
    remoteUrl: string,
    dirHandle: any,
    fileName: string,
    kind: 'image' | 'video' = 'image'
  ): Promise<boolean> => {
    if (!remoteUrl) return false;
    try {
      const resp = await fetch(`/api/r36s/proxy-media?url=${encodeURIComponent(remoteUrl)}`);
      if (!resp.ok) return false;
      const buf = await resp.arrayBuffer();
      if (!isFetchedMediaPayloadValid(buf, kind)) {
        return false; // Reject remote HTTP 1.5KB placeholder stub!
      }
      const fh = await dirHandle.getFileHandle(fileName, { create: true });
      const writable = await fh.createWritable();
      await writable.write(buf);
      await writable.close();
      return true;
    } catch {
      return false;
    }
  };

  // =========================================================================
  // ONLINE RENAME WITH CONSTRUCTOR + SD TARGET PICKER + MASS OPERATIONS
  // =========================================================================
  // Системы Libretro всех ромов библиотеки и текущего скана — для кнопки «Скачать DAT».
  // Libretro systems of all library and scanned ROMs — for the "Download DATs" button.
  const datSystems = useMemo(() => {
    const codes = new Set<string>();
    for (const r of roms) codes.add(r.consoleCode);
    for (const rec of dbState.records || []) if (rec?.consoleCode) codes.add(rec.consoleCode);
    return Array.from(
      new Set(Array.from(codes).map((c) => CONSOLE_CATALOG[c]?.libretroSystem).filter(Boolean) as string[])
    );
  }, [roms, dbState.records]);

  const handleOnlineRenameRoms = async () => {
    const activeList = romsRef.current;
    if (activeList.length === 0 || isAnyProcessRunning) return;

    stopRequestedRef.current = false;
    setIsRenamingNumbered(true);
    setProgressPct(5);
    addLog(t('app.rename.onlineStart'));

    try {
      const targets = activeList.filter((r) => r.status === 'verified');
      const updated = [...activeList];
      let renamed = 0;
      const ONLINE_LOG_LIMIT = 30;
      let onlineExact = 0;
      let onlineFuzzy = 0;
      let onlineMissed = 0;

      const resolvedTitles = new Map<
        string,
        { title: string; source: TitleSource; region?: string; revision?: string; note?: string }
      >();
      const unresolvedReasons = new Map<string, string>();

      // 1. Сверка по хешу с DAT No-Intro / Redump — основной источник названия.
      // 1. Hash match against No-Intro / Redump DATs — the primary title source.
      let datHits = 0;
      const datMisses = new Map<string, string>();
      // Уточнённый статус хака по хешу. / Hack status refined by hash.
      const datMods = new Map<string, RomModInfo>();
      // 0. Для консолей без DAT — скачать DAT No-Intro / Redump из libretro-database.
      // Без DAT ромы с номерами и «кракозябрами» вместо имён не опознать: искать по имени нечего.
      // 0. Consoles without a DAT get No-Intro / Redump DATs from libretro-database.
      // Without a DAT, numbered and garbled names cannot be identified: there is no name to search.
      const neededSystems = Array.from(
        new Set(
          targets
            .map((r) => (CONSOLE_CATALOG[r.consoleCode] || CONSOLE_CATALOG.nes).libretroSystem)
            .filter((sys) => sys && !libretroDatUnsupportedRef.current.has(sys))
        )
      );
      try {
        const missing = systemsWithoutDat(await fetchDatStatus(), neededSystems);
        if (missing.length > 0) {
          const fetchingMsg = tf('app.rename.datFetching', { systems: missing.join(', ') });
          setCurrentActionText(fetchingMsg);
          addLog(fetchingMsg);
          const res = await fetchLibretroDats(missing);
          const failedNames: string[] = [];
          for (const f of res.failed) {
            // Без набора — системы нет в libretro-database, больше не спрашиваем.
            // No set means the system is not in libretro-database; do not ask again.
            if (!f.set) libretroDatUnsupportedRef.current.add(f.system);
            else failedNames.push(`${f.system} (${f.reason || '?'})`);
          }
          addLog(
            tf('app.rename.datFetched', {
              count: res.fetched.length,
              games: res.fetched.reduce((n, f) => n + (f.games || 0), 0),
              failed: failedNames.join(', ') || '—',
            })
          );
        }
      } catch (err) {
        addLog(tf('app.rename.datFetchErr', { err: String(err) }));
      }

      setCurrentActionText(t('app.rename.datStart'));
      const datResults = await lookupTitlesByHash(
        targets.map((r) => ({
          id: r.id,
          fileName: r.fileName,
          extension: r.extension,
          consoleCode: r.consoleCode,
          system: (CONSOLE_CATALOG[r.consoleCode] || CONSOLE_CATALOG.nes).libretroSystem,
          fileObj: r.fileObj,
          companionFiles: r.companionFiles,
          discs: r.discs,
        })),
        {
          shouldStop: () => stopRequestedRef.current,
          onProgress: (done, total, name) => {
            if (done % 10 === 0 || done === total) {
              setCurrentActionText(tf('app.rename.datHashing', { i: done, total, name }));
              setProgressPct(5 + Math.round((done / Math.max(1, total)) * 15));
            }
          },
        }
      );
      if (!datResults) {
        addLog(t('app.rename.datNone'));
      } else {
        for (const r of targets) {
          const m = datResults.get(r.id);
          if (m && r.mod) {
            // Хеш не врёт: совпал с чистым оригиналом — не хак; не нашёлся — ром изменён.
            // The hash is the truth: a clean original match means not a hack; no match means modified.
            // «Не найдено» засчитываем, только если DAT для системы был и хеш в нём не нашёлся.
            // Count a miss only when a DAT for the system was loaded and the hash was not in it.
            const realMiss = !m.matched && /hash not found/i.test(m.reason || '');
            const refined = refineModWithDat(r.mod, m.matched || realMiss ? m : null);
            if (refined !== r.mod) datMods.set(r.id, refined);
          }
          if (m?.matched && m.name) {
            const d = titleFromDatMatch(m, r.isRussian);
            if ((d.title.match(/[a-zA-Zа-яА-ЯёЁ0-9]/g) || []).length < 1) continue;
            resolvedTitles.set(r.id, {
              title: d.title,
              source: d.source,
              region: d.region,
              revision: d.revision,
              note: m.badDump ? t('title.note.datBadDump') : '',
            });
            datHits++;
          } else if (m?.reason) {
            datMisses.set(r.id, m.reason);
          }
        }
        addLog(tf('app.rename.datSummary', { found: datHits, total: targets.length }));
      }

      // 2. Остальное — поиск по названию в индексе Libretro, пачками по 120.
      // 2. The rest — title search in the Libretro index, in chunks of 120.
      // Нечитаемое название (номер, «кракозябры») по имени не ищем: нечёткий поиск по мусору
      // даёт чужую игру. Такие ромы опознаются только по хешу (DAT).
      // Unreadable titles (numbers, mojibake) are not searched by name: a fuzzy search on junk
      // returns a wrong game. Such ROMs can only be identified by hash (DAT).
      const searchTitleById = new Map<string, string>();
      for (const r of targets) {
        if (resolvedTitles.has(r.id)) continue;
        const q = [r.extractedInternalTitle, r.cleanTitle].find(
          (x) => x && isReadableTitle(extractCleanTitle(x))
        );
        if (q) searchTitleById.set(r.id, q);
        else unresolvedReasons.set(r.id, t('title.note.unreadableTitle'));
      }
      const onlineTargets = targets.filter((r) => searchTitleById.has(r.id));
      for (let start = 0; start < onlineTargets.length; start += 120) {
        if (stopRequestedRef.current) break;
        const slice = onlineTargets.slice(start, start + 120);
        try {
          const resp = await fetch('/api/r36s/scrape-batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              items: slice.map((w) => {
                const meta = CONSOLE_CATALOG[w.consoleCode] || CONSOLE_CATALOG.nes;
                const q = searchTitleById.get(w.id) || w.cleanTitle;
                return {
                  id: w.id,
                  cleanTitle: q,
                  comparisonKey: q === w.cleanTitle ? w.comparisonKey : buildComparisonKey(extractCleanTitle(q)),
                  region: w.region,
                  libretroSystem: meta.libretroSystem,
                  archiveVideoId: meta.archiveVideoId,
                };
              }),
            }),
          });
          if (resp.ok) {
            const data = await resp.json();
            for (const res of data.results || []) {
              if (!res?.id) continue;
              // matched === false: сервер не нашёл название и вернул исходное — не выдаём его за найденное.
              if (res.matched !== false && res.matchedCanonicalTitle) {
                resolvedTitles.set(res.id, {
                  title: res.matchedCanonicalTitle,
                  source: res.titleSource === 'libretro-fuzzy' ? 'libretro-fuzzy' : 'libretro-exact',
                });
              } else {
                unresolvedReasons.set(res.id, res.reason || t('title.note.onlineNoMatch'));
              }
            }
          } else {
            const reason = tf('title.note.onlineHttpErr', { status: resp.status });
            for (const w of slice) unresolvedReasons.set(w.id, reason);
          }
        } catch (err) {
          const reason = tf('title.note.onlineNetErr', { err: String(err) });
          for (const w of slice) unresolvedReasons.set(w.id, reason);
        }
        setProgressPct(20 + Math.round(((start + slice.length) / Math.max(1, onlineTargets.length)) * 20));
      }

      for (let i = 0; i < updated.length; i++) {
        if (stopRequestedRef.current) break;
        const r = updated[i];
        if (r.status !== 'verified') continue;

        const resolved = resolvedTitles.get(r.id);
        const bestTitle = resolved?.title || r.cleanTitle;
        const datMiss = datMisses.get(r.id);
        const onlineMiss = unresolvedReasons.get(r.id) || '';
        const unresolvedNote = resolved
          ? resolved.note || ''
          : datMiss
            ? `DAT: ${datMiss}; ${onlineMiss || t('title.note.onlineNoMatch')}`
            : onlineMiss;
        if (!resolved) {
          onlineMissed++;
          if (onlineMissed <= ONLINE_LOG_LIMIT) {
            addLog(tf('app.rename.onlineSkipLog', { file: r.fileName, reason: unresolvedNote || t('title.note.onlineNoMatch') }));
          }
        } else if (resolved.source === 'libretro-fuzzy') {
          onlineFuzzy++;
        } else if (resolved.source === 'libretro-exact') {
          onlineExact++;
        }
        const newCandidate = updateRomWithFilenameConfig(
          {
            ...r,
            mod: datMods.get(r.id) || r.mod,
            cleanTitle: bestTitle,
            region: resolved?.region || r.region,
            revision: resolved?.region ? resolved.revision || '' : r.revision,
          },
          filenameConfigRef.current
        );
        const safeNewName = newCandidate.canonicalName.replace(/[<>:"/\\|?*]/g, '_').trim();

        if (!r.isMultiDisc && safeNewName && safeNewName.toLowerCase() !== r.fileName.toLowerCase()) {
          if (r.parentHandle && r.fileObj) {
            const oldStem = r.fileName.replace(/\.[^/.]+$/, '');
            const newStem = safeNewName.replace(/\.[^/.]+$/, '');
            await writeRomWithCompanionsToDir(r, r.parentHandle, safeNewName, true);
            await renameMediaAndSavesForRom(r.parentHandle, r.parentHandle, oldStem, newStem);
          }
          renamed++;
        }

        updated[i] = {
          ...newCandidate,
          fileName: r.isMultiDisc ? r.fileName : safeNewName,
          canonicalName: safeNewName,
          comparisonKey: buildComparisonKey(bestTitle),
          mediaStatus: tf('app.rename.ctorStatus', { name: safeNewName }),
          titleSource: resolved ? resolved.source : r.titleSource,
          titleNote: unresolvedNote,
        };

        if (i % 15 === 0 || i === updated.length - 1) {
          setCurrentActionText(
            tf('app.rename.renaming', { i: i + 1, total: updated.length, name: safeNewName })
          );
          setProgressPct(40 + Math.round(((i + 1) / Math.max(1, updated.length)) * 55));
        }
      }

      romsRef.current = updated;
      setRoms(updated);
      setLastScanMode('replace');
      setScanRevision((n) => n + 1);
      syncScannedRomsIntoDb(updated, selectedFolderName || dbState.masterLibraryPath, true);
      if (onlineMissed > ONLINE_LOG_LIMIT) {
        addLog(tf('app.rename.skipMore', { count: onlineMissed - ONLINE_LOG_LIMIT }));
      }
      addLog(
        tf('app.rename.onlineSummary', {
          exact: onlineExact,
          fuzzy: onlineFuzzy,
          missed: onlineMissed,
        })
      );
      addLog(tf('app.rename.onlineDone', { renamed, total: targets.length }));
    } catch (err) {
      addLog(tf('app.rename.onlineErr', { err: String(err) }));
    } finally {
      setIsRenamingNumbered(false);
      setProgressPct(100);
    }
  };

  const handleSelectSdFolder = async () => {
    const win = window as any;
    if (typeof win.showDirectoryPicker !== 'function') {
      fallbackInputRef.current?.click();
      return;
    }
    try {
      const handle = await win.showDirectoryPicker({ mode: 'readwrite' });
      await saveDirectoryHandle('sd_target', handle, handle.name);
      setPendingRestoreHandles((prev) => prev.filter((h) => h.key !== 'sd_target'));
      setSdTargetDirHandle(handle);
      setSdTargetFolderName(handle.name);
      setRootDirHandle(handle);
      setSelectedFolderName(handle.name);
      await handleUpdateDbState({ ...dbState, sdCardMountPath: handle.name });
      addLog(tf('app.sd.selectedLog', { name: handle.name }));
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        addLog(tf('app.sd.openErr', { err: String(err) }));
      }
    }
  };

  const handleScanSdFolder = async () => {
    let activeSd = sdTargetDirHandle;
    const win = window as any;
    if (!activeSd && typeof win.showDirectoryPicker === 'function') {
      try {
        activeSd = await win.showDirectoryPicker({ mode: 'readwrite' });
        await saveDirectoryHandle('sd_target', activeSd, activeSd.name);
        setSdTargetDirHandle(activeSd);
        setSdTargetFolderName(activeSd.name);
      } catch (err: any) {
        if (err?.name === 'AbortError') return;
      }
    }
    if (activeSd) {
      setRootDirHandle(activeSd);
      setSelectedFolderName(activeSd.name);
      await scanDirectoryHandleRecursively(activeSd, 'replace');
    } else {
      fallbackInputRef.current?.click();
    }
  };

  const handleMassDeleteRoms = async (targetIds: string[]) => {
    if (targetIds.length === 0 || isAnyProcessRunning) return;
    stopRequestedRef.current = false;
    setIsOrganizing(true);
    setProgressPct(5);
    const idSet = new Set(targetIds);
    const list = romsRef.current;
    let deletedFiles = 0;

    try {
      const remaining: ScannedRomFile[] = [];
      for (let i = 0; i < list.length; i++) {
        const r = list[i];
        if (!idSet.has(r.id)) {
          remaining.push(r);
          continue;
        }
        setCurrentActionText(
          tf('app.mass.deleting', {
            i: deletedFiles + 1,
            total: targetIds.length,
            file: r.fileName,
          })
        );
        if (r.parentHandle) {
          try {
            await r.parentHandle.removeEntry(r.fileName);
            for (const cf of r.companionFiles || []) {
              try {
                await r.parentHandle.removeEntry(cf.name);
              } catch {}
            }
          } catch {}
        }
        deletedFiles++;
        setProgressPct(Math.max(10, Math.round((deletedFiles / targetIds.length) * 95)));
      }

      romsRef.current = remaining;
      setRoms(remaining);
      setLastScanMode('replace');
      setScanRevision((n) => n + 1);
      syncScannedRomsIntoDb(remaining, selectedFolderName || dbState.masterLibraryPath, true);
      addLog(tf('app.mass.deleteDone', { count: deletedFiles }));
    } catch (err) {
      addLog(tf('app.mass.deleteErr', { err: String(err) }));
    } finally {
      setIsOrganizing(false);
      setProgressPct(100);
    }
  };

  const handleMassMoveRoms = async (targetIds: string[]) => {
    if (targetIds.length === 0 || isAnyProcessRunning) return;
    const win = window as any;
    let destRoot = combineTargetDirHandle;
    if (!destRoot && typeof win.showDirectoryPicker === 'function') {
      try {
        destRoot = await win.showDirectoryPicker({ mode: 'readwrite' });
        await saveDirectoryHandle('combine_target', destRoot, destRoot.name);
        setCombineTargetDirHandle(destRoot);
        setCombineTargetFolderName(destRoot.name);
      } catch (err: any) {
        if (err?.name === 'AbortError') return;
      }
    }
    if (!destRoot) {
      addLog(t('app.mass.pickDest'));
      return;
    }

    stopRequestedRef.current = false;
    setIsOrganizing(true);
    setProgressPct(5);
    const idSet = new Set(targetIds);
    const list = romsRef.current;
    let movedCount = 0;

    try {
      const updated = [...list];
      for (let i = 0; i < updated.length; i++) {
        if (stopRequestedRef.current) break;
        const r = updated[i];
        if (!idSet.has(r.id)) continue;

        const { dirHandle: destConsoleDir, subPath } = await resolveConsoleTargetDirHandle(destRoot, r);
        setCurrentActionText(
          tf('app.mass.moving', {
            i: movedCount + 1,
            total: targetIds.length,
            file: r.fileName,
          })
        );

        if (r.isMultiDisc && Array.isArray(r.discs) && r.discs.length > 1) {
          updated[i] = await writeMultiDiscSetToConsoleDir(r, destConsoleDir, subPath, true, true);
        } else if (r.fileObj && r.parentHandle) {
          const oldStem = r.fileName.replace(/\.[^/.]+$/, '');
          await writeRomWithCompanionsToDir(r, destConsoleDir, r.fileName, true);
          await renameMediaAndSavesForRom(r.parentHandle, destConsoleDir, oldStem, oldStem);
          updated[i] = {
            ...r,
            sourceSubfolder: subPath,
            relativePath: `${subPath}/${r.fileName}`,
            parentHandle: destConsoleDir,
            targetDirHandle: destConsoleDir,
          };
        }
        movedCount++;
        setProgressPct(Math.max(10, Math.round((movedCount / targetIds.length) * 95)));
      }

      romsRef.current = updated;
      setRoms(updated);
      setLastScanMode('replace');
      setScanRevision((n) => n + 1);
      syncScannedRomsIntoDb(updated, destRoot.name, true);
      addLog(tf('app.mass.moveDone', { folder: destRoot.name, count: movedCount }));
    } catch (err) {
      addLog(tf('app.mass.moveErr', { err: String(err) }));
    } finally {
      setIsOrganizing(false);
      setProgressPct(100);
    }
  };

  const handleMassSplitRoms = async (
    splitMode: 'by_console' | 'alphabetical' | 'disc_vs_cartridge' | 'multidisc_subfolders'
  ) => {
    if (isAnyProcessRunning) return;
    if (splitMode === 'multidisc_subfolders') {
      await handleGroupMultiDiscFolders();
      return;
    }

    const activeRoot =
      combineTargetDirHandle || rootDirHandle || libraryDirHandle || sortTargetDirHandle;
    if (!activeRoot || romsRef.current.length === 0) {
      addLog(t('app.mass.splitNeedFolders'));
      return;
    }

    stopRequestedRef.current = false;
    setIsOrganizing(true);
    setProgressPct(5);
    const list = romsRef.current.filter((r) => r.status === 'verified');
    let splitMoved = 0;

    try {
      const updated = [...romsRef.current];
      for (let i = 0; i < updated.length; i++) {
        if (stopRequestedRef.current) break;
        const r = updated[i];
        if (r.status !== 'verified' || !r.parentHandle || !r.fileObj || r.isMultiDisc) continue;

        let relFolder = r.consoleCode;
        if (splitMode === 'alphabetical') {
          const ch = (r.cleanTitle || r.fileName).trim().charAt(0).toUpperCase();
          const bucket = /^[0-9]/.test(ch)
            ? '0-9'
            : /^[A-F]/.test(ch)
            ? 'A-F'
            : /^[G-M]/.test(ch)
            ? 'G-M'
            : /^[N-S]/.test(ch)
            ? 'N-S'
            : /^[T-Z]/.test(ch)
            ? 'T-Z'
            : 'Other_Intl';
          relFolder = `${r.consoleCode}/${bucket}`;
        } else if (splitMode === 'disc_vs_cartridge') {
          const isOptical = ['.chd', '.cue', '.iso', '.pbp', '.cso', '.bin+.cue'].includes(
            r.extension.toLowerCase()
          );
          relFolder = `${isOptical ? 'CD_ISO_Images' : 'Cartridges'}/${r.consoleCode}`;
        }

        let destDir = activeRoot;
        for (const seg of relFolder.split('/').filter(Boolean)) {
          destDir = await destDir.getDirectoryHandle(seg, { create: true });
        }

        if (!(await isSameDirHandle(r.parentHandle, destDir))) {
          await writeRomWithCompanionsToDir(r, destDir, r.fileName, true);
          const stem = r.fileName.replace(/\.[^/.]+$/, '');
          await renameMediaAndSavesForRom(r.parentHandle, destDir, stem, stem);
          updated[i] = {
            ...r,
            sourceSubfolder: relFolder,
            relativePath: `${relFolder}/${r.fileName}`,
            parentHandle: destDir,
            targetDirHandle: destDir,
          };
          splitMoved++;
        }

        if (i % 10 === 0 || i === list.length - 1) {
          setCurrentActionText(
            tf('app.mass.splitting', { i: i + 1, total: updated.length, folder: relFolder })
          );
          setProgressPct(Math.max(10, Math.round(((i + 1) / Math.max(1, updated.length)) * 95)));
        }
      }

      romsRef.current = updated;
      setRoms(updated);
      setLastScanMode('replace');
      setScanRevision((n) => n + 1);
      syncScannedRomsIntoDb(updated, activeRoot.name, true);
      addLog(tf('app.mass.splitDone', { mode: splitMode, count: splitMoved }));
    } catch (err) {
      addLog(tf('app.mass.splitErr', { err: String(err) }));
    } finally {
      setIsOrganizing(false);
      setProgressPct(100);
    }
  };

  const resolveExistingMediaInDirHandle = async (
    consoleDirHandle: any,
    baseNoExt: string,
    cleanTitle: string
  ): Promise<{ imgRel: string; thumbRel: string; marqueeRel: string; videoRel: string }> => {
    let imgRel = '';
    let thumbRel = '';
    let marqueeRel = '';
    let videoRel = '';

    const candidateBases = Array.from(
      new Set([baseNoExt, cleanTitle.replace(/[<>:"/\\|?*]/g, '_').trim(), cleanTitle.trim()].filter(Boolean))
    );
    const imgFolders = ['images', 'downloaded_images', 'download_images', 'boxart', 'snap'];
    const imgSuffixes = ['-image.png', '.png', '-image.jpg', '.jpg', '.jpeg', '-thumb.png', '-thumb.jpg'];

    for (const folder of imgFolders) {
      try {
        const subDir = await consoleDirHandle.getDirectoryHandle(folder);
        for (const base of candidateBases) {
          for (const sfx of imgSuffixes) {
            try {
              const fh = await subDir.getFileHandle(`${base}${sfx}`);
              const f = await fh.getFile();
              if (f.size > 0) {
                if (!imgRel) imgRel = `./${folder}/${base}${sfx}`;
                if (!thumbRel && (sfx.includes('thumb') || sfx === '.png' || sfx === '.jpg')) {
                  thumbRel = `./${folder}/${base}${sfx}`;
                }
              }
            } catch {}
          }
        }
      } catch {}
    }

    if (!thumbRel && imgRel) thumbRel = imgRel;
    if (!imgRel && thumbRel) imgRel = thumbRel;

    try {
      const mDir = await consoleDirHandle.getDirectoryHandle('marquees');
      for (const base of candidateBases) {
        for (const sfx of ['-marquee.png', '.png', '.jpg']) {
          try {
            const fh = await mDir.getFileHandle(`${base}${sfx}`);
            const f = await fh.getFile();
            if (f.size > 0) {
              marqueeRel = `./marquees/${base}${sfx}`;
              break;
            }
          } catch {}
        }
        if (marqueeRel) break;
      }
    } catch {}

    try {
      const vDir = await consoleDirHandle.getDirectoryHandle('videos');
      for (const base of candidateBases) {
        for (const sfx of ['-video.mp4', '.mp4']) {
          try {
            const fh = await vDir.getFileHandle(`${base}${sfx}`);
            const f = await fh.getFile();
            if (f.size > 0) {
              videoRel = `./videos/${base}${sfx}`;
              break;
            }
          } catch {}
        }
        if (videoRel) break;
      }
    } catch {}

    return { imgRel, thumbRel, marqueeRel, videoRel };
  };

  const writeGamelistXmlToHandle = async (consoleDirHandle: any, consoleRoms: ScannedRomFile[]) => {
    try {
      // 1. Preserve backup of original factory gamelist.xml before modifying it
      let backupMap = new Map<string, string>();
      // Записи текущего gamelist.xml: из них берём медиа, описание и прочие поля, которые
      // сами не нашли, и переносим записи ромов, которых нет в списке, но файл есть.
      // Current gamelist.xml entries: media, description and other fields we did not find
      // ourselves come from here, and entries for ROMs outside the list (file still present) are kept.
      let prevEntries: GamelistEntry[] = [];
      let prevIdx = new Map<string, GamelistEntry>();
      let factoryIdx = new Map<string, GamelistEntry>();
      try {
        const origHandle = await consoleDirHandle.getFileHandle('gamelist.xml');
        const origFile = await origHandle.getFile();
        const origText = await origFile.text();
        backupMap = parseGamelistXmlString(origText);
        prevEntries = parseGamelistEntries(origText);
        prevIdx = indexGamelistEntries(prevEntries);
        try {
          await consoleDirHandle.getFileHandle('gamelist_factory_backup.xml');
        } catch {
          if (origText.length > 32) {
            const bHandle = await consoleDirHandle.getFileHandle('gamelist_factory_backup.xml', {
              create: true,
            });
            const bw = await bHandle.createWritable();
            await bw.write(origText);
            await bw.close();
          }
        }
      } catch {}

      try {
        const bHandle = await consoleDirHandle.getFileHandle('gamelist_factory_backup.xml');
        const bFile = await bHandle.getFile();
        const bText = await bFile.text();
        const bMap = parseGamelistXmlString(bText);
        for (const [k, v] of bMap.entries()) {
          if (!backupMap.has(k)) backupMap.set(k, v);
        }
        factoryIdx = indexGamelistEntries(parseGamelistEntries(bText));
      } catch {}

      const writtenPaths = new Set<string>();
      const lines: string[] = ['<?xml version="1.0" encoding="utf-8"?>', '<gameList>'];
      for (const r of consoleRoms) {
        const baseNoExt = r.fileName.replace(/\.[^/.]+$/, '');
        let cleanTitle = r.cleanTitle;
        if (!cleanTitle || PURE_NUMBERED_ROM_REGEX.test(cleanTitle)) {
          const fromBackup =
            backupMap.get(r.fileName.toLowerCase()) || backupMap.get(baseNoExt.toLowerCase());
          if (fromBackup && !PURE_NUMBERED_ROM_REGEX.test(fromBackup)) {
            cleanTitle = fromBackup;
          } else if (r.extractedInternalTitle && !PURE_NUMBERED_ROM_REGEX.test(r.extractedInternalTitle)) {
            cleanTitle = r.extractedInternalTitle;
          }
        }
        const displayName =
          r.isRussian && !cleanTitle.toUpperCase().includes('[RUS]')
            ? `${cleanTitle} [RUS]`
            : cleanTitle;
        const meta = CONSOLE_CATALOG[r.consoleCode] || CONSOLE_CATALOG.nes;

        let { imgRel, thumbRel, marqueeRel, videoRel } = await resolveExistingMediaInDirHandle(
          consoleDirHandle,
          r.isMultiDisc && r.multiDiscFolderName ? r.multiDiscFolderName : baseNoExt,
          cleanTitle
        );

        const isMulti = Boolean(r.isMultiDisc && Array.isArray(r.discs) && r.discs.length > 1);
        const xmlPath =
          isMulti && r.multiDiscFolderName && r.m3uFileName
            ? `./${r.multiDiscFolderName}/${r.m3uFileName}`
            : `./${r.fileName}`;
        writtenPaths.add(normalizeGamelistPath(xmlPath));

        // Медиа и поля из прежней записи, если сами не нашли. Ссылку берём, только если файл на месте.
        // Media and fields from the previous entry when not found ourselves; a link only if the file exists.
        const prevKey = isMulti && r.m3uFileName ? r.m3uFileName : r.fileName;
        const prev = findGamelistEntry(prevIdx, prevKey) || findGamelistEntry(factoryIdx, prevKey);
        const keepRef = async (cur: string, tag: string) => {
          const ref = prev?.fields[tag];
          if (cur || !ref) return cur;
          return (await relativeFileExists(consoleDirHandle, ref)) ? unescapeXml(ref) : cur;
        };
        imgRel = await keepRef(imgRel, 'image');
        thumbRel = await keepRef(thumbRel, 'thumbnail');
        marqueeRel = await keepRef(marqueeRel, 'marquee');
        videoRel = await keepRef(videoRel, 'video');
        if (!imgRel && thumbRel) imgRel = thumbRel;

        lines.push('  <game>');
        lines.push(`    <path>${escapeXml(xmlPath)}</path>`);
        lines.push(`    <name>${escapeXml(displayName)}</name>`);
        const localizedConsole =
          meta.code === 'ports' ? tStatic('cat.portmasterName') : meta.displayName;
        const localizedGen =
          r.generationShort === 'Handheld' ? tStatic('cat.portableGen') : r.generationShort;
        const descLine =
          tfStatic('app.consoleDetailLine', {
            console: localizedConsole,
            gen: localizedGen,
            region: r.region,
          }) +
          (isMulti
            ? tfStatic('app.consoleDiscsPart', { count: r.discs!.length })
            : tfStatic('app.consoleCrcPart', { crc: r.headerlessCrc32 }));
        // Поля прежней записи уже экранированы — пишем как есть. / Previous fields are already escaped.
        const pf = prev?.fields || {};
        lines.push(`    <desc>${pf.desc || escapeXml(descLine)}</desc>`);
        if (imgRel) lines.push(`    <image>${escapeXml(imgRel)}</image>`);
        if (thumbRel) lines.push(`    <thumbnail>${escapeXml(thumbRel)}</thumbnail>`);
        if (marqueeRel) lines.push(`    <marquee>${escapeXml(marqueeRel)}</marquee>`);
        if (videoRel) lines.push(`    <video>${escapeXml(videoRel)}</video>`);
        lines.push(`    <rating>${pf.rating || '0.9'}</rating>`);
        if (pf.releasedate) lines.push(`    <releasedate>${pf.releasedate}</releasedate>`);
        if (pf.developer) lines.push(`    <developer>${pf.developer}</developer>`);
        if (pf.publisher) lines.push(`    <publisher>${pf.publisher}</publisher>`);
        lines.push(`    <genre>${pf.genre || escapeXml(localizedConsole)}</genre>`);
        if (pf.players) lines.push(`    <players>${pf.players}</players>`);
        lines.push(`    <region>${escapeXml(r.region)}</region>`);
        lines.push('  </game>');

        // Hide individual discs inside subfolder so EmulationStation / ArkOS lists only the single .m3u entry
        if (isMulti && r.multiDiscFolderName) {
          for (let di = 0; di < r.discs!.length; di++) {
            const d = r.discs![di];
            lines.push('  <game>');
            writtenPaths.add(normalizeGamelistPath(`./${r.multiDiscFolderName}/${d.fileName}`));
            lines.push(
              `    <path>${escapeXml(`./${r.multiDiscFolderName}/${d.fileName}`)}</path>`
            );
            lines.push(
              `    <name>${escapeXml(`${displayName} (Disc ${d.discNumber || di + 1})`)}</name>`
            );
            lines.push('    <hidden>true</hidden>');
            lines.push('  </game>');
          }
        }
      }
      // Записи ромов вне списка (хаки, другие статусы, подпапки) не выкидываем, если файл на месте.
      // Entries for ROMs outside the list (hacks, other statuses, subfolders) stay if the file exists.
      for (const e of prevEntries) {
        const key = normalizeGamelistPath(e.path);
        if (!key || writtenPaths.has(key)) continue;
        writtenPaths.add(key);
        if (await relativeFileExists(consoleDirHandle, e.path)) lines.push(`  ${e.raw}`);
      }
      lines.push('</gameList>');

      const fh = await consoleDirHandle.getFileHandle('gamelist.xml', { create: true });
      const writable = await fh.createWritable();
      await writable.write(lines.join('\n'));
      await writable.close();
    } catch {}
  };

  const handleUndo = async () => {
    if (undoStack.length === 0 || isOrganizing) return;
    setIsOrganizing(true);
    addLog(tf('app.undo.start', { count: undoStack.length }));
    let restored = 0;

    try {
      for (let i = undoStack.length - 1; i >= 0; i--) {
        const u = undoStack[i];
        const movedFast = await tryFastMoveFile(u.fromDirHandle, u.fromName, u.toDirHandle, u.toName);
        if (!movedFast) {
          if (u.fileData && u.fileData.byteLength > 0) {
            const origHandle = await u.toDirHandle.getFileHandle(u.toName, { create: true });
            const writable = await origHandle.createWritable();
            await writable.write(u.fileData);
            await writable.close();
            try {
              await u.fromDirHandle.removeEntry(u.fromName);
            } catch {}
          } else {
            const srcFh = await u.fromDirHandle.getFileHandle(u.fromName);
            const srcFile = await srcFh.getFile();
            await streamWriteFileToDir(srcFile, u.toDirHandle, u.toName);
            await u.fromDirHandle.removeEntry(u.fromName);
          }
        }
        restored++;
      }
      setUndoStack([]);
      addLog(tf('app.undo.done', { count: restored }));
      if (rootDirHandle) {
        await scanDirectoryHandleRecursively(rootDirHandle, 'replace');
      }
    } catch (err) {
      addLog(tf('app.undo.err', { err: String(err) }));
    } finally {
      setIsOrganizing(false);
    }
  };

  const generateWindowsCatalogBatScript = (list: ScannedRomFile[]) => {
    const lines: string[] = [
      '@echo off',
      'chcp 65001 >nul',
      'echo ====================================================================',
      `echo  ${t('app.bat.cmdTitle')}`,
      'echo ====================================================================',
      '',
    ];

    for (const r of list) {
      if (r.status === 'verified') continue;
      const winRelPath = r.relativePath.replace(/\//g, '\\');
      if (deleteJunkPermanently) {
        lines.push(`del /f /q "${winRelPath}"`);
      } else {
        const folder =
          r.status === 'junk_bad_dump'
            ? `_BadDumps_Junk\\${r.consoleCode}`
            : `_Duplicates_1G1R\\${r.consoleCode}`;
        lines.push(`if not exist "${folder}" mkdir "${folder}"`);
        lines.push(
          `move /y "${winRelPath}" "${folder}\\${r.headerlessCrc32.slice(0, 6)}_${r.fileName}" >nul`
        );
      }
    }

    lines.push('');
    for (const r of list) {
      if (r.status !== 'verified') continue;
      const winRelPath = r.relativePath.replace(/\//g, '\\');
      const safeNewName = r.canonicalName.replace(/[<>:"/\\|?*]/g, '_').trim();
      const baseNoExt = safeNewName.replace(/\.[^/.]+$/, '');

      const folder =
        catalogMode === 'gen_then_console'
          ? `Organized\\${r.generationFolder}\\${r.consoleCode}`
          : catalogMode === 'r36s_gen_direct'
          ? `${r.generationFolder}\\${r.consoleCode}`
          : `${r.consoleCode}`;

      lines.push(`if not exist "${folder}\\images" mkdir "${folder}\\images"`);
      lines.push(`if not exist "${folder}\\marquees" mkdir "${folder}\\marquees"`);
      lines.push(`if not exist "${folder}\\videos" mkdir "${folder}\\videos"`);

      if (r.isMultiDisc && Array.isArray(r.discs) && r.discs.length > 1) {
        const subFolder = (
          r.multiDiscFolderName ||
          buildMultiDiscFolderName(r.cleanTitle, normalizeRegionTag(r.region, r.isRussian), r.isRussian)
        ).replace(/[<>:"/\\|?*]/g, '_');
        const m3uName = `${subFolder}.m3u`;
        lines.push(`if not exist "${folder}\\${subFolder}" mkdir "${folder}\\${subFolder}"`);
        const discEchoes: string[] = [];
        for (let di = 0; di < r.discs.length; di++) {
          const d = r.discs[di];
          const dWinRel = d.relativePath.replace(/\//g, '\\');
          const discFile = buildDiscTargetFilename(
            subFolder,
            d.discNumber || di + 1,
            normalizeDiskOutputExt(d.extension)
          ).replace(/[<>:"/\\|?*]/g, '_');
          lines.push(`move /y "${dWinRel}" "${folder}\\${subFolder}\\${discFile}" >nul`);
          discEchoes.push(discFile);
        }
        lines.push(`(`);
        for (const fn of discEchoes) {
          lines.push(`  echo ${fn}`);
        }
        lines.push(`) > "${folder}\\${subFolder}\\${m3uName}"`);
      } else {
        lines.push(`move /y "${winRelPath}" "${folder}\\${safeNewName}" >nul`);
      }

      const mediaStem =
        r.isMultiDisc && r.multiDiscFolderName ? r.multiDiscFolderName : baseNoExt;

      if (r.scrapedBoxArtUrl) {
        lines.push(
          `curl -sL "${r.scrapedBoxArtUrl}" -o "${folder}\\images\\${mediaStem}-image.png"`
        );
      }
      if (r.scrapedMarqueeUrl) {
        lines.push(
          `curl -sL "${r.scrapedMarqueeUrl}" -o "${folder}\\marquees\\${mediaStem}-marquee.png"`
        );
      }
      if (scrapeShortVideos && r.scrapedVideoUrl) {
        lines.push(
          `curl -sL "${r.scrapedVideoUrl}" -o "${folder}\\videos\\${mediaStem}-video.mp4"`
        );
      }
    }

    lines.push('echo.');
    lines.push(`echo ${t('app.cmd.scriptFooterDone')}`);
    lines.push('pause');

    const blob = new Blob([lines.join('\r\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'AegisROM_Hierarchy_R36S.bat';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    addLog(t('app.bat.downloaded'));
  };

  const stats = useMemo(() => {
    let clean = 0;
    let clones = 0;
    let junk = 0;
    let numbered = 0;
    let scraped = 0;
    for (const r of roms) {
      if (r.isNumberedName || r.extractedInternalTitle) numbered++;
      if (r.status === 'verified') {
        clean++;
        if (r.scrapedBoxArtUrl) scraped++;
      } else if (r.status === 'duplicate_clone') {
        clones++;
      } else {
        junk++;
      }
    }
    return { total: roms.length, clean, clones, junk, numbered, scraped };
  }, [roms]);

  const filteredRoms = useMemo(() => {
    return roms.filter((r) => {
      if (statusFilter === 'numbered') {
        if (!r.isNumberedName && !r.extractedInternalTitle) return false;
      } else if (statusFilter !== 'all' && r.status !== statusFilter) {
        return false;
      }
      if (searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase();
        return (
          r.fileName.toLowerCase().includes(q) ||
          r.canonicalName.toLowerCase().includes(q) ||
          r.extractedInternalTitle.toLowerCase().includes(q) ||
          r.consoleCode.toLowerCase().includes(q) ||
          r.sourceSubfolder.toLowerCase().includes(q) ||
          r.headerlessCrc32.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [roms, statusFilter, searchQuery]);

  const catalogModeTooltip =
    catalogMode === 'r36s_flat_console'
      ? t('app.tip.catalogFlat')
      : catalogMode === 'gen_then_console'
      ? t('app.tip.catalogOrg')
      : t('app.tip.catalogGen');

  const priorityTooltip =
    priorityPreset === 'rus_first'
      ? t('app.tip.prioRus')
      : priorityPreset === 'usa_first'
      ? t('app.tip.prioUsa')
      : priorityPreset === 'eur_first'
      ? t('app.tip.prioEur')
      : t('app.tip.prioJpn');

  const convertScannedRomToUnifiedRow = (r: ScannedRomFile): UnifiedGameRow => {
    const meta = CONSOLE_CATALOG[r.consoleCode] || CONSOLE_CATALOG.psx;
    const displayTitle =
      r.isNumberedName && r.extractedInternalTitle
        ? r.extractedInternalTitle
        : r.cleanTitle || extractCleanTitle(r.fileName);
    const { genre, releaseYear } = inferGenreAndYear(displayTitle, r.consoleCode);
    const isMulti = Boolean(r.isMultiDisc && Array.isArray(r.discs) && r.discs.length > 1);
    const mappedDiscs: MultiDiscEntry[] | undefined = isMulti
      ? r.discs!.map((d, idx) => ({
          id: d.id,
          discNumber: d.discNumber || idx + 1,
          title: `${displayTitle} (Disc ${d.discNumber || idx + 1})`,
          oldFile: d.fileName,
          cleanFile: d.canonicalName,
          relativePath: d.relativePath,
          size: formatSize(d.fileSize),
          totalBytes: d.fileSize,
          crc32: d.headerlessCrc32,
          sourceExt: d.extension,
          fileObj: d.fileObj,
          companionFiles: d.companionFiles,
          cueText: d.cueText,
        }))
      : undefined;

    const folderLabel =
      isMulti && r.multiDiscFolderName && r.m3uFileName
        ? `${r.multiDiscFolderName}/${r.m3uFileName} (${tf('lib.multiDiscCount', {
            count: mappedDiscs!.length,
          })})`
        : r.canonicalName;

    const localizedConsole =
      meta.code === 'ports' ? t('cat.portmasterName') : meta.displayName;
    const localizedBitness =
      r.generationShort === 'Handheld' ? t('cat.portableGen') : r.generationShort;

    return {
      id: r.id,
      title: displayTitle,
      oldFile: isMulti
        ? `${mappedDiscs![0].oldFile} (${tf('lib.discsRangeLabel', { count: mappedDiscs!.length })})`
        : r.fileName,
      cleanFile: folderLabel,
      console: localizedConsole,
      consoleShort: r.consoleCode.toUpperCase(),
      bitness: localizedBitness,
      region: normalizeRegionTag(r.region, r.isRussian),
      genre: genre || localizedConsole,
      year: releaseYear || 1998,
      size: formatSize(r.fileSize),
      crc32: r.headerlessCrc32,
      serial: r.crc32,
      emulator: r.consoleCode === 'psx' ? 'DuckStation ★' : 'RetroArch ★',
      status: r.mediaStatus || r.reason,
      boxArtUrl: r.scrapedBoxArtUrl,
      videoUrl: r.scrapedVideoUrl,
      fileObj: r.fileObj,
      companionFiles: r.companionFiles,
      cueText: r.cueText,
      totalBytes: r.fileSize,
      trackCount: r.companionFiles?.length,
      sourceExt: r.extension,
      relativePath: r.relativePath,
      discNumber: r.discNumber ?? undefined,
      discCount: mappedDiscs ? mappedDiscs.length : undefined,
      isMultiDisc: isMulti,
      multiDiscFolderName: r.multiDiscFolderName,
      m3uFileName: r.m3uFileName,
      discs: mappedDiscs,
      titleSource: r.titleSource,
      titleNote: r.titleNote,
      modKind: r.mod?.kind,
      modTag: modTag(r.mod) || undefined,
      modLang: r.mod?.language,
      modNote: describeRomMod(r.mod, tf) || undefined,
    };
  };

  const unifiedScannedRows = useMemo(() => {
    return roms.map(convertScannedRomToUnifiedRow);
  }, [roms, lang]);

  return (
    <div className="h-screen w-screen overflow-hidden bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 flex flex-col font-sans transition-colors">
      <input
        ref={fallbackInputRef}
        type="file"
        // @ts-expect-error webkitdirectory is supported in Chromium/Edge/Firefox
        webkitdirectory="true"
        directory="true"
        multiple
        className="hidden"
        onChange={handleFallbackDirectoryInput}
      />

      <input
        ref={importLibraryFileInputRef}
        type="file"
        accept=".json,.xml"
        multiple
        className="hidden"
        onChange={handleImportLibraryFiles}
      />

      <FigmaConceptStudio
        navigateRequest={navigateRequest}
        onOpenSetupWizard={handleOpenSetupWizard}
        selectedConcept={selectedFigmaConcept}
        onSelectConcept={(cid) => {
          setSelectedFigmaConcept(cid);
          addLog(
            tf('lib.viewSwitchedLog', {
              mode:
                cid === 'concept_a_sidebar'
                  ? t('header.viewShort.concept_a_sidebar')
                  : cid === 'concept_b_split'
                  ? t('header.viewShort.concept_b_split')
                  : t('header.viewShort.concept_c_workbench'),
            })
          );
        }}
        isDarkMode={isDarkMode}
        onToggleDarkMode={() => {
          setIsDarkMode((d) => {
            const next = !d;
            addLog(next ? `🌙 ${t('lib.themeDarkLog')}` : `☀ ${t('lib.themeLightLog')}`);
            return next;
          });
        }}
        onOpenXmlModal={() => setXmlModalOpen(true)}
        selectedFolderName={selectedFolderName}
        libraryPath={dbState.masterLibraryPath}
        onSelectLibraryPath={handleSelectLibraryPath}
        onImportLibrary={() => importLibraryFileInputRef.current?.click()}
        onExportLibrary={handleExportLibrary}
        romsCount={roms.length || dbState.records.length || 630}
        scannedRows={unifiedScannedRows}
        isAnyProcessRunning={isAnyProcessRunning}
        progressPct={progressPct}
        currentActionText={currentActionText || logs[logs.length - 1] || ''}
        pendingRestoreHandles={pendingRestoreHandles}
        onRestoreSavedPermissions={handleRestoreSavedFolderPermissions}
        mediaAccessVersion={mediaAccessVersion}
        hasMediaFolderAccess={Boolean(libraryDirHandle || rootDirHandle)}
        onResolveMediaForDbRows={handleResolveMediaForDbRows}
        logs={logs}
        onClearLogs={() => setLogs([t('status.cleared')])}
        onEmergencyStop={handleEmergencyStop}
        onSelectAndScanFolder={() => handleSelectAndScanFolder('replace')}
        onAddFolderToLibrary={handleAddFolderToLibrary}
        onScanExternalSourceForDiff={scanExternalSourceForDiff}
        lastScanMode={lastScanMode}
        scanRevision={scanRevision}
        onOrganizeCatalog={() => handleRun1G1R()}
        onGroupMultiDiscFolders={handleGroupMultiDiscFolders}
        autoGroupMultiDisc={autoGroupMultiDisc}
        onChangeAutoGroupMultiDisc={setAutoGroupMultiDisc}
        onScrapeMedia={() => handleScrapeR36SMedia(roms)}
        onOnlineRename={() => handleOnlineRenameRoms()}
        datSystems={datSystems}
        onScanPhantomFolders={handleScanPhantomFolders}
        onRepairSdCard={(fw) => handleRepairR36SSDCard(fw as any)}
        sdTargetFolderName={sdTargetFolderName}
        onSelectSdFolder={handleSelectSdFolder}
        onScanSdFolder={handleScanSdFolder}
        sdFirmwareId={sdFirmwareId}
        onChangeSdFirmwareId={(fw) => setSdFirmwareId(fw as any)}
        onMassDeleteRoms={handleMassDeleteRoms}
        onMassMoveRoms={handleMassMoveRoms}
        onMassSplitRoms={handleMassSplitRoms}
        onUndo={handleUndo}
        canUndo={undoStack.length > 0}
        catalogMode={catalogMode}
        onChangeCatalogMode={setCatalogMode}
        priorityPreset={priorityPreset}
        onChangePriorityPreset={handlePriorityChange}
        autoScrapeAfterSort={autoScrapeAfterSort}
        onChangeAutoScrape={setAutoScrapeAfterSort}
        scrapeShortVideos={scrapeShortVideos}
        onChangeScrapeShortVideos={setScrapeShortVideos}
        deleteJunkPermanently={deleteJunkPermanently}
        onChangeDeleteJunk={setDeleteJunkPermanently}
        filenameConfig={filenameConfig}
        onChangeFilenameConfig={handleChangeFilenameConfig}
        sortTargetFolderName={sortTargetFolderName || selectedFolderName || dbState.masterLibraryPath}
        onSelectSortTargetFolder={handleSelectSortTargetFolder}
        onApplySortRulesInFolder={handleApplySortRulesInFolder}
        bufferFolderName={bufferFolderName}
        onSelectBufferFolder={handleSelectBufferFolder}
        combineTargetFolderName={
          combineTargetFolderName || sortTargetFolderName || selectedFolderName || dbState.masterLibraryPath
        }
        onSelectCombineTargetFolder={handleSelectCombineTargetFolder}
        combineMoveMode={combineMoveMode}
        onChangeCombineMoveMode={setCombineMoveMode}
        combineDedup1G1R={combineDedup1G1R}
        onChangeCombineDedup1G1R={setCombineDedup1G1R}
        combineSortFolders={combineSortFolders}
        onChangeCombineSortFolders={setCombineSortFolders}
        combineAddToLibrary={combineAddToLibrary}
        onChangeCombineAddToLibrary={setCombineAddToLibrary}
        bufferPreviewItems={bufferPreviewItems}
        onRunBufferAutoProcess={handleRunBufferAutoProcess}
        onDownloadBufferCmdScript={handleDownloadBufferCmdScript}
        isNativeDesktopHost={isNativeDesktopHost}
        onDownloadExe={handleDownloadExe}
        onDownloadZip={handleDownloadZip}
        onAddLog={addLog}
        emulatorCustomPaths={dbState.emulatorCustomPaths}
        starredEmulatorsByConsole={dbState.starredEmulatorsByConsole}
        onUpdateEmulatorConfig={(customPaths, starredMap) => {
          setDbState((prev) => ({
            ...prev,
            emulatorCustomPaths: customPaths,
            starredEmulatorsByConsole: starredMap,
          }));
        }}
      />

      <HackMoveModal
        candidates={hackMoveCandidates}
        busy={isOrganizing}
        onConfirm={(ids) => void handleMoveHacksToHackroms(ids)}
        onClose={() => setHackMoveCandidates([])}
      />

      {/* Interactive XML & Deep Header Mapping Modal */}
      <XmlMappingModal
        isOpen={xmlModalOpen}
        onClose={() => setXmlModalOpen(false)}
        scannedFileNames={new Set(roms.map((r) => r.fileName.toLowerCase()))}
        scannedDiskRoms={roms.map((r) => ({
          fileName: r.fileName,
          extractedInternalTitle: r.extractedInternalTitle,
          consoleCode: r.consoleCode,
        }))}
        filenameConfig={filenameConfig}
        isApplying={isApplyingXml}
        progressPct={progressPct}
        onStopApplying={handleEmergencyStop}
        onApplyMappings={handleApplyXmlMappings}
        onExportBatForMappings={handleExportBatForXmlMappings}
      />

      {/* Interactive Phantom Folders Modal (download_images vs images) */}
      {phantomModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-300 rounded-2xl max-w-4xl w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
              <div>
                <div className="text-xs text-rose-700 font-bold uppercase">
                  {t('appModal.phantomBadge')}
                </div>
                <h3 className="text-xl font-extrabold text-slate-900 mt-1">
                  {tf('appModal.phantomTitle', { count: phantomFolders.length })}
                </h3>
                <p className="text-sm text-slate-700 mt-1.5 leading-relaxed">
                  {t('appModal.phantomDesc')}
                </p>
              </div>
              <button
                onClick={() => setPhantomModalOpen(false)}
                className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {phantomFolders.length === 0 ? (
              <div className="py-12 text-center space-y-2">
                <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto" />
                <div className="text-base font-bold text-slate-900">
                  {t('appModal.phantomNoneTitle')}
                </div>
                <p className="text-sm text-slate-600">
                  {t('appModal.phantomNoneDesc')}
                </p>
              </div>
            ) : (
              <>
                <div className="max-h-80 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-200 bg-slate-50">
                  {phantomFolders.map((pf) => (
                    <label
                      key={pf.id}
                      onClick={() => handleTogglePhantomCheck(pf.id)}
                      className="flex items-start gap-3.5 p-4 hover:bg-blue-50/60 cursor-pointer transition select-none"
                    >
                      <button
                        type="button"
                        className="mt-0.5 shrink-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleTogglePhantomCheck(pf.id);
                        }}
                      >
                        {pf.checked ? (
                          <CheckSquare className="w-5 h-5 text-blue-600" />
                        ) : (
                          <Square className="w-5 h-5 text-slate-400" />
                        )}
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2.5 flex-wrap">
                          <span className="font-mono font-bold text-rose-700 text-sm">
                            {pf.relPath}
                          </span>
                          <span className="px-2.5 py-0.5 text-xs font-mono font-semibold rounded-md bg-white border border-slate-300 text-slate-700">
                            {tf('appModal.phantomFilesCount', {
                              count: pf.fileCount,
                              size: formatSize(pf.totalSizeBytes),
                            })}
                          </span>
                        </div>
                        <div className="text-sm text-slate-700 mt-1">{pf.categoryReason}</div>
                      </div>
                    </label>
                  ))}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                  <div className="flex items-center gap-2.5">
                    <button
                      onClick={() => handleSelectAllPhantoms(true)}
                      className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-300 text-sm font-bold text-slate-800 cursor-pointer"
                    >
                      {t('appModal.phantomSelectAll')}
                    </button>
                    <button
                      onClick={() => handleSelectAllPhantoms(false)}
                      className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-300 text-sm font-bold text-slate-800 cursor-pointer"
                    >
                      {t('appModal.phantomUnselectAll')}
                    </button>
                  </div>

                  <button
                    onClick={handleDeleteSelectedPhantoms}
                    disabled={
                      isDeletingPhantoms || phantomFolders.filter((p) => p.checked).length === 0
                    }
                    className="flex items-center gap-2 px-5 py-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-sm shadow-md cursor-pointer disabled:opacity-40"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>
                      {isDeletingPhantoms
                        ? t('appModal.phantomDeleting')
                        : tf('appModal.phantomDeleteBtn', {
                            count: phantomFolders.filter((p) => p.checked).length,
                          })}
                    </span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <SetupWizard
        key={setupWizardKey}
        open={setupWizardOpen}
        fsSupported={setupFsSupported}
        folders={setupFolders}
        ownSameAsStorage={setupOwnConflict}
        onPickFolder={handleSetupPickFolder}
        onClearFolder={handleSetupClearFolder}
        onLater={handleSetupLater}
        onStart={runInitialSetupPipeline}
      />

      <SetupRunPanel
        run={setupRun}
        tourOpen={setupTourOpen}
        onCloseTour={() => setSetupTourOpen(false)}
        onDismissRun={() => setSetupRun(null)}
        onStop={handleSetupStop}
        onNavigate={handleTourNavigate}
      />

      {/* R36S (ArkOS / DarkOS) Media Preview Modal */}
      {previewRom && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-300 rounded-2xl max-w-3xl w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-3">
              <div>
                <div className="text-xs text-blue-700 font-bold uppercase">
                  {t('appModal.previewBadge')} • {previewRom.generationShort} &rarr;{' '}
                  {previewRom.consoleCode.toUpperCase()}
                </div>
                <h3 className="text-lg font-extrabold text-slate-900 mt-0.5">{previewRom.canonicalName}</h3>
                <p className="text-xs text-slate-600 font-mono">
                  {t('appModal.previewDir')} {previewRom.generationFolder}/{previewRom.consoleCode}/
                </p>
              </div>
              <button
                onClick={() => setPreviewRom(null)}
                className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-col items-center">
                <div className="text-xs text-slate-700 font-mono font-bold mb-2 flex items-center gap-1">
                  <ImageIcon className="w-4 h-4 text-emerald-600" /> images/-image.png
                </div>
                {previewRom.scrapedBoxArtUrl ? (
                  <img
                    src={previewRom.scrapedBoxArtUrl}
                    alt={previewRom.cleanTitle}
                    className="max-h-48 object-contain rounded"
                  />
                ) : (
                  <div className="h-40 flex items-center justify-center text-sm text-slate-500">
                    {t('appModal.previewNoCover')}
                  </div>
                )}
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-col items-center">
                <div className="text-xs text-slate-700 font-mono font-bold mb-2 flex items-center gap-1">
                  <ImageIcon className="w-4 h-4 text-amber-600" /> marquees/-marquee.png
                </div>
                {previewRom.scrapedMarqueeUrl ? (
                  <img
                    src={previewRom.scrapedMarqueeUrl}
                    alt="Banner"
                    className="max-h-24 object-contain rounded mb-2"
                  />
                ) : null}
                {previewRom.scrapedSnapUrl ? (
                  <img
                    src={previewRom.scrapedSnapUrl}
                    alt="Gameplay Snap"
                    className="max-h-24 object-contain rounded"
                  />
                ) : null}
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-col items-center">
                <div className="text-xs text-slate-700 font-mono font-bold mb-2 flex items-center gap-1">
                  <Film className="w-4 h-4 text-blue-600" /> videos/-video.mp4
                </div>
                {previewRom.scrapedVideoUrl ? (
                  <video
                    src={previewRom.scrapedVideoUrl}
                    controls
                    autoPlay
                    loop
                    muted
                    className="w-full max-h-48 rounded bg-black"
                  />
                ) : (
                  <div className="h-40 flex items-center justify-center text-xs text-slate-500 text-center px-2">
                    {t('appModal.previewNoVideo')}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export default App;
