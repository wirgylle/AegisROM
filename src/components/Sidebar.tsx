import React from 'react';
import { ConsolePlatform } from '../types';
import { PLATFORMS } from '../data/datDatabase';
import {
  Layers,
  CheckCircle2,
  AlertTriangle,
  Copy,
  Trash2,
  Sliders,
  FolderSync,
  Cloud,
  Terminal,
} from 'lucide-react';

interface SidebarProps {
  selectedPlatform: ConsolePlatform;
  setSelectedPlatform: (p: ConsolePlatform) => void;
  statusFilter: string;
  setStatusFilter: (s: string) => void;
  platformCounts: Record<string, number>;
  statusCounts: {
    total: number;
    verified: number;
    renamed: number;
    clones: number;
    junk: number;
  };
  onOpenOrganizer: () => void;
  onOpenCloudSync: () => void;
  onOpenGoEngine: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  selectedPlatform,
  setSelectedPlatform,
  statusFilter,
  setStatusFilter,
  platformCounts,
  statusCounts,
  onOpenOrganizer,
  onOpenCloudSync,
  onOpenGoEngine,
}) => {
  return (
    <aside className="w-64 border-r border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/60 p-4 flex flex-col justify-between shrink-0 overflow-y-auto">
      <div className="space-y-6">
        {/* Platforms Category */}
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2 px-2">
            Target Consoles
          </div>
          <div className="space-y-0.5">
            <button
              onClick={() => setSelectedPlatform('all')}
              className={`w-full flex items-center justify-between px-3 py-2 text-xs font-medium rounded-lg transition-colors text-left ${
                selectedPlatform === 'all'
                  ? 'bg-cyan-50 dark:bg-cyan-950/40 text-cyan-700 dark:text-cyan-300 font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Layers className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                <span>All Consoles</span>
              </div>
              <span className="font-mono text-xs tabular-nums text-slate-400">
                {statusCounts.total}
              </span>
            </button>

            {PLATFORMS.map((plat) => {
              const count = platformCounts[plat.id] || 0;
              const isSelected = selectedPlatform === plat.id;
              return (
                <button
                  key={plat.id}
                  onClick={() => setSelectedPlatform(plat.id)}
                  className={`w-full flex items-center justify-between px-3 py-2 text-xs font-medium rounded-lg transition-colors text-left ${
                    isSelected
                      ? 'bg-cyan-50 dark:bg-cyan-950/40 text-cyan-700 dark:text-cyan-300 font-semibold'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-100'
                  }`}
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: plat.color }}
                    />
                    <span className="truncate">{plat.shortName}</span>
                  </div>
                  <span className="font-mono text-xs tabular-nums text-slate-400 shrink-0 ml-1">
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Audit Filter */}
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2 px-2">
            Verification Filter
          </div>
          <div className="space-y-0.5">
            <button
              onClick={() => setStatusFilter('all')}
              className={`w-full flex items-center justify-between px-3 py-2 text-xs font-medium rounded-lg transition-colors text-left ${
                statusFilter === 'all'
                  ? 'bg-slate-200 dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60'
              }`}
            >
              <span>All Statuses</span>
              <span className="font-mono text-xs tabular-nums text-slate-400">
                {statusCounts.total}
              </span>
            </button>

            <button
              onClick={() => setStatusFilter('verified')}
              className={`w-full flex items-center justify-between px-3 py-2 text-xs font-medium rounded-lg transition-colors text-left ${
                statusFilter === 'verified'
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60'
              }`}
            >
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                <span>Verified Clean</span>
              </div>
              <span className="font-mono text-xs tabular-nums text-slate-400">
                {statusCounts.verified}
              </span>
            </button>

            <button
              onClick={() => setStatusFilter('renamed')}
              className={`w-full flex items-center justify-between px-3 py-2 text-xs font-medium rounded-lg transition-colors text-left ${
                statusFilter === 'renamed'
                  ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60'
              }`}
            >
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                <span>Need Rename</span>
              </div>
              <span className="font-mono text-xs tabular-nums text-slate-400">
                {statusCounts.renamed}
              </span>
            </button>

            <button
              onClick={() => setStatusFilter('duplicate_clone')}
              className={`w-full flex items-center justify-between px-3 py-2 text-xs font-medium rounded-lg transition-colors text-left ${
                statusFilter === 'duplicate_clone'
                  ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60'
              }`}
            >
              <div className="flex items-center gap-2">
                <Copy className="w-3.5 h-3.5 text-indigo-500" />
                <span>1G1R Clones</span>
              </div>
              <span className="font-mono text-xs tabular-nums text-slate-400">
                {statusCounts.clones}
              </span>
            </button>

            <button
              onClick={() => setStatusFilter('junk_bad_dump')}
              className={`w-full flex items-center justify-between px-3 py-2 text-xs font-medium rounded-lg transition-colors text-left ${
                statusFilter === 'junk_bad_dump'
                  ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60'
              }`}
            >
              <div className="flex items-center gap-2">
                <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                <span>Bad Dumps / Junk</span>
              </div>
              <span className="font-mono text-xs tabular-nums text-slate-400">
                {statusCounts.junk}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Bottom Toolbox Actions */}
      <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-2">
        <button
          onClick={onOpenOrganizer}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 dark:bg-cyan-600 dark:hover:bg-cyan-500 rounded-lg shadow-sm transition-colors whitespace-nowrap"
        >
          <FolderSync className="w-3.5 h-3.5" />
          <span>Apply In-Place Clean</span>
        </button>

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={onOpenCloudSync}
            className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors whitespace-nowrap"
          >
            <Cloud className="w-3.5 h-3.5 text-cyan-500" />
            <span>Cloud Sync</span>
          </button>
          <button
            onClick={onOpenGoEngine}
            className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors whitespace-nowrap"
          >
            <Terminal className="w-3.5 h-3.5 text-indigo-500" />
            <span>Go Engine</span>
          </button>
        </div>
      </div>
    </aside>
  );
};
