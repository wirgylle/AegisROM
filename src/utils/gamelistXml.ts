// Разбор gamelist.xml (EmulationStation / ArkOS) с сохранением медиа и описаний.
// Когда AegisROM перезаписывает gamelist.xml, ссылки на медиа, описание и прочие поля из
// старого файла нельзя терять: обложки могут называться не по имени рома, а запись может
// принадлежать рому, которого нет в текущем списке.
//
// gamelist.xml (EmulationStation / ArkOS) parsing that keeps media and descriptions.
// When AegisROM rewrites gamelist.xml it must not drop media paths, descriptions and other
// fields from the old file: covers may be named differently from the ROM, and an entry may
// belong to a ROM that is not in the current list.

export interface GamelistEntry {
  // Путь как в файле, например "./0012.nes". / Path as written, e.g. "./0012.nes".
  path: string;
  name: string;
  // Простые поля <tag>значение</tag> без разэкранирования. / Simple fields, still XML-escaped.
  fields: Record<string, string>;
  // Исходный блок <game>…</game> целиком. / The whole original <game>…</game> block.
  raw: string;
}

// Медиа-поля, которые надо переносить. / Media fields to carry over.
export const GAMELIST_MEDIA_TAGS = ['image', 'thumbnail', 'marquee', 'video'] as const;
// Поля с данными об игре, которые переносим, если они есть. / Game info fields carried over.
export const GAMELIST_INFO_TAGS = [
  'desc',
  'rating',
  'releasedate',
  'developer',
  'publisher',
  'genre',
  'players',
] as const;

export function unescapeXml(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

// Ключи поиска записи: имя файла и имя без расширения, в нижнем регистре.
// Lookup keys: file name and name without extension, lowercased.
export function gamelistKeysForPath(path: string): string[] {
  let p = unescapeXml(path.trim()).replace(/\\/g, '/');
  const slash = p.lastIndexOf('/');
  if (slash !== -1) p = p.slice(slash + 1);
  const lower = p.toLowerCase();
  if (!lower) return [];
  const noExt = lower.replace(/\.[^/.]+$/, '');
  return noExt && noExt !== lower ? [lower, noExt] : [lower];
}

// Нормализует путь из gamelist для сравнения: "./a/b.nes" и "a\\b.nes" → "a/b.nes".
// Normalizes a gamelist path for comparison.
export function normalizeGamelistPath(path: string): string {
  return unescapeXml(path.trim())
    .replace(/\\/g, '/')
    .replace(/^(\.\/)+/, '')
    .toLowerCase();
}

export function parseGamelistEntries(xml: string): GamelistEntry[] {
  const out: GamelistEntry[] = [];
  const gameRe = /<game\b[^>]*>([\s\S]*?)<\/game>/gi;
  const fieldRe = /<([a-zA-Z][\w-]*)\b[^>]*>([\s\S]*?)<\/\1>/g;
  let m: RegExpExecArray | null;
  while ((m = gameRe.exec(xml)) !== null) {
    const fields: Record<string, string> = {};
    let f: RegExpExecArray | null;
    fieldRe.lastIndex = 0;
    while ((f = fieldRe.exec(m[1])) !== null) {
      const tag = f[1].toLowerCase();
      if (!(tag in fields)) fields[tag] = f[2].trim();
    }
    if (!fields.path) continue;
    out.push({
      path: fields.path,
      name: unescapeXml(fields.name || ''),
      fields,
      raw: m[0],
    });
  }
  return out;
}

// Индекс записей по ключам из gamelistKeysForPath. Первая запись выигрывает.
// Index of entries by gamelistKeysForPath keys. The first entry wins.
export function indexGamelistEntries(entries: GamelistEntry[]): Map<string, GamelistEntry> {
  const map = new Map<string, GamelistEntry>();
  for (const e of entries) {
    for (const k of gamelistKeysForPath(e.path)) if (!map.has(k)) map.set(k, e);
  }
  return map;
}

export function findGamelistEntry(
  index: Map<string, GamelistEntry>,
  fileName: string
): GamelistEntry | undefined {
  for (const k of gamelistKeysForPath(fileName)) {
    const e = index.get(k);
    if (e) return e;
  }
  return undefined;
}

// Путь к медиа из gamelist → части относительно папки консоли. Абсолютные пути и выход
// наверх ("..") не принимаем.
// Media path from gamelist → parts relative to the console folder. Absolute paths and ".."
// are rejected.
export function splitRelativeMediaPath(rel: string): string[] | null {
  const p = unescapeXml(rel.trim()).replace(/\\/g, '/');
  if (!p || p.startsWith('/') || /^[a-zA-Z]:/.test(p) || /^[a-z]+:\/\//i.test(p)) return null;
  const parts = p.split('/').filter((x) => x && x !== '.');
  if (parts.length === 0 || parts.some((x) => x === '..')) return null;
  return parts;
}

// Есть ли непустой файл по относительному пути (File System Access API).
// Whether a non-empty file exists at the relative path (File System Access API).
export async function relativeFileExists(dirHandle: any, rel: string): Promise<boolean> {
  const parts = splitRelativeMediaPath(rel);
  if (!parts || !dirHandle) return false;
  try {
    let dir = dirHandle;
    for (let i = 0; i < parts.length - 1; i++) dir = await dir.getDirectoryHandle(parts[i]);
    const fh = await dir.getFileHandle(parts[parts.length - 1]);
    const f = await fh.getFile();
    return f.size > 0;
  } catch {
    return false;
  }
}

export async function getRelativeFileHandle(dirHandle: any, rel: string): Promise<{ dir: any; name: string } | null> {
  const parts = splitRelativeMediaPath(rel);
  if (!parts || !dirHandle) return null;
  try {
    let dir = dirHandle;
    for (let i = 0; i < parts.length - 1; i++) dir = await dir.getDirectoryHandle(parts[i]);
    return { dir, name: parts[parts.length - 1] };
  } catch {
    return null;
  }
}
