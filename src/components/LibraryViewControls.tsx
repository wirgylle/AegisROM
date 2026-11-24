// Панели «Медиа» и «Группы» в шапке Библиотеки.
// «Медиа»: какую картинку показывают плитка и список (боксарт, скриншот, баннер…), заполнять ли кадр
// и подставлять ли другую картинку, если нужной нет.
// «Группы»: чем сворачивать карточки (коллекции или серии) и какие игры показывать — несколько пунктов сразу.
//
// The "Media" and "Groups" panels in the Library header.
// "Media": which picture the tiles and the list show, whether to fill the frame and whether to
// show another picture when the picked one is missing.
// "Groups": what collapses cards (collections or series) and which games to show, any mix.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Image as ImageIcon, Layers } from 'lucide-react';
import { useI18n } from '../i18n/translations';
import { MEDIA_KINDS, mediaSetOf, type MediaKind, type MediaRowLike } from '../utils/mediaKinds';
import { isGroupFilterAll, type LibraryGroupFilter } from '../utils/gameCollections';

export type CompactMediaKind = MediaKind | 'none';

export interface LibraryMediaPrefs {
  grid: MediaKind;
  compact: CompactMediaKind;
  fill: boolean;
  fallback: boolean;
}

export const DEFAULT_MEDIA_PREFS: LibraryMediaPrefs = {
  grid: 'boxart',
  compact: 'boxart',
  fill: true,
  fallback: true,
};

const PREFS_KEY = 'aegis.lib.media';

export function loadMediaPrefs(): LibraryMediaPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return DEFAULT_MEDIA_PREFS;
    const p = JSON.parse(raw) || {};
    const kinds = MEDIA_KINDS as readonly string[];
    return {
      grid: kinds.includes(p.grid) ? p.grid : DEFAULT_MEDIA_PREFS.grid,
      compact: p.compact === 'none' || kinds.includes(p.compact) ? p.compact : DEFAULT_MEDIA_PREFS.compact,
      fill: typeof p.fill === 'boolean' ? p.fill : DEFAULT_MEDIA_PREFS.fill,
      fallback: typeof p.fallback === 'boolean' ? p.fallback : DEFAULT_MEDIA_PREFS.fallback,
    };
  } catch {
    return DEFAULT_MEDIA_PREFS;
  }
}

export function saveMediaPrefs(p: LibraryMediaPrefs): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    // ignore
  }
}

const FILTER_KEY = 'aegis.lib.groupFilter';

export function loadGroupFilter(): LibraryGroupFilter {
  try {
    const p = JSON.parse(localStorage.getItem(FILTER_KEY) || 'null');
    if (p && typeof p === 'object') {
      const f = { collections: p.collections !== false, series: p.series !== false, singles: p.singles !== false };
      // Пустой выбор ничего не покажет — считаем его «всё». / An empty pick shows nothing: treat it as "all".
      if (!f.collections && !f.series && !f.singles) return { collections: true, series: true, singles: true };
      return f;
    }
  } catch {
    // ignore
  }
  return { collections: true, series: true, singles: true };
}

export function saveGroupFilter(f: LibraryGroupFilter): void {
  try {
    localStorage.setItem(FILTER_KEY, JSON.stringify(f));
  } catch {
    // ignore
  }
}

function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return { open, setOpen, ref };
}

const triggerCls = (active: boolean) =>
  `h-8 px-2.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition ${
    active
      ? 'bg-accent text-white border-accent'
      : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800'
  }`;

const panelCls =
  'absolute right-0 z-40 mt-1.5 w-[19rem] max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg p-3 space-y-3 text-xs text-slate-700 dark:text-slate-200';

const sectionTitleCls = 'text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1.5';

function RadioRow({
  checked,
  onClick,
  label,
  note,
}: {
  checked: boolean;
  onClick: () => void;
  label: string;
  note?: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onClick}
      className={`w-full text-left px-2 py-1.5 rounded-md flex items-center gap-2 cursor-pointer ${
        checked ? 'bg-slate-100 dark:bg-slate-800 font-semibold' : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
      }`}
    >
      <span
        className={`w-3.5 h-3.5 rounded-full border shrink-0 flex items-center justify-center ${
          checked ? 'border-accent' : 'border-slate-400 dark:border-slate-500'
        }`}
      >
        {checked && <span className="w-1.5 h-1.5 rounded-full bg-accent" />}
      </span>
      <span className="flex-1 min-w-0 truncate">{label}</span>
      {note && <span className="shrink-0 text-[10px] tabular-nums text-slate-500 dark:text-slate-400">{note}</span>}
    </button>
  );
}

function CheckRow({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <label className="flex items-start gap-2 px-2 py-1.5 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 w-3.5 h-3.5 accent-blue-600 cursor-pointer shrink-0"
      />
      <span className="min-w-0">
        <span className="block font-semibold">{label}</span>
        {hint && <span className="block text-[11px] text-slate-500 dark:text-slate-400 leading-snug">{hint}</span>}
      </span>
    </label>
  );
}

export const LibraryMediaControl: React.FC<{
  prefs: LibraryMediaPrefs;
  onChange: (p: LibraryMediaPrefs) => void;
  view: 'grid' | 'compact';
  games: readonly MediaRowLike[];
}> = ({ prefs, onChange, view, games }) => {
  const { t, tf, locale } = useI18n();
  const { open, setOpen, ref } = usePopover();
  // Сколько игр имеют каждый вид — считаем только при открытой панели.
  // How many games have each kind: counted only while the panel is open.
  const counts = useMemo(() => {
    if (!open) return null;
    const c: Record<MediaKind, number> = { boxart: 0, snap: 0, title: 0, marquee: 0, image: 0 };
    for (const g of games) {
      const set = mediaSetOf(g);
      for (const k of MEDIA_KINDS) if (set[k]) c[k]++;
    }
    return c;
  }, [open, games]);
  const current = view === 'grid' ? prefs.grid : prefs.compact;
  const kinds: CompactMediaKind[] = view === 'grid' ? [...MEDIA_KINDS] : [...MEDIA_KINDS, 'none'];
  const set = (k: CompactMediaKind) => {
    if (view === 'grid') onChange({ ...prefs, grid: k as MediaKind });
    else onChange({ ...prefs, compact: k });
  };
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="dialog"
        title={t('lv.mediaHint')}
        className={triggerCls(false)}
      >
        <ImageIcon className="w-3.5 h-3.5" />
        <span>{t('lv.media')}</span>
        <span className="hidden sm:inline font-normal text-slate-500 dark:text-slate-400 max-w-[7rem] truncate">
          · {t(`lv.short.${current}`)}
        </span>
        <ChevronDown className="w-3 h-3 opacity-70" />
      </button>
      {open && (
        <div role="dialog" aria-label={t('lv.media')} className={panelCls}>
          <div>
            <div className={sectionTitleCls}>{view === 'grid' ? t('lv.mediaGrid') : t('lv.mediaCompact')}</div>
            <div role="radiogroup" className="space-y-0.5">
              {kinds.map((k) => (
                <RadioRow
                  key={k}
                  checked={current === k}
                  onClick={() => set(k)}
                  label={t(`lv.kind.${k}`)}
                  note={
                    counts && k !== 'none'
                      ? tf('lv.mediaCount', {
                          count: counts[k as MediaKind].toLocaleString(locale),
                          total: games.length.toLocaleString(locale),
                        })
                      : undefined
                  }
                />
              ))}
            </div>
          </div>
          <div className="border-t border-slate-200 dark:border-slate-700 pt-2 space-y-0.5">
            <CheckRow
              checked={prefs.fallback}
              onChange={(v) => onChange({ ...prefs, fallback: v })}
              label={t('lv.fallback')}
              hint={t('lv.fallbackHint')}
            />
            {view === 'grid' && (
              <CheckRow
                checked={prefs.fill}
                onChange={(v) => onChange({ ...prefs, fill: v })}
                label={t('lv.fill')}
                hint={t('lv.fillHint')}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export type LibraryGroupingMode = 'none' | 'collections' | 'series';

export const LibraryGroupsControl: React.FC<{
  grouping: LibraryGroupingMode;
  onGrouping: (m: LibraryGroupingMode) => void;
  /** Редактор показывает все файлы: сворачивать нельзя. / The editor lists every file: no collapsing. */
  groupingDisabled?: boolean;
  filter: LibraryGroupFilter;
  onFilter: (f: LibraryGroupFilter) => void;
}> = ({ grouping, onGrouping, groupingDisabled, filter, onFilter }) => {
  const { t } = useI18n();
  const { open, setOpen, ref } = usePopover();
  const filtered = !isGroupFilterAll(filter);
  const active = filtered || (grouping !== 'none' && !groupingDisabled);
  const setFlag = (key: keyof LibraryGroupFilter, v: boolean) => {
    const next = { ...filter, [key]: v };
    // Нельзя снять все галочки: пустой список ничего не покажет. / Cannot untick everything.
    if (!next.collections && !next.series && !next.singles) return;
    onFilter(next);
  };
  const summary = [
    grouping !== 'none' && !groupingDisabled ? t(grouping === 'series' ? 'series.toggle' : 'coll.toggle') : '',
    filtered ? t('lv.filterOn') : '',
  ]
    .filter(Boolean)
    .join(' + ');
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="dialog"
        title={t('lv.groupsHint')}
        className={triggerCls(active)}
      >
        <Layers className="w-3.5 h-3.5" />
        <span>{t('lv.groups')}</span>
        {summary && <span className="hidden sm:inline font-normal opacity-90 max-w-[9rem] truncate">· {summary}</span>}
        <ChevronDown className="w-3 h-3 opacity-70" />
      </button>
      {open && (
        <div role="dialog" aria-label={t('lv.groups')} className={panelCls}>
          {!groupingDisabled && (
            <div>
              <div className={sectionTitleCls}>{t('lv.collapse')}</div>
              <div role="radiogroup" className="space-y-0.5">
                {(['none', 'collections', 'series'] as const).map((m) => (
                  <RadioRow key={m} checked={grouping === m} onClick={() => onGrouping(m)} label={t(`lv.collapse.${m}`)} />
                ))}
              </div>
            </div>
          )}
          <div className={groupingDisabled ? '' : 'border-t border-slate-200 dark:border-slate-700 pt-2'}>
            <div className={sectionTitleCls}>{t('lv.show')}</div>
            <div className="space-y-0.5">
              <CheckRow
                checked={filter.collections}
                onChange={(v) => setFlag('collections', v)}
                label={t('lv.show.collections')}
                hint={t('lv.show.collectionsHint')}
              />
              <CheckRow
                checked={filter.series}
                onChange={(v) => setFlag('series', v)}
                label={t('lv.show.series')}
                hint={t('lv.show.seriesHint')}
              />
              <CheckRow
                checked={filter.singles}
                onChange={(v) => setFlag('singles', v)}
                label={t('lv.show.singles')}
                hint={t('lv.show.singlesHint')}
              />
            </div>
            {filtered && (
              <button
                type="button"
                onClick={() => onFilter({ collections: true, series: true, singles: true })}
                className="mt-1.5 ml-2 inline-flex items-center gap-1 text-[11px] font-semibold text-accent dark:text-accent-dark hover:underline cursor-pointer"
              >
                <Check className="w-3 h-3" />
                {t('lv.showAll')}
              </button>
            )}
          </div>
          <p className="text-[11px] leading-snug text-slate-500 dark:text-slate-400">{t('lv.scopeNote')}</p>
        </div>
      )}
    </div>
  );
};
