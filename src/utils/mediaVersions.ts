// Версии медиа рома (V1, V2…) и оценка, какая картинка подходит лучше.
//
// Раньше скраппер писал одну картинку на слот и больше её не трогал: если первой нашлась
// неподходящая (например, боксарт PSX-игры в оформлении Genesis), она оставалась навсегда.
// Теперь каждая найденная картинка сохраняется как версия, получает оценку соответствия,
// а основной файл (images/<имя>-image.png и т.д.) — это копия выбранной версии.
//
// Хранение, рядом с ромами консоли:
//   <папка консоли>/.aegis-media/versions.json            — манифест
//   <папка консоли>/.aegis-media/<имя рома>/image-v2.png   — файлы версий
// Папка с точкой: EmulationStation, сборки и поиск медиа её не видят.
//
// Правила:
// - Выбор пользователя (pinned) автоматика не меняет никогда. Новые версии только добавляются.
// - Автозамена — только если новая версия лучше текущей на AUTO_REPLACE_MARGIN баллов.
//   У картинки, которая уже стояла до версий, есть «презумпция» (EXISTING_PRIOR ≈ сумме баллов за
//   систему, имя и регион, которых у неё не узнать): её меняем,
//   только если у неё есть явный недостаток (чужие пропорции, мелкий размер, другой регион).
// - Одинаковые файлы (по CRC32 и размеру) второй раз не сохраняются.
// - На слот хранится не больше MAX_VERSIONS версий; лишние — с худшей оценкой, кроме текущей.
//
// Media versions of a ROM (V1, V2…) and a score of how well an image fits.
// Every found image is kept as a version with a fit score; the main file is a copy of the
// chosen version. Storage: <console>/.aegis-media/versions.json and
// <console>/.aegis-media/<rom stem>/<slot>-vN.<ext>. A user's choice (pinned) is never changed
// by automation. Auto-replace needs a margin of AUTO_REPLACE_MARGIN points; an image that was
// there before versions gets EXISTING_PRIOR, so it is replaced only when it has a clear defect.
//
// Модуль без зависимостей от React, тесты: `npm test`. / No React; tests: `npm test`.

import { computeCRC32Hex } from './crc32.ts';
import { imageSizeFromBytes } from './mediaKinds.ts';

export type VersionSlot = 'image' | 'thumb' | 'marquee';
export const VERSION_SLOTS: readonly VersionSlot[] = ['image', 'thumb', 'marquee'];

export type VersionSource =
  | 'existing'
  | 'libretro'
  | 'libretro-fuzzy'
  | 'screenscraper'
  | 'local'
  | 'user';

export const VERSIONS_DIR = '.aegis-media';
export const MANIFEST_NAME = 'versions.json';
export const MAX_VERSIONS = 6;
export const AUTO_REPLACE_MARGIN = 20;
export const EXISTING_PRIOR = 65;
export const REJECT_SCORE = -1000;

export interface MediaVersion {
  id: string; // v1, v2…
  file: string; // путь внутри .aegis-media / path inside .aegis-media
  source: VersionSource;
  score: number;
  reasons: string[]; // коды причин, см. scoreMediaCandidate / reason codes
  w?: number;
  h?: number;
  bytes: number;
  crc: string;
  matchedName?: string;
  system?: string;
  addedAt: number;
}

export interface SlotVersions {
  active: string;
  pinned: boolean;
  versions: MediaVersion[];
  /** Сколько версий добавлено после последнего выбора пользователя. / Versions added since the user's last choice. */
  unseen?: number;
}

export interface MediaVersionsManifest {
  v: 1;
  items: Record<string, Partial<Record<VersionSlot, SlotVersions>>>;
}

export function emptyManifest(): MediaVersionsManifest {
  return { v: 1, items: {} };
}

export function parseManifest(text: string | null | undefined): MediaVersionsManifest {
  if (!text) return emptyManifest();
  try {
    const raw = JSON.parse(text);
    if (!raw || typeof raw !== 'object' || typeof raw.items !== 'object' || !raw.items) return emptyManifest();
    const out = emptyManifest();
    for (const [stem, slots] of Object.entries(raw.items as Record<string, any>)) {
      if (!slots || typeof slots !== 'object') continue;
      const entry: Partial<Record<VersionSlot, SlotVersions>> = {};
      for (const slot of VERSION_SLOTS) {
        const s = slots[slot];
        if (!s || !Array.isArray(s.versions)) continue;
        const versions = s.versions.filter(
          (v: any) => v && typeof v.id === 'string' && typeof v.file === 'string' && !/(^|[\\/])\.\.([\\/]|$)/.test(v.file)
        );
        if (!versions.length) continue;
        const active = versions.some((v: MediaVersion) => v.id === s.active) ? s.active : versions[0].id;
        entry[slot] = {
          active,
          pinned: Boolean(s.pinned),
          versions: versions.map((v: any) => ({
            ...v,
            score: Number(v.score) || 0,
            reasons: Array.isArray(v.reasons) ? v.reasons.map(String) : [],
            bytes: Number(v.bytes) || 0,
            crc: String(v.crc || ''),
            addedAt: Number(v.addedAt) || 0,
          })),
          unseen: Number(s.unseen) || 0,
        };
      }
      if (Object.keys(entry).length) out.items[stem] = entry;
    }
    return out;
  } catch {
    return emptyManifest();
  }
}

// ---------------------------------------------------------------------------
// Оценка соответствия / Fit score

/**
 * Ожидаемые пропорции обложки (высота / ширина) по консолям. Приблизительные, по типовой
 * коробке региона USA/EU: CD jewel case почти квадратный, клемшелл Genesis и DVD-бокс вытянуты
 * вверх. Консоли, где коробки сильно разные по регионам (SNES, N64, Famicom), не проверяем.
 * Expected box art height/width per console. Approximate, typical USA/EU boxes. Consoles whose
 * boxes differ a lot by region (SNES, N64, Famicom) are not checked.
 */
export const BOXART_RATIO: Record<string, number[]> = {
  psx: [1.0],
  dreamcast: [1.0],
  gb: [1.0],
  gbc: [1.0],
  gba: [1.0],
  nes: [1.37],
  genesis: [1.4],
  mastersystem: [1.4],
  ps2: [1.4],
  gc: [1.4],
  wii: [1.4],
  xbox: [1.4],
};

export interface RomContext {
  consoleCode: string;
  /** Система Libretro консоли рома, например «Sony - PlayStation». / The ROM's Libretro system. */
  system?: string;
  region?: string;
  cleanTitle?: string;
  fileStem?: string;
}

export interface CandidateMeta {
  source: VersionSource;
  /** Система, из которой картинка (папка Libretro, папка Skraper). / System the image came from. */
  system?: string;
  /** Имя найденной картинки без расширения. / Matched image name without extension. */
  matchedName?: string;
  w?: number;
  h?: number;
  bytes?: number;
}

export interface ScoreResult {
  score: number;
  reasons: string[];
}

const normSystem = (s?: string) =>
  String(s || '')
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const normName = (s?: string) =>
  String(s || '')
    .toLowerCase()
    .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
    .replace(/[^a-z0-9а-яё]+/gi, '');

const REGION_WORDS: Array<[RegExp, string]> = [
  [/\b(usa|us|america)\b/i, 'usa'],
  [/\b(europe|eu|pal|uk|germany|france|spain|italy)\b/i, 'europe'],
  [/\b(japan|jp|jpn)\b/i, 'japan'],
  [/\b(world)\b/i, 'world'],
  [/\b(russia|ru)\b/i, 'russia'],
];

/** Регион по тегам в скобках имени или по строке региона. / Region from name tags or a region string. */
export function regionOf(s?: string): string {
  const str = String(s || '');
  const tags = str.match(/\(([^)]*)\)/g);
  const hay = tags ? tags.join(' ') : str;
  for (const [re, r] of REGION_WORDS) if (re.test(hay)) return r;
  return '';
}

/**
 * Оценка картинки для слота рома. Причины — коды для интерфейса (mv.reason.*).
 * Score of an image for a ROM slot. Reasons are codes for the UI (mv.reason.*).
 */
export function scoreMediaCandidate(slot: VersionSlot, rom: RomContext, c: CandidateMeta): ScoreResult {
  const reasons: string[] = [];
  let score = 0;

  switch (c.source) {
    case 'existing':
      score += EXISTING_PRIOR;
      reasons.push('existing');
      break;
    case 'user':
      score += EXISTING_PRIOR;
      reasons.push('user');
      break;
    case 'libretro-fuzzy':
      score -= 10;
      reasons.push('fuzzy');
      break;
    default:
      score += 5;
  }

  // Система / System
  if (c.system && rom.system) {
    if (normSystem(c.system) === normSystem(rom.system)) {
      score += 30;
      reasons.push('system-match');
    } else {
      score -= 50;
      reasons.push('system-mismatch');
    }
  }

  // Название / Title
  if (c.matchedName) {
    const m = c.matchedName.trim().toLowerCase();
    if (rom.fileStem && m === rom.fileStem.trim().toLowerCase()) {
      score += 25;
      reasons.push('name-exact');
    } else if (rom.cleanTitle && normName(m) === normName(rom.cleanTitle)) {
      score += 15;
      reasons.push('title-match');
    }
  }

  // Регион / Region
  const romRegion = regionOf(rom.region) || regionOf(rom.fileStem);
  const candRegion = regionOf(c.matchedName);
  if (romRegion && candRegion && candRegion !== 'world') {
    if (romRegion === candRegion) {
      score += 10;
      reasons.push('region-match');
    } else {
      score -= 10;
      reasons.push('region-mismatch');
    }
  }

  // Пропорции обложки / Box art proportions
  if (slot === 'image' && c.w && c.h) {
    const expected = BOXART_RATIO[String(rom.consoleCode || '').toLowerCase()];
    if (expected && expected.length) {
      const ratio = c.h / c.w;
      const dev = Math.min(...expected.map((e) => Math.abs(Math.log(ratio / e))));
      if (dev <= 0.1) {
        score += 15;
        reasons.push('ratio-ok');
      } else if (dev <= 0.2) {
        score += 5;
        reasons.push('ratio-close');
      } else if (dev > 0.3) {
        score -= 25;
        reasons.push('ratio-wrong');
      }
    }
  }

  // Размер / Resolution
  if (c.w && c.h) {
    const long = Math.max(c.w, c.h);
    if (long >= 500) {
      score += 5;
      reasons.push('res-high');
    } else if (long < 200) {
      score -= 10;
      reasons.push('res-low');
    }
  }

  return { score, reasons };
}

/** Система Libretro из ссылки на картинку. / Libretro system from an image URL. */
export function systemFromMediaUrl(url?: string): string | undefined {
  if (!url) return undefined;
  let u = url;
  try {
    u = decodeURIComponent(url);
  } catch {}
  let m = u.match(/libretro-thumbnails\/([^/]+)\//i);
  if (m) return m[1].replace(/_/g, ' ');
  m = u.match(/thumbnails\.libretro\.com\/([^/]+)\//i);
  if (m) return m[1];
  return undefined;
}

/** Имя файла картинки из ссылки, без расширения. / Image file name from a URL, without extension. */
export function nameFromMediaUrl(url?: string): string | undefined {
  if (!url) return undefined;
  let u = url.split('?')[0];
  try {
    u = decodeURIComponent(u);
  } catch {}
  const file = u.split('/').pop() || '';
  const stem = file.replace(/\.[^.]+$/, '');
  return stem || undefined;
}

// ---------------------------------------------------------------------------
// Решения по манифесту (чистые функции) / Manifest decisions (pure)

export function slotEntry(m: MediaVersionsManifest, stem: string, slot: VersionSlot): SlotVersions | undefined {
  return m.items[stem]?.[slot];
}

export function activeVersion(e: SlotVersions | undefined): MediaVersion | undefined {
  if (!e) return undefined;
  return e.versions.find((v) => v.id === e.active) || e.versions[0];
}

export function nextVersionId(e: SlotVersions | undefined): string {
  let max = 0;
  for (const v of e?.versions || []) {
    const n = Number(v.id.replace(/^v/i, ''));
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `v${max + 1}`;
}

export interface AddDecision {
  /** Такая картинка уже есть. / The same image is already stored. */
  duplicateOf?: string;
  /** Новая версия становится основной. / The new version becomes the main one. */
  makeActive: boolean;
  /** Версии, которые надо удалить, чтобы не превысить лимит. / Versions to drop to stay within the limit. */
  evict: string[];
}

/**
 * Что делать с новой версией. Первая версия слота всегда основная. Выбор пользователя не трогаем.
 * What to do with a new version. The first version of a slot is always active. A user's pick stays.
 */
export function decideAdd(e: SlotVersions | undefined, cand: { crc: string; bytes: number; score: number }): AddDecision {
  const dup = e?.versions.find((v) => v.crc === cand.crc && v.bytes === cand.bytes);
  if (dup) return { duplicateOf: dup.id, makeActive: false, evict: [] };
  if (!e || e.versions.length === 0) return { makeActive: cand.score > REJECT_SCORE, evict: [] };
  const cur = activeVersion(e);
  const makeActive = !e.pinned && cand.score > REJECT_SCORE && (!cur || cand.score >= cur.score + AUTO_REPLACE_MARGIN);
  const evict: string[] = [];
  const total = e.versions.length + 1;
  if (total > MAX_VERSIONS) {
    const keep = new Set([e.active]);
    const pool = e.versions
      .filter((v) => !keep.has(v.id))
      .sort((a, b) => a.score - b.score || a.addedAt - b.addedAt);
    let extra = total - MAX_VERSIONS;
    for (const v of pool) {
      if (extra <= 0) break;
      evict.push(v.id);
      extra--;
    }
  }
  return { makeActive, evict };
}

/** Байты → CRC, размер, пропорции. / Bytes → CRC, size, dimensions. */
export function describeBytes(buf: ArrayBuffer | Uint8Array): { crc: string; bytes: number; w?: number; h?: number } {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const size = imageSizeFromBytes(u8.subarray(0, Math.min(u8.length, 65536)));
  return { crc: computeCRC32Hex(u8), bytes: u8.length, w: size?.w || undefined, h: size?.h || undefined };
}

export function extOfBytes(buf: ArrayBuffer | Uint8Array): string {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  if (b[0] === 0x89 && b[1] === 0x50) return '.png';
  if (b[0] === 0xff && b[1] === 0xd8) return '.jpg';
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46) return '.webp';
  if (b[0] === 0x47 && b[1] === 0x49) return '.gif';
  if (b[0] === 0x42 && b[1] === 0x4d) return '.bmp';
  return '.png';
}

/** Имя папки рома внутри .aegis-media. / The ROM's folder name inside .aegis-media. */
export function safeStemDir(stem: string): string {
  return String(stem || 'game').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/^\.+/, '_').trim() || 'game';
}

// ---------------------------------------------------------------------------
// Работа с папкой (FileSystemDirectoryHandle или NativeDirectoryHandle)
// Folder operations (FileSystemDirectoryHandle or NativeDirectoryHandle)

/** Где лежит основной файл слота и какие имена проверять. / Where the slot's main file lives. */
export const PRIMARY_LOCATIONS: Record<VersionSlot, { folder: string; suffixes: string[] }> = {
  image: { folder: 'images', suffixes: ['-image.png', '-image.jpg', '.png', '.jpg'] },
  thumb: { folder: 'images', suffixes: ['-thumb.png', '-thumb.jpg'] },
  marquee: { folder: 'marquees', suffixes: ['-marquee.png', '-marquee.jpg', '.png'] },
};

async function readText(dir: any, name: string): Promise<string | null> {
  try {
    const fh = await dir.getFileHandle(name);
    return await (await fh.getFile()).text();
  } catch {
    return null;
  }
}

async function writeBytes(dir: any, name: string, data: ArrayBuffer | Uint8Array | string): Promise<void> {
  const fh = await dir.getFileHandle(name, { create: true });
  const w = await fh.createWritable();
  await w.write(data);
  await w.close();
}

async function versionsDir(consoleDir: any, create: boolean): Promise<any | null> {
  try {
    return await consoleDir.getDirectoryHandle(VERSIONS_DIR, create ? { create: true } : undefined);
  } catch {
    return null;
  }
}

export async function loadManifest(consoleDir: any): Promise<MediaVersionsManifest> {
  const vd = await versionsDir(consoleDir, false);
  if (!vd) return emptyManifest();
  return parseManifest(await readText(vd, MANIFEST_NAME));
}

export async function saveManifest(consoleDir: any, m: MediaVersionsManifest): Promise<void> {
  const vd = await versionsDir(consoleDir, true);
  if (!vd) return;
  await writeBytes(vd, MANIFEST_NAME, JSON.stringify(m, null, 1));
}

/** Основной файл слота: {dir, name} или null. / The slot's main file, or null. */
export async function findPrimaryFile(consoleDir: any, stem: string, slot: VersionSlot): Promise<{ dir: any; name: string } | null> {
  const loc = PRIMARY_LOCATIONS[slot];
  let dir: any;
  try {
    dir = await consoleDir.getDirectoryHandle(loc.folder);
  } catch {
    return null;
  }
  for (const sfx of loc.suffixes) {
    try {
      const name = `${stem}${sfx}`;
      const fh = await dir.getFileHandle(name);
      const f = await fh.getFile();
      if (f.size > 0) return { dir, name };
    } catch {}
  }
  return null;
}

/** Файл версии. / A version's file. */
export async function readVersionFile(consoleDir: any, v: MediaVersion): Promise<File | null> {
  const vd = await versionsDir(consoleDir, false);
  if (!vd) return null;
  const parts = v.file.split('/').filter(Boolean);
  try {
    let d = vd;
    for (const p of parts.slice(0, -1)) d = await d.getDirectoryHandle(p);
    return await (await d.getFileHandle(parts[parts.length - 1])).getFile();
  } catch {
    return null;
  }
}

async function storeVersionBytes(consoleDir: any, stem: string, slot: VersionSlot, id: string, buf: ArrayBuffer): Promise<string> {
  const vd = await versionsDir(consoleDir, true);
  const sub = safeStemDir(stem);
  const d = await vd.getDirectoryHandle(sub, { create: true });
  const name = `${slot}-${id}${extOfBytes(buf)}`;
  await writeBytes(d, name, buf);
  return `${sub}/${name}`;
}

async function removeVersionFile(consoleDir: any, v: MediaVersion): Promise<void> {
  const vd = await versionsDir(consoleDir, false);
  if (!vd) return;
  const parts = v.file.split('/').filter(Boolean);
  try {
    let d = vd;
    for (const p of parts.slice(0, -1)) d = await d.getDirectoryHandle(p);
    await d.removeEntry(parts[parts.length - 1]);
  } catch {}
}

async function writePrimary(consoleDir: any, stem: string, slot: VersionSlot, buf: ArrayBuffer): Promise<void> {
  const existing = await findPrimaryFile(consoleDir, stem, slot);
  if (existing) {
    // Имя оставляем прежним: на него может ссылаться gamelist.xml.
    // The name stays: gamelist.xml may point at it.
    await writeBytes(existing.dir, existing.name, buf);
    return;
  }
  const loc = PRIMARY_LOCATIONS[slot];
  const dir = await consoleDir.getDirectoryHandle(loc.folder, { create: true });
  await writeBytes(dir, `${stem}${loc.suffixes[0]}`, buf);
}

/**
 * Если у слота ещё нет версий, а основной файл есть — он становится V1 («было до версий»).
 * When a slot has no versions yet but has a main file, that file becomes V1 ("existing").
 */
async function ensureExistingRegistered(
  consoleDir: any,
  m: MediaVersionsManifest,
  stem: string,
  slot: VersionSlot,
  rom: RomContext
): Promise<void> {
  if (slotEntry(m, stem, slot)?.versions.length) return;
  const primary = await findPrimaryFile(consoleDir, stem, slot);
  if (!primary) return;
  let buf: ArrayBuffer;
  try {
    buf = await (await (await primary.dir.getFileHandle(primary.name)).getFile()).arrayBuffer();
  } catch {
    return;
  }
  const d = describeBytes(buf);
  const sc = scoreMediaCandidate(slot, rom, { source: 'existing', w: d.w, h: d.h, bytes: d.bytes });
  const file = await storeVersionBytes(consoleDir, stem, slot, 'v1', buf);
  const v: MediaVersion = { id: 'v1', file, source: 'existing', score: sc.score, reasons: sc.reasons, ...d, addedAt: Date.now(), matchedName: primary.name };
  m.items[stem] = { ...(m.items[stem] || {}), [slot]: { active: 'v1', pinned: false, versions: [v], unseen: 0 } };
}

export interface OfferResult {
  added: boolean;
  /** Основной файл заменён другой версией. / The main file was replaced by another version. */
  replaced: boolean;
  duplicate: boolean;
  /** Основной файл записан этой картинкой (новой или первой). / The main file now holds this image. */
  active: boolean;
  id?: string;
}

/**
 * Предложить новую картинку для слота: сохраняет версию, при явном преимуществе делает её
 * основной (переписывает основной файл). Манифест меняется в памяти; сохранить — saveManifest.
 * Offer a new image for a slot: stores a version and, when clearly better, makes it the main
 * file. The manifest changes in memory; call saveManifest afterwards.
 */
export async function offerMediaVersion(
  consoleDir: any,
  m: MediaVersionsManifest,
  stem: string,
  slot: VersionSlot,
  buf: ArrayBuffer,
  meta: CandidateMeta,
  rom: RomContext,
  opts: { primaryValid?: boolean } = {}
): Promise<OfferResult> {
  // Основной файл — заглушка или его нет: его не храним как версию, новая картинка встаёт сразу.
  // The main file is a stub or missing: it is not kept as a version, the new image goes in at once.
  const primaryValid = opts.primaryValid !== false;
  if (primaryValid) {
    await ensureExistingRegistered(consoleDir, m, stem, slot, rom);
    // Рабочий файл есть, но не под нашим именем (например, путь из gamelist.xml): сравнить не с чем,
    // ничего не трогаем. / A working file under another name (gamelist.xml path): nothing to compare.
    if (!slotEntry(m, stem, slot)?.versions.length) return { added: false, replaced: false, duplicate: false, active: false };
  }
  const d = describeBytes(buf);
  const sc = scoreMediaCandidate(slot, rom, { ...meta, w: d.w, h: d.h, bytes: d.bytes });
  const e = slotEntry(m, stem, slot);
  const dec = decideAdd(e, { crc: d.crc, bytes: d.bytes, score: sc.score });
  if (dec.duplicateOf) {
    if (!primaryValid && e) {
      await writePrimary(consoleDir, stem, slot, buf);
      m.items[stem] = { ...(m.items[stem] || {}), [slot]: { ...e, active: dec.duplicateOf, pinned: false } };
      return { added: false, replaced: true, duplicate: true, active: true, id: dec.duplicateOf };
    }
    return { added: false, replaced: false, duplicate: true, active: false, id: dec.duplicateOf };
  }
  if (!primaryValid && sc.score > REJECT_SCORE) dec.makeActive = true;

  // Новая версия хуже всех при полном списке — не сохраняем. / Worst of a full list: not stored.
  if (e && e.versions.length >= MAX_VERSIONS && !dec.makeActive) {
    const worst = Math.min(...e.versions.filter((v) => v.id !== e.active).map((v) => v.score));
    if (sc.score <= worst) return { added: false, replaced: false, duplicate: false, active: false };
  }

  const id = nextVersionId(e);
  const file = await storeVersionBytes(consoleDir, stem, slot, id, buf);
  const v: MediaVersion = {
    id,
    file,
    source: meta.source,
    score: sc.score,
    reasons: sc.reasons,
    ...d,
    matchedName: meta.matchedName,
    system: meta.system,
    addedAt: Date.now(),
  };
  const next: SlotVersions = e
    ? { ...e, versions: [...e.versions], unseen: (e.unseen || 0) + 1 }
    : { active: id, pinned: false, versions: [], unseen: 0 };
  next.versions.push(v);
  for (const drop of dec.evict) {
    const dv = next.versions.find((x) => x.id === drop);
    if (dv) await removeVersionFile(consoleDir, dv);
    next.versions = next.versions.filter((x) => x.id !== drop);
  }
  if (dec.makeActive) {
    await writePrimary(consoleDir, stem, slot, buf);
    next.active = id;
    if (!primaryValid) next.pinned = false;
  }
  m.items[stem] = { ...(m.items[stem] || {}), [slot]: next };
  return { added: true, replaced: dec.makeActive && Boolean(e), duplicate: false, active: dec.makeActive, id };
}

/**
 * Выбор пользователя: версия становится основной и закрепляется (pinned).
 * id = null — снять закрепление и вернуть лучшую по оценке.
 * A user's pick: the version becomes the main file and is pinned. id = null unpins and
 * returns to the best-scored one.
 */
export async function selectMediaVersion(
  consoleDir: any,
  stem: string,
  slot: VersionSlot,
  id: string | null
): Promise<{ manifest: MediaVersionsManifest; file: File | null }> {
  const m = await loadManifest(consoleDir);
  const e = slotEntry(m, stem, slot);
  if (!e) return { manifest: m, file: null };
  const target = id ? e.versions.find((v) => v.id === id) : [...e.versions].sort((a, b) => b.score - a.score)[0];
  if (!target) return { manifest: m, file: null };
  const f = await readVersionFile(consoleDir, target);
  if (!f) return { manifest: m, file: null };
  await writePrimary(consoleDir, stem, slot, await f.arrayBuffer());
  m.items[stem] = { ...(m.items[stem] || {}), [slot]: { ...e, active: target.id, pinned: Boolean(id), unseen: 0 } };
  await saveManifest(consoleDir, m);
  return { manifest: m, file: f };
}

/**
 * Версии едут за ромом при переименовании и переносе. / Versions follow a ROM on rename and move.
 */
export async function carryMediaVersions(srcConsoleDir: any, destConsoleDir: any, oldStem: string, newStem: string): Promise<boolean> {
  if (!srcConsoleDir || !destConsoleDir || !oldStem || !newStem) return false;
  const src = await loadManifest(srcConsoleDir);
  const entry = src.items[oldStem];
  if (!entry) return false;
  const same = srcConsoleDir === destConsoleDir || (await srcConsoleDir.isSameEntry?.(destConsoleDir).catch(() => false));
  if (same && oldStem === newStem) return false;
  const dest = same ? src : await loadManifest(destConsoleDir);
  const moved: Partial<Record<VersionSlot, SlotVersions>> = {};
  for (const slot of VERSION_SLOTS) {
    const e = entry[slot];
    if (!e) continue;
    const versions: MediaVersion[] = [];
    for (const v of e.versions) {
      const f = await readVersionFile(srcConsoleDir, v);
      if (!f) continue;
      const file = await storeVersionBytes(destConsoleDir, newStem, slot, v.id, await f.arrayBuffer());
      versions.push({ ...v, file });
      if (file.toLowerCase() !== v.file.toLowerCase() || !same) await removeVersionFile(srcConsoleDir, v);
    }
    if (versions.length) moved[slot] = { ...e, versions };
  }
  delete src.items[oldStem];
  dest.items[newStem] = moved;
  if (!same) await saveManifest(srcConsoleDir, src);
  await saveManifest(destConsoleDir, dest);
  try {
    // Регистр не сравниваем: на Windows «game» и «Game» — одна папка.
    // Case-insensitive: on Windows "game" and "Game" are the same folder.
    if (safeStemDir(oldStem).toLowerCase() !== safeStemDir(newStem).toLowerCase() || !same) {
      const vd = await versionsDir(srcConsoleDir, false);
      await vd?.removeEntry(safeStemDir(oldStem), { recursive: true });
    }
  } catch {}
  return true;
}
