import React, { useEffect, useState } from 'react';
import { FolderInput, X } from 'lucide-react';
import { useI18n } from '../i18n/translations';

// Предложение после 1G1R: перенести найденные хаки и переводы в <консоль>/hackroms/.
// Offer after 1G1R: move the found hacks and translations into <console>/hackroms/.

export interface HackMoveCandidate {
  id: string;
  fileName: string;
  relativePath: string;
  // Куда переедет файл. / Where the file will go.
  targetPath: string;
  description: string;
}

interface HackMoveModalProps {
  candidates: HackMoveCandidate[];
  busy?: boolean;
  onConfirm: (ids: string[]) => void;
  onClose: () => void;
}

export const HackMoveModal: React.FC<HackMoveModalProps> = ({ candidates, busy, onConfirm, onClose }) => {
  const { t, tf } = useI18n();
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const next: Record<string, boolean> = {};
    for (const c of candidates) next[c.id] = true;
    setChecked(next);
  }, [candidates]);

  if (candidates.length === 0) return null;
  const selectedIds = candidates.filter((c) => checked[c.id]).map((c) => c.id);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col shadow-2xl">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between gap-3">
          <div className="flex items-start gap-2 min-w-0">
            <FolderInput className="w-5 h-5 text-violet-500 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">{t('hack.move.title')}</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {tf('hack.move.subtitle', { count: candidates.length })}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label={t('hack.move.keep')}
            className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-3 space-y-1.5 text-xs">
          {candidates.map((c) => (
            <label
              key={c.id}
              className="flex items-start gap-2 p-2 rounded-lg border border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer"
            >
              <input
                type="checkbox"
                className="mt-0.5 w-3.5 h-3.5 accent-violet-600"
                checked={Boolean(checked[c.id])}
                onChange={(e) => setChecked((prev) => ({ ...prev, [c.id]: e.target.checked }))}
              />
              <span className="min-w-0">
                <span className="block font-mono font-semibold text-slate-900 dark:text-slate-100 break-all">
                  {c.fileName}
                </span>
                <span className="block text-slate-500 dark:text-slate-400 break-all">
                  {c.relativePath} → {c.targetPath}
                </span>
                {c.description && (
                  <span className="block text-violet-600 dark:text-violet-400 mt-0.5">{c.description}</span>
                )}
              </span>
            </label>
          ))}
        </div>

        <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 flex flex-wrap justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            {t('hack.move.keep')}
          </button>
          <button
            disabled={busy || selectedIds.length === 0}
            onClick={() => onConfirm(selectedIds)}
            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50"
          >
            {tf('hack.move.confirm', { count: selectedIds.length })}
          </button>
        </div>
      </div>
    </div>
  );
};
