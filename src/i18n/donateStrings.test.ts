// Тексты доната: у всех языков одни ключи и плейсхолдеры. / Donate strings: same keys and placeholders.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DONATE_STRINGS } from './donateStrings.ts';

const LANGS = ['en', 'ru', 'de', 'es', 'fr', 'it', 'ja', 'zh', 'sr'];

test('Donate strings: every language has the same keys and placeholders', () => {
  const en = DONATE_STRINGS.en;
  const ph = (s: string) => (s.match(/\{[a-z]+\}/g) || []).sort().join(',');
  for (const lang of LANGS) {
    const d = DONATE_STRINGS[lang];
    assert.ok(d, lang);
    assert.deepEqual(Object.keys(d).sort(), Object.keys(en).sort(), `keys differ in ${lang}`);
    for (const k of Object.keys(en)) assert.equal(ph(d[k]), ph(en[k]), `placeholders differ in ${lang}:${k}`);
  }
});
