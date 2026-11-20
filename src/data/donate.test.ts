// Адреса доната: побуквенная сверка с сообщением Valentin и проверка формата.
// Donate addresses: character-by-character match with Valentin's message and format checks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { DONATE_NETWORKS, parseDonateAmount } from './donate.ts';

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function b58decode(s: string): Buffer {
  let n = 0n;
  for (const ch of s) {
    const i = B58.indexOf(ch);
    assert.ok(i >= 0, `bad base58 char ${ch}`);
    n = n * 58n + BigInt(i);
  }
  const hex = n.toString(16);
  const body = Buffer.from(hex.length % 2 ? '0' + hex : hex, 'hex');
  const zeros = s.match(/^1*/)![0].length;
  return Buffer.concat([Buffer.alloc(zeros), body]);
}
const sha = (b: Buffer) => createHash('sha256').update(b).digest();

const byId = (id: string) => DONATE_NETWORKS.find((n) => n.id === id)!.address;

test('Donate: addresses match the ones Valentin sent', () => {
  assert.equal(byId('solana'), 'DFV4HD6SCkFTEvtf5xU1mB7DTE5cKMBBHGftpLFWPG1s');
  for (const id of ['arbitrum', 'avalanche', 'ethereum']) {
    assert.equal(byId(id), '0x2a959B2f486e7F1d033016A7c94796cF42e1eF0f', id);
  }
  assert.equal(byId('tron'), 'TJZJ6wqa3DSmN4JT4ndqYx2MGpqdsVxTE1');
  assert.equal(DONATE_NETWORKS.length, 5);
});

test('Donate: Tron address has a valid base58check checksum', () => {
  const raw = b58decode(byId('tron'));
  assert.equal(raw.length, 25);
  assert.equal(raw[0], 0x41);
  const payload = raw.subarray(0, 21);
  assert.deepEqual(raw.subarray(21), sha(sha(payload)).subarray(0, 4));
});

test('Donate: Solana address is a 32-byte key, EVM address is 20 bytes hex', () => {
  assert.equal(b58decode(byId('solana')).length, 32);
  assert.match(byId('ethereum'), /^0x[0-9a-fA-F]{40}$/);
});

test('Donate: custom amount parsing', () => {
  assert.equal(parseDonateAmount('3'), '3');
  assert.equal(parseDonateAmount(' 7,50 '), '7.5');
  assert.equal(parseDonateAmount('0.25'), '0.25');
  assert.equal(parseDonateAmount('015'), '15');
  assert.equal(parseDonateAmount('0'), null);
  assert.equal(parseDonateAmount('-1'), null);
  assert.equal(parseDonateAmount('abc'), null);
  assert.equal(parseDonateAmount('1.1234567'), null);
  assert.equal(parseDonateAmount(''), null);
});

test('Donate: README tables list the same addresses', async () => {
  const { readFileSync } = await import('node:fs');
  for (const file of ['README.md', 'README.ru.md']) {
    const text = readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
    const found = new Set([...text.matchAll(/`((?:0x[0-9a-fA-F]{40})|(?:[1-9A-HJ-NP-Za-km-z]{32,44}))`/g)].map((m) => m[1]));
    const expected = new Set(DONATE_NETWORKS.map((n) => n.address));
    assert.deepEqual([...found].sort(), [...expected].sort(), file);
  }
});
