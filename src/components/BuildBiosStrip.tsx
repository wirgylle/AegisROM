// Строка «BIOS для сборки» в выгрузке: какие BIOS нужны консолям очереди и есть ли они.
// "BIOS for this build" strip in the export panel: which BIOS the queued consoles need and whether they are present.
import React, { useEffect, useMemo, useState } from 'react';
import { Cpu } from 'lucide-react';
import { useI18n } from '../i18n/translations';
import { guideSystemsForConsole } from '../data/bios/biosGuide';
import { buildBiosReport } from '../utils/biosCheck';
import { BIOS_HANDLE_KEY, biosDirForBuildProfile, loadBiosScanCache } from '../utils/biosScan';
import { checkOrRequestHandlePermission, loadDirectoryHandleRecord } from '../utils/persistentHandles';

interface BuildBiosStripProps {
  profileId: string;
  consoleShorts: string[];
  enabled: boolean;
  onToggle: (on: boolean) => void;
}

export const BuildBiosStrip: React.FC<BuildBiosStripProps> = ({ profileId, consoleShorts, enabled, onToggle }) => {
  const { t, tf } = useI18n();
  const dir = biosDirForBuildProfile(profileId);
  // Доступ к папке BIOS нужно получить заранее, кликом: после долгой выгрузки браузер уже не покажет запрос.
  const [biosHandle, setBiosHandle] = useState<any>(null);
  const [access, setAccess] = useState<'granted' | 'prompt' | 'denied' | 'none'>('none');
  useEffect(() => {
    loadDirectoryHandleRecord(BIOS_HANDLE_KEY).then(async (rec) => {
      if (!rec?.handle) return;
      setBiosHandle(rec.handle);
      setAccess(await checkOrRequestHandlePermission(rec.handle, 'read', false));
    });
  }, []);
  const askAccess = async () => {
    if (biosHandle) setAccess(await checkOrRequestHandlePermission(biosHandle, 'read', true));
  };
  const consolesKey = Array.from(new Set(consoleShorts.map((c) => c.toUpperCase()))).sort().join(',');

  const rows = useMemo(() => {
    const cache = loadBiosScanCache();
    const report = cache ? buildBiosReport(cache.files) : null;
    const out: { label: string; ok: boolean | null; need: string }[] = [];
    const seen = new Set<string>();
    for (const c of consolesKey.split(',').filter(Boolean)) {
      for (const sys of guideSystemsForConsole(c)) {
        if (sys.need === 'none' || sys.groups.length === 0 || seen.has(sys.id)) continue;
        seen.add(sys.id);
        const st = report?.systems.find((s) => s.system.id === sys.id)?.status;
        out.push({ label: sys.name, ok: st ? st === 'ok' || st === 'fixable' : null, need: sys.need });
      }
    }
    return { out, scanned: !!report };
  }, [consolesKey]);

  if (rows.out.length === 0) return null;

  return (
    <div className="pt-2 border-t border-slate-200 dark:border-slate-700 text-xs space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <Cpu className="w-3.5 h-3.5 text-accent" />
        <span className="font-semibold text-slate-800 dark:text-slate-200">{t('bios.build.title')}</span>
        {rows.out.map((r) => (
          <span
            key={r.label}
            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
              r.ok === true
                ? 'bg-emerald-600 text-white'
                : r.ok === false && r.need === 'required'
                  ? 'bg-rose-600 text-white'
                  : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200'
            }`}
          >
            {r.label}: {r.ok === null ? t('bios.status.notChecked') : r.ok ? t('bios.build.ready') : t('bios.build.missing')}
          </span>
        ))}
      </div>
      {dir ? (
        <label className="flex flex-wrap items-center gap-2 cursor-pointer text-slate-700 dark:text-slate-300">
          <input type="checkbox" checked={enabled} onChange={(e) => onToggle(e.target.checked)} />
          <span>{t('bios.build.copy')}</span>
          <span className="font-mono text-slate-500">{tf('bios.build.folder', { dir: `${dir}/` })}</span>
          {!rows.scanned && <span className="text-amber-700 dark:text-amber-400">{t('bios.build.noScan')}</span>}
          {rows.scanned && enabled && biosHandle && access !== 'granted' && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                askAccess();
              }}
              className="px-2 py-0.5 rounded-md border border-amber-400 text-amber-800 dark:text-amber-300 font-bold cursor-pointer"
            >
              {t('bios.folder.restore')}
            </button>
          )}
        </label>
      ) : (
        <div className="text-slate-500 dark:text-slate-400">{t('bios.build.noFolder')}</div>
      )}
    </div>
  );
};
