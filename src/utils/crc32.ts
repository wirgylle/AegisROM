const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

export function computeCRC32Hex(bytes: Uint8Array, offset = 0): string {
  let crc = 0 ^ -1;
  for (let i = offset; i < bytes.length; i++) {
    crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ bytes[i]) & 0xff];
  }
  crc = (crc ^ -1) >>> 0;
  return crc.toString(16).padStart(8, '0').toUpperCase();
}
