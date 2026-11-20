import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BIOS_STRINGS } from './biosStrings.ts';
import { BIOS_GUIDE } from '../data/bios/biosGuide.ts';

const LANGS = ['en', 'ru', 'de', 'es', 'fr', 'it', 'ja', 'zh', 'sr'];

test('BIOS UI strings: every language has the same keys and placeholders', () => {
  const en = BIOS_STRINGS.en;
  for (const lang of LANGS) {
    const d = BIOS_STRINGS[lang];
    assert.ok(d, lang);
    assert.deepEqual(Object.keys(d).sort(), Object.keys(en).sort(), `keys differ in ${lang}`);
    for (const k of Object.keys(en)) {
      const ph = (s: string) => (s.match(/\{[a-z]+\}/g) || []).sort().join(',');
      assert.equal(ph(d[k]), ph(en[k]), `placeholders differ in ${lang}:${k}`);
    }
  }
});

test('BIOS guide: every system explains itself in every language', () => {
  for (const s of BIOS_GUIDE) {
    for (const lang of LANGS) assert.ok((s.why as Record<string, string>)[lang]?.length > 10, `${s.id}/${lang}`);
  }
});
