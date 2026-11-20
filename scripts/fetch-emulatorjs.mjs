#!/usr/bin/env node
/**
 * Скачивает EmulatorJS и выбранные WASM-ядра для «Быстрого теста» в public/emulatorjs/.
 * Downloads EmulatorJS and the selected WASM cores for "Quick test" into public/emulatorjs/.
 *
 * - Версия и sha512 каждого пакета закреплены ниже: подмена пакета в реестре сломает сборку.
 *   Version and sha512 of every package are pinned below: a swapped package fails the build.
 * - Файлы не коммитятся в git (public/emulatorjs/ в .gitignore), а попадают в dist/ при сборке
 *   и отдаются приложением локально. В рантайме ничего не грузится с чужих CDN.
 *   Files are not committed; they go into dist/ and are served locally by the app.
 * - Кэш: .cache/emulatorjs/<version>/*.tgz. Повторный запуск без сети работает из кэша.
 *
 * Запуск / run: `npm run fetch:emulatorjs` (вызывается автоматически из predev/prebuild и release:win).
 */
import { execSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = '4.2.3';
const CACHE_DIR = path.join(ROOT, '.cache', 'emulatorjs', VERSION);
const OUT_DIR = path.join(ROOT, 'public', 'emulatorjs');
const DATA_OUT = path.join(OUT_DIR, 'data');
const STAMP = path.join(OUT_DIR, '.aegis-stamp.json');

// npm dist.integrity для @emulatorjs/*@4.2.3.
const PACKAGES = {
  emulatorjs: 'sha512-7z3qaA4LwyurhuGvdMUDF9xJpEbxC3SNy9+E9tSaOsRo8FCS2QXam/0k/lc9kqHWRFIlLKWahNjPAStyL0rFnw==',
  'core-fceumm': 'sha512-XX9Vv2N/hzp0TstNMCTSppEs+sg+1lpJpPdSDuRqIO/cwdt7dUcF+WjNX1yQJLRbP5+XwcNHZ6K4BKy8CJpndQ==',
  'core-snes9x': 'sha512-JTe9Rv9eOuCkgkG4ILwuCZUqNcVI3m9ju1NHTTjridUlFgJSqL4DUqF/vLKN9olCpsqlJFfcCayAOoikJxefwA==',
  'core-genesis_plus_gx': 'sha512-D1e2XA2CPRAjfr0JurpXJgR9dePxl/xHtaE8v1T9BqD9A3DLfobIFWsWU9jCFS4NfUxCvcLdTYdY/We3QzvcTw==',
  'core-gambatte': 'sha512-Oq3AJL9SKnMsNAmtAP2eN934TQts3NHeaAe0z1BO9Lx/L3xDZKLpxL+XwgcSXIrl4Sx1oXxYEUwD7JjPEQ0DGg==',
  'core-mgba': 'sha512-daiHzZQKEr+P9fra7j5YoEAXiyYUEtBhFQ8EAV/SeCtrkvqtayU7GQ9LYgoSgzkKSwsbNSskApqGuA9EGARYPA==',
  'core-mednafen_pce': 'sha512-PwnQAKKxWT8m8dUscH4VX8jcClvgxgR/NkE6FxNE8qiRDyBH3Jze7+tF9+UdWLoJRBwssR5knd7o/Es9xIlU6A==',
  'core-pcsx_rearmed': 'sha512-mMbl/NszCryFI15X5QniOqLNL7YGZ6tLP24gr5y1q2ekFOIbtc39BcVTMDEwRndNGovh2nPoCcMjB+W3fgQCog==',
  'core-stella2014': 'sha512-bs5az26pMrM6jswhZ5YxBXLpIwclwfdnWVbaEpip7yjJFQHactL7KYH7hVLts0JWDnfEK2lNxh4zlTfI6HAHmQ==',
};

// Порядок как в data/loader.js: из этих файлов собираем emulator.min.js.
const EJS_SCRIPTS = [
  'emulator.js',
  'nipplejs.js',
  'shaders.js',
  'storage.js',
  'gamepad.js',
  'GameManager.js',
  'socket.io.min.js',
  'compression.js',
];

function integrityOf(file) {
  return 'sha512-' + crypto.createHash('sha512').update(fs.readFileSync(file)).digest('base64');
}

function tarballName(pkg) {
  return `emulatorjs-${pkg}-${VERSION}.tgz`;
}

function ensureTarball(pkg, expected) {
  const file = path.join(CACHE_DIR, tarballName(pkg));
  if (fs.existsSync(file) && integrityOf(file) === expected) return file;
  fs.rmSync(file, { force: true });
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  console.log(`[emulatorjs] npm pack @emulatorjs/${pkg}@${VERSION}`);
  // npm сам учитывает прокси и .npmrc реестра.
  execSync(`npm pack "@emulatorjs/${pkg}@${VERSION}" --silent --pack-destination "${CACHE_DIR}"`, {
    cwd: ROOT,
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  const got = integrityOf(file);
  if (got !== expected) {
    fs.rmSync(file, { force: true });
    throw new Error(`[emulatorjs] integrity mismatch for ${pkg}: expected ${expected}, got ${got}`);
  }
  return file;
}

// Минимальная распаковка .tgz (ustar) без внешнего tar: на Windows tar из Git Bash
// не понимает пути вида C:\..., а bsdtar есть не везде.
function extract(tgz, dest) {
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });
  const buf = zlib.gunzipSync(fs.readFileSync(tgz));
  const str = (off, len) => buf.toString('utf-8', off, off + len).replace(/\0.*$/s, '');
  let off = 0;
  while (off + 512 <= buf.length) {
    const name = str(off, 100);
    if (!name) break;
    const size = parseInt(str(off + 124, 12).trim() || '0', 8);
    const type = String.fromCharCode(buf[off + 156] || 48);
    const prefix = buf.toString('utf-8', off + 257, off + 262) === 'ustar' ? str(off + 345, 155) : '';
    const rel = path.normalize(prefix ? `${prefix}/${name}` : name);
    const body = off + 512;
    if ((type === '0' || type === '\0') && !rel.startsWith('..') && !path.isAbsolute(rel)) {
      const out = path.join(dest, rel);
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, buf.subarray(body, body + size));
    }
    off = body + Math.ceil(size / 512) * 512;
  }
  return path.join(dest, 'package');
}

function copy(src, dst) {
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
}

function main() {
  const wanted = { version: VERSION, packages: PACKAGES, patch: 1 };
  if (fs.existsSync(STAMP) && fs.existsSync(path.join(DATA_OUT, 'emulator.min.js'))) {
    try {
      if (JSON.stringify(JSON.parse(fs.readFileSync(STAMP, 'utf-8'))) === JSON.stringify(wanted)) {
        console.log(`[emulatorjs] ${VERSION} already in public/emulatorjs`);
        return;
      }
    } catch {}
  }

  const tmp = path.join(CACHE_DIR, 'extract');
  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(DATA_OUT, { recursive: true });

  // 1. Плеер: loader, исходники, стили, распаковщики архивов, локализации.
  const main = extract(ensureTarball('emulatorjs', PACKAGES.emulatorjs), path.join(tmp, 'emulatorjs'));
  const data = path.join(main, 'data');
  copy(path.join(data, 'loader.js'), path.join(DATA_OUT, 'loader.js'));
  copy(path.join(data, 'version.json'), path.join(DATA_OUT, 'version.json'));
  copy(path.join(data, 'emulator.css'), path.join(DATA_OUT, 'emulator.min.css'));
  fs.cpSync(path.join(data, 'compression'), path.join(DATA_OUT, 'compression'), { recursive: true });
  fs.cpSync(path.join(data, 'localization'), path.join(DATA_OUT, 'localization'), { recursive: true });
  // В npm-пакете нет emulator.min.js: склеиваем исходники в том же порядке, что и loader.js.
  let bundle = EJS_SCRIPTS.map((f) => fs.readFileSync(path.join(data, 'src', f), 'utf-8')).join('\n;\n');
  // На 127.0.0.1 плеер сам проверяет обновления на cdn.emulatorjs.org: отключаем (CSP всё равно не пустит).
  const UPDATE_CHECK = 'this.checkForUpdates();';
  if (!bundle.includes(UPDATE_CHECK)) throw new Error('[emulatorjs] update check call not found, review the patch');
  bundle = bundle.replace(UPDATE_CHECK, '/* AegisROM: no update check */');
  fs.writeFileSync(path.join(DATA_OUT, 'emulator.min.js'), bundle);
  copy(path.join(main, 'LICENSE'), path.join(OUT_DIR, 'LICENSE-EmulatorJS.txt'));

  // 2. Ядра: только однопоточные сборки (WebGL2 и legacy), без SharedArrayBuffer.
  for (const pkg of Object.keys(PACKAGES).filter((p) => p.startsWith('core-'))) {
    const core = pkg.slice('core-'.length);
    const dir = extract(ensureTarball(pkg, PACKAGES[pkg]), path.join(tmp, pkg));
    for (const f of [`${core}-wasm.data`, `${core}-legacy-wasm.data`]) {
      copy(path.join(dir, f), path.join(DATA_OUT, 'cores', f));
    }
    copy(path.join(dir, 'reports', `${core}.json`), path.join(DATA_OUT, 'cores', 'reports', `${core}.json`));
  }

  fs.rmSync(tmp, { recursive: true, force: true });
  fs.writeFileSync(STAMP, JSON.stringify(wanted));
  console.log(`[emulatorjs] ${VERSION} + ${Object.keys(PACKAGES).length - 1} cores -> public/emulatorjs`);
}

main();
