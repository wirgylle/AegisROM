// Раздел «Среда → BIOS»: справочник для новичков + проверка папки BIOS по хешам.
// "Environment → BIOS": newcomer guide + hash check of the BIOS folder.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Cpu,
  ExternalLink,
  FolderOpen,
  HelpCircle,
  MinusCircle,
  RefreshCw,
  ShieldCheck,
  Wrench,
  XCircle,
} from 'lucide-react';
import { useI18n } from '../i18n/translations';
import {
  BIOS_GUIDE,
  LIBRETRO_BIOS_GUIDE_URL,
  localizedBiosText,
  type BiosGuideLink,
  type BiosNeed,
} from '../data/bios/biosGuide';
import { LIBRETRO_SYSTEM_DAT_VERSION } from '../data/bios/libretroSystemDat';
import {
  buildBiosReport,
  type BiosFileResult,
  type BiosSystemResult,
  type BiosSystemStatus,
  type ScannedBiosFile,
} from '../utils/biosCheck';
import {
  BIOS_HANDLE_KEY,
  copyBiosFiles,
  loadBiosScanCache,
  saveBiosScanCache,
  scanBiosDirectory,
} from '../utils/biosScan';
import {
  checkOrRequestHandlePermission,
  loadDirectoryHandleRecord,
  saveDirectoryHandle,
} from '../utils/persistentHandles';

interface BiosCenterPanelProps {
  onAddLog?: (msg: string) => void;
}

const NEED_STYLE: Record<BiosNeed, string> = {
  required: 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300',
  recommended: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300',
  optional: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  none: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300',
};

const STATUS_STYLE: Record<BiosSystemStatus | 'notChecked', string> = {
  ok: 'bg-emerald-600 text-white',
  fixable: 'bg-amber-500 text-white',
  warn: 'bg-amber-500 text-white',
  missing: 'bg-rose-600 text-white',
  optionalMissing: 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
  notNeeded: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300',
  info: 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300',
  notChecked: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
};

const ATTENTION: BiosSystemStatus[] = ['missing', 'fixable', 'warn'];

function FileStatusIcon({ status }: { status: BiosFileResult['status'] | 'notChecked' }) {
  if (status === 'ok') return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />;
  if (status === 'wrongPlace' || status === 'wrongName') return <Wrench className="w-3.5 h-3.5 text-amber-600 shrink-0" />;
  if (status === 'otherBios' || status === 'unknownVersion')
    return <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />;
  if (status === 'missing') return <XCircle className="w-3.5 h-3.5 text-slate-400 shrink-0" />;
  return <MinusCircle className="w-3.5 h-3.5 text-slate-300 shrink-0" />;
}

export const BiosCenterPanel: React.FC<BiosCenterPanelProps> = ({ onAddLog }) => {
  const { t, tf, lang, locale } = useI18n();
  const [dirHandle, setDirHandle] = useState<any>(null);
  const [permission, setPermission] = useState<'granted' | 'prompt' | 'denied' | 'none'>('none');
  const [files, setFiles] = useState<ScannedBiosFile[] | null>(null);
  const [checkedAt, setCheckedAt] = useState<string>('');
  const [folderName, setFolderName] = useState<string>('');
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState<{ count: number; file: string } | null>(null);
  const [filter, setFilter] = useState<'all' | 'attention' | 'required'>('all');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [fixing, setFixing] = useState(false);

  const fsSupported = typeof (window as any).showDirectoryPicker === 'function';

  useEffect(() => {
    const cache = loadBiosScanCache();
    if (cache) {
      setFiles(cache.files);
      setCheckedAt(cache.checkedAt);
      setFolderName(cache.folderName);
    }
    loadDirectoryHandleRecord(BIOS_HANDLE_KEY).then(async (rec) => {
      if (!rec?.handle) return;
      setDirHandle(rec.handle);
      setFolderName(rec.folderName);
      setPermission(await checkOrRequestHandlePermission(rec.handle, 'readwrite', false));
    });
  }, []);

  const runScan = useCallback(
    async (handle: any) => {
      setScanning(true);
      setProgress({ count: 0, file: '' });
      try {
        const scanned = await scanBiosDirectory(handle, (count, file) => setProgress({ count, file }));
        const now = new Date().toISOString();
        setFiles(scanned);
        setCheckedAt(now);
        setFolderName(handle.name);
        saveBiosScanCache({ folderName: handle.name, checkedAt: now, files: scanned });
        const rep = buildBiosReport(scanned);
        const ok = rep.systems.filter((s) => s.status === 'ok').length;
        const bad = rep.systems.filter((s) => ATTENTION.includes(s.status)).length;
        onAddLog?.(tf('bios.scan.done', { files: scanned.length, ok, bad }));
      } finally {
        setScanning(false);
        setProgress(null);
      }
    },
    [onAddLog, tf]
  );

  const pickFolder = async () => {
    if (!fsSupported) return;
    try {
      const handle = await (window as any).showDirectoryPicker({ mode: 'readwrite', id: 'aegis-bios' });
      await saveDirectoryHandle(BIOS_HANDLE_KEY, handle);
      setDirHandle(handle);
      setPermission('granted');
      await runScan(handle);
    } catch (err: any) {
      if (err?.name !== 'AbortError') onAddLog?.(String(err));
    }
  };

  const recheck = async () => {
    if (!dirHandle) return pickFolder();
    const p = await checkOrRequestHandlePermission(dirHandle, 'readwrite', true);
    setPermission(p);
    if (p === 'granted') await runScan(dirHandle);
  };

  const report = useMemo(() => (files ? buildBiosReport(files) : null), [files]);
  const resultById = useMemo(() => {
    const m = new Map<string, BiosSystemResult>();
    report?.systems.forEach((s) => m.set(s.system.id, s));
    return m;
  }, [report]);

  const fixList = useMemo(() => {
    if (!report) return [] as { from: string; to: string }[];
    const out: { from: string; to: string }[] = [];
    const seen = new Set<string>();
    for (const s of report.systems)
      for (const g of s.groups) {
        if (g.status === 'ok') continue;
        for (const r of g.files) {
          if (!r.found || !(r.status === 'wrongPlace' || r.status === 'wrongName')) continue;
          if (seen.has(r.expectedPath.toLowerCase())) continue;
          seen.add(r.expectedPath.toLowerCase());
          out.push({ from: r.found.relPath, to: r.expectedPath });
          break; // в группе «any» хватает одного исправленного файла
        }
      }
    return out;
  }, [report]);

  const runFix = async () => {
    if (!dirHandle || fixList.length === 0) return;
    const p = await checkOrRequestHandlePermission(dirHandle, 'readwrite', true);
    setPermission(p);
    if (p !== 'granted') return;
    setFixing(true);
    try {
      const n = await copyBiosFiles(dirHandle, dirHandle, fixList, (item, ok, err) => {
        if (!ok) onAddLog?.(tf('bios.fix.err', { file: item.from, err: err || '' }));
      });
      onAddLog?.(tf('bios.fix.done', { count: n }));
      await runScan(dirHandle);
    } finally {
      setFixing(false);
    }
  };

  const summary = useMemo(() => {
    if (!report) return null;
    const s = report.systems;
    return {
      ok: s.filter((x) => x.status === 'ok').length,
      attention: s.filter((x) => ATTENTION.includes(x.status)).length,
      optional: s.filter((x) => x.status === 'optionalMissing').length,
    };
  }, [report]);

  const visible = BIOS_GUIDE.filter((sys) => {
    const q = query.trim().toLowerCase();
    if (q && !`${sys.name} ${sys.consoleKeys.join(' ')}`.toLowerCase().includes(q)) return false;
    if (filter === 'required') return sys.need === 'required';
    if (filter === 'attention') {
      const st = resultById.get(sys.id)?.status;
      return st ? ATTENTION.includes(st) : sys.need === 'required';
    }
    return true;
  });

  const linkLabel = (l: BiosGuideLink) => t(`bios.link.${l.kind}`);

  return (
    <div className="space-y-4">
      {/* Объяснение для новичков */}
      <div className="grid gap-3 lg:grid-cols-3">
        <section className="lg:col-span-2 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs space-y-2">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
            <Cpu className="w-4 h-4 text-accent shrink-0" />
            {t('bios.what.title')}
          </h3>
          <p className="text-slate-600 dark:text-slate-300 leading-relaxed">{t('bios.what.p1')}</p>
          <p className="text-slate-600 dark:text-slate-300 leading-relaxed">{t('bios.what.p2')}</p>
          <p className="text-slate-600 dark:text-slate-300 leading-relaxed">{t('bios.what.p3')}</p>
        </section>
        <section className="p-3.5 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-950/30 text-xs space-y-2">
          <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 shrink-0" />
            {t('bios.legal.title')}
          </h3>
          <p className="text-amber-900/90 dark:text-amber-200/90 leading-relaxed">{t('bios.legal.body')}</p>
          <a
            href={LIBRETRO_BIOS_GUIDE_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 font-semibold text-amber-900 dark:text-amber-200 underline"
          >
            <BookOpen className="w-3.5 h-3.5" />
            {t('bios.allGuide')}
          </a>
        </section>
      </div>

      <section className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs space-y-1.5">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
          <FolderOpen className="w-4 h-4 text-accent shrink-0" />
          {t('bios.where.title')}
        </h3>
        <ul className="list-disc pl-5 space-y-1 text-slate-600 dark:text-slate-300">
          <li>{t('bios.where.retroarch')}</li>
          <li>{t('bios.where.standalone')}</li>
          <li>{t('bios.where.handheld')}</li>
          <li>{t('bios.where.subfolders')}</li>
        </ul>
      </section>

      {/* Папка и проверка */}
      <section className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 text-xs space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="min-w-0">
            <div className="font-semibold text-slate-900 dark:text-slate-100">
              {t('bios.folder.label')}:{' '}
              <span className="font-mono">{folderName || t('bios.folder.none')}</span>
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              {fsSupported ? t('bios.folder.hint') : t('bios.folder.unsupported')}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {dirHandle && (
              <button
                type="button"
                onClick={recheck}
                disabled={scanning || !fsSupported}
                className="px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${scanning ? 'animate-spin' : ''}`} />
                {permission === 'granted' ? t('bios.folder.recheck') : t('bios.folder.restore')}
              </button>
            )}
            <button
              type="button"
              onClick={pickFolder}
              disabled={scanning || !fsSupported}
              className="bg-accent hover:bg-accent-hover text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <FolderOpen className="w-3.5 h-3.5" />
              {t('bios.folder.pick')}
            </button>
          </div>
        </div>

        {progress && (
          <div className="text-[11px] font-mono text-slate-600 dark:text-slate-300 truncate">
            {tf('bios.scan.progress', { count: progress.count, file: progress.file })}
          </div>
        )}

        {summary ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-2 py-1 rounded-lg bg-emerald-600 text-white font-bold">
              {t('bios.sum.ok')}: {summary.ok}
            </span>
            <span
              className={`px-2 py-1 rounded-lg font-bold ${
                summary.attention > 0 ? 'bg-rose-600 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200'
              }`}
            >
              {t('bios.sum.attention')}: {summary.attention}
            </span>
            <span className="px-2 py-1 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold">
              {t('bios.sum.optional')}: {summary.optional}
            </span>
            {checkedAt && (
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                {tf('bios.scan.lastChecked', { date: new Date(checkedAt).toLocaleString(locale) })}
              </span>
            )}
            {fixList.length > 0 && dirHandle && (
              <button
                type="button"
                onClick={runFix}
                disabled={fixing || scanning}
                className="ml-auto px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Wrench className="w-3.5 h-3.5" />
                {t('bios.fix.button')} ({fixList.length})
              </button>
            )}
          </div>
        ) : (
          <div className="text-[11px] text-slate-500 dark:text-slate-400">{t('bios.scan.notYet')}</div>
        )}
      </section>

      {/* Фильтры */}
      <div className="flex flex-wrap items-center gap-1.5">
        {(['all', 'attention', 'required'] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold cursor-pointer transition ${
              filter === f
                ? 'bg-blue-600 text-white'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200'
            }`}
          >
            {t(`bios.filter.${f}`)}
          </button>
        ))}
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('bios.search')}
          className="ml-auto min-w-0 w-full sm:w-56 px-2.5 py-1 rounded-lg text-xs border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200"
        />
      </div>

      {/* Карточки консолей */}
      <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        {visible.map((sys) => {
          const res = resultById.get(sys.id);
          const status: BiosSystemStatus | 'notChecked' =
            res?.status ?? (sys.need === 'none' ? 'notNeeded' : sys.groups.length === 0 ? 'info' : 'notChecked');
          const isOpen = !!open[sys.id];
          return (
            <div key={sys.id} className="bg-white dark:bg-slate-900 text-xs">
              <button
                type="button"
                onClick={() => setOpen((o) => ({ ...o, [sys.id]: !o[sys.id] }))}
                className="w-full p-3 flex flex-wrap items-center gap-2 text-left cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50"
                aria-expanded={isOpen}
              >
                {isOpen ? (
                  <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                )}
                <span className="font-semibold text-sm text-slate-900 dark:text-slate-100 min-w-0 flex-1">{sys.name}</span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${NEED_STYLE[sys.need]}`}>
                  {t(`bios.need.${sys.need}`)}
                </span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${STATUS_STYLE[status]}`}>
                  {t(`bios.status.${status}`)}
                </span>
              </button>

              {isOpen && (
                <div className="px-3 pb-3.5 pl-9 space-y-3">
                  <p className="text-slate-600 dark:text-slate-300 leading-relaxed max-w-3xl">
                    {localizedBiosText(sys.why, lang)}
                  </p>

                  {sys.groups.map((g, gi) => {
                    const gr = res?.groups[gi];
                    const rows: (BiosFileResult | { expectedPath: string; region?: string; status: 'notChecked'; found?: undefined })[] =
                      gr?.files ??
                      g.files.map((p, i) => ({ expectedPath: p, region: g.regions?.[i], status: 'notChecked' as const }));
                    return (
                      <div key={gi} className="space-y-1">
                        <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                          {[
                            g.level === 'optional' && sys.need !== 'optional' ? t('bios.group.optional') : '',
                            g.mode === 'any' && g.files.length > 1
                              ? t(g.regions ? 'bios.group.any' : 'bios.group.anyAlias')
                              : g.mode !== 'any'
                                ? t(`bios.group.${g.mode}`)
                                : '',
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-[11px]">
                            <thead>
                              <tr className="text-left text-slate-500 dark:text-slate-400">
                                <th className="py-1 pr-3 font-semibold">{t('bios.col.file')}</th>
                                {g.regions && <th className="py-1 pr-3 font-semibold">{t('bios.col.region')}</th>}
                                <th className="py-1 font-semibold">{t('bios.col.status')}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {rows.map((r) => (
                                <tr key={r.expectedPath} className="border-t border-slate-100 dark:border-slate-800">
                                  <td className="py-1 pr-3 font-mono text-slate-800 dark:text-slate-200 break-all">
                                    {g.mode === 'anyFromSystem' && r.status !== 'ok' ? t('bios.file.anyName') : r.expectedPath}
                                  </td>
                                  {g.regions && <td className="py-1 pr-3 text-slate-600 dark:text-slate-300">{r.region || '—'}</td>}
                                  <td className="py-1">
                                    <span className="inline-flex items-center gap-1 text-slate-700 dark:text-slate-300">
                                      <FileStatusIcon status={r.status} />
                                      {r.status === 'notChecked'
                                        ? t('bios.status.notChecked')
                                        : r.status === 'wrongPlace' || r.status === 'wrongName'
                                          ? tf(`bios.file.${r.status}`, { path: r.found?.relPath || '' })
                                          : r.status === 'otherBios'
                                            ? tf('bios.file.otherBios', {
                                                name: (r as BiosFileResult).actually?.path || '',
                                                system: (r as BiosFileResult).actually?.system || '',
                                              })
                                            : t(`bios.file.${r.status}`)}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })}

                  {sys.emulators.length > 0 && (
                    <div className="space-y-1">
                      <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                        {t('bios.emulators')} · {t('bios.whereToPut')}
                      </div>
                      <ul className="space-y-0.5">
                        {sys.emulators.map((e) => (
                          <li key={e.name} className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-slate-800 dark:text-slate-200">{e.name}</span>
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${NEED_STYLE[e.need]}`}>
                              {t(`bios.need.${e.need}`)}
                            </span>
                            <span className="font-mono text-slate-500 dark:text-slate-400 break-all">{e.where}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {sys.links.length > 0 && (
                    <div className="space-y-1">
                      <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">{t('bios.howToGet')}</div>
                      <div className="flex flex-wrap gap-1.5">
                        {sys.links.map((l) => (
                          <a
                            key={l.url}
                            href={l.url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                          >
                            <ExternalLink className="w-3 h-3" />
                            <span className="font-semibold">{linkLabel(l)}:</span> {l.label}
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {report && (report.recognizedExtra.length > 0 || report.unknown.length > 0) && (
        <section className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 text-xs space-y-1">
          <h3 className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
            <HelpCircle className="w-4 h-4 text-slate-400" />
            {t('bios.extra.title')}
          </h3>
          {report.recognizedExtra.length > 0 && (
            <details>
              <summary className="cursor-pointer text-slate-600 dark:text-slate-300">
                {tf('bios.extra.recognized', { count: report.recognizedExtra.length })}
              </summary>
              <ul className="mt-1 pl-4 font-mono text-[11px] text-slate-500 dark:text-slate-400 space-y-0.5">
                {report.recognizedExtra.map((x) => (
                  <li key={x.file.relPath} className="break-all">
                    {x.file.relPath} → {x.known.system}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {report.unknown.length > 0 && (
            <details>
              <summary className="cursor-pointer text-slate-600 dark:text-slate-300">
                {tf('bios.extra.unknown', { count: report.unknown.length })}
              </summary>
              <ul className="mt-1 pl-4 font-mono text-[11px] text-slate-500 dark:text-slate-400 space-y-0.5">
                {report.unknown.slice(0, 200).map((x) => (
                  <li key={x.relPath} className="break-all">
                    {x.relPath} · md5 {x.md5}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
      )}

      <p className="text-[10px] text-slate-400">{tf('bios.dat.credit', { version: LIBRETRO_SYSTEM_DAT_VERSION })}</p>
    </div>
  );
};
