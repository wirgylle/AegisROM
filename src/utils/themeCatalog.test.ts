import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import {
  ThemeExistsError,
  filterOgaByResolution,
  installThemeZip,
  installedThemeFolders,
  parseOgaGallery,
  parseOnionCatalog,
  planThemeLayout,
} from './themeCatalog.ts';

// Тот же минимальный zip и папка в памяти, что в portMasterInstall.test.ts.
// The same minimal zip and in-memory folder as in portMasterInstall.test.ts.
function makeZip(entries: Array<{ name: string; data?: string; method?: number }>): Uint8Array {
  const enc = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const e of entries) {
    const name = enc.encode(e.name);
    const raw = enc.encode(e.data || '');
    const method = e.method ?? (e.name.endsWith('/') ? 0 : 8);
    const body = method === 8 ? new Uint8Array(deflateRawSync(raw)) : raw;
    const lh = new Uint8Array(30 + name.length);
    const lv = new DataView(lh.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(8, method, true);
    lv.setUint32(18, body.length, true);
    lv.setUint32(22, raw.length, true);
    lv.setUint16(26, name.length, true);
    lh.set(name, 30);
    const ch = new Uint8Array(46 + name.length);
    const cv = new DataView(ch.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(10, method, true);
    cv.setUint32(20, body.length, true);
    cv.setUint32(24, raw.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    ch.set(name, 46);
    locals.push(lh, body);
    centrals.push(ch);
    offset += lh.length + body.length;
  }
  const cdSize = centrals.reduce((a, c) => a + c.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);
  const all = [...locals, ...centrals, eocd];
  const out = new Uint8Array(all.reduce((a, c) => a + c.length, 0));
  let o = 0;
  for (const c of all) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

// Папка в памяти. / In-memory folder.
function memDir(name = 'root'): any {
  const files = new Map<string, Blob>();
  const dirs = new Map<string, any>();
  return {
    kind: 'directory',
    name,
    files,
    dirs,
    async getDirectoryHandle(n: string, o?: { create?: boolean }) {
      if (!dirs.has(n)) {
        if (!o?.create) throw new Error('NotFound');
        dirs.set(n, memDir(n));
      }
      return dirs.get(n);
    },
    async getFileHandle(n: string) {
      return {
        kind: 'file',
        name: n,
        async getFile() {
          return files.get(n);
        },
        async createWritable() {
          return {
            async write(d: any) {
              files.set(n, new Blob([d]));
            },
            async close() {},
          };
        },
      };
    },
    async *values() {
      for (const d of dirs.values()) yield d;
      for (const [n, b] of files) yield { kind: 'file', name: n, getFile: async () => b };
    },
  };
}


// Строки из настоящих каталогов (README галереи и страница OnionUI/Themes).
// Lines from the real catalogs.
const OGA_MD = `# Emulationstation-OGA-Theme-Gallery
| Theme Name     | Preview       |480x320|640x480|854x480|960x544|720x720|
| ---------------|:-------------:|:------:|:------:|:------:|:------:|:-----:
| [Albedo](https://github.com/mluizvitor/es-theme-albedo)                        | ![](https://raw.githubusercontent.com/Jetup13/Emulationstation-OGA-Theme-Gallery/main/images/albedo.png)|Yes|Yes|Untested|Untested|Untested|
| [Alekfull-NX](https://github.com/Vidnez/es-theme-Alekfull-NX)         | ![](https://raw.githubusercontent.com/Jetup13/Emulationstation-OGA-Theme-Gallery/main/images/Alekfull-NX.png)|No|No|No|No|Yes|
| [ArkOS-Carbon](https://github.com/Jetup13/es-theme-arkos-carbon)               | ![](https://raw.githubusercontent.com/Jetup13/Emulationstation-OGA-Theme-Gallery/main/images/arkos-carbon.png)|Yes|Untested|Untested|Untested|Untested|
`;

const ONION_MD = `<a href="https://raw.githubusercontent.com/OnionUI/Themes/main/release/RupeeCore%20%283-pack%29%20by%20ShaolinSnake96.zip">
<img title="Name: RupeeCore (3-pack)&#013;Author: ShaolinSnake96&#013;Last updated: 2025-03-23&#013;(Click to download)" width="480px" src="https://raw.githubusercontent.com/OnionUI/Themes/main/themes/RupeeCore%20%283-pack%29%20by%20ShaolinSnake96/preview.png" /><br/>
&nbsp;**1**&nbsp; [&nbsp;2&nbsp;](index-15-8a.md) [&nbsp;3&nbsp;](index-14-38.md)`;

test('parses the OGA gallery table with screen fit', () => {
  const list = parseOgaGallery(OGA_MD);
  assert.equal(list.length, 3);
  const a = list[0];
  assert.equal(a.name, 'Albedo');
  assert.equal(a.author, 'mluizvitor');
  assert.equal(a.folderName, 'es-theme-albedo');
  assert.equal(a.downloadUrl, 'https://codeload.github.com/mluizvitor/es-theme-albedo/zip/HEAD');
  assert.equal(a.fit?.['640x480'], 'yes');
  assert.equal(list[1].fit?.['720x720'], 'yes');
});

test('640x480 filter keeps fitting themes first and hides "No"', () => {
  const list = filterOgaByResolution(parseOgaGallery(OGA_MD), '640x480');
  assert.deepEqual(list.map((t) => t.name), ['Albedo', 'ArkOS-Carbon']);
});

test('parses an Onion catalog page and its page links', () => {
  const { themes, pages } = parseOnionCatalog(ONION_MD);
  assert.equal(themes.length, 1);
  assert.equal(themes[0].name, 'RupeeCore (3-pack)');
  assert.equal(themes[0].author, 'ShaolinSnake96');
  assert.equal(themes[0].folderName, 'RupeeCore (3-pack) by ShaolinSnake96');
  assert.equal(themes[0].updated, '2025-03-23');
  assert.deepEqual(pages, ['index-15-8a.md', 'index-14-38.md']);
});

test('layout: GitHub archive wrapper is dropped, Onion single folder kept', () => {
  assert.deepEqual(planThemeLayout({ catalog: 'oga', folderName: 'es-theme-albedo' }, ['es-theme-albedo-HEAD/', 'es-theme-albedo-HEAD/theme.xml']), {
    folders: ['es-theme-albedo'],
    strip: 1,
    wrap: 'es-theme-albedo',
  });
  assert.deepEqual(planThemeLayout({ catalog: 'onion', folderName: 'X by Y' }, ['X by Y/config.json', 'X by Y/skin/a.png']), { folders: ['X by Y'], strip: 0, wrap: null });
  // Пак из трёх тем, как RupeeCore (3-pack). / A three-theme pack.
  assert.deepEqual(planThemeLayout({ catalog: 'onion', folderName: 'P (3-pack) by Y' }, ['A by Y/config.json', 'B by Y/config.json', 'C by Y/skin/a.png']), {
    folders: ['A by Y', 'B by Y', 'C by Y'],
    strip: 0,
    wrap: null,
  });
  assert.deepEqual(planThemeLayout({ catalog: 'onion', folderName: 'X by Y' }, ['config.json', 'skin/a.png']), { folders: ['X by Y'], strip: 0, wrap: 'X by Y' });
});

test('installs a theme into a new folder and refuses to overwrite an existing one', async () => {
  const themes = memDir('themes');
  const zip = makeZip([
    { name: 'es-theme-albedo-HEAD/' },
    { name: 'es-theme-albedo-HEAD/theme.xml', data: '<theme/>' },
    { name: 'es-theme-albedo-HEAD/art/bg.png', data: 'PNG' },
    { name: 'es-theme-albedo-HEAD/../../evil.sh', data: 'x' },
  ]);
  const res = await installThemeZip(themes, zip, { catalog: 'oga', folderName: 'es-theme-albedo' });
  assert.deepEqual(res, { folder: 'es-theme-albedo', folders: ['es-theme-albedo'], files: 2 });
  const d = themes.dirs.get('es-theme-albedo');
  assert.equal(await d.files.get('theme.xml').text(), '<theme/>');
  assert.equal(await d.dirs.get('art').files.get('bg.png').text(), 'PNG');
  assert.ok(!themes.files.has('evil.sh'));
  assert.deepEqual([...(await installedThemeFolders(themes))], ['es-theme-albedo']);
  await assert.rejects(() => installThemeZip(themes, zip, { catalog: 'oga', folderName: 'ES-THEME-ALBEDO' }), ThemeExistsError);
  assert.equal(await d.files.get('theme.xml').text(), '<theme/>', 'existing theme untouched');
});

test('an Onion pack installs each theme as its own folder and refuses if one exists', async () => {
  const themes = memDir('Themes');
  const zip = makeZip([
    { name: 'A by Y/config.json', data: '{}' },
    { name: 'B by Y/config.json', data: '{}' },
  ]);
  const res = await installThemeZip(themes, zip, { catalog: 'onion', folderName: 'P (2-pack) by Y' });
  assert.deepEqual(res.folders, ['A by Y', 'B by Y']);
  assert.ok(themes.dirs.get('A by Y').files.has('config.json'));
  const themes2 = memDir('Themes');
  await themes2.getDirectoryHandle('b by y', { create: true });
  await assert.rejects(() => installThemeZip(themes2, zip, { catalog: 'onion', folderName: 'P' }), ThemeExistsError);
  assert.ok(!themes2.dirs.has('A by Y'), 'nothing written when one folder exists');
});
