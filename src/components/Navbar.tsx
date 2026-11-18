import React from 'react';
import { FolderOpen, Moon, Sun, HardDrive, RefreshCw, Download } from 'lucide-react';
import { DOWNLOAD_SETUP_URL, SETUP_EXE_FILENAME } from '../version';

interface NavbarProps {
  activeView: 'audit' | 'gallery' | 'rules' | 'emulators' | 'go-engine';
  setActiveView: (view: 'audit' | 'gallery' | 'rules' | 'emulators' | 'go-engine') => void;
  onOpenFolder: () => void;
  onResetSamples: () => void;
  isScanning: boolean;
  isDark: boolean;
  toggleTheme: () => void;
  totalRoms: number;
  cleanRoms: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeView,
  setActiveView,
  onOpenFolder,
  onResetSamples,
  isScanning,
  isDark,
  toggleTheme,
  totalRoms,
  cleanRoms,
}) => {
  return (
    <header className="flex items-center justify-between gap-8 px-6 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 transition-colors shrink-0">
      {/* Zone 1: Brand wordmark (single line, no attached pill badges) */}
      <div className="flex items-center gap-3 shrink-0">
        <a
          href="/"
          onClick={(e) => {
            e.preventDefault();
            setActiveView('audit');
          }}
          className="text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap shrink-0 flex items-center gap-2"
        >
          <HardDrive className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
          <span>AegisROM</span>
        </a>
      </div>

      {/* Zone 2: Navigation Links (4-5 single-line clean text links) */}
      <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-300">
        <button
          onClick={() => setActiveView('audit')}
          className={`hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0 pb-0.5 ${
            activeView === 'audit'
              ? 'text-cyan-600 dark:text-cyan-400 font-semibold border-b-2 border-cyan-600 dark:border-cyan-400'
              : ''
          }`}
        >
          Library Audit
        </button>
        <button
          onClick={() => setActiveView('gallery')}
          className={`hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0 pb-0.5 ${
            activeView === 'gallery'
              ? 'text-cyan-600 dark:text-cyan-400 font-semibold border-b-2 border-cyan-600 dark:border-cyan-400'
              : ''
          }`}
        >
          Box Art Gallery
        </button>
        <button
          onClick={() => setActiveView('rules')}
          className={`hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0 pb-0.5 ${
            activeView === 'rules'
              ? 'text-cyan-600 dark:text-cyan-400 font-semibold border-b-2 border-cyan-600 dark:border-cyan-400'
              : ''
          }`}
        >
          1G1R Rules
        </button>
        <button
          onClick={() => setActiveView('emulators')}
          className={`hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0 pb-0.5 ${
            activeView === 'emulators'
              ? 'text-cyan-600 dark:text-cyan-400 font-semibold border-b-2 border-cyan-600 dark:border-cyan-400'
              : ''
          }`}
        >
          Emulator Setup
        </button>
        <button
          onClick={() => setActiveView('go-engine')}
          className={`hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0 pb-0.5 ${
            activeView === 'go-engine'
              ? 'text-cyan-600 dark:text-cyan-400 font-semibold border-b-2 border-cyan-600 dark:border-cyan-400'
              : ''
          }`}
        >
          Go Scanner CLI
        </button>
      </nav>

      {/* Zone 3: Actions & Theme toggle */}
      <div className="flex items-center gap-3 shrink-0">
        <button
          onClick={onResetSamples}
          title="Reload demo ROM sample set"
          className="p-2 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
          aria-label="Reload samples"
        >
          <RefreshCw className="w-4 h-4" />
        </button>

        <button
          onClick={toggleTheme}
          title="Toggle light/dark mode"
          className="p-2 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
          aria-label="Toggle theme"
        >
          {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>

        <a
          href={DOWNLOAD_SETUP_URL}
          download={SETUP_EXE_FILENAME}
          title="Download Windows 11 Setup Installer (.exe)"
          className="hidden lg:flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg shadow-sm transition-colors whitespace-nowrap shrink-0"
        >
          <Download className="w-4 h-4" />
          <span>Win 11 Setup (.exe)</span>
        </a>

        <button
          onClick={onOpenFolder}
          disabled={isScanning}
          className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-cyan-600 hover:bg-cyan-500 rounded-lg shadow-sm transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
        >
          <FolderOpen className="w-4 h-4" />
          <span>{isScanning ? 'Scanning...' : 'Scan Directory'}</span>
        </button>
      </div>
    </header>
  );
};
