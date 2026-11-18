import React, { useState } from 'react';
import { RomItem, EmulatorProfile } from '../types';
import { EMULATOR_PROFILES } from '../data/datDatabase';
import {
  X,
  CheckCircle2,
  AlertTriangle,
  Copy,
  Trash2,
  Gamepad2,
  Terminal,
  Sparkles,
  Play,
  Edit3,
  FolderOpen,
} from 'lucide-react';

interface GameInspectorModalProps {
  rom: RomItem | null;
  onClose: () => void;
  onApplyRename: (id: string, newName: string) => void;
  onScrapeMetadata: (id: string) => void;
  customEmulatorPaths?: Record<string, string>;
}

export const GameInspectorModal: React.FC<GameInspectorModalProps> = ({
  rom,
  onClose,
  onApplyRename,
  onScrapeMetadata,
  customEmulatorPaths = {},
}) => {
  const [copiedCmd, setCopiedCmd] = useState(false);
  const [selectedEmuId, setSelectedEmuId] = useState<string>('');
  const [customExePath, setCustomExePath] = useState<string>('');
  const [launchStatus, setLaunchStatus] = useState<string | null>(null);
  const [imgError, setImgError] = useState<boolean>(false);

  if (!rom) return null;

  const emuProfiles = EMULATOR_PROFILES.filter(
    (e) => e.platform === rom.detectedPlatform || e.type === 'retroarch'
  );

  const activeEmu: EmulatorProfile =
    emuProfiles.find((e) => e.id === selectedEmuId) || emuProfiles[0] || EMULATOR_PROFILES[0];

  const effectiveExe =
    customExePath.trim() ||
    customEmulatorPaths[rom.detectedPlatform] ||
    activeEmu?.executableName ||
    'retroarch';

  const launchCommand = activeEmu
    ? `"${effectiveExe}" ${activeEmu.launchArguments.replace('%ROM_PATH%', rom.filePath || rom.fileName)}`
    : `"${effectiveExe}" "${rom.filePath || rom.fileName}"`;

  const handleCopyCommand = () => {
    navigator.clipboard.writeText(launchCommand);
    setCopiedCmd(true);
    setTimeout(() => setCopiedCmd(false), 2000);
  };

  const handleLaunchGame = async () => {
    setLaunchStatus('Запуск эмулятора...');
    try {
      const res = await fetch('/api/emulator/launch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          executablePath: effectiveExe,
          coreName: activeEmu?.coreName || '',
          romPath: rom.filePath || rom.fileName,
          platform: rom.detectedPlatform,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setLaunchStatus(`✓ Запущен процесс: ${data.command}`);
      } else {
        setLaunchStatus(`Ошибка запуска: ${data.error || 'Эмулятор не найден по указанному пути'}`);
      }
    } catch {
      setLaunchStatus('Для прямого запуска эмулятора запустите десктопную версию AegisROM.exe на Windows.');
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(2)} MB`;
  };

  const meta = rom.metadata;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-semibold uppercase px-2 py-0.5 rounded bg-cyan-100 dark:bg-cyan-950/60 text-cyan-700 dark:text-cyan-300">
              {rom.detectedPlatform}
            </span>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 truncate max-w-lg">
              {rom.suggestedName || rom.fileName}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Top Hero: Box art & Summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
            {/* Box Art */}
            <div className="relative aspect-3/4 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
              {meta?.boxArtUrl && !imgError ? (
                <img
                  src={meta.boxArtUrl}
                  alt={rom.fileName}
                  referrerPolicy="no-referrer"
                  onError={() => setImgError(true)}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-slate-800 to-slate-950 text-slate-300 text-xs text-center p-4">
                  <span className="font-mono text-cyan-400 uppercase font-bold mb-2">
                    {rom.detectedPlatform}
                  </span>
                  <span className="font-semibold text-white line-clamp-3">
                    {rom.cloneGroup || rom.fileName}
                  </span>
                  <span className="text-[10px] text-slate-400 mt-2">
                    Нажмите «Обновить обложку Libretro» внизу
                  </span>
                </div>
              )}
            </div>

            {/* Metadata Summary */}
            <div className="md:col-span-2 space-y-4">
              <div>
                <h4 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                  {meta?.title || rom.cloneGroup || rom.suggestedName || rom.fileName}
                </h4>
                <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mt-1">
                  <span>{meta?.developer || 'Official Release'}</span>
                  <span aria-hidden="true">·</span>
                  <span>{meta?.releaseDate || 'Classic'}</span>
                  <span aria-hidden="true">·</span>
                  <span>{meta?.genre || rom.detectedPlatform.toUpperCase()}</span>
                </div>
              </div>

              {meta?.synopsis && (
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  {meta.synopsis}
                </p>
              )}

              {/* Status and 1G1R tags */}
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Статус проверки DAT:</span>
                  <div className="flex items-center gap-1.5 font-medium">
                    {rom.status === 'verified' && (
                      <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 className="w-4 h-4" /> Проверен (Эталонное имя)
                      </span>
                    )}
                    {rom.status === 'renamed' && (
                      <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1">
                        <AlertTriangle className="w-4 h-4" /> Требует переименования по No-Intro
                      </span>
                    )}
                    {rom.status === 'duplicate_clone' && (
                      <span className="text-indigo-600 dark:text-indigo-400 flex items-center gap-1">
                        <Copy className="w-4 h-4" /> Региональный дубликат (1G1R Clone)
                      </span>
                    )}
                    {rom.status === 'junk_bad_dump' && (
                      <span className="text-rose-600 dark:text-rose-400 flex items-center gap-1">
                        <Trash2 className="w-4 h-4" /> Битый дамп [b] / Хак
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Решение 1G1R:</span>
                  <span className="font-medium text-slate-800 dark:text-slate-200">
                    {rom.is1G1RWinner
                      ? '★ Основная версия (Остается в чистой коллекции)'
                      : rom.quarantineReason || 'Дубликат (В карантин)'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Hashes & File Details */}
          <div className="space-y-3">
            <h5 className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Контрольные суммы и расположение на диске
            </h5>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="sm:col-span-2 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-1">
                <span className="text-slate-400 block text-[11px]">Полный путь на диске</span>
                <span className="font-mono text-slate-800 dark:text-slate-200 break-all">
                  {rom.filePath || rom.fileName}
                </span>
              </div>

              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-1">
                <span className="text-slate-400 block text-[11px]">Текущее имя файла</span>
                <span className="font-mono text-slate-800 dark:text-slate-200 break-all">
                  {rom.fileName}
                </span>
              </div>

              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-1">
                <span className="text-slate-400 block text-[11px]">Эталонное имя No-Intro / Redump</span>
                <span className="font-mono text-cyan-700 dark:text-cyan-300 break-all font-semibold">
                  {rom.suggestedName || rom.fileName}
                </span>
              </div>

              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-1">
                <span className="text-slate-400 block text-[11px]">CRC32 (Полный / Без заголовка)</span>
                <span className="font-mono tabular-nums text-slate-800 dark:text-slate-200 font-semibold">
                  {rom.crc32}
                  {rom.headerlessCrc32 && rom.headerlessCrc32 !== rom.crc32
                    ? ` (Headerless: ${rom.headerlessCrc32})`
                    : ''}
                </span>
              </div>

              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-1">
                <span className="text-slate-400 block text-[11px]">Размер файла</span>
                <span className="font-mono tabular-nums text-slate-800 dark:text-slate-200">
                  {formatBytes(rom.fileSize)} ({rom.fileSize.toLocaleString()} байт)
                </span>
              </div>
            </div>
          </div>

          {/* Emulator Auto-Configuration & Direct Launch */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h5 className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 flex items-center gap-1.5">
                <Gamepad2 className="w-3.5 h-3.5 text-cyan-500" />
                <span>Прямой запуск в эмуляторе</span>
              </h5>

              <select
                value={activeEmu.id}
                onChange={(e) => setSelectedEmuId(e.target.value)}
                className="text-xs bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1 text-slate-800 dark:text-slate-200"
              >
                {emuProfiles.map((emu) => (
                  <option key={emu.id} value={emu.id}>
                    {emu.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                value={customExePath}
                onChange={(e) => setCustomExePath(e.target.value)}
                placeholder={`Путь к эмулятору (по умолчанию: ${effectiveExe})`}
                className="flex-1 px-3 py-1.5 text-xs font-mono bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
              />
              <button
                onClick={handleLaunchGame}
                className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg shadow-sm transition-colors shrink-0"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Запустить игру (Play)</span>
              </button>
            </div>

            {launchStatus && (
              <div className="text-xs font-mono px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-cyan-600 dark:text-cyan-400">
                {launchStatus}
              </div>
            )}

            <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="flex items-center gap-1 font-mono">
                  <Terminal className="w-3 h-3 text-cyan-400" /> Командная строка запуска:
                </span>
                <button
                  onClick={handleCopyCommand}
                  className="text-cyan-400 hover:text-cyan-300 text-xs font-medium flex items-center gap-1"
                >
                  <Copy className="w-3 h-3" />
                  <span>{copiedCmd ? 'Скопировано!' : 'Копировать'}</span>
                </button>
              </div>
              <pre className="font-mono text-xs text-cyan-300 overflow-x-auto p-2 bg-slate-950/80 rounded border border-slate-800">
                {launchCommand}
              </pre>
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 flex items-center justify-between">
          <button
            onClick={() => {
              setImgError(false);
              onScrapeMetadata(rom.id);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5 text-cyan-500" />
            <span>Загрузить обложку с Libretro CDN</span>
          </button>

          <div className="flex items-center gap-3">
            {rom.suggestedName && rom.fileName !== rom.suggestedName && (
              <button
                onClick={() => onApplyRename(rom.id, rom.suggestedName!)}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-500 rounded-lg shadow-sm transition-colors"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Переименовать файл на диске</span>
              </button>
            )}

            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            >
              Закрыть
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
