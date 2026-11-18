import React, { useState, useEffect } from 'react';
import {
  X,
  HardDrive,
  Folder,
  FileArchive,
  ChevronRight,
  ArrowUp,
  Check,
  RefreshCw,
  ShieldAlert,
  FolderCheck,
} from 'lucide-react';

export interface FsDrive {
  name: string;
  path: string;
  label: string;
}

export interface FsEntry {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  isRom: boolean;
}

interface DiskBrowserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectFolder: (folderPath: string) => void;
  onSelectFile?: (filePath: string) => void;
  mode?: 'folder' | 'dat-file' | 'emulator-exe';
  title?: string;
}

export const DiskBrowserModal: React.FC<DiskBrowserModalProps> = ({
  isOpen,
  onClose,
  onSelectFolder,
  onSelectFile,
  mode = 'folder',
  title = 'Выберите папку с ROM-файлами на диске',
}) => {
  const [drives, setDrives] = useState<FsDrive[]>([]);
  const [currentPath, setCurrentPath] = useState<string>('');
  const [parentPath, setParentPath] = useState<string>('');
  const [entries, setEntries] = useState<FsEntry[]>([]);
  const [manualPath, setManualPath] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [romCountInFolder, setRomCountInFolder] = useState<number>(0);

  useEffect(() => {
    if (isOpen) {
      loadDrives();
    }
  }, [isOpen]);

  const loadDrives = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/fs/drives');
      if (!res.ok) throw new Error('Backend API unavailable');
      const data = await res.json();
      setDrives(data.drives || []);
      const initial = data.defaultPath || (data.drives?.[0]?.path ?? '');
      if (initial) {
        await browsePath(initial);
      }
    } catch (err) {
      setError('Не удалось получить список дисков. Вы можете ввести путь вручную.');
    } finally {
      setLoading(false);
    }
  };

  const browsePath = async (targetPath: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/fs/list?path=${encodeURIComponent(targetPath)}`);
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setCurrentPath(data.currentPath || targetPath);
        setManualPath(data.currentPath || targetPath);
        setParentPath(data.parentPath || '');
        setEntries(data.entries || []);
        setRomCountInFolder(data.romCount || 0);
      }
    } catch {
      setError(`Ошибка чтения директории: ${targetPath}`);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const filteredEntries = entries.filter((e) => {
    if (e.isDir) return true;
    if (mode === 'dat-file') {
      const low = e.name.toLowerCase();
      return low.endsWith('.dat') || low.endsWith('.xml');
    }
    if (mode === 'emulator-exe') {
      const low = e.name.toLowerCase();
      return low.endsWith('.exe') || low.endsWith('.bat') || low.endsWith('.cmd') || !low.includes('.');
    }
    return e.isRom;
  });

  const formatBytes = (bytes: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(2)} MB`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-3xl w-full overflow-hidden flex flex-col shadow-2xl max-h-[85vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <HardDrive className="w-5 h-5 text-cyan-500" />
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                {title}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Прямой доступ к файловой системе через нативный Go-движок (с поддержкой вложенных папок и .zip)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Drives & Quick Locations Bar */}
        <div className="px-6 py-2.5 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2 overflow-x-auto">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 shrink-0">
            Диски:
          </span>
          {drives.map((d) => (
            <button
              key={d.path}
              onClick={() => browsePath(d.path)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors shrink-0 ${
                currentPath.startsWith(d.path)
                  ? 'bg-cyan-600 text-white shadow-xs'
                  : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:border-cyan-500'
              }`}
            >
              <HardDrive className="w-3.5 h-3.5" />
              <span>{d.name}</span>
              {d.label && <span className="opacity-75 text-[10px]">({d.label})</span>}
            </button>
          ))}
        </div>

        {/* Path Input Bar */}
        <div className="px-6 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
          <button
            onClick={() => parentPath && browsePath(parentPath)}
            disabled={!parentPath || loading}
            title="На уровень вверх"
            className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-40 transition-colors"
          >
            <ArrowUp className="w-4 h-4" />
          </button>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (manualPath.trim()) browsePath(manualPath.trim());
            }}
            className="flex-1 flex items-center gap-2"
          >
            <input
              type="text"
              value={manualPath}
              onChange={(e) => setManualPath(e.target.value)}
              placeholder="Например: D:\Games\Roms\SNES или C:\Users\..."
              className="flex-1 px-3 py-1.5 text-xs font-mono bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-cyan-500"
            />
            <button
              type="submit"
              className="px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 rounded-lg transition-colors"
            >
              Перейти
            </button>
          </form>

          <button
            onClick={() => currentPath && browsePath(currentPath)}
            className="p-2 rounded-lg text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
            title="Обновить"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-cyan-500' : ''}`} />
          </button>
        </div>

        {/* Error Banner */}
        {error && (
          <div className="mx-6 mt-3 p-3 rounded-lg bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 flex items-center gap-2 text-xs text-rose-700 dark:text-rose-300">
            <ShieldAlert className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Directory Entries List */}
        <div className="flex-1 overflow-y-auto p-4 divide-y divide-slate-100 dark:divide-slate-800/60 text-xs min-h-[280px]">
          {filteredEntries.length === 0 && !loading ? (
            <div className="py-12 text-center text-slate-400 dark:text-slate-500">
              В этой папке нет подпапок или подходящих файлов. Вы можете выбрать текущую папку кнопкой внизу.
            </div>
          ) : (
            filteredEntries.map((entry) => (
              <div
                key={entry.path}
                onClick={() => {
                  if (entry.isDir) {
                    browsePath(entry.path);
                  } else if (mode !== 'folder' && onSelectFile) {
                    onSelectFile(entry.path);
                    onClose();
                  }
                }}
                className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800/60 cursor-pointer transition-colors group"
              >
                <div className="flex items-center gap-2.5 truncate">
                  {entry.isDir ? (
                    <Folder className="w-4 h-4 text-amber-500 fill-amber-500/20 shrink-0" />
                  ) : (
                    <FileArchive className="w-4 h-4 text-cyan-500 shrink-0" />
                  )}
                  <span
                    className={`truncate ${
                      entry.isDir
                        ? 'font-semibold text-slate-900 dark:text-slate-100 group-hover:text-cyan-600 dark:group-hover:text-cyan-400'
                        : 'font-mono text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {entry.name}
                  </span>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  {!entry.isDir && (
                    <span className="font-mono text-[11px] text-slate-400 tabular-nums">
                      {formatBytes(entry.size)}
                    </span>
                  )}
                  {entry.isDir && (
                    <ChevronRight className="w-4 h-4 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
                  )}
                  {!entry.isDir && mode !== 'folder' && (
                    <span className="text-[11px] font-semibold text-cyan-600 dark:text-cyan-400">
                      Выбрать файл
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 flex items-center justify-between gap-4">
          <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
            <span>Текущая папка: </span>
            <code className="font-mono text-slate-800 dark:text-slate-200 font-semibold">
              {currentPath || manualPath}
            </code>
            {romCountInFolder > 0 && (
              <span className="ml-2 text-emerald-600 dark:text-emerald-400 font-semibold">
                (Найдено ROM/ZIP в корне: {romCountInFolder})
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            >
              Отмена
            </button>

            {mode === 'folder' && (
              <button
                onClick={() => {
                  const target = (manualPath || currentPath).trim();
                  if (target) {
                    onSelectFolder(target);
                    onClose();
                  }
                }}
                disabled={!currentPath && !manualPath}
                className="flex items-center gap-1.5 px-5 py-2 text-xs font-bold text-white bg-cyan-600 hover:bg-cyan-500 rounded-lg shadow-sm transition-colors disabled:opacity-50"
              >
                <FolderCheck className="w-4 h-4" />
                <span>Сканировать эту папку (Go Engine)</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
