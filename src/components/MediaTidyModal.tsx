import React, { useMemo, useState } from 'react';
import { Check, FolderOpen, Loader2, Square, Wand2, X } from 'lucide-react';
import { useI18n } from '../i18n/translations';
import { checkOrRequestHandlePermission, loadDirectoryHandleRecord } from '../utils/persistentHandles';
import { type NormAction } from '../utils/mediaNormalize';
import { GAME_MEDIA_LABELS, type GameMediaKind } from '../utils/gameMediaKinds';
import {
  getTidyRun,
  hideTidyPanel,
  isTidyBusy,
  resetTidyRun,
  startTidyApply,
  startTidyPlan,
  stopTidyRun,
  useTidyRun,
  type TidyRunState,
} from '../utils/mediaTidyRun';

// Окно «Упорядочить медиа»: план переноса media/* Skraper в раскладку проекта
// (utils/gameMediaKinds.ts) с переименованием под ром, предпросмотр и применение.
// Дубли удаляются только по галочке. План и применение идут в фоне (utils/mediaTidyRun.ts):
// окно можно закрыть, прогресс и «Остановить» остаются в плашке в углу (MediaTidyRunPanel).
// "Tidy media" window: a plan to move Skraper media/* into the project layout, renamed after the
// ROM, a preview and apply. Duplicates are deleted only when ticked. Both stages run in the
// background: the window can be closed, progress and Stop stay in a corner panel.

// Строки здесь, а не в общих словарях, чтобы не конфликтовать с параллельными ветками.
// Strings live here, not in the shared dictionaries, to avoid conflicts with parallel branches.
const STR: Record<'en' | 'ru', Record<string, string>> = {
  en: {
    title: 'Tidy media (Skraper media/)',
    intro:
      'Moves every Skraper folder from <console>/media/ into the project layout, renames files after the ROM and updates gamelist.xml: box art → images/<ROM>-image, screenshot → -thumb, mix → -mix, fan art → -fanart, maps → -map, cartridge → -cartridge, its scan → -supporttexture, Steam grid → -steamgrid, wheel → marquees/<ROM>-marquee, marquee → -screenmarquee, video → videos/, manual and tips → manuals/. Nothing changes until you press Apply. It runs in the background: you can close this window and keep working.',
    folder: 'Folder: {name}',
    noFolder: 'No library folder saved yet.',
    pick: 'Choose folder…',
    plan: 'Build the plan',
    planning: 'Looking through media folders…',
    progress: '{done} of {total}',
    background: 'Continue in the background',
    stop: 'Stop',
    stopped: 'Stopped. What was already moved stays moved.',
    error: 'Error: {err}',
    kinds: 'By kind:',
    panelPlan: 'Tidy media: building the plan',
    panelApply: 'Tidy media: moving files',
    panelPlanned: 'Tidy media: the plan is ready',
    panelDone: 'Tidy media: done',
    panelStopped: 'Tidy media: stopped',
    panelError: 'Tidy media: error',
    open: 'Open',
    hide: 'Hide',
    none: 'No media/ folders with files to move were found.',
    sum: 'Move {move} (renamed {renamed}), identical copies {dup}, conflicts {conflict}, left in place {skip}.',
    dupDelete: 'Delete identical copies ({count})',
    dupHint: 'Byte-for-byte equal to the file that stays. Off by default.',
    apply: 'Apply',
    applying: 'Applying…',
    done: 'Done: moved {moved}, deleted {deleted}, failed {failed}.',
    close: 'Close',
    'a.move': 'move',
    'a.duplicate': 'identical copy',
    'a.conflict': 'conflict: a different file is already there, left alone',
    'r.no-rom': 'no ROM with this name',
    'r.not-cover': 'not a cover (fan art, maps…)',
    'r.unknown': 'unknown media kind',
    'r.extra': 'another version of the same kind, left',
    more: '…and {count} more',
  },
  ru: {
    title: 'Упорядочить медиа (media/ Skraper)',
    intro:
      'Переносит все папки Skraper из <консоль>/media/ в раскладку проекта, переименовывает под имя рома и обновляет gamelist.xml: обложка → images/<ром>-image, скриншот → -thumb, микс → -mix, фон → -fanart, карты → -map, картридж → -cartridge, его скан → -supporttexture, Steam grid → -steamgrid, wheel → marquees/<ром>-marquee, маркиза → -screenmarquee, видео → videos/, мануал и советы → manuals/. Пока не нажата «Применить», ничего не меняется. Работает в фоне: окно можно закрыть и продолжать работу.',
    folder: 'Папка: {name}',
    noFolder: 'Папка библиотеки ещё не выбрана.',
    pick: 'Выбрать папку…',
    plan: 'Построить план',
    planning: 'Просматриваю папки media…',
    progress: '{done} из {total}',
    background: 'Продолжить в фоне',
    stop: 'Остановить',
    stopped: 'Остановлено. Уже перенесённое остаётся на новых местах.',
    error: 'Ошибка: {err}',
    kinds: 'По видам:',
    panelPlan: 'Упорядочить медиа: строю план',
    panelApply: 'Упорядочить медиа: переношу файлы',
    panelPlanned: 'Упорядочить медиа: план готов',
    panelDone: 'Упорядочить медиа: готово',
    panelStopped: 'Упорядочить медиа: остановлено',
    panelError: 'Упорядочить медиа: ошибка',
    open: 'Открыть',
    hide: 'Скрыть',
    none: 'Папок media/ с файлами для переноса не найдено.',
    sum: 'Переместить {move} (с переименованием {renamed}), одинаковых копий {dup}, конфликтов {conflict}, остаётся на месте {skip}.',
    dupDelete: 'Удалить одинаковые копии ({count})',
    dupHint: 'Совпадают байт в байт с файлом, который остаётся. По умолчанию выключено.',
    apply: 'Применить',
    applying: 'Применяю…',
    done: 'Готово: перемещено {moved}, удалено {deleted}, ошибок {failed}.',
    close: 'Закрыть',
    'a.move': 'перенос',
    'a.duplicate': 'одинаковая копия',
    'a.conflict': 'конфликт: там уже другой файл, не трогаю',
    'r.no-rom': 'нет рома с таким именем',
    'r.not-cover': 'не обложка (фон, карты…)',
    'r.unknown': 'неизвестный вид медиа',
    'r.extra': 'ещё одна версия того же вида, остаётся',
    more: '…и ещё {count}',
  },
};

const LIST_LIMIT = 300;

function useTidyStrings() {
  const { lang } = useI18n();
  const ru = lang === 'ru';
  const dict = STR[ru ? 'ru' : 'en'];
  const s = (key: string, vars: Record<string, string | number> = {}) =>
    (dict[key] || STR.en[key] || key).replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
  return { s, labels: GAME_MEDIA_LABELS[ru ? 'ru' : 'en'] };
}

const pctOf = (st: TidyRunState) => (st.total > 0 ? Math.min(100, Math.round((st.done / st.total) * 100)) : 0);

const ProgressBar: React.FC<{ st: TidyRunState }> = ({ st }) => (
  <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
    <div
      className={'h-full bg-accent transition-[width] duration-200 ' + (st.total === 0 ? 'w-1/3 animate-pulse' : '')}
      style={st.total > 0 ? { width: `${pctOf(st)}%` } : undefined}
    />
  </div>
);

interface MediaTidyModalProps {
  onClose: () => void;
  onAddLog?: (msg: string) => void;
  /** После применения: перечитать медиа библиотеки. / After apply: reload the library's media. */
  onApplied?: () => void;
}

export const MediaTidyModal: React.FC<MediaTidyModalProps> = ({ onClose, onAddLog, onApplied }) => {
  const { s, labels } = useTidyStrings();
  const st = useTidyRun();
  const busy = isTidyBusy(st);
  const plans = st.phase === 'planned' ? st.plans : null;

  const [root, setRoot] = useState<any>(null);
  const [rootName, setRootName] = useState<string>(st.rootName);
  const [deleteDup, setDeleteDup] = useState(false);
  const [note, setNote] = useState<string>('');

  const counts = useMemo(() => {
    const all = (plans || []).flatMap((p) => p.actions);
    const n = (t: NormAction['type']) => all.filter((a) => a.type === t).length;
    const byKind = new Map<GameMediaKind, number>();
    for (const a of all) if (a.type === 'move') byKind.set(a.slot, (byKind.get(a.slot) || 0) + 1);
    return {
      move: n('move'),
      renamed: all.filter((a) => a.type === 'move' && a.renamed).length,
      dup: n('duplicate'),
      conflict: n('conflict'),
      skip: n('skip'),
      byKind: Array.from(byKind.entries()).sort((a, b) => b[1] - a[1]),
    };
  }, [plans]);

  const getRoot = async (): Promise<any> => {
    if (root) return root;
    for (const key of ['library_root', 'scan_root']) {
      const rec = await loadDirectoryHandleRecord(key);
      if (!rec?.handle) continue;
      const perm = await checkOrRequestHandlePermission(rec.handle, 'readwrite', true);
      if (perm === 'granted') {
        setRoot(rec.handle);
        setRootName(rec.handle.name || rec.folderName || '');
        return rec.handle;
      }
    }
    return null;
  };

  const pickFolder = async () => {
    try {
      const h = await (window as any).showDirectoryPicker({ mode: 'readwrite' });
      setRoot(h);
      setRootName(h.name);
      resetTidyRun();
      setNote('');
    } catch {}
  };

  const buildPlan = async () => {
    setNote('');
    const r = await getRoot();
    if (!r) {
      setNote(s('noFolder'));
      return;
    }
    // Не ждём: план строится в фоне, окно показывает прогресс. / Not awaited: the plan builds in the background.
    void startTidyPlan(r);
  };

  const apply = () => {
    void startTidyApply({
      deleteDuplicates: deleteDup,
      onApplied: () => onApplied?.(),
    }).then(() => {
      const after = getTidyRun();
      if (after.result) onAddLog?.(`🗂 ${s('done', after.result)}${after.phase === 'stopped' ? ` (${s('stop')})` : ''}`);
    });
  };

  const describe = (a: NormAction) => {
    if (a.type === 'skip') return s(`r.${a.reason}`);
    return `${s(`a.${a.type}`)} → ${a.to}`;
  };

  const rows = (plans || []).flatMap((p) => p.actions.map((a) => ({ console: p.path, a })));
  const ordered = [
    ...rows.filter((r) => r.a.type === 'move'),
    ...rows.filter((r) => r.a.type === 'duplicate'),
    ...rows.filter((r) => r.a.type === 'conflict'),
    ...rows.filter((r) => r.a.type === 'skip'),
  ];

  const resultText =
    st.phase === 'done' && st.result
      ? s('done', st.result)
      : st.phase === 'stopped'
      ? `${s('stopped')}${st.result ? ' ' + s('done', st.result) : ''}`
      : st.phase === 'error'
      ? s('error', { err: st.error })
      : '';

  return (
    <div
      className="fixed inset-0 z-[90] bg-black/60 flex items-stretch sm:items-center justify-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={s('title')}
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-900 w-full sm:max-w-3xl h-full sm:h-auto sm:max-h-[88vh] sm:rounded-xl shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        data-testid="media-tidy"
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200 dark:border-slate-800">
          <Wand2 className="w-4 h-4 text-slate-500 shrink-0" />
          <h2 className="flex-1 min-w-0 truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{s('title')}</h2>
          <button
            type="button"
            onClick={onClose}
            title={busy ? s('background') : s('close')}
            className="w-8 h-8 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 flex items-center justify-center cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-4 py-3 space-y-3 text-sm text-slate-700 dark:text-slate-200 overflow-y-auto">
          <p className="text-xs text-slate-500 dark:text-slate-400">{s('intro')}</p>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-mono text-slate-600 dark:text-slate-300 truncate max-w-full">
              {rootName ? s('folder', { name: rootName }) : ''}
            </span>
            {typeof (window as any).showDirectoryPicker === 'function' && (
              <button
                type="button"
                onClick={pickFolder}
                disabled={busy}
                className="h-8 px-3 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold flex items-center gap-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer disabled:opacity-50"
              >
                <FolderOpen className="w-3.5 h-3.5" />
                {s('pick')}
              </button>
            )}
            <button
              type="button"
              onClick={() => void buildPlan()}
              disabled={busy}
              data-testid="media-tidy-plan"
              className="h-8 px-3 rounded-lg bg-accent hover:bg-accent-hover text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {st.phase === 'planning' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {st.phase === 'planning' ? s('planning') : s('plan')}
            </button>
          </div>

          {busy && (
            <div className="space-y-1.5" data-testid="media-tidy-progress">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="font-semibold">
                  {st.phase === 'planning' ? s('planning') : s('applying')}{' '}
                  {st.total > 0 && <span className="text-slate-500">{s('progress', { done: st.done, total: st.total })}</span>}
                </span>
                <span className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={onClose}
                    className="h-7 px-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    {s('background')}
                  </button>
                  <button
                    type="button"
                    onClick={stopTidyRun}
                    className="h-7 px-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                  >
                    {s('stop')}
                  </button>
                </span>
              </div>
              <ProgressBar st={st} />
              {st.current && <p className="text-[11px] font-mono text-slate-500 truncate">{st.current}</p>}
            </div>
          )}

          {note && <p className="text-xs">{note}</p>}
          {plans && plans.length === 0 && <p className="text-xs">{s('none')}</p>}

          {plans && plans.length > 0 && (
            <>
              <p className="text-xs font-semibold" data-testid="media-tidy-summary">
                {s('sum', { move: counts.move, renamed: counts.renamed, dup: counts.dup, conflict: counts.conflict, skip: counts.skip })}
              </p>
              {counts.byKind.length > 0 && (
                <p className="text-xs text-slate-600 dark:text-slate-300">
                  {s('kinds')}{' '}
                  {counts.byKind.map(([k, n]) => `${labels[k] || k} ${n}`).join(' · ')}
                </p>
              )}
              <ul className="text-[11px] font-mono border border-slate-200 dark:border-slate-800 rounded-lg divide-y divide-slate-100 dark:divide-slate-800 max-h-[45vh] overflow-y-auto">
                {ordered.slice(0, LIST_LIMIT).map(({ console: c, a }, i) => (
                  <li
                    key={i}
                    className={
                      'px-2 py-1 break-all ' +
                      (a.type === 'move'
                        ? ''
                        : a.type === 'duplicate'
                        ? 'text-amber-700 dark:text-amber-400'
                        : a.type === 'conflict'
                        ? 'text-rose-700 dark:text-rose-400'
                        : 'text-slate-400')
                    }
                  >
                    {c}/{a.from} — {describe(a)}
                  </li>
                ))}
                {ordered.length > LIST_LIMIT && (
                  <li className="px-2 py-1 text-slate-500">{s('more', { count: ordered.length - LIST_LIMIT })}</li>
                )}
              </ul>
              {counts.dup > 0 && (
                <label className="flex items-start gap-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={deleteDup}
                    onChange={(e) => setDeleteDup(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span>
                    {s('dupDelete', { count: counts.dup })}
                    <span className="block text-slate-500 dark:text-slate-400">{s('dupHint')}</span>
                  </span>
                </label>
              )}
            </>
          )}

          {resultText && <p className="text-xs font-semibold" data-testid="media-tidy-result">{resultText}</p>}
        </div>

        {plans && plans.length > 0 && (
          <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-800 flex justify-end">
            <button
              type="button"
              onClick={apply}
              disabled={busy || counts.move + (deleteDup ? counts.dup : 0) === 0}
              data-testid="media-tidy-apply"
              className="h-9 px-4 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {s('apply')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * Плашка в углу: прогресс фоновой операции, «Остановить», «Открыть» (вернуть окно).
 * Corner panel: background progress, Stop, Open (bring the window back).
 */
export const MediaTidyRunPanel: React.FC<{ windowOpen: boolean; onOpen: () => void }> = ({ windowOpen, onOpen }) => {
  const { s } = useTidyStrings();
  const st = useTidyRun();
  if (windowOpen || st.phase === 'idle' || st.panelHidden) return null;
  const busy = isTidyBusy(st);
  const title =
    st.phase === 'planning'
      ? s('panelPlan')
      : st.phase === 'applying'
      ? s('panelApply')
      : st.phase === 'planned'
      ? s('panelPlanned')
      : st.phase === 'done'
      ? s('panelDone')
      : st.phase === 'stopped'
      ? s('panelStopped')
      : s('panelError');
  const detail =
    st.phase === 'done' && st.result
      ? s('done', st.result)
      : st.phase === 'error'
      ? s('error', { err: st.error })
      : st.phase === 'stopped'
      ? s('stopped')
      : '';
  return (
    <div
      className="fixed z-50 bottom-12 left-4 w-[min(360px,calc(100vw-2rem))] bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl p-3 space-y-2"
      role="status"
      aria-live="polite"
      data-testid="media-tidy-panel"
    >
      <div className="flex items-center gap-2 text-sm font-semibold min-w-0">
        {busy ? (
          <Loader2 className="w-4 h-4 animate-spin shrink-0 text-accent dark:text-accent-dark" />
        ) : st.phase === 'done' || st.phase === 'planned' ? (
          <Check className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
        ) : (
          <Square className="w-4 h-4 shrink-0 text-slate-500" />
        )}
        <span className="truncate flex-1">{title}</span>
        {busy && st.total > 0 && (
          <span className="text-xs font-normal text-slate-500 shrink-0">{s('progress', { done: st.done, total: st.total })}</span>
        )}
      </div>
      {busy && <ProgressBar st={st} />}
      {busy && st.current && <p className="text-[11px] font-mono text-slate-500 truncate">{st.current}</p>}
      {detail && <p className="text-xs text-slate-600 dark:text-slate-300">{detail}</p>}
      <div className="flex items-center justify-end gap-1.5">
        <button
          type="button"
          onClick={onOpen}
          className="h-7 px-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
        >
          {s('open')}
        </button>
        {busy ? (
          <button
            type="button"
            onClick={stopTidyRun}
            className="h-7 px-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
          >
            {s('stop')}
          </button>
        ) : (
          <button
            type="button"
            onClick={hideTidyPanel}
            className="h-7 px-2.5 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            {s('hide')}
          </button>
        )}
      </div>
    </div>
  );
};
