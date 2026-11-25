import React, { useMemo, useState } from 'react';
import { FolderOpen, Loader2, Wand2, X } from 'lucide-react';
import { useI18n } from '../i18n/translations';
import { checkOrRequestHandlePermission, loadDirectoryHandleRecord } from '../utils/persistentHandles';
import {
  applyConsolePlan,
  findConsoleDirsWithMedia,
  planConsoleMedia,
  type ConsoleNormPlan,
  type NormAction,
} from '../utils/mediaNormalize';

// Окно «Упорядочить медиа»: план переноса media/* Skraper в images/marquees/videos/manuals
// с переименованием под ром, предпросмотр и применение. Дубли удаляются только по галочке.
// "Tidy media" window: a plan to move Skraper media/* into images/marquees/videos/manuals,
// renamed after the ROM, a preview and apply. Duplicates are deleted only when ticked.

// Строки здесь, а не в общих словарях, чтобы не конфликтовать с параллельными ветками.
// Strings live here, not in the shared dictionaries, to avoid conflicts with parallel branches.
const STR: Record<'en' | 'ru', Record<string, string>> = {
  en: {
    title: 'Tidy media (Skraper media/)',
    intro:
      'Moves files from <console>/media/<kind>/ into images/<ROM>-image, images/<ROM>-thumb, marquees/<ROM>-marquee, videos/<ROM>-video and manuals/<ROM>.pdf, renames them after the ROM and updates gamelist.xml. Nothing changes until you press Apply.',
    folder: 'Folder: {name}',
    noFolder: 'No library folder saved yet.',
    pick: 'Choose folder…',
    plan: 'Build the plan',
    planning: 'Looking through media folders…',
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
      'Переносит файлы из <консоль>/media/<вид>/ в images/<ром>-image, images/<ром>-thumb, marquees/<ром>-marquee, videos/<ром>-video и manuals/<ром>.pdf, переименовывает под имя рома и обновляет gamelist.xml. Пока не нажата «Применить», ничего не меняется.',
    folder: 'Папка: {name}',
    noFolder: 'Папка библиотеки ещё не выбрана.',
    pick: 'Выбрать папку…',
    plan: 'Построить план',
    planning: 'Просматриваю папки media…',
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

interface MediaTidyModalProps {
  onClose: () => void;
  onAddLog?: (msg: string) => void;
  /** После применения: перечитать медиа библиотеки. / After apply: reload the library's media. */
  onApplied?: () => void;
}

export const MediaTidyModal: React.FC<MediaTidyModalProps> = ({ onClose, onAddLog, onApplied }) => {
  const { lang } = useI18n();
  const dict = STR[lang === 'ru' ? 'ru' : 'en'];
  const s = (key: string, vars: Record<string, string | number> = {}) =>
    (dict[key] || STR.en[key] || key).replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));

  const [root, setRoot] = useState<any>(null);
  const [rootName, setRootName] = useState<string>('');
  const [busy, setBusy] = useState<'' | 'plan' | 'apply'>('');
  const [plans, setPlans] = useState<ConsoleNormPlan[] | null>(null);
  const [deleteDup, setDeleteDup] = useState(false);
  const [result, setResult] = useState<string>('');

  const counts = useMemo(() => {
    const all = (plans || []).flatMap((p) => p.actions);
    const n = (t: NormAction['type']) => all.filter((a) => a.type === t).length;
    return {
      move: n('move'),
      renamed: all.filter((a) => a.type === 'move' && a.renamed).length,
      dup: n('duplicate'),
      conflict: n('conflict'),
      skip: n('skip'),
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
      setPlans(null);
      setResult('');
    } catch {}
  };

  const buildPlan = async () => {
    setResult('');
    setBusy('plan');
    try {
      const r = await getRoot();
      if (!r) {
        setResult(s('noFolder'));
        return;
      }
      const consoles = await findConsoleDirsWithMedia(r);
      const out: ConsoleNormPlan[] = [];
      for (const c of consoles) {
        const p = await planConsoleMedia(c.dir as any, c.path || r.name);
        if (p.actions.length) out.push(p);
      }
      setPlans(out);
    } finally {
      setBusy('');
    }
  };

  const apply = async () => {
    if (!plans) return;
    setBusy('apply');
    let moved = 0;
    let deleted = 0;
    let failed = 0;
    try {
      for (const p of plans) {
        const r = await applyConsolePlan(p, { deleteDuplicates: deleteDup });
        moved += r.moved;
        deleted += r.deleted;
        failed += r.failed;
      }
      const msg = s('done', { moved, deleted, failed });
      setResult(msg);
      onAddLog?.(`🗂 ${msg}`);
      setPlans(null);
      onApplied?.();
    } finally {
      setBusy('');
    }
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

  return (
    <div
      className="fixed inset-0 z-[90] bg-black/60 flex items-stretch sm:items-center justify-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={s('title')}
      onClick={busy ? undefined : onClose}
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
            disabled={Boolean(busy)}
            title={s('close')}
            className="w-8 h-8 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 flex items-center justify-center cursor-pointer disabled:opacity-50"
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
                disabled={Boolean(busy)}
                className="h-8 px-3 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold flex items-center gap-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer disabled:opacity-50"
              >
                <FolderOpen className="w-3.5 h-3.5" />
                {s('pick')}
              </button>
            )}
            <button
              type="button"
              onClick={() => void buildPlan()}
              disabled={Boolean(busy)}
              data-testid="media-tidy-plan"
              className="h-8 px-3 rounded-lg bg-accent hover:bg-accent-hover text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {busy === 'plan' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {busy === 'plan' ? s('planning') : s('plan')}
            </button>
          </div>

          {plans && plans.length === 0 && <p className="text-xs">{s('none')}</p>}

          {plans && plans.length > 0 && (
            <>
              <p className="text-xs font-semibold" data-testid="media-tidy-summary">
                {s('sum', counts)}
              </p>
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

          {result && <p className="text-xs font-semibold" data-testid="media-tidy-result">{result}</p>}
        </div>

        {plans && plans.length > 0 && (
          <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-800 flex justify-end">
            <button
              type="button"
              onClick={() => void apply()}
              disabled={Boolean(busy) || counts.move + (deleteDup ? counts.dup : 0) === 0}
              data-testid="media-tidy-apply"
              className="h-9 px-4 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {busy === 'apply' && <Loader2 className="w-4 h-4 animate-spin" />}
              {busy === 'apply' ? s('applying') : s('apply')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
