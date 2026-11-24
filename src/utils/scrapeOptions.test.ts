import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultScrapeOptions, needsScrape, normalizeScrapeOptions, skipKnownMiss } from './scrapeOptions.ts';

const st = (status: string) => ({ status });

test('needsScrape: only the chosen types count', () => {
  const coverOnly = { image: st('valid'), marquee: st('missing'), video: st('missing') };
  assert.equal(needsScrape(coverOnly, ['image']), false);
  assert.equal(needsScrape(coverOnly, ['image', 'marquee']), true);
  assert.equal(needsScrape(coverOnly, ['video']), true);
  assert.equal(needsScrape({ image: st('placeholder'), marquee: st('valid'), video: st('valid') }, ['thumb']), true);
});

test('normalizeScrapeOptions drops unknown slots and keeps a fallback', () => {
  const fb = defaultScrapeOptions(false);
  assert.deepEqual(normalizeScrapeOptions({ slots: ['video', 'bogus'], retryMisses: 1 }, fb), {
    slots: ['video'],
    retryMisses: true,
  });
  assert.deepEqual(normalizeScrapeOptions({ slots: [] }, fb).slots, fb.slots);
  assert.deepEqual(normalizeScrapeOptions(null, fb), fb);
});

test('skipKnownMiss', () => {
  const miss = { code: 'not-in-db', at: 1, source: 'libretro' };
  assert.equal(skipKnownMiss(undefined, false, false), false);
  assert.equal(skipKnownMiss(miss, false, false), true);
  assert.equal(skipKnownMiss(miss, true, false), false, 'retry requested');
  assert.equal(skipKnownMiss(miss, false, true), false, 'ScreenScraper connected since');
  assert.equal(skipKnownMiss({ ...miss, source: 'libretro+screenscraper' }, false, true), true);
  assert.equal(skipKnownMiss({ code: 'network', at: 1 }, false, false), false, 'network errors are retried');
});
