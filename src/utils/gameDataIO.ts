// Выгрузка и загрузка данных игр таблицей (CSV) или XML.
// Экспорт пишет поля, которые уже есть в библиотеке. Импорт читает файл, находит игры
// по ключу (консоль + CRC32), по CRC или по имени файла и считает изменения. Применяются они
// как ручные правки редактора (utils/manualEdits.ts): скан и скраппер их не затирают,
// а весь импорт отменяется одним шагом. Также читается чужой gamelist.xml (ES / ES-DE / Skraper).
// Пустая ячейка ничего не меняет: чтобы вернуть автоматическое значение, есть редактор.
//
// Game data export and import as a table (CSV) or XML.
// Export writes the fields the library already has. Import reads a file, finds games by
// key (console + CRC32), by CRC or by file name and works out the changes. They are applied as
// editor manual edits (utils/manualEdits.ts): scans and the scraper do not wipe them, and the
// whole import undoes in one step. A foreign gamelist.xml (ES / ES-DE / Skraper) is read too.
// An empty cell changes nothing: the editor returns a field to its automatic value.

import { manualEditKey, normalizeEditValue, type EditTextField } from './manualEdits.ts';

export interface GameDataRow {
  id: string;
  title: string;
  console?: string;
  consoleShort: string;
  crc32: string;
  serial?: string;
  size?: string;
  bitness?: string;
  bitnessGroup?: string;
  region?: string;
  genre?: string;
  year?: number;
  developer?: string;
  publisher?: string;
  players?: string;
  rating?: string;
  desc?: string;
  ageRating?: string;
  modKind?: string;
  modLang?: string;
  oldFile?: string;
  cleanFile?: string;
  relativePath?: string;
}

export type GameDataFormat = 'csv' | 'xml';

// Поля, которые импорт может менять. / Fields an import may change.
export const IMPORT_FIELDS: readonly EditTextField[] = [
  'title',
  'region',
  'genre',
  'year',
  'developer',
  'publisher',
  'players',
  'rating',
  'desc',
];

interface Column {
  id: string;
  get: (r: GameDataRow) => string;
}

function baseName(p: string | undefined): string {
  const s = String(p || '').replace(/\\/g, '/');
  return s.slice(s.lastIndexOf('/') + 1);
}

function fileOf(r: GameDataRow): string {
  return r.relativePath || r.oldFile || r.cleanFile || '';
}

// Порядок колонок файла. Названия колонок не переводятся: по ним идёт обратная загрузка.
// Column order. Column names are not translated: import relies on them.
export const EXPORT_COLUMNS: readonly Column[] = [
  { id: 'key', get: (r) => manualEditKey(r) },
  { id: 'console', get: (r) => r.consoleShort || '' },
  { id: 'platform', get: (r) => r.console || '' },
  { id: 'file', get: (r) => fileOf(r) },
  { id: 'crc32', get: (r) => r.crc32 || '' },
  { id: 'serial', get: (r) => r.serial || '' },
  { id: 'size', get: (r) => r.size || '' },
  { id: 'bitness', get: (r) => r.bitness || r.bitnessGroup || '' },
  { id: 'title', get: (r) => r.title || '' },
  { id: 'region', get: (r) => r.region || '' },
  { id: 'genre', get: (r) => r.genre || '' },
  { id: 'year', get: (r) => (r.year && r.year > 0 ? String(r.year) : '') },
  { id: 'developer', get: (r) => r.developer || '' },
  { id: 'publisher', get: (r) => r.publisher || '' },
  { id: 'players', get: (r) => r.players || '' },
  { id: 'rating', get: (r) => r.rating || '' },
  { id: 'desc', get: (r) => r.desc || '' },
  // Возраст прикидывается по названию и жанру (buildsAndConverterEngine), не хранится: только чтение.
  // Age is guessed from title and genre (buildsAndConverterEngine) and not stored: read-only.
  { id: 'age_auto', get: (r) => r.ageRating || '' },
  { id: 'hack', get: (r) => r.modKind || '' },
  { id: 'translation_lang', get: (r) => r.modLang || '' },
];

// Имена колонок/тегов из других файлов. / Column or tag names from other files.
const ALIASES: Record<string, string> = {
  name: 'title',
  path: 'file',
  filename: 'file',
  releasedate: 'year',
  description: 'desc',
  system: 'console',
  consoleshort: 'console',
  crc: 'crc32',
  developer: 'developer',
  publisher: 'publisher',
};

function canonicalField(name: string): string {
  const k = name.trim().toLowerCase();
  return ALIASES[k] || k;
}

// ---------- CSV ----------

function csvCell(v: string, sep: string): string {
  if (v === '') return '';
  if (v.includes('"') || v.includes(sep) || /[\r\n]/.test(v) || /^\s|\s$/.test(v)) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

// «;» и BOM: так Excel с русской локалью сразу раскладывает колонки и видит UTF-8.
// ";" and a BOM: Excel in European locales splits columns and reads UTF-8 right away.
export function toCsv(rows: readonly GameDataRow[], sep = ';'): string {
  const lines = [EXPORT_COLUMNS.map((c) => c.id).join(sep)];
  for (const r of rows) lines.push(EXPORT_COLUMNS.map((c) => csvCell(c.get(r), sep)).join(sep));
  return '﻿' + lines.join('\r\n') + '\r\n';
}

function detectSeparator(firstLine: string): string {
  let best = ';';
  let bestN = -1;
  for (const sep of [';', ',', '\t']) {
    let n = 0;
    let q = false;
    for (const ch of firstLine) {
      if (ch === '"') q = !q;
      else if (!q && ch === sep) n++;
    }
    if (n > bestN) {
      best = sep;
      bestN = n;
    }
  }
  return best;
}

export function parseCsv(text: string): Record<string, string>[] {
  let s = text.replace(/^﻿/, '');
  let sep: string | null = null;
  const sepLine = s.match(/^sep=(.)\r?\n/i);
  if (sepLine) {
    sep = sepLine[1];
    s = s.slice(sepLine[0].length);
  }
  if (!sep) sep = detectSeparator(s.split(/\r?\n/, 1)[0] || '');

  const table: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          cell += '"';
          i++;
        } else q = false;
      } else cell += ch;
    } else if (ch === '"' && cell === '') {
      q = true;
    } else if (ch === sep) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      row.push(cell);
      table.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    table.push(row);
  }
  const nonEmpty = table.filter((r) => r.some((c) => c.trim() !== ''));
  if (nonEmpty.length === 0) return [];
  const header = nonEmpty[0].map(canonicalField);
  return nonEmpty.slice(1).map((r) => {
    const rec: Record<string, string> = {};
    header.forEach((h, i) => {
      if (h) rec[h] = r[i] ?? '';
    });
    return rec;
  });
}

// ---------- XML ----------

function escapeXml(v: string): string {
  return v
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
}

function unescapeXml(v: string): string {
  const cdata = v.match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/);
  if (cdata) return cdata[1];
  return v
    .replace(/&#x([0-9a-f]+);/gi, (_m, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_m, d) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

export function toXml(rows: readonly GameDataRow[], exportedAt = new Date().toISOString()): string {
  const out = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<aegisromGames version="1" exported="${escapeXml(exportedAt)}" count="${rows.length}">`,
  ];
  for (const r of rows) {
    out.push('  <game>');
    for (const c of EXPORT_COLUMNS) out.push(`    <${c.id}>${escapeXml(c.get(r))}</${c.id}>`);
    out.push('  </game>');
  }
  out.push('</aegisromGames>', '');
  return out.join('\n');
}

// Плоский разбор: каждая <game> — запись, её дочерние теги — поля. Подходит и для gamelist.xml.
// Flat parse: each <game> is a record and its child tags are fields. Works for gamelist.xml too.
export function parseXml(text: string): Record<string, string>[] {
  const s = text.replace(/^﻿/, '').replace(/<!--[\s\S]*?-->/g, '');
  const out: Record<string, string>[] = [];
  const gameRe = /<game\b[^>]*?(?:\/>|>([\s\S]*?)<\/game\s*>)/g;
  let m: RegExpExecArray | null;
  while ((m = gameRe.exec(s))) {
    const body = m[1] || '';
    const rec: Record<string, string> = {};
    const tagRe = /<([A-Za-z_][\w.-]*)\b[^>]*?(?:\/>|>([\s\S]*?)<\/\1\s*>)/g;
    let t: RegExpExecArray | null;
    while ((t = tagRe.exec(body))) {
      const field = canonicalField(t[1]);
      if (!(field in rec)) rec[field] = unescapeXml(t[2] || '').trim();
    }
    out.push(rec);
  }
  return out;
}

export function detectFormat(text: string, fileName = ''): GameDataFormat {
  if (/\.xml$/i.test(fileName)) return 'xml';
  if (/\.(csv|tsv|txt)$/i.test(fileName)) return 'csv';
  return /^\s*</.test(text.replace(/^﻿/, '')) ? 'xml' : 'csv';
}

export function parseGameData(text: string, fileName = ''): Record<string, string>[] {
  return detectFormat(text, fileName) === 'xml' ? parseXml(text) : parseCsv(text);
}

// ---------- Сопоставление и изменения / Matching and changes ----------

export interface GameDataChange {
  rowId: string;
  key: string;
  title: string;
  console: string;
  field: EditTextField;
  from: string;
  to: string;
}

export interface GameDataImportPlan {
  records: number;
  matched: number;
  /** Записи файла без пары в библиотеке (номер записи с 1 и подпись). / File records with no library match. */
  unmatched: { index: number; label: string }[];
  /** Имя файла подходит к нескольким играм, а консоли нет. / File name fits several games and no console given. */
  ambiguous: { index: number; label: string }[];
  /** Одна и та же игра встретилась в файле не раз (берётся последняя). / Same game more than once (last wins). */
  duplicates: number;
  /** Игры, у которых что-то меняется. / Games with at least one change. */
  changedGames: number;
  changes: GameDataChange[];
  /** Какие поля из IMPORT_FIELDS есть в файле. / Which IMPORT_FIELDS the file has. */
  fieldsInFile: EditTextField[];
}

function currentValue(row: GameDataRow, f: EditTextField): string {
  switch (f) {
    case 'year':
      return row.year && row.year > 0 ? String(row.year) : '';
    case 'rating':
      return row.rating ? normalizeEditValue('rating', row.rating) ?? '' : '';
    default: {
      const v = String((row as unknown as Record<string, unknown>)[f] ?? '');
      return v ? normalizeEditValue(f, v) ?? '' : '';
    }
  }
}

function recordLabel(rec: Record<string, string>): string {
  return rec.title || baseName(rec.file) || rec.key || rec.crc32 || '?';
}

export function planGameDataImport(
  records: readonly Record<string, string>[],
  rows: readonly GameDataRow[]
): GameDataImportPlan {
  const byKey = new Map<string, GameDataRow>();
  const byFile = new Map<string, GameDataRow[]>();
  for (const r of rows) {
    byKey.set(manualEditKey(r), r);
    const names = new Set([baseName(r.oldFile), baseName(r.relativePath), baseName(r.cleanFile)]);
    for (const n of names) {
      if (!n) continue;
      const k = n.toLowerCase();
      const list = byFile.get(k);
      if (list) {
        if (!list.includes(r)) list.push(r);
      } else byFile.set(k, [r]);
    }
  }

  const fieldsInFile = IMPORT_FIELDS.filter((f) => records.some((rec) => f in rec));
  const plan: GameDataImportPlan = {
    records: records.length,
    matched: 0,
    unmatched: [],
    ambiguous: [],
    duplicates: 0,
    changedGames: 0,
    changes: [],
    fieldsInFile,
  };
  // Последняя запись файла для игры побеждает. / The last file record for a game wins.
  const target = new Map<string, Record<string, string>>();
  const rowOf = new Map<string, GameDataRow>();

  records.forEach((rec, i) => {
    const cs = (rec.console || '').trim().toUpperCase();
    let row: GameDataRow | undefined;
    if (rec.key) row = byKey.get(rec.key.trim());
    if (!row && cs && rec.crc32) row = byKey.get(manualEditKey({ id: '', consoleShort: cs, crc32: rec.crc32 }));
    if (!row && rec.file) {
      let list = byFile.get(baseName(rec.file).toLowerCase()) || [];
      if (list.length > 1 && cs) list = list.filter((r) => (r.consoleShort || '').toUpperCase() === cs);
      if (list.length > 1) {
        plan.ambiguous.push({ index: i + 1, label: recordLabel(rec) });
        return;
      }
      row = list[0];
    }
    if (!row) {
      plan.unmatched.push({ index: i + 1, label: recordLabel(rec) });
      return;
    }
    plan.matched++;
    if (target.has(row.id)) plan.duplicates++;
    target.set(row.id, rec);
    rowOf.set(row.id, row);
  });

  for (const [id, rec] of target) {
    const row = rowOf.get(id)!;
    let any = false;
    for (const f of fieldsInFile) {
      const raw = rec[f];
      if (raw == null || raw.trim() === '') continue;
      const to = normalizeEditValue(f, raw);
      if (to == null) continue;
      const from = currentValue(row, f);
      if (to === from) continue;
      plan.changes.push({
        rowId: id,
        key: manualEditKey(row),
        title: row.title,
        console: row.consoleShort,
        field: f,
        from,
        to,
      });
      any = true;
    }
    if (any) plan.changedGames++;
  }
  return plan;
}

// Изменения → патчи ручных правок по ключу. / Changes → manual edit patches by key.
export function changesToPatches(changes: readonly GameDataChange[]): { key: string; patch: Partial<Record<EditTextField, string>> }[] {
  const byKey = new Map<string, Partial<Record<EditTextField, string>>>();
  for (const c of changes) {
    const p = byKey.get(c.key) || {};
    p[c.field] = c.to;
    byKey.set(c.key, p);
  }
  return [...byKey].map(([key, patch]) => ({ key, patch }));
}

export function exportFileName(format: GameDataFormat, date = new Date()): string {
  const d = date.toISOString().slice(0, 10);
  return `aegisrom_games_${d}.${format}`;
}
