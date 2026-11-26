/**
 * Persistent File System Access API Handle Vault (IndexedDB) + Media Hydration
 * Solves browser re-prompting across reloads AND restores local cover/video URLs
 * when opening saved `.aegisdb.json` database files without re-scanning folders!
 */

import { MULTI_DBS_DISK_KEY, writeDiskValue } from './nativeStorage';
import { reviveNativeHandle } from './nativeFs';
import { MediaKindIndex, stripBlobMedia, stripMediaSuffix } from './mediaKinds';
import { isManualFile, isNonCoverDir, manualStem } from './skraperMedia';
import { classifyGameMediaFile, gameMediaNameKey, NON_COVER_KINDS, type GameMediaKind } from './gameMediaKinds';

const IDB_NAME = 'AegisROM_FS_Handles_v5';
const IDB_STORE = 'directory_handles';

export interface StoredDirHandleRecord {
  key: string;
  folderName: string;
  libraryPathHint?: string;
  updatedAt: string;
  handle: any; // FileSystemDirectoryHandle
}

function openHandleDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB open failed'));
  });
}

export async function saveDirectoryHandle(
  key: string,
  handle: any,
  libraryPathHint?: string
): Promise<void> {
  if (!handle || typeof handle.name !== 'string') return;
  try {
    const db = await openHandleDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      const rec: StoredDirHandleRecord = {
        key,
        folderName: handle.name,
        libraryPathHint: libraryPathHint || handle.name,
        updatedAt: new Date().toISOString(),
        handle,
      };
      store.put(rec);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Ignore IDB errors in restricted incognito/sandbox contexts
  }
}

export async function loadDirectoryHandleRecord(
  key: string
): Promise<StoredDirHandleRecord | null> {
  try {
    const db = await openHandleDb();
    const rec = await new Promise<StoredDirHandleRecord | null>((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const req = store.get(key);
      req.onsuccess = () => {
        const r = (req.result as StoredDirHandleRecord) || null;
        resolve(r ? { ...r, handle: reviveNativeHandle(r.handle) } : null);
      };
      req.onerror = () => resolve(null);
    });
    db.close();
    return rec;
  } catch {
    return null;
  }
}

export async function listAllSavedDirectoryHandles(): Promise<StoredDirHandleRecord[]> {
  try {
    const db = await openHandleDb();
    const list = await new Promise<StoredDirHandleRecord[]>((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const req = store.getAll();
      req.onsuccess = () =>
        resolve(
          Array.isArray(req.result)
            ? req.result.map((r: StoredDirHandleRecord) => ({ ...r, handle: reviveNativeHandle(r.handle) }))
            : []
        );
      req.onerror = () => resolve([]);
    });
    db.close();
    return list;
  } catch {
    return [];
  }
}

export async function findSavedHandleMatchingPath(
  pathOrFolderName?: string
): Promise<StoredDirHandleRecord | null> {
  const all = await listAllSavedDirectoryHandles();
  if (all.length === 0) return null;

  if (pathOrFolderName && pathOrFolderName.trim()) {
    const norm = pathOrFolderName.replace(/\\/g, '/').toLowerCase().trim();
    const lastSegment = norm.split('/').filter(Boolean).pop() || norm;

    const exact = all.find(
      (r) =>
        r.folderName.toLowerCase() === lastSegment ||
        (r.libraryPathHint || '').replace(/\\/g, '/').toLowerCase() === norm ||
        norm.includes(r.folderName.toLowerCase())
    );
    if (exact) return exact;
  }

  return (
    all.find((r) => r.key === 'library_root') ||
    all.find((r) => r.key === 'scan_root') ||
    all[0]
  );
}

/**
 * Checks permission on a stored FileSystemDirectoryHandle without forcing a prompt
 * unless `allowPrompt` is true (called inside a user click gesture).
 */
export async function checkOrRequestHandlePermission(
  handle: any,
  mode: 'read' | 'readwrite' = 'readwrite',
  allowPrompt = false
): Promise<'granted' | 'prompt' | 'denied'> {
  if (!handle) return 'denied';
  try {
    if (typeof handle.queryPermission === 'function') {
      const q = await handle.queryPermission({ mode });
      if (q === 'granted') return 'granted';
      if (allowPrompt && typeof handle.requestPermission === 'function') {
        const req = await handle.requestPermission({ mode });
        return req;
      }
      return q;
    }
    return 'granted';
  } catch {
    return 'denied';
  }
}

function normalizeStemKey(name: string): string {
  return name
    .replace(/\.[^/.]+$/, '')
    .replace(/-image$|-marquee$|-thumb$|-video$/i, '')
    .replace(/\[.*?\]|\(.*?\)/g, ' ')
    .replace(/[^a-z0-9а-яё]/gi, '')
    .toLowerCase();
}

export interface HydratedMediaIndex {
  imagesByStem: Map<string, File>;
  videosByStem: Map<string, File>;
  /** Картинки по видам (боксарт, скриншот, баннер…). / Images by kind (box art, screenshot, banner…). */
  kinds: MediaKindIndex<File>;
  /** Мануалы (PDF) по имени рома; path — путь от корня. / Manuals (PDF) by ROM name; path from the root. */
  manualsByStem: Map<string, { file: File; path: string }>;
  /**
   * Какие виды медиа есть у имени (обложка, фон, карты, носитель, мануал…), для фильтра «Медиа».
   * Ключи: имя без суффикса в нижнем регистре и gameMediaNameKey.
   * Which media kinds a name has (cover, fan art, maps, cartridge, manual…), for the "Media" filter.
   */
  kindsByStem: Map<string, Set<GameMediaKind>>;
}

/** Виды медиа строки по индексу. / A row's media kinds from the index. */
export function lookupMediaKinds(idx: HydratedMediaIndex, keys: Iterable<string>): GameMediaKind[] {
  const out = new Set<GameMediaKind>();
  for (const k of keys) {
    if (!k) continue;
    for (const key of [k.toLowerCase(), gameMediaNameKey(k)]) {
      const hit = key ? idx.kindsByStem.get(key) : undefined;
      if (hit) hit.forEach((x) => out.add(x));
    }
  }
  return Array.from(out);
}

/**
 * Walks a directory handle (root + images/, videos/, console subfolders) and collects
 * local artwork and video files so a DB opened from JSON immediately gets real local covers!
 */
// Глубина 5: корень → roms → консоль → media → images (раскладка Skraper) и ещё уровень запаса.
// Depth 5: root → roms → console → media → images (Skraper layout) plus one spare level.
export async function collectLocalMediaFromHandle(
  rootHandle: any,
  maxDepth = 5
): Promise<HydratedMediaIndex> {
  const imagesByStem = new Map<string, File>();
  const videosByStem = new Map<string, File>();
  const kinds = new MediaKindIndex<File>();
  const manualsByStem = new Map<string, { file: File; path: string }>();
  const kindsByStem = new Map<string, Set<GameMediaKind>>();

  const registerFile = (file: File, dirName: string, path: string) => {
    const low = file.name.toLowerCase();
    // Вид по папке и суффиксу: для фильтра «Медиа», и чтобы фон или карта не стали обложкой.
    // Kind by folder and suffix: for the "Media" filter, and so fan art or a map never becomes a cover.
    const dirPath = path.split('/').slice(0, -1).join('/');
    const gm = classifyGameMediaFile(file.name, dirPath);
    if (gm) {
      for (const key of [gm.stem.toLowerCase(), gameMediaNameKey(gm.stem)]) {
        if (!key) continue;
        let set = kindsByStem.get(key);
        if (!set) kindsByStem.set(key, (set = new Set()));
        set.add(gm.kind);
      }
      if (NON_COVER_KINDS.has(gm.kind) && gm.kind !== 'manual') return;
    }
    if (isManualFile(file.name, dirName)) {
      const k = manualStem(file.name).toLowerCase();
      const nk = normalizeStemKey(manualStem(file.name));
      for (const key of [k, nk]) if (key && !manualsByStem.has(key)) manualsByStem.set(key, { file, path });
      return;
    }
    const isImg = /\.(png|jpe?g|webp|bmp)$/i.test(low);
    const isVid = /\.(mp4|webm|mkv)$/i.test(low);
    if (!isImg && !isVid) return;
    // Фон, карты, картридж (папки Skraper) — не обложки. / Fan art, maps, cartridges: not covers.
    if (isImg && isNonCoverDir(dirName)) return;

    const rawNoExt = file.name.replace(/\.[^/.]+$/, '').toLowerCase();
    const strippedSuffix = rawNoExt.replace(/-image$|-marquee$|-thumb$|-video$/i, '');
    const normKey = normalizeStemKey(file.name);

    const targetMap = isImg ? imagesByStem : videosByStem;
    for (const k of [rawNoExt, strippedSuffix, normKey]) {
      if (k && !targetMap.has(k)) {
        targetMap.set(k, file);
      }
    }
    if (isImg) {
      const anySuffix = stripMediaSuffix(file.name).toLowerCase();
      if (anySuffix && !imagesByStem.has(anySuffix)) imagesByStem.set(anySuffix, file);
      kinds.addFile([rawNoExt, strippedSuffix, anySuffix, normKey], file.name, dirName, file);
    }
  };

  async function walk(dirHandle: any, depth: number, prefix: string) {
    if (!dirHandle || depth > maxDepth) return;
    try {
      for await (const entry of dirHandle.values()) {
        if (entry.name.startsWith('.')) continue;
        if (entry.kind === 'directory') {
          const lowDir = entry.name.toLowerCase();
          if (lowDir === '_duplicates_1g1r' || lowDir === '_baddumps_junk') continue;
          await walk(entry, depth + 1, prefix ? `${prefix}/${entry.name}` : entry.name);
        } else if (entry.kind === 'file') {
          if (/\.(png|jpe?g|webp|bmp|gif|mp4|webm|mkv|pdf|txt)$/i.test(entry.name)) {
            try {
              const f = await entry.getFile();
              const path = prefix ? `${prefix}/${entry.name}` : entry.name;
              if (f.size > 0) registerFile(f, dirHandle.name || '', path);
            } catch {}
          }
        }
      }
    } catch {}
  }

  await walk(rootHandle, 0, '');
  return { imagesByStem, videosByStem, kinds, manualsByStem, kindsByStem };
}

/**
 * Strips dead `blob:` URLs before saving `.aegisdb.json` and ensures every row keeps
 * clean local relative hint + Libretro fallback metadata so reopening works anywhere.
 */
export function isDeadOrLocalBlobUrl(url?: string): boolean {
  return Boolean(url && url.startsWith('blob:'));
}

// ============================================================================
// ASYNC INDEXEDDB MULTI-DATABASE VAULT (large libraries without UI lag)
// ============================================================================
const DB_CACHE_IDB = 'AegisROM_DB_Cache_v05';
const DB_CACHE_STORE = 'multi_dbs';

function openLargeDbCache(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_CACHE_IDB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(DB_CACHE_STORE)) {
        db.createObjectStore(DB_CACHE_STORE, { keyPath: 'slot' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB open failed'));
  });
}

export async function saveMultiDbsToIndexedDB(dbs: any[]): Promise<void> {
  try {
    const sanitized = dbs.map((u) => ({
      ...u,
      rows: Array.isArray(u.rows)
        ? u.rows.map((r: any) => ({
            ...r,
            fileObj: undefined,
            manualFile: undefined,
            companionFiles: undefined,
            parentHandle: undefined,
            discs: Array.isArray(r.discs)
              ? r.discs.map((d: any) => ({ ...d, parentHandle: undefined }))
              : r.discs,
            boxArtUrl: isDeadOrLocalBlobUrl(r.boxArtUrl) ? undefined : r.boxArtUrl,
            videoUrl: isDeadOrLocalBlobUrl(r.videoUrl) ? undefined : r.videoUrl,
            media: stripBlobMedia(r.media),
          }))
        : [],
    }));
    // Копия на диск для нативного окна (stringify откладывается до записи).
    // Disk copy for the native window (stringify is deferred to the write).
    writeDiskValue(MULTI_DBS_DISK_KEY, () => JSON.stringify(sanitized));
    const db = await openLargeDbCache();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(DB_CACHE_STORE, 'readwrite');
      tx.objectStore(DB_CACHE_STORE).put({ slot: 'active_multi_dbs', dbs: sanitized });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Ignore IDB storage errors silently
  }
}

export async function loadMultiDbsFromIndexedDB(): Promise<any[] | null> {
  try {
    const db = await openLargeDbCache();
    const res = await new Promise<any>((resolve) => {
      const tx = db.transaction(DB_CACHE_STORE, 'readonly');
      const req = tx.objectStore(DB_CACHE_STORE).get('active_multi_dbs');
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
    db.close();
    if (res && Array.isArray(res.dbs) && res.dbs.length > 0) {
      return res.dbs;
    }
  } catch {}
  return null;
}

