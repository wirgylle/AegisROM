import React, { useEffect } from 'react';
import { Layers, LibraryBig, MinusCircle, Pencil, X } from 'lucide-react';
import { collectionKeyOf } from '../utils/gameCollections';
import { useI18n } from '../i18n/translations';
import type { EnrichedBuildGame } from '../utils/buildsAndConverterEngine';

// Список всех ромов одной коллекции (одна игра на разных консолях, в регионах и хаках).
// List of every ROM in one collection (one game across consoles, regions and hacks).
// В режиме 'series' — все игры линейки (Final Fantasy I–XII, Tactics), по году выхода.
// In 'series' mode: every game of the line, ordered by release year.

interface CollectionModalProps {
  title: string;
  mode?: 'collection' | 'series';
  members: EnrichedBuildGame[];
  selectedId: string;
  onPick: (id: string) => void;
  onClose: () => void;
  /** Убрать игру из группы (ручной — удалить, автоматической — вынуть). / Remove a game from the group. */
  onRemove?: (id: string) => void;
  /** Открыть окно «Коллекции и серии». / Open the "Collections and series" window. */
  onOpenManager?: () => void;
}

export const CollectionModal: React.FC<CollectionModalProps> = ({ title, mode = 'collection', members, selectedId, onPick, onClose, onRemove, onOpenManager }) => {
  const { t, tf } = useI18n();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const consoles = Array.from(new Set(members.map((m) => m.consoleShort.toUpperCase())));
  const isSeries = mode === 'series';
  const gameCount = isSeries ? new Set(members.map((m) => collectionKeyOf(m))).size : 0;
  const rows = [...members].sort(
    isSeries
      ? (a, b) =>
          (a.year || 9999) - (b.year || 9999) ||
          a.title.localeCompare(b.title, undefined, { numeric: true }) ||
          a.consoleShort.localeCompare(b.consoleShort)
      : (a, b) => a.consoleShort.localeCompare(b.consoleShort) || (a.year || 0) - (b.year || 0) || a.region.localeCompare(b.region)
  );
  const HeadIcon = isSeries ? LibraryBig : Layers;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-3xl w-full max-h-[85vh] overflow-hidden flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between gap-3">
          <div className="flex items-start gap-2 min-w-0">
            <HeadIcon className="w-5 h-5 text-accent shrink-0 mt-0.5" />
            <div className="min-w-0">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 truncate">
                {tf(isSeries ? 'series.modalTitle' : 'coll.modalTitle', { title })}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {isSeries
                  ? tf('series.modalSubtitle', { games: gameCount, count: members.length, consoles: consoles.length })
                  : tf('coll.modalSubtitle', { count: members.length, consoles: consoles.length })}
              </p>
            </div>
          </div>
          {onOpenManager && (
            <button
              type="button"
              onClick={onOpenManager}
              title={t('mg.open')}
              className="ml-auto shrink-0 h-7 px-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-1 cursor-pointer"
            >
              <Pencil className="w-3 h-3" />
              <span className="hidden sm:inline">{t('mg.title')}</span>
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label={t('coll.close')}
            className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto">
          <ul className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
            {rows.map((m) => {
              const isMod = m.modKind && m.modKind !== 'original';
              const isCurrent = m.id === selectedId;
              const manual = isSeries ? m.manualSeries?.startsWith('m:s:') : m.manualCollection?.startsWith('m:c:');
              return (
                <li key={m.id} className="relative group">
                  {onRemove && members.length > 1 && (
                    <button
                      type="button"
                      onClick={() => onRemove(m.id)}
                      title={t(manual ? 'mg.removeHintManual' : 'mg.removeHintAuto')}
                      aria-label={t(manual ? 'mg.removeHintManual' : 'mg.removeHintAuto')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 z-10 p-1 rounded text-slate-400 hover:text-red-600 bg-white/80 dark:bg-slate-900/80 opacity-60 group-hover:opacity-100 focus:opacity-100 cursor-pointer"
                    >
                      <MinusCircle className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onPick(m.id)}
                    className={`w-full text-left px-5 py-2.5 flex items-center gap-3 cursor-pointer transition ${
                      isCurrent ? 'bg-blue-50 dark:bg-blue-950/50' : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
                    }`}
                  >
                    <div className="w-10 h-[3.25rem] shrink-0 rounded bg-slate-200/70 dark:bg-slate-800 overflow-hidden flex items-center justify-center">
                      {m.boxArtUrl ? (
                        <img
                          src={m.boxArtUrl}
                          alt=""
                          loading="lazy"
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <span className="text-[9px] font-mono text-slate-500">{m.consoleShort}</span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="px-1.5 py-0.5 rounded bg-slate-900 text-white dark:bg-slate-700 font-mono font-semibold text-[10px]">
                          {m.consoleShort}
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-mono font-bold text-[10px]">
                          {m.region}
                        </span>
                        <span className={isMod ? 'text-violet-600 dark:text-violet-400 font-semibold' : 'text-slate-500 dark:text-slate-400'}>
                          {isMod
                            ? `${t(`hack.kind.${m.modKind}`, m.modKind)}${m.modTag ? ` [${m.modTag}]` : ''}`
                            : t('coll.original')}
                        </span>
                        {isCurrent && (
                          <span className="text-[10px] font-semibold text-blue-700 dark:text-blue-300">· {t('coll.current')}</span>
                        )}
                      </div>
                      <div className="font-semibold text-slate-900 dark:text-slate-100 truncate mt-0.5" title={m.title}>
                        {m.title}
                      </div>
                      <div className="font-mono text-[11px] text-slate-500 dark:text-slate-400 truncate" title={m.oldFile}>
                        {m.oldFile}
                      </div>
                    </div>
                    <div className={`shrink-0 text-right text-slate-500 dark:text-slate-400 tabular-nums ${onRemove ? 'pr-7' : ''}`}>
                      <div>{m.year || ''}</div>
                      <div>{m.size}</div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
};
