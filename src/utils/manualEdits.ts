// Ручные правки из режима «Редактор»: название, характеристики и пути к медиа.
// Правки лежат отдельно от строк библиотеки и накладываются поверх при показе и при записи
// gamelist.xml. Поэтому новый скан, скраппер и онлайн-переименование их не затирают.
// Ключ — консоль + CRC32 (переживает переименование и перенос файла), иначе id строки.
//
// Manual edits from the Editor view: title, game info and media paths.
// Edits are stored apart from library rows and laid over them for display and when
// gamelist.xml is written, so a rescan, the scraper and online rename do not wipe them.
// The key is console + CRC32 (survives renames and moves), otherwise the row id.

export const EDIT_TEXT_FIELDS = [
  'title',
  'region',
  'genre',
  'year',
  'developer',
  'publisher',
  'players',
  'rating',
  'desc',
] as const;
export const EDIT_MEDIA_FIELDS = ['image', 'thumbnail', 'marquee', 'video'] as const;
export const EDIT_FIELDS = [...EDIT_TEXT_FIELDS, ...EDIT_MEDIA_FIELDS] as const;

export type EditTextField = (typeof EDIT_TEXT_FIELDS)[number];
export type EditMediaField = (typeof EDIT_MEDIA_FIELDS)[number];
export type EditField = (typeof EDIT_FIELDS)[number];

// Текстовое поле: строка — своё значение. Медиа: '' — медиа убрано, строка — путь или URL.
// Text field: a string is the user's value. Media: '' means removed, a string is a path or URL.
export type ManualEdit = Partial<Record<EditField, string>> & { updatedAt?: number };

// Значение в патче: строка — задать, null — вернуть автоматическое значение.
// Patch value: a string sets the field, null returns it to the automatic value.
export type ManualEditPatch = Partial<Record<EditField, string | null>>;

export interface ManualEditChange {
  key: string;
  patch: ManualEditPatch | 'reset';
}

interface UndoStep {
  label: string;
  before: Record<string, ManualEdit | undefined>;
}

const STORAGE_KEY = 'aegis.manualEdits.v1';
const UNDO_LIMIT = 30;

let edits: Record<string, ManualEdit> = {};
// Значения gamelist.xml до первой ручной правки поля: нужны, чтобы при отмене вернуть их.
// gamelist.xml values before a field was first edited: restored on undo or reset.
let originals: Record<string, Record<string, string>> = {};
let undoStack: UndoStep[] = [];
let version = 0;
const listeners = new Set<() => void>();
let loaded = false;

function storage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

function load() {
  if (loaded) return;
  loaded = true;
  const ls = storage();
  if (!ls) return;
  try {
    const raw = ls.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      edits = sanitizeEdits(parsed.edits);
      originals = parsed.originals && typeof parsed.originals === 'object' ? parsed.originals : {};
    }
  } catch {}
}

function persist() {
  const ls = storage();
  if (!ls) return;
  try {
    ls.setItem(STORAGE_KEY, JSON.stringify({ v: 1, edits, originals }));
  } catch {}
}

function emit() {
  version++;
  for (const l of listeners) {
    try {
      l();
    } catch {}
  }
}

function sanitizeEdits(input: unknown): Record<string, ManualEdit> {
  const out: Record<string, ManualEdit> = {};
  if (!input || typeof input !== 'object') return out;
  for (const [key, val] of Object.entries(input as Record<string, unknown>)) {
    if (!val || typeof val !== 'object') continue;
    const e: ManualEdit = {};
    for (const f of EDIT_FIELDS) {
      const v = (val as Record<string, unknown>)[f];
      if (typeof v === 'string') e[f] = v;
    }
    const ts = (val as Record<string, unknown>).updatedAt;
    if (typeof ts === 'number') e.updatedAt = ts;
    if (hasFields(e)) out[key] = e;
  }
  return out;
}

function hasFields(e: ManualEdit | undefined): boolean {
  if (!e) return false;
  return EDIT_FIELDS.some((f) => typeof e[f] === 'string');
}

export function isMediaField(f: string): f is EditMediaField {
  return (EDIT_MEDIA_FIELDS as readonly string[]).includes(f);
}

// Ключ правки. CRC из 8 hex-цифр, кроме нулевого, — иначе id строки.
// Edit key. An 8-hex-digit CRC (not all zeros), otherwise the row id.
export function manualEditKey(row: { consoleShort?: string; crc32?: string; id: string }): string {
  const crc = (row.crc32 || '').trim().toUpperCase();
  const cs = (row.consoleShort || '').trim().toUpperCase();
  if (/^[0-9A-F]{8}$/.test(crc) && crc !== '00000000' && cs) return `${cs}::${crc}`;
  return `id::${row.id}`;
}

export function subscribeManualEdits(listener: () => void): () => void {
  load();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getManualEditsVersion(): number {
  load();
  return version;
}

export function getManualEdit(key: string): ManualEdit | undefined {
  load();
  return edits[key];
}

export function countManualEdits(): number {
  load();
  return Object.keys(edits).length;
}

// Приводит значение поля к виду, в котором оно хранится (null — пусто). / Normalizes a value as stored (null: empty).
export function normalizeEditValue(field: EditField, value: string): string | null {
  const v = field === 'desc' ? value.replace(/\r\n/g, '\n').trim() : value.replace(/\s+/g, ' ').trim();
  // Пустое текстовое поле — вернуть автоматическое. Пустое медиа — убрать медиа.
  // Empty text field returns to automatic. Empty media removes the media.
  if (!v && !isMediaField(field)) return null;
  if (field === 'year') {
    const m = v.match(/\d{4}/);
    return m ? m[0] : null;
  }
  if (field === 'rating') {
    const n = Number(v.replace(',', '.'));
    if (!Number.isFinite(n)) return null;
    // Рейтинг в gamelist.xml от 0 до 1; 0–10 и 0–100 приводим. / gamelist rating is 0–1.
    const r = n > 10 ? n / 100 : n > 1 ? n / 10 : n;
    return String(Math.max(0, Math.min(1, Math.round(r * 100) / 100)));
  }
  return v;
}

// Применяет правки одним шагом отмены. Возвращает число изменённых ромов.
// Applies changes as one undo step. Returns the number of ROMs changed.
export function applyManualEdits(changes: ManualEditChange[], label: string): number {
  load();
  const before: Record<string, ManualEdit | undefined> = {};
  let changed = 0;
  const now = Date.now();
  for (const { key, patch } of changes) {
    const prev = edits[key];
    let next: ManualEdit | undefined;
    if (patch === 'reset') {
      next = undefined;
    } else {
      next = { ...(prev || {}) };
      for (const f of EDIT_FIELDS) {
        if (!(f in patch)) continue;
        const raw = patch[f];
        const v = raw == null ? null : normalizeEditValue(f, raw);
        if (v == null) delete next[f];
        else next[f] = v;
      }
      if (hasFields(next)) next.updatedAt = now;
      else next = undefined;
    }
    if (JSON.stringify(stripTs(prev)) === JSON.stringify(stripTs(next))) continue;
    if (!(key in before)) before[key] = prev;
    if (next) edits[key] = next;
    else delete edits[key];
    changed++;
  }
  if (changed > 0) {
    undoStack.push({ label, before });
    if (undoStack.length > UNDO_LIMIT) undoStack = undoStack.slice(-UNDO_LIMIT);
    persist();
    emit();
  }
  return changed;
}

function stripTs(e: ManualEdit | undefined) {
  if (!e) return null;
  const { updatedAt: _ts, ...rest } = e;
  return rest;
}

export function canUndoManualEdits(): boolean {
  return undoStack.length > 0;
}

// Отменяет последний шаг. Возвращает ключи, которые изменились, или null.
// Undoes the last step. Returns the changed keys, or null.
export function undoManualEdits(): { label: string; keys: string[] } | null {
  load();
  const step = undoStack.pop();
  if (!step) return null;
  for (const [key, prev] of Object.entries(step.before)) {
    if (prev) edits[key] = prev;
    else delete edits[key];
  }
  persist();
  emit();
  return { label: step.label, keys: Object.keys(step.before) };
}

// Запоминает значение тега gamelist.xml до первой правки. / Remembers a gamelist tag before its first edit.
export function rememberGamelistOriginal(key: string, tag: string, value: string | undefined) {
  load();
  const o = originals[key] || {};
  if (tag in o) return;
  o[tag] = value ?? '';
  originals[key] = o;
  persist();
}

export function getGamelistOriginal(key: string, tag: string): string | undefined {
  load();
  return originals[key]?.[tag];
}

export function exportManualEdits(): { edits: Record<string, ManualEdit>; originals: Record<string, Record<string, string>> } {
  load();
  return { edits: { ...edits }, originals: { ...originals } };
}

// Импорт из файла базы. Свои правки текущего сеанса не теряем: файл дополняет их.
// Import from a database file. Current edits stay; the file adds to them.
export function importManualEdits(data: unknown): number {
  load();
  if (!data || typeof data !== 'object') return 0;
  const incoming = sanitizeEdits((data as Record<string, unknown>).edits);
  const incomingOrig = (data as Record<string, unknown>).originals;
  let n = 0;
  for (const [k, v] of Object.entries(incoming)) {
    if (!edits[k]) {
      edits[k] = v;
      n++;
    }
  }
  if (incomingOrig && typeof incomingOrig === 'object') {
    for (const [k, v] of Object.entries(incomingOrig as Record<string, Record<string, string>>)) {
      if (!originals[k] && v && typeof v === 'object') originals[k] = v;
    }
  }
  if (n > 0) {
    persist();
    emit();
  }
  return n;
}

export function isDisplayableMediaUrl(v: string | undefined): boolean {
  return !!v && /^(https?:|data:|blob:|\/api\/)/i.test(v);
}

export interface EditableRow {
  id: string;
  title: string;
  consoleShort: string;
  crc32: string;
  region: string;
  genre: string;
  year: number;
  boxArtUrl?: string;
  videoUrl?: string;
  developer?: string;
  publisher?: string;
  players?: string;
  rating?: string;
  desc?: string;
  manualFields?: string[];
  manualMedia?: Partial<Record<EditMediaField, string>>;
}

const appliedCache = new WeakMap<object, { v: number; row: unknown }>();

// Накладывает правку на строку. Без правки возвращает ту же строку (кэши по ссылке не сбиваются).
// Lays the edit over a row. Without an edit returns the same object (identity caches keep working).
export function applyManualEditToRow<T extends EditableRow>(row: T): T {
  load();
  const e = edits[manualEditKey(row)];
  if (!e) return row;
  const hit = appliedCache.get(row);
  if (hit && hit.v === version) return hit.row as T;
  const next: T = { ...row };
  const fields: string[] = [];
  if (e.title) {
    next.title = e.title;
    fields.push('title');
  }
  if (e.region) {
    next.region = e.region;
    fields.push('region');
  }
  if (e.genre) {
    next.genre = e.genre;
    fields.push('genre');
  }
  if (e.year) {
    next.year = Number(e.year) || row.year;
    fields.push('year');
  }
  for (const f of ['developer', 'publisher', 'players', 'rating', 'desc'] as const) {
    if (e[f]) {
      next[f] = e[f];
      fields.push(f);
    }
  }
  const media: Partial<Record<EditMediaField, string>> = {};
  for (const f of EDIT_MEDIA_FIELDS) {
    if (typeof e[f] === 'string') {
      media[f] = e[f]!;
      fields.push(f);
    }
  }
  if (typeof e.image === 'string') {
    if (e.image === '') next.boxArtUrl = undefined;
    else if (isDisplayableMediaUrl(e.image)) next.boxArtUrl = e.image;
  }
  if (typeof e.video === 'string') {
    if (e.video === '') next.videoUrl = undefined;
    else if (isDisplayableMediaUrl(e.video)) next.videoUrl = e.video;
  }
  next.manualFields = fields;
  next.manualMedia = media;
  appliedCache.set(row, { v: version, row: next });
  return next;
}

// Шаблон названия: {title} {region} {year} {console} {genre} {n} {n:3}.
// Title template: {title} {region} {year} {console} {genre} {n} {n:3}.
export function renderTitleTemplate(
  template: string,
  row: { title: string; region?: string; year?: number; consoleShort?: string; genre?: string },
  index: number
): string {
  return template
    .replace(/\{n(?::(\d))?\}/gi, (_m, pad) => String(index + 1).padStart(pad ? Number(pad) : 0, '0'))
    .replace(/\{title\}/gi, row.title || '')
    .replace(/\{region\}/gi, row.region || '')
    .replace(/\{year\}/gi, row.year ? String(row.year) : '')
    .replace(/\{console\}/gi, row.consoleShort || '')
    .replace(/\{genre\}/gi, row.genre || '')
    .replace(/\(\s*\)|\[\s*\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function replaceInTitle(title: string, find: string, repl: string, ignoreCase: boolean): string {
  if (!find) return title;
  const esc = find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return title.replace(new RegExp(esc, ignoreCase ? 'gi' : 'g'), repl).replace(/\s+/g, ' ').trim();
}

// Только для тестов. / Tests only.
export function __resetManualEditsForTests() {
  edits = {};
  originals = {};
  undoStack = [];
  version = 0;
  loaded = true;
}
