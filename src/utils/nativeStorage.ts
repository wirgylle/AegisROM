/**
 * Зеркало настроек на диске / On-disk mirror of UI state.
 *
 * RU: localStorage и IndexedDB принадлежат профилю окна (сейчас Edge --app).
 * При переходе на нативное окно (WebView2, WKWebView) профиль будет новым и
 * пустым. Поэтому всё важное дублируется в Go-хранилище
 * (/api/native/storage → appDir/storage/*.json):
 *  - при старте: если в окне ключа нет, а на диске есть, он восстанавливается;
 *    если в окне есть, а на диске нет, он выгружается (разовый перенос);
 *  - при каждой записи отслеживаемого ключа копия на диске обновляется.
 * Без Go-бэкенда (статичный веб) модуль ничего не делает.
 *
 * EN: localStorage and IndexedDB belong to the window's profile (Edge --app
 * today). A native window (WebView2, WKWebView) starts with a new, empty
 * profile, so everything important is mirrored to the Go store
 * (/api/native/storage → appDir/storage/*.json):
 *  - on start: a key missing in the window but present on disk is restored;
 *    a key present in the window but missing on disk is uploaded (one-time move);
 *  - every write of a tracked key refreshes the copy on disk.
 * Without the Go backend (static web build) this module does nothing.
 */

const API = '/api/native/storage';

/** localStorage keys mirrored to disk. */
export const MIRRORED_LOCAL_KEYS = [
  'aegisrom_lang',
  'aegisrom_v0_5_db',
  'aegisrom_v0_5_multi_dbs',
  'aegisrom_v5_filename_constructor',
  'aegisrom_v5_saved_builds',
  'aegisrom_settings_v1',
] as const;

/** Disk key for the IndexedDB library vault (see persistentHandles.ts). */
export const MULTI_DBS_DISK_KEY = 'idb_multi_dbs';

const WRITE_DEBOUNCE_MS = 1200;

let backendAvailable = false;
type PendingValue = string | null | (() => string);
const pendingWrites = new Map<string, PendingValue>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

export function isNativeStorageAvailable(): boolean {
  return backendAvailable;
}

async function listDiskKeys(timeoutMs: number): Promise<Record<string, string> | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const resp = await fetch(API, { cache: 'no-store', signal: ctrl.signal });
    if (!resp.ok) return null;
    const data = await resp.json();
    return data && data.ok && data.keys && typeof data.keys === 'object' ? data.keys : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchDiskValue(key: string): Promise<string | null> {
  try {
    const resp = await fetch(`${API}?key=${encodeURIComponent(key)}`, { cache: 'no-store' });
    return resp.ok ? await resp.text() : null;
  } catch {
    return null;
  }
}

/** Reads a value from disk; null without a backend or when absent. */
export async function readDiskValue(key: string): Promise<string | null> {
  return backendAvailable ? fetchDiskValue(key) : null;
}

async function sendDiskValue(key: string, value: string | null): Promise<void> {
  try {
    await fetch(`${API}?key=${encodeURIComponent(key)}`, {
      method: value === null ? 'DELETE' : 'PUT',
      headers: value === null ? undefined : { 'Content-Type': 'text/plain; charset=utf-8' },
      body: value === null ? undefined : value,
    });
  } catch {
    // Диск недоступен: значение останется в окне и уйдёт при следующей записи.
    // Disk unavailable: the value stays in the window and goes with the next write.
  }
}

function flushPendingWrites(): void {
  flushTimer = null;
  const batch = Array.from(pendingWrites.entries());
  pendingWrites.clear();
  for (const [key, value] of batch) {
    let resolved: string | null;
    try {
      resolved = typeof value === 'function' ? value() : value;
    } catch {
      continue;
    }
    void sendDiskValue(key, resolved);
  }
}

/**
 * Queues a debounced write to disk: a string, null (delete), or a function that
 * builds the string at flush time (keeps JSON.stringify of big libraries off the hot path).
 * Does nothing until hydration has finished, so defaults rendered before it never overwrite disk.
 */
export function writeDiskValue(key: string, value: PendingValue): void {
  if (!backendAvailable) return;
  pendingWrites.set(key, value);
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(flushPendingWrites, WRITE_DEBOUNCE_MS);
}

/** Wraps localStorage.setItem/removeItem so tracked keys are mirrored without touching call sites. */
function installLocalStorageMirror(): void {
  const tracked = new Set<string>(MIRRORED_LOCAL_KEYS);
  const storage = window.localStorage;
  const origSet = storage.setItem.bind(storage);
  const origRemove = storage.removeItem.bind(storage);
  storage.setItem = (key: string, value: string) => {
    origSet(key, value);
    if (tracked.has(key)) writeDiskValue(key, String(value));
  };
  storage.removeItem = (key: string) => {
    origRemove(key);
    if (tracked.has(key)) writeDiskValue(key, null);
  };
}

/**
 * Called once before the first render; never throws. Only the first request has
 * a timeout (`timeoutMs`): without a backend the UI opens right away. Once the
 * backend has answered, the restore runs to the end before the UI reads its
 * state, otherwise defaults rendered early could be mirrored over real data.
 */
export async function hydrateFromNativeStorage(
  idb: {
    load: () => Promise<any[] | null>;
    save: (dbs: any[]) => Promise<void>;
  },
  timeoutMs = 2500
): Promise<void> {
  const diskKeys = await listDiskKeys(timeoutMs);
  if (!diskKeys) return;
  try {
    for (const key of MIRRORED_LOCAL_KEYS) {
      let local: string | null = null;
      try {
        local = localStorage.getItem(key);
      } catch {}
      const onDisk = key in diskKeys;
      if (local === null && onDisk) {
        const value = await fetchDiskValue(key);
        if (value !== null) {
          try {
            localStorage.setItem(key, value);
          } catch {}
        }
      } else if (local !== null && !onDisk) {
        await sendDiskValue(key, local);
      }
    }

    const idbDbs = await idb.load();
    const diskHasDbs = MULTI_DBS_DISK_KEY in diskKeys;
    if (!idbDbs && diskHasDbs) {
      const raw = await fetchDiskValue(MULTI_DBS_DISK_KEY);
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) await idb.save(parsed);
        } catch {}
      }
    } else if (idbDbs && !diskHasDbs) {
      await sendDiskValue(MULTI_DBS_DISK_KEY, JSON.stringify(idbDbs));
    }
  } catch {
    // Частичный перенос лучше, чем закрытое окно. / A partial restore beats a window that never opens.
  }
  backendAvailable = true;
  installLocalStorageMirror();
}
