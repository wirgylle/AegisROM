import React, { useEffect, useMemo, useState } from 'react';
import { Filter, X } from 'lucide-react';
import { useI18n } from '../i18n/translations';
import {
  buildScopeFacets,
  emptyScope,
  filterRowsByScope,
  isWholeLibrary,
  type OperationScope,
  type ScopeFacet,
  type ScopeOperation,
  type ScopeRow,
} from '../utils/operationScope';
import { clearProcessed, loadLastScope, loadProcessedIds, saveLastScope } from '../utils/operationScopeStore';

// Общее окно «На чём запускать» для любой операции (скраппер, переименование, 1G1R и др.).
// Пользователь сужает список записей базы, окно возвращает их id. Что делать с ними, решает операция.
// Свои настройки операции (например, типы медиа скраппера) передаются в extra.
//
// Shared "What to run on" window for any operation (scraper, rename, 1G1R and others).
// The user narrows the database records, the window returns their ids. The operation decides what
// to do with them. Operation-specific settings (e.g. the scraper's media types) go into extra.

export interface OperationScopeModalProps<T extends ScopeRow = ScopeRow> {
  open: boolean;
  operation: ScopeOperation;
  /** Записи открытой базы. / Records of the open database. */
  rows: readonly T[];
  /** Заголовок вместо стандартного названия операции. / Title instead of the default operation name. */
  title?: string;
  /** Свои настройки операции под фильтрами. / Operation-specific settings under the filters. */
  extra?: React.ReactNode;
  /** Есть ли у записи медиа (для «только без медиа»). / Whether a record has media (for "only without media"). */
  hasMedia?: (row: T) => boolean;
  busy?: boolean;
  onConfirm: (ids: string[], scope: OperationScope) => void;
  onClose: () => void;
}

const GAME_LIST_LIMIT = 60;

function toggle(list: string[], key: string): string[] {
  return list.includes(key) ? list.filter((k) => k !== key) : [...list, key];
}

const Chip: React.FC<{ facet: ScopeFacet; active: boolean; onClick: () => void }> = ({ facet, active, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    className={`px-2 py-1 rounded-lg border text-[11px] font-semibold cursor-pointer max-w-full truncate ${
      active
        ? 'bg-blue-600 border-blue-600 text-white'
        : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
    }`}
    title={facet.label}
  >
    {facet.label} <span className={active ? 'text-blue-100' : 'text-slate-400'}>{facet.count}</span>
  </button>
);

export function OperationScopeModal<T extends ScopeRow>({
  open,
  operation,
  rows,
  title,
  extra,
  hasMedia,
  busy,
  onConfirm,
  onClose,
}: OperationScopeModalProps<T>) {
  const { t, tf } = useI18n();
  const [scope, setScope] = useState<OperationScope>(emptyScope);
  const [mode, setMode] = useState<'whole' | 'custom'>('whole');
  const [query, setQuery] = useState('');
  const [processedVersion, setProcessedVersion] = useState(0);

  useEffect(() => {
    if (!open) return;
    const last = loadLastScope(operation);
    setScope(last);
    setMode(isWholeLibrary(last) ? 'whole' : 'custom');
    setQuery('');
  }, [open, operation]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const facets = useMemo(() => (open ? buildScopeFacets(rows) : null), [open, rows]);
  const processed = useMemo(() => loadProcessedIds(operation), [operation, processedVersion, open]);
  const effective = useMemo(() => (mode === 'whole' ? emptyScope() : scope), [mode, scope]);
  const selected = useMemo(
    () => (open ? filterRowsByScope(rows, effective, { processedIds: processed, hasMedia }) : []),
    [open, rows, effective, processed, hasMedia]
  );

  const q = query.trim().toLowerCase();
  const gameMatches = useMemo(() => {
    if (!q) return [] as T[];
    return rows.filter((r) => String(r.title || '').toLowerCase().includes(q));
  }, [rows, q]);
  const matchFacet = (f: ScopeFacet) => !q || f.label.toLowerCase().includes(q);

  if (!open || !facets) return null;

  const set = (patch: Partial<OperationScope>) => {
    setMode('custom');
    setScope((prev) => ({ ...prev, ...patch }));
  };
  const opName = title || t(`scope.op.${operation}`);
  const doneCount = (processed as unknown as { size: number }).size || 0;

  const section = (label: string, list: ScopeFacet[], value: string[], key: keyof OperationScope, filter = false) => {
    const shown = filter ? list.filter(matchFacet) : list;
    if (list.length === 0) return null;
    return (
      <div className="space-y-1.5">
        <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
          {label} {value.length === 0 && <span className="normal-case font-normal">· {t('scope.any')}</span>}
        </div>
        <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
          {shown.slice(0, 200).map((f) => (
            <Chip
              key={f.key}
              facet={f}
              active={value.includes(f.key)}
              onClick={() => set({ [key]: toggle(value, f.key) } as Partial<OperationScope>)}
            />
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-2xl w-full max-h-[88vh] overflow-hidden flex flex-col shadow-2xl">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between gap-3">
          <div className="flex items-start gap-2 min-w-0">
            <Filter className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                {opName}: {t('scope.title')}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {tf('scope.result', { count: selected.length, total: rows.length })}
              </p>
            </div>
          </div>
          <button onClick={onClose} aria-label={t('scope.cancel')} className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-3 space-y-3 text-xs">
          <div className="inline-flex rounded-lg border border-slate-300 dark:border-slate-700 overflow-hidden">
            {(['whole', 'custom'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                aria-pressed={mode === m}
                className={`px-3 py-1.5 font-semibold cursor-pointer ${
                  mode === m
                    ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                    : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200'
                }`}
              >
                {t(m === 'whole' ? 'scope.whole' : 'scope.custom')}
              </button>
            ))}
          </div>

          <div className={`space-y-3 ${mode === 'whole' ? 'opacity-60' : ''}`}>
            {section(t('scope.consoles'), facets.consoles, scope.consoles, 'consoles')}
            {section(t('scope.bitness'), facets.bitness, scope.bitness, 'bitness')}
            {facets.folders.length > 1 && section(t('scope.folders'), facets.folders, scope.folders, 'folders')}

            <div className="space-y-1.5">
              <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">{t('scope.picks')}</div>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('scope.searchPh')}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
              />
            </div>
            {section(t('scope.series'), facets.series, scope.seriesKeys, 'seriesKeys', true)}
            {section(t('scope.collections'), facets.collections, scope.collectionKeys, 'collectionKeys', true)}
            {(gameMatches.length > 0 || scope.gameIds.length > 0) && (
              <div className="space-y-1.5">
                <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">{t('scope.games')}</div>
                <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                  {[
                    ...rows.filter((r) => scope.gameIds.includes(r.id) && !gameMatches.slice(0, GAME_LIST_LIMIT).includes(r)),
                    ...gameMatches.slice(0, GAME_LIST_LIMIT),
                  ].map((r) => (
                    <Chip
                      key={r.id}
                      facet={{ key: r.id, label: `${r.title} · ${String(r.consoleShort).toUpperCase()}`, count: 1 }}
                      active={scope.gameIds.includes(r.id)}
                      onClick={() => set({ gameIds: toggle(scope.gameIds, r.id) })}
                    />
                  ))}
                  {gameMatches.length > GAME_LIST_LIMIT && (
                    <span className="text-slate-400 self-center">{tf('scope.more', { count: gameMatches.length - GAME_LIST_LIMIT })}</span>
                  )}
                </div>
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="w-3.5 h-3.5 accent-blue-600"
                  checked={scope.onlyMissingMedia}
                  onChange={(e) => set({ onlyMissingMedia: e.target.checked })}
                />
                <span>{t('scope.onlyMissingMedia')}</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer flex-wrap">
                <input
                  type="checkbox"
                  className="w-3.5 h-3.5 accent-blue-600"
                  checked={scope.onlyNew}
                  onChange={(e) => set({ onlyNew: e.target.checked })}
                />
                <span>{t('scope.onlyNew')}</span>
                {doneCount > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      clearProcessed(operation);
                      setProcessedVersion((v) => v + 1);
                    }}
                    className="text-blue-600 dark:text-blue-400 underline cursor-pointer"
                  >
                    {tf('scope.onlyNewReset', { count: doneCount })}
                  </button>
                )}
              </label>
            </div>

            {mode === 'custom' && !isWholeLibrary(scope) && (
              <button
                type="button"
                onClick={() => setScope(emptyScope())}
                className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 underline cursor-pointer"
              >
                {t('scope.clear')}
              </button>
            )}
          </div>

          {extra && <div className="pt-2 border-t border-slate-200 dark:border-slate-800">{extra}</div>}
        </div>

        <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 flex flex-wrap justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            {t('scope.cancel')}
          </button>
          <button
            disabled={busy || selected.length === 0}
            onClick={() => {
              saveLastScope(operation, mode === 'whole' ? emptyScope() : scope);
              onConfirm(
                selected.map((r) => r.id),
                effective
              );
            }}
            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {tf('scope.run', { count: selected.length })}
          </button>
        </div>
      </div>
    </div>
  );
}
