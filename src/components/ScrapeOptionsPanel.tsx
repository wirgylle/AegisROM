import React from 'react';
import { useI18n } from '../i18n/translations';
import { MEDIA_SLOTS, type ScrapeOptions } from '../utils/scrapeOptions';
import type { MediaSlot } from '../utils/scrapePlan';

// Выбор типов медиа и повтора прошлых промахов перед скраппером. Показывается внутри окна
// выбора области (OperationScopeModal, prop extra).
// Media types and past-miss retry before scraping, shown inside the scope window (OperationScopeModal, extra).

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
