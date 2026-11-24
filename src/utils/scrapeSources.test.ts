import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultSourceChoice, moveSource, normalizeSourceChoice, planSources, ssRequestsLeft, toggleSource } from './scrapeSources.ts';

const allReady = { local: 'ready', libretro: 'ready', screenscraper: 'ready' } as const;

test('normalizeSourceChoice keeps order, drops unknown, adds missing', () => {
  const c = normalizeSourceChoice({ order: ['screenscraper', 'bogus', 'local'], enabled: ['local'], fallback: false });
  assert.deepEqual(c.order, ['screenscraper', 'local', 'libretro']);
  assert.deepEqual(c.enabled, ['local']);
  assert.equal(c.fallback, false);
  assert.deepEqual(normalizeSourceChoice(null), defaultSourceChoice());
});

test('planSources: order, unavailable sources skipped, fallback off = first only', () => {
  let c = toggleSource(defaultSourceChoice(), 'local', true);
  c = moveSource(moveSource(c, 'local', -1), 'local', -1);
  assert.deepEqual(c.order, ['local', 'libretro', 'screenscraper']);
  assert.deepEqual(planSources(c, allReady).run, ['local', 'libretro', 'screenscraper']);
  const p = planSources(c, { ...allReady, local: 'no-folder', screenscraper: 'quota' });
  assert.deepEqual(p.run, ['libretro']);
  assert.deepEqual(p.skipped, [
    { id: 'local', state: 'no-folder' },
    { id: 'screenscraper', state: 'quota' },
  ]);
  // Без автоперехода: первый доступный, даже если первый по списку недоступен.
  // No fallback: the first available one, even when the first listed is unavailable.
  assert.deepEqual(planSources({ ...c, fallback: false }, { ...allReady, local: 'no-folder' }).run, ['libretro']);
});

test('ssRequestsLeft', () => {
  assert.equal(ssRequestsLeft({ requestsToday: 150, maxRequestsPerDay: 200 }), 50);
  assert.equal(ssRequestsLeft({ requestsToday: 300, maxRequestsPerDay: 200 }), 0);
  assert.equal(ssRequestsLeft({ requestsToday: 0, maxRequestsPerDay: 0 }), null);
  assert.equal(ssRequestsLeft(null), null);
});
