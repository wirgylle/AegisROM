// Быстрое копирование файлов сборки и перенос медиа.
//
// RU: Раньше каждый ром читался в память кусками по 8 МБ и писался в новый файл строго по
// одному, а интерфейс перерисовывался после каждого куска. Здесь:
//  - файл пишется целиком одним вызовом write(file): браузер копирует его сам, без
//    промежуточных ArrayBuffer в JS; крупные файлы идут кусками-срезами (Blob.slice) ради
//    прогресса;
//  - в нативном окне копирует Go прямо на диске (/api/native/vfs/copy);
//  - несколько ромов копируются одновременно (runPool);
//  - папки назначения создаются один раз (DirCache);
//  - файл того же размера в папке сборки не перезаписывается (повторная сборка, докопирование).
//
// EN: Each ROM used to be read into memory in 8 MB chunks and written strictly one at a time,
// and the UI re-rendered after every chunk. Here:
//  - a file is written whole with a single write(file): the browser copies it itself, with no
//    ArrayBuffers in JS; large files go as Blob.slice parts for progress;
//  - in the native window Go copies on disk (/api/native/vfs/copy);
//  - several ROMs are copied at once (runPool);
//  - target folders are created once (DirCache);
//  - a same-size file already in the build folder is not rewritten (rebuilds, resuming).

/**
 * Копирование на диске в обход страницы (нативное окно); null — не подходит.
 * On-disk copy bypassing the page (native window); null means not applicable.
 */
export type DiskCopier = (src: Blob, destDir: any, name: string, skipSame: boolean) => Promise<CopyOutcome | null>;

/** Файлы крупнее пишутся срезами, чтобы показывать прогресс. / Larger files are written in slices for progress. */
export const PROGRESS_SLICE_THRESHOLD = 256 * 1024 * 1024;
const SLICE_SIZE = 64 * 1024 * 1024;

export type CopyOutcome = 'copied' | 'skipped';

/** Кэш папок назначения по относительному пути. / Target folder cache by relative path. */
export class DirCache {
  private readonly cache = new Map<string, Promise<any>>();

  constructor(root: any) {
    this.cache.set('', Promise.resolve(root));
  }

  /** Папка по пути "a/b/c" (создаётся при необходимости). / Folder at "a/b/c" (created if needed). */
  get(relPath: string): Promise<any> {
    const segs = relPath.split('/').filter(Boolean);
    const key = segs.join('/');
    const hit = this.cache.get(key);
    if (hit) return hit;
    const parentKey = segs.slice(0, -1).join('/');
    const p = this.get(parentKey).then((parent) =>
      parent.getDirectoryHandle(segs[segs.length - 1], { create: true })
    );
    // Ошибку не кэшируем, чтобы следующий вызов попробовал снова. / Do not cache failures.
    p.catch(() => this.cache.delete(key));
    this.cache.set(key, p);
    return p;
  }
}

async function existingSize(dir: any, name: string): Promise<number | null> {
  try {
    const fh = await dir.getFileHandle(name);
    const f = await fh.getFile();
    return typeof f.size === 'number' ? f.size : null;
  } catch {
    return null;
  }
}

/**
 * Копирует файл в папку под именем name.
 * Copies a file into a folder under the given name.
 */
export async function copyFileToDir(
  src: File | Blob,
  destDir: any,
  name: string,
  opts: { skipSame?: boolean; onProgress?: (pct: number) => void; diskCopy?: DiskCopier } = {}
): Promise<CopyOutcome> {
  const skipSame = Boolean(opts.skipSame);

  // Нативное окно: Go копирует на диске. / Native window: Go copies on disk.
  if (opts.diskCopy) {
    const r = await opts.diskCopy(src, destDir, name, skipSame);
    if (r) return r;
  }

  if (skipSame) {
    const size = await existingSize(destDir, name);
    if (size !== null && size === src.size) return 'skipped';
  }

  const fh = await destDir.getFileHandle(name, { create: true });
  const w = await fh.createWritable();
  try {
    if (src.size <= PROGRESS_SLICE_THRESHOLD || !opts.onProgress) {
      await w.write(src);
    } else {
      let offset = 0;
      while (offset < src.size) {
        const end = Math.min(src.size, offset + SLICE_SIZE);
        await w.write(src.slice(offset, end));
        offset = end;
        opts.onProgress(Math.round((offset / src.size) * 100));
      }
    }
    await w.close();
  } catch (err) {
    try {
      await w.abort();
    } catch {}
    throw err;
  }
  return 'copied';
}

/**
 * Выполняет worker для каждого элемента, не больше limit одновременно. Порядок результатов
 * совпадает с порядком items. shouldStop останавливает выдачу новых элементов.
 * Runs worker for each item, at most limit at a time. Results keep the order of items.
 * shouldStop stops handing out new items.
 */
export async function runPool<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
  shouldStop?: () => boolean
): Promise<(R | undefined)[]> {
  const results: (R | undefined)[] = new Array(items.length);
  let next = 0;
  const lanes = Math.max(1, Math.min(limit, items.length));
  const lane = async () => {
    while (next < items.length) {
      if (shouldStop?.()) return;
      const i = next++;
      results[i] = await worker(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: lanes }, lane));
  return results;
}

/**
 * Вызывает fn не чаще раза в ms, последний вызов не теряется (flush).
 * Calls fn at most once per ms; the last call is not lost (flush).
 */
export function throttle<A extends unknown[]>(fn: (...args: A) => void, ms: number) {
  let last = 0;
  let pending: A | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const fire = () => {
    timer = null;
    if (!pending) return;
    const args = pending;
    pending = null;
    last = Date.now();
    fn(...args);
  };
  const call = (...args: A) => {
    pending = args;
    const wait = ms - (Date.now() - last);
    if (wait <= 0) {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      fire();
    } else if (!timer) {
      timer = setTimeout(fire, wait);
    }
  };
  call.flush = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    fire();
  };
  return call;
}

/** Сколько ромов копировать одновременно. / How many ROMs to copy at once. */
export function defaultCopyConcurrency(native: boolean): number {
  return native ? 6 : 4;
}

/**
 * Ограничитель: не больше n задач одновременно. Конвертации (chdman, образы дисков) идут по одной,
 * чтобы несколько ISO по 700 МБ не грузились в память разом.
 * Limiter: at most n tasks at once. Conversions (chdman, disc images) run one at a time so
 * several 700 MB ISOs are not loaded into memory together.
 */
export function createLimiter(n: number) {
  let active = 0;
  const queue: Array<() => void> = [];
  const release = () => {
    active--;
    const next = queue.shift();
    if (next) next();
  };
  return async function limit<T>(fn: () => Promise<T>): Promise<T> {
    if (active >= n) await new Promise<void>((resolve) => queue.push(resolve));
    active++;
    try {
      return await fn();
    } finally {
      release();
    }
  };
}
