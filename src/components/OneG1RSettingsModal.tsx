import React, { useState } from 'react';
import { RegionPriorityConfig } from '../types';
import { X, ArrowUp, ArrowDown, Check, Sliders, ShieldAlert } from 'lucide-react';

interface OneG1RSettingsModalProps {
  config: RegionPriorityConfig;
  isOpen: boolean;
  onClose: () => void;
  onSave: (config: RegionPriorityConfig) => void;
}

export const OneG1RSettingsModal: React.FC<OneG1RSettingsModalProps> = ({
  config,
  isOpen,
  onClose,
  onSave,
}) => {
  const [localConfig, setLocalConfig] = useState<RegionPriorityConfig>({ ...config });

  if (!isOpen) return null;

  const moveRegion = (index: number, direction: 'up' | 'down') => {
    const newOrder = [...localConfig.order];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newOrder.length) return;

    const temp = newOrder[index];
    newOrder[index] = newOrder[targetIndex];
    newOrder[targetIndex] = temp;

    setLocalConfig({ ...localConfig, order: newOrder });
  };

  const toggleOption = (key: keyof Omit<RegionPriorityConfig, 'order'>) => {
    setLocalConfig({ ...localConfig, [key]: !localConfig[key] });
  };

  const handleSave = () => {
    onSave(localConfig);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full overflow-hidden flex flex-col shadow-2xl">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sliders className="w-5 h-5 text-cyan-500" />
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              1G1R (1 Game 1 Region) Rules
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6 overflow-y-auto max-h-[75vh]">
          {/* Priority Ordering */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">
              Regional Priority Order (Highest to Lowest)
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
              When duplicates of the same game are found across regions, the top-ranked region is kept as primary.
            </p>

            <div className="space-y-1.5">
              {localConfig.order.map((region, idx) => (
                <div
                  key={region}
                  className="flex items-center justify-between px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg text-xs"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs text-cyan-600 dark:text-cyan-400 font-bold w-4">
                      {idx + 1}.
                    </span>
                    <span className="font-semibold text-slate-900 dark:text-slate-100">{region}</span>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => moveRegion(idx, 'up')}
                      disabled={idx === 0}
                      className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-30"
                      title="Move Up"
                    >
                      <ArrowUp className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => moveRegion(idx, 'down')}
                      disabled={idx === localConfig.order.length - 1}
                      className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-30"
                      title="Move Down"
                    >
                      <ArrowDown className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Filtering Rules */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-3">
              Deduplication & Quality Rules
            </h4>

            <div className="space-y-2.5 text-xs">
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={localConfig.preferRevisions}
                  onChange={() => toggleOption('preferRevisions')}
                  className="rounded text-cyan-600 focus:ring-cyan-500 w-4 h-4"
                />
                <span className="text-slate-700 dark:text-slate-200">
                  Prefer newer revisions (e.g., Rev 1 / v1.1 over initial v1.0 release)
                </span>
              </label>

              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={localConfig.excludeBadDumps}
                  onChange={() => toggleOption('excludeBadDumps')}
                  className="rounded text-cyan-600 focus:ring-cyan-500 w-4 h-4"
                />
                <span className="text-slate-700 dark:text-slate-200">
                  Automatically quarantine bad dumps tagged with [b]
                </span>
              </label>

              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={localConfig.excludeHacks}
                  onChange={() => toggleOption('excludeHacks')}
                  className="rounded text-cyan-600 focus:ring-cyan-500 w-4 h-4"
                />
                <span className="text-slate-700 dark:text-slate-200">
                  Quarantine unofficial hacks [h] and trainers [t]
                </span>
              </label>

              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={localConfig.excludeUnlicensed}
                  onChange={() => toggleOption('excludeUnlicensed')}
                  className="rounded text-cyan-600 focus:ring-cyan-500 w-4 h-4"
                />
                <span className="text-slate-700 dark:text-slate-200">
                  Exclude unlicensed bootlegs and pirate cart dumps
                </span>
              </label>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-cyan-600 hover:bg-cyan-500 rounded-lg shadow-sm transition-colors"
          >
            <Check className="w-4 h-4" />
            <span>Apply Rules & Recalculate</span>
          </button>
        </div>
      </div>
    </div>
  );
};
