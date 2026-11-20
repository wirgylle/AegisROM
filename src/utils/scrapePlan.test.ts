// Тесты решений скрапера: `npm test`. / Scraper decision tests: `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isReadableTitle, mergeScrapedUrls, slotsToDownload } from './scrapePlan.ts';

const ok = { status: 'valid' as const };
const miss = { status: 'missing' as const };
const stub = { status: 'placeholder' as const };

test('working cover is not re-downloaded when only the video is missing', () => {
  const s = slotsToDownload({ image: ok, marquee: ok, video: miss }, true);
  assert.deepEqual([...s].sort(), ['video']);
});

test('placeholder cover and missing marquee are downloaded', () => {
  const s = slotsToDownload({ image: stub, marquee: miss, video: ok }, false);
  assert.deepEqual([...s].sort(), ['image', 'marquee', 'thumb']);
});

test('video is skipped when videos are disabled', () => {
  assert.equal(slotsToDownload(null, false).has('video'), false);
  assert.equal(slotsToDownload(null, true).has('video'), true);
});

const prev = {
  scrapedBoxArtUrl: 'blob:local-cover',
  scrapedSnapUrl: 'https://old/snap.png',
  scrapedMarqueeUrl: undefined,
  scrapedVideoUrl: 'blob:local-video',
};

test('unmatched result keeps the old URLs (session only)', () => {
  const next = mergeScrapedUrls(
    prev,
    { matched: false, matchedCanonicalTitle: 'x', boxArtUrl: 'https://guess (USA).png' },
    null
  );
  assert.deepEqual(next, prev);
});

test('with a disk folder, a URL changes only for slots that were saved', () => {
  const next = mergeScrapedUrls(
    prev,
    {
      matched: true,
      matchedCanonicalTitle: 'Contra',
      boxArtUrl: 'https://new/box.png',
      snapUrl: 'https://new/snap.png',
      marqueeUrl: 'https://new/title.png',
      videoUrl: 'https://new/v.mp4',
    },
    { image: false, thumb: true, marquee: true, video: false }
  );
  assert.equal(next.scrapedBoxArtUrl, 'blob:local-cover');
  assert.equal(next.scrapedSnapUrl, 'https://new/snap.png');
  assert.equal(next.scrapedMarqueeUrl, 'https://new/title.png');
  assert.equal(next.scrapedVideoUrl, 'blob:local-video');
});

test('empty server URLs never wipe existing ones', () => {
  const next = mergeScrapedUrls(prev, { matched: true, matchedCanonicalTitle: 'Contra' }, null);
  assert.deepEqual(next, prev);
});

test('readable vs garbled titles', () => {
  assert.equal(isReadableTitle('Contra'), true);
  assert.equal(isReadableTitle('Черепашки ниндзя'), true);
  assert.equal(isReadableTitle('Aladdin II'), true);
  assert.equal(isReadableTitle('0012'), false);
  assert.equal(isReadableTitle('魂斗罗'), false);
  assert.equal(isReadableTitle('Ð§ÐµÑ€ÐµÐ¿Ð°ÑˆÐºÐ¸'), false);
  assert.equal(isReadableTitle('РўРµС‚СЂРёСЃ'), false);
  assert.equal(isReadableTitle('Tetris \uFFFD\uFFFD'), false);
  assert.equal(isReadableTitle('Pokémon Red'), true);
  assert.equal(isReadableTitle(''), false);
});
