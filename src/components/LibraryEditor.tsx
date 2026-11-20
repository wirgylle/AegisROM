import React, { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import {
  CheckSquare,
  Download,
  FileCode2,
  FolderInput,
  Pencil,
  RotateCcw,
  Square,
  Undo2,
  X,
} from 'lucide-react';
import { useI18n } from '../i18n/translations';
import type { EnrichedBuildGame } from '../utils/buildsAndConverterEngine';
import {
  EDIT_MEDIA_FIELDS,
  applyManualEdits,
  canUndoManualEdits,
  countManualEdits,
  getManualEdit,
  getManualEditsVersion,
  manualEditKey,
  renderTitleTemplate,
  replaceInTitle,
  subscribeManualEdits,
  undoManualEdits,
  type EditMediaField,
  type ManualEditChange,
  type ManualEditPatch,
} from '../utils/manualEdits';

// Режим «Редактор»: панель действий над отмеченными ромами и окно правки одного или многих ромов.
// Editor view: actions on checked ROMs and a dialog that edits one ROM or many.

export function useManualEditsVersion(): number {
  return useSyncExternalStore(subscribeManualEdits, getManualEditsVersion, getManualEditsVersion);
}

const INFO_FIELDS = ['region', 'genre', 'year', 'developer', 'publisher', 'players', 'rating'] as const;
type InfoField = (typeof INFO_FIELDS)[number];

const btn =
  'h-7 px-2.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition disabled:opacity-40 disabled:cursor-not-allowed';
const input =
  'w-full h-8 px-2.5 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-accent/40 disabled:opacity-50';

function fileStem(g: EnrichedBuildGame): string {
  const p = (g.relativePath || g.oldFile || '').replace(/\\/g, '/');
  const base = p.slice(p.lastIndexOf('/') + 1);
  return base.replace(/\.[^/.]+$/, '');
}

function infoValue(g: EnrichedBuildGame, f: InfoField): string {
  if (f === 'year') return g.year ? String(g.year) : '';
  return String((g as unknown as Record<string, unknown>)[f] ?? '');
}

// ---------------------------------------------------------------------------
// Панель над таблицей / Toolbar above the table
// ---------------------------------------------------------------------------

interface EditorToolbarProps {
  visibleGames: EnrichedBuildGame[];
  allGames: EnrichedBuildGame[];
  checkedGameIds: Record<string, boolean>;
  onSetChecked: (next: Record<string, boolean>) => void;
  onEdit: (ids: string[]) => void;
  /** Записать gamelist.xml для ромов (в App — по папкам консолей). / Write gamelist.xml for ROMs. */
  onWriteGamelist?: (ids: string[]) => void;
  onScrapeMedia?: (ids: string[]) => void;
  onMoveRoms?: (ids: string[]) => void;
  onAddLog?: (msg: string) => void;
  busy?: boolean;
}

export const EditorToolbar: React.FC<EditorToolbarProps> = ({
  visibleGames,
  allGames,
  checkedGameIds,
  onSetChecked,
  onEdit,
  onWriteGamelist,
  onScrapeMedia,
  onMoveRoms,
  onAddLog,
  busy,
}) => {
  const { t, tf } = useI18n();
  useManualEditsVersion();

  const checkedIds = useMemo(
    () => allGames.filter((g) => checkedGameIds[g.id]).map((g) => g.id),
    [allGames, checkedGameIds]
  );
  const n = checkedIds.length;
  const edited = countManualEdits();

  const needChecked = (fn: (ids: string[]) => void) => () => {
    if (n === 0) {
      onAddLog?.(t('ed.needChecked'));
      return;
    }
    fn(checkedIds);
  };

  const resetChecked = () => {
    const byKey = new Map<string, string>();
    for (const g of allGames) if (checkedGameIds[g.id]) byKey.set(manualEditKey(g), g.id);
    const changes: ManualEditChange[] = [];
    for (const key of byKey.keys()) if (getManualEdit(key)) changes.push({ key, patch: 'reset' });
    const count = applyManualEdits(changes, t('ed.label.reset'));
    onAddLog?.(count ? tf('ed.savedLog', { count, label: t('ed.label.reset') }) : t('ed.nothingChanged'));
    if (count) onWriteGamelist?.(checkedIds);
  };

  const undo = () => {
    const res = undoManualEdits();
    if (!res) return;
    onAddLog?.(tf('ed.undoneLog', { label: res.label }));
    const keys = new Set(res.keys);
    const ids = allGames.filter((g) => keys.has(manualEditKey(g))).map((g) => g.id);
    if (ids.length) onWriteGamelist?.(ids);
  };

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/60 px-3 py-2 space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs font-semibold text-slate-800 dark:text-slate-100 mr-1 tabular-nums">
          {tf('ed.checked', { count: n })}
        </span>
        <button
          type="button"
          className={btn}
          onClick={() => {
            const next = { ...checkedGameIds };
            for (const g of visibleGames) next[g.id] = true;
            onSetChecked(next);
          }}
        >
          <CheckSquare className="w-3.5 h-3.5" />
          {t('ed.selectVisible')}
        </button>
        <button type="button" className={btn} onClick={() => onSetChecked({})} disabled={n === 0}>
          <Square className="w-3.5 h-3.5" />
          {t('ed.selectNone')}
        </button>
        <span className="w-px h-5 bg-slate-200 dark:bg-slate-700 mx-0.5" />
        <button
          type="button"
          onClick={needChecked(onEdit)}
          disabled={busy}
          className="h-7 px-2.5 rounded-md bg-accent hover:opacity-90 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
        >
          <Pencil className="w-3.5 h-3.5" />
          {t('ed.editChecked')}
        </button>
        {onScrapeMedia && (
          <button type="button" className={btn} onClick={needChecked(onScrapeMedia)} disabled={busy}>
            <Download className="w-3.5 h-3.5" />
            {t('ed.scrapeChecked')}
          </button>
        )}
        {onMoveRoms && (
          <button type="button" className={btn} onClick={needChecked(onMoveRoms)} disabled={busy}>
            <FolderInput className="w-3.5 h-3.5" />
            {t('ed.moveChecked')}
          </button>
        )}
        <button type="button" className={btn} onClick={needChecked(resetChecked)} disabled={busy || edited === 0}>
          <RotateCcw className="w-3.5 h-3.5" />
          {t('ed.resetChecked')}
        </button>
        {onWriteGamelist && (
          <button type="button" className={btn} onClick={needChecked(onWriteGamelist)} disabled={busy}>
            <FileCode2 className="w-3.5 h-3.5" />
            {t('ed.writeGamelist')}
          </button>
        )}
        <button type="button" className={btn} onClick={undo} disabled={busy || !canUndoManualEdits()}>
          <Undo2 className="w-3.5 h-3.5" />
          {t('ed.undo')}
        </button>
      </div>
      <p className="text-[11px] text-slate-500 dark:text-slate-400">
        {t('ed.hint')}
        {edited > 0 && <> · {tf('ed.editedCount', { count: edited })}</>}
      </p>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Окно правки / Edit dialog
// ---------------------------------------------------------------------------

type TitleMode = 'keep' | 'set' | 'template' | 'replace' | 'auto';
type MediaMode = 'keep' | 'remove' | 'set' | 'auto';

interface GameEditModalProps {
  games: EnrichedBuildGame[];
  onClose: () => void;
  /** После сохранения: ids изменённых ромов. / After saving: ids of changed ROMs. */
  onSaved?: (ids: string[]) => void;
  onAddLog?: (msg: string) => void;
}

export const GameEditModal: React.FC<GameEditModalProps> = ({ games, onClose, onSaved, onAddLog }) => {
  const single = games.length === 1;
  return single ? (
    <SingleEditForm game={games[0]} onClose={onClose} onSaved={onSaved} onAddLog={onAddLog} />
  ) : (
    <MassEditForm games={games} onClose={onClose} onSaved={onSaved} onAddLog={onAddLog} />
  );
};

const ModalShell: React.FC<{
  title: string;
  subtitle?: string;
  onClose: () => void;
  onSave: () => void;
  footerExtra?: React.ReactNode;
  children: React.ReactNode;
}> = ({ title, subtitle, onClose, onSave, footerExtra, children }) => {
  const { t } = useI18n();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) onSave();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, onSave]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between gap-3">
          <div className="flex items-start gap-2 min-w-0">
            <Pencil className="w-5 h-5 text-accent shrink-0 mt-0.5" />
            <div className="min-w-0">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 truncate">{title}</h3>
              {subtitle && (
                <p className="text-xs font-mono text-slate-500 dark:text-slate-400 mt-0.5 break-all">{subtitle}</p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('ed.cancel')}
            className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4 space-y-5 text-xs">{children}</div>
        <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] text-slate-500 dark:text-slate-400 max-w-md">{t('ed.saveHint')}</p>
          <div className="flex items-center gap-2">
            {footerExtra}
            <button type="button" onClick={onClose} className={btn + ' h-8'}>
              {t('ed.cancel')}
            </button>
            <button
              type="button"
              onClick={onSave}
              className="h-8 px-4 rounded-md bg-accent hover:opacity-90 text-white text-xs font-semibold cursor-pointer"
            >
              {t('ed.save')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="space-y-2">
    <h4 className="text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">{title}</h4>
    {children}
  </section>
);

const ResetBtn: React.FC<{ onClick: () => void }> = ({ onClick }) => {
  const { t } = useI18n();
  return (
    <button
      type="button"
      onClick={onClick}
      title={t('ed.resetField')}
      aria-label={t('ed.resetField')}
      className="shrink-0 w-8 h-8 rounded-md border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 inline-flex items-center justify-center cursor-pointer"
    >
      <RotateCcw className="w-3.5 h-3.5" />
    </button>
  );
};

function logSaved(
  count: number,
  label: string,
  ids: string[],
  tf: (k: string, v?: Record<string, string | number>) => string,
  t: (k: string) => string,
  onSaved?: (ids: string[]) => void,
  onAddLog?: (msg: string) => void
) {
  onAddLog?.(count ? tf('ed.savedLog', { count, label }) : t('ed.nothingChanged'));
  if (count) onSaved?.(ids);
}

// --- Один ром / One ROM -----------------------------------------------------

const SingleEditForm: React.FC<Omit<GameEditModalProps, 'games'> & { game: EnrichedBuildGame }> = ({
  game,
  onClose,
  onSaved,
  onAddLog,
}) => {
  const { t, tf } = useI18n();
  const key = manualEditKey(game);
  const edit = getManualEdit(key) || {};
  const manual = new Set(game.manualFields || []);

  const initialText: Record<string, string> = {
    title: game.title || '',
    desc: game.desc || '',
  };
  for (const f of INFO_FIELDS) initialText[f] = infoValue(game, f);
  const initialMedia: Record<EditMediaField, string | undefined> = {
    image: edit.image,
    thumbnail: edit.thumbnail,
    marquee: edit.marquee,
    video: edit.video,
  };

  const [text, setText] = useState<Record<string, string>>(initialText);
  // Поле, которое надо вернуть к автоматическому значению. / Fields to return to automatic.
  const [resetFields, setResetFields] = useState<Set<string>>(new Set());
  const [media, setMedia] = useState<Record<EditMediaField, string | undefined>>(initialMedia);

  const setField = (f: string, v: string) => {
    setText((p) => ({ ...p, [f]: v }));
    setResetFields((p) => {
      if (!p.has(f)) return p;
      const n = new Set(p);
      n.delete(f);
      return n;
    });
  };
  const resetField = (f: string) => {
    setResetFields((p) => new Set(p).add(f));
    setText((p) => ({ ...p, [f]: '' }));
  };

  const save = () => {
    const patch: ManualEditPatch = {};
    for (const f of ['title', 'desc', ...INFO_FIELDS]) {
      if (resetFields.has(f)) {
        patch[f as keyof ManualEditPatch] = null;
        continue;
      }
      if ((text[f] ?? '') !== (initialText[f] ?? '')) patch[f as keyof ManualEditPatch] = text[f] ?? '';
    }
    for (const f of EDIT_MEDIA_FIELDS) {
      if (media[f] !== initialMedia[f]) patch[f] = media[f] === undefined ? null : media[f]!;
    }
    const count = applyManualEdits([{ key, patch }], t('ed.label.edit'));
    logSaved(count, t('ed.label.edit'), [game.id], tf, t, onSaved, onAddLog);
    onClose();
  };

  const resetAll = () => {
    const count = applyManualEdits([{ key, patch: 'reset' }], t('ed.label.reset'));
    logSaved(count, t('ed.label.reset'), [game.id], tf, t, onSaved, onAddLog);
    onClose();
  };

  const fieldRow = (f: string, multiline = false) => (
    <label key={f} className="block space-y-1">
      <span className="text-slate-600 dark:text-slate-300 font-semibold flex items-center gap-1.5">
        {t(`ed.f.${f}`)}
        {manual.has(f) && !resetFields.has(f) && (
          <span className="text-[10px] font-semibold text-accent">✎ {t('ed.manualBadge')}</span>
        )}
        {resetFields.has(f) && <span className="text-[10px] text-slate-400">{t('ed.willReset')}</span>}
      </span>
      <span className="flex items-start gap-1.5">
        {multiline ? (
          <textarea
            value={text[f] ?? ''}
            onChange={(e) => setField(f, e.target.value)}
            rows={4}
            className={input + ' h-auto py-2 resize-y'}
          />
        ) : (
          <input value={text[f] ?? ''} onChange={(e) => setField(f, e.target.value)} className={input} />
        )}
        {manual.has(f) && !resetFields.has(f) && <ResetBtn onClick={() => resetField(f)} />}
      </span>
    </label>
  );

  return (
    <ModalShell
      title={t('ed.modalTitleOne')}
      subtitle={`${game.consoleShort} · ${game.oldFile}`}
      onClose={onClose}
      onSave={save}
      footerExtra={
        manual.size > 0 ? (
          <button type="button" onClick={resetAll} className={btn + ' h-8'}>
            <RotateCcw className="w-3.5 h-3.5" />
            {t('ed.resetAll')}
          </button>
        ) : null
      }
    >
      <Section title={t('ed.section.title')}>{fieldRow('title')}</Section>
      <Section title={t('ed.section.info')}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{INFO_FIELDS.map((f) => fieldRow(f))}</div>
        {fieldRow('desc', true)}
      </Section>
      <Section title={t('ed.section.media')}>
        <p className="text-[11px] text-slate-500 dark:text-slate-400">{t('ed.mediaHint')}</p>
        <div className="space-y-2.5">
          {EDIT_MEDIA_FIELDS.map((f) => {
            const v = media[f];
            const autoPreview = f === 'image' ? game.boxArtUrl : f === 'video' ? game.videoUrl : undefined;
            return (
              <div key={f} className="space-y-1">
                <span className="text-slate-600 dark:text-slate-300 font-semibold flex items-center gap-1.5">
                  {t(`ed.f.${f}`)}
                  {v === '' && <span className="text-[10px] text-rose-600 dark:text-rose-400">{t('ed.mediaRemoved')}</span>}
                </span>
                <span className="flex items-center gap-1.5">
                  <input
                    value={v ?? ''}
                    placeholder={
                      v === undefined
                        ? tf('ed.auto', { value: autoPreview || `./${f === 'video' ? 'videos' : f === 'marquee' ? 'marquees' : 'images'}/${fileStem(game)}…` })
                        : ''
                    }
                    onChange={(e) => setMedia((p) => ({ ...p, [f]: e.target.value }))}
                    className={input + ' font-mono'}
                  />
                  <button
                    type="button"
                    onClick={() => setMedia((p) => ({ ...p, [f]: '' }))}
                    className={btn + ' h-8 shrink-0'}
                  >
                    {t('ed.removeMedia')}
                  </button>
                  {v !== undefined && (
                    <ResetBtn onClick={() => setMedia((p) => ({ ...p, [f]: undefined }))} />
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </Section>
    </ModalShell>
  );
};

// --- Много ромов / Many ROMs ------------------------------------------------

const MassEditForm: React.FC<GameEditModalProps> = ({ games, onClose, onSaved, onAddLog }) => {
  const { t, tf } = useI18n();
  const [titleMode, setTitleMode] = useState<TitleMode>('keep');
  const [titleValue, setTitleValue] = useState('');
  const [template, setTemplate] = useState('{title} ({region})');
  const [find, setFind] = useState('');
  const [repl, setRepl] = useState('');
  const [ignoreCase, setIgnoreCase] = useState(true);
  const [infoOn, setInfoOn] = useState<Record<string, boolean>>({});
  const [infoVal, setInfoVal] = useState<Record<string, string>>({});
  const [descMode, setDescMode] = useState<'keep' | 'set' | 'auto'>('keep');
  const [descVal, setDescVal] = useState('');
  const [mediaMode, setMediaMode] = useState<Record<EditMediaField, MediaMode>>({
    image: 'keep',
    thumbnail: 'keep',
    marquee: 'keep',
    video: 'keep',
  });
  const [mediaTpl, setMediaTpl] = useState<Record<EditMediaField, string>>({
    image: './images/{file}-image.png',
    thumbnail: './images/{file}-thumb.png',
    marquee: './marquees/{file}-marquee.png',
    video: './videos/{file}-video.mp4',
  });

  const newTitle = (g: EnrichedBuildGame, i: number): string | null | undefined => {
    if (titleMode === 'keep') return undefined;
    if (titleMode === 'auto') return null;
    if (titleMode === 'set') return titleValue;
    if (titleMode === 'template') return renderTitleTemplate(template, g, i);
    return replaceInTitle(g.title, find, repl, ignoreCase);
  };

  const consoles = Array.from(new Set(games.map((g) => g.consoleShort))).join(', ');

  const save = () => {
    const changes: ManualEditChange[] = [];
    // Один ключ (CRC) может быть у двух копий: правим один раз. / One key may cover two copies.
    const seen = new Set<string>();
    games.forEach((g, i) => {
      const key = manualEditKey(g);
      if (seen.has(key)) return;
      seen.add(key);
      const patch: ManualEditPatch = {};
      const nt = newTitle(g, i);
      if (nt !== undefined && nt !== g.title) patch.title = nt;
      for (const f of INFO_FIELDS) if (infoOn[f]) patch[f] = (infoVal[f] ?? '') || null;
      if (descMode === 'set') patch.desc = descVal || null;
      if (descMode === 'auto') patch.desc = null;
      for (const f of EDIT_MEDIA_FIELDS) {
        const m = mediaMode[f];
        if (m === 'remove') patch[f] = '';
        else if (m === 'auto') patch[f] = null;
        else if (m === 'set')
          patch[f] = mediaTpl[f].replace(/\{file\}/gi, fileStem(g)).replace(/\{title\}/gi, g.title);
      }
      if (Object.keys(patch).length) changes.push({ key, patch });
    });
    const count = applyManualEdits(changes, tf('ed.label.mass', { count: games.length }));
    logSaved(count, tf('ed.label.mass', { count: games.length }), games.map((g) => g.id), tf, t, onSaved, onAddLog);
    onClose();
  };

  const preview = titleMode === 'keep' ? [] : games.slice(0, 6);

  const radio = (mode: TitleMode) => (
    <label key={mode} className="inline-flex items-center gap-1.5 cursor-pointer">
      <input type="radio" checked={titleMode === mode} onChange={() => setTitleMode(mode)} className="accent-blue-600" />
      <span>{t(`ed.titleMode.${mode}`)}</span>
    </label>
  );

  return (
    <ModalShell
      title={tf('ed.modalTitleMany', { count: games.length })}
      subtitle={consoles}
      onClose={onClose}
      onSave={save}
    >
      <Section title={t('ed.section.title')}>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-slate-700 dark:text-slate-200">
          {(['keep', 'set', 'template', 'replace', 'auto'] as TitleMode[]).map(radio)}
        </div>
        {titleMode === 'set' && <input value={titleValue} onChange={(e) => setTitleValue(e.target.value)} className={input} />}
        {titleMode === 'template' && (
          <div className="space-y-1">
            <input value={template} onChange={(e) => setTemplate(e.target.value)} className={input + ' font-mono'} />
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {t('ed.tokens')} <code className="font-mono">{'{title} {region} {year} {console} {genre} {n} {n:3}'}</code>
            </p>
          </div>
        )}
        {titleMode === 'replace' && (
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2 items-center">
            <input value={find} onChange={(e) => setFind(e.target.value)} placeholder={t('ed.find')} className={input} />
            <input value={repl} onChange={(e) => setRepl(e.target.value)} placeholder={t('ed.replaceWith')} className={input} />
            <label className="inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap">
              <input type="checkbox" checked={ignoreCase} onChange={(e) => setIgnoreCase(e.target.checked)} className="accent-blue-600" />
              {t('ed.ignoreCase')}
            </label>
          </div>
        )}
        {preview.length > 0 && (
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
            <div className="px-3 py-1.5 text-[11px] font-semibold text-slate-500">{t('ed.preview')}</div>
            {preview.map((g, i) => {
              const nt = newTitle(g, i);
              return (
                <div key={g.id} className="px-3 py-1.5 grid grid-cols-2 gap-3">
                  <span className="truncate text-slate-500" title={g.title}>{g.title}</span>
                  <span className="truncate font-semibold text-slate-900 dark:text-slate-100">
                    {nt === null ? t('ed.titleMode.auto') : nt || '—'}
                  </span>
                </div>
              );
            })}
            {games.length > preview.length && (
              <div className="px-3 py-1.5 text-[11px] text-slate-500">
                {tf('ed.andMore', { count: games.length - preview.length })}
              </div>
            )}
          </div>
        )}
      </Section>

      <Section title={t('ed.section.info')}>
        <p className="text-[11px] text-slate-500 dark:text-slate-400">{t('ed.massInfoHint')}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {INFO_FIELDS.map((f) => (
            <label key={f} className="block space-y-1">
              <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300 font-semibold">
                <input
                  type="checkbox"
                  checked={!!infoOn[f]}
                  onChange={(e) => setInfoOn((p) => ({ ...p, [f]: e.target.checked }))}
                  className="accent-blue-600"
                />
                {t(`ed.f.${f}`)}
              </span>
              <input
                value={infoVal[f] ?? ''}
                disabled={!infoOn[f]}
                onChange={(e) => setInfoVal((p) => ({ ...p, [f]: e.target.value }))}
                placeholder={infoOn[f] ? t('ed.emptyIsAuto') : ''}
                className={input}
              />
            </label>
          ))}
        </div>
        <div className="space-y-1">
          <span className="flex flex-wrap items-center gap-3 text-slate-600 dark:text-slate-300 font-semibold">
            {t('ed.f.desc')}
            {(['keep', 'set', 'auto'] as const).map((m) => (
              <label key={m} className="inline-flex items-center gap-1 font-normal cursor-pointer">
                <input type="radio" checked={descMode === m} onChange={() => setDescMode(m)} className="accent-blue-600" />
                {t(`ed.titleMode.${m}`)}
              </label>
            ))}
          </span>
          {descMode === 'set' && (
            <textarea value={descVal} onChange={(e) => setDescVal(e.target.value)} rows={3} className={input + ' h-auto py-2'} />
          )}
        </div>
      </Section>

      <Section title={t('ed.section.media')}>
        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          {t('ed.mediaTplHint')} <code className="font-mono">{'{file} {title}'}</code>
        </p>
        <div className="space-y-2">
          {EDIT_MEDIA_FIELDS.map((f) => (
            <div key={f} className="grid grid-cols-1 sm:grid-cols-[9rem_10rem_1fr] gap-2 items-center">
              <span className="font-semibold text-slate-600 dark:text-slate-300">{t(`ed.f.${f}`)}</span>
              <select
                value={mediaMode[f]}
                onChange={(e) => setMediaMode((p) => ({ ...p, [f]: e.target.value as MediaMode }))}
                className={input}
              >
                {(['keep', 'remove', 'set', 'auto'] as MediaMode[]).map((m) => (
                  <option key={m} value={m}>
                    {t(`ed.mediaMode.${m}`)}
                  </option>
                ))}
              </select>
              <input
                value={mediaTpl[f]}
                disabled={mediaMode[f] !== 'set'}
                onChange={(e) => setMediaTpl((p) => ({ ...p, [f]: e.target.value }))}
                className={input + ' font-mono'}
              />
            </div>
          ))}
        </div>
      </Section>
    </ModalShell>
  );
};
