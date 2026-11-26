// «Упорядочить медиа»: файлы Skraper из <консоль>/media/<вид>/ переезжают в раскладку проекта
// (см. src/utils/gameMediaKinds.ts: images/<ром>-image, -thumb, -fanart, -map, -cartridge…,
// marquees/<ром>-marquee, videos/<ром>-video, manuals/<ром>.pdf), получают имя рома, пути в
// gamelist.xml обновляются. Одинаковые копии (байт в байт) можно удалить. Сначала строится план,
// применяется он отдельно. Обе стадии сообщают прогресс и останавливаются по AbortSignal.
//
// "Tidy media": Skraper files from <console>/media/<kind>/ move into the project layout (see
// gameMediaKinds.ts), get the ROM's name, gamelist.xml paths are updated. Identical copies (byte
// for byte) can be deleted. A plan is built first and applied separately. Both stages report
// progress and stop on an AbortSignal.
//
// Модуль без импортов приложения, чтобы тесты шли через `node --test`.
// No app imports, so tests run with `node --test`.

import { MEDIA_CONTAINER_DIRS } from './skraperMedia.ts';
import {
  GAME_MEDIA_DIR_KIND,
  classifyGameMediaFile,
  extOfName,
  gameMediaTargetPath,
  type GameMediaKind,
} from './gameMediaKinds.ts';

export type NormSlot = GameMediaKind;

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

/** Прогресс: сделано из всего и что сейчас. / Progress: done of total and the current item. */
export type NormProgress = (p: { done: number; total: number; current?: string }) => void;

export interface NormRunOptions {
  signal?: AbortSignal;
  onProgress?: NormProgress;
}

export class NormAbortedError extends Error {
  constructor() {
    super('aborted');
    this.name = 'AbortError';
  }
}

const checkAbort = (signal?: AbortSignal) => {
  if (signal?.aborted) throw new NormAbortedError();
};

/** Отдать управление интерфейсу. / Let the UI breathe. */
const yieldToUi = () => new Promise<void>((r) => setTimeout(r, 0));

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.gif']);
const VIDEO_EXT = new Set(['.mp4', '.webm', '.mkv', '.avi', '.mov', '.m4v']);
const NON_ROM_EXT = new Set([
  ...IMAGE_EXT,
  ...VIDEO_EXT,
  '.pdf', '.xml', '.txt', '.json', '.nfo', '.md', '.ini', '.cfg', '.db', '.dat', '.log',
  '.srm', '.sav', '.state', '.auto', '.rtc', '.mcr', '.ips', '.bps', '.ups', '.xdelta', '.sh',
]);
const LAYOUT_DIRS = new Set(['images', 'marquees', 'videos', 'manuals', 'patch', 'hackroms', 'saves', 'states']);

const extOf = extOfName;
const stemOf = (name: string) => name.replace(/\.[^/.]+$/, '');

/**
 * Основной слот вида и приоритет в нём (меньше — лучше). Микс, 3D-коробка, титульный экран и
 * маркиза — запасные варианты обложки, скриншота и логотипа: если основной вид есть, они
 * переносятся под своим именем (-mix, -box3d, -title, -screenmarquee).
 * The primary slot of a kind and its priority (lower wins). Mix, 3D box, title screen and
 * marquee stand in for the cover, screenshot and logo; when the main kind exists they move
 * under their own name.
 */
const PRIMARY_SLOT: Partial<Record<GameMediaKind, [GameMediaKind, number]>> = {
  boxart: ['boxart', 0],
  image: ['boxart', 3],
  box3d: ['boxart', 5],
  snap: ['snap', 0],
  title: ['snap', 2],
  marquee: ['marquee', 0],
  screenmarquee: ['marquee', 3],
};

/** Внутри вида: какая папка лучше. / Within a kind: which folder is better. */
const DIR_PRIORITY: Record<string, number> = {
  covers: 1,
  cover: 1,
  named_boxarts: 1,
  thumbnails: 2,
  wheel: 1,
  wheels: 1,
  wheelhd: 1,
  'wheel-hd': 1,
  logos: 1,
  named_logos: 1,
  wheelcarbon: 2,
  'wheel-carbon': 2,
  wheelsteel: 2,
  'wheel-steel': 2,
};

/** Слот файла из media/<папка>/; null — не переносим. / Slot of a media/<folder>/ file; null: not moved. */
export function normSlotOf(
  fileName: string,
  dirName: string
): { slot: NormSlot; own: NormSlot; priority: number; stem: string } | null {
  // Файлы плана всегда из media/<папка>/. / Plan files always come from media/<folder>/.
  const c = classifyGameMediaFile(fileName, `media/${dirName}`);
  if (!c) return null;
  const [slot, base] = PRIMARY_SLOT[c.kind] || [c.kind, 0];
  const priority = base + (DIR_PRIORITY[dirName.toLowerCase()] || 0) / 10;
  return { slot, own: c.kind, priority, stem: c.stem };
}

/** Целевой путь от папки консоли. / Target path from the console folder. */
export function normTargetPath(slot: NormSlot, romStem: string, ext: string): string {
  return gameMediaTargetPath(slot, romStem, ext);
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

const CMP_CHUNK = 1 << 20;

async function readBytes(b: any, start: number, end: number): Promise<Uint8Array> {
  if (typeof b.slice === 'function') return new Uint8Array(await b.slice(start, end).arrayBuffer());
  // Нативный LazyFile без slice: читаем целиком. / A native LazyFile without slice: read it whole.
  return new Uint8Array(await b.arrayBuffer()).subarray(start, end);
}

/**
 * Совпадают ли файлы байт в байт. Читает кусками по 1 МБ и отдаёт управление интерфейсу,
 * поэтому видео на сотни мегабайт не вешают окно.
 * Byte-for-byte equality, read in 1 MB chunks with UI yields, so big videos do not freeze the window.
 */
export async function sameBytes(a: Blob, b: Blob, signal?: AbortSignal): Promise<boolean> {
  if (a.size !== b.size) return false;
  for (let off = 0; off < a.size; off += CMP_CHUNK) {
    checkAbort(signal);
    const end = Math.min(a.size, off + CMP_CHUNK);
    const [u, v] = await Promise.all([readBytes(a, off, end), readBytes(b, off, end)]);
    if (u.length !== v.length) return false;
    for (let i = 0; i < u.length; i++) if (u[i] !== v[i]) return false;
    if (end < a.size) await yieldToUi();
  }
  return true;
}

/** Имена ромов в папке консоли: файлы ромов и папки многодисковых игр. / ROM names in a console folder. */
export async function listRomStems(dir: NormDir): Promise<string[]> {
  const out: string[] = [];
  for await (const e of dir.values()) {
    if (e.name.startsWith('.')) continue;
    const low = e.name.toLowerCase();
    if (e.kind === 'directory') {
      if (MEDIA_CONTAINER_DIRS.has(low) || LAYOUT_DIRS.has(low) || GAME_MEDIA_DIR_KIND[low] || low.startsWith('_')) continue;
      out.push(e.name);
    } else if (!NON_ROM_EXT.has(extOf(e.name)) && extOf(e.name)) {
      out.push(stemOf(e.name));
    }
  }
  return Array.from(new Set(out));
}

/** Сколько файлов в media/* папки консоли (для прогресса). / Files in a console's media/* (for progress). */
export async function countConsoleMediaFiles(dir: NormDir, signal?: AbortSignal): Promise<number> {
  let n = 0;
  for await (const c of dir.values()) {
    if (c.kind !== 'directory' || !MEDIA_CONTAINER_DIRS.has(c.name.toLowerCase())) continue;
    for await (const sub of c.values()) {
      if (sub.kind !== 'directory') continue;
      for await (const f of sub.values()) {
        if (f.kind === 'file') n++;
      }
      checkAbort(signal);
    }
  }
  return n;
}

/**
 * План для одной папки консоли с media/. onFile вызывается после каждого просмотренного файла.
 * The plan for one console folder with media/. onFile is called after every file looked at.
 */
export async function planConsoleMedia(
  dir: NormDir,
  path = '',
  opts: { signal?: AbortSignal; onFile?: (rel: string) => void } = {}
): Promise<ConsoleNormPlan> {
  const { signal, onFile } = opts;
  const romStems = await listRomStems(dir);
  const actions: NormAction[] = [];
  type Cand = { rel: string; ext: string; priority: number; own: NormSlot; file: NormFile; blob?: Blob };
  const groups = new Map<string, Cand[]>(); // `${rom}|${slot}` → candidates
  const push = (key: string, c: Cand) => {
    const list = groups.get(key) || [];
    list.push(c);
    groups.set(key, list);
  };
  let seen = 0;
  for await (const c of dir.values()) {
    if (c.kind !== 'directory' || !MEDIA_CONTAINER_DIRS.has(c.name.toLowerCase())) continue;
    for await (const sub of c.values()) {
      if (sub.kind !== 'directory') continue;
      for await (const f of sub.values()) {
        if (f.kind !== 'file') continue;
        checkAbort(signal);
        const rel = `${c.name}/${sub.name}/${f.name}`;
        onFile?.(rel);
        if (++seen % 200 === 0) await yieldToUi();
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
        push(`${rom}|${s.slot}`, { rel, ext: extOf(f.name), priority: s.priority, own: s.own, file: f });
      }
    }
  }

  const blobOf = async (c: Cand) => (c.blob ||= await c.file.getFile());
  // Лучший файл слота едет в цель, остальные — дубли, запасные варианты своего вида или лишние.
  // The slot's best file goes to the target; the rest are duplicates, stand-ins of their own kind, or extras.
  const settle = async (key: string, list: Cand[], second: Map<string, Cand[]> | null) => {
    const [rom, slot] = key.split('|') as [string, NormSlot];
    list.sort((a, b) => a.priority - b.priority || a.rel.localeCompare(b.rel));
    const [first, ...rest] = list;
    const to = normTargetPath(slot, rom, first.ext);
    const existing = await getPath(dir, to);
    if (existing) {
      const same = await sameBytes(await blobOf(first), await existing.getFile(), signal);
      actions.push(same ? { type: 'duplicate', from: first.rel, to, slot } : { type: 'conflict', from: first.rel, to, slot });
    } else {
      const renamed = stemOf(first.rel.split('/').pop()!).toLowerCase() !== stemOf(to.split('/').pop()!).toLowerCase();
      actions.push({ type: 'move', from: first.rel, to, slot, renamed });
    }
    for (const r of rest) {
      checkAbort(signal);
      if (await sameBytes(await blobOf(first), await blobOf(r), signal)) {
        actions.push({ type: 'duplicate', from: r.rel, to, slot });
      } else if (second && r.own !== slot) {
        const k2 = `${rom}|${r.own}`;
        const l2 = second.get(k2) || [];
        l2.push(r);
        second.set(k2, l2);
      } else {
        actions.push({ type: 'skip', from: r.rel, reason: 'extra' });
      }
    }
  };
  const second = new Map<string, Cand[]>();
  for (const [key, list] of groups) await settle(key, list, second);
  for (const [key, list] of second) await settle(key, list, null);
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
  /** Остановлено пользователем. / Stopped by the user. */
  aborted?: boolean;
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
export async function applyConsolePlan(
  plan: ConsoleNormPlan,
  opts: { deleteDuplicates: boolean; signal?: AbortSignal; onAction?: (a: NormAction) => void }
): Promise<ApplyResult> {
  const { dir } = plan;
  let aborted = false;
  const res: ApplyResult = { moved: 0, deleted: 0, failed: 0 };
  const rewrites: Array<{ from: string; to: string }> = [];
  const removeFile = async (rel: string) => {
    const parts = rel.split('/');
    const name = parts.pop()!;
    let d = dir;
    for (const p of parts) d = await d.getDirectoryHandle(p);
    await d.removeEntry(name);
  };
  let step = 0;
  for (const a of plan.actions) {
    // Остановка между файлами: gamelist.xml ниже всё равно правится под уже перенесённое.
    // Stop between files: gamelist.xml below is still updated for what was already moved.
    if (opts.signal?.aborted) {
      aborted = true;
      break;
    }
    opts.onAction?.(a);
    if (++step % 25 === 0) await yieldToUi();
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
  if (aborted) res.aborted = true;
  return res;
}
