import express from 'express';
import fs from 'fs';
import path from 'path';
import { createServer as createViteServer } from 'vite';

const app = express();
app.use(express.json({ limit: '50mb' }));

function readCurrentAppVersion(): string {
  try {
    const pkgPath = path.resolve(process.cwd(), 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    if (pkg?.version && typeof pkg.version === 'string') {
      return pkg.version.trim();
    }
  } catch {}
  return '0.5.4';
}

const APP_VERSION = readCurrentAppVersion();
const SETUP_EXE_FILENAME = `AegisROM-Setup-v${APP_VERSION}-Win11-x64.exe`;
const ZIP_PKG_FILENAME = `AegisROM-v${APP_VERSION}-Win11-x64.zip`;

// Caches for Libretro PNG directory listings and Archive.org MP4 video listings
interface IndexedEntry {
  fileName: string;
  normKey: string;
  tokens: string[];
}

const libretroCache = new Map<string, IndexedEntry[]>();
const archiveVideoCache = new Map<string, IndexedEntry[]>();

function cleanBaseTitle(rawName: string): string {
  const noExt = rawName.replace(/\.[^/.]+$/, '');
  const noNum = noExt.replace(/^\s*(?:#?\d{1,4}\s*[-._)\]]+\s*|\d{1,4}\s+)/, '');
  const noTags = noNum.replace(/\[.*?\]|\(.*?\)/g, ' ').replace(/[_.-]+/g, ' ');
  const words = noTags.split(/\s+/).filter(Boolean);
  const filtered = words.filter((w) => {
    const up = w.toUpperCase();
    return !['USA', 'EUR', 'EUROPE', 'JAPAN', 'JPN', 'WORLD', 'RUS', 'RUSSIAN', 'RU', 'TOP100', 'V1'].includes(up);
  });
  return (filtered.length > 0 ? filtered.join(' ') : noTags).trim() || noExt;
}

function buildNormKey(cleanTitle: string): string {
  let s = cleanTitle.toLowerCase().trim();
  s = s.replace(/^the\s+/, '').replace(/,\s*the$/, '').replace(/\s+the$/, '');
  return s.replace(/[^a-z0-9а-яё]/gi, '');
}

function tokenizeTitle(cleanTitle: string): string[] {
  return cleanTitle
    .toLowerCase()
    .split(/[^a-z0-9а-яё]+/i)
    .filter((t) => t.length > 1 && t !== 'the' && t !== 'and');
}

async function getLibretroIndex(systemName: string): Promise<IndexedEntry[]> {
  if (libretroCache.has(systemName)) {
    return libretroCache.get(systemName)!;
  }
  try {
    const url = `https://thumbnails.libretro.com/${encodeURIComponent(systemName)}/Named_Boxarts/`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!resp.ok) return [];
    const html = await resp.text();
    const regex = /href="([^"]+\.png)"/g;
    const entries: IndexedEntry[] = [];
    let match: RegExpExecArray | null;
    while ((match = regex.exec(html)) !== null) {
      try {
        const decoded = decodeURIComponent(match[1]).replace(/\.png$/i, '');
        const clean = cleanBaseTitle(decoded);
        entries.push({
          fileName: decoded,
          normKey: buildNormKey(clean),
          tokens: tokenizeTitle(clean),
        });
      } catch {}
    }
    libretroCache.set(systemName, entries);
    return entries;
  } catch {
    return [];
  }
}

async function getArchiveVideoIndex(archiveId: string): Promise<IndexedEntry[]> {
  if (archiveVideoCache.has(archiveId)) {
    return archiveVideoCache.get(archiveId)!;
  }
  try {
    const url = `https://archive.org/metadata/${encodeURIComponent(archiveId)}/files`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!resp.ok) return [];
    const data: any = await resp.json();
    const files: Array<{ name: string }> = data?.result || [];
    const entries: IndexedEntry[] = [];
    for (const f of files) {
      if (!f.name) continue;
      const lower = f.name.toLowerCase();
      if (!lower.endsWith('.mp4') || lower.endsWith('.ia.mp4')) continue;
      const clean = cleanBaseTitle(f.name);
      entries.push({
        fileName: f.name,
        normKey: buildNormKey(clean),
        tokens: tokenizeTitle(clean),
      });
    }
    archiveVideoCache.set(archiveId, entries);
    return entries;
  } catch {
    return [];
  }
}

function findBestEntryMatch(
  entries: IndexedEntry[],
  cleanTitle: string,
  normKey: string,
  preferredRegion = 'USA'
): string | null {
  if (entries.length === 0) return null;

  const exactMatches = entries.filter((e) => e.normKey === normKey);
  if (exactMatches.length > 0) {
    const regMatch = exactMatches.find((e) =>
      e.fileName.toLowerCase().includes(preferredRegion.toLowerCase())
    );
    if (regMatch) return regMatch.fileName;
    const usaMatch = exactMatches.find(
      (e) => e.fileName.includes('(USA') || e.fileName.includes('(World')
    );
    if (usaMatch) return usaMatch.fileName;
    return exactMatches[0].fileName;
  }

  const targetTokens = new Set(tokenizeTitle(cleanTitle));
  if (targetTokens.size === 0) return null;

  let bestName: string | null = null;
  let bestScore = 0;

  for (const e of entries) {
    if (e.tokens.length === 0) continue;
    let common = 0;
    for (const t of e.tokens) {
      if (targetTokens.has(t)) common++;
    }
    if (common === 0) continue;
    const union = targetTokens.size + e.tokens.length - common;
    let score = common / union;
    if (e.fileName.includes('(USA')) score += 0.05;
    if (score > bestScore) {
      bestScore = score;
      bestName = e.fileName;
    }
  }

  return bestScore >= 0.55 ? bestName : null;
}

// ============================================================================
// AEGISDB PERSISTENT DATABASE ENGINE (Local JSON Database on Disk)
// Stores Master Library ROMs, SD Card snapshots, Dependencies, Genres, Years,
// Starred Emulators, and Buffer Zone items so the user never has to re-scan!
// ============================================================================

const DB_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.resolve(DB_DIR, 'aegis_library_db.json');

interface PersistedDatabaseState {
  version: string;
  lastSyncTime: string;
  masterLibraryPath: string;
  sdCardPath: string;
  bufferZonePath: string;
  starredEmulatorsByConsole: Record<string, string>;
  customEmulatorPaths: Record<string, string>;
  roms: any[];
}

function getDefaultSeedDatabase(): PersistedDatabaseState {
  return {
    version: APP_VERSION,
    lastSyncTime: new Date().toISOString(),
    masterLibraryPath: 'D:\\AegisROM_Master_Library',
    sdCardPath: 'E:\\ (R36S EASYROMS — 128 GB)',
    bufferZonePath: 'D:\\Downloads\\ROMs_Buffer_Inbox',
    starredEmulatorsByConsole: {
      nes: 'retroarch_mesen',
      snes: 'retroarch_snes9x',
      genesis: 'retroarch_genesis_plus_gx',
      gba: 'mgba_standalone',
      nds: 'melonds_standalone',
      psx: 'duckstation_standalone',
      n64: 'retroarch_mupen64plus',
      psp: 'ppsspp_standalone',
      ps2: 'pcsx2_standalone',
      ps3: 'rpcs3_standalone',
      switch: 'ryujinx_standalone',
      xbox: 'xemu_standalone',
      arcade: 'retroarch_fbneo',
    },
    customEmulatorPaths: {
      retroarch_mesen: 'C:\\RetroArch-Win64\\retroarch.exe',
      duckstation_standalone: 'C:\\Emulators\\DuckStation\\duckstation-qt-x64-ReleaseLTCG.exe',
      pcsx2_standalone: 'C:\\Emulators\\PCSX2\\pcsx2-qt.exe',
      rpcs3_standalone: 'C:\\Emulators\\RPCS3\\rpcs3.exe',
      ryujinx_standalone: 'C:\\Emulators\\Ryujinx\\Ryujinx.exe',
      xemu_standalone: 'C:\\Emulators\\Xemu\\xemu.exe',
      mgba_standalone: 'C:\\Emulators\\mGBA\\mGBA.exe',
      ppsspp_standalone: 'C:\\Emulators\\PPSSPP\\PPSSPPWindows64.exe',
    },
    roms: [
      {
        id: 'seed_psx_tekken3_rus',
        relativePath: 'psx/Tekken 3 (RUS).chd',
        sourceSubfolder: 'MasterLibrary/psx',
        fileName: 'Tekken 3 (RUS).chd',
        cleanTitle: 'Tekken 3',
        extractedInternalTitle: 'Tekken 3 [SLUS-00402]',
        isNumberedName: false,
        comparisonKey: 'tekken3',
        canonicalName: 'Tekken 3 (RUS).chd',
        extension: '.chd',
        consoleCode: 'psx',
        generationFolder: '3_32_64bit (PS1, N64, GBA, NDS, Saturn)',
        generationShort: '32/64-bit 3D',
        bitness: '32/64-bit 3D',
        genre: 'Fighting / Файтинг',
        releaseYear: 1998,
        dependencies: ['BIOS: scph1001.bin', 'Образ диска (.chd v5 cdzl)'],
        locationScope: 'master_and_sd',
        sdCurrentRegion: 'Japan',
        sdCurrentFileName: '000001.pbp',
        upgradeAvailable: true,
        upgradeReason: 'На SD лежит 000001.pbp (Japan SLPS-01300) -> Заменить на Tekken 3 (RUS).chd из базы',
        fileSize: 452984832,
        crc32: '8B4F2C19',
        headerlessCrc32: '8B4F2C19',
        region: 'Russia',
        isRussian: true,
        isFromTopFolder: true,
        revision: 'v1.1',
        status: 'verified',
        is1G1RWinner: true,
        reason: 'Мастер-база (RUS) • Доступен апгрейд SD',
        scrapedBoxArtUrl: 'https://thumbnails.libretro.com/Sony%20-%20PlayStation/Named_Boxarts/Tekken%203%20%28USA%29.png',
        scrapedMarqueeUrl: 'https://thumbnails.libretro.com/Sony%20-%20PlayStation/Named_Titles/Tekken%203%20%28USA%29.png',
        mediaStatus: '✔ В базе: Обложка + Титул',
      },
      {
        id: 'seed_psx_re2_rus',
        relativePath: 'psx/Resident Evil 2 (RUS).pbp',
        sourceSubfolder: 'MasterLibrary/psx',
        fileName: 'Resident Evil 2 (RUS).pbp',
        cleanTitle: 'Resident Evil 2',
        extractedInternalTitle: 'Resident Evil 2 [SLUS-00748]',
        isNumberedName: false,
        comparisonKey: 'residentevil2',
        canonicalName: 'Resident Evil 2 (RUS).pbp',
        extension: '.pbp',
        consoleCode: 'psx',
        generationFolder: '3_32_64bit (PS1, N64, GBA, NDS, Saturn)',
        generationShort: '32/64-bit 3D',
        bitness: '32/64-bit 3D',
        genre: 'Horror / Хоррор',
        releaseYear: 1998,
        dependencies: ['BIOS: scph1001.bin', 'Многодисковый PBP (Disc 1 + Disc 2)'],
        locationScope: 'master_and_sd',
        sdCurrentRegion: 'Japan',
        sdCurrentFileName: '000002.pbp',
        upgradeAvailable: true,
        upgradeReason: 'На SD лежит 000002.pbp (Biohazard 2 Japan) -> Заменить на Resident Evil 2 (RUS).pbp',
        fileSize: 734003200,
        crc32: '4E91A20C',
        headerlessCrc32: '4E91A20C',
        region: 'Russia',
        isRussian: true,
        isFromTopFolder: true,
        revision: '',
        status: 'verified',
        is1G1RWinner: true,
        reason: 'Мастер-база (RUS) • Доступен апгрейд SD',
        scrapedBoxArtUrl: 'https://thumbnails.libretro.com/Sony%20-%20PlayStation/Named_Boxarts/Resident%20Evil%202%20%28USA%29%20%28Disc%201%29.png',
        scrapedMarqueeUrl: 'https://thumbnails.libretro.com/Sony%20-%20PlayStation/Named_Titles/Resident%20Evil%202%20%28USA%29%20%28Disc%201%29.png',
        mediaStatus: '✔ В базе: Обложка + Титул',
      },
      {
        id: 'seed_gen_comix_rus',
        relativePath: 'genesis/Comix Zone (RUS).md',
        sourceSubfolder: 'MasterLibrary/genesis',
        fileName: 'Comix Zone (RUS).md',
        cleanTitle: 'Comix Zone',
        extractedInternalTitle: 'COMIX ZONE',
        isNumberedName: false,
        comparisonKey: 'comixzone',
        canonicalName: 'Comix Zone (RUS).md',
        extension: '.md',
        consoleCode: 'genesis',
        generationFolder: '2_16bit (SNES, MegaDrive, PCEngine, Arcade)',
        generationShort: '16-bit',
        bitness: '16-bit',
        genre: 'Action / Экшен',
        releaseYear: 1995,
        dependencies: ['Автономный картридж/ром (без внешних треков)'],
        locationScope: 'master_and_sd',
        sdCurrentRegion: 'Japan',
        sdCurrentFileName: 'Comix Zone (Japan).md',
        upgradeAvailable: true,
        upgradeReason: 'На SD лежит японская версия (Japan) -> Заменить на русскую версию Comix Zone (RUS).md',
        fileSize: 2097152,
        crc32: 'A19D4021',
        headerlessCrc32: 'A19D4021',
        region: 'Russia',
        isRussian: true,
        isFromTopFolder: true,
        revision: '',
        status: 'verified',
        is1G1RWinner: true,
        reason: 'Мастер-база (RUS) • Доступен апгрейд SD',
        scrapedBoxArtUrl: 'https://thumbnails.libretro.com/Sega%20-%20Mega%20Drive%20-%20Genesis/Named_Boxarts/Comix%20Zone%20%28USA%29.png',
        scrapedMarqueeUrl: 'https://thumbnails.libretro.com/Sega%20-%20Mega%20Drive%20-%20Genesis/Named_Titles/Comix%20Zone%20%28USA%29.png',
        mediaStatus: '✔ В базе: Обложка + Титул',
      },
      {
        id: 'seed_gen_sor2_rus',
        relativePath: 'genesis/Streets of Rage 2 (RUS).md',
        sourceSubfolder: 'MasterLibrary/genesis',
        fileName: 'Streets of Rage 2 (RUS).md',
        cleanTitle: 'Streets of Rage 2',
        extractedInternalTitle: 'STREETS OF RAGE 2',
        isNumberedName: false,
        comparisonKey: 'streetsofrage2',
        canonicalName: 'Streets of Rage 2 (RUS).md',
        extension: '.md',
        consoleCode: 'genesis',
        generationFolder: '2_16bit (SNES, MegaDrive, PCEngine, Arcade)',
        generationShort: '16-bit',
        bitness: '16-bit',
        genre: 'Action / Экшен',
        releaseYear: 1992,
        dependencies: ['Автономный картридж/ром (без внешних треков)'],
        locationScope: 'master_and_sd',
        sdCurrentRegion: 'Russia',
        sdCurrentFileName: 'Streets of Rage 2 (RUS).md',
        upgradeAvailable: false,
        fileSize: 2097152,
        crc32: 'E01FA52B',
        headerlessCrc32: 'E01FA52B',
        region: 'Russia',
        isRussian: true,
        isFromTopFolder: true,
        revision: '',
        status: 'verified',
        is1G1RWinner: true,
        reason: 'Синхронизирован (ПК + SD)',
        scrapedBoxArtUrl: 'https://thumbnails.libretro.com/Sega%20-%20Mega%20Drive%20-%20Genesis/Named_Boxarts/Streets%20of%20Rage%202%20%28USA%29.png',
        scrapedMarqueeUrl: 'https://thumbnails.libretro.com/Sega%20-%20Mega%20Drive%20-%20Genesis/Named_Titles/Streets%20of%20Rage%202%20%28USA%29.png',
        mediaStatus: '✔ В базе: Обложка + Титул',
      },
      {
        id: 'seed_gba_castlevania_rus',
        relativePath: 'gba/Castlevania - Aria of Sorrow (RUS).gba',
        sourceSubfolder: 'MasterLibrary/gba',
        fileName: 'Castlevania - Aria of Sorrow (RUS).gba',
        cleanTitle: 'Castlevania - Aria of Sorrow',
        extractedInternalTitle: 'CASTLEVANIA2 A2CE',
        isNumberedName: false,
        comparisonKey: 'castlevaniaariaofsorrow',
        canonicalName: 'Castlevania - Aria of Sorrow (RUS).gba',
        extension: '.gba',
        consoleCode: 'gba',
        generationFolder: '3_32_64bit (PS1, N64, GBA, NDS, Saturn)',
        generationShort: '32/64-bit 3D',
        bitness: '32/64-bit 3D',
        genre: 'RPG / Ролевые',
        releaseYear: 2003,
        dependencies: ['BIOS: gba_bios.bin'],
        locationScope: 'master_and_sd',
        sdCurrentRegion: 'Japan',
        sdCurrentFileName: 'Castlevania - Minuet of Dawn (Japan).gba',
        upgradeAvailable: true,
        upgradeReason: 'На SD лежит японская версия (Japan) -> Заменить на русскую Castlevania - Aria of Sorrow (RUS).gba',
        fileSize: 8388608,
        crc32: '5F20C911',
        headerlessCrc32: '5F20C911',
        region: 'Russia',
        isRussian: true,
        isFromTopFolder: true,
        revision: '',
        status: 'verified',
        is1G1RWinner: true,
        reason: 'Мастер-база (RUS) • Доступен апгрейд SD',
        scrapedBoxArtUrl: 'https://thumbnails.libretro.com/Nintendo%20-%20Game%20Boy%20Advance/Named_Boxarts/Castlevania%20-%20Aria%20of%20Sorrow%20%28USA%29.png',
        scrapedMarqueeUrl: 'https://thumbnails.libretro.com/Nintendo%20-%20Game%20Boy%20Advance/Named_Titles/Castlevania%20-%20Aria%20of%20Sorrow%20%28USA%29.png',
        mediaStatus: '✔ В базе: Обложка + Титул',
      },
      {
        id: 'seed_ps2_gow2_rus',
        relativePath: 'ps2/God of War II (RUS).chd',
        sourceSubfolder: 'MasterLibrary/ps2',
        fileName: 'God of War II (RUS).chd',
        cleanTitle: 'God of War II',
        extractedInternalTitle: 'God of War II [SCUS-97481]',
        isNumberedName: false,
        comparisonKey: 'godofwar2',
        canonicalName: 'God of War II (RUS).chd',
        extension: '.chd',
        consoleCode: 'ps2',
        generationFolder: '4_128bit_DVD (PS2, PSP, Dreamcast, GameCube)',
        generationShort: '128-bit DVD',
        bitness: '128-bit DVD',
        genre: 'Action / Экшен',
        releaseYear: 2007,
        dependencies: ['BIOS: scph39001.bin', 'DVD9 Сжатый образ CHD'],
        locationScope: 'master_only',
        upgradeAvailable: false,
        fileSize: 6120328396,
        crc32: 'D9281A44',
        headerlessCrc32: 'D9281A44',
        region: 'Russia',
        isRussian: true,
        isFromTopFolder: true,
        revision: '',
        status: 'verified',
        is1G1RWinner: true,
        reason: 'Хранится в Мастер-базе ПК',
        mediaStatus: '✔ Готов к выгрузке (PS2 / Steam Deck)',
      },
      {
        id: 'seed_ps3_tlou_rus',
        relativePath: 'ps3/The Last of Us [BCES01584] (RUS).iso',
        sourceSubfolder: 'MasterLibrary/ps3',
        fileName: 'The Last of Us [BCES01584] (RUS).iso',
        cleanTitle: 'The Last of Us',
        extractedInternalTitle: 'The Last of Us [BCES-01584]',
        isNumberedName: false,
        comparisonKey: 'lastofus',
        canonicalName: 'The Last of Us (RUS).iso',
        extension: '.iso',
        consoleCode: 'ps3',
        generationFolder: '5_HD_Consoles (PS3, Nintendo Switch, Xbox)',
        generationShort: 'HD / 7-8 Gen',
        bitness: 'HD / 7-8 Gen',
        genre: 'Adventure / Приключения',
        releaseYear: 2013,
        dependencies: ['PS3 CFW/HEN (/PS3ISO/)', 'Update v1.11 PKG + Left Behind DLC'],
        locationScope: 'master_only',
        upgradeAvailable: false,
        fileSize: 28991029248,
        crc32: '77C10B9E',
        headerlessCrc32: '77C10B9E',
        region: 'Russia',
        isRussian: true,
        isFromTopFolder: true,
        revision: 'v1.11',
        status: 'verified',
        is1G1RWinner: true,
        reason: 'Хранится в Мастер-базе ПК (PS3 HEN/CFW & RPCS3)',
        mediaStatus: '✔ Готов к выгрузке (PS3ISO)',
      },
      {
        id: 'seed_switch_botw_rus',
        relativePath: 'switch/The Legend of Zelda - Breath of the Wild [01007EF00011E000] (RUS).nsp',
        sourceSubfolder: 'MasterLibrary/switch',
        fileName: 'The Legend of Zelda - Breath of the Wild (RUS).nsp',
        cleanTitle: 'The Legend of Zelda - Breath of the Wild',
        extractedInternalTitle: 'TitleID: 01007EF00011E000',
        isNumberedName: false,
        comparisonKey: 'legendofzeldabreathofthewild',
        canonicalName: 'The Legend of Zelda - Breath of the Wild (RUS).nsp',
        extension: '.nsp',
        consoleCode: 'switch',
        generationFolder: '5_HD_Consoles (PS3, Nintendo Switch, Xbox)',
        generationShort: 'HD / 7-8 Gen',
        bitness: 'HD / 7-8 Gen',
        genre: 'RPG / Ролевые',
        releaseYear: 2017,
        dependencies: ['Switch prod.keys (18.1.0+)', 'Update v1.6.0 NSP + Expansion Pass DLC'],
        locationScope: 'master_only',
        upgradeAvailable: false,
        fileSize: 15461882265,
        crc32: '991C4A02',
        headerlessCrc32: '991C4A02',
        region: 'Russia',
        isRussian: true,
        isFromTopFolder: true,
        revision: 'v1.6.0',
        status: 'verified',
        is1G1RWinner: true,
        reason: 'Хранится в Мастер-базе ПК (Switch Atmosphere & Ryujinx)',
        mediaStatus: '✔ Готов к выгрузке (Switch NSP)',
      },
      {
        id: 'seed_xbox_halo2_rus',
        relativePath: 'xbox/Halo 2 (USA).xiso',
        sourceSubfolder: 'MasterLibrary/xbox',
        fileName: 'Halo 2 (USA).xiso',
        cleanTitle: 'Halo 2',
        extractedInternalTitle: 'Halo 2 [MS-0042]',
        isNumberedName: false,
        comparisonKey: 'halo2',
        canonicalName: 'Halo 2 (USA).xiso',
        extension: '.xiso',
        consoleCode: 'xbox',
        generationFolder: '5_HD_Consoles (PS3, Nintendo Switch, Xbox)',
        generationShort: 'HD / 7-8 Gen',
        bitness: 'HD / 7-8 Gen',
        genre: 'Shooter / Шутер',
        releaseYear: 2004,
        dependencies: ['BIOS: mcpx_1.0.bin + Complex_4627', 'XISO образ для Xemu / Freeboot'],
        locationScope: 'master_only',
        upgradeAvailable: false,
        fileSize: 4617089843,
        crc32: '3D891F04',
        headerlessCrc32: '3D891F04',
        region: 'USA',
        isRussian: false,
        isFromTopFolder: true,
        revision: '',
        status: 'verified',
        is1G1RWinner: true,
        reason: 'Хранится в Мастер-базе ПК (Xbox Xemu / Aurora)',
        mediaStatus: '✔ Готов к выгрузке (Xbox)',
      },
    ],
  };
}

function loadDatabaseFromDisk(): PersistedDatabaseState {
  try {
    if (!fs.existsSync(DB_DIR)) {
      fs.mkdirSync(DB_DIR, { recursive: true });
    }
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.roms) && parsed.roms.length > 0) {
        return parsed;
      }
    }
  } catch {}
  const seed = getDefaultSeedDatabase();
  saveDatabaseToDisk(seed);
  return seed;
}

function saveDatabaseToDisk(state: PersistedDatabaseState): void {
  try {
    if (!fs.existsSync(DB_DIR)) {
      fs.mkdirSync(DB_DIR, { recursive: true });
    }
    fs.writeFileSync(DB_FILE, JSON.stringify(state, null, 2), 'utf-8');
  } catch {}
}

// Get persistent database state immediately on app startup (no re-scan required!)
app.get('/api/db/state', (_req, res) => {
  const db = loadDatabaseFromDisk();
  res.json({ ok: true, db });
});

// Save or merge scanned ROMs, paths, and upgrade states into the persistent database
app.post('/api/db/sync', (req, res) => {
  const current = loadDatabaseFromDisk();
  const {
    roms,
    masterLibraryPath,
    sdCardPath,
    bufferZonePath,
    starredEmulatorsByConsole,
    customEmulatorPaths,
    replaceAll,
  } = req.body || {};

  if (typeof masterLibraryPath === 'string' && masterLibraryPath.trim()) {
    current.masterLibraryPath = masterLibraryPath.trim();
  }
  if (typeof sdCardPath === 'string' && sdCardPath.trim()) {
    current.sdCardPath = sdCardPath.trim();
  }
  if (typeof bufferZonePath === 'string' && bufferZonePath.trim()) {
    current.bufferZonePath = bufferZonePath.trim();
  }
  if (starredEmulatorsByConsole && typeof starredEmulatorsByConsole === 'object') {
    current.starredEmulatorsByConsole = {
      ...current.starredEmulatorsByConsole,
      ...starredEmulatorsByConsole,
    };
  }
  if (customEmulatorPaths && typeof customEmulatorPaths === 'object') {
    current.customEmulatorPaths = {
      ...current.customEmulatorPaths,
      ...customEmulatorPaths,
    };
  }

  if (Array.isArray(roms)) {
    if (replaceAll) {
      current.roms = roms;
    } else {
      const byKey = new Map<string, any>();
      for (const r of current.roms) {
        const k = `${r.consoleCode}::${r.comparisonKey || r.fileName}`;
        byKey.set(k, r);
      }
      for (const incoming of roms) {
        const k = `${incoming.consoleCode}::${incoming.comparisonKey || incoming.fileName}`;
        byKey.set(k, incoming);
      }
      current.roms = Array.from(byKey.values());
    }
  }

  current.lastSyncTime = new Date().toISOString();
  saveDatabaseToDisk(current);
  res.json({ ok: true, db: current });
});

// Reset database back to starter multi-console catalog
app.post('/api/db/reset-seed', (_req, res) => {
  const seed = getDefaultSeedDatabase();
  saveDatabaseToDisk(seed);
  res.json({ ok: true, db: seed });
});

// ============================================================================
// PERSISTENT SAVED BUILDS STORAGE (/api/db/builds)
// Stores custom/thematic builds + target paths so builds can be re-opened & synced
// ============================================================================
const BUILDS_FILE = path.resolve(DB_DIR, 'aegis_builds.json');
const PORTMASTER_CACHE_FILE = path.resolve(DB_DIR, 'portmaster_cache.json');

function loadSavedBuildsFromDisk(): any[] {
  try {
    if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
    if (fs.existsSync(BUILDS_FILE)) {
      const raw = fs.readFileSync(BUILDS_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

function saveSavedBuildsToDisk(builds: any[]): void {
  try {
    if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
    fs.writeFileSync(BUILDS_FILE, JSON.stringify(builds, null, 2), 'utf-8');
  } catch {}
}

app.get('/api/db/builds', (_req, res) => {
  res.json({ ok: true, builds: loadSavedBuildsFromDisk() });
});

app.post('/api/db/builds', (req, res) => {
  const { builds } = req.body || {};
  if (!Array.isArray(builds)) {
    res.status(400).json({ ok: false, error: 'builds array expected' });
    return;
  }
  saveSavedBuildsToDisk(builds);
  res.json({ ok: true, builds });
});

// ============================================================================
// PORTMASTER LIVE WEBSITE PARSER & DOWNLOADER (portmaster.games / PortMaster-Info)
// ============================================================================
function inferPortMasterTargetServer(slug: string, items: string[], inst: string) {
  const cleanSlug = slug.replace(/\.zip$/i, '');
  const folderItem =
    (items || []).find((it) => typeof it === 'string' && it.endsWith('/'))?.replace(/\/+$/, '') ||
    cleanSlug;
  const explicitMatch = (inst || '').match(
    /(?:ports|roms\/ports)\/([A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)+)/i
  );
  if (explicitMatch && explicitMatch[1]) {
    const rel = explicitMatch[1].replace(/\/+$/, '');
    return {
      targetPath: `ports/${rel}`,
      hint: `Скопируйте оригинальные файлы игры в папку ports/${rel}`,
    };
  }
  const lowInst = (inst || '').toLowerCase();
  for (const kw of ['gamedata', 'assets', 'data', 'valve', 'iwads', 'mods', 'game', 'files']) {
    if (
      lowInst.includes(`/${kw}`) ||
      lowInst.includes(`'${kw}'`) ||
      lowInst.includes(`"${kw}"`) ||
      lowInst.includes(` ${kw} folder`) ||
      lowInst.includes(` ${kw} directory`)
    ) {
      return {
        targetPath: `ports/${folderItem}/${kw}`,
        hint: `Поместите файлы игры в подпапку ports/${folderItem}/${kw}/`,
      };
    }
  }
  return {
    targetPath: `ports/${folderItem}`,
    hint: `Поместите требуемые файлы игры (или проверьте инструкцию) в папку ports/${folderItem}/`,
  };
}

function formatPortMasterConsolesServer(availRaw: Record<string, any> = {}): string[] {
  const keys = Object.keys(availRaw || {});
  if (keys.length === 0) return ['R36S (ArkOS)', 'Anbernic (MuOS/Knulli)', 'TrimUI', 'ROCKNIX'];
  const out = new Set<string>();
  for (const k of keys) {
    if (/r36s|arkos|amberelec/i.test(k)) out.add('R36S (ArkOS / AmberELEC)');
    else if (/rg35|rg40|rg28|anbernic|muos/i.test(k)) out.add('Anbernic (MuOS / Knulli)');
    else if (/trimui/i.test(k)) out.add('TrimUI Smart Pro');
    else if (/rgb30|powkiddy/i.test(k)) out.add('PowKiddy RGB30 / JELOS');
    else if (/rocknix|jelos/i.test(k)) out.add('ROCKNIX / JELOS');
    else if (/knulli|batocera/i.test(k)) out.add('Knulli / Batocera');
  }
  if (out.size === 0) {
    return ['R36S (ArkOS)', 'Anbernic (MuOS/Knulli)', 'ROCKNIX'];
  }
  return Array.from(out);
}

let memoryPortMasterCatalog: { syncedAt: string; games: any[] } | null = null;

async function fetchAndParsePortMasterCatalog(forceRefresh = false): Promise<{
  syncedAt: string;
  games: any[];
  fromCache: boolean;
}> {
  if (!forceRefresh && memoryPortMasterCatalog && memoryPortMasterCatalog.games.length > 0) {
    return { ...memoryPortMasterCatalog, fromCache: true };
  }

  if (!forceRefresh && fs.existsSync(PORTMASTER_CACHE_FILE)) {
    try {
      const stat = fs.statSync(PORTMASTER_CACHE_FILE);
      const ageMs = Date.now() - stat.mtimeMs;
      if (ageMs < 6 * 3600 * 1000) {
        const cached = JSON.parse(fs.readFileSync(PORTMASTER_CACHE_FILE, 'utf-8'));
        if (cached && Array.isArray(cached.games) && cached.games.length > 0) {
          memoryPortMasterCatalog = cached;
          return { ...cached, fromCache: true };
        }
      }
    } catch {}
  }

  const portsResp = await fetch(
    'https://raw.githubusercontent.com/PortsMaster/PortMaster-Info/main/ports.json',
    { signal: AbortSignal.timeout(25000) }
  );
  if (!portsResp.ok) {
    throw new Error(`PortMaster feed HTTP ${portsResp.status}`);
  }
  const rawJson: any = await portsResp.json();
  const portsObj: Record<string, any> = rawJson?.ports || rawJson || {};

  const parsedGames: any[] = [];
  for (const [key, entry] of Object.entries(portsObj)) {
    if (!entry || typeof entry !== 'object') continue;
    const attr = entry.attr || {};
    const src = entry.source || {};
    const slug = (entry.name || key).replace(/\.zip$/i, '');
    const items: string[] = Array.isArray(entry.items) ? entry.items : [];
    const instRaw = String(attr.inst || '');
    const { targetPath, hint } = inferPortMasterTargetServer(slug, items, instRaw);

    const coverName = attr?.image?.covers?.[0];
    const shotName = attr?.image?.screenshot;
    const coverUrl = coverName
      ? `https://raw.githubusercontent.com/PortsMaster/PortMaster-New/main/ports/${encodeURIComponent(
          slug
        )}/${encodeURIComponent(coverName)}`
      : shotName
      ? `https://raw.githubusercontent.com/PortsMaster/PortMaster-New/main/ports/${encodeURIComponent(
          slug
        )}/${encodeURIComponent(shotName)}`
      : '';
    const screenshotUrl = shotName
      ? `https://raw.githubusercontent.com/PortsMaster/PortMaster-New/main/ports/${encodeURIComponent(
          slug
        )}/${encodeURIComponent(shotName)}`
      : coverUrl;

    parsedGames.push({
      id: key,
      slug,
      title: attr.title || slug,
      desc: attr.desc || '',
      genres: Array.isArray(attr.genres) ? attr.genres : [],
      readyToRun: Boolean(attr.rtr),
      porter: Array.isArray(attr.porter) ? attr.porter : [],
      runtime: Array.isArray(attr.runtime) ? attr.runtime : attr.runtime ? [String(attr.runtime)] : [],
      requirements: Array.isArray(attr.reqs) ? attr.reqs : [],
      instructionsRaw: instRaw,
      instructionsMd: String(attr.inst_md || instRaw),
      requiredDataTargetPath: targetPath,
      requiredDataHint: hint,
      items,
      availDevices: Object.keys(attr.avail || {}),
      supportedConsolesPretty: formatPortMasterConsolesServer(attr.avail || {}),
      coverUrl,
      screenshotUrl,
      downloadUrl:
        src.url ||
        `https://github.com/PortsMaster/PortMaster-New/releases/latest/download/${encodeURIComponent(
          key
        )}`,
      sizeBytes: Number(src.size) || 0,
      dateUpdated: String(src.date_updated || ''),
      md5: String(src.md5 || ''),
    });
  }

  parsedGames.sort((a, b) => a.title.localeCompare(b.title, 'en'));
  const snapshot = {
    syncedAt: new Date().toISOString(),
    games: parsedGames,
  };
  memoryPortMasterCatalog = snapshot;
  try {
    if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
    fs.writeFileSync(PORTMASTER_CACHE_FILE, JSON.stringify(snapshot), 'utf-8');
  } catch {}

  return { ...snapshot, fromCache: false };
}

app.get('/api/portmaster/catalog', async (req, res) => {
  const forceRefresh = req.query.refresh === '1' || req.query.refresh === 'true';
  try {
    const result = await fetchAndParsePortMasterCatalog(forceRefresh);
    res.json({
      ok: true,
      syncedAt: result.syncedAt,
      fromCache: result.fromCache,
      total: result.games.length,
      games: result.games,
    });
  } catch (err: any) {
    if (fs.existsSync(PORTMASTER_CACHE_FILE)) {
      try {
        const cached = JSON.parse(fs.readFileSync(PORTMASTER_CACHE_FILE, 'utf-8'));
        res.json({
          ok: true,
          syncedAt: cached.syncedAt,
          fromCache: true,
          total: cached.games?.length || 0,
          games: cached.games || [],
        });
        return;
      } catch {}
    }
    res.status(502).json({
      ok: false,
      error: `Не удалось синхронизироваться с сайтом PortMaster: ${String(err?.message || err)}`,
    });
  }
});

app.get('/api/portmaster/download', async (req, res) => {
  const targetUrl = String(req.query.url || '');
  const allowedPrefixes = [
    'https://github.com/PortsMaster/',
    'https://raw.githubusercontent.com/PortsMaster/',
    'https://github.com/christianhaitian/',
    'https://portmaster.games/',
  ];
  if (!allowedPrefixes.some((p) => targetUrl.startsWith(p))) {
    res.status(400).send('Invalid PortMaster download URL');
    return;
  }
  try {
    const upstream = await fetch(targetUrl, {
      redirect: 'follow',
      signal: AbortSignal.timeout(45000),
    });
    if (!upstream.ok) {
      res.status(upstream.status).send(`PortMaster archive returned ${upstream.status}`);
      return;
    }
    const rawName = targetUrl.split('/').pop() || 'portmaster_game.zip';
    const safeName = rawName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const arrayBuf = await upstream.arrayBuffer();
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
    res.setHeader('Content-Length', String(arrayBuf.byteLength));
    res.send(Buffer.from(arrayBuf));
  } catch (err: any) {
    res.status(502).send(`Download failed: ${String(err?.message || err)}`);
  }
});

// Live version metadata endpoint so UI/clients can always query current release version
app.get('/api/version', (_req, res) => {
  const versionJsonPath = path.resolve(process.cwd(), 'public', 'downloads', 'version.json');
  res.setHeader('Cache-Control', 'no-store');
  if (fs.existsSync(versionJsonPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(versionJsonPath, 'utf-8'));
      res.json({ ...parsed, version: parsed.version || APP_VERSION });
      return;
    } catch {}
  }
  res.json({
    appName: 'AegisROM',
    version: APP_VERSION,
    setupExecutable: SETUP_EXE_FILENAME,
    zipPackage: ZIP_PKG_FILENAME,
    portableExecutable: 'AegisROM-Portable-Win11-x64.exe',
  });
});

// Redirect legacy v0.5.2 & v0.5.3 download URLs directly to the current version so stale links always deliver the latest build
app.get(
  [
    '/downloads/AegisROM-Setup-v0.5.2-Win11-x64.exe',
    '/downloads/AegisROM-Setup-v0.5.3-Win11-x64.exe',
  ],
  (_req, res) => {
    res.redirect(302, `/downloads/${SETUP_EXE_FILENAME}`);
  }
);
app.get(
  [
    '/downloads/AegisROM-v0.5.2-Win11-x64.zip',
    '/downloads/AegisROM-v0.5.3-Win11-x64.zip',
  ],
  (_req, res) => {
    res.redirect(302, `/downloads/${ZIP_PKG_FILENAME}`);
  }
);

// Download native Windows 11 Setup GUI installer (everything embedded inside 1 .EXE)
app.get(
  [
    '/api/download/aegisrom-setup',
    '/api/download/aegisrom-installer',
    `/downloads/${SETUP_EXE_FILENAME}`,
  ],
  (_req, res) => {
    const setupPath = path.resolve(process.cwd(), 'public', 'downloads', SETUP_EXE_FILENAME);
    if (!fs.existsSync(setupPath)) {
      res.status(404).send(`${SETUP_EXE_FILENAME} not found`);
      return;
    }
    const stat = fs.statSync(setupPath);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${SETUP_EXE_FILENAME}"`);
    res.setHeader('Content-Length', String(stat.size));
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    fs.createReadStream(setupPath).pipe(res);
  }
);

// Download native Windows 11 executable AegisROM.exe / Portable
app.get(['/api/download/aegisrom-exe', '/downloads/AegisROM.exe', '/downloads/AegisROM-Portable-Win11-x64.exe'], (req, res) => {
  const isPortable = req.path.includes('Portable') || req.query.portable === '1';
  const fileName = isPortable ? 'AegisROM-Portable-Win11-x64.exe' : 'AegisROM.exe';
  const exePath = path.resolve(process.cwd(), 'public', 'downloads', fileName);
  const fallback = path.resolve(process.cwd(), 'public', 'downloads', 'AegisROM.exe');
  const resolved = fs.existsSync(exePath) ? exePath : fallback;
  if (!fs.existsSync(resolved)) {
    res.status(404).send('AegisROM.exe not found');
    return;
  }
  const stat = fs.statSync(resolved);
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.setHeader('Content-Length', String(stat.size));
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  fs.createReadStream(resolved).pipe(res);
});

// Download ZIP package AegisROM-vX.Y.Z-Win11-x64.zip
app.get(['/api/download/aegisrom-zip', `/downloads/${ZIP_PKG_FILENAME}`], (_req, res) => {
  const zipPath = path.resolve(process.cwd(), 'public', 'downloads', ZIP_PKG_FILENAME);
  if (!fs.existsSync(zipPath)) {
    res.status(404).send(`${ZIP_PKG_FILENAME} not found`);
    return;
  }
  const stat = fs.statSync(zipPath);
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${ZIP_PKG_FILENAME}"`);
  res.setHeader('Content-Length', String(stat.size));
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  fs.createReadStream(zipPath).pipe(res);
});

// Batch R36S / Universal Scraper endpoint
app.post('/api/r36s/scrape-batch', async (req, res) => {
  const { items } = req.body || {};
  if (!Array.isArray(items)) {
    res.json({ ok: false, results: [] });
    return;
  }

  const uniqueSystems = new Set<string>();
  const uniqueArchives = new Set<string>();
  for (const it of items) {
    if (it.libretroSystem) uniqueSystems.add(it.libretroSystem);
    if (it.archiveVideoId) uniqueArchives.add(it.archiveVideoId);
  }

  await Promise.all([
    ...Array.from(uniqueSystems).map((s) => getLibretroIndex(s)),
    ...Array.from(uniqueArchives).map((a) => getArchiveVideoIndex(a)),
  ]);

  const results = items.map((it) => {
    const libEntries = libretroCache.get(it.libretroSystem) || [];
    const vidEntries = archiveVideoCache.get(it.archiveVideoId) || [];

    const matchedLib =
      findBestEntryMatch(libEntries, it.cleanTitle, it.comparisonKey, it.region) ||
      `${it.cleanTitle} (USA)`;
    const matchedVid = findBestEntryMatch(vidEntries, it.cleanTitle, it.comparisonKey, it.region);

    const sysEnc = encodeURIComponent(it.libretroSystem);
    const libEnc = encodeURIComponent(`${matchedLib}.png`);

    const boxArtUrl = `https://thumbnails.libretro.com/${sysEnc}/Named_Boxarts/${libEnc}`;
    const snapUrl = `https://thumbnails.libretro.com/${sysEnc}/Named_Snaps/${libEnc}`;
    const marqueeUrl = `https://thumbnails.libretro.com/${sysEnc}/Named_Titles/${libEnc}`;
    const videoUrl = matchedVid
      ? `https://archive.org/download/${encodeURIComponent(it.archiveVideoId)}/${encodeURIComponent(
          matchedVid
        )}`
      : '';

    return {
      id: it.id,
      matchedCanonicalTitle: cleanBaseTitle(matchedLib),
      matchedFullNoIntroName: matchedLib,
      boxArtUrl,
      snapUrl,
      marqueeUrl,
      videoUrl,
    };
  });

  res.json({ ok: true, results });
});

// Media proxy so browser FileSystemAccess API can write PNG/MP4 files directly into local folders
app.get('/api/r36s/proxy-media', async (req, res) => {
  const targetUrl = String(req.query.url || '');
  if (
    !targetUrl.startsWith('https://thumbnails.libretro.com/') &&
    !targetUrl.startsWith('https://archive.org/download/')
  ) {
    res.status(400).send('Invalid media URL');
    return;
  }
  try {
    const upstream = await fetch(targetUrl, { signal: AbortSignal.timeout(25000) });
    if (!upstream.ok) {
      res.status(upstream.status).send('Not found');
      return;
    }
    const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    const arrayBuf = await upstream.arrayBuffer();
    res.send(Buffer.from(arrayBuf));
  } catch {
    res.status(502).send('Upstream fetch failed');
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(process.cwd(), 'dist')));
  }

  const PORT = Number(process.env.PORT) || 3000;
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`AegisROM v${APP_VERSION} Beta (Console Steam Edition) listening on http://0.0.0.0:${PORT}`);
  });
  server.on('error', (err) => {
    console.error('Server listen error:', err);
    process.exit(1);
  });
}

startServer().catch((err) => {
  console.error('Failed to start AegisROM dev server:', err);
  process.exit(1);
});
