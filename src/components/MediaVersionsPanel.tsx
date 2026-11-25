import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Images, Pin, RotateCcw, X } from 'lucide-react';
import { useI18n } from '../i18n/translations';
import { VERSION_SLOTS, type MediaVersion, type SlotVersions, type VersionSlot } from '../utils/mediaVersions';

// Версии медиа в карточке игры: миниатюры под основной картинкой и окно выбора версии
// по умолчанию. Данные даёт App (папка консоли, .aegis-media), см. utils/mediaVersions.ts.
// Media versions in the game card: thumbnails under the main image and a window to pick the
// default version. App supplies the data (console folder, .aegis-media), see utils/mediaVersions.ts.

export interface MediaVersionsSlotView {
  entry: SlotVersions;
  /** Ссылки на файлы версий (blob:), по id. / Version file URLs (blob:) by id. */
  urls: Record<string, string>;
}

export interface MediaVersionsView {
  stem: string;
  slots: Partial<Record<VersionSlot, MediaVersionsSlotView>>;
}

interface Props {
  /** Меняется при выборе другой игры. / Changes when another game is selected. */
  gameKey: string;
  title: string;
  load: () => Promise<MediaVersionsView | null>;
  /** id = null — снять закрепление, вернуть автовыбор. / id = null: unpin, back to auto. */
  select: (slot: VersionSlot, id: string | null) => Promise<boolean>;
}

const MAX_THUMBS = 4;

function revokeAll(view: MediaVersionsView | null) {
  if (!view) return;
  for (const s of Object.values(view.slots)) for (const u of Object.values(s?.urls || {})) if (u.startsWith('blob:')) URL.revokeObjectURL(u);
}

const label = (v: MediaVersion) => v.id.toUpperCase();

export function MediaVersionsPanel({ gameKey, title, load, select }: Props) {
  const { t, tf } = useI18n();
  const [view, setView] = useState<MediaVersionsView | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState<VersionSlot | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const next = await load();
      setView((prev) => {
        revokeAll(prev);
        return next;
      });
    } catch {
      setView(null);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameKey]);

  useEffect(() => {
    void reload();
  }, [reload]);
  useEffect(() => () => revokeAll(view), [view]);

  const image = view?.slots.image;
  const anySlots = useMemo(() => VERSION_SLOTS.filter((s) => (view?.slots[s]?.entry.versions.length || 0) > 0), [view]);

  if (!view) return null;
  if (!image || image.entry.versions.length < 2) {
    return (
      <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
        <span>{loading ? t('mv.loading') : t('mv.none')}</span>
        {anySlots.some((s) => (view.slots[s]?.entry.versions.length || 0) > 1) && (
          <button type="button" className="underline cursor-pointer" onClick={() => setOpen(anySlots[0])}>
            {t('mv.open')}
          </button>
        )}
        {open && (
          <VersionsModal view={view} slot={open} focus={focus} title={title} busy={busy} onSlot={setOpen} onClose={() => setOpen(null)} onPick={pick} />
        )}
      </div>
    );
  }

  async function pick(slot: VersionSlot, id: string | null) {
    setBusy(true);
    try {
      // Успешный выбор меняет gameKey, панель перечитает версии сама. / A successful pick changes gameKey; the panel reloads.
      await select(slot, id);
    } finally {
      setBusy(false);
    }
  }

  const versions = image.entry.versions;
  const shown = versions.slice(0, MAX_THUMBS);
  const more = versions.length - shown.length;

  return (
    <div className="space-y-1.5" data-tool="mediaVersions">
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span className="font-semibold text-slate-600 dark:text-slate-300">
          {tf('mv.strip', { count: versions.length })}
          {image.entry.pinned && <Pin className="inline w-3 h-3 ml-1 text-blue-500" aria-label={t('mv.pinned')} />}
          {(image.entry.unseen || 0) > 0 && (
            <span className="ml-1.5 px-1.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300">
              {tf('mv.new', { count: image.entry.unseen || 0 })}
            </span>
          )}
        </span>
        <button
          type="button"
          onClick={() => {
            setFocus(null);
            setOpen('image');
          }}
          className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
        >
          <Images className="w-3.5 h-3.5" />
          {t('mv.open')}
        </button>
      </div>
      <div className="flex gap-1.5">
        {shown.map((v) => {
          const active = v.id === image.entry.active;
          return (
            <button
              key={v.id}
              type="button"
              title={`${label(v)} · ${t(`mv.src.${v.source}`, v.source)} · ${tf('mv.score', { score: v.score })}`}
              onClick={() => {
                setFocus(v.id);
                setOpen('image');
              }}
              className={`relative w-14 h-14 rounded-md overflow-hidden bg-slate-950 border-2 cursor-pointer ${
                active ? 'border-blue-500' : 'border-transparent hover:border-slate-400'
              }`}
            >
              {image.urls[v.id] ? (
                <img src={image.urls[v.id]} alt={label(v)} className="w-full h-full object-contain" />
              ) : null}
              <span className="absolute bottom-0 inset-x-0 bg-black/70 text-white text-[9px] font-bold leading-tight">{label(v)}</span>
            </button>
          );
        })}
        {more > 0 && (
          <button
            type="button"
            onClick={() => setOpen('image')}
            className="w-14 h-14 rounded-md border border-dashed border-slate-300 dark:border-slate-700 text-[11px] text-slate-500 cursor-pointer"
          >
            +{more}
          </button>
        )}
      </div>
      {open && (
        <VersionsModal view={view} slot={open} focus={focus} title={title} busy={busy} onSlot={setOpen} onClose={() => setOpen(null)} onPick={pick} />
      )}
    </div>
  );
}

function VersionsModal({
  view,
  slot,
  focus,
  title,
  busy,
  onSlot,
  onClose,
  onPick,
}: {
  view: MediaVersionsView;
  slot: VersionSlot;
  focus: string | null;
  title: string;
  busy: boolean;
  onSlot: (s: VersionSlot) => void;
  onClose: () => void;
  onPick: (slot: VersionSlot, id: string | null) => void;
}) {
  const { t, tf } = useI18n();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const sv = view.slots[slot];
  const versions = sv ? [...sv.entry.versions].sort((a, b) => b.score - a.score) : [];
  const best = versions[0]?.id;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={t('mv.title')}
    >
      <div
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-3xl w-full max-h-[88vh] overflow-hidden flex flex-col shadow-2xl text-xs"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 pt-4 pb-3 border-b border-slate-200 dark:border-slate-800 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">{t('mv.title')}</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate" title={title}>
                {title}
              </p>
            </div>
            <button type="button" onClick={onClose} aria-label={t('mv.close')} className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {VERSION_SLOTS.map((s) => {
              const n = view.slots[s]?.entry.versions.length || 0;
              return (
                <button
                  key={s}
                  type="button"
                  disabled={n === 0}
                  onClick={() => onSlot(s)}
                  className={`h-7 px-3 rounded-lg font-semibold cursor-pointer disabled:opacity-40 disabled:cursor-default ${
                    s === slot ? 'bg-blue-600 text-white' : 'border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200'
                  }`}
                >
                  {t(`mv.slot.${s}`)} · {n}
                </button>
              );
            })}
          </div>
          <p className="text-slate-500 dark:text-slate-400">{t('mv.hint')}</p>
        </div>

        <div className="overflow-y-auto p-4 grid grid-cols-1 min-[420px]:grid-cols-2 md:grid-cols-3 gap-3">
          {versions.map((v) => {
            const active = sv && v.id === sv.entry.active;
            return (
              <div
                key={v.id}
                className={`rounded-xl border-2 overflow-hidden flex flex-col ${
                  active ? 'border-blue-500' : v.id === focus ? 'border-amber-400' : 'border-slate-200 dark:border-slate-800'
                }`}
              >
                <div className="aspect-square bg-slate-950 flex items-center justify-center">
                  {sv?.urls[v.id] ? <img src={sv.urls[v.id]} alt={label(v)} className="max-w-full max-h-full object-contain" /> : null}
                </div>
                <div className="p-2.5 space-y-1.5 flex-1 flex flex-col">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-slate-900 dark:text-slate-100">
                      {label(v)}
                      {v.id === best && <span className="ml-1.5 font-semibold text-emerald-600 dark:text-emerald-400">{t('mv.best')}</span>}
                    </span>
                    <span className="font-mono text-slate-500">{tf('mv.score', { score: v.score })}</span>
                  </div>
                  <div className="text-slate-600 dark:text-slate-300">
                    {t(`mv.src.${v.source}`, v.source)}
                    {v.w && v.h ? ` · ${v.w}×${v.h}` : ''}
                  </div>
                  {v.matchedName && (
                    <div className="text-slate-500 dark:text-slate-400 truncate" title={v.matchedName}>
                      {v.matchedName}
                    </div>
                  )}
                  {v.reasons.length > 0 && (
                    <ul className="flex flex-wrap gap-1">
                      {v.reasons.map((r) => (
                        <li
                          key={r}
                          className={`px-1.5 py-0.5 rounded ${
                            /mismatch|wrong|low|fuzzy/.test(r)
                              ? 'bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          {t(`mv.reason.${r}`, r)}
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="flex-1" />
                  {active ? (
                    <div className="h-8 inline-flex items-center gap-1.5 font-semibold text-blue-600 dark:text-blue-400">
                      <Check className="w-4 h-4" />
                      {sv?.entry.pinned ? t('mv.activePinned') : t('mv.activeAuto')}
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onPick(slot, v.id)}
                      className="h-8 px-3 rounded-lg font-semibold bg-blue-600 text-white hover:opacity-90 cursor-pointer disabled:opacity-50"
                    >
                      {t('mv.use')}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
          <span className="text-slate-500 dark:text-slate-400">{sv?.entry.pinned ? t('mv.pinnedNote') : t('mv.autoNote')}</span>
          {sv?.entry.pinned && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onPick(slot, null)}
              className="h-8 px-3 rounded-lg font-semibold border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              {t('mv.unpin')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
