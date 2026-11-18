import type { MultiDiscEntry, UnifiedGameRow } from '../components/FigmaConceptStudio';
import { getActiveLanguage, tStatic, tfStatic } from '../i18n/translations';

export interface DiscParseResult {
  discNumber: number | null;
  discTag: string;
  baseNameWithoutDisc: string;
}

const SIDE_LETTER_TO_NUM: Record<string, number> = {
  A: 1,
  B: 2,
  C: 3,
  D: 4,
};

const PAREN_DISC_REGEX =
  /[\(\[]\s*(?:disc|disk|cd|диск|d)\s*[-_.]?\s*(\d{1,2})(?:\s*(?:of|из|\/)\s*\d{1,2})?\s*[\)\]]/gi;
const PAREN_SIDE_REGEX = /[\(\[]\s*side\s*([a-dA-D1-4])\s*[\)\]]/gi;
const INLINE_DISC_REGEX =
  /(?:^|[\s_\-\.])(?:disc|disk|cd|диск)\s*[-_.]?\s*(\d{1,2})(?:\s*(?:of|из|\/)\s*\d{1,2})?(?=$|[\s_\-\.\(\[])/gi;

/**
 * Extracts explicit disc number (1, 2, 3, 4...) and returns the title/stem stripped of disc markers.
 * Carefully avoids false positives on sequel numbers like "Sonic 3", "Tekken 3", "Resident Evil 2", "007".
 */
export function extractDiscNumberAndBaseTitle(rawNameOrTitle: string): DiscParseResult {
  const withoutExt = rawNameOrTitle
    .trim()
    .replace(/\.(chd|iso|bin|cue|img|ccd|sub|mdf|mds|pbp|gdi|cdi|rvz|gcm|cso|m3u|zip|7z)$/i, '');

  let discNumber: number | null = null;
  let stripped = withoutExt;

  const parenMatch = PAREN_DISC_REGEX.exec(stripped);
  PAREN_DISC_REGEX.lastIndex = 0;
  if (parenMatch && parenMatch[1]) {
    const num = parseInt(parenMatch[1], 10);
    if (num >= 1 && num <= 20) {
      discNumber = num;
      stripped = stripped.replace(PAREN_DISC_REGEX, ' ');
    }
  }

  if (discNumber === null) {
    const sideMatch = PAREN_SIDE_REGEX.exec(stripped);
    PAREN_SIDE_REGEX.lastIndex = 0;
    if (sideMatch && sideMatch[1]) {
      const token = sideMatch[1].toUpperCase();
      const num = SIDE_LETTER_TO_NUM[token] ?? parseInt(token, 10);
      if (num >= 1 && num <= 4) {
        discNumber = num;
        stripped = stripped.replace(PAREN_SIDE_REGEX, ' ');
      }
    }
  }

  if (discNumber === null) {
    const inlineMatch = INLINE_DISC_REGEX.exec(stripped);
    INLINE_DISC_REGEX.lastIndex = 0;
    if (inlineMatch && inlineMatch[1]) {
      const num = parseInt(inlineMatch[1], 10);
      if (num >= 1 && num <= 20) {
        discNumber = num;
        stripped = stripped.replace(INLINE_DISC_REGEX, ' ');
      }
    }
  }

  const baseNameWithoutDisc = stripped
    .replace(/\s*[-–—]+\s*$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return {
    discNumber,
    discTag: discNumber ? `(Disc ${discNumber})` : '',
    baseNameWithoutDisc: baseNameWithoutDisc || withoutExt,
  };
}

export function formatRussianDiscCount(count: number): string {
  if (getActiveLanguage() === 'ru') {
    const mod100 = count % 100;
    const mod10 = count % 10;
    if (mod100 >= 11 && mod100 <= 14) return `${count} дисков`;
    if (mod10 === 1) return `${count} диск`;
    if (mod10 >= 2 && mod10 <= 4) return `${count} диска`;
    return `${count} дисков`;
  }
  return tfStatic('lib.multiDiscCount', { count });
}

export function sanitizeFolderSegment(name: string): string {
  return name
    .replace(/[<>:"/\\|?*]/g, ' - ')
    .replace(/\s+/g, ' ')
    .replace(/\.+$/g, '')
    .trim();
}

export function buildMultiDiscFolderName(
  cleanTitle: string,
  regionTag: string,
  isRussian: boolean
): string {
  const { baseNameWithoutDisc } = extractDiscNumberAndBaseTitle(cleanTitle);
  const safeTitle = sanitizeFolderSegment(baseNameWithoutDisc || cleanTitle || 'MultiDisc_Game');
  if (isRussian && !/\((rus|ru)\)/i.test(safeTitle)) {
    return `${safeTitle} (RUS)`;
  }
  const normReg = regionTag.trim();
  if (
    normReg &&
    normReg.toUpperCase() !== 'WORLD' &&
    !new RegExp(`\\(${normReg}\\)`, 'i').test(safeTitle)
  ) {
    return `${safeTitle} (${normReg})`;
  }
  return safeTitle;
}

export function buildDiscTargetFilename(
  baseStemWithoutDisc: string,
  discNumber: number,
  ext: string
): string {
  const cleanStem = sanitizeFolderSegment(
    extractDiscNumberAndBaseTitle(baseStemWithoutDisc).baseNameWithoutDisc
  );
  const dotExt = ext.startsWith('.') ? ext : `.${ext}`;
  return `${cleanStem} (Disc ${discNumber})${dotExt}`;
}

export function generateM3uPlaylistText(discFilenames: string[]): string {
  const lines = discFilenames
    .map((f) => f.replace(/\\/g, '/').trim())
    .filter(Boolean);
  return lines.join('\n') + '\n';
}

export function parseM3uPlaylistLines(m3uContent: string): string[] {
  return m3uContent
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'))
    .map((line) => line.replace(/\\/g, '/'));
}

/**
 * Ensures any array of UnifiedGameRow has collapsed multi-disc rows (in case imported from legacy DB/XML).
 */
export function collapseMultiDiscUnifiedRows(rows: UnifiedGameRow[]): UnifiedGameRow[] {
  const groups = new Map<string, UnifiedGameRow[]>();
  const passthrough: UnifiedGameRow[] = [];

  for (const row of rows) {
    if (row.isMultiDisc && row.discs && row.discs.length > 1) {
      passthrough.push(row);
      continue;
    }
    const rawSource = row.oldFile || row.cleanFile || row.title;
    const { discNumber, baseNameWithoutDisc } = extractDiscNumberAndBaseTitle(rawSource);
    const titleParsed = extractDiscNumberAndBaseTitle(row.title);
    const effectiveDiscNum = discNumber ?? titleParsed.discNumber;

    if (effectiveDiscNum === null) {
      passthrough.push(row);
      continue;
    }

    const cleanBase = sanitizeFolderSegment(titleParsed.baseNameWithoutDisc || baseNameWithoutDisc);
    const normKey = `${row.consoleShort.toUpperCase()}::${cleanBase
      .toLowerCase()
      .replace(/[^a-z0-9а-яё]+/gi, '')}::${(row.region || 'USA').toUpperCase()}`;

    const list = groups.get(normKey) || [];
    list.push({
      ...row,
      title: cleanBase,
      discNumber: effectiveDiscNum,
    });
    groups.set(normKey, list);
  }

  const collapsed: UnifiedGameRow[] = [...passthrough];
  for (const group of groups.values()) {
    if (group.length <= 1) {
      collapsed.push(group[0]);
      continue;
    }

    const sorted = [...group].sort((a, b) => (a.discNumber || 1) - (b.discNumber || 1));
    const first = sorted[0];
    const totalBytes = sorted.reduce((sum, g) => sum + (g.totalBytes || 0), 0);
    const folderName = buildMultiDiscFolderName(
      first.title,
      first.region || 'USA',
      first.region?.toUpperCase() === 'RUS'
    );
    const m3uName = `${folderName}.m3u`;

    const discs: MultiDiscEntry[] = sorted.map((g, idx) => ({
      id: g.id,
      discNumber: g.discNumber || idx + 1,
      title: `${first.title} (Disc ${g.discNumber || idx + 1})`,
      oldFile: g.oldFile,
      cleanFile: g.cleanFile,
      relativePath: g.relativePath,
      size: g.size,
      totalBytes: g.totalBytes,
      crc32: g.crc32,
      sourceExt: g.sourceExt,
      fileObj: g.fileObj,
      companionFiles: g.companionFiles,
      cueText: g.cueText,
    }));

    const sizeLabel =
      totalBytes >= 1024 * 1024 * 1024
        ? `${(totalBytes / (1024 * 1024 * 1024)).toFixed(2)} ${tStatic('size.gb')}`
        : totalBytes > 0
        ? `${(totalBytes / (1024 * 1024)).toFixed(1)} ${tStatic('size.mb')}`
        : first.size;

    const discsLabel = formatRussianDiscCount(discs.length);
    collapsed.push({
      ...first,
      oldFile: `${discs[0].oldFile} (${tfStatic('lib.discsRangeLabel', { count: discs.length })})`,
      cleanFile: `${folderName}/${m3uName} (${discsLabel})`,
      size: sizeLabel,
      totalBytes: totalBytes || first.totalBytes,
      isMultiDisc: true,
      discCount: discs.length,
      multiDiscFolderName: folderName,
      m3uFileName: m3uName,
      discs,
      status: tfStatic('app.multi.inlineBadge', { discs: discsLabel, path: `${folderName}/${m3uName}` }),
    });
  }

  return collapsed;
}
