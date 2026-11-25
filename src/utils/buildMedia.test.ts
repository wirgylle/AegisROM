// Тесты медиа сборки: `npm test`. / Build media tests: `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MediaSourceIndex,
  buildGamelistXml,
  classifyMediaFileName,
  planMediaTargets,
  profileMediaLayout,
  resolveGameMedia,
  rowMediaUrls,
  extOfMediaUrl,
  type FoundMedia,
  type MediaUrlFetch,
} from './buildMedia.ts';

// Простая папка в памяти с интерфейсом FileSystemDirectoryHandle.
// A tiny in-memory folder with the FileSystemDirectoryHandle interface.
type Tree = { [name: string]: string | Tree };
function dirHandle(name: string, tree: Tree): any {
  return {
    kind: 'directory',
    name,
    async *values() {
      for (const [k, v] of Object.entries(tree)) {
        yield typeof v === 'string' ? fileHandle(k, v) : dirHandle(k, v);
      }
    },
    async getDirectoryHandle(n: string) {
      const v = tree[n];
      if (!v || typeof v === 'string') throw new Error('NotFoundError');
      return dirHandle(n, v);
    },
    async getFileHandle(n: string) {
      const v = tree[n];
      if (typeof v !== 'string') throw new Error('NotFoundError');
      return fileHandle(n, v);
    },
  };
}
function fileHandle(name: string, body: string): any {
  return { kind: 'file', name, async getFile() { return new File([body], name); } };
}

test('classifyMediaFileName: suffixes and folder kinds', () => {
  assert.deepEqual(classifyMediaFileName('1942 (USA)-image.png', 'image'), { stem: '1942 (usa)', kind: 'image' });
  assert.deepEqual(classifyMediaFileName('1942 (USA)-thumb.jpg', 'image'), { stem: '1942 (usa)', kind: 'thumbnail' });
  assert.deepEqual(classifyMediaFileName('1942 (USA)-marquee.png', 'image'), { stem: '1942 (usa)', kind: 'marquee' });
  assert.deepEqual(classifyMediaFileName('1942 (USA)-video.mp4', 'video'), { stem: '1942 (usa)', kind: 'video' });
  assert.deepEqual(classifyMediaFileName('1942 (USA).png', 'thumbnail'), { stem: '1942 (usa)', kind: 'thumbnail' });
  assert.deepEqual(classifyMediaFileName('1942 (USA).mp4', 'image'), { stem: '1942 (usa)', kind: 'video' });
  assert.equal(classifyMediaFileName('readme.txt', 'image'), null);
});

test('MediaSourceIndex: gamelist paths first, then files by ROM name', async () => {
  const nes = dirHandle('nes', {
    'gamelist.xml': `<gameList><game><path>./E.T. (USA).zip</path><name>E.T.</name>
      <image>./media/et-shot.png</image><desc>Alien</desc></game></gameList>`,
    media: { 'et-shot.png': 'X' },
    images: {
      'E.T. (USA)-thumb.png': 'T',
      'E.T. (USA)-image.png': 'I-unused',
      '1942 (USA)-image.png': 'I',
      '1942 (USA)-marquee.png': 'M',
    },
    videos: { '1942 (USA)-video.mp4': 'V' },
    '1942 (USA).zip': 'ROM',
  });
  const idx = new MediaSourceIndex();

  const et = await idx.find(nes, 'E.T. (USA).zip');
  assert.equal(await (await et.image!.getFile()).text(), 'X', 'gamelist <image> wins over the -image file');
  assert.equal(await (await et.thumbnail!.getFile()).text(), 'T');
  assert.equal(et.video, undefined);
  assert.equal((await idx.gamelistEntry(nes, 'E.T. (USA).zip'))?.fields.desc, 'Alien');

  const g = await idx.find(nes, '1942 (USA).zip');
  assert.deepEqual(Object.keys(g).sort(), ['image', 'marquee', 'video']);
  assert.equal(g.video!.ext, '.mp4');

  assert.deepEqual(await idx.find(nes, 'Missing.zip'), {});
});

const fm = (ext: string): FoundMedia => ({ ext, getFile: async () => new File([''], 'x' + ext) });

test('planMediaTargets: R36S / EmulationStation layout', () => {
  const folders = ['images', 'marquees', 'videos'];
  assert.equal(profileMediaLayout(folders), 'es');
  const t = planMediaTargets(
    'es',
    folders,
    { image: true, thumbnail: true, marquee: true, video: false },
    { image: fm('.png'), thumbnail: fm('.jpg'), marquee: fm('.png'), video: fm('.mp4') },
    '1942 (USA)'
  );
  assert.deepEqual(
    t.map((x) => `${x.folder}/${x.name}`),
    ['images/1942 (USA)-image.png', 'images/1942 (USA)-thumb.jpg', 'marquees/1942 (USA)-marquee.png']
  );
});

test('planMediaTargets: covers and single-picture layouts', () => {
  assert.equal(profileMediaLayout(['covers', 'marquees', 'videos']), 'covers');
  assert.equal(profileMediaLayout(['Imgs']), 'single');
  assert.equal(profileMediaLayout(['ICON0']), 'none');
  assert.equal(profileMediaLayout([]), 'none');

  const all = { image: true, thumbnail: true, marquee: true, video: true };
  const covers = planMediaTargets('covers', ['covers', 'marquees', 'videos'], all, { image: fm('.png'), video: fm('.mp4') }, 'Game');
  assert.deepEqual(covers.map((x) => `${x.folder}/${x.name}`), ['covers/Game.png', 'videos/Game.mp4']);

  const miyoo = planMediaTargets('single', ['Imgs'], all, { image: fm('.png'), thumbnail: fm('.png'), video: fm('.mp4') }, 'Game');
  assert.deepEqual(miyoo.map((x) => `${x.folder}/${x.name}`), ['Imgs/Game.png']);
  assert.equal(miyoo[0].kind, 'thumbnail');

  assert.deepEqual(planMediaTargets('none', [], all, { image: fm('.png') }, 'Game'), []);
});

test('buildGamelistXml: writes our games and keeps other entries', () => {
  const existing = `<?xml version="1.0"?>
<gameList>
  <game><path>./Other.nes</path><name>Other</name></game>
  <game><path>./1942 (USA).nes</path><name>Old name</name></game>
</gameList>`;
  const xml = buildGamelistXml(
    [
      {
        path: '1942 (USA).nes',
        name: '1942 & Co',
        media: { image: 'images/1942 (USA)-image.png' },
        info: { desc: 'Plane &amp; shooter', developer: 'Capcom' },
      },
    ],
    existing
  );
  assert.match(xml, /<path>\.\/Other\.nes<\/path>/);
  assert.doesNotMatch(xml, /Old name/);
  assert.match(xml, /<name>1942 &amp; Co<\/name>/);
  assert.match(xml, /<image>\.\/images\/1942 \(USA\)-image\.png<\/image>/);
  assert.match(xml, /<desc>Plane &amp; shooter<\/desc>/);
  assert.equal((xml.match(/<game>/g) || []).length, 2);
});

// ---------------------------------------------------------------------------
// Источники как у Библиотеки (баг «Медиа найдены у 2 из 13363»).
// Library-like sources (the "media found for 2 of 13363" bug).
// ---------------------------------------------------------------------------

// Файлы «на диске» для нативных ссылок и blob: сеанса. / "On disk" files for native links and session blobs.
function fakeFetch(files: Record<string, { body: string; type: string }>): MediaUrlFetch {
  return async (url, init) => {
    const f = files[url];
    if (!f) return new Response(null, { status: 404 });
    return new Response(init?.method === 'HEAD' ? null : f.body, { status: 200, headers: { 'content-type': f.type } });
  };
}
const nativeUrl = (p: string) => '/api/native/fs/media?path=' + encodeURIComponent(p);

test('rowMediaUrls: local links by build kind, internet links skipped', () => {
  const u = rowMediaUrls({
    media: { boxart: 'blob:a', snap: nativeUrl('D:/x/snap.png'), marquee: 'https://thumbnails.libretro.com/x.png' },
    videoUrl: nativeUrl('D:/x/v.mp4'),
  });
  assert.equal(u.thumbnail, 'blob:a');
  assert.equal(u.image, nativeUrl('D:/x/snap.png'));
  assert.equal(u.marquee, undefined, 'internet link is not downloaded');
  assert.equal(u.video, nativeUrl('D:/x/v.mp4'));
  assert.deepEqual(rowMediaUrls({ boxArtUrl: 'https://thumbnails.libretro.com/a/Named_Boxarts/b.png' }), {});
  assert.equal(extOfMediaUrl(nativeUrl('D:\\Roms\\snes\\media\\images\\Mario (USA).JPG')), '.jpg');
});

test('resolveGameMedia: Skraper media/* next to the ROM, no gamelist.xml', async () => {
  // <консоль>/media/{images,videos,marquees} как у Skraper 1.4.2. / <console>/media/... as Skraper 1.4.2 lays it out.
  const snes = dirHandle('snes', {
    'Super Metroid (USA).sfc': 'ROM',
    media: {
      images: { 'Super Metroid (USA).png': 'IMG' },
      box2dfront: { 'Super Metroid (USA).png': 'BOX' },
      marquees: { 'Super Metroid (USA).png': 'WHEEL' },
      videos: { 'Super Metroid (USA).mp4': 'VID' },
      manuals: { 'Super Metroid (USA).pdf': 'PDF' },
    },
  });
  const m = await resolveGameMedia({ index: new MediaSourceIndex(), dir: snes, romFileName: 'Super Metroid (USA).sfc', fetchUrl: fakeFetch({}) });
  assert.deepEqual(Object.keys(m).sort(), ['image', 'marquee', 'thumbnail', 'video']);
  assert.equal(await (await m.thumbnail!.getFile()).text(), 'BOX');
  assert.equal(await (await m.video!.getFile()).text(), 'VID');
});

test('resolveGameMedia: the library link wins, even from a separate libretro-thumbnails folder', async () => {
  const snes = dirHandle('snes', {
    'Chrono Trigger (USA).sfc': 'ROM',
    images: { 'Chrono Trigger (USA)-thumb.png': 'OLD-THUMB' },
  });
  const boxPath = 'E:/libretro-thumbnails/Nintendo - Super Nintendo Entertainment System/Named_Boxarts/Chrono Trigger (USA).png';
  const fetchUrl = fakeFetch({
    [nativeUrl(boxPath)]: { body: 'LIB-BOX', type: 'image/png' },
    'blob:snap-1': { body: 'SNAP', type: 'image/jpeg' },
  });
  const m = await resolveGameMedia({
    index: new MediaSourceIndex(),
    dir: snes,
    romFileName: 'Chrono Trigger (USA).sfc',
    row: { media: { boxart: nativeUrl(boxPath), snap: 'blob:snap-1' } },
    fetchUrl,
  });
  assert.equal(await (await m.thumbnail!.getFile()).text(), 'LIB-BOX');
  assert.equal(m.thumbnail!.ext, '.png');
  assert.equal(await (await m.image!.getFile()).text(), 'SNAP');
  assert.equal(m.image!.ext, '.jpg', 'blob: extension comes from Content-Type');
});

test('resolveGameMedia: media only in the database, no ROM folder handle', async () => {
  const m = await resolveGameMedia({
    index: new MediaSourceIndex(),
    dir: undefined,
    romFileName: 'Sonic (USA).md',
    row: { boxArtUrl: nativeUrl('D:/Roms/megadrive/media/box2dfront/Sonic (USA).png') },
    fetchUrl: fakeFetch({ [nativeUrl('D:/Roms/megadrive/media/box2dfront/Sonic (USA).png')]: { body: 'B', type: 'image/png' } }),
  });
  assert.deepEqual(Object.keys(m), ['thumbnail']);
});

test('resolveGameMedia: a dead database link or gamelist path falls back to files by name', async () => {
  const gb = dirHandle('gb', {
    'gamelist.xml': `<gameList><game><path>./Tetris (World).gb</path><image>./downloaded_images/gone.png</image></game></gameList>`,
    'Tetris (World).gb': 'ROM',
    media: { images: { 'Tetris (World).png': 'REAL' } },
  });
  const m = await resolveGameMedia({
    index: new MediaSourceIndex(),
    dir: gb,
    romFileName: 'Tetris (World).gb',
    row: { media: { image: nativeUrl('C:/deleted/Tetris.png') } },
    fetchUrl: fakeFetch({}),
  });
  assert.equal(await (await m.image!.getFile()).text(), 'REAL');
});

test('resolveGameMedia: count over a library matches what is resolvable', async () => {
  // 3 игры: у одной медиа в media/*, у другой только ссылка в базе, у третьей ничего.
  // 3 games: one has media in media/*, one only a database link, one nothing.
  const psx = dirHandle('psx', {
    'A.chd': 'R',
    'B.chd': 'R',
    'C.chd': 'R',
    media: { images: { 'A.png': 'A' } },
  });
  const fetchUrl = fakeFetch({ [nativeUrl('F:/covers/B.png')]: { body: 'B', type: 'image/png' } });
  const rows = [
    { file: 'A.chd', row: {} },
    { file: 'B.chd', row: { boxArtUrl: nativeUrl('F:/covers/B.png') } },
    { file: 'C.chd', row: { boxArtUrl: 'https://example.com/C.png' } },
  ];
  const index = new MediaSourceIndex();
  let found = 0;
  for (const r of rows) {
    const m = await resolveGameMedia({ index, dir: psx, romFileName: r.file, row: r.row, fetchUrl });
    if (Object.keys(m).length > 0) found++;
  }
  assert.equal(found, 2);
});
