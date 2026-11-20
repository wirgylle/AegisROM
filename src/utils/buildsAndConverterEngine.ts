import { UnifiedGameRow } from '../components/FigmaConceptStudio';
import { tStatic, tfStatic } from '../i18n/translations';
import { detectRomMod } from './romHacks';

export type AgeRatingTag = '6+' | '10+' | '14+' | '18+';
export type DifficultyTag = 'easy_relax' | 'medium' | 'hardcore';
export type BitnessGroupTag = '8-bit' | '16-bit' | '32/64-bit';

export interface EnrichedBuildGame extends UnifiedGameRow {
  ageRating: AgeRatingTag;
  difficulty: DifficultyTag;
  difficultyLabel: string;
  girlsFavorite: boolean;
  bitnessGroup: BitnessGroupTag;
  sourceExt: string;
  sizeMB: number;
}

export interface ThematicBuildPreset {
  id: string;
  category: 'age' | 'mood_audience' | 'genre' | 'bitness' | 'status';
  categoryLabel: string;
  badgeText: string;
  badgeColor: string;
  title: string;
  subtitle: string;
  recommendedTargetId: string;
  filterFn: (game: EnrichedBuildGame) => boolean;
}

export interface TargetSystemProfile {
  id: string;
  name: string;
  shortName: string;
  deviceCategory: 'handheld_linux' | 'pc_emulator' | 'original_console' | 'flashcart';
  description: string;
  hierarchyPattern: string;
  mediaFolders: string[];
  gamelistFormat: 'emulationstation_xml' | 'miyoo_xml' | 'launchbox_xml' | 'none';
  // Default target format per console code
  defaultFormats: Record<string, string>;
  // Supported selectable target formats per console code
  availableFormats: Record<string, string[]>;
}

export interface FormatConversionRule {
  consoleCode: string;
  sourceFormat: string;
  targetFormat: string;
  actionType:
    | 'keep_as_is'
    | 'optical_bin_cue_to_iso'
    | 'optical_iso_to_bin_cue'
    | 'optical_raw_to_bin_cue'
    | 'optical_chd_to_iso'
    | 'optical_iso_to_chd'
    | 'optical_to_pbp'
    | 'psp_iso_cso'
    | 'cart_header_fix'
    | 'archive_unpack';
  conversionKind: 'copy' | 'builtin_binary' | 'chdman_required' | 'external_pbp_cso';
  canExecuteInBrowser: boolean;
  requiresChdman: boolean;
  operationSummary: string;
  toolEngine: string;
  sizeRatio: number; // e.g. 0.58 when compressing ISO -> CHD, or 0.87 when stripping 2352 -> 2048
}

// ============================================================================
// EXTENDED BUILT-IN CATALOG (Used alongside or merged with user's scanned ROMs)
// ============================================================================
export const BUILTIN_EXTENDED_GAMES: UnifiedGameRow[] = [
  // --- PSX (32-bit) ---
  {
    id: 'b_psx_1',
    title: 'Tekken 3',
    oldFile: '000634 (World).chd',
    cleanFile: 'Tekken 3 (RUS).chd',
    console: 'PlayStation 1',
    consoleShort: 'PSX',
    bitness: '32-bit',
    region: 'RUS',
    genre: 'Файтинг',
    year: 1998,
    size: '418 МБ',
    crc32: '8F4E2C19',
    serial: 'SLUS-00402',
    emulator: 'DuckStation ★',
    status: '✔ В библиотеке',
    boxArtUrl: 'https://thumbnails.libretro.com/Sony%20-%20PlayStation/Named_Boxarts/Tekken%203%20(USA).png',
    videoUrl: 'https://archive.org/download/SonyPlaystationVideoSnaps/Tekken%203%20%28USA%29.mp4',
  },
  {
    id: 'b_psx_2',
    title: 'Crash Bandicoot 3: Warped',
    oldFile: 'Crash_Bandicoot_3.iso',
    cleanFile: 'Crash Bandicoot 3 - Warped (RUS).iso',
    console: 'PlayStation 1',
    consoleShort: 'PSX',
    bitness: '32-bit',
    region: 'RUS',
    genre: 'Платформер / Приключения',
    year: 1998,
    size: '490 МБ',
    crc32: '4A12D08C',
    serial: 'SCUS-94244',
    emulator: 'DuckStation ★',
    status: '✔ В библиотеке',
    boxArtUrl: 'https://thumbnails.libretro.com/Sony%20-%20PlayStation/Named_Boxarts/Crash%20Bandicoot%20-%20Warped%20(USA).png',
  },
  {
    id: 'b_psx_3',
    title: 'Spyro the Dragon',
    oldFile: 'Spyro_The_Dragon.chd',
    cleanFile: 'Spyro the Dragon (RUS).chd',
    console: 'PlayStation 1',
    consoleShort: 'PSX',
    bitness: '32-bit',
    region: 'RUS',
    genre: 'Платформер / Уютные',
    year: 1998,
    size: '340 МБ',
    crc32: '9B20E411',
    serial: 'SCUS-94228',
    emulator: 'DuckStation ★',
    status: '✔ В библиотеке',
    boxArtUrl: 'https://thumbnails.libretro.com/Sony%20-%20PlayStation/Named_Boxarts/Spyro%20the%20Dragon%20(USA).png',
  },
  {
    id: 'b_psx_4',
    title: 'Crash Team Racing (CTR)',
    oldFile: 'CTR_Crash_Team_Racing.chd',
    cleanFile: 'Crash Team Racing (RUS).chd',
    console: 'PlayStation 1',
    consoleShort: 'PSX',
    bitness: '32-bit',
    region: 'RUS',
    genre: 'Гонки / Аркада',
    year: 1999,
    size: '365 МБ',
    crc32: '7C15A903',
    serial: 'SCUS-94426',
    emulator: 'DuckStation ★',
    status: '✔ В библиотеке',
    boxArtUrl: 'https://thumbnails.libretro.com/Sony%20-%20PlayStation/Named_Boxarts/CTR%20-%20Crash%20Team%20Racing%20(USA).png',
  },
  {
    id: 'b_psx_5',
    title: 'Gran Turismo 2',
    oldFile: '000215 (World).chd',
    cleanFile: 'Gran Turismo 2 (RUS).chd',
    console: 'PlayStation 1',
    consoleShort: 'PSX',
    bitness: '32-bit',
    region: 'RUS',
    genre: 'Гонки / Симулятор',
    year: 1999,
    size: '512 МБ',
    crc32: '4E81A20C',
    serial: 'SCUS-94455',
    emulator: 'DuckStation ★',
    status: '✔ В библиотеке',
    boxArtUrl: 'https://thumbnails.libretro.com/Sony%20-%20PlayStation/Named_Boxarts/Gran%20Turismo%202%20(USA)%20(Arcade%20Mode).png',
  },
  {
    id: 'b_psx_6',
    title: 'Need for Speed: High Stakes',
    oldFile: 'NFS_High_Stakes.iso',
    cleanFile: 'Need for Speed - High Stakes (RUS).iso',
    console: 'PlayStation 1',
    consoleShort: 'PSX',
    bitness: '32-bit',
    region: 'RUS',
    genre: 'Гонки',
    year: 1999,
    size: '540 МБ',
    crc32: '2D88E10A',
    serial: 'SLUS-00826',
    emulator: 'DuckStation ★',
    status: '✔ В библиотеке',
    boxArtUrl: 'https://thumbnails.libretro.com/Sony%20-%20PlayStation/Named_Boxarts/Need%20for%20Speed%20-%20High%20Stakes%20(USA).png',
  },
  {
    id: 'b_psx_7',
    title: 'Resident Evil 2',
    oldFile: 'Resident_Evil_2_(Disc_1).chd (Диски 1–2)',
    cleanFile: 'Resident Evil 2 (RUS)/Resident Evil 2 (RUS).m3u (2 диска)',
    console: 'PlayStation 1',
    consoleShort: 'PSX',
    bitness: '32-bit',
    region: 'RUS',
    genre: 'Хоррор / Экшен',
    year: 1998,
    size: '920 МБ',
    totalBytes: 920 * 1024 * 1024,
    crc32: '6E91F02B',
    serial: 'SLUS-00748',
    emulator: 'DuckStation ★',
    status: '✔ Папка + .M3U (2 диска)',
    isMultiDisc: true,
    discCount: 2,
    multiDiscFolderName: 'Resident Evil 2 (RUS)',
    m3uFileName: 'Resident Evil 2 (RUS).m3u',
    relativePath: 'psx/Resident Evil 2 (RUS)/Resident Evil 2 (RUS).m3u',
    discs: [
      {
        id: 'b_psx_7_d1',
        discNumber: 1,
        title: 'Resident Evil 2 (Disc 1 - Leon)',
        oldFile: 'Resident Evil 2 (RUS) (Disc 1).chd',
        cleanFile: 'Resident Evil 2 (RUS) (Disc 1).chd',
        relativePath: 'psx/Resident Evil 2 (RUS)/Resident Evil 2 (RUS) (Disc 1).chd',
        size: '465 МБ',
        totalBytes: 465 * 1024 * 1024,
        crc32: '6E91F02B',
        sourceExt: '.chd',
      },
      {
        id: 'b_psx_7_d2',
        discNumber: 2,
        title: 'Resident Evil 2 (Disc 2 - Claire)',
        oldFile: 'Resident Evil 2 (RUS) (Disc 2).chd',
        cleanFile: 'Resident Evil 2 (RUS) (Disc 2).chd',
        relativePath: 'psx/Resident Evil 2 (RUS)/Resident Evil 2 (RUS) (Disc 2).chd',
        size: '455 МБ',
        totalBytes: 455 * 1024 * 1024,
        crc32: '6E91F02C',
        sourceExt: '.chd',
      },
    ],
    boxArtUrl: 'https://thumbnails.libretro.com/Sony%20-%20PlayStation/Named_Boxarts/Resident%20Evil%202%20(USA)%20(Disc%201).png',
  },
  {
    id: 'b_psx_8',
    title: 'Silent Hill',
    oldFile: 'Silent_Hill_RUS.chd',
    cleanFile: 'Silent Hill (RUS).chd',
    console: 'PlayStation 1',
    consoleShort: 'PSX',
    bitness: '32-bit',
    region: 'RUS',
    genre: 'Хоррор / Триллер',
    year: 1999,
    size: '475 МБ',
    crc32: '1A44D890',
    serial: 'SLUS-00707',
    emulator: 'DuckStation ★',
    status: '✔ В библиотеке',
    boxArtUrl: 'https://thumbnails.libretro.com/Sony%20-%20PlayStation/Named_Boxarts/Silent%20Hill%20(USA).png',
  },
  {
    id: 'b_psx_9',
    title: 'Castlevania: Symphony of the Night',
    oldFile: '000089 (World).chd',
    cleanFile: 'Castlevania - Symphony of the Night (RUS).chd',
    console: 'PlayStation 1',
    consoleShort: 'PSX',
    bitness: '32-bit',
    region: 'RUS',
    genre: 'Метроидвания / RPG',
    year: 1997,
    size: '356 МБ',
    crc32: '7D12E801',
    serial: 'SLUS-00067',
    emulator: 'DuckStation ★',
    status: '✔ В библиотеке',
    boxArtUrl: 'https://thumbnails.libretro.com/Sony%20-%20PlayStation/Named_Boxarts/Castlevania%20-%20Symphony%20of%20the%20Night%20(USA).png',
  },
  {
    id: 'b_psx_10',
    title: 'Metal Gear Solid',
    oldFile: '000112 (World).chd (Диски 1–2)',
    cleanFile: 'Metal Gear Solid (RUS)/Metal Gear Solid (RUS).m3u (2 диска)',
    console: 'PlayStation 1',
    consoleShort: 'PSX',
    bitness: '32-bit',
    region: 'RUS',
    genre: 'Стелс / Экшен',
    year: 1998,
    size: '1.18 ГБ',
    totalBytes: Math.round(1.18 * 1024 * 1024 * 1024),
    crc32: '5F19C30E',
    serial: 'SLUS-00594',
    emulator: 'DuckStation ★',
    status: '✔ Папка + .M3U (2 диска)',
    isMultiDisc: true,
    discCount: 2,
    multiDiscFolderName: 'Metal Gear Solid (RUS)',
    m3uFileName: 'Metal Gear Solid (RUS).m3u',
    relativePath: 'psx/Metal Gear Solid (RUS)/Metal Gear Solid (RUS).m3u',
    discs: [
      {
        id: 'b_psx_10_d1',
        discNumber: 1,
        title: 'Metal Gear Solid (Disc 1)',
        oldFile: '000112 (Disc 1).chd',
        cleanFile: 'Metal Gear Solid (RUS) (Disc 1).chd',
        relativePath: 'psx/Metal Gear Solid (RUS)/Metal Gear Solid (RUS) (Disc 1).chd',
        size: '640 МБ',
        totalBytes: 640 * 1024 * 1024,
        crc32: '5F19C30E',
        sourceExt: '.chd',
      },
      {
        id: 'b_psx_10_d2',
        discNumber: 2,
        title: 'Metal Gear Solid (Disc 2)',
        oldFile: '000113 (Disc 2).chd',
        cleanFile: 'Metal Gear Solid (RUS) (Disc 2).chd',
        relativePath: 'psx/Metal Gear Solid (RUS)/Metal Gear Solid (RUS) (Disc 2).chd',
        size: '568 МБ',
        totalBytes: 568 * 1024 * 1024,
        crc32: '5F19C30F',
        sourceExt: '.chd',
      },
    ],
    boxArtUrl: 'https://thumbnails.libretro.com/Sony%20-%20PlayStation/Named_Boxarts/Metal%20Gear%20Solid%20(USA)%20(Disc%201).png',
  },
  {
    id: 'b_psx_ff7',
    title: 'Final Fantasy VII',
    oldFile: 'Final Fantasy VII (RUS) (Disc 1).chd (Диски 1–3)',
    cleanFile: 'Final Fantasy VII (RUS)/Final Fantasy VII (RUS).m3u (3 диска)',
    console: 'PlayStation 1',
    consoleShort: 'PSX',
    bitness: '32-bit',
    region: 'RUS',
    genre: 'JRPG / Приключения',
    year: 1997,
    size: '1.42 ГБ',
    totalBytes: Math.round(1.42 * 1024 * 1024 * 1024),
    crc32: 'FF7D0001',
    serial: 'SCUS-94163',
    emulator: 'DuckStation ★',
    status: '✔ Папка + .M3U (3 диска)',
    isMultiDisc: true,
    discCount: 3,
    multiDiscFolderName: 'Final Fantasy VII (RUS)',
    m3uFileName: 'Final Fantasy VII (RUS).m3u',
    relativePath: 'psx/Final Fantasy VII (RUS)/Final Fantasy VII (RUS).m3u',
    discs: [
      {
        id: 'b_psx_ff7_d1',
        discNumber: 1,
        title: 'Final Fantasy VII (Disc 1)',
        oldFile: 'Final Fantasy VII (RUS) (Disc 1).chd',
        cleanFile: 'Final Fantasy VII (RUS) (Disc 1).chd',
        relativePath: 'psx/Final Fantasy VII (RUS)/Final Fantasy VII (RUS) (Disc 1).chd',
        size: '485 МБ',
        totalBytes: 485 * 1024 * 1024,
        crc32: 'FF7D0001',
        sourceExt: '.chd',
      },
      {
        id: 'b_psx_ff7_d2',
        discNumber: 2,
        title: 'Final Fantasy VII (Disc 2)',
        oldFile: 'Final Fantasy VII (RUS) (Disc 2).chd',
        cleanFile: 'Final Fantasy VII (RUS) (Disc 2).chd',
        relativePath: 'psx/Final Fantasy VII (RUS)/Final Fantasy VII (RUS) (Disc 2).chd',
        size: '492 МБ',
        totalBytes: 492 * 1024 * 1024,
        crc32: 'FF7D0002',
        sourceExt: '.chd',
      },
      {
        id: 'b_psx_ff7_d3',
        discNumber: 3,
        title: 'Final Fantasy VII (Disc 3)',
        oldFile: 'Final Fantasy VII (RUS) (Disc 3).chd',
        cleanFile: 'Final Fantasy VII (RUS) (Disc 3).chd',
        relativePath: 'psx/Final Fantasy VII (RUS)/Final Fantasy VII (RUS) (Disc 3).chd',
        size: '478 МБ',
        totalBytes: 478 * 1024 * 1024,
        crc32: 'FF7D0003',
        sourceExt: '.chd',
      },
    ],
    boxArtUrl: 'https://thumbnails.libretro.com/Sony%20-%20PlayStation/Named_Boxarts/Final%20Fantasy%20VII%20(USA)%20(Disc%201).png',
    videoUrl: 'https://archive.org/download/SonyPlaystationVideoSnaps/Final%20Fantasy%20VII%20%28USA%29%20%28Disc%201%29.mp4',
  },
  {
    id: 'b_psx_11',
    title: 'Harvest Moon: Back to Nature',
    oldFile: 'Harvest_Moon_BTN.chd',
    cleanFile: 'Harvest Moon - Back to Nature (RUS).chd',
    console: 'PlayStation 1',
    consoleShort: 'PSX',
    bitness: '32-bit',
    region: 'RUS',
    genre: 'Уютный симулятор / Ферма',
    year: 1999,
    size: '165 МБ',
    crc32: '3C71E042',
    serial: 'SLUS-01115',
    emulator: 'DuckStation ★',
    status: '✔ В библиотеке',
    boxArtUrl: 'https://thumbnails.libretro.com/Sony%20-%20PlayStation/Named_Boxarts/Harvest%20Moon%20-%20Back%20to%20Nature%20(USA).png',
  },

  // --- SEGA MEGA DRIVE / GENESIS (16-bit) ---
  {
    id: 'b_gen_1',
    title: 'Sonic the Hedgehog 2',
    oldFile: 'Sonic_2.md',
    cleanFile: 'Sonic the Hedgehog 2 (RUS).md',
    console: 'Sega Mega Drive',
    consoleShort: 'GENESIS',
    bitness: '16-bit',
    region: 'RUS',
    genre: 'Платформер',
    year: 1992,
    size: '1.0 МБ',
    crc32: '5A88C102',
    serial: 'MK-1051',
    emulator: 'RetroArch (Genesis Plus GX) ★',
    status: '✔ В библиотеке',
    boxArtUrl: 'https://thumbnails.libretro.com/Sega%20-%20Mega%20Drive%20-%20Genesis/Named_Boxarts/Sonic%20The%20Hedgehog%202%20(World).png',
  },
  {
    id: 'b_gen_2',
    title: 'Disney’s Aladdin',
    oldFile: 'Aladdin_Genesis.smd',
    cleanFile: 'Aladdin (RUS).md',
    console: 'Sega Mega Drive',
    consoleShort: 'GENESIS',
    bitness: '16-bit',
    region: 'RUS',
    genre: 'Платформер / Сказка',
    year: 1993,
    size: '2.0 МБ',
    crc32: '8D12A90F',
    serial: 'MK-1058',
    emulator: 'RetroArch (Genesis Plus GX) ★',
    status: '✔ В библиотеке',
    boxArtUrl: 'https://thumbnails.libretro.com/Sega%20-%20Mega%20Drive%20-%20Genesis/Named_Boxarts/Disney%27s%20Aladdin%20(USA).png',
  },
  {
    id: 'b_gen_3',
    title: 'The Lion King (Король Лев)',
    oldFile: 'Lion_King_RU.md',
    cleanFile: 'The Lion King (RUS).md',
    console: 'Sega Mega Drive',
    consoleShort: 'GENESIS',
    bitness: '16-bit',
    region: 'RUS',
    genre: 'Платформер / Сказка',
    year: 1994,
    size: '2.5 МБ',
    crc32: '6C41B20E',
    serial: 'MK-1220',
    emulator: 'RetroArch (Genesis Plus GX) ★',
    status: '✔ В библиотеке',
    boxArtUrl: 'https://thumbnails.libretro.com/Sega%20-%20Mega%20Drive%20-%20Genesis/Named_Boxarts/Lion%20King%2C%20The%20(World).png',
  },
  {
    id: 'b_gen_4',
    title: 'Ultimate Mortal Kombat 3',
    oldFile: 'UMK3_RUS.md',
    cleanFile: 'Ultimate Mortal Kombat 3 (RUS).md',
    console: 'Sega Mega Drive',
    consoleShort: 'GENESIS',
    bitness: '16-bit',
    region: 'RUS',
    genre: 'Файтинг',
    year: 1995,
    size: '4.0 МБ',
    crc32: '9F11D40A',
    serial: 'T-97136',
    emulator: 'RetroArch (Genesis Plus GX) ★',
    status: '✔ В библиотеке',
    boxArtUrl: 'https://thumbnails.libretro.com/Sega%20-%20Mega%20Drive%20-%20Genesis/Named_Boxarts/Ultimate%20Mortal%20Kombat%203%20(USA).png',
  },
  {
    id: 'b_gen_5',
    title: 'Contra: Hard Corps',
    oldFile: 'Contra_Hard_Corps.md',
    cleanFile: 'Contra - Hard Corps (RUS).md',
    console: 'Sega Mega Drive',
    consoleShort: 'GENESIS',
    bitness: '16-bit',
    region: 'RUS',
    genre: 'Экшен / Хардкор',
    year: 1994,
    size: '2.5 МБ',
    crc32: '4B89E11C',
    serial: 'T-95096',
    emulator: 'RetroArch (Genesis Plus GX) ★',
    status: '✔ В библиотеке',
    boxArtUrl: 'https://thumbnails.libretro.com/Sega%20-%20Mega%20Drive%20-%20Genesis/Named_Boxarts/Contra%20-%20Hard%20Corps%20(USA%2C%20Korea).png',
  },
  {
    id: 'b_gen_6',
    title: 'Comix Zone',
    oldFile: 'Comix_Zone_RU.md',
    cleanFile: 'Comix Zone (RUS).md',
    console: 'Sega Mega Drive',
    consoleShort: 'GENESIS',
    bitness: '16-bit',
    region: 'RUS',
    genre: 'Beat ’em up / Экшен',
    year: 1995,
    size: '2.0 МБ',
    crc32: '9C02F11A',
    serial: 'MK-1563',
    emulator: 'RetroArch (Genesis Plus GX) ★',
    status: '✔ В библиотеке',
    boxArtUrl: 'https://thumbnails.libretro.com/Sega%20-%20Mega%20Drive%20-%20Genesis/Named_Boxarts/Comix%20Zone%20(USA).png',
  },
  {
    id: 'b_gen_7',
    title: 'Rock n’ Roll Racing',
    oldFile: 'Rock_n_Roll_Racing.md',
    cleanFile: 'Rock n Roll Racing (RUS).md',
    console: 'Sega Mega Drive',
    consoleShort: 'GENESIS',
    bitness: '16-bit',
    region: 'RUS',
    genre: 'Гонки / Аркада',
    year: 1994,
    size: '2.0 МБ',
    crc32: '7A33B90D',
    serial: 'T-125026',
    emulator: 'RetroArch (Genesis Plus GX) ★',
    status: '✔ В библиотеке',
    boxArtUrl: 'https://thumbnails.libretro.com/Sega%20-%20Mega%20Drive%20-%20Genesis/Named_Boxarts/Rock%20n%27%20Roll%20Racing%20(USA).png',
  },
  {
    id: 'b_gen_8',
    title: 'The Little Mermaid (Русалочка Ариэль)',
    oldFile: 'Ariel_Little_Mermaid.md',
    cleanFile: 'Ariel the Little Mermaid (RUS).md',
    console: 'Sega Mega Drive',
    consoleShort: 'GENESIS',
    bitness: '16-bit',
    region: 'RUS',
    genre: 'Приключения / Для девочек',
    year: 1992,
    size: '1.0 МБ',
    crc32: '2E67C801',
    serial: 'MK-1042',
    emulator: 'RetroArch (Genesis Plus GX) ★',
    status: '✔ В библиотеке',
    boxArtUrl: 'https://thumbnails.libretro.com/Sega%20-%20Mega%20Drive%20-%20Genesis/Named_Boxarts/Disney%27s%20Ariel%20the%20Little%20Mermaid%20(USA%2C%20Europe).png',
  },

  // --- SUPER NINTENDO / SNES (16-bit) ---
  {
    id: 'b_snes_1',
    title: 'Chrono Trigger',
    oldFile: 'Chrono_Trigger_JP.smc',
    cleanFile: 'Chrono Trigger (RUS).sfc',
    console: 'Super Nintendo',
    consoleShort: 'SNES',
    bitness: '16-bit',
    region: 'RUS',
    genre: 'JRPG / Приключения',
    year: 1995,
    size: '4.0 МБ',
    crc32: '2D91F80A',
    serial: 'SNS-ACTP',
    emulator: 'RetroArch (Snes9x) ★',
    status: '✔ В библиотеке',
    boxArtUrl: 'https://thumbnails.libretro.com/Nintendo%20-%20Super%20Nintendo%20Entertainment%20System/Named_Boxarts/Chrono%20Trigger%20(USA).png',
  },
  {
    id: 'b_snes_2',
    title: 'Super Mario World 2: Yoshi’s Island',
    oldFile: 'Yoshis_Island.sfc',
    cleanFile: 'Super Mario World 2 - Yoshis Island (RUS).sfc',
    console: 'Super Nintendo',
    consoleShort: 'SNES',
    bitness: '16-bit',
    region: 'RUS',
    genre: 'Платформер / Уютные',
    year: 1995,
    size: '2.0 МБ',
    crc32: '4F11A30C',
    serial: 'SNS-YI',
    emulator: 'RetroArch (Snes9x) ★',
    status: '✔ В библиотеке',
    boxArtUrl: 'https://thumbnails.libretro.com/Nintendo%20-%20Super%20Nintendo%20Entertainment%20System/Named_Boxarts/Super%20Mario%20World%202%20-%20Yoshi%27s%20Island%20(USA).png',
  },
  {
    id: 'b_snes_3',
    title: 'Bishoujo Senshi Sailor Moon (Сейлор Мун)',
    oldFile: 'Sailor_Moon_SNES.smc',
    cleanFile: 'Sailor Moon (RUS).sfc',
    console: 'Super Nintendo',
    consoleShort: 'SNES',
    bitness: '16-bit',
    region: 'RUS',
    genre: 'Экшен / Для девочек',
    year: 1993,
    size: '1.5 МБ',
    crc32: '8B42D19A',
    serial: 'SHVC-BM',
    emulator: 'RetroArch (Snes9x) ★',
    status: '✔ В библиотеке',
    boxArtUrl: 'https://thumbnails.libretro.com/Nintendo%20-%20Super%20Nintendo%20Entertainment%20System/Named_Boxarts/Bishoujo%20Senshi%20Sailor%20Moon%20(Japan).png',
  },
  {
    id: 'b_snes_4',
    title: 'Super Mario Kart',
    oldFile: 'Super_Mario_Kart.sfc',
    cleanFile: 'Super Mario Kart (RUS).sfc',
    console: 'Super Nintendo',
    consoleShort: 'SNES',
    bitness: '16-bit',
    region: 'RUS',
    genre: 'Гонки / Семейные',
    year: 1992,
    size: '1.0 МБ',
    crc32: '3E89C211',
    serial: 'SNS-MK',
    emulator: 'RetroArch (Snes9x) ★',
    status: '✔ В библиотеке',
    boxArtUrl: 'https://thumbnails.libretro.com/Nintendo%20-%20Super%20Nintendo%20Entertainment%20System/Named_Boxarts/Super%20Mario%20Kart%20(USA).png',
  },

  // --- GAME BOY ADVANCE / GBA (32-bit Portable) ---
  {
    id: 'b_gba_1',
    title: 'Metroid Fusion',
    oldFile: '0042_Metroid_Fusion.gba',
    cleanFile: 'Metroid Fusion (RUS).gba',
    console: 'Game Boy Advance',
    consoleShort: 'GBA',
    bitness: '32-bit',
    region: 'RUS',
    genre: 'Метроидвания / Экшен',
    year: 2002,
    size: '8.0 МБ',
    crc32: '6B14E092',
    serial: 'AGB-AMTE',
    emulator: 'mGBA ★',
    status: '✔ В библиотеке',
    boxArtUrl: 'https://thumbnails.libretro.com/Nintendo%20-%20Game%20Boy%20Advance/Named_Boxarts/Metroid%20Fusion%20(USA).png',
  },
  {
    id: 'b_gba_2',
    title: 'Kirby: Nightmare in Dream Land',
    oldFile: 'Kirby_Nightmare_GBA.gba',
    cleanFile: 'Kirby - Nightmare in Dream Land (RUS).gba',
    console: 'Game Boy Advance',
    consoleShort: 'GBA',
    bitness: '32-bit',
    region: 'RUS',
    genre: 'Платформер / Уютные',
    year: 2002,
    size: '8.0 МБ',
    crc32: '1D44F90E',
    serial: 'AGB-A7KE',
    emulator: 'mGBA ★',
    status: '✔ В библиотеке',
    boxArtUrl: 'https://thumbnails.libretro.com/Nintendo%20-%20Game%20Boy%20Advance/Named_Boxarts/Kirby%20-%20Nightmare%20in%20Dream%20Land%20(USA).png',
  },
  {
    id: 'b_gba_3',
    title: 'Pokémon Emerald Version',
    oldFile: 'Pokemon_Emerald.gba',
    cleanFile: 'Pokemon Emerald (RUS).gba',
    console: 'Game Boy Advance',
    consoleShort: 'GBA',
    bitness: '32-bit',
    region: 'RUS',
    genre: 'RPG / Приключения',
    year: 2004,
    size: '16.0 МБ',
    crc32: '5C89A10B',
    serial: 'AGB-BPEE',
    emulator: 'mGBA ★',
    status: '✔ В библиотеке',
    boxArtUrl: 'https://thumbnails.libretro.com/Nintendo%20-%20Game%20Boy%20Advance/Named_Boxarts/Pokemon%20-%20Emerald%20Version%20(USA%2C%20Europe).png',
  },

  // --- NES / DENDY (8-bit) ---
  {
    id: 'b_nes_1',
    title: 'Chip ’n Dale: Rescue Rangers (Чип и Дейл)',
    oldFile: 'Chip_and_Dale_RU.nes',
    cleanFile: 'Chip n Dale Rescue Rangers (RUS).nes',
    console: 'Nintendo NES / Dendy',
    consoleShort: 'NES',
    bitness: '8-bit',
    region: 'RUS',
    genre: 'Платформер / Детские',
    year: 1990,
    size: '0.25 МБ',
    crc32: '4A90E12C',
    serial: 'NES-RR',
    emulator: 'RetroArch (FCEUmm) ★',
    status: '✔ В библиотеке',
    boxArtUrl: 'https://thumbnails.libretro.com/Nintendo%20-%20Nintendo%20Entertainment%20System/Named_Boxarts/Disney%27s%20Chip%20%27n%20Dale%20-%20Rescue%20Rangers%20(USA).png',
  },
  {
    id: 'b_nes_2',
    title: 'DuckTales (Утиные Истории)',
    oldFile: 'Duck_Tales_RUS.nes',
    cleanFile: 'DuckTales (RUS).nes',
    console: 'Nintendo NES / Dendy',
    consoleShort: 'NES',
    bitness: '8-bit',
    region: 'RUS',
    genre: 'Платформер / Детские',
    year: 1989,
    size: '0.25 МБ',
    crc32: '7B11D40E',
    serial: 'NES-UK',
    emulator: 'RetroArch (FCEUmm) ★',
    status: '✔ В библиотеке',
    boxArtUrl: 'https://thumbnails.libretro.com/Nintendo%20-%20Nintendo%20Entertainment%20System/Named_Boxarts/Disney%27s%20DuckTales%20(USA).png',
  },
  {
    id: 'b_nes_3',
    title: 'Battletoads & Double Dragon',
    oldFile: 'Battletoads_DD.nes',
    cleanFile: 'Battletoads and Double Dragon (RUS).nes',
    console: 'Nintendo NES / Dendy',
    consoleShort: 'NES',
    bitness: '8-bit',
    region: 'RUS',
    genre: 'Beat ’em up / Хардкор',
    year: 1993,
    size: '0.5 МБ',
    crc32: '9E44C802',
    serial: 'NES-U8',
    emulator: 'RetroArch (FCEUmm) ★',
    status: '✔ В библиотеке',
    boxArtUrl: 'https://thumbnails.libretro.com/Nintendo%20-%20Nintendo%20Entertainment%20System/Named_Boxarts/Battletoads-Double%20Dragon%20(USA).png',
  },
  {
    id: 'b_nes_4',
    title: 'Kirby’s Adventure',
    oldFile: 'Kirbys_Adventure.nes',
    cleanFile: 'Kirbys Adventure (RUS).nes',
    console: 'Nintendo NES / Dendy',
    consoleShort: 'NES',
    bitness: '8-bit',
    region: 'RUS',
    genre: 'Платформер / Уютные',
    year: 1993,
    size: '0.75 МБ',
    crc32: '2C78F11B',
    serial: 'NES-KR',
    emulator: 'RetroArch (FCEUmm) ★',
    status: '✔ В библиотеке',
    boxArtUrl: 'https://thumbnails.libretro.com/Nintendo%20-%20Nintendo%20Entertainment%20System/Named_Boxarts/Kirby%27s%20Adventure%20(USA).png',
  },
  {
    id: 'b_ports_celeste',
    title: 'Celeste (PortMaster)',
    oldFile: 'Celeste.sh',
    cleanFile: 'Celeste.sh',
    console: 'PortMaster (PC / Linux Порты)',
    consoleShort: 'PORTS',
    bitness: '32/64-bit',
    region: 'World',
    genre: 'Платформер / Инди',
    year: 2018,
    size: '420 МБ',
    crc32: 'PMCELEST',
    serial: 'PM-CELESTE',
    emulator: 'PortMaster (WSL2 / PC) ★',
    status: '✔ Готовый экземпляр PortMaster',
    boxArtUrl: 'https://raw.githubusercontent.com/PortsMaster/PortMaster-New/main/ports/celeste/cover.png',
    sourceExt: '.sh',
    relativePath: 'ports/Celeste.sh',
  },
  {
    id: 'b_ports_stardew',
    title: 'Stardew Valley (PortMaster)',
    oldFile: 'Stardew Valley.sh',
    cleanFile: 'Stardew Valley.sh',
    console: 'PortMaster (PC / Linux Порты)',
    consoleShort: 'PORTS',
    bitness: '32/64-bit',
    region: 'RUS',
    genre: 'RPG / Ферма / Уютные',
    year: 2016,
    size: '680 МБ',
    crc32: 'PMSTARDE',
    serial: 'PM-STARDEW',
    emulator: 'PortMaster (WSL2 / PC) ★',
    status: '✔ Готовый экземпляр PortMaster',
    boxArtUrl: 'https://raw.githubusercontent.com/PortsMaster/PortMaster-New/main/ports/stardewvalley/cover.png',
    sourceExt: '.sh',
    relativePath: 'ports/Stardew Valley.sh',
  },
  {
    id: 'b_ports_balatro',
    title: 'Balatro (PortMaster)',
    oldFile: 'Balatro.sh',
    cleanFile: 'Balatro.sh',
    console: 'PortMaster (PC / Linux Порты)',
    consoleShort: 'PORTS',
    bitness: '32/64-bit',
    region: 'World',
    genre: 'Рогалик / Карточные',
    year: 2024,
    size: '95 МБ',
    crc32: 'PMBALATR',
    serial: 'PM-BALATRO',
    emulator: 'LÖVE / PortMaster (PC) ★',
    status: '✔ Готовый экземпляр PortMaster',
    boxArtUrl: 'https://raw.githubusercontent.com/PortsMaster/PortMaster-New/main/ports/balatro/cover.png',
    sourceExt: '.sh',
    relativePath: 'ports/Balatro.sh',
  },
];

// ============================================================================
// AUTOMATIC METADATA ENRICHMENT FOR ANY GAME (Fast WeakMap + RegExp Cache)
// ============================================================================
const enrichedGameWeakCache = new WeakMap<UnifiedGameRow, EnrichedBuildGame>();

const RE_BIT_8_CONSOLES = new Set(['NES', 'FAMICOM', 'GB', 'GBC', 'SMS', 'MASTERSYSTEM', 'GAMEGEAR', 'ATARI2600']);
const RE_BIT_16_CONSOLES = new Set(['SNES', 'SFC', 'GENESIS', 'MEGADRIVE', 'MD', 'PCENGINE', 'ARCADE', 'SEGA32X']);
const PAIRED_DISK_FORMATS = new Set(['.bin+.cue', '.img+.cue', '.ccd+.img', '.mdf+.mds', '.iso+.cue', '.gdi']);

const RE_AGE_18 = /resident evil|biohazard|silent hill|dino crisis|parasite eve|mortal kombat|doom|quake|twisted metal|legacy of kain|metal gear/i;
const RE_AGE_18_GENRE = /хоррор|триллер|horror|thriller/i;
const RE_AGE_6 = /kirby|mario|yoshi|sonic|chip|ducktales|duck tales|aladdin|lion king|mermaid|ariel|spyro|harvest moon|tetris/i;
const RE_AGE_14 = /tekken|street fighter|castlevania|chrono|final fantasy|gran turismo|need for speed|metroid|contra|comix zone/i;

const RE_DIFF_HARD = /contra|battletoads|castlevania|ghosts|ninja gaiden|comix zone|resident evil|silent hill/i;
const RE_DIFF_EASY = /kirby|harvest moon|yoshi|spyro|mermaid|ariel|aladdin|ducktales|chip|pok[eé]mon|sailor moon/i;

const RE_GIRLS_TITLE = /sailor moon|mermaid|ariel|spyro|harvest moon|kirby|yoshi|crash team racing|\bctr\b|aladdin|lion king|pok[eé]mon|barbie|sims/i;
const RE_GIRLS_GENRE = /девочек|уютн|сказк|girls|cozy|fairy/i;

export function enrichGameForBuild(g: UnifiedGameRow): EnrichedBuildGame {
  const cached = enrichedGameWeakCache.get(g);
  if (cached) return cached;

  // Статус хака: у строк из старых баз его нет — определяем по имени файла.
  // Hack status: rows from older databases lack it, so derive it from the file name.
  const modInfo = g.modKind ? null : detectRomMod(g.oldFile || '', g.relativePath || '');
  const modKind = g.modKind || modInfo?.kind;
  const modLang = g.modLang || modInfo?.language;

  const title = g.title || '';
  const genre = g.genre || '';
  const lowerFile = (g.oldFile || g.cleanFile || '').toLowerCase();
  const cShort = (g.consoleShort || '').toUpperCase();

  // 1. Bitness Group
  let bitnessGroup: BitnessGroupTag = '32/64-bit';
  if (RE_BIT_8_CONSOLES.has(cShort) || (g.bitness && g.bitness.includes('8'))) {
    bitnessGroup = '8-bit';
  } else if (RE_BIT_16_CONSOLES.has(cShort) || (g.bitness && g.bitness.includes('16'))) {
    bitnessGroup = '16-bit';
  } else if (cShort === 'PORTS' || cShort === 'PORTMASTER') {
    bitnessGroup = '32/64-bit';
  }

  // 2. Age Rating (6+, 10+, 14+, 18+)
  let ageRating: AgeRatingTag = '10+';
  if (RE_AGE_18.test(title) || RE_AGE_18_GENRE.test(genre)) {
    ageRating = '18+';
  } else if (RE_AGE_6.test(title)) {
    ageRating = '6+';
  } else if (RE_AGE_14.test(title)) {
    ageRating = '14+';
  }

  // 3. Difficulty (Easy / Relax vs Medium vs Hardcore)
  let difficulty: DifficultyTag = 'medium';
  let difficultyLabel = tStatic('diff.medium');
  if (RE_DIFF_HARD.test(title) || /хардкор|hardcore/i.test(genre)) {
    difficulty = 'hardcore';
    difficultyLabel = tStatic('diff.hardcore');
  } else if (RE_DIFF_EASY.test(title) || /уютн|cozy|relax/i.test(genre)) {
    difficulty = 'easy_relax';
    difficultyLabel = tStatic('diff.easy_relax');
  }

  // 4. Girls Favorite ("Любят девочки")
  const girlsFavorite = RE_GIRLS_TITLE.test(title) || RE_GIRLS_GENRE.test(genre);

  // 5. Source file extension & numeric size in MB
  const dotIdx = lowerFile.lastIndexOf('.');
  let sourceExt = g.sourceExt
    ? g.sourceExt.toLowerCase()
    : g.discs && g.discs[0]?.sourceExt
    ? g.discs[0].sourceExt.toLowerCase()
    : dotIdx !== -1
    ? lowerFile.slice(dotIdx)
    : '.chd';
  if (sourceExt === '.m3u' && g.discs && g.discs[0]?.sourceExt) {
    sourceExt = g.discs[0].sourceExt.toLowerCase();
  }
  if (!PAIRED_DISK_FORMATS.has(sourceExt)) {
    if ((g.companionFiles && g.companionFiles.length > 0) || sourceExt === '.cue') {
      const compName = g.companionFiles?.[0]?.name?.toLowerCase() || '';
      if (compName.endsWith('.img')) sourceExt = '.img+.cue';
      else if (compName.endsWith('.iso')) sourceExt = '.iso+.cue';
      else sourceExt = '.bin+.cue';
    }
  }
  let sizeMB = 4;
  if (typeof g.totalBytes === 'number' && g.totalBytes > 0) {
    sizeMB = Math.max(0.05, Math.round((g.totalBytes / (1024 * 1024)) * 100) / 100);
  } else if (g.size) {
    const parsedNum = parseFloat(g.size.replace(',', '.'));
    const gbUnit = tStatic('size.gb');
    const kbUnit = tStatic('size.kb');
    const isGb = g.size.includes('ГБ') || /\b(?:GB|Go)\b/i.test(g.size) || (gbUnit && g.size.includes(gbUnit));
    const isKb = g.size.includes('КБ') || /\b(?:KB|Ko)\b/i.test(g.size) || (kbUnit && g.size.includes(kbUnit));
    sizeMB = isGb
      ? parsedNum * 1024
      : isKb
      ? parsedNum / 1024
      : !isNaN(parsedNum)
      ? parsedNum
      : cShort === 'PSX'
      ? 400
      : 4;
  }

  const enriched: EnrichedBuildGame = {
    ...g,
    modKind,
    modLang,
    ageRating,
    difficulty,
    difficultyLabel,
    girlsFavorite,
    bitnessGroup,
    sourceExt,
    sizeMB,
  };
  enrichedGameWeakCache.set(g, enriched);
  return enriched;
}

// ============================================================================
// 13 READY-MADE THEMATIC BUILD PRESETS (Возраст, Сложность, Аудитория, Жанры, Битность)
// ============================================================================
export const THEMATIC_BUILD_PRESETS: ThematicBuildPreset[] = [
  // --- ПО ВОЗРАСТУ (6+, 10+, 14+, 18+) ---
  {
    id: 'preset_age_6',
    category: 'age',
    categoryLabel: 'По возрасту',
    badgeText: '6+ лет',
    badgeColor: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
    title: 'Игры для детей 6+ лет (Добрая классика и сказки)',
    subtitle: 'Яркие платформеры без насилия: Чип и Дейл, Утиные истории, Аладдин, Король Лев, Кирби, Йоши, Spyro',
    recommendedTargetId: 'r36s_arkos',
    filterFn: (g) => g.ageRating === '6+',
  },
  {
    id: 'preset_age_10',
    category: 'age',
    categoryLabel: 'По возрасту',
    badgeText: '10+ лет',
    badgeColor: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
    title: 'Игры для 10+ лет (Семейные приключения и аркадные гонки)',
    subtitle: 'Crash Bandicoot, Crash Team Racing, Pokémon, Sonic 2, Super Mario Kart и лучшие приключения',
    recommendedTargetId: 'r36s_arkos',
    filterFn: (g) => g.ageRating === '6+' || g.ageRating === '10+',
  },
  {
    id: 'preset_age_14',
    category: 'age',
    categoryLabel: 'По возрасту',
    badgeText: '14+ лет',
    badgeColor: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300',
    title: 'Подборка 14+ лет (Турнирные файтинги, JRPG, экшены и автосимуляторы)',
    subtitle: 'Tekken 3, Gran Turismo 2, Need for Speed, Chrono Trigger, Castlevania: SotN, Metroid Fusion, Comix Zone',
    recommendedTargetId: 'r36s_arkos',
    filterFn: (g) => g.ageRating === '14+',
  },
  {
    id: 'preset_age_18',
    category: 'age',
    categoryLabel: 'По возрасту',
    badgeText: '18+ лет',
    badgeColor: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300',
    title: 'Строго 18+ (Survival Horror, триллеры и жёсткие боевики)',
    subtitle: 'Resident Evil 2, Silent Hill, Ultimate Mortal Kombat 3, Metal Gear Solid, Legacy of Kain',
    recommendedTargetId: 'psx_duckstation_iso',
    filterFn: (g) => g.ageRating === '18+',
  },

  // --- ПО НАСТРОЕНИЮ, СЛОЖНОСТИ И АУДИТОРИИ ---
  {
    id: 'preset_easy_relax',
    category: 'mood_audience',
    categoryLabel: 'Сложность и настроение',
    badgeText: 'Расслабиться',
    badgeColor: 'bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300',
    title: 'Простые игры, чтобы расслабиться вечером (Антистресс / Cozy)',
    subtitle: 'Спокойный темп, уютная музыка и приятный геймплей: Harvest Moon, Kirby, Spyro, Yoshi’s Island',
    recommendedTargetId: 'miyoo_anbernic',
    filterFn: (g) => g.difficulty === 'easy_relax',
  },
  {
    id: 'preset_hardcore',
    category: 'mood_audience',
    categoryLabel: 'Сложность и настроение',
    badgeText: 'Хардкор ★',
    badgeColor: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300',
    title: 'Сложные игры (Настоящий вызов и проверка реакции)',
    subtitle: 'Contra: Hard Corps, Battletoads & Double Dragon, Comix Zone, Castlevania, Resident Evil 2',
    recommendedTargetId: 'r36s_arkos',
    filterFn: (g) => g.difficulty === 'hardcore',
  },
  {
    id: 'preset_girls_love',
    category: 'mood_audience',
    categoryLabel: 'Сложность и настроение',
    badgeText: 'Любят девочки ♥',
    badgeColor: 'bg-pink-100 text-pink-800 dark:bg-pink-950 dark:text-pink-300',
    title: 'Любят девочки (Красочные миры, героини, сказки и уютные фермы)',
    subtitle: 'Сейлор Мун, Русалочка Ариэль, Spyro the Dragon, Harvest Moon, Kirby, Crash Team Racing, Pokémon',
    recommendedTargetId: 'r36s_arkos',
    filterFn: (g) => g.girlsFavorite,
  },

  // --- ПО ЖАНРАМ ---
  {
    id: 'preset_genre_fighting',
    category: 'genre',
    categoryLabel: 'По жанрам',
    badgeText: 'Файтинги',
    badgeColor: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300',
    title: 'Золотая коллекция Файтингов (Бои на двоих и турнирная классика)',
    subtitle: 'Tekken 3, Ultimate Mortal Kombat 3 и лучшие единоборства 16/32-бит',
    recommendedTargetId: 'r36s_arkos',
    filterFn: (g) =>
      g.genre.toLowerCase().includes('файт') ||
      g.genre.toLowerCase().includes('fight') ||
      g.title.toLowerCase().includes('tekken') ||
      g.title.toLowerCase().includes('mortal kombat') ||
      g.title.toLowerCase().includes('street fighter'),
  },
  {
    id: 'preset_genre_racing',
    category: 'genre',
    categoryLabel: 'По жанрам',
    badgeText: 'Гонки',
    badgeColor: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300',
    title: 'Лучшие Гонки всех поколений (Симуляторы + Боевой картинг)',
    subtitle: 'Gran Turismo 2, Need for Speed: High Stakes, Crash Team Racing, Rock n’ Roll Racing, Super Mario Kart',
    recommendedTargetId: 'r36s_arkos',
    filterFn: (g) =>
      g.genre.toLowerCase().includes('гонк') ||
      g.genre.toLowerCase().includes('rac') ||
      g.title.toLowerCase().includes('turismo') ||
      g.title.toLowerCase().includes('racing') ||
      g.title.toLowerCase().includes('need for speed') ||
      g.title.toLowerCase().includes('kart'),
  },
  {
    id: 'preset_genre_rpg',
    category: 'genre',
    categoryLabel: 'По жанрам',
    badgeText: 'RPG / Сюжет',
    badgeColor: 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300',
    title: 'Эпические RPG, Метроидвании и Сюжетные шедевры (RUS)',
    subtitle: 'Chrono Trigger, Castlevania: Symphony of the Night, Metroid Fusion, Pokémon Emerald, Metal Gear Solid',
    recommendedTargetId: 'steamdeck_emudeck',
    filterFn: (g) =>
      g.genre.toLowerCase().includes('rpg') ||
      g.genre.toLowerCase().includes('метроид') ||
      g.genre.toLowerCase().includes('metroid') ||
      g.genre.toLowerCase().includes('стелс') ||
      g.genre.toLowerCase().includes('stealth'),
  },

  // --- ПО РАЗРЯДНОСТИ (8-БИТ, 16-БИТ, 32/64-БИТ) ---
  {
    id: 'preset_bits_8',
    category: 'bitness',
    categoryLabel: 'По битности',
    badgeText: '8-бит',
    badgeColor: 'bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-200',
    title: 'Подборка 8-бит (Легенды Dendy / NES / Famicom / Master System)',
    subtitle: 'Чип и Дейл, Утиные истории, Battletoads & Double Dragon, Kirby’s Adventure — мгновенный старт',
    recommendedTargetId: 'everdrive_flashcart',
    filterFn: (g) => g.bitnessGroup === '8-bit',
  },
  {
    id: 'preset_bits_16',
    category: 'bitness',
    categoryLabel: 'По битности',
    badgeText: '16-бит',
    badgeColor: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-300',
    title: 'Подборка 16-бит (Битва титанов: Sega Mega Drive + Super Nintendo)',
    subtitle: 'Sonic 2, Aladdin, Lion King, UMK3, Contra Hard Corps, Comix Zone, Chrono Trigger, Rock n’ Roll Racing',
    recommendedTargetId: 'r36s_arkos',
    filterFn: (g) => g.bitnessGroup === '16-bit',
  },
  {
    id: 'preset_bits_32_64',
    category: 'bitness',
    categoryLabel: 'По битности',
    badgeText: '32 / 64-бит',
    badgeColor: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300',
    title: 'Подборка 32/64-бит и 3D (PlayStation 1 + Game Boy Advance + N64)',
    subtitle: 'Tekken 3, Crash 3, Spyro, Gran Turismo 2, Resident Evil 2, Silent Hill, Castlevania SotN, Metroid Fusion',
    recommendedTargetId: 'r36s_arkos',
    filterFn: (g) => g.bitnessGroup === '32/64-bit',
  },

  // --- ПО СТАТУСУ (ПЕРЕВОДЫ, ХАКИ, ОРИГИНАЛЫ) / BY STATUS (TRANSLATIONS, HACKS, ORIGINALS) ---
  {
    id: 'preset_mod_rus',
    category: 'status',
    categoryLabel: 'По статусу',
    badgeText: 'Русификаторы',
    badgeColor: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300',
    title: 'Только русификаторы',
    subtitle: 'Фанатские переводы на русский: теги [T+Rus], (Rus Translation) или патч из patch/',
    recommendedTargetId: 'r36s_arkos',
    filterFn: (g) => g.modKind === 'translation' && (g.modLang || '').toLowerCase() === 'rus',
  },
  {
    id: 'preset_mod_hacks',
    category: 'status',
    categoryLabel: 'По статусу',
    badgeText: 'Ромхаки',
    badgeColor: 'bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-950 dark:text-fuchsia-300',
    title: 'Только ромхаки',
    subtitle: 'Хаки с новыми уровнями, графикой и механикой: теги [h], (Hack)',
    recommendedTargetId: 'r36s_arkos',
    filterFn: (g) => g.modKind === 'hack',
  },
  {
    id: 'preset_mod_originals',
    category: 'status',
    categoryLabel: 'По статусу',
    badgeText: 'Без хаков',
    badgeColor: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
    title: 'Только оригиналы, без хаков и патчей',
    subtitle: 'Чистые дампы: без переводов, хаков, трейнеров и фиксов',
    recommendedTargetId: 'r36s_arkos',
    filterFn: (g) => !g.modKind || g.modKind === 'original',
  },
];

// ============================================================================
// TARGET HARDWARE / EMULATOR PROFILES & FORMAT CONVERSION RULES
// ============================================================================
export const TARGET_SYSTEM_PROFILES: TargetSystemProfile[] = [
  {
    id: 'r36s_arkos',
    name: 'Портативная консоль R36S / R36H (ArkOS / AmberELEC — EASYROMS)',
    shortName: 'R36S / ArkOS (CHD + плоский EASYROMS)',
    deviceCategory: 'handheld_linux',
    description:
      'Создаёт плоские папки консолей (EASYROMS/psx, gba, megadrive, snes, nes) с обложками в images/, видео в videos/ и конвертирует образы дисков PSX (.iso/.bin) в сжатый формат .chd',
    hierarchyPattern: 'EASYROMS/{console}/{CleanGame}.{chd|gba|md|sfc|nes} + images/ + videos/ + gamelist.xml',
    mediaFolders: ['images', 'marquees', 'videos'],
    gamelistFormat: 'emulationstation_xml',
    defaultFormats: {
      PSX: '.chd',
      PSP: '.cso',
      GENESIS: '.md',
      SNES: '.sfc',
      NES: '.nes',
      GBA: '.gba',
      N64: '.z64',
    },
    availableFormats: {
      PSX: ['.chd', '.pbp', '.iso', '.bin+.cue'],
      PSP: ['.cso', '.chd', '.iso'],
      GENESIS: ['.md', '.bin', '.zip'],
      SNES: ['.sfc', '.smc', '.zip'],
      NES: ['.nes', '.zip'],
      GBA: ['.gba', '.zip'],
      N64: ['.z64', '.n64', '.v64'],
    },
  },
  {
    id: 'psx_duckstation_iso',
    name: 'PlayStation 1 / PSIO / XStation / Классический эмулятор (Образы ISO / BIN+CUE)',
    shortName: 'PS1 / PSIO / Эмулятор (Конвертация CHD ➔ ISO / BIN+CUE)',
    deviceCategory: 'original_console',
    description:
      'Обратная конвертация! Если в базе игра хранится в сжатом .chd (с флешки R36S), конвертер распаковывает её обратно в классический образ диска .iso или .bin+.cue в отдельной папке каждой игры',
    hierarchyPattern: 'PSX_Games/{GameTitle}/{GameTitle}.{iso|bin+cue} + covers/',
    mediaFolders: ['covers'],
    gamelistFormat: 'none',
    defaultFormats: {
      PSX: '.iso',
      PSP: '.iso',
      GENESIS: '.bin',
      SNES: '.sfc',
      NES: '.nes',
      GBA: '.gba',
      N64: '.z64',
    },
    availableFormats: {
      PSX: ['.iso', '.bin+.cue', '.chd', '.pbp'],
      PSP: ['.iso', '.cso'],
      GENESIS: ['.bin', '.md', '.smd'],
      SNES: ['.sfc', '.smc'],
      NES: ['.nes'],
      GBA: ['.gba'],
      N64: ['.z64', '.v64'],
    },
  },
  {
    id: 'psp_vita_adrenaline',
    name: 'Sony PSP / PS Vita (Adrenaline CFW — Конвертация PS1 в EBOOT.PBP)',
    shortName: 'PSP / PS Vita (PSX ➔ EBOOT.PBP + PSP ➔ CSO)',
    deviceCategory: 'handheld_linux',
    description:
      'Конвертирует образы PlayStation 1 (.chd / .iso / .bin) в подписанный контейнер PSP/GAME/{SLUS}/EBOOT.PBP, а игры PSP сжимает в ISO/CSO',
    hierarchyPattern: 'PSP/GAME/{Serial_ID}/EBOOT.PBP + ISO/{Game}.cso',
    mediaFolders: ['ICON0'],
    gamelistFormat: 'none',
    defaultFormats: {
      PSX: '.pbp',
      PSP: '.cso',
      GENESIS: '.zip',
      SNES: '.zip',
      NES: '.zip',
      GBA: '.gba',
      N64: '.z64',
    },
    availableFormats: {
      PSX: ['.pbp', '.iso'],
      PSP: ['.cso', '.iso'],
      GENESIS: ['.zip', '.md'],
      SNES: ['.zip', '.sfc'],
      NES: ['.zip', '.nes'],
      GBA: ['.gba', '.zip'],
      N64: ['.z64'],
    },
  },
  {
    id: 'miyoo_anbernic',
    name: 'Miyoo Mini Plus (OnionOS) / Anbernic RG35XX (GarlicOS / MuOS)',
    shortName: 'Miyoo Mini / Anbernic RG35XX (Roms/{PS,GBA,MD})',
    deviceCategory: 'handheld_linux',
    description:
      'Строит иерархию OnionOS / GarlicOS: папки Roms/PS, Roms/GBA, Roms/MD, Roms/SFC, Roms/FC, обложки в Imgs/ и файл miyoogamelist.xml',
    hierarchyPattern: 'Roms/{PS|GBA|MD|SFC|FC}/{CleanGame}.{chd|pbp|gba|md|sfc} + Imgs/',
    mediaFolders: ['Imgs'],
    gamelistFormat: 'miyoo_xml',
    defaultFormats: {
      PSX: '.chd',
      PSP: '.cso',
      GENESIS: '.md',
      SNES: '.sfc',
      NES: '.nes',
      GBA: '.gba',
      N64: '.z64',
    },
    availableFormats: {
      PSX: ['.chd', '.pbp', '.bin+.cue'],
      PSP: ['.cso', '.iso'],
      GENESIS: ['.md', '.zip'],
      SNES: ['.sfc', '.zip'],
      NES: ['.nes', '.zip'],
      GBA: ['.gba', '.zip'],
      N64: ['.z64'],
    },
  },
  {
    id: 'steamdeck_emudeck',
    name: 'Steam Deck (EmuDeck / ES-DE) / RetroBat на ПК (Windows 10/11)',
    shortName: 'Steam Deck (EmuDeck) / RetroBat ПК',
    deviceCategory: 'pc_emulator',
    description:
      'Создаёт структуру Emulation/roms/{console} + downloaded_media/{console}/{covers,videos,marquees} для моментального подхвата в Steam Romanager и EmulationStation-DE',
    hierarchyPattern: 'Emulation/roms/{console}/{CleanGame}.{chd|iso|gba|md|sfc} + downloaded_media/',
    mediaFolders: ['covers', 'marquees', 'videos'],
    gamelistFormat: 'emulationstation_xml',
    defaultFormats: {
      PSX: '.chd',
      PSP: '.chd',
      GENESIS: '.md',
      SNES: '.sfc',
      NES: '.nes',
      GBA: '.gba',
      N64: '.z64',
    },
    availableFormats: {
      PSX: ['.chd', '.iso', '.bin+.cue', '.pbp'],
      PSP: ['.chd', '.iso', '.cso'],
      GENESIS: ['.md', '.bin', '.zip'],
      SNES: ['.sfc', '.smc', '.zip'],
      NES: ['.nes', '.zip'],
      GBA: ['.gba', '.zip'],
      N64: ['.z64', '.n64'],
    },
  },
  {
    id: 'everdrive_flashcart',
    name: 'Флеш-картриджи для реальных приставок (EverDrive N8 / Mega EverDrive / FXPAK / EZ-Flash)',
    shortName: 'EverDrive / EZ-Flash (Чистые No-Intro дампы без заголовков)',
    deviceCategory: 'flashcart',
    description:
      'Распаковывает архивы, удаляет лишние copier-заголовки (.smc ➔ .sfc), деинтерливит блоки (.smd ➔ .md), выравнивает порядок байт (.v64 ➔ .z64) и раскладывает ромы по алфавиту A-Z',
    hierarchyPattern: '{Console}/{A-Z}/{CleanGame}.{nes|sfc|md|gba|z64}',
    mediaFolders: [],
    gamelistFormat: 'none',
    defaultFormats: {
      PSX: '.bin+.cue',
      PSP: '.iso',
      GENESIS: '.md',
      SNES: '.sfc',
      NES: '.nes',
      GBA: '.gba',
      N64: '.z64',
    },
    availableFormats: {
      PSX: ['.bin+.cue', '.iso'],
      PSP: ['.iso'],
      GENESIS: ['.md', '.bin'],
      SNES: ['.sfc'],
      NES: ['.nes'],
      GBA: ['.gba'],
      N64: ['.z64'],
    },
  },
];

// ============================================================================
// FORMAT CONVERSION PLANNER & REAL BINARY CONVERTER ENGINE
// ============================================================================
export function describeFormatConversion(
  consoleShort: string,
  sourceExt: string,
  targetExt: string
): FormatConversionRule {
  const src = sourceExt.toLowerCase();
  const dst = targetExt.toLowerCase();

  if (src === dst || ((src === '.cue' || src === '.bin+.cue') && dst === '.bin+.cue')) {
    return {
      consoleCode: consoleShort,
      sourceFormat: src,
      targetFormat: dst,
      actionType: 'keep_as_is',
      conversionKind: 'copy',
      canExecuteInBrowser: true,
      requiresChdman: false,
      operationSummary:
        dst === '.bin+.cue'
          ? tStatic('engine.conv.copyCueBundle')
          : tfStatic('engine.conv.copyDirect', { src }),
      toolEngine: 'Direct Stream Copy',
      sizeRatio: 1.0,
    };
  }

  // Real binary sector conversion: .bin / .bin+.cue / .img+.cue / .ccd+.img / .mdf+.mds / .iso+.cue / .img / .mdf -> .iso (2352B/2448B -> 2048B ISO9660)
  if (
    (src === '.bin+.cue' ||
      src === '.img+.cue' ||
      src === '.ccd+.img' ||
      src === '.mdf+.mds' ||
      src === '.iso+.cue' ||
      src === '.cue' ||
      src === '.bin' ||
      src === '.img' ||
      src === '.mdf' ||
      src === '.gdi') &&
    dst === '.iso'
  ) {
    return {
      consoleCode: consoleShort,
      sourceFormat: src,
      targetFormat: dst,
      actionType: 'optical_bin_cue_to_iso',
      conversionKind: 'builtin_binary',
      canExecuteInBrowser: true,
      requiresChdman: false,
      operationSummary: tStatic('engine.conv.stripToIso'),
      toolEngine: 'AegisISO Sector Stripper (2352B/2448B ➔ 2048B)',
      sizeRatio: src.includes('ccd') || src.includes('mdf') ? 0.84 : 0.87,
    };
  }

  // Real binary sector conversion: .iso -> .bin+.cue (2048B -> MODE2/2352 + .cue)
  if (src === '.iso' && (dst === '.bin+.cue' || dst === '.bin')) {
    return {
      consoleCode: consoleShort,
      sourceFormat: src,
      targetFormat: dst,
      actionType: 'optical_iso_to_bin_cue',
      conversionKind: 'builtin_binary',
      canExecuteInBrowser: true,
      requiresChdman: false,
      operationSummary: tStatic('engine.conv.isoToBinCue'),
      toolEngine: 'AegisBIN+CUE Builder (2048B ➔ MODE2/2352)',
      sizeRatio: 1.15,
    };
  }

  // Real binary conversion: .img+.cue / .ccd+.img / .mdf+.mds / .iso+.cue / .img / .mdf -> clean .bin+.cue
  if (
    (src === '.img+.cue' ||
      src === '.ccd+.img' ||
      src === '.mdf+.mds' ||
      src === '.iso+.cue' ||
      src === '.img' ||
      src === '.mdf') &&
    (dst === '.bin+.cue' || dst === '.bin')
  ) {
    return {
      consoleCode: consoleShort,
      sourceFormat: src,
      targetFormat: dst,
      actionType: 'optical_raw_to_bin_cue',
      conversionKind: 'builtin_binary',
      canExecuteInBrowser: true,
      requiresChdman: false,
      operationSummary: tfStatic('engine.conv.normalizeToBinCue', { src }),
      toolEngine: 'AegisDisc Normalize (2448B/2352B/2048B ➔ BIN+CUE)',
      sizeRatio: 0.96,
    };
  }

  // PSX / Optical CHD conversions (require real chdman.exe — NEVER fake-renamed!)
  if (src === '.chd' && (dst === '.iso' || dst === '.bin+.cue' || dst === '.bin')) {
    return {
      consoleCode: consoleShort,
      sourceFormat: src,
      targetFormat: dst,
      actionType: 'optical_chd_to_iso',
      conversionKind: 'chdman_required',
      canExecuteInBrowser: false,
      requiresChdman: true,
      operationSummary: tfStatic('engine.conv.chdExtract', { src, dst }),
      toolEngine: 'chdman.exe (MAME extractcd)',
      sizeRatio: dst === '.iso' ? 1.38 : 1.58,
    };
  }

  if (
    (src === '.iso' ||
      src === '.bin' ||
      src === '.cue' ||
      src === '.bin+.cue' ||
      src === '.img+.cue' ||
      src === '.ccd+.img' ||
      src === '.mdf+.mds' ||
      src === '.iso+.cue' ||
      src === '.img' ||
      src === '.mdf' ||
      src === '.gdi') &&
    dst === '.chd'
  ) {
    return {
      consoleCode: consoleShort,
      sourceFormat: src,
      targetFormat: dst,
      actionType: 'optical_iso_to_chd',
      conversionKind: 'chdman_required',
      canExecuteInBrowser: false,
      requiresChdman: true,
      operationSummary:
        src === '.mdf+.mds' || src === '.mdf'
          ? tStatic('engine.conv.chdCompressMdf')
          : src.includes('.cue') || src === '.ccd+.img' || src === '.gdi'
          ? tfStatic('engine.conv.chdCompressCue', { src })
          : tfStatic('engine.conv.chdCompressIso', { src }),
      toolEngine: 'chdman.exe (MAME createcd)',
      sizeRatio: 0.58,
    };
  }

  if (dst === '.pbp' || dst === '.cso') {
    return {
      consoleCode: consoleShort,
      sourceFormat: src,
      targetFormat: dst,
      actionType: dst === '.pbp' ? 'optical_to_pbp' : 'psp_iso_cso',
      conversionKind: 'external_pbp_cso',
      canExecuteInBrowser: false,
      requiresChdman: false,
      operationSummary:
        dst === '.pbp'
          ? tStatic('engine.conv.needPsx2Psp')
          : tfStatic('engine.conv.needMaxcso', { src }),
      toolEngine:
        dst === '.pbp'
          ? tfStatic('engine.conv.externalSuffix', { tool: 'PSX2PSP' })
          : tfStatic('engine.conv.externalSuffix', { tool: 'maxcso' }),
      sizeRatio: 0.68,
    };
  }

  // Cartridge binary conversions (SNES .smc <-> .sfc, Genesis .smd -> .md, N64 .v64/.n64 -> .z64)
  if ((src === '.smc' && dst === '.sfc') || (src === '.sfc' && dst === '.smc')) {
    return {
      consoleCode: consoleShort,
      sourceFormat: src,
      targetFormat: dst,
      actionType: 'cart_header_fix',
      conversionKind: 'builtin_binary',
      canExecuteInBrowser: true,
      requiresChdman: false,
      operationSummary:
        dst === '.sfc'
          ? tStatic('engine.conv.stripCopierHdr')
          : tStatic('engine.conv.addCopierHdr'),
      toolEngine: 'AegisCart Binary Header Engine',
      sizeRatio: 1.0,
    };
  }

  if (src === '.smd' && (dst === '.md' || dst === '.bin')) {
    return {
      consoleCode: consoleShort,
      sourceFormat: src,
      targetFormat: dst,
      actionType: 'cart_header_fix',
      conversionKind: 'builtin_binary',
      canExecuteInBrowser: true,
      requiresChdman: false,
      operationSummary: tStatic('engine.conv.deinterleaveSmd'),
      toolEngine: 'AegisSega De-Interleaver',
      sizeRatio: 1.0,
    };
  }

  if ((src === '.v64' || src === '.n64') && dst === '.z64') {
    return {
      consoleCode: consoleShort,
      sourceFormat: src,
      targetFormat: dst,
      actionType: 'cart_header_fix',
      conversionKind: 'builtin_binary',
      canExecuteInBrowser: true,
      requiresChdman: false,
      operationSummary: tStatic('engine.conv.n64Byteswap'),
      toolEngine: 'AegisN64 Endianness Swapper',
      sizeRatio: 1.0,
    };
  }

  return {
    consoleCode: consoleShort,
    sourceFormat: src,
    targetFormat: dst,
    actionType: 'keep_as_is',
    conversionKind: 'copy',
    canExecuteInBrowser: true,
    requiresChdman: false,
    operationSummary: tfStatic('engine.conv.directExport', { src, dst }),
    toolEngine: 'Direct Stream Copy',
    sizeRatio: 1.0,
  };
}

// Performs real binary buffer conversion for cartridge ROMs (.smc -> .sfc, .smd -> .md, .v64 -> .z64)
export function convertCartridgeBinaryBuffer(
  sourceBuffer: ArrayBuffer,
  sourceExt: string,
  targetExt: string
): ArrayBuffer {
  const src = sourceExt.toLowerCase();
  const dst = targetExt.toLowerCase();
  const bytes = new Uint8Array(sourceBuffer);

  // 1. SNES: .smc -> .sfc (strip 512-byte copier header if present)
  if (src === '.smc' && dst === '.sfc') {
    if (bytes.byteLength > 512 && bytes.byteLength % 1024 === 512) {
      return sourceBuffer.slice(512);
    }
    return sourceBuffer;
  }

  // 2. SNES: .sfc -> .smc (prepend 512-byte copier header if not present)
  if (src === '.sfc' && dst === '.smc') {
    if (bytes.byteLength % 1024 === 0) {
      const out = new Uint8Array(bytes.byteLength + 512);
      out.set(bytes, 512);
      return out.buffer;
    }
    return sourceBuffer;
  }

  // 3. Sega Mega Drive: .smd -> .md / .bin (strip 512B header + de-interleave 16KB blocks)
  if (src === '.smd' && (dst === '.md' || dst === '.bin')) {
    if (bytes.byteLength > 512 && (bytes.byteLength - 512) % 16384 === 0) {
      const payload = bytes.subarray(512);
      const out = new Uint8Array(payload.byteLength);
      const blockCount = payload.byteLength / 16384;
      for (let b = 0; b < blockCount; b++) {
        const blockOffset = b * 16384;
        for (let i = 0; i < 8192; i++) {
          // Odd bytes are in first 8KB, even bytes are in second 8KB
          out[blockOffset + i * 2] = payload[blockOffset + 8192 + i];
          out[blockOffset + i * 2 + 1] = payload[blockOffset + i];
        }
      }
      return out.buffer;
    }
    return sourceBuffer;
  }

  // 4. Nintendo 64: .v64 (16-bit byte-swapped) or .n64 (32-bit little-endian) -> .z64 (Big-Endian)
  if ((src === '.v64' || src === '.n64') && dst === '.z64' && bytes.byteLength >= 4) {
    const out = new Uint8Array(bytes.byteLength);
    // Check magic header
    if (bytes[0] === 0x37 && bytes[1] === 0x80) {
      // .v64 ByteSwapped (16-bit swap)
      for (let i = 0; i < bytes.byteLength - 1; i += 2) {
        out[i] = bytes[i + 1];
        out[i + 1] = bytes[i];
      }
      return out.buffer;
    } else if (bytes[0] === 0x40 && bytes[1] === 0x12) {
      // .n64 Little-Endian (32-bit swap)
      for (let i = 0; i < bytes.byteLength - 3; i += 4) {
        out[i] = bytes[i + 3];
        out[i + 1] = bytes[i + 2];
        out[i + 2] = bytes[i + 1];
        out[i + 3] = bytes[i];
      }
      return out.buffer;
    }
  }

  return sourceBuffer;
}

// ============================================================================
// REAL STREAMING OPTICAL CD-ROM SECTOR CONVERTERS (.BIN+.CUE / .IMG+.CUE / .CCD / .MDF <-> .ISO)
// Supports 2048B (ISO9660), 2352B (RAW MODE1/MODE2), and 2448B (2352+96 subchannel CloneCD/Alcohol)
// ============================================================================
export interface DiscTrackLayout {
  sectorSize: 2448 | 2352 | 2048;
  dataOffset: number;
  modeLabel: string;
}

function hasCdSyncHeaderAt(bytes: Uint8Array, pos: number): boolean {
  if (pos + 12 > bytes.length) return false;
  if (bytes[pos] !== 0x00 || bytes[pos + 11] !== 0x00) return false;
  for (let i = 1; i <= 10; i++) {
    if (bytes[pos + i] !== 0xff) return false;
  }
  return true;
}

function matchAsciiAt(bytes: Uint8Array, pos: number, text: string): boolean {
  if (pos < 0 || pos + text.length > bytes.length) return false;
  for (let i = 0; i < text.length; i++) {
    if (bytes[pos + i] !== text.charCodeAt(i)) return false;
  }
  return true;
}

export async function inspectDiscTrackLayout(
  binFile: File,
  cueText?: string
): Promise<DiscTrackLayout> {
  const headLen = Math.min(binFile.size, 96 * 1024);
  const headBuf = new Uint8Array(await binFile.slice(0, headLen).arrayBuffer());

  // 1. Raw CD-ROM 2448-byte sectors (2352 + 96 R-W subchannel used in CloneCD .img and Alcohol .mdf)?
  if (hasCdSyncHeaderAt(headBuf, 0) && hasCdSyncHeaderAt(headBuf, 2448)) {
    const pvdSector = 16 * 2448;
    if (matchAsciiAt(headBuf, pvdSector + 16 + 1, 'CD001')) {
      return { sectorSize: 2448, dataOffset: 16, modeLabel: 'MODE1/2448 (2352+96 SUB)' };
    }
    if (matchAsciiAt(headBuf, pvdSector + 24 + 1, 'CD001')) {
      return { sectorSize: 2448, dataOffset: 24, modeLabel: 'MODE2/2448 (2352+96 SUB)' };
    }
    if (cueText && /MODE1\//i.test(cueText)) {
      return { sectorSize: 2448, dataOffset: 16, modeLabel: 'MODE1/2448 (CUE)' };
    }
    return { sectorSize: 2448, dataOffset: 24, modeLabel: 'MODE2/2448 (2352+96 SUB)' };
  }

  // 2. Raw CD-ROM 2352-byte sectors? (Check sync pattern at sector 0 and sector 1)
  if (hasCdSyncHeaderAt(headBuf, 0) && hasCdSyncHeaderAt(headBuf, 2352)) {
    const pvdSector = 16 * 2352;
    if (matchAsciiAt(headBuf, pvdSector + 16 + 1, 'CD001')) {
      return { sectorSize: 2352, dataOffset: 16, modeLabel: 'MODE1/2352' };
    }
    if (matchAsciiAt(headBuf, pvdSector + 24 + 1, 'CD001')) {
      return { sectorSize: 2352, dataOffset: 24, modeLabel: 'MODE2/2352 (XA)' };
    }
    if (cueText && /MODE1\/2352/i.test(cueText)) {
      return { sectorSize: 2352, dataOffset: 16, modeLabel: 'MODE1/2352 (CUE)' };
    }
    return { sectorSize: 2352, dataOffset: 24, modeLabel: 'MODE2/2352' };
  }

  // 3. Cooked 2048-byte ISO9660?
  if (matchAsciiAt(headBuf, 16 * 2048 + 1, 'CD001')) {
    return { sectorSize: 2048, dataOffset: 0, modeLabel: 'ISO9660/2048' };
  }

  // 4. Fallback by exact file divisibility
  if (binFile.size > 0 && binFile.size % 2448 === 0 && binFile.size % 2352 !== 0) {
    const isMode1 = cueText ? /MODE1\//i.test(cueText) : false;
    return {
      sectorSize: 2448,
      dataOffset: isMode1 ? 16 : 24,
      modeLabel: isMode1 ? 'MODE1/2448' : 'MODE2/2448',
    };
  }
  if (binFile.size % 2352 === 0) {
    const isMode1 = cueText ? /MODE1\/2352/i.test(cueText) : false;
    return {
      sectorSize: 2352,
      dataOffset: isMode1 ? 16 : 24,
      modeLabel: isMode1 ? 'MODE1/2352' : 'MODE2/2352',
    };
  }

  return { sectorSize: 2048, dataOffset: 0, modeLabel: 'RAW/2048' };
}

export async function streamCopyFileToWritable(
  file: File,
  writable: FileSystemWritableFileStream,
  onProgress?: (pct: number) => void
): Promise<number> {
  const CHUNK_SIZE = 8 * 1024 * 1024;
  let offset = 0;
  while (offset < file.size) {
    const end = Math.min(file.size, offset + CHUNK_SIZE);
    const sliceBuf = await file.slice(offset, end).arrayBuffer();
    await writable.write(sliceBuf);
    offset = end;
    onProgress?.(Math.round((offset / Math.max(1, file.size)) * 100));
  }
  return file.size;
}

export async function streamConvertBin2352ToIsoWritable(
  binFile: File,
  writable: FileSystemWritableFileStream,
  cueText?: string,
  onProgress?: (pct: number) => void
): Promise<{ totalOutputBytes: number; layout: DiscTrackLayout }> {
  if (binFile.size < 32768) {
    throw new Error(
      tfStatic('builds.conv.errFileTooSmall', { file: binFile.name, size: binFile.size })
    );
  }
  const layout = await inspectDiscTrackLayout(binFile, cueText);
  if (layout.sectorSize === 2048) {
    const written = await streamCopyFileToWritable(binFile, writable, onProgress);
    return { totalOutputBytes: written, layout };
  }

  const sectorSize = layout.sectorSize; // 2352 or 2448
  const SECTORS_PER_CHUNK = 4096; // 4096 * 2352 = ~9.6 MB
  const IN_CHUNK_BYTES = SECTORS_PER_CHUNK * sectorSize;
  let offset = 0;
  let totalOutputBytes = 0;

  while (offset < binFile.size) {
    const end = Math.min(binFile.size, offset + IN_CHUNK_BYTES);
    const chunkBuf = new Uint8Array(await binFile.slice(offset, end).arrayBuffer());
    const sectorCount = Math.floor(chunkBuf.byteLength / sectorSize);
    if (sectorCount === 0) break;

    const isoChunk = new Uint8Array(sectorCount * 2048);
    for (let s = 0; s < sectorCount; s++) {
      const srcStart = s * sectorSize + layout.dataOffset;
      isoChunk.set(chunkBuf.subarray(srcStart, srcStart + 2048), s * 2048);
    }
    await writable.write(isoChunk);
    totalOutputBytes += isoChunk.byteLength;
    offset += sectorCount * sectorSize;
    onProgress?.(Math.min(100, Math.round((offset / binFile.size) * 100)));
  }

  return { totalOutputBytes, layout };
}

function toBcdByte(v: number): number {
  const clamped = Math.max(0, Math.min(99, v));
  return ((Math.floor(clamped / 10) << 4) | (clamped % 10)) & 0xff;
}

export async function streamConvertIso2048ToBinCueWritable(
  isoFile: File,
  binWritable: FileSystemWritableFileStream,
  outputBinFileName: string,
  onProgress?: (pct: number) => void
): Promise<{ totalOutputBytes: number; cueContent: string }> {
  if (isoFile.size < 32768) {
    throw new Error(
      tfStatic('builds.conv.errFileTooSmall', { file: isoFile.name, size: isoFile.size })
    );
  }
  const SECTORS_PER_CHUNK = 2048; // 2048 * 2048 = 4 MB -> ~4.8 MB output
  const IN_CHUNK_BYTES = SECTORS_PER_CHUNK * 2048;
  let offset = 0;
  let lba = 0;
  let totalOutputBytes = 0;

  while (offset < isoFile.size) {
    const end = Math.min(isoFile.size, offset + IN_CHUNK_BYTES);
    const inBuf = new Uint8Array(await isoFile.slice(offset, end).arrayBuffer());
    const sectorCount = Math.floor(inBuf.byteLength / 2048);
    if (sectorCount === 0) break;

    const binChunk = new Uint8Array(sectorCount * 2352);
    for (let s = 0; s < sectorCount; s++) {
      const base = s * 2352;
      // 12-byte CD sync pattern: 00 FF*10 00
      binChunk[base] = 0x00;
      for (let k = 1; k <= 10; k++) binChunk[base + k] = 0xff;
      binChunk[base + 11] = 0x00;

      // 4-byte BCD MSF address (starts at 00:02:00 = 150 frames) + Mode 2 (0x02)
      const totalFrames = lba + 150;
      const minutes = Math.floor(totalFrames / (60 * 75));
      const seconds = Math.floor((totalFrames / 75) % 60);
      const frames = totalFrames % 75;
      binChunk[base + 12] = toBcdByte(minutes);
      binChunk[base + 13] = toBcdByte(seconds);
      binChunk[base + 14] = toBcdByte(frames);
      binChunk[base + 15] = 0x02;

      // 8-byte Mode 2 Form 1 XA subheader
      binChunk[base + 18] = 0x08;
      binChunk[base + 22] = 0x08;

      // 2048-byte user data payload
      binChunk.set(inBuf.subarray(s * 2048, (s + 1) * 2048), base + 24);
      lba++;
    }
    await binWritable.write(binChunk);
    totalOutputBytes += binChunk.byteLength;
    offset += sectorCount * 2048;
    onProgress?.(Math.min(100, Math.round((offset / isoFile.size) * 100)));
  }

  const cueContent = `FILE "${outputBinFileName}" BINARY\r\n  TRACK 01 MODE2/2352\r\n    INDEX 01 00:00:00\r\n`;
  return { totalOutputBytes, cueContent };
}

// Normalizes .img / .mdf / .iso (2448B CloneCD/Alcohol, 2352B, or 2048B) -> clean standard 2352B .bin + .cue
export async function streamConvertRawDiscToBinCueWritable(
  discFile: File,
  binWritable: FileSystemWritableFileStream,
  outputBinFileName: string,
  cueText?: string,
  onProgress?: (pct: number) => void
): Promise<{ totalOutputBytes: number; cueContent: string; layout: DiscTrackLayout }> {
  if (discFile.size < 32768) {
    throw new Error(
      tfStatic('builds.conv.errFileTooSmall', { file: discFile.name, size: discFile.size })
    );
  }
  const layout = await inspectDiscTrackLayout(discFile, cueText);
  if (layout.sectorSize === 2048) {
    const res = await streamConvertIso2048ToBinCueWritable(discFile, binWritable, outputBinFileName, onProgress);
    return { ...res, layout };
  }

  if (layout.sectorSize === 2352) {
    const written = await streamCopyFileToWritable(discFile, binWritable, onProgress);
    const modeStr = layout.dataOffset === 16 ? 'MODE1/2352' : 'MODE2/2352';
    const cueContent = `FILE "${outputBinFileName}" BINARY\r\n  TRACK 01 ${modeStr}\r\n    INDEX 01 00:00:00\r\n`;
    return { totalOutputBytes: written, cueContent, layout };
  }

  // layout.sectorSize === 2448: strip 96-byte subchannel trailer per sector -> exact 2352-byte .bin sectors
  const SECTORS_PER_CHUNK = 4096;
  const IN_CHUNK_BYTES = SECTORS_PER_CHUNK * 2448;
  let offset = 0;
  let totalOutputBytes = 0;

  while (offset < discFile.size) {
    const end = Math.min(discFile.size, offset + IN_CHUNK_BYTES);
    const chunkBuf = new Uint8Array(await discFile.slice(offset, end).arrayBuffer());
    const sectorCount = Math.floor(chunkBuf.byteLength / 2448);
    if (sectorCount === 0) break;

    const binChunk = new Uint8Array(sectorCount * 2352);
    for (let s = 0; s < sectorCount; s++) {
      const srcStart = s * 2448;
      binChunk.set(chunkBuf.subarray(srcStart, srcStart + 2352), s * 2352);
    }
    await binWritable.write(binChunk);
    totalOutputBytes += binChunk.byteLength;
    offset += sectorCount * 2448;
    onProgress?.(Math.min(100, Math.round((offset / discFile.size) * 100)));
  }

  const modeStr = layout.dataOffset === 16 ? 'MODE1/2352' : 'MODE2/2352';
  const cueContent = `FILE "${outputBinFileName}" BINARY\r\n  TRACK 01 ${modeStr}\r\n    INDEX 01 00:00:00\r\n`;
  return { totalOutputBytes, cueContent, layout };
}

export function buildCleanCueAndTrackPlan(
  baseNameWithRegion: string,
  trackFiles: File[],
  originalCueText?: string
): { tracks: Array<{ file: File; outputName: string }>; cueContent: string } {
  const multiTrack = trackFiles.length > 1;
  const tracks = trackFiles.map((file, idx) => {
    const dot = file.name.lastIndexOf('.');
    const ext = dot !== -1 ? file.name.slice(dot).toLowerCase() : '.bin';
    const outputName = multiTrack
      ? `${baseNameWithRegion} (Track ${String(idx + 1).padStart(2, '0')})${ext}`
      : `${baseNameWithRegion}${ext}`;
    return { file, outputName };
  });

  if (originalCueText && originalCueText.trim().length > 0) {
    let trackCursor = 0;
    const rewrittenLines = originalCueText.split(/\r?\n/).map((line) => {
      if (/^\s*FILE\s+/i.test(line)) {
        const mappedName =
          tracks[Math.min(trackCursor, Math.max(0, tracks.length - 1))]?.outputName ||
          `${baseNameWithRegion}.bin`;
        trackCursor++;
        const typeMatch = line.match(/\s+(BINARY|MOTOROLA|AIFF|WAVE|MP3)\s*$/i);
        const fileType = typeMatch ? typeMatch[1].toUpperCase() : 'BINARY';
        return `FILE "${mappedName}" ${fileType}`;
      }
      return line;
    });
    return { tracks, cueContent: rewrittenLines.join('\r\n') + '\r\n' };
  }

  const fallbackCue = tracks
    .map(
      (t, i) =>
        `FILE "${t.outputName}" BINARY\r\n  TRACK ${String(i + 1).padStart(2, '0')} ${
          i === 0 ? 'MODE2/2352' : 'AUDIO'
        }\r\n    INDEX 01 00:00:00`
    )
    .join('\r\n');
  return { tracks, cueContent: fallbackCue + '\r\n' };
}

// Resolves target folder path for a game according to the selected TargetSystemProfile
export function resolveTargetFolderForGame(
  profile: TargetSystemProfile,
  game: EnrichedBuildGame,
  targetExt: string
): { folderPath: string; outputFileName: string; cueFileName?: string; baseWithRegion: string } {
  const cShort = game.consoleShort.toUpperCase();
  const cleanTitleSafe = game.title.replace(/[<>:"/\\|?*]/g, ' - ').replace(/\s+/g, ' ').trim();
  const baseWithRegion =
    game.region === 'RUS' && !cleanTitleSafe.includes('(RUS)')
      ? `${cleanTitleSafe} (RUS)`
      : cleanTitleSafe;

  const actualExt = targetExt === '.bin+.cue' ? '.bin' : targetExt;
  const outputFileName = `${baseWithRegion}${actualExt}`;
  const cueFileName = targetExt === '.bin+.cue' ? `${baseWithRegion}.cue` : undefined;

  if (profile.id === 'r36s_arkos') {
    const folderMap: Record<string, string> = {
      PSX: 'psx',
      PSP: 'psp',
      GENESIS: 'megadrive',
      SNES: 'snes',
      NES: 'nes',
      GBA: 'gba',
      N64: 'n64',
      PORTS: 'ports',
      PORTMASTER: 'ports',
    };
    const consoleFolder = folderMap[cShort] || cShort.toLowerCase();
    return {
      folderPath: `EASYROMS/${consoleFolder}`,
      outputFileName,
      cueFileName,
      baseWithRegion,
    };
  }

  if (profile.id === 'psx_duckstation_iso') {
    if (cShort === 'PSX') {
      return {
        folderPath: `PSX_Games/${baseWithRegion}`,
        outputFileName,
        cueFileName,
        baseWithRegion,
      };
    }
    if (cShort === 'PORTS' || cShort === 'PORTMASTER') {
      return {
        folderPath: 'Games/ports',
        outputFileName,
        cueFileName,
        baseWithRegion,
      };
    }
    return {
      folderPath: `Games/${cShort}`,
      outputFileName,
      cueFileName,
      baseWithRegion,
    };
  }

  if (profile.id === 'psp_vita_adrenaline') {
    if (cShort === 'PSX') {
      const serialClean = (game.serial || 'SLUS00402').replace(/[^a-zA-Z0-9]/g, '').slice(0, 9);
      return {
        folderPath: `PSP/GAME/${serialClean}`,
        outputFileName: 'EBOOT.PBP',
        baseWithRegion,
      };
    }
    return {
      folderPath: 'ISO',
      outputFileName,
      baseWithRegion,
    };
  }

  if (profile.id === 'miyoo_anbernic') {
    const folderMap: Record<string, string> = {
      PSX: 'PS',
      PSP: 'PSP',
      GENESIS: 'MD',
      SNES: 'SFC',
      NES: 'FC',
      GBA: 'GBA',
      N64: 'N64',
      PORTS: 'PORTS',
      PORTMASTER: 'PORTS',
    };
    const cFolder = folderMap[cShort] || cShort;
    return {
      folderPath: `Roms/${cFolder}`,
      outputFileName,
      cueFileName,
      baseWithRegion,
    };
  }

  if (profile.id === 'steamdeck_emudeck') {
    const folderMap: Record<string, string> = {
      PSX: 'psx',
      PSP: 'psp',
      GENESIS: 'genesis',
      SNES: 'snes',
      NES: 'nes',
      GBA: 'gba',
      N64: 'n64',
      PORTS: 'ports',
      PORTMASTER: 'ports',
    };
    const cFolder = folderMap[cShort] || cShort.toLowerCase();
    return {
      folderPath: `Emulation/roms/${cFolder}`,
      outputFileName,
      cueFileName,
      baseWithRegion,
    };
  }

  // EverDrive / Flashcart (Alphabetical folder A-Z)
  const firstLetter = cleanTitleSafe.charAt(0).toUpperCase() || 'A';
  return {
    folderPath: `${cShort}/${firstLetter}`,
    outputFileName,
    cueFileName,
    baseWithRegion,
  };
}

// ============================================================================
// FLASH DRIVE CAPACITY CALCULATOR (16 / 32 / 64 / 128 / 256 GB MINUS USED SPACE)
// & "🎲 МНЕ ПОВЕЗЁТ!" RANDOM AUTO-BUILDER
// ============================================================================
export type FlashDriveCapacityTier = 0 | 16 | 32 | 64 | 128 | 256;

export interface FlashDriveCapacitySpec {
  nominalGB: FlashDriveCapacityTier;
  label: string;
  realFormattedGB: number; // Binary GiB after FAT32/exFAT formatting (approx 93.1%)
  defaultSystemUsedGB: number; // ArkOS/AmberELEC boot + BIOS + themes + media cache reserve
}

export const FLASH_DRIVE_CAPACITY_SPECS: FlashDriveCapacitySpec[] = [
  {
    nominalGB: 0,
    label: 'Без лимита объёма',
    realFormattedGB: 0,
    defaultSystemUsedGB: 0,
  },
  {
    nominalGB: 16,
    label: 'Флешка 16 ГБ',
    realFormattedGB: 14.8,
    defaultSystemUsedGB: 3.2,
  },
  {
    nominalGB: 32,
    label: 'Флешка 32 ГБ',
    realFormattedGB: 29.7,
    defaultSystemUsedGB: 4.5,
  },
  {
    nominalGB: 64,
    label: 'Флешка 64 ГБ',
    realFormattedGB: 59.6,
    defaultSystemUsedGB: 6.0,
  },
  {
    nominalGB: 128,
    label: 'Флешка 128 ГБ',
    realFormattedGB: 119.2,
    defaultSystemUsedGB: 8.5,
  },
  {
    nominalGB: 256,
    label: 'Флешка 256 ГБ',
    realFormattedGB: 238.4,
    defaultSystemUsedGB: 12.0,
  },
];

export interface FlashDriveBudgetBreakdown {
  nominalGB: FlashDriveCapacityTier;
  realFormattedGB: number;
  usedOrSystemGB: number;
  netAvailableGB: number;
  netAvailableMB: number;
}

export function calculateFlashDriveNetBudget(
  nominalGB: FlashDriveCapacityTier,
  customUsedGB?: number
): FlashDriveBudgetBreakdown {
  const spec =
    FLASH_DRIVE_CAPACITY_SPECS.find((s) => s.nominalGB === nominalGB) ||
    FLASH_DRIVE_CAPACITY_SPECS[0];
  if (nominalGB === 0) {
    return {
      nominalGB: 0,
      realFormattedGB: 0,
      usedOrSystemGB: 0,
      netAvailableGB: 9999,
      netAvailableMB: 9999 * 1024,
    };
  }
  const usedGB =
    typeof customUsedGB === 'number' && !Number.isNaN(customUsedGB) && customUsedGB >= 0
      ? customUsedGB
      : spec.defaultSystemUsedGB;
  const netGB = Math.max(0.5, Math.round((spec.realFormattedGB - usedGB) * 100) / 100);
  return {
    nominalGB,
    realFormattedGB: spec.realFormattedGB,
    usedOrSystemGB: usedGB,
    netAvailableGB: netGB,
    netAvailableMB: Math.round(netGB * 1024),
  };
}

// Fits a list of games into the net available flash drive capacity (in MB)
// Prioritizes RUS versions first, then packs games until budget is reached
export function fitGamesToFlashCapacity(
  games: EnrichedBuildGame[],
  netAvailableMB: number
): EnrichedBuildGame[] {
  if (netAvailableMB <= 0 || netAvailableMB >= 9000 * 1024) {
    return games;
  }
  const sorted = [...games].sort((a, b) => {
    const aRus = a.region.toUpperCase() === 'RUS' ? 0 : 1;
    const bRus = b.region.toUpperCase() === 'RUS' ? 0 : 1;
    if (aRus !== bRus) return aRus - bRus;
    return a.sizeMB - b.sizeMB;
  });

  const picked: EnrichedBuildGame[] = [];
  let usedMB = 0;
  for (const g of sorted) {
    // Include 8% reserve for scraped boxart + short video preview per game
    const gameTotalFootprintMB = Math.max(0.5, g.sizeMB * 1.08);
    if (usedMB + gameTotalFootprintMB <= netAvailableMB) {
      picked.push(g);
      usedMB += gameTotalFootprintMB;
    }
  }
  return picked;
}

// "🎲 Мне повезёт!" — Randomly shuffles candidates matching the active console/category filter
// and packs them into the target flash drive net capacity
export function buildLuckyRandomSelectionUnderCapacity(
  candidates: EnrichedBuildGame[],
  netAvailableMB: number
): { picked: EnrichedBuildGame[]; totalPickedMB: number } {
  // Fisher-Yates shuffle
  const shuffled = [...candidates];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = shuffled[i];
    shuffled[i] = shuffled[j];
    shuffled[j] = tmp;
  }

  const effectiveLimitMB =
    netAvailableMB > 0 && netAvailableMB < 9000 * 1024 ? netAvailableMB : 12 * 1024;

  const picked: EnrichedBuildGame[] = [];
  let accMB = 0;
  for (const g of shuffled) {
    const footprint = Math.max(0.5, g.sizeMB * 1.08);
    if (accMB + footprint <= effectiveLimitMB) {
      picked.push(g);
      accMB += footprint;
    }
  }

  // If all candidates had large sizes and none fit, pick at least the smallest one if available
  if (picked.length === 0 && shuffled.length > 0) {
    const smallest = [...shuffled].sort((a, b) => a.sizeMB - b.sizeMB)[0];
    picked.push(smallest);
    accMB = smallest.sizeMB;
  }

  return {
    picked,
    totalPickedMB: Math.round(accMB * 10) / 10,
  };
}

