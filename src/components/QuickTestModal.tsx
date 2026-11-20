import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X, FileUp, Loader2, AlertTriangle, Maximize2, Gamepad2 } from 'lucide-react';
import { useI18n } from '../i18n/translations';
import {
  QUICK_TEST_MAX_BYTES,
  emulatorJsLanguage,
  fileExt,
  type QuickTestCore,
} from '../utils/quickTest';

/** Где взять файл рома для теста. */
export type QuickTestSource =
  | { kind: 'file'; file: File }
  | {
      kind: 'native';
      romFileName: string;
      relativePath: string;
      consoleCode: string;
      libraryPath: string;
      sdCardPath: string;
    }
  | { kind: 'pick' };

export interface QuickTestRequest {
  title: string;
  consoleShort: string;
  core: QuickTestCore;
  source: QuickTestSource;
  /** Проверенный BIOS из раздела «BIOS» (имя файла как в папке system RetroArch). */
  biosFile?: File | null;
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

  const sendToPlayer = useCallback(() => {
    const win = iframeRef.current?.contentWindow;
    if (!win || !romFile || !playerWaitingRef.current || sentRef.current) return;
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
      },
      window.location.origin
    );
    logRef.current?.(
      `🎮 ${tf('qt.logStart', { title: request.title, core: request.core.label, file: romFile.name })}`
    );
  }, [romFile, request, lang, tf]);

  // 2. Сообщения от плеера в iframe.
  useEffect(() => {
    const onMsg = (ev: MessageEvent) => {
      if (ev.origin !== window.location.origin) return;
      if (ev.source !== iframeRef.current?.contentWindow) return;
      const d = ev.data as { type?: string; state?: string; message?: string };
      if (!d || d.type !== 'aegis-qt') return;
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
  }, [sendToPlayer, fail, t]);

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
              onClick={onClose}
              title={t('status.close')}
              aria-label={t('status.close')}
              className="w-8 h-8 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 flex items-center justify-center cursor-pointer"
            >
              <X className="w-4 h-4" />
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
          {t('qt.footer')}
        </div>
      </div>
    </div>
  );
};
