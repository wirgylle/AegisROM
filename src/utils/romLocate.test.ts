import { test } from 'node:test';
import assert from 'node:assert/strict';
import { locateRomFile, cueTrackNames, splitRomPath, type DirLike } from './romLocate.ts';

type Tree = { [name: string]: Tree | string };

function dir(name: string, tree: Tree): DirLike {
  return {
    name,
    async getDirectoryHandle(n: string) {
      const v = tree[n];
      if (!v || typeof v === 'string') throw new Error('NotFoundError');
      return dir(n, v);
    },
    async getFileHandle(n: string) {
      const v = tree[n];
      if (typeof v !== 'string') throw new Error('NotFoundError');
      return { getFile: async () => new File([v], n) };
    },
  };
}

const root = dir('Roms', {
  nes: { 'Battletoads (USA).nes': 'rom' },
  psx: {
    'Game.cue': 'FILE "Game (Track 1).bin" BINARY\n  TRACK 01 MODE2/2352\nFILE "Game (Track 2).bin" BINARY\n',
    'Game (Track 1).bin': 'd1',
    'Game (Track 2).bin': 'a2',
  },
  md: { 'Sonic (World).md': 'md' },
});

test('ром по пути из базы от корня библиотеки', async () => {
  const hit = await locateRomFile({ root, relativePath: 'nes/Battletoads (USA).nes' });
  assert.equal(hit?.file.name, 'Battletoads (USA).nes');
});

test('путь с обратными слешами и с именем корня в начале', async () => {
  assert.equal((await locateRomFile({ root, relativePath: 'nes\\Battletoads (USA).nes' }))?.file.name, 'Battletoads (USA).nes');
  assert.equal((await locateRomFile({ root, relativePath: 'Roms/nes/Battletoads (USA).nes' }))?.file.name, 'Battletoads (USA).nes');
});

test('после переименования файл находится по другому имени', async () => {
  const hit = await locateRomFile({ root, relativePath: 'md/Sonic.md', altNames: ['Sonic (World).md'] });
  assert.equal(hit?.file.name, 'Sonic (World).md');
});

test('папка рома из сеанса важнее корня', async () => {
  const parent = dir('nes', { 'Battletoads (USA).nes': 'x' });
  const hit = await locateRomFile({ parentHandle: parent, root: null, relativePath: 'other/Battletoads (USA).nes' });
  assert.equal(hit?.dir, parent);
});

test('.cue: текст листа и треки рядом', async () => {
  const hit = await locateRomFile({ root, relativePath: 'psx/Game.cue' });
  assert.equal(hit?.file.name, 'Game.cue');
  assert.deepEqual(hit?.companionFiles?.map((f) => f.name), ['Game (Track 1).bin', 'Game (Track 2).bin']);
  assert.match(hit?.cueText || '', /TRACK 01/);
});

test('нет файла: null', async () => {
  assert.equal(await locateRomFile({ root, relativePath: 'snes/Nope.sfc' }), null);
  assert.equal(await locateRomFile({ root, relativePath: '' }), null);
});

test('разбор путей и FILE-строк', () => {
  assert.deepEqual(splitRomPath('a\\b/../c/./d.nes'), ['a', 'b', 'c', 'd.nes']);
  assert.deepEqual(cueTrackNames('FILE "..\\x\\T1.bin" BINARY\nFILE T2.bin BINARY\n'), ['T1.bin', 'T2.bin']);
});
