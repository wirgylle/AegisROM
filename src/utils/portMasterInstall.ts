// Установка порта PortMaster в папку библиотеки: скачать архив, распаковать в ports/,
// найти скрипт запуска, при необходимости положить данные игры в нужную подпапку.
// Installing a PortMaster port into the library folder: download the archive, unpack into ports/,
// find the launch script and, when given, put the game data into the required subfolder.

import { forEachZipEntry } from './zipReader.ts';

export const PORTS_DIR_NAME = 'ports';

export type PortInstallPhase = 'folder' | 'download' | 'unpack' | 'data' | 'done' | 'error';

export interface PortInstallProgress {
  phase: PortInstallPhase;
  /** 0..100, или -1, если размер неизвестен. / 0..100, or -1 when the size is unknown. */
  pct: number;
  done?: number;
  total?: number;
  error?: string;
}

export interface PortInstallResult {
  files: number;
  /** Скрипт запуска относительно папки ports/. / Launch script relative to ports/. */
  launcher: string;
  /** Путь от корня библиотеки, как relativePath у ромов. / Path from the library root, like ROM relativePath. */
  relativePath: string;
  dataFiles: number;
}

/**
 * Безопасный путь записи из архива: без «..», без абсолютных путей и букв дисков.
 * null — запись пропускаем (защита от zip-slip).
 * Safe path of an archive entry: no "..", no absolute paths or drive letters.
 * null means the entry is skipped (zip-slip guard).
 */
export function safeZipPath(name: string): string[] | null {
  const norm = name.replace(/\\/g, '/');
  if (/^[a-zA-Z]:/.test(norm) || norm.startsWith('/')) return null;
  const segs = norm.split('/').filter((s) => s && s !== '.');
  if (segs.length === 0) return null;
  if (segs.some((s) => s === '..')) return null;
  return segs;
}

/**
 * Скрипт запуска порта: .sh в корне архива. Если архив обёрнут в папку ports/, тоже ищем.
 * The port's launch script: a .sh at the archive root. Also handles archives wrapped in ports/.
 */
export function findLauncherScript(names: string[], slug = ''): string {
  const rootSh = names
    .map((n) => n.replace(/\\/g, '/'))
    .filter((n) => /\.sh$/i.test(n) && !n.slice(0, -3).includes('/'));
  if (rootSh.length === 0) return '';
  const want = slug.toLowerCase().replace(/[^a-z0-9]/g, '');
  const bySlug = rootSh.find(
    (n) => n.replace(/\.sh$/i, '').toLowerCase().replace(/[^a-z0-9]/g, '') === want
  );
  return bySlug || rootSh[0];
}

/** Некоторые архивы лежат внутри папки ports/ — её срезаем. / Some archives sit inside ports/ — strip it. */
export function stripPortsPrefix(segs: string[]): string[] {
  if (segs.length > 1 && segs[0].toLowerCase() === PORTS_DIR_NAME) return segs.slice(1);
  return segs;
}

async function ensureDir(base: any, segs: string[]): Promise<any> {
  let h = base;
  for (const s of segs) h = await h.getDirectoryHandle(s, { create: true });
  return h;
}

async function writeFileAt(base: any, segs: string[], data: BufferSource | Blob): Promise<void> {
  const dir = await ensureDir(base, segs.slice(0, -1));
  const fh = await dir.getFileHandle(segs[segs.length - 1], { create: true });
  const w = await fh.createWritable();
  await w.write(data);
  await w.close();
}

/**
 * Распаковывает архив порта в папку ports/. Пишет по одной записи, прогресс по количеству.
 * Unpacks the port archive into ports/. Writes one entry at a time, progress by count.
 */
export async function unpackPortZip(
  portsDir: any,
  zip: Uint8Array,
  slug: string,
  onProgress?: (done: number, total: number) => void
): Promise<{ files: number; launcher: string }> {
  const names: string[] = [];
  let files = 0;
  await forEachZipEntry(zip, async (entry, idx, total) => {
    const raw = safeZipPath(entry.name);
    const segs = raw ? stripPortsPrefix(raw) : null;
    if (segs) {
      names.push(segs.join('/') + (entry.isDirectory ? '/' : ''));
      if (entry.isDirectory) await ensureDir(portsDir, segs);
      else {
        await writeFileAt(portsDir, segs, entry.data as unknown as BufferSource);
        files++;
      }
    }
    onProgress?.(idx + 1, total);
  });
  return { files, launcher: findLauncherScript(names, slug) };
}

/**
 * Копирует папку с данными игры (выбранную пользователем) в нужную подпапку порта.
 * Copies the user's game data folder into the port's required subfolder.
 */
export async function copyPortData(
  portsDir: any,
  requiredDataTargetPath: string,
  source: { dirHandle?: any; files?: Array<{ file: File; relPath: string }> } | undefined,
  onFile?: (done: number) => void
): Promise<number> {
  if (!source || (!source.dirHandle && !(source.files && source.files.length))) return 0;
  const sub = stripPortsPrefix(safeZipPath(requiredDataTargetPath) || []);
  const target = await ensureDir(portsDir, sub);
  let n = 0;
  const walk = async (src: any, dst: any) => {
    for await (const entry of src.values()) {
      if (entry.kind === 'directory') {
        await walk(entry, await dst.getDirectoryHandle(entry.name, { create: true }));
      } else if (entry.kind === 'file') {
        await writeFileAt(dst, [entry.name], await entry.getFile());
        onFile?.(++n);
      }
    }
  };
  if (source.dirHandle) {
    await walk(source.dirHandle, target);
  } else {
    for (const sf of source.files || []) {
      const rel = sf.relPath.includes('/') ? sf.relPath.slice(sf.relPath.indexOf('/') + 1) : sf.relPath;
      const segs = safeZipPath(rel);
      if (!segs) continue;
      await writeFileAt(target, segs, sf.file);
      onFile?.(++n);
    }
  }
  return n;
}

/**
 * Скачивает ответ целиком, сообщая прогресс по Content-Length (или -1, если его нет).
 * Downloads the whole response, reporting progress by Content-Length (or -1 when absent).
 */
export async function fetchWithProgress(
  url: string,
  onProgress?: (received: number, total: number) => void,
  fetchImpl: typeof fetch = fetch
): Promise<Uint8Array> {
  const resp = await fetchImpl(url);
  if (!resp.ok) {
    let msg = '';
    try {
      msg = (await resp.text()).trim().slice(0, 200);
    } catch {}
    throw new Error(msg ? `HTTP ${resp.status}: ${msg}` : `HTTP ${resp.status}`);
  }
  const total = Number(resp.headers.get('Content-Length') || 0) || 0;
  if (!resp.body || typeof (resp.body as any).getReader !== 'function') {
    const buf = new Uint8Array(await resp.arrayBuffer());
    onProgress?.(buf.byteLength, total || buf.byteLength);
    return buf;
  }
  const reader = (resp.body as any).getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.byteLength;
    onProgress?.(received, total);
  }
  const out = new Uint8Array(received);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.byteLength;
  }
  return out;
}

/** Процент 0..100 или -1. / Percent 0..100 or -1. */
export function pctOf(done: number, total: number): number {
  if (!total || total <= 0) return -1;
  return Math.max(0, Math.min(100, Math.round((done / total) * 100)));
}

/** Папка из нативной прослойки (Go по абсолютному пути). / A folder from the native layer (Go, absolute path). */
export function nativeDirPath(dir: any): string | null {
  return dir && dir.__aegisNativeFs && typeof dir.path === 'string' && dir.path ? dir.path : null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Установка силами Go: архив качается и распаковывается прямо на диске, окно только опрашивает ход.
 * Install done by Go: the archive is downloaded and unpacked on disk, the window only polls progress.
 */
async function installViaNative(
  rootPath: string,
  portUrl: string,
  slug: string,
  onProgress: ((p: PortInstallProgress) => void) | undefined,
  fetchImpl: typeof fetch,
  pollMs: number
): Promise<{ files: number; launcher: string }> {
  const start = await fetchImpl('/api/portmaster/install', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: portUrl, dest: rootPath, slug }),
  });
  if (!start.ok) {
    let msg = '';
    try {
      const txt = (await start.text()).trim();
      try {
        const j = JSON.parse(txt);
        msg = j?.message || j?.error || txt;
      } catch {
        msg = txt;
      }
    } catch {}
    throw new Error(msg ? `HTTP ${start.status}: ${msg.slice(0, 200)}` : `HTTP ${start.status}`);
  }
  const { id } = await start.json();
  for (;;) {
    await sleep(pollMs);
    const r = await fetchImpl(`/api/portmaster/install/status?id=${encodeURIComponent(id)}`, {
      cache: 'no-store',
    } as RequestInit);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const st = await r.json();
    if (st.phase === 'error') throw new Error(st.error || 'install failed');
    if (st.phase === 'done') return { files: Number(st.files) || 0, launcher: st.launcher || '' };
    const phase: PortInstallPhase = st.phase === 'unpack' ? 'unpack' : 'download';
    onProgress?.({ phase, pct: pctOf(st.done, st.total), done: st.done, total: st.total });
  }
}

/**
 * Скачать и распаковать архив порта в папку ports/ (любую: библиотеки или сборки).
 * В нативном окне всё делает Go на диске; в браузере архив идёт через память окна.
 * Download and unpack a port archive into a ports/ folder (the library's or a build's).
 * In the native window Go does it all on disk; in a browser the archive goes through window memory.
 */
export async function downloadAndUnpackPort(opts: {
  portsDir: any;
  portUrl: string;
  slug: string;
  onProgress?: (p: PortInstallProgress) => void;
  fetchImpl?: typeof fetch;
  pollMs?: number;
}): Promise<{ files: number; launcher: string }> {
  const { portsDir, portUrl, slug, onProgress } = opts;
  const fetchImpl = opts.fetchImpl || fetch;
  onProgress?.({ phase: 'download', pct: 0 });
  const nativePath = nativeDirPath(portsDir);
  if (nativePath) {
    return installViaNative(nativePath, portUrl, slug, onProgress, fetchImpl, opts.pollMs ?? 400);
  }
  const zip = await fetchWithProgress(
    `/api/portmaster/download?url=${encodeURIComponent(portUrl)}`,
    (got, total) => onProgress?.({ phase: 'download', pct: pctOf(got, total), done: got, total }),
    fetchImpl
  );
  onProgress?.({ phase: 'unpack', pct: 0 });
  return unpackPortZip(portsDir, zip, slug, (done, total) =>
    onProgress?.({ phase: 'unpack', pct: pctOf(done, total), done, total })
  );
}

/**
 * Полная установка в библиотеку: ports/ → скачать и распаковать → данные игры.
 * Full install into the library: ports/ → download and unpack → game data.
 */
export async function installPortMasterPort(opts: {
  libraryRoot: any;
  /** Ссылка на архив в каталоге PortMaster. / Archive link from the PortMaster catalog. */
  portUrl: string;
  slug: string;
  requiredDataTargetPath: string;
  dataSource?: { dirHandle?: any; files?: Array<{ file: File; relPath: string }> };
  onProgress?: (p: PortInstallProgress) => void;
  fetchImpl?: typeof fetch;
  pollMs?: number;
}): Promise<PortInstallResult> {
  const { libraryRoot, slug, onProgress } = opts;
  onProgress?.({ phase: 'folder', pct: -1 });
  const portsDir = await libraryRoot.getDirectoryHandle(PORTS_DIR_NAME, { create: true });
  const { files, launcher } = await downloadAndUnpackPort({
    portsDir,
    portUrl: opts.portUrl,
    slug,
    onProgress,
    fetchImpl: opts.fetchImpl,
    pollMs: opts.pollMs,
  });
  if (files === 0) throw new Error('empty-archive');

  let dataFiles = 0;
  if (opts.dataSource) {
    onProgress?.({ phase: 'data', pct: -1 });
    dataFiles = await copyPortData(portsDir, opts.requiredDataTargetPath, opts.dataSource, (n) =>
      onProgress?.({ phase: 'data', pct: -1, done: n })
    );
  }

  const launcherName = launcher || `${slug}.sh`;
  onProgress?.({ phase: 'done', pct: 100 });
  return {
    files,
    launcher: launcherName,
    relativePath: `${PORTS_DIR_NAME}/${launcherName}`,
    dataFiles,
  };
}
