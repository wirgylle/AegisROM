// Сокращения в именах файлов и римские цифры.
// «FFVIII», «FF8», «ff_viii» → «Final Fantasy VIII»; «MGS2» → «Metal Gear Solid 2».
// Без этого онлайн-переименование ищет в индексе Libretro слово «ffviii» и ничего не находит,
// а ключ сравнения «ffviii» не совпадает с «finalfantasy8».
//
// Abbreviations in file names and Roman numerals.
// Without this the online rename searches the Libretro index for "ffviii" and finds nothing,
// and the comparison key "ffviii" never equals "finalfantasy8".
//
// Модуль без импортов, чтобы тесты шли через `node --test`.
// No imports, so tests run with `node --test`.

const ROMAN_VALUES: Record<string, number> = {
  ii: 2, iii: 3, iv: 4, vi: 6, vii: 7, viii: 8, ix: 9,
  xi: 11, xii: 12, xiii: 13, xiv: 14, xv: 15, xvi: 16, xvii: 17, xviii: 18, xix: 19, xx: 20,
};

const ROMAN_OF: string[] = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X',
  'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX'];

/**
 * Римское число → арабское для ключа сравнения. «I», «V» и «X» по одной букве не трогаем:
 * это слишком часто не номер («Mega Man X», «Grand Theft Auto V» и «Mega Man 5» — разные игры).
 * Roman → Arabic for comparison keys. Lone I, V and X are left alone: too often not a number.
 */
export function romanWordToNumber(word: string): number | null {
  const v = ROMAN_VALUES[word.toLowerCase()];
  return v === undefined ? null : v;
}

/** Заменяет римские номера в нижнем регистре на цифры. / Replaces lower-case Roman part numbers with digits. */
export function romanToArabicInKey(lower: string): string {
  return lower.replace(/\b[ivx]{2,5}\b/g, (w) => {
    const n = romanWordToNumber(w);
    return n === null ? w : String(n);
  });
}

interface Alias {
  /** Сокращение в нижнем регистре. / Lower-case abbreviation. */
  abbr: string;
  full: string;
  /** Номер части писать римскими цифрами (так в официальных названиях). / Write the part number in Roman. */
  roman?: boolean;
  /** Сокращение без номера тоже раскрывать. / Expand the abbreviation without a number too. */
  bare?: boolean;
}

// Только однозначные сокращения ретро-серий. / Only unambiguous retro series abbreviations.
const ALIASES: Alias[] = [
  { abbr: 'fft', full: 'Final Fantasy Tactics', bare: true },
  { abbr: 'ff', full: 'Final Fantasy', roman: true },
  { abbr: 'dq', full: 'Dragon Quest', roman: true },
  { abbr: 'mgs', full: 'Metal Gear Solid', bare: true },
  { abbr: 'smb', full: 'Super Mario Bros.' },
  { abbr: 'sf', full: 'Street Fighter', roman: true },
  { abbr: 're', full: 'Resident Evil' },
  { abbr: 'gta', full: 'Grand Theft Auto', bare: true },
  { abbr: 'mk', full: 'Mortal Kombat' },
  { abbr: 'ctr', full: 'Crash Team Racing', bare: true },
  { abbr: 'sotn', full: 'Castlevania: Symphony of the Night', bare: true },
  { abbr: 'loz', full: 'The Legend of Zelda', bare: true },
  { abbr: 'tmnt', full: 'Teenage Mutant Ninja Turtles', bare: true },
];

function partNumber(raw: string): number | null {
  if (/^\d{1,2}$/.test(raw)) {
    const n = Number(raw);
    return n >= 1 && n <= 20 ? n : null;
  }
  if (/^(i|v|x)$/i.test(raw)) return { i: 1, v: 5, x: 10 }[raw.toLowerCase() as 'i' | 'v' | 'x'];
  return romanWordToNumber(raw);
}

/**
 * Раскрывает сокращение серии в начале названия: «FFVIII» → «Final Fantasy VIII»,
 * «FF 7 - Disc 1» → «Final Fantasy VII - Disc 1», «MGS» → «Metal Gear Solid».
 * Срабатывает, только если сокращение — отдельное слово в начале (с номером или без).
 * Expands a series abbreviation at the start of a title. Only a standalone leading word
 * (with or without a part number) is expanded.
 */
export function expandTitleAbbreviations(title: string): string {
  const src = String(title || '');
  const m = src.match(/^(\s*)([A-Za-z]{2,4})[\s_.-]*((?:\d{1,2}|[IVXivx]{1,5}))?(?=$|[\s_.,:;()[\]-])(.*)$/s);
  if (!m) return src;
  const [, lead, word, numRaw, rest] = m;
  const alias = ALIASES.find((a) => a.abbr === word.toLowerCase());
  if (!alias) {
    // «FFVIII» слитно: буквы сокращения + римский номер в одном слове.
    // "FFVIII" glued: abbreviation letters + Roman number in one word.
    const glued = src.match(/^(\s*)([A-Za-z]{2,3}?)([IVXivx]{1,5})(?=$|[\s_.,:;()[\]-])(.*)$/s);
    if (!glued) return src;
    // Слитно — только для серий с римскими номерами (FF, DQ): «REV» не должно стать «Resident Evil 5».
    // Glued form only for Roman-numbered series (FF, DQ): "REV" must not become "Resident Evil 5".
    const a2 = ALIASES.find((a) => a.roman && a.abbr !== 'sf' && a.abbr === glued[2].toLowerCase());
    const n2 = partNumber(glued[3]);
    if (!a2 || n2 === null) return src;
    return `${glued[1]}${a2.full} ${a2.roman ? ROMAN_OF[n2] : n2}${glued[4]}`;
  }
  // Без номера разделитель после сокращения не съедаем. / Without a number keep the separator.
  if (!numRaw) return alias.bare ? `${lead}${alias.full}${src.slice(lead.length + word.length)}` : src;
  const n = partNumber(numRaw);
  if (n === null) return src;
  return `${lead}${alias.full} ${alias.roman ? ROMAN_OF[n] : n}${rest}`;
}
