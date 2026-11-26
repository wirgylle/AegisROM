import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyGameMediaFile,
  gameMediaTargetPath,
  isNonCoverMediaFile,
  mediaStemMatches,
  sortGameMediaKinds,
} from './gameMediaKinds.ts';

test('Skraper media/<folder> files: the folder decides', () => {
  const k = (f: string, d: string) => classifyGameMediaFile(f, d)?.kind;
  assert.equal(k('Game.png', 'media/boxes'), 'boxart');
  assert.equal(k('Game.png', 'media/images'), 'image');
  assert.equal(k('Game.png', 'media/fanart'), 'fanart');
  assert.equal(k('Game.png', 'media/maps'), 'map');
  assert.equal(k('Game.pdf', 'media/maps'), 'map');
  assert.equal(k('Game.png', 'media/screenmarquee'), 'screenmarquee');
  assert.equal(k('Game.png', 'media/screenshot'), 'snap');
  assert.equal(k('Game.png', 'media/steamgrid'), 'steamgrid');
  assert.equal(k('Game.png', 'media/support'), 'support');
  assert.equal(k('Game.png', 'media/supporttexture'), 'supporttexture');
  assert.equal(k('Game.pdf', 'media/tipsandtricks'), 'tips');
  assert.equal(k('Game.mp4', 'media/videos'), 'video');
  assert.equal(k('Game.png', 'media/wheels'), 'marquee');
  assert.equal(k('Game.pdf', 'media/manuals'), 'manual');
  // Неподходящее расширение. / Wrong extension.
  assert.equal(k('Game.txt', 'media/videos'), undefined);
  assert.equal(k('Game.png', 'media/manuals'), undefined);
});

test('project layout: the suffix decides', () => {
  const c = (f: string, d: string) => classifyGameMediaFile(f, d);
  assert.deepEqual(c('Contra (USA)-fanart.png', 'nes/images'), { kind: 'fanart', stem: 'Contra (USA)' });
  assert.deepEqual(c('Contra (USA)-image.png', 'images'), { kind: 'boxart', stem: 'Contra (USA)' });
  assert.deepEqual(c('Contra (USA)-thumb.png', 'images'), { kind: 'snap', stem: 'Contra (USA)' });
  assert.deepEqual(c('Contra (USA)-cartridge.png', 'images'), { kind: 'support', stem: 'Contra (USA)' });
  assert.deepEqual(c('Contra (USA)-screenmarquee.png', 'marquees'), { kind: 'screenmarquee', stem: 'Contra (USA)' });
  assert.deepEqual(c('Contra (USA)-map.pdf', 'manuals'), { kind: 'map', stem: 'Contra (USA)' });
  assert.deepEqual(c('Contra (USA).pdf', 'manuals'), { kind: 'manual', stem: 'Contra (USA)' });
  assert.deepEqual(c('Contra (USA).png', 'images'), { kind: 'boxart', stem: 'Contra (USA)' });
  // Без суффикса в папке рома — не медиа. / No suffix in a ROM folder: not media.
  assert.equal(c('Contra (USA).png', 'nes'), null);
});

test('target paths round-trip through the classifier', () => {
  for (const [kind, ext] of [
    ['boxart', '.png'],
    ['snap', '.png'],
    ['title', '.png'],
    ['image', '.png'],
    ['box3d', '.png'],
    ['fanart', '.jpg'],
    ['support', '.png'],
    ['supporttexture', '.png'],
    ['steamgrid', '.png'],
    ['map', '.png'],
    ['map', '.pdf'],
    ['tips', '.pdf'],
    ['tips', '.txt'],
    ['marquee', '.png'],
    ['screenmarquee', '.png'],
    ['video', '.mp4'],
    ['manual', '.pdf'],
  ] as const) {
    const p = gameMediaTargetPath(kind, 'Battletoads (USA)', ext);
    const parts = p.split('/');
    const file = parts.pop()!;
    assert.deepEqual(classifyGameMediaFile(file, parts.join('/')), { kind, stem: 'Battletoads (USA)' }, p);
  }
});

test('non-cover files and stem matching', () => {
  assert.equal(isNonCoverMediaFile('A-fanart.png', 'images'), true);
  assert.equal(isNonCoverMediaFile('A.png', 'media/maps'), true);
  assert.equal(isNonCoverMediaFile('A.png', 'media/boxes'), false);
  assert.equal(mediaStemMatches('Battletoads (USA)', ['battletoads (usa)']), true);
  assert.equal(mediaStemMatches('Battletoads', ['Battletoads (USA)']), true);
  assert.equal(mediaStemMatches('Battletoads', ['Contra (USA)']), false);
  assert.deepEqual(sortGameMediaKinds(['manual', 'fanart', 'boxart']), ['boxart', 'fanart', 'manual']);
});

test('listGameMediaInDir finds layout and media/<kind> files of one ROM', async () => {
  const dir = (name: string, entries: any[]): any => ({
    kind: 'directory',
    name,
    async *values() {
      yield* entries;
    },
  });
  const file = (name: string): any => ({ kind: 'file', name, getFile: async () => name });
  const { listGameMediaInDir } = await import('./gameMediaKinds.ts');
  const root = dir('nes', [
    file('Battletoads (USA).nes'),
    dir('images', [file('Battletoads (USA)-image.png'), file('Battletoads (USA)-fanart.png'), file('Contra (USA)-image.png')]),
    dir('media', [dir('maps', [file('Battletoads (USA).png')]), dir('tipsandtricks', [file('Battletoads (USA).txt')])]),
  ]);
  const got = (await listGameMediaInDir(root, ['Battletoads (USA)'])).map((x) => `${x.kind}:${x.rel}`);
  assert.deepEqual(got, [
    'boxart:images/Battletoads (USA)-image.png',
    'fanart:images/Battletoads (USA)-fanart.png',
    'map:media/maps/Battletoads (USA).png',
    'tips:media/tipsandtricks/Battletoads (USA).txt',
  ]);
});
