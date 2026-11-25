// Очередь выгрузки сборки: план, две линии работы, таймауты, отмена, журнал для продолжения.
//
// RU: Раньше все игры шли одной очередью в 4-6 потоков, а конвертации ждали общий замок «по одной»,
// занимая поток. Когда в очереди подряд шли диски (PS1, Saturn…), все потоки стояли в ожидании одной
// конвертации, простые копии не шли, у конвертаций не было таймаута, gamelist.xml писался в самом конце.
// Здесь:
//  - planBuildLanes делит игры на «копирование» (как есть, заголовки картриджей, нет chdman) и
//    «конвертацию» (образы дисков, chdman); линии работают одновременно и не ждут друг друга;
//  - runGuarded даёт каждой задаче предел времени и сторож «нет прогресса», а также отмену;
//  - BuildJournal (aegisrom_build_progress.json в папке сборки) помнит готовые конвертации, чтобы
//    повторный запуск их пропустил;
//  - BuildReport собирает ошибки, таймауты и пропуски в aegisrom_build_report.txt.
//
// EN: All games used to share one queue of 4-6 lanes, and conversions waited on a shared "one at a time"
// lock while holding a lane. When disc games came in a row (PS1, Saturn…) every lane waited for a single
// conversion, plain copies stopped, conversions had no timeout, and gamelist.xml was written at the very end.
// Here:
//  - planBuildLanes splits games into "copy" (as is, cartridge headers, no chdman) and "convert"
//    (disc images, chdman); the lanes run at the same time and do not wait for each other;
//  - runGuarded gives every task a time limit, a "no progress" watchdog and cancellation;
//  - BuildJournal (aegisrom_build_progress.json in the build folder) remembers finished conversions so
//    a rerun skips them;
//  - BuildReport collects errors, timeouts and skips into aegisrom_build_report.txt.

export type BuildLane = 'copy' | 'convert';

/** Поля правила конвертации, которые нужны очереди. / Conversion rule fields the queue needs. */
export interface LaneRule {
  conversionKind: 'copy' | 'builtin_binary' | 'chdman_required' | 'external_pbp_cso';
  actionType: string;
}

/**
 * В какую линию идёт игра. Всё, что по факту копируется (в том числе «нет chdman» и внешние PBP/CSO,
 * для которых копируется оригинал), и правка заголовка картриджа (файл в памяти, доли секунды) идут
 * в копирование. Образы дисков и chdman идут в конвертацию.
 * Which lane a game goes to. Everything that is really a copy (including "no chdman" and external
 * PBP/CSO, where the original is copied) and cartridge header fixes (in memory, a fraction of a second)
 * go to copy. Disc images and chdman go to convert.
 */
export function laneForRule(rule: LaneRule, chdmanAvailable: boolean): BuildLane {
  if (rule.conversionKind === 'copy' || rule.conversionKind === 'external_pbp_cso') return 'copy';
  if (rule.conversionKind === 'chdman_required') return chdmanAvailable ? 'convert' : 'copy';
  if (rule.actionType === 'cart_header_fix') return 'copy';
  return 'convert';
}

export interface PlanRowLike {
  rule: LaneRule;
  targetExt: string;
  game: { sizeMB: number; fileObj?: unknown; discs?: Array<{ fileObj?: unknown }> };
}

export interface BuildLanes {
  /** Индексы строк плана в порядке выполнения. / Plan row indices in run order. */
  copy: number[];
  convert: number[];
}

/**
 * Делит строки плана на две линии. Копии идут в исходном порядке, конвертации от меньших к большим:
 * так готовых игр больше раньше, а самые долгие образы в конце.
 * Splits plan rows into two lanes. Copies keep the original order; conversions go smallest first,
 * so more games are finished early and the longest images come last.
 */
export function planBuildLanes(rows: readonly PlanRowLike[], chdmanAvailable: boolean): BuildLanes {
  const copy: number[] = [];
  const convert: number[] = [];
  rows.forEach((r, i) => (laneForRule(r.rule, chdmanAvailable) === 'convert' ? convert : copy).push(i));
  convert.sort((a, b) => (rows[a].game.sizeMB || 0) - (rows[b].game.sizeMB || 0) || a - b);
  return { copy, convert };
}

export interface BuildPlanSummary {
  total: number;
  copy: { count: number; mb: number };
  convert: { count: number; mb: number; byTarget: Record<string, number> };
  /** Нужен chdman, его нет: копируется оригинал. / chdman needed but missing: the original is copied. */
  chdmanMissing: number;
  /** Нет файла в этом сеансе. / No file loaded in this session. */
  noFile: number;
}

function hasFile(r: PlanRowLike): boolean {
  return Boolean(r.game.fileObj) || Boolean(r.game.discs?.some((d) => d.fileObj));
}

/** Сводка плана для окна перед выгрузкой. / Plan summary for the dialog before the export. */
export function summarizeBuildPlan(rows: readonly PlanRowLike[], chdmanAvailable: boolean): BuildPlanSummary {
  const s: BuildPlanSummary = {
    total: rows.length,
    copy: { count: 0, mb: 0 },
    convert: { count: 0, mb: 0, byTarget: {} },
    chdmanMissing: 0,
    noFile: 0,
  };
  for (const r of rows) {
    if (!hasFile(r)) {
      s.noFile++;
      continue;
    }
    const mb = r.game.sizeMB || 0;
    if (laneForRule(r.rule, chdmanAvailable) === 'convert') {
      s.convert.count++;
      s.convert.mb += mb;
      s.convert.byTarget[r.targetExt] = (s.convert.byTarget[r.targetExt] || 0) + 1;
    } else {
      s.copy.count++;
      s.copy.mb += mb;
      if (r.rule.conversionKind === 'chdman_required') s.chdmanMissing++;
    }
  }
  s.copy.mb = Math.round(s.copy.mb * 10) / 10;
  s.convert.mb = Math.round(s.convert.mb * 10) / 10;
  return s;
}

// ---------------------------------------------------------------------------
// Пределы времени / Time limits
// ---------------------------------------------------------------------------
//
// Это не замеры, а запас: предел должен срабатывать только на действительно зависшей задаче.
// These are not measurements but headroom: a limit should fire only on a task that is really stuck.

const MIN = 60 * 1000;

/** Копирование: 5 мин + 1 мин на каждые 50 МБ (не медленнее ~0,8 МБ/с). / Copy: 5 min + 1 min per 50 MB. */
export function copyTimeoutMs(sizeMB: number): number {
  return 5 * MIN + Math.ceil(Math.max(0, sizeMB) / 50) * MIN;
}

/** Конвертация: 10 мин + 1 мин на каждые 100 МБ. / Conversion: 10 min + 1 min per 100 MB. */
export function convertTimeoutMs(sizeMB: number): number {
  return 10 * MIN + Math.ceil(Math.max(0, sizeMB) / 100) * MIN;
}

/** Сторож «нет прогресса» для конвертаций, которые сообщают проценты. / "No progress" watchdog. */
export const CONVERT_IDLE_MS = 5 * MIN;

export class BuildTaskTimeoutError extends Error {
  readonly reason: 'timeout' | 'stalled';
  readonly limitMs: number;
  constructor(reason: 'timeout' | 'stalled', limitMs: number) {
    super(reason === 'timeout' ? `timeout after ${Math.round(limitMs / 1000)} s` : `no progress for ${Math.round(limitMs / 1000)} s`);
    this.name = 'BuildTaskTimeoutError';
    this.reason = reason;
    this.limitMs = limitMs;
  }
}

export class BuildCancelledError extends Error {
  constructor() {
    super('cancelled');
    this.name = 'BuildCancelledError';
  }
}

export interface GuardHandle {
  /** Сигнал отмены задачи (для fetch). / The task's abort signal (for fetch). */
  signal: AbortSignal;
  /** Сообщить о прогрессе: сбрасывает сторож. / Report progress: resets the watchdog. */
  touch: () => void;
}

/**
 * Выполняет задачу с пределом времени, сторожем «нет прогресса» и отменой извне. При срабатывании
 * отклоняет промис сразу и прерывает signal; сама задача может доработать в фоне, её результат
 * игнорируется.
 * Runs a task with a time limit, a "no progress" watchdog and outside cancellation. When one fires, the
 * promise rejects at once and signal aborts; the task itself may finish in the background, its result
 * is ignored.
 */
export function runGuarded<T>(
  task: (g: GuardHandle) => Promise<T>,
  opts: { timeoutMs: number; idleMs?: number; parent?: AbortSignal; now?: () => number }
): Promise<T> {
  const now = opts.now || Date.now;
  const ctl = new AbortController();
  let lastTouch = now();
  let settled = false;
  return new Promise<T>((resolve, reject) => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    let idleTimer: ReturnType<typeof setInterval> | null = null;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      for (const t of timers) clearTimeout(t);
      if (idleTimer) clearInterval(idleTimer);
      opts.parent?.removeEventListener('abort', onParentAbort);
      fn();
    };
    const fail = (err: Error) =>
      finish(() => {
        ctl.abort(err);
        reject(err);
      });
    const onParentAbort = () => fail(new BuildCancelledError());
    if (opts.parent?.aborted) {
      fail(new BuildCancelledError());
      return;
    }
    opts.parent?.addEventListener('abort', onParentAbort);
    timers.push(setTimeout(() => fail(new BuildTaskTimeoutError('timeout', opts.timeoutMs)), opts.timeoutMs));
    if (opts.idleMs && opts.idleMs > 0) {
      const idle = opts.idleMs;
      idleTimer = setInterval(() => {
        if (now() - lastTouch >= idle) fail(new BuildTaskTimeoutError('stalled', idle));
      }, Math.max(20, Math.min(idle / 4, 15000)));
    }
    let p: Promise<T>;
    try {
      p = task({
        signal: ctl.signal,
        touch: () => {
          lastTouch = now();
        },
      });
    } catch (err) {
      fail(err instanceof Error ? err : new Error(String(err)));
      return;
    }
    p.then(
      (v) => finish(() => resolve(v)),
      (err) => fail(err instanceof Error ? err : new Error(String(err)))
    );
  });
}

// ---------------------------------------------------------------------------
// Журнал для продолжения / Resume journal
// ---------------------------------------------------------------------------

export const BUILD_JOURNAL_FILE = 'aegisrom_build_progress.json';
export const BUILD_REPORT_FILE = 'aegisrom_build_report.txt';

export interface JournalEntry {
  /** Путь главного файла относительно корня сборки. / Main file path relative to the build root. */
  path: string;
  status: string;
  at: string;
}

interface JournalData {
  version: 1;
  updatedAt: string;
  done: Record<string, JournalEntry>;
}

/** Ключ игры в журнале. / A game's journal key. */
export function journalKey(folderPath: string, baseName: string, targetExt: string): string {
  return `${folderPath}/${baseName}|${targetExt}`.toLowerCase();
}

/**
 * Готовые конвертации в папке сборки. Копии журнал не требуют: их проверяет размер файла.
 * Finished conversions in the build folder. Copies do not need it: the file size checks them.
 */
export class BuildJournal {
  private data: JournalData = { version: 1, updatedAt: '', done: {} };
  private dirty = false;
  private readonly root: any;

  constructor(root: any) {
    this.root = root;
  }

  async load(): Promise<number> {
    try {
      const fh = await this.root.getFileHandle(BUILD_JOURNAL_FILE);
      const v = JSON.parse(await (await fh.getFile()).text());
      if (v && v.version === 1 && v.done && typeof v.done === 'object') this.data = v;
    } catch {}
    return Object.keys(this.data.done).length;
  }

  get(key: string): JournalEntry | undefined {
    return this.data.done[key];
  }

  mark(key: string, path: string, status: string): void {
    this.data.done[key] = { path, status, at: new Date().toISOString() };
    this.dirty = true;
  }

  forget(key: string): void {
    if (this.data.done[key]) {
      delete this.data.done[key];
      this.dirty = true;
    }
  }

  get size(): number {
    return Object.keys(this.data.done).length;
  }

  async save(force = false): Promise<void> {
    if (!this.dirty && !force) return;
    this.dirty = false;
    this.data.updatedAt = new Date().toISOString();
    const fh = await this.root.getFileHandle(BUILD_JOURNAL_FILE, { create: true });
    const w = await fh.createWritable();
    await w.write(JSON.stringify(this.data, null, 1));
    await w.close();
  }
}

/** Есть ли непустой файл по пути относительно корня. / Whether a non-empty file exists at a root-relative path. */
export async function fileExistsNonEmpty(root: any, relPath: string): Promise<boolean> {
  const segs = relPath.split('/').filter(Boolean);
  if (segs.length === 0) return false;
  try {
    let d = root;
    for (let i = 0; i < segs.length - 1; i++) d = await d.getDirectoryHandle(segs[i]);
    const f = await (await d.getFileHandle(segs[segs.length - 1])).getFile();
    return (f.size || 0) > 0;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Отчёт / Report
// ---------------------------------------------------------------------------

export type ReportKind = 'error' | 'timeout' | 'skipped' | 'cancelled' | 'note';

export class BuildReport {
  readonly lines: Array<{ kind: ReportKind; title: string; detail: string }> = [];

  add(kind: ReportKind, title: string, detail: string): void {
    this.lines.push({ kind, title, detail });
  }

  count(kind: ReportKind): number {
    return this.lines.filter((l) => l.kind === kind).length;
  }

  /** Текст отчёта (двуязычные заголовки). / Report text (bilingual headings). */
  render(header: string[]): string {
    const out = [...header, ''];
    const sections: Array<[ReportKind, string]> = [
      ['timeout', 'Зависли и пропущены по таймауту / Timed out and skipped'],
      ['error', 'Ошибки / Errors'],
      ['skipped', 'Пропущено / Skipped'],
      ['cancelled', 'Не сделано из-за остановки / Not done because of the stop'],
      ['note', 'Заметки / Notes'],
    ];
    for (const [kind, title] of sections) {
      const items = this.lines.filter((l) => l.kind === kind);
      if (items.length === 0) continue;
      out.push(`== ${title}: ${items.length} ==`);
      for (const l of items) out.push(`- ${l.title}: ${l.detail}`);
      out.push('');
    }
    if (this.lines.length === 0) out.push('Без ошибок / No errors');
    return out.join('\r\n');
  }
}

// ---------------------------------------------------------------------------
// Скорость / Speed
// ---------------------------------------------------------------------------

/** МБ/с по скользящему окну. / MB/s over a sliding window. */
export class SpeedMeter {
  private samples: Array<{ t: number; bytes: number }> = [];
  private total = 0;
  private readonly windowMs: number;
  private readonly now: () => number;

  constructor(windowMs = 30000, now: () => number = Date.now) {
    this.windowMs = windowMs;
    this.now = now;
  }

  add(bytes: number): void {
    this.total += Math.max(0, bytes);
    const t = this.now();
    this.samples.push({ t, bytes: this.total });
    while (this.samples.length > 2 && t - this.samples[0].t > this.windowMs) this.samples.shift();
  }

  get totalBytes(): number {
    return this.total;
  }

  /** МБ/с или null, если данных мало. / MB/s, or null when there is too little data. */
  mbPerSec(): number | null {
    if (this.samples.length < 2) return null;
    const a = this.samples[0];
    const t = this.now();
    const dt = (t - a.t) / 1000;
    if (dt < 1) return null;
    return (this.total - a.bytes) / (1024 * 1024) / dt;
  }
}

// ---------------------------------------------------------------------------
// Остановка из общей кнопки СТОП / Stop from the shared STOP button
// ---------------------------------------------------------------------------

let activeStop: (() => void) | null = null;

/** Регистрирует остановку текущей выгрузки; вернёт функцию снятия. / Registers the current export's stop. */
export function registerBuildStop(fn: () => void): () => void {
  activeStop = fn;
  return () => {
    if (activeStop === fn) activeStop = null;
  };
}

/** Остановить выгрузку, если она идёт. / Stop the export if one is running. */
export function requestBuildStop(): boolean {
  if (!activeStop) return false;
  activeStop();
  return true;
}
