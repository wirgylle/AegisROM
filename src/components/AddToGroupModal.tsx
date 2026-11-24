import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Layers, LibraryBig, Plus, Search, Undo2, X } from 'lucide-react';
import { useI18n } from '../i18n/translations';
import { addRomsToGroup, buildGroupOptions, filterGroupOptions, hasExactGroup, undoAddRoms, type AddUndo, type GroupOption } from '../utils/addToGroup';
import { gameKeyOf, getManualGroupsState, removeFromManualGroup, type GroupRowLike, type ManualGroupKind } from '../utils/manualGroups';
import { useManualGroupsVersion } from './useManualGroups';

// Окно «В коллекцию или серию»: поиск по названию группы, выбор, создание новой, отмена.
// "Add to collection or series" window: search groups by name, pick, create a new one, undo.

interface Props<T extends GroupRowLike> {
  /** Вся Библиотека после applyManualGroups. / The whole Library after applyManualGroups. */
  games: readonly T[];
  /** Ромы, которые добавляем (обычно все версии одной игры). / ROMs to add (usually all versions of one game). */
  targets: readonly T[];
  onClose: () => void;
  onLog?: (msg: string) => void;
}

const MAX_SHOWN = 150;

const btn =
  'h-8 px-3 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition disabled:opacity-50 disabled:cursor-default';
const btnPrimary = `${btn} bg-accent text-white hover:opacity-90`;
const btnGhost = `${btn} border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800`;

const KindIcon: React.FC<{ kind: ManualGroupKind; className?: string }> = ({ kind, className }) =>
  kind === 'series' ? <LibraryBig className={className} /> : <Layers className={className} />;

type Row = { type: 'option'; option: GroupOption } | { type: 'create'; kind: ManualGroupKind };

export function AddToGroupModal<T extends GroupRowLike>({ games, targets, onClose, onLog }: Props<T>) {
  const { t, tf } = useI18n();
  const version = useManualGroupsVersion();
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<ManualGroupKind | 'all'>('all');
  const [active, setActive] = useState(0);
  const [result, setResult] = useState<{ undo: AddUndo | null; text: string } | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const targetIds = useMemo(() => targets.map((g) => g.id), [targets]);
  const targetKeys = useMemo(() => Array.from(new Set(targets.map((g) => gameKeyOf(g)))), [targets]);
  const lead = targets[0];
  const options = useMemo(
    () => buildGroupOptions(games, getManualGroupsState(), targetIds),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [games, targetIds, version]
  );
  const current = useMemo(() => options.filter((o) => o.contains), [options]);
  const hits = useMemo(() => filterGroupOptions(options, query, kind), [options, query, kind]);
  const name = query.trim();
  const rows: Row[] = useMemo(() => {
    const out: Row[] = hits.slice(0, MAX_SHOWN).map((option) => ({ type: 'option' as const, option }));
    if (name) {
      // Создать новую, если ровно такой группы нет. / Create a new one unless the exact group exists.
      const kinds: ManualGroupKind[] = kind === 'all' ? ['series', 'collection'] : [kind];
      for (const k of kinds) if (!hasExactGroup(options, name, k)) out.push({ type: 'create', kind: k });
    }
    return out;
  }, [hits, name, kind, options]);

  useEffect(() => setActive(0), [query, kind]);
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!lead) return null;

  const kindWord = (k: ManualGroupKind) => t(`atg.kindWord.${k}`);
  const finish = (undo: AddUndo | null, groupName: string, k: ManualGroupKind) => {
    if (!undo) return;
    setResult({ undo, text: tf('atg.added', { kind: kindWord(k), name: groupName }) });
    onLog?.(tf('atg.log', { game: lead.title, kind: kindWord(k), name: groupName }));
  };

  const pick = (r: Row) => {
    if (r.type === 'create') {
      finish(addRomsToGroup(getManualGroupsState(), targetKeys, { create: r.kind, name }), name, r.kind);
      return;
    }
    if (r.option.contains) return;
    finish(addRomsToGroup(getManualGroupsState(), targetKeys, { option: r.option }), r.option.name, r.option.kind);
  };

  const remove = (o: GroupOption) => {
    if (!o.groupId) return;
    removeFromManualGroup(o.groupId, targetKeys);
    setResult({ undo: null, text: tf('atg.removed', { name: o.name }) });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(rows.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const r = rows[active];
      if (r) pick(r);
    }
  };

  const kindBtn = (id: ManualGroupKind | 'all', label: string) => (
    <button
      key={id}
      type="button"
      onClick={() => setKind(id)}
      aria-pressed={kind === id}
      className={`h-7 px-2.5 rounded-md text-xs font-semibold transition cursor-pointer ${
        kind === id
          ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-2xs'
          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
      }`}
    >
      {label}
    </button>
  );

  const countText = (o: GroupOption) => (o.count > 0 ? tf(o.kind === 'series' ? 'atg.count.series' : 'atg.count.collection', { count: o.count }) : '');

  return (
    <div
      className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={t('atg.title')}
    >
      <div
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full max-h-[85vh] overflow-hidden flex flex-col shadow-2xl text-xs"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 pt-4 pb-3 border-b border-slate-200 dark:border-slate-800 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">{t('atg.title')}</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate" title={lead.title}>
                {targets.length > 1 ? tf('atg.subtitleMany', { name: lead.title, count: targets.length }) : tf('atg.subtitleOne', { name: lead.title })}
              </p>
            </div>
            <button type="button" onClick={onClose} aria-label={t('atg.cancel')} className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 text-slate-600 dark:text-slate-300">
            <span className="font-semibold">{t('atg.now')}</span>
            {current.length === 0 ? (
              <span className="text-slate-500">{t('atg.nowNone')}</span>
            ) : (
              current.map((o) => (
                <span key={o.id} className="inline-flex items-center gap-1 h-6 px-2 rounded-md bg-accent/10 text-accent dark:text-accent-dark font-semibold max-w-full">
                  <KindIcon kind={o.kind} className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{o.name}</span>
                  {o.source === 'auto' && <span className="font-normal opacity-70">· {t('atg.auto')}</span>}
                </span>
              ))
            )}
          </div>

          <div className="relative">
            <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              autoFocus
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setResult(null);
              }}
              onKeyDown={onKeyDown}
              placeholder={t('atg.search')}
              aria-label={t('atg.search')}
              className="w-full h-9 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg pl-8 pr-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
            />
          </div>
          <div className="flex items-center gap-0.5 p-0.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 w-fit" role="group">
            {kindBtn('all', t('atg.kind.all'))}
            {kindBtn('collection', t('atg.kind.collection'))}
            {kindBtn('series', t('atg.kind.series'))}
          </div>
        </div>

        <ul ref={listRef} className="flex-1 min-h-0 overflow-y-auto py-1" role="listbox" aria-label={t('atg.title')}>
          {rows.length === 0 && (
            <li className="px-4 py-6 text-center text-slate-500">{options.length === 0 ? t('atg.emptyAll') : t('atg.empty')}</li>
          )}
          {rows.map((r, i) => {
            const isActive = i === active;
            const base = `w-full flex items-center gap-2.5 px-4 py-2 text-left transition ${isActive ? 'bg-slate-100 dark:bg-slate-800' : ''}`;
            if (r.type === 'create') {
              return (
                <li key={`create:${r.kind}`} data-idx={i} role="option" aria-selected={isActive} className="border-t border-slate-100 dark:border-slate-800 first:border-t-0">
                  <button type="button" className={`${base} cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800`} onMouseEnter={() => setActive(i)} onClick={() => pick(r)}>
                    <span className="w-7 h-7 rounded-md bg-accent text-white flex items-center justify-center shrink-0">
                      <Plus className="w-4 h-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block font-semibold text-slate-900 dark:text-slate-100 truncate">
                        {tf(r.kind === 'series' ? 'atg.createSeries' : 'atg.createCollection', { name })}
                      </span>
                      <span className="block text-slate-500 truncate">{t(`atg.hint.${r.kind}`)}</span>
                    </span>
                  </button>
                </li>
              );
            }
            const o = r.option;
            return (
              <li key={o.id} data-idx={i} role="option" aria-selected={isActive} aria-disabled={o.contains} className="flex items-center">
                <button
                  type="button"
                  className={`${base} min-w-0 ${o.contains ? 'cursor-default' : 'cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(r)}
                  title={o.source === 'auto' ? t('atg.autoHint') : undefined}
                >
                  <span
                    className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${
                      o.kind === 'series'
                        ? 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300'
                        : 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300'
                    }`}
                  >
                    <KindIcon kind={o.kind} className="w-4 h-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 min-w-0">
                      <span className="font-semibold text-slate-900 dark:text-slate-100 truncate">{o.name}</span>
                      {o.source === 'auto' && (
                        <span className="shrink-0 px-1 rounded border border-slate-300 dark:border-slate-600 text-[10px] text-slate-500">{t('atg.auto')}</span>
                      )}
                    </span>
                    <span className="block text-slate-500 truncate">
                      {t(`mg.kind.${o.kind}`)}
                      {countText(o) ? ` · ${countText(o)}` : ''}
                      {o.consoles.length > 0 ? ` · ${o.consoles.slice(0, 4).join(', ')}${o.consoles.length > 4 ? '…' : ''}` : ''}
                    </span>
                  </span>
                  {o.contains && (
                    <span className="shrink-0 inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-semibold">
                      <Check className="w-3.5 h-3.5" />
                      {t('atg.here')}
                    </span>
                  )}
                </button>
                {o.contains && o.source === 'manual' && (
                  <button type="button" className={`${btnGhost} h-7 px-2 mr-3 shrink-0`} onClick={() => remove(o)}>
                    {t('atg.remove')}
                  </button>
                )}
              </li>
            );
          })}
          {hits.length > MAX_SHOWN && (
            <li className="px-4 py-2 text-slate-500">{tf('atg.more', { shown: MAX_SHOWN, count: hits.length })}</li>
          )}
        </ul>

        <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-800 flex items-center gap-2">
          {result ? (
            <span className="flex-1 min-w-0 flex items-center gap-2 text-emerald-700 dark:text-emerald-400 font-semibold" role="status">
              <Check className="w-4 h-4 shrink-0" />
              <span className="truncate">{result.text}</span>
              {result.undo && (
                <button
                  type="button"
                  className={`${btnGhost} h-7 px-2 shrink-0`}
                  onClick={() => {
                    if (result.undo) undoAddRoms(result.undo);
                    setResult({ undo: null, text: t('atg.undone') });
                  }}
                >
                  <Undo2 className="w-3.5 h-3.5" />
                  {t('atg.undo')}
                </button>
              )}
            </span>
          ) : (
            <span className="flex-1" />
          )}
          <button type="button" className={result ? btnPrimary : btnGhost} onClick={onClose}>
            {result ? t('atg.done') : t('atg.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}
