import React, { useEffect, useState } from 'react';
import { HardDriveDownload, X } from 'lucide-react';
import { useI18n } from '../i18n/translations';
import {
  BUILD_MEDIA_KINDS,
  type BuildExportOptions,
  type BuildMediaKind,
  type MediaLayout,
} from '../utils/buildMedia';
import type { BuildPlanSummary } from '../utils/buildQueue';

// Окно перед выгрузкой сборки: медиа (какие типы), пропуск готовых файлов, gamelist.xml.
// Dialog before a build export: media (which kinds), skipping finished files, gamelist.xml.

interface BuildExportOptionsModalProps {
  initial: BuildExportOptions;
  profileName: string;
  mediaLayout: MediaLayout;
  /** Профиль пишет gamelist.xml (EmulationStation). / The profile uses gamelist.xml (EmulationStation). */
  supportsGamelist: boolean;
  gameCount: number;
  totalSizeLabel: string;
  /** Предварительный анализ: что копируется, что конвертируется. / Pre-analysis: what is copied, what is converted. */
  plan?: BuildPlanSummary;
  /** Проверка медиа рядом с ромами. / Checks media next to the ROMs. */
  checkMedia?: () => Promise<{ found: number; total: number }>;
  onConfirm: (opts: BuildExportOptions) => void;
  onClose: () => void;
}

export const BuildExportOptionsModal: React.FC<BuildExportOptionsModalProps> = ({
  initial,
  profileName,
  mediaLayout,
  supportsGamelist,
  gameCount,
  totalSizeLabel,
  plan,
  checkMedia,
  onConfirm,
  onClose,
}) => {
  const { t, tf } = useI18n();
  const [opts, setOpts] = useState<BuildExportOptions>(() => ({
    ...initial,
    mediaKinds: { ...initial.mediaKinds },
  }));
  const mediaSupported = mediaLayout !== 'none';
  const [mediaStat, setMediaStat] = useState<{ found: number; total: number } | null>(null);
  useEffect(() => {
    if (!checkMedia || !mediaSupported) return;
    let alive = true;
    checkMedia()
      .then((r) => alive && setMediaStat(r))
      .catch(() => {});
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const gb = (mb: number) => (mb / 1024).toFixed(1);
  const anyKind = BUILD_MEDIA_KINDS.some((k) => opts.mediaKinds[k]);

  const setKind = (k: BuildMediaKind, v: boolean) =>
    setOpts((prev) => ({ ...prev, mediaKinds: { ...prev.mediaKinds, [k]: v } }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full max-h-[85vh] overflow-hidden flex flex-col shadow-2xl">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between gap-3">
          <div className="flex items-start gap-2 min-w-0">
            <HardDriveDownload className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">{t('bx.title')}</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {profileName} · {tf('bx.summary', { count: gameCount, size: totalSizeLabel })}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label={t('bx.cancel')}
            className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-4 space-y-4 text-xs text-slate-700 dark:text-slate-200">
          {plan && (
            <div className="space-y-1 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 px-3 py-2.5">
              <p className="font-semibold text-sm">{t('bq.planTitle')}</p>
              <ul className="space-y-0.5 list-disc pl-4">
                <li>{tf('bq.planCopy', { count: plan.copy.count, gb: gb(plan.copy.mb) })}</li>
                <li>
                  {plan.convert.count > 0
                    ? tf('bq.planConvert', {
                        count: plan.convert.count,
                        gb: gb(plan.convert.mb),
                        formats: Object.entries(plan.convert.byTarget)
                          .map(([ext, n]) => `${ext}: ${n}`)
                          .join(', '),
                      })
                    : t('bq.planNoConvert')}
                </li>
                {plan.chdmanMissing > 0 && (
                  <li className="text-amber-700 dark:text-amber-400">
                    {tf('bq.planNoChdman', { count: plan.chdmanMissing })}
                  </li>
                )}
                {plan.noFile > 0 && (
                  <li className="text-amber-700 dark:text-amber-400">{tf('bq.planNoFile', { count: plan.noFile })}</li>
                )}
                {mediaSupported && checkMedia && (
                  <li
                    className={
                      mediaStat && mediaStat.total > 0 && mediaStat.found === 0
                        ? 'text-amber-700 dark:text-amber-400'
                        : ''
                    }
                  >
                    {!mediaStat
                      ? t('bq.planMediaChecking')
                      : mediaStat.total > 0 && mediaStat.found === 0
                      ? t('bq.planMediaNone')
                      : tf('bq.planMedia', mediaStat)}
                  </li>
                )}
              </ul>
              <p className="text-slate-500 dark:text-slate-400">{t('bq.planOrder')}</p>
            </div>
          )}

          {mediaSupported ? (
            <div className="space-y-2">
              <label className="flex items-start gap-2 cursor-pointer font-semibold text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5 w-4 h-4 accent-emerald-600"
                  checked={opts.includeMedia}
                  onChange={(e) => setOpts((prev) => ({ ...prev, includeMedia: e.target.checked }))}
                />
                <span>{t('bx.mediaToggle')}</span>
              </label>
              <p className="text-slate-500 dark:text-slate-400 pl-6">{t('bx.mediaHint')}</p>
              <div className={`pl-6 grid gap-1.5 ${opts.includeMedia ? '' : 'opacity-50 pointer-events-none'}`}>
                {BUILD_MEDIA_KINDS.map((k) => (
                  <label key={k} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      className="w-3.5 h-3.5 accent-emerald-600"
                      checked={Boolean(opts.mediaKinds[k])}
                      onChange={(e) => setKind(k, e.target.checked)}
                    />
                    <span>{t(`bx.kind.${k}`)}</span>
                  </label>
                ))}
                {mediaLayout === 'single' && (
                  <p className="text-amber-600 dark:text-amber-400">{t('bx.singleNote')}</p>
                )}
              </div>
            </div>
          ) : (
            <p className="text-slate-500 dark:text-slate-400">{tf('bx.mediaUnsupported', { name: profileName })}</p>
          )}

          <div className="space-y-1">
            <label className="flex items-start gap-2 cursor-pointer font-semibold">
              <input
                type="checkbox"
                className="mt-0.5 w-3.5 h-3.5 accent-emerald-600"
                checked={opts.skipExisting}
                onChange={(e) => setOpts((prev) => ({ ...prev, skipExisting: e.target.checked }))}
              />
              <span>{t('bx.skipExisting')}</span>
            </label>
            <p className="text-slate-500 dark:text-slate-400 pl-6">{t('bx.skipHint')}</p>
          </div>

          <div className="space-y-1">
            <label className="flex items-start gap-2 cursor-pointer font-semibold">
              <input
                type="checkbox"
                className="mt-0.5 w-3.5 h-3.5 accent-emerald-600"
                checked={opts.syncSaves}
                onChange={(e) => setOpts((prev) => ({ ...prev, syncSaves: e.target.checked }))}
              />
              <span>{t('sv.bx.sync')}</span>
            </label>
            <p className="text-slate-500 dark:text-slate-400 pl-6">{t('sv.bx.syncHint')}</p>
          </div>

          {supportsGamelist && (
            <div className="space-y-1">
              <label className="flex items-start gap-2 cursor-pointer font-semibold">
                <input
                  type="checkbox"
                  className="mt-0.5 w-3.5 h-3.5 accent-emerald-600"
                  checked={opts.writeGamelist}
                  onChange={(e) => setOpts((prev) => ({ ...prev, writeGamelist: e.target.checked }))}
                />
                <span>{t('bx.gamelist')}</span>
              </label>
              <p className="text-slate-500 dark:text-slate-400 pl-6">{t('bx.gamelistHint')}</p>
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 flex flex-wrap justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            {t('bx.cancel')}
          </button>
          <button
            onClick={() =>
              onConfirm({
                ...opts,
                includeMedia: mediaSupported && opts.includeMedia && anyKind,
              })
            }
            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700"
          >
            {t('bx.start')}
          </button>
        </div>
      </div>
    </div>
  );
};
