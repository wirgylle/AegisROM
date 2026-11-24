import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Download, FolderInput, History, RefreshCw, RotateCcw, Save, Upload } from 'lucide-react';
import { useI18n } from '../i18n/translations';
import { nativeRomQuery, type NativeRomRef } from '../utils/romSaves';
import { parseHistoryName, parseSaveStamp, SAVE_SUFFIXES } from '../utils/saveFiles';

// Блок «Сохранения» в карточке игры (менеджер сохранений, шаг 3): текущие файлы рядом с ромом,
// история версий, восстановить, экспорт, импорт и сохранения из папок эмуляторов «Среды».
// Работает через локальный Go API (aegisapi/saves.go), значит только в десктоп-версии.
// Saves block of the game card (save manager, step 3): current files next to the ROM, history,
// restore, export, import and saves found in emulator folders. Desktop only (Go API).

export interface SaveFile {
  name: string;
  kind: string;
  suffix: string;
  size: number;
  modified: string;
  path?: string;
  source?: string;
  shared?: boolean;
}

interface SaveList {
  base?: string;
  current: SaveFile[];
  history: SaveFile[];
}

interface RomSavesPanelProps {
  /** Где ром лежит на диске; null вне десктопа. / Where the ROM is on disk; null outside the desktop app. */
  romRef: NativeRomRef | null;
  title: string;
  /** Пути к exe или папкам эмуляторов из «Среды». / Emulator exe or folder paths from Environment. */
  emulatorPaths: string[];
  /** Сколько видов сохранений нашёл скан. / Save kinds found by the scan. */
  scanCount?: number;
  /** Меняется, когда закрывается окно «Запуск»: перечитать список. / Changes when Play closes. */
  refreshKey?: number | string;
  onAddLog?: (msg: string) => void;
}

function fmtSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1048576).toFixed(2)} MB`;
}

const SHORT_DATE: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' };

function fmtDate(iso: string, locale: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(locale, SHORT_DATE);
}

/** Два последних сегмента пути: «RetroArch/saves/Snes9x» → «saves/Snes9x». */
function shortSource(p: string): string {
  const parts = String(p || '').split(/[\\/]/).filter(Boolean);
  return parts.slice(-3).join('/');
}

/** Суффикс по имени выбранного файла (длинные раньше коротких). / Suffix from a picked file name. */
export function suffixFromFileName(name: string): string {
  const low = String(name || '').toLowerCase();
  const sorted = [...SAVE_SUFFIXES].sort((a, b) => b.length - a.length);
  return sorted.find((s) => low.endsWith(s)) || '';
}

async function downloadFrom(url: string, fileName: string): Promise<void> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(String(r.status));
  const blob = await r.blob();
  const a = document.createElement('a');
  const href = URL.createObjectURL(blob);
  a.href = href;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 3000);
}

export const RomSavesPanel: React.FC<RomSavesPanelProps> = ({
  romRef,
  title,
  emulatorPaths,
  scanCount,
  refreshKey,
  onAddLog,
}) => {
  const { t, tf, locale } = useI18n();
  const [list, setList] = useState<SaveList | null>(null);
  const [external, setExternal] = useState<SaveFile[]>([]);
  const [state, setState] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const [note, setNote] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const [importSuffix, setImportSuffix] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const qs = romRef ? nativeRomQuery(romRef) : '';
  const emuKey = emulatorPaths.filter(Boolean).join('|');
  const emuQs = emulatorPaths
    .filter(Boolean)
    .map((p) => `emu=${encodeURIComponent(p)}`)
    .join('&');

  useEffect(() => {
    if (!romRef) return;
    let cancelled = false;
    setState('loading');
    (async () => {
      try {
        const r = await fetch(`/api/native/saves/list?${qs}`);
        if (!r.ok) throw new Error(String(r.status));
        const data = (await r.json()) as SaveList;
        let ext: SaveFile[] = [];
        try {
          const e = await fetch(`/api/native/saves/external?${qs}${emuQs ? `&${emuQs}` : ''}`);
          if (e.ok) ext = ((await e.json()) as { files?: SaveFile[] }).files || [];
        } catch {
          ext = [];
        }
        if (cancelled) return;
        setList({ base: data.base, current: data.current || [], history: data.history || [] });
        setExternal(ext);
        setState('ok');
      } catch {
        if (!cancelled) setState('error');
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qs, emuKey, refreshKey, reload]);

  useEffect(() => {
    setNote('');
    setShowHistory(false);
    setList(null);
    setExternal([]);
  }, [qs]);

  const run = useCallback(
    async (fn: () => Promise<string>) => {
      setBusy(true);
      try {
        const msg = await fn();
        setNote(msg);
        onAddLog?.(`💾 ${title}: ${msg}`);
      } catch (e) {
        const err = e instanceof Error ? e.message : String(e);
        setNote(tf('sv.panel.failed', { err }));
      } finally {
        setBusy(false);
        setReload((n) => n + 1);
      }
    },
    [onAddLog, tf, title]
  );

  const sectionTitle =
    'text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 flex items-center gap-1.5';
  const btn =
    'h-7 px-2 rounded-md border border-slate-200 dark:border-slate-700 text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:border-accent hover:text-accent inline-flex items-center gap-1 cursor-pointer transition disabled:opacity-50 disabled:cursor-default';

  if (!romRef) {
    return (
      <div className="space-y-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5">
        <div className={sectionTitle}>
          <Save className="w-3.5 h-3.5" />
          <span>{t('sv.panel.title')}</span>
          {scanCount ? <span className="tabular-nums">({scanCount})</span> : null}
        </div>
        <div className="text-slate-500 dark:text-slate-400">
          {scanCount ? tf('sv.panel.browserFound', { count: scanCount }) : t('sv.panel.browserOnly')}
        </div>
      </div>
    );
  }

  const current = list?.current || [];
  const history = list?.history || [];
  const base = list?.base || '';

  const exportCurrent = (f: SaveFile) =>
    run(async () => {
      await downloadFrom(`/api/native/saves?suffix=${encodeURIComponent(f.suffix)}&${qs}`, f.name);
      return tf('sv.panel.exported', { name: f.name });
    });

  const exportHistory = (f: SaveFile) =>
    run(async () => {
      const stamp = parseHistoryName(f.name)?.stamp || '';
      await downloadFrom(
        `/api/native/saves/history?name=${encodeURIComponent(f.name)}&${qs}`,
        `${base || 'save'} ${stamp}${f.suffix}`
      );
      return tf('sv.panel.exported', { name: f.name });
    });

  const restore = (f: SaveFile) =>
    run(async () => {
      const r = await fetch(`/api/native/saves/restore?name=${encodeURIComponent(f.name)}&${qs}`, { method: 'POST' });
      if (!r.ok) throw new Error(`${r.status} ${await r.text().catch(() => '')}`.trim());
      return tf('sv.panel.restored', { when: historyLabel(f), name: `${base}${f.suffix}` });
    });

  const importExternal = (f: SaveFile) =>
    run(async () => {
      const r = await fetch(
        `/api/native/saves/import-external?path=${encodeURIComponent(f.path || '')}&${qs}${emuQs ? `&${emuQs}` : ''}`,
        { method: 'POST' }
      );
      if (!r.ok) throw new Error(`${r.status} ${await r.text().catch(() => '')}`.trim());
      return tf('sv.panel.imported', { name: `${base}${f.suffix}`, from: f.source || '' });
    });

  const onPickImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const sfx = importSuffix || suffixFromFileName(file.name) || '.srm';
    run(async () => {
      const r = await fetch(`/api/native/saves?suffix=${encodeURIComponent(sfx)}&${qs}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: file,
      });
      if (!r.ok) throw new Error(`${r.status} ${await r.text().catch(() => '')}`.trim());
      return tf('sv.panel.imported', { name: `${base}${sfx}`, from: file.name });
    });
  };

  function historyLabel(f: SaveFile): string {
    const stamp = parseHistoryName(f.name)?.stamp || '';
    const d = parseSaveStamp(stamp);
    return d ? d.toLocaleString(locale, SHORT_DATE) : f.name;
  }

  const visibleHistory = showHistory ? history : history.slice(0, 3);

  return (
    <div className="space-y-3 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5" data-testid="rom-saves-panel">
      <div className="flex items-center justify-between gap-2">
        <div className={sectionTitle}>
          <Save className="w-3.5 h-3.5" />
          <span>{t('sv.panel.title')}</span>
          {current.length > 0 && <span className="tabular-nums">({current.length})</span>}
        </div>
        <button
          type="button"
          onClick={() => setReload((n) => n + 1)}
          className="w-6 h-6 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 flex items-center justify-center cursor-pointer"
          title={t('sv.panel.refresh')}
          aria-label={t('sv.panel.refresh')}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${state === 'loading' ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {state === 'error' && <div className="text-amber-600 dark:text-amber-400">{t('sv.panel.noRom')}</div>}

      {state !== 'error' && (
        <>
          {/* Текущие / Current */}
          {current.length === 0 ? (
            <div className="text-slate-500 dark:text-slate-400">{state === 'loading' ? t('sv.panel.loading') : t('sv.panel.empty')}</div>
          ) : (
            <ul className="space-y-1">
              {current.map((f) => (
                <li key={f.name} className="flex items-center gap-2 min-w-0">
                  <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 shrink-0">
                    {f.kind}
                  </span>
                  <span className="truncate text-slate-700 dark:text-slate-200" title={f.name}>
                    {fmtDate(f.modified, locale)}
                  </span>
                  <span className="text-slate-400 tabular-nums shrink-0">{fmtSize(f.size)}</span>
                  <button
                    type="button"
                    className={`${btn} ml-auto shrink-0`}
                    disabled={busy}
                    onClick={() => exportCurrent(f)}
                    title={t('sv.panel.export')}
                    aria-label={`${t('sv.panel.export')} ${f.name}`}
                  >
                    <Download className="w-3 h-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* Импорт / Import */}
          <div className="flex flex-wrap items-center gap-1.5">
            <select
              value={importSuffix}
              onChange={(e) => setImportSuffix(e.target.value)}
              className="h-7 px-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px] text-slate-700 dark:text-slate-200"
              title={t('sv.panel.importKind')}
              aria-label={t('sv.panel.importKind')}
            >
              <option value="">{t('sv.panel.importAuto')}</option>
              {SAVE_SUFFIXES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <button type="button" className={btn} disabled={busy} onClick={() => fileInputRef.current?.click()}>
              <Upload className="w-3 h-3" />
              <span>{t('sv.panel.import')}</span>
            </button>
            <input ref={fileInputRef} type="file" className="hidden" onChange={onPickImport} />
          </div>

          {/* История / History */}
          {history.length > 0 && (
            <div className="space-y-1.5">
              <div className={sectionTitle}>
                <History className="w-3.5 h-3.5" />
                <span>{t('sv.panel.history')}</span>
                <span className="tabular-nums">({history.length})</span>
              </div>
              <ul className="space-y-1">
                {visibleHistory.map((f) => (
                  <li key={f.name} className="flex items-center gap-2 min-w-0">
                    <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 shrink-0">
                      {f.kind}
                    </span>
                    <span className="truncate text-slate-700 dark:text-slate-200" title={f.name}>
                      {historyLabel(f)}
                    </span>
                    <span className="text-slate-400 tabular-nums shrink-0">{fmtSize(f.size)}</span>
                    <span className="ml-auto flex gap-1 shrink-0">
                      <button
                        type="button"
                        className={btn}
                        disabled={busy}
                        onClick={() => restore(f)}
                        title={`${t('sv.panel.restore')}. ${t('sv.panel.restoreHint')}`}
                        aria-label={`${t('sv.panel.restore')} ${historyLabel(f)}`}
                      >
                        <RotateCcw className="w-3 h-3" />
                      </button>
                      <button type="button" className={btn} disabled={busy} onClick={() => exportHistory(f)} title={t('sv.panel.export')} aria-label={t('sv.panel.export')}>
                        <Download className="w-3 h-3" />
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
              {history.length > 3 && (
                <button type="button" className="text-[11px] text-accent hover:underline cursor-pointer" onClick={() => setShowHistory((v) => !v)}>
                  {showHistory ? t('sv.panel.historyLess') : tf('sv.panel.historyMore', { count: history.length - 3 })}
                </button>
              )}
            </div>
          )}

          {/* Папки эмуляторов / Emulator folders */}
          {external.length > 0 && (
            <div className="space-y-1.5">
              <div className={sectionTitle}>
                <FolderInput className="w-3.5 h-3.5" />
                <span>{t('sv.panel.external')}</span>
                <span className="tabular-nums">({external.length})</span>
              </div>
              <ul className="space-y-1">
                {external.map((f) => (
                  <li key={f.path} className="flex items-center gap-2 min-w-0">
                    <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 shrink-0">
                      {f.kind}
                    </span>
                    <span className="min-w-0 flex flex-col leading-tight" title={f.path}>
                      <span className="text-slate-700 dark:text-slate-200">{fmtDate(f.modified, locale)}</span>
                      <span className="truncate text-[10px] text-slate-400">{shortSource(f.source || '')}</span>
                    </span>
                    {f.shared ? (
                      <span className="ml-auto text-slate-400 shrink-0" title={t('sv.panel.sharedHint')}>
                        {t('sv.panel.shared')}
                      </span>
                    ) : (
                      <button type="button" className={`${btn} ml-auto shrink-0`} disabled={busy} onClick={() => importExternal(f)} title={t('sv.panel.takeHint')}>
                        <FolderInput className="w-3 h-3" />
                        <span>{t('sv.panel.take')}</span>
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="text-[11px] text-slate-500 dark:text-slate-400">{note || t('sv.panel.hint')}</div>
        </>
      )}
    </div>
  );
};
