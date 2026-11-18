import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, CheckCircle2, Layers, Plus } from 'lucide-react';
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
}

const GRID_CARD_HEIGHT = 208;
const GRID_GAP = 14;
const GRID_ROW_STRIDE = GRID_CARD_HEIGHT + GRID_GAP; // 222px deterministic row height
const GRID_OVERSCAN_ROWS = 3;

const COMPACT_ROW_HEIGHT = 40;
const EDITOR_ROW_HEIGHT = 42;
const TABLE_OVERSCAN_ROWS = 14;

// Pre-warm cache for upcoming box-art thumbnails in the scroll buffer zone
const warmedImageUrls = new Set<string>();

interface MemoGridCardProps {
  game: EnrichedBuildGame;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onAddToBuild?: (game: EnrichedBuildGame) => void;
  addBtnTitle: string;
  discLabel: string;
  lang: string;
}

const MemoGridCard = React.memo<MemoGridCardProps>(
  ({ game, isSelected, onSelect, onAddToBuild, addBtnTitle, discLabel }) => {
    const [imgFailed, setImgFailed] = useState(false);

    useEffect(() => {
      setImgFailed(false);
    }, [game.boxArtUrl]);

    return (
      <div
        onClick={() => onSelect(game.id)}
        style={{ height: `${GRID_CARD_HEIGHT}px` }}
        className={`rounded-2xl border p-3 transition-colors cursor-pointer flex flex-col justify-between overflow-hidden group ${
          isSelected
            ? 'border-blue-600 bg-blue-50/40 dark:bg-blue-950/40 ring-2 ring-blue-500/20'
            : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 hover:border-slate-300 dark:hover:border-slate-700'
        }`}
      >
        <div className="h-[132px] shrink-0 rounded-xl bg-slate-950 text-white p-2 flex flex-col justify-between mb-2 relative overflow-hidden">
          {game.boxArtUrl && !imgFailed && (
            <img
              src={game.boxArtUrl}
              alt={game.title}
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
              onError={() => setImgFailed(true)}
              className="absolute inset-0 w-full h-full object-contain p-1.5"
            />
          )}
          <div className="relative z-10 flex items-center justify-between text-[10px] font-mono">
            <span className="px-1.5 py-0.5 rounded bg-black/80 text-white font-bold">
              {game.consoleShort}
            </span>
            <div className="flex items-center gap-1">
              <span className="px-1.5 py-0.5 rounded bg-emerald-600 text-white font-bold">
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
                  className="w-5 h-5 rounded bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center shadow-xs cursor-pointer transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
        <div className="min-w-0">
          <div
            className="text-xs font-extrabold text-slate-900 dark:text-slate-100 truncate leading-snug"
            title={game.title}
          >
            {game.title}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 flex items-center justify-between gap-1.5 font-mono tabular-nums min-w-0">
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
    prev.lang === next.lang &&
    prev.discLabel === next.discLabel &&
    prev.addBtnTitle === next.addBtnTitle &&
    prev.game.id === next.game.id &&
    prev.game.title === next.game.title &&
    prev.game.boxArtUrl === next.game.boxArtUrl &&
    prev.game.region === next.game.region &&
    prev.game.size === next.game.size &&
    prev.game.discCount === next.game.discCount &&
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
}

const MemoCompactRow = React.memo<MemoCompactRowProps>(
  ({ game, isSelected, onSelect, onAddToBuild, addBtnTitle, discLabel, genreLabel }) => (
    <tr
      onClick={() => onSelect(game.id)}
      style={{ height: `${COMPACT_ROW_HEIGHT}px` }}
      className={`cursor-pointer transition-colors ${
        isSelected
          ? 'bg-blue-50 dark:bg-blue-950/60 font-bold text-blue-700 dark:text-blue-300'
          : 'hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-800 dark:text-slate-200'
      }`}
    >
      <td className="px-3 max-w-[220px] truncate align-middle" title={game.title}>
        <span>{game.title}</span>
        {game.discCount && game.discCount > 1 && (
          <span className="ml-1.5 text-[10px] font-mono text-slate-400 dark:text-slate-500">
            · {discLabel}
          </span>
        )}
      </td>
      <td className="px-3 font-mono text-slate-500 dark:text-slate-400 whitespace-nowrap align-middle">
        {game.consoleShort} · {game.discCount && game.discCount > 1 ? discLabel : game.bitnessGroup}
      </td>
      <td
        className="px-3 text-slate-600 dark:text-slate-400 max-w-[150px] truncate align-middle"
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
  addBtnTitle: string;
  discLabel: string;
  lang: string;
}

const MemoEditorRow = React.memo<MemoEditorRowProps>(
  ({ game, isSelected, isChecked, onSelect, onToggleCheck, onAddToBuild, addBtnTitle, discLabel }) => (
    <tr
      onClick={() => onSelect(game.id)}
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
        className="px-3 font-mono text-rose-600 dark:text-rose-400 max-w-[200px] truncate align-middle"
        title={game.oldFile}
      >
        {game.oldFile}
      </td>
      <td
        className="px-3 font-mono font-bold text-slate-900 dark:text-slate-100 max-w-[220px] truncate align-middle"
        title={game.cleanFile}
      >
        {game.cleanFile}
      </td>
      <td className="px-3 font-mono text-slate-500 dark:text-slate-400 whitespace-nowrap align-middle">
        {game.consoleShort} · {game.discCount && game.discCount > 1 ? discLabel : game.bitnessGroup} · {game.ageRating}
      </td>
      <td
        className="px-3 text-emerald-700 dark:text-emerald-400 font-semibold max-w-[160px] truncate align-middle"
        title={game.status}
      >
        {game.status}
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
}) => {
  const { t, tf, locale, lang } = useI18n();
  const listRootRef = useRef<HTMLDivElement | null>(null);

  const [viewportMetrics, setViewportMetrics] = useState({
    scrollTop: 0,
    clientHeight: 720,
    listTopOffset: 240,
    gridCols: 3,
  });

  // Progressive background buffer index so 14,000+ rows warm smoothly without blocking UI interactions
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
      const gridCols = width >= 540 ? 3 : 2;

      setViewportMetrics((prev) => {
        if (
          Math.abs(prev.scrollTop - scrollEl.scrollTop) < 4 &&
          Math.abs(prev.clientHeight - scrollEl.clientHeight) < 4 &&
          Math.abs(prev.listTopOffset - listTopOffset) < 4 &&
          prev.gridCols === gridCols
        ) {
          return prev;
        }
        return {
          scrollTop: scrollEl.scrollTop,
          clientHeight: scrollEl.clientHeight || 720,
          listTopOffset,
          gridCols,
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
      const cols = viewportMetrics.gridCols;
      const totalRows = Math.ceil(totalItems / cols);
      const firstVisRow = Math.floor(relScrollTop / GRID_ROW_STRIDE);
      const lastVisRow = Math.ceil((relScrollTop + viewH) / GRID_ROW_STRIDE);

      const startRow = Math.max(0, firstVisRow - GRID_OVERSCAN_ROWS);
      const endRow = Math.min(totalRows, lastVisRow + GRID_OVERSCAN_ROWS);

      const startIdx = startRow * cols;
      const endIdx = Math.min(totalItems, endRow * cols);
      const topSpacerPx = startRow * GRID_ROW_STRIDE;
      const bottomSpacerPx = Math.max(0, (totalRows - endRow) * GRID_ROW_STRIDE);

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
        ? Math.ceil(games.length / viewportMetrics.gridCols) * GRID_ROW_STRIDE
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
            className="grid gap-3.5"
            style={{
              gridTemplateColumns: `repeat(${viewportMetrics.gridCols}, minmax(0, 1fr))`,
            }}
          >
            {visibleGames.map((g) => (
              <MemoGridCard
                key={g.id}
                game={g}
                isSelected={selectedGameId === g.id}
                onSelect={onSelectGame}
                onAddToBuild={onAddToBuild}
                addBtnTitle={addBtnTitle}
                discLabel={g.discCount && g.discCount > 1 ? tf('lib.discShort', { count: g.discCount }) : ''}
                lang={lang}
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
          <table className="w-full text-left border-collapse text-xs">
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
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                <th className="py-2.5 px-3 whitespace-nowrap">{t('lib.col.select')}</th>
                <th className="py-2.5 px-3">{t('lib.col.oldFile')}</th>
                <th className="py-2.5 px-3">{t('lib.col.cleanFile')}</th>
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
                  addBtnTitle={addBtnTitle}
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
