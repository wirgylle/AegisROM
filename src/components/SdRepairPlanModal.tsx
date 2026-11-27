import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, ExternalLink, FolderPlus, Wrench, X } from 'lucide-react';
import { useI18n } from '../i18n/translations';
import { getSdFirmwareProfile, summarizeSdPlan, type SdPlanItem, type SdRepairPlan } from '../utils/sdLayout';

// План «Починки флешки»: что создать, что требует внимания, откуда список.
// Ничего не делается до нажатия кнопки; удаление только в старых шагах и только по галочке.
// "Flash drive repair" plan: what to create, what needs attention, where the list comes from.
// Nothing happens before the button; deleting only in the old steps and only when ticked.

export interface SdRepairSelection {
  paths: string[];
  rescueRoms: boolean;
  cleanJunk: boolean;
}

interface SdRepairPlanModalProps {
  plan: SdRepairPlan | null;
  loading?: boolean;
  busy?: boolean;
  onApply: (sel: SdRepairSelection) => void;
  onDownloadCmd: (paths: string[]) => void;
  onClose: () => void;
}

export const SdRepairPlanModal: React.FC<SdRepairPlanModalProps> = ({
  plan,
  loading,
  busy,
  onApply,
  onDownloadCmd,
  onClose,
}) => {
  const { t, tf } = useI18n();
  const summary = useMemo(() => (plan ? summarizeSdPlan(plan) : null), [plan]);
  const profile = plan ? getSdFirmwareProfile(plan.firmware) : null;
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [consolesOn, setConsolesOn] = useState(false);
  const [showConsoles, setShowConsoles] = useState(false);
  const [rescueRoms, setRescueRoms] = useState(false);
  const [cleanJunk, setCleanJunk] = useState(false);

  useEffect(() => {
    if (!summary) return;
    const next: Record<string, boolean> = {};
    for (const i of summary.toCreateSystem) next[i.path] = true;
    setChecked(next);
    setConsolesOn(false);
    setRescueRoms(false);
    setCleanJunk(false);
  }, [summary]);

  if (!loading && !plan) return null;

  const fwName = plan ? t(`tools.sd.fw.${plan.firmware}`) : '';
  const selectedPaths = summary
    ? [
        ...summary.toCreateSystem.filter((i) => checked[i.path]).map((i) => i.path),
        ...(consolesOn ? summary.toCreateConsoles.map((i) => i.path) : []),
      ]
    : [];
  const canApply = Boolean(plan?.checked) && !busy && (selectedPaths.length > 0 || rescueRoms || cleanJunk);

  const warnText = (i: SdPlanItem) => {
    const path = i.foundAs || i.path;
    if (i.status === 'missingSystem') return tf('sd.warn.missingSystem', { path });
    if (i.status === 'emptyThemes') return tf('sd.warn.emptyThemes', { path });
    return tf('sd.warn.themesCreate', { path });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs" data-modal="sd-repair">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-2xl w-full max-h-[88vh] overflow-hidden flex flex-col shadow-2xl">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between gap-3">
          <div className="flex items-start gap-2 min-w-0">
            <Wrench className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                {tf('sd.plan.title', { fw: fwName })}
              </h3>
              {profile && (
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {tf('sd.plan.root', { hint: t(profile.rootKey) })}
                </p>
              )}
            </div>
          </div>
          <button onClick={onClose} aria-label={t('sd.plan.cancel')} className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-3 space-y-4 text-xs">
          {loading && <p className="text-slate-500">{t('sd.plan.checking')}</p>}

          {plan && summary && (
            <>
              {!plan.checked && (
                <p className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                  {t('sd.plan.notChecked')}
                </p>
              )}

              {summary.warnings.length > 0 && (
                <section className="space-y-1.5">
                  <h4 className="font-bold text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4" /> {t('sd.plan.warnings')}
                  </h4>
                  {summary.warnings.map((i) => (
                    <div key={`w-${i.path}`} className="p-2 rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40">
                      <div className="font-semibold text-amber-950 dark:text-amber-100 break-all">{warnText(i)}</div>
                      {i.whyKey && <div className="text-amber-800 dark:text-amber-300 mt-0.5">{t(i.whyKey)}</div>}
                      {i.fixUrl && (
                        <a href={i.fixUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 mt-1 text-amber-700 dark:text-amber-300 underline">
                          {t('sd.plan.fix')} <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  ))}
                </section>
              )}

              {summary.toCreateSystem.length > 0 ? (
                <section className="space-y-1.5">
                  <h4 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                    <FolderPlus className="w-4 h-4 text-emerald-600" /> {t('sd.plan.create')}
                  </h4>
                  {summary.toCreateSystem.map((i) => (
                    <label key={`c-${i.path}`} className="flex items-start gap-2 p-2 rounded-lg border border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer">
                      <input
                        type="checkbox"
                        className="mt-0.5 w-3.5 h-3.5 accent-emerald-600"
                        checked={Boolean(checked[i.path])}
                        onChange={(e) => setChecked((p) => ({ ...p, [i.path]: e.target.checked }))}
                      />
                      <span className="min-w-0">
                        <span className="block font-mono font-semibold text-slate-900 dark:text-slate-100 break-all">{i.path}/</span>
                        {i.whyKey && <span className="block text-slate-500 dark:text-slate-400">{t(i.whyKey)}</span>}
                      </span>
                    </label>
                  ))}
                </section>
              ) : (
                plan.checked && (
                  <p className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 font-semibold">
                    <CheckCircle2 className="w-4 h-4" /> {t('sd.plan.allGood')}
                  </p>
                )
              )}

              {summary.toCreateConsoles.length > 0 && (
                <section className="space-y-1">
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input type="checkbox" className="mt-0.5 w-3.5 h-3.5 accent-emerald-600" checked={consolesOn} onChange={(e) => setConsolesOn(e.target.checked)} />
                    <span>
                      <span className="block font-semibold text-slate-800 dark:text-slate-100">
                        {tf('sd.plan.consoles', { count: summary.toCreateConsoles.length })}
                      </span>
                      <span className="block text-slate-500 dark:text-slate-400">{t('sd.plan.consolesHint')}</span>
                    </span>
                  </label>
                  <button type="button" className="text-slate-500 underline" onClick={() => setShowConsoles((v) => !v)}>
                    {showConsoles ? t('sd.plan.hideList') : t('sd.plan.showList')}
                  </button>
                  {showConsoles && (
                    <p className="font-mono text-slate-600 dark:text-slate-400 break-words">
                      {summary.toCreateConsoles.map((i) => i.path).join(', ')}
                    </p>
                  )}
                </section>
              )}

              {plan.checked && summary.okCount > 0 && (
                <p className="text-slate-500 dark:text-slate-400">{tf('sd.plan.okCount', { count: summary.okCount })}</p>
              )}

              {plan.checked && (
                <section className="space-y-1 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <h4 className="font-bold text-slate-700 dark:text-slate-300">{t('sd.plan.extra')}</h4>
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input type="checkbox" className="mt-0.5 w-3.5 h-3.5 accent-rose-600" checked={rescueRoms} onChange={(e) => setRescueRoms(e.target.checked)} />
                    <span className="text-slate-700 dark:text-slate-300">{t('sd.plan.rescue')}</span>
                  </label>
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input type="checkbox" className="mt-0.5 w-3.5 h-3.5 accent-rose-600" checked={cleanJunk} onChange={(e) => setCleanJunk(e.target.checked)} />
                    <span className="text-slate-700 dark:text-slate-300">{t('sd.plan.junk')}</span>
                  </label>
                </section>
              )}

              {profile && (
                <details className="text-slate-500 dark:text-slate-400">
                  <summary className="cursor-pointer font-semibold">{t('sd.plan.sources')}</summary>
                  <ul className="mt-1 space-y-0.5">
                    {profile.sources.map((s) => (
                      <li key={s.url}>
                        <a href={s.url} target="_blank" rel="noreferrer" className="underline break-all">{s.label}</a>
                      </li>
                    ))}
                  </ul>
                </details>
              )}

              <p className="text-slate-500 dark:text-slate-400">{t('sd.plan.noRollback')}</p>
            </>
          )}
        </div>

        <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 flex flex-wrap justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800">
            {t('sd.plan.cancel')}
          </button>
          {summary && (
            <button
              disabled={busy || selectedPaths.length === 0}
              onClick={() => onDownloadCmd(selectedPaths)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 inline-flex items-center gap-1"
            >
              <Download className="w-3.5 h-3.5" /> {t('sd.plan.cmd')}
            </button>
          )}
          {plan?.checked && (
            <button
              disabled={!canApply}
              onClick={() => onApply({ paths: selectedPaths, rescueRoms, cleanJunk })}
              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {selectedPaths.length > 0 ? tf('sd.plan.apply', { count: selectedPaths.length }) : t('sd.plan.applyExtra')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
