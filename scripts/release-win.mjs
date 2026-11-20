#!/usr/bin/env node
/**
 * AegisROM Windows Release Pipeline (`npm run release:win`)
 * Rebuilds fresh Vite frontend, syncs `cmd/aegis-gui/webdist`,
 * regenerates Win32 manifests/icons, cross-compiles all Windows 11 x64 binaries,
 * packages AegisROM-Setup-v<ver>-Win11-x64.exe & AegisROM-v<ver>-Win11-x64.zip,
 * updates `public/downloads/version.json`, and cleans old stale archives.
 */
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { execSync, execFileSync } from 'child_process';

const ROOT = process.cwd();
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8'));
const BASE_VERSION = String(pkg.version || '0.0.0').trim();
// RU: CI для dev передаёт AEGIS_BUILD_VERSION вида 0.5.6-dev+abc1234 — она видна в окне, установщике и version.json.
// EN: CI on dev passes AEGIS_BUILD_VERSION like 0.5.6-dev+abc1234; it shows in the window, installer and version.json.
const VERSION = String(process.env.AEGIS_BUILD_VERSION || BASE_VERSION).trim();
// '+' в именах файлов на GitHub неудобен / '+' is awkward in GitHub asset names.
const FILE_VERSION = VERSION.replace(/\+/g, '.');
const GO_VERSION_FLAG = `-X aegisgui/cmd/winsetup.AppVersion=${VERSION}`;

const DOWNLOADS_DIR = path.join(ROOT, 'public', 'downloads');
const DIST_DIR = path.join(ROOT, 'dist');
const WEBDIST_DIR = path.join(ROOT, 'cmd', 'aegis-gui', 'webdist');
const SETUP_PAYLOAD_DIR = path.join(ROOT, 'cmd', 'aegis-setup', 'payload');

const SETUP_NAME = `AegisROM-Setup-v${FILE_VERSION}-Win11-x64.exe`;
const ZIP_NAME = `AegisROM-v${FILE_VERSION}-Win11-x64.zip`;
const PORTABLE_NAME = 'AegisROM-Portable-Win11-x64.exe';
const CLI_NAME = 'aegis-scanner-win11-x64.exe';

function findGoBinary() {
  const candidates = ['go', '/tmp/go/bin/go', '/usr/local/go/bin/go'];
  for (const cand of candidates) {
    try {
      const out = execSync(`"${cand}" version`, { stdio: ['ignore', 'pipe', 'ignore'] })
        .toString()
        .trim();
      if (out.includes('go version')) {
        return cand;
      }
    } catch {}
  }
  throw new Error(
    'Go compiler not found (checked PATH, /tmp/go/bin/go, /usr/local/go/bin/go).'
  );
}

function run(cmd, extraEnv = {}) {
  console.log(`> ${cmd}`);
  execSync(cmd, {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, ...extraEnv },
  });
}

function syncDirClean(src, dest) {
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });
  fs.cpSync(src, dest, { recursive: true });
}

function main() {
  console.log(`=== Building AegisROM v${VERSION} (Win11 x64 Release) ===`);
  const goBin = findGoBinary();
  console.log(`Using Go binary: ${goBin}`);

  // 1. Build fresh Vite frontend (EmulatorJS cores for Quick test go into public/emulatorjs first)
  run('node scripts/fetch-emulatorjs.mjs');
  run('npx vite build', { VITE_APP_VERSION: VERSION });
  if (!fs.existsSync(path.join(DIST_DIR, 'index.html'))) {
    throw new Error('Vite build did not produce dist/index.html');
  }

  // 2. Sync dist -> cmd/aegis-gui/webdist (clears stale hashed assets)
  syncDirClean(DIST_DIR, WEBDIST_DIR);
  // Never embed release binaries into AegisROM.exe: Vite copies public/downloads
  // into dist, so without this each release would carry the previous one inside.
  const webdistDownloads = path.join(WEBDIST_DIR, 'downloads');
  if (fs.existsSync(webdistDownloads)) {
    for (const entry of fs.readdirSync(webdistDownloads)) {
      if (/\.(exe|zip|gz)$/i.test(entry)) {
        fs.unlinkSync(path.join(webdistDownloads, entry));
      }
    }
  }
  // Keep the placeholder tracked by git so `go:embed all:webdist` works in a clean clone.
  fs.writeFileSync(path.join(WEBDIST_DIR, '.gitkeep'), '');
  console.log(`Synced ${DIST_DIR} -> ${WEBDIST_DIR} (binaries excluded)`);

  // 3. Regenerate Win32 manifest & ICO/SYSO resources for both aegis-gui & aegis-setup
  run(`"${goBin}" run ./cmd/gen-rsrc`);
  const guiSyso = path.join(ROOT, 'cmd', 'aegis-gui', 'rsrc_windows_amd64.syso');
  const setupSyso = path.join(ROOT, 'cmd', 'aegis-setup', 'rsrc_windows_amd64.syso');
  if (fs.existsSync(guiSyso)) {
    fs.copyFileSync(guiSyso, setupSyso);
  }

  fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
  fs.mkdirSync(SETUP_PAYLOAD_DIR, { recursive: true });

  // 4. Clean stale versioned setups & zips so old versions never accumulate
  for (const entry of fs.readdirSync(DOWNLOADS_DIR)) {
    if (
      (/^AegisROM-Setup-v.*-Win11-x64\.exe$/i.test(entry) && entry !== SETUP_NAME) ||
      (/^AegisROM-v.*-Win11-x64\.zip$/i.test(entry) && entry !== ZIP_NAME)
    ) {
      fs.unlinkSync(path.join(DOWNLOADS_DIR, entry));
      console.log(`Removed stale artifact: ${entry}`);
    }
  }

  const winEnv = {
    GOOS: 'windows',
    GOARCH: 'amd64',
    CGO_ENABLED: '0',
  };

  // 5. Compile CLI scanner
  const cliOut = path.join(DOWNLOADS_DIR, CLI_NAME);
  const cliAliasOut = path.join(DOWNLOADS_DIR, 'aegis-scanner.exe');
  run(
    `"${goBin}" build -trimpath -ldflags="-s -w" -o "${cliOut}" ./public/downloads/aegis-scanner.go`,
    winEnv
  );
  fs.copyFileSync(cliOut, cliAliasOut);

  // 6. Compile AegisROM.exe + Portable EXE (pure Win32 GUI + embedded React webdist)
  const exeOut = path.join(DOWNLOADS_DIR, 'AegisROM.exe');
  const portableOut = path.join(DOWNLOADS_DIR, PORTABLE_NAME);
  run(
    `"${goBin}" build -trimpath -ldflags="-H=windowsgui -s -w ${GO_VERSION_FLAG}" -o "${exeOut}" ./cmd/aegis-gui`,
    winEnv
  );
  fs.copyFileSync(exeOut, portableOut);

  // 7. Compress AegisROM.exe payload & copy icon for self-extracting Setup.exe
  const rawExeBytes = fs.readFileSync(exeOut);
  const gzPayload = zlib.gzipSync(rawExeBytes, { level: 9 });
  fs.writeFileSync(path.join(SETUP_PAYLOAD_DIR, 'AegisROM.exe.gz'), gzPayload);
  fs.copyFileSync(
    path.join(ROOT, 'public', 'favicon.ico'),
    path.join(SETUP_PAYLOAD_DIR, 'favicon.ico')
  );

  // 8. Compile standalone Setup Wizard EXE
  const setupOut = path.join(DOWNLOADS_DIR, SETUP_NAME);
  run(
    `"${goBin}" build -trimpath -ldflags="-H=windowsgui -s -w ${GO_VERSION_FLAG}" -o "${setupOut}" ./cmd/aegis-setup`,
    winEnv
  );

  // 9. Refresh version.json metadata
  const versionMetaPath = path.join(DOWNLOADS_DIR, 'version.json');
  const today = new Date().toISOString().slice(0, 10);
  let features = [];
  if (fs.existsSync(versionMetaPath)) {
    try {
      const existing = JSON.parse(fs.readFileSync(versionMetaPath, 'utf-8'));
      if (Array.isArray(existing.features)) features = existing.features;
    } catch {}
  }
  fs.writeFileSync(
    versionMetaPath,
    JSON.stringify(
      {
        appName: 'AegisROM',
        version: VERSION,
        releaseDate: today,
        defaultInstallDir: 'C:\\Program Files\\AegisROM',
        setupExecutable: SETUP_NAME,
        zipPackage: ZIP_NAME,
        portableExecutable: PORTABLE_NAME,
        features,
      },
      null,
      2
    ) + '\n',
    'utf-8'
  );

  // 10. Package ZIP bundle via Python zipfile (deterministic, clean archive without nested paths)
  const zipOut = path.join(DOWNLOADS_DIR, ZIP_NAME);
  if (fs.existsSync(zipOut)) fs.unlinkSync(zipOut);
  const filesToPack = [
    SETUP_NAME,
    PORTABLE_NAME,
    CLI_NAME,
    'aegis-scanner.go',
    'version.json',
  ];
  const pyScript = [
    'import zipfile, os',
    `downloads_dir = ${JSON.stringify(DOWNLOADS_DIR)}`,
    `zip_path = ${JSON.stringify(zipOut)}`,
    `files = ${JSON.stringify(filesToPack)}`,
    'with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as zf:',
    '  for name in files:',
    '    full = os.path.join(downloads_dir, name)',
    '    if not os.path.exists(full): raise FileNotFoundError(full)',
    '    zf.write(full, arcname=name)',
  ].join('\n');
  console.log(`> python3 -m zipfile -> ${ZIP_NAME}`);
  execFileSync('python3', ['-c', pyScript], { cwd: ROOT, stdio: 'inherit' });

  // 11. Sanity-check output headers (MZ for EXEs, PK for ZIP) and print sizes
  for (const checkName of [SETUP_NAME, PORTABLE_NAME, 'AegisROM.exe', CLI_NAME, ZIP_NAME]) {
    const full = path.join(DOWNLOADS_DIR, checkName);
    const buf = fs.readFileSync(full);
    if (buf.length < 1024) {
      throw new Error(`Artifact ${checkName} is suspiciously small (${buf.length} bytes)`);
    }
    const sig = buf.slice(0, 2).toString('ascii');
    const expectedSig = checkName.endsWith('.zip') ? 'PK' : 'MZ';
    if (sig !== expectedSig) {
      throw new Error(`Artifact ${checkName} invalid header ${sig} (expected ${expectedSig})`);
    }
    console.log(`  OK ${checkName}: ${(buf.length / (1024 * 1024)).toFixed(2)} MB (${sig})`);
  }

  console.log(`\nRelease v${VERSION} completed cleanly!`);
}

main();
