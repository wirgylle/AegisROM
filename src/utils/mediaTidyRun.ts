// Фоновая операция «Упорядочить медиа»: план и применение идут вне окна, окно можно закрыть,
// приложение остаётся рабочим. Прогресс и «Остановить» видны в плашке в углу (MediaTidyRunPanel).
// Background "Tidy media" run: planning and applying live outside the window, the window can be
// closed and the app stays usable. Progress and Stop are shown in a corner panel.

import { useSyncExternalStore } from 'react';
import {
  applyConsolePlan,
  countConsoleMediaFiles,
  findConsoleDirsWithMedia,
  planConsoleMedia,
  type ConsoleNormPlan,
} from './mediaNormalize';

export type TidyPhase = 'idle' | 'planning' | 'planned' | 'applying' | 'done' | 'stopped' | 'error';

export interface TidyRunState {
  phase: TidyPhase;
  rootName: string;
  /** Сделано / всего (файлы при плане, действия при применении). / Done of total. */
  done: number;
  total: number;
  /** Текущий файл или консоль. / The current file or console. */
  current: string;
  plans: ConsoleNormPlan[] | null;
  result: { moved: number; deleted: number; failed: number } | null;
  error: string;
  /** Плашка скрыта пользователем. / The corner panel was hidden by the user. */
  panelHidden: boolean;
  startedAt: number;
}

const INITIAL: TidyRunState = {
  phase: 'idle',
  rootName: '',
  done: 0,
  total: 0,
  current: '',
  plans: null,
  result: null,
  error: '',
  panelHidden: false,
  startedAt: 0,
};

let state: TidyRunState = INITIAL;
let controller: AbortController | null = null;
const listeners = new Set<() => void>();

// Прогресс приходит часто: шлём обновления не чаще раза в 150 мс. / Throttle progress to every 150 ms.
let lastEmit = 0;
function set(patch: Partial<TidyRunState>, force = true) {
  state = { ...state, ...patch };
  const now = Date.now();
  if (!force && now - lastEmit < 150) return;
  lastEmit = now;
  listeners.forEach((l) => l());
}

export function getTidyRun(): TidyRunState {
  return state;
}

export function subscribeTidyRun(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useTidyRun(): TidyRunState {
  return useSyncExternalStore(subscribeTidyRun, getTidyRun, getTidyRun);
}

export const isTidyBusy = (s: TidyRunState = state) => s.phase === 'planning' || s.phase === 'applying';

const isAbort = (e: unknown) => (e as any)?.name === 'AbortError';

/** Строит план для папки. / Builds the plan for a folder. */
export async function startTidyPlan(root: any): Promise<void> {
  if (isTidyBusy()) return;
  controller = new AbortController();
  const signal = controller.signal;
  set({ ...INITIAL, phase: 'planning', rootName: root?.name || '', startedAt: Date.now() });
  try {
    const consoles = await findConsoleDirsWithMedia(root);
    let total = 0;
    for (const c of consoles) {
      set({ current: c.path || root.name }, false);
      total += await countConsoleMediaFiles(c.dir as any, signal);
    }
    set({ total, done: 0 });
    const out: ConsoleNormPlan[] = [];
    let done = 0;
    for (const c of consoles) {
      const p = await planConsoleMedia(c.dir as any, c.path || root.name, {
        signal,
        onFile: (rel) => {
          done++;
          set({ done, current: `${c.path || root.name}/${rel}` }, false);
        },
      });
      if (p.actions.length) out.push(p);
    }
    set({ phase: 'planned', plans: out, done: total, current: '' });
  } catch (e) {
    if (isAbort(e)) set({ phase: 'stopped', current: '' });
    else set({ phase: 'error', error: String((e as any)?.message || e), current: '' });
  } finally {
    controller = null;
  }
}

/** Применяет построенный план. / Applies the built plan. */
export async function startTidyApply(opts: { deleteDuplicates: boolean; onApplied?: () => void }): Promise<void> {
  const plans = state.plans;
  if (!plans || isTidyBusy()) return;
  controller = new AbortController();
  const signal = controller.signal;
  const total = plans.reduce(
    (n, p) =>
      n + p.actions.filter((a) => a.type === 'move' || (a.type === 'duplicate' && opts.deleteDuplicates)).length,
    0
  );
  set({ phase: 'applying', done: 0, total, current: '', result: null, panelHidden: false, startedAt: Date.now() });
  const res = { moved: 0, deleted: 0, failed: 0 };
  let done = 0;
  let aborted = false;
  try {
    for (const p of plans) {
      if (signal.aborted) {
        aborted = true;
        break;
      }
      const r = await applyConsolePlan(p, {
        deleteDuplicates: opts.deleteDuplicates,
        signal,
        onAction: (a) => {
          if (a.type === 'move' || (a.type === 'duplicate' && opts.deleteDuplicates)) {
            done++;
            set({ done, current: `${p.path}/${a.from}` }, false);
          }
        },
      });
      res.moved += r.moved;
      res.deleted += r.deleted;
      res.failed += r.failed;
      if (r.aborted) {
        aborted = true;
        break;
      }
    }
  } catch (e) {
    set({ phase: 'error', error: String((e as any)?.message || e), result: res, current: '' });
    controller = null;
    return;
  }
  controller = null;
  set({ phase: aborted ? 'stopped' : 'done', result: res, plans: null, current: '' });
  // Медиа библиотеки перечитываем и после остановки: часть файлов уже переехала.
  // The library media is reloaded after a stop too: some files have already moved.
  if (res.moved + res.deleted > 0) opts.onApplied?.();
}

export function stopTidyRun(): void {
  controller?.abort();
}

export function hideTidyPanel(): void {
  set({ panelHidden: true });
}

/** Сбросить результат (новый план). / Reset the result (a new plan). */
export function resetTidyRun(): void {
  if (isTidyBusy()) return;
  set({ ...INITIAL });
}
