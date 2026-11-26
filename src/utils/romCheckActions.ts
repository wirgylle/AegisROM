// Действия по результатам «Проверки ромов»: исправить, удалить, открыть в папке.
// Actions on ROM check results: fix, delete, show in folder.
//
// RU: Исправления, которые делаются без потерь и без догадок о содержимом:
//   cue       — .cue ссылается на файлы, которых нет: имена дорожек подбираются по регистру или по имени
//               .cue (после переименования), если число найденных файлов совпадает с числом пропавших;
//   m3u       — .m3u пустой или ссылается на пропавшие диски: список дисков собирается заново из папки;
//   makeCue   — .bin без .cue: пишется .cue на одну дорожку (режим по синхрозаголовку сектора);
//   rebuildChd — CHD старого формата, с Zstandard, PS1 без сырых секторов или PS1 как DVD: chdman
//               пересобирает его (только в своём окне приложения, нужен путь к файлу).
// Остальное (обрезанные файлы, битые архивы, контрольные суммы) без исходника не чинится, кнопки нет.
//
// EN: Fixes that lose nothing and guess nothing about the contents:
//   cue       — the .cue points to missing files: track names are matched by letter case or by the .cue
//               name (after a rename) when the number of found files equals the number of missing ones;
//   m3u       — the .m3u is empty or points to missing discs: the disc list is rebuilt from the folder;
//   makeCue   — a .bin without .cue: a one-track .cue is written (mode from the sector sync header);
//   rebuildChd — an old CHD, a Zstandard CHD, a PS1 CHD without raw sectors or a PS1 DVD CHD: chdman
//               rebuilds it (only in the app's own window, it needs the file path).
// Everything else (cut files, broken archives, checksums) cannot be fixed without the source: no button.

import { parseCue, type NamedBlob, type RomCheckResult, type RomCheckTarget } from './romCheck.ts';

export type RomFixKind = 'cue' | 'm3u' | 'makeCue' | 'rebuildChd';

export interface RomFixOp {
  kind: RomFixKind;
  unit: RomCheckTarget;
}

export interface FixOutcome {
  ok: boolean;
  /** Ключ текста rc.fix.* и параметры. / Text key rc.fix.* and its params. */
  code: string;
  params?: Record<string, string | number>;
}

const extOf = (name: string) => {
  const i = name.lastIndexOf('.');
  return i === -1 ? '' : name.slice(i).toLowerCase();
};
const stemOf = (name: string) => name.replace(/\.[^/.]+$/, '');
const baseOf = (p: string) => p.replace(/\\/g, '/').split('/').pop() || p;

const CHD_REBUILD_CODES = new Set(['chdOldVersion', 'chdZstd', 'chdCookedTrack', 'chdDvdForCd']);
const TRACK_EXTS = new Set(['.bin', '.img', '.wav', '.raw', '.iso', '.ogg', '.flac', '.mp3']);
const DISC_EXTS = ['.chd', '.pbp', '.cue', '.ccd', '.gdi', '.mds', '.iso', '.cso'];

/** Диски игры: у многодисковой — каждый диск, иначе сама игра. / A game's units: each disc of a multi-disc game, else the game. */
export function unitsOf(t: RomCheckTarget): RomCheckTarget[] {
  return t.discs && t.discs.length > 1 ? t.discs : [t];
}

const unitLabel = (u: RomCheckTarget) => u.file?.name || baseOf(u.relativePath);

/**
 * Что можно исправить в этой игре. hasPath(file) — есть ли у файла путь на диске (для chdman).
 * What can be fixed in this game. hasPath(file): whether the file has a disk path (for chdman).
 */
export function planFixes(t: RomCheckTarget, r: RomCheckResult, hasPath: (f: NamedBlob) => boolean): RomFixOp[] {
  const ops: RomFixOp[] = [];
  const multi = Boolean(t.discs && t.discs.length > 1);
  for (const u of unitsOf(t)) {
    const f = u.file;
    if (!f || u.missing) continue;
    const label = unitLabel(u);
    const codes = new Set(r.issues.filter((is) => !multi || is.file === label).map((is) => is.code));
    const ext = extOf(f.name);
    if (ext === '.cue' && codes.has('cueMissingFile') && u.parentHandle) ops.push({ kind: 'cue', unit: u });
    else if (ext === '.m3u' && (codes.has('m3uMissing') || codes.has('m3uEmpty')) && u.parentHandle) ops.push({ kind: 'm3u', unit: u });
    else if ((ext === '.bin' || ext === '.img') && codes.has('binNoCue') && u.parentHandle) ops.push({ kind: 'makeCue', unit: u });
    else if (ext === '.chd' && [...codes].some((c) => CHD_REBUILD_CODES.has(c)) && hasPath(f)) ops.push({ kind: 'rebuildChd', unit: u });
  }
  return ops;
}

// ---------- Папка / Folder ----------

async function listFiles(dir: any): Promise<string[]> {
  const out: string[] = [];
  for await (const entry of dir.values()) {
    if (entry.kind === 'file') out.push(String(entry.name));
  }
  return out;
}

async function listSubdirs(dir: any): Promise<{ name: string; handle: any }[]> {
  const out: { name: string; handle: any }[] = [];
  for await (const entry of dir.values()) {
    if (entry.kind === 'directory') out.push({ name: String(entry.name), handle: entry });
  }
  return out;
}

async function readFileText(dir: any, name: string): Promise<string> {
  const file: File = await (await dir.getFileHandle(name)).getFile();
  let s = await file.text();
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  return s;
}

async function writeFileText(dir: any, name: string, text: string): Promise<void> {
  const fh = await dir.getFileHandle(name, { create: true });
  const w = await fh.createWritable();
  await w.write(text);
  await w.close();
}

const naturalCmp = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

// ---------- .cue ----------

/**
 * Новые имена для FILE в .cue. null — однозначной замены нет.
 * New names for the FILE lines of a .cue. null: no unambiguous replacement.
 */
export function matchCueRefs(cueName: string, refs: string[], folder: string[]): Map<string, string> | null {
  const byLower = new Map(folder.map((n) => [n.toLowerCase(), n] as const));
  const result = new Map<string, string>();
  const unresolved: string[] = [];
  for (const ref of refs) {
    const base = baseOf(ref);
    const real = byLower.get(base.toLowerCase());
    if (real) {
      if (real !== ref) result.set(ref, real);
    } else unresolved.push(ref);
  }
  if (unresolved.length > 0) {
    const used = new Set(
      refs.map((ref) => (result.get(ref) || baseOf(ref)).toLowerCase()).filter((n) => byLower.has(n))
    );
    const stem = stemOf(cueName).toLowerCase();
    const candidates = folder
      .filter((n) => TRACK_EXTS.has(extOf(n)) && !used.has(n.toLowerCase()) && n.toLowerCase().startsWith(stem))
      .sort(naturalCmp);
    if (candidates.length !== unresolved.length) return null;
    // Порядок дорожек в .cue сохраняется. / The track order of the .cue is kept.
    unresolved.forEach((ref, i) => result.set(ref, candidates[i]));
  }
  return result;
}

export function rewriteCue(text: string, map: Map<string, string>): string {
  return text
    .split(/\r?\n/)
    .map((line) => {
      const m = /^(\s*FILE\s+)(?:"([^"]+)"|(\S+))(.*)$/i.exec(line);
      if (!m) return line;
      const ref = m[2] || m[3];
      const next = map.get(ref);
      return next ? `${m[1]}"${next}"${m[4]}` : line;
    })
    .join('\r\n');
}

async function fixCue(u: RomCheckTarget): Promise<FixOutcome> {
  const dir = u.parentHandle;
  const name = u.file!.name;
  const text = await readFileText(dir, name);
  const refs = parseCue(text).map((x) => x.file);
  const map = matchCueRefs(name, refs, await listFiles(dir));
  if (!map) return { ok: false, code: 'cueNoMatch' };
  if (map.size === 0) return { ok: true, code: 'nothing' };
  await writeFileText(dir, name, rewriteCue(text, map));
  return { ok: true, code: 'cueFixed', params: { n: map.size } };
}

// ---------- .m3u ----------

const DISC_TAG = /\s*[([](?:disc|disk|cd|dvd)\s*\d+(?:\s*(?:of|из)\s*\d+)?[)\]]/gi;
const discKey = (name: string) => stemOf(baseOf(name)).replace(DISC_TAG, '').replace(/\s+/g, ' ').trim().toLowerCase();
const discNum = (name: string) => {
  const m = /[([](?:disc|disk|cd|dvd)\s*(\d+)/i.exec(name);
  return m ? parseInt(m[1], 10) : 0;
};

/**
 * Список дисков для .m3u из файлов папки (пути относительно папки .m3u).
 * The disc list for a .m3u from the folder's files (paths relative to the .m3u folder).
 */
export function buildM3uList(m3uName: string, files: string[]): string[] {
  const key = discKey(m3uName);
  const pick = new Map<number, string>();
  const rank = (n: string) => DISC_EXTS.indexOf(extOf(n));
  for (const path of files) {
    const name = baseOf(path);
    const ext = extOf(name);
    if (!DISC_EXTS.includes(ext) || discKey(name) !== key) continue;
    const num = discNum(name);
    if (!num) continue;
    const prev = pick.get(num);
    if (!prev || rank(name) < rank(baseOf(prev))) pick.set(num, path);
  }
  return [...pick.entries()].sort((a, b) => a[0] - b[0]).map(([, p]) => p);
}

async function fixM3u(u: RomCheckTarget): Promise<FixOutcome> {
  const dir = u.parentHandle;
  const name = u.file!.name;
  const files = await listFiles(dir);
  // Диски бывают в подпапке (например, «.hidden» или папка с именем игры). / Discs may sit in a subfolder.
  for (const sub of await listSubdirs(dir)) {
    try {
      for (const n of await listFiles(sub.handle)) files.push(`${sub.name}/${n}`);
    } catch {}
  }
  const list = buildM3uList(name, files);
  if (list.length === 0) return { ok: false, code: 'm3uNoDiscs' };
  await writeFileText(dir, name, list.join('\r\n') + '\r\n');
  return { ok: true, code: 'm3uFixed', params: { n: list.length } };
}

// ---------- .bin без .cue / .bin without .cue ----------

const SYNC = [0x00, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x00];

/** Режим дорожки по первому сектору. null — не понять. / Track mode from the first sector. null: unknown. */
export function guessTrackMode(head: Uint8Array, size: number): string | null {
  if (head.length >= 16 && SYNC.every((b, i) => head[i] === b)) {
    if (size % 2352 !== 0) return null;
    return head[15] === 1 ? 'MODE1/2352' : 'MODE2/2352';
  }
  if (size > 0 && size % 2048 === 0) return 'MODE1/2048';
  return null;
}

export function singleTrackCue(binName: string, mode: string): string {
  return `FILE "${binName}" BINARY\r\n  TRACK 01 ${mode}\r\n    INDEX 01 00:00:00\r\n`;
}

async function makeCue(u: RomCheckTarget): Promise<FixOutcome> {
  const dir = u.parentHandle;
  const f = u.file!;
  const head = new Uint8Array(await f.slice(0, 16).arrayBuffer());
  const mode = guessTrackMode(head, f.size);
  if (!mode) return { ok: false, code: 'binUnknownMode' };
  const cueName = `${stemOf(f.name)}.cue`;
  const existing = (await listFiles(dir)).map((n) => n.toLowerCase());
  if (existing.includes(cueName.toLowerCase())) return { ok: false, code: 'cueExists' };
  await writeFileText(dir, cueName, singleTrackCue(f.name, mode));
  return { ok: true, code: 'cueMade', params: { mode } };
}

// ---------- CHD ----------

async function rebuildChd(u: RomCheckTarget, path: string): Promise<FixOutcome> {
  const resp = await fetch('/api/native/romcheck/rebuild-chd', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, console: u.console }),
  });
  let data: any = null;
  try {
    data = await resp.json();
  } catch {}
  if (data?.code === 'noChdman') return { ok: false, code: 'noChdman' };
  if (!resp.ok || !data?.ok) return { ok: false, code: 'failed', params: { msg: String(data?.error || resp.status).split('\n')[0] } };
  return { ok: true, code: 'chdRebuilt' };
}

export async function runFix(op: RomFixOp, pathOf: (f: NamedBlob) => string | null): Promise<FixOutcome> {
  try {
    switch (op.kind) {
      case 'cue':
        return await fixCue(op.unit);
      case 'm3u':
        return await fixM3u(op.unit);
      case 'makeCue':
        return await makeCue(op.unit);
      case 'rebuildChd': {
        const p = op.unit.file ? pathOf(op.unit.file) : null;
        if (!p) return { ok: false, code: 'noPath' };
        return await rebuildChd(op.unit, p);
      }
    }
  } catch (e: any) {
    return { ok: false, code: 'failed', params: { msg: String(e?.message || e) } };
  }
}

// ---------- Удаление / Deleting ----------

export interface DeleteEntry {
  name: string;
  dir: any;
  file?: NamedBlob;
}

/** Все файлы игры: сам файл, дорожки, диски. / All files of a game: the file itself, tracks, discs. */
export async function filesToDelete(t: RomCheckTarget): Promise<DeleteEntry[]> {
  const out: DeleteEntry[] = [];
  const seen = new Set<string>();
  const add = (name: string, dir: any, file?: NamedBlob) => {
    const key = `${(dir as any)?.path || (dir as any)?.name || ''}|${name.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ name, dir, file });
  };
  const units = t.discs && t.discs.length > 1 ? [t, ...t.discs] : [t];
  for (const u of units) {
    if (!u.file || u.missing) continue;
    add(u.file.name, u.parentHandle, u.file);
    for (const c of u.companions || []) add(c.name, u.parentHandle, c);
    if (extOf(u.file.name) === '.cue' && u.parentHandle) {
      try {
        const folder = new Map((await listFiles(u.parentHandle)).map((n) => [n.toLowerCase(), n] as const));
        for (const ref of parseCue(u.cueText || (await u.file.text()))) {
          const real = folder.get(baseOf(ref.file).toLowerCase());
          if (real) add(real, u.parentHandle);
        }
      } catch {}
    }
  }
  return out;
}
