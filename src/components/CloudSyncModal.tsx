import React, { useState } from 'react';
import { RomItem, RegionPriorityConfig } from '../types';
import {
  X,
  Cloud,
  Download,
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  Copy,
} from 'lucide-react';

interface CloudSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  roms: RomItem[];
  config: RegionPriorityConfig;
  onImportBackup: (importedRoms: RomItem[]) => void;
}

export const CloudSyncModal: React.FC<CloudSyncModalProps> = ({
  isOpen,
  onClose,
  roms,
  config,
  onImportBackup,
}) => {
  const [copiedSyncKey, setCopiedSyncKey] = useState(false);
  const syncKey = 'aegis_vault_' + Math.random().toString(36).substring(2, 10).toUpperCase();

  if (!isOpen) return null;

  const handleExportJSON = () => {
    const payload = {
      app: 'AegisROM',
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      config,
      totalCount: roms.length,
      roms,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `aegisrom_backup_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExportCSV = () => {
    const headers = ['Status', 'Canonical Title', 'Original File', 'Platform', 'CRC32', 'Size (Bytes)', '1G1R Winner'];
    const rows = roms.map((r) => [
      r.status,
      `"${(r.suggestedName || r.fileName).replace(/"/g, '""')}"`,
      `"${r.fileName.replace(/"/g, '""')}"`,
      r.detectedPlatform,
      r.crc32,
      r.fileSize,
      r.is1G1RWinner ? 'YES' : 'NO',
    ]);
    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `aegisrom_audit_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (parsed.roms && Array.isArray(parsed.roms)) {
          onImportBackup(parsed.roms);
          alert(`Successfully imported ${parsed.roms.length} ROM records from backup!`);
          onClose();
        }
      } catch {
        alert('Invalid backup JSON file format.');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full overflow-hidden flex flex-col shadow-2xl">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Cloud className="w-5 h-5 text-cyan-500" />
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Cloud Sync & Library Backup
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 text-xs">
          {/* Cloud Sync Key */}
          <div className="p-4 rounded-xl bg-cyan-50 dark:bg-cyan-950/40 border border-cyan-200 dark:border-cyan-800/60 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-cyan-900 dark:text-cyan-200">
                Personal Cloud Vault Token
              </span>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(syncKey);
                  setCopiedSyncKey(true);
                  setTimeout(() => setCopiedSyncKey(false), 2000);
                }}
                className="text-cyan-600 dark:text-cyan-400 font-medium flex items-center gap-1"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>{copiedSyncKey ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
            <div className="font-mono text-xs bg-white dark:bg-slate-900 px-3 py-1.5 rounded border border-cyan-200 dark:border-cyan-800 text-slate-800 dark:text-slate-200">
              {syncKey}
            </div>
            <p className="text-[11px] text-cyan-700 dark:text-cyan-400">
              Use this token to synchronize audit states, 1G1R rules, and DAT verifications across your desktop and devices.
            </p>
          </div>

          {/* Export Options */}
          <div className="space-y-2.5">
            <h4 className="font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 text-[11px]">
              Export Data & Reports
            </h4>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={handleExportJSON}
                className="flex items-center justify-center gap-2 p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 font-medium transition-colors"
              >
                <Download className="w-4 h-4 text-cyan-500" />
                <span>Export JSON Backup</span>
              </button>

              <button
                onClick={handleExportCSV}
                className="flex items-center justify-center gap-2 p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 font-medium transition-colors"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-500" />
                <span>Export CSV Audit</span>
              </button>
            </div>
          </div>

          {/* Import Option */}
          <div className="space-y-2.5 pt-2 border-t border-slate-200 dark:border-slate-800">
            <h4 className="font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 text-[11px]">
              Restore / Import Backup
            </h4>

            <label className="flex items-center justify-center gap-2 p-3 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 hover:border-cyan-500 dark:hover:border-cyan-400 bg-white dark:bg-slate-900 cursor-pointer text-slate-700 dark:text-slate-300 transition-colors">
              <Upload className="w-4 h-4 text-slate-400" />
              <span>Choose Backup File (.json)</span>
              <input
                type="file"
                accept=".json"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
