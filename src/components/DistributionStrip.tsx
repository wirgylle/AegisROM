import React from 'react';
import { Download, Package, Monitor, Terminal, FileCode2, ShieldCheck } from 'lucide-react';
import { DOWNLOAD_PORTABLE_URL, DOWNLOAD_SETUP_URL, PORTABLE_EXE_FILENAME, SETUP_EXE_FILENAME } from '../version';

interface DistributionStripProps {
  onOpenDetails: () => void;
}

export const DistributionStrip: React.FC<DistributionStripProps> = ({ onOpenDetails }) => {
  return (
    <div className="px-6 py-2.5 bg-slate-100/90 dark:bg-slate-900/90 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
      <div className="flex items-center gap-2 text-xs">
        <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
        <span className="font-semibold text-slate-800 dark:text-slate-200">
          Дистрибутивы Windows 11 (x64):
        </span>
        <span className="text-slate-500 dark:text-slate-400 hidden xl:inline">
          Выберите нужную сборку для прямой загрузки
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {/* Version 1: Windows 11 Setup Installer */}
        <a
          href={DOWNLOAD_SETUP_URL}
          download={SETUP_EXE_FILENAME}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg shadow-xs transition-colors whitespace-nowrap"
          title="Полный установщик Windows 11 с ярлыками на Рабочем столе (GUI + CLI)"
        >
          <Package className="w-3.5 h-3.5 shrink-0" />
          <span>1. Setup Installer (.exe)</span>
          <Download className="w-3 h-3 ml-0.5 opacity-80" />
        </a>

        {/* Version 2: Windows 11 Portable GUI */}
        <a
          href={DOWNLOAD_PORTABLE_URL}
          download={PORTABLE_EXE_FILENAME}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-cyan-600 hover:bg-cyan-500 rounded-lg shadow-xs transition-colors whitespace-nowrap"
          title="Портативная графическая версия в одном файле (без установки и без консоли)"
        >
          <Monitor className="w-3.5 h-3.5 shrink-0" />
          <span>2. Portable GUI (.exe)</span>
          <Download className="w-3 h-3 ml-0.5 opacity-80" />
        </a>

        {/* Version 3: Windows 11 CLI Scanner */}
        <a
          href="/downloads/aegis-scanner-win11-x64.exe"
          download="aegis-scanner-win11-x64.exe"
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-xs transition-colors whitespace-nowrap"
          title="Консольный многопоточный сканер для PowerShell / CMD и скриптов"
        >
          <Terminal className="w-3.5 h-3.5 shrink-0" />
          <span>3. CLI Scanner (.exe)</span>
          <Download className="w-3 h-3 ml-0.5 opacity-80" />
        </a>

        {/* Version 4: Go Source Code */}
        <a
          href="/downloads/aegis-scanner.go"
          download="aegis-scanner.go"
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 rounded-lg transition-colors whitespace-nowrap"
          title="Исходный код многопоточного сканера на языке Go"
        >
          <FileCode2 className="w-3.5 h-3.5 text-cyan-500 shrink-0" />
          <span>4. Go Source (.go)</span>
          <Download className="w-3 h-3 ml-0.5 opacity-70" />
        </a>

        <button
          onClick={onOpenDetails}
          className="px-2.5 py-1.5 text-xs font-medium text-cyan-600 dark:text-cyan-400 hover:underline whitespace-nowrap"
        >
          Хэш-суммы и описание →
        </button>
      </div>
    </div>
  );
};
