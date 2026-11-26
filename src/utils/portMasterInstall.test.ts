// Тесты установки портов PortMaster: `npm test`. / PortMaster port install tests: `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import {
  safeZipPath,
  findLauncherScript,
  installPortMasterPort,
  pctOf,
  type PortInstallProgress,
} from './portMasterInstall.ts';
import { forEachZipEntry, ZipError, ZIP_ERR_METHOD } from './zipReader.ts';

// Минимальный ZIP: Store или Deflate. / Minimal ZIP: Store or Deflate.
function makeZip(entries: Array<{ name: string; data?: string; method?: number }>): Uint8Array {
  const enc = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const e of entries) {
    const name = enc.encode(e.name);
    const raw = enc.encode(e.data || '');
    const method = e.method ?? (e.name.endsWith('/') ? 0 : 8);
    const body = method === 8 ? new Uint8Array(deflateRawSync(raw)) : raw;
    const lh = new Uint8Array(30 + name.length);
    const lv = new DataView(lh.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(8, method, true);
    lv.setUint32(18, body.length, true);
    lv.setUint32(22, raw.length, true);
    lv.setUint16(26, name.length, true);
    lh.set(name, 30);
    const ch = new Uint8Array(46 + name.length);
    const cv = new DataView(ch.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(10, method, true);
    cv.setUint32(20, body.length, true);
    cv.setUint32(24, raw.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    ch.set(name, 46);
    locals.push(lh, body);
    centrals.push(ch);
    offset += lh.length + body.length;
  }
  const cdSize = centrals.reduce((a, c) => a + c.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);
  const all = [...locals, ...centrals, eocd];
  const out = new Uint8Array(all.reduce((a, c) => a + c.length, 0));
  let o = 0;
  for (const c of all) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

// Папка в памяти. / In-memory folder.
function memDir(name = 'root'): any {
  const files = new Map<string, Blob>();
  const dirs = new Map<string, any>();
  return {
    kind: 'directory',
    name,
    files,
    dirs,
    async getDirectoryHandle(n: string, o?: { create?: boolean }) {
      if (!dirs.has(n)) {
        if (!o?.create) throw new Error('NotFound');
        dirs.set(n, memDir(n));
      }
      return dirs.get(n);
    },
    async getFileHandle(n: string) {
      return {
        kind: 'file',
        name: n,
        async getFile() {
          return files.get(n);
        },
        async createWritable() {
          return {
            async write(d: any) {
              files.set(n, new Blob([d]));
            },
            async close() {},
          };
        },
      };
    },
    async *values() {
      for (const d of dirs.values()) yield d;
      for (const [n, b] of files) yield { kind: 'file', name: n, getFile: async () => b };
    },
  };
}

// Как NativeDirectoryHandle: у папок есть абсолютный путь. / Like NativeDirectoryHandle: folders carry an absolute path.
function nativeMemDir(path: string): any {
  const d = memDir(path.split('/').pop());
  d.__aegisNativeFs = true;
  d.path = path;
  const orig = d.getDirectoryHandle.bind(d);
  d.getDirectoryHandle = async (n: string, o?: any) => {
    const c = await orig(n, o);
    if (!c.__aegisNativeFs) Object.assign(c, nativeMemDir(`${path}/${n}`), { files: c.files, dirs: c.dirs });
    return c;
  };
  return d;
}

async function readText(dir: any, path: string): Promise<string> {
  const segs = path.split('/');
  let d = dir;
  for (const s of segs.slice(0, -1)) d = d.dirs.get(s);
  const b: Blob | undefined = d?.files.get(segs[segs.length - 1]);
  return b ? await b.text() : '';
}

function fakeFetch(bytes: Uint8Array, status = 200): typeof fetch {
  return (async () =>
    new Response(status === 200 ? bytes : 'nope', {
      status,
      headers: { 'Content-Length': String(bytes.length) },
    })) as any;
}

test('safeZipPath режет zip-slip и абсолютные пути / blocks zip-slip and absolute paths', () => {
  assert.deepEqual(safeZipPath('game/conf/a.txt'), ['game', 'conf', 'a.txt']);
  assert.deepEqual(safeZipPath('game\\b.txt'), ['game', 'b.txt']);
  assert.equal(safeZipPath('../evil.sh'), null);
  assert.equal(safeZipPath('game/../../evil.sh'), null);
  assert.equal(safeZipPath('/etc/passwd'), null);
  assert.equal(safeZipPath('C:/Windows/x.dll'), null);
});

test('findLauncherScript берёт .sh из корня / picks the root .sh', () => {
  assert.equal(
    findLauncherScript(['celeste/', 'celeste/run.sh', 'Celeste.sh'], 'celeste'),
    'Celeste.sh'
  );
  assert.equal(findLauncherScript(['a/b.sh', 'readme.md']), '');
  assert.equal(
    findLauncherScript(['Other.sh', 'Stardew Valley.sh'], 'stardewvalley'),
    'Stardew Valley.sh'
  );
});

test('установка: скачивание, распаковка в ports/, путь для библиотеки / install unpacks into ports/', async () => {
  const zip = makeZip([
    { name: 'celeste/' },
    { name: 'celeste/conf/settings.ini', data: 'x=1' },
    { name: 'Celeste.sh', data: '#!/bin/bash\necho hi' },
    { name: '../escape.sh', data: 'bad' },
  ]);
  const root = memDir('Roms');
  const phases: PortInstallProgress['phase'][] = [];
  const res = await installPortMasterPort({
    libraryRoot: root,
    portUrl: 'https://github.com/PortsMaster/x.zip',
    slug: 'celeste',
    requiredDataTargetPath: 'ports/celeste/gamedata',
    onProgress: (p) => phases.push(p.phase),
    fetchImpl: fakeFetch(zip),
  });
  assert.equal(res.files, 2);
  assert.equal(res.launcher, 'Celeste.sh');
  assert.equal(res.relativePath, 'ports/Celeste.sh');
  const ports = root.dirs.get('ports');
  assert.ok(ports, 'папка ports создана / ports folder created');
  assert.equal(await readText(ports, 'Celeste.sh'), '#!/bin/bash\necho hi');
  assert.equal(await readText(ports, 'celeste/conf/settings.ini'), 'x=1');
  assert.equal(root.files.has('escape.sh') || ports.files.has('escape.sh'), false);
  assert.deepEqual(
    [...new Set(phases)],
    ['folder', 'download', 'unpack', 'done']
  );
});

test('архив внутри ports/ не даёт ports/ports / archive wrapped in ports/ is flattened', async () => {
  const zip = makeZip([
    { name: 'ports/Game.sh', data: 'run' },
    { name: 'ports/game/data.bin', data: 'd' },
  ]);
  const root = memDir();
  const res = await installPortMasterPort({
    libraryRoot: root,
    portUrl: 'u',
    slug: 'game',
    requiredDataTargetPath: 'ports/game',
    fetchImpl: fakeFetch(zip),
  });
  const ports = root.dirs.get('ports');
  assert.equal(ports.dirs.has('ports'), false);
  assert.equal(await readText(ports, 'Game.sh'), 'run');
  assert.equal(res.relativePath, 'ports/Game.sh');
});

test('данные игры копируются в нужную подпапку / game data goes to the required subfolder', async () => {
  const zip = makeZip([{ name: 'Half-Life.sh', data: 's' }]);
  const root = memDir();
  const res = await installPortMasterPort({
    libraryRoot: root,
    portUrl: 'u',
    slug: 'halflife',
    requiredDataTargetPath: 'ports/Half-Life/valve',
    dataSource: {
      files: [
        { file: new File(['pak'], 'pak0.pak'), relPath: 'valve/pak0.pak' },
        { file: new File(['cfg'], 'config.cfg'), relPath: 'valve/cfg/config.cfg' },
      ],
    },
    fetchImpl: fakeFetch(zip),
  });
  assert.equal(res.dataFiles, 2);
  const ports = root.dirs.get('ports');
  assert.equal(await readText(ports, 'Half-Life/valve/pak0.pak'), 'pak');
  assert.equal(await readText(ports, 'Half-Life/valve/cfg/config.cfg'), 'cfg');
});

test('ошибка сервера доходит до пользователя / server error reaches the user', async () => {
  await assert.rejects(
    installPortMasterPort({
      libraryRoot: memDir(),
      portUrl: 'u',
      slug: 's',
      requiredDataTargetPath: 'ports/s',
      fetchImpl: fakeFetch(new Uint8Array(0), 502),
    }),
    /HTTP 502: nope/
  );
});

test('неизвестный метод сжатия — ошибка, а не тихий пропуск / unknown method is an error', async () => {
  const zip = makeZip([{ name: 'a.bin', data: 'x', method: 14 }]);
  await assert.rejects(forEachZipEntry(zip, () => {}), (e: any) => e instanceof ZipError && e.code === ZIP_ERR_METHOD);
});

test('pctOf', () => {
  assert.equal(pctOf(5, 10), 50);
  assert.equal(pctOf(5, 0), -1);
  assert.equal(pctOf(11, 10), 100);
});

test('нативное окно: ставит Go, окно опрашивает ход / native window: Go installs, window polls', async () => {
  const calls: string[] = [];
  let polls = 0;
  const fetchImpl = (async (url: string, init?: any) => {
    calls.push(url);
    if (url === '/api/portmaster/install') {
      const body = JSON.parse(init.body);
      assert.equal(body.dest, 'D:/Roms/ports');
      assert.equal(body.url, 'https://github.com/PortsMaster/x.zip');
      return new Response(JSON.stringify({ ok: true, id: '7' }));
    }
    polls++;
    const st =
      polls === 1
        ? { phase: 'download', done: 50, total: 100 }
        : polls === 2
        ? { phase: 'unpack', done: 3, total: 4 }
        : { phase: 'done', files: 4, launcher: 'Game.sh' };
    return new Response(JSON.stringify({ ok: true, ...st }));
  }) as any;
  const seen: PortInstallProgress[] = [];
  const root = nativeMemDir('D:/Roms');
  const res = await installPortMasterPort({
    libraryRoot: root,
    portUrl: 'https://github.com/PortsMaster/x.zip',
    slug: 'game',
    requiredDataTargetPath: 'ports/game',
    onProgress: (p) => seen.push(p),
    fetchImpl,
    pollMs: 1,
  });
  assert.equal(res.relativePath, 'ports/Game.sh');
  assert.equal(res.files, 4);
  assert.ok(seen.some((p) => p.phase === 'download' && p.pct === 50));
  assert.ok(seen.some((p) => p.phase === 'unpack' && p.pct === 75));
  assert.equal(calls.filter((c) => c.startsWith('/api/portmaster/download')).length, 0);
});

test('нативное окно: ошибка Go доходит до пользователя / native window: Go error reaches the user', async () => {
  const fetchImpl = (async (url: string) =>
    url === '/api/portmaster/install'
      ? new Response(JSON.stringify({ ok: true, id: '1' }))
      : new Response(JSON.stringify({ ok: true, phase: 'error', error: 'PortMaster: HTTP 404' }))) as any;
  const root = nativeMemDir('/roms');
  await assert.rejects(
    installPortMasterPort({
      libraryRoot: root,
      portUrl: 'u',
      slug: 's',
      requiredDataTargetPath: 'ports/s',
      fetchImpl,
      pollMs: 1,
    }),
    /HTTP 404/
  );
});
