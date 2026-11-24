/**
 * Файлы через Go вместо File System Access API / Files via Go instead of the File System Access API.
 *
 * RU: Объекты ниже повторяют нужную UI часть интерфейсов FileSystemDirectoryHandle,
 * FileSystemFileHandle и FileSystemWritableFileStream, но работают через
 * /api/native/vfs/* (aegisapi/vfs.go) по абсолютным путям. Так ~200 мест в UI
 * не нужно переписывать, разрешения браузера больше не нужны, а в WKWebView
 * (macOS), где File System Access API нет, всё работает так же.
 *
 * Включается, если бэкенд просит (нативное окно) или в окне нет
 * showDirectoryPicker. Иначе остаётся File System Access API браузера.
 *
 * EN: The objects below mirror the parts of FileSystemDirectoryHandle,
 * FileSystemFileHandle and FileSystemWritableFileStream the UI uses, backed by
 * /api/native/vfs/* (aegisapi/vfs.go) with absolute paths. The ~200 call sites
 * stay as they are, browser permissions are no longer needed, and WKWebView
 * (macOS), which has no File System Access API, works the same way.
 *
 * Enabled when the backend asks for it (native window) or the window has no
 * showDirectoryPicker. Otherwise the browser's File System Access API stays.
 */

const API = '/api/native/vfs';

/** Files up to this size come back from getFile() as a real File; larger ones as a LazyFile. */
const EAGER_FILE_LIMIT = 32 * 1024 * 1024;

let enabled = false;
let separator = '/';

export function isNativeFsEnabled(): boolean {
  return enabled;
}

interface VfsEntry {
  name: string;
  kind: 'file' | 'directory';
  size: number;
  mtime: number;
}

function domError(name: string, message?: string): Error {
  try {
    return new DOMException(message || name, name);
  } catch {
    const e = new Error(message || name);
    e.name = name;
    return e;
  }
}

async function call(path: string, init?: RequestInit): Promise<any> {
  let resp: Response;
  try {
    resp = await fetch(`${API}/${path}`, { cache: 'no-store', ...init });
  } catch (e: any) {
    throw domError('NetworkError', e?.message);
  }
  let data: any = null;
  try {
    data = await resp.json();
  } catch {}
  if (!resp.ok || !data || data.ok === false) {
    throw domError(data?.error || 'UnknownError', data?.message || `${resp.status}`);
  }
  return data;
}

const qp = (p: string) => encodeURIComponent(p);

function joinPath(dir: string, name: string): string {
  if (!name || name === '.' || name === '..' || /[\\/]/.test(name)) {
    throw new TypeError(`Name is not allowed: ${name}`);
  }
  return dir.endsWith('/') || dir.endsWith('\\') ? dir + name : dir + separator + name;
}

function parentOf(p: string): string {
  const i = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
  return i > 0 ? p.slice(0, i) : p;
}

function baseName(p: string): string {
  const trimmed = p.replace(/[\\/]+$/, '');
  const i = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'));
  return i >= 0 ? trimmed.slice(i + 1) : trimmed;
}

function samePath(a: string, b: string): boolean {
  const norm = (s: string) => s.replace(/\\/g, '/').replace(/\/+$/, '');
  return separator === '\\' ? norm(a).toLowerCase() === norm(b).toLowerCase() : norm(a) === norm(b);
}

export function nativeReadUrl(path: string): string {
  return `${API}/read?path=${qp(path)}`;
}

async function stat(path: string): Promise<VfsEntry | null> {
  try {
    const data = await call(`stat?path=${qp(path)}`);
    return data.entry as VfsEntry;
  } catch (e: any) {
    if (e?.name === 'NotFoundError') return null;
    throw e;
  }
}

/** Part of a large file, read lazily with HTTP Range. */
export class LazyBlob {
  constructor(
    readonly __aegisPath: string,
    private readonly start: number,
    private readonly end: number,
    readonly type = ''
  ) {}

  get size(): number {
    return Math.max(0, this.end - this.start);
  }

  slice(start = 0, end = this.size, type = ''): LazyBlob {
    const clamp = (v: number) => Math.min(Math.max(v < 0 ? this.size + v : v, 0), this.size);
    const s = clamp(start);
    const e = Math.max(s, clamp(end));
    return new LazyBlob(this.__aegisPath, this.start + s, this.start + e, type);
  }

  private async fetchRange(): Promise<Response> {
    if (this.size === 0) return new Response(new ArrayBuffer(0));
    const resp = await fetch(nativeReadUrl(this.__aegisPath), {
      headers: { Range: `bytes=${this.start}-${this.end - 1}` },
      cache: 'no-store',
    });
    if (!resp.ok) throw domError(resp.status === 404 ? 'NotFoundError' : 'NotReadableError');
    return resp;
  }

  async arrayBuffer(): Promise<ArrayBuffer> {
    return (await this.fetchRange()).arrayBuffer();
  }

  async bytes(): Promise<Uint8Array> {
    return new Uint8Array(await this.arrayBuffer());
  }

  async text(): Promise<string> {
    return (await this.fetchRange()).text();
  }

  stream(): ReadableStream<Uint8Array> {
    const self = this;
    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
    return new ReadableStream<Uint8Array>({
      async pull(ctrl) {
        if (!reader) {
          const body = (await self.fetchRange()).body;
          if (!body) {
            ctrl.close();
            return;
          }
          reader = body.getReader();
        }
        const { done, value } = await reader.read();
        if (done) ctrl.close();
        else ctrl.enqueue(value);
      },
      cancel() {
        void reader?.cancel();
      },
    });
  }

  /** Real Blob with the bytes (loads the whole range into memory). */
  async toBlob(): Promise<Blob> {
    return new Blob([await this.arrayBuffer()], { type: this.type });
  }
}

/** File-like object for large files: metadata now, bytes on demand. */
export class LazyFile extends LazyBlob {
  readonly webkitRelativePath = '';
  constructor(
    path: string,
    readonly name: string,
    size: number,
    readonly lastModified: number
  ) {
    super(path, 0, size);
  }

  async toFile(): Promise<File> {
    return new File([await this.arrayBuffer()], this.name, { lastModified: this.lastModified });
  }
}

export function isLazyBlob(v: unknown): v is LazyBlob {
  return v instanceof LazyBlob;
}

/**
 * Путь на диске для целого файла из нативной прослойки (LazyFile или File из getFile), иначе null.
 * Disk path of a whole file from the native layer (LazyFile or a File from getFile), else null.
 */
export function nativePathOf(v: unknown): string | null {
  if (v instanceof LazyFile) return v.__aegisPath;
  if (typeof File !== 'undefined' && v instanceof File) {
    const p = (v as any).__aegisPath;
    return typeof p === 'string' && p ? p : null;
  }
  return null;
}

/**
 * Копирует файл на диске через Go в dir/name. skipSame: не трогать файл того же размера.
 * null: файл или папка не из нативной прослойки, копировать обычным способом.
 * Copies a file on disk through Go into dir/name. skipSame: leave a same-size file alone.
 * null: the file or folder is not from the native layer; copy the usual way.
 */
export async function nativeCopyFile(
  src: unknown,
  destDir: any,
  name: string,
  skipSame: boolean
): Promise<'copied' | 'skipped' | null> {
  const from = nativePathOf(src);
  if (!enabled || !from || !destDir?.__aegisNativeFs || typeof destDir.path !== 'string') return null;
  const to = joinPath(destDir.path, name);
  const data = await call(`copy?from=${qp(from)}&to=${qp(to)}${skipSame ? '&skipSame=1' : ''}`, { method: 'POST' });
  return data?.skipped ? 'skipped' : 'copied';
}

abstract class NativeHandle {
  // Plain fields so the handle survives structured clone into IndexedDB (see reviveNativeHandle).
  readonly __aegisNativeFs = true;
  abstract readonly kind: 'file' | 'directory';
  constructor(
    public path: string,
    public name: string
  ) {}

  async isSameEntry(other: any): Promise<boolean> {
    return Boolean(other && other.__aegisNativeFs && other.kind === this.kind && samePath(other.path, this.path));
  }

  async queryPermission(): Promise<PermissionState> {
    return 'granted';
  }

  async requestPermission(): Promise<PermissionState> {
    return 'granted';
  }

  /** move(newName) or move(destDir, newName?) */
  async move(destOrName: any, maybeName?: string): Promise<void> {
    let destDir: string;
    let newName: string;
    if (typeof destOrName === 'string') {
      destDir = parentOf(this.path);
      newName = destOrName;
    } else {
      if (!destOrName?.__aegisNativeFs || destOrName.kind !== 'directory') {
        throw domError('TypeMismatchError', 'Destination is not a folder');
      }
      destDir = destOrName.path;
      newName = maybeName || this.name;
    }
    const to = joinPath(destDir, newName);
    if (samePath(to, this.path)) return;
    await call(`move?from=${qp(this.path)}&to=${qp(to)}`, { method: 'POST' });
    this.path = to;
    this.name = newName;
  }
}

class NativeWritable {
  private parts: (BlobPart | LazyBlob)[] = [];
  private closed = false;

  constructor(
    private readonly handle: NativeFileHandle,
    private readonly keepExistingData: boolean
  ) {}

  async write(chunk: any): Promise<void> {
    if (this.closed) throw domError('InvalidStateError', 'Stream is closed');
    if (chunk && typeof chunk === 'object' && 'type' in chunk && !(chunk instanceof Blob) && !isLazyBlob(chunk)) {
      if (chunk.type === 'write') {
        if (typeof chunk.position === 'number' && chunk.position !== this.currentSizeHint()) {
          throw domError('NotSupportedError', 'Positioned writes are not supported');
        }
        chunk = chunk.data;
      } else if (chunk.type === 'truncate' && chunk.size === 0) {
        this.parts = [];
        return;
      } else {
        throw domError('NotSupportedError', `Write type ${chunk.type} is not supported`);
      }
    }
    if (chunk === undefined || chunk === null) return;
    this.parts.push(chunk);
  }

  private currentSizeHint(): number {
    let n = 0;
    for (const p of this.parts) {
      if (typeof p === 'string') n += new TextEncoder().encode(p).length;
      else if (p instanceof Blob || isLazyBlob(p)) n += p.size;
      else if (ArrayBuffer.isView(p)) n += p.byteLength;
      else if (p instanceof ArrayBuffer) n += p.byteLength;
    }
    return n;
  }

  async truncate(size: number): Promise<void> {
    if (size !== 0) throw domError('NotSupportedError', 'Only truncate(0) is supported');
    this.parts = [];
  }

  async abort(): Promise<void> {
    this.closed = true;
    this.parts = [];
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    const target = this.handle.path;
    // Whole file copied as is: copy on disk, no round trip through the page.
    const only = this.parts.length === 1 ? nativePathOf(this.parts[0]) : null;
    if (only && !this.keepExistingData) {
      await call(`copy?from=${qp(only)}&to=${qp(target)}`, { method: 'POST' });
      return;
    }
    const parts: BlobPart[] = [];
    if (this.keepExistingData) {
      const existing = await stat(target);
      if (existing && existing.size > 0) {
        const resp = await fetch(nativeReadUrl(target), { cache: 'no-store' });
        parts.push(await resp.blob());
      }
    }
    for (const p of this.parts) {
      parts.push(isLazyBlob(p) ? await p.toBlob() : (p as BlobPart));
    }
    await call(`write?path=${qp(target)}`, { method: 'PUT', body: new Blob(parts) });
  }

  getWriter() {
    return {
      write: (c: any) => this.write(c),
      close: () => this.close(),
      abort: () => this.abort(),
      releaseLock: () => {},
    };
  }
}

export class NativeFileHandle extends NativeHandle {
  readonly kind = 'file' as const;
  /** Metadata from the parent listing, to skip a stat request. */
  private known?: VfsEntry;

  constructor(path: string, name: string, known?: VfsEntry) {
    super(path, name);
    if (known) Object.defineProperty(this, 'known', { value: known, writable: true, enumerable: false });
  }

  async getFile(): Promise<File> {
    let meta = this.known;
    this.known = undefined;
    if (!meta) meta = (await stat(this.path)) || undefined;
    if (!meta) throw domError('NotFoundError', this.path);
    if (meta.kind !== 'file') throw domError('TypeMismatchError', this.path);
    if (meta.size > EAGER_FILE_LIMIT) {
      // Callers use name/size/slice/arrayBuffer/stream; createObjectURL and FormData are patched below.
      return new LazyFile(this.path, this.name, meta.size, meta.mtime) as unknown as File;
    }
    const resp = await fetch(nativeReadUrl(this.path), { cache: 'no-store' });
    if (!resp.ok) throw domError(resp.status === 404 ? 'NotFoundError' : 'NotReadableError', this.path);
    const blob = await resp.blob();
    const file = new File([blob], this.name, { lastModified: meta.mtime, type: blob.type === 'application/octet-stream' ? '' : blob.type });
    // Путь на диске: копирование в сборку идёт через Go без пересылки байтов.
    // Path on disk: build copies go through Go without sending the bytes around.
    Object.defineProperty(file, '__aegisPath', { value: this.path, enumerable: false });
    return file;
  }

  async createWritable(opts?: { keepExistingData?: boolean }): Promise<any> {
    return new NativeWritable(this, Boolean(opts?.keepExistingData));
  }
}

export class NativeDirectoryHandle extends NativeHandle {
  readonly kind = 'directory' as const;

  private async list(): Promise<VfsEntry[]> {
    const data = await call(`list?path=${qp(this.path)}`);
    return Array.isArray(data.entries) ? data.entries : [];
  }

  private child(e: VfsEntry): NativeFileHandle | NativeDirectoryHandle {
    const p = joinPath(this.path, e.name);
    return e.kind === 'directory' ? new NativeDirectoryHandle(p, e.name) : new NativeFileHandle(p, e.name, e);
  }

  async *entries(): AsyncGenerator<[string, NativeFileHandle | NativeDirectoryHandle]> {
    for (const e of await this.list()) yield [e.name, this.child(e)];
  }

  async *values(): AsyncGenerator<NativeFileHandle | NativeDirectoryHandle> {
    for (const e of await this.list()) yield this.child(e);
  }

  async *keys(): AsyncGenerator<string> {
    for (const e of await this.list()) yield e.name;
  }

  [Symbol.asyncIterator]() {
    return this.entries();
  }

  async getDirectoryHandle(name: string, opts?: { create?: boolean }): Promise<NativeDirectoryHandle> {
    const p = joinPath(this.path, name);
    const e = await stat(p);
    if (e && e.kind !== 'directory') throw domError('TypeMismatchError', p);
    if (!e) {
      if (!opts?.create) throw domError('NotFoundError', p);
      await call(`mkdir?path=${qp(p)}`, { method: 'POST' });
    }
    return new NativeDirectoryHandle(p, name);
  }

  async getFileHandle(name: string, opts?: { create?: boolean }): Promise<NativeFileHandle> {
    const p = joinPath(this.path, name);
    const e = await stat(p);
    if (e && e.kind !== 'file') throw domError('TypeMismatchError', p);
    if (!e) {
      if (!opts?.create) throw domError('NotFoundError', p);
      await call(`write?path=${qp(p)}`, { method: 'PUT', body: '' });
    }
    return new NativeFileHandle(p, name);
  }

  async removeEntry(name: string, opts?: { recursive?: boolean }): Promise<void> {
    const p = joinPath(this.path, name);
    await call(`remove?path=${qp(p)}${opts?.recursive ? '&recursive=1' : ''}`, { method: 'POST' });
  }

  async resolve(possibleDescendant: any): Promise<string[] | null> {
    if (!possibleDescendant?.__aegisNativeFs) return null;
    const norm = (s: string) => s.replace(/\\/g, '/').replace(/\/+$/, '');
    const base = norm(this.path);
    const target = norm(possibleDescendant.path);
    const eq = separator === '\\' ? (a: string, b: string) => a.toLowerCase() === b.toLowerCase() : (a: string, b: string) => a === b;
    if (eq(base, target)) return [];
    const prefix = base + '/';
    if (!eq(target.slice(0, prefix.length), prefix)) return null;
    return target.slice(prefix.length).split('/');
  }
}

/** Turns a handle read back from IndexedDB (structured clone drops the class) into a live one. */
export function reviveNativeHandle<T>(h: T): T {
  const raw = h as any;
  if (!raw || raw.__aegisNativeFs !== true || raw instanceof NativeHandle) return h;
  if (typeof raw.path !== 'string') return h;
  const name = typeof raw.name === 'string' ? raw.name : baseName(raw.path);
  return (raw.kind === 'file' ? new NativeFileHandle(raw.path, name) : new NativeDirectoryHandle(raw.path, name)) as T;
}

async function pickDirectory(opts?: { id?: string; mode?: string }): Promise<NativeDirectoryHandle> {
  const data = await call('pick', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: opts?.id || '' }),
  });
  return new NativeDirectoryHandle(data.path, data.name || baseName(data.path));
}

function installGlobals(): void {
  const w = window as any;
  w.showDirectoryPicker = pickDirectory;

  // Blob URLs cannot point at a lazily read file: hand out the read URL instead (supports Range for <video>).
  const origCreate = URL.createObjectURL.bind(URL);
  const origRevoke = URL.revokeObjectURL.bind(URL);
  URL.createObjectURL = ((obj: any) =>
    isLazyBlob(obj) ? nativeReadUrl(obj.__aegisPath) : origCreate(obj)) as typeof URL.createObjectURL;
  URL.revokeObjectURL = ((url: string) => {
    if (typeof url === 'string' && url.startsWith(`${API}/read`)) return;
    origRevoke(url);
  }) as typeof URL.revokeObjectURL;

  // Large files go into multipart forms (chdman) as a path reference; Go puts the real file in place.
  const origAppend = FormData.prototype.append;
  FormData.prototype.append = function (this: FormData, name: string, value: any, filename?: string) {
    if (value instanceof LazyFile) {
      const marker = new Blob([`AEGIS-VFS-PATH:${value.__aegisPath}`]);
      return origAppend.call(this, name, marker, filename || value.name);
    }
    return (origAppend as any).apply(this, arguments as any);
  } as typeof FormData.prototype.append;
}

/** Called once before the first render. */
export async function installNativeFsIfNeeded(): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2500);
    const resp = await fetch(`${API}/roots`, { cache: 'no-store', signal: ctrl.signal });
    clearTimeout(timer);
    if (!resp.ok) return;
    const data = await resp.json();
    if (!data?.ok || !data.canPick) return;
    const browserHasPicker = typeof (window as any).showDirectoryPicker === 'function';
    if (!data.preferNative && browserHasPicker) return;
    separator = data.separator === '\\' ? '\\' : '/';
    installGlobals();
    enabled = true;
  } catch {
    // Нет бэкенда: остаётся API браузера. / No backend: the browser API stays.
  }
}
