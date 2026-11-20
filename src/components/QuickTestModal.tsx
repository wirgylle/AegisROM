import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X, FileUp, Loader2, AlertTriangle, Maximize2, Gamepad2, Save } from 'lucide-react';
import { useI18n } from '../i18n/translations';
import { nativeRomQuery, saveBaseName, sameBytes, type NativeRomRef, type SaveKind } from '../utils/romSaves';
import {
  QUICK_TEST_MAX_BYTES,
  emulatorJsLanguage,
  fileExt,
  type QuickTestCore,
} from '../utils/quickTest';

/** Где взять файл рома для теста. */
export type QuickTestSource =
  | { kind: 'file'; file: File }
  | ({ kind: 'native' } & NativeRomRef)
  | { kind: 'pick' };

export interface QuickTestRequest {
  title: string;
  consoleShort: string;
  core: QuickTestCore;
  source: QuickTestSource;
  /** Проверенный BIOS из раздела «BIOS» (имя файла как в папке system RetroArch). */
  biosFile?: File | null;
  /** Где ром лежит на диске (десктоп): тогда сохранения пишутся файлами рядом с ним. */
  saveTarget?: NativeRomRef | null;
}

interface QuickTestModalProps {
  request: QuickTestRequest;
  onClose: () => void;
  onAddLog?: (msg: string) => void;
  /** Открыть «Среда → BIOS», если для консоли нужен BIOS, а его нет. */
  onOpenBios?: () => void;
}

type Phase = 'loading' | 'pick' | 'starting' | 'running' | 'error' | 'needBios';

const PLAYER_URL = '/quicktest/player.html';
const FLUSH_TIMEOUT_MS = 4000;

/** Сохранения на диске: 'off' нет, 'checking' ждём ответ API, 'on' пишем рядом с ромом. */
type DiskSaves = { mode: 'off' } | { mode: 'checking' } | { mode: 'on'; base: string; srm: Blob | null };

export const QuickTestModal: React.FC<QuickTestModalProps> = ({ request, onClose, onAddLog, onOpenBios }) => {
  const { t, tf, lang } = useI18n();
  const missingBios = Boolean(request.core.biosRequired && !request.biosFile);
  const [phase, setPhase] = useState<Phase>(missingBios ? 'needBios' : 'loading');
  const [error, setError] = useState<string>('');
  const [romFile, setRomFile] = useState<File | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const playerWaitingRef = useRef(false);
  const sentRef = useRef(false);
  const pickerRef = useRef<HTMLInputElement | null>(null);
  // Родитель может передавать новую функцию на каждый рендер: держим её в ref,
  // чтобы эффекты ниже не перезапускались и не качали ром повторно.
  const logRef = useRef(onAddLog);
  logRef.current = onAddLog;
  const [disk, setDisk] = useState<DiskSaves>(request.saveTarget ? { mode: 'checking' } : { mode: 'off' });
  const diskRef = useRef(disk);
  diskRef.current = disk;
  const [saveNote, setSaveNote] = useState('');
  const lastBytesRef = useRef<Partial<Record<SaveKind, Uint8Array>>>({});
  const writesRef = useRef<Promise<void>>(Promise.resolve());
  const flushWaitRef = useRef<(() => void) | null>(null);
  const [closing, setClosing] = useState(false);

  const fail = useCallback(
    (msg: string) => {
      setError(msg);
      setPhase('error');
      logRef.current?.(`⚠ ${tf('qt.logError', { title: request.title, err: msg })}`);
    },
    [tf, request.title]
  );

  const acceptFile = useCallback(
    (file: File) => {
      if (file.size > QUICK_TEST_MAX_BYTES) {
        fail(t('qt.errTooLarge'));
        return;
      }
      const ext = fileExt(file.name);
      if (ext && !request.core.exts.includes(ext)) {
        fail(tf('qt.errExt', { ext: `.${ext}`, core: request.core.label }));
        return;
      }
      setRomFile(file);
      setPhase('starting');
    },
    [fail, t, tf, request.core]
  );

  const acceptRef = useRef(acceptFile);
  acceptRef.current = acceptFile;
  const failRef = useRef(fail);
  failRef.current = fail;

  // 1. Получаем файл: уже в памяти после скана, через Go API десктопа или выбором вручную.
  useEffect(() => {
    let cancelled = false;
    const src = request.source;
    if (missingBios) return;
    if (src.kind === 'file') {
      acceptRef.current(src.file);
      return;
    }
    if (src.kind === 'pick') {
      setPhase('pick');
      return;
    }
    (async () => {
      try {
        const qs = new URLSearchParams({
          romFileName: src.romFileName,
          relativePath: src.relativePath,
          consoleCode: src.consoleCode,
          libraryPath: src.libraryPath,
          sdCardPath: src.sdCardPath,
        });
        const resp = await fetch(`/api/native/fs/rom?${qs.toString()}`);
        if (cancelled) return;
        if (resp.status === 413) {
          failRef.current(t('qt.errTooLarge'));
          return;
        }
        if (!resp.ok) {
          setPhase('pick');
          return;
        }
        const nameHdr = resp.headers.get('X-Aegis-Rom-Name');
        const name = nameHdr ? decodeURIComponent(nameHdr) : src.romFileName || 'game';
        const blob = await resp.blob();
        if (cancelled) return;
        acceptRef.current(new File([blob], name));
      } catch {
        if (!cancelled) setPhase('pick');
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request.source]);

  // 1b. Сохранения рядом с ромом: есть ли ром на диске и прежний .srm.
  useEffect(() => {
    const target = request.saveTarget;
    if (!target) return;
    let cancelled = false;
    (async () => {
      try {
        const qs = nativeRomQuery(target);
        const resp = await fetch(`/api/native/saves/list?${qs}`);
        if (!resp.ok) throw new Error(String(resp.status));
        const list = (await resp.json()) as { rom?: string; current?: { kind: string }[] };
        let srm: Blob | null = null;
        if (list.current?.some((f) => f.kind === 'srm')) {
          const r = await fetch(`/api/native/saves?kind=srm&${qs}`);
          if (r.ok) srm = await r.blob();
        }
        if (srm) lastBytesRef.current.srm = new Uint8Array(await srm.arrayBuffer());
        if (!cancelled) setDisk({ mode: 'on', base: saveBaseName(list.rom || target.romFileName), srm });
      } catch {
        if (!cancelled) setDisk({ mode: 'off' });
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request.saveTarget]);

  const toastPlayer = useCallback((message: string) => {
    iframeRef.current?.contentWindow?.postMessage({ type: 'aegis-qt-toast', message }, window.location.origin);
  }, []);

  const writeSave = useCallback(
    (kind: SaveKind, data: Uint8Array) => {
      const target = request.saveTarget;
      const d = diskRef.current;
      if (!target || d.mode !== 'on' || !data.length) return;
      if (sameBytes(lastBytesRef.current[kind], data)) return; // SRAM пишется каждые 30 с, чаще всего без изменений
      lastBytesRef.current[kind] = data;
      const name = `${d.base}.${kind}`;
      writesRef.current = writesRef.current.then(async () => {
        try {
          const resp = await fetch(`/api/native/saves?kind=${kind}&${nativeRomQuery(target)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/octet-stream' },
            body: data as BodyInit,
          });
          if (!resp.ok) throw new Error(`${resp.status} ${await resp.text().catch(() => '')}`.trim());
          const info = (await resp.json().catch(() => ({}))) as { backup?: string };
          const time = new Date().toLocaleTimeString();
          setSaveNote(tf('sv.written', { name, time }));
          if (kind === 'state') toastPlayer(tf('sv.stateSaved', { name }));
          logRef.current?.(
            `💾 ${tf(info.backup ? 'sv.logWrittenBackup' : 'sv.logWritten', { title: request.title, name, backup: info.backup || '' })}`
          );
        } catch (e) {
          lastBytesRef.current[kind] = undefined;
          const err = e instanceof Error ? e.message : String(e);
          setSaveNote(tf('sv.writeFailed', { name, err }));
          if (kind === 'state') toastPlayer(tf('sv.writeFailed', { name, err }));
          logRef.current?.(`⚠ ${tf('sv.writeFailed', { name, err })}`);
        }
      });
    },
    [request.saveTarget, request.title, tf, toastPlayer]
  );

  const sendState = useCallback(async () => {
    const target = request.saveTarget;
    const d = diskRef.current;
    const win = iframeRef.current?.contentWindow;
    if (!win || !target || d.mode !== 'on') return;
    const name = `${d.base}.state`;
    let data: Blob | null = null;
    try {
      await writesRef.current;
      const r = await fetch(`/api/native/saves?kind=state&${nativeRomQuery(target)}`);
      if (r.ok) data = await r.blob();
    } catch {
      data = null;
    }
    win.postMessage(
      { type: 'aegis-qt-state', data, message: data ? tf('sv.stateLoaded', { name }) : tf('sv.noState', { name }) },
      window.location.origin
    );
  }, [request.saveTarget, tf]);

  const sendToPlayer = useCallback(() => {
    const win = iframeRef.current?.contentWindow;
    if (!win || !romFile || !playerWaitingRef.current || sentRef.current) return;
    if (disk.mode === 'checking') return;
    sentRef.current = true;
    win.postMessage(
      {
        type: 'aegis-qt-load',
        file: romFile,
        core: request.core.core,
        gameName: romFile.name,
        language: emulatorJsLanguage(lang),
        biosFile: request.biosFile || undefined,
        biosName: request.biosFile?.name,
        saves: disk.mode === 'on' ? { srm: disk.srm || undefined } : undefined,
      },
      window.location.origin
    );
    logRef.current?.(
      `🎮 ${tf('qt.logStart', { title: request.title, core: request.core.label, file: romFile.name })}`
    );
  }, [romFile, request, lang, tf, disk]);

  // 2. Сообщения от плеера в iframe.
  useEffect(() => {
    const onMsg = (ev: MessageEvent) => {
      if (ev.origin !== window.location.origin) return;
      if (ev.source !== iframeRef.current?.contentWindow) return;
      const d = ev.data as { type?: string; state?: string; message?: string; kind?: string; data?: unknown };
      if (!d) return;
      if (d.type === 'aegis-qt-save') {
        if ((d.kind === 'srm' || d.kind === 'state') && d.data instanceof Uint8Array) writeSave(d.kind, d.data);
        return;
      }
      if (d.type === 'aegis-qt-need-state') {
        void sendState();
        return;
      }
      if (d.type !== 'aegis-qt') return;
      if (d.state === 'flushed') {
        flushWaitRef.current?.();
        return;
      }
      if (d.state === 'waiting') {
        playerWaitingRef.current = true;
        sendToPlayer();
      } else if (d.state === 'started') {
        setPhase('running');
      } else if (d.state === 'error') {
        fail(d.message || t('qt.errStart'));
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [sendToPlayer, fail, t, writeSave, sendState]);

  useEffect(() => {
    sendToPlayer();
  }, [sendToPlayer]);

  const onPicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (f) acceptFile(f);
  };

  const goFullscreen = () => {
    const el = iframeRef.current;
    if (el && typeof el.requestFullscreen === 'function') {
      el.requestFullscreen().catch(() => {});
    }
  };

  const showPlayer = phase === 'starting' || phase === 'running';

  // Закрытие: сначала просим плеер сбросить SRAM и ждём записи на диск (не дольше FLUSH_TIMEOUT_MS).
  const handleClose = async () => {
    if (closing) return;
    const win = iframeRef.current?.contentWindow;
    if (disk.mode === 'on' && phase === 'running' && win) {
      setClosing(true);
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, FLUSH_TIMEOUT_MS);
        flushWaitRef.current = () => {
          clearTimeout(timer);
          resolve();
        };
        win.postMessage({ type: 'aegis-qt-flush' }, window.location.origin);
      });
      flushWaitRef.current = null;
      await Promise.race([writesRef.current, new Promise((r) => setTimeout(r, FLUSH_TIMEOUT_MS))]);
    }
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t('qt.title')}
    >
      <div className="w-full max-w-4xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[96vh]">
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-200 dark:border-slate-800">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
              <Gamepad2 className="w-4 h-4 text-accent shrink-0" />
              <span className="truncate">
                {t('qt.title')}: {request.title}
              </span>
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
              {request.consoleShort} · {request.core.label} (WASM)
              {request.biosFile
                ? ` · BIOS: ${request.biosFile.name}`
                : request.core.biosOptional
                ? ` · ${t('qt.biosOptional')}`
                : ''}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {showPlayer && (
              <button
                type="button"
                onClick={goFullscreen}
                title={t('qt.fullscreen')}
                aria-label={t('qt.fullscreen')}
                className="w-8 h-8 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 flex items-center justify-center cursor-pointer"
              >
                <Maximize2 className="w-4 h-4" />
              </button>
            )}
            <button
              type="button"
              onClick={handleClose}
              disabled={closing}
              title={t('status.close')}
              aria-label={t('status.close')}
              className="w-8 h-8 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 flex items-center justify-center cursor-pointer"
            >
              {closing ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div className="relative bg-black aspect-[4/3] max-h-[78vh] w-full">
          {showPlayer && (
            <iframe
              ref={iframeRef}
              src={PLAYER_URL}
              title={t('qt.title')}
              allow="fullscreen; gamepad; autoplay"
              allowFullScreen
              className="absolute inset-0 w-full h-full border-0"
            />
          )}

          {phase === 'loading' && (
            <div className="absolute inset-0 flex items-center justify-center gap-2 text-slate-300 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>{t('qt.loadingRom')}</span>
            </div>
          )}

          {phase === 'needBios' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-sm">
              <AlertTriangle className="w-6 h-6 text-amber-400" />
              <p className="max-w-md text-slate-200">
                {tf('qt.needBios', { console: request.consoleShort })}
              </p>
              {onOpenBios && (
                <button
                  type="button"
                  onClick={onOpenBios}
                  className="h-10 px-4 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-semibold cursor-pointer"
                >
                  {t('qt.openBios')}
                </button>
              )}
            </div>
          )}

          {phase === 'pick' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-slate-200 text-sm">
              <p className="max-w-md">{t('qt.pickHint')}</p>
              <button
                type="button"
                onClick={() => pickerRef.current?.click()}
                className="h-10 px-4 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-semibold flex items-center gap-2 cursor-pointer"
              >
                <FileUp className="w-4 h-4" />
                {t('qt.pickFile')}
              </button>
              <input
                ref={pickerRef}
                type="file"
                className="hidden"
                accept={request.core.exts.map((e) => `.${e}`).join(',')}
                onChange={onPicked}
              />
            </div>
          )}

          {phase === 'error' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-sm">
              <AlertTriangle className="w-6 h-6 text-amber-400" />
              <p className="max-w-md text-slate-200 whitespace-pre-line">{error}</p>
              <button
                type="button"
                onClick={() => {
                  sentRef.current = false;
                  playerWaitingRef.current = false;
                  setRomFile(null);
                  setError('');
                  setPhase('pick');
                }}
                className="h-9 px-3 rounded-lg border border-slate-600 text-slate-200 hover:bg-slate-800 text-xs font-semibold cursor-pointer"
              >
                {t('qt.pickOther')}
              </button>
            </div>
          )}
        </div>

        <div className="px-4 py-2.5 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400 border-t border-slate-200 dark:border-slate-800">
          {disk.mode === 'on' ? (
            <div className="flex items-start gap-1.5">
              <Save className="w-3.5 h-3.5 mt-px shrink-0 text-accent" />
              <span>
                {tf('sv.footerDisk', { name: disk.base })}
                {saveNote ? ` ${saveNote}` : ''}
              </span>
            </div>
          ) : (
            t('qt.footer')
          )}
        </div>
      </div>
    </div>
  );
};
