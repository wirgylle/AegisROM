import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileDown, FolderOpen, ShieldCheck, Square, Trash2, Wrench, XCircle } from 'lucide-react';
import { useI18n } from '../i18n/translations';
import { isNativeFsEnabled } from '../utils/nativeFs';
import { formatRomCheckReport, type RomCheckAction, type RomCheckIssue, type RomCheckReport } from '../utils/romCheck';

// Инструмент «Проверка ромов» в «Инструментах»: запуск, сводка, список проблем, отчёт в .txt,
// действия по каждой игре и по выбранным: исправить, удалить, показать в папке.
// "ROM check" tool in Tools: run, summary, list of problems, .txt report, actions per game and on the
// selected ones: fix, delete, show in folder.

const MAX_ROWS = 300;

export function RomCheckPanel({
  disabled,
  running,
  progressText,
  report,
  onRun,
  onStop,
  onAction,
  actionBusy,
}: {
  disabled?: boolean;
  running?: boolean;
  progressText?: string;
  report?: RomCheckReport | null;
  onRun?: (deepChd: boolean) => void;
  onStop?: () => void;
  onAction?: (action: RomCheckAction, ids: string[]) => Promise<void> | void;
  actionBusy?: boolean;
}) {
  const { t, tf } = useI18n();
  const [deep, setDeep] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [copied, setCopied] = useState(false);
  const native = isNativeFsEnabled();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState<string[] | null>(null);
  // Есть ли chdman: без него полная проверка CHD и пересборка пропускаются.
  // Whether chdman is there: without it the full CHD check and rebuilds are skipped.
  const [chdman, setChdman] = useState<boolean | null>(null);
  useEffect(() => {
    let off = false;
    fetch('/api/native/converter/status', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!off && d && typeof d.chdmanAvailable === 'boolean') setChdman(d.chdmanAvailable);
      })
      .catch(() => {});
    return () => {
      off = true;
    };
  }, [running]);
  useEffect(() => {
    setSelected(new Set());
    setConfirmDelete(null);
  }, [report?.checkedAt]);
  const busy = Boolean(running || actionBusy);

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
  const btnDanger =
    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 font-semibold cursor-pointer disabled:opacity-50';
  const btnSm =
    'flex items-center gap-1 px-2 py-1 rounded-md bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed';
  const btnSmDanger =
    'flex items-center gap-1 px-2 py-1 rounded-md bg-white dark:bg-slate-900 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 cursor-pointer disabled:opacity-50';

  // Игры, с которыми можно что-то сделать, и выбранные из них. / Games that allow an action, and the selected ones.
  const actionable = useMemo(
    () => (report ? report.results.filter((r) => r.level !== 'ok' && (r.canDelete || r.fixes?.length)) : []),
    [report]
  );
  const selectedFixable = actionable.filter((r) => selected.has(r.id) && r.fixes?.length).map((r) => r.id);
  const selectedDeletable = actionable.filter((r) => selected.has(r.id) && r.canDelete).map((r) => r.id);

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
            <button type="button" className={btn} disabled={disabled || !onRun || actionBusy} onClick={() => onRun?.(deep)}>
              <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
              <span>{t('rc.run')}</span>
            </button>
          )}
        </div>
      </div>
      <p className="text-slate-600 dark:text-slate-400 leading-relaxed">{t('rc.desc')}</p>
      <label className="flex items-start gap-2 cursor-pointer">
        <input type="checkbox" className="mt-0.5" checked={deep} disabled={running} onChange={(e) => setDeep(e.target.checked)} />
        <span>
          {t('rc.deep')}
          {!native && <span className="block text-slate-500 dark:text-slate-400">{t('rc.deepUpload')}</span>}
          {chdman === false && <span className="block text-amber-700 dark:text-amber-300">{t('rc.noChdman')}</span>}
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
          {onAction && actionable.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selected.size > 0 && selected.size === actionable.length}
                  disabled={busy}
                  onChange={(e) => setSelected(e.target.checked ? new Set(actionable.map((r) => r.id)) : new Set())}
                />
                <span>{tf('rc.act.selected', { n: selected.size, total: actionable.length })}</span>
              </label>
              <div className="ml-auto flex flex-wrap gap-1.5">
                <button
                  type="button"
                  className={btn}
                  disabled={busy || selectedFixable.length === 0}
                  title={t('rc.act.fixHint')}
                  onClick={() => void onAction('fix', selectedFixable)}
                >
                  <Wrench className="w-3.5 h-3.5 shrink-0" />
                  <span>{tf('rc.act.fixSelected', { n: selectedFixable.length })}</span>
                </button>
                <button
                  type="button"
                  className={btnDanger}
                  disabled={busy || selectedDeletable.length === 0}
                  onClick={() => setConfirmDelete(selectedDeletable)}
                >
                  <Trash2 className="w-3.5 h-3.5 shrink-0" />
                  <span>{tf('rc.act.deleteSelected', { n: selectedDeletable.length })}</span>
                </button>
              </div>
            </div>
          )}
          {confirmDelete && confirmDelete.length > 0 && (
            <div className="rounded-lg border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 p-2 space-y-1.5">
              <div className="text-rose-800 dark:text-rose-200 font-semibold">
                {tf('rc.act.confirm', { n: confirmDelete.length })}
              </div>
              <div className="text-rose-700 dark:text-rose-300">{native ? t('rc.act.confirmTrash') : t('rc.act.confirmForever')}</div>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  className={btnDanger}
                  disabled={busy}
                  onClick={() => {
                    const ids = confirmDelete;
                    setConfirmDelete(null);
                    setSelected(new Set());
                    void onAction?.('delete', ids);
                  }}
                >
                  <Trash2 className="w-3.5 h-3.5 shrink-0" />
                  <span>{t('rc.act.delete')}</span>
                </button>
                <button type="button" className={btn} onClick={() => setConfirmDelete(null)}>
                  {t('rc.act.cancel')}
                </button>
              </div>
            </div>
          )}
          {rows.length === 0 ? (
            <div className="text-emerald-700 dark:text-emerald-300">{t('rc.none')}</div>
          ) : (
            <ul className="max-h-96 overflow-y-auto divide-y divide-slate-200 dark:divide-slate-800 rounded-lg border border-slate-200 dark:border-slate-800">
              {rows.slice(0, MAX_ROWS).map((r) => (
                <li key={r.id} className="p-2 space-y-0.5">
                  <div className="flex items-start gap-1.5">
                    {onAction && (r.canDelete || r.fixes?.length) ? (
                      <input
                        type="checkbox"
                        className="mt-0.5 shrink-0"
                        checked={selected.has(r.id)}
                        disabled={busy}
                        onChange={(e) =>
                          setSelected((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(r.id);
                            else next.delete(r.id);
                            return next;
                          })
                        }
                      />
                    ) : null}
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
                      {r.outcome && (
                        <div
                          className={`break-words font-semibold ${
                            r.outcome.state === 'error' ? 'text-rose-700 dark:text-rose-300' : 'text-emerald-700 dark:text-emerald-300'
                          }`}
                        >
                          {r.outcome.text}
                        </div>
                      )}
                      {onAction && r.level !== 'ok' && r.outcome?.state !== 'deleted' && (
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {r.fixes && r.fixes.length > 0 && (
                            <button type="button" className={btnSm} disabled={busy} onClick={() => void onAction('fix', [r.id])}>
                              <Wrench className="w-3 h-3 shrink-0" />
                              <span>{r.fixes.map((k) => t(`rc.act.fix.${k}`)).join(', ')}</span>
                            </button>
                          )}
                          <button
                            type="button"
                            className={btnSm}
                            disabled={busy || !r.canReveal}
                            title={r.canReveal ? undefined : t('rc.act.revealNative')}
                            onClick={() => void onAction('reveal', [r.id])}
                          >
                            <FolderOpen className="w-3 h-3 shrink-0" />
                            <span>{t('rc.act.reveal')}</span>
                          </button>
                          {r.canDelete && (
                            <button type="button" className={btnSmDanger} disabled={busy} onClick={() => setConfirmDelete([r.id])}>
                              <Trash2 className="w-3 h-3 shrink-0" />
                              <span>{t('rc.act.delete')}</span>
                            </button>
                          )}
                        </div>
                      )}
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
