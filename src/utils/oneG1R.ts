import { RomItem, RegionPriorityConfig, DatEntry } from '../types';
import { BUILTIN_DAT_ENTRIES } from '../data/datDatabase';
import { cleanGameTitle, detectRegionFromName, detectRevisionFromName, isJunkOrBadDump } from './platformDetector';
import { buildRealMetadataForRom } from './libretroScraper';
import { tfStatic } from '../i18n/translations';

export const DEFAULT_1G1R_CONFIG: RegionPriorityConfig = {
  order: ['USA', 'Europe', 'Japan', 'World', 'Other'],
  preferRevisions: true,
  excludeBadDumps: true,
  excludePrototypes: true,
  excludeHacks: true,
  excludeUnlicensed: true,
  excludeTranslations: false,
};

export function process1G1R(
  roms: RomItem[],
  config: RegionPriorityConfig = DEFAULT_1G1R_CONFIG,
  customDatEntries: DatEntry[] = []
): RomItem[] {
  const allDatEntries = [...customDatEntries, ...BUILTIN_DAT_ENTRIES];

  // Build O(1) hash lookup maps
  const crcMap = new Map<string, DatEntry>();
  const sha1Map = new Map<string, DatEntry>();
  for (const entry of allDatEntries) {
    if (entry.crc32) crcMap.set(entry.crc32.toLowerCase(), entry);
    if (entry.sha1) sha1Map.set(entry.sha1.toLowerCase(), entry);
  }

  // Step 1: Match against DAT & compute canonical No-Intro name + Libretro metadata
  const updatedRoms = roms.map((rom) => {
    const crcLow = (rom.crc32 || '').toLowerCase();
    const hdrLow = (rom.headerlessCrc32 || '').toLowerCase();
    const sha1Low = (rom.sha1 || '').toLowerCase();

    const datMatch =
      crcMap.get(crcLow) ||
      (hdrLow ? crcMap.get(hdrLow) : undefined) ||
      (sha1Low ? sha1Map.get(sha1Low) : undefined);

    const effectiveName = rom.archiveEntryName || rom.fileName;
    const junkCheck = isJunkOrBadDump(effectiveName);
    const cleanTitle = datMatch?.parentTitle || cleanGameTitle(effectiveName);
    const region = datMatch?.region || detectRegionFromName(effectiveName);
    const revision = datMatch?.revision || detectRevisionFromName(effectiveName);

    // Determine canonical extension (keep .zip if file on disk is a .zip archive, or use canonical ext)
    const diskExtMatch = rom.fileName.match(/\.[^/.]+$/);
    const diskExt = diskExtMatch ? diskExtMatch[0].toLowerCase() : '.bin';

    let canonicalTargetName: string;
    if (datMatch) {
      if (diskExt === '.zip' && !datMatch.canonicalName.toLowerCase().endsWith('.zip')) {
        canonicalTargetName = datMatch.canonicalName.replace(/\.[^/.]+$/, '.zip');
      } else {
        canonicalTargetName = datMatch.canonicalName;
      }
    } else {
      const regPart = region !== 'Other' ? ` (${region})` : ' (USA)';
      const revPart = revision ? ` (${revision})` : '';
      canonicalTargetName = `${cleanTitle}${regPart}${revPart}${diskExt}`;
    }

    let status = rom.status;
    let quarantineReason: string | undefined = rom.quarantineReason;

    const isProto =
      datMatch?.isPrototype ||
      effectiveName.toLowerCase().includes('(proto') ||
      effectiveName.toLowerCase().includes('(beta');
    const isUnl =
      datMatch?.isUnlicensed ||
      effectiveName.toLowerCase().includes('(unl)') ||
      effectiveName.toLowerCase().includes('(pirate)');

    if ((config.excludeBadDumps && (datMatch?.isBadDump || junkCheck.isJunk)) ||
        (config.excludePrototypes && isProto) ||
        (config.excludeUnlicensed && isUnl)) {
      status = 'junk_bad_dump';
      quarantineReason =
        junkCheck.reason ||
        (isProto ? 'Prototype / Beta build excluded by 1G1R rules' : undefined) ||
        (isUnl ? 'Unlicensed / Bootleg excluded by 1G1R rules' : undefined) ||
        'Flagged as bad dump [b]';
    } else if (rom.fileName !== canonicalTargetName) {
      status = 'renamed';
      quarantineReason = undefined;
    } else {
      status = 'verified';
      quarantineReason = undefined;
    }

    const metadata =
      rom.metadata ||
      buildRealMetadataForRom(
        datMatch?.platform || rom.detectedPlatform,
        datMatch?.canonicalName || canonicalTargetName,
        cleanTitle,
        region
      );

    return {
      ...rom,
      detectedPlatform: datMatch?.platform || rom.detectedPlatform,
      matchedDat: datMatch,
      status,
      suggestedName: canonicalTargetName,
      cloneGroup: cleanTitle,
      quarantineReason,
      metadata,
      is1G1RWinner: status !== 'junk_bad_dump',
    };
  });

  // Step 2: Group by clone group (platform + clean parent game title)
  const groupMap = new Map<string, RomItem[]>();
  for (const rom of updatedRoms) {
    const groupKey = `${rom.detectedPlatform}::${(rom.cloneGroup || rom.fileName).toLowerCase()}`;
    const list = groupMap.get(groupKey) || [];
    list.push(rom);
    groupMap.set(groupKey, list);
  }

  // Step 3: Evaluate 1G1R winners per parent group
  const resultMap = new Map<string, RomItem>();

  for (const [, items] of groupMap.entries()) {
    const validCandidates = items.filter((i) => i.status !== 'junk_bad_dump');

    if (validCandidates.length === 0) {
      items.forEach((i) => resultMap.set(i.id, i));
      continue;
    }

    if (validCandidates.length === 1) {
      const winner = { ...validCandidates[0], is1G1RWinner: true };
      resultMap.set(winner.id, winner);
      items
        .filter((i) => i.status === 'junk_bad_dump')
        .forEach((i) => resultMap.set(i.id, i));
      continue;
    }

    let best = validCandidates[0];
    let bestScore = scoreCandidate(best, config);

    for (let idx = 1; idx < validCandidates.length; idx++) {
      const current = validCandidates[idx];
      const score = scoreCandidate(current, config);
      if (score > bestScore) {
        bestScore = score;
        best = current;
      }
    }

    for (const item of items) {
      if (item.status === 'junk_bad_dump') {
        resultMap.set(item.id, item);
      } else if (item.id === best.id) {
        resultMap.set(item.id, {
          ...item,
          is1G1RWinner: true,
          status: item.fileName === item.suggestedName ? 'verified' : 'renamed',
          quarantineReason: undefined,
        });
      } else {
        resultMap.set(item.id, {
          ...item,
          is1G1RWinner: false,
          status: 'duplicate_clone',
          quarantineReason: tfStatic('oneG1R.dupReason', { primary: best.suggestedName || best.fileName }),
        });
      }
    }
  }

  return updatedRoms.map((r) => resultMap.get(r.id) || r);
}

function scoreCandidate(item: RomItem, config: RegionPriorityConfig): number {
  let score = 0;
  const effectiveName = item.archiveEntryName || item.fileName;
  const region = item.matchedDat?.region || detectRegionFromName(effectiveName);

  const regionIndex = config.order.indexOf(region);
  if (regionIndex !== -1) {
    score += (config.order.length - regionIndex) * 1000;
  } else {
    score += 100;
  }

  if (config.preferRevisions) {
    const rev = item.matchedDat?.revision || detectRevisionFromName(effectiveName);
    if (rev.includes('Rev 2') || rev.includes('Rev B') || rev.includes('v1.2')) score += 50;
    else if (rev.includes('Rev 1') || rev.includes('Rev A') || rev.includes('v1.1')) score += 30;
  }

  if (item.matchedDat) {
    score += 100;
  }

  return score;
}
