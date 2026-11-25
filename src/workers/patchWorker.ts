// Фоновый поток патчера: читает ром прямо с диска (FileReaderSync) и пишет результат во
// временный файл OPFS. Так образы на сотни мегабайт и гигабайты не держатся целиком в памяти.
// Patcher background thread: reads the ROM straight from disk (FileReaderSync) and writes the
// result into a temporary OPFS file, so multi-hundred-MB and GB images never sit in memory whole.

import {
  PatchError,
  applyPatchSmartTo,
  crc32Update,
  crcHex,
  type PatchSink,
  type PatchSource,
} from '../utils/romPatcher.ts';

declare const FileReaderSync: { new (): { readAsArrayBuffer(blob: Blob): ArrayBuffer } };

const BLOCK = 4 * 1024 * 1024;

class FileSource implements PatchSource {
  file: File;
  size: number;
  reader = new FileReaderSync();
  cachePos = -1;
  cache: Uint8Array = new Uint8Array(0);
  constructor(file: File) {
    this.file = file;
    this.size = file.size;
  }
  private load(pos: number, len: number): Uint8Array {
    return new Uint8Array(this.reader.readAsArrayBuffer(this.file.slice(pos, pos + len)));
  }
  read(pos: number, len: number): Uint8Array {
    if (this.cachePos >= 0 && pos >= this.cachePos && pos + len <= this.cachePos + this.cache.length) {
      return this.cache.subarray(pos - this.cachePos, pos - this.cachePos + len);
    }
    if (len >= BLOCK) return this.load(pos, len);
    this.cache = this.load(pos, Math.min(this.size - pos, Math.max(BLOCK, len)));
    this.cachePos = pos;
    return this.cache.subarray(0, len);
  }
}

// Запись в файл через синхронный доступ OPFS с буфером. / Buffered writes through an OPFS sync handle.
class HandleSink implements PatchSink {
  handle: any;
  size = 0;
  flushed = 0;
  buf = new Uint8Array(8 * 1024 * 1024);
  bufLen = 0;
  constructor(handle: any) {
    this.handle = handle;
  }
  flush() {
    if (this.bufLen === 0) return;
    this.handle.write(this.buf.subarray(0, this.bufLen), { at: this.flushed });
    this.flushed += this.bufLen;
    this.bufLen = 0;
  }
  write(bytes: Uint8Array) {
    if (bytes.length > this.buf.length - this.bufLen) this.flush();
    if (bytes.length >= this.buf.length) {
      this.handle.write(bytes, { at: this.flushed });
      this.flushed += bytes.length;
    } else {
      this.buf.set(bytes, this.bufLen);
      this.bufLen += bytes.length;
    }
    this.size += bytes.length;
  }
  read(pos: number, len: number): Uint8Array {
    if (pos >= this.flushed) return this.buf.subarray(pos - this.flushed, pos - this.flushed + len);
    this.flush();
    const out = new Uint8Array(len);
    this.handle.read(out, { at: pos });
    return out;
  }
  reset() {
    this.handle.truncate(0);
    this.size = 0;
    this.flushed = 0;
    this.bufLen = 0;
  }
}

function fileCrc(file: File): { crc: string; headerless?: string } {
  const src = new FileSource(file);
  const headered = file.size > 512 && file.size % 1024 === 512;
  let c = 0xffffffff;
  let h = 0xffffffff;
  for (let pos = 0; pos < file.size; pos += BLOCK) {
    const b = src.read(pos, Math.min(BLOCK, file.size - pos));
    c = crc32Update(c, b);
    if (headered) h = crc32Update(h, pos === 0 ? b.subarray(512) : b);
  }
  return {
    crc: crcHex((c ^ 0xffffffff) >>> 0),
    headerless: headered ? crcHex((h ^ 0xffffffff) >>> 0) : undefined,
  };
}

self.onmessage = async (e: MessageEvent) => {
  const msg = e.data;
  if (msg.type === 'crc') {
    try {
      self.postMessage({ type: 'crc', ...fileCrc(msg.file) });
    } catch (err) {
      self.postMessage({ type: 'error', setup: true, message: String(err) });
    }
    return;
  }
  let handle: any = null;
  try {
    const root = await navigator.storage.getDirectory();
    const fh = await root.getFileHandle(msg.tmpName, { create: true });
    handle = await (fh as any).createSyncAccessHandle();
  } catch (err) {
    // Нет OPFS или синхронного доступа: окно перейдёт на обработку в памяти.
    // No OPFS or sync access: the window falls back to in-memory patching.
    self.postMessage({ type: 'error', setup: true, message: String(err) });
    return;
  }
  try {
    handle.truncate(0);
    const sink = new HandleSink(handle);
    const res = applyPatchSmartTo(
      new FileSource(msg.rom),
      new Uint8Array(msg.patch),
      sink,
      { ignoreChecksums: msg.ignoreChecksums },
      (written) => self.postMessage({ type: 'progress', written })
    );
    sink.flush();
    handle.flush();
    handle.close();
    handle = null;
    self.postMessage({ type: 'done', crc32: res.crc32, size: res.size, strippedHeader: res.strippedHeader });
  } catch (err) {
    try {
      handle?.close();
    } catch {
      /* уже закрыт / already closed */
    }
    if (err instanceof PatchError) self.postMessage({ type: 'error', code: err.code, message: err.message });
    else self.postMessage({ type: 'error', message: String((err as any)?.message || err) });
  }
};
