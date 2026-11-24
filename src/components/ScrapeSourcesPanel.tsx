import React, { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, FolderOpen } from 'lucide-react';
import { useI18n } from '../i18n/translations';
import {
  moveSource,
  ssRequestsLeft,
  toggleSource,
  type ScrapeSourceChoice,
  type ScrapeSourceId,
  type SourceState,
  type SsQuota,
} from '../utils/scrapeSources';
import { checkOrRequestHandlePermission, loadDirectoryHandleRecord, saveDirectoryHandle } from '../utils/persistentHandles';

// Выбор источников медиа перед скраппером: какие включены, в каком порядке, переходить ли
// к следующему при промахе. Рядом с каждым — состояние: готов, нет логина, лимит, нет папки.
// Media source choice before scraping: which are on, in what order, whether to fall through to
// the next one on a miss. Each shows its state: ready, no login, quota used up, no folder.

export const LOCAL_MEDIA_HANDLE_KEY = 'scrape_local_media';

export interface SsQuotaState {
  configured: boolean;
  user?: string;
  quota?: SsQuota | null;
  // Код причины, если проверка не удалась (ss-auth, ss-limit, network). / Reason code if the check failed.
  reasonCode?: string;
  offline?: boolean;
}

export async function fetchSsQuota(): Promise<SsQuotaState> {
  try {
    const out = await (await fetch('/api/screenscraper/quota')).json();
    if (!out.configured) return { configured: false };
    if (!out.ok) return { configured: true, reasonCode: String(out.reasonCode || 'network') };
    return { configured: true, user: out.user, quota: out.info || null };
  } catch {
    return { configured: false, offline: true };
  }
}

export function ssStateOf(s: SsQuotaState | null): SourceState {
  if (!s) return 'ready';
  if (s.offline) return 'offline';
  if (!s.configured || s.reasonCode === 'ss-auth') return 'no-login';
  if (s.reasonCode === 'ss-limit' || ssRequestsLeft(s.quota) === 0) return 'quota';
  return 'ready';
}

const SOURCE_ICON: Record<ScrapeSourceId, string> = { local: '📁', libretro: '🖼', screenscraper: '🔑' };

export function ScrapeSourcesPanel({
  value,
  onChange,
  onOpenScreenScraper,
}: {
  value: ScrapeSourceChoice;
  onChange: (next: ScrapeSourceChoice) => void;
  // Перейти к настройке логина ScreenScraper (Инструменты). / Go to the ScreenScraper login (Tools).
  onOpenScreenScraper?: () => void;
}) {
  const { t, tf } = useI18n();
  const [ss, setSs] = useState<SsQuotaState | null>(null);
  const [localName, setLocalName] = useState<string>('');
  const [localNeedsGrant, setLocalNeedsGrant] = useState(false);

  useEffect(() => {
    let alive = true;
    void fetchSsQuota().then((s) => alive && setSs(s));
    void loadDirectoryHandleRecord(LOCAL_MEDIA_HANDLE_KEY).then(async (rec) => {
      if (!alive || !rec?.handle) return;
      setLocalName(rec.libraryPathHint || rec.folderName);
      setLocalNeedsGrant((await checkOrRequestHandlePermission(rec.handle, 'read', false)) !== 'granted');
    });
    return () => {
      alive = false;
    };
  }, []);

  const pickLocal = async () => {
    try {
      const h = await (window as any).showDirectoryPicker({ id: 'aegis-scrape-local', mode: 'read' });
      if (!h) return;
      await saveDirectoryHandle(LOCAL_MEDIA_HANDLE_KEY, h, h.fullPath || h.path || h.name);
      setLocalName(h.fullPath || h.path || h.name);
      setLocalNeedsGrant(false);
      if (!value.enabled.includes('local')) onChange(toggleSource(value, 'local', true));
    } catch {
      // Отмена диалога. / Dialog cancelled.
    }
  };

  const grantLocal = async () => {
    const rec = await loadDirectoryHandleRecord(LOCAL_MEDIA_HANDLE_KEY);
    if (rec?.handle) setLocalNeedsGrant((await checkOrRequestHandlePermission(rec.handle, 'read', true)) !== 'granted');
  };

  const state = (id: ScrapeSourceId): SourceState =>
    id === 'screenscraper' ? ssStateOf(ss) : id === 'local' ? (localName ? 'ready' : 'no-folder') : 'ready';

  const detail = (id: ScrapeSourceId): string => {
    if (id === 'libretro') return t('scrape.src.libretro.detail');
    if (id === 'local') {
      if (!localName) return t('scrape.src.local.none');
      return tf('scrape.src.local.folder', { folder: localName });
    }
    if (!ss) return t('scrape.src.ss.checking');
    const st = ssStateOf(ss);
    if (st === 'offline') return t('scrape.src.offline');
    if (st === 'no-login') return t(ss.configured ? 'scrape.src.ss.badLogin' : 'scrape.src.ss.noLogin');
    const left = ssRequestsLeft(ss.quota);
    const q = ss.quota;
    if (st === 'quota') return tf('scrape.src.ss.quotaOut', { max: q?.maxRequestsPerDay ?? '?' });
    if (left !== null && q) return tf('scrape.src.ss.quota', { user: ss.user || '', left, max: q.maxRequestsPerDay });
    return tf('scrape.src.ss.ready', { user: ss.user || '' });
  };

  const badge = (st: SourceState) => {
    const cls =
      st === 'ready'
        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
        : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300';
    return <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap ${cls}`}>{t(`scrape.src.state.${st}`)}</span>;
  };

  const btn =
    'px-2 py-1 rounded-md border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer disabled:opacity-40 disabled:cursor-default';

  return (
    <div data-tool="scrapeSources" className="space-y-2 text-xs">
      <div className="font-semibold text-slate-700 dark:text-slate-200">{t('scrape.src.title')}</div>
      <ol className="space-y-1.5">
        {value.order.map((id, i) => {
          const on = value.enabled.includes(id);
          const st = state(id);
          return (
            <li
              key={id}
              data-source={id}
              className={`rounded-lg border p-2 ${
                on ? 'border-slate-300 dark:border-slate-700' : 'border-dashed border-slate-200 dark:border-slate-800 opacity-70'
              }`}
            >
              <div className="flex items-start gap-2">
                <input
                  type="checkbox"
                  aria-label={t(`scrape.src.${id}.name`)}
                  className="w-3.5 h-3.5 mt-0.5 accent-blue-600 shrink-0"
                  checked={on}
                  onChange={(e) => onChange(toggleSource(value, id, e.target.checked))}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-slate-400 tabular-nums">{i + 1}.</span>
                    <span aria-hidden>{SOURCE_ICON[id]}</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-100">{t(`scrape.src.${id}.name`)}</span>
                    {on && badge(st)}
                  </div>
                  <div className="text-slate-500 dark:text-slate-400 mt-0.5">{t(`scrape.src.${id}.hint`)}</div>
                  <div className="text-slate-600 dark:text-slate-300 mt-0.5 break-all">{detail(id)}</div>
                  {id === 'local' && (
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      <button type="button" className={`${btn} flex items-center gap-1`} onClick={() => void pickLocal()}>
                        <FolderOpen className="w-3.5 h-3.5" />
                        {t(localName ? 'scrape.src.local.change' : 'scrape.src.local.pick')}
                      </button>
                      {localName && localNeedsGrant && (
                        <button type="button" className={btn} onClick={() => void grantLocal()}>
                          {t('scrape.src.local.grant')}
                        </button>
                      )}
                    </div>
                  )}
                  {id === 'screenscraper' && st === 'no-login' && onOpenScreenScraper && (
                    <button type="button" className={`${btn} mt-1.5`} onClick={onOpenScreenScraper}>
                      {t('scrape.src.ss.setup')}
                    </button>
                  )}
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                  <button
                    type="button"
                    className={btn}
                    disabled={i === 0}
                    aria-label={t('scrape.src.up')}
                    title={t('scrape.src.up')}
                    onClick={() => onChange(moveSource(value, id, -1))}
                  >
                    <ArrowUp className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    className={btn}
                    disabled={i === value.order.length - 1}
                    aria-label={t('scrape.src.down')}
                    title={t('scrape.src.down')}
                    onClick={() => onChange(moveSource(value, id, 1))}
                  >
                    <ArrowDown className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
      <label className="flex items-start gap-2 cursor-pointer pt-1">
        <input
          type="checkbox"
          className="w-3.5 h-3.5 mt-0.5 accent-blue-600"
          checked={value.fallback}
          onChange={(e) => onChange({ ...value, fallback: e.target.checked })}
        />
        <span>
          <span className="text-slate-800 dark:text-slate-100">{t('scrape.src.fallback')}</span>
          <span className="block text-slate-500 dark:text-slate-400">{t('scrape.src.fallbackHint')}</span>
        </span>
      </label>
      {value.enabled.length === 0 && <div className="text-amber-700 dark:text-amber-400">{t('scrape.src.noneOn')}</div>}
    </div>
  );
}
