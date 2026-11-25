// Запуск патча из окна: в фоновом потоке с временным файлом OPFS, а если браузер этого не
// умеет — в памяти, как раньше. / Runs a patch from the window: in a background thread with a
// temporary OPFS file, or in memory as before when the browser can't do that.

import { PatchError, applyPatchSmart, crc32, crc32Update, crcHex, type PatchErrorCode } from './romPatcher.ts';

const TMP_PREFIX = 'aegis-patch-';

export interface PatchJobResult {
  // Результат: файл во временном хранилище (на диске) или Blob в памяти.
  // The result: a file in temporary storage (on disk) or an in-memory Blob.
  blob: Blob;
  crc32: string;
  size: number;
  strippedHeader: boolean;
  // Удалить временный файл, когда результат сохранён. / Delete the temporary file once saved.
  cleanup: () => Promise<void>;
}

// Не хватило памяти в режиме «в памяти». / Ran out of memory in the in-memory mode.
export class PatchMemoryError extends Error {
  constructor() {
    super('not enough memory');
    this.name = 'PatchMemoryError';
  }
}

function canUseWorker(): boolean {
  return typeof Worker !== 'undefined' && typeof navigator !== 'undefined' && !!navigator.storage?.getDirectory;
}

function newWorker(): Worker {
  return new Worker(new URL('../workers/patchWorker.ts', import.meta.url), { type: 'module' });
}

// Удаляет брошенные временные файлы прошлых запусков старше 15 минут (свежий может ещё скачиваться).
// Removes temp files from earlier runs older than 15 minutes (a fresh one may still be downloading).
async function sweepTemp(root: FileSystemDirectoryHandle) {
  const now = Date.now();
  try {
    for await (const name of (root as any).keys() as AsyncIterable<string>) {
      if (!name.startsWith(TMP_PREFIX)) continue;
      const born = parseInt(name.slice(TMP_PREFIX.length).split('-')[0], 36);
      if (!Number.isFinite(born) || now - born > 15 * 60 * 1000) {
        await root.removeEntry(name).catch(() => undefined);
      }
    }
  } catch {
    /* не критично / not critical */
  }
}

class SetupError extends Error {}

async function runInWorker(
  rom: File,
  patch: Uint8Array,
  ignoreChecksums: boolean,
  onProgress?: (written: number) => void
): Promise<PatchJobResult> {
  const root = await navigator.storage.getDirectory();
  const tmpName = `${TMP_PREFIX}${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  await sweepTemp(root);
  const worker = newWorker();
  try {
    const done = await new Promise<{ crc32: string; size: number; strippedHeader: boolean }>((resolve, reject) => {
      worker.onmessage = (e) => {
        const m = e.data;
        if (m.type === 'progress') onProgress?.(m.written);
        else if (m.type === 'done') resolve(m);
        else if (m.type === 'error') {
          if (m.setup) reject(new SetupError(m.message));
          else if (m.code) reject(new PatchError(m.code as PatchErrorCode, m.message));
          else reject(new Error(m.message));
        }
      };
      worker.onerror = (e) => reject(new SetupError(e.message || 'worker failed'));
      const copy = patch.slice().buffer;
      worker.postMessage({ type: 'patch', rom, patch: copy, ignoreChecksums, tmpName }, [copy]);
    });
    const fh = await root.getFileHandle(tmpName);
    const blob = await fh.getFile();
    return {
      blob,
      ...done,
      cleanup: async () => {
        await root.removeEntry(tmpName).catch(() => undefined);
      },
    };
  } catch (err) {
    await root.removeEntry(tmpName).catch(() => undefined);
    throw err;
  } finally {
    worker.terminate();
  }
}

async function runInMemory(rom: File, patch: Uint8Array, ignoreChecksums: boolean): Promise<PatchJobResult> {
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await rom.arrayBuffer());
  } catch (err) {
    if (err instanceof RangeError || (err as any)?.name === 'NotReadableError') throw new PatchMemoryError();
    throw err;
  }
  let res;
  try {
    res = applyPatchSmart(bytes, patch, { ignoreChecksums });
  } catch (err) {
    if (err instanceof RangeError) throw new PatchMemoryError();
    throw err;
  }
  return {
    blob: new Blob([res.data as Uint8Array<ArrayBuffer>], { type: 'application/octet-stream' }),
    crc32: res.crc32,
    size: res.data.length,
    strippedHeader: res.strippedHeader,
    cleanup: async () => undefined,
  };
}

export async function runPatchJob(
  rom: File,
  patch: Uint8Array,
  opts: { ignoreChecksums?: boolean } = {},
  onProgress?: (written: number) => void
): Promise<PatchJobResult> {
  const ignore = Boolean(opts.ignoreChecksums);
  if (canUseWorker()) {
    try {
      return await runInWorker(rom, patch, ignore, onProgress);
    } catch (err) {
      if (!(err instanceof SetupError)) throw err;
    }
  }
  return runInMemory(rom, patch, ignore);
}

// CRC32 рома (и без копирного заголовка, если он есть), не загружая файл целиком в память.
// ROM CRC32 (plus without a copier header when present) without loading the whole file.
export async function computeRomCrc(rom: File): Promise<{ crc: string; headerless?: string }> {
  if (typeof Worker !== 'undefined') {
    const worker = newWorker();
    try {
      return await new Promise((resolve, reject) => {
        worker.onmessage = (e) => {
          if (e.data.type === 'crc') resolve({ crc: e.data.crc, headerless: e.data.headerless });
          else reject(new Error(e.data.message));
        };
        worker.onerror = (e) => reject(new Error(e.message));
        worker.postMessage({ type: 'crc', file: rom });
      });
    } catch {
      /* ниже — без потока / fall through to the main thread */
    } finally {
      worker.terminate();
    }
  }
  // В основном потоке кусками по 8 МБ. / On the main thread in 8 MB pieces.
  const CHUNK = 8 * 1024 * 1024;
  const headered = rom.size > 512 && rom.size % 1024 === 512;
  if (rom.size <= CHUNK) {
    const b = new Uint8Array(await rom.arrayBuffer());
    return { crc: crcHex(crc32(b)), headerless: headered ? crcHex(crc32(b, 512)) : undefined };
  }
  let c = 0xffffffff;
  let h = 0xffffffff;
  for (let pos = 0; pos < rom.size; pos += CHUNK) {
    const b = new Uint8Array(await rom.slice(pos, pos + CHUNK).arrayBuffer());
    c = crc32Update(c, b);
    if (headered) h = crc32Update(h, pos === 0 ? b.subarray(512) : b);
  }
  return {
    crc: crcHex((c ^ 0xffffffff) >>> 0),
    headerless: headered ? crcHex((h ^ 0xffffffff) >>> 0) : undefined,
  };
}
