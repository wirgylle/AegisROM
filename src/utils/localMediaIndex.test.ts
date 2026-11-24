import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLocalConsoleIndex, findConsoleDir, lookupLocalMedia, slotFromPath, type DirLike, type FileLike } from './localMediaIndex.ts';

// Дерево из путей: { 'media/images/a.png': '' } → фейковые хэндлы.
// A tree from paths → fake handles.
function tree(name: string, files: Record<string, string>): DirLike {
  type Node = { dirs: Map<string, Node>; files: Map<string, string> };
  const root: Node = { dirs: new Map(), files: new Map() };
  for (const [p, body] of Object.entries(files)) {
    const parts = p.split('/');
    const file = parts.pop()!;
    let n = root;
    for (const d of parts) {
      if (!n.dirs.has(d)) n.dirs.set(d, { dirs: new Map(), files: new Map() });
      n = n.dirs.get(d)!;
    }
    n.files.set(file, body);
  }
  const mk = (nm: string, n: Node): DirLike => ({
    kind: 'directory',
    name: nm,
    async *values() {
      for (const [dn, dnode] of n.dirs) yield mk(dn, dnode);
      for (const [fn, body] of n.files) {
        const f: FileLike = {
          kind: 'file',
          name: fn,
          async getFile() {
            return { text: async () => body, arrayBuffer: async () => new TextEncoder().encode(body).buffer as ArrayBuffer };
          },
        };
        yield f;
      }
    },
  });
  return mk(name, root);
}

test('slotFromPath: folders and suffixes', () => {
  assert.equal(slotFromPath('media/box2dfront/Contra (USA).png'), 'image');
  assert.equal(slotFromPath('media/screenshot/Contra (USA).png'), 'thumb');
  assert.equal(slotFromPath('media/wheel/Contra (USA).png'), 'marquee');
  assert.equal(slotFromPath('media/videos/Contra (USA).mp4'), 'video');
  assert.equal(slotFromPath('images/Contra (USA)-thumb.png'), 'thumb');
  assert.equal(slotFromPath('images/Contra (USA).png'), 'image');
  assert.equal(slotFromPath('notes/readme.txt'), null);
});

test('gamelist.xml paths win, folder layout fills the rest', async () => {
  const dir = tree('nes', {
    'gamelist.xml':
      '<gameList><game><path>./Contra (USA).zip</path><name>Contra</name>' +
      '<image>./media/mix/Contra (USA).png</image><video>./media/videos/Contra (USA).mp4</video></game></gameList>',
    'media/mix/Contra (USA).png': 'mix',
    'media/box2dfront/Contra (USA).png': 'box',
    'media/videos/Contra (USA).mp4': 'vid',
    'media/wheel/Contra (USA).png': 'wheel',
    'media/screenshot/Metroid (USA).png': 'ss',
  });
  const idx = await buildLocalConsoleIndex(dir);
  assert.equal(idx.fromGamelist, 1);
  const contra = lookupLocalMedia(idx, 'Contra (USA)', 'Contra')!;
  assert.equal(contra.image?.path, 'media/mix/contra (usa).png');
  assert.equal(contra.video?.path, 'media/videos/contra (usa).mp4');
  assert.equal(contra.marquee?.path, 'media/wheel/contra (usa).png');
  // По нормализованному названию: другой регион в имени файла рома.
  // By normalized title: another region in the ROM file name.
  const metroid = lookupLocalMedia(idx, 'Metroid (Europe)', 'Metroid')!;
  assert.equal(metroid.thumb?.path, 'media/screenshot/metroid (usa).png');
  assert.equal(lookupLocalMedia(idx, 'Zelda', 'Zelda'), null);
});

test('numeric names match only exactly', async () => {
  const idx = await buildLocalConsoleIndex(tree('arcade', { 'images/1942 (Japan).png': 'x' }));
  assert.equal(lookupLocalMedia(idx, '1942 (World)', '1942'), null);
  assert.ok(lookupLocalMedia(idx, '1942 (Japan)', '1942'));
});

test('findConsoleDir: by name, inside downloaded_media, or the folder itself', async () => {
  const root = tree('skraper', { 'nes/gamelist.xml': '', 'snes/gamelist.xml': '' });
  assert.equal((await findConsoleDir(root, ['SNES']))?.name, 'snes');
  const esde = tree('ES-DE', { 'downloaded_media/megadrive/covers/a.png': '' });
  assert.equal((await findConsoleDir(esde, ['genesis', 'megadrive']))?.name, 'megadrive');
  const flat = tree('mygames', { 'gamelist.xml': '' });
  assert.equal((await findConsoleDir(flat, ['gba']))?.name, 'mygames');
  assert.equal(await findConsoleDir(tree('x', { 'a/b.png': '' }), ['gba']), null);
});
