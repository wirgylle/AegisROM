import React, { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileDown, ShieldCheck, Square, XCircle } from 'lucide-react';
import { useI18n } from '../i18n/translations';
import { isNativeFsEnabled } from '../utils/nativeFs';
import { formatRomCheckReport, type RomCheckIssue, type RomCheckReport } from '../utils/romCheck';

// Инструмент «Проверка ромов» в «Инструментах»: запуск, сводка, список проблем, отчёт в .txt.
// "ROM check" tool in Tools: run, summary, list of problems, .txt report.

const MAX_ROWS = 300;

export function RomCheckPanel({
  disabled,
  running,
  progressText,
  report,
  onRun,
  onStop,
}: {
  disabled?: boolean;
  running?: boolean;
  progressText?: string;
  report?: RomCheckReport | null;
  onRun?: (deepChd: boolean) => void;
  onStop?: () => void;
}) {
  const { t, tf } = useI18n();
  const [deep, setDeep] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [copied, setCopied] = useState(false);
  const native = isNativeFsEnabled();

  const issueText = (is: RomCheckIssue) => {
    const params: Record<string, string | number> = { msg: '', ...(is.params || {}) };
    return tf(`rc.issue.${is.code}`, params).trim();
  };

  const rows = useMemo(() => {
    if (!report) return [];
    const list = showAll ? report.results : report.results.filter((r) => r.level !== 'ok');
    const rank = { error: 0, warn: 1, ok: 2 } as const;
    return [...list].sort((a, b) => rank[a.level] - rank[b.level] || a.title.localeCompare(b.title));
  }, [report, showAll]);

  const reportText = () =>
    report
      ? formatRomCheckReport(report, issueText, {
          title: t('rc.title'),
          ok: t('rc.ok'),
          warn: t('rc.warn'),
          error: t('rc.error'),
          bios: t('rc.biosLabel'),
        })
      : '';

  const save = () => {
    const blob = new Blob([reportText()], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aegisrom_rom_check_${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(reportText());
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  const btn =
    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 font-semibold cursor-pointer disabled:opacity-50';

  return (
    <div data-tool="romCheck" className="rounded-xl border border-slate-300 dark:border-slate-700 p-3 text-xs space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <ShieldCheck className="w-4 h-4 shrink-0" />
        <span className="font-bold text-slate-800 dark:text-slate-100">{t('rc.title')}</span>
        <div className="ml-auto flex flex-wrap gap-1.5">
          {running ? (
            <button type="button" className={btn} onClick={() => onStop?.()}>
              <Square className="w-3.5 h-3.5 shrink-0" />
              <span>{t('rc.stop')}</span>
            </button>
          ) : (
            <button type="button" className={btn} disabled={disabled || !onRun} onClick={() => onRun?.(deep && native)}>
              <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
              <span>{t('rc.run')}</span>
            </button>
          )}
        </div>
      </div>
      <p className="text-slate-600 dark:text-slate-400 leading-relaxed">{t('rc.desc')}</p>
      <label className={`flex items-start gap-2 ${native ? 'cursor-pointer' : 'opacity-60'}`}>
        <input
          type="checkbox"
          className="mt-0.5"
          checked={deep && native}
          disabled={!native || running}
          onChange={(e) => setDeep(e.target.checked)}
        />
        <span>
          {t('rc.deep')}
          {!native && <span className="block text-slate-500 dark:text-slate-400">{t('rc.deepNative')}</span>}
        </span>
      </label>
      {running && progressText && <div className="text-slate-600 dark:text-slate-300 break-words">{progressText}</div>}

      {report && !running && (
        <div className="space-y-2 pt-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 text-rose-700 dark:text-rose-300 font-semibold">
              <XCircle className="w-3.5 h-3.5" /> {t('rc.error')}: {report.counts.error}
            </span>
            <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-300 font-semibold">
              <AlertTriangle className="w-3.5 h-3.5" /> {t('rc.warn')}: {report.counts.warn}
            </span>
            <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-300 font-semibold">
              <CheckCircle2 className="w-3.5 h-3.5" /> {t('rc.ok')}: {report.counts.ok}
            </span>
            {report.stopped && <span className="text-slate-500">{t('rc.stopped')}</span>}
            <div className="ml-auto flex flex-wrap gap-1.5">
              <button type="button" className={btn} onClick={() => setShowAll((v) => !v)}>
                {showAll ? t('rc.filter.problems') : t('rc.filter.all')}
              </button>
              <button type="button" className={btn} onClick={() => void copy()}>
                {copied ? t('rc.copied') : t('rc.copy')}
              </button>
              <button type="button" className={btn} onClick={save}>
                <FileDown className="w-3.5 h-3.5 shrink-0" />
                <span>{t('rc.save')}</span>
              </button>
            </div>
          </div>
          {report.biosMissing.length > 0 && (
            <div className="text-amber-800 dark:text-amber-200">{tf('rc.biosMissing', { list: report.biosMissing.join(', ') })}</div>
          )}
          {report.biosUnchecked && <div className="text-slate-600 dark:text-slate-400">{t('rc.biosUnchecked')}</div>}
          {rows.length === 0 ? (
            <div className="text-emerald-700 dark:text-emerald-300">{t('rc.none')}</div>
          ) : (
            <ul className="max-h-96 overflow-y-auto divide-y divide-slate-200 dark:divide-slate-800 rounded-lg border border-slate-200 dark:border-slate-800">
              {rows.slice(0, MAX_ROWS).map((r) => (
                <li key={r.id} className="p-2 space-y-0.5">
                  <div className="flex items-start gap-1.5">
                    {r.level === 'error' ? (
                      <XCircle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-rose-600" />
                    ) : r.level === 'warn' ? (
                      <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-600" />
                    ) : (
                      <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0 text-emerald-600" />
                    )}
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-800 dark:text-slate-100 break-words">
                        {r.title} <span className="text-slate-500 font-normal">({r.console.toUpperCase()})</span>
                      </div>
                      <div className="text-slate-500 dark:text-slate-400 break-all">{r.path}</div>
                      {r.issues.map((is, i) => (
                        <div
                          key={i}
                          className={`break-words ${is.level === 'error' ? 'text-rose-700 dark:text-rose-300' : 'text-amber-800 dark:text-amber-200'}`}
                        >
                          {is.file ? <span className="font-mono">{is.file}: </span> : null}
                          {issueText(is)}
                        </div>
                      ))}
                    </div>
                  </div>
                </li>
              ))}
              {rows.length > MAX_ROWS && (
                <li className="p-2 text-slate-500">{tf('rc.more', { n: rows.length - MAX_ROWS })}</li>
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
