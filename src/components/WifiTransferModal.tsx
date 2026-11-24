import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  FolderOpen,
  KeyRound,
  Loader2,
  Pencil,
  Plus,
  ShieldCheck,
  Square,
  Trash2,
  Upload,
  Wifi,
  X,
} from 'lucide-react';
import { useI18n } from '../i18n/translations';
import {
  TransferError,
  type TransferJob,
  type TransferPreset,
  type TransferProfile,
  cancelTransfer,
  deleteProfile,
  formatBytes,
  isTransferAvailable,
  listPresets,
  listProfiles,
  pickLocalFolder,
  profileFromPreset,
  saveProfile,
  startTransfer,
  testProfile,
  transferStatus,
} from '../utils/wifiTransfer';

// Окно заливки сборки на приставку по Wi-Fi (SFTP, SMB): устройства, проверка соединения,
// папка сборки и прогресс. Сама передача идёт в Go (aegistransfer), окно только спрашивает состояние.
// Wi-Fi build upload window (SFTP, SMB): devices, connection test, build folder and progress.
// The transfer itself runs in Go (aegistransfer); the window only polls its state.

interface WifiTransferModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Папка только что выгруженной сборки (если известна). / Folder of the just-exported build, if known. */
  initialLocalDir?: string;
  onAddLog?: (msg: string) => void;
}

type Draft = Partial<TransferProfile> & { password?: string; clearPassword?: boolean };

type TestState =
  | { kind: 'idle' }
  | { kind: 'busy' }
  | { kind: 'ok'; free: number; ms: number }
  | { kind: 'trust'; fp: string; prev?: string }
  | { kind: 'error'; code: string; msg: string };

const inputCls =
  'w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/40';
const labelCls = 'block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1';
const btn =
  'px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed';
const btnGhost = `${btn} border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800`;
const btnMain = `${btn} bg-emerald-600 hover:bg-emerald-500 text-white`;

function formatDurationShort(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return '—';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export const WifiTransferModal: React.FC<WifiTransferModalProps> = ({ isOpen, onClose, initialLocalDir, onAddLog }) => {
  const { t, tf } = useI18n();
  const [available, setAvailable] = useState<boolean | null>(null);
  const [presets, setPresets] = useState<TransferPreset[]>([]);
  const [profiles, setProfiles] = useState<TransferProfile[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [formError, setFormError] = useState('');
  const [test, setTest] = useState<TestState>({ kind: 'idle' });
  const [localDir, setLocalDir] = useState(initialLocalDir || '');
  const [job, setJob] = useState<TransferJob | null>(null);
  const [startError, setStartError] = useState('');
  const speedRef = useRef<{ at: number; bytes: number; speed: number }>({ at: 0, bytes: 0, speed: 0 });
  const loggedRef = useRef<string>('');

  const errText = useCallback(
    (code: string, msg: string) => {
      const key = `wifi.err.${code}`;
      const txt = tf(key, { msg });
      return txt === key ? tf('wifi.err.error', { msg: msg || code }) : txt;
    },
    [tf]
  );

  const selected = profiles.find((p) => p.id === selectedId) || null;

  const reload = useCallback(async () => {
    const list = await listProfiles();
    setProfiles(list);
    return list;
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    let alive = true;
    (async () => {
      const ok = await isTransferAvailable();
      if (!alive) return;
      setAvailable(ok);
      if (!ok) return;
      const [pr, list, current] = await Promise.all([listPresets(), listProfiles(), transferStatus().catch(() => null)]);
      if (!alive) return;
      setPresets(pr);
      setProfiles(list);
      if (current) setJob(current);
      const first = current?.profileId || list[0]?.id || '';
      setSelectedId((prev) => prev || first);
      if (list.length === 0) setDraft(null);
    })().catch(() => alive && setAvailable(false));
    return () => {
      alive = false;
    };
  }, [isOpen]);

  useEffect(() => {
    if (initialLocalDir) setLocalDir(initialLocalDir);
  }, [initialLocalDir]);

  // Папка сборки по умолчанию — последняя для этого устройства. / Default build folder: the last one for this device.
  useEffect(() => {
    setTest({ kind: 'idle' });
    if (!initialLocalDir && selected?.localDir) setLocalDir(selected.localDir);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const running = job && (job.state === 'connecting' || job.state === 'planning' || job.state === 'uploading');

  // Опрос состояния заливки. / Poll the upload state.
  useEffect(() => {
    if (!isOpen || !running) return;
    const timer = setInterval(async () => {
      try {
        const j = await transferStatus();
        if (!j) return;
        const now = Date.now();
        const s = speedRef.current;
        if (s.at && now > s.at && j.bytesDone >= s.bytes) {
          const inst = ((j.bytesDone - s.bytes) * 1000) / (now - s.at);
          s.speed = s.speed ? s.speed * 0.7 + inst * 0.3 : inst;
        }
        s.at = now;
        s.bytes = j.bytesDone;
        setJob(j);
      } catch {}
    }, 500);
    return () => clearInterval(timer);
  }, [isOpen, running]);

  // Итог в журнал один раз. / The result goes to the log once.
  useEffect(() => {
    if (!job || running || loggedRef.current === job.id + job.state) return;
    if (!job.finishedAt) return;
    loggedRef.current = job.id + job.state;
    if (job.state === 'done' || job.state === 'cancelled') {
      onAddLog?.(
        tf('wifi.log.done', { name: job.profileName, uploaded: job.uploaded, skipped: job.skipped, failed: job.failed })
      );
    } else if (job.state === 'failed') {
      onAddLog?.(tf('wifi.log.failed', { name: job.profileName, err: errText(job.errorCode || 'error', job.error || '') }));
    }
  }, [job, running, onAddLog, tf, errText]);

  const presetById = useMemo(() => new Map(presets.map((p) => [p.id, p])), [presets]);

  if (!isOpen) return null;

  const openNew = (presetId: string) => {
    const pr = presetById.get(presetId);
    setFormError('');
    setDraft(
      pr
        ? { ...profileFromPreset(pr), password: '' }
        : { name: '', protocol: 'sftp', auth: 'password', host: '', user: '', remoteDir: '/', password: '' }
    );
  };

  const saveDraft = async () => {
    if (!draft) return;
    setFormError('');
    try {
      const { password, clearPassword, hasPassword: _hp, ...profile } = draft;
      const port = Number(profile.port) || undefined;
      const saved = await saveProfile({ ...profile, port }, password || undefined, Boolean(clearPassword));
      await reload();
      setSelectedId(saved.id);
      setDraft(null);
      setTest({ kind: 'idle' });
    } catch (err) {
      const e = err as TransferError;
      setFormError(errText(e.code || 'error', e.message));
    }
  };

  const removeSelected = async () => {
    if (!selected) return;
    if (!window.confirm(tf('wifi.deleteConfirm', { name: selected.name }))) return;
    await deleteProfile(selected.id).catch(() => {});
    const list = await reload();
    setSelectedId(list[0]?.id || '');
  };

  const runTest = async (trust?: string) => {
    if (!selected) return;
    setTest({ kind: 'busy' });
    try {
      const res = await testProfile(selected.id, trust);
      setTest({ kind: 'ok', free: res.freeBytes, ms: res.ms });
      if (trust) await reload();
    } catch (err) {
      const e = err as TransferError;
      if ((e.code === 'host_key_unknown' || e.code === 'host_key_changed') && typeof e.extra.fingerprint === 'string') {
        setTest({ kind: 'trust', fp: e.extra.fingerprint, prev: (e.extra.previous as string) || undefined });
      } else {
        setTest({ kind: 'error', code: e.code, msg: e.message });
      }
    }
  };

  const chooseFolder = async () => {
    const p = await pickLocalFolder(t('wifi.local'));
    if (p) setLocalDir(p);
  };

  const start = async () => {
    if (!selected || !localDir) return;
    setStartError('');
    speedRef.current = { at: 0, bytes: 0, speed: 0 };
    try {
      const j = await startTransfer(selected.id, localDir);
      setJob(j);
      onAddLog?.(tf('wifi.log.start', { local: localDir, name: selected.name, remote: selected.remoteDir }));
    } catch (err) {
      const e = err as TransferError;
      setStartError(errText(e.code, e.message));
    }
  };

  const needsKeyConfirm = selected?.protocol === 'sftp' && !selected.hostKey;
  const remoteLabel = (p: TransferProfile) =>
    p.protocol === 'smb'
      ? `smb://${p.host}${p.port ? `:${p.port}` : ''}/${p.share}/${p.remoteDir}`
      : `sftp://${p.user}@${p.host}${p.port ? `:${p.port}` : ''}${p.remoteDir}`;

  // ---------- форма профиля / profile form ----------
  const renderForm = () => {
    if (!draft) return null;
    const set = (patch: Draft) => setDraft((d) => ({ ...(d || {}), ...patch }));
    const isSmb = draft.protocol === 'smb';
    const pr = draft.preset ? presetById.get(draft.preset) : undefined;
    const presetHint = draft.preset ? t(`wifi.preset.${draft.preset}`, '') : '';
    const editingSaved = Boolean(draft.id);
    return (
      <div className="border border-emerald-300/60 dark:border-emerald-800 rounded-xl p-3.5 space-y-3 bg-emerald-50/40 dark:bg-emerald-950/20">
        {presetHint && (
          <div className="text-[11px] text-slate-600 dark:text-slate-300 space-y-1">
            <p>{presetHint}</p>
            <p className="text-amber-700 dark:text-amber-400">{t('wifi.presetNote')}</p>
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>{t('wifi.f.name')}</label>
            <input className={inputCls} value={draft.name || ''} onChange={(e) => set({ name: e.target.value })} />
          </div>
          <div>
            <label className={labelCls}>{t('wifi.f.protocol')}</label>
            <select
              className={inputCls}
              value={draft.protocol}
              onChange={(e) => {
                const protocol = e.target.value as 'sftp' | 'smb';
                set({
                  protocol,
                  auth: protocol === 'smb' ? (draft.auth === 'key' ? 'password' : draft.auth) : draft.auth === 'guest' ? 'password' : draft.auth,
                });
              }}
            >
              <option value="sftp">SFTP (SSH)</option>
              <option value="smb">SMB (Samba)</option>
            </select>
          </div>
          <div className="sm:col-span-2 grid grid-cols-[1fr_6rem] gap-3">
            <div>
              <label className={labelCls}>{t('wifi.f.host')}</label>
              <input
                className={inputCls}
                placeholder="192.168.1.50"
                value={draft.host || ''}
                onChange={(e) => set({ host: e.target.value })}
              />
            </div>
            <div>
              <label className={labelCls}>{t('wifi.f.port')}</label>
              <input
                className={inputCls}
                inputMode="numeric"
                placeholder={isSmb ? '445' : '22'}
                value={draft.port || ''}
                onChange={(e) => set({ port: Number(e.target.value.replace(/\D/g, '')) || undefined })}
              />
            </div>
            <p className="col-span-2 -mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">{t('wifi.f.hostHint')}</p>
          </div>
          <div>
            <label className={labelCls}>{t('wifi.f.auth')}</label>
            <select className={inputCls} value={draft.auth} onChange={(e) => set({ auth: e.target.value as Draft['auth'] })}>
              <option value="password">{t('wifi.auth.password')}</option>
              {!isSmb && <option value="key">{t('wifi.auth.key')}</option>}
              {isSmb && <option value="guest">{t('wifi.auth.guest')}</option>}
            </select>
          </div>
          {draft.auth !== 'guest' && (
            <div>
              <label className={labelCls}>{t('wifi.f.user')}</label>
              <input className={inputCls} value={draft.user || ''} onChange={(e) => set({ user: e.target.value })} />
            </div>
          )}
          {draft.auth === 'key' && (
            <div className="sm:col-span-2">
              <label className={labelCls}>{t('wifi.f.keyPath')}</label>
              <input
                className={`${inputCls} font-mono`}
                placeholder="C:\Users\me\.ssh\id_ed25519"
                value={draft.keyPath || ''}
                onChange={(e) => set({ keyPath: e.target.value })}
              />
            </div>
          )}
          {draft.auth !== 'guest' && (
            <div className="sm:col-span-2">
              <label className={labelCls}>{draft.auth === 'key' ? t('wifi.f.passphrase') : t('wifi.f.password')}</label>
              <input
                className={inputCls}
                type="password"
                autoComplete="new-password"
                placeholder={editingSaved && draft.hasPassword ? t('wifi.f.passwordSaved') : ''}
                value={draft.password || ''}
                onChange={(e) => set({ password: e.target.value, clearPassword: false })}
              />
              {editingSaved && draft.hasPassword && (
                <label className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-500 cursor-pointer">
                  <input
                    type="checkbox"
                    className="accent-emerald-600"
                    checked={Boolean(draft.clearPassword)}
                    onChange={(e) => set({ clearPassword: e.target.checked, password: '' })}
                  />
                  {t('wifi.f.passwordForget')}
                </label>
              )}
              <p className="mt-1 flex items-start gap-1 text-[11px] text-slate-500 dark:text-slate-400">
                <ShieldCheck className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
                {t('wifi.f.secure')}
              </p>
            </div>
          )}
          {isSmb && (
            <div>
              <label className={labelCls}>{t('wifi.f.share')}</label>
              <input className={inputCls} placeholder="share" value={draft.share || ''} onChange={(e) => set({ share: e.target.value })} />
            </div>
          )}
          <div className={isSmb ? '' : 'sm:col-span-2'}>
            <label className={labelCls}>{isSmb ? t('wifi.f.remoteDirSmb') : t('wifi.f.remoteDir')}</label>
            <input
              className={`${inputCls} font-mono`}
              value={draft.remoteDir || ''}
              onChange={(e) => set({ remoteDir: e.target.value })}
            />
            {pr?.altRemoteDirs && pr.altRemoteDirs.length > 0 && (
              <div className="mt-1 flex flex-wrap items-center gap-1 text-[11px] text-slate-500">
                <span>{t('wifi.f.alt')}</span>
                {[pr.remoteDir, ...pr.altRemoteDirs].map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => set({ remoteDir: d })}
                    className="px-1.5 py-0.5 rounded bg-slate-200/70 dark:bg-slate-800 font-mono hover:bg-emerald-100 dark:hover:bg-emerald-900"
                  >
                    {d}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        {formError && <p className="text-xs text-rose-600 dark:text-rose-400">{formError}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className={btnGhost} onClick={() => setDraft(null)}>
            {t('wifi.cancel')}
          </button>
          <button type="button" className={btnMain} onClick={saveDraft}>
            {t('wifi.save')}
          </button>
        </div>
      </div>
    );
  };

  // ---------- прогресс / progress ----------
  const renderJob = () => {
    if (!job) return null;
    const pctBytes = job.uploadBytes > 0 ? Math.min(100, (job.bytesDone / job.uploadBytes) * 100) : job.state === 'done' ? 100 : 0;
    const pct =
      job.state === 'planning' ? (job.totalFiles ? (job.scanned / job.totalFiles) * 100 : 0) : pctBytes;
    const speed = speedRef.current.speed;
    const left = speed > 0 ? (job.uploadBytes - job.bytesDone) / speed : NaN;
    let headline = '';
    switch (job.state) {
      case 'connecting':
        headline = t('wifi.state.connecting');
        break;
      case 'planning':
        headline = tf('wifi.state.planning', { done: job.scanned, total: job.totalFiles });
        break;
      case 'uploading':
        headline = tf('wifi.state.uploading', { done: job.uploaded + job.failed, total: job.toUpload });
        break;
      case 'done':
        headline = tf('wifi.state.done', { uploaded: job.uploaded, skipped: job.skipped });
        break;
      case 'cancelled':
        headline = t('wifi.state.cancelled');
        break;
      case 'failed':
        headline = t('wifi.state.failed');
        break;
    }
    const tone =
      job.state === 'failed'
        ? 'border-rose-300 dark:border-rose-800 bg-rose-50/60 dark:bg-rose-950/30'
        : job.state === 'done'
          ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-950/30'
          : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60';
    return (
      <div className={`border rounded-xl p-3.5 space-y-2 text-xs ${tone}`}>
        <div className="flex items-center justify-between gap-2">
          <div className="font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-1.5 min-w-0">
            {running ? (
              <Loader2 className="w-4 h-4 animate-spin text-emerald-600 shrink-0" />
            ) : job.state === 'done' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            )}
            <span>{headline}</span>
          </div>
          {running && (
            <button type="button" className={btnGhost} onClick={() => cancelTransfer().catch(() => {})}>
              <Square className="w-3.5 h-3.5" />
              {t('wifi.stop')}
            </button>
          )}
        </div>
        <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
          <div className="h-full bg-emerald-500 transition-[width] duration-300" style={{ width: `${pct.toFixed(1)}%` }} />
        </div>
        {(job.state === 'uploading' || job.uploadBytes > 0) && (
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-slate-600 dark:text-slate-300 tabular-nums">
            <span>{tf('wifi.bytes', { done: formatBytes(job.bytesDone), total: formatBytes(job.uploadBytes) })}</span>
            {running && speed > 0 && <span>{tf('wifi.speed', { speed: formatBytes(speed) })}</span>}
            {running && speed > 0 && <span>{tf('wifi.eta', { time: formatDurationShort(left) })}</span>}
          </div>
        )}
        {running && job.current && (
          <p className="text-slate-500 dark:text-slate-400 font-mono truncate">{tf('wifi.current', { file: job.current })}</p>
        )}
        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          {tf('wifi.stats', { skipped: job.skipped, resumed: job.resumed, reconnects: job.reconnects, failed: job.failed })}
        </p>
        {job.state === 'failed' && job.errorCode && (
          <p className="text-rose-700 dark:text-rose-300">{errText(job.errorCode, job.error || '')}</p>
        )}
        {job.errors && job.errors.length > 0 && (
          <details className="text-[11px]">
            <summary className="cursor-pointer font-semibold text-rose-700 dark:text-rose-300">
              {t('wifi.errors')} ({job.failed})
            </summary>
            <ul className="mt-1 space-y-0.5 max-h-32 overflow-y-auto">
              {job.errors.map((e) => (
                <li key={e.path} className="font-mono text-slate-600 dark:text-slate-300">
                  {e.path}: {errText(e.code, e.message)}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between gap-3">
          <div className="flex items-start gap-2 min-w-0">
            <Wifi className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">{t('wifi.title')}</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{t('wifi.subtitle')}</p>
            </div>
          </div>
          <button onClick={onClose} aria-label={t('wifi.close')} className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-4 space-y-4 text-xs text-slate-700 dark:text-slate-200">
          {available === null && (
            <div className="flex items-center gap-2 text-slate-500">
              <Loader2 className="w-4 h-4 animate-spin" />
              {t('wifi.testing')}
            </div>
          )}
          {available === false && (
            <p className="flex items-start gap-2 text-amber-700 dark:text-amber-400">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {t('wifi.noBackend')}
            </p>
          )}

          {available && (
            <>
              {/* Устройства / Devices */}
              <section className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t('wifi.devices')}</h4>
                  {!draft && (
                    <div className="flex items-center gap-1.5">
                      <select
                        aria-label={t('wifi.addFrom')}
                        className={`${inputCls} w-auto`}
                        value=""
                        onChange={(e) => e.target.value && openNew(e.target.value === '_custom' ? '' : e.target.value)}
                      >
                        <option value="">+ {t('wifi.add')}…</option>
                        {presets.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.label}
                          </option>
                        ))}
                        <option value="_custom">{t('wifi.custom')}</option>
                      </select>
                    </div>
                  )}
                </div>
                {profiles.length === 0 && !draft && (
                  <p className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                    <Plus className="w-3.5 h-3.5" />
                    {t('wifi.noDevices')}
                  </p>
                )}
                {profiles.length > 0 && !draft && (
                  <div className="flex flex-wrap gap-1.5">
                    {profiles.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setSelectedId(p.id)}
                        disabled={Boolean(running)}
                        className={`px-2.5 py-1.5 rounded-lg border text-xs font-semibold ${
                          p.id === selectedId
                            ? 'border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200'
                            : 'border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        {p.name}
                        <span className="ml-1.5 font-normal text-slate-500 uppercase text-[10px]">{p.protocol}</span>
                      </button>
                    ))}
                  </div>
                )}
                {renderForm()}
                {selected && !draft && (
                  <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-3 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <code className="text-[11px] text-slate-600 dark:text-slate-300 break-all">{remoteLabel(selected)}</code>
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          className={btnGhost}
                          disabled={Boolean(running)}
                          onClick={() => {
                            setFormError('');
                            setDraft({ ...selected, password: '' });
                          }}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          {t('wifi.edit')}
                        </button>
                        <button type="button" className={btnGhost} disabled={Boolean(running)} onClick={removeSelected}>
                          <Trash2 className="w-3.5 h-3.5" />
                          {t('wifi.delete')}
                        </button>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        className={btnGhost}
                        disabled={test.kind === 'busy' || Boolean(running)}
                        onClick={() => runTest()}
                      >
                        {test.kind === 'busy' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wifi className="w-3.5 h-3.5" />}
                        {test.kind === 'busy' ? t('wifi.testing') : t('wifi.test')}
                      </button>
                      {test.kind === 'ok' && (
                        <span className="text-emerald-700 dark:text-emerald-300 flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          {tf('wifi.testOk', { free: formatBytes(test.free), ms: test.ms })}
                        </span>
                      )}
                      {test.kind === 'error' && (
                        <span className="text-rose-700 dark:text-rose-300 flex items-start gap-1">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
                          {errText(test.code, test.msg)}
                        </span>
                      )}
                    </div>
                    {test.kind === 'trust' && (
                      <div
                        className={`rounded-lg p-2.5 space-y-2 border ${
                          test.prev
                            ? 'border-rose-300 bg-rose-50 dark:border-rose-800 dark:bg-rose-950/40'
                            : 'border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30'
                        }`}
                      >
                        <p className="font-semibold flex items-center gap-1.5">
                          <KeyRound className="w-3.5 h-3.5" />
                          {t('wifi.trustTitle')}
                        </p>
                        <p className="break-all">
                          {test.prev
                            ? tf('wifi.trustChanged', { fp: test.fp, prev: test.prev })
                            : tf('wifi.trustText', { fp: test.fp })}
                        </p>
                        <button type="button" className={btnMain} onClick={() => runTest(test.fp)}>
                          <ShieldCheck className="w-3.5 h-3.5" />
                          {t('wifi.trust')}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </section>

              {/* Папка сборки и запуск / Build folder and start */}
              {selected && !draft && (
                <section className="space-y-2">
                  <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t('wifi.local')}</h4>
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-[11px] break-all">
                      {localDir || t('wifi.localNone')}
                    </code>
                    <button type="button" className={btnGhost} onClick={chooseFolder} disabled={Boolean(running)}>
                      <FolderOpen className="w-3.5 h-3.5" />
                      {t('wifi.localPick')}
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">{t('wifi.localHint')}</p>
                  {localDir && (
                    <p className="text-[11px] font-mono text-slate-600 dark:text-slate-300 break-all">
                      {tf('wifi.mapping', { local: localDir, remote: remoteLabel(selected) })}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <button
                      type="button"
                      className={btnMain}
                      disabled={!localDir || Boolean(running) || needsKeyConfirm}
                      onClick={start}
                    >
                      <Upload className="w-3.5 h-3.5" />
                      {t('wifi.start')}
                    </button>
                    {needsKeyConfirm && <span className="text-amber-700 dark:text-amber-400">{t('wifi.needTest')}</span>}
                    {startError && <span className="text-rose-700 dark:text-rose-300">{startError}</span>}
                  </div>
                </section>
              )}

              {renderJob()}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
