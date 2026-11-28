import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SD_FIRMWARE_PROFILES,
  SD_REPAIR_FIRMWARE_IDS,
  applySdRepairPlan,
  buildSdRepairCmd,
  buildSdRepairPlan,
  getSdFirmwareProfile,
  summarizeSdPlan,
  type SdEntry,
  type SdWriter,
} from './sdLayout.ts';

// Память вместо диска: ключ — путь папки, значение — её содержимое.
// In-memory disk: key is a folder path, value its entries.
function memDisk(tree: Record<string, SdEntry[]>) {
  const dirs = new Map<string, SdEntry[]>(Object.entries(tree).map(([k, v]) => [k, [...v]]));
  if (!dirs.has('')) dirs.set('', []);
  const findDir = (path: string): string | null => {
    if (!path) return '';
    for (const k of dirs.keys()) if (k.toLowerCase() === path.toLowerCase()) return k;
    return null;
  };
  const mkdirs: string[] = [];
  const writer: SdWriter = {
    async list(path) {
      const k = findDir(path);
      return k === null ? null : [...dirs.get(k)!];
    },
    async mkdir(parent, name) {
      const k = findDir(parent);
      if (k === null) throw new Error('no parent');
      const entries = dirs.get(k)!;
      if (entries.some((e) => e.name.toLowerCase() === name.toLowerCase())) throw new Error('exists');
      entries.push({ name, kind: 'directory' });
      const full = k ? `${k}/${name}` : name;
      dirs.set(full, []);
      mkdirs.push(full);
    },
  };
  return { writer, dirs, mkdirs };
}

const d = (name: string): SdEntry => ({ name, kind: 'directory' });
const f = (name: string): SdEntry => ({ name, kind: 'file' });

test('every firmware id has a profile with sources and unique paths', () => {
  for (const id of SD_REPAIR_FIRMWARE_IDS) {
    const p = SD_FIRMWARE_PROFILES[id];
    assert.ok(p, id);
    assert.equal(p.id, id);
    assert.ok(p.sources.length > 0, `${id} has sources`);
    const paths = p.items.map((i) => i.path.toLowerCase());
    assert.equal(new Set(paths).size, paths.length, `${id} has no duplicate paths`);
    for (const it of p.items) {
      if (it.kind === 'system') assert.ok(it.fixUrl, `${id}:${it.path} has a fix link`);
    }
  }
});

test('unknown firmware falls back to ArkOS', () => {
  assert.equal(getSdFirmwareProfile('nope').id, 'r36s_arkos');
  assert.equal(getSdFirmwareProfile(undefined).id, 'r36s_arkos');
});

test('dArkOS: missing themes and ThemeMaster are reported, existing folders are ok', async () => {
  const { writer } = memDisk({
    '': [d('BIOS'), d('tools'), d('nes'), f('Thumbs.db')],
    BIOS: [],
    tools: [f('Install.PortMaster.sh')],
    nes: [],
  });
  const plan = await buildSdRepairPlan(SD_FIRMWARE_PROFILES.r36s_darkos, writer);
  const byPath = new Map(plan.items.map((i) => [i.path, i]));
  assert.equal(byPath.get('bios')!.status, 'ok');
  assert.equal(byPath.get('bios')!.foundAs, 'BIOS');
  assert.equal(byPath.get('tools')!.status, 'ok');
  assert.equal(byPath.get('themes')!.status, 'create');
  assert.equal(byPath.get('tools/ThemeMaster.sh')!.status, 'missingSystem');
  assert.equal(byPath.get('tools/ThemeMaster')!.status, 'missingSystem');
  assert.equal(byPath.get('nes')!.status, 'ok');
  const sum = summarizeSdPlan(plan);
  assert.ok(sum.toCreateSystem.some((i) => i.path === 'themes'));
  assert.ok(!sum.toCreateSystem.some((i) => i.kind === 'system'), 'firmware parts are never created');
  assert.ok(sum.warnings.some((i) => i.path === 'themes'));
  assert.ok(sum.warnings.some((i) => i.path === 'tools/ThemeMaster'));
});

test('empty themes folder is a warning, hidden junk does not count as a theme', async () => {
  const { writer } = memDisk({ '': [d('themes')], themes: [f('.DS_Store'), f('desktop.ini')] });
  const plan = await buildSdRepairPlan(SD_FIRMWARE_PROFILES.r36s_arkos, writer);
  assert.equal(plan.items.find((i) => i.path === 'themes')!.status, 'emptyThemes');
  const { writer: w2 } = memDisk({ '': [d('themes')], themes: [d('es-theme-nes-box')] });
  const plan2 = await buildSdRepairPlan(SD_FIRMWARE_PROFILES.r36s_arkos, w2);
  assert.equal(plan2.items.find((i) => i.path === 'themes')!.status, 'ok');
});

test('a file where a folder should be is not treated as the folder', async () => {
  const { writer } = memDisk({ '': [f('bios')] });
  const plan = await buildSdRepairPlan(SD_FIRMWARE_PROFILES.r36s_arkos, writer);
  assert.equal(plan.items.find((i) => i.path === 'bios')!.status, 'create');
  const res = await applySdRepairPlan(writer, ['bios']);
  assert.deepEqual(res.created, []);
  assert.deepEqual(res.skipped, ['bios']);
});

test('apply creates nested folders, reuses existing case and never recreates', async () => {
  const { writer, mkdirs } = memDisk({ '': [d('SAVES')], SAVES: [] });
  const res = await applySdRepairPlan(writer, ['Saves/CurrentProfile/saves', 'Saves/CurrentProfile/states', 'BIOS']);
  assert.deepEqual(res.created, ['Saves/CurrentProfile/saves', 'Saves/CurrentProfile/states', 'BIOS']);
  assert.deepEqual(mkdirs, ['SAVES/CurrentProfile', 'SAVES/CurrentProfile/saves', 'SAVES/CurrentProfile/states', 'BIOS']);
  const again = await applySdRepairPlan(writer, ['BIOS', 'saves/currentprofile/saves']);
  assert.deepEqual(again.created, []);
  assert.deepEqual(again.skipped, ['BIOS', 'saves/currentprofile/saves']);
});

test('without a selected folder the plan is unchecked and lists folders only', async () => {
  const plan = await buildSdRepairPlan(SD_FIRMWARE_PROFILES.miyoo_onion, null);
  assert.equal(plan.checked, false);
  const sum = summarizeSdPlan(plan);
  assert.ok(sum.toCreateSystem.some((i) => i.path === 'BIOS'));
  assert.ok(!sum.toCreateSystem.some((i) => i.path === '.tmp_update'));
});

test('Batocera checks system/batocera.conf as a file and never creates it', async () => {
  const { writer } = memDisk({ '': [d('system')], system: [] });
  const plan = await buildSdRepairPlan(SD_FIRMWARE_PROFILES.batocera, writer);
  const conf = plan.items.find((i) => i.path === 'system/batocera.conf')!;
  assert.equal(conf.status, 'missingSystem');
  assert.ok(!summarizeSdPlan(plan).toCreateSystem.includes(conf));
});

test('cmd script only creates folders', () => {
  const cmd = buildSdRepairCmd(['themes', 'Saves/CurrentProfile/saves'], {
    title: 'T',
    promptDrive: 'Drive: ',
    step: 'S',
    done: 'D',
  });
  assert.match(cmd, /if not exist "%DRIVE%:\\Saves\\CurrentProfile\\saves" mkdir/);
  assert.doesNotMatch(cmd, /\bdel\b|\brmdir\b|\brd\b|chkdsk/i);
});

test('system folder names protect firmware folders from phantom cleanup', async () => {
  const { sdSystemFolderNames } = await import('./sdLayout.ts');
  const names = sdSystemFolderNames();
  for (const n of ['themes', 'tools', 'shutdownimages', '.tmp_update', 'muos', 'theme-customizations', 'saves', 'currentprofile']) {
    assert.ok(names.has(n), n);
  }
  assert.ok(!names.has('batocera.conf'));
  assert.ok(!names.has('nes'), 'console folders are not in the system list');
});
