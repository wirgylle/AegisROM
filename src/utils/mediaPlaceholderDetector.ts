// Smart Scraper Media Verification & Placeholder Stub Detector
// Identifies fake/stub artwork (~1.5 KB placeholders or repeated identical template images/videos across a folder)
// so real existing artwork/videos are skipped cleanly while placeholders & missing assets get re-scraped!
import { tStatic, tfStatic } from '../i18n/translations';

export interface MediaSlotAudit {
  status: 'valid' | 'placeholder' | 'missing';
  reason: string;
  fileName?: string;
  sizeBytes?: number;
}

export interface RomMediaAuditResult {
  image: MediaSlotAudit;
  marquee: MediaSlotAudit;
  video: MediaSlotAudit;
  needsImageScrape: boolean;
  needsMarqueeScrape: boolean;
  needsVideoScrape: boolean;
  isFullyValid: boolean;
  summaryReason: string;
}

export interface FolderMediaSignatureStats {
  signatureCounts: Map<string, number>;
  duplicateStubSignatures: Set<string>;
}

const MIN_REAL_IMAGE_BYTES = 4096; // <= 4 KB (~1.5 KB EmuELEC/R36S stub PNGs) are almost always blank/placeholder tiles
const MIN_REAL_VIDEO_BYTES = 16384; // < 16 KB MP4s cannot contain a genuine gameplay preview video

export async function computeFileQuickSignature(file: File): Promise<string> {
  const headSize = Math.min(32, file.size);
  let hex = '';
  try {
    const slice = file.slice(0, headSize);
    const buf = new Uint8Array(await slice.arrayBuffer());
    for (let i = 0; i < buf.length; i++) {
      hex += buf[i].toString(16).padStart(2, '0');
    }
  } catch {}
  return `${file.size}::${hex}`;
}

/**
 * Scans a console's images/ or videos/ directory once to find repeated identical files
 * (e.g. a scraper saved the exact same 1.5 KB or 8 KB "No Artwork" PNG under 200 different game names).
 */
export async function analyzeMediaDirectorySignatures(
  dirHandle: any
): Promise<FolderMediaSignatureStats> {
  const signatureCounts = new Map<string, number>();
  const duplicateStubSignatures = new Set<string>();
  if (!dirHandle) return { signatureCounts, duplicateStubSignatures };

  try {
    for await (const entry of dirHandle.values()) {
      if (entry.kind !== 'file') continue;
      try {
        const f: File = await entry.getFile();
        if (f.size <= 0) continue;
        // Only inspect suspicious sizes up to 48 KB in detail to stay fast on large libraries
        if (f.size <= 49152) {
          const sig = await computeFileQuickSignature(f);
          const next = (signatureCounts.get(sig) || 0) + 1;
          signatureCounts.set(sig, next);
          if (next >= 3) {
            duplicateStubSignatures.add(sig);
          }
        }
      } catch {}
    }
  } catch {}

  return { signatureCounts, duplicateStubSignatures };
}

export async function inspectExistingMediaFileSlot(
  dirHandle: any,
  candidateNames: string[],
  kind: 'image' | 'marquee' | 'video',
  dirStats?: FolderMediaSignatureStats
): Promise<MediaSlotAudit> {
  if (!dirHandle) {
    return { status: 'missing', reason: tStatic('media.dirMissing') };
  }

  for (const name of candidateNames) {
    try {
      const fh = await dirHandle.getFileHandle(name);
      const f: File = await fh.getFile();
      const sizeBytes = f.size;

      if (sizeBytes === 0) {
        return {
          status: 'placeholder',
          reason: tfStatic('media.emptyStub', { name }),
          fileName: name,
          sizeBytes,
        };
      }

      if (kind === 'video') {
        if (sizeBytes < MIN_REAL_VIDEO_BYTES) {
          return {
            status: 'placeholder',
            reason: tfStatic('media.smallVideo', { kb: (sizeBytes / 1024).toFixed(1) }),
            fileName: name,
            sizeBytes,
          };
        }
        if (dirStats && sizeBytes <= 49152) {
          const sig = await computeFileQuickSignature(f);
          if (dirStats.duplicateStubSignatures.has(sig)) {
            return {
              status: 'placeholder',
              reason: tfStatic('media.dupVideo', { kb: (sizeBytes / 1024).toFixed(1) }),
              fileName: name,
              sizeBytes,
            };
          }
        }
        return {
          status: 'valid',
          reason: tfStatic('media.validVideo', { kb: (sizeBytes / 1024).toFixed(0) }),
          fileName: name,
          sizeBytes,
        };
      }

      // Image / Marquee slot verification
      if (sizeBytes <= MIN_REAL_IMAGE_BYTES) {
        return {
          status: 'placeholder',
          reason: tfStatic('media.stubImage', { kb: (sizeBytes / 1024).toFixed(1) }),
          fileName: name,
          sizeBytes,
        };
      }

      // Validate magic header bytes (PNG / JPG / WEBP / BMP / GIF)
      const hdrBuf = new Uint8Array(await f.slice(0, 12).arrayBuffer());
      const isPng = hdrBuf[0] === 0x89 && hdrBuf[1] === 0x50 && hdrBuf[2] === 0x4e && hdrBuf[3] === 0x47;
      const isJpg = hdrBuf[0] === 0xff && hdrBuf[1] === 0xd8;
      const isBmp = hdrBuf[0] === 0x42 && hdrBuf[1] === 0x4d;
      const isGif = hdrBuf[0] === 0x47 && hdrBuf[1] === 0x49 && hdrBuf[2] === 0x46;
      const isWebp = hdrBuf[0] === 0x52 && hdrBuf[1] === 0x49 && hdrBuf[2] === 0x46 && hdrBuf[3] === 0x46;

      if (!isPng && !isJpg && !isBmp && !isGif && !isWebp) {
        return {
          status: 'placeholder',
          reason: tfStatic('media.corruptImage', { name }),
          fileName: name,
          sizeBytes,
        };
      }

      if (dirStats && sizeBytes <= 49152) {
        const sig = await computeFileQuickSignature(f);
        if (dirStats.duplicateStubSignatures.has(sig)) {
          return {
            status: 'placeholder',
            reason: tfStatic('media.dupImage', { kb: (sizeBytes / 1024).toFixed(1) }),
            fileName: name,
            sizeBytes,
          };
        }
      }

      return {
        status: 'valid',
        reason: tfStatic('media.validImage', { kb: (sizeBytes / 1024).toFixed(1) }),
        fileName: name,
        sizeBytes,
      };
    } catch {}
  }

  return { status: 'missing', reason: tStatic('media.missingFile') };
}

export async function auditRomMediaOnDisk(
  consoleDirHandle: any,
  romBaseNoExt: string,
  cleanTitle: string,
  wantVideo: boolean,
  statsCache?: Map<string, FolderMediaSignatureStats>
): Promise<RomMediaAuditResult> {
  const safeTitle = cleanTitle.replace(/[<>:"/\\|?*]/g, '_').trim();
  const imgCandidates: string[] = [];
  const marqueeCandidates: string[] = [];
  const videoCandidates: string[] = [];

  for (const base of Array.from(new Set([romBaseNoExt, safeTitle].filter(Boolean)))) {
    imgCandidates.push(`${base}-image.png`, `${base}.png`, `${base}-image.jpg`, `${base}.jpg`, `${base}-thumb.png`);
    marqueeCandidates.push(`${base}-marquee.png`, `${base}.png`, `${base}-marquee.jpg`);
    videoCandidates.push(`${base}-video.mp4`, `${base}.mp4`);
  }

  const getDirAndStats = async (folderName: string) => {
    try {
      const dh = await consoleDirHandle.getDirectoryHandle(folderName);
      const cacheKey = `${consoleDirHandle.name || 'root'}::${folderName}`;
      let stats = statsCache?.get(cacheKey);
      if (!stats) {
        stats = await analyzeMediaDirectorySignatures(dh);
        statsCache?.set(cacheKey, stats);
      }
      return { dh, stats };
    } catch {
      return { dh: null, stats: undefined };
    }
  };

  const { dh: imgDir, stats: imgStats } = await getDirAndStats('images');
  const { dh: mDir, stats: mStats } = await getDirAndStats('marquees');
  const { dh: vDir, stats: vStats } = wantVideo ? await getDirAndStats('videos') : { dh: null, stats: undefined };

  const image = await inspectExistingMediaFileSlot(imgDir, imgCandidates, 'image', imgStats);
  const marquee = await inspectExistingMediaFileSlot(mDir, marqueeCandidates, 'marquee', mStats);
  const video: MediaSlotAudit = wantVideo
    ? await inspectExistingMediaFileSlot(vDir, videoCandidates, 'video', vStats)
    : { status: 'valid', reason: tStatic('media.videoDisabled') };

  const needsImageScrape = image.status !== 'valid';
  const needsMarqueeScrape = marquee.status !== 'valid';
  const needsVideoScrape = wantVideo && video.status !== 'valid';
  const isFullyValid = !needsImageScrape && !needsVideoScrape;

  const reasons: string[] = [];
  if (image.status === 'placeholder') reasons.push(tfStatic('media.coverPrefix', { reason: image.reason }));
  if (video.status === 'placeholder') reasons.push(tfStatic('media.videoPrefix', { reason: video.reason }));

  return {
    image,
    marquee,
    video,
    needsImageScrape,
    needsMarqueeScrape,
    needsVideoScrape,
    isFullyValid,
    summaryReason:
      reasons.length > 0
        ? reasons.join(' · ')
        : isFullyValid
        ? tfStatic('media.validSummary', { reason: image.reason })
        : tStatic('media.missingSummary'),
  };
}

/**
 * Verifies that a fetched remote media payload is real artwork/video rather than a 1.5 KB placeholder icon or HTML error.
 */
export function isFetchedMediaPayloadValid(buf: ArrayBuffer, kind: 'image' | 'video'): boolean {
  if (kind === 'video') {
    return buf.byteLength >= MIN_REAL_VIDEO_BYTES;
  }
  if (buf.byteLength <= MIN_REAL_IMAGE_BYTES) {
    return false;
  }
  const u8 = new Uint8Array(buf.slice(0, 12));
  const isPng = u8[0] === 0x89 && u8[1] === 0x50 && u8[2] === 0x4e && u8[3] === 0x47;
  const isJpg = u8[0] === 0xff && u8[1] === 0xd8;
  const isGif = u8[0] === 0x47 && u8[1] === 0x49 && u8[2] === 0x46;
  const isWebp = u8[0] === 0x52 && u8[1] === 0x49 && u8[2] === 0x46 && u8[3] === 0x46;
  return isPng || isJpg || isGif || isWebp;
}
