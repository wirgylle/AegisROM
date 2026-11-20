// Тесты сокращений и римских цифр: `npm test`. / Abbreviation and Roman numeral tests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expandTitleAbbreviations, romanToArabicInKey } from './titleAliases.ts';

test('FFVIII и другие формы Final Fantasy', () => {
  assert.equal(expandTitleAbbreviations('FFVIII'), 'Final Fantasy VIII');
  assert.equal(expandTitleAbbreviations('ffviii'), 'Final Fantasy VIII');
  assert.equal(expandTitleAbbreviations('FF8'), 'Final Fantasy VIII');
  assert.equal(expandTitleAbbreviations('FF 8'), 'Final Fantasy VIII');
  assert.equal(expandTitleAbbreviations('FF_VIII'), 'Final Fantasy VIII');
  assert.equal(expandTitleAbbreviations('FF VII - Disc 2'), 'Final Fantasy VII - Disc 2');
  assert.equal(expandTitleAbbreviations('FFX-2'), 'Final Fantasy X-2');
  assert.equal(expandTitleAbbreviations('FFIX (USA)'), 'Final Fantasy IX (USA)');
  assert.equal(expandTitleAbbreviations('FFT'), 'Final Fantasy Tactics');
  assert.equal(expandTitleAbbreviations('DQ5'), 'Dragon Quest V');
});

test('другие серии и арабские номера', () => {
  assert.equal(expandTitleAbbreviations('MGS'), 'Metal Gear Solid');
  assert.equal(expandTitleAbbreviations('MGS2'), 'Metal Gear Solid 2');
  assert.equal(expandTitleAbbreviations('SMB3'), 'Super Mario Bros. 3');
  assert.equal(expandTitleAbbreviations('RE 2'), 'Resident Evil 2');
  assert.equal(expandTitleAbbreviations('SF II'), 'Street Fighter II');
});

test('полные названия и похожие слова не трогаем', () => {
  for (const t of ['Final Fantasy VIII', 'Re-Volt', 'Rev', 'Revolt', 'Mega Man X', 'Ff', 'FF', 'Doom II', 'Rex', 'Smash TV', 'SFX Racing', 'Dragon Quest']) {
    assert.equal(expandTitleAbbreviations(t), t, t);
  }
});

test('romanToArabicInKey: VIII = 8, одиночные X/V/I не трогаем', () => {
  assert.equal(romanToArabicInKey('final fantasy viii'), 'final fantasy 8');
  assert.equal(romanToArabicInKey('final fantasy ix'), 'final fantasy 9');
  assert.equal(romanToArabicInKey('final fantasy xii'), 'final fantasy 12');
  assert.equal(romanToArabicInKey('mega man x'), 'mega man x');
  assert.equal(romanToArabicInKey('street fighter ii: champion'), 'street fighter 2: champion');
  assert.equal(romanToArabicInKey('civilization'), 'civilization');
});

test('многодисковые имена: тег диска сохраняется', () => {
  assert.equal(expandTitleAbbreviations('FFVIII (Disc 1)'), 'Final Fantasy VIII (Disc 1)');
  assert.equal(expandTitleAbbreviations('FF8 [Disc 3 of 4]'), 'Final Fantasy VIII [Disc 3 of 4]');
  assert.equal(expandTitleAbbreviations('ffix_cd2'), 'Final Fantasy IX_cd2');
  assert.equal(expandTitleAbbreviations('MGS (Disc 2)'), 'Metal Gear Solid (Disc 2)');
});
