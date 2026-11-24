// Тесты медиа сборки: `npm test`. / Build media tests: `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MediaSourceIndex,
  buildGamelistXml,
  classifyMediaFileName,
  planMediaTargets,
  profileMediaLayout,
  type FoundMedia,
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
