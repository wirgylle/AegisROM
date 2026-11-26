import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyConsolePlan,
  findConsoleDirsWithMedia,
  matchRomStem,
  normSlotOf,
  planConsoleMedia,
  rewriteGamelistPaths,
  sameBytes,
} from './mediaNormalize.ts';

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
    getFile: async () => new Blob([n.files.get(fname) ?? '']),
    createWritable: async () => {
      let buf = '';
      return {
        write: async (d: any) => {
          buf = typeof d === 'string' ? d : await d.text();
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
      for (const [k, v] of [...n.dirs]) yield handle(k, v);
      for (const k of [...n.files.keys()]) yield fileHandle(k);
    },
    getDirectoryHandle: async (d: string, opts?: { create?: boolean }) => {
      if (!n.dirs.has(d)) {
        if (!opts?.create) throw new Error('NotFound');
        n.dirs.set(d, { dirs: new Map(), files: new Map() });
      }
      return handle(d, n.dirs.get(d)!);
    },
    getFileHandle: async (f: string, opts?: { create?: boolean }) => {
      if (!n.files.has(f)) {
        if (!opts?.create) throw new Error('NotFound');
        n.files.set(f, '');
      }
      return fileHandle(f);
    },
    removeEntry: async (f: string) => {
      if (n.files.has(f)) n.files.delete(f);
      else n.dirs.delete(f);
    },
  };
}
const ls = (n: Node, path: string) => {
  let x = n;
  for (const p of path.split('/')) x = x.dirs.get(p)!;
  return x ? [...x.files.keys()].sort() : [];
};

test('normSlotOf maps Skraper folders and suffixes', () => {
  assert.equal(normSlotOf('Game.png', 'box2dfront')?.slot, 'boxart');
  assert.equal(normSlotOf('Game.png', 'screenshot')?.slot, 'snap');
  assert.equal(normSlotOf('Game.png', 'wheel')?.slot, 'marquee');
  assert.equal(normSlotOf('Game.mp4', 'videos')?.slot, 'video');
  assert.equal(normSlotOf('Game.pdf', 'manuals')?.slot, 'manual');
  assert.equal(normSlotOf('Game-thumb.png', 'images')?.slot, 'snap');
  assert.equal(normSlotOf('Game.txt', 'videos'), null);
  assert.equal(normSlotOf('Game.png', 'unknownfolder'), null);
  // Папки Skraper у Valentin. / Valentin's Skraper folders.
  assert.equal(normSlotOf('Game.png', 'boxes')?.slot, 'boxart');
  assert.equal(normSlotOf('Game.png', 'wheels')?.slot, 'marquee');
  assert.equal(normSlotOf('Game.png', 'screenmarquee')?.slot, 'marquee');
  assert.equal(normSlotOf('Game.png', 'screenmarquee')?.own, 'screenmarquee');
  assert.equal(normSlotOf('Game.png', 'fanart')?.slot, 'fanart');
  assert.equal(normSlotOf('Game.png', 'maps')?.slot, 'map');
  assert.equal(normSlotOf('Game.pdf', 'maps')?.slot, 'map');
  assert.equal(normSlotOf('Game.png', 'support')?.slot, 'support');
  assert.equal(normSlotOf('Game.png', 'supporttexture')?.slot, 'supporttexture');
  assert.equal(normSlotOf('Game.png', 'steamgrid')?.slot, 'steamgrid');
  assert.equal(normSlotOf('Game.pdf', 'tipsandtricks')?.slot, 'tips');
  assert.equal(normSlotOf('Game.txt', 'tipsandtricks')?.slot, 'tips');
  assert.equal(normSlotOf('Game.png', 'images')?.own, 'image');
});

test('matchRomStem: exact, then unique normalized', () => {
  const roms = ['Contra (USA)', 'Contra (Japan)', 'Final Fantasy VII (Disc 1)'];
  assert.equal(matchRomStem('contra (usa)', roms), 'Contra (USA)');
  assert.equal(matchRomStem('Contra', roms), null); // two candidates
  assert.equal(matchRomStem('Final Fantasy VII', roms), 'Final Fantasy VII (Disc 1)');
  assert.equal(matchRomStem('1942', ['1942 (Japan)']), null);
});

test('plan + apply: move, rename, duplicates, conflicts, gamelist', async () => {
  const t = mkTree({
    'Game (USA).chd': 'ROM',
    'Other (Europe).sfc': 'ROM',
    'media/box2dfront/Game (USA).png': 'BOX',
    'media/images/Game (USA).png': 'BOX', // та же картинка / identical
    'media/screenshot/Game (USA).png': 'SNAP',
    'media/videos/Game (USA).mp4': 'VID',
    'media/manuals/Game (USA).pdf': 'PDF',
    'media/wheel/Other.png': 'LOGO', // переименуется / renamed
    'media/fanart/Game (USA).png': 'FAN',
    'media/box2dfront/Unknown Game.png': 'X',
    'images/Other (Europe)-image.png': 'OLD',
    'media/box2dfront/Other (Europe).png': 'NEW', // конфликт / conflict
    'gamelist.xml': '<gameList><game><path>./Game (USA).chd</path><image>./media/box2dfront/Game (USA).png</image><manual>./media/manuals/Game (USA).pdf</manual></game></gameList>',
  });
  const dir = handle('psx', t);
  const plan = await planConsoleMedia(dir, 'psx');
  const by = (type: string) => plan.actions.filter((a) => a.type === type).map((a) => a.from).sort();
  assert.deepEqual(by('move'), [
    'media/box2dfront/Game (USA).png',
    'media/fanart/Game (USA).png',
    'media/manuals/Game (USA).pdf',
    'media/screenshot/Game (USA).png',
    'media/videos/Game (USA).mp4',
    'media/wheel/Other.png',
  ]);
  assert.deepEqual(by('duplicate'), ['media/images/Game (USA).png']);
  assert.deepEqual(by('conflict'), ['media/box2dfront/Other (Europe).png']);
  const wheel = plan.actions.find((a) => a.from === 'media/wheel/Other.png') as any;
  assert.equal(wheel.to, 'marquees/Other (Europe)-marquee.png');
  assert.equal(wheel.renamed, true);

  // Без удаления дублей: дубль остаётся. / Without duplicate deletion the duplicate stays.
  const r = await applyConsolePlan(plan, { deleteDuplicates: false });
  assert.deepEqual(r, { moved: 6, deleted: 0, failed: 0 });
  assert.deepEqual(ls(t, 'images'), [
    'Game (USA)-fanart.png',
    'Game (USA)-image.png',
    'Game (USA)-thumb.png',
    'Other (Europe)-image.png',
  ]);
  assert.equal(t.dirs.get('images')!.files.get('Other (Europe)-image.png'), 'OLD');
  assert.deepEqual(ls(t, 'videos'), ['Game (USA)-video.mp4']);
  assert.deepEqual(ls(t, 'manuals'), ['Game (USA).pdf']);
  assert.deepEqual(ls(t, 'media/images'), ['Game (USA).png']);
  assert.ok(!t.dirs.get('media')!.dirs.has('fanart'), 'fan art moved too');
  assert.ok(!t.dirs.get('media')!.dirs.has('videos'), 'emptied folder removed');
  const gl = t.files.get('gamelist.xml')!;
  assert.match(gl, /<image>\.\/images\/Game \(USA\)-image\.png<\/image>/);
  assert.match(gl, /<manual>\.\/manuals\/Game \(USA\)\.pdf<\/manual>/);

  // Второй проход с удалением дублей. / A second pass with duplicate deletion.
  const plan2 = await planConsoleMedia(dir, 'psx');
  assert.deepEqual(plan2.actions.filter((a) => a.type === 'duplicate').map((a) => a.from), ['media/images/Game (USA).png']);
  const r2 = await applyConsolePlan(plan2, { deleteDuplicates: true });
  assert.equal(r2.deleted, 1);
  assert.ok(!t.dirs.get('media')!.dirs.has('images'));
});

test('findConsoleDirsWithMedia finds consoles under roms/', async () => {
  const t = mkTree({ 'roms/psx/media/images/a.png': '', 'roms/nes/a.nes': '', 'snes/media/videos/b.mp4': '' });
  const found = (await findConsoleDirsWithMedia(handle('root', t))).map((f) => f.path).sort();
  assert.deepEqual(found, ['roms/psx', 'snes']);
});

test('rewriteGamelistPaths handles escaped ampersands', () => {
  const xml = '<image>./media/images/A &amp; B.png</image>';
  assert.equal(
    rewriteGamelistPaths(xml, [{ from: 'media/images/A & B.png', to: 'images/A & B-image.png' }]),
    '<image>./images/A &amp; B-image.png</image>'
  );
});

test('all Skraper folders: extras move under their own names, stand-ins keep their kind', async () => {
  const t = mkTree({
    'Battletoads (USA).nes': 'ROM',
    'media/boxes/Battletoads (USA).png': 'BOX',
    'media/images/Battletoads (USA).png': 'MIX', // другой файл: едет как -mix / different file: goes as -mix
    'media/screenshot/Battletoads (USA).png': 'SNAP',
    'media/wheels/Battletoads (USA).png': 'WHEEL',
    'media/screenmarquee/Battletoads (USA).png': 'SM',
    'media/steamgrid/Battletoads (USA).png': 'GRID',
    'media/support/Battletoads (USA).png': 'CART',
    'media/supporttexture/Battletoads (USA).png': 'TEX',
    'media/maps/Battletoads (USA).png': 'MAP',
    'media/tipsandtricks/Battletoads (USA).pdf': 'TIPS',
    'media/fanart/Battletoads (USA).jpg': 'FAN',
    'media/videos/Battletoads (USA).mp4': 'VID',
    'media/manuals/Battletoads (USA).pdf': 'MAN',
  });
  const dir = handle('nes', t);
  let seen = 0;
  const plan = await planConsoleMedia(dir, 'nes', { onFile: () => seen++ });
  assert.equal(seen, 13);
  const moves = Object.fromEntries(plan.actions.filter((a) => a.type === 'move').map((a: any) => [a.from.split('/')[1], a.to]));
  assert.deepEqual(moves, {
    boxes: 'images/Battletoads (USA)-image.png',
    images: 'images/Battletoads (USA)-mix.png',
    screenshot: 'images/Battletoads (USA)-thumb.png',
    wheels: 'marquees/Battletoads (USA)-marquee.png',
    screenmarquee: 'marquees/Battletoads (USA)-screenmarquee.png',
    steamgrid: 'images/Battletoads (USA)-steamgrid.png',
    support: 'images/Battletoads (USA)-cartridge.png',
    supporttexture: 'images/Battletoads (USA)-supporttexture.png',
    maps: 'images/Battletoads (USA)-map.png',
    tipsandtricks: 'manuals/Battletoads (USA)-tips.pdf',
    fanart: 'images/Battletoads (USA)-fanart.jpg',
    videos: 'videos/Battletoads (USA)-video.mp4',
    manuals: 'manuals/Battletoads (USA).pdf',
  });
  const r = await applyConsolePlan(plan, { deleteDuplicates: false });
  assert.equal(r.moved, 13);
  assert.ok(!t.dirs.has('media'), 'media/ emptied and removed');
});

test('screen marquee becomes the logo when there is no wheel', async () => {
  const t = mkTree({ 'A.nes': 'R', 'media/screenmarquee/A.png': 'SM' });
  const plan = await planConsoleMedia(handle('nes', t), 'nes');
  assert.deepEqual(
    plan.actions.map((a: any) => a.to),
    ['marquees/A-marquee.png']
  );
});

test('plan and apply stop on abort', async () => {
  const t = mkTree({ 'A.nes': 'R', 'media/boxes/A.png': 'B', 'media/fanart/A.png': 'F' });
  const ac = new AbortController();
  ac.abort();
  await assert.rejects(planConsoleMedia(handle('nes', t), 'nes', { signal: ac.signal }), /aborted/);
  const plan = await planConsoleMedia(handle('nes', t), 'nes');
  const r = await applyConsolePlan(plan, { deleteDuplicates: false, signal: ac.signal });
  assert.equal(r.moved, 0);
  assert.equal(r.aborted, true);
});

test('sameBytes compares big files in chunks', async () => {
  const big = new Uint8Array(3 * 1024 * 1024 + 5);
  big[big.length - 1] = 7;
  const other = big.slice();
  assert.equal(await sameBytes(new Blob([big]), new Blob([other])), true);
  other[other.length - 1] = 8;
  assert.equal(await sameBytes(new Blob([big]), new Blob([other])), false);
});
