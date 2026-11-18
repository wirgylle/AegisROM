import { ConsolePlatform, DatEntry } from '../types';
import { cleanGameTitle, detectPlatformByExtension, detectRegionFromName, detectRevisionFromName } from './platformDetector';

/**
 * Parses both Logiqx XML (.dat / .xml) and Clrmamepro (.dat) files into DatEntry records.
 */
export function parseDatFileContent(
  content: string,
  overridePlatform?: ConsolePlatform
): DatEntry[] {
  const entries: DatEntry[] = [];
  const trimmed = content.trim();

  // Detect XML vs Clrmamepro format
  if (trimmed.startsWith('<') || trimmed.includes('<datafile') || trimmed.includes('<game')) {
    // Parse XML DAT
    let detectedPlatform: ConsolePlatform = overridePlatform && overridePlatform !== 'all' ? overridePlatform : 'snes';
    const headerMatch = content.match(/<name>([\s\S]*?)<\/name>/i);
    if (headerMatch && (!overridePlatform || overridePlatform === 'all')) {
      detectedPlatform = inferPlatformFromHeaderName(headerMatch[1]);
    }

    const gameRegex = /<(?:game|machine)\s+name="([^"]+)"[^>]*>([\s\S]*?)<\/(?:game|machine)>/gi;
    let gameMatch: RegExpExecArray | null;
    let idx = 0;

    while ((gameMatch = gameRegex.exec(content)) !== null) {
      const gameName = decodeXmlEntities(gameMatch[1]);
      const gameBody = gameMatch[2];
      const cloneOfMatch = gameMatch[0].match(/cloneof="([^"]+)"/i);

      const romRegex = /<rom\s+([^>]+)\/?>/gi;
      let romMatch: RegExpExecArray | null;
      while ((romMatch = romRegex.exec(gameBody)) !== null) {
        const attrs = romMatch[1];
        const romName = extractXmlAttr(attrs, 'name') || `${gameName}.bin`;
        const sizeStr = extractXmlAttr(attrs, 'size') || '0';
        const crc = (extractXmlAttr(attrs, 'crc') || '').toLowerCase();
        const md5 = (extractXmlAttr(attrs, 'md5') || '').toLowerCase();
        const sha1 = (extractXmlAttr(attrs, 'sha1') || '').toLowerCase();
        const statusAttr = extractXmlAttr(attrs, 'status') || '';

        if (!crc && !sha1 && !md5) continue;

        const plat =
          overridePlatform && overridePlatform !== 'all'
            ? overridePlatform
            : detectPlatformByExtension(romName) || detectedPlatform;

        const parentTitle = cloneOfMatch ? decodeXmlEntities(cloneOfMatch[1]) : cleanGameTitle(gameName);
        const region = detectRegionFromName(gameName);
        const revision = detectRevisionFromName(gameName);

        entries.push({
          id: `custom-xml-${idx++}-${crc}`,
          title: cleanGameTitle(gameName),
          canonicalName: romName,
          platform: plat,
          crc32: crc,
          md5,
          sha1,
          size: parseInt(sizeStr, 10) || 0,
          region,
          parentTitle,
          revision,
          isBadDump: statusAttr === 'baddump' || gameName.includes('[b]'),
          isPrototype: gameName.toLowerCase().includes('(proto') || gameName.toLowerCase().includes('(beta'),
          isUnlicensed: gameName.toLowerCase().includes('(unl)') || gameName.toLowerCase().includes('(pirate)'),
        });
      }
    }
  } else {
    // Parse Clrmamepro format: game ( name "..." rom ( name "..." size 123 crc abcdef12 ... ) )
    const gameBlockRegex = /game\s*\(([\s\S]*?)\n\)/gi;
    let blockMatch: RegExpExecArray | null;
    let idx = 0;

    while ((blockMatch = gameBlockRegex.exec(content)) !== null) {
      const block = blockMatch[1];
      const nameMatch = block.match(/name\s+"([^"]+)"/i);
      const gameName = nameMatch ? nameMatch[1] : `Unknown_${idx}`;

      const romBlockMatch = block.match(/rom\s*\(([^)]+)\)/i);
      if (!romBlockMatch) continue;
      const romLine = romBlockMatch[1];

      const romNameMatch = romLine.match(/name\s+"([^"]+)"/i);
      const sizeMatch = romLine.match(/size\s+(\d+)/i);
      const crcMatch = romLine.match(/crc\s+([0-9a-fA-F]{8})/i);
      const md5Match = romLine.match(/md5\s+([0-9a-fA-F]{32})/i);
      const sha1Match = romLine.match(/sha1\s+([0-9a-fA-F]{40})/i);

      if (!crcMatch && !sha1Match) continue;

      const romName = romNameMatch ? romNameMatch[1] : gameName;
      const crc = crcMatch ? crcMatch[1].toLowerCase() : '';
      const plat =
        overridePlatform && overridePlatform !== 'all'
          ? overridePlatform
          : detectPlatformByExtension(romName);

      entries.push({
        id: `custom-cmp-${idx++}-${crc}`,
        title: cleanGameTitle(gameName),
        canonicalName: romName,
        platform: plat,
        crc32: crc,
        md5: md5Match ? md5Match[1].toLowerCase() : '',
        sha1: sha1Match ? sha1Match[1].toLowerCase() : '',
        size: sizeMatch ? parseInt(sizeMatch[1], 10) : 0,
        region: detectRegionFromName(gameName),
        parentTitle: cleanGameTitle(gameName),
        revision: detectRevisionFromName(gameName),
        isBadDump: gameName.includes('[b]'),
      });
    }
  }

  return entries;
}

function extractXmlAttr(attrString: string, attrName: string): string {
  const regex = new RegExp(`${attrName}="([^"]*)"`, 'i');
  const m = attrString.match(regex);
  return m ? decodeXmlEntities(m[1]) : '';
}

function decodeXmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function inferPlatformFromHeaderName(headerName: string): ConsolePlatform {
  const low = headerName.toLowerCase();
  if (low.includes('super nintendo') || low.includes('snes') || low.includes('super famicom')) return 'snes';
  if (low.includes('nintendo entertainment system') || low.includes('famicom')) return 'nes';
  if (low.includes('mega drive') || low.includes('genesis')) return 'genesis';
  if (low.includes('game boy advance') || low.includes('gba')) return 'gba';
  if (low.includes('game boy color') || low.includes('gbc')) return 'gbc';
  if (low.includes('game boy')) return 'gb';
  if (low.includes('nintendo 64') || low.includes('n64')) return 'n64';
  if (low.includes('playstation') || low.includes('psx')) return 'psx';
  if (low.includes('pc engine') || low.includes('turbografx')) return 'pce';
  return 'snes';
}
