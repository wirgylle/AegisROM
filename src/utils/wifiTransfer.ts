// Заливка сборки на приставку по Wi-Fi (SFTP, SMB, WebDAV) через локальный Go API (/api/native/transfer/*).
// Uploading a build to a handheld over Wi-Fi (SFTP, SMB) through the local Go API.

export type TransferProtocol = 'sftp' | 'smb' | 'webdav';
export type TransferAuth = 'password' | 'key' | 'guest';

export interface TransferProfile {
  id: string;
  name: string;
  preset?: string;
  protocol: TransferProtocol;
  host: string;
  port?: number;
  user?: string;
  auth: TransferAuth;
  keyPath?: string;
  share?: string;
  remoteDir: string;
  hostKey?: string;
  localDir?: string;
  /** WebDAV по https / WebDAV over https. */
  tls?: boolean;
  hasPassword: boolean;
}

export interface TransferPreset {
  id: string;
  label: string;
  protocol: TransferProtocol;
  user?: string;
  auth: TransferAuth;
  share?: string;
  remoteDir: string;
  altRemoteDirs?: string[];
}

export interface TransferFileError {
  path: string;
  code: string;
  message: string;
}

export type TransferState = 'connecting' | 'planning' | 'uploading' | 'saves' | 'done' | 'failed' | 'cancelled';

/** Итог сверки сохранений / save sync result. */
export interface TransferSaveStats {
  roms: number;
  toDevice: number;
  fromDevice: number;
  conflicts: number;
  failed: number;
}

export interface TransferJob {
  id: string;
  profileId: string;
  profileName: string;
  localDir: string;
  remoteDir: string;
  state: TransferState;
  scanned: number;
  totalFiles: number;
  toUpload: number;
  uploadBytes: number;
  uploaded: number;
  skipped: number;
  failed: number;
  resumed: number;
  bytesDone: number;
  current?: string;
  reconnects: number;
  freeBytes: number;
  startedAt: string;
  finishedAt?: string;
  errorCode?: string;
  error?: string;
  errors?: TransferFileError[];
  syncSaves?: boolean;
  saves?: TransferSaveStats;
}

/** Ответ API с ошибкой / API error answer. */
export class TransferError extends Error {
  code: string;
  extra: Record<string, unknown>;
  constructor(code: string, message: string, extra: Record<string, unknown> = {}) {
    super(message);
    this.code = code;
    this.extra = extra;
  }
}

const API = '/api/native/transfer';

async function call<T = any>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const opts: RequestInit = { cache: 'no-store', ...init };
  if (init?.json !== undefined) {
    opts.method = opts.method || 'POST';
    opts.headers = { 'Content-Type': 'application/json' };
    opts.body = JSON.stringify(init.json);
  }
  let resp: Response;
  try {
    resp = await fetch(`${API}/${path}`, opts);
  } catch (err) {
    throw new TransferError('no_backend', String(err));
  }
  let data: any = null;
  try {
    data = await resp.json();
  } catch {
    throw new TransferError(resp.status === 404 ? 'no_backend' : 'error', `HTTP ${resp.status}`);
  }
  if (!data || data.ok !== true) {
    const { code = 'error', message = '', ...extra } = data || {};
    throw new TransferError(String(code), String(message), extra);
  }
  return data as T;
}

/** Есть ли Go API с заливкой (десктоп-версия). / Is the Go API with uploads there (desktop app). */
export async function isTransferAvailable(): Promise<boolean> {
  try {
    await call('presets');
    return true;
  } catch {
    return false;
  }
}

export const listPresets = () => call<{ presets: TransferPreset[] }>('presets').then((d) => d.presets);
export const listProfiles = () => call<{ profiles: TransferProfile[] }>('profiles').then((d) => d.profiles || []);

export function saveProfile(profile: Partial<TransferProfile>, password?: string, clearPassword = false) {
  const body: Record<string, unknown> = { profile };
  if (password) body.password = password;
  if (clearPassword) body.clearPassword = true;
  return call<{ profile: TransferProfile }>('profiles', { json: body }).then((d) => d.profile);
}

export const deleteProfile = (id: string) =>
  call(`profiles?id=${encodeURIComponent(id)}`, { method: 'DELETE' });

export interface TestResult {
  freeBytes: number;
  writable: boolean;
  ms: number;
}

export const testProfile = (id: string, trustHostKey?: string) =>
  call<TestResult>('test', { json: { id, trustHostKey } });

/** syncSaves: сверить сохранения по .aegis-saves-map.json сборки. / Reconcile saves via the build's links file. */
export const startTransfer = (id: string, localPath: string, syncSaves = false) =>
  call<{ job: TransferJob; saveLinks?: number }>('start', { json: { id, localPath, syncSaves } }).then((d) => ({
    ...d.job,
    saveLinks: d.saveLinks || 0,
  }));

export const transferStatus = () => call<{ job: TransferJob | null }>('status').then((d) => d.job);
export const cancelTransfer = () => call('cancel', { json: {} });

/** Нативный диалог выбора папки; путь становится доступным для Go. / Native folder dialog; Go may use the path. */
export async function pickLocalFolder(title: string): Promise<string | null> {
  try {
    const resp = await fetch('/api/native/vfs/pick', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    const data = await resp.json();
    return data && data.ok && typeof data.path === 'string' ? data.path : null;
  } catch {
    return null;
  }
}

/**
 * Подпапка сборки, которая на устройстве становится папкой ромов (по профилю сборки).
 * Build subfolder that becomes the ROM folder on the device (by build profile).
 * R36S/ArkOS: EASYROMS → /roms; Miyoo/Anbernic: Roms → …/Roms; Steam Deck: Emulation/roms.
 */
export function buildRomSubfolder(buildProfileId: string): string {
  switch (buildProfileId) {
    case 'r36s_arkos':
      return 'EASYROMS';
    case 'miyoo_anbernic':
      return 'Roms';
    case 'steamdeck_emudeck':
      return 'Emulation/roms';
    default:
      return '';
  }
}

/** Склеивает путь с подпапкой в стиле ОС. / Joins a path with a subfolder in the OS style. */
export function joinLocalPath(base: string, sub: string): string {
  if (!sub) return base;
  const sep = base.includes('\\') && !base.includes('/') ? '\\' : '/';
  const clean = base.replace(/[\\/]+$/, '');
  return `${clean}${sep}${sub.split('/').join(sep)}`;
}

/** Последняя папка выгруженной сборки (только для нативных папок). / Last exported build folder (native folders only). */
const LAST_BUILD_KEY = 'aegisrom_wifi_last_build_dir_v1';

export function rememberLastBuildFolder(path: string): void {
  try {
    localStorage.setItem(LAST_BUILD_KEY, path);
  } catch {}
}

export function lastBuildFolder(): string {
  try {
    return localStorage.getItem(LAST_BUILD_KEY) || '';
  } catch {
    return '';
  }
}

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '—';
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v >= 100 ? v.toFixed(0) : v.toFixed(1)} ${units[i]}`;
}

/** Профиль по заготовке / profile from a preset. */
export function profileFromPreset(p: TransferPreset): Partial<TransferProfile> {
  return {
    name: p.label.replace(/\s*\((SFTP|SMB|WebDAV)\)$/, ''),
    preset: p.id,
    protocol: p.protocol,
    user: p.user || '',
    auth: p.auth,
    share: p.share || '',
    remoteDir: p.remoteDir,
    host: '',
  };
}

/** Порт по умолчанию / default port. */
export function defaultPort(p: Pick<TransferProfile, 'protocol' | 'tls'>): number {
  if (p.protocol === 'smb') return 445;
  if (p.protocol === 'webdav') return p.tls ? 443 : 80;
  return 22;
}

/** Адрес папки ромов для показа / ROM folder address for display. */
export function remoteLabel(p: TransferProfile): string {
  const port = p.port ? `:${p.port}` : '';
  if (p.protocol === 'smb') return `smb://${p.host}${port}/${p.share}/${p.remoteDir}`;
  if (p.protocol === 'webdav') {
    const user = p.auth === 'guest' || !p.user ? '' : `${p.user}@`;
    return `${p.tls ? 'https' : 'http'}://${user}${p.host}${port}${p.remoteDir}`;
  }
  return `sftp://${p.user}@${p.host}${port}${p.remoteDir}`;
}
