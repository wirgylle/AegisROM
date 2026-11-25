// «Упорядочить медиа»: файлы Skraper из <консоль>/media/<вид>/ переезжают в раскладку проекта
// (images/<ром>-image, images/<ром>-thumb, marquees/<ром>-marquee, videos/<ром>-video,
// manuals/<ром>.pdf), получают имя рома, пути в gamelist.xml обновляются. Одинаковые копии
// (байт в байт) можно удалить. Сначала строится план, применяется он отдельно.
//
// "Tidy media": Skraper files from <console>/media/<kind>/ move into the project layout,
// get the ROM's name, gamelist.xml paths are updated. Identical copies (byte for byte) can be
// deleted. A plan is built first and applied separately.
//
// Модуль без импортов приложения, чтобы тесты шли через `node --test`.
// No app imports, so tests run with `node --test`.

import { MEDIA_CONTAINER_DIRS, NON_COVER_DIRS } from './skraperMedia.ts';

export type NormSlot = 'boxart' | 'snap' | 'marquee' | 'video' | 'manual';

export interface NormFile {
  kind: 'file';
  name: string;
  getFile(): Promise<Blob & { size: number }>;
}
export interface NormDir {
  kind: 'directory';
  name: string;
  values(): AsyncIterable<NormFile | NormDir>;
  getDirectoryHandle(name: string, opts?: { create?: boolean }): Promise<NormDir>;
  getFileHandle(name: string, opts?: { create?: boolean }): Promise<any>;
  removeEntry(name: string): Promise<void>;
}

export type NormAction =
  /** Переместить (и, если renamed, переименовать). / Move (and rename when renamed). */
  | { type: 'move'; from: string; to: string; slot: NormSlot; renamed: boolean }
  /** Такой же файл уже лежит в цели: источник можно удалить. / The same file is already at the target. */
  | { type: 'duplicate'; from: string; to: string; slot: NormSlot }
  /** В цели другой файл: ничего не трогаем. / A different file is at the target: left alone. */
  | { type: 'conflict'; from: string; to: string; slot: NormSlot }
  /** Не переносится. / Not moved. */
  | { type: 'skip'; from: string; reason: 'no-rom' | 'not-cover' | 'unknown' | 'extra' };

export interface ConsoleNormPlan {
  /** Путь папки консоли от выбранной папки. / Console folder path from the chosen folder. */
  path: string;
  dir: NormDir;
  actions: NormAction[];
}

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.gif']);
const VIDEO_EXT = new Set(['.mp4', '.webm', '.mkv', '.avi', '.mov', '.m4v']);
const NON_ROM_EXT = new Set([
  ...IMAGE_EXT,
  ...VIDEO_EXT,
  '.pdf', '.xml', '.txt', '.json', '.nfo', '.md', '.ini', '.cfg', '.db', '.dat', '.log',
  '.srm', '.sav', '.state', '.auto', '.rtc', '.mcr', '.ips', '.bps', '.ups', '.xdelta', '.sh',
]);
const LAYOUT_DIRS = new Set(['images', 'marquees', 'videos', 'manuals', 'patch', 'hackroms', 'saves', 'states']);

const extOf = (name: string) => {
  const i = name.lastIndexOf('.');
  return i < 0 ? '' : name.slice(i).toLowerCase();
};
const stemOf = (name: string) => name.replace(/\.[^/.]+$/, '');

/** Слот и приоритет по папке (меньше — лучше). / Slot and priority from the folder (lower wins). */
const DIR_SLOT: Record<string, [NormSlot, number]> = {
  box2dfront: ['boxart', 0],
  boxfront: ['boxart', 0],
  'box-2d': ['boxart', 0],
  box2d: ['boxart', 0],
  boxart: ['boxart', 0],
  boxarts: ['boxart', 0],
  covers: ['boxart', 1],
  cover: ['boxart', 1],
  named_boxarts: ['boxart', 1],
  thumbnails: ['boxart', 2],
  images: ['boxart', 3],
  image: ['boxart', 3],
  mix: ['boxart', 4],
  mixrbv1: ['boxart', 4],
  mixrbv2: ['boxart', 4],
  miximages: ['boxart', 4],
  box3d: ['boxart', 5],
  screenshot: ['snap', 0],
  screenshots: ['snap', 0],
  snap: ['snap', 0],
  snaps: ['snap', 0],
  ss: ['snap', 0],
  named_snaps: ['snap', 0],
  screenshottitle: ['snap', 2],
  'screenshot-title': ['snap', 2],
  titlescreen: ['snap', 2],
  titlescreens: ['snap', 2],
  titles: ['snap', 2],
  sstitle: ['snap', 2],
  named_titles: ['snap', 2],
  marquee: ['marquee', 0],
  marquees: ['marquee', 0],
  wheel: ['marquee', 1],
  wheels: ['marquee', 1],
  wheelhd: ['marquee', 1],
  'wheel-hd': ['marquee', 1],
  wheelcarbon: ['marquee', 2],
  'wheel-carbon': ['marquee', 2],
  wheelsteel: ['marquee', 2],
  'wheel-steel': ['marquee', 2],
  logos: ['marquee', 1],
  named_logos: ['marquee', 1],
  videos: ['video', 0],
  video: ['video', 0],
  snapvideos: ['video', 0],
  'video-snaps': ['video', 0],
  manuals: ['manual', 0],
  manual: ['manual', 0],
};

const SUFFIX_SLOT: Array<[RegExp, NormSlot]> = [
  [/-(image|boxart|box|cover)$/i, 'boxart'],
  [/-(thumb|snap|screenshot|ss|title)$/i, 'snap'],
  [/-(marquee|wheel|logo)$/i, 'marquee'],
  [/-(video|snapvideo)$/i, 'video'],
  [/[-_ ]manual$/i, 'manual'],
];

/** Слот файла из media/<папка>/; null — не переносим. / Slot of a media/<folder>/ file; null: not moved. */
export function normSlotOf(fileName: string, dirName: string): { slot: NormSlot; priority: number; stem: string } | null {
  const ext = extOf(fileName);
  let stem = stemOf(fileName);
  let bySuffix: NormSlot | null = null;
  for (const [re, slot] of SUFFIX_SLOT) {
    if (re.test(stem)) {
      stem = stem.replace(re, '');
      bySuffix = slot;
      break;
    }
  }
  const byDir = DIR_SLOT[dirName.toLowerCase()];
  let slot: NormSlot | null = byDir ? byDir[0] : bySuffix;
  const priority = byDir ? byDir[1] : 3;
  if (bySuffix && bySuffix !== 'manual' && bySuffix !== 'video' && byDir && byDir[0] !== 'video' && byDir[0] !== 'manual') {
    slot = bySuffix;
  }
  if (!slot) return null;
  if (slot === 'video' && !VIDEO_EXT.has(ext)) return null;
  if (slot === 'manual' && ext !== '.pdf') return null;
  if ((slot === 'boxart' || slot === 'snap' || slot === 'marquee') && !IMAGE_EXT.has(ext)) return null;
  return { slot, priority, stem: stem.trim() };
}

/** Целевой путь от папки консоли. / Target path from the console folder. */
export function normTargetPath(slot: NormSlot, romStem: string, ext: string): string {
  switch (slot) {
    case 'boxart':
      return `images/${romStem}-image${ext}`;
    case 'snap':
      return `images/${romStem}-thumb${ext}`;
    case 'marquee':
      return `marquees/${romStem}-marquee${ext}`;
    case 'video':
      return `videos/${romStem}-video${ext}`;
    case 'manual':
      return `manuals/${romStem}${ext}`;
  }
}

export function normKey(name: string): string {
  return stemOf(name)
    .replace(/\[.*?\]|\(.*?\)/g, ' ')
    .replace(/[^a-z0-9а-яё]/gi, '')
    .toLowerCase();
}

/**
 * Сопоставляет имя медиа с ромом: точное имя, затем нормализованное название (только если ром один).
 * Matches a media name to a ROM: the exact name, then the normalized title (only when unique).
 */
export function matchRomStem(mediaStem: string, romStems: string[]): string | null {
  const low = mediaStem.toLowerCase();
  const exact = romStems.find((r) => r.toLowerCase() === low);
  if (exact) return exact;
  const k = normKey(mediaStem);
  if (!k || /^\d+$/.test(k)) return null;
  const hits = romStems.filter((r) => normKey(r) === k);
  return hits.length === 1 ? hits[0] : null;
}

async function getPath(dir: NormDir, rel: string): Promise<NormFile | null> {
  const parts = rel.split('/');
  const name = parts.pop()!;
  try {
    let d = dir;
    for (const p of parts) d = await d.getDirectoryHandle(p);
    return (await d.getFileHandle(name)) as NormFile;
  } catch {
    return null;
  }
}

async function sameBytes(a: Blob, b: Blob): Promise<boolean> {
  if (a.size !== b.size) return false;
  const [x, y] = await Promise.all([a.arrayBuffer(), b.arrayBuffer()]);
  const u = new Uint8Array(x);
  const v = new Uint8Array(y);
  for (let i = 0; i < u.length; i++) if (u[i] !== v[i]) return false;
  return true;
}

/** Имена ромов в папке консоли: файлы ромов и папки многодисковых игр. / ROM names in a console folder. */
export async function listRomStems(dir: NormDir): Promise<string[]> {
  const out: string[] = [];
  for await (const e of dir.values()) {
    if (e.name.startsWith('.')) continue;
    const low = e.name.toLowerCase();
    if (e.kind === 'directory') {
      if (MEDIA_CONTAINER_DIRS.has(low) || LAYOUT_DIRS.has(low) || DIR_SLOT[low] || NON_COVER_DIRS.has(low) || low.startsWith('_')) continue;
      out.push(e.name);
    } else if (!NON_ROM_EXT.has(extOf(e.name)) && extOf(e.name)) {
      out.push(stemOf(e.name));
    }
  }
  return Array.from(new Set(out));
}

/** План для одной папки консоли с media/. / The plan for one console folder with media/. */
export async function planConsoleMedia(dir: NormDir, path = ''): Promise<ConsoleNormPlan> {
  const romStems = await listRomStems(dir);
  const actions: NormAction[] = [];
  type Cand = { rel: string; ext: string; priority: number; file: NormFile };
  const best = new Map<string, Cand[]>(); // `${rom}|${slot}` → candidates
  for await (const c of dir.values()) {
    if (c.kind !== 'directory' || !MEDIA_CONTAINER_DIRS.has(c.name.toLowerCase())) continue;
    for await (const sub of c.values()) {
      if (sub.kind !== 'directory') continue;
      const subLow = sub.name.toLowerCase();
      for await (const f of sub.values()) {
        if (f.kind !== 'file') continue;
        const rel = `${c.name}/${sub.name}/${f.name}`;
        if (NON_COVER_DIRS.has(subLow) && !DIR_SLOT[subLow]) {
          actions.push({ type: 'skip', from: rel, reason: 'not-cover' });
          continue;
        }
        const s = normSlotOf(f.name, sub.name);
        if (!s) {
          actions.push({ type: 'skip', from: rel, reason: 'unknown' });
          continue;
        }
        const rom = matchRomStem(s.stem, romStems);
        if (!rom) {
          actions.push({ type: 'skip', from: rel, reason: 'no-rom' });
          continue;
        }
        const key = `${rom}|${s.slot}`;
        const list = best.get(key) || [];
        list.push({ rel, ext: extOf(f.name), priority: s.priority, file: f });
        best.set(key, list);
      }
    }
  }
  for (const [key, list] of best) {
    const [rom, slot] = key.split('|') as [string, NormSlot];
    list.sort((a, b) => a.priority - b.priority || a.rel.localeCompare(b.rel));
    const [first, ...rest] = list;
    const to = normTargetPath(slot, rom, first.ext);
    const existing = await getPath(dir, to);
    const firstBlob = await first.file.getFile();
    if (existing) {
      const same = await sameBytes(firstBlob, await existing.getFile());
      actions.push(same ? { type: 'duplicate', from: first.rel, to, slot } : { type: 'conflict', from: first.rel, to, slot });
    } else {
      const renamed = stemOf(first.rel.split('/').pop()!).toLowerCase() !== stemOf(to.split('/').pop()!).toLowerCase();
      actions.push({ type: 'move', from: first.rel, to, slot, renamed });
    }
    for (const r of rest) {
      const same = await sameBytes(firstBlob, await r.file.getFile());
      actions.push(same ? { type: 'duplicate', from: r.rel, to, slot } : { type: 'skip', from: r.rel, reason: 'extra' });
    }
  }
  return { path, dir, actions };
}

/**
 * Папки консолей с media/ внутри выбранной папки (она сама, её подпапки и подпапки roms/).
 * Console folders with media/ inside the chosen folder (itself, its subfolders and roms/*).
 */
export async function findConsoleDirsWithMedia(root: NormDir, maxDepth = 2): Promise<Array<{ dir: NormDir; path: string }>> {
  const out: Array<{ dir: NormDir; path: string }> = [];
  const visit = async (d: NormDir, path: string, depth: number) => {
    let hasMedia = false;
    const subs: NormDir[] = [];
    for await (const e of d.values()) {
      if (e.kind !== 'directory' || e.name.startsWith('.')) continue;
      const low = e.name.toLowerCase();
      if (MEDIA_CONTAINER_DIRS.has(low)) hasMedia = true;
      else if (!LAYOUT_DIRS.has(low) && !low.startsWith('_')) subs.push(e);
    }
    if (hasMedia) out.push({ dir: d, path });
    if (depth >= maxDepth) return;
    for (const s of subs) await visit(s, path ? `${path}/${s.name}` : s.name, depth + 1);
  };
  await visit(root, '', 0);
  return out;
}

const escXml = (s: string) => s.replace(/&/g, '&amp;').replace(/'/g, '&apos;');

/** Заменяет пути медиа в тексте gamelist.xml. / Replaces media paths in gamelist.xml text. */
export function rewriteGamelistPaths(xml: string, moves: Array<{ from: string; to: string }>): string {
  let out = xml;
  for (const { from, to } of moves) {
    for (const [a, b] of [
      [from, to],
      [escXml(from), escXml(to)],
    ]) {
      for (const prefix of ['./', '']) {
        out = out.split(`>${prefix}${a}<`).join(`>./${b}<`);
      }
    }
  }
  return out;
}

export interface ApplyResult {
  moved: number;
  deleted: number;
  failed: number;
}

async function ensureDir(dir: NormDir, rel: string): Promise<NormDir> {
  let d = dir;
  for (const p of rel.split('/')) d = await d.getDirectoryHandle(p, { create: true });
  return d;
}

/**
 * Применяет план: перенос (копия + удаление), удаление дублей (если deleteDuplicates),
 * правка gamelist.xml и удаление опустевших папок media/*.
 * Applies a plan: move (copy + delete), duplicate deletion (when deleteDuplicates),
 * gamelist.xml update and removal of emptied media/* folders.
 */
export async function applyConsolePlan(plan: ConsoleNormPlan, opts: { deleteDuplicates: boolean }): Promise<ApplyResult> {
  const { dir } = plan;
  const res: ApplyResult = { moved: 0, deleted: 0, failed: 0 };
  const rewrites: Array<{ from: string; to: string }> = [];
  const removeFile = async (rel: string) => {
    const parts = rel.split('/');
    const name = parts.pop()!;
    let d = dir;
    for (const p of parts) d = await d.getDirectoryHandle(p);
    await d.removeEntry(name);
  };
  for (const a of plan.actions) {
    try {
      if (a.type === 'move') {
        const src = await getPath(dir, a.from);
        if (!src) throw new Error('missing');
        const blob = await src.getFile();
        const parts = a.to.split('/');
        const name = parts.pop()!;
        const target = await ensureDir(dir, parts.join('/'));
        const fh = await target.getFileHandle(name, { create: true });
        const w = await fh.createWritable();
        await w.write(blob);
        await w.close();
        await removeFile(a.from);
        rewrites.push({ from: a.from, to: a.to });
        res.moved++;
      } else if (a.type === 'duplicate' && opts.deleteDuplicates) {
        await removeFile(a.from);
        rewrites.push({ from: a.from, to: a.to });
        res.deleted++;
      }
    } catch {
      res.failed++;
    }
  }
  if (rewrites.length) {
    try {
      const gl = await dir.getFileHandle('gamelist.xml');
      const text = await (await gl.getFile()).text();
      const next = rewriteGamelistPaths(text, rewrites);
      if (next !== text) {
        const w = await gl.createWritable();
        await w.write(next);
        await w.close();
      }
    } catch {}
  }
  // Опустевшие папки media/<вид> и сама media/. / Emptied media/<kind> folders and media/ itself.
  try {
    const containers: NormDir[] = [];
    for await (const c of dir.values()) {
      if (c.kind === 'directory' && MEDIA_CONTAINER_DIRS.has(c.name.toLowerCase())) containers.push(c);
    }
    for (const c of containers) {
      const subs: NormDir[] = [];
      for await (const s of c.values()) if (s.kind === 'directory') subs.push(s);
      for (const s of subs) {
        let empty = true;
        for await (const _ of s.values()) {
          empty = false;
          break;
        }
        if (empty) await c.removeEntry(s.name).catch(() => {});
      }
      let empty = true;
      for await (const _ of c.values()) {
        empty = false;
        break;
      }
      if (empty) await dir.removeEntry(c.name).catch(() => {});
    }
  } catch {}
  return res;
}
