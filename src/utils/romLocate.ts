/**
 * Поиск файла рома по записи библиотеки, без скана (запуск игры, сохранения).
 * Finding a ROM file from a library record, without a scan (game launch, saves).
 *
 * RU: Запись базы знает путь рома от папки библиотеки (relativePath). Если в сеансе
 * нет файла (база открыта без полного скана), файл берётся из папки библиотеки
 * по этому пути: сначала из папки рома (parentHandle), затем от корня. Путь может
 * начинаться с имени самого корня (скан папки одной консоли).
 * EN: A database record knows the ROM path from the library folder (relativePath).
 * When the session has no file (database opened without a full scan), the file is
 * taken from the library folder by that path: first from the ROM's folder
 * (parentHandle), then from the root. The path may start with the root's own name
 * (scan of a single console folder).
 */

/** Минимум от FileSystemDirectoryHandle, который нужен здесь. / The FileSystemDirectoryHandle subset used here. */
export interface DirLike {
  name: string;
  getDirectoryHandle(name: string): Promise<DirLike>;
  getFileHandle(name: string): Promise<{ getFile(): Promise<File> }>;
}

export interface LocatedRom {
  file: File;
  /** Папка, где лежит файл. / The folder that holds the file. */
  dir: DirLike;
  /** Для .cue: текст листа и найденные треки. / For .cue: the sheet text and the tracks found. */
  cueText?: string;
  companionFiles?: File[];
}

export function splitRomPath(p: string): string[] {
  return String(p || '')
    .replace(/\\/g, '/')
    .split('/')
    .map((s) => s.trim())
    .filter((s) => s && s !== '.' && s !== '..');
}

async function subDir(dir: DirLike, parts: string[]): Promise<DirLike | null> {
  let cur: DirLike = dir;
  for (const part of parts) {
    try {
      cur = await cur.getDirectoryHandle(part);
    } catch {
      return null;
    }
  }
  return cur;
}

async function fileIn(dir: DirLike, names: string[]): Promise<File | null> {
  const seen = new Set<string>();
  for (const n of names) {
    if (!n || seen.has(n) || /[\\/]/.test(n)) continue;
    seen.add(n);
    try {
      return await (await dir.getFileHandle(n)).getFile();
    } catch {
      /* next name */
    }
  }
  return null;
}

/** Имена файлов из FILE-строк листа .cue (только имя, без папок). / FILE entries of a .cue sheet (base names only). */
export function cueTrackNames(cueText: string): string[] {
  const out: string[] = [];
  for (const raw of String(cueText || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!/^FILE\s/i.test(line)) continue;
    const rest = line.slice(5).trim();
    let name = '';
    if (rest.startsWith('"')) {
      const end = rest.indexOf('"', 1);
      if (end > 0) name = rest.slice(1, end);
    } else {
      name = rest.split(/\s+/)[0] || '';
    }
    const base = name.replace(/\\/g, '/').split('/').pop() || '';
    if (base && !out.includes(base)) out.push(base);
  }
  return out;
}

/**
 * Ищет файл рома. relativePath — путь от корня библиотеки; altNames — другие имена
 * того же файла (после переименования). parentHandle — папка рома из сеанса, если есть.
 * Finds a ROM file. relativePath is the path from the library root; altNames are other
 * names of the same file (after a rename). parentHandle is the ROM's folder from the session, if any.
 */
export async function locateRomFile(opts: {
  root?: DirLike | null;
  parentHandle?: DirLike | null;
  relativePath?: string;
  altNames?: string[];
}): Promise<LocatedRom | null> {
  const parts = splitRomPath(opts.relativePath || '');
  const base = parts.length ? parts[parts.length - 1] : '';
  const names = [base, ...(opts.altNames || []).map((n) => splitRomPath(n).pop() || '')].filter(Boolean);
  if (names.length === 0) return null;

  const dirs: DirLike[] = [];
  if (opts.parentHandle) dirs.push(opts.parentHandle);
  const root = opts.root;
  if (root) {
    const dirParts = parts.slice(0, -1);
    const d = await subDir(root, dirParts);
    if (d) dirs.push(d);
    // Путь начинается с имени корня. / The path starts with the root's own name.
    if (dirParts.length && dirParts[0].toLowerCase() === String(root.name || '').toLowerCase()) {
      const d2 = await subDir(root, dirParts.slice(1));
      if (d2) dirs.push(d2);
    }
  }

  for (const dir of dirs) {
    const file = await fileIn(dir, names);
    if (!file) continue;
    if (!/\.cue$/i.test(file.name)) return { file, dir };
    let cueText = '';
    try {
      cueText = await file.text();
    } catch {
      cueText = '';
    }
    const companionFiles: File[] = [];
    for (const n of cueTrackNames(cueText)) {
      const f = await fileIn(dir, [n]);
      if (f) companionFiles.push(f);
    }
    return { file, dir, cueText, companionFiles };
  }
  return null;
}

/** Абсолютный путь папки из нативной прослойки (своё окно), иначе ''. / Absolute folder path from the native layer, else ''. */
export function nativeDirPath(dir: unknown): string {
  const d = dir as { __aegisNativeFs?: boolean; path?: unknown } | null;
  return d && d.__aegisNativeFs && typeof d.path === 'string' ? d.path : '';
}
