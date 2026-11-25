import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SAVE_MAP_FILE, mergeSaveMap, saveMapEntryFor, writeSaveMap } from './saveMap.ts';

const nativeDir = (path: string, files: Map<string, string> = new Map()) => ({
  __aegisNativeFs: true,
  kind: 'directory',
  path,
  files,
  async getFileHandle(name: string, opts?: { create?: boolean }) {
    if (!files.has(name) && !opts?.create) throw new DOMException('nope', 'NotFoundError');
    return {
      getFile: async () => ({ text: async () => files.get(name) || '' }),
      createWritable: async () => {
        let buf = '';
        return { write: async (s: string) => void (buf += s), close: async () => void files.set(name, buf) };
      },
    };
  },
});

test('saveMapEntryFor needs native folders on both sides', () => {
  assert.deepEqual(saveMapEntryFor(nativeDir('D:\\Lib\\snes'), 'A (USA)', nativeDir('E:\\Build\\EASYROMS\\snes'), 'A.sfc'), {
    rom: 'E:\\Build\\EASYROMS\\snes\\A.sfc',
    libDir: 'D:\\Lib\\snes',
    libBase: 'A (USA)',
  });
  assert.equal(saveMapEntryFor(nativeDir('/lib/'), 'A', nativeDir('/build/'), 'A.sfc')?.rom, '/build/A.sfc');
  // Браузерные папки без пути — без связи. / Browser folders without a path: no link.
  assert.equal(saveMapEntryFor({ name: 'snes' }, 'A', nativeDir('/b'), 'A.sfc'), null);
  assert.equal(saveMapEntryFor(nativeDir('/l'), '', nativeDir('/b'), 'A.sfc'), null);
});

test('mergeSaveMap replaces by ROM path and survives junk', () => {
  const first = mergeSaveMap(null, [
    { rom: '/b/A.sfc', libDir: '/l', libBase: 'A' },
    { rom: '/b/B.sfc', libDir: '/l', libBase: 'B' },
  ]);
  const second = JSON.parse(mergeSaveMap(first, [{ rom: '/B/a.sfc', libDir: '/l2', libBase: 'A2' }]));
  assert.equal(second.version, 1);
  assert.deepEqual(
    second.entries.map((e: any) => e.libBase),
    ['A2', 'B']
  );
  assert.deepEqual(JSON.parse(mergeSaveMap('not json', [])).entries, []);
});

test('writeSaveMap writes only into native folders and merges', async () => {
  const files = new Map<string, string>();
  const root = nativeDir('/build', files);
  assert.equal(await writeSaveMap(root, [{ rom: '/build/A.sfc', libDir: '/l', libBase: 'A' }]), true);
  assert.equal(await writeSaveMap(root, [{ rom: '/build/B.sfc', libDir: '/l', libBase: 'B' }]), true);
  assert.equal(JSON.parse(files.get(SAVE_MAP_FILE)!).entries.length, 2);
  assert.equal(await writeSaveMap({ getFileHandle() {} }, [{ rom: '/x', libDir: '/l', libBase: 'X' }]), false);
  assert.equal(await writeSaveMap(root, []), false);
});
