import type { UnifiedGameRow } from '../components/FigmaConceptStudio';
import type { SavedBuildRecord, SyncDiffEntry } from '../types/aegis';

const SAVED_BUILDS_STORAGE_KEY = 'aegisrom_v5_saved_builds';

/**
 * Produces a normalized comparison key ignoring edition/region/mod/revision tags, numbers, and extensions
 * so different editions (RUS vs USA vs Hack vs Rev 1) of the same game pair cleanly during sync!
 */
export function buildSyncComparisonKey(title: string, fallbackFile = ''): string {
  const raw = (title || fallbackFile || '')
    .replace(/\.[^/.]+$/, '')
    .replace(/^\s*(?:#?\d{1,5}\s*[-._)\]]+\s*|\d{1,5}\s+)/, '')
    .replace(/\[.*?\]|\(.*?\)/g, ' ')
    .replace(/[_.-]+/g, ' ')
    .replace(/\b(rus|russian|eng|usa|eur|europe|jpn|japan|world|mod|hack|redux|rev\s*\d*|v\d+(?:\.\d+)?|disc\s*\d+)\b/gi, ' ')
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]/gi, '');
  return raw || fallbackFile.toLowerCase().replace(/[^a-z0-9а-яё]/gi, '');
}

/**
 * Extracts readable edition signature (region/language, mod/hack/translation, revision, format, CRC32).
 */
export function describeGameEdition(row: UnifiedGameRow): {
  label: string;
  hasModOrHack: boolean;
  normRegion: string;
  ext: string;
  crc: string;
} {
  const combined = `${row.oldFile} ${row.cleanFile} ${row.title} ${row.status || ''}`;
  const lower = combined.toLowerCase();

  const tags: string[] = [];
  const normRegion = (row.region || 'USA').toUpperCase();
  tags.push(normRegion);

  const hasModOrHack =
    /\[(?:hack|mod|t[-+]?rus|rus|homebrew|redux|translate|перевод|мод|хак)/i.test(combined) ||
    /\((?:hack|mod|rus|pirate|unlicensed|bootleg|rev\s*[a-z0-9]+|beta|proto|demo)/i.test(combined) ||
    lower.includes('mod') ||
    lower.includes('hack') ||
    lower.includes('redux') ||
    lower.includes('перевод');

  const bracketMatches = combined.match(/\[[^\]]+\]/g) || [];
  for (const bm of bracketMatches.slice(0, 2)) {
    if (!tags.includes(bm)) tags.push(bm);
  }
  const revMatch = combined.match(/\((Rev\s*[A-Za-z0-9.]+|v\d+(?:\.\d+)?)\)/i);
  if (revMatch) tags.push(revMatch[1]);

  const ext =
    row.sourceExt ||
    (row.cleanFile.includes('.')
      ? row.cleanFile.slice(row.cleanFile.lastIndexOf('.')).toLowerCase()
      : '');
  if (ext) tags.push(ext);

  const crc = (row.crc32 || '').toUpperCase();
  if (crc && crc !== 'A1B2C3D4' && crc !== 'XMLMATCH') {
    tags.push(`CRC:${crc.slice(0, 8)}`);
  }

  return {
    label: tags.join(' · '),
    hasModOrHack,
    normRegion,
    ext,
    crc,
  };
}

/**
 * Compares external source ROMs (USB/SD/folder/cloud JSON) against current Library
 * and returns grouped discrepancies: new ROMs vs different editions (language, mods, format, CRC).
 */
export type SyncTfFn = (
  key: string,
  vars?: Record<string, string | number>,
  fallback?: string
) => string;

const defaultSyncTf: SyncTfFn = (_key, _vars, fallback) => fallback || _key;

export function computeLibrarySyncDiff(
  externalRows: UnifiedGameRow[],
  libraryRows: UnifiedGameRow[],
  tf: SyncTfFn = defaultSyncTf
): SyncDiffEntry[] {
  const libByKey = new Map<string, UnifiedGameRow[]>();
  for (const libRow of libraryRows) {
    const k = `${libRow.consoleShort.toUpperCase()}::${buildSyncComparisonKey(
      libRow.title,
      libRow.cleanFile || libRow.oldFile
    )}`;
    const list = libByKey.get(k) || [];
    list.push(libRow);
    libByKey.set(k, list);
  }

  const matchedLibraryIds = new Set<string>();
  const diffs: SyncDiffEntry[] = [];

  for (let i = 0; i < externalRows.length; i++) {
    const extRow = externalRows[i];
    const cShort = extRow.consoleShort.toUpperCase();
    const compKey = buildSyncComparisonKey(extRow.title, extRow.cleanFile || extRow.oldFile);
    const fullKey = `${cShort}::${compKey}`;
    const extEd = describeGameEdition(extRow);

    const candidates = libByKey.get(fullKey) || [];
    if (candidates.length === 0) {
      diffs.push({
        id: `diff_new_${i}_${extRow.id}`,
        category: 'new_rom',
        comparisonKey: fullKey,
        consoleShort: cShort,
        title: extRow.title,
        externalRow: extRow,
        externalEditionLabel: extEd.label,
        diffReason: tf('sync.reason.missingInLib', { file: extRow.cleanFile || extRow.oldFile }),
        action: 'add',
        selected: true,
      });
      continue;
    }

    // Match against closest candidate in library
    let exactSame = candidates.find((c) => {
      const cEd = describeGameEdition(c);
      const sameCrc = extEd.crc && cEd.crc && extEd.crc === cEd.crc;
      const sameRegion = extEd.normRegion === cEd.normRegion;
      const sameFile =
        (c.cleanFile || c.oldFile).toLowerCase() ===
        (extRow.cleanFile || extRow.oldFile).toLowerCase();
      return (sameCrc && sameRegion) || (sameFile && sameRegion && extEd.ext === cEd.ext);
    });

    if (exactSame) {
      matchedLibraryIds.add(exactSame.id);
      diffs.push({
        id: `diff_eq_${i}_${extRow.id}`,
        category: 'identical',
        comparisonKey: fullKey,
        consoleShort: cShort,
        title: extRow.title,
        externalRow: extRow,
        libraryRow: exactSame,
        externalEditionLabel: extEd.label,
        libraryEditionLabel: describeGameEdition(exactSame).label,
        diffReason: tf('sync.reason.identical'),
        action: 'skip',
        selected: false,
      });
      continue;
    }

    const primaryLib = candidates[0];
    matchedLibraryIds.add(primaryLib.id);
    const libEd = describeGameEdition(primaryLib);

    const reasons: string[] = [];
    if (extEd.normRegion !== libEd.normRegion) {
      reasons.push(tf('sync.reason.regionChanged', { from: libEd.normRegion, to: extEd.normRegion }));
    }
    if (extEd.hasModOrHack !== libEd.hasModOrHack || extEd.hasModOrHack) {
      reasons.push(tf('sync.reason.modDetected'));
    }
    if (extEd.ext && libEd.ext && extEd.ext !== libEd.ext) {
      reasons.push(tf('sync.reason.formatChanged', { from: libEd.ext, to: extEd.ext }));
    }
    if (extEd.crc && libEd.crc && extEd.crc !== libEd.crc) {
      reasons.push(tf('sync.reason.crcChanged', { a: libEd.crc.slice(0, 8), b: extEd.crc.slice(0, 8) }));
    }
    if (reasons.length === 0) {
      reasons.push(tf('sync.reason.fileDiffers', { a: primaryLib.cleanFile, b: extRow.cleanFile }));
    }

    const preferExternal =
      extEd.normRegion === 'RUS' && libEd.normRegion !== 'RUS';

    diffs.push({
      id: `diff_ed_${i}_${extRow.id}`,
      category: 'different_edition',
      comparisonKey: fullKey,
      consoleShort: cShort,
      title: extRow.title,
      externalRow: extRow,
      libraryRow: primaryLib,
      externalEditionLabel: extEd.label,
      libraryEditionLabel: libEd.label,
      diffReason: reasons.join(' • '),
      action: preferExternal ? 'replace_library' : 'keep_both',
      selected: preferExternal,
    });
  }

  for (const libRow of libraryRows) {
    if (!matchedLibraryIds.has(libRow.id)) {
      const cShort = libRow.consoleShort.toUpperCase();
      const compKey = buildSyncComparisonKey(libRow.title, libRow.cleanFile || libRow.oldFile);
      diffs.push({
        id: `diff_libonly_${libRow.id}`,
        category: 'library_only',
        comparisonKey: `${cShort}::${compKey}`,
        consoleShort: cShort,
        title: libRow.title,
        libraryRow: libRow,
        libraryEditionLabel: describeGameEdition(libRow).label,
        diffReason: tf('sync.reason.onlyInLib'),
        action: 'skip',
        selected: false,
      });
    }
  }

  return diffs;
}

/**
 * Compares a saved Build against the current Library to detect any updated ROMs
 * (new language/RUS translation, new mod/hack, updated CRC32/format) that should
 * overwrite/update files at the build's saved `targetPath`.
 */
export function computeBuildSyncDiff(
  build: SavedBuildRecord,
  libraryRows: UnifiedGameRow[],
  tf: SyncTfFn = defaultSyncTf
): SyncDiffEntry[] {
  const libById = new Map<string, UnifiedGameRow>();
  const libByCompKey = new Map<string, UnifiedGameRow[]>();

  for (const r of libraryRows) {
    libById.set(r.id, r);
    const key = `${r.consoleShort.toUpperCase()}::${buildSyncComparisonKey(
      r.title,
      r.cleanFile || r.oldFile
    )}`;
    const arr = libByCompKey.get(key) || [];
    arr.push(r);
    libByCompKey.set(key, arr);
  }

  const diffs: SyncDiffEntry[] = [];
  for (let i = 0; i < build.items.length; i++) {
    const bItem = build.items[i];
    const compKey = `${bItem.consoleShort.toUpperCase()}::${buildSyncComparisonKey(
      bItem.title,
      bItem.cleanFile || bItem.oldFile
    )}`;
    const exactIdHit = libById.get(bItem.gameId);
    const keyHits = libByCompKey.get(compKey) || [];
    const libRow =
      exactIdHit ||
      keyHits.find((r) => r.region?.toUpperCase() === 'RUS') ||
      keyHits[0];

    if (!libRow) continue;

    const libEd = describeGameEdition(libRow);
    const bCrc = (bItem.crc32 || '').toUpperCase();
    const bReg = (bItem.region || 'USA').toUpperCase();
    const libClean = libRow.cleanFile || libRow.oldFile;

    const crcChanged =
      Boolean(bCrc && libEd.crc) &&
      bCrc !== 'A1B2C3D4' &&
      libEd.crc !== 'A1B2C3D4' &&
      bCrc !== libEd.crc;
    const regionChanged = bReg !== libEd.normRegion;
    const fileChanged =
      bItem.cleanFile.toLowerCase() !== libClean.toLowerCase() &&
      bItem.oldFile.toLowerCase() !== (libRow.oldFile || '').toLowerCase();

    if (!crcChanged && !regionChanged && !fileChanged) continue;

    const reasons: string[] = [];
    if (regionChanged) reasons.push(tf('sync.reason.regionChanged', { from: bReg, to: libEd.normRegion }));
    if (crcChanged) reasons.push(tf('sync.reason.crcUpdated', { from: bCrc.slice(0, 8), to: libEd.crc.slice(0, 8) }));
    if (fileChanged) reasons.push(tf('sync.reason.fileInLib', { file: libClean }));

    diffs.push({
      id: `builddiff_${i}_${bItem.gameId}`,
      category: 'different_edition',
      comparisonKey: compKey,
      consoleShort: bItem.consoleShort.toUpperCase(),
      title: bItem.title,
      libraryRow: libRow,
      libraryEditionLabel: libEd.label,
      externalEditionLabel: `${bReg} · ${bItem.targetExt} · ${bCrc.slice(0, 8) || 'N/A'}`,
      diffReason: reasons.join(' • '),
      action: 'update_build',
      selected: true,
      buildTargetPath: bItem.targetPath,
      buildFolderPath: bItem.folderPath,
      buildOldFileName: bItem.targetPath.split('/').pop() || bItem.cleanFile,
      buildTargetExt: bItem.targetExt,
    });
  }

  return diffs;
}

export function loadSavedBuildsLocal(): SavedBuildRecord[] {
  try {
    const raw = localStorage.getItem(SAVED_BUILDS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveSavedBuildsLocal(builds: SavedBuildRecord[]): void {
  try {
    localStorage.setItem(SAVED_BUILDS_STORAGE_KEY, JSON.stringify(builds));
  } catch {}
}

export async function syncSavedBuildsWithServer(
  builds?: SavedBuildRecord[]
): Promise<SavedBuildRecord[]> {
  try {
    if (builds) {
      saveSavedBuildsLocal(builds);
      const resp = await fetch('/api/db/builds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ builds }),
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data?.ok && Array.isArray(data.builds)) {
          saveSavedBuildsLocal(data.builds);
          return data.builds;
        }
      }
      return builds;
    } else {
      const resp = await fetch('/api/db/builds');
      if (resp.ok) {
        const data = await resp.json();
        if (data?.ok && Array.isArray(data.builds) && data.builds.length > 0) {
          saveSavedBuildsLocal(data.builds);
          return data.builds;
        }
      }
    }
  } catch {}
  return loadSavedBuildsLocal();
}
