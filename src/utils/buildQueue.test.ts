// Тесты очереди выгрузки сборки: `npm test`. / Build export queue tests: `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BuildCancelledError,
  BuildJournal,
  BuildReport,
  BuildTaskTimeoutError,
  SpeedMeter,
  convertTimeoutMs,
  copyTimeoutMs,
  fileExistsNonEmpty,
  journalKey,
  laneForRule,
  planBuildLanes,
  registerBuildStop,
  requestBuildStop,
  runGuarded,
  summarizeBuildPlan,
  type PlanRowLike,
} from './buildQueue.ts';
import { runPool } from './buildCopy.ts';

const copyRule = { conversionKind: 'copy' as const, actionType: 'keep_as_is' };
const chdRule = { conversionKind: 'chdman_required' as const, actionType: 'optical_iso_to_chd' };
const isoRule = { conversionKind: 'builtin_binary' as const, actionType: 'optical_bin_cue_to_iso' };
const cartRule = { conversionKind: 'builtin_binary' as const, actionType: 'cart_header_fix' };
const pbpRule = { conversionKind: 'external_pbp_cso' as const, actionType: 'optical_to_pbp' };

const row = (rule: PlanRowLike['rule'], sizeMB: number, targetExt = '.chd', file = true): PlanRowLike => ({
  rule,
  targetExt,
  game: { sizeMB, fileObj: file ? {} : undefined },
});

test('laneForRule: копии, заголовки картриджей и «нет chdman» идут в копирование', () => {
  assert.equal(laneForRule(copyRule, true), 'copy');
  assert.equal(laneForRule(cartRule, true), 'copy');
  assert.equal(laneForRule(pbpRule, true), 'copy');
  assert.equal(laneForRule(chdRule, false), 'copy');
  assert.equal(laneForRule(chdRule, true), 'convert');
  assert.equal(laneForRule(isoRule, false), 'convert');
});

test('planBuildLanes: копии в исходном порядке, конвертации от маленьких к большим', () => {
  const rows = [row(chdRule, 700), row(copyRule, 1), row(chdRule, 300), row(copyRule, 2), row(isoRule, 500)];
  const lanes = planBuildLanes(rows, true);
  assert.deepEqual(lanes.copy, [1, 3]);
  assert.deepEqual(lanes.convert, [2, 4, 0]);
});

test('summarizeBuildPlan считает линии, размер, форматы и игры без файла', () => {
  const rows = [
    row(copyRule, 1.5, '.sfc'),
    row(copyRule, 2, '.sfc', false),
    row(chdRule, 600, '.chd'),
    row(isoRule, 400, '.iso'),
    row(chdRule, 100, '.chd'),
  ];
  const s = summarizeBuildPlan(rows, true);
  assert.equal(s.total, 5);
  assert.equal(s.noFile, 1);
  assert.deepEqual(s.copy, { count: 1, mb: 1.5 });
  assert.equal(s.convert.count, 3);
  assert.equal(s.convert.mb, 1100);
  assert.deepEqual(s.convert.byTarget, { '.chd': 2, '.iso': 1 });
  const noChd = summarizeBuildPlan(rows, false);
  assert.equal(noChd.chdmanMissing, 2);
  assert.equal(noChd.convert.count, 1);
});

test('пределы времени растут с размером', () => {
  assert.equal(copyTimeoutMs(0), 5 * 60000);
  assert.equal(copyTimeoutMs(100), 7 * 60000);
  assert.equal(convertTimeoutMs(700), 17 * 60000);
  assert.ok(convertTimeoutMs(4500) > convertTimeoutMs(700));
});

test('runGuarded: результат проходит, таймаут отклоняет и прерывает signal', async () => {
  assert.equal(await runGuarded(async () => 42, { timeoutMs: 1000 }), 42);
  let aborted = false;
  await assert.rejects(
    runGuarded(
      (g) =>
        new Promise((resolve) => {
          g.signal.addEventListener('abort', () => (aborted = true));
          setTimeout(resolve, 500);
        }),
      { timeoutMs: 30 }
    ),
    (e: any) => e instanceof BuildTaskTimeoutError && e.reason === 'timeout'
  );
  assert.equal(aborted, true);
});

test('runGuarded: сторож «нет прогресса» срабатывает, а touch его сбрасывает', async () => {
  await assert.rejects(
    runGuarded(() => new Promise(() => {}), { timeoutMs: 5000, idleMs: 60 }),
    (e: any) => e instanceof BuildTaskTimeoutError && e.reason === 'stalled'
  );
  const v = await runGuarded(
    (g) =>
      new Promise<string>((resolve) => {
        const iv = setInterval(g.touch, 20);
        setTimeout(() => {
          clearInterval(iv);
          resolve('ok');
        }, 200);
      }),
    { timeoutMs: 5000, idleMs: 80 }
  );
  assert.equal(v, 'ok');
});

test('runGuarded: отмена извне', async () => {
  const ctl = new AbortController();
  const p = runGuarded(() => new Promise(() => {}), { timeoutMs: 5000, parent: ctl.signal });
  setTimeout(() => ctl.abort(), 20);
  await assert.rejects(p, (e: any) => e instanceof BuildCancelledError);
  ctl.abort();
  await assert.rejects(runGuarded(async () => 1, { timeoutMs: 100, parent: ctl.signal }), BuildCancelledError);
});

// Синтетическая выгрузка: одна «зависшая» конвертация не держит копии и остальные конвертации.
// Synthetic export: one "stuck" conversion does not hold the copies or the other conversions.
test('две линии: зависшая конвертация пропускается по таймауту, копии и медиа не ждут', async () => {
  const order: string[] = [];
  const copies = Array.from({ length: 20 }, (_, i) => `copy${i}`);
  const converts = ['stuck', 'conv1', 'conv2'];
  const report = new BuildReport();
  const t0 = Date.now();
  let copyLaneDoneAt = 0;
  await Promise.all([
    runPool([...copies, 'media:stuck', 'media:conv1'], 4, async (name) => {
      await new Promise((r) => setTimeout(r, 2));
      order.push(name);
    }).then(() => (copyLaneDoneAt = Date.now())),
    runPool(converts, 1, async (name) => {
      try {
        await runGuarded(
          () => new Promise<void>((resolve) => (name === 'stuck' ? undefined : setTimeout(resolve, 5))),
          { timeoutMs: 150 }
        );
        order.push(name);
      } catch (e) {
        report.add('timeout', name, String((e as Error).message));
      }
    }),
  ]);
  assert.ok(copyLaneDoneAt - t0 < 140, 'копии закончились раньше таймаута зависшей конвертации');
  assert.ok(order.includes('media:stuck'));
  assert.ok(order.includes('conv1') && order.includes('conv2'));
  assert.equal(report.count('timeout'), 1);
  assert.match(report.render(['h']), /stuck: timeout/);
});

// Папка в памяти. / In-memory folder.
function memDir(): any {
  const files = new Map<string, string>();
  const dirs = new Map<string, any>();
  return {
    files,
    async getDirectoryHandle(n: string, o?: { create?: boolean }) {
      if (!dirs.has(n)) {
        if (!o?.create) throw new Error('NotFoundError');
        dirs.set(n, memDir());
      }
      return dirs.get(n);
    },
    async getFileHandle(n: string, o?: { create?: boolean }) {
      if (!files.has(n)) {
        if (!o?.create) throw new Error('NotFoundError');
        files.set(n, '');
      }
      return {
        getFile: async () => new Blob([files.get(n) || '']),
        createWritable: async () => {
          let buf = '';
          return {
            write: async (s: string) => {
              buf += s;
            },
            close: async () => {
              files.set(n, buf);
            },
          };
        },
      };
    },
  };
}

test('BuildJournal: сохраняет и читает готовые конвертации', async () => {
  const root = memDir();
  const j = new BuildJournal(root);
  assert.equal(await j.load(), 0);
  const key = journalKey('roms/psx', 'Game (USA)', '.chd');
  j.mark(key, 'roms/psx/Game (USA).chd', 'converted_chdman');
  await j.save();
  const j2 = new BuildJournal(root);
  assert.equal(await j2.load(), 1);
  assert.equal(j2.get(key)?.path, 'roms/psx/Game (USA).chd');
  j2.forget(key);
  assert.equal(j2.size, 0);
});

test('fileExistsNonEmpty: пустой файл не считается готовым', async () => {
  const root = memDir();
  const d = await (await root.getDirectoryHandle('roms', { create: true })).getDirectoryHandle('psx', { create: true });
  const fh = await d.getFileHandle('a.chd', { create: true });
  assert.equal(await fileExistsNonEmpty(root, 'roms/psx/a.chd'), false);
  const w = await fh.createWritable();
  await w.write('data');
  await w.close();
  assert.equal(await fileExistsNonEmpty(root, 'roms/psx/a.chd'), true);
  assert.equal(await fileExistsNonEmpty(root, 'roms/psx/missing.chd'), false);
});

test('SpeedMeter считает МБ/с по окну', () => {
  let t = 0;
  const m = new SpeedMeter(10000, () => t);
  m.add(0);
  assert.equal(m.mbPerSec(), null);
  t = 2000;
  m.add(20 * 1024 * 1024);
  assert.equal(m.mbPerSec(), 10);
  assert.equal(m.totalBytes, 20 * 1024 * 1024);
});

test('registerBuildStop / requestBuildStop', () => {
  assert.equal(requestBuildStop(), false);
  let stopped = 0;
  const off = registerBuildStop(() => stopped++);
  assert.equal(requestBuildStop(), true);
  assert.equal(stopped, 1);
  off();
  assert.equal(requestBuildStop(), false);
});
