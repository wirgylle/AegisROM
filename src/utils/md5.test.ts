import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Md5, md5Hex } from './md5.ts';

const enc = (s: string) => new TextEncoder().encode(s);

test('md5: RFC 1321 vectors', () => {
  assert.equal(md5Hex(enc('')), 'd41d8cd98f00b204e9800998ecf8427e');
  assert.equal(md5Hex(enc('a')), '0cc175b9c0f1b6a831c399e269772661');
  assert.equal(md5Hex(enc('abc')), '900150983cd24fb0d6963f7d28e17f72');
  assert.equal(md5Hex(enc('message digest')), 'f96b697d7cb7938d525a2f31aaf161d0');
  assert.equal(
    md5Hex(enc('12345678901234567890123456789012345678901234567890123456789012345678901234567890')),
    '57edf4a22be3c955ac49da2e2107b67a'
  );
});

test('md5: chunked update equals one-shot', () => {
  const data = new Uint8Array(200_003);
  for (let i = 0; i < data.length; i++) data[i] = (i * 31 + 7) & 0xff;
  const h = new Md5();
  for (let i = 0; i < data.length; i += 4099) h.update(data.subarray(i, i + 4099));
  assert.equal(h.digestHex(), md5Hex(data));
});
