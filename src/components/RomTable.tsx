import React, { useState } from 'react';
import { RomItem } from '../types';
import {
  CheckCircle2,
  AlertTriangle,
  Copy,
  Trash2,
  HelpCircle,
  Eye,
  ArrowUpDown,
  Search,
  HardDrive,
  Database,
  Edit3,
  FolderSync,
} from 'lucide-react';

interface RomTableProps {
  roms: RomItem[];
  onSelectRom: (rom: RomItem) => void;
  onApplyRename: (id: string) => void;
  onOpenDiskBrowser?: () => void;
  onImportDatFile?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onOpenOrganizer?: () => void;
  activeFolderPath?: string;
  customDatCount?: number;
}

export const RomTable: React.FC<RomTableProps> = ({
  roms,
  onSelectRom,
  onApplyRename,
  onOpenDiskBrowser,
  onImportDatFile,
  onOpenOrganizer,
  activeFolderPath,
  customDatCount = 0,
}) => {
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<'name' | 'platform' | 'size' | 'status'>('name');
  const [sortAsc, setSortAsc] = useState(true);

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(2)} MB`;
  };

  const filtered = roms.filter((r) => {
    const q = search.toLowerCase();
    return (
      r.fileName.toLowerCase().includes(q) ||
      (r.suggestedName && r.suggestedName.toLowerCase().includes(q)) ||
      r.crc32.toLowerCase().includes(q) ||
      r.detectedPlatform.toLowerCase().includes(q)
    );
  });

  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0;
    if (sortField === 'name') {
      cmp = (a.suggestedName || a.fileName).localeCompare(b.suggestedName || b.fileName);
    } else if (sortField === 'platform') {
      cmp = a.detectedPlatform.localeCompare(b.detectedPlatform);
    } else if (sortField === 'size') {
      cmp = a.fileSize - b.fileSize;
    } else if (sortField === 'status') {
      cmp = a.status.localeCompare(b.status);
    }
    return sortAsc ? cmp : -cmp;
  });

  const handleSort = (field: 'name' | 'platform' | 'size' | 'status') => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  const renderStatus = (status: RomItem['status']) => {
    switch (status) {
      case 'verified':
        return (
          <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
            <span>Verified</span>
          </div>
        );
      case 'renamed':
        return (
          <div className="flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span>Needs Rename</span>
          </div>
        );
      case 'duplicate_clone':
        return (
          <div className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 dark:text-indigo-400">
            <Copy className="w-3.5 h-3.5 shrink-0" />
            <span>1G1R Clone</span>
          </div>
        );
      case 'junk_bad_dump':
        return (
          <div className="flex items-center gap-1.5 text-xs font-medium text-rose-600 dark:text-rose-400">
            <Trash2 className="w-3.5 h-3.5 shrink-0" />
            <span>Bad Dump / Junk</span>
          </div>
        );
      default:
        return (
          <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
            <HelpCircle className="w-3.5 h-3.5 shrink-0" />
            <span>Unknown</span>
          </div>
        );
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Search, Active Disk Path, and DAT Import Bar */}
      <div className="px-6 py-3 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-white/50 dark:bg-slate-900/40">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Фильтр по названию, CRC32..."
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-cyan-500"
            />
          </div>

          {onOpenDiskBrowser && (
            <button
              onClick={onOpenDiskBrowser}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-cyan-600 hover:bg-cyan-500 rounded-lg shadow-xs transition-colors"
            >
              <HardDrive className="w-3.5 h-3.5" />
              <span>Выбрать папку на диске (C:\, D:\)</span>
            </button>
          )}

          {onImportDatFile && (
            <label className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer transition-colors">
              <Database className="w-3.5 h-3.5 text-indigo-500" />
              <span>
                Загрузить базу .DAT / .XML {customDatCount > 0 ? `(+${customDatCount})` : ''}
              </span>
              <input
                type="file"
                accept=".dat,.xml"
                multiple
                onChange={onImportDatFile}
                className="hidden"
              />
            </label>
          )}

          {onOpenOrganizer && roms.length > 0 && (
            <button
              onClick={onOpenOrganizer}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg shadow-xs transition-colors"
            >
              <FolderSync className="w-3.5 h-3.5" />
              <span>Переименовать и очистить 1G1R</span>
            </button>
          )}
        </div>

        <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
          {activeFolderPath && (
            <>
              <span className="font-mono text-[11px] text-cyan-600 dark:text-cyan-400 truncate max-w-xs" title={activeFolderPath}>
                {activeFolderPath}
              </span>
              <span>·</span>
            </>
          )}
          <span>Файлов:</span>
          <span className="font-mono tabular-nums font-semibold text-slate-700 dark:text-slate-200">
            {sorted.length}
          </span>
          <span>/</span>
          <span className="font-mono tabular-nums text-slate-700 dark:text-slate-200">
            {roms.length}
          </span>
        </div>
      </div>

      {/* Main Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead className="sticky top-0 bg-slate-100/90 dark:bg-slate-800/90 backdrop-blur-xs border-b border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 z-10">
            <tr>
              <th className="py-2.5 px-4 font-semibold w-32">
                <button
                  onClick={() => handleSort('status')}
                  className="flex items-center gap-1 hover:text-slate-900 dark:hover:text-white"
                >
                  <span>Статус</span>
                  <ArrowUpDown className="w-3 h-3" />
                </button>
              </th>
              <th className="py-2.5 px-4 font-semibold">
                <button
                  onClick={() => handleSort('name')}
                  className="flex items-center gap-1 hover:text-slate-900 dark:hover:text-white"
                >
                  <span>Эталонное имя (No-Intro / Redump) и текущий файл</span>
                  <ArrowUpDown className="w-3 h-3" />
                </button>
              </th>
              <th className="py-2.5 px-4 font-semibold w-24">
                <button
                  onClick={() => handleSort('platform')}
                  className="flex items-center gap-1 hover:text-slate-900 dark:hover:text-white"
                >
                  <span>Консоль</span>
                  <ArrowUpDown className="w-3 h-3" />
                </button>
              </th>
              <th className="py-2.5 px-4 font-semibold w-28 text-right font-mono">CRC32</th>
              <th className="py-2.5 px-4 font-semibold w-24 text-right">
                <button
                  onClick={() => handleSort('size')}
                  className="flex items-center gap-1 justify-end ml-auto hover:text-slate-900 dark:hover:text-white"
                >
                  <span>Размер</span>
                  <ArrowUpDown className="w-3 h-3" />
                </button>
              </th>
              <th className="py-2.5 px-4 font-semibold w-44">Статус 1G1R</th>
              <th className="py-2.5 px-4 font-semibold w-28 text-center">Действия</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
            {sorted.map((rom) => {
              const isDifferentName = rom.suggestedName && rom.fileName !== rom.suggestedName;

              return (
                <tr
                  key={rom.id}
                  className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors group cursor-pointer"
                  onClick={() => onSelectRom(rom)}
                >
                  <td className="py-2.5 px-4 whitespace-nowrap">
                    {renderStatus(rom.status)}
                  </td>
                  <td className="py-2.5 px-4 max-w-md">
                    <div className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {rom.suggestedName || rom.fileName}
                    </div>
                    {isDifferentName ? (
                      <div className="text-[11px] text-amber-600 dark:text-amber-400 font-mono truncate mt-0.5">
                        На диске: {rom.fileName}
                      </div>
                    ) : (
                      <div className="text-[10px] text-slate-400 dark:text-slate-500 font-mono truncate mt-0.5">
                        {rom.filePath}
                      </div>
                    )}
                  </td>
                  <td className="py-2.5 px-4 whitespace-nowrap">
                    <span className="font-medium uppercase text-slate-700 dark:text-slate-300">
                      {rom.detectedPlatform}
                    </span>
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-500 dark:text-slate-400">
                    {rom.crc32}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-600 dark:text-slate-300">
                    {formatBytes(rom.fileSize)}
                  </td>
                  <td className="py-2.5 px-4 whitespace-nowrap text-slate-500 dark:text-slate-400">
                    {rom.is1G1RWinner ? (
                      <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                        ★ Основной 1G1R
                      </span>
                    ) : rom.quarantineReason ? (
                      <span className="text-slate-400 truncate block max-w-xs text-[11px]" title={rom.quarantineReason}>
                        {rom.quarantineReason}
                      </span>
                    ) : (
                      <span className="text-slate-400">-</span>
                    )}
                  </td>
                  <td className="py-2.5 px-4 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      {isDifferentName && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onApplyRename(rom.id);
                          }}
                          className="p-1 text-amber-600 hover:text-amber-500 dark:text-amber-400 transition-colors"
                          title={`Переименовать в ${rom.suggestedName}`}
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectRom(rom);
                        }}
                        className="p-1 text-slate-400 hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors"
                        title="Открыть инспектор и запустить"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}

            {sorted.length === 0 && (
              <tr>
                <td colSpan={7} className="py-16 text-center">
                  <div className="max-w-md mx-auto space-y-3">
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                      Коллекция не выбрана или список пуст
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Выберите папку с вашими ROM-файлами на диске (<code className="font-mono">C:\</code>, <code className="font-mono">D:\</code> и др.) для запуска многопоточного Go-сканера и проверки хэшей.
                    </p>
                    {onOpenDiskBrowser && (
                      <button
                        onClick={onOpenDiskBrowser}
                        className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-cyan-600 hover:bg-cyan-500 rounded-lg shadow-sm transition-colors"
                      >
                        <HardDrive className="w-4 h-4" />
                        <span>Выбрать папку на диске</span>
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
