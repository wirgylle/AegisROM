import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildLocalConsoleIndex,
  findConsoleDir,
  joinLinkPath,
  lookupLocalMedia,
  readLocalMedia,
  slotFromPath,
  symlinkTarget,
  type DirLike,
  type FileLike,
} from './localMediaIndex.ts';

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

// Клон libretro-thumbnails на Windows: симлинки — это текстовые файлы с путём цели.
// A libretro-thumbnails clone on Windows: symlinks are text files holding the target path.
test('libretro-thumbnails clone: Named_Logos is a logo, symlink stubs are followed', async () => {
  const png = '\x89PNG real image';
  const root = tree('libretro-thumbnails', {
    'Sony - PlayStation/Named_Boxarts/Final Fantasy VII (Europe).png': png,
    'Sony - PlayStation/Named_Boxarts/Final Fantasy VII (Europe) (Disc 1).png': 'Final Fantasy VII (Europe).png',
    'Sony - PlayStation/Named_Logos/Final Fantasy VII (Europe) (Disc 1).png': '../Named_Logos/Missing.png',
    'Sony - PlayStation/Named_Snaps/Final Fantasy VII (Europe) (Disc 1).png': 'Final Fantasy VII (Europe) (Disc 2).png',
    'Sony - PlayStation/Named_Snaps/Final Fantasy VII (Europe) (Disc 2).png': 'Final Fantasy VII (Europe).png',
    'Sony - PlayStation/Named_Snaps/Final Fantasy VII (Europe).png': png,
  });
  const dir = await findConsoleDir(root, ['psx', 'psx', 'Sony - PlayStation']);
  assert.ok(dir);
  const idx = await buildLocalConsoleIndex(dir!);
  const hit = lookupLocalMedia(idx, 'Final Fantasy VII (Europe) (Disc 1)', 'Final Fantasy VII');
  assert.ok(hit?.image && hit?.thumb && hit?.marquee);

  const img = await readLocalMedia(hit!.image!);
  assert.equal(img.status, 'ok');
  assert.equal(img.viaLink, true);
  assert.equal(new TextDecoder().decode(img.buf!), png);

  // Две ссылки подряд. / Two links in a row.
  const snap = await readLocalMedia(hit!.thumb!);
  assert.equal(snap.status, 'ok');
  assert.equal(new TextDecoder().decode(snap.buf!), png);

  // Цели нет. / The target is missing.
  assert.equal((await readLocalMedia(hit!.marquee!)).status, 'link-broken');
});

test('symlinkTarget: only short text paths to media files', () => {
  const enc = (s: string) => new TextEncoder().encode(s).buffer as ArrayBuffer;
  assert.equal(symlinkTarget(enc('Contra (USA).png')), 'Contra (USA).png');
  assert.equal(symlinkTarget(enc('notes.txt')), null);
  assert.equal(symlinkTarget(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]).buffer), null);
  assert.equal(joinLinkPath('named_boxarts/a.png', '../Named_Snaps/b.png'), 'Named_Snaps/b.png');
  assert.equal(joinLinkPath('a.png', '../../x.png'), null);
});
