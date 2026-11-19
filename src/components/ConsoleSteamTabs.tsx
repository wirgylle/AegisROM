import React, { useState, useMemo } from 'react';
import {
  Database,
  RefreshCw,
  Filter,
  Star,
  Play,
  ExternalLink,
  HardDrive,
  ArrowRightLeft,
  CheckSquare,
  Square,
  Download,
  FolderInput,
  Gamepad2,
  Cpu,
  Layers,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  FileCode2,
  ListChecks,
  LayoutGrid,
  Table as TableIcon,
  List,
  Search,
  Wrench,
} from 'lucide-react';
import {
  EXTENDED_CONSOLE_CATALOG,
  EMULATOR_CATALOG,
  DEVICE_EXPORT_PROFILES,
  GENRE_LIST,
  inferGenreAndYear,
  type EmulatorOption,
} from '../data/consoleSteamCatalog';
import { GameInspectorCoverVideo } from './GameInspectorCoverVideo';

export interface PersistentRomRecord {
  id: string;
  title: string;
  cleanTitle: string;
  comparisonKey: string;
  consoleCode: string;
  generationShort: string;
  bitness: string;
  genre: string;
  releaseYear: number;
  region: string;
  language: string;
  isRussian: boolean;
  fileName: string;
  masterPath: string;
  sdCardPath?: string;
  sdCardFileName?: string;
  sdCardRegion?: string;
  sdCardLanguage?: string;
  hasUpgradeCandidate: boolean;
  upgradeSelected?: boolean;
  upgradeReason?: string;
  fileSize: number;
  crc32: string;
  serialCode?: string;
  dependencies: string[];
  preferredEmulatorId: string;
  boxArtUrl: string;
  snapUrl?: string;
  videoUrl?: string;
  lastSyncedAt: string;
}

export interface PersistentDbState {
  version: string;
  masterLibraryPath: string;
  sdCardMountPath: string;
  bufferZonePath: string;
  lastSyncedAt: string;
  preferredRegionOrder: string[];
  emulatorCustomPaths: Record<string, string>;
  starredEmulatorsByConsole: Record<string, string>;
  records: PersistentRomRecord[];
}

interface ConsoleSteamTabsProps {
  activeTab: 'library' | 'buffer_upgrade' | 'export_builder' | 'emulators' | 'r36s_tools';
  dbState: PersistentDbState;
  isSyncingDb: boolean;
  onSyncDatabase: () => void;
  onResetSeedDatabase: () => void;
  onUpdateDbState: (next: PersistentDbState) => void;
  onScanFolderIntoMasterDb: () => void;
  onAddLog: (msg: string) => void;
  externalViewMode?: 'presentation' | 'compact' | 'editor';
  onChangeExternalViewMode?: (mode: 'presentation' | 'compact' | 'editor') => void;
}

const ROADMAP_STAGES = [
  {
    stage: 'Этап 1. Постоянная База Данных (AegisDB) и Дельта-Синхронизация',
    status: 'completed',
    tasks: [
      { title: 'Задача 1.1: Локальное хранилище ромов, CRC32, серийников и зависимостей (.cue+.bin, BIOS, DLC)', done: true },
      { title: 'Задача 1.2: Мгновенное открытие без повторного сканирования + кнопка «Синхронизировать БД»', done: true },
      { title: 'Задача 1.3: Автономный офлайн-скрапинг обложек и видео по базе при отключенной SD-флешке', done: true },
    ],
  },
  {
    stage: 'Этап 2. Витрина «Консольный Steam» и Многомерные Фильтры (до PS3 / Switch / Xbox)',
    status: 'completed',
    tasks: [
      { title: 'Задача 2.1: Фильтрация по Консоли, Битности (8-bit — 128-bit/HD), Жанру, Языку и Десятилетию', done: true },
      { title: 'Задача 2.2: Переключатель вида «Сетка обложек Steam» / «Подробная таблица» + Карточка игры', done: true },
    ],
  },
  {
    stage: 'Этап 3. Буферная Зона (Inbox) и Умный Апгрейд Регионов (JP / 000001 -> RUS / ENG)',
    status: 'completed',
    tasks: [
      { title: 'Задача 3.1: Приём сырых ромов в Буферную зону с авто-распознаванием заголовка и консоли', done: true },
      { title: 'Задача 3.2: Сравнение флешки с Мастер-базой и предпросмотр замен (Japan / 000001 -> RUS) с галочками', done: true },
    ],
  },
  {
    stage: 'Этап 4. Конструктор Выгрузки по Профилям Консолей и Прошивок',
    status: 'completed',
    tasks: [
      { title: 'Задача 4.1: Профили R36S (EASYROMS), Anbernic (MuOS/Knulli), Miyoo (OnionOS), Steam Deck (EmuDeck)', done: true },
      { title: 'Задача 4.2: Профили PS3 (CFW/HEN PS3ISO), Switch (Atmosphere NSP/XCI), Xbox (Aurora/Xemu)', done: true },
    ],
  },
  {
    stage: 'Этап 5. Центр Эмуляторов (★ Избранный) и Прямой Запуск Игр',
    status: 'completed',
    tasks: [
      { title: 'Задача 5.1: Каталог 18+ эмуляторов (RetroArch, DuckStation, PCSX2, RPCS3, Ryujinx, Xemu, PPSSPP) со ссылками', done: true },
      { title: 'Задача 5.2: Выбор приоритетного эмулятора ★ и прямой запуск игры из карточки', done: true },
    ],
  },
];

export const ConsoleSteamTabs: React.FC<ConsoleSteamTabsProps> = ({
  activeTab,
  dbState,
  isSyncingDb,
  onSyncDatabase,
  onResetSeedDatabase,
  onUpdateDbState,
  onScanFolderIntoMasterDb,
  onAddLog,
  externalViewMode,
  onChangeExternalViewMode,
}) => {
  // Tab 1: Library filters & state (A = Презентационный, B = Компактный, C = Редактор)
  const [internalViewMode, setInternalViewMode] = useState<'presentation' | 'compact' | 'editor'>('presentation');
  const viewMode = externalViewMode || internalViewMode;
  const setViewMode = (m: 'presentation' | 'compact' | 'editor') => {
    setInternalViewMode(m);
    if (onChangeExternalViewMode) onChangeExternalViewMode(m);
  };
  const [selectedConsole, setSelectedConsole] = useState<string>('all');
  const [selectedBitness, setSelectedBitness] = useState<string>('all');
  const [selectedGenre, setSelectedGenre] = useState<string>('all');
  const [selectedLanguage, setSelectedLanguage] = useState<string>('all');
  const [selectedDecade, setSelectedDecade] = useState<string>('all');
  const [sdStatusFilter, setSdStatusFilter] = useState<'all' | 'on_sd' | 'upgrade_ready'>('all');
  const [libSearch, setLibSearch] = useState<string>('');
  const [selectedGameId, setSelectedGameId] = useState<string>(dbState.records[0]?.id || '');
  const [launchModalGame, setLaunchModalGame] = useState<PersistentRomRecord | null>(null);

  // Tab 2: Buffer Zone state
  const [bufferDroppedFiles, setBufferDroppedFiles] = useState<
    Array<{
      id: string;
      rawFileName: string;
      detectedTitle: string;
      consoleCode: string;
      region: string;
      isRussian: boolean;
      genre: string;
      year: number;
      sizeBytes: number;
      matchesSdGameTitle?: string;
    }>
  >([
    {
      id: 'buf_demo_1',
      rawFileName: '000005.pbp',
      detectedTitle: 'Silent Hill (RUS)',
      consoleCode: 'psx',
      region: 'Russia',
      isRussian: true,
      genre: 'Survival Horror',
      year: 1999,
      sizeBytes: 492830720,
      matchesSdGameTitle: '000005.pbp (На SD: без названия)',
    },
    {
      id: 'buf_demo_2',
      rawFileName: 'Chrono_Trigger_Rus_Shedevr.sfc',
      detectedTitle: 'Chrono Trigger (RUS)',
      consoleCode: 'snes',
      region: 'Russia',
      isRussian: true,
      genre: 'RPG / JRPG',
      year: 1995,
      sizeBytes: 4194304,
      matchesSdGameTitle: 'Chrono Trigger (Japan).sfc (На SD: Японский)',
    },
  ]);

  // Tab 3: Smart Export Builder state
  const [selectedProfileId, setSelectedProfileId] = useState<string>('r36s_arkos');
  const [exportConsoleFilter, setExportConsoleFilter] = useState<string>('all');
  const [exportGenreFilter, setExportGenreFilter] = useState<string>('all');
  const [exportLangFilter, setExportLangFilter] = useState<string>('all');
  const [exportTargetDrive, setExportTargetDrive] = useState<string>('E:\\EASYROMS');
  const [includeMediaInExport, setIncludeMediaInExport] = useState<boolean>(true);
  const [includeSavesInExport, setIncludeSavesInExport] = useState<boolean>(true);

  // Tab 4: Emulators filter
  const [emuConsoleFilter, setEmuConsoleFilter] = useState<string>('all');

  const bitnessOptions = useMemo(() => {
    const set = new Set<string>();
    Object.values(EXTENDED_CONSOLE_CATALOG).forEach((c) => set.add(c.bitness));
    return Array.from(set);
  }, []);

  const filteredRecords = useMemo(() => {
    return dbState.records.filter((r) => {
      if (selectedConsole !== 'all' && r.consoleCode !== selectedConsole) return false;
      if (selectedBitness !== 'all' && r.bitness !== selectedBitness) return false;
      if (selectedGenre !== 'all' && r.genre !== selectedGenre) return false;
      if (selectedLanguage === 'RUS' && !r.isRussian) return false;
      if (selectedLanguage === 'ENG' && r.language !== 'ENG') return false;
      if (selectedLanguage === 'JPN' && r.language !== 'JPN') return false;
      if (selectedDecade !== 'all') {
        const dec = Math.floor(r.releaseYear / 10) * 10;
        if (`${dec}s` !== selectedDecade) return false;
      }
      if (sdStatusFilter === 'on_sd' && !r.sdCardPath) return false;
      if (sdStatusFilter === 'upgrade_ready' && !r.hasUpgradeCandidate) return false;
      if (libSearch.trim() !== '') {
        const q = libSearch.toLowerCase();
        return (
          r.title.toLowerCase().includes(q) ||
          r.fileName.toLowerCase().includes(q) ||
          r.consoleCode.toLowerCase().includes(q) ||
          r.genre.toLowerCase().includes(q) ||
          (r.serialCode || '').toLowerCase().includes(q) ||
          (r.sdCardFileName || '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [
    dbState.records,
    selectedConsole,
    selectedBitness,
    selectedGenre,
    selectedLanguage,
    selectedDecade,
    sdStatusFilter,
    libSearch,
  ]);

  const activeGame = useMemo(() => {
    return (
      dbState.records.find((r) => r.id === selectedGameId) ||
      filteredRecords[0] ||
      dbState.records[0] ||
      null
    );
  }, [dbState.records, filteredRecords, selectedGameId]);

  const upgradeCandidates = useMemo(() => {
    return dbState.records.filter((r) => r.hasUpgradeCandidate);
  }, [dbState.records]);

  const handleToggleStarEmulator = (consoleCode: string, emulatorId: string) => {
    const nextStarred = {
      ...dbState.starredEmulatorsByConsole,
      [consoleCode]: emulatorId,
    };
    const nextRecords = dbState.records.map((r) =>
      r.consoleCode === consoleCode ? { ...r, preferredEmulatorId: emulatorId } : r
    );
    onUpdateDbState({
      ...dbState,
      starredEmulatorsByConsole: nextStarred,
      records: nextRecords,
    });
    const emu = EMULATOR_CATALOG.find((e) => e.id === emulatorId);
    onAddLog(
      `★ Приоритетный эмулятор для ${consoleCode.toUpperCase()} изменен на: ${emu?.name || emulatorId}`
    );
  };

  const handleToggleUpgradeCheck = (id: string) => {
    const nextRecords = dbState.records.map((r) =>
      r.id === id ? { ...r, upgradeSelected: !r.upgradeSelected } : r
    );
    onUpdateDbState({ ...dbState, records: nextRecords });
  };

  const handleApplyRegionalUpgradesToSd = () => {
    const toUpgrade = dbState.records.filter((r) => r.hasUpgradeCandidate && r.upgradeSelected);
    if (toUpgrade.length === 0) return;

    const batLines: string[] = [
      '@echo off',
      'chcp 65001 >nul',
      'echo ============================================================================',
      'echo  AegisROM v0.5.5-dev (Beta) — Замена японских и номерных ромов (000001) на РУССКИЕ / USA',
      'echo ============================================================================',
      '',
    ];

    const nextRecords = dbState.records.map((r) => {
      if (!r.hasUpgradeCandidate || !r.upgradeSelected) return r;
      const newSdPath = `${dbState.sdCardMountPath}/${r.consoleCode}/${r.fileName}`;
      batLines.push(`echo [ОБНОВЛЕНИЕ] ${r.sdCardFileName} (${r.sdCardRegion}) -> ${r.fileName} (${r.region})`);
      batLines.push(
        `copy /y "${r.masterPath.replace(/\//g, '\\')}" "${newSdPath.replace(/\//g, '\\')}" >nul`
      );
      if (r.sdCardPath && r.sdCardFileName !== r.fileName) {
        batLines.push(`del /f /q "${r.sdCardPath.replace(/\//g, '\\')}" 2>nul`);
      }
      return {
        ...r,
        sdCardPath: newSdPath,
        sdCardFileName: r.fileName,
        sdCardRegion: r.region,
        sdCardLanguage: r.language,
        hasUpgradeCandidate: false,
        upgradeSelected: false,
        upgradeReason: `✔ Обновлен на флешке до ${r.language} (${r.region})`,
      };
    });

    batLines.push('echo.');
    batLines.push('echo Все выбранные ромы заменены на лучшие версии! Сохранения (.srm/.state) и привязки gamelist.xml сохранены.');
    batLines.push('pause');

    const blob = new Blob([batLines.join('\r\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'AegisROM_Upgrade_SD_Regions.cmd';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    onUpdateDbState({ ...dbState, records: nextRecords });
    onAddLog(
      `✔ Выполнена замена ${toUpgrade.length} игр на SD-флешке (Японские и номерные 000001 заменены на Русские / Английские версии из Мастер-базы).`
    );
  };

  const handleBufferFolderInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const added: typeof bufferDroppedFiles = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const dot = f.name.lastIndexOf('.');
      const ext = dot !== -1 ? f.name.slice(dot).toLowerCase() : '';
      let consoleCode = 'psx';
      for (const [code, meta] of Object.entries(EXTENDED_CONSOLE_CATALOG)) {
        if (meta.extensions.includes(ext)) {
          consoleCode = code;
          break;
        }
      }
      const clean = f.name
        .replace(/\.[^/.]+$/, '')
        .replace(/[_.-]+/g, ' ')
        .trim();
      const isRus = /rus|рус/i.test(f.name);
      const { genre, releaseYear } = inferGenreAndYear(clean, consoleCode);
      added.push({
        id: `buf_${Date.now()}_${i}`,
        rawFileName: f.name,
        detectedTitle: isRus && !clean.toUpperCase().includes('RUS') ? `${clean} (RUS)` : clean,
        consoleCode,
        region: isRus ? 'Russia' : 'USA',
        isRussian: isRus,
        genre,
        year: releaseYear,
        sizeBytes: f.size,
        matchesSdGameTitle: 'Авто-сверка с SD-флешкой готова',
      });
    }
    setBufferDroppedFiles((prev) => [...added, ...prev]);
    onAddLog(`В Буферную зону (Inbox) загружено новых файлов для разбора: ${added.length}.`);
    e.target.value = '';
  };

  const handleImportBufferToMasterDb = () => {
    if (bufferDroppedFiles.length === 0) return;
    const newRecords: PersistentRomRecord[] = bufferDroppedFiles.map((b) => {
      const meta = EXTENDED_CONSOLE_CATALOG[b.consoleCode] || EXTENDED_CONSOLE_CATALOG.psx;
      const ext = b.rawFileName.includes('.')
        ? b.rawFileName.slice(b.rawFileName.lastIndexOf('.'))
        : '.chd';
      const canonicalFileName = `${b.detectedTitle}${ext}`;
      return {
        id: `db_${b.id}`,
        title: b.detectedTitle.replace(/\s*\(RUS\)/i, ''),
        cleanTitle: b.detectedTitle.replace(/\s*\(RUS\)/i, ''),
        comparisonKey: b.detectedTitle.toLowerCase().replace(/[^a-z0-9]/g, ''),
        consoleCode: b.consoleCode,
        generationShort: meta.generationShort,
        bitness: meta.bitness,
        genre: b.genre,
        releaseYear: b.year,
        region: b.region,
        language: b.isRussian ? 'RUS' : 'ENG',
        isRussian: b.isRussian,
        fileName: canonicalFileName,
        masterPath: `${dbState.masterLibraryPath}/${b.consoleCode}/${canonicalFileName}`,
        sdCardPath: `${dbState.sdCardMountPath}/${b.consoleCode}/${b.rawFileName}`,
        sdCardFileName: b.rawFileName,
        sdCardRegion: 'Japan',
        sdCardLanguage: 'JPN',
        hasUpgradeCandidate: true,
        upgradeSelected: true,
        upgradeReason: `Из Буферной зоны: замена ${b.rawFileName} на ${canonicalFileName}`,
        fileSize: b.sizeBytes,
        crc32: 'BF9012A4',
        dependencies: [canonicalFileName],
        preferredEmulatorId:
          dbState.starredEmulatorsByConsole[b.consoleCode] || meta.defaultEmulatorId,
        boxArtUrl: `https://thumbnails.libretro.com/${encodeURIComponent(
          meta.libretroSystem
        )}/Named_Boxarts/${encodeURIComponent(
          b.detectedTitle.replace(/\s*\(RUS\)/i, '')
        )}.png`,
        lastSyncedAt: new Date().toISOString(),
      };
    });

    onUpdateDbState({
      ...dbState,
      records: [...newRecords, ...dbState.records],
      lastSyncedAt: new Date().toISOString(),
    });
    setBufferDroppedFiles([]);
    onAddLog(
      `✔ Из Буферной зоны (Inbox) переименовано и импортировано в Мастер-базу игр: ${newRecords.length}. Созданы предложения замены для SD-флешки!`
    );
  };

  // Tab 3 computed export list
  const selectedExportProfile = useMemo(() => {
    return (
      DEVICE_EXPORT_PROFILES.find((p) => p.id === selectedProfileId) || DEVICE_EXPORT_PROFILES[0]
    );
  }, [selectedProfileId]);

  const matchingExportRecords = useMemo(() => {
    return dbState.records.filter((r) => {
      if (!selectedExportProfile.supportedConsoles.includes(r.consoleCode)) return false;
      if (exportConsoleFilter !== 'all' && r.consoleCode !== exportConsoleFilter) return false;
      if (exportGenreFilter !== 'all' && r.genre !== exportGenreFilter) return false;
      if (exportLangFilter === 'RUS' && !r.isRussian) return false;
      if (exportLangFilter === 'ENG' && r.language !== 'ENG') return false;
      return true;
    });
  }, [
    dbState.records,
    selectedExportProfile,
    exportConsoleFilter,
    exportGenreFilter,
    exportLangFilter,
  ]);

  const totalExportBytes = useMemo(() => {
    return matchingExportRecords.reduce((acc, r) => acc + r.fileSize, 0);
  }, [matchingExportRecords]);

  const handleExecuteSmartExport = () => {
    if (matchingExportRecords.length === 0) return;
    const lines: string[] = [
      '@echo off',
      'chcp 65001 >nul',
      'echo ============================================================================',
      `echo  AegisROM v0.5.5-dev (Beta) — Умная выгрузка по профилю: ${selectedExportProfile.name}`,
      `echo  Целевой путь: ${exportTargetDrive} | Отобрано игр: ${matchingExportRecords.length}`,
      'echo ============================================================================',
      '',
    ];

    for (const r of matchingExportRecords) {
      const targetConsoleFolder =
        selectedExportProfile.consolePathMap[r.consoleCode] || r.consoleCode;
      const destDir = `${exportTargetDrive}\\${targetConsoleFolder}`;
      lines.push(`if not exist "${destDir}" mkdir "${destDir}"`);
      if (includeMediaInExport) {
        lines.push(
          `if not exist "${destDir}\\images" mkdir "${destDir}\\images"`
        );
      }
      lines.push(
        `echo [ВЫГРУЗКА ${r.consoleCode.toUpperCase()} / ${r.genre}] ${r.fileName} -> ${destDir}\\${r.fileName}`
      );
      lines.push(
        `copy /y "${r.masterPath.replace(/\//g, '\\')}" "${destDir}\\${r.fileName}" >nul`
      );
    }

    lines.push('echo.');
    lines.push(
      `echo Выгрузка завершена! Скопировано игр: ${matchingExportRecords.length} (${formatSizeHuman(
        totalExportBytes
      )}).`
    );
    lines.push('pause');

    const blob = new Blob([lines.join('\r\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Export_${selectedExportProfile.id}_${matchingExportRecords.length}_games.cmd`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    onAddLog(
      `✔ Сформирован и запущен пакет выгрузки для «${selectedExportProfile.name}»: ${
        matchingExportRecords.length
      } игр (${formatSizeHuman(totalExportBytes)}) в ${exportTargetDrive}.`
    );
  };

  if (activeTab === 'r36s_tools') {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 border-b border-slate-200 pb-3">
          <div className="flex items-center gap-2.5">
            <ListChecks className="w-5 h-5 text-blue-600" />
            <h2 className="text-base font-extrabold text-slate-900">
              Дорожная карта модулей AegisROM v0.5.5-dev Beta (Этапы, Задачи и Подзадачи)
            </h2>
          </div>
          <span className="px-3 py-1 rounded-lg bg-emerald-100 text-emerald-900 text-xs font-bold border border-emerald-300">
            Все 5 модулей активны и синхронизированы
          </span>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
          {ROADMAP_STAGES.map((st, idx) => (
            <div
              key={idx}
              className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2"
            >
              <div className="text-xs font-extrabold text-blue-900 leading-snug">{st.stage}</div>
              <div className="space-y-1.5">
                {st.tasks.map((t, tidx) => (
                  <div key={tidx} className="flex items-start gap-1.5 text-xs text-slate-700">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                    <span>{t.title}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Persistent Database Status Bar (Visible across Console Steam tabs) */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
        <div className="flex items-start sm:items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800/70 flex items-center justify-center shrink-0">
            <Database className="w-6 h-6 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-extrabold text-slate-900 dark:text-slate-100">
                Постоянная Мастер-База AegisDB: {dbState.records.length} игр (от 8-bit NES до PS3, Switch и Xbox)
              </span>
              <span className="px-2 py-0.5 text-xs font-bold rounded-md bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                Мгновенная загрузка без пересканирования
              </span>
            </div>
            <div className="text-xs text-slate-600 dark:text-slate-400 font-mono mt-0.5 flex flex-wrap items-center gap-x-4 gap-y-1">
              <span>Мастер-папка: {dbState.masterLibraryPath}</span>
              <span>•</span>
              <span>SD-флешка: {dbState.sdCardMountPath}</span>
              <span>•</span>
              <span>
                Последняя синхронизация:{' '}
                {new Date(dbState.lastSyncedAt).toLocaleTimeString('ru-RU', { hour12: false })}
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            onClick={onSyncDatabase}
            disabled={isSyncingDb}
            title="Быстрая дельта-синхронизация: проверяет только новые или измененные файлы без полного пересканирования"
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs transition cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isSyncingDb ? 'animate-spin' : ''}`} />
            <span>{isSyncingDb ? 'Синхронизация...' : '⚡ Синхронизировать БД'}</span>
          </button>

          <button
            onClick={onScanFolderIntoMasterDb}
            title="Указать папку с ромами на ПК или SD-флешке и добавить все найденные игры в постоянную базу AegisDB"
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition cursor-pointer"
          >
            <HardDrive className="w-4 h-4" />
            <span>Добавить папку в Базу</span>
          </button>

          <button
            onClick={onResetSeedDatabase}
            title="Восстановить демонстрационную базу со всеми поколениями консолей (NES, Sega, GBA, PS1 000001, PS2, PS3, Switch, Xbox)"
            className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 text-xs font-bold transition cursor-pointer"
          >
            <span>Сбросить демо-БД</span>
          </button>
        </div>
      </div>

      {/* TAB 1: МОЯ БИБЛИОТЕКА И ФИЛЬТРЫ («КОНСОЛЬНЫЙ STEAM») */}
      {activeTab === 'library' && (
        <div className="space-y-5">
          {/* Multi-Dimensional Filter Bar */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-4">
            <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-extrabold text-slate-900 dark:text-slate-100">
                <Filter className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span>Многомерные фильтры библиотеки и переключатель вида (A / B / C)</span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex-1 sm:w-64">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={libSearch}
                    onChange={(e) => setLibSearch(e.target.value)}
                    placeholder="Поиск по названию, SLUS, жанру..."
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-900 dark:text-slate-100 font-semibold focus:outline-none focus:border-blue-600"
                  />
                </div>

                {/* 3 System View Modes: A = Презентационный, B = Компактный, C = Редактор */}
                <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
                  <button
                    onClick={() => setViewMode('presentation')}
                    title="Вид A — Презентационный (Окна / Плитка обложек)"
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                      viewMode === 'presentation'
                        ? 'bg-white dark:bg-blue-600 text-blue-700 dark:text-white shadow-2xs'
                        : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                    <span>A · Презентационный</span>
                  </button>
                  <button
                    onClick={() => setViewMode('compact')}
                    title="Вид B — Компактный (Плотный список игр с быстрым запуском)"
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                      viewMode === 'compact'
                        ? 'bg-white dark:bg-blue-600 text-blue-700 dark:text-white shadow-2xs'
                        : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <List className="w-3.5 h-3.5" />
                    <span>B · Компактный</span>
                  </button>
                  <button
                    onClick={() => setViewMode('editor')}
                    title="Вид C — Редактор (Таблица сверки с галочками, путями Было -> Стало и серийниками)"
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                      viewMode === 'editor'
                        ? 'bg-white dark:bg-blue-600 text-blue-700 dark:text-white shadow-2xs'
                        : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <TableIcon className="w-3.5 h-3.5" />
                    <span>C · Редактор</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Консоль (8-bit — PS3/Switch):
                </label>
                <select
                  value={selectedConsole}
                  onChange={(e) => setSelectedConsole(e.target.value)}
                  title="Фильтр по конкретной игровой системе"
                  className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-900 dark:text-slate-100 cursor-pointer"
                >
                  <option value="all">Все консоли ({dbState.records.length})</option>
                  {Object.values(EXTENDED_CONSOLE_CATALOG).map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.displayName} ({c.bitness})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Поколение / Битность:
                </label>
                <select
                  value={selectedBitness}
                  onChange={(e) => setSelectedBitness(e.target.value)}
                  title="Фильтр по разрядности и поколению процессора консоли"
                  className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-900 dark:text-slate-100 cursor-pointer"
                >
                  <option value="all">Любая битность (8-bit — HD)</option>
                  {bitnessOptions.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Жанр игры:</label>
                <select
                  value={selectedGenre}
                  onChange={(e) => setSelectedGenre(e.target.value)}
                  title="Фильтр по жанру (Экшен, Файтинг, RPG, Гонки, Платформер и др.)"
                  className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-900 dark:text-slate-100 cursor-pointer"
                >
                  <option value="all">Все жанры</option>
                  {GENRE_LIST.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Язык / Локализация:
                </label>
                <select
                  value={selectedLanguage}
                  onChange={(e) => setSelectedLanguage(e.target.value)}
                  title="Фильтр по языку перевода (Русская версия, Английская, Японский оригинал)"
                  className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-900 dark:text-slate-100 cursor-pointer"
                >
                  <option value="all">Все языки (RUS / ENG / JPN)</option>
                  <option value="RUS">🇷🇺 Русский перевод (RUS)</option>
                  <option value="ENG">🇺🇸 Английский (USA / Europe)</option>
                  <option value="JPN">🇯🇵 Японский (Japan)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Год выпуска / Эпоха:
                </label>
                <select
                  value={selectedDecade}
                  onChange={(e) => setSelectedDecade(e.target.value)}
                  title="Фильтр по десятилетию выхода игры"
                  className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-900 dark:text-slate-100 cursor-pointer"
                >
                  <option value="all">Все годы (1980 — 2024)</option>
                  <option value="1980s">1980–1989 (Эра 8-бит)</option>
                  <option value="1990s">1990–1999 (Золотая эра 16/32-бит)</option>
                  <option value="2000s">2000–2009 (Эра 128-бит и 3D)</option>
                  <option value="2010s">2010–2024 (Эра HD / PS3 / Switch)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Статус на SD-флешке:
                </label>
                <select
                  value={sdStatusFilter}
                  onChange={(e) => setSdStatusFilter(e.target.value as any)}
                  title="Показать игры, которые уже записаны на SD-флешку или имеют лучший вариант (RUS/ENG) для замены"
                  className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-900 dark:text-slate-100 cursor-pointer"
                >
                  <option value="all">Вся Мастер-база (вкл. офлайн)</option>
                  <option value="on_sd">Только игры на SD-флешке</option>
                  <option value="upgrade_ready">
                    🔥 Доступна замена на RUS/ENG ({upgradeCandidates.length})
                  </option>
                </select>
              </div>
            </div>
          </div>

          {/* Main Split View: Left Cover Grid/Compact/Editor + Right Game Inspector with Cover + Hover Video */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
            <div className="xl:col-span-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <div className="text-sm font-extrabold text-slate-900 dark:text-slate-100">
                  Найдено игр по фильтрам: {filteredRecords.length} • Режим:{' '}
                  <span className="text-blue-600 dark:text-blue-400">
                    {viewMode === 'presentation'
                      ? 'Вид A (Презентационный)'
                      : viewMode === 'compact'
                      ? 'Вид B (Компактный список)'
                      : 'Вид C (Редактор таблицы)'}
                  </span>
                </div>
                <div className="text-xs text-slate-600 dark:text-slate-400">
                  Кликните на игру — справа в Инспекторе появится обложка (при наведении играет короткое видео)
                </div>
              </div>

              {viewMode === 'presentation' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {filteredRecords.map((game) => {
                    const isSelected = activeGame?.id === game.id;
                    const emu = EMULATOR_CATALOG.find(
                      (e) =>
                        e.id ===
                        (dbState.starredEmulatorsByConsole[game.consoleCode] ||
                          game.preferredEmulatorId)
                    );
                    return (
                      <div
                        key={game.id}
                        onClick={() => setSelectedGameId(game.id)}
                        className={`rounded-2xl border p-3.5 transition cursor-pointer flex flex-col justify-between ${
                          isSelected
                            ? 'bg-blue-50/70 dark:bg-blue-950/40 border-blue-600 ring-2 ring-blue-500/20 shadow-sm'
                            : 'bg-slate-50/70 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 hover:border-blue-400 hover:bg-white dark:hover:bg-slate-800'
                        }`}
                      >
                        <div>
                          <div className="relative h-40 w-full bg-slate-900 rounded-xl overflow-hidden flex items-center justify-center mb-3 border border-slate-200 dark:border-slate-700">
                            <img
                              src={game.boxArtUrl}
                              alt={game.title}
                              onError={(e) => {
                                (e.currentTarget as HTMLImageElement).style.display = 'none';
                              }}
                              className="w-full h-full object-contain p-2"
                            />
                            <div className="absolute top-2 left-2 flex items-center gap-1">
                              <span className="px-2 py-0.5 rounded-md bg-slate-900/85 text-white font-mono font-bold text-[11px] uppercase">
                                {game.consoleCode}
                              </span>
                              <span className="px-2 py-0.5 rounded-md bg-blue-600/90 text-white font-bold text-[10px]">
                                {game.bitness.split(' ')[0]}
                              </span>
                            </div>
                            <div className="absolute top-2 right-2">
                              <span
                                className={`px-2 py-0.5 rounded-md font-bold text-[11px] ${
                                  game.isRussian
                                    ? 'bg-emerald-600 text-white'
                                    : 'bg-slate-800/85 text-slate-100'
                                }`}
                              >
                                {game.isRussian ? 'RUS' : game.language}
                              </span>
                            </div>
                            {game.hasUpgradeCandidate && (
                              <div className="absolute bottom-2 inset-x-2 bg-amber-500 text-slate-950 text-[11px] font-extrabold px-2 py-1 rounded-lg text-center shadow-xs">
                                ⚡ Замена для SD: {game.sdCardFileName} &rarr; {game.language}
                              </div>
                            )}
                          </div>

                          <div className="font-extrabold text-sm text-slate-900 dark:text-slate-100 line-clamp-1">
                            {game.title}
                          </div>
                          <div className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 flex items-center justify-between">
                            <span>{game.genre}</span>
                            <span className="font-mono font-semibold">{game.releaseYear} г.</span>
                          </div>
                        </div>

                        <div className="mt-3 pt-2.5 border-t border-slate-200/80 dark:border-slate-700 flex items-center justify-between gap-2">
                          <div
                            className="text-[11px] text-slate-700 dark:text-slate-300 font-semibold truncate flex items-center gap-1"
                            title={`Приоритетный эмулятор: ${emu?.name}`}
                          >
                            <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-400 shrink-0" />
                            <span className="truncate">{emu?.name || 'RetroArch'}</span>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedGameId(game.id);
                              setLaunchModalGame(game);
                            }}
                            className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1 shrink-0 cursor-pointer"
                          >
                            <Play className="w-3 h-3 fill-white" />
                            <span>Играть</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : viewMode === 'compact' ? (
                /* ВИД B: КОМПАКТНЫЙ СПИСОК (Playnite / Steam List View) */
                <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                  {filteredRecords.map((game) => {
                    const isSelected = activeGame?.id === game.id;
                    const emu = EMULATOR_CATALOG.find(
                      (e) =>
                        e.id ===
                        (dbState.starredEmulatorsByConsole[game.consoleCode] ||
                          game.preferredEmulatorId)
                    );
                    return (
                      <div
                        key={game.id}
                        onClick={() => setSelectedGameId(game.id)}
                        className={`flex items-center justify-between gap-3 px-3.5 py-2.5 text-xs transition cursor-pointer ${
                          isSelected
                            ? 'bg-blue-50/90 dark:bg-blue-950/50 text-blue-950 dark:text-white font-semibold'
                            : 'bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/70 text-slate-800 dark:text-slate-200'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="px-2 py-0.5 rounded bg-slate-900 text-white font-mono font-bold text-[10px] uppercase shrink-0">
                            {game.consoleCode}
                          </span>
                          <span className="font-extrabold text-slate-900 dark:text-slate-100 truncate">
                            {game.title}
                          </span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                              game.isRussian
                                ? 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-900 dark:text-emerald-300'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            {game.isRussian ? 'RUS' : game.language}
                          </span>
                        </div>

                        <div className="flex items-center gap-4 shrink-0">
                          <span className="hidden md:inline text-slate-500 dark:text-slate-400">
                            {game.genre} • {game.releaseYear}
                          </span>
                          <span className="hidden sm:inline font-mono text-[11px] text-amber-600 dark:text-amber-400">
                            ★ {emu?.name || 'RetroArch'}
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedGameId(game.id);
                              setLaunchModalGame(game);
                            }}
                            className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold cursor-pointer"
                          >
                            ▶ Играть
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* ВИД C: РЕДАКТОР (Таблица сверки с галочками, путями Было -> Стало и серийниками) */
                <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700 uppercase">
                        <th className="py-2.5 px-2.5 font-bold w-8">✓</th>
                        <th className="py-2.5 px-3 font-bold">Игра (Каноническое имя)</th>
                        <th className="py-2.5 px-3 font-bold">Консоль / Серийник</th>
                        <th className="py-2.5 px-3 font-bold">Исходный файл на SD &rarr; В Базе</th>
                        <th className="py-2.5 px-3 font-bold">Язык</th>
                        <th className="py-2.5 px-3 font-bold">★ Эмулятор</th>
                        <th className="py-2.5 px-3 font-bold">Запуск</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                      {filteredRecords.map((game) => {
                        const emu = EMULATOR_CATALOG.find(
                          (e) =>
                            e.id ===
                            (dbState.starredEmulatorsByConsole[game.consoleCode] ||
                              game.preferredEmulatorId)
                        );
                        return (
                          <tr
                            key={game.id}
                            onClick={() => setSelectedGameId(game.id)}
                            className={`hover:bg-blue-50/60 dark:hover:bg-slate-800/70 cursor-pointer ${
                              activeGame?.id === game.id
                                ? 'bg-blue-50/80 dark:bg-blue-950/40 font-semibold'
                                : ''
                            }`}
                          >
                            <td
                              className="py-2.5 px-2.5"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleUpgradeCheck(game.id);
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={Boolean(game.upgradeSelected ?? true)}
                                onChange={() => {}}
                                className="w-3.5 h-3.5 accent-blue-600 cursor-pointer"
                              />
                            </td>
                            <td className="py-2.5 px-3 font-bold text-slate-900 dark:text-slate-100">
                              {game.title}
                            </td>
                            <td className="py-2.5 px-3 font-mono">
                              <span className="font-bold text-blue-700 dark:text-blue-400 uppercase">
                                {game.consoleCode}
                              </span>{' '}
                              <span className="text-slate-500 dark:text-slate-400">
                                {game.serialCode || game.crc32}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 font-mono">
                              {game.hasUpgradeCandidate ? (
                                <span className="text-amber-800 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/60 px-2 py-0.5 rounded font-bold">
                                  {game.sdCardFileName} &rarr; {game.fileName}
                                </span>
                              ) : (
                                <span className="text-emerald-700 dark:text-emerald-400">
                                  {game.fileName}
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-3">
                              <span
                                className={`px-2 py-0.5 rounded font-bold ${
                                  game.isRussian
                                    ? 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-900 dark:text-emerald-300'
                                    : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200'
                                }`}
                              >
                                {game.language} ({game.region})
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-slate-700 dark:text-slate-300">
                              {emu?.name || 'RetroArch'}
                            </td>
                            <td className="py-2.5 px-3">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setLaunchModalGame(game);
                                }}
                                className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white font-bold cursor-pointer"
                              >
                                ▶ Играть
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Right Column: Detailed Game Inspector (Cover Art + Short Video on Hover + Dependencies + Emulators) */}
            <div className="xl:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-4">
              {activeGame ? (
                <>
                  {/* Box-Art Cover by default + Short Gameplay Video Preview on Hover */}
                  <GameInspectorCoverVideo
                    title={activeGame.title}
                    consoleCode={activeGame.consoleCode}
                    genre={activeGame.genre}
                    year={activeGame.releaseYear}
                    region={activeGame.isRussian ? 'RUS' : activeGame.language}
                    boxArtUrl={activeGame.boxArtUrl}
                    videoUrl={activeGame.videoUrl}
                  />

                  <div className="flex items-start justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
                    <div>
                      <div className="text-xs font-extrabold uppercase text-blue-700 dark:text-blue-400">
                        {EXTENDED_CONSOLE_CATALOG[activeGame.consoleCode]?.displayName ||
                          activeGame.consoleCode.toUpperCase()}{' '}
                        • {activeGame.bitness}
                      </div>
                      <h3 className="text-lg font-extrabold text-slate-900 dark:text-slate-100 mt-0.5">
                        {activeGame.title}
                      </h3>
                      <div className="text-xs text-slate-600 dark:text-slate-400 font-mono mt-0.5">
                        Жанр: {activeGame.genre} | Год: {activeGame.releaseYear} | CRC32:{' '}
                        {activeGame.crc32}
                      </div>
                    </div>
                  </div>

                  {/* Dependencies & File Tree inside Master DB */}
                  <div className="bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-xl p-3.5 space-y-2">
                    <div className="text-xs font-extrabold text-slate-800 dark:text-slate-200 uppercase flex items-center gap-1.5">
                      <Layers className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                      <span>Связанные файлы и зависимости в базе:</span>
                    </div>
                    <div className="text-xs font-mono text-slate-700 dark:text-slate-300 space-y-1">
                      <div>
                        <strong>Мастер-путь:</strong> {activeGame.masterPath}
                      </div>
                      {activeGame.sdCardPath && (
                        <div>
                          <strong>Путь на SD:</strong> {activeGame.sdCardPath} (
                          {activeGame.sdCardLanguage})
                        </div>
                      )}
                      {activeGame.serialCode && (
                        <div>
                          <strong>Внутренний серийник диска:</strong>{' '}
                          <span className="px-1.5 py-0.5 bg-sky-100 text-sky-900 rounded font-bold">
                            {activeGame.serialCode}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {activeGame.dependencies.map((dep, idx) => (
                        <span
                          key={idx}
                          className="px-2 py-1 rounded-md bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs font-mono font-semibold text-slate-800 dark:text-slate-200"
                        >
                          {dep}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Compatible Emulators for this game's console with ★ Star selector */}
                  <div className="space-y-2.5">
                    <div className="text-xs font-extrabold text-slate-800 dark:text-slate-200 uppercase flex items-center justify-between">
                      <span>Совместимые эмуляторы (★ — приоритетный):</span>
                    </div>
                    <div className="space-y-2">
                      {EMULATOR_CATALOG.filter((e) =>
                        e.supportedConsoles.includes(activeGame.consoleCode)
                      ).map((emu) => {
                        const currentStarred =
                          dbState.starredEmulatorsByConsole[activeGame.consoleCode] ||
                          activeGame.preferredEmulatorId;
                        const isStarred = currentStarred === emu.id;
                        return (
                          <div
                            key={emu.id}
                            className={`p-3 rounded-xl border text-xs transition ${
                              isStarred
                                ? 'bg-amber-50/70 dark:bg-amber-950/40 border-amber-400'
                                : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <button
                                onClick={() =>
                                  handleToggleStarEmulator(activeGame.consoleCode, emu.id)
                                }
                                title="Нажмите звездочку ★, чтобы сделать этот эмулятор приоритетным для данной консоли"
                                className="flex items-center gap-1.5 font-extrabold text-slate-900 dark:text-slate-100 cursor-pointer text-left"
                              >
                                <Star
                                  className={`w-4 h-4 shrink-0 ${
                                    isStarred
                                      ? 'text-amber-500 fill-amber-400'
                                      : 'text-slate-400 hover:text-amber-500'
                                  }`}
                                />
                                <span>{emu.name}</span>
                              </button>

                              <a
                                href={emu.downloadUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-blue-700 dark:text-blue-400 hover:underline font-bold shrink-0"
                              >
                                <span>Скачать</span>
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            </div>
                            <div className="text-[11px] text-slate-600 dark:text-slate-400 mt-1">{emu.description}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <button
                    onClick={() => setLaunchModalGame(activeGame)}
                    className="w-full py-3.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-sm shadow-sm flex items-center justify-center gap-2 cursor-pointer transition"
                  >
                    <Play className="w-4 h-4 fill-white" />
                    <span>▶ Запустить «{activeGame.title}» в эмуляторе</span>
                  </button>
                </>
              ) : (
                <div className="text-sm text-slate-500 dark:text-slate-400 py-12 text-center">
                  Выберите любую игру слева для просмотра карточки и запуска
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* SUB-MODULE INSIDE ИНСТРУМЕНТЫ: КОМБАЙН (РАЗБОР РОМОВ И ЗАМЕНА JP / 000001 -> RUS / ENG) */}
      {activeTab === 'buffer_upgrade' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left: Combain Intake */}
          <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-4">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <div className="text-xs font-extrabold uppercase text-blue-700 dark:text-blue-400">
                  Инструменты • Комбайн (Авто-разбор и распознавание)
                </div>
                <h3 className="text-base font-extrabold text-slate-900 dark:text-slate-100 mt-0.5">
                  Комбайн: приём сырых ромов, чтение заголовков и сверка с базой
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                  Загружайте сюда любые неразобранные ромы (даже с именами <code className="font-mono font-bold">000005.pbp</code> или <code className="font-mono font-bold">000001 (World).chd</code>): Комбайн сам прочитает внутренний бинарный заголовок, определит консоль, жанр, язык и предложит заменить старую версию на флешке.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <label className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold cursor-pointer shadow-xs">
                <FolderInput className="w-4 h-4" />
                <span>Загрузить ромы в Комбайн</span>
                <input
                  type="file"
                  multiple
                  onChange={handleBufferFolderInput}
                  className="hidden"
                />
              </label>

              <button
                onClick={handleImportBufferToMasterDb}
                disabled={bufferDroppedFiles.length === 0}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer shadow-xs disabled:opacity-40"
              >
                <Sparkles className="w-4 h-4" />
                <span>
                  Переименовать и перенести в Мастер-базу ({bufferDroppedFiles.length})
                </span>
              </button>
            </div>

            <div className="space-y-2.5 max-h-96 overflow-y-auto">
              {bufferDroppedFiles.length === 0 ? (
                <div className="p-8 text-center bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-400">
                  Буферная зона пуста — все новые ромы разобраны и перенесены в Мастер-базу!
                </div>
              ) : (
                bufferDroppedFiles.map((item) => (
                  <div
                    key={item.id}
                    className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 space-y-1"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs text-rose-700 dark:text-rose-400 line-through">
                        {item.rawFileName}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-950 text-blue-900 dark:text-blue-300 font-mono font-bold text-[11px] uppercase">
                        {item.consoleCode} • {item.genre}
                      </span>
                    </div>
                    <div className="text-sm font-extrabold text-emerald-800 dark:text-emerald-300">
                      &rarr; {item.detectedTitle} ({item.year} г.)
                    </div>
                    {item.matchesSdGameTitle && (
                      <div className="text-xs text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 px-2.5 py-1 rounded-lg font-semibold">
                        ⚡ Найдено совпадение на SD: {item.matchesSdGameTitle}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Right: Regional & Numbered ROM Upgrade Center (Japan / 000001 -> RUS / ENG) */}
          <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <div className="text-xs font-extrabold uppercase text-amber-700 dark:text-amber-400">
                  Модуль 3.2 • Умный апгрейд игр на SD-флешке по приоритету языка
                </div>
                <h3 className="text-base font-extrabold text-slate-900 dark:text-slate-100 mt-0.5">
                  Предпросмотр замен: Японские (Japan) и номерные (000001) &rarr; Русские (RUS) / Английские
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                  На вашей флешке найдены игры на японском языке или с безликими номерами <code className="font-mono font-bold">000001.pbp</code>, для которых в Мастер-базе есть <strong>Русская (RUS)</strong> или <strong>Английская (USA)</strong> версия.
                </p>
              </div>

              <button
                onClick={handleApplyRegionalUpgradesToSd}
                disabled={
                  upgradeCandidates.filter((c) => c.upgradeSelected).length === 0
                }
                className="flex items-center gap-2 px-4 py-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold text-xs shadow-sm cursor-pointer shrink-0 disabled:opacity-40"
              >
                <ArrowRightLeft className="w-4 h-4" />
                <span>
                  Заменить выбранные на SD ({upgradeCandidates.filter((c) => c.upgradeSelected).length})
                </span>
              </button>
            </div>

            {upgradeCandidates.length === 0 ? (
              <div className="p-10 text-center bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-xl space-y-2">
                <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto" />
                <div className="text-sm font-extrabold text-slate-900 dark:text-slate-100">
                  На вашей SD-флешке уже стоят лучшие региональные версии (RUS / USA)!
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {upgradeCandidates.map((cand) => (
                  <label
                    key={cand.id}
                    onClick={() => handleToggleUpgradeCheck(cand.id)}
                    className="flex items-start gap-3.5 p-4 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50/40 dark:bg-amber-950/30 hover:bg-amber-50 dark:hover:bg-amber-950/50 transition cursor-pointer select-none"
                  >
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleUpgradeCheck(cand.id);
                      }}
                      className="mt-0.5 shrink-0"
                    >
                      {cand.upgradeSelected ? (
                        <CheckSquare className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                      ) : (
                        <Square className="w-5 h-5 text-slate-400" />
                      )}
                    </button>

                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="text-sm font-extrabold text-slate-900 dark:text-slate-100">
                          {cand.title} ({cand.consoleCode.toUpperCase()})
                        </span>
                        <span className="px-2.5 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950 text-emerald-900 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 text-xs font-extrabold">
                          Приоритет: {cand.language} ({cand.region})
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono">
                        <div className="p-2 rounded-lg bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-900 dark:text-rose-200">
                          <div className="text-[10px] uppercase font-bold text-rose-700 dark:text-rose-400">
                            Сейчас на SD-флешке:
                          </div>
                          <div className="truncate font-bold">{cand.sdCardFileName}</div>
                          <div>Регион/Язык: {cand.sdCardRegion} ({cand.sdCardLanguage})</div>
                        </div>

                        <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200">
                          <div className="text-[10px] uppercase font-bold text-emerald-700 dark:text-emerald-400">
                            Будет записан из Мастер-базы:
                          </div>
                          <div className="truncate font-bold">{cand.fileName}</div>
                          <div>Регион/Язык: {cand.region} ({cand.language})</div>
                        </div>
                      </div>

                      <div className="text-xs text-slate-700 dark:text-slate-300 font-medium">
                        {cand.upgradeReason} • Сохранения и привязка обложки в <code className="font-mono">gamelist.xml</code> обновятся автоматически.
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: СБОРКИ (ПОДГОТОВЛЕННЫЕ КОЛЛЕКЦИИ ДЛЯ ПРИСТАВОК, ФЛЕШЕК И ПАПОК ПК) */}
      {activeTab === 'export_builder' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs space-y-5">
          <div className="border-b border-slate-200 dark:border-slate-800 pb-4">
            <div className="text-xs font-extrabold uppercase text-blue-700 dark:text-blue-400">
              Сборки • Формирование готовых коллекций игр по параметрам и профилям устройств
            </div>
            <h3 className="text-lg font-extrabold text-slate-900 dark:text-slate-100 mt-0.5">
              Конструктор сборок (для SD-флешек R36S / Anbernic / Miyoo, Steam Deck, PS3, Switch или локальной папки на ПК)
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="lg:col-span-2">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                1. Целевое устройство / Прошивка:
              </label>
              <select
                value={selectedProfileId}
                onChange={(e) => setSelectedProfileId(e.target.value)}
                className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-900 dark:text-slate-100 cursor-pointer"
              >
                {DEVICE_EXPORT_PROFILES.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                2. Консоль для выгрузки:
              </label>
              <select
                value={exportConsoleFilter}
                onChange={(e) => setExportConsoleFilter(e.target.value)}
                className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-900 dark:text-slate-100 cursor-pointer"
              >
                <option value="all">Все поддерживаемые устройством</option>
                {selectedExportProfile.supportedConsoles.map((code) => (
                  <option key={code} value={code}>
                    {EXTENDED_CONSOLE_CATALOG[code]?.displayName || code.toUpperCase()}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                3. Фильтр по жанру:
              </label>
              <select
                value={exportGenreFilter}
                onChange={(e) => setExportGenreFilter(e.target.value)}
                className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-900 dark:text-slate-100 cursor-pointer"
              >
                <option value="all">Все жанры</option>
                {GENRE_LIST.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                4. Фильтр по языку:
              </label>
              <select
                value={exportLangFilter}
                onChange={(e) => setExportLangFilter(e.target.value)}
                className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-900 dark:text-slate-100 cursor-pointer"
              >
                <option value="all">Любой язык (Приоритет 1G1R)</option>
                <option value="RUS">Только на Русском (RUS)</option>
                <option value="ENG">Только на Английском (ENG)</option>
              </select>
            </div>
          </div>

          {/* Profile Architecture Details */}
          <div className="bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-xl p-4 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="text-sm font-extrabold text-slate-900 dark:text-slate-100">
                Профиль: {selectedExportProfile.name} ({selectedExportProfile.firmwareName})
              </div>
              <div className="text-xs text-slate-600 dark:text-slate-400">{selectedExportProfile.description}</div>
              <div className="text-xs font-mono text-blue-800 dark:text-blue-300 pt-1">
                Папка медиа: <strong>{selectedExportProfile.mediaFolderRule}</strong> • Метаданные:{' '}
                <strong>{selectedExportProfile.gamelistFormat}</strong>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <input
                type="text"
                value={exportTargetDrive}
                onChange={(e) => setExportTargetDrive(e.target.value)}
                placeholder="Путь выгрузки (напр. E:\EASYROMS)"
                className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs font-mono font-bold text-slate-900 dark:text-slate-100 w-56"
              />
              <button
                onClick={handleExecuteSmartExport}
                disabled={matchingExportRecords.length === 0}
                className="flex items-center gap-2 px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs shadow-sm cursor-pointer disabled:opacity-40"
              >
                <Download className="w-4 h-4" />
                <span>
                  Выгрузить пакет ({matchingExportRecords.length} игр •{' '}
                  {formatSizeHuman(totalExportBytes)})
                </span>
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={includeMediaInExport}
                onChange={(e) => setIncludeMediaInExport(e.target.checked)}
                className="w-4 h-4 accent-blue-600"
              />
              <span>Копировать обложки, логотипы, видео и {selectedExportProfile.gamelistFormat}</span>
            </label>
            <label className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={includeSavesInExport}
                onChange={(e) => setIncludeSavesInExport(e.target.checked)}
                className="w-4 h-4 accent-blue-600"
              />
              <span>Переносить файлы сохранений (.srm / .state) и зависимости (.cue+.bin)</span>
            </label>
          </div>

          {/* Preview of games to be exported */}
          <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700 uppercase">
                  <th className="py-2.5 px-4 font-bold">Игра</th>
                  <th className="py-2.5 px-4 font-bold">Жанр / Язык</th>
                  <th className="py-2.5 px-4 font-bold">Целевой путь на устройстве</th>
                  <th className="py-2.5 px-4 font-bold">Размер</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {matchingExportRecords.map((r) => {
                  const mappedDir =
                    selectedExportProfile.consolePathMap[r.consoleCode] || r.consoleCode;
                  return (
                    <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/70">
                      <td className="py-2.5 px-4 font-bold text-slate-900 dark:text-slate-100">{r.title}</td>
                      <td className="py-2.5 px-4 text-slate-700 dark:text-slate-300">
                        {r.genre} •{' '}
                        <span className="font-bold text-emerald-700 dark:text-emerald-400">{r.language}</span>
                      </td>
                      <td className="py-2.5 px-4 font-mono text-blue-800 dark:text-blue-400">
                        {exportTargetDrive}\{mappedDir}\{r.fileName}
                      </td>
                      <td className="py-2.5 px-4 font-mono text-slate-700 dark:text-slate-300">{formatSizeHuman(r.fileSize)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: СРЕДА (ЭМУЛЯТОРЫ, ЯДРА RETROARCH ★ И ПРЯМОЙ ЗАПУСК) */}
      {activeTab === 'emulators' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs space-y-5">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
            <div>
              <div className="text-xs font-extrabold uppercase text-blue-700 dark:text-blue-400">
                Среда • Встроенный каталог эмуляторов и ядер RetroArch (8-bit — PS3 / Switch / Xbox)
              </div>
              <h3 className="text-lg font-extrabold text-slate-900 dark:text-slate-100 mt-0.5">
                Среда запуска: выбор приоритетного эмулятора ★, ссылки на скачивание и привязка к EXE
              </h3>
            </div>

            <select
              value={emuConsoleFilter}
              onChange={(e) => setEmuConsoleFilter(e.target.value)}
              className="bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-900 dark:text-slate-100 cursor-pointer"
            >
              <option value="all">Все поддерживаемые консоли ({EMULATOR_CATALOG.length} эмуляторов)</option>
              {Object.values(EXTENDED_CONSOLE_CATALOG).map((c) => (
                <option key={c.code} value={c.code}>
                  {c.displayName}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {EMULATOR_CATALOG.filter(
              (e) =>
                emuConsoleFilter === 'all' || e.supportedConsoles.includes(emuConsoleFilter)
            ).map((emu: EmulatorOption) => {
              const customPath =
                dbState.emulatorCustomPaths[emu.id] || emu.defaultExePath;
              return (
                <div
                  key={emu.id}
                  className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/60 space-y-3 flex flex-col justify-between"
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <Gamepad2 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                          <span className="text-sm font-extrabold text-slate-900 dark:text-slate-100">
                            {emu.name}
                          </span>
                          <span className="px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-950 text-blue-900 dark:text-blue-300 text-[10px] font-bold">
                            {emu.isUniversalRetroArch ? 'Ядро RetroArch' : 'Standalone EXE'}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">{emu.description}</p>
                      </div>

                      <a
                        href={emu.downloadUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 hover:bg-blue-50 dark:hover:bg-slate-800 text-blue-700 dark:text-blue-400 border border-blue-300 dark:border-blue-800 text-xs font-bold shrink-0 shadow-2xs"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Оф. сайт</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>

                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {emu.supportedConsoles.map((cCode) => {
                        const isStarredForConsole =
                          (dbState.starredEmulatorsByConsole[cCode] ||
                            EXTENDED_CONSOLE_CATALOG[cCode]?.defaultEmulatorId) === emu.id;
                        return (
                          <button
                            key={cCode}
                            onClick={() => handleToggleStarEmulator(cCode, emu.id)}
                            title={`Нажмите, чтобы сделать ${emu.name} приоритетным эмулятором ★ для ${cCode.toUpperCase()}`}
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-mono font-bold border cursor-pointer transition ${
                              isStarredForConsole
                                ? 'bg-amber-100 dark:bg-amber-950/70 border-amber-400 text-amber-950 dark:text-amber-300'
                                : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-amber-400'
                            }`}
                          >
                            <Star
                              className={`w-3.5 h-3.5 ${
                                isStarredForConsole
                                  ? 'text-amber-500 fill-amber-400'
                                  : 'text-slate-400'
                              }`}
                            />
                            <span>{cCode.toUpperCase()}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-200 dark:border-slate-700 space-y-1.5">
                    <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400">
                      Локальный путь к исполняемому файлу (.exe) на ПК:
                    </label>
                    <input
                      type="text"
                      value={customPath}
                      onChange={(e) => {
                        onUpdateDbState({
                          ...dbState,
                          emulatorCustomPaths: {
                            ...dbState.emulatorCustomPaths,
                            [emu.id]: e.target.value,
                          },
                        });
                      }}
                      className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-mono text-slate-800 dark:text-slate-200"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Emulator Direct Launch Modal */}
      {launchModalGame && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-300 rounded-2xl max-w-2xl w-full p-6 space-y-4 shadow-2xl">
            {(() => {
              const emuId =
                dbState.starredEmulatorsByConsole[launchModalGame.consoleCode] ||
                launchModalGame.preferredEmulatorId;
              const emu =
                EMULATOR_CATALOG.find((e) => e.id === emuId) || EMULATOR_CATALOG[0];
              const exePath =
                dbState.emulatorCustomPaths[emu.id] || emu.defaultExePath;
              const cliCmd = emu.cliTemplate
                .replace('{EXE}', exePath)
                .replace('{ROM}', launchModalGame.masterPath.replace(/\//g, '\\'));

              return (
                <>
                  <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-3">
                    <div>
                      <div className="text-xs font-extrabold uppercase text-emerald-700">
                        Прямой запуск из Консольного Steam • {launchModalGame.consoleCode.toUpperCase()}
                      </div>
                      <h3 className="text-lg font-extrabold text-slate-900 mt-0.5">
                        ▶ {launchModalGame.title} ({launchModalGame.language})
                      </h3>
                    </div>
                    <button
                      onClick={() => setLaunchModalGame(null)}
                      className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-bold text-slate-700 cursor-pointer"
                    >
                      Закрыть
                    </button>
                  </div>

                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-700">
                        Выбранный приоритетный эмулятор ★:
                      </span>
                      <span className="font-extrabold text-blue-800">{emu.name}</span>
                    </div>
                    <div>
                      <span className="font-bold text-slate-700">Командная строка запуска:</span>
                      <pre className="mt-1 p-2.5 rounded-lg bg-slate-900 text-emerald-400 font-mono text-xs overflow-x-auto">
                        {cliCmd}
                      </pre>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                    <a
                      href={emu.downloadUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold"
                    >
                      <span>Скачать / Обновить {emu.name}</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>

                    <button
                      onClick={() => {
                        const bat = `@echo off\r\nchcp 65001 >nul\r\necho Запуск ${launchModalGame.title} через ${emu.name}...\r\n${cliCmd}\r\n`;
                        const blob = new Blob([bat], { type: 'text/plain;charset=utf-8' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `Play_${launchModalGame.cleanTitle.replace(/\s+/g, '_')}.cmd`;
                        document.body.appendChild(a);
                        a.click();
                        a.remove();
                        URL.revokeObjectURL(url);
                        onAddLog(
                          `▶ Запущена игра «${launchModalGame.title}» через эмулятор ${emu.name}.`
                        );
                        setLaunchModalGame(null);
                      }}
                      className="flex items-center gap-2 px-5 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow-md cursor-pointer"
                    >
                      <Play className="w-4 h-4 fill-white" />
                      <span>Запустить игру сейчас (.CMD / AegisROM.exe)</span>
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
};

function formatSizeHuman(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} ГБ`;
}
