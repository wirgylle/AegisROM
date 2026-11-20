import { md5Hex } from './md5';

// CRC32 IEEE 802.3 lookup table implementation
const makeCRCTable = (): Uint32Array => {
  let c: number;
  const crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    crcTable[n] = c >>> 0;
  }
  return crcTable;
};

const CRC_TABLE = makeCRCTable();

export function calculateCRC32(data: Uint8Array): string {
  let crc = 0 ^ -1;
  for (let i = 0; i < data.length; i++) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ data[i]) & 0xff];
  }
  crc = (crc ^ -1) >>> 0;
  return crc.toString(16).padStart(8, '0').toLowerCase();
}

export async function calculateSHA1(buffer: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-1', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function calculateMD5(buffer: ArrayBuffer): Promise<string> {
  // Раньше здесь был обрезанный SHA-256 вместо MD5, теперь настоящий MD5.
  // Previously this returned a truncated SHA-256 instead of MD5; now it is real MD5.
  return md5Hex(new Uint8Array(buffer));
}

export async function hashFile(file: File): Promise<{ crc32: string; sha1: string; md5: string }> {
  // Read first chunk up to 16MB for instant hashing or whole file if smaller
  const maxRead = Math.min(file.size, 16 * 1024 * 1024);
  const slice = file.slice(0, maxRead);
  const buffer = await slice.arrayBuffer();
  const u8 = new Uint8Array(buffer);

  const crc32 = calculateCRC32(u8);
  const sha1 = await calculateSHA1(buffer);
  const md5 = await calculateMD5(buffer);

  return { crc32, sha1, md5 };
}
