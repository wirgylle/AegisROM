import React, { useCallback, useEffect, useState } from 'react';
import { KeyRound, ListChecks } from 'lucide-react';
import { useI18n } from '../i18n/translations';
import { MISS_REASONS, nextScrapeSteps, totalMissed, type ScrapeNextStep, type ScrapeReport } from '../utils/scrapeReport';

// Блок ScreenScraper в «Инструментах»: ввод своей учётки и ключа разработчика.
// Пароли уходят только на локальный сервер приложения и обратно не возвращаются.
// ScreenScraper block in Tools: the user's own account and developer key.
// Secrets go only to the local app server and are never read back.

interface SsConfig {
  configured: boolean;
  user?: string;
  hasDevKey?: boolean;
  // Ключ разработчика вшит в сборку: нужны только логин и пароль. / Built-in dev key: login and password only.
  builtinDevKey?: boolean;
}

export function ScreenScraperPanel({ disabled }: { disabled?: boolean }) {
  const { t, tf } = useI18n();
  const [cfg, setCfg] = useState<SsConfig | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [devId, setDevId] = useState('');
  const [devPassword, setDevPassword] = useState('');
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/screenscraper/config');
      const c = (await res.json()) as SsConfig;
      setCfg(c);
      setUnavailable(false);
      if (c.user) setUser(c.user);
    } catch {
      setUnavailable(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onSave = async () => {
    setBusy(true);
    setError('');
    setInfo('');
    try {
      const res = await fetch('/api/screenscraper/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ devId, devPassword, user, password }),
      });
      const out = await res.json();
      if (!out.ok) {
        setError(String(out.error || 'error'));
        return;
      }
      setDevPassword('');
      setPassword('');
      const q = out.info;
      setInfo(
        q && q.maxRequestsPerDay > 0
          ? `${t('tools.ss.saved')} ${tf('tools.ss.quota', { today: q.requestsToday, max: q.maxRequestsPerDay })}`
          : t('tools.ss.saved')
      );
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const onForget = async () => {
    setBusy(true);
    setError('');
    setInfo('');
    try {
      await fetch('/api/screenscraper/config', { method: 'DELETE' });
      setDevId('');
      setDevPassword('');
      setPassword('');
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const input =
    'w-full px-2 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100';
  const btn =
    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 font-semibold cursor-pointer disabled:opacity-50';
  const saved = Boolean(cfg?.configured);
  // Поля ключа разработчика нужны, только если он не вшит в сборку. / Dev key fields only without a built-in key.
  const needDevKey = cfg ? !cfg.builtinDevKey : false;
  const [showAdvanced, setShowAdvanced] = useState(false);
  const devFieldsOpen = needDevKey || showAdvanced;

  return (
    <div data-tool="screenscraper" className="rounded-xl border border-slate-300 dark:border-slate-700 p-3 text-xs space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <KeyRound className="w-4 h-4 shrink-0" />
        <span className="font-bold text-slate-800 dark:text-slate-100">{t('tools.ss.title')}</span>
        {cfg && (
          <span className={saved ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'}>
            {saved ? tf('tools.ss.connected', { user: cfg.user || '' }) : t('tools.ss.notConnected')}
          </span>
        )}
      </div>
      <p className="text-slate-500 dark:text-slate-400">{t('tools.ss.desc')}</p>
      <p className="text-slate-500 dark:text-slate-400">{t('tools.ss.pace')}</p>
      <p className="text-slate-500 dark:text-slate-400">{t(needDevKey ? 'tools.ss.needDevKey' : 'tools.ss.loginOnly')}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <label className="space-y-0.5">
          <span className="text-slate-600 dark:text-slate-300">{t('tools.ss.user')}</span>
          <input className={input} value={user} autoComplete="username" onChange={(e) => setUser(e.target.value)} />
        </label>
        <label className="space-y-0.5">
          <span className="text-slate-600 dark:text-slate-300">{t('tools.ss.password')}</span>
          <input
            className={input}
            type="password"
            value={password}
            autoComplete="current-password"
            placeholder={saved ? t('tools.ss.keep') : ''}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
      </div>
      {!needDevKey && (
        <button
          type="button"
          className="text-slate-500 dark:text-slate-400 underline cursor-pointer"
          onClick={() => setShowAdvanced((v) => !v)}
        >
          {t('tools.ss.advanced')}
        </button>
      )}
      {devFieldsOpen && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <label className="space-y-0.5">
          <span className="text-slate-600 dark:text-slate-300">{t('tools.ss.devId')}</span>
          <input
            className={input}
            value={devId}
            autoComplete="off"
            placeholder={cfg?.hasDevKey ? t('tools.ss.keep') : ''}
            onChange={(e) => setDevId(e.target.value)}
          />
        </label>
        <label className="space-y-0.5">
          <span className="text-slate-600 dark:text-slate-300">{t('tools.ss.devPassword')}</span>
          <input
            className={input}
            type="password"
            value={devPassword}
            autoComplete="off"
            placeholder={cfg?.hasDevKey ? t('tools.ss.keep') : ''}
            onChange={(e) => setDevPassword(e.target.value)}
          />
        </label>
        </div>
      )}
      <div className="flex flex-wrap gap-1.5">
        <button type="button" className={btn} disabled={disabled || busy || unavailable} onClick={() => void onSave()}>
          <KeyRound className="w-3.5 h-3.5 shrink-0" />
          <span>{t('tools.ss.save')}</span>
        </button>
        {saved && (
          <button type="button" className={btn} disabled={disabled || busy} onClick={() => void onForget()}>
            <span>{t('tools.ss.forget')}</span>
          </button>
        )}
      </div>
      {info && <p className="text-emerald-700 dark:text-emerald-400">{info}</p>}
      {unavailable && <p className="text-amber-600 dark:text-amber-400">{t('tools.ss.unavailable')}</p>}
      {error && <p className="text-red-600 dark:text-red-400 break-all">{error}</p>}
    </div>
  );
}

// Итог последнего скраппера: сколько найдено где, причины промахов и кнопки следующего шага.
// Last scraper run: what was found where, miss reasons and next-step buttons.
export function ScrapeReportCard({
  report,
  disabled,
  onStep,
}: {
  report: ScrapeReport;
  disabled?: boolean;
  onStep: (step: ScrapeNextStep) => void;
}) {
  const { t, tf } = useI18n();
  const missed = totalMissed(report);
  const steps = nextScrapeSteps(report);
  const btn =
    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 font-semibold cursor-pointer disabled:opacity-50';
  return (
    <div data-tool="scrapeReport" className="rounded-xl border border-slate-300 dark:border-slate-700 p-3 text-xs space-y-2">
      <div className="flex items-center gap-2 font-bold text-slate-800 dark:text-slate-100">
        <ListChecks className="w-4 h-4 shrink-0" />
        <span>{t('tools.scrapeReport.title')}</span>
      </div>
      <p className="text-slate-600 dark:text-slate-300">
        {tf('tools.scrapeReport.found', { libretro: report.libretro, ss: report.screenscraper, looked: report.looked })}
        {report.local > 0 && ` ${tf('scrape.src.reportLocal', { count: report.local })}`}
      </p>
      {missed > 0 && (
        <div className="space-y-0.5">
          <p className="font-semibold text-slate-700 dark:text-slate-200">{tf('tools.scrapeReport.missed', { total: missed })}</p>
          <ul className="space-y-0.5">
            {MISS_REASONS.filter((k) => report.missed[k] > 0).map((k) => (
              <li key={k} className="flex gap-2">
                <span className="text-slate-600 dark:text-slate-300">{t(`tools.scrapeReport.reason.${k}`)}</span>
                <span className="ml-auto font-mono text-slate-700 dark:text-slate-200">{report.missed[k]}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {report.ssStopped && (
        <p className="text-amber-600 dark:text-amber-400">{t(`tools.scrapeReport.ssStopped.${report.ssStopped}`)}</p>
      )}
      {steps.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {steps.map((s) => (
            <button key={s} type="button" className={btn} disabled={disabled} onClick={() => onStep(s)}>
              {t(`tools.scrapeReport.btn.${s}`)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
