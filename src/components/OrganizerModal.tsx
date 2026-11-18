import React, { useState } from 'react';
import { RomItem } from '../types';
import {
  X,
  FolderSync,
  CheckCircle2,
  Copy,
  Trash2,
  FolderCheck,
  ArrowRight,
  RotateCcw,
} from 'lucide-react';

export interface OrganizeOptions {
  mode: 'full_sort' | 'rename_only';
  deleteJunkPermanently: boolean;
}

interface OrganizerModalProps {
  roms: RomItem[];
  isOpen: boolean;
  onClose: () => void;
  onExecuteReorganize: (options: OrganizeOptions) => Promise<void>;
  onUndoLastOrganize?: () => Promise<void>;
  isExecuting: boolean;
  executionLog: string[];
  canUndo?: boolean;
}

export const OrganizerModal: React.FC<OrganizerModalProps> = ({
  roms,
  isOpen,
  onClose,
  onExecuteReorganize,
  onUndoLastOrganize,
  isExecuting,
  executionLog,
  canUndo = false,
}) => {
  const [activeTab, setActiveTab] = useState<'preview' | 'log'>('preview');
  const [mode, setMode] = useState<'full_sort' | 'rename_only'>('full_sort');
  const [deleteJunkPermanently, setDeleteJunkPermanently] = useState<boolean>(false);

  if (!isOpen) return null;

  const verified = roms.filter((r) => r.is1G1RWinner && r.status !== 'junk_bad_dump');
  const clones = roms.filter((r) => r.status === 'duplicate_clone');
  const junk = roms.filter((r) => r.status === 'junk_bad_dump');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-4xl w-full overflow-hidden flex flex-col shadow-2xl max-h-[88vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FolderSync className="w-5 h-5 text-cyan-500" />
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Физическое переименование и 1G1R сортировка на диске
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Выполняет системные вызовы os.Rename / os.Remove напрямую в выбранной папке диска
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

        {/* Tab switch */}
        <div className="px-6 pt-3 border-b border-slate-200 dark:border-slate-800 flex gap-4 text-xs font-medium">
          <button
            onClick={() => setActiveTab('preview')}
            className={`pb-2 border-b-2 transition-colors ${
              activeTab === 'preview'
                ? 'border-cyan-500 text-cyan-600 dark:text-cyan-400 font-semibold'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            План операций ({roms.length} файлов)
          </button>
          <button
            onClick={() => setActiveTab('log')}
            className={`pb-2 border-b-2 transition-colors ${
              activeTab === 'log'
                ? 'border-cyan-500 text-cyan-600 dark:text-cyan-400 font-semibold'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            Журнал выполнения Go Engine ({executionLog.length})
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {activeTab === 'preview' ? (
            <>
              {/* Mode selector */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-3 text-xs">
                <div className="font-semibold text-slate-800 dark:text-slate-200">
                  Режим физической обработки файлов на диске:
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <label
                    className={`flex items-start gap-2.5 p-3 rounded-lg border cursor-pointer transition-colors ${
                      mode === 'full_sort'
                        ? 'border-cyan-500 bg-cyan-50/50 dark:bg-cyan-950/30'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900'
                    }`}
                  >
                    <input
                      type="radio"
                      name="org_mode"
                      checked={mode === 'full_sort'}
                      onChange={() => setMode('full_sort')}
                      className="mt-0.5 text-cyan-600"
                    />
                    <div>
                      <span className="font-bold text-slate-900 dark:text-white block">
                        Полная 1G1R сортировка по папкам + No-Intro переименование
                      </span>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400">
                        Победители 1G1R переименовываются в папку <code className="font-mono">Organized/</code>, дубликаты в <code className="font-mono">_Quarantine_1G1R_Clones/</code>
                      </span>
                    </div>
                  </label>

                  <label
                    className={`flex items-start gap-2.5 p-3 rounded-lg border cursor-pointer transition-colors ${
                      mode === 'rename_only'
                        ? 'border-cyan-500 bg-cyan-50/50 dark:bg-cyan-950/30'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900'
                    }`}
                  >
                    <input
                      type="radio"
                      name="org_mode"
                      checked={mode === 'rename_only'}
                      onChange={() => setMode('rename_only')}
                      className="mt-0.5 text-cyan-600"
                    />
                    <div>
                      <span className="font-bold text-slate-900 dark:text-white block">
                        Только переименование на месте (In-Place Rename)
                      </span>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400">
                        Переименовывает файлы по стандарту No-Intro прямо в их текущей папке без переноса в подпапки
                      </span>
                    </div>
                  </label>
                </div>

                <label className="flex items-center gap-2 pt-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={deleteJunkPermanently}
                    onChange={(e) => setDeleteJunkPermanently(e.target.checked)}
                    className="rounded text-rose-600 focus:ring-rose-500 w-4 h-4"
                  />
                  <span className="text-slate-700 dark:text-slate-300">
                    Полностью удалять с диска (<code className="font-mono">os.Remove</code>) битые дампы <code className="font-mono">[b]</code> и мусорные файлы (иначе они переносятся в <code className="font-mono">_Junk_BadDumps</code>)
                  </span>
                </label>
              </div>

              {/* Summary Stats */}
              <div className="grid grid-cols-3 gap-4 text-xs">
                <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60">
                  <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-300 font-semibold mb-1">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>1G1R Основные ({verified.length})</span>
                  </div>
                  <p className="text-slate-600 dark:text-slate-400 text-[11px]">
                    {mode === 'full_sort'
                      ? 'В папку Organized/[Console]/ с эталонным именем No-Intro'
                      : 'Переименование на месте по стандарту No-Intro'}
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/60">
                  <div className="flex items-center gap-1.5 text-indigo-700 dark:text-indigo-300 font-semibold mb-1">
                    <Copy className="w-4 h-4" />
                    <span>1G1R Дубликаты ({clones.length})</span>
                  </div>
                  <p className="text-slate-600 dark:text-slate-400 text-[11px]">
                    {mode === 'full_sort'
                      ? 'Перенос в _Quarantine_1G1R_Clones/[Console]/'
                      : 'Остаются в текущей папке со стандартным именем'}
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60">
                  <div className="flex items-center gap-1.5 text-rose-700 dark:text-rose-300 font-semibold mb-1">
                    <Trash2 className="w-4 h-4" />
                    <span>Битые дампы / Мусор ({junk.length})</span>
                  </div>
                  <p className="text-slate-600 dark:text-slate-400 text-[11px]">
                    {deleteJunkPermanently
                      ? 'Безвозвратное удаление с диска (os.Remove)'
                      : 'Изоляция в _Junk_BadDumps/[Console]/'}
                  </p>
                </div>
              </div>

              {/* Move/Rename Plan list */}
              <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                <div className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800">
                  Предварительный просмотр физических путей (Diff)
                </div>
                <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-60 overflow-y-auto text-xs">
                  {roms.map((r) => {
                    const targetFolder =
                      mode === 'rename_only'
                        ? '(Текущая папка)'
                        : r.status === 'junk_bad_dump'
                        ? deleteJunkPermanently
                          ? '[УДАЛЕНИЕ С ДИСКА]'
                          : `_Junk_BadDumps/${r.detectedPlatform}`
                        : r.status === 'duplicate_clone'
                        ? `_Quarantine_1G1R_Clones/${r.detectedPlatform}`
                        : `Organized/${r.detectedPlatform}`;

                    const newName = r.suggestedName || r.fileName;

                    return (
                      <div
                        key={r.id}
                        className="p-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors flex items-center justify-between gap-4 font-mono text-[11px]"
                      >
                        <div className="truncate max-w-sm">
                          <span className="text-slate-400 block text-[10px]">Исходный файл на диске:</span>
                          <span className="text-slate-700 dark:text-slate-300 truncate block" title={r.filePath}>
                            {r.filePath || r.fileName}
                          </span>
                        </div>

                        <ArrowRight className="w-4 h-4 text-slate-400 shrink-0" />

                        <div className="truncate max-w-sm text-right">
                          <span className="text-cyan-600 dark:text-cyan-400 block text-[10px]">
                            Результат:
                          </span>
                          <span className="text-slate-900 dark:text-slate-100 font-semibold truncate block">
                            {deleteJunkPermanently && r.status === 'junk_bad_dump'
                              ? 'Удален (os.Remove)'
                              : `${targetFolder}/${newName}`}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          ) : (
            <div className="p-4 rounded-xl bg-slate-950 text-cyan-300 font-mono text-xs max-h-96 overflow-y-auto space-y-1 border border-slate-800">
              {executionLog.length === 0 ? (
                <div className="text-slate-500">Готово к выполнению. Нажмите кнопку ниже для старта.</div>
              ) : (
                executionLog.map((log, i) => <div key={i}>{log}</div>)
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {canUndo && onUndoLastOrganize && (
              <button
                onClick={async () => {
                  setActiveTab('log');
                  await onUndoLastOrganize();
                }}
                disabled={isExecuting}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-800 rounded-lg hover:bg-amber-200 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Откатить последнее действие (Undo)</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              disabled={isExecuting}
              className="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
            >
              Закрыть
            </button>
            <button
              onClick={async () => {
                setActiveTab('log');
                await onExecuteReorganize({ mode, deleteJunkPermanently });
              }}
              disabled={isExecuting}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-cyan-600 hover:bg-cyan-500 rounded-lg shadow-sm transition-colors disabled:opacity-50"
            >
              <FolderCheck className="w-4 h-4" />
              <span>{isExecuting ? 'Выполняется на диске...' : 'Выполнить на диске сейчас'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
