// Тесты разбора gamelist.xml: `npm test`. / gamelist.xml parsing tests: `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  findGamelistEntry,
  indexGamelistEntries,
  normalizeGamelistPath,
  parseGamelistEntries,
  relativeFileExists,
  splitRelativeMediaPath,
} from './gamelistXml.ts';

const xml = `<?xml version="1.0"?>
<gameList>
  <game id="1">
    <path>./0012.nes</path>
    <name>Contra</name>
    <desc>Run &amp; gun.</desc>
    <image>./media/images/Contra (USA).png</image>
    <video>./media/videos/0012.mp4</video>
    <developer>Konami</developer>
  </game>
  <game>
    <path>./sub/Battletoads.nes</path>
    <name>Battletoads</name>
  </game>
  <game><name>no path</name></game>
</gameList>`;

test('entries keep media, description and raw block', () => {
  const entries = parseGamelistEntries(xml);
  assert.equal(entries.length, 2);
  const e = entries[0];
  assert.equal(e.name, 'Contra');
  assert.equal(e.fields.image, './media/images/Contra (USA).png');
  assert.equal(e.fields.video, './media/videos/0012.mp4');
  assert.equal(e.fields.desc, 'Run &amp; gun.');
  assert.equal(e.fields.developer, 'Konami');
  assert.match(e.raw, /^<game id="1">[\s\S]*<\/game>$/);
});

test('lookup by file name with or without extension', () => {
  const idx = indexGamelistEntries(parseGamelistEntries(xml));
  assert.equal(findGamelistEntry(idx, '0012.nes')?.name, 'Contra');
  assert.equal(findGamelistEntry(idx, '0012.NES')?.name, 'Contra');
  assert.equal(findGamelistEntry(idx, 'battletoads.zip')?.name, 'Battletoads');
  assert.equal(findGamelistEntry(idx, 'nothing.nes'), undefined);
});

test('relative media paths are confined to the console folder', () => {
  assert.deepEqual(splitRelativeMediaPath('./media/images/a.png'), ['media', 'images', 'a.png']);
  assert.deepEqual(splitRelativeMediaPath('images\\a.png'), ['images', 'a.png']);
  assert.equal(splitRelativeMediaPath('../other/a.png'), null);
  assert.equal(splitRelativeMediaPath('/etc/a.png'), null);
  assert.equal(splitRelativeMediaPath('C:/x/a.png'), null);
  assert.equal(splitRelativeMediaPath('https://x/a.png'), null);
  assert.equal(normalizeGamelistPath('./Sub\\A.nes'), 'sub/a.nes');
});

// Минимальная заглушка FileSystemDirectoryHandle. / Minimal FileSystemDirectoryHandle stub.
function fakeDir(tree: Record<string, any>): any {
  return {
    async getDirectoryHandle(n: string) {
      if (tree[n] && typeof tree[n] === 'object') return fakeDir(tree[n]);
      throw new Error('NotFound');
    },
    async getFileHandle(n: string) {
      if (typeof tree[n] !== 'number') throw new Error('NotFound');
      return { getFile: async () => ({ size: tree[n] }) };
    },
  };
}

test('relativeFileExists walks subfolders and ignores empty files', async () => {
  const dir = fakeDir({ media: { images: { 'Contra (USA).png': 9000, 'empty.png': 0 } } });
  assert.equal(await relativeFileExists(dir, './media/images/Contra (USA).png'), true);
  assert.equal(await relativeFileExists(dir, './media/images/empty.png'), false);
  assert.equal(await relativeFileExists(dir, './media/images/none.png'), false);
  assert.equal(await relativeFileExists(dir, '../media/images/Contra (USA).png'), false);
});
