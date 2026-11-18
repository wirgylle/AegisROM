import type {
  FilenameConstructorConfig,
  FilenameTokenId,
  FilenameTokenItem,
} from '../types/aegis';

const STORAGE_KEY = 'aegisrom_v5_filename_constructor';

export const DEFAULT_FILENAME_CONFIG: FilenameConstructorConfig = {
  tokens: [
    { id: 'name', label: 'Имя игры', enabled: true, wrap: 'none' },
    { id: 'year', label: 'Год выхода', enabled: false, wrap: 'parens' },
    { id: 'region', label: 'Локализация / Регион', enabled: true, wrap: 'parens' },
    { id: 'bitness', label: 'Битность', enabled: false, wrap: 'brackets' },
    { id: 'console', label: 'Консоль', enabled: false, wrap: 'brackets' },
  ],
  separator: ' ',
  preserveRevision: true,
};

export const FILENAME_CONSTRUCTOR_PRESETS: Array<{
  id: string;
  label: string;
  hint: string;
  config: FilenameConstructorConfig;
}> = [
  {
    id: 'classic_region',
    label: 'Классика (Имя + Регион)',
    hint: 'Tekken 3 (RUS).chd · Sonic (USA).md',
    config: DEFAULT_FILENAME_CONFIG,
  },
  {
    id: 'full_archive',
    label: 'Полный архив',
    hint: 'Tekken 3 (1998) (RUS) [PSX].chd',
    config: {
      tokens: [
        { id: 'name', label: 'Имя игры', enabled: true, wrap: 'none' },
        { id: 'year', label: 'Год выхода', enabled: true, wrap: 'parens' },
        { id: 'region', label: 'Локализация / Регион', enabled: true, wrap: 'parens' },
        { id: 'console', label: 'Консоль', enabled: true, wrap: 'brackets' },
        { id: 'bitness', label: 'Битность', enabled: false, wrap: 'brackets' },
      ],
      separator: ' ',
      preserveRevision: true,
    },
  },
  {
    id: 'console_first_structured',
    label: '[Консоль] [Бит] Имя (Год) (Регион)',
    hint: '[PSX] [32-bit] Tekken 3 (1998) (RUS).chd',
    config: {
      tokens: [
        { id: 'console', label: 'Консоль', enabled: true, wrap: 'brackets' },
        { id: 'bitness', label: 'Битность', enabled: true, wrap: 'brackets' },
        { id: 'name', label: 'Имя игры', enabled: true, wrap: 'none' },
        { id: 'year', label: 'Год выхода', enabled: true, wrap: 'parens' },
        { id: 'region', label: 'Локализация / Регион', enabled: true, wrap: 'parens' },
      ],
      separator: ' ',
      preserveRevision: true,
    },
  },
  {
    id: 'clean_only',
    label: 'Только чистое имя',
    hint: 'Tekken 3.chd',
    config: {
      tokens: [
        { id: 'name', label: 'Имя игры', enabled: true, wrap: 'none' },
        { id: 'year', label: 'Год выхода', enabled: false, wrap: 'parens' },
        { id: 'region', label: 'Локализация / Регион', enabled: false, wrap: 'parens' },
        { id: 'bitness', label: 'Битность', enabled: false, wrap: 'brackets' },
        { id: 'console', label: 'Консоль', enabled: false, wrap: 'brackets' },
      ],
      separator: ' ',
      preserveRevision: false,
    },
  },
];

export function loadFilenameConstructorConfig(): FilenameConstructorConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.tokens) && parsed.tokens.length >= 4) {
        return {
          tokens: parsed.tokens,
          separator: parsed.separator === ' - ' || parsed.separator === '_' ? parsed.separator : ' ',
          preserveRevision: Boolean(parsed.preserveRevision ?? true),
        };
      }
    }
  } catch {}
  return DEFAULT_FILENAME_CONFIG;
}

export function saveFilenameConstructorConfig(cfg: FilenameConstructorConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
  } catch {}
}

export function normalizeRegionTag(region?: string, isRussian?: boolean): string {
  if (isRussian) return 'RUS';
  const r = (region || '').trim();
  const up = r.toUpperCase();
  if (!up) return 'World';
  if (['RUSSIA', 'RUS', 'RU', 'RUSSIAN'].includes(up)) return 'RUS';
  if (['U', 'US', 'USA'].includes(up)) return 'USA';
  if (['E', 'EUR', 'EUROPE'].includes(up)) return 'Europe';
  if (['J', 'JP', 'JPN', 'JAPAN'].includes(up)) return 'Japan';
  if (['W', 'WORLD'].includes(up)) return 'World';
  return r;
}

export function normalizeDiskOutputExt(rawExt?: string): string {
  const low = (rawExt || '.rom').toLowerCase().trim();
  if (low === '.bin+.cue' || low === '.img+.cue' || low === '.iso+.cue') return '.cue';
  if (low === '.ccd+.img') return '.ccd';
  if (low === '.mdf+.mds') return '.mds';
  return low.startsWith('.') ? low : `.${low}`;
}

export function sanitizeWindowsSafeStem(raw: string): string {
  return raw
    .replace(/[<>:"/\\|?*]/g, ' - ')
    .replace(/\s+/g, ' ')
    .replace(/^\.+|\.+$/g, '')
    .trim();
}

function wrapTokenValue(val: string, wrap: FilenameTokenItem['wrap']): string {
  if (!val) return '';
  if (wrap === 'parens') return `(${val})`;
  if (wrap === 'brackets') return `[${val}]`;
  return val;
}

export interface FilenameFormatInput {
  cleanTitle: string;
  year?: number | string;
  region?: string;
  isRussian?: boolean;
  bitness?: string;
  consoleCode?: string;
  extension?: string;
  revision?: string;
}

export function formatRomStemByConfig(
  input: FilenameFormatInput,
  config: FilenameConstructorConfig
): string {
  const titleVal = sanitizeWindowsSafeStem(input.cleanTitle || 'Unknown_Game');
  const yearVal = input.year ? String(input.year).trim() : '';
  const regionVal = normalizeRegionTag(input.region, input.isRussian);
  const bitVal = (input.bitness || '').trim();
  const consoleVal = (input.consoleCode || '').trim().toUpperCase();

  const valMap: Record<FilenameTokenId, string> = {
    name: titleVal,
    year: yearVal && /^\d{4}$/.test(yearVal) ? yearVal : '',
    region: regionVal,
    bitness: bitVal,
    console: consoleVal,
  };

  const parts: string[] = [];
  for (const tok of config.tokens) {
    if (!tok.enabled) continue;
    const raw = valMap[tok.id];
    if (!raw) continue;
    parts.push(wrapTokenValue(raw, tok.wrap));
  }

  if (parts.length === 0) {
    parts.push(titleVal || 'Game');
  }

  if (config.preserveRevision && input.revision) {
    const revClean = input.revision.replace(/[()[\]]/g, '').trim();
    if (revClean) {
      parts.push(`(${revClean})`);
    }
  }

  let joined = parts.join(config.separator);
  if (config.separator === '_') {
    joined = joined.replace(/\s+/g, '_');
  }
  return sanitizeWindowsSafeStem(joined) || 'Game';
}

export function formatRomFilenameByConfig(
  input: FilenameFormatInput,
  config: FilenameConstructorConfig
): string {
  const stem = formatRomStemByConfig(input, config);
  const ext = normalizeDiskOutputExt(input.extension);
  return `${stem}${ext}`;
}
