import type { PortMasterGame } from '../types/aegis';
import { tfStatic } from '../i18n/translations';

/**
 * Infers the exact subfolder inside ports/ where user's game data/assets must be placed
 * based on PortMaster's `items` and `inst` instructions.
 */
export type TfFn = (
  key: string,
  vars?: Record<string, string | number>,
  fallback?: string
) => string;

const defaultTf: TfFn = tfStatic;

export function inferPortMasterRequiredPath(
  slug: string,
  items: string[] = [],
  inst = '',
  tf: TfFn = defaultTf
): { targetPath: string; hint: string } {
  const cleanSlug = slug.replace(/\.zip$/i, '');
  const folderItem =
    items.find((it) => it.endsWith('/'))?.replace(/\/+$/, '') || cleanSlug;

  // Check explicit folder references in PortMaster instructions like `ports/stardewvalley/gamedata` or `ports/Half-Life/valve`
  const explicitMatch = inst.match(
    /(?:ports|roms\/ports)\/([A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)+)/i
  );
  if (explicitMatch && explicitMatch[1]) {
    const rel = explicitMatch[1].replace(/\/+$/, '');
    return {
      targetPath: `ports/${rel}`,
      hint: tf('pm.engine.copyHint', { path: `ports/${rel}` }, `Copy original game files into ports/${rel}/`),
    };
  }

  // Check named subfolder instructions like "copy to the gamedata folder" or "in ports/X/assets"
  const subDirKeywords = ['gamedata', 'assets', 'data', 'valve', 'iwads', 'mods', 'game', 'files'];
  const lowInst = inst.toLowerCase();
  for (const kw of subDirKeywords) {
    if (
      lowInst.includes(`/${kw}`) ||
      lowInst.includes(`'${kw}'`) ||
      lowInst.includes(`"${kw}"`) ||
      lowInst.includes(` ${kw} folder`) ||
      lowInst.includes(` ${kw} directory`)
    ) {
      return {
        targetPath: `ports/${folderItem}/${kw}`,
        hint: tf('pm.engine.copySubHint', { path: `ports/${folderItem}/${kw}` }, `Place required game files into subfolder ports/${folderItem}/${kw}/`),
      };
    }
  }

  return {
    targetPath: `ports/${folderItem}`,
    hint: tf('pm.engine.checkGuideHint', { path: `ports/${folderItem}` }, `Place required game files (or check instructions) in ports/${folderItem}/`),
  };
}

/**
 * Formats PortMaster's `avail` dictionary into readable handheld console labels.
 */
export function formatPortMasterAvailConsoles(availRaw: Record<string, any> | string[] = {}): string[] {
  const keys = Array.isArray(availRaw) ? availRaw : Object.keys(availRaw || {});
  if (keys.length === 0) return ['R36S (ArkOS)', 'Anbernic (MuOS/Knulli)', 'TrimUI', 'ROCKNIX'];

  const labelMap: Array<{ match: RegExp; label: string }> = [
    { match: /r36s|arkos|amberelec/i, label: 'R36S (ArkOS / AmberELEC)' },
    { match: /rg35|rg40|rg28|anbernic|muos/i, label: 'Anbernic (MuOS / Knulli)' },
    { match: /trimui/i, label: 'TrimUI Smart Pro' },
    { match: /rgb30|powkiddy/i, label: 'PowKiddy RGB30 / JELOS' },
    { match: /rocknix|jelos/i, label: 'ROCKNIX / JELOS' },
    { match: /knulli|batocera/i, label: 'Knulli / Batocera' },
    { match: /aarch64|armhf/i, label: 'Linux ARM64 Handhelds' },
  ];

  const out = new Set<string>();
  for (const k of keys) {
    let matched = false;
    for (const rule of labelMap) {
      if (rule.match.test(k)) {
        out.add(rule.label);
        matched = true;
      }
    }
    if (!matched && keys.length <= 6) {
      out.add(k);
    }
  }
  if (out.size === 0) {
    out.add('R36S / ArkOS');
    out.add('Anbernic MuOS / Knulli');
    out.add('ROCKNIX');
  }
  return Array.from(out);
}

/**
 * Resolves the root ports folder inside a build target profile so PortMaster games
 * sit in the exact expected directory on each console OS.
 */
export function resolvePortMasterRootDirForProfile(
  targetProfileId: string,
  tf: TfFn = defaultTf
): {
  portsRoot: string;
  consoleLaunchNote: string;
} {
  switch (targetProfileId) {
    case 'r36s_arkos':
      return {
        portsRoot: 'ports',
        consoleLaunchNote: tf(
          'pm.engine.noteR36s',
          undefined,
          'R36S (ArkOS / AmberELEC): copy ports/ to the root of EASYROMS (next to psx, gba, megadrive).'
        ),
      };
    case 'miyoo_anbernic':
      return {
        portsRoot: 'ROMS/ports',
        consoleLaunchNote: tf(
          'pm.engine.noteMuos',
          undefined,
          'Anbernic RG35XX/40XX (MuOS / Knulli) & Miyoo: ROMS/ports/ on SD card. Refresh Gamelists if needed.'
        ),
      };
    case 'steamdeck_emudeck':
      return {
        portsRoot: 'roms/ports',
        consoleLaunchNote: tf(
          'pm.engine.noteSteamDeck',
          undefined,
          'Steam Deck / Batocera / ROCKNIX / EmuDeck: roms/ports/. Ensure .sh script has executable flag (chmod +x).'
        ),
      };
    default:
      return {
        portsRoot: 'ports',
        consoleLaunchNote: tf(
          'pm.engine.noteDefault',
          undefined,
          'Portable Linux handhelds with PortMaster: copy contents to ports/ on SD card and refresh list.'
        ),
      };
  }
}

export interface ConsoleGuideItem {
  id: string;
  consoleName: string;
  osName: string;
  portsPath: string;
  steps: string[];
}

export function getConsolePortMasterGuides(
  port: PortMasterGame,
  tf: TfFn = defaultTf
): ConsoleGuideItem[] {
  const targetSub = port.requiredDataTargetPath.replace(/^ports\//i, '');
  const shFile = port.items.find((i) => i.toLowerCase().endsWith('.sh')) || `${port.slug}.sh`;
  const runtimeStr = port.runtime.length > 0 ? port.runtime.join(', ') : 'PortMaster runtime';
  const depsStr = port.requirements.length > 0 ? port.requirements.join(', ') : 'gptokeyb / runtime';

  return [
    {
      id: 'r36s',
      consoleName: 'R36S / R36H',
      osName: 'ArkOS / AmberELEC / DarkOS',
      portsPath: `EASYROMS/ports/`,
      steps: [
        tf('pm.engine.guideR36sStep1', { id: port.id, sh: shFile, slug: port.slug }),
        port.readyToRun
          ? tf('pm.engine.guideR36sStep2Rtr')
          : tf('pm.engine.guideR36sStep2Data', { sub: targetSub }),
        tf('pm.engine.guideR36sStep3', { runtime: runtimeStr }),
        tf('pm.engine.guideR36sStep4', { title: port.title }),
      ],
    },
    {
      id: 'anbernic_muos',
      consoleName: 'Anbernic RG35XX Plus / H / SP / RG40XX',
      osName: 'MuOS / Knulli (Batocera)',
      portsPath: `SD2:/ROMS/ports/ (roms/ports/)`,
      steps: [
        tf('pm.engine.guideMuosStep1', { id: port.id, sh: shFile }),
        port.readyToRun
          ? tf('pm.engine.guideMuosStep2Rtr')
          : tf('pm.engine.guideMuosStep2Data', { sub: targetSub }),
        tf('pm.engine.guideMuosStep3', { title: port.title }),
      ],
    },
    {
      id: 'trimui_rocknix',
      consoleName: 'TrimUI Smart Pro / PowKiddy RGB30',
      osName: 'CrossMix OS / ROCKNIX / JELOS',
      portsPath: `/roms/ports/ (/Data/ports/)`,
      steps: [
        tf('pm.engine.guideTrimuiStep1', { sh: shFile }),
        port.readyToRun
          ? tf('pm.engine.guideTrimuiStep2Rtr')
          : tf('pm.engine.guideTrimuiStep2Data', { sub: targetSub }),
        tf('pm.engine.guideTrimuiStep3', { deps: depsStr }),
      ],
    },
  ];
}

/**
 * Extracts entries from ANY standard ZIP buffer in modern browsers / Edge WebView2.
 * Supports Compression Method 0 (Store) AND Compression Method 8 (Deflate via native DecompressionStream('deflate-raw')).
 */
export async function extractZipEntriesAsync(
  zipBytes: Uint8Array
): Promise<Array<{ name: string; data: Uint8Array; isDirectory: boolean }>> {
  const dv = new DataView(zipBytes.buffer, zipBytes.byteOffset, zipBytes.byteLength);
  let eocdOffset = -1;
  const searchStart = Math.max(0, zipBytes.byteLength - 65558);
  for (let i = zipBytes.byteLength - 22; i >= searchStart; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) {
    throw new Error(tfStatic('pm.engine.invalidZip'));
  }

  const totalEntries = dv.getUint16(eocdOffset + 10, true);
  let cdOffset = dv.getUint32(eocdOffset + 16, true);
  const dec = new TextDecoder('utf-8');
  const results: Array<{ name: string; data: Uint8Array; isDirectory: boolean }> = [];

  for (let idx = 0; idx < totalEntries && cdOffset + 46 <= zipBytes.byteLength; idx++) {
    if (dv.getUint32(cdOffset, true) !== 0x02014b50) break;
    const method = dv.getUint16(cdOffset + 10, true);
    const compSize = dv.getUint32(cdOffset + 20, true);
    const fnameLen = dv.getUint16(cdOffset + 28, true);
    const extraLen = dv.getUint16(cdOffset + 30, true);
    const commentLen = dv.getUint16(cdOffset + 32, true);
    const localHdrOff = dv.getUint32(cdOffset + 42, true);

    const fname = dec.decode(zipBytes.subarray(cdOffset + 46, cdOffset + 46 + fnameLen));
    cdOffset += 46 + fnameLen + extraLen + commentLen;

    const isDirectory = fname.endsWith('/');
    if (isDirectory) {
      results.push({ name: fname, data: new Uint8Array(0), isDirectory: true });
      continue;
    }

    if (localHdrOff + 30 <= zipBytes.byteLength && dv.getUint32(localHdrOff, true) === 0x04034b50) {
      const lFnameLen = dv.getUint16(localHdrOff + 26, true);
      const lExtraLen = dv.getUint16(localHdrOff + 28, true);
      const dataStart = localHdrOff + 30 + lFnameLen + lExtraLen;
      const dataEnd = Math.min(zipBytes.byteLength, dataStart + compSize);
      const compressedSlice = zipBytes.subarray(dataStart, dataEnd);

      if (method === 0) {
        results.push({ name: fname, data: compressedSlice, isDirectory: false });
      } else if (method === 8) {
        if (typeof (globalThis as any).DecompressionStream !== 'function') {
          throw new Error(tfStatic('pm.engine.noDecompStream'));
        }
        const ds = new (globalThis as any).DecompressionStream('deflate-raw');
        const copyBuf = new Uint8Array(compressedSlice.byteLength);
        copyBuf.set(compressedSlice);
        const stream = new Blob([copyBuf]).stream().pipeThrough(ds);
        const decompressedBuf = await new Response(stream).arrayBuffer();
        results.push({ name: fname, data: new Uint8Array(decompressedBuf), isDirectory: false });
      }
    }
  }

  return results;
}

export interface PortMasterPcTestPlan {
  engineName: string;
  recommendedEmulatorId: string;
  emulatorDisplayName: string;
  canRunWithoutArmLinux: boolean;
  explanation: string;
  wslScript: string;
  cmdScript: string;
}

/**
 * Infers the best way to test a PortMaster game on a Windows/Linux PC
 * before copying to a handheld console.
 */
export function inferPortMasterPcTestPlan(
  port: Pick<PortMasterGame, 'slug' | 'title' | 'runtime' | 'requirements' | 'instructionsRaw' | 'requiredDataTargetPath' | 'items'>,
  tf: TfFn = defaultTf
): PortMasterPcTestPlan {
  const joined = [
    port.slug,
    port.title,
    ...(port.runtime || []),
    ...(port.requirements || []),
    port.instructionsRaw || '',
    ...(port.items || []),
  ]
    .join(' ')
    .toLowerCase();

  const shFile = port.items?.find((i) => i.toLowerCase().endsWith('.sh')) || `${port.slug}.sh`;

  let engineName = tf('pm.engine.armTitle', undefined, 'Linux ARM64 ELF + SDL2 / Box64');
  let recommendedEmulatorId = 'portmaster_wsl2';
  let emulatorDisplayName = 'WSL2 Ubuntu + Box64 / QEMU ARM64';
  let canRunWithoutArmLinux = false;
  let explanation = tf(
    'pm.engine.armDesc',
    undefined,
    'Compiled for ARM64 Linux (aarch64). On Windows 10/11 PCs, test via WSL2 (WSLg) with qemu-user-static and box64.'
  );

  if (joined.includes('love2d') || joined.includes('love 11') || joined.includes('.love')) {
    engineName = tf('pm.engine.loveTitle', undefined, 'LÖVE (Love2D) Cross-Platform Engine');
    recommendedEmulatorId = 'portmaster_love2d';
    emulatorDisplayName = 'LÖVE (Love2D Windows)';
    canRunWithoutArmLinux = true;
    explanation = tf(
      'pm.engine.loveDesc',
      undefined,
      'Runs on LÖVE (.love / Lua scripts). Launches directly in native love.exe on Windows without Linux or ARM emulation!'
    );
  } else if (joined.includes('godot') || joined.includes('frt') || joined.includes('.pck')) {
    engineName = tf('pm.engine.godotTitle', undefined, 'Godot Engine (.pck)');
    recommendedEmulatorId = 'portmaster_godot';
    emulatorDisplayName = 'Godot Engine Windows';
    canRunWithoutArmLinux = true;
    explanation = tf(
      'pm.engine.godotDesc',
      undefined,
      'Uses Godot game package (.pck). You can run this .pck directly in standard Godot.exe on Windows PC.'
    );
  } else if (
    joined.includes('easyrpg') ||
    joined.includes('scummvm') ||
    joined.includes('gzdoom') ||
    joined.includes('prboom') ||
    joined.includes('tyrquake') ||
    joined.includes('nxengine') ||
    joined.includes('openbor')
  ) {
    engineName = tf('pm.engine.retroTitle', undefined, 'Universal Game Engine (RetroArch / Standalone)');
    recommendedEmulatorId = 'portmaster_retroarch';
    emulatorDisplayName = 'RetroArch PC (EasyRPG / ScummVM / Doom / Quake)';
    canRunWithoutArmLinux = true;
    explanation = tf(
      'pm.engine.retroDesc',
      undefined,
      'Built on an open engine (EasyRPG / ScummVM / Doom / Quake / OpenBOR). Data files run natively in RetroArch on PC.'
    );
  }

  const wslScript = [
    '#!/usr/bin/env bash',
    `# ${tf('pm.engine.scriptHeader')}`,
    `PORT_DIR="$(cd "$(dirname "$0")" && pwd)"`,
    `echo "=== ${tf('pm.engine.scriptCheck', { title: port.title, slug: port.slug })} ==="`,
    `if [ ! -f "$PORT_DIR/${shFile}" ]; then`,
    `  echo "${tf('pm.engine.scriptErrMissing', { sh: shFile })}"`,
    '  exit 1',
    'fi',
    '# Convert CRLF -> LF if edited on Windows',
    `sed -i 's/\\r$//' "$PORT_DIR/${shFile}"`,
    `chmod +x "$PORT_DIR/${shFile}"`,
    'export controlfolder="${controlfolder:-$HOME/PortMaster}"',
    'export directory="$PORT_DIR"',
    `echo "${tf('pm.engine.scriptLaunching')}"`,
    `bash "$PORT_DIR/${shFile}"`,
    '',
  ].join('\n');

  const cmdScript = [
    '@echo off',
    'chcp 65001 >nul',
    `title ${tf('pm.engine.cmdTitle', { title: port.title })}`,
    'echo ============================================================================',
    `echo  ${tf('pm.engine.scriptCheck', { title: port.title, slug: port.slug })}`,
    `echo  ${tf('pm.engine.cmdEngine', { engine: engineName })}`,
    `echo  ${tf('pm.engine.cmdDataDir', { path: port.requiredDataTargetPath })}`,
    'echo ============================================================================',
    'echo.',
    recommendedEmulatorId === 'portmaster_love2d'
      ? `if exist "C:\\Program Files\\LOVE\\love.exe" (\r\n  "C:\\Program Files\\LOVE\\love.exe" "%~dp0${port.slug}"\r\n  goto :eof\r\n)`
      : recommendedEmulatorId === 'portmaster_godot'
      ? `if exist "C:\\Emulators\\Godot\\Godot.exe" (\r\n  "C:\\Emulators\\Godot\\Godot.exe" --path "%~dp0${port.slug}"\r\n  goto :eof\r\n)`
      : recommendedEmulatorId === 'portmaster_retroarch'
      ? `if exist "C:\\RetroArch-Win64\\retroarch.exe" (\r\n  "C:\\RetroArch-Win64\\retroarch.exe" "%~dp0${port.slug}"\r\n  goto :eof\r\n)`
      : `echo [WSL2 Mode] ${tf('pm.engine.cmdWslTrying')}`,
    'where wsl >nul 2>nul',
    'if %errorlevel%==0 (',
    `  wsl bash -lc "sed -i 's/\\r$//' '${shFile}' 2>/dev/null; chmod +x '${shFile}'; bash './${shFile}'"`,
    ') else (',
    `  echo ${tf('pm.engine.cmdWslMissing')}`,
    ')',
    'pause',
    '',
  ].join('\r\n');

  return {
    engineName,
    recommendedEmulatorId,
    emulatorDisplayName,
    canRunWithoutArmLinux,
    explanation,
    wslScript,
    cmdScript,
  };
}

