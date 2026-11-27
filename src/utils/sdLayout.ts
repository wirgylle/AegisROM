// Профили раскладки SD-карты по прошивкам для «Починки флешки».
// Каждая папка подтверждена официальной документацией или исходниками прошивки
// (ссылки в `sources`). Что не подтвердилось, сюда не попало: см. docs/sd-repair.md.
//
// SD card layout profiles per firmware for the "Flash drive repair" tool.
// Every folder is backed by the firmware's official docs or source (links in
// `sources`). Anything unconfirmed is left out: see docs/sd-repair.md.

export type SdRepairFirmwareId =
  | 'r36s_arkos'
  | 'r36s_darkos'
  | 'anbernic_muos'
  | 'anbernic_knulli'
  | 'batocera'
  | 'rocknix'
  | 'amberelec'
  | 'emuelec'
  | 'miyoo_onion'
  | 'miyoo_spruce'
  | 'trimui_crossmix'
  | 'minui';

export const SD_REPAIR_FIRMWARE_IDS: readonly SdRepairFirmwareId[] = [
  'r36s_arkos',
  'r36s_darkos',
  'anbernic_muos',
  'anbernic_knulli',
  'batocera',
  'rocknix',
  'amberelec',
  'emuelec',
  'miyoo_onion',
  'miyoo_spruce',
  'trimui_crossmix',
  'minui',
] as const;

// dir     — обычная папка: если её нет, создаём пустую. / plain folder, created empty if missing.
// themes  — папка тем: создаём, если нет, и предупреждаем, если в ней пусто.
//           themes folder: created if missing, warned about when empty.
// system  — часть прошивки с содержимым (скрипт, программа, конфиг). Пустой её не создаём,
//           только сообщаем, откуда вернуть. / firmware part with real content: never
//           created empty, only reported with where to get it back.
export type SdItemKind = 'dir' | 'themes' | 'system';
export type SdItemGroup = 'system' | 'console';

export interface SdLayoutItem {
  path: string;
  kind: SdItemKind;
  group: SdItemGroup;
  // Ключ пояснения в sdRepairStrings (sd.why.*). / Explanation key in sdRepairStrings.
  whyKey?: string;
  // Для kind=system: папка это или файл. / For kind=system: folder or file.
  isFile?: boolean;
  // Куда идти за содержимым. / Where to get the content back.
  fixUrl?: string;
}

export interface SdSource {
  label: string;
  url: string;
}

export interface SdFirmwareProfile {
  id: SdRepairFirmwareId;
  // Подсказка, какую папку выбирать корнем (ключ sd.root.*). / Which folder to pick as root.
  rootKey: string;
  // Папка ромов относительно корня ('' = консоли прямо в корне).
  // ROM folder relative to root ('' = consoles sit right in the root).
  romsDir: string;
  items: SdLayoutItem[];
  sources: SdSource[];
}

const dir = (path: string, whyKey?: string): SdLayoutItem => ({ path, kind: 'dir', group: 'system', whyKey });
const themes = (path: string, whyKey = 'sd.why.themes', fixUrl?: string): SdLayoutItem => ({
  path,
  kind: 'themes',
  group: 'system',
  whyKey,
  fixUrl,
});
const sys = (path: string, whyKey: string, fixUrl: string, isFile = false): SdLayoutItem => ({
  path,
  kind: 'system',
  group: 'system',
  whyKey,
  fixUrl,
  isFile,
});
const consoles = (prefix: string, names: string[]): SdLayoutItem[] =>
  names.map((n) => ({ path: prefix ? `${prefix}/${n}` : n, kind: 'dir' as const, group: 'console' as const }));

// Папки систем ArkOS: «Rom Folder» из вики ArkOS-Emulators-and-Ports-information.
// ArkOS system folders: every "Rom Folder" from the ArkOS-Emulators-and-Ports-information wiki.
const ARKOS_CONSOLES = [
  '3do', 'advision', 'alg', 'amiga', 'amigacd32', 'amstradcpc', 'apple2', 'arcade', 'arduboy', 'astrocde',
  'atari2600', 'atari5200', 'atari7800', 'atari800', 'atarijaguar', 'atarilynx', 'atarist', 'atarixegs',
  'atomiswave', 'bbcmicro', 'c128', 'c16', 'c64', 'cavestory', 'cdimono1', 'channelf', 'coco3', 'coleco',
  'cps1', 'cps2', 'cps3', 'daphne', 'doom', 'dos', 'dragon32', 'dreamcast', 'easyrpg', 'enterprise',
  'famicom', 'fds', 'gameandwatch', 'gamegear', 'gb', 'gba', 'gbc', 'gc', 'genesis', 'gx4000',
  'intellivision', 'j2me', 'love2d', 'lowresnx', 'mame', 'mame2003', 'mastersystem', 'megadrive',
  'megaduck', 'msumd', 'msx', 'msx2', 'mv', 'n64', 'n64dd', 'naomi', 'nds', 'neogeo', 'neogeocd', 'nes',
  'ngp', 'ngpc', 'odyssey2', 'onscripter', 'openbor', 'palm', 'pc98', 'pcengine', 'pcenginecd', 'pcfx',
  'pico', 'pico-8/carts', 'piece', 'pokemonmini', 'psp', 'pspminis', 'psx', 'puzzlescript', 'satellaview',
  'saturn', 'scummvm', 'scv', 'sega32x', 'segacd', 'sfc', 'sg-1000', 'sgb', 'snes', 'snes-hacks',
  'snesmsu1', 'solarus', 'sufami', 'supergrafx', 'supervision', 'thomson', 'ti99', 'tic80', 'tigerlcd',
  'turbografx', 'turbografxcd', 'tvc', 'uzebox', 'vectrex', 'vic20', 'videopac', 'vircon32', 'virtualboy',
  'vmac', 'vmu', 'wasm4', 'wolf', 'wonderswan', 'wonderswancolor', 'x1', 'x68000', 'zx81', 'zxspectrum',
];

// Папки, которые сборка dArkOS создаёт на EASYROMS (game_systems.txt), без служебных.
// Folders the dArkOS build creates on EASYROMS (game_systems.txt), minus the service ones.
const DARKOS_CONSOLES = [
  '3do', 'advision', 'alg', 'amiga', 'amigacd32', 'amstradcpc', 'apple2', 'arcade', 'arduboy', 'astrocde',
  'atari800', 'atari2600', 'atari5200', 'atari7800', 'atarijaguar', 'atarilynx', 'atarist', 'atarixegs',
  'atomiswave', 'bbcmicro', 'c16', 'c64', 'c128', 'cavestory', 'channelf', 'coco3', 'coleco', 'cps1',
  'cps2', 'cps3', 'daphne/roms', 'doom', 'dos', 'dragon32', 'dreamcast', 'easyrpg', 'enterprise', 'famicom',
  'fds', 'gameandwatch', 'gamegear', 'gametank', 'gb', 'gba', 'gbc', 'genesis', 'gx4000', 'intellivision',
  'j2me', 'lowresnx', 'mame', 'mame2003', 'mastersystem', 'megaduck', 'megadrive', 'movies', 'msumd', 'msx',
  'msx2', 'mv', 'n64', 'n64dd', 'naomi', 'nds', 'neogeo', 'neogeocd', 'nes', 'ngp', 'ngpc', 'odyssey2',
  'openbor', 'palm', 'pc98', 'pcengine', 'pcenginecd', 'pcfx', 'pico', 'pico-8/carts', 'piece',
  'pokemonmini', 'ports', 'psp', 'pspminis', 'psx', 'puzzlescript', 'satellaview', 'saturn', 'scummvm', 'scv',
  'sega32x', 'segacd', 'sfc', 'sg-1000', 'sgb', 'solarus', 'snes', 'snes-hacks', 'snesmsu1', 'sufami',
  'supergrafx', 'supervision', 'thomson', 'ti99', 'tic80', 'turbografx', 'turbografxcd', 'tvc', 'uzebox',
  'vectrex', 'vic20', 'videopac', 'vircon32', 'virtualboy', 'vmac', 'vmu', 'wasm4', 'wolf', 'wonderswan',
  'wonderswancolor', 'x1', 'x68000', 'zeebo', 'zx81', 'zxspectrum',
];

const THEMEMASTER_URL = 'https://github.com/JohnIrvine1433/ThemeMaster';
const ONION_RELEASES = 'https://github.com/OnionUI/Onion/releases';
const SPRUCE_RELEASES = 'https://github.com/spruceUI/spruceOS/releases';

export const SD_FIRMWARE_PROFILES: Record<SdRepairFirmwareId, SdFirmwareProfile> = {
  r36s_arkos: {
    id: 'r36s_arkos',
    rootKey: 'sd.root.easyroms',
    romsDir: '',
    items: [
      dir('bios', 'sd.why.bios'),
      dir('tools', 'sd.why.arkTools'),
      themes('themes', 'sd.why.arkThemes', THEMEMASTER_URL),
      dir('bgmusic', 'sd.why.bgmusic'),
      dir('launchimages', 'sd.why.launchimages'),
      dir('backup', 'sd.why.arkBackup'),
      ...consoles('', ARKOS_CONSOLES),
    ],
    sources: [
      { label: 'ArkOS wiki: FAQ', url: 'https://github.com/christianhaitian/arkos/wiki/Frequently-Asked-Questions---RG351MP' },
      { label: 'ArkOS wiki: Emulators and Ports', url: 'https://github.com/christianhaitian/arkos/wiki/ArkOS-Emulators-and-Ports-information' },
      { label: 'dArkOS: finishing_touches.sh (themes → /roms/themes)', url: 'https://github.com/christianhaitian/dArkOS/blob/master/finishing_touches.sh' },
    ],
  },
  r36s_darkos: {
    id: 'r36s_darkos',
    rootKey: 'sd.root.easyroms',
    romsDir: '',
    items: [
      dir('bios', 'sd.why.bios'),
      dir('tools', 'sd.why.arkTools'),
      sys('tools/ThemeMaster.sh', 'sd.why.themeMaster', THEMEMASTER_URL, true),
      sys('tools/ThemeMaster', 'sd.why.themeMaster', THEMEMASTER_URL),
      themes('themes', 'sd.why.arkThemes', THEMEMASTER_URL),
      dir('bgmusic', 'sd.why.bgmusic'),
      dir('launchimages', 'sd.why.launchimages'),
      dir('shutdownimages', 'sd.why.shutdownimages'),
      dir('backup', 'sd.why.arkBackup'),
      ...consoles('', DARKOS_CONSOLES),
    ],
    sources: [
      { label: 'dArkOS: finishing_touches.sh', url: 'https://github.com/christianhaitian/dArkOS/blob/master/finishing_touches.sh' },
      { label: 'dArkOS: game_systems.txt', url: 'https://github.com/christianhaitian/dArkOS/blob/master/game_systems.txt' },
      { label: 'ThemeMaster', url: THEMEMASTER_URL },
    ],
  },
  anbernic_muos: {
    id: 'anbernic_muos',
    rootKey: 'sd.root.muos',
    romsDir: 'ROMS',
    items: [dir('MUOS/bios', 'sd.why.muosBios'), dir('ROMS', 'sd.why.roms')],
    sources: [
      { label: 'muOS: Where do I put my content?', url: 'https://muos.dev/help/addcontent' },
      { label: 'muOS: structure', url: 'https://muos.dev/help/structure' },
    ],
  },
  anbernic_knulli: {
    id: 'anbernic_knulli',
    rootKey: 'sd.root.share',
    romsDir: 'roms',
    items: [
      dir('roms', 'sd.why.roms'),
      dir('bios', 'sd.why.bios'),
      dir('saves', 'sd.why.saves'),
      dir('screenshots', 'sd.why.screenshots'),
      themes('themes', 'sd.why.themes'),
      dir('theme-customizations', 'sd.why.themeCustom'),
      dir('music', 'sd.why.music'),
      dir('cheats', 'sd.why.cheats'),
      dir('decorations', 'sd.why.decorations'),
      dir('system', 'sd.why.knulliSystem'),
    ],
    sources: [{ label: 'KNULLI: Game storage', url: 'https://knulli.org/play/add-games/game-storage/' }],
  },
  batocera: {
    id: 'batocera',
    rootKey: 'sd.root.share',
    romsDir: 'roms',
    items: [
      dir('roms', 'sd.why.roms'),
      dir('bios', 'sd.why.bios'),
      dir('saves', 'sd.why.saves'),
      dir('screenshots', 'sd.why.screenshots'),
      themes('themes', 'sd.why.themes'),
      dir('music', 'sd.why.music'),
      dir('splash', 'sd.why.splash'),
      dir('system', 'sd.why.batoSystem'),
      sys('system/batocera.conf', 'sd.why.batoConf', 'https://wiki.batocera.org/notable_files', true),
    ],
    sources: [
      { label: 'Batocera wiki: notable files', url: 'https://wiki.batocera.org/notable_files' },
      { label: 'Batocera wiki: storage manager', url: 'https://wiki.batocera.org/storage_manager' },
      { label: 'Batocera wiki: add games and BIOS', url: 'https://wiki.batocera.org/add_games_bios' },
    ],
  },
  rocknix: {
    id: 'rocknix',
    rootKey: 'sd.root.gamesCard',
    romsDir: 'roms',
    items: [dir('roms', 'sd.why.rocknixRoms'), dir('roms/bios', 'sd.why.bios'), dir('roms/music', 'sd.why.music')],
    sources: [
      { label: 'ROCKNIX: Add games', url: 'https://rocknix.org/play/add-games/' },
      { label: 'ROCKNIX: FAQ', url: 'https://rocknix.org/faqs/' },
    ],
  },
  amberelec: {
    id: 'amberelec',
    rootKey: 'sd.root.gamesCard',
    romsDir: 'roms',
    items: [dir('roms', 'sd.why.roms'), dir('roms/update', 'sd.why.amberUpdate')],
    sources: [{ label: 'AmberELEC: Transferring files', url: 'https://amberelec.org/guides/transferring-files' }],
  },
  emuelec: {
    id: 'emuelec',
    rootKey: 'sd.root.gamesCard',
    romsDir: 'roms',
    items: [dir('roms', 'sd.why.roms'), dir('roms/ports', 'sd.why.ports'), dir('roms/BGM', 'sd.why.music')],
    sources: [
      { label: 'EmuELEC wiki: Common Questions', url: 'https://github.com/EmuELEC/EmuELEC/wiki/Common-Questions---FAQ' },
      { label: 'EmuELEC wiki: ROM paths', url: 'https://github.com/EmuELEC/EmuELEC/wiki/Supported-Platforms-And--Correct-Rom-Path' },
    ],
  },
  miyoo_onion: {
    id: 'miyoo_onion',
    rootKey: 'sd.root.cardRoot',
    romsDir: 'Roms',
    items: [
      sys('.tmp_update', 'sd.why.tmpUpdate', ONION_RELEASES),
      sys('RetroArch', 'sd.why.onionRetroArch', ONION_RELEASES),
      dir('BIOS', 'sd.why.bios'),
      dir('Roms', 'sd.why.roms'),
      dir('Saves/CurrentProfile/saves', 'sd.why.saves'),
      dir('Saves/CurrentProfile/states', 'sd.why.states'),
      dir('Themes', 'sd.why.themes'),
    ],
    sources: [
      { label: 'Onion: Fresh install', url: 'https://onionui.github.io/docs/installation/fresh' },
      { label: 'Onion: FAQ', url: 'https://onionui.github.io/docs/faq' },
    ],
  },
  miyoo_spruce: {
    id: 'miyoo_spruce',
    rootKey: 'sd.root.cardRoot',
    romsDir: 'Roms',
    items: [
      sys('.tmp_update', 'sd.why.tmpUpdate', SPRUCE_RELEASES),
      dir('BIOS', 'sd.why.bios'),
      dir('Roms', 'sd.why.roms'),
      themes('Themes', 'sd.why.themes'),
      ...consoles('Roms', ['ARCADE', 'FC', 'SFC', 'MD', 'GB', 'GBC', 'GBA', 'N64', 'NDS', 'PS', 'PSP', 'PCE', 'NEOGEO', 'PORTS']),
    ],
    sources: [
      { label: 'spruceOS: README', url: 'https://github.com/spruceUI/spruceOS' },
      { label: 'spruceOS wiki: Installation', url: 'https://github.com/spruceUI/spruceOS/wiki/01.-Installation-Instructions' },
      { label: 'spruceOS wiki: Adding Games', url: 'https://github.com/spruceUI/spruceOS/wiki/11.-Adding-Games' },
    ],
  },
  trimui_crossmix: {
    id: 'trimui_crossmix',
    rootKey: 'sd.root.cardRoot',
    romsDir: 'Roms',
    items: [
      dir('BIOS', 'sd.why.bios'),
      dir('Roms', 'sd.why.roms'),
      dir('Imgs', 'sd.why.crossImgs'),
      ...consoles('Roms', ['PSP', 'PANASONIC', 'PICO']),
    ],
    sources: [{ label: 'CrossMix wiki: Installation', url: 'https://github.com/cizia64/CrossMix-OS/wiki/Installation' }],
  },
  minui: {
    id: 'minui',
    rootKey: 'sd.root.cardRoot',
    romsDir: 'Roms',
    items: [
      dir('Bios', 'sd.why.bios'),
      dir('Roms', 'sd.why.roms'),
      dir('Saves', 'sd.why.saves'),
      ...['FC', 'GB', 'GBA', 'GBC', 'MD', 'PS'].map((tag) => dir(`Bios/${tag}`, 'sd.why.minuiBios')),
    ],
    sources: [{ label: 'MinUI: README.txt', url: 'https://github.com/shauninman/MinUI/blob/main/skeleton/BASE/README.txt' }],
  },
};

// Имена всех системных папок всех прошивок (нижний регистр). Очистка «фантомных» папок
// не должна предлагать их удалить, даже пустые.
// Names of every system folder of every firmware (lowercase). The "phantom folder"
// cleanup must never offer to delete them, even when empty.
export function sdSystemFolderNames(): Set<string> {
  const out = new Set<string>();
  for (const p of Object.values(SD_FIRMWARE_PROFILES)) {
    for (const it of p.items) {
      if (it.group !== 'system' || it.isFile) continue;
      for (const seg of splitPath(it.path)) out.add(seg.toLowerCase());
    }
  }
  return out;
}

export function getSdFirmwareProfile(id: string | undefined): SdFirmwareProfile {
  return SD_FIRMWARE_PROFILES[(id as SdRepairFirmwareId) || 'r36s_arkos'] || SD_FIRMWARE_PROFILES.r36s_arkos;
}

// ---------- Проверка и план / Check and plan ----------

export interface SdEntry {
  name: string;
  kind: 'file' | 'directory';
}

// Минимальный доступ к диску, чтобы логику можно было тестировать без браузера.
// Minimal disk access so the logic is testable without a browser.
export interface SdProbe {
  // Содержимое папки по пути от корня, null — папки нет. / Folder entries, null if missing.
  list(path: string): Promise<SdEntry[] | null>;
}

export type SdPlanStatus = 'ok' | 'create' | 'missingSystem' | 'emptyThemes' | 'unknown';

export interface SdPlanItem extends SdLayoutItem {
  status: SdPlanStatus;
  // Как папка на самом деле называется на карте (FAT не различает регистр).
  // Actual on-card name (FAT ignores case).
  foundAs?: string;
}

export interface SdRepairPlan {
  firmware: SdRepairFirmwareId;
  checked: boolean;
  items: SdPlanItem[];
}

function splitPath(p: string): string[] {
  return p.split('/').filter(Boolean);
}

function isHiddenJunk(name: string): boolean {
  const l = name.toLowerCase();
  return l.startsWith('.') || l === 'thumbs.db' || l === 'desktop.ini';
}

// Ищет путь без учёта регистра. Возвращает реальные имена сегментов или null.
// Case-insensitive lookup. Returns the actual segment names or null.
export async function resolvePath(
  probe: SdProbe,
  path: string,
  cache: Map<string, SdEntry[] | null> = new Map(),
): Promise<{ real: string; kind: 'file' | 'directory' } | null> {
  const segs = splitPath(path);
  let cur = '';
  let kind: 'file' | 'directory' = 'directory';
  for (let i = 0; i < segs.length; i++) {
    let entries = cache.get(cur);
    if (entries === undefined) {
      entries = await probe.list(cur);
      cache.set(cur, entries);
    }
    if (!entries) return null;
    const want = segs[i].toLowerCase();
    const hit = entries.find((e) => e.name.toLowerCase() === want);
    if (!hit) return null;
    if (hit.kind === 'file' && i < segs.length - 1) return null;
    cur = cur ? `${cur}/${hit.name}` : hit.name;
    kind = hit.kind;
  }
  return { real: cur, kind };
}

export async function buildSdRepairPlan(profile: SdFirmwareProfile, probe: SdProbe | null): Promise<SdRepairPlan> {
  if (!probe) {
    return {
      firmware: profile.id,
      checked: false,
      items: profile.items.map((it) => ({ ...it, status: 'unknown' as const })),
    };
  }
  const cache = new Map<string, SdEntry[] | null>();
  const items: SdPlanItem[] = [];
  for (const it of profile.items) {
    const found = await resolvePath(probe, it.path, cache);
    const wantKind = it.isFile ? 'file' : 'directory';
    if (!found || found.kind !== wantKind) {
      if (it.kind === 'system') items.push({ ...it, status: 'missingSystem' });
      else items.push({ ...it, status: 'create' });
      continue;
    }
    if (it.kind === 'themes') {
      let entries = cache.get(found.real);
      if (entries === undefined) {
        entries = await probe.list(found.real);
        cache.set(found.real, entries);
      }
      const visible = (entries || []).filter((e) => !isHiddenJunk(e.name));
      if (visible.length === 0) {
        items.push({ ...it, status: 'emptyThemes', foundAs: found.real });
        continue;
      }
    }
    items.push({ ...it, status: 'ok', foundAs: found.real });
  }
  return { firmware: profile.id, checked: true, items };
}

export interface SdPlanSummary {
  toCreateSystem: SdPlanItem[];
  toCreateConsoles: SdPlanItem[];
  warnings: SdPlanItem[];
  okCount: number;
}

export function summarizeSdPlan(plan: SdRepairPlan): SdPlanSummary {
  const toCreate = plan.items.filter((i) => i.status === 'create' || (!plan.checked && i.kind !== 'system'));
  return {
    toCreateSystem: toCreate.filter((i) => i.group === 'system'),
    toCreateConsoles: toCreate.filter((i) => i.group === 'console'),
    // Пустая папка тем, которую мы же создадим, тоже окажется пустой: предупреждаем.
    // A themes folder we are about to create will be empty too: warn about it.
    warnings: plan.items.filter(
      (i) => i.status === 'missingSystem' || i.status === 'emptyThemes' || (i.kind === 'themes' && i.status === 'create'),
    ),
    okCount: plan.items.filter((i) => i.status === 'ok').length,
  };
}

// ---------- Применение / Apply ----------

export interface SdWriter extends SdProbe {
  // Создаёт одну папку внутри существующей. Существующее не трогает.
  // Creates one folder inside an existing one. Never touches existing entries.
  mkdir(parentPath: string, name: string): Promise<void>;
}

export interface SdApplyResult {
  created: string[];
  skipped: string[];
  failed: { path: string; error: string }[];
}

// Создаёт только недостающие папки. Ничего не удаляет и не перезаписывает: если по пути
// уже лежит файл с тем же именем, пункт пропускается.
// Creates only missing folders. Deletes and overwrites nothing: if a file with the same
// name is in the way, the item is skipped.
export async function applySdRepairPlan(writer: SdWriter, paths: string[]): Promise<SdApplyResult> {
  const res: SdApplyResult = { created: [], skipped: [], failed: [] };
  const cache = new Map<string, SdEntry[] | null>();
  for (const path of paths) {
    try {
      const segs = splitPath(path);
      let cur = '';
      let createdAny = false;
      let blocked = false;
      for (const seg of segs) {
        let entries = cache.get(cur);
        if (entries === undefined) {
          entries = await writer.list(cur);
          cache.set(cur, entries);
        }
        const hit = (entries || []).find((e) => e.name.toLowerCase() === seg.toLowerCase());
        if (hit) {
          if (hit.kind === 'file') {
            blocked = true;
            break;
          }
          cur = cur ? `${cur}/${hit.name}` : hit.name;
          continue;
        }
        await writer.mkdir(cur, seg);
        cache.set(cur, [...(entries || []), { name: seg, kind: 'directory' }]);
        cur = cur ? `${cur}/${seg}` : seg;
        cache.set(cur, []);
        createdAny = true;
      }
      if (blocked || !createdAny) res.skipped.push(path);
      else res.created.push(path);
    } catch (e) {
      res.failed.push({ path, error: String((e as Error)?.message || e) });
    }
  }
  return res;
}

// Обёртка над FileSystemDirectoryHandle (браузер и своё окно отдают одинаковый API).
// Wrapper over FileSystemDirectoryHandle (browser and the native window share the API).
export function handleSdWriter(root: any): SdWriter {
  const resolveDir = async (path: string): Promise<any | null> => {
    let cur = root;
    for (const seg of splitPath(path)) {
      let next: any = null;
      for await (const e of cur.values()) {
        if (e.kind === 'directory' && String(e.name).toLowerCase() === seg.toLowerCase()) {
          next = e;
          break;
        }
      }
      if (!next) return null;
      cur = next;
    }
    return cur;
  };
  return {
    async list(path) {
      const d = await resolveDir(path);
      if (!d) return null;
      const out: SdEntry[] = [];
      for await (const e of d.values()) out.push({ name: e.name, kind: e.kind === 'directory' ? 'directory' : 'file' });
      return out;
    },
    async mkdir(parentPath, name) {
      const d = await resolveDir(parentPath);
      if (!d) throw new Error(`no folder: ${parentPath || '/'}`);
      await d.getDirectoryHandle(name, { create: true });
    },
  };
}

// .cmd для Windows: только mkdir для отсутствующих папок, без удаления.
// Windows .cmd: only mkdir for missing folders, nothing is deleted.
export function buildSdRepairCmd(
  paths: string[],
  text: { title: string; promptDrive: string; step: string; done: string },
): string {
  const lines = [
    '@echo off',
    'chcp 65001 >nul',
    `echo ${text.title}`,
    `set /p DRIVE="${text.promptDrive}"`,
    'set DRIVE=%DRIVE:~0,1%',
    `echo ${text.step}`,
    ...paths.map((p) => {
      const w = p.replace(/\//g, '\\');
      return `if not exist "%DRIVE%:\\${w}" mkdir "%DRIVE%:\\${w}"`;
    }),
    `echo ${text.done}`,
    'pause',
  ];
  return lines.join('\r\n');
}
