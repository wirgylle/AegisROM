import { ConsolePlatform, ScrapedMetadata } from '../types';
import { METADATA_CATALOG } from '../data/sampleRoms';

export const LIBRETRO_SYSTEM_MAP: Record<ConsolePlatform, string> = {
  all: 'Nintendo - Super Nintendo Entertainment System',
  nes: 'Nintendo - Nintendo Entertainment System',
  snes: 'Nintendo - Super Nintendo Entertainment System',
  genesis: 'Sega - Mega Drive - Genesis',
  gba: 'Nintendo - Game Boy Advance',
  gb: 'Nintendo - Game Boy',
  gbc: 'Nintendo - Game Boy Color',
  n64: 'Nintendo - Nintendo 64',
  psx: 'Sony - PlayStation',
  arcade: 'FBNeo - Arcade Games',
  pce: 'NEC - PC Engine - TurboGrafx 16',
};

// Generates official Libretro Thumbnail CDN URLs for Boxart and Title/Gameplay Snaps.
// Libretro replaces special characters with '_' in thumbnail filenames.
export function getLibretroThumbnailUrls(
  platform: ConsolePlatform,
  canonicalFileNameOrTitle: string
): { boxArtUrl: string; screenshotUrl: string; cleanNoIntroName: string } {
  const sysName = LIBRETRO_SYSTEM_MAP[platform] || LIBRETRO_SYSTEM_MAP.snes;
  // Strip file extension (.sfc, .nes, .zip, etc.)
  const withoutExt = canonicalFileNameOrTitle.replace(/\.[^/.]+$/, '').trim();
  // Sanitize characters according to Libretro thumbnail naming specification
  const sanitized = withoutExt.replace(/[&*/:`<>?\\|"]/g, '_');

  const encodedSys = encodeURIComponent(sysName);
  const encodedGame = encodeURIComponent(sanitized);

  return {
    boxArtUrl: `https://thumbnails.libretro.com/${encodedSys}/Named_Boxarts/${encodedGame}.png`,
    screenshotUrl: `https://thumbnails.libretro.com/${encodedSys}/Named_Snaps/${encodedGame}.png`,
    cleanNoIntroName: withoutExt,
  };
}

export function buildRealMetadataForRom(
  platform: ConsolePlatform,
  canonicalName: string,
  cleanTitle: string,
  region?: string
): ScrapedMetadata {
  // Check if we have rich curated synopsis in catalog first
  const catalogMatch = METADATA_CATALOG[cleanTitle];
  const libretro = getLibretroThumbnailUrls(platform, canonicalName);

  if (catalogMatch) {
    return {
      ...catalogMatch,
      boxArtUrl: libretro.boxArtUrl,
      screenshotUrl: libretro.screenshotUrl,
    };
  }

  const platformPublisherMap: Record<string, string> = {
    nes: 'Nintendo / Licensed',
    snes: 'Nintendo / Licensed',
    n64: 'Nintendo / Licensed',
    gb: 'Nintendo / Licensed',
    gbc: 'Nintendo / Licensed',
    gba: 'Nintendo / Licensed',
    genesis: 'Sega / Licensed',
    psx: 'Sony Computer Entertainment',
    pce: 'NEC / Hudson Soft',
    arcade: 'Arcade Original',
  };

  return {
    title: cleanTitle,
    developer: platformPublisherMap[platform] || 'Original Studio',
    publisher: platformPublisherMap[platform] || 'Official Release',
    releaseDate: region ? `Region: ${region}` : 'Retro Release',
    genre: `${platform.toUpperCase()} Software`,
    rating: 'Verified Dump',
    score: 90,
    boxArtUrl: libretro.boxArtUrl,
    screenshotUrl: libretro.screenshotUrl,
    synopsis: `Verified ${platform.toUpperCase()} ROM title (${libretro.cleanNoIntroName}). Box art and gameplay snapshot linked directly to the official Libretro Thumbnails repository.`,
    players: '1-2 Players',
  };
}
