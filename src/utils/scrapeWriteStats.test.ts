import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyWriteStats, neededSlots, recordRomWrite, usefulSlots } from './scrapeWriteStats.ts';
import { slotsToDownload } from './scrapePlan.ts';

const st = (status: 'valid' | 'missing') => ({ status });

// Случай из жалобы: у рома есть обложка, нет видео и логотипа; Libretro даёт только обложку.
// The reported case: the ROM has box art, lacks video and logo; Libretro only has box art.
test('found but nothing new: box art present, source only has box art', () => {
  const audit = { image: st('valid'), marquee: st('missing'), video: st('missing') };
  const need = neededSlots(slotsToDownload(audit, true), new Set(['image', 'thumb', 'marquee', 'video']));
  assert.deepEqual([...need], ['marquee', 'video']);
  const offer = { image: 'x.png', thumb: 'y.png' };
  assert.deepEqual(usefulSlots(need, offer), []);
  const ws = emptyWriteStats();
  recordRomWrite(ws, need, usefulSlots(need, offer), {});
  assert.equal(ws.nothingNew, 1);
  assert.equal(ws.nothingNewLacked.video, 1);
  assert.equal(ws.nothingNewLacked.marquee, 1);
  assert.equal(ws.written, 0);
});

test('unchosen types are not needed', () => {
  const audit = { image: st('valid'), marquee: st('missing'), video: st('missing') };
  const need = neededSlots(slotsToDownload(audit, true), new Set(['image', 'thumb']));
  assert.equal(need.size, 0);
});

test('written vs failed reasons', () => {
  const need = new Set(['image', 'thumb'] as const);
  const ws = emptyWriteStats();
  recordRomWrite(ws, new Set(need), ['image', 'thumb'], { image: 'ok', thumb: 'rejected' });
  recordRomWrite(ws, new Set(need), ['image'], { image: 'link-broken' });
  recordRomWrite(ws, new Set(need), ['image'], { image: 'io-error' });
  assert.equal(ws.written, 1);
  assert.equal(ws.failed, 2);
  assert.deepEqual(ws.failedBy, { 'link-broken': 1, rejected: 0, 'io-error': 1 });
});
