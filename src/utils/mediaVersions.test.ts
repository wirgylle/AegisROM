// Тесты версий медиа и оценки соответствия: `npm test`.
// Media versions and fit score tests: `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AUTO_REPLACE_MARGIN,
  carryMediaVersions,
  decideAdd,
  loadManifest,
  MAX_VERSIONS,
  nameFromMediaUrl,
  offerMediaVersion,
  parseManifest,
  regionOf,
  saveManifest,
  scoreMediaCandidate,
  selectMediaVersion,
  systemFromMediaUrl,
  type SlotVersions,
} from './mediaVersions.ts';

// --- Папка в памяти / In-memory folder -------------------------------------
class MemFile {
  name: string;
  data: Uint8Array;
  constructor(name: string, data: Uint8Array) {
    this.name = name;
    this.data = data;
  }
  async getFile() {
    const data = this.data;
    const name = this.name;
    return {
      name,
      size: data.length,
      async arrayBuffer() {
        return data.slice().buffer;
      },
      async text() {
        return new TextDecoder().decode(data);
      },
    };
  }
  async createWritable() {
    const chunks: Uint8Array[] = [];
    return {
      write: async (d: any) => {
        chunks.push(typeof d === 'string' ? new TextEncoder().encode(d) : new Uint8Array(d instanceof ArrayBuffer ? d : d.buffer ?? d));
      },
      close: async () => {
        const n = chunks.reduce((a, c) => a + c.length, 0);
        const out = new Uint8Array(n);
        let o = 0;
        for (const c of chunks) {
          out.set(c, o);
          o += c.length;
        }
        this.data = out;
      },
    };
  }
}
class MemDir {
  kind = 'directory';
  entries = new Map<string, MemDir | MemFile>();
  name: string;
  constructor(name: string) {
    this.name = name;
  }
  async getDirectoryHandle(n: string, o?: { create?: boolean }) {
    let e = this.entries.get(n);
    if (!e) {
      if (!o?.create) throw new Error('NotFound');
      e = new MemDir(n);
      this.entries.set(n, e);
    }
    if (!(e instanceof MemDir)) throw new Error('TypeMismatch');
    return e;
  }
  async getFileHandle(n: string, o?: { create?: boolean }) {
    let e = this.entries.get(n);
    if (!e) {
      if (!o?.create) throw new Error('NotFound');
      e = new MemFile(n, new Uint8Array());
      this.entries.set(n, e);
    }
    if (!(e instanceof MemFile)) throw new Error('TypeMismatch');
    return e;
  }
  async removeEntry(n: string) {
    this.entries.delete(n);
  }
}

// PNG с нужным размером (заголовок IHDR) и «телом», чтобы CRC отличался.
// A PNG header with the given size plus a body so CRCs differ.
function png(w: number, h: number, seed: number): ArrayBuffer {
  const b = new Uint8Array(4000);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const dv = new DataView(b.buffer);
  dv.setUint32(16, w);
  dv.setUint32(20, h);
  for (let i = 40; i < b.length; i++) b[i] = (i * seed) & 0xff;
  return b.buffer;
}

const PSX = { consoleCode: 'psx', system: 'Sony - PlayStation', region: 'USA', cleanTitle: 'Final Fantasy VII', fileStem: 'Final Fantasy VII (USA)' };

// --- Оценка / Score ---------------------------------------------------------

test('PSX: square box art beats a Genesis-shaped (tall) one', () => {
  const square = scoreMediaCandidate('image', PSX, { source: 'libretro', system: 'Sony - PlayStation', matchedName: 'Final Fantasy VII (USA)', w: 512, h: 510 });
  const tall = scoreMediaCandidate('image', PSX, { source: 'libretro', system: 'Sony - PlayStation', matchedName: 'Final Fantasy VII (USA)', w: 512, h: 720 });
  assert.ok(square.reasons.includes('ratio-ok'));
  assert.ok(tall.reasons.includes('ratio-wrong'));
  assert.ok(square.score - tall.score >= AUTO_REPLACE_MARGIN);
});

test('other system and other region cost points', () => {
  const ok = scoreMediaCandidate('image', PSX, { source: 'libretro', system: 'Sony_-_PlayStation', matchedName: 'Final Fantasy VII (USA)' });
  const wrongSys = scoreMediaCandidate('image', PSX, { source: 'libretro', system: 'Sega - Mega Drive - Genesis', matchedName: 'Final Fantasy VII (USA)' });
  const wrongReg = scoreMediaCandidate('image', PSX, { source: 'libretro', system: 'Sony - PlayStation', matchedName: 'Final Fantasy VII (Japan)' });
  assert.ok(ok.reasons.includes('system-match'));
  assert.ok(wrongSys.reasons.includes('system-mismatch'));
  assert.ok(wrongReg.reasons.includes('region-mismatch'));
  assert.ok(ok.score > wrongReg.score && wrongReg.score > wrongSys.score);
});

test('consoles without a known box shape are not judged by proportions', () => {
  const r = scoreMediaCandidate('image', { consoleCode: 'snes' }, { source: 'libretro', w: 512, h: 360 });
  assert.ok(!r.reasons.some((x) => x.startsWith('ratio')));
});

test('URL helpers', () => {
  const u = 'https://raw.githubusercontent.com/libretro-thumbnails/Sony_-_PlayStation/HEAD/Named_Boxarts/Final%20Fantasy%20VII%20(USA)%20(Disc%201).png';
  assert.equal(systemFromMediaUrl(u), 'Sony - PlayStation');
  assert.equal(nameFromMediaUrl(u), 'Final Fantasy VII (USA) (Disc 1)');
  assert.equal(systemFromMediaUrl('https://thumbnails.libretro.com/Sega%20-%20Mega%20Drive%20-%20Genesis/Named_Boxarts/x.png'), 'Sega - Mega Drive - Genesis');
  assert.equal(regionOf('Game (Europe) (En,Fr)'), 'europe');
  assert.equal(regionOf('USA'), 'usa');
});

// --- Решения / Decisions ----------------------------------------------------

test('decideAdd: duplicates, margin, pinned, limit', () => {
  const v = (id: string, score: number, crc = id) => ({ id, file: `x/${id}`, source: 'libretro' as const, score, reasons: [], bytes: 10, crc, addedAt: 0 });
  const e: SlotVersions = { active: 'v1', pinned: false, versions: [v('v1', 50)] };
  assert.equal(decideAdd(e, { crc: 'v1', bytes: 10, score: 99 }).duplicateOf, 'v1');
  assert.equal(decideAdd(e, { crc: 'n', bytes: 10, score: 50 + AUTO_REPLACE_MARGIN - 1 }).makeActive, false);
  assert.equal(decideAdd(e, { crc: 'n', bytes: 10, score: 50 + AUTO_REPLACE_MARGIN }).makeActive, true);
  assert.equal(decideAdd({ ...e, pinned: true }, { crc: 'n', bytes: 10, score: 500 }).makeActive, false);
  const full: SlotVersions = { active: 'v1', pinned: false, versions: Array.from({ length: MAX_VERSIONS }, (_, i) => v(`v${i + 1}`, 10 + i)) };
  const d = decideAdd(full, { crc: 'n', bytes: 10, score: 100 });
  assert.deepEqual(d.evict, ['v2']);
});

test('parseManifest drops broken entries and paths with ..', () => {
  const m = parseManifest(
    JSON.stringify({ v: 1, items: { a: { image: { active: 'v9', versions: [{ id: 'v1', file: 'a/image-v1.png' }, { id: 'v2', file: '../evil.png' }] } }, b: 5 } })
  );
  assert.equal(m.items.a.image?.versions.length, 1);
  assert.equal(m.items.a.image?.active, 'v1');
  assert.equal(m.items.b, undefined);
  assert.deepEqual(parseManifest('{oops').items, {});
});

// --- Папка / Folder ---------------------------------------------------------

test('existing cover becomes V1; a clearly better one replaces it; the user pick sticks', async () => {
  const root = new MemDir('psx');
  const images = await root.getDirectoryHandle('images', { create: true });
  const stem = 'Final Fantasy VII (USA)';
  // Было: вытянутая «генезисовская» обложка. / Before: a tall Genesis-like cover.
  const oldBuf = png(512, 720, 3);
  const fh = await images.getFileHandle(`${stem}-image.png`, { create: true });
  await (await fh.createWritable()).write(oldBuf).then(() => undefined);
  (fh as any).data = new Uint8Array(oldBuf);

  const m = await loadManifest(root);
  const meta = { source: 'libretro' as const, system: 'Sony - PlayStation', matchedName: stem };
  const r1 = await offerMediaVersion(root, m, stem, 'image', png(512, 512, 5), meta, PSX);
  assert.equal(r1.added, true);
  assert.equal(r1.replaced, true);
  const e1 = m.items[stem].image!;
  assert.equal(e1.versions.length, 2);
  assert.equal(e1.versions[0].source, 'existing');
  assert.equal(e1.active, 'v2');
  // Основной файл переписан новой картинкой. / The main file now holds the new image.
  const main = new Uint8Array(await (await (await images.getFileHandle(`${stem}-image.png`)).getFile()).arrayBuffer());
  assert.equal(main[43], (43 * 5) & 0xff);

  // Тот же файл второй раз не сохраняется. / The same file is not stored twice.
  const dup = await offerMediaVersion(root, m, stem, 'image', png(512, 512, 5), meta, PSX);
  assert.equal(dup.duplicate, true);
  await saveManifest(root, m);

  // Пользователь выбирает старую — закреплено, автоматика не меняет.
  // The user picks the old one: pinned, automation leaves it.
  const sel = await selectMediaVersion(root, stem, 'image', 'v1');
  assert.equal(sel.manifest.items[stem].image!.pinned, true);
  assert.equal(sel.manifest.items[stem].image!.active, 'v1');
  const m2 = await loadManifest(root);
  const r3 = await offerMediaVersion(root, m2, stem, 'image', png(600, 600, 7), meta, PSX);
  assert.equal(r3.added, true);
  assert.equal(r3.replaced, false);
  assert.equal(m2.items[stem].image!.active, 'v1');
  assert.equal(m2.items[stem].image!.unseen, 1);

  // Снять закрепление: основной становится лучшая по оценке. / Unpin: the best score wins.
  await saveManifest(root, m2);
  const back = await selectMediaVersion(root, stem, 'image', null);
  assert.equal(back.manifest.items[stem].image!.pinned, false);
  assert.notEqual(back.manifest.items[stem].image!.active, 'v1');
});

test('a similar new cover does not replace a working one, it is only added', async () => {
  const root = new MemDir('psx');
  const images = await root.getDirectoryHandle('images', { create: true });
  const stem = 'Crash Bandicoot (USA)';
  const fh = await images.getFileHandle(`${stem}-image.png`, { create: true });
  (fh as any).data = new Uint8Array(png(500, 500, 11));
  const m = await loadManifest(root);
  const r = await offerMediaVersion(root, m, stem, 'image', png(512, 512, 13), { source: 'libretro', system: 'Sony - PlayStation', matchedName: stem }, { ...PSX, fileStem: stem, cleanTitle: 'Crash Bandicoot' });
  assert.equal(r.added, true);
  assert.equal(r.replaced, false);
  assert.equal(m.items[stem].image!.active, 'v1');
});

test('a stub main file is not kept as a version; the new image goes in', async () => {
  const root = new MemDir('psx');
  const stem = 'Game (USA)';
  const m = await loadManifest(root);
  const r = await offerMediaVersion(root, m, stem, 'image', png(512, 512, 2), { source: 'libretro' }, PSX, { primaryValid: false });
  assert.equal(r.added, true);
  assert.equal(m.items[stem].image!.versions.length, 1);
  const images = await root.getDirectoryHandle('images');
  assert.ok(await images.getFileHandle(`${stem}-image.png`));
});

test('versions follow a renamed ROM', async () => {
  const root = new MemDir('psx');
  const m = await loadManifest(root);
  await offerMediaVersion(root, m, 'Old', 'image', png(512, 512, 2), { source: 'libretro' }, PSX, { primaryValid: false });
  await saveManifest(root, m);
  assert.equal(await carryMediaVersions(root, root, 'Old', 'New'), true);
  const after = await loadManifest(root);
  assert.equal(after.items.Old, undefined);
  assert.equal(after.items.New.image!.versions[0].file, 'New/image-v1.png');
  const vd = await root.getDirectoryHandle('.aegis-media');
  assert.ok(vd.entries.has('New'));
  assert.ok(!vd.entries.has('Old'));
});
