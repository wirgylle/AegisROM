import React, { useEffect, useMemo, useState } from 'react';
import { Gamepad2, Package, Search, Trash2, X } from 'lucide-react';
import { useI18n } from '../i18n/translations';
import type { EnrichedBuildGame } from '../utils/buildsAndConverterEngine';
import type { PortMasterGame, SavedBuildItem, SavedBuildRecord } from '../types/aegis';

// Окно «Посмотреть сборку»: список игр сохранённой сборки с обложками, консолью и размером.
// "View build" window: the games of a saved build with cover, console and size.

interface BuildContentsModalProps {
  build: SavedBuildRecord | null;
  libraryGames: EnrichedBuildGame[];
  portMasterCatalog?: PortMasterGame[];
  onRemoveItem: (build: SavedBuildRecord, index: number) => void;
  onRemovePort: (build: SavedBuildRecord, slug: string) => void;
  onClose: () => void;
}

interface ResolvedItem {
  item: SavedBuildItem;
  index: number;
  game?: EnrichedBuildGame;
}

// Тот же поиск, что и в «Открыть в сборщике»: по id, затем по названию и консоли.
// Same lookup as "Open in builder": by id, then by title and console.
export function resolveBuildItemGame(
  item: SavedBuildItem,
  games: EnrichedBuildGame[]
): EnrichedBuildGame | undefined {
  return (
    games.find((g) => g.id === item.gameId) ||
    games.find(
      (g) =>
        g.consoleShort.toUpperCase() === item.consoleShort.toUpperCase() &&
        g.title.toLowerCase() === item.title.toLowerCase()
    )
  );
}

function formatMB(mb: number, t: (key: string, fallback?: string) => string): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(2)} ${t('size.gb', 'GB')}`;
  if (mb >= 1) return `${mb.toFixed(1)} ${t('size.mb', 'MB')}`;
  return `${Math.max(1, Math.round(mb * 1024))} ${t('size.kb', 'KB')}`;
}

// Обложка с запасным значком, если картинка не загрузилась.
// Cover with a fallback icon when the image fails to load.
const CoverThumb: React.FC<{ src?: string; className: string; fallback: React.ReactNode }> = ({
  src,
  className,
  fallback,
}) => {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return (
    <div
      className={`${className} shrink-0 rounded-md overflow-hidden bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center`}
    >
      {src && !failed ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          className="w-full h-full object-cover"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        fallback
      )}
    </div>
  );
};

export const BuildContentsModal: React.FC<BuildContentsModalProps> = ({
  build,
  libraryGames,
  portMasterCatalog = [],
  onRemoveItem,
  onRemovePort,
  onClose,
}) => {
  const { t, tf } = useI18n();
  const [query, setQuery] = useState('');

  useEffect(() => {
    setQuery('');
  }, [build?.id]);

  useEffect(() => {
    if (!build) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [build, onClose]);

  const resolved: ResolvedItem[] = useMemo(
    () =>
      (build?.items || []).map((item, index) => ({
        item,
        index,
        game: resolveBuildItemGame(item, libraryGames),
      })),
    [build, libraryGames]
  );

  const ports = useMemo(
    () =>
      (build?.portMasterSlugs || []).map((slug) => ({
        slug,
        port: portMasterCatalog.find((p) => p.slug === slug),
      })),
    [build, portMasterCatalog]
  );

  const q = query.trim().toLowerCase();
  const visibleItems = q
    ? resolved.filter(
        ({ item }) =>
          item.title.toLowerCase().includes(q) ||
          item.consoleShort.toLowerCase().includes(q) ||
          item.targetPath.toLowerCase().includes(q)
      )
    : resolved;
  const visiblePorts = q
    ? ports.filter(({ slug, port }) => (port?.title || slug).toLowerCase().includes(q))
    : ports;

  // Размер считаем только по найденным в Библиотеке играм.
  // Total size counts only games found in the Library.
  const totalMB = resolved.reduce((sum, r) => sum + (r.game?.sizeMB || 0), 0);
  const missingCount = resolved.filter((r) => !r.game).length;

  if (!build) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={tf('builds.view.title', { name: build.name })}
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-3xl w-full max-h-[85vh] overflow-hidden flex flex-col shadow-2xl"
      >
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between gap-3">
          <div className="flex items-start gap-2 min-w-0">
            <Package className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 break-words">
                {build.name}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {t(`profile.${build.targetProfileId}.short`, build.targetProfileName)}
                {' · '}
                {tf('builds.view.summary', {
                  games: build.items.length,
                  pm: build.portMasterSlugs?.length || 0,
                  size: formatMB(totalMB, t),
                })}
                {missingCount > 0 ? tf('builds.view.missingNote', { count: missingCount }) : ''}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('builds.view.close')}
            className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 pt-3">
          <label className="relative block">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('builds.view.searchPlaceholder')}
              className="w-full pl-8 pr-3 py-1.5 rounded-lg text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 outline-none focus:border-indigo-400"
            />
          </label>
        </div>

        <div className="overflow-y-auto px-5 py-3 space-y-1.5 text-xs">
          {visibleItems.length === 0 && visiblePorts.length === 0 && (
            <div className="py-10 text-center text-slate-500">
              {build.items.length === 0 && ports.length === 0
                ? t('builds.view.empty')
                : t('builds.view.noMatches')}
            </div>
          )}

          {visibleItems.map(({ item, index, game }) => (
            <div
              key={`${item.gameId}_${index}`}
              className="flex items-center gap-3 p-2 rounded-lg border border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50"
            >
              <CoverThumb
                src={game?.boxArtUrl}
                className="w-10 h-14"
                fallback={<Gamepad2 className="w-4 h-4 text-slate-400" />}
              />
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-slate-900 dark:text-slate-100 truncate" title={item.title}>
                  {item.title}
                </div>
                <div
                  className="font-mono text-[10px] text-slate-500 dark:text-slate-400 truncate"
                  title={tf('builds.conv.pathTooltip', { path: item.targetPath })}
                >
                  {item.targetPath}
                </div>
                {!game && (
                  <div className="text-[10px] text-amber-600 dark:text-amber-400">
                    {t('builds.view.notInLibrary')}
                  </div>
                )}
              </div>
              <span className="px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300 font-bold text-[10px] shrink-0">
                {item.consoleShort}
              </span>
              <span className="w-16 text-right font-mono text-[11px] text-slate-600 dark:text-slate-300 shrink-0">
                {game ? game.size || formatMB(game.sizeMB, t) : '—'}
              </span>
              <button
                type="button"
                onClick={() => onRemoveItem(build, index)}
                title={t('builds.view.removeTip')}
                aria-label={t('builds.view.removeTip')}
                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}

          {visiblePorts.length > 0 && (
            <>
              <div className="pt-2 pb-0.5 font-semibold text-slate-700 dark:text-slate-300">
                {tf('builds.view.portsHeading', { count: visiblePorts.length })}
              </div>
              {visiblePorts.map(({ slug, port }) => (
                <div
                  key={slug}
                  className="flex items-center gap-3 p-2 rounded-lg border border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                >
                  <CoverThumb
                    src={port?.screenshotUrl}
                    className="w-10 h-10"
                    fallback={<Package className="w-4 h-4 text-slate-400" />}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {port?.title || slug}
                    </div>
                    <div className="font-mono text-[10px] text-slate-500 dark:text-slate-400 truncate">
                      ports/{slug}
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-violet-100 dark:bg-violet-950 text-violet-800 dark:text-violet-300 font-bold text-[10px] shrink-0">
                    PortMaster
                  </span>
                  <button
                    type="button"
                    onClick={() => onRemovePort(build, slug)}
                    title={t('builds.view.removeTip')}
                    aria-label={t('builds.view.removeTip')}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </>
          )}
        </div>

        <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] text-slate-500 dark:text-slate-400">{t('builds.view.removeHint')}</p>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
          >
            {t('builds.view.close')}
          </button>
        </div>
      </div>
    </div>
  );
};
