import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Database, Download, RefreshCw, Upload } from 'lucide-react';
import { useI18n } from '../i18n/translations';
import {
  fetchDatStatus,
  fetchLibretroDats,
  importDatFile,
  reloadDats,
  type DatStatus,
} from '../utils/datHashLookup';

// Панель DAT-файлов в «Инструментах»: что загружено, добавить, перечитать папку.
// DAT files panel in Tools: what is loaded, add, reload the folder.
// systems — системы Libretro из библиотеки, для кнопки автозагрузки.
// systems — Libretro systems in the library, for the auto-download button.
export function DatFilesPanel({ disabled, systems = [] }: { disabled?: boolean; systems?: string[] }) {
  const { t, tf } = useI18n();
  const [status, setStatus] = useState<DatStatus | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    const st = await fetchDatStatus();
    setUnavailable(!st);
    setStatus(st);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusy(true);
    setError('');
    try {
      for (const f of Array.from(files)) {
        try {
          setStatus(await importDatFile(f));
        } catch (err) {
          setError(tf('tools.dat.importErr', { err: `${f.name}: ${err instanceof Error ? err.message : String(err)}` }));
        }
      }
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const onReload = async () => {
    setBusy(true);
    setError('');
    try {
      setStatus(await reloadDats());
      setUnavailable(false);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  };

  const onFetchLibretro = async () => {
    setBusy(true);
    setError('');
    setInfo('');
    try {
      if (systems.length === 0) {
        setInfo(t('tools.dat.fetchNone'));
        return;
      }
      const res = await fetchLibretroDats(systems);
      setStatus(res.status);
      setUnavailable(false);
      const realFailed = res.failed.filter((f) => f.set);
      if (res.fetched.length === 0 && res.skipped.length === 0 && realFailed.length === 0) {
        setInfo(t('tools.dat.fetchNone'));
      } else {
        setInfo(
          tf('tools.dat.fetchDone', {
            count: res.fetched.length,
            skipped: res.skipped.length,
            failed: realFailed.length,
          })
        );
      }
      if (realFailed.length > 0) {
        setError(realFailed.map((f) => `${f.system}: ${f.reason}`).join('; '));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const loaded = (status?.dats || []).filter((d) => !d.error);
  const broken = (status?.dats || []).filter((d) => d.error);
  const btn =
    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 font-semibold cursor-pointer disabled:opacity-50';

  return (
    <div data-tool="datFiles" className="rounded-xl border border-slate-300 dark:border-slate-700 p-3 text-xs space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Database className="w-4 h-4 shrink-0" />
        <span className="font-bold text-slate-800 dark:text-slate-100">{t('tools.dat.title')}</span>
        {status && (
          <span className="text-slate-500 dark:text-slate-400">
            {loaded.length > 0 ? tf('tools.dat.loaded', { dats: loaded.length, games: status.games }) : t('tools.dat.empty')}
          </span>
        )}
        <div className="ml-auto flex flex-wrap gap-1.5">
          <button type="button" className={btn} disabled={disabled || busy || unavailable} onClick={() => void onFetchLibretro()}>
            <Download className="w-3.5 h-3.5 shrink-0" />
            <span>{t('tools.dat.fetch')}</span>
          </button>
          <button type="button" className={btn} disabled={disabled || busy || unavailable} onClick={() => inputRef.current?.click()}>
            <Upload className="w-3.5 h-3.5 shrink-0" />
            <span>{t('tools.dat.import')}</span>
          </button>
          <button type="button" className={btn} disabled={disabled || busy} onClick={() => void onReload()}>
            <RefreshCw className={`w-3.5 h-3.5 shrink-0 ${busy ? 'animate-spin' : ''}`} />
            <span>{t('tools.dat.reload')}</span>
          </button>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".dat,.xml,.zip"
          multiple
          className="hidden"
          onChange={(e) => void onFiles(e.target.files)}
        />
      </div>
      <p className="text-slate-500 dark:text-slate-400">{t('tools.dat.desc')}</p>
      <p className="text-slate-500 dark:text-slate-400">{t('tools.dat.where')}</p>
      {info && <p className="text-emerald-700 dark:text-emerald-400">{info}</p>}
      {unavailable && <p className="text-amber-600 dark:text-amber-400">{t('tools.dat.unavailable')}</p>}
      {status?.dir && <p className="text-slate-500 dark:text-slate-400 break-all">{tf('tools.dat.folder', { dir: status.dir })}</p>}
      {loaded.length > 0 && (
        <ul className="max-h-32 overflow-y-auto space-y-0.5">
          {loaded.map((d) => (
            <li key={d.file + d.name} className="flex gap-2 min-w-0">
              <span className="shrink-0 uppercase text-[10px] font-bold text-slate-500">{d.source}</span>
              <span className="truncate text-slate-700 dark:text-slate-200" title={d.file}>
                {d.name || d.file}
              </span>
              <span className="ml-auto shrink-0 text-slate-500">{d.games}</span>
            </li>
          ))}
        </ul>
      )}
      {broken.map((d) => (
        <p key={d.file} className="text-red-600 dark:text-red-400 break-all">
          {d.file}: {d.error}
        </p>
      ))}
      {error && <p className="text-red-600 dark:text-red-400 break-all">{error}</p>}
    </div>
  );
}
