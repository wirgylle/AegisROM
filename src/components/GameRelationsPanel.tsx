import React, { useEffect, useState } from 'react';
import { BookOpen, ExternalLink, Layers, ListOrdered, RefreshCw } from 'lucide-react';
import { useI18n } from '../i18n/translations';
import type { UnifiedGameRow } from './FigmaConceptStudio';
import type { GameCollection } from '../utils/gameCollections';
import { normalizeGameTitle } from '../utils/gameCollections';
import {
  consoleOfWikidataId,
  consoleKey,
  gameInfoCacheKey,
  lookupGameInfo,
  readGameInfoCache,
  writeGameInfoCache,
  type GameInfo,
} from '../utils/gameInfo';

// Правая панель: другие версии этой игры, та же серия в библиотеке и описание из Wikidata/Wikipedia.
// Right panel: other versions of this game, the same series in the library and a Wikidata/Wikipedia description.

const AUTO_KEY = 'aegis.gameinfo.auto';

function readAuto(): boolean {
  try {
    return localStorage.getItem(AUTO_KEY) !== '0';
  } catch {
    return true;
  }
}

interface GameRelationsPanelProps {
  game: UnifiedGameRow;
  /** Все ромы коллекции, включая текущий. / Every ROM in the collection, the current one included. */
  versions: UnifiedGameRow[];
  series: GameCollection<UnifiedGameRow>[];
  /** Ключ коллекции → id карточки-лица, для ссылок из Wikidata. / Collection key → lead id, for Wikidata links. */
  libraryLeadByKey: Map<string, string>;
  onSelect: (id: string) => void;
}

type InfoState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ok'; info: GameInfo }
  | { kind: 'miss' }
  | { kind: 'error'; message: string };

export const GameRelationsPanel: React.FC<GameRelationsPanelProps> = ({ game, versions, series, libraryLeadByKey, onSelect }) => {
  const { t, tf, lang } = useI18n();
  const [auto, setAuto] = useState(readAuto);
  const [state, setState] = useState<InfoState>({ kind: 'idle' });
  const [requestedKey, setRequestedKey] = useState('');
  const [retry, setRetry] = useState(0);
  const [showAllSeries, setShowAllSeries] = useState(false);

  const langs = lang === 'en' ? ['en'] : [lang, 'en'];
  const cacheKey = gameInfoCacheKey(game.title, game.consoleShort, lang);

  useEffect(() => {
    setShowAllSeries(false);
    const cached = readGameInfoCache(cacheKey);
    if (cached !== undefined) {
      setState(cached ? { kind: 'ok', info: cached } : { kind: 'miss' });
      return;
    }
    if (!auto && requestedKey !== cacheKey) {
      setState({ kind: 'idle' });
      return;
    }
    const ctrl = new AbortController();
    setState({ kind: 'loading' });
    // Пауза, чтобы не дёргать сеть при быстром листании. / Pause so fast browsing does not hit the network.
    const timer = window.setTimeout(() => {
      lookupGameInfo({ title: game.title, consoleShort: game.consoleShort, langs, signal: ctrl.signal })
        .then((info) => {
          writeGameInfoCache(cacheKey, info || null);
          setState(info ? { kind: 'ok', info } : { kind: 'miss' });
        })
        .catch((err) => {
          if (ctrl.signal.aborted) return;
          setState({ kind: 'error', message: String(err?.message || err) });
        });
    }, 450);
    return () => {
      window.clearTimeout(timer);
      ctrl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey, auto, requestedKey, retry]);

  const requestNow = () => {
    setRequestedKey(cacheKey);
    setRetry((n) => n + 1);
  };

  const toggleAuto = () => {
    const next = !auto;
    setAuto(next);
    try {
      localStorage.setItem(AUTO_KEY, next ? '1' : '0');
    } catch {
      // ignore
    }
  };

  const others = versions.filter((v) => v.id !== game.id);
  const ownedConsoles = new Set(versions.map((v) => consoleKey(v.consoleShort)));

  const sectionTitle = 'text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 flex items-center gap-1.5';
  const chip =
    'px-2 py-1 rounded-md border text-[11px] font-semibold transition text-left max-w-full truncate';

  const info = state.kind === 'ok' ? state.info : undefined;
  const seriesGames = info?.seriesGames || [];
  const visibleSeriesGames = showAllSeries ? seriesGames : seriesGames.slice(0, 12);

  return (
    <div className="space-y-3 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5">
      {/* Другие версии / Other versions */}
      <div className="space-y-1.5">
        <div className={sectionTitle}>
          <Layers className="w-3.5 h-3.5" />
          <span>{t('gi.versions')}</span>
          {others.length > 0 && <span className="tabular-nums">({others.length})</span>}
        </div>
        {others.length === 0 ? (
          <div className="text-slate-500 dark:text-slate-400">{t('gi.versionsEmpty')}</div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {others.map((v) => {
              const isMod = v.modKind && v.modKind !== 'original';
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => onSelect(v.id)}
                  title={`${v.title} · ${v.oldFile}`}
                  className={`${chip} cursor-pointer border-slate-200 dark:border-slate-700 hover:border-accent hover:text-accent ${
                    isMod ? 'text-violet-700 dark:text-violet-300' : 'text-slate-700 dark:text-slate-200'
                  }`}
                >
                  {v.consoleShort} · {v.region}
                  {isMod ? ` · ${v.modTag || t(`hack.kind.${v.modKind}`, v.modKind)}` : ''}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Серия в библиотеке / Series in the library */}
      {series.length > 0 && (
        <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-slate-800">
          <div className={sectionTitle} title={t('gi.seriesHint')}>
            <ListOrdered className="w-3.5 h-3.5" />
            <span>{t('gi.series')}</span>
            <span className="tabular-nums">({series.length})</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {series.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => onSelect(c.lead.id)}
                title={`${c.lead.title} · ${c.consoles.join(', ')}`}
                className={`${chip} cursor-pointer border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-accent hover:text-accent`}
              >
                {c.lead.title}
                <span className="font-normal text-slate-500 dark:text-slate-400"> · {c.consoles.join(' ')}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Описание / Description */}
      <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-slate-800">
        <div className="flex items-center justify-between gap-2">
          <div className={sectionTitle}>
            <BookOpen className="w-3.5 h-3.5" />
            <span>{t('gi.about')}</span>
          </div>
          <label className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400 cursor-pointer" title={t('gi.autoHint')}>
            <input type="checkbox" checked={auto} onChange={toggleAuto} className="w-3.5 h-3.5 accent-blue-600" />
            <span>{t('gi.auto')}</span>
          </label>
        </div>

        {state.kind === 'idle' && (
          <button
            type="button"
            onClick={requestNow}
            className="h-7 px-2.5 rounded-md border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-100 font-semibold cursor-pointer"
          >
            {t('gi.load')}
          </button>
        )}
        {state.kind === 'loading' && (
          <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            <span>{t('gi.loading')}</span>
          </div>
        )}
        {state.kind === 'miss' && <div className="text-slate-500 dark:text-slate-400">{t('gi.notFound')}</div>}
        {state.kind === 'error' && (
          <div className="flex items-center justify-between gap-2 text-amber-700 dark:text-amber-400">
            <span>{tf('gi.error', { error: state.message })}</span>
            <button
              type="button"
              onClick={requestNow}
              className="shrink-0 h-6 px-2 rounded-md border border-current font-semibold cursor-pointer"
            >
              {t('gi.retry')}
            </button>
          </div>
        )}

        {info && (
          <div className="space-y-2.5">
            {(info.extract || info.shortDescription) && (
              <p className="leading-relaxed text-slate-700 dark:text-slate-200 whitespace-pre-line">
                {info.extract || info.shortDescription}
              </p>
            )}

            {info.platforms.length > 0 && (
              <div className="space-y-1">
                <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">{t('gi.platforms')}</div>
                <div className="flex flex-wrap gap-1">
                  {info.platforms.map((p) => {
                    const ck = consoleOfWikidataId(p.id);
                    const owned = !!ck && ownedConsoles.has(ck);
                    return (
                      <span
                        key={p.id}
                        title={owned ? t('gi.inLibrary') : undefined}
                        className={`px-1.5 py-0.5 rounded text-[11px] ${
                          owned
                            ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-semibold'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {p.label}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            {info.series.length > 0 && seriesGames.length > 0 && (
              <div className="space-y-1">
                <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                  {tf('gi.seriesWd', { name: info.series.map((s) => s.label).join(', ') })}
                </div>
                <div className="flex flex-wrap gap-1">
                  {visibleSeriesGames.map((sg) => {
                    const leadId = libraryLeadByKey.get(normalizeGameTitle(sg.label));
                    const label = `${sg.label}${sg.year ? ` (${sg.year})` : ''}`;
                    return leadId ? (
                      <button
                        key={sg.id}
                        type="button"
                        onClick={() => onSelect(leadId)}
                        title={t('gi.inLibrary')}
                        className="px-1.5 py-0.5 rounded text-[11px] bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-semibold hover:ring-1 hover:ring-emerald-500 cursor-pointer"
                      >
                        {label}
                      </button>
                    ) : (
                      <span key={sg.id} className="px-1.5 py-0.5 rounded text-[11px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                        {label}
                      </span>
                    );
                  })}
                  {!showAllSeries && seriesGames.length > visibleSeriesGames.length && (
                    <button
                      type="button"
                      onClick={() => setShowAllSeries(true)}
                      className="px-1.5 py-0.5 rounded text-[11px] text-accent font-semibold cursor-pointer hover:underline"
                    >
                      {tf('gi.seriesWdMore', { count: seriesGames.length - visibleSeriesGames.length })}
                    </button>
                  )}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between gap-2 text-[10px] text-slate-400 dark:text-slate-500">
              <span>{t('gi.source')}</span>
              <span className="flex items-center gap-2 shrink-0">
                {info.wikiUrl && (
                  <a href={info.wikiUrl} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-0.5 hover:text-accent">
                    {t('gi.openWiki')} <ExternalLink className="w-3 h-3" />
                  </a>
                )}
                <a href={info.wikidataUrl} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-0.5 hover:text-accent">
                  {t('gi.openWd')} <ExternalLink className="w-3 h-3" />
                </a>
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
