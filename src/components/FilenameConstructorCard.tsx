import React from 'react';
import { ArrowUp, ArrowDown, Tag, Sparkles } from 'lucide-react';
import type {
  FilenameConstructorConfig,
  FilenameSeparator,
  FilenameTokenWrap,
} from '../types/aegis';
import {
  FILENAME_CONSTRUCTOR_PRESETS,
  formatRomFilenameByConfig,
} from '../utils/filenameConstructor';
import { useI18n } from '../i18n/translations';

interface FilenameConstructorCardProps {
  config: FilenameConstructorConfig;
  onChange: (next: FilenameConstructorConfig) => void;
  sampleTitle?: string;
  sampleYear?: number;
  sampleRegion?: string;
  sampleBitness?: string;
  sampleConsole?: string;
  sampleExt?: string;
}

export const FilenameConstructorCard: React.FC<FilenameConstructorCardProps> = ({
  config,
  onChange,
  sampleTitle = 'Tekken 3',
  sampleYear = 1998,
  sampleRegion = 'USA',
  sampleBitness = '32-bit',
  sampleConsole = 'PSX',
  sampleExt = '.chd',
}) => {
  const { t } = useI18n();
  const toggleToken = (idx: number) => {
    const nextTokens = config.tokens.map((t, i) =>
      i === idx ? { ...t, enabled: !t.enabled } : t
    );
    // Keep at least one enabled token (prefer 'name')
    if (!nextTokens.some((t) => t.enabled)) {
      nextTokens[0] = { ...nextTokens[0], enabled: true };
    }
    onChange({ ...config, tokens: nextTokens });
  };

  const moveToken = (idx: number, dir: -1 | 1) => {
    const targetIdx = idx + dir;
    if (targetIdx < 0 || targetIdx >= config.tokens.length) return;
    const copy = [...config.tokens];
    const [moved] = copy.splice(idx, 1);
    copy.splice(targetIdx, 0, moved);
    onChange({ ...config, tokens: copy });
  };

  const changeWrap = (idx: number, wrap: FilenameTokenWrap) => {
    const nextTokens = config.tokens.map((t, i) =>
      i === idx ? { ...t, wrap } : t
    );
    onChange({ ...config, tokens: nextTokens });
  };

  const previewPrimary = formatRomFilenameByConfig(
    {
      cleanTitle: sampleTitle,
      year: sampleYear,
      region: sampleRegion,
      bitness: sampleBitness,
      consoleCode: sampleConsole,
      extension: sampleExt,
    },
    config
  );

  const previewSecondary = formatRomFilenameByConfig(
    {
      cleanTitle: 'Comix Zone',
      year: 1995,
      region: 'Europe',
      bitness: '16-bit',
      consoleCode: 'GENESIS',
      extension: '.md',
    },
    config
  );

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3.5 space-y-3 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
          <Tag className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          <span>{t('ctor.title')}</span>
        </div>

        <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 dark:text-slate-300 cursor-pointer">
          <input
            type="checkbox"
            checked={config.preserveRevision}
            onChange={(e) => onChange({ ...config, preserveRevision: e.target.checked })}
            className="w-3.5 h-3.5 accent-indigo-600"
          />
          <span>{t('ctor.preserveRev')}</span>
        </label>
      </div>

      {/* Quick Presets */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] font-bold text-slate-500 mr-1">{t('ctor.presets')}</span>
        {FILENAME_CONSTRUCTOR_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => onChange(preset.config)}
            title={t(`ctor.presetHint.${preset.id}`, preset.hint)}
            className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-indigo-100 dark:hover:bg-indigo-950/60 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 text-[11px] font-bold cursor-pointer transition"
          >
            {t(`ctor.preset.${preset.id}`, preset.label)}
          </button>
        ))}
      </div>

      {/* Ordered Token Builder */}
      <div className="space-y-1.5">
        {config.tokens.map((tok, idx) => (
          <div
            key={tok.id}
            className={`flex flex-wrap items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg border transition ${
              tok.enabled
                ? 'bg-indigo-50/60 dark:bg-indigo-950/30 border-indigo-200 dark:border-indigo-800'
                : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 opacity-70'
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-5 h-5 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-mono text-[10px] font-bold flex items-center justify-center shrink-0">
                {idx + 1}
              </span>
              <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-800 dark:text-slate-100">
                <input
                  type="checkbox"
                  checked={tok.enabled}
                  onChange={() => toggleToken(idx)}
                  className="w-3.5 h-3.5 accent-indigo-600 cursor-pointer"
                />
                <span>{t(`ctor.tok.${tok.id}`, tok.label)}</span>
              </label>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <select
                value={tok.wrap}
                onChange={(e) => changeWrap(idx, e.target.value as FilenameTokenWrap)}
                disabled={!tok.enabled}
                className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-2 py-0.5 text-[11px] font-semibold"
              >
                <option value="none">{t('ctor.wrapNone')}</option>
                <option value="parens">{t('ctor.wrapParens')}</option>
                <option value="brackets">{t('ctor.wrapBrackets')}</option>
              </select>

              <button
                type="button"
                onClick={() => moveToken(idx, -1)}
                disabled={idx === 0}
                title={t('ctor.moveUp')}
                className="p-1 rounded bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 disabled:opacity-35 cursor-pointer"
              >
                <ArrowUp className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={() => moveToken(idx, 1)}
                disabled={idx === config.tokens.length - 1}
                title={t('ctor.moveDown')}
                className="p-1 rounded bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 disabled:opacity-35 cursor-pointer"
              >
                <ArrowDown className="w-3 h-3" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Separator & Live Example */}
      <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300">{t('ctor.separator')}</span>
          <select
            value={config.separator}
            onChange={(e) => onChange({ ...config, separator: e.target.value as FilenameSeparator })}
            className="bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-1 text-[11px] font-bold"
          >
            <option value=" ">{t('ctor.sepSpace')}</option>
            <option value=" - ">{t('ctor.sepDash')}</option>
            <option value="_">{t('ctor.sepUnder')}</option>
          </select>
        </div>

        <div className="flex items-center gap-1.5 text-[11px] font-mono bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 px-2.5 py-1 rounded-lg max-w-full overflow-hidden">
          <Sparkles className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          <span className="font-bold text-emerald-800 dark:text-emerald-300 truncate" title={`${previewPrimary} | ${previewSecondary}`}>
            {previewPrimary}
          </span>
          <span className="text-slate-400 hidden sm:inline">·</span>
          <span className="text-emerald-700 dark:text-emerald-400 truncate hidden sm:inline">
            {previewSecondary}
          </span>
        </div>
      </div>
    </div>
  );
};
