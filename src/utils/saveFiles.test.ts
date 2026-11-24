import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  carryRomSaves,
  countSavesForRom,
  formatSaveStamp,
  looksLikeSaveFile,
  parseHistoryName,
  saveSuffixOf,
  SAVE_HISTORY_DIR,
  SAVE_HISTORY_KEEP,
  type SaveDirLike,
} from './saveFiles.ts';

// Папка в памяти с API как у FileSystemDirectoryHandle. / In-memory directory handle.
class MemDir implements SaveDirLike {
  files = new Map<string, { data: Uint8Array; mtime: number }>();
  dirs = new Map<string, MemDir>();
  name: string;
  constructor(name: string) {
    this.name = name;
  }
  put(name: string, body: string, mtime = Date.now()) {
    this.files.set(name, { data: new TextEncoder().encode(body), mtime });
    return this;
  }
  text(name: string): string | undefined {
    const f = this.files.get(name);
    return f ? new TextDecoder().decode(f.data) : undefined;
  }
  async getFileHandle(name: string, opts?: { create?: boolean }) {
    if (!this.files.has(name)) {
      if (!opts?.create) throw new Error('NotFoundError');
      this.files.set(name, { data: new Uint8Array(), mtime: Date.now() });
    }
    const self = this;
    return {
      async getFile() {
        const f = self.files.get(name)!;
        return new File([f.data as BlobPart], name, { lastModified: f.mtime });
      },
      async createWritable() {
        const chunks: Uint8Array[] = [];
        return {
          async write(d: ArrayBuffer | Blob) {
            chunks.push(new Uint8Array(d instanceof Blob ? await d.arrayBuffer() : d));
          },
          async close() {
            const total = chunks.reduce((n, c) => n + c.length, 0);
            const out = new Uint8Array(total);
            let o = 0;
            for (const c of chunks) {
              out.set(c, o);
              o += c.length;
            }
            self.files.set(name, { data: out, mtime: Date.now() });
          },
        };
      },
    };
  }
  async getDirectoryHandle(name: string, opts?: { create?: boolean }) {
    let d = this.dirs.get(name);
    if (!d) {
      if (!opts?.create) throw new Error('NotFoundError');
      d = new MemDir(name);
      this.dirs.set(name, d);
    }
    return d;
  }
  async removeEntry(name: string) {
    if (!this.files.delete(name) && !this.dirs.delete(name)) throw new Error('NotFoundError');
  }
  async *values() {
    for (const n of this.files.keys()) yield { kind: 'file', name: n };
    for (const n of this.dirs.keys()) yield { kind: 'directory', name: n };
  }
}

const NOW = new Date(2026, 10, 24, 12, 0, 0);

test('suffixes and history names', () => {
  assert.equal(saveSuffixOf('Game (USA).SRM', 'Game (USA)'), '.srm');
  assert.equal(saveSuffixOf('Game (USA).state.auto', 'Game (USA)'), '.state.auto');
  assert.equal(saveSuffixOf('Game (USA)_1.mcd', 'game (usa)'), '_1.mcd');
  assert.equal(saveSuffixOf('Game (USA) 2.srm', 'Game (USA)'), '');
  assert.equal(saveSuffixOf('Game (USA).sfc', 'Game (USA)'), '');
  assert.equal(looksLikeSaveFile('x.state3'), true);
  assert.equal(looksLikeSaveFile('x.sfc'), false);
  assert.deepEqual(parseHistoryName('20261120-131830-2.srm'), { stamp: '20261120-131830', suffix: '.srm' });
  assert.equal(parseHistoryName('notes.txt'), null);
  assert.equal(formatSaveStamp(NOW), '20261124-120000');
  assert.equal(countSavesForRom(new Set(['game.srm', 'game.state', 'other.srm']), 'Game.sfc'), 2);
});

test('rename in place carries saves and history', async () => {
  const dir = new MemDir('snes');
  dir.put('Old.srm', 'sram').put('Old.state', 'st');
  const hist = await (await dir.getDirectoryHandle(SAVE_HISTORY_DIR, { create: true })).getDirectoryHandle('Old', { create: true });
  (hist as MemDir).put('20261120-101010.srm', 'older');

  const res = await carryRomSaves(dir, dir, 'Old', 'New (USA)', { now: NOW });
  assert.deepEqual(res, { moved: 2, conflicts: 0, history: 1 });
  assert.equal(dir.text('New (USA).srm'), 'sram');
  assert.equal(dir.text('New (USA).state'), 'st');
  assert.equal(dir.files.has('Old.srm'), false);
  const root = dir.dirs.get(SAVE_HISTORY_DIR)!;
  assert.equal(root.dirs.has('Old'), false);
  const newHist = root.dirs.get('New (USA)')!;
  assert.deepEqual([...newHist.files.keys()].sort(), ['20261120-101010.srm', '20261124-120000.srm', '20261124-120000.state']);
});

test('JP → RU: newer save wins, both kept', async () => {
  const jp = new MemDir('jp').put('Game (Japan).srm', 'jp', NOW.getTime() - 3600_000);
  const ru = new MemDir('ru').put('Game (Russia).srm', 'ru', NOW.getTime() - 48 * 3600_000);
  const res = await carryRomSaves(jp, ru, 'Game (Japan)', 'Game (Russia)', { now: NOW });
  assert.equal(res.conflicts, 1);
  assert.equal(ru.text('Game (Russia).srm'), 'jp');
  const hist = ru.dirs.get(SAVE_HISTORY_DIR)!.dirs.get('Game (Russia)')!;
  const bodies = [...hist.files.keys()].map((n) => hist.text(n)).sort();
  assert.deepEqual(bodies, ['jp', 'ru']);
  assert.equal(jp.files.size, 0);
});

test('older carried save does not replace a newer one', async () => {
  const a = new MemDir('a').put('B.srm', 'old', NOW.getTime() - 48 * 3600_000);
  const b = new MemDir('b').put('C.srm', 'new', NOW.getTime() - 3600_000);
  await carryRomSaves(a, b, 'B', 'C', { now: NOW });
  assert.equal(b.text('C.srm'), 'new');
  assert.equal(a.files.has('B.srm'), false);
  assert.equal(b.dirs.get(SAVE_HISTORY_DIR)!.dirs.get('C')!.files.size, 1);
});

test('copy mode leaves the source and nothing to do is cheap', async () => {
  const buf = new MemDir('buffer').put('G.sav', 'x');
  const lib = new MemDir('lib');
  await carryRomSaves(buf, lib, 'G', 'G (USA)', { mode: 'copy', now: NOW });
  assert.equal(buf.text('G.sav'), 'x');
  assert.equal(lib.text('G (USA).sav'), 'x');

  const empty = new MemDir('e').put('Rom.sfc', 'rom');
  const res = await carryRomSaves(empty, empty, 'Rom', 'Rom2', { now: NOW });
  assert.deepEqual(res, { moved: 0, conflicts: 0, history: 0 });
  assert.equal(empty.dirs.size, 0);
});

test('history is pruned to the limit', async () => {
  const dir = new MemDir('d').put('A.srm', 'cur');
  const hist = await (await dir.getDirectoryHandle(SAVE_HISTORY_DIR, { create: true })).getDirectoryHandle('A', { create: true });
  for (let i = 0; i < SAVE_HISTORY_KEEP + 3; i++) (hist as MemDir).put(`202611${String(10 + i).padStart(2, '0')}-000000.srm`, String(i));
  await carryRomSaves(dir, dir, 'A', 'B', { now: NOW });
  const newHist = dir.dirs.get(SAVE_HISTORY_DIR)!.dirs.get('B')!;
  assert.equal(newHist.files.size, SAVE_HISTORY_KEEP);
  assert.ok(newHist.files.has('20261124-120000.srm'));
});

test('build export syncs saves both ways, newer wins, both kept', async () => {
  const lib = new MemDir('lib')
    .put('A.srm', 'lib-only')
    .put('B.srm', 'lib-old', NOW.getTime() - 48 * 3600_000)
    .put('C.srm', 'lib-new', NOW.getTime() - 3600_000)
    .put('A.state', 'state-stays-home');
  const dev = new MemDir('sd')
    .put('Dev B.srm', 'dev-new', NOW.getTime() - 3600_000)
    .put('C.srm', 'dev-old', NOW.getTime() - 48 * 3600_000)
    .put('D.sav', 'dev-only');
  const { syncRomSavesWithDevice } = await import('./saveFiles.ts');
  const a = await syncRomSavesWithDevice(lib, 'A', dev, 'A', { now: NOW });
  assert.deepEqual(a, { toDevice: 1, fromDevice: 0, conflicts: 0 });
  assert.equal(dev.text('A.srm'), 'lib-only');
  assert.equal(dev.files.has('A.state'), false);

  const b = await syncRomSavesWithDevice(lib, 'B', dev, 'Dev B', { now: NOW });
  assert.deepEqual(b, { toDevice: 0, fromDevice: 1, conflicts: 1 });
  assert.equal(lib.text('B.srm'), 'dev-new');
  assert.equal(lib.dirs.get(SAVE_HISTORY_DIR)!.dirs.get('B')!.files.size, 1);

  const c = await syncRomSavesWithDevice(lib, 'C', dev, 'C', { now: NOW });
  assert.deepEqual(c, { toDevice: 1, fromDevice: 0, conflicts: 1 });
  assert.equal(dev.text('C.srm'), 'lib-new');
  const cHist = lib.dirs.get(SAVE_HISTORY_DIR)!.dirs.get('C')!;
  assert.deepEqual([...cHist.files.keys()].map((n) => cHist.text(n)), ['dev-old']);

  const d = await syncRomSavesWithDevice(lib, 'D', dev, 'D', { now: NOW });
  assert.deepEqual(d, { toDevice: 0, fromDevice: 1, conflicts: 0 });
  assert.equal(lib.text('D.sav'), 'dev-only');
  // Повтор ничего не меняет. / A second run is a no-op.
  assert.deepEqual(await syncRomSavesWithDevice(lib, 'C', dev, 'C', { now: NOW }), { toDevice: 0, fromDevice: 0, conflicts: 0 });
});
