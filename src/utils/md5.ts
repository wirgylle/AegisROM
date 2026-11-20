// Настоящий MD5 (RFC 1321) для браузера: crypto.subtle не умеет MD5.
// Real MD5 (RFC 1321) for the browser: crypto.subtle has no MD5.
// Потоковый: можно кормить кусками / streaming: can be fed in chunks.

const S = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
  5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
];

const K = new Int32Array(64);
for (let i = 0; i < 64; i++) {
  K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000) | 0;
}

export class Md5 {
  private a = 0x67452301 | 0;
  private b = 0xefcdab89 | 0;
  private c = 0x98badcfe | 0;
  private d = 0x10325476 | 0;
  private buf = new Uint8Array(64);
  private bufLen = 0;
  private total = 0;
  private w = new Int32Array(16);

  update(data: Uint8Array): this {
    let i = 0;
    this.total += data.length;
    if (this.bufLen > 0) {
      const take = Math.min(64 - this.bufLen, data.length);
      this.buf.set(data.subarray(0, take), this.bufLen);
      this.bufLen += take;
      i = take;
      if (this.bufLen === 64) {
        this.block(this.buf, 0);
        this.bufLen = 0;
      }
    }
    for (; i + 64 <= data.length; i += 64) this.block(data, i);
    if (i < data.length) {
      this.buf.set(data.subarray(i), 0);
      this.bufLen = data.length - i;
    }
    return this;
  }

  digestHex(): string {
    const bitLenLo = (this.total * 8) >>> 0;
    const bitLenHi = Math.floor(this.total / 0x20000000) >>> 0;
    const padLen = this.bufLen < 56 ? 56 - this.bufLen : 120 - this.bufLen;
    const pad = new Uint8Array(padLen + 8);
    pad[0] = 0x80;
    pad[padLen] = bitLenLo & 0xff;
    pad[padLen + 1] = (bitLenLo >>> 8) & 0xff;
    pad[padLen + 2] = (bitLenLo >>> 16) & 0xff;
    pad[padLen + 3] = (bitLenLo >>> 24) & 0xff;
    pad[padLen + 4] = bitLenHi & 0xff;
    pad[padLen + 5] = (bitLenHi >>> 8) & 0xff;
    pad[padLen + 6] = (bitLenHi >>> 16) & 0xff;
    pad[padLen + 7] = (bitLenHi >>> 24) & 0xff;
    const savedTotal = this.total;
    this.update(pad);
    this.total = savedTotal;
    let out = '';
    for (const v of [this.a, this.b, this.c, this.d]) {
      for (let s = 0; s < 32; s += 8) out += ((v >>> s) & 0xff).toString(16).padStart(2, '0');
    }
    return out;
  }

  private block(src: Uint8Array, off: number) {
    const w = this.w;
    for (let j = 0; j < 16; j++) {
      const p = off + j * 4;
      w[j] = src[p] | (src[p + 1] << 8) | (src[p + 2] << 16) | (src[p + 3] << 24);
    }
    let a = this.a;
    let b = this.b;
    let c = this.c;
    let d = this.d;
    for (let i = 0; i < 64; i++) {
      let f: number;
      let g: number;
      if (i < 16) {
        f = (b & c) | (~b & d);
        g = i;
      } else if (i < 32) {
        f = (d & b) | (~d & c);
        g = (5 * i + 1) & 15;
      } else if (i < 48) {
        f = b ^ c ^ d;
        g = (3 * i + 5) & 15;
      } else {
        f = c ^ (b | ~d);
        g = (7 * i) & 15;
      }
      const tmp = d;
      d = c;
      c = b;
      const x = (a + f + K[i] + w[g]) | 0;
      b = (b + ((x << S[i]) | (x >>> (32 - S[i])))) | 0;
      a = tmp;
    }
    this.a = (this.a + a) | 0;
    this.b = (this.b + b) | 0;
    this.c = (this.c + c) | 0;
    this.d = (this.d + d) | 0;
  }
}

export function md5Hex(data: Uint8Array): string {
  return new Md5().update(data).digestHex();
}
