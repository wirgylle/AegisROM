import React, { useMemo, useRef, useState } from 'react';
import { FileSpreadsheet, Upload, Download, X } from 'lucide-react';
import { useI18n } from '../i18n/translations';
import {
  changesToPatches,
  exportFileName,
  parseGameData,
  planGameDataImport,
  toCsv,
  toXml,
  type GameDataChange,
  type GameDataFormat,
  type GameDataImportPlan,
  type GameDataRow,
} from '../utils/gameDataIO';
import { applyManualEdits } from '../utils/manualEdits';

// Карточка «Данные игр» в Инструментах: выгрузка в CSV/XML через окно области и загрузка
// обратно с предпросмотром изменений. Логика файлов — utils/gameDataIO.ts.
//
// "Game data" card in Tools: export to CSV/XML through the scope window and import back with
// a preview of the changes. File logic is in utils/gameDataIO.ts.

const FORMAT_KEY = 'aegisrom_game_data_format';

export function loadGameDataFormat(): GameDataFormat {
  try {
    return localStorage.getItem(FORMAT_KEY) === 'xml' ? 'xml' : 'csv';
  } catch {
    return 'csv';
  }
}

export function saveGameDataFormat(f: GameDataFormat) {
  try {
    localStorage.setItem(FORMAT_KEY, f);
  } catch {}
}

function download(text: string, name: string, mime: string) {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

// Выгружает выбранные игры. Возвращает имя файла. / Exports the chosen games. Returns the file name.
export function exportGameData(rows: readonly GameDataRow[], format: GameDataFormat): string {
  const name = exportFileName(format);
  if (format === 'xml') download(toXml(rows), name, 'application/xml');
  else download(toCsv(rows), name, 'text/csv');
  return name;
}

export const GameDataFormatPicker: React.FC<{ value: GameDataFormat; onChange: (f: GameDataFormat) => void }> = ({
  value,
  onChange,
}) => {
  const { t } = useI18n();
  const opt = (f: GameDataFormat) => (
    <label
      key={f}
      className={`flex-1 min-w-[180px] flex items-start gap-2 p-2.5 rounded-lg border cursor-pointer ${
        value === f
          ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40'
          : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900'
      }`}
    >
      <input type="radio" name="gameDataFormat" checked={value === f} onChange={() => onChange(f)} className="mt-0.5" />
      <span className="min-w-0">
        <span className="block text-xs font-bold text-slate-900 dark:text-slate-100">{t(`gameData.format.${f}`)}</span>
        <span className="block text-[11px] text-slate-500 dark:text-slate-400">{t(`gameData.format.${f}.hint`)}</span>
      </span>
    </label>
  );
  return (
    <div className="space-y-2">
      <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
        {t('gameData.format')}
      </div>
      <div className="flex flex-wrap gap-2">{(['csv', 'xml'] as const).map(opt)}</div>
      <p className="text-[11px] text-slate-500 dark:text-slate-400">{t('gameData.readonlyNote')}</p>
    </div>
  );
};

interface GameDataPanelProps {
  /** Игры библиотеки с наложенными правками. / Library games with edits applied. */
  games: readonly GameDataRow[];
  busy?: boolean;
  /** Открыть окно области для выгрузки. / Open the scope window for export. */
  onExport: () => void;
  onAddLog?: (msg: string) => void;
}

export const GameDataPanel: React.FC<GameDataPanelProps> = ({ games, busy, onExport, onAddLog }) => {
  const { t, tf } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<{ plan: GameDataImportPlan; fileName: string } | null>(null);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const records = parseGameData(text, file.name);
      if (records.length === 0) {
        onAddLog?.(tf('gameData.log.empty', { file: file.name }));
        return;
      }
      setPreview({ plan: planGameDataImport(records, games), fileName: file.name });
    } catch (err) {
      onAddLog?.(tf('gameData.log.readError', { file: file.name, error: String((err as Error)?.message || err) }));
    }
  };

  const btn =
    'px-3 py-2 rounded-lg bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 font-bold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50';

  return (
    <div
      data-tool="gameData"
      className="bg-slate-50/80 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-3.5 space-y-2.5 text-xs"
    >
      <div className="flex items-start gap-2">
        <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
        <div className="min-w-0">
          <div className="font-semibold text-slate-900 dark:text-slate-100">{t('gameData.title')}</div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{t('gameData.hint')}</p>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <button type="button" className={btn} disabled={busy || games.length === 0} onClick={onExport}>
          <Download className="w-3.5 h-3.5 text-emerald-600" />
          <span>{t('gameData.export')}</span>
        </button>
        <button type="button" className={btn} disabled={busy || games.length === 0} onClick={() => inputRef.current?.click()}>
          <Upload className="w-3.5 h-3.5 text-indigo-600" />
          <span>{t('gameData.import')}</span>
        </button>
      </div>
      <input ref={inputRef} type="file" accept=".csv,.tsv,.txt,.xml" className="hidden" onChange={onFile} />
      {preview && (
        <GameDataImportModal
          plan={preview.plan}
          fileName={preview.fileName}
          onClose={() => setPreview(null)}
          onApply={(changes) => {
            const games = new Set(changes.map((c) => c.key)).size;
            applyManualEdits(changesToPatches(changes), tf('gameData.undoLabel', { file: preview.fileName }));
            onAddLog?.(tf('gameData.log.import', { changes: changes.length, games, file: preview.fileName }));
            setPreview(null);
          }}
        />
      )}
    </div>
  );
};

const PAGE = 150;

const GameDataImportModal: React.FC<{
  plan: GameDataImportPlan;
  fileName: string;
  onApply: (changes: GameDataChange[]) => void;
  onClose: () => void;
}> = ({ plan, fileName, onApply, onClose }) => {
  const { t, tf } = useI18n();
  const changedFields = useMemo(() => [...new Set(plan.changes.map((c) => c.field))], [plan]);
  const [fields, setFields] = useState<Set<string>>(() => new Set(changedFields));
  const [skipped, setSkipped] = useState<Set<string>>(() => new Set());
  const [limit, setLimit] = useState(PAGE);
  const [showUnmatched, setShowUnmatched] = useState(false);

  const groups = useMemo(() => {
    const m = new Map<string, GameDataChange[]>();
    for (const c of plan.changes) {
      if (!fields.has(c.field)) continue;
      const list = m.get(c.rowId);
      if (list) list.push(c);
      else m.set(c.rowId, [c]);
    }
    return [...m.entries()];
  }, [plan, fields]);
  const selected = useMemo(
    () => groups.filter(([id]) => !skipped.has(id)).flatMap(([, list]) => list),
    [groups, skipped]
  );

  const stat = (label: string, value: number, tone = '') => (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</div>
      <div className={`text-sm font-bold ${tone || 'text-slate-900 dark:text-slate-100'}`}>{value}</div>
    </div>
  );
  const shortVal = (v: string) => {
    if (!v) return <span className="italic text-slate-400">{t('gameData.preview.empty')}</span>;
    return v.length > 140 ? v.slice(0, 140) + '…' : v;
  };

  return (
    <div className="fixed inset-0 z-[80] bg-black/50 flex items-center justify-center p-3" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 shadow-xl text-xs"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-200 dark:border-slate-800">
          <div className="min-w-0">
            <div className="text-sm font-bold text-slate-900 dark:text-slate-100">{t('gameData.preview.title')}</div>
            <div className="text-[11px] text-slate-500 truncate">
              {t('gameData.preview.file')}: {fileName}
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3 overflow-y-auto">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {stat(t('gameData.preview.records'), plan.records)}
            {stat(t('gameData.preview.matched'), plan.matched, 'text-emerald-600')}
            {stat(t('gameData.preview.unmatched'), plan.unmatched.length, plan.unmatched.length ? 'text-amber-600' : '')}
            {stat(t('gameData.preview.games'), plan.changedGames, 'text-blue-600')}
          </div>
          {(plan.ambiguous.length > 0 || plan.duplicates > 0) && (
            <div className="rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 space-y-0.5 text-amber-800 dark:text-amber-200">
              {plan.ambiguous.length > 0 && (
                <div>
                  {t('gameData.preview.ambiguous')}: <b>{plan.ambiguous.length}</b>. {t('gameData.preview.ambiguousHint')}
                </div>
              )}
              {plan.duplicates > 0 && (
                <div>
                  {t('gameData.preview.duplicates')}: <b>{plan.duplicates}</b>
                </div>
              )}
            </div>
          )}
          {plan.unmatched.length + plan.ambiguous.length > 0 && (
            <div>
              <button
                type="button"
                className="text-blue-600 dark:text-blue-400 font-semibold cursor-pointer"
                onClick={() => setShowUnmatched((v) => !v)}
              >
                {t('gameData.preview.showUnmatched')} ({plan.unmatched.length + plan.ambiguous.length})
              </button>
              {showUnmatched && (
                <ul className="mt-1 max-h-32 overflow-y-auto font-mono text-[11px] text-slate-600 dark:text-slate-300">
                  {[...plan.ambiguous, ...plan.unmatched].slice(0, 300).map((u) => (
                    <li key={u.index}>
                      #{u.index} · {u.label}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {plan.changes.length === 0 ? (
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-4 text-center text-slate-600 dark:text-slate-300">
              {t('gameData.preview.noChanges')}
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mr-1">
                  {t('gameData.preview.fields')}
                </span>
                {changedFields.map((f) => {
                  const on = fields.has(f);
                  const n = plan.changes.filter((c) => c.field === f).length;
                  return (
                    <button
                      key={f}
                      type="button"
                      aria-pressed={on}
                      onClick={() =>
                        setFields((prev) => {
                          const next = new Set(prev);
                          if (on) next.delete(f);
                          else next.add(f);
                          return next;
                        })
                      }
                      className={`px-2 py-1 rounded-lg border text-[11px] font-semibold cursor-pointer ${
                        on
                          ? 'bg-blue-600 border-blue-600 text-white'
                          : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200'
                      }`}
                    >
                      {t(`gameData.field.${f}`)} <span className={on ? 'text-blue-100' : 'text-slate-400'}>{n}</span>
                    </button>
                  );
                })}
                <span className="flex-1" />
                <button type="button" className="text-blue-600 dark:text-blue-400 font-semibold cursor-pointer" onClick={() => setSkipped(new Set())}>
                  {t('gameData.preview.all')}
                </button>
                <span className="text-slate-300">·</span>
                <button
                  type="button"
                  className="text-blue-600 dark:text-blue-400 font-semibold cursor-pointer"
                  onClick={() => setSkipped(new Set(groups.map(([id]) => id)))}
                >
                  {t('gameData.preview.none')}
                </button>
              </div>

              <div className="rounded-lg border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800">
                {groups.slice(0, limit).map(([id, list]) => {
                  const on = !skipped.has(id);
                  return (
                    <label key={id} className={`flex gap-2.5 px-3 py-2 cursor-pointer ${on ? '' : 'opacity-50'}`}>
                      <input
                        type="checkbox"
                        checked={on}
                        className="mt-0.5"
                        onChange={() =>
                          setSkipped((prev) => {
                            const next = new Set(prev);
                            if (on) next.add(id);
                            else next.delete(id);
                            return next;
                          })
                        }
                      />
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                          {list[0].title} <span className="text-slate-400 font-normal">· {list[0].console}</span>
                        </div>
                        <div className="mt-0.5 space-y-0.5">
                          {list.map((c) => (
                            <div key={c.field} className="grid grid-cols-[88px_1fr] gap-2 text-[11px]">
                              <span className="text-slate-500">{t(`gameData.field.${c.field}`)}</span>
                              <span className="min-w-0 break-words">
                                <span className="line-through text-rose-600/80 dark:text-rose-400/80">{shortVal(c.from)}</span>
                                <span className="text-slate-400"> → </span>
                                <span className="text-emerald-700 dark:text-emerald-400">{shortVal(c.to)}</span>
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
              {groups.length > limit && (
                <button
                  type="button"
                  className="text-blue-600 dark:text-blue-400 font-semibold cursor-pointer"
                  onClick={() => setLimit((l) => l + PAGE)}
                >
                  {tf('gameData.preview.more', { count: Math.min(PAGE, groups.length - limit) })}
                </button>
              )}
              <p className="text-[11px] text-slate-500 dark:text-slate-400">{t('gameData.preview.note')}</p>
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 px-4 py-3 border-t border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 font-bold cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            {t('gameData.preview.cancel')}
          </button>
          <button
            type="button"
            disabled={selected.length === 0}
            onClick={() => onApply(selected)}
            className="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold cursor-pointer disabled:opacity-50"
          >
            {tf('gameData.preview.apply', { count: selected.length })}
          </button>
        </div>
      </div>
    </div>
  );
};
