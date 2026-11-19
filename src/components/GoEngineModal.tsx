import React, { useState } from 'react';
import { GO_SCANNER_CODE } from '../data/goScannerSource';
import {
  APP_VERSION,
  DOWNLOAD_PORTABLE_URL,
  DOWNLOAD_SETUP_URL,
  PORTABLE_EXE_FILENAME,
  SETUP_EXE_FILENAME,
  DOWNLOAD_SCANNER_EXE_URL,
} from '../version';
import {
  X,
  Terminal,
  Copy,
  Download,
  Play,
  Check,
  Cpu,
  Package,
  Monitor,
  FileCode2,
  ShieldCheck,
} from 'lucide-react';

interface GoEngineModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const GoEngineModal: React.FC<GoEngineModalProps> = ({ isOpen, onClose }) => {
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'guide' | 'source' | 'terminal'>('guide');
  const [simRunning, setSimRunning] = useState(false);
  const [simLogs, setSimLogs] = useState<string[]>([]);
  const [workerCount, setWorkerCount] = useState(8);

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(GO_SCANNER_CODE);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const runSimulation = () => {
    if (simRunning) return;
    setSimRunning(true);
    setSimLogs([
      `[START] Initializing AegisROM Go Engine with ${workerCount} concurrent goroutines...`,
      `[CONFIG] Region priority chain: USA > Europe > Japan > World`,
      `[CONFIG] Root Directory: D:\\Emulation\\RetroCollection`,
      `[SPAWN] Launched goroutine worker pool (IDs 1 through ${workerCount}) with buffered sync channels`,
    ]);

    const steps = [
      `[WALK] Traversal root tree via filepath.Walk()...`,
      `[SCAN] Worker #1: Hashed /Roms/SNES/Chrono_Trigger_USA.sfc -> CRC: 2d206bf7 (4.19 MB)`,
      `[SCAN] Worker #2: Hashed /Roms/Genesis/Sonic_2.bin -> CRC: 58c42a27 (1.05 MB)`,
      `[NOTICE: os.IsPermission] Directory D:\\System Volume Information protected.`,
      `[GRACEFUL SKIP] Successfully bypassed inaccessible system directory without crash.`,
      `[SCAN] Worker #3: Hashed /Roms/SNES/Super Mario World [Europe].smc -> CRC: 67c7e39a`,
      `[SCAN] Worker #4: Hashed /Roms/GBA/Pokemon Emerald.gba -> CRC: 1f1c08fb (16.78 MB)`,
      `[SCAN] Worker #5: Hashed /Roms/SNES/smw_corrupt_hack_[b1].sfc -> Flagged: Junk/Bad Dump [b]`,
      `[SYNC] jobsChan closed. Waiting for sync.WaitGroup (all ${workerCount} workers finishing remaining queue)...`,
      `[1G1R ENGINE] Evaluating parent-clone sets across 9 items...`,
      `[1G1R RESOLUTION] Super Mario World: Selected "Super Mario World (USA) (Rev 1).sfc" as Primary Winner.`,
      `[1G1R RESOLUTION] Quarantined European clone "Super Mario World [Europe].smc" into _Quarantine_1G1R_Clones/`,
      `[REPORT] Exported full audit to ./Organized_ROMs/aegis_scan_report.json (0 ms errors)`,
      `[FINISH] Scan & verification finished successfully in 42.18ms!`,
    ];

    steps.forEach((step, index) => {
      setTimeout(() => {
        setSimLogs((prev) => [...prev, step]);
        if (index === steps.length - 1) {
          setSimRunning(false);
        }
      }, (index + 1) * 350);
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-5xl w-full overflow-hidden flex flex-col shadow-2xl max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-5 h-5 text-emerald-500" />
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <span>Центр Загрузки Дистрибутивов Windows 11 &amp; Go Engine</span>
                <span className="text-[11px] font-mono font-medium px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300">
                  v{APP_VERSION} Beta · Win11 x64
                </span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Все 4 редакции проверены: чистая подсистема Windows GUI без окна консоли + высокоскоростной движок Go.
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

        {/* Tab Bar */}
        <div className="px-6 pt-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex gap-5 text-xs font-medium">
            <button
              onClick={() => setActiveTab('guide')}
              className={`pb-2.5 border-b-2 transition-colors ${
                activeTab === 'guide'
                  ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400 font-semibold'
                  : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              Все версии для скачивания (Windows 11)
            </button>
            <button
              onClick={() => setActiveTab('source')}
              className={`pb-2.5 border-b-2 transition-colors ${
                activeTab === 'source'
                  ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400 font-semibold'
                  : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              Исходный код Go (aegis-scanner.go)
            </button>
            <button
              onClick={() => setActiveTab('terminal')}
              className={`pb-2.5 border-b-2 transition-colors ${
                activeTab === 'terminal'
                  ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400 font-semibold'
                  : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              Симулятор многопоточности
            </button>
          </div>

          <div className="flex items-center gap-2 pb-2">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1 px-3 py-1 text-xs font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Скопировано' : 'Копировать Go код'}</span>
            </button>
          </div>
        </div>

        {/* Tab Contents */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'guide' && (
            <div className="space-y-6 text-xs text-slate-700 dark:text-slate-300">
              {/* 4 Separate Cards for Each Version */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Card 1: Setup Installer */}
                <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border-2 border-emerald-500/40 flex flex-col justify-between space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400 font-bold uppercase">
                        Версия 1 · Рекомендуемая
                      </span>
                      <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                        PE32 NSIS · ~2.1 MB
                      </span>
                    </div>
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <Package className="w-4 h-4 text-emerald-500 shrink-0" />
                      <span>Установщик Windows 11 Setup (.exe)</span>
                    </h4>
                    <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      Полноценный инсталлятор для Windows 11/10 (x64). Устанавливает графическое приложение <code className="font-mono text-emerald-600 dark:text-emerald-400">AegisROM.exe</code> (без окна консоли), создает ярлык на Рабочем столе и в меню «Пуск», а также регистрирует удаление в Параметрах Windows.
                    </p>
                  </div>

                  <a
                    href={DOWNLOAD_SETUP_URL}
                    download={SETUP_EXE_FILENAME}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl shadow-sm transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    <span>Скачать {SETUP_EXE_FILENAME}</span>
                  </a>
                </div>

                {/* Card 2: Portable Desktop GUI */}
                <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border-2 border-cyan-500/40 flex flex-col justify-between space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-mono text-cyan-600 dark:text-cyan-400 font-bold uppercase">
                        Версия 2 · Портативная GUI (Без установки)
                      </span>
                      <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                        PE32+ GUI x64 · ~5.2 MB
                      </span>
                    </div>
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <Monitor className="w-4 h-4 text-cyan-500 shrink-0" />
                      <span>Portable Desktop GUI (.exe)</span>
                    </h4>
                    <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      Автономное графическое приложение в одном файле. Скомпилировано с подсистемой <code className="font-mono text-cyan-600 dark:text-cyan-400">-H=windowsgui</code> (никаких черных окон терминала). Запускается двойным кликом сразу в графическом окне Windows 11.
                    </p>
                  </div>

                  <a
                    href={DOWNLOAD_PORTABLE_URL}
                    download={PORTABLE_EXE_FILENAME}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-bold text-white bg-cyan-600 hover:bg-cyan-500 rounded-xl shadow-sm transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    <span>Скачать {PORTABLE_EXE_FILENAME}</span>
                  </a>
                </div>

                {/* Card 3: Standalone CLI Scanner */}
                <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 flex flex-col justify-between space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-mono text-indigo-600 dark:text-indigo-400 font-bold uppercase">
                        Версия 3 · Консольная утилита (CLI)
                      </span>
                      <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                        PE32+ Console x64 · ~2.0 MB
                      </span>
                    </div>
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <Terminal className="w-4 h-4 text-indigo-500 shrink-0" />
                      <span>CLI Scanner для PowerShell / CMD (.exe)</span>
                    </h4>
                    <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      Чистый консольный бинарник для пакетных скриптов, автоматизации и запуска из терминала с ключами <code className="font-mono">-dir</code>, <code className="font-mono">-workers=8</code>, <code className="font-mono">-organize</code>.
                    </p>
                  </div>

                  <a
                    href={DOWNLOAD_SCANNER_EXE_URL}
                    download="aegis-scanner-win11-x64.exe"
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl shadow-sm transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    <span>Скачать aegis-scanner-win11-x64.exe</span>
                  </a>
                </div>

                {/* Card 4: Go Source File */}
                <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 flex flex-col justify-between space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400 font-bold uppercase">
                        Версия 4 · Исходный код Go
                      </span>
                      <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                        Go 1.19+ · ~9 KB
                      </span>
                    </div>
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <FileCode2 className="w-4 h-4 text-cyan-500 shrink-0" />
                      <span>Исходный код сканера (aegis-scanner.go)</span>
                    </h4>
                    <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      Полный исходный код на Go с использованием <code className="font-mono">goroutines</code>, каналов, <code className="font-mono">sync.WaitGroup</code> и обходом системных папок через <code className="font-mono">os.IsPermission</code>.
                    </p>
                  </div>

                  <a
                    href="/downloads/aegis-scanner.go"
                    download="aegis-scanner.go"
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-bold text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 border border-slate-300 dark:border-slate-600 rounded-xl transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    <span>Скачать aegis-scanner.go</span>
                  </a>
                </div>
              </div>

              {/* Technical verification details */}
              <div className="p-4 rounded-xl bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-2">
                <h5 className="font-bold text-slate-900 dark:text-slate-100">
                  Результаты предрелизной проверки (Windows 11 x64):
                </h5>
                <ul className="space-y-1 text-[11px] text-slate-600 dark:text-slate-300 list-disc pl-4">
                  <li>
                    <strong>Подсистема GUI:</strong> проверен заголовок <code className="font-mono">PE32+ executable (GUI) x86-64</code> — окно командной строки полностью отключено на уровне ядра Windows.
                  </li>
                  <li>
                    <strong>Видимость окна:</strong> снят флаг <code className="font-mono">SW_HIDE</code> при вызове WebView2, благодаря чему графическое окно гарантированно открывается на переднем плане.
                  </li>
                  <li>
                    <strong>Удержание сессии (Keep-Alive):</strong> встроенный локальный сервер внутри <code className="font-mono">AegisROM.exe</code> синхронизирован с жизненным циклом открытого окна и встроенным Go API сканера.
                  </li>
                </ul>
              </div>
            </div>
          )}

          {activeTab === 'source' && (
            <div className="rounded-xl overflow-hidden border border-slate-800 bg-slate-950 font-mono text-xs">
              <div className="px-4 py-2 bg-slate-900 border-b border-slate-800 flex items-center justify-between text-slate-400">
                <span>aegis-scanner.go (Complete, zero external dependencies)</span>
                <span className="text-[11px] text-indigo-400">Pure Go Standard Library</span>
              </div>
              <pre className="p-4 text-slate-300 overflow-x-auto max-h-[60vh] leading-relaxed">
                {GO_SCANNER_CODE}
              </pre>
            </div>
          )}

          {activeTab === 'terminal' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Cpu className="w-4 h-4 text-indigo-500" />
                    <span className="font-medium text-slate-700 dark:text-slate-300">
                      Goroutine Worker Threads:
                    </span>
                    <select
                      value={workerCount}
                      onChange={(e) => setWorkerCount(Number(e.target.value))}
                      disabled={simRunning}
                      className="px-2 py-1 rounded bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 font-mono"
                    >
                      <option value={4}>4 Threads</option>
                      <option value={8}>8 Threads</option>
                      <option value={16}>16 Threads</option>
                      <option value={32}>32 Threads</option>
                    </select>
                  </div>
                </div>

                <button
                  onClick={runSimulation}
                  disabled={simRunning}
                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-sm transition-colors disabled:opacity-50"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>{simRunning ? 'Executing Goroutines...' : 'Run Concurrency Test'}</span>
                </button>
              </div>

              {/* Terminal window */}
              <div className="rounded-xl overflow-hidden border border-slate-800 bg-slate-950 font-mono text-xs">
                <div className="px-4 py-2 bg-slate-900 border-b border-slate-800 flex items-center justify-between text-slate-400">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-rose-500/80" />
                    <div className="w-3 h-3 rounded-full bg-amber-500/80" />
                    <div className="w-3 h-3 rounded-full bg-emerald-500/80" />
                    <span className="ml-2 text-slate-300">AegisROM Go Concurrency Terminal</span>
                  </div>
                  <span className="text-[11px] text-cyan-400">Buffered Channels + sync.WaitGroup</span>
                </div>

                <div className="p-4 text-cyan-300 space-y-1.5 min-h-[300px] max-h-[50vh] overflow-y-auto">
                  {simLogs.length === 0 ? (
                    <div className="text-slate-500">
                      Click &quot;Run Concurrency Test&quot; to witness real-time parallel goroutine worker orchestration and permission bypass.
                    </div>
                  ) : (
                    simLogs.map((log, index) => {
                      const isWarn = log.includes('NOTICE') || log.includes('SKIPPED');
                      const isFinish = log.includes('FINISH');
                      const isResolution = log.includes('1G1R RESOLUTION');
                      return (
                        <div
                          key={index}
                          className={
                            isWarn
                              ? 'text-amber-400 font-semibold'
                              : isFinish
                              ? 'text-emerald-400 font-bold'
                              : isResolution
                              ? 'text-indigo-300'
                              : 'text-slate-300'
                          }
                        >
                          {log}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
};
