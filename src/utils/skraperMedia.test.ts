import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isManualFile,
  isNonCoverDir,
  listMediaKindDirs,
  ManualIndex,
  manualStem,
  renamedMediaName,
  renameRomMediaInContainers,
} from './skraperMedia.ts';
import { classifyMediaName } from './mediaKinds.ts';
import { slotFromPath } from './localMediaIndex.ts';
import { MediaSourceIndex } from './buildMedia.ts';

// Простая файловая система в памяти с интерфейсом File System Access.
// A tiny in-memory file system with the File System Access interface.
type Node = { dirs: Map<string, Node>; files: Map<string, string> };
function mkTree(paths: Record<string, string>): Node {
  const root: Node = { dirs: new Map(), files: new Map() };
  for (const [p, body] of Object.entries(paths)) {
    const parts = p.split('/');
    const file = parts.pop()!;
    let n = root;
    for (const d of parts) {
      if (!n.dirs.has(d)) n.dirs.set(d, { dirs: new Map(), files: new Map() });
      n = n.dirs.get(d)!;
    }
    if (file) n.files.set(file, body);
  }
  return root;
}
function handle(name: string, n: Node): any {
  const fileHandle = (fname: string) => ({
    kind: 'file',
    name: fname,
    getFile: async () => {
      const body = n.files.get(fname) ?? '';
      return { name: fname, size: body.length, text: async () => body, arrayBuffer: async () => new TextEncoder().encode(body).buffer };
    },
    createWritable: async () => {
      let buf = '';
      return {
        write: async (d: any) => {
          buf = typeof d === 'string' ? d : typeof d?.text === 'function' ? await d.text() : String(d);
        },
        close: async () => {
          n.files.set(fname, buf);
        },
      };
    },
  });
  return {
    kind: 'directory',
    name,
    async *values() {
      for (const [k, v] of n.dirs) yield handle(k, v);
      for (const k of n.files.keys()) yield fileHandle(k);
    },
    getDirectoryHandle: async (d: string) => {
      const c = n.dirs.get(d);
      if (!c) throw new Error('NotFound');
      return handle(d, c);
    },
    getFileHandle: async (f: string, opts?: { create?: boolean }) => {
      if (!n.files.has(f)) {
        if (!opts?.create) throw new Error('NotFound');
        n.files.set(f, '');
      }
      return fileHandle(f);
    },
    removeEntry: async (f: string) => {
      n.files.delete(f);
    },
  };
}

test('manual files and stems', () => {
  assert.equal(isManualFile('Game (USA).pdf', 'psx/media/manuals'), true);
  assert.equal(isManualFile('Game-manual.pdf', 'psx'), true);
  assert.equal(isManualFile('Readme.pdf', 'psx'), false);
  assert.equal(isManualFile('Game.png', 'media/manuals'), false);
  assert.equal(manualStem('Game (USA)-manual.pdf'), 'Game (USA)');
  assert.equal(manualStem('Game (USA).pdf'), 'Game (USA)');
});

test('non-cover Skraper folders', () => {
  assert.equal(isNonCoverDir('psx/media/fanart'), true);
  assert.equal(isNonCoverDir('maps'), true);
  assert.equal(isNonCoverDir('media/images'), false);
  // Фон и карты не становятся обложкой в разборе «Готовых медиа». / Fan art and maps are not covers.
  assert.equal(slotFromPath('media/fanart/Game.png'), null);
  assert.equal(slotFromPath('media/maps/Game.png'), null);
  assert.equal(slotFromPath('media/images/Game.png'), 'image');
  assert.equal(slotFromPath('media/screenshottitle/Game.png'), 'thumb');
  assert.equal(slotFromPath('media/wheel-hd/Game.png'), 'marquee');
});

test('Skraper folder names map to kinds', () => {
  assert.equal(classifyMediaName('Game.png', 'box2dfront'), 'boxart');
  assert.equal(classifyMediaName('Game.png', 'screenshottitle'), 'title');
  assert.equal(classifyMediaName('Game.png', 'wheelhd'), 'marquee');
  assert.equal(classifyMediaName('Game.png', 'screenshot'), 'snap');
});

test('ManualIndex finds by any key', () => {
  const idx = new ManualIndex<string>();
  idx.add(['game (usa)', 'game'], 'F', 'psx/media/manuals/Game (USA).pdf');
  assert.equal(idx.lookup(['nope', 'game'])?.relPath, 'psx/media/manuals/Game (USA).pdf');
  assert.equal(idx.lookup(['nope']), undefined);
});

test('listMediaKindDirs descends into media/', async () => {
  const dir = handle('psx', mkTree({ 'images/a.png': '', 'media/videos/a.mp4': '', 'media/manuals/a.pdf': '', 'Game.chd': '' }));
  const rels = (await listMediaKindDirs<any>(dir)).map((d) => d.relPath).sort();
  assert.deepEqual(rels, ['images', 'media', 'media/manuals', 'media/videos']);
});

test('build export finds Skraper media in media/*', async () => {
  const dir = handle(
    'psx',
    mkTree({
      'Game (USA).chd': '',
      'media/box2dfront/Game (USA).png': 'BOX',
      'media/videos/Game (USA).mp4': 'VID',
      'media/wheel/Game (USA).png': 'LOGO',
      'media/fanart/Game (USA).png': 'FAN',
    })
  );
  const found = await new MediaSourceIndex().find(dir, 'Game (USA).chd');
  assert.equal(await (await found.thumbnail!.getFile()).text(), 'BOX');
  assert.equal(await (await found.video!.getFile()).text(), 'VID');
  assert.equal(await (await found.marquee!.getFile()).text(), 'LOGO');
  assert.equal(found.image, undefined);
});

test('renamedMediaName keeps suffixes and ignores other ROMs', () => {
  assert.equal(renamedMediaName('Old.png', 'Old', 'New'), 'New.png');
  assert.equal(renamedMediaName('Old-manual.pdf', 'Old', 'New'), 'New-manual.pdf');
  assert.equal(renamedMediaName('Old 2.png', 'Old', 'New'), null);
  assert.equal(renamedMediaName('Old (USA).png', 'Old (USA)', 'New'), 'New.png');
});

test('renameRomMediaInContainers renames in every media/* folder', async () => {
  const t = mkTree({ 'media/images/Old.png': 'I', 'media/manuals/Old.pdf': 'M', 'media/images/Other.png': 'O', 'Old.chd': '' });
  const n = await renameRomMediaInContainers(handle('psx', t), 'Old', 'New');
  assert.equal(n, 2);
  const media = t.dirs.get('media')!;
  assert.deepEqual([...media.dirs.get('images')!.files.keys()].sort(), ['New.png', 'Other.png']);
  assert.equal(media.dirs.get('manuals')!.files.get('New.pdf'), 'M');
});
