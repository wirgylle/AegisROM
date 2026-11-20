import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, CheckCircle2, Layers, LibraryBig, Pencil, Plus } from 'lucide-react';
import type { EnrichedBuildGame } from '../utils/buildsAndConverterEngine';
import { localizeGenre, useI18n } from '../i18n/translations';

export type LibraryViewMode =
  | 'concept_a_sidebar'
  | 'concept_b_split'
  | 'concept_c_workbench';

interface VirtualizedLibraryViewsProps {
  games: EnrichedBuildGame[];
  viewMode: LibraryViewMode;
  scrollContainerRef: React.RefObject<HTMLElement | null>;
  selectedGameId: string;
  checkedGameIds: Record<string, boolean>;
  onSelectGame: (id: string) => void;
  onToggleCheck: (id: string) => void;
  onAddToBuild?: (game: EnrichedBuildGame) => void;
  /** Коллекции: id карточки-лица → число версий и консоли. / Collections: lead card id → version count and consoles. */
  collections?: Map<string, LibraryCollectionBadge>;
  onOpenCollection?: (leadId: string) => void;
  /** Редактор: открыть правку одного рома. / Editor: open the single-ROM edit dialog. */
  onEditGame?: (id: string) => void;
}

export interface LibraryCollectionBadge {
  count: number;
  consoles: string[];
  /** 'series': count — число игр линейки, label — название серии. / count is the number of games in the line. */
  kind?: 'collection' | 'series';
  label?: string;
}

// Tile grid: as many columns as fit (min 160px each); covers keep a 3:4 box,
// so the row height is derived from the measured column width.
const GRID_MIN_COL_WIDTH = 160;
const GRID_GAP = 16;
const GRID_TEXT_HEIGHT = 46; // title + meta line under the cover
const GRID_OVERSCAN_ROWS = 3;

function computeGridMetrics(width: number) {
  const w = Math.max(width, GRID_MIN_COL_WIDTH * 2 + GRID_GAP);
  const cols = Math.max(2, Math.floor((w + GRID_GAP) / (GRID_MIN_COL_WIDTH + GRID_GAP)));
  const colWidth = (w - GRID_GAP * (cols - 1)) / cols;
  const coverHeight = Math.round((colWidth * 4) / 3);
  const cardHeight = coverHeight + GRID_TEXT_HEIGHT;
  return { cols, coverHeight, cardHeight, rowStride: cardHeight + GRID_GAP };
}

const COMPACT_ROW_HEIGHT = 40;
const EDITOR_ROW_HEIGHT = 42;
const TABLE_OVERSCAN_ROWS = 14;

// Pre-warm cache for upcoming box-art thumbnails in the scroll buffer zone
const warmedImageUrls = new Set<string>();

interface MemoGridCardProps {
  game: EnrichedBuildGame;
  coverHeight: number;
  collectionCount: number;
  collectionConsoles: string;
  collectionTitle: string;
  collectionIsSeries: boolean;
  onOpenCollection?: (id: string) => void;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onAddToBuild?: (game: EnrichedBuildGame) => void;
  addBtnTitle: string;
  discLabel: string;
  lang: string;
}

const MemoGridCard = React.memo<MemoGridCardProps>(
  ({ game, coverHeight, isSelected, onSelect, onAddToBuild, addBtnTitle, discLabel, collectionCount, collectionConsoles, collectionTitle, collectionIsSeries, onOpenCollection }) => {
    const [imgFailed, setImgFailed] = useState(false);

    useEffect(() => {
      setImgFailed(false);
    }, [game.boxArtUrl]);

    return (
      <div
        onClick={() => onSelect(game.id)}
        style={{ height: `${coverHeight + GRID_TEXT_HEIGHT}px` }}
        className="cursor-pointer flex flex-col overflow-hidden group min-w-0 p-0.5"
      >
        <div
          style={{ height: `${coverHeight - 4}px` }}
          className={`shrink-0 rounded-lg bg-slate-200/70 dark:bg-slate-800 text-white p-2 flex flex-col justify-between mb-2 relative overflow-hidden transition ${
            isSelected
              ? 'ring-2 ring-accent dark:ring-accent-dark'
              : 'group-hover:ring-1 group-hover:ring-slate-300 dark:group-hover:ring-slate-600'
          }`}
        >
          {game.boxArtUrl && !imgFailed && (
            <img
              src={game.boxArtUrl}
              alt={game.title}
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
              onError={() => setImgFailed(true)}
              className="absolute inset-0 w-full h-full object-contain"
            />
          )}
          {(!game.boxArtUrl || imgFailed) && (
            <div className="absolute inset-0 flex items-center justify-center p-3 text-center text-sm font-semibold text-slate-500 dark:text-slate-400">
              {game.title}
            </div>
          )}
          <div className="relative z-10 flex items-center justify-between text-[10px] font-mono">
            <span
              className="px-1.5 py-0.5 rounded bg-slate-900/80 text-white font-semibold truncate min-w-0"
              title={collectionCount > 1 ? collectionConsoles : undefined}
            >
              {collectionCount > 1 ? collectionConsoles : game.consoleShort}
            </span>
            <div className="flex items-center gap-1 shrink-0">
              <span className="px-1.5 py-0.5 rounded bg-slate-900/80 text-white font-semibold">
                {game.region}
              </span>
              {onAddToBuild && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAddToBuild(game);
                  }}
                  title={addBtnTitle}
                  aria-label={addBtnTitle}
                  className="w-7 h-7 rounded-md bg-accent hover:bg-accent-hover text-white flex items-center justify-center shadow-xs cursor-pointer transition"
                >
                  <Plus className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
          {collectionCount > 1 && onOpenCollection && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenCollection(game.id);
              }}
              title={collectionTitle}
              aria-label={collectionTitle}
              className="relative z-10 self-start h-7 px-2 rounded-md bg-slate-900/85 hover:bg-accent text-white text-[11px] font-semibold flex items-center gap-1 cursor-pointer transition"
            >
              {collectionIsSeries ? <LibraryBig className="w-3.5 h-3.5" /> : <Layers className="w-3.5 h-3.5" />}
              <span className="tabular-nums">{collectionCount}</span>
            </button>
          )}
        </div>
        <div className="min-w-0">
          <div
            className="text-[13px] font-semibold text-slate-900 dark:text-slate-100 truncate leading-snug"
            title={game.title}
          >
            {game.title}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex items-center justify-between gap-1.5 tabular-nums min-w-0">
            <span className="truncate">
              {game.discCount && game.discCount > 1
                ? `${game.year} · ${discLabel}`
                : `${game.year} · ${game.ageRating}`}
            </span>
            <span className="shrink-0 whitespace-nowrap">{game.size}</span>
          </div>
        </div>
      </div>
    );
  },
  (prev, next) =>
    prev.isSelected === next.isSelected &&
    prev.coverHeight === next.coverHeight &&
    prev.lang === next.lang &&
    prev.discLabel === next.discLabel &&
    prev.addBtnTitle === next.addBtnTitle &&
    prev.game.id === next.game.id &&
    prev.game.title === next.game.title &&
    prev.game.boxArtUrl === next.game.boxArtUrl &&
    prev.game.region === next.game.region &&
    prev.game.size === next.game.size &&
    prev.game.discCount === next.game.discCount &&
    prev.collectionCount === next.collectionCount &&
    prev.collectionConsoles === next.collectionConsoles &&
    prev.game === next.game &&
    prev.collectionTitle === next.collectionTitle &&
    prev.collectionIsSeries === next.collectionIsSeries &&
    prev.onOpenCollection === next.onOpenCollection &&
    prev.onSelect === next.onSelect &&
    prev.onAddToBuild === next.onAddToBuild
);

interface MemoCompactRowProps {
  game: EnrichedBuildGame;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onAddToBuild?: (game: EnrichedBuildGame) => void;
  addBtnTitle: string;
  discLabel: string;
  genreLabel: string;
  lang: string;
  collectionCount: number;
  collectionConsoles: string;
  collectionTitle: string;
  collectionIsSeries: boolean;
  onOpenCollection?: (id: string) => void;
}

const MemoCompactRow = React.memo<MemoCompactRowProps>(
  ({ game, isSelected, onSelect, onAddToBuild, addBtnTitle, discLabel, genreLabel, collectionCount, collectionConsoles, collectionTitle, collectionIsSeries, onOpenCollection }) => (
    <tr
      onClick={() => onSelect(game.id)}
      style={{ height: `${COMPACT_ROW_HEIGHT}px` }}
      className={`cursor-pointer transition-colors ${
        isSelected
          ? 'bg-blue-50 dark:bg-blue-950/60 font-bold text-blue-700 dark:text-blue-300'
          : 'hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-800 dark:text-slate-200'
      }`}
    >
      <td className="px-3 truncate align-middle" title={game.title}>
        {collectionCount > 1 && onOpenCollection && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenCollection(game.id);
            }}
            title={collectionTitle}
            aria-label={collectionTitle}
            className="mr-1.5 h-5 px-1.5 rounded bg-slate-200 dark:bg-slate-700 hover:bg-accent hover:text-white text-slate-700 dark:text-slate-200 text-[10px] font-semibold inline-flex items-center gap-0.5 align-middle cursor-pointer"
          >
            {collectionIsSeries ? <LibraryBig className="w-3 h-3" /> : <Layers className="w-3 h-3" />}
            <span className="tabular-nums">{collectionCount}</span>
          </button>
        )}
        <span>{game.title}</span>
        {game.discCount && game.discCount > 1 && (
          <span className="ml-1.5 text-[10px] font-mono text-slate-400 dark:text-slate-500">
            · {discLabel}
          </span>
        )}
      </td>
      <td className="px-3 font-mono text-slate-500 dark:text-slate-400 whitespace-nowrap align-middle">
        <span className="block truncate" title={collectionCount > 1 ? collectionConsoles : undefined}>
          {collectionCount > 1 ? collectionConsoles : game.consoleShort} · {game.discCount && game.discCount > 1 ? discLabel : game.bitnessGroup}
        </span>
      </td>
      <td
        className="px-3 text-slate-600 dark:text-slate-400 truncate align-middle"
        title={`${genreLabel} (${game.ageRating})`}
      >
        {genreLabel} ({game.ageRating})
      </td>
      <td className="px-3 font-mono whitespace-nowrap align-middle">
        <span className="px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-bold text-[10px]">
          {game.region}
        </span>
      </td>
      <td className="px-3 font-mono text-right tabular-nums whitespace-nowrap align-middle">
        {game.size}
      </td>
      <td className="px-2 text-right whitespace-nowrap align-middle">
        {onAddToBuild && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onAddToBuild(game);
            }}
            title={addBtnTitle}
            className="w-6 h-6 rounded-md bg-blue-600 hover:bg-blue-700 text-white inline-flex items-center justify-center cursor-pointer shadow-2xs"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        )}
      </td>
    </tr>
  ),
  (prev, next) =>
    prev.isSelected === next.isSelected &&
    prev.lang === next.lang &&
    prev.discLabel === next.discLabel &&
    prev.genreLabel === next.genreLabel &&
    prev.collectionCount === next.collectionCount &&
    prev.collectionConsoles === next.collectionConsoles &&
    prev.game === next.game &&
    prev.collectionTitle === next.collectionTitle &&
    prev.collectionIsSeries === next.collectionIsSeries &&
    prev.onOpenCollection === next.onOpenCollection &&
    prev.addBtnTitle === next.addBtnTitle &&
    prev.game.id === next.game.id &&
    prev.game.title === next.game.title &&
    prev.game.region === next.game.region &&
    prev.game.size === next.game.size &&
    prev.game.discCount === next.game.discCount &&
    prev.onSelect === next.onSelect &&
    prev.onAddToBuild === next.onAddToBuild
);

interface MemoEditorRowProps {
  game: EnrichedBuildGame;
  isSelected: boolean;
  isChecked: boolean;
  onSelect: (id: string) => void;
  onToggleCheck: (id: string) => void;
  onAddToBuild?: (game: EnrichedBuildGame) => void;
  onEditGame?: (id: string) => void;
  addBtnTitle: string;
  editBtnTitle: string;
  manualTitle: string;
  discLabel: string;
  lang: string;
}

const MemoEditorRow = React.memo<MemoEditorRowProps>(
  ({ game, isSelected, isChecked, onSelect, onToggleCheck, onAddToBuild, onEditGame, addBtnTitle, editBtnTitle, manualTitle, discLabel }) => (
    <tr
      onClick={() => onSelect(game.id)}
      onDoubleClick={() => onEditGame?.(game.id)}
      style={{ height: `${EDITOR_ROW_HEIGHT}px` }}
      className={`cursor-pointer transition-colors ${
        isSelected
          ? 'bg-blue-50 dark:bg-blue-950/60'
          : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
      }`}
    >
      <td
        className="px-3 whitespace-nowrap align-middle"
        onClick={(e) => {
          e.stopPropagation();
          onToggleCheck(game.id);
        }}
      >
        <input
          type="checkbox"
          checked={isChecked}
          onChange={() => {}}
          className="w-4 h-4 accent-blue-600 cursor-pointer"
        />
      </td>
      <td
        className="px-3 font-mono text-rose-600 dark:text-rose-400 truncate align-middle"
        title={game.oldFile}
      >
        {game.oldFile}
      </td>
      <td className="px-3 align-middle min-w-0" title={`${game.title}\n${game.cleanFile}`}>
        <div className="flex items-center gap-1 min-w-0 leading-tight">
          {game.manualFields && game.manualFields.length > 0 && (
            <span
              className="shrink-0 text-accent dark:text-accent-dark font-bold"
              title={`${manualTitle}: ${game.manualFields.join(', ')}`}
            >
              ✎
            </span>
          )}
          <span className="font-semibold text-slate-900 dark:text-slate-100 truncate">{game.title}</span>
        </div>
        <div className="font-mono text-[10px] text-slate-500 dark:text-slate-400 truncate leading-tight">
          {game.cleanFile}
        </div>
      </td>
      <td className="px-3 font-mono text-slate-500 dark:text-slate-400 whitespace-nowrap truncate align-middle">
        {game.consoleShort} · {game.discCount && game.discCount > 1 ? discLabel : game.bitnessGroup} · {game.ageRating}
      </td>
      <td
        className="px-3 text-emerald-700 dark:text-emerald-400 font-semibold truncate align-middle"
        title={game.status}
      >
        {game.status}
      </td>
      <td className="px-2 text-right whitespace-nowrap align-middle">
        {onEditGame && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onEditGame(game.id);
            }}
            title={editBtnTitle}
            aria-label={editBtnTitle}
            className="w-6 h-6 mr-1 rounded-md border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center justify-center cursor-pointer"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
        )}
        {onAddToBuild && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onAddToBuild(game);
            }}
            title={addBtnTitle}
            className="w-6 h-6 rounded-md bg-blue-600 hover:bg-blue-700 text-white inline-flex items-center justify-center cursor-pointer shadow-2xs"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        )}
      </td>
    </tr>
  ),
  (prev, next) =>
    prev.game === next.game &&
    prev.onEditGame === next.onEditGame &&
    prev.isSelected === next.isSelected &&
    prev.isChecked === next.isChecked &&
    prev.lang === next.lang &&
    prev.discLabel === next.discLabel &&
    prev.addBtnTitle === next.addBtnTitle &&
    prev.game.id === next.game.id &&
    prev.game.oldFile === next.game.oldFile &&
    prev.game.cleanFile === next.game.cleanFile &&
    prev.game.status === next.game.status &&
    prev.game.discCount === next.game.discCount &&
    prev.onSelect === next.onSelect &&
    prev.onToggleCheck === next.onToggleCheck &&
    prev.onAddToBuild === next.onAddToBuild
);

export const VirtualizedLibraryViews: React.FC<VirtualizedLibraryViewsProps> = ({
  games,
  viewMode,
  scrollContainerRef,
  selectedGameId,
  checkedGameIds,
  onSelectGame,
  onToggleCheck,
  onAddToBuild,
  collections,
  onOpenCollection,
  onEditGame,
}) => {
  const { t, tf, locale, lang } = useI18n();
  const badgeOf = (id: string) => {
    const b = collections?.get(id);
    if (!b || b.count < 2) return { collectionCount: 1, collectionConsoles: '', collectionTitle: '', collectionIsSeries: false };
    const isSeries = b.kind === 'series';
    return {
      collectionCount: b.count,
      collectionConsoles: b.consoles.join(' · '),
      collectionTitle: isSeries
        ? tf('series.openHint', { name: b.label || '', count: b.count, consoles: b.consoles.join(', ') })
        : tf('coll.openHint', { count: b.count, consoles: b.consoles.join(', ') }),
      collectionIsSeries: isSeries,
    };
  };
  const listRootRef = useRef<HTMLDivElement | null>(null);

  const [viewportMetrics, setViewportMetrics] = useState({
    scrollTop: 0,
    clientHeight: 720,
    listTopOffset: 240,
    ...computeGridMetrics(720),
  });

  // Progressive background buffer index so large lists warm smoothly without blocking UI interactions
  const [bufferedCount, setBufferedCount] = useState<number>(() =>
    Math.min(games.length, 160)
  );

  // Measure scrollTop + visible clientHeight + container grid columns cleanly using rAF throttling
  useEffect(() => {
    const scrollEl = scrollContainerRef.current;
    if (!scrollEl) return;

    let rafId = 0;

    const measure = () => {
      rafId = 0;
      const listEl = listRootRef.current;
      const sRect = scrollEl.getBoundingClientRect();
      const lRect = listEl ? listEl.getBoundingClientRect() : sRect;
      const listTopOffset = Math.max(0, lRect.top - sRect.top + scrollEl.scrollTop);
      const width = listEl ? listEl.clientWidth : scrollEl.clientWidth;
      const grid = computeGridMetrics(width);

      setViewportMetrics((prev) => {
        if (
          Math.abs(prev.scrollTop - scrollEl.scrollTop) < 4 &&
          Math.abs(prev.clientHeight - scrollEl.clientHeight) < 4 &&
          Math.abs(prev.listTopOffset - listTopOffset) < 4 &&
          prev.cols === grid.cols &&
          Math.abs(prev.cardHeight - grid.cardHeight) < 2
        ) {
          return prev;
        }
        return {
          scrollTop: scrollEl.scrollTop,
          clientHeight: scrollEl.clientHeight || 720,
          listTopOffset,
          ...grid,
        };
      });
    };

    const scheduleMeasure = () => {
      if (rafId) return;
      rafId = window.requestAnimationFrame(measure);
    };

    measure();
    scrollEl.addEventListener('scroll', scheduleMeasure, { passive: true });
    window.addEventListener('resize', scheduleMeasure, { passive: true });

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && listRootRef.current) {
      ro = new ResizeObserver(scheduleMeasure);
      ro.observe(listRootRef.current);
      ro.observe(scrollEl);
    }

    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      scrollEl.removeEventListener('scroll', scheduleMeasure);
      window.removeEventListener('resize', scheduleMeasure);
      ro?.disconnect();
    };
  }, [scrollContainerRef, viewMode, games.length]);

  // Background progressive buffer zone filler (yields every frame so scroll/click/search stay <16ms)
  useEffect(() => {
    const initial = Math.min(games.length, 160);
    setBufferedCount(initial);
    if (games.length <= initial) return;

    let cancelled = false;
    let timerId = 0;
    let current = initial;

    const pumpBuffer = () => {
      if (cancelled) return;
      current = Math.min(games.length, current + 450);
      setBufferedCount(current);
      if (current < games.length) {
        timerId = window.setTimeout(pumpBuffer, 24);
      }
    };

    timerId = window.setTimeout(pumpBuffer, 40);
    return () => {
      cancelled = true;
      if (timerId) window.clearTimeout(timerId);
    };
  }, [games]);

  // Compute exact visible + overscan window slice
  const windowInfo = useMemo(() => {
    const totalItems = games.length;
    if (totalItems === 0) {
      return {
        startIdx: 0,
        endIdx: 0,
        topSpacerPx: 0,
        bottomSpacerPx: 0,
        totalRows: 0,
      };
    }

    const relScrollTop = Math.max(0, viewportMetrics.scrollTop - viewportMetrics.listTopOffset);
    const viewH = Math.max(320, viewportMetrics.clientHeight);

    if (viewMode === 'concept_a_sidebar') {
      const cols = viewportMetrics.cols;
      const stride = viewportMetrics.rowStride;
      const totalRows = Math.ceil(totalItems / cols);
      const firstVisRow = Math.floor(relScrollTop / stride);
      const lastVisRow = Math.ceil((relScrollTop + viewH) / stride);

      const startRow = Math.max(0, firstVisRow - GRID_OVERSCAN_ROWS);
      const endRow = Math.min(totalRows, lastVisRow + GRID_OVERSCAN_ROWS);

      const startIdx = startRow * cols;
      const endIdx = Math.min(totalItems, endRow * cols);
      const topSpacerPx = startRow * stride;
      const bottomSpacerPx = Math.max(0, (totalRows - endRow) * stride);

      return { startIdx, endIdx, topSpacerPx, bottomSpacerPx, totalRows };
    }

    const rowHeight = viewMode === 'concept_b_split' ? COMPACT_ROW_HEIGHT : EDITOR_ROW_HEIGHT;
    const headerOffset = 38;
    const bodyScroll = Math.max(0, relScrollTop - headerOffset);
    const firstVisRow = Math.floor(bodyScroll / rowHeight);
    const lastVisRow = Math.ceil((bodyScroll + viewH) / rowHeight);

    const startIdx = Math.max(0, firstVisRow - TABLE_OVERSCAN_ROWS);
    const endIdx = Math.min(totalItems, lastVisRow + TABLE_OVERSCAN_ROWS);
    const topSpacerPx = startIdx * rowHeight;
    const bottomSpacerPx = Math.max(0, (totalItems - endIdx) * rowHeight);

    return { startIdx, endIdx, topSpacerPx, bottomSpacerPx, totalRows: totalItems };
  }, [games.length, viewMode, viewportMetrics]);

  const visibleGames = useMemo(
    () => games.slice(windowInfo.startIdx, windowInfo.endIdx),
    [games, windowInfo.startIdx, windowInfo.endIdx]
  );

  // Idle scroll-ahead prefetching for the next 18 upcoming covers in the buffer zone
  useEffect(() => {
    if (viewMode !== 'concept_a_sidebar' || games.length === 0) return;
    const prefetchStart = windowInfo.endIdx;
    const prefetchEnd = Math.min(games.length, prefetchStart + 18);
    if (prefetchStart >= prefetchEnd) return;

    const timer = window.setTimeout(() => {
      for (let i = prefetchStart; i < prefetchEnd; i++) {
        const url = games[i]?.boxArtUrl;
        if (url && !url.startsWith('blob:') && !warmedImageUrls.has(url)) {
          if (warmedImageUrls.size > 1200) warmedImageUrls.clear();
          warmedImageUrls.add(url);
          const img = new Image();
          img.referrerPolicy = 'no-referrer';
          img.src = url;
        }
      }
    }, 120);

    return () => window.clearTimeout(timer);
  }, [games, viewMode, windowInfo.endIdx]);

  const jumpToRatio = (ratio: number) => {
    const scrollEl = scrollContainerRef.current;
    if (!scrollEl) return;
    const totalScrollable =
      viewMode === 'concept_a_sidebar'
        ? Math.ceil(games.length / viewportMetrics.cols) * viewportMetrics.rowStride
        : games.length * (viewMode === 'concept_b_split' ? COMPACT_ROW_HEIGHT : EDITOR_ROW_HEIGHT);

    const targetTop =
      ratio <= 0
        ? 0
        : Math.max(0, viewportMetrics.listTopOffset + totalScrollable * ratio - 120);
    scrollEl.scrollTo({ top: targetTop, behavior: 'auto' });
  };

  if (games.length === 0) {
    return (
      <div
        ref={listRootRef}
        className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/30 p-8 text-center text-xs text-slate-500 dark:text-slate-400"
      >
        {t('lib.noGamesFound')}
      </div>
    );
  }

  const isBufferReady = bufferedCount >= games.length;
  const addBtnTitle = t('lib.addToBuild');

  return (
    <div ref={listRootRef} className="space-y-2.5">
      {/* Compact Screen + Buffer Zone Status & Quick-Jump Strip */}
      {games.length > 40 && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-900/70 text-[11px]">
          <div className="flex flex-wrap items-center gap-2.5 text-slate-600 dark:text-slate-300 font-mono tabular-nums">
            <span className="inline-flex items-center gap-1 font-semibold text-blue-700 dark:text-blue-400">
              <Layers className="w-3.5 h-3.5" />
              <span>
                {t('lib.onScreen')} {windowInfo.startIdx + 1}–{windowInfo.endIdx} ({visibleGames.length})
              </span>
            </span>
            <span className="text-slate-300 dark:text-slate-700">|</span>
            <span className="inline-flex items-center gap-1">
              {isBufferReady ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              )}
              <span>
                {t('lib.buffer')} {bufferedCount.toLocaleString(locale)} / {games.length.toLocaleString(locale)}
              </span>
            </span>
          </div>

          <div className="flex items-center gap-1 font-mono text-[10px]">
            <button
              type="button"
              onClick={() => jumpToRatio(0)}
              className="px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold flex items-center gap-1 cursor-pointer"
            >
              <ArrowUp className="w-3 h-3" />
              <span>{t('lib.toStart')}</span>
            </button>
            {[0.25, 0.5, 0.75].map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => jumpToRatio(r)}
                className="px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 cursor-pointer"
              >
                {Math.round(r * 100)}%
              </button>
            ))}
            <button
              type="button"
              onClick={() => jumpToRatio(0.99)}
              className="px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold flex items-center gap-1 cursor-pointer"
            >
              <ArrowDown className="w-3 h-3" />
              <span>{t('lib.toEnd')}</span>
            </button>
          </div>
        </div>
      )}

      {/* VIEW A: Virtualized Presentation Box-Art Grid */}
      {viewMode === 'concept_a_sidebar' && (
        <div>
          {windowInfo.topSpacerPx > 0 && (
            <div style={{ height: `${windowInfo.topSpacerPx}px` }} aria-hidden="true" />
          )}
          <div
            className="grid"
            style={{
              columnGap: `${GRID_GAP}px`,
              rowGap: `${GRID_GAP}px`,
              gridTemplateColumns: `repeat(${viewportMetrics.cols}, minmax(0, 1fr))`,
            }}
          >
            {visibleGames.map((g) => (
              <MemoGridCard
                key={g.id}
                game={g}
                coverHeight={viewportMetrics.coverHeight}
                isSelected={selectedGameId === g.id}
                onSelect={onSelectGame}
                onAddToBuild={onAddToBuild}
                addBtnTitle={addBtnTitle}
                discLabel={g.discCount && g.discCount > 1 ? tf('lib.discShort', { count: g.discCount }) : ''}
                lang={lang}
                {...badgeOf(g.id)}
                onOpenCollection={onOpenCollection}
              />
            ))}
          </div>
          {windowInfo.bottomSpacerPx > 0 && (
            <div style={{ height: `${windowInfo.bottomSpacerPx}px` }} aria-hidden="true" />
          )}
        </div>
      )}

      {/* VIEW B: Virtualized Compact High-Density List */}
      {viewMode === 'concept_b_split' && (
        <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
          <table className="w-full table-fixed text-left border-collapse text-xs">
            <colgroup>
              <col />
              <col className="w-[8.5rem]" />
              <col className="w-[28%]" />
              <col className="w-[5rem]" />
              <col className="w-[5.5rem]" />
              <col className="w-[3.5rem]" />
            </colgroup>
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                <th className="py-2.5 px-3">{t('lib.col.title')}</th>
                <th className="py-2.5 px-3 whitespace-nowrap">{t('lib.col.consoleBit')}</th>
                <th className="py-2.5 px-3">{t('lib.col.genreAge')}</th>
                <th className="py-2.5 px-3 whitespace-nowrap">{t('lib.col.region')}</th>
                <th className="py-2.5 px-3 text-right whitespace-nowrap">{t('lib.col.size')}</th>
                <th className="py-2.5 px-2 text-right whitespace-nowrap">{t('lib.col.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
              {windowInfo.topSpacerPx > 0 && (
                <tr aria-hidden="true">
                  <td colSpan={6} style={{ height: `${windowInfo.topSpacerPx}px`, padding: 0, border: 0 }} />
                </tr>
              )}
              {visibleGames.map((g) => (
                <MemoCompactRow
                  key={g.id}
                  game={g}
                  isSelected={selectedGameId === g.id}
                  onSelect={onSelectGame}
                  onAddToBuild={onAddToBuild}
                  addBtnTitle={addBtnTitle}
                  discLabel={g.discCount && g.discCount > 1 ? tf('lib.discShort', { count: g.discCount }) : ''}
                  genreLabel={localizeGenre(g.genre, t)}
                  lang={lang}
                  {...badgeOf(g.id)}
                  onOpenCollection={onOpenCollection}
                />
              ))}
              {windowInfo.bottomSpacerPx > 0 && (
                <tr aria-hidden="true">
                  <td colSpan={6} style={{ height: `${windowInfo.bottomSpacerPx}px`, padding: 0, border: 0 }} />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* VIEW C: Virtualized Editor Table */}
      {viewMode === 'concept_c_workbench' && (
        <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
          <table className="w-full table-fixed text-left border-collapse text-xs">
            <colgroup>
              <col className="w-[3.5rem]" />
              <col className="w-[24%]" />
              <col />
              <col className="w-[11.5rem]" />
              <col className="w-[18%]" />
              <col className="w-[4.5rem]" />
            </colgroup>
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                <th className="py-2.5 px-3 whitespace-nowrap">{t('lib.col.select')}</th>
                <th className="py-2.5 px-3">{t('lib.col.oldFile')}</th>
                <th className="py-2.5 px-3">{t('ed.col.titleFile')}</th>
                <th className="py-2.5 px-3 whitespace-nowrap">{t('lib.col.consoleBit')}</th>
                <th className="py-2.5 px-3">{t('lib.col.status')}</th>
                <th className="py-2.5 px-2 text-right whitespace-nowrap">{t('lib.col.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
              {windowInfo.topSpacerPx > 0 && (
                <tr aria-hidden="true">
                  <td colSpan={6} style={{ height: `${windowInfo.topSpacerPx}px`, padding: 0, border: 0 }} />
                </tr>
              )}
              {visibleGames.map((g) => (
                <MemoEditorRow
                  key={g.id}
                  game={g}
                  isSelected={selectedGameId === g.id}
                  isChecked={!!checkedGameIds[g.id]}
                  onSelect={onSelectGame}
                  onToggleCheck={onToggleCheck}
                  onAddToBuild={onAddToBuild}
                  onEditGame={onEditGame}
                  addBtnTitle={addBtnTitle}
                  editBtnTitle={t('ed.editOne')}
                  manualTitle={t('ed.manualBadge')}
                  discLabel={g.discCount && g.discCount > 1 ? tf('lib.discShort', { count: g.discCount }) : ''}
                  lang={lang}
                />
              ))}
              {windowInfo.bottomSpacerPx > 0 && (
                <tr aria-hidden="true">
                  <td colSpan={6} style={{ height: `${windowInfo.bottomSpacerPx}px`, padding: 0, border: 0 }} />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
