// «Быстрый тест»: какие консоли можно проверить встроенным WASM-ядром (EmulatorJS) и каким.
// Quick test: which consoles the bundled WASM cores (EmulatorJS) can run, and with which core.
// Ядра скачивает scripts/fetch-emulatorjs.mjs; список там и здесь должен совпадать.
import { normalizeConsoleKeyForEmulator } from '../components/EnvironmentEmulatorsTab';
import type { SupportedLanguage } from '../i18n/translations';

export interface QuickTestCore {
  /** Имя ядра EmulatorJS (файл data/cores/<core>-wasm.data). */
  core: string;
  /** Подпись в окне теста. */
  label: string;
  /** Лицензия ядра (подробности в docs/quick-test.md). */
  license: string;
  /** Расширения, которые ядро открывает (архивы .zip/.7z EmulatorJS распаковывает сам). */
  exts: string[];
  /** Ядро умеет работать без BIOS, но с настоящим BIOS совместимость выше. */
  biosOptional?: boolean;
}

const ARCHIVES = ['zip', '7z'];

export const QUICK_TEST_CORES: Record<string, QuickTestCore> = {
  fceumm: { core: 'fceumm', label: 'FCEUmm', license: 'GPL-2.0', exts: ['nes', 'unf', 'unif', ...ARCHIVES] },
  snes9x: { core: 'snes9x', label: 'Snes9x', license: 'Snes9x (non-commercial)', exts: ['sfc', 'smc', 'fig', 'swc', 'bs', ...ARCHIVES] },
  genesis_plus_gx: {
    core: 'genesis_plus_gx',
    label: 'Genesis Plus GX',
    license: 'Genesis Plus GX (non-commercial)',
    exts: ['md', 'gen', 'smd', 'bin', 'sms', 'gg', 'sg', ...ARCHIVES],
  },
  gambatte: { core: 'gambatte', label: 'Gambatte', license: 'GPL-2.0', exts: ['gb', 'gbc', 'dmg', ...ARCHIVES] },
  mgba: { core: 'mgba', label: 'mGBA', license: 'MPL-2.0', exts: ['gba', 'agb', ...ARCHIVES], biosOptional: true },
  mednafen_pce: { core: 'mednafen_pce', label: 'Beetle PCE', license: 'GPL-2.0', exts: ['pce', 'sgx', ...ARCHIVES] },
  pcsx_rearmed: {
    core: 'pcsx_rearmed',
    label: 'PCSX ReARMed',
    license: 'GPL-2.0',
    exts: ['chd', 'pbp', 'iso', 'bin', 'img', 'cue', ...ARCHIVES],
    biosOptional: true,
  },
  stella2014: { core: 'stella2014', label: 'Stella 2014', license: 'GPL-2.0', exts: ['a26', 'bin', ...ARCHIVES] },
};

// Ключи EXTENDED_CONSOLE_CATALOG (после normalizeConsoleKeyForEmulator) -> ядро.
const CONSOLE_TO_CORE: Record<string, string> = {
  nes: 'fceumm',
  famicom: 'fceumm',
  dendy: 'fceumm',
  snes: 'snes9x',
  genesis: 'genesis_plus_gx',
  mastersystem: 'genesis_plus_gx',
  gamegear: 'genesis_plus_gx',
  gb: 'gambatte',
  gbc: 'gambatte',
  gba: 'mgba',
  pcengine: 'mednafen_pce',
  tg16: 'mednafen_pce',
  turbografx16: 'mednafen_pce',
  psx: 'pcsx_rearmed',
  atari2600: 'stella2014',
};

// Если консоль не распознана, пробуем по расширению (только однозначные).
const EXT_TO_CORE: Record<string, string> = {
  nes: 'fceumm',
  sfc: 'snes9x',
  smc: 'snes9x',
  md: 'genesis_plus_gx',
  gen: 'genesis_plus_gx',
  smd: 'genesis_plus_gx',
  sms: 'genesis_plus_gx',
  gg: 'genesis_plus_gx',
  gb: 'gambatte',
  gbc: 'gambatte',
  gba: 'mgba',
  pce: 'mednafen_pce',
  a26: 'stella2014',
  pbp: 'pcsx_rearmed',
};

/** Предел размера образа для теста в окне: ром целиком живёт в памяти WASM. */
export const QUICK_TEST_MAX_BYTES = 1024 * 1024 * 1024;

export function fileExt(name: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(name || '');
  return m ? m[1].toLowerCase() : '';
}

export function resolveQuickTestCore(consoleShort: string, fileName?: string): QuickTestCore | null {
  const key = normalizeConsoleKeyForEmulator(consoleShort || '');
  const byConsole = CONSOLE_TO_CORE[key] || CONSOLE_TO_CORE[(consoleShort || '').toLowerCase()];
  if (byConsole) return QUICK_TEST_CORES[byConsole];
  const byExt = EXT_TO_CORE[fileExt(fileName || '')];
  return byExt ? QUICK_TEST_CORES[byExt] : null;
}

// Языки интерфейса AegisROM -> файлы data/localization EmulatorJS (null = английский).
const EJS_LANG: Partial<Record<SupportedLanguage, string>> = {
  ru: 'ru-RU',
  de: 'de-GER',
  es: 'es-ES',
  ja: 'ja-JA',
  zh: 'zh-CN',
  fr: 'af-FR',
  it: 'it-IT',
};

export function emulatorJsLanguage(lang: SupportedLanguage): string {
  return EJS_LANG[lang] || '';
}

/**
 * Для образа .cue берём первый трек из его FILE-строк: ядро открывает одиночный .bin,
 * а CUE с несколькими файлами в окно не передать. Звуковые CD-треки при этом не играют.
 */
export function pickCueDataTrack(cueText: string | undefined, companions: File[] | undefined): File | null {
  if (!companions || companions.length === 0) return null;
  const m = /FILE\s+"([^"]+)"/i.exec(cueText || '') || /FILE\s+(\S+)/i.exec(cueText || '');
  if (m) {
    const want = m[1].split(/[\\/]/).pop()!.toLowerCase();
    const hit = companions.find((f) => f.name.toLowerCase() === want);
    if (hit) return hit;
  }
  return companions.find((f) => fileExt(f.name) === 'bin') || null;
}
