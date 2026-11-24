import React, { useState } from 'react';
import { Image as ImageIcon, X } from 'lucide-react';
import { useI18n } from '../i18n/translations';
import { MEDIA_SLOTS, type ScrapeOptions } from '../utils/scrapeOptions';
import type { MediaSlot } from '../utils/scrapePlan';

// Выбор типов медиа и повтора прошлых промахов перед скраппером. Панель отдельно от окна:
// её же вставляем в общее окно выбора области операции (OperationScopeModal, prop extra).
// Media types and past-miss retry before scraping. The panel is separate from the window so it can
// go into the shared operation scope window (OperationScopeModal, the extra prop).

export function ScrapeOptionsPanel({
  value,
  onChange,
}: {
  value: ScrapeOptions;
  onChange: (next: ScrapeOptions) => void;
}) {
  const { t } = useI18n();
  const toggle = (slot: MediaSlot, on: boolean) => {
    const slots = on ? MEDIA_SLOTS.filter((s) => s === slot || value.slots.includes(s)) : value.slots.filter((s) => s !== slot);
    onChange({ ...value, slots });
  };
  return (
    <div data-tool="scrapeOptions" className="space-y-2 text-xs">
      <div className="font-semibold text-slate-700 dark:text-slate-200">{t('scrape.opts.types')}</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
        {MEDIA_SLOTS.map((slot) => (
          <label key={slot} className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="w-3.5 h-3.5 mt-0.5 accent-blue-600"
              checked={value.slots.includes(slot)}
              onChange={(e) => toggle(slot, e.target.checked)}
            />
            <span>
              <span className="text-slate-800 dark:text-slate-100">{t(`scrape.opts.slot.${slot}`)}</span>
              <span className="block text-slate-500 dark:text-slate-400">{t(`scrape.opts.slotHint.${slot}`)}</span>
            </span>
          </label>
        ))}
      </div>
      <label className="flex items-start gap-2 cursor-pointer pt-1">
        <input
          type="checkbox"
          className="w-3.5 h-3.5 mt-0.5 accent-blue-600"
          checked={value.retryMisses}
          onChange={(e) => onChange({ ...value, retryMisses: e.target.checked })}
        />
        <span>
          <span className="text-slate-800 dark:text-slate-100">{t('scrape.opts.retry')}</span>
          <span className="block text-slate-500 dark:text-slate-400">{t('scrape.opts.retryHint')}</span>
        </span>
      </label>
    </div>
  );
}

export function ScrapeStartModal({
  open,
  initial,
  onConfirm,
  onClose,
}: {
  open: boolean;
  initial: ScrapeOptions;
  onConfirm: (opts: ScrapeOptions) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [opts, setOpts] = useState<ScrapeOptions>(initial);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('scrape.opts.title')}
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full max-h-[85vh] overflow-hidden flex flex-col shadow-2xl"
      >
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between gap-3">
          <div className="flex items-start gap-2 min-w-0">
            <ImageIcon className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">{t('scrape.opts.title')}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('scrape.opts.cancel')}
            className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">
          <ScrapeOptionsPanel value={opts} onChange={setOpts} />
        </div>
        <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-xs border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 cursor-pointer"
          >
            {t('scrape.opts.cancel')}
          </button>
          <button
            type="button"
            disabled={opts.slots.length === 0}
            onClick={() => onConfirm(opts)}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-accent hover:bg-accent-hover text-white cursor-pointer disabled:opacity-50"
          >
            {t('scrape.opts.start')}
          </button>
        </div>
      </div>
    </div>
  );
}
