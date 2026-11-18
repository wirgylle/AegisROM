import { ConsolePlatform } from '../types';
import { PLATFORMS } from '../data/datDatabase';

export function detectPlatformByExtension(filename: string): ConsolePlatform {
  const lower = filename.toLowerCase();
  const ext = '.' + lower.split('.').pop();

  for (const plat of PLATFORMS) {
    if (plat.extensions.includes(ext)) {
      return plat.id;
    }
  }

  // Fallback pattern matching
  if (lower.endsWith('.smc') || lower.endsWith('.sfc')) return 'snes';
  if (lower.endsWith('.nes') || lower.endsWith('.fds')) return 'nes';
  if (lower.endsWith('.md') || lower.endsWith('.gen') || lower.endsWith('.bin')) return 'genesis';
  if (lower.endsWith('.gba')) return 'gba';
  if (lower.endsWith('.gb') || lower.endsWith('.gbc')) return 'gb';
  if (lower.endsWith('.z64') || lower.endsWith('.n64')) return 'n64';
  if (lower.endsWith('.iso') || lower.endsWith('.cue') || lower.endsWith('.chd')) return 'psx';
  if (lower.endsWith('.pce')) return 'pce';

  return 'snes';
}

export function cleanGameTitle(rawName: string): string {
  // Strip extension
  let name = rawName.replace(/\.[^/.]+$/, '');
  // Remove region parentheses like (USA), (Europe), (Japan), (World)
  name = name.replace(/\((USA|Europe|Japan|World|Germany|France|Spain|Italy|En,Fr,De|En,Ja|Asia|Korea|Brazil)\)/gi, '');
  // Remove revision like (Rev 1), (Rev A), (v1.1)
  name = name.replace(/\((Rev [0-9A-Z]+|v[0-9\.]+)\)/gi, '');
  // Remove bracket tags like [!], [b1], [t1], [h1]
  name = name.replace(/\[.*?\]/g, '');
  // Clean separators and underscores
  name = name.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  return name;
}

export function detectRegionFromName(fileName: string): 'USA' | 'Europe' | 'Japan' | 'World' | 'Other' {
  const lower = fileName.toLowerCase();
  if (lower.includes('(usa') || lower.includes('[usa]') || lower.includes('_usa')) return 'USA';
  if (lower.includes('(europe') || lower.includes('[europe]') || lower.includes('(eur')) return 'Europe';
  if (lower.includes('(japan') || lower.includes('[japan]') || lower.includes('(jpn')) return 'Japan';
  if (lower.includes('(world') || lower.includes('[world]')) return 'World';
  return 'Other';
}

export function detectRevisionFromName(fileName: string): string {
  const match = fileName.match(/\((Rev [0-9A-Z]+|v[0-9\.]+)\)/i);
  return match ? match[1] : '';
}

export function isJunkOrBadDump(fileName: string): { isJunk: boolean; reason?: string } {
  const lower = fileName.toLowerCase();
  if (lower.includes('[b]') || lower.includes('[b1]') || lower.includes('[b2]') || lower.includes('(bad)')) {
    return { isJunk: true, reason: 'Bad dump tag [b] found in filename' };
  }
  if (lower.includes('[h]') || lower.includes('[h1]') || lower.includes('(hack)')) {
    return { isJunk: true, reason: 'Unofficial ROM hack tag [h]' };
  }
  if (lower.includes('[t]') || lower.includes('(trainer)')) {
    return { isJunk: true, reason: 'Trained / altered dump [t]' };
  }
  if (lower.includes('(unl)') || lower.includes('(pirate)')) {
    return { isJunk: true, reason: 'Unlicensed bootleg / pirate dump' };
  }
  return { isJunk: false };
}
