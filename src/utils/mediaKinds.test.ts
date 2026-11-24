// Тесты видов медиа: `npm test`. / Media kind tests: `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyMediaName,
  classifyMediaUrl,
  imageSizeFromBytes,
  MediaKindIndex,
  mediaCandidates,
  mediaSetOf,
  pickBoxartOfPair,
  preferredCoverUrl,
  stripBlobMedia,
  stripMediaSuffix,
} from './mediaKinds.ts';

test('classifyMediaName: суффикс важнее папки', () => {
  assert.equal(classifyMediaName('Contra-marquee.png', 'images'), 'marquee');
  assert.equal(classifyMediaName('Contra-thumb.png', 'images'), 'boxart');
  assert.equal(classifyMediaName('Contra-image.png', 'images'), 'image');
  assert.equal(classifyMediaName('Contra.png', 'images'), 'image');
  assert.equal(classifyMediaName('Contra.png', 'boxart'), 'boxart');
  assert.equal(classifyMediaName('Contra.png', 'roms/nes/snaps'), 'snap');
  assert.equal(classifyMediaName('Contra.png', 'Named_Titles'), 'title');
  assert.equal(classifyMediaName('Contra.png', 'wheel'), 'marquee');
  assert.equal(classifyMediaName('Contra-image.png', 'boxart'), 'boxart');
});

test('stripMediaSuffix', () => {
  assert.equal(stripMediaSuffix('Contra (USA)-thumb.png'), 'Contra (USA)');
  assert.equal(stripMediaSuffix('Contra (USA)-marquee.png'), 'Contra (USA)');
  assert.equal(stripMediaSuffix('Contra (USA).png'), 'Contra (USA)');
});

test('classifyMediaUrl: libretro и локальный путь', () => {
  assert.equal(classifyMediaUrl('https://thumbnails.libretro.com/Nintendo%20-%20NES/Named_Boxarts/Contra%20(USA).png'), 'boxart');
  assert.equal(classifyMediaUrl('https://thumbnails.libretro.com/Nintendo%20-%20NES/Named_Snaps/Contra%20(USA).png'), 'snap');
  assert.equal(classifyMediaUrl('/api/native/fs/media?path=' + encodeURIComponent('D:\\roms\\nes\\marquees\\Contra.png')), 'marquee');
  assert.equal(classifyMediaUrl('blob:http://x/1'), null);
  assert.equal(classifyMediaUrl('https://example.com/x.png'), null);
});

test('mediaSetOf: старая строка без media', () => {
  assert.deepEqual(mediaSetOf({ boxArtUrl: 'blob:1' }), { image: 'blob:1' });
  assert.deepEqual(
    mediaSetOf({ boxArtUrl: 'https://thumbnails.libretro.com/S/Named_Snaps/a.png' }),
    { snap: 'https://thumbnails.libretro.com/S/Named_Snaps/a.png' }
  );
  assert.deepEqual(mediaSetOf({ media: { boxart: 'b' }, boxArtUrl: 'b' }), { boxart: 'b' });
});

test('mediaCandidates: замены только если разрешены', () => {
  const set = { snap: 's', marquee: 'm', image: 'i' };
  assert.deepEqual(mediaCandidates(set, 'boxart', false), []);
  assert.deepEqual(mediaCandidates(set, 'boxart', true).map((c) => c.kind), ['image', 'snap', 'marquee']);
  assert.deepEqual(mediaCandidates(set, 'marquee', false), [{ url: 'm', kind: 'marquee' }]);
  assert.equal(preferredCoverUrl({ snap: 's', boxart: 'b' }), 'b');
});

test('stripBlobMedia', () => {
  assert.deepEqual(stripBlobMedia({ boxart: 'blob:1', snap: 'https://x/s.png' }), { snap: 'https://x/s.png' });
  assert.equal(stripBlobMedia({ boxart: 'blob:1' }), undefined);
});

function png(w: number, h: number): Uint8Array {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const dv = new DataView(b.buffer);
  dv.setUint32(16, w);
  dv.setUint32(20, h);
  return b;
}

function jpeg(w: number, h: number): Uint8Array {
  // SOI, APP0 (len 16), SOF0
  const b = new Uint8Array(40);
  b.set([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
  let i = 4 + 16;
  b.set([0xff, 0xc0, 0x00, 0x11, 0x08, h >> 8, h & 255, w >> 8, w & 255], i);
  return b;
}

test('imageSizeFromBytes: PNG и JPEG', () => {
  assert.deepEqual(imageSizeFromBytes(png(512, 720)), { w: 512, h: 720 });
  assert.deepEqual(imageSizeFromBytes(jpeg(256, 224)), { w: 256, h: 224 });
  assert.equal(imageSizeFromBytes(new Uint8Array(40)), null);
});

test('pickBoxartOfPair: крупнее или выше — боксарт', () => {
  assert.equal(pickBoxartOfPair({ w: 512, h: 720 }, { w: 256, h: 224 }), 0);
  assert.equal(pickBoxartOfPair({ w: 320, h: 224 }, { w: 640, h: 460 }), 1);
  assert.equal(pickBoxartOfPair({ w: 400, h: 560 }, { w: 480, h: 400 }), 0);
  assert.equal(pickBoxartOfPair(null, { w: 1, h: 1 }), -1);
});

test('MediaKindIndex: пара -image/-thumb решается по размеру', async () => {
  const sizes: Record<string, { w: number; h: number }> = {
    img: { w: 512, h: 720 },
    th: { w: 256, h: 224 },
  };
  const idx = new MediaKindIndex<string>();
  idx.addFile(['contra'], 'Contra-image.png', 'images', 'img');
  idx.addFile(['contra'], 'Contra-thumb.png', 'images', 'th');
  idx.addFile(['contra'], 'Contra-marquee.png', 'marquees', 'mq');
  const r = await idx.lookup(['contra'], async (f) => sizes[f]);
  assert.deepEqual(r, { boxart: 'img', snap: 'th', marquee: 'mq' });

  // Без чтения размеров: -thumb — боксарт по соглашению ES.
  const r2 = await idx.lookup(['contra']);
  assert.deepEqual(r2, { image: 'img', boxart: 'th', marquee: 'mq' });

  const single = new MediaKindIndex<string>();
  single.addFile(['a'], 'A-thumb.png', 'images', 't');
  assert.deepEqual(await single.lookup(['a']), { boxart: 't' });
});
