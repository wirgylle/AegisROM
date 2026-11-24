import React, { useEffect, useMemo, useState } from 'react';
import { Check, Layers, LibraryBig, Plus, Search, Trash2, Undo2, X } from 'lucide-react';
import { useI18n } from '../i18n/translations';
import {
  acceptSuggestion,
  addToManualGroup,
  createManualGroup,
  deleteManualGroup,
  gameKeyOf,
  getManualGroupsState,
  rejectSuggestion,
  removeFromManualGroup,
  renameManualGroup,
  setDetached,
  type GroupSuggestion,
  type ManualGroupKind,
  type SuggestionEdit,
} from '../utils/manualGroups';
import { useManualGroupsVersion } from './useManualGroups';

// Окно «Коллекции и серии»: свои группы, предложения после скана и вынутые из автогрупп игры.
// "Collections and series" window: own groups, suggestions after a scan, games taken out of auto groups.

export interface ManualGroupsGame {
  id: string;
  title: string;
  consoleShort: string;
  crc32?: string;
  region?: string;
  year?: number;
}

type Tab = 'groups' | 'suggest' | 'detached';
type SuggestFilter = 'all' | 'series' | 'collection';

interface Props {
  games: readonly ManualGroupsGame[];
  checkedIds: readonly string[];
  suggestions: readonly GroupSuggestion[];
  initialTab?: Tab;
  onClose: () => void;
  onLog?: (msg: string) => void;
}

const btn =
  'h-8 px-3 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition disabled:opacity-50 disabled:cursor-default';
const btnPrimary = `${btn} bg-accent text-white hover:opacity-90`;
const btnGhost = `${btn} border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800`;
const inputCls =
  'w-full h-8 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20';

const KindIcon: React.FC<{ kind: ManualGroupKind; className?: string }> = ({ kind, className }) =>
  kind === 'series' ? <LibraryBig className={className} /> : <Layers className={className} />;

const GameLine: React.FC<{ g: ManualGroupsGame; right?: React.ReactNode; checked?: boolean; onCheck?: (on: boolean) => void }> = ({ g, right, checked, onCheck }) => (
  <li className={`flex items-center gap-2 px-3 py-1.5 ${checked === false ? 'opacity-50' : ''}`}>
    {onCheck ? (
      <input
        type="checkbox"
        checked={checked !== false}
        onChange={(e) => onCheck(e.target.checked)}
        aria-label={g.title}
        className="accent-[var(--color-accent,#2563eb)] shrink-0 cursor-pointer"
      />
    ) : null}
    <span className="px-1.5 py-0.5 rounded bg-slate-900 text-white dark:bg-slate-700 font-mono font-semibold text-[10px] shrink-0">
      {g.consoleShort}
    </span>
    <span className="truncate flex-1 text-slate-800 dark:text-slate-100" title={g.title}>
      {g.title}
    </span>
    {g.year ? <span className="text-slate-500 tabular-nums shrink-0">{g.year}</span> : null}
    {right}
  </li>
);

export const ManualGroupsModal: React.FC<Props> = ({ games, checkedIds, suggestions, initialTab, onClose, onLog }) => {
  const { t, tf } = useI18n();
  useManualGroupsVersion();
  const state = getManualGroupsState();
  const [tab, setTab] = useState<Tab>(initialTab || (suggestions.length > 0 ? 'suggest' : 'groups'));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState<ManualGroupKind | null>(null);
  const [newName, setNewName] = useState('');
  const [withChecked, setWithChecked] = useState(false);
  const [query, setQuery] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [edits, setEdits] = useState<Record<string, SuggestionEdit>>({});
  const [filter, setFilter] = useState<SuggestFilter>('all');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const byKey = useMemo(() => {
    const m = new Map<string, ManualGroupsGame[]>();
    for (const g of games) {
      const k = gameKeyOf(g);
      const arr = m.get(k);
      if (arr) arr.push(g);
      else m.set(k, [g]);
    }
    return m;
  }, [games]);
  const byId = useMemo(() => new Map(games.map((g) => [g.id, g])), [games]);
  const checkedKeys = useMemo(
    () => Array.from(new Set(checkedIds.map((id) => byId.get(id)).filter(Boolean).map((g) => gameKeyOf(g!)))),
    [checkedIds, byId]
  );

  const groups = [...state.groups].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  const selected = groups.find((g) => g.id === selectedId) || groups[0] || null;
  const detachedKeys = Object.keys(state.detached);

  const create = () => {
    if (!creating) return;
    const name = newName.trim();
    if (!name) return;
    const id = createManualGroup(creating, name, withChecked ? checkedKeys : []);
    setSelectedId(id);
    setCreating(null);
    setNewName('');
    setTab('groups');
  };

  const searchHits = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || !selected) return [];
    const inGroup = new Set(selected.members);
    const out: ManualGroupsGame[] = [];
    for (const g of games) {
      if (out.length >= 40) break;
      if (inGroup.has(gameKeyOf(g))) continue;
      if (g.title.toLowerCase().includes(q)) out.push(g);
    }
    return out;
  }, [query, selected, games]);

  const kindOf = (s: GroupSuggestion): ManualGroupKind => edits[s.id]?.kind || s.kind;
  const nameOf = (s: GroupSuggestion) => (edits[s.id]?.name ?? '').trim() || s.name;
  const describe = (s: GroupSuggestion, count = s.gameIds.length) =>
    s.action === 'create'
      ? tf(kindOf(s) === 'collection' ? 'mg.suggest.createCollection' : 'mg.suggest.create', { name: nameOf(s), count })
      : tf(s.kind === 'series' ? 'mg.suggest.add.series' : 'mg.suggest.add.collection', { name: s.name, count });
  const why = (s: GroupSuggestion) => {
    if (s.reason === 'common-prefix' && s.parts) return tf('mg.suggest.why.common-prefix', { name: s.name, games: s.parts.length });
    if (s.reason === 'multi-console' && s.consoles)
      return tf('mg.suggest.why.multi-console', { count: s.consoles.length, consoles: s.consoles.join(', '), series: s.seriesName || '' });
    return t(`mg.suggest.reason.${s.reason}`);
  };

  const setEdit = (id: string, patch: Partial<SuggestionEdit>) =>
    setEdits((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  const isOn = (s: GroupSuggestion, key: string) => !(edits[s.id]?.excluded || []).includes(key);
  const toggleKeys = (s: GroupSuggestion, keys: readonly string[], on: boolean) => {
    const cur = new Set(edits[s.id]?.excluded || []);
    for (const k of keys) {
      if (on) cur.delete(k);
      else cur.add(k);
    }
    setEdit(s.id, { excluded: Array.from(cur) });
  };
  const selectedCount = (s: GroupSuggestion) => s.gameKeys.filter((k) => isOn(s, k)).length;

  const accept = (s: GroupSuggestion) => {
    const n = selectedCount(s);
    if (n === 0) return;
    acceptSuggestion(s, edits[s.id]);
    onLog?.(tf('mg.acceptedLog', { text: describe(s, n) }));
  };

  // Коллекции внутри предложенной серии показываются в её карточке.
  // Collections inside a suggested series are shown in its card.
  const suggestionIds = useMemo(() => new Set(suggestions.map((s) => s.id)), [suggestions]);
  const childrenOf = useMemo(() => {
    const m = new Map<string, GroupSuggestion[]>();
    for (const s of suggestions) {
      if (!s.parentId || !suggestionIds.has(s.parentId)) continue;
      const arr = m.get(s.parentId) || [];
      arr.push(s);
      m.set(s.parentId, arr);
    }
    return m;
  }, [suggestions, suggestionIds]);
  const countSeries = suggestions.filter((s) => s.kind === 'series').length;
  const countCollections = suggestions.length - countSeries;
  const visible = suggestions.filter((s) => {
    if (filter === 'all') return !s.parentId || !suggestionIds.has(s.parentId);
    return s.kind === filter;
  });
  const visibleAll = filter === 'all' ? suggestions : visible;

  const renderSuggestion = (s: GroupSuggestion, nested = false): React.ReactNode => {
    const kind = kindOf(s);
    const n = selectedCount(s);
    const kids = !nested && filter === 'all' ? childrenOf.get(s.id) || [] : [];
    return (
      <div key={s.id} className={`rounded-xl border border-slate-200 dark:border-slate-800 ${nested ? 'bg-slate-50 dark:bg-slate-800/30' : ''}`}>
        <div className="px-3 py-2 flex flex-wrap items-start gap-2 border-b border-slate-100 dark:border-slate-800">
          <KindIcon kind={kind} className="w-4 h-4 text-accent shrink-0 mt-0.5" />
          <div className="flex-1 min-w-[12rem]">
            <div className="font-semibold text-slate-900 dark:text-slate-100">{describe(s, n)}</div>
            <div className="text-slate-500 dark:text-slate-400">{why(s)}</div>
          </div>
          <button type="button" className={btnPrimary} onClick={() => accept(s)} disabled={n === 0}>
            <Check className="w-3.5 h-3.5" />
            {t('mg.accept')}
          </button>
          <button type="button" className={btnGhost} onClick={() => rejectSuggestion(s)}>
            {t('mg.reject')}
          </button>
        </div>
        {s.action === 'create' && (
          <div className="px-3 py-2 flex flex-wrap items-center gap-2 border-b border-slate-100 dark:border-slate-800">
            <input
              value={edits[s.id]?.name ?? s.name}
              onChange={(e) => setEdit(s.id, { name: e.target.value })}
              aria-label={t('mg.suggest.nameLabel')}
              placeholder={s.name}
              className={`${inputCls} flex-1 min-w-[10rem] w-auto font-semibold`}
            />
            <div className="flex items-center gap-0.5 p-0.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800" role="group" aria-label={t('mg.suggest.kindLabel')}>
              {(['series', 'collection'] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={kind === k}
                  onClick={() => setEdit(s.id, { kind: k })}
                  className={`h-7 px-2.5 rounded-md text-xs font-semibold inline-flex items-center gap-1 cursor-pointer ${
                    kind === k ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-2xs' : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <KindIcon kind={k} className="w-3.5 h-3.5" />
                  {t(`mg.kind.${k}`)}
                </button>
              ))}
            </div>
          </div>
        )}
        {s.parts && s.parts.length > 0 ? (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {s.parts.map((p) => {
              const onCount = p.gameKeys.filter((k) => isOn(s, k)).length;
              return (
                <div key={p.gameKeys[0]}>
                  <label className="px-3 py-1.5 flex flex-wrap items-center gap-2 cursor-pointer bg-slate-50/60 dark:bg-slate-800/40">
                    <input
                      type="checkbox"
                      checked={onCount > 0}
                      ref={(el) => {
                        if (el) el.indeterminate = onCount > 0 && onCount < p.gameKeys.length;
                      }}
                      onChange={(e) => toggleKeys(s, p.gameKeys, e.target.checked)}
                      className="accent-[var(--color-accent,#2563eb)] cursor-pointer"
                    />
                    <span className="font-semibold text-slate-900 dark:text-slate-100 truncate">{p.title}</span>
                    {p.consoles.map((c) => (
                      <span key={c} className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 font-mono font-semibold text-[10px] text-slate-800 dark:text-slate-100">
                        {c}
                      </span>
                    ))}
                    {p.gameIds.length > 1 ? (
                      <span className="inline-flex items-center gap-1 text-slate-500">
                        <Layers className="w-3 h-3" />
                        {tf('mg.suggest.part.versions', { count: p.gameIds.length })}
                      </span>
                    ) : null}
                  </label>
                  {p.gameIds.length > 1 && (
                    <ul className="pl-5 divide-y divide-slate-100 dark:divide-slate-800">
                      {p.gameIds.map((id, i) => {
                        const g = byId.get(id);
                        const k = p.gameKeys[i];
                        return g ? <GameLine key={id} g={g} checked={isOn(s, k)} onCheck={(on) => toggleKeys(s, [k], on)} /> : null;
                      })}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {s.gameIds.map((id, i) => {
              const g = byId.get(id);
              const k = s.gameKeys[i];
              return g ? <GameLine key={id} g={g} checked={isOn(s, k)} onCheck={(on) => toggleKeys(s, [k], on)} /> : null;
            })}
          </ul>
        )}
        {n < s.gameKeys.length && (
          <p className="px-3 py-1.5 text-slate-500 border-t border-slate-100 dark:border-slate-800">
            {tf('mg.suggest.selected', { n, total: s.gameKeys.length })}
          </p>
        )}
        {kids.length > 0 && (
          <div className="px-3 py-2 space-y-2 border-t border-slate-100 dark:border-slate-800">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{t('mg.suggest.nested')}</div>
            {kids.map((c) => renderSuggestion(c, true))}
          </div>
        )}
      </div>
    );
  };

  const tabBtn = (id: Tab, label: string, count?: number) => (
    <button
      key={id}
      type="button"
      onClick={() => setTab(id)}
      aria-pressed={tab === id}
      className={`h-7 px-2.5 rounded-md text-xs font-semibold transition cursor-pointer ${
        tab === id
          ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-2xs'
          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
      }`}
    >
      {label}
      {count ? <span className="ml-1 tabular-nums opacity-80">{count}</span> : null}
    </button>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-xs"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={t('mg.title')}
    >
      <div
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-4xl w-full max-h-[calc(100dvh-1rem)] sm:max-h-[90vh] overflow-hidden flex flex-col shadow-2xl text-xs"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">{t('mg.title')}</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{t('mg.subtitle')}</p>
          </div>
          <button type="button" onClick={onClose} aria-label={t('coll.close')} className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-2.5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-0.5 p-0.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800" role="group">
            {tabBtn('groups', t('mg.tab.groups'), groups.length)}
            {tabBtn('suggest', t('mg.tab.suggest'), suggestions.length)}
            {tabBtn('detached', t('mg.tab.detached'), detachedKeys.length)}
          </div>
          <div className="flex-1" />
          <button type="button" className={btnGhost} onClick={() => { setCreating('collection'); setTab('groups'); }}>
            <Plus className="w-3.5 h-3.5" />
            {t('mg.newCollection')}
          </button>
          <button type="button" className={btnGhost} onClick={() => { setCreating('series'); setTab('groups'); }}>
            <Plus className="w-3.5 h-3.5" />
            {t('mg.newSeries')}
          </button>
        </div>

        {creating && (
          <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 space-y-2">
            <div className="flex items-center gap-2 font-semibold text-slate-800 dark:text-slate-100">
              <KindIcon kind={creating} className="w-4 h-4 text-accent" />
              {t(creating === 'series' ? 'mg.newSeries' : 'mg.newCollection')}
              <span className="font-normal text-slate-500">· {t(`mg.kindHint.${creating}`)}</span>
            </div>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                create();
              }}
            >
              <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={t('mg.namePlaceholder')} className={inputCls} />
              <button type="submit" className={btnPrimary} disabled={!newName.trim()}>
                {t('mg.create')}
              </button>
              <button type="button" className={btnGhost} onClick={() => setCreating(null)}>
                {t('mg.cancel')}
              </button>
            </form>
            {checkedKeys.length > 0 ? (
              <label className="flex items-center gap-2 text-slate-700 dark:text-slate-200 cursor-pointer">
                <input type="checkbox" checked={withChecked} onChange={(e) => setWithChecked(e.target.checked)} className="accent-[var(--color-accent,#2563eb)]" />
                {tf('mg.newHintChecked', { count: checkedKeys.length })}
              </label>
            ) : (
              <p className="text-slate-500 dark:text-slate-400">{t('mg.newHintEmpty')}</p>
            )}
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
          {tab === 'groups' &&
            (groups.length === 0 ? (
              <p className="p-6 text-slate-500 dark:text-slate-400 overflow-y-auto">{t('mg.empty')}</p>
            ) : (
              <div className="flex-1 min-h-0 grid grid-rows-[auto_minmax(0,1fr)] md:grid-rows-[minmax(0,1fr)] md:grid-cols-[15rem_minmax(0,1fr)]">
                <ul className="border-b md:border-b-0 md:border-r border-slate-200 dark:border-slate-800 overflow-y-auto max-h-40 md:max-h-none">
                  {groups.map((g) => (
                    <li key={g.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedId(g.id);
                          setConfirmDelete(false);
                          setQuery('');
                        }}
                        className={`w-full text-left px-4 py-2 flex items-center gap-2 cursor-pointer ${
                          selected?.id === g.id ? 'bg-accent-soft dark:bg-accent-soft-dark text-accent dark:text-accent-dark font-semibold' : 'hover:bg-slate-50 dark:hover:bg-slate-800/60 text-slate-700 dark:text-slate-200'
                        }`}
                      >
                        <KindIcon kind={g.kind} className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate flex-1">{g.name}</span>
                        <span className="tabular-nums text-slate-500">{g.members.length}</span>
                      </button>
                    </li>
                  ))}
                </ul>
                {selected && (
                  <div className="overflow-y-auto p-4 space-y-3 min-h-0">
                    <div className="flex items-end gap-2">
                      <label className="flex-1">
                        <span className="block text-[11px] font-semibold text-slate-500 mb-1">
                          {t(`mg.kind.${selected.kind}`)} · {t(`mg.kindHint.${selected.kind}`)}
                        </span>
                        <input
                          key={selected.id}
                          defaultValue={selected.name}
                          aria-label={t('mg.rename')}
                          onBlur={(e) => renameManualGroup(selected.id, e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                          }}
                          className={`${inputCls} font-semibold`}
                        />
                      </label>
                      {confirmDelete ? (
                        <button type="button" className={`${btn} bg-red-600 text-white`} onClick={() => { deleteManualGroup(selected.id); setSelectedId(null); setConfirmDelete(false); }}>
                          <Trash2 className="w-3.5 h-3.5" />
                          {t('mg.deleteConfirm')}
                        </button>
                      ) : (
                        <button type="button" className={btnGhost} onClick={() => setConfirmDelete(true)}>
                          <Trash2 className="w-3.5 h-3.5" />
                          {t('mg.delete')}
                        </button>
                      )}
                    </div>

                    {selected.members.length === 0 ? (
                      <p className="text-slate-500">{t('mg.noMembers')}</p>
                    ) : (
                      <ul className="rounded-lg border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
                        {selected.members.flatMap((k) =>
                          (byKey.get(k) || []).map((g) => (
                            <GameLine
                              key={g.id}
                              g={g}
                              right={
                                <button type="button" title={t('mg.remove')} aria-label={t('mg.remove')} onClick={() => removeFromManualGroup(selected.id, [k])} className="p-1 text-slate-400 hover:text-red-600 cursor-pointer">
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              }
                            />
                          ))
                        )}
                      </ul>
                    )}
                    {(() => {
                      const missing = selected.members.filter((k) => !byKey.has(k)).length;
                      return missing > 0 ? <p className="text-slate-500">{tf('mg.missing', { count: missing })}</p> : null;
                    })()}

                    <div className="space-y-2 pt-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{t('mg.addTitle')}</span>
                        {checkedKeys.length > 0 && (
                          <button type="button" className={btnGhost} onClick={() => addToManualGroup(selected.id, checkedKeys)}>
                            <Plus className="w-3.5 h-3.5" />
                            {tf('mg.addChecked', { count: checkedKeys.length })}
                          </button>
                        )}
                      </div>
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('mg.addSearch')} className={`${inputCls} pl-8`} />
                      </div>
                      {searchHits.length > 0 && (
                        <ul className="rounded-lg border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 max-h-56 overflow-y-auto">
                          {searchHits.map((g) => (
                            <GameLine
                              key={g.id}
                              g={g}
                              right={
                                <button type="button" onClick={() => addToManualGroup(selected.id, [gameKeyOf(g)])} className="px-2 py-0.5 rounded text-accent dark:text-accent-dark font-semibold hover:bg-accent-soft dark:hover:bg-accent-soft-dark cursor-pointer">
                                  {t('mg.add')}
                                </button>
                              }
                            />
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}

          {tab === 'suggest' &&
            (suggestions.length === 0 ? (
              <p className="p-4 text-slate-500 dark:text-slate-400">{t('mg.suggest.none')}</p>
            ) : (
              <>
                <div className="px-4 py-2 flex flex-wrap items-center gap-2 border-b border-slate-200 dark:border-slate-800 shrink-0">
                  <div className="flex items-center gap-0.5 p-0.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800" role="group">
                    {(
                      [
                        ['all', suggestions.length],
                        ['series', countSeries],
                        ['collection', countCollections],
                      ] as const
                    ).map(([f, c]) => (
                      <button
                        key={f}
                        type="button"
                        aria-pressed={filter === f}
                        onClick={() => setFilter(f)}
                        className={`h-7 px-2.5 rounded-md text-xs font-semibold cursor-pointer ${
                          filter === f ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-2xs' : 'text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        {t(`mg.suggest.filter.${f}`)} <span className="tabular-nums opacity-80">{c}</span>
                      </button>
                    ))}
                  </div>
                  <div className="flex-1" />
                  <button type="button" className={btnPrimary} onClick={() => visibleAll.forEach(accept)}>
                    <Check className="w-3.5 h-3.5" />
                    {t('mg.acceptAll')}
                  </button>
                  <button type="button" className={btnGhost} onClick={() => visibleAll.forEach((s) => rejectSuggestion(s))}>
                    {t('mg.rejectAll')}
                  </button>
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 space-y-3" data-testid="mg-suggest-list">
                  {visible.map((s) => renderSuggestion(s))}
                </div>
              </>
            ))}

          {tab === 'detached' && (
            <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-2">
              {detachedKeys.length === 0 ? (
                <p className="text-slate-500 dark:text-slate-400">{t('mg.detached.none')}</p>
              ) : (
                <>
                  <p className="text-slate-500 dark:text-slate-400">{t('mg.detached.hint')}</p>
                  <ul className="rounded-lg border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
                    {detachedKeys.flatMap((k) => {
                      const d = state.detached[k];
                      const g = (byKey.get(k) || [])[0];
                      if (!g) return [];
                      return (['series', 'collection'] as const)
                        .filter((kind) => d[kind])
                        .map((kind) => (
                          <GameLine
                            key={`${k}:${kind}`}
                            g={g}
                            right={
                              <>
                                <span className="text-slate-500 shrink-0">{t(`mg.detached.${kind}`)}</span>
                                <button type="button" onClick={() => setDetached(kind, [k], false)} className="px-2 py-0.5 rounded text-accent dark:text-accent-dark font-semibold hover:bg-accent-soft dark:hover:bg-accent-soft-dark inline-flex items-center gap-1 cursor-pointer">
                                  <Undo2 className="w-3 h-3" />
                                  {t('mg.restore')}
                                </button>
                              </>
                            }
                          />
                        ));
                    })}
                  </ul>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
