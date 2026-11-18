import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  FileCode2,
  CheckSquare,
  Square,
  Search,
  Upload,
  AlertTriangle,
  Sparkles,
  Download,
  X,
  OctagonX,
  Image as ImageIcon,
  Film,
  Cpu,
} from 'lucide-react';
import {
  FACTORY_XML_ENTRIES,
  type XmlGameMappingEntry,
} from '../data/r36sFactoryGamelistMap';
import {
  DEFAULT_FILENAME_CONFIG,
  formatRomStemByConfig,
} from '../utils/filenameConstructor';
import type { FilenameConstructorConfig } from '../types/aegis';
import { useI18n, tStatic } from '../i18n/translations';

export interface ScannedDiskRomBrief {
  fileName: string;
  extractedInternalTitle?: string;
  consoleCode?: string;
}

export interface SelectableXmlMapping extends XmlGameMappingEntry {
  id: string;
  actualDiskFileName: string;
  coreNumberKey: string;
  proposedBaseName: string;
  proposedFileName: string;
  checked: boolean;
  existsInScannedFolder: boolean;
  wasDisambiguated: boolean;
  matchSource: 'xml_and_disk' | 'header_deep' | 'xml_catalog';
}

interface XmlMappingModalProps {
  isOpen: boolean;
  onClose: () => void;
  scannedFileNames: Set<string>;
  scannedDiskRoms?: ScannedDiskRomBrief[];
  filenameConfig?: FilenameConstructorConfig;
  isApplying: boolean;
  progressPct: number;
  onStopApplying: () => void;
  onApplyMappings: (selected: SelectableXmlMapping[], sourceXmlLabel: string) => void;
  onExportBatForMappings: (selected: SelectableXmlMapping[]) => void;
}

function inferRegionTagFromXmlName(rawName: string): string {
  const m = rawName.match(/\((RUS|USA|Europe|EUR|Japan|JPN|World|Ru|En|Fr|De|Es)\)/i);
  if (m) return m[1];
  if (/[а-яА-ЯёЁ]/.test(rawName)) return 'RUS';
  return 'World';
}

function inferBitnessFromConsole(consoleCode?: string): string {
  const c = (consoleCode || 'psx').toLowerCase();
  if (['nes', 'famicom', 'gb', 'gbc', 'sms', 'gamegear', 'pce', 'atari2600'].includes(c)) {
    return '8-bit';
  }
  if (['snes', 'sfc', 'genesis', 'megadrive', 'sega32x', 'segacd', 'neogeo', 'tg16'].includes(c)) {
    return '16-bit';
  }
  return '32-bit';
}

function sanitizeSafeWindowsStem(rawTitle: string): string {
  return rawTitle
    .replace(/[<>:"/\\|?*]/g, ' - ')
    .replace(/\s*\(World\)/gi, '')
    .replace(/\s+/g, ' ')
    .replace(/\.+$/, '')
    .trim();
}

/**
 * Extracts normalized numeric key from filenames like:
 * - "000001.chd" -> "000001"
 * - "000001 (World).chd" -> "000001"
 * - "0001 (World).pbp" -> "000001"
 * - "1 (USA).chd" -> "000001"
 */
export function extractCoreNumberKey(rawNameOrStem: string): string {
  const withoutExt = rawNameOrStem.replace(/\.[^/.]+$/, '').trim();
  const withoutTags = withoutExt
    .replace(/\[.*?\]|\(.*?\)/g, ' ')
    .replace(/^(?:rom|game|track|file|psx|ps1|no|#)[_\-\s]*/i, '')
    .trim();

  if (/^\d{1,10}$/.test(withoutTags)) {
    const num = parseInt(withoutTags, 10);
    if (!Number.isNaN(num) && num >= 0 && num <= 999999) {
      return String(num).padStart(6, '0');
    }
    return withoutTags;
  }
  return withoutTags.toLowerCase();
}

export function buildDisambiguatedXmlMappings(
  rawEntries: XmlGameMappingEntry[],
  scannedLowerNames: Set<string>,
  scannedDiskRoms: ScannedDiskRomBrief[] = [],
  filenameConfig?: FilenameConstructorConfig
): SelectableXmlMapping[] {
  const usedTargetNames = new Map<string, number>();
  const activeCfg = filenameConfig || DEFAULT_FILENAME_CONFIG;

  // Index real scanned ROMs on disk by exact lowercase filename, stem, and deep core number key (e.g. "000001 (World).chd" -> "000001")
  const diskByCoreKey = new Map<string, ScannedDiskRomBrief>();
  const diskByExactLower = new Map<string, ScannedDiskRomBrief>();

  for (const d of scannedDiskRoms) {
    const low = d.fileName.toLowerCase();
    const stemLow = low.replace(/\.[^/.]+$/, '');
    const coreKey = extractCoreNumberKey(d.fileName);
    diskByExactLower.set(low, d);
    diskByExactLower.set(stemLow, d);
    if (coreKey) {
      diskByCoreKey.set(coreKey, d);
    }
  }

  for (const lowName of scannedLowerNames) {
    if (!diskByExactLower.has(lowName)) {
      const synthetic: ScannedDiskRomBrief = { fileName: lowName };
      diskByExactLower.set(lowName, synthetic);
      const coreKey = extractCoreNumberKey(lowName);
      if (coreKey && !diskByCoreKey.has(coreKey)) {
        diskByCoreKey.set(coreKey, synthetic);
      }
    }
  }

  const hasAnyScannedFiles = scannedDiskRoms.length > 0 || scannedLowerNames.size > 0;
  const matchedCoreKeys = new Set<string>();

  const list: SelectableXmlMapping[] = rawEntries.map((entry, idx) => {
    const coreKey = extractCoreNumberKey(entry.fileName || entry.stem);
    const matchedDisk =
      diskByExactLower.get(entry.fileName.toLowerCase()) ||
      diskByExactLower.get(entry.stem.toLowerCase()) ||
      (coreKey ? diskByCoreKey.get(coreKey) : undefined);

    if (matchedDisk && coreKey) {
      matchedCoreKeys.add(coreKey);
    }

    const existsInScanned = Boolean(matchedDisk);
    const actualDiskFileName = matchedDisk?.fileName || entry.fileName;

    const actualDot = actualDiskFileName.lastIndexOf('.');
    const ext =
      actualDot !== -1
        ? actualDiskFileName.slice(actualDot)
        : entry.ext || '.chd';

    const resolvedTitle =
      entry.name && !/^\d+$/.test(entry.name.trim())
        ? entry.name
        : matchedDisk?.extractedInternalTitle || entry.name;

    const cleanStem = sanitizeSafeWindowsStem(resolvedTitle);
    const titleWithoutRegionTag = cleanStem.replace(/\s*\([^)]+\)\s*$/g, '').trim() || cleanStem;
    const regionTag = inferRegionTagFromXmlName(resolvedTitle || actualDiskFileName);
    const consoleTag = matchedDisk?.consoleCode || (entry.genre?.toLowerCase().includes('psx') ? 'psx' : 'psx');
    const constructedStem = filenameConfig
      ? formatRomStemByConfig(
          {
            cleanTitle: titleWithoutRegionTag,
            year: entry.year,
            region: regionTag,
            isRussian: regionTag.toUpperCase() === 'RUS' || regionTag.toUpperCase() === 'RU',
            bitness: inferBitnessFromConsole(consoleTag),
            consoleCode: consoleTag,
            extension: ext,
          },
          activeCfg
        )
      : cleanStem;

    const baseCandidate = constructedStem || cleanStem || entry.stem;
    const lowerTargetKey = `${baseCandidate.toLowerCase()}${ext.toLowerCase()}`;

    const prevCount = usedTargetNames.get(lowerTargetKey) || 0;
    usedTargetNames.set(lowerTargetKey, prevCount + 1);

    let finalBase = baseCandidate;
    let wasDisambiguated = false;
    if (prevCount > 0) {
      finalBase = `${baseCandidate} [${coreKey || entry.stem}]`;
      wasDisambiguated = true;
    }

    const proposedFileName = `${finalBase}${ext}`;
    const isValidRename =
      !entry.isSkippable &&
      finalBase.length >= 2 &&
      proposedFileName.toLowerCase() !== actualDiskFileName.toLowerCase();

    // If user scanned a folder, check ONLY the ROMs that actually exist in the scanned folder!
    // If no folder is scanned yet, check all valid rename entries.
    const defaultChecked = hasAnyScannedFiles
      ? isValidRename && existsInScanned
      : isValidRename;

    return {
      ...entry,
      name: resolvedTitle,
      id: `${entry.fileName}_${idx}`,
      actualDiskFileName,
      coreNumberKey: coreKey,
      proposedBaseName: finalBase,
      proposedFileName,
      checked: defaultChecked,
      existsInScannedFolder: existsInScanned,
      wasDisambiguated,
      matchSource: existsInScanned ? 'xml_and_disk' : 'xml_catalog',
    };
  });

  // Also add any scanned numbered ROMs on disk that were resolved via deep binary header inspection even if not in the loaded XML
  for (const d of scannedDiskRoms) {
    const coreKey = extractCoreNumberKey(d.fileName);
    if (matchedCoreKeys.has(coreKey)) continue;
    if (
      d.extractedInternalTitle &&
      d.extractedInternalTitle.trim().length >= 2 &&
      !/^\d+$/.test(d.extractedInternalTitle.trim())
    ) {
      const dot = d.fileName.lastIndexOf('.');
      const ext = dot !== -1 ? d.fileName.slice(dot) : '.chd';
      const stem = dot !== -1 ? d.fileName.slice(0, dot) : d.fileName;
      const cleanStem = sanitizeSafeWindowsStem(d.extractedInternalTitle);
      if (!cleanStem || cleanStem.toLowerCase() === stem.toLowerCase()) continue;
      const constructedDeep = filenameConfig
        ? formatRomStemByConfig(
            {
              cleanTitle: cleanStem.replace(/\s*\([^)]+\)\s*$/g, '').trim() || cleanStem,
              region: inferRegionTagFromXmlName(d.extractedInternalTitle || d.fileName),
              bitness: inferBitnessFromConsole(d.consoleCode),
              consoleCode: d.consoleCode || 'psx',
              extension: ext,
            },
            activeCfg
          )
        : cleanStem;

      const lowerTargetKey = `${constructedDeep.toLowerCase()}${ext.toLowerCase()}`;
      const prevCount = usedTargetNames.get(lowerTargetKey) || 0;
      usedTargetNames.set(lowerTargetKey, prevCount + 1);

      let finalBase = constructedDeep;
      let wasDisambiguated = false;
      if (prevCount > 0) {
        finalBase = `${constructedDeep} [${coreKey || stem}]`;
        wasDisambiguated = true;
      }

      list.unshift({
        path: `./${d.fileName}`,
        fileName: d.fileName,
        stem,
        ext,
        name: d.extractedInternalTitle,
        image: `./images/${coreKey || stem}.png`,
        video: `./videos/${coreKey || stem}-video.mp4`,
        marquee: `./images/${coreKey || stem}-marquee.png`,
        thumbnail: `./images/${coreKey || stem}-thumb.png`,
        genre: d.consoleCode?.toUpperCase() || 'PSX',
        year: '',
        isSkippable: false,
        id: `deep_hdr_${d.fileName}`,
        actualDiskFileName: d.fileName,
        coreNumberKey: coreKey,
        proposedBaseName: finalBase,
        proposedFileName: `${finalBase}${ext}`,
        checked: true,
        existsInScannedFolder: true,
        wasDisambiguated,
        matchSource: 'header_deep',
      });
    }
  }

  return list;
}

export function parseCustomXmlToMappingEntries(xmlText: string): XmlGameMappingEntry[] {
  const results: XmlGameMappingEntry[] = [];
  const gameBlockRegex = /<game\b[^>]*>([\s\S]*?)<\/game>/gi;
  const extractTag = (block: string, tag: string): string => {
    const m = block.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i'));
    if (!m) return '';
    return m[1]
      .replace(/&amp;/g, '&')
      .replace(/&apos;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .trim();
  };

  let match: RegExpExecArray | null;
  while ((match = gameBlockRegex.exec(xmlText)) !== null) {
    const block = match[1];
    const path = extractTag(block, 'path');
    const name = extractTag(block, 'name');
    if (!path || !name) continue;

    const cleanFile = path.replace(/^\.\/|^\.\\/, '').split(/[\\/]/).pop() || path;
    const dotIdx = cleanFile.lastIndexOf('.');
    const stem = dotIdx !== -1 ? cleanFile.slice(0, dotIdx) : cleanFile;
    const ext = dotIdx !== -1 ? cleanFile.slice(dotIdx) : '';
    const lowerName = name.toLowerCase();
    const lowerExt = ext.toLowerCase();

    const isSkippable =
      lowerName.includes('notgame') ||
      lowerName.includes('pas un jeu') ||
      lowerName === 'gamelist.xml' ||
      ['.srm', '.old', '.sav', '.state', '.xml'].includes(lowerExt) ||
      /^\d+$/.test(name.trim());

    const releasedate = extractTag(block, 'releasedate');

    results.push({
      path,
      fileName: cleanFile,
      stem,
      ext,
      name,
      image: extractTag(block, 'image'),
      video: extractTag(block, 'video'),
      marquee: extractTag(block, 'marquee'),
      thumbnail: extractTag(block, 'thumbnail'),
      genre: extractTag(block, 'genre'),
      year: releasedate.length >= 4 ? releasedate.slice(0, 4) : '',
      isSkippable,
    });
  }

  return results;
}

export function downloadXmlTemplateFile(): void {
  const templateXml = `<?xml version="1.0" encoding="utf-8"?>
<!--
${tStatic('xml.tpl.headerDoc')}
-->
<gameList>
\t<!-- ${tStatic('xml.tpl.example1Comment')} -->
\t<game>
\t\t<path>./000001.chd</path>
\t\t<name>Legacy of Kain - Soul Reaver (RUS)</name>
\t\t<image>./images/000001.png</image>
\t\t<video>./videos/000001-video.mp4</video>
\t\t<marquee>./images/000001-marquee.png</marquee>
\t\t<genre>${tStatic('xml.tpl.example1Genre')}</genre>
\t\t<releasedate>19990816T000000</releasedate>
\t</game>

\t<!-- ${tStatic('xml.tpl.example2Comment')} -->
\t<game>
\t\t<path>./000634.chd</path>
\t\t<name>Tekken 3 (RUS)</name>
\t\t<image>./images/000634.png</image>
\t\t<video>./videos/000634-video.mp4</video>
\t\t<genre>${tStatic('xml.tpl.example2Genre')}</genre>
\t\t<releasedate>19980326T000000</releasedate>
\t</game>

\t<!-- ${tStatic('xml.tpl.example3Comment')} -->
\t<game>
\t\t<path>./Comix_Zone_U_v1.1.md</path>
\t\t<name>Comix Zone (RUS)</name>
\t\t<image>./images/Comix Zone (RUS)-image.png</image>
\t\t<video>./videos/Comix Zone (RUS)-video.mp4</video>
\t\t<genre>${tStatic('xml.tpl.example3Genre')}</genre>
\t\t<releasedate>19950801T000000</releasedate>
\t</game>
</gameList>
`;

  const blob = new Blob([templateXml], { type: 'application/xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'gamelist_template.xml';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

export const XmlMappingModal: React.FC<XmlMappingModalProps> = ({
  isOpen,
  onClose,
  scannedFileNames,
  scannedDiskRoms = [],
  filenameConfig,
  isApplying,
  progressPct,
  onStopApplying,
  onApplyMappings,
  onExportBatForMappings,
}) => {
  const { t, tf } = useI18n();
  const [rawXmlEntries, setRawXmlEntries] = useState<XmlGameMappingEntry[]>(FACTORY_XML_ENTRIES);
  const [customSourceMeta, setCustomSourceMeta] = useState<{ file: string; count: number } | null>(null);
  const sourceXmlName = customSourceMeta
    ? tf('xml.customSourceLabel', { file: customSourceMeta.file, count: customSourceMeta.count })
    : t('xml.builtInSourceLabel');
  const [items, setItems] = useState<SelectableXmlMapping[]>(() =>
    buildDisambiguatedXmlMappings(FACTORY_XML_ENTRIES, scannedFileNames, scannedDiskRoms, filenameConfig)
  );
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterTab, setFilterTab] = useState<
    'all_valid' | 'numbered_only' | 'matched_folder' | 'skipped'
  >('all_valid');

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Rebuild mappings whenever scannedDiskRoms, rawXmlEntries, or filenameConfig change
  useEffect(() => {
    const built = buildDisambiguatedXmlMappings(
      rawXmlEntries,
      scannedFileNames,
      scannedDiskRoms,
      filenameConfig
    );
    setItems(built);
    const matchedCount = built.filter((b) => b.existsInScannedFolder && !b.isSkippable).length;
    if (matchedCount > 0) {
      setFilterTab('matched_folder');
    }
  }, [rawXmlEntries, scannedFileNames, scannedDiskRoms, filenameConfig]);

  const stats = useMemo(() => {
    let validGames = 0;
    let numberedGames = 0;
    let matchedInFolder = 0;
    let skipped = 0;
    let checkedCount = 0;
    let disambiguatedCount = 0;

    for (const it of items) {
      if (it.checked) checkedCount++;
      if (it.wasDisambiguated) disambiguatedCount++;
      if (it.isSkippable) {
        skipped++;
      } else {
        validGames++;
        if (/^\d+$/.test(it.coreNumberKey || it.stem)) numberedGames++;
        if (it.existsInScannedFolder) matchedInFolder++;
      }
    }
    return {
      total: items.length,
      validGames,
      numberedGames,
      matchedInFolder,
      skipped,
      checkedCount,
      disambiguatedCount,
    };
  }, [items]);

  const filteredItems = useMemo(() => {
    return items.filter((it) => {
      if (filterTab === 'all_valid' && it.isSkippable) return false;
      if (
        filterTab === 'numbered_only' &&
        (it.isSkippable || !/^\d+$/.test(it.coreNumberKey || it.stem))
      ) {
        return false;
      }
      if (filterTab === 'matched_folder' && !it.existsInScannedFolder) return false;
      if (filterTab === 'skipped' && !it.isSkippable) return false;

      if (searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase();
        return (
          it.actualDiskFileName.toLowerCase().includes(q) ||
          it.fileName.toLowerCase().includes(q) ||
          it.name.toLowerCase().includes(q) ||
          it.proposedFileName.toLowerCase().includes(q) ||
          it.genre.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [items, filterTab, searchQuery]);

  if (!isOpen) return null;

  const handleToggleItem = (id: string) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, checked: !it.checked } : it)));
  };

  const handleSelectAllFiltered = (checked: boolean) => {
    const visibleIds = new Set(filteredItems.map((f) => f.id));
    setItems((prev) =>
      prev.map((it) => {
        if (!visibleIds.has(it.id)) return it;
        if (checked && it.isSkippable) return it;
        return { ...it, checked };
      })
    );
  };

  const handleSelectMatchedOnly = () => {
    setItems((prev) =>
      prev.map((it) => ({
        ...it,
        checked: !it.isSkippable && it.existsInScannedFolder,
      }))
    );
  };

  const handleCustomXmlUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const txt = await f.text();
      const parsed = parseCustomXmlToMappingEntries(txt);
      if (parsed.length > 0) {
        setRawXmlEntries(parsed);
        setCustomSourceMeta({ file: f.name, count: parsed.length });
      }
    } catch {}
    e.target.value = '';
  };

  const handleResetToFactoryXml = () => {
    setRawXmlEntries(FACTORY_XML_ENTRIES);
    setCustomSourceMeta(null);
  };

  const selectedList = items.filter((it) => it.checked && !it.isSkippable);

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
      <div className="bg-white border border-slate-300 rounded-2xl max-w-6xl w-full p-6 space-y-4 shadow-2xl max-h-[92vh] flex flex-col">
        <input
          ref={fileInputRef}
          type="file"
          accept=".xml"
          onChange={handleCustomXmlUpload}
          className="hidden"
        />

        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2.5 py-0.5 rounded-md bg-blue-100 text-blue-900 font-bold text-xs border border-blue-300">
                {t('xml.headerVersionBadge')}
              </span>
              <span className="px-2.5 py-0.5 rounded-md bg-emerald-100 text-emerald-900 font-bold text-xs border border-emerald-300">
                {t('xml.headerWorldBadge')}
              </span>
            </div>
            <h3 className="text-xl font-extrabold text-slate-900">
              {t('xml.title')} ({sourceXmlName})
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              {t('xml.subtitle')} · {t('xml.hint')}
            </p>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer shrink-0"
            title={t('xml.close')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Prominent XML File Picker Bar */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold shadow-xs cursor-pointer transition"
            >
              <Upload className="w-4 h-4" />
              <span>📂 {t('xml.pickFileBtn')}</span>
            </button>

            <button
              onClick={handleResetToFactoryXml}
              className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 text-xs font-bold cursor-pointer transition"
            >
              <FileCode2 className="w-4 h-4 text-blue-700" />
              <span>{t('xml.presetR36sBtn')}</span>
            </button>

            <button
              onClick={downloadXmlTemplateFile}
              className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-300 text-xs font-extrabold cursor-pointer transition"
            >
              <Download className="w-4 h-4 text-emerald-700" />
              <span>📄 {t('xml.sampleBtn')}</span>
            </button>
          </div>

          <div className="relative w-full md:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('xml.searchPh')}
              className="w-full bg-white border border-slate-300 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-900 font-semibold focus:outline-none focus:border-blue-600"
            />
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {stats.matchedInFolder > 0 && (
              <button
                onClick={() => setFilterTab('matched_folder')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold border transition cursor-pointer ${
                  filterTab === 'matched_folder'
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-emerald-50 text-emerald-900 border-emerald-300 hover:bg-emerald-100'
                }`}
              >
                {tf('xml.tab.matchedFolder', { count: stats.matchedInFolder })}
              </button>
            )}

            <button
              onClick={() => setFilterTab('all_valid')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold border transition cursor-pointer ${
                filterTab === 'all_valid'
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100'
              }`}
            >
              {tf('xml.tab.allValid', { count: stats.validGames })}
            </button>

            <button
              onClick={() => setFilterTab('numbered_only')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold border transition cursor-pointer ${
                filterTab === 'numbered_only'
                  ? 'bg-sky-600 text-white border-sky-600'
                  : 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100'
              }`}
            >
              {tf('xml.tab.numberedOnly', { count: stats.numberedGames })}
            </button>

            <button
              onClick={() => setFilterTab('skipped')}
              title={t('xml.tab.skippedTip')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold border transition cursor-pointer ${
                filterTab === 'skipped'
                  ? 'bg-amber-600 text-white border-amber-600'
                  : 'bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100'
              }`}
            >
              {tf('xml.tab.skipped', { count: stats.skipped })}
            </button>
          </div>

          <div className="text-xs font-bold text-slate-600">
            {t('xml.checkedForRename')} <span className="text-blue-700">{selectedList.length}</span>
          </div>
        </div>

        {/* Table of XML & Deep Header Mappings with Checkboxes */}
        <div className="flex-1 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-200 bg-slate-50 min-h-[280px]">
          {filteredItems.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-600">
              {t('xml.noPreviewRows')}
            </div>
          ) : (
            filteredItems.map((it) => (
              <label
                key={it.id}
                onClick={() => handleToggleItem(it.id)}
                className={`flex items-start gap-3.5 p-3.5 transition cursor-pointer select-none ${
                  it.checked ? 'bg-white hover:bg-blue-50/50' : 'bg-slate-50/80 hover:bg-slate-100/70'
                }`}
              >
                <button
                  type="button"
                  className="mt-0.5 shrink-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggleItem(it.id);
                  }}
                >
                  {it.checked ? (
                    <CheckSquare className="w-5 h-5 text-blue-600" />
                  ) : (
                    <Square className="w-5 h-5 text-slate-400" />
                  )}
                </button>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className="font-mono font-extrabold text-rose-700 text-sm bg-rose-50 border border-rose-200 px-2 py-0.5 rounded"
                        title={it.actualDiskFileName}
                      >
                        {it.actualDiskFileName}
                      </span>
                      <span className="text-slate-400 font-bold">&rarr;</span>
                      <span
                        className="font-mono font-extrabold text-emerald-800 text-sm bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded"
                        title={it.proposedFileName}
                      >
                        {it.proposedFileName}
                      </span>

                      {it.existsInScannedFolder && (
                        <span className="px-2 py-0.5 text-[11px] font-bold bg-emerald-100 text-emerald-900 border border-emerald-300 rounded">
                          ✔ {t('xml.row.matchedFolder')}
                        </span>
                      )}

                      {it.matchSource === 'header_deep' && (
                        <span className="px-2 py-0.5 text-[11px] font-bold bg-sky-100 text-sky-900 border border-sky-300 rounded flex items-center gap-1">
                          <Cpu className="w-3 h-3" /> {t('xml.row.fromHeader')}
                        </span>
                      )}

                      {it.wasDisambiguated && (
                        <span
                          className="px-2 py-0.5 text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300 rounded"
                          title={t('xml.row.dupGuardTip')}
                        >
                          {t('xml.row.dupGuard')} [{it.coreNumberKey || it.stem}]
                        </span>
                      )}

                      {it.isSkippable && (
                        <span className="px-2 py-0.5 text-[11px] font-bold bg-rose-100 text-rose-900 border border-rose-300 rounded flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" /> {t('xml.row.serviceFile')}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 text-xs text-slate-500 font-mono">
                      {it.genre && <span>{it.genre}</span>}
                      {it.year && <span>• {it.year}</span>}
                    </div>
                  </div>

                  {/* Associated Media Paths */}
                  <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-slate-600 font-mono">
                    {it.image && (
                      <span
                        className="inline-flex items-center gap-1 text-emerald-700"
                        title={t('xml.mediaBoxTip')}
                      >
                        <ImageIcon className="w-3.5 h-3.5" />
                        ./images/{it.coreNumberKey || it.stem}.png &rarr; ./images/{it.proposedBaseName}.png
                      </span>
                    )}
                    {it.marquee && (
                      <span className="inline-flex items-center gap-1 text-amber-700">
                        • marquee: ./images/{it.proposedBaseName}-marquee.png
                      </span>
                    )}
                    {it.video && (
                      <span
                        className="inline-flex items-center gap-1 text-blue-700"
                        title={t('xml.mediaVideoTip')}
                      >
                        <Film className="w-3.5 h-3.5" />
                        ./videos/{it.proposedBaseName}-video.mp4
                      </span>
                    )}
                  </div>
                </div>
              </label>
            ))
          )}
        </div>

        {/* Footer Actions: Select All / Deselect All / STOP / Apply */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-200">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => handleSelectAllFiltered(true)}
              disabled={isApplying}
              className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-300 text-xs font-bold text-slate-800 cursor-pointer disabled:opacity-50"
            >
              {t('xml.selectAllMatchedBtn')} ({filteredItems.filter((i) => !i.isSkippable).length})
            </button>
            <button
              onClick={() => handleSelectAllFiltered(false)}
              disabled={isApplying}
              className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-300 text-xs font-bold text-slate-800 cursor-pointer disabled:opacity-50"
            >
              {t('xml.unselectAllBtn')}
            </button>
            {stats.matchedInFolder > 0 && (
              <button
                onClick={handleSelectMatchedOnly}
                disabled={isApplying}
                className="px-3.5 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-xs font-bold text-emerald-900 cursor-pointer disabled:opacity-50"
              >
                {tf('xml.selectMatchedOnlyBtn', { count: stats.matchedInFolder })}
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {isApplying && (
              <button
                onClick={onStopApplying}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs shadow-md cursor-pointer animate-pulse"
              >
                <OctagonX className="w-4 h-4" />
                <span>{tf('xml.stopPctBtn', { pct: progressPct })}</span>
              </button>
            )}

            <button
              onClick={() => onExportBatForMappings(selectedList)}
              disabled={selectedList.length === 0 || isApplying}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm cursor-pointer disabled:opacity-40"
            >
              <Download className="w-4 h-4" />
              <span>{tf('xml.exportCmdBtn', { count: selectedList.length })}</span>
            </button>

            <button
              onClick={() => onApplyMappings(selectedList, sourceXmlName)}
              disabled={selectedList.length === 0 || isApplying}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs shadow-md cursor-pointer disabled:opacity-40"
            >
              <Sparkles className="w-4 h-4" />
              <span>
                {isApplying
                  ? tf('xml.renamingPctBtn', { pct: progressPct })
                  : tf('xml.applyBtn', { count: selectedList.length })}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
