// Тесты копирования сборки: `npm test`. / Build copy tests: `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DirCache, copyFileToDir, runPool, throttle } from './buildCopy.ts';

// Папка в памяти с createWritable. / In-memory folder with createWritable.
function memDir(name = 'root'): any {
  const files = new Map<string, Blob>();
  const dirs = new Map<string, any>();
  let mkdirCalls = 0;
  const h: any = {
    kind: 'directory',
    name,
    files,
    dirs,
    get mkdirCalls() {
      return mkdirCalls;
    },
    async getDirectoryHandle(n: string, o?: { create?: boolean }) {
      mkdirCalls++;
      if (!dirs.has(n)) {
        if (!o?.create) throw new Error('NotFoundError');
        dirs.set(n, memDir(n));
      }
      return dirs.get(n);
    },
    async getFileHandle(n: string, o?: { create?: boolean }) {
      if (!files.has(n)) {
        if (!o?.create) throw new Error('NotFoundError');
        files.set(n, new Blob([]));
      }
      return {
        kind: 'file',
        name: n,
        getFile: async () => new File([files.get(n)!], n),
        createWritable: async () => {
          const parts: BlobPart[] = [];
          return {
            write: async (d: any) => {
              parts.push(d);
            },
            close: async () => {
              files.set(n, new Blob(parts));
            },
            abort: async () => {},
          };
        },
      };
    },
  };
  return h;
}

test('copyFileToDir copies, then skips a same-size file', async () => {
  const dst = memDir();
  const src = new File(['NESDATA'], '1942.nes');
  assert.equal(await copyFileToDir(src, dst, '1942 (USA).nes', { skipSame: true }), 'copied');
  assert.equal(await dst.files.get('1942 (USA).nes').text(), 'NESDATA');
  assert.equal(await copyFileToDir(src, dst, '1942 (USA).nes', { skipSame: true }), 'skipped');
  assert.equal(await copyFileToDir(src, dst, '1942 (USA).nes', { skipSame: false }), 'copied');
  const bigger = new File(['NESDATA-V2'], '1942.nes');
  assert.equal(await copyFileToDir(bigger, dst, '1942 (USA).nes', { skipSame: true }), 'copied');
  assert.equal(await dst.files.get('1942 (USA).nes').text(), 'NESDATA-V2');
});

test('DirCache creates each folder once, even with parallel callers', async () => {
  const root = memDir();
  const cache = new DirCache(root);
  const got = await Promise.all([cache.get('EASYROMS/nes'), cache.get('EASYROMS/nes'), cache.get('EASYROMS/snes')]);
  assert.equal(got[0], got[1]);
  assert.equal(root.mkdirCalls, 1, 'EASYROMS created once');
  assert.equal(root.dirs.get('EASYROMS').mkdirCalls, 2, 'nes and snes created once each');
  assert.equal(await cache.get(''), root);
});

test('runPool keeps order and limits parallel work', async () => {
  let active = 0;
  let peak = 0;
  const out = await runPool([5, 1, 3, 2, 4], 2, async (n) => {
    active++;
    peak = Math.max(peak, active);
    await new Promise((r) => setTimeout(r, n));
    active--;
    return n * 10;
  });
  assert.deepEqual(out, [50, 10, 30, 20, 40]);
  assert.equal(peak, 2);
});

test('throttle drops intermediate calls but keeps the last one', async () => {
  const seen: number[] = [];
  const f = throttle((n: number) => seen.push(n), 50);
  f(1);
  f(2);
  f(3);
  f.flush();
  assert.deepEqual(seen, [1, 3]);
});

test('createLimiter runs at most n tasks at once', async () => {
  const { createLimiter } = await import('./buildCopy.ts');
  const limit = createLimiter(1);
  let active = 0;
  let peak = 0;
  const task = async () => {
    active++;
    peak = Math.max(peak, active);
    await new Promise((r) => setTimeout(r, 5));
    active--;
  };
  await Promise.all([limit(task), limit(task), limit(task)]);
  assert.equal(peak, 1);
});
