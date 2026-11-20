import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyScrapeReport, mediaFetchUrl, missReasonOf, nextScrapeSteps, screenScraperItem, totalMissed } from './scrapeReport.ts';

test('missReasonOf: код сервера и старые тексты причин', () => {
  assert.equal(missReasonOf({ reasonCode: 'network' }), 'network');
  assert.equal(missReasonOf({ reason: 'нет исходного названия для поиска (имя файла — номер)' }), 'no-title');
  assert.equal(missReasonOf({ reason: 'индекс Libretro недоступен: timeout' }), 'network');
  assert.equal(missReasonOf({ reason: 'для этой консоли нет индекса Libretro' }), 'no-system');
  assert.equal(missReasonOf({ reason: 'в индексе Libretro нет похожего названия' }), 'not-in-db');
  assert.equal(missReasonOf(undefined), 'not-in-db');
});

test('nextScrapeSteps: номерные имена → переименование, без ScreenScraper → подключить', () => {
  const r = emptyScrapeReport(false);
  r.missed['no-title'] = 10;
  r.missed['not-in-db'] = 5;
  r.missed.network = 2;
  assert.deepEqual(nextScrapeSteps(r), ['rename', 'setup-screenscraper', 'retry']);
  assert.equal(totalMissed(r), 17);

  const s = emptyScrapeReport(true);
  s.missed['not-in-db'] = 3;
  s.ssStopped = 'ss-limit';
  assert.deepEqual(nextScrapeSteps(s), ['check-screenscraper']);
  assert.deepEqual(nextScrapeSteps(emptyScrapeReport(true)), []);
});

test('screenScraperItem: CRC только для несжатых файлов до 16 МБ', () => {
  const nes = screenScraperItem({ id: '1', fileName: '001.nes', fileSize: 40976, crc32: 'ab12cd34', extension: '.nes', region: 'USA' }, 'NES');
  assert.equal(nes.crc, 'ab12cd34');
  assert.equal(nes.romName, '001.nes');
  const zip = screenScraperItem({ id: '2', fileName: 'x.zip', fileSize: 1000, crc32: 'ab12cd34', extension: '.zip' }, 'NES');
  assert.equal(zip.crc, '');
  const iso = screenScraperItem({ id: '3', fileName: 'x.iso', fileSize: 700 * 1024 * 1024, crc32: 'ab12cd34', extension: '.iso' }, 'PS');
  assert.equal(iso.crc, '');
  const md = screenScraperItem(
    { id: '4', fileName: 'FF8', fileSize: 1, isMultiDisc: true, discs: [{ id: 'd1', fileName: 'FF8 (Disc 1).chd', fileSize: 5 }] },
    'PS'
  );
  assert.equal(md.romName, 'FF8 (Disc 1).chd');
  assert.equal(md.id, '4');
});

test('mediaFetchUrl: свои ссылки напрямую, чужие через прокси', () => {
  assert.equal(mediaFetchUrl('/api/screenscraper/media?url=x'), '/api/screenscraper/media?url=x');
  assert.equal(mediaFetchUrl('https://a.b/c d.png'), '/api/r36s/proxy-media?url=https%3A%2F%2Fa.b%2Fc%20d.png');
});
