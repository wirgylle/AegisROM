// Распознавание хаков, переводов и пропатченных ромов.
// Detection of hacks, translations and patched ROMs.
//
// Источники сигнала, по убыванию надёжности:
// Signal sources, most reliable first:
//   1. патч из папки patch/, который даёт ровно этот CRC32 (BPS/UPS хранят CRC исходника и результата);
//      a patch from patch/ that produces exactly this CRC32 (BPS/UPS store source and target CRC);
//   2. сверка по хешу с DAT: хеш совпал с оригиналом — значит, это не хак, даже если в имени есть тег;
//      DAT hash check: a hash that matches a clean original means it is not a hack, whatever the name says;
//   3. теги в имени (GoodTools / No-Intro): [h], [T+Rus], [f], [t], (Hack) и т. п.;
//      name tags (GoodTools / No-Intro): [h], [T+Rus], [f], [t], (Hack), etc.;
//   4. ром лежит в папке hackroms/.
//      the ROM sits in a hackroms/ folder.
//
// Модуль без импортов, чтобы тестироваться через `node --test`.
// No imports, so it can be tested with `node --test`.

export type RomModKind = 'original' | 'translation' | 'hack' | 'fix' | 'trainer' | 'patched';

// Группы для фильтров и сборок. / Groups for filters and builds.
export type RomModGroup = 'original' | 'translation' | 'hack' | 'patched';

export const HACKROMS_DIR = 'hackroms';
export const PATCH_DIR = 'patch';

export interface RomModInfo {
  kind: RomModKind;
  // Найденные теги как есть, например «[T+Rus1.0_Shedevr]». / Tags as found, e.g. "[T+Rus1.0_Shedevr]".
  tags: string[];
  language?: string;
  version?: string;
  author?: string;
  hackName?: string;
  inHackFolder: boolean;
  // Имя файла без тегов хака: так, вероятно, называется оригинал. / File name without mod tags: likely the original's name.
  originalName: string;
  source: 'tags' | 'folder' | 'patch' | 'dat' | 'none';
  // Патч из patch/, который даёт этот ром. / Patch from patch/ that produces this ROM.
  patchFile?: string;
  // Патчи из patch/, которые подходят к этому (чистому) рому. / Patches from patch/ that fit this (clean) ROM.
  availablePatches?: string[];
  // Название оригинала по DAT. / Original title from the DAT.
  datOriginal?: string;
  // Хеш совпал с чистым оригиналом в DAT, а тег в имени ошибочный. / Hash matched a clean DAT original; the name tag is wrong.
  mislabeled?: boolean;
  // Хеш сверяли с DAT и не нашли: ром изменён. / Hash checked against DAT and not found: the ROM is modified.
  datMiss?: boolean;
}

const LANG_NAMES: Record<string, string> = {
  rus: 'Rus',
  ru: 'Rus',
  eng: 'Eng',
  en: 'Eng',
  ger: 'Ger',
  deu: 'Ger',
  de: 'Ger',
  fre: 'Fre',
  fra: 'Fre',
  fr: 'Fre',
  spa: 'Spa',
  es: 'Spa',
  ita: 'Ita',
  it: 'Ita',
  por: 'Por',
  pt: 'Por',
  bra: 'Por',
  pol: 'Pol',
  ukr: 'Ukr',
  chi: 'Chi',
  kor: 'Kor',
  jpn: 'Jpn',
};

function normLang(raw: string): string {
  const low = raw.toLowerCase();
  return LANG_NAMES[low] || raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
}

// Разбирает хвост тега перевода: «1.0_Shedevr», « v1.2 by Team», «_Pirate». / Parses the tail of a translation tag.
function parseVersionAuthor(rest: string): { version?: string; author?: string } {
  let s = rest.trim();
  let version: string | undefined;
  const vm = s.match(/^[\s_-]*v?(\d+(?:\.\d+)*[a-z]?)(?=[\s_-]|$)/i);
  if (vm) {
    version = vm[1];
    s = s.slice(vm[0].length);
  }
  s = s.replace(/^[\s_-]*(?:by\s+)?/i, '').replace(/_/g, ' ').trim();
  return { version, author: s || undefined };
}

const TRANSLATION_TAG = /\[T([+-])([A-Za-z]{2,3})(?:lish|sian|man|nch|nish|ian)?([^\]]*)\]/i;
const TRANSLATION_WORD = /[([]([^)\]]*\btranslat(?:ed|ion)\b[^)\]]*)[)\]]/i;
const HACK_WORD = /[([]([^)\]]*\bhack(?:ed)?\b[^)\]]*)[)\]]/i;
const HACK_TAG = /\[h(\d*[A-Za-z]?\d*)?(?:[\s_]+([^\]]*))?\]/;
const FIX_TAG = /\[f(\d*)(?:[\s_]+([^\]]*))?\]/;
const FIX_WORD = /[([](fixed|fix)[)\]]/i;
const TRAINER_TAG = /\[t(\d*)(?:[\s_]+([^\]]*))?\]/;
const TRAINER_WORD = /[([](trainer|trained)[)\]]/i;
const PATCHED_WORD = /[([](patched|patch)[)\]]/i;

function stripTags(base: string, tags: string[]): string {
  let s = base;
  for (const t of tags) s = s.split(t).join(' ');
  return s.replace(/\s{2,}/g, ' ').replace(/\s+([.)\]])/g, '$1').trim();
}

export function isInHackFolder(relativePath: string): boolean {
  return relativePath
    .split(/[\\/]/)
    .slice(0, -1)
    .some((seg) => seg.toLowerCase() === HACKROMS_DIR);
}

export function isInPatchFolder(relativePath: string): boolean {
  return relativePath
    .split(/[\\/]/)
    .slice(0, -1)
    .some((seg) => seg.toLowerCase() === PATCH_DIR);
}

// Главная функция: что за ром по имени и пути. / Main entry: what the ROM is, from its name and path.
export function detectRomMod(fileName: string, relativePath = ''): RomModInfo {
  const dot = fileName.lastIndexOf('.');
  const ext = dot > 0 ? fileName.slice(dot) : '';
  const base = dot > 0 ? fileName.slice(0, dot) : fileName;
  const inHackFolder = isInHackFolder(relativePath);
  const tags: string[] = [];
  let kind: RomModKind = 'original';
  const info: Partial<RomModInfo> = {};

  const tr = base.match(TRANSLATION_TAG);
  const trWord = base.match(TRANSLATION_WORD);
  const hackTag = base.match(HACK_TAG);
  const hackWord = base.match(HACK_WORD);

  if (tr) {
    kind = 'translation';
    tags.push(tr[0]);
    info.language = normLang(tr[2]);
    Object.assign(info, parseVersionAuthor(tr[3]));
  } else if (trWord) {
    kind = 'translation';
    tags.push(trWord[0]);
    const lm = trWord[1].match(/\b(rus|russian|eng|english|ger|german|fre|french|spa|spanish|ita|italian|por|portuguese|pol|polish|ukr)\w*/i);
    if (lm) info.language = normLang(lm[1].slice(0, 3));
    const by = trWord[1].match(/\bby\s+(.+)$/i);
    if (by) info.author = by[1].trim();
  }

  if (hackTag || hackWord) {
    // Перевод поверх хака — всё равно хак (меняет игру). / A translation on top of a hack is still a hack.
    kind = 'hack';
    if (hackTag) {
      tags.push(hackTag[0]);
      if (hackTag[2]) info.hackName = hackTag[2].trim();
    }
    if (hackWord) {
      tags.push(hackWord[0]);
      const inner = hackWord[1].trim();
      const by = inner.match(/\bby\s+(.+)$/i);
      if (by && !info.author) info.author = by[1].trim();
      const named = inner.replace(/\bhack(?:ed)?\b/i, '').replace(/\bby\s+.+$/i, '').trim();
      if (named && !info.hackName) info.hackName = named;
    }
  }

  if (kind === 'original') {
    const fix = base.match(FIX_TAG) || base.match(FIX_WORD);
    const trainer = base.match(TRAINER_TAG) || base.match(TRAINER_WORD);
    const patched = base.match(PATCHED_WORD);
    if (fix) {
      kind = 'fix';
      tags.push(fix[0]);
    } else if (trainer) {
      kind = 'trainer';
      tags.push(trainer[0]);
    } else if (patched) {
      kind = 'patched';
      tags.push(patched[0]);
    }
  }

  let source: RomModInfo['source'] = tags.length > 0 ? 'tags' : 'none';
  if (kind === 'original' && inHackFolder) {
    kind = 'patched';
    source = 'folder';
  }

  return {
    kind,
    tags,
    inHackFolder,
    originalName: `${stripTags(base, tags)}${ext}`,
    source,
    ...info,
  };
}

export function modGroup(kind: RomModKind): RomModGroup {
  if (kind === 'translation') return 'translation';
  if (kind === 'hack') return 'hack';
  if (kind === 'original') return 'original';
  return 'patched';
}

export function isModded(info?: RomModInfo | null): boolean {
  return Boolean(info && info.kind !== 'original');
}

// Тег статуса для конструктора имён. / Status tag for the filename constructor.
export function modTag(info?: RomModInfo | null): string {
  if (!info) return '';
  switch (info.kind) {
    case 'translation':
      return `T+${info.language || 'Trans'}`;
    case 'hack':
      return 'Hack';
    case 'fix':
      return 'Fixed';
    case 'trainer':
      return 'Trainer';
    case 'patched':
      return 'Patched';
    default:
      return '';
  }
}

// Уточнение по результату сверки с DAT. / Refine using the DAT hash lookup result.
export function refineModWithDat(
  info: RomModInfo,
  dat: { matched: boolean; name?: string } | null | undefined
): RomModInfo {
  if (!dat) return info;
  if (dat.matched && dat.name) {
    const datMod = detectRomMod(dat.name);
    if (datMod.kind !== 'original') {
      // DAT сам знает этот хак (например, DAT хаков). / The DAT itself lists this hack.
      return { ...datMod, inHackFolder: info.inHackFolder, source: 'dat', datOriginal: datMod.originalName };
    }
    if (info.kind !== 'original' && info.source !== 'patch') {
      // Хеш — чистый оригинал: тег в имени ошибочный. / Hash is a clean original: the name tag is wrong.
      return { ...info, kind: 'original', source: 'dat', mislabeled: true, datOriginal: dat.name };
    }
    return { ...info, datOriginal: dat.name };
  }
  if (info.kind !== 'original') return { ...info, datMiss: true };
  return info;
}

export interface PatchFileRef {
  name: string;
  relativePath: string;
  sourceCrc32?: string;
  targetCrc32?: string;
}

// Привязка патчей из patch/ к ромам по CRC32. / Links patches from patch/ to ROMs by CRC32.
export function linkPatchesToRom(
  info: RomModInfo,
  crcs: Array<string | undefined>,
  patches: PatchFileRef[]
): RomModInfo {
  const own = new Set(crcs.filter(Boolean).map((c) => (c as string).toLowerCase()));
  if (own.size === 0 || patches.length === 0) return info;
  let next = info;
  const produced = patches.find((p) => p.targetCrc32 && own.has(p.targetCrc32.toLowerCase()));
  if (produced) {
    next = {
      ...next,
      kind: next.kind === 'original' ? 'patched' : next.kind,
      source: 'patch',
      patchFile: produced.name,
      mislabeled: false,
    };
  }
  const fits = patches
    .filter((p) => p.sourceCrc32 && own.has(p.sourceCrc32.toLowerCase()))
    .map((p) => p.name);
  if (fits.length > 0) next = { ...next, availablePatches: fits };
  return next;
}

type Tf = (key: string, vars?: Record<string, string | number>) => string;

// Описание для карточки рома: чем отличается от оригинала. / Card description: how it differs from the original.
export function describeRomMod(info: RomModInfo | undefined | null, tf: Tf): string {
  if (!info) return '';
  const parts: string[] = [];
  if (info.kind === 'original') {
    if (info.mislabeled) parts.push(tf('hack.desc.mislabeled', { name: info.datOriginal || '' }));
    if (info.availablePatches?.length) {
      parts.push(tf('hack.desc.patchesAvailable', { list: info.availablePatches.join(', ') }));
    }
    return parts.join(' ');
  }
  const lang = info.language ? tf(`hack.lang.${info.language.toLowerCase()}`) : '';
  const langText = lang && !lang.startsWith('hack.lang.') ? lang : info.language || '';
  switch (info.kind) {
    case 'translation':
      parts.push(langText ? tf('hack.desc.translationTo', { lang: langText }) : tf('hack.desc.translation'));
      break;
    case 'hack':
      parts.push(info.hackName ? tf('hack.desc.hackNamed', { name: info.hackName }) : tf('hack.desc.hack'));
      break;
    case 'fix':
      parts.push(tf('hack.desc.fix'));
      break;
    case 'trainer':
      parts.push(tf('hack.desc.trainer'));
      break;
    default:
      parts.push(tf('hack.desc.patched'));
  }
  if (info.version) parts.push(tf('hack.desc.version', { v: info.version }));
  if (info.author) parts.push(tf('hack.desc.author', { name: info.author }));
  parts.push(tf('hack.desc.original', { name: info.datOriginal || info.originalName }));
  if (info.patchFile) parts.push(tf('hack.desc.fromPatch', { name: info.patchFile }));
  if (info.datMiss) parts.push(tf('hack.desc.datMiss'));
  if (info.source === 'folder') parts.push(tf('hack.desc.byFolder'));
  return parts.join(' · ');
}
