// Студия игры для фильтра и сортировки Библиотеки: разработчик, иначе издатель.
// Берём первое имя из «Sonic Team / Sega», «Capcom, Nintendo». Данные приходят из gamelist.xml,
// скраппера, импорта данных и ручных правок редактора.
// The game's studio for the Library filter and sort: the developer, otherwise the publisher.
// The first name is taken from "Sonic Team / Sega", "Capcom, Nintendo".

export interface StudioRowLike {
  developer?: string;
  publisher?: string;
}

/** Ключ «студия не указана». / Key for "no studio". */
export const NO_STUDIO = '__none__';

function primary(v: string | undefined): string {
  const s = String(v || '')
    .split(/\s*(?:\/|,|;|\|)\s*/)[0]
    .replace(/\s+/g, ' ')
    .trim();
  // Заглушки скраппера — не студия. / Scraper placeholders are not a studio.
  if (!s || /^(unknown|n\/?a|official release|original studio|-+)$/i.test(s)) return '';
  return s;
}

export function studioOf(row: StudioRowLike): string {
  return primary(row.developer) || primary(row.publisher);
}

/** Ключ для группировки: без регистра и «Inc.», «Ltd.». / Grouping key: no case, no "Inc." or "Ltd.". */
export function studioKeyOf(row: StudioRowLike): string {
  const s = studioOf(row);
  if (!s) return NO_STUDIO;
  return s
    .toLowerCase()
    .replace(/[.,]/g, '')
    .replace(/\s+(inc|ltd|llc|co|corp|corporation|limited|gmbh|sa|kk)$/g, '')
    .trim();
}
