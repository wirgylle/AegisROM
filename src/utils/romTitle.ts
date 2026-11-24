// Название рома из имени файла: чистка тегов, номеров-индексов, проверка мусора.
// Вынесено из App.tsx, чтобы покрыть тестами (`npm test`).
// ROM title from a file name: tag and index stripping, junk checks.
// Moved out of App.tsx so it can be covered by tests (`npm test`).
import { expandTitleAbbreviations } from './titleAliases.ts';

export const LEADING_NUM_REGEX = /^[\s\[\(#]*(\d{1,10})[\s\])\._-]+/;
export const PURE_NUMBERED_ROM_REGEX =
  /^(?:rom[_\-\s]*|game[_\-\s]*|track[_\-\s]*|file[_\-\s]*|psx[_\-\s]*|ps1[_\-\s]*|no[_\-\s]*|#)?0*(\d{1,10})(?:[_\-\s]*(?:disc|cd|d|part|track)?[_\-\s]*\d*)?$/i;
export const PREFIXED_SEQ_ROM_REGEX = /^[\s\[\(#]*0*(\d{1,10})[\s\])\._-]+(.*)$/;

// Отрезаем только настоящее расширение файла. Раньше резали всё после последней точки, и названия
// из DAT (там расширения нет) ломались: «Dr. Mario (USA)» → «Dr», «Super Mario Bros. 3» → «Super Mario Bros».
// Strip only a real file extension. Everything after the last dot used to go, which broke DAT names
// (they have no extension): "Dr. Mario (USA)" → "Dr", "Super Mario Bros. 3" → "Super Mario Bros".
const FILE_EXT_REGEX = /\.(?:7z|[a-z][a-z0-9]{0,4}|[A-Z][A-Z0-9]{0,4})$/;

export function stripFileExtension(name: string): string {
  return name.replace(FILE_EXT_REGEX, '');
}

// Тег No-Intro / TOSEC в скобках с буквами: (USA), (Japan, USA), (En,Fr), (Rev 1).
// A No-Intro / TOSEC tag in brackets with letters: (USA), (Japan, USA), (En,Fr), (Rev 1).
const NAMED_TAG_REGEX = /\([^()]*[a-zA-Z][^()]*\)/;

// Число — название игры (1942, 1943 - The Battle of Midway, 2020 Super Baseball), а не номер в списке.
// Год 1900–2099 без ведущего нуля номером не считаем.
// The number is part of the title (1942, 2020 Super Baseball), not a list index.
// A year 1900–2099 without a leading zero is never treated as an index.
function isTitleYearNumber(num: string): boolean {
  return /^(19|20)\d\d$/.test(num);
}

// Текст без тегов в скобках. / Text without bracketed tags.
export function stripBracketTags(s: string): string {
  return s.replace(/\[.*?\]|\(.*?\)/g, ' ').replace(/\s+/g, ' ').trim();
}

// Исключение для игр про Агента 007 (James Bond 007), чтобы не отрезать "007" и не попадать в цикл переименования
export function isJamesBond007Game(text: string): boolean {
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

export function stripLeadingIndexExcept007(s: string): string {
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
    // «1943 - The Battle of Midway», «2020 Super Baseball»: число — часть названия.
    // "1943 - The Battle of Midway", "2020 Super Baseball": the number is part of the title.
    if (isTitleYearNumber(m[1]) && !/^[\s\[\(#]*0/.test(res)) break;
    // Номер, отделённый только пробелом («10 Yard Fight», «3 Ninjas»), режем лишь с ведущим нулём («001 Contra»).
    // A number followed only by a space ("10 Yard Fight") is cut only with a leading zero ("001 Contra").
    if (/^[\s\[\(#]*\d+\s+$/.test(m[0]) && !/^[\s\[\(#]*0\d/.test(m[0])) break;
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

export function isNumberedRomFilename(
  fileName: string,
  extractedTitle = '',
  inSequentialFolder = false
): boolean {
  const base = stripFileExtension(fileName).trim();
  const baseNoTags = base.replace(/\[.*?\]|\(.*?\)/g, '').trim();
  // Исключение 007: если файл уже называется "007 - Tomorrow Never Dies", не переименовываем повторно
  if (isJamesBond007Game(base) && base.length > 5) {
    const m = base.match(PREFIXED_SEQ_ROM_REGEX);
    if (!m || m[1] === '7' || base.trim().startsWith('007')) {
      return false;
    }
  }
  if (PURE_NUMBERED_ROM_REGEX.test(base) || PURE_NUMBERED_ROM_REGEX.test(baseNoTags)) {
    // «1942 (USA).zip» — название по No-Intro, а не номер: у номеров нет тегов региона.
    // Без тега («1942.zip») не угадать, такие опознаёт только DAT по хешу.
    // "1942 (USA).zip" is a No-Intro name, not an index: indexes carry no region tag.
    // Without a tag ("1942.zip") it cannot be told; only the DAT hash identifies those.
    if (isNumericTitleWithTags(base)) return false;
    return true;
  }
  const stripped = stripLeadingIndexExcept007(baseNoTags).trim();
  if (stripped.length <= 1) return true;
  // Номер считаем индексом, только если его действительно можно отрезать («1943 - The Battle of Midway» — нет).
  // The number is an index only if it can actually be cut ("1943 - The Battle of Midway" cannot).
  if (inSequentialFolder && PREFIXED_SEQ_ROM_REGEX.test(baseNoTags) && stripped !== baseNoTags) {
    return true;
  }
  return false;
}

// «1942 (USA)», «1943 (Japan) (Rev 1)»: число без ведущего нуля и префикса + тег в скобках.
// "1942 (USA)": a number without a leading zero or prefix plus a bracketed tag.
export function isNumericTitleWithTags(base: string): boolean {
  const noTags = base.replace(/\[.*?\]|\(.*?\)/g, '').trim();
  return /^[1-9]\d{0,4}$/.test(noTags) && NAMED_TAG_REGEX.test(base);
}

export function prettifyBinaryHeaderTitle(raw: string): string {
  const cleaned = raw
    .replace(/[\x00-\x1f\x7f-\x9f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return '';
  const letters = (cleaned.match(/[a-zA-Zа-яА-ЯёЁ]/g) || []).length;
  if (letters < 3) return '';
  // Мусор из заголовка («)6el», «!-gKw)(») раньше становился названием. / Header junk used to become the title.
  if (!isPlausibleTitleText(cleaned)) return '';
  // If internal binary header is ALL CAPS (e.g. "CASTLEVANIA ARIA" or "TEKKENTHREE"), convert cleanly to Title Case
  const hasLower = /[a-zа-яё]/.test(cleaned);
  if (!hasLower && cleaned.length >= 4) {
    return cleaned
      .toLowerCase()
      .replace(/(^|\s|[-:])([a-zа-яё])/g, (_, sep, ch) => `${sep}${ch.toUpperCase()}`);
  }
  return cleaned;
}

export function extractCleanTitle(fileName: string): string {
  const originalBase = stripFileExtension(fileName).trim();
  const withoutTags = originalBase.replace(/\[.*?\]|\(.*?\)/g, '').trim();
  // Имя из одних тегов («(USA).zip») — названия нет. Раньше сюда возвращалось «(USA)», к нему
  // дописывался регион, и каждый запуск давал «(USA) (USA)», «(USA) (USA) (USA)»…
  // A name made of tags only ("(USA).zip") has no title. It used to come back as "(USA)", the region
  // was appended, and every run produced "(USA) (USA)", "(USA) (USA) (USA)"…
  if (!withoutTags) return '';
  if (PURE_NUMBERED_ROM_REGEX.test(originalBase) || PURE_NUMBERED_ROM_REGEX.test(withoutTags)) {
    return withoutTags || originalBase;
  }
  // «FFVIII» → «Final Fantasy VIII»: иначе по сокращению не найти ни DAT-имя, ни обложку.
  // "FFVIII" → "Final Fantasy VIII": an abbreviation matches neither a DAT name nor a cover.
  const base = expandTitleAbbreviations(stripLeadingIndexExcept007(withoutTags || originalBase));
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
    return withoutTags;
  }
  return candidate;
}

// Можно ли строить из названия имя файла. Название из одних тегов или пустое — нельзя: получится «(USA).zip».
// Число («1942») годится, только если оно подтверждено (DAT, точное совпадение онлайн, тег региона в имени).
// Whether a file name can be built from the title. Empty or tag-only titles cannot ("(USA).zip").
// A bare number ("1942") is accepted only when confirmed (DAT, exact online match, region tag in the name).
export function canBuildNameFromTitle(title: string, numericConfirmed = false): boolean {
  const core = stripBracketTags(title || '').replace(/^[\s.\-–—_]+|[\s.\-–—_]+$/g, '');
  if (!core) return false;
  const letters = (core.match(/[a-zA-Zа-яА-ЯёЁ]/g) || []).length;
  if (letters >= 2 && !PURE_NUMBERED_ROM_REGEX.test(core)) return true;
  if (numericConfirmed && /^[1-9]\d{0,4}$/.test(core)) return true;
  // «E.T.», «Q*bert»: одна-две буквы, но не мусор. / One or two letters, yet not junk.
  return letters >= 1 && isPlausibleTitleText(core) && !PURE_NUMBERED_ROM_REGEX.test(core);
}

// Похоже ли на человеческое название, а не на мусор из заголовка рома («)6el», «!-gKw)(»).
// Does it look like a human title rather than ROM-header junk (")6el", "!-gKw)(")?
export function isPlausibleTitleText(s: string): boolean {
  const t = (s || '').trim();
  if (!t) return false;
  if ((t.match(/[a-zA-Zа-яА-ЯёЁ]/g) || []).length < 1) return false;
  // Скобки, < > | ^ ` \ и подобные в чистых названиях не встречаются, а в мусоре — постоянно.
  // Brackets, < > | ^ ` \ and the like never appear in clean titles and are common in junk.
  if (/[()[\]{}<>|^`\\"]/.test(t)) return false;
  // Пунктуация в начале («!-gKw», «)6el») — признак мусора. / Leading punctuation is a junk sign.
  if (/^[^a-zA-Zа-яА-ЯёЁ0-9'$]/.test(t)) return false;
  const plain = (t.match(/[a-zA-Zа-яА-ЯёЁ0-9 .,:;'&!?\-–—]/g) || []).length;
  return plain / t.length >= 0.8;
}
