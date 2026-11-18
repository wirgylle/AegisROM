export interface EmulatorOption {
  id: string;
  name: string;
  coreOrBinary: string;
  supportedConsoles: string[];
  downloadUrl: string;
  websiteLabel: string;
  defaultExePath: string;
  cliTemplate: string;
  description: string;
  isUniversalRetroArch?: boolean;
}

export interface DeviceExportProfile {
  id: string;
  name: string;
  shortBadge: string;
  category: 'handheld' | 'modern_cfw' | 'retro';
  firmwareName: string;
  rootFolderStructure: string;
  mediaFolderRule: string;
  gamelistFormat: string;
  supportedConsoles: string[];
  description: string;
  consolePathMap: Record<string, string>;
}

export interface ExtendedConsoleMeta {
  code: string;
  displayName: string;
  generationFolder: string;
  generationShort: string;
  bitness: '8-bit' | '16-bit' | '32/64-bit 3D' | '128-bit DVD' | 'HD / 7-8 Gen';
  releaseYearSpan: string;
  libretroSystem: string;
  archiveVideoId: string;
  requiredBios: string[];
  extensions: string[];
  defaultEmulatorId: string;
}

export const EXTENDED_CONSOLE_CATALOG: Record<string, ExtendedConsoleMeta> = {
  nes: {
    code: 'nes',
    displayName: 'Nintendo NES / Dendy',
    generationFolder: '1_8bit (NES, Famicom, MasterSystem, GB)',
    generationShort: '8-bit',
    bitness: '8-bit',
    releaseYearSpan: '1983–1995',
    libretroSystem: 'Nintendo - Nintendo Entertainment System',
    archiveVideoId: 'nessnaps',
    requiredBios: [],
    extensions: ['.nes', '.unf'],
    defaultEmulatorId: 'retroarch_mesen',
  },
  famicom: {
    code: 'famicom',
    displayName: 'Nintendo Famicom',
    generationFolder: '1_8bit (NES, Famicom, MasterSystem, GB)',
    generationShort: '8-bit',
    bitness: '8-bit',
    releaseYearSpan: '1983–1994',
    libretroSystem: 'Nintendo - Nintendo Entertainment System',
    archiveVideoId: 'NintendoFamicomVideoSnaps',
    requiredBios: ['disksys.rom (для FDS)'],
    extensions: ['.nes', '.fds'],
    defaultEmulatorId: 'retroarch_mesen',
  },
  fds: {
    code: 'fds',
    displayName: 'Famicom Disk System',
    generationFolder: '1_8bit (NES, Famicom, MasterSystem, GB)',
    generationShort: '8-bit',
    bitness: '8-bit',
    releaseYearSpan: '1986–1992',
    libretroSystem: 'Nintendo - Family Computer Disk System',
    archiveVideoId: 'nessnaps',
    requiredBios: ['disksys.rom'],
    extensions: ['.fds'],
    defaultEmulatorId: 'retroarch_mesen',
  },
  mastersystem: {
    code: 'mastersystem',
    displayName: 'Sega Master System',
    generationFolder: '1_8bit (NES, Famicom, MasterSystem, GB)',
    generationShort: '8-bit',
    bitness: '8-bit',
    releaseYearSpan: '1985–1996',
    libretroSystem: 'Sega - Master System - Mark III',
    archiveVideoId: 'mastersystemsnaps',
    requiredBios: ['bios_E.sms'],
    extensions: ['.sms'],
    defaultEmulatorId: 'retroarch_genesis_plus_gx',
  },
  gb: {
    code: 'gb',
    displayName: 'Nintendo Game Boy',
    generationFolder: '1_8bit (NES, Famicom, MasterSystem, GB)',
    generationShort: '8-bit',
    bitness: '8-bit',
    releaseYearSpan: '1989–2001',
    libretroSystem: 'Nintendo - Game Boy',
    archiveVideoId: 'gbcsnaps',
    requiredBios: ['gb_bios.bin'],
    extensions: ['.gb'],
    defaultEmulatorId: 'retroarch_gambatte',
  },
  gbc: {
    code: 'gbc',
    displayName: 'Nintendo Game Boy Color',
    generationFolder: '1_8bit (NES, Famicom, MasterSystem, GB)',
    generationShort: '8-bit',
    bitness: '8-bit',
    releaseYearSpan: '1998–2003',
    libretroSystem: 'Nintendo - Game Boy Color',
    archiveVideoId: 'gbcsnaps',
    requiredBios: ['gbc_bios.bin'],
    extensions: ['.gbc'],
    defaultEmulatorId: 'retroarch_gambatte',
  },
  gamegear: {
    code: 'gamegear',
    displayName: 'Sega Game Gear',
    generationFolder: '1_8bit (NES, Famicom, MasterSystem, GB)',
    generationShort: '8-bit',
    bitness: '8-bit',
    releaseYearSpan: '1990–1997',
    libretroSystem: 'Sega - Game Gear',
    archiveVideoId: 'gamegearsnaps',
    requiredBios: ['bios.gg'],
    extensions: ['.gg'],
    defaultEmulatorId: 'retroarch_genesis_plus_gx',
  },
  atari2600: {
    code: 'atari2600',
    displayName: 'Atari 2600',
    generationFolder: '1_8bit (NES, Famicom, MasterSystem, GB)',
    generationShort: '8-bit',
    bitness: '8-bit',
    releaseYearSpan: '1977–1992',
    libretroSystem: 'Atari - 2600',
    archiveVideoId: 'atari7800snaps',
    requiredBios: [],
    extensions: ['.a26'],
    defaultEmulatorId: 'retroarch_stella',
  },
  atari7800: {
    code: 'atari7800',
    displayName: 'Atari 7800',
    generationFolder: '1_8bit (NES, Famicom, MasterSystem, GB)',
    generationShort: '8-bit',
    bitness: '8-bit',
    releaseYearSpan: '1986–1992',
    libretroSystem: 'Atari - 7800',
    archiveVideoId: 'atari7800snaps',
    requiredBios: ['7800 BIOS (U).rom'],
    extensions: ['.a78'],
    defaultEmulatorId: 'retroarch_prosystem',
  },
  lynx: {
    code: 'lynx',
    displayName: 'Atari Lynx',
    generationFolder: '1_8bit (NES, Famicom, MasterSystem, GB)',
    generationShort: '8-bit',
    bitness: '8-bit',
    releaseYearSpan: '1989–1995',
    libretroSystem: 'Atari - Lynx',
    archiveVideoId: 'atari7800snaps',
    requiredBios: ['lynxboot.img'],
    extensions: ['.lnx'],
    defaultEmulatorId: 'retroarch_handy',
  },
  snes: {
    code: 'snes',
    displayName: 'Super Nintendo (SNES / SFC)',
    generationFolder: '2_16bit (SNES, MegaDrive, PCEngine, Arcade)',
    generationShort: '16-bit',
    bitness: '16-bit',
    releaseYearSpan: '1990–2000',
    libretroSystem: 'Nintendo - Super Nintendo Entertainment System',
    archiveVideoId: 'snapssnaps',
    requiredBios: [],
    extensions: ['.sfc', '.smc', '.fig', '.swc'],
    defaultEmulatorId: 'retroarch_snes9x',
  },
  genesis: {
    code: 'genesis',
    displayName: 'Sega Mega Drive / Genesis',
    generationFolder: '2_16bit (SNES, MegaDrive, PCEngine, Arcade)',
    generationShort: '16-bit',
    bitness: '16-bit',
    releaseYearSpan: '1988–1998',
    libretroSystem: 'Sega - Mega Drive - Genesis',
    archiveVideoId: 'genesissnaps',
    requiredBios: [],
    extensions: ['.md', '.gen', '.smd'],
    defaultEmulatorId: 'retroarch_genesis_plus_gx',
  },
  pcengine: {
    code: 'pcengine',
    displayName: 'NEC PC Engine / TurboGrafx-16',
    generationFolder: '2_16bit (SNES, MegaDrive, PCEngine, Arcade)',
    generationShort: '16-bit',
    bitness: '16-bit',
    releaseYearSpan: '1987–1994',
    libretroSystem: 'NEC - PC Engine - TurboGrafx 16',
    archiveVideoId: 'pcenginesnaps',
    requiredBios: ['syscard3.pce'],
    extensions: ['.pce', '.sgx'],
    defaultEmulatorId: 'retroarch_mednafen_pce',
  },
  arcade: {
    code: 'arcade',
    displayName: 'Arcade / FBNeo / NeoGeo / MAME',
    generationFolder: '2_16bit (SNES, MegaDrive, PCEngine, Arcade)',
    generationShort: '16-bit',
    bitness: '16-bit',
    releaseYearSpan: '1985–2004',
    libretroSystem: 'FBNeo - Arcade Games',
    archiveVideoId: 'neogeosnaps_202302',
    requiredBios: ['neogeo.zip', 'pgm.zip'],
    extensions: ['.zip'],
    defaultEmulatorId: 'retroarch_fbneo',
  },
  gba: {
    code: 'gba',
    displayName: 'Nintendo Game Boy Advance',
    generationFolder: '3_32_64bit (PS1, N64, GBA, NDS, Saturn)',
    generationShort: '32/64-bit 3D',
    bitness: '32/64-bit 3D',
    releaseYearSpan: '2001–2008',
    libretroSystem: 'Nintendo - Game Boy Advance',
    archiveVideoId: 'gbasnaps',
    requiredBios: ['gba_bios.bin'],
    extensions: ['.gba', '.agb'],
    defaultEmulatorId: 'mgba_standalone',
  },
  nds: {
    code: 'nds',
    displayName: 'Nintendo DS',
    generationFolder: '3_32_64bit (PS1, N64, GBA, NDS, Saturn)',
    generationShort: '32/64-bit 3D',
    bitness: '32/64-bit 3D',
    releaseYearSpan: '2004–2013',
    libretroSystem: 'Nintendo - Nintendo DS',
    archiveVideoId: 'gbasnaps',
    requiredBios: ['bios7.bin', 'bios9.bin', 'firmware.bin'],
    extensions: ['.nds'],
    defaultEmulatorId: 'melonds_standalone',
  },
  psx: {
    code: 'psx',
    displayName: 'Sony PlayStation 1 (PSX)',
    generationFolder: '3_32_64bit (PS1, N64, GBA, NDS, Saturn)',
    generationShort: '32/64-bit 3D',
    bitness: '32/64-bit 3D',
    releaseYearSpan: '1994–2004',
    libretroSystem: 'Sony - PlayStation',
    archiveVideoId: 'SonyPlaystationVideoSnaps',
    requiredBios: ['scph1001.bin', 'scph5501.bin', 'scph7001.bin'],
    extensions: ['.bin', '.cue', '.chd', '.pbp', '.iso', '.img', '.mdf', '.m3u'],
    defaultEmulatorId: 'duckstation_standalone',
  },
  n64: {
    code: 'n64',
    displayName: 'Nintendo 64',
    generationFolder: '3_32_64bit (PS1, N64, GBA, NDS, Saturn)',
    generationShort: '32/64-bit 3D',
    bitness: '32/64-bit 3D',
    releaseYearSpan: '1996–2002',
    libretroSystem: 'Nintendo - Nintendo 64',
    archiveVideoId: 'n64snaps',
    requiredBios: [],
    extensions: ['.z64', '.n64', '.v64'],
    defaultEmulatorId: 'retroarch_mupen64plus',
  },
  sega32x: {
    code: 'sega32x',
    displayName: 'Sega 32X',
    generationFolder: '3_32_64bit (PS1, N64, GBA, NDS, Saturn)',
    generationShort: '32/64-bit 3D',
    bitness: '32/64-bit 3D',
    releaseYearSpan: '1994–1996',
    libretroSystem: 'Sega - 32X',
    archiveVideoId: '32xsnaps',
    requiredBios: [],
    extensions: ['.32x'],
    defaultEmulatorId: 'retroarch_picodrive',
  },
  saturn: {
    code: 'saturn',
    displayName: 'Sega Saturn',
    generationFolder: '3_32_64bit (PS1, N64, GBA, NDS, Saturn)',
    generationShort: '32/64-bit 3D',
    bitness: '32/64-bit 3D',
    releaseYearSpan: '1994–2000',
    libretroSystem: 'Sega - Saturn',
    archiveVideoId: 'SonyPlaystationVideoSnaps',
    requiredBios: ['sega_101.bin', 'mpr-17933.bin'],
    extensions: ['.chd', '.cue', '.iso'],
    defaultEmulatorId: 'retroarch_beetle_saturn',
  },
  psp: {
    code: 'psp',
    displayName: 'Sony PlayStation Portable (PSP)',
    generationFolder: '4_128bit_DVD (PS2, PSP, Dreamcast, GameCube)',
    generationShort: '128-bit DVD',
    bitness: '128-bit DVD',
    releaseYearSpan: '2004–2014',
    libretroSystem: 'Sony - PlayStation Portable',
    archiveVideoId: 'SonyPSPVideoSnaps',
    requiredBios: ['ppge_atlas.zim'],
    extensions: ['.iso', '.cso', '.pbp'],
    defaultEmulatorId: 'ppsspp_standalone',
  },
  ps2: {
    code: 'ps2',
    displayName: 'Sony PlayStation 2 (PS2)',
    generationFolder: '4_128bit_DVD (PS2, PSP, Dreamcast, GameCube)',
    generationShort: '128-bit DVD',
    bitness: '128-bit DVD',
    releaseYearSpan: '2000–2013',
    libretroSystem: 'Sony - PlayStation 2',
    archiveVideoId: 'SonyPlaystationVideoSnaps',
    requiredBios: ['scph39001.bin', 'scph70012.bin'],
    extensions: ['.iso', '.chd', '.gz', '.cso'],
    defaultEmulatorId: 'pcsx2_standalone',
  },
  dreamcast: {
    code: 'dreamcast',
    displayName: 'Sega Dreamcast',
    generationFolder: '4_128bit_DVD (PS2, PSP, Dreamcast, GameCube)',
    generationShort: '128-bit DVD',
    bitness: '128-bit DVD',
    releaseYearSpan: '1998–2002',
    libretroSystem: 'Sega - Dreamcast',
    archiveVideoId: 'genesissnaps',
    requiredBios: ['dc_boot.bin', 'dc_flash.bin'],
    extensions: ['.chd', '.gdi', '.cdi'],
    defaultEmulatorId: 'retroarch_flycast',
  },
  gamecube: {
    code: 'gamecube',
    displayName: 'Nintendo GameCube / Wii',
    generationFolder: '4_128bit_DVD (PS2, PSP, Dreamcast, GameCube)',
    generationShort: '128-bit DVD',
    bitness: '128-bit DVD',
    releaseYearSpan: '2001–2013',
    libretroSystem: 'Nintendo - GameCube',
    archiveVideoId: 'n64snaps',
    requiredBios: ['IPL.bin'],
    extensions: ['.rvz', '.iso', '.gcm', '.wbfs'],
    defaultEmulatorId: 'dolphin_standalone',
  },
  ps3: {
    code: 'ps3',
    displayName: 'Sony PlayStation 3 (PS3 CFW / HEN / RPCS3)',
    generationFolder: '5_HD_Consoles (PS3, Nintendo Switch, Xbox)',
    generationShort: 'HD / 7-8 Gen',
    bitness: 'HD / 7-8 Gen',
    releaseYearSpan: '2006–2017',
    libretroSystem: 'Sony - PlayStation 3',
    archiveVideoId: 'SonyPlaystationVideoSnaps',
    requiredBios: ['PS3UPDAT.PUP (Firmware 4.91)'],
    extensions: ['.pkg', '.iso', '.ps3iso', '.sfb'],
    defaultEmulatorId: 'rpcs3_standalone',
  },
  switch: {
    code: 'switch',
    displayName: 'Nintendo Switch (Atmosphere / Ryujinx / Sudachi)',
    generationFolder: '5_HD_Consoles (PS3, Nintendo Switch, Xbox)',
    generationShort: 'HD / 7-8 Gen',
    bitness: 'HD / 7-8 Gen',
    releaseYearSpan: '2017–2026',
    libretroSystem: 'Nintendo - Switch',
    archiveVideoId: 'n64snaps',
    requiredBios: ['prod.keys', 'title.keys', 'Firmware 18.1.0+'],
    extensions: ['.nsp', '.xci', '.nsz', '.xcz'],
    defaultEmulatorId: 'ryujinx_standalone',
  },
  xbox: {
    code: 'xbox',
    displayName: 'Microsoft Xbox / Xbox 360 (Xemu / Xenia / Aurora)',
    generationFolder: '5_HD_Consoles (PS3, Nintendo Switch, Xbox)',
    generationShort: 'HD / 7-8 Gen',
    bitness: 'HD / 7-8 Gen',
    releaseYearSpan: '2001–2016',
    libretroSystem: 'Microsoft - Xbox',
    archiveVideoId: 'SonyPlaystationVideoSnaps',
    requiredBios: ['mcpx_1.0.bin', 'Complex_4627v1.03.bin'],
    extensions: ['.xiso', '.iso', '.xex', '.god'],
    defaultEmulatorId: 'xemu_standalone',
  },
  ports: {
    code: 'ports',
    displayName: 'PortMaster (PC / Linux Порты)',
    generationFolder: '5_HD_Consoles (PS3, Nintendo Switch, Xbox)',
    generationShort: 'PortMaster',
    bitness: 'HD / 7-8 Gen',
    releaseYearSpan: '1993–2026',
    libretroSystem: 'DOS',
    archiveVideoId: 'SonyPlaystationVideoSnaps',
    requiredBios: ['PortMaster Runtime (Weston / Mono / Godot / Love2D / Box64)'],
    extensions: ['.sh', '.portmaster'],
    defaultEmulatorId: 'portmaster_wsl2',
  },
};

export const EMULATOR_CATALOG: EmulatorOption[] = [
  {
    id: 'retroarch_mesen',
    name: 'RetroArch (Ядро Mesen — NES / Famicom / FDS)',
    coreOrBinary: 'mesen_libretro.dll',
    supportedConsoles: ['nes', 'famicom', 'fds'],
    downloadUrl: 'https://www.retroarch.com/?page=platforms',
    websiteLabel: 'retroarch.com',
    defaultExePath: 'C:\\RetroArch-Win64\\retroarch.exe',
    cliTemplate: '"C:\\RetroArch-Win64\\retroarch.exe" -L "C:\\RetroArch-Win64\\cores\\mesen_libretro.dll" "{ROM_PATH}"',
    description: 'Эталонная точность эмуляции 8-битных приставок NES, Dendy и Famicom с поддержкой HD-паков и шейдеров CRT.',
    isUniversalRetroArch: true,
  },
  {
    id: 'retroarch_snes9x',
    name: 'RetroArch (Ядро Snes9x — Super Nintendo)',
    coreOrBinary: 'snes9x_libretro.dll',
    supportedConsoles: ['snes'],
    downloadUrl: 'https://www.retroarch.com/?page=platforms',
    websiteLabel: 'retroarch.com',
    defaultExePath: 'C:\\RetroArch-Win64\\retroarch.exe',
    cliTemplate: '"C:\\RetroArch-Win64\\retroarch.exe" -L "C:\\RetroArch-Win64\\cores\\snes9x_libretro.dll" "{ROM_PATH}"',
    description: 'Быстрый и совместимый со всеми чипами (Super FX, SA-1) эмулятор SNES / Super Famicom.',
    isUniversalRetroArch: true,
  },
  {
    id: 'retroarch_genesis_plus_gx',
    name: 'RetroArch (Ядро Genesis Plus GX — Sega 8/16-bit)',
    coreOrBinary: 'genesis_plus_gx_libretro.dll',
    supportedConsoles: ['genesis', 'mastersystem', 'gamegear'],
    downloadUrl: 'https://www.retroarch.com/?page=platforms',
    websiteLabel: 'retroarch.com',
    defaultExePath: 'C:\\RetroArch-Win64\\retroarch.exe',
    cliTemplate: '"C:\\RetroArch-Win64\\retroarch.exe" -L "C:\\RetroArch-Win64\\cores\\genesis_plus_gx_libretro.dll" "{ROM_PATH}"',
    description: 'Лучшее ядро для Sega Mega Drive / Genesis, Master System и Game Gear со стереозвуком YM2612.',
    isUniversalRetroArch: true,
  },
  {
    id: 'retroarch_picodrive',
    name: 'RetroArch (Ядро PicoDrive — Sega 32X / MegaDrive)',
    coreOrBinary: 'picodrive_libretro.dll',
    supportedConsoles: ['sega32x', 'genesis', 'mastersystem'],
    downloadUrl: 'https://www.retroarch.com/?page=platforms',
    websiteLabel: 'retroarch.com',
    defaultExePath: 'C:\\RetroArch-Win64\\retroarch.exe',
    cliTemplate: '"C:\\RetroArch-Win64\\retroarch.exe" -L "C:\\RetroArch-Win64\\cores\\picodrive_libretro.dll" "{ROM_PATH}"',
    description: 'Оптимизированное ядро для Sega 32X и тяжелых игр Mega Drive (стандарт для R36S ArkOS).',
    isUniversalRetroArch: true,
  },
  {
    id: 'mgba_standalone',
    name: 'mGBA (Standalone + RetroArch Core — GBA / GB / GBC)',
    coreOrBinary: 'mGBA.exe / mgba_libretro.dll',
    supportedConsoles: ['gba', 'gb', 'gbc'],
    downloadUrl: 'https://mgba.io/downloads.html',
    websiteLabel: 'mgba.io',
    defaultExePath: 'C:\\Emulators\\mGBA\\mGBA.exe',
    cliTemplate: '"C:\\Emulators\\mGBA\\mGBA.exe" -f "{ROM_PATH}"',
    description: 'Самый точный и быстрый эмулятор Game Boy Advance с поддержкой кабеля связи и читов.',
  },
  {
    id: 'retroarch_gambatte',
    name: 'RetroArch (Ядро Gambatte — Game Boy / Color)',
    coreOrBinary: 'gambatte_libretro.dll',
    supportedConsoles: ['gb', 'gbc'],
    downloadUrl: 'https://www.retroarch.com/?page=platforms',
    websiteLabel: 'retroarch.com',
    defaultExePath: 'C:\\RetroArch-Win64\\retroarch.exe',
    cliTemplate: '"C:\\RetroArch-Win64\\retroarch.exe" -L "C:\\RetroArch-Win64\\cores\\gambatte_libretro.dll" "{ROM_PATH}"',
    description: 'Аппаратно точное ядро для классического Game Boy и Game Boy Color с цветовой коррекцией экрана.',
    isUniversalRetroArch: true,
  },
  {
    id: 'melonds_standalone',
    name: 'melonDS (Nintendo DS / DSi)',
    coreOrBinary: 'melonDS.exe',
    supportedConsoles: ['nds'],
    downloadUrl: 'https://melonds.kuribo64.net/downloads.php',
    websiteLabel: 'melonds.kuribo64.net',
    defaultExePath: 'C:\\Emulators\\melonDS\\melonDS.exe',
    cliTemplate: '"C:\\Emulators\\melonDS\\melonDS.exe" "{ROM_PATH}"',
    description: 'Современный эмулятор Nintendo DS с поддержкой локального Wi-Fi мультиплеера и 3D-апскейлинга OpenGL.',
  },
  {
    id: 'duckstation_standalone',
    name: 'DuckStation (Sony PlayStation 1 — 4K PGXP)',
    coreOrBinary: 'duckstation-qt-x64-ReleaseLTCG.exe',
    supportedConsoles: ['psx'],
    downloadUrl: 'https://github.com/stenzek/duckstation/releases',
    websiteLabel: 'github.com/stenzek/duckstation',
    defaultExePath: 'C:\\Emulators\\DuckStation\\duckstation-qt-x64-ReleaseLTCG.exe',
    cliTemplate: '"C:\\Emulators\\DuckStation\\duckstation-qt-x64-ReleaseLTCG.exe" -batch -fullscreen -- "{ROM_PATH}"',
    description: 'Лучший эмулятор PlayStation 1: поддерживает .chd/.pbp/.cue, убирает дрожание текстур PGXP и рендерит в 4K.',
  },
  {
    id: 'retroarch_pcsx_rearmed',
    name: 'RetroArch (Ядро SwanStation / PCSX-ReARMed — PS1)',
    coreOrBinary: 'swanstation_libretro.dll',
    supportedConsoles: ['psx'],
    downloadUrl: 'https://www.retroarch.com/?page=platforms',
    websiteLabel: 'retroarch.com',
    defaultExePath: 'C:\\RetroArch-Win64\\retroarch.exe',
    cliTemplate: '"C:\\RetroArch-Win64\\retroarch.exe" -L "C:\\RetroArch-Win64\\cores\\swanstation_libretro.dll" "{ROM_PATH}"',
    description: 'Стандартное ядро PS1 для RetroArch и портативных приставок R36S / Anbernic.',
    isUniversalRetroArch: true,
  },
  {
    id: 'retroarch_mupen64plus',
    name: 'RetroArch (Ядро Mupen64Plus-Next — Nintendo 64)',
    coreOrBinary: 'mupen64plus_next_libretro.dll',
    supportedConsoles: ['n64'],
    downloadUrl: 'https://www.retroarch.com/?page=platforms',
    websiteLabel: 'retroarch.com',
    defaultExePath: 'C:\\RetroArch-Win64\\retroarch.exe',
    cliTemplate: '"C:\\RetroArch-Win64\\retroarch.exe" -L "C:\\RetroArch-Win64\\cores\\mupen64plus_next_libretro.dll" "{ROM_PATH}"',
    description: 'Высокопроизводительный эмулятор Nintendo 64 с плагинами ParaLLEl-RDP и GlideN64.',
    isUniversalRetroArch: true,
  },
  {
    id: 'ppsspp_standalone',
    name: 'PPSSPP Gold / Standalone (Sony PSP)',
    coreOrBinary: 'PPSSPPWindows64.exe',
    supportedConsoles: ['psp'],
    downloadUrl: 'https://www.ppsspp.org/download/',
    websiteLabel: 'ppsspp.org',
    defaultExePath: 'C:\\Emulators\\PPSSPP\\PPSSPPWindows64.exe',
    cliTemplate: '"C:\\Emulators\\PPSSPP\\PPSSPPWindows64.exe" "{ROM_PATH}"',
    description: 'Эталонный эмулятор Sony PSP для ПК и портативок с поддержкой .iso, .cso и .pbp.',
  },
  {
    id: 'pcsx2_standalone',
    name: 'PCSX2 Qt (Sony PlayStation 2 — Vulkan/DX12)',
    coreOrBinary: 'pcsx2-qt.exe',
    supportedConsoles: ['ps2'],
    downloadUrl: 'https://pcsx2.net/downloads/',
    websiteLabel: 'pcsx2.net',
    defaultExePath: 'C:\\Emulators\\PCSX2\\pcsx2-qt.exe',
    cliTemplate: '"C:\\Emulators\\PCSX2\\pcsx2-qt.exe" -fullscreen -batch -- "{ROM_PATH}"',
    description: 'Официальный эмулятор PlayStation 2 с поддержкой сжатых образов .chd, широкоформатных патчей и RetroAchievements.',
  },
  {
    id: 'retroarch_flycast',
    name: 'RetroArch (Ядро Flycast — Sega Dreamcast / Naomi)',
    coreOrBinary: 'flycast_libretro.dll',
    supportedConsoles: ['dreamcast'],
    downloadUrl: 'https://www.retroarch.com/?page=platforms',
    websiteLabel: 'retroarch.com',
    defaultExePath: 'C:\\RetroArch-Win64\\retroarch.exe',
    cliTemplate: '"C:\\RetroArch-Win64\\retroarch.exe" -L "C:\\RetroArch-Win64\\cores\\flycast_libretro.dll" "{ROM_PATH}"',
    description: 'Точный эмулятор Sega Dreamcast и аркадных автоматов Sega Naomi / Atomiswave.',
    isUniversalRetroArch: true,
  },
  {
    id: 'dolphin_standalone',
    name: 'Dolphin Emulator (Nintendo GameCube & Wii)',
    coreOrBinary: 'Dolphin.exe',
    supportedConsoles: ['gamecube'],
    downloadUrl: 'https://dolphin-emu.org/download/',
    websiteLabel: 'dolphin-emu.org',
    defaultExePath: 'C:\\Emulators\\Dolphin\\Dolphin.exe',
    cliTemplate: '"C:\\Emulators\\Dolphin\\Dolphin.exe" -b -e "{ROM_PATH}"',
    description: 'Лучший эмулятор GameCube и Nintendo Wii с поддержкой сжатого формата .rvz без потерь.',
  },
  {
    id: 'rpcs3_standalone',
    name: 'RPCS3 (Sony PlayStation 3 — Vulkan 60 FPS)',
    coreOrBinary: 'rpcs3.exe',
    supportedConsoles: ['ps3'],
    downloadUrl: 'https://rpcs3.net/download',
    websiteLabel: 'rpcs3.net',
    defaultExePath: 'C:\\Emulators\\RPCS3\\rpcs3.exe',
    cliTemplate: '"C:\\Emulators\\RPCS3\\rpcs3.exe" --no-gui "{ROM_PATH}"',
    description: 'Мощный эмулятор PlayStation 3 для запуска образов дисков PS3 и пакетов .pkg в разрешении до 4K.',
  },
  {
    id: 'ryujinx_standalone',
    name: 'Ryujinx / Sudachi (Nintendo Switch — NSP / XCI)',
    coreOrBinary: 'Ryujinx.exe',
    supportedConsoles: ['switch'],
    downloadUrl: 'https://github.com/Ryubing/Ryujinx/releases',
    websiteLabel: 'github.com/Ryubing/Ryujinx',
    defaultExePath: 'C:\\Emulators\\Ryujinx\\Ryujinx.exe',
    cliTemplate: '"C:\\Emulators\\Ryujinx\\Ryujinx.exe" -f "{ROM_PATH}"',
    description: 'Эмулятор Nintendo Switch с поддержкой образов .nsp / .xci, модов, 60 FPS патчей и локальной сети.',
  },
  {
    id: 'xemu_standalone',
    name: 'Xemu / Xenia Canary (Microsoft Xbox & Xbox 360)',
    coreOrBinary: 'xemu.exe / xenia_canary.exe',
    supportedConsoles: ['xbox'],
    downloadUrl: 'https://xemu.app/',
    websiteLabel: 'xemu.app',
    defaultExePath: 'C:\\Emulators\\Xemu\\xemu.exe',
    cliTemplate: '"C:\\Emulators\\Xemu\\xemu.exe" -full-screen -dvd_path "{ROM_PATH}"',
    description: 'Эмуляторы оригинального Xbox (Xemu) и Xbox 360 (Xenia Canary) для образов .iso, .xiso и .xex.',
  },
  {
    id: 'retroarch_fbneo',
    name: 'RetroArch (Ядро FinalBurn Neo — Аркады / NeoGeo / CPS1-3)',
    coreOrBinary: 'fbneo_libretro.dll',
    supportedConsoles: ['arcade'],
    downloadUrl: 'https://www.retroarch.com/?page=platforms',
    websiteLabel: 'retroarch.com',
    defaultExePath: 'C:\\RetroArch-Win64\\retroarch.exe',
    cliTemplate: '"C:\\RetroArch-Win64\\retroarch.exe" -L "C:\\RetroArch-Win64\\cores\\fbneo_libretro.dll" "{ROM_PATH}"',
    description: 'Основной эмулятор аркадных автоматов NeoGeo, Capcom CPS1/CPS2/CPS3 и классических битэмапов.',
    isUniversalRetroArch: true,
  },
  {
    id: 'retroarch_mednafen_pce',
    name: 'RetroArch (Ядро Beetle PCE Fast — PC Engine)',
    coreOrBinary: 'mednafen_pce_fast_libretro.dll',
    supportedConsoles: ['pcengine'],
    downloadUrl: 'https://www.retroarch.com/?page=platforms',
    websiteLabel: 'retroarch.com',
    defaultExePath: 'C:\\RetroArch-Win64\\retroarch.exe',
    cliTemplate: '"C:\\RetroArch-Win64\\retroarch.exe" -L "C:\\RetroArch-Win64\\cores\\mednafen_pce_fast_libretro.dll" "{ROM_PATH}"',
    description: 'Быстрое ядро для NEC PC Engine, TurboGrafx-16 и CD-ROM².',
    isUniversalRetroArch: true,
  },
  {
    id: 'retroarch_beetle_saturn',
    name: 'RetroArch (Ядро Beetle Saturn / YabaSanshiro — Sega Saturn)',
    coreOrBinary: 'mednafen_saturn_libretro.dll',
    supportedConsoles: ['saturn'],
    downloadUrl: 'https://www.retroarch.com/?page=platforms',
    websiteLabel: 'retroarch.com',
    defaultExePath: 'C:\\RetroArch-Win64\\retroarch.exe',
    cliTemplate: '"C:\\RetroArch-Win64\\retroarch.exe" -L "C:\\RetroArch-Win64\\cores\\mednafen_saturn_libretro.dll" "{ROM_PATH}"',
    description: 'Точный эмулятор 32-битной консоли Sega Saturn.',
    isUniversalRetroArch: true,
  },
  {
    id: 'portmaster_wsl2',
    name: 'WSL2 Ubuntu + Box64 / QEMU ARM64 (Тест PortMaster .sh на ПК)',
    coreOrBinary: 'wsl.exe',
    supportedConsoles: ['ports'],
    downloadUrl: 'https://learn.microsoft.com/ru-ru/windows/wsl/install',
    websiteLabel: 'WSL2 + Box64 / PortMaster PC',
    defaultExePath: 'C:\\Windows\\System32\\wsl.exe',
    cliTemplate: '"C:\\Windows\\System32\\wsl.exe" -e bash -lc "cd \\"$(dirname \'{ROM_PATH}\')\\" && bash \\"$(basename \'{ROM_PATH}\')\\""',
    description: 'Запускает реальные Linux-скрипты .sh и ARM64-порты PortMaster прямо в Windows 10/11 через WSLg + qemu-aarch64-static / box64.',
  },
  {
    id: 'portmaster_love2d',
    name: 'LÖVE (Love2D PC) — Тест Love2D-портов PortMaster (Balatro и др.)',
    coreOrBinary: 'love.exe',
    supportedConsoles: ['ports'],
    downloadUrl: 'https://love2d.org/',
    websiteLabel: 'love2d.org',
    defaultExePath: 'C:\\Program Files\\LOVE\\love.exe',
    cliTemplate: '"C:\\Program Files\\LOVE\\love.exe" "{ROM_PATH}"',
    description: 'Нативный движок LÖVE для мгновенного тестирования Love2D-игр из каталога PortMaster на Windows без приставки.',
  },
  {
    id: 'portmaster_godot',
    name: 'Godot Engine Windows (Тест Godot / FRT портов PortMaster)',
    coreOrBinary: 'Godot.exe',
    supportedConsoles: ['ports'],
    downloadUrl: 'https://godotengine.org/download/windows/',
    websiteLabel: 'godotengine.org',
    defaultExePath: 'C:\\Emulators\\Godot\\Godot.exe',
    cliTemplate: '"C:\\Emulators\\Godot\\Godot.exe" --main-pack "{ROM_PATH}"',
    description: 'Позволяет тестировать Godot .pck порты из PortMaster на обычном ПК перед записью на флешку.',
  },
  {
    id: 'portmaster_retroarch',
    name: 'RetroArch (EasyRPG / ScummVM / PrBoom / TyrQuake — Движки PortMaster)',
    coreOrBinary: 'easyrpg_libretro.dll / scummvm_libretro.dll',
    supportedConsoles: ['ports'],
    downloadUrl: 'https://www.retroarch.com/?page=platforms',
    websiteLabel: 'retroarch.com',
    defaultExePath: 'C:\\RetroArch-Win64\\retroarch.exe',
    cliTemplate: '"C:\\RetroArch-Win64\\retroarch.exe" "{ROM_PATH}"',
    description: 'Тестирование игр на движках RPG Maker (EasyRPG), ScummVM, Doom, Quake, Cave Story прямо в RetroArch на ПК.',
    isUniversalRetroArch: true,
  },
];

export const DEVICE_EXPORT_PROFILES: DeviceExportProfile[] = [
  {
    id: 'r36s_arkos',
    name: 'R36S / R35S (ArkOS / DarkOS / AmberELEC — EASYROMS)',
    shortBadge: 'R36S EASYROMS',
    category: 'handheld',
    firmwareName: 'ArkOS 2.0 / DarkOS',
    rootFolderStructure: '/<console>/<rom_file>',
    mediaFolderRule: './images/<rom>.png (-image.png), ./marquees/, ./videos/',
    gamelistFormat: 'EmulationStation gamelist.xml (с проверкой реальных путей картинок)',
    supportedConsoles: [
      'nes', 'famicom', 'fds', 'snes', 'genesis', 'mastersystem', 'gamegear',
      'sega32x', 'gb', 'gbc', 'gba', 'nds', 'psx', 'n64', 'psp', 'dreamcast',
      'saturn', 'pcengine', 'arcade', 'atari2600', 'atari7800', 'lynx', 'ports',
    ],
    description:
      'Прямая выгрузка в корень раздела EASYROMS (/nes, /gba, /psx и др.) с сохранением обязательных системных папок (bios, tools, ports) и генерацией gamelist.xml.',
    consolePathMap: {
      nes: 'nes',
      famicom: 'famicom',
      fds: 'fds',
      snes: 'snes',
      genesis: 'megadrive',
      mastersystem: 'mastersystem',
      gamegear: 'gamegear',
      sega32x: 'sega32x',
      gb: 'gb',
      gbc: 'gbc',
      gba: 'gba',
      nds: 'nds',
      psx: 'psx',
      n64: 'n64',
      psp: 'psp',
      dreamcast: 'dreamcast',
      saturn: 'saturn',
      pcengine: 'pcengine',
      arcade: 'fbneo',
      ports: 'ports',
    },
  },
  {
    id: 'anbernic_muos',
    name: 'Anbernic RG35XX / RG40XX / RG556 (MuOS / Knulli / Stock)',
    shortBadge: 'Anbernic',
    category: 'handheld',
    firmwareName: 'MuOS / Knulli / Anbernic Stock',
    rootFolderStructure: '/ROMS/<CONSOLE>/<rom_file>',
    mediaFolderRule: '/ROMS/<CONSOLE>/Imgs/<rom>.png (или boxart)',
    gamelistFormat: 'gamelist.xml + папка Imgs для мгновенного отображения в меню Anbernic',
    supportedConsoles: [
      'nes', 'famicom', 'snes', 'genesis', 'mastersystem', 'gamegear', 'sega32x',
      'gb', 'gbc', 'gba', 'nds', 'psx', 'n64', 'psp', 'dreamcast', 'saturn', 'pcengine', 'arcade',
    ],
    description:
      'Иерархия для консолей Anbernic (RG35XX Plus/H/SP, RG40XX, RG353, RG556): верхнеуровневая папка ROMS, названия консолей в верхнем регистре и папка обложек Imgs.',
    consolePathMap: {
      nes: 'ROMS/FC',
      famicom: 'ROMS/FC',
      snes: 'ROMS/SFC',
      genesis: 'ROMS/MD',
      mastersystem: 'ROMS/SMS',
      gamegear: 'ROMS/GG',
      sega32x: 'ROMS/THIRTYTWOX',
      gb: 'ROMS/GB',
      gbc: 'ROMS/GBC',
      gba: 'ROMS/GBA',
      nds: 'ROMS/NDS',
      psx: 'ROMS/PS',
      n64: 'ROMS/N64',
      psp: 'ROMS/PSP',
      dreamcast: 'ROMS/DC',
      saturn: 'ROMS/SATURN',
      pcengine: 'ROMS/PCE',
      arcade: 'ROMS/FBNEO',
    },
  },
  {
    id: 'miyoo_onion',
    name: 'Miyoo Mini / Mini Plus / A30 (OnionOS / Spruce)',
    shortBadge: 'Miyoo OnionOS',
    category: 'handheld',
    firmwareName: 'OnionOS 4.3+',
    rootFolderStructure: '/Roms/<CONSOLE>/<rom_file>',
    mediaFolderRule: '/Roms/<CONSOLE>/Imgs/<rom>.png',
    gamelistFormat: 'miyoogamelist.xml + Imgs/<rom>.png',
    supportedConsoles: [
      'nes', 'famicom', 'fds', 'snes', 'genesis', 'mastersystem', 'gamegear',
      'sega32x', 'gb', 'gbc', 'gba', 'nds', 'psx', 'pcengine', 'arcade',
    ],
    description:
      'Специальная раскладка под Miyoo Mini Plus (OnionOS): каталог Roms/<СИСТЕМА> и подкаталог Imgs с квадратными и вертикальными обложками.',
    consolePathMap: {
      nes: 'Roms/FC',
      famicom: 'Roms/FC',
      snes: 'Roms/SFC',
      genesis: 'Roms/MD',
      mastersystem: 'Roms/MS',
      gamegear: 'Roms/GG',
      gb: 'Roms/GB',
      gbc: 'Roms/GBC',
      gba: 'Roms/GBA',
      nds: 'Roms/NDS',
      psx: 'Roms/PS',
      pcengine: 'Roms/PCE',
      arcade: 'Roms/ARCADE',
    },
  },
  {
    id: 'steamdeck_emudeck',
    name: 'Steam Deck / TrimUI / ПК (EmuDeck / Batocera / ES-DE)',
    shortBadge: 'Steam Deck / Batocera',
    category: 'handheld',
    firmwareName: 'EmuDeck / Batocera / ES-DE',
    rootFolderStructure: '/roms/<console>/<rom_file>',
    mediaFolderRule: '/roms/<console>/media/covers/ & /media/videos/',
    gamelistFormat: 'ES-DE / Batocera gamelist.xml (полный спектр от 8-бит до PS3 и Switch)',
    supportedConsoles: Object.keys(EXTENDED_CONSOLE_CATALOG),
    description:
      'Универсальный профиль для Steam Deck (EmuDeck), Batocera и стационарных мини-ПК: поддерживает все поколения от 8-бит до PS2, PS3, Nintendo Switch и Xbox.',
    consolePathMap: {
      nes: 'roms/nes',
      famicom: 'roms/famicom',
      snes: 'roms/snes',
      genesis: 'roms/genesis',
      gb: 'roms/gb',
      gbc: 'roms/gbc',
      gba: 'roms/gba',
      nds: 'roms/nds',
      psx: 'roms/psx',
      n64: 'roms/n64',
      psp: 'roms/psp',
      ps2: 'roms/ps2',
      dreamcast: 'roms/dreamcast',
      saturn: 'roms/saturn',
      gamecube: 'roms/gc',
      ps3: 'roms/ps3',
      switch: 'roms/switch',
      xbox: 'roms/xbox',
      arcade: 'roms/fbneo',
    },
  },
  {
    id: 'ps3_cfw_hen',
    name: 'Sony PlayStation 3 (CFW / HEN — webMAN / multiMAN / RetroArch)',
    shortBadge: 'PS3 HEN / CFW',
    category: 'modern_cfw',
    firmwareName: 'PS3 CFW Evilnat / HEN + webMAN MOD',
    rootFolderStructure: '/PS3ISO/, /PS2ISO/, /PSXISO/, /PKG/, /ROMS/',
    mediaFolderRule: 'Обложки .png/.jpg рядом с ISO для отображения в webMAN / multiMAN',
    gamelistFormat: 'Авторазнос: PS3 (.iso -> /PS3ISO, .pkg -> /packages), PS1 (.bin/.cue -> /PSXISO), ретро -> /ROMS/',
    supportedConsoles: ['ps3', 'ps2', 'psx', 'psp', 'nes', 'snes', 'genesis', 'gba', 'arcade'],
    description:
      'Готовая структура для USB-флешки или внешнего HDD (FAT32/NTFS) под прошитую PlayStation 3 (HEN / CFW): игры PS3 и PS1 ложатся в PS3ISO/PSXISO с обложками под webMAN, а ретро-игры — в папки RetroArch PS3.',
    consolePathMap: {
      ps3: 'PS3ISO',
      ps2: 'PS2ISO',
      psx: 'PSXISO',
      psp: 'PSPISO',
      nes: 'ROMS/nes',
      snes: 'ROMS/snes',
      genesis: 'ROMS/megadrive',
      gba: 'ROMS/gba',
      arcade: 'ROMS/fbneo',
    },
  },
  {
    id: 'switch_atmosphere',
    name: 'Nintendo Switch (Atmosphere CFW / DBI / RetroArch Switch)',
    shortBadge: 'Switch Atmosphere',
    category: 'modern_cfw',
    firmwareName: 'Atmosphere + DBI / Tinfoil + RetroArch',
    rootFolderStructure: '/switch/install_nsp_xci/ и /retroarch/roms/<console>/',
    mediaFolderRule: '/retroarch/thumbnails/<System>/Named_Boxarts/',
    gamelistFormat: 'Пакеты .nsp/.xci/.nsz + плейлисты .lpl для RetroArch на Switch',
    supportedConsoles: ['switch', 'nes', 'snes', 'genesis', 'gb', 'gbc', 'gba', 'nds', 'psx', 'n64', 'psp', 'dreamcast', 'arcade'],
    description:
      'Профиль для прошитой Nintendo Switch: игры Switch (.nsp / .xci) с патчами и DLC выгружаются в папку установки DBI, а классические ретро-консоли — в структуру RetroArch Switch.',
    consolePathMap: {
      switch: 'switch/install_nsp_xci',
      nes: 'retroarch/roms/nes',
      snes: 'retroarch/roms/snes',
      genesis: 'retroarch/roms/megadrive',
      gba: 'retroarch/roms/gba',
      nds: 'retroarch/roms/nds',
      psx: 'retroarch/roms/psx',
      n64: 'retroarch/roms/n64',
      psp: 'retroarch/roms/psp',
      dreamcast: 'retroarch/roms/dreamcast',
      arcade: 'retroarch/roms/fbneo',
    },
  },
  {
    id: 'xbox_aurora',
    name: 'Xbox 360 (Freeboot / Aurora) & Xbox Series Dev Mode',
    shortBadge: 'Xbox / Aurora',
    category: 'modern_cfw',
    firmwareName: 'Aurora Dashboard / RetroArch UWP',
    rootFolderStructure: '/Games/<GameTitle>/ и /Emulators/Roms/<console>/',
    mediaFolderRule: 'Обложки и баннеры в папке игры',
    gamelistFormat: 'Контейнеры GOD / XEX / XISO + структура ромов для RetroArch Xbox',
    supportedConsoles: ['xbox', 'psx', 'ps2', 'psp', 'nes', 'snes', 'genesis', 'gba', 'n64', 'dreamcast', 'gamecube', 'arcade'],
    description:
      'Выгрузка для прошитого Xbox 360 (Freeboot Aurora) или Xbox One/Series в режиме Dev Mode.',
    consolePathMap: {
      xbox: 'Games/Xbox',
      ps2: 'Emulators/Roms/ps2',
      psx: 'Emulators/Roms/psx',
      psp: 'Emulators/Roms/psp',
      snes: 'Emulators/Roms/snes',
      genesis: 'Emulators/Roms/genesis',
      gba: 'Emulators/Roms/gba',
      n64: 'Emulators/Roms/n64',
    },
  },
];

export const GENRE_LIST = [
  'Action / Экшен',
  'RPG / Ролевые',
  'Fighting / Файтинг',
  'Racing / Гонки',
  'Platformer / Платформер',
  'Shooter / Шутер',
  'Adventure / Приключения',
  'Strategy / Стратегия',
  'Sports / Спорт',
  'Horror / Хоррор',
  'Puzzle / Головоломка',
] as const;

export function inferGenreAndYear(cleanTitle: string, consoleCode: string): {
  genre: string;
  releaseYear: number;
  dependencies: string[];
} {
  const t = cleanTitle.toLowerCase();

  let genre = 'Action / Экшен';
  if (
    t.includes('final fantasy') ||
    t.includes('chrono') ||
    t.includes('dragon quest') ||
    t.includes('pokemon') ||
    t.includes('pokémon') ||
    t.includes('xenogears') ||
    t.includes('breath of fire') ||
    t.includes('persona') ||
    t.includes('diablo') ||
    t.includes('zelda') ||
    t.includes('vagrant story') ||
    t.includes('suikoden') ||
    t.includes('wild arms') ||
    t.includes('parasite eve') ||
    t.includes('castlevania') ||
    t.includes('elders') ||
    t.includes('witcher')
  ) {
    genre = 'RPG / Ролевые';
  } else if (
    t.includes('tekken') ||
    t.includes('mortal kombat') ||
    t.includes('street fighter') ||
    t.includes('king of fighters') ||
    t.includes('soul blade') ||
    t.includes('soulcalibur') ||
    t.includes('dead or alive') ||
    t.includes('guilty gear') ||
    t.includes('killer instinct') ||
    t.includes('smash bros') ||
    t.includes('bloody roar') ||
    t.includes('def jam')
  ) {
    genre = 'Fighting / Файтинг';
  } else if (
    t.includes('gran turismo') ||
    t.includes('need for speed') ||
    t.includes('crash team racing') ||
    t.includes('mario kart') ||
    t.includes('ridge racer') ||
    t.includes('burnout') ||
    t.includes('twisted metal') ||
    t.includes('vigilante 8') ||
    t.includes('driver') ||
    t.includes('road rash') ||
    t.includes('rock n roll racing') ||
    t.includes('forza') ||
    t.includes('outRun') ||
    t.includes('f-zero') ||
    t.includes('007 racing')
  ) {
    genre = 'Racing / Гонки';
  } else if (
    t.includes('mario') ||
    t.includes('sonic') ||
    t.includes('crash bandicoot') ||
    t.includes('spyro') ||
    t.includes('rayman') ||
    t.includes('donkey kong') ||
    t.includes('kirby') ||
    t.includes('mega man') ||
    t.includes('duckTales') ||
    t.includes('chip') ||
    t.includes('aladdin') ||
    t.includes('lion king') ||
    t.includes('earthworm jim') ||
    t.includes('pepsiman')
  ) {
    genre = 'Platformer / Платформер';
  } else if (
    t.includes('doom') ||
    t.includes('quake') ||
    t.includes('medal of honor') ||
    t.includes('007') ||
    t.includes('goldeneye') ||
    t.includes('syphon filter') ||
    t.includes('contra') ||
    t.includes('metal slug') ||
    t.includes('halo') ||
    t.includes('gears of war') ||
    t.includes('call of duty') ||
    t.includes('killzone') ||
    t.includes('resistance') ||
    t.includes('time crisis')
  ) {
    genre = 'Shooter / Шутер';
  } else if (
    t.includes('resident evil') ||
    t.includes('silent hill') ||
    t.includes('dino crisis') ||
    t.includes('alone in the dark') ||
    t.includes('clock tower') ||
    t.includes('dead space') ||
    t.includes('last of us')
  ) {
    genre = 'Horror / Хоррор';
  } else if (
    t.includes('worms') ||
    t.includes('hogs of war') ||
    t.includes('command') ||
    t.includes('dune') ||
    t.includes('warcraft') ||
    t.includes('starcraft') ||
    t.includes('civilization') ||
    t.includes('advance wars') ||
    t.includes('fire emblem') ||
    t.includes('front mission') ||
    t.includes('heroes')
  ) {
    genre = 'Strategy / Стратегия';
  } else if (
    t.includes('tony hawk') ||
    t.includes('fifa') ||
    t.includes('pes') ||
    t.includes('pro evolution') ||
    t.includes('nba') ||
    t.includes('nhl') ||
    t.includes('smackdown') ||
    t.includes('wwe') ||
    t.includes('THPS')
  ) {
    genre = 'Sports / Спорт';
  } else if (
    t.includes('tomb raider') ||
    t.includes('uncharted') ||
    t.includes('metal gear') ||
    t.includes('god of war') ||
    t.includes('shenmue') ||
    t.includes('gta') ||
    t.includes('grand theft auto') ||
    t.includes('red dead') ||
    t.includes('legacy of kain') ||
    t.includes('medievil')
  ) {
    genre = 'Adventure / Приключения';
  } else if (t.includes('tetris') || t.includes('Columns') || t.includes('puyo') || t.includes('bomberman')) {
    genre = 'Puzzle / Головоломка';
  }

  const defaultYearByConsole: Record<string, number> = {
    atari2600: 1982,
    atari7800: 1987,
    nes: 1989,
    famicom: 1988,
    fds: 1987,
    mastersystem: 1989,
    gb: 1992,
    gamegear: 1993,
    lynx: 1991,
    snes: 1994,
    genesis: 1993,
    pcengine: 1991,
    arcade: 1996,
    sega32x: 1995,
    gbc: 1999,
    psx: 1998,
    n64: 1998,
    saturn: 1996,
    gba: 2003,
    nds: 2007,
    ps2: 2004,
    psp: 2007,
    dreamcast: 2000,
    gamecube: 2003,
    ps3: 2011,
    xbox: 2009,
    switch: 2021,
    ports: 2020,
  };

  let releaseYear = defaultYearByConsole[consoleCode] || 1998;
  if (t.includes('tekken 3') || t.includes('resident evil 2') || t.includes('metal gear solid') || t.includes('spyro')) {
    releaseYear = 1998;
  } else if (t.includes('resident evil 3') || t.includes('silent hill') || t.includes('crash team racing') || t.includes('driver')) {
    releaseYear = 1999;
  } else if (t.includes('final fantasy vii') || t.includes('symphony of the night')) {
    releaseYear = 1997;
  } else if (t.includes('diablo') || t.includes('crash bandicoot')) {
    releaseYear = 1996;
  } else if (t.includes('comix zone') || t.includes('chrono trigger') || t.includes('mortal kombat 3')) {
    releaseYear = 1995;
  } else if (t.includes('streets of rage 2') || t.includes('sonic 2')) {
    releaseYear = 1992;
  } else if (t.includes('god of war')) {
    releaseYear = consoleCode === 'ps3' ? 2010 : 2005;
  } else if (t.includes('last of us') || t.includes('gta v')) {
    releaseYear = 2013;
  }

  const meta = EXTENDED_CONSOLE_CATALOG[consoleCode];
  const dependencies: string[] = [];
  if (meta && meta.requiredBios.length > 0) {
    dependencies.push(`BIOS: ${meta.requiredBios[0]}`);
  }
  if (consoleCode === 'psx' || consoleCode === 'saturn' || consoleCode === 'dreamcast') {
    dependencies.push('Образ диска (.cue+.bin / .chd / .pbp)');
  } else if (consoleCode === 'ps3') {
    dependencies.push('PS3 CFW/HEN (PARAM.SFO + EBOOT.BIN / .PKG)');
  } else if (consoleCode === 'switch') {
    dependencies.push('Switch Base NSP/XCI + keys (prod.keys)');
  } else {
    dependencies.push('Автономный картридж/ром (без внешних треков)');
  }

  return { genre, releaseYear, dependencies };
}
