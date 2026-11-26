import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, FileText, Film, Images, Loader2, X } from 'lucide-react';
import { useI18n } from '../i18n/translations';
import { GAME_MEDIA_KINDS, GAME_MEDIA_LABELS, IMAGE_EXTS, VIDEO_EXTS, extOfName, type GameMediaKind } from '../utils/gameMediaKinds';
import { ManualViewerModal } from './ManualViewer';

// «Медиа игры» в карточке: все виды, что выкачал Skraper (обложка, 3D-коробка, микс, скриншот,
// титульный экран, логотип, маркиза, Steam grid, фон, картридж и его скан, карты, видео, мануал,
// советы). Сверху — вкладки по видам с числом файлов, ниже миниатюры; клик открывает просмотр.
// Файлы ищутся по требованию при выборе игры (App: handleLoadGameMedia, десктоп:
// /api/native/fs/game-media), в базу не сохраняются.
//
// "Game media" in the game card: every kind Skraper downloads. Kind tabs with file counts on top,
// thumbnails below; a click opens a viewer. Files are looked up on demand when a game is picked.

export interface GameMediaItem {
  kind: GameMediaKind;
  name: string;
  url: string;
  size?: number;
}

const STR: Record<'en' | 'ru', Record<string, string>> = {
  en: {
    title: 'Game media',
    loading: 'Looking for media…',
    none: 'No extra media found next to the ROM. Run Tools → Library → Tidy media… if Skraper put them in media/.',
    open: 'Open',
    close: 'Close',
    prev: 'Previous',
    next: 'Next',
    text: 'Text',
  },
  ru: {
    title: 'Медиа игры',
    loading: 'Ищу медиа…',
    none: 'Рядом с ромом других медиа не нашлось. Если Skraper сложил их в media/, запустите Инструменты → Библиотека → «Упорядочить медиа…».',
    open: 'Открыть',
    close: 'Закрыть',
    prev: 'Предыдущий',
    next: 'Следующий',
    text: 'Текст',
  },
};

const isImage = (it: GameMediaItem) => IMAGE_EXTS.has(extOfName(it.name));
const isVideo = (it: GameMediaItem) => VIDEO_EXTS.has(extOfName(it.name));
const isPdf = (it: GameMediaItem) => extOfName(it.name) === '.pdf';

interface Props {
  /** Меняется при выборе другой игры. / Changes when another game is picked. */
  gameKey: string;
  title: string;
  load: () => Promise<GameMediaItem[]>;
  /** Сообщить найденные виды (для фильтра «Медиа»). / Report the kinds found (for the "Media" filter). */
  onKinds?: (kinds: GameMediaKind[]) => void;
}

export const GameMediaGallery: React.FC<Props> = ({ gameKey, title, load, onKinds }) => {
  const { lang } = useI18n();
  const ru = lang === 'ru';
  const s = (k: string) => STR[ru ? 'ru' : 'en'][k] || k;
  const labels = GAME_MEDIA_LABELS[ru ? 'ru' : 'en'];

  const [items, setItems] = useState<GameMediaItem[] | null>(null);
  const [kind, setKind] = useState<GameMediaKind | null>(null);
  const [viewer, setViewer] = useState<number | null>(null);
  const [pdf, setPdf] = useState<GameMediaItem | null>(null);
  const [text, setText] = useState<{ name: string; body: string } | null>(null);

  useEffect(() => {
    let alive = true;
    setItems(null);
    setKind(null);
    setViewer(null);
    load()
      .then((list) => {
        if (!alive) return;
        setItems(list);
        if (list.length) onKinds?.(Array.from(new Set(list.map((x) => x.kind))));
      })
      .catch(() => alive && setItems([]));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameKey]);

  const byKind = useMemo(() => {
    const m = new Map<GameMediaKind, GameMediaItem[]>();
    for (const it of items || []) {
      const l = m.get(it.kind) || [];
      l.push(it);
      m.set(it.kind, l);
    }
    return GAME_MEDIA_KINDS.filter((k) => m.has(k)).map((k) => [k, m.get(k)!] as const);
  }, [items]);

  const activeKind = kind && byKind.some(([k]) => k === kind) ? kind : byKind[0]?.[0] || null;
  const shown = byKind.find(([k]) => k === activeKind)?.[1] || [];
  const gallery = shown.filter(isImage);

  const openItem = async (it: GameMediaItem) => {
    if (isImage(it)) setViewer(gallery.indexOf(it));
    else if (isPdf(it)) setPdf(it);
    else if (!isVideo(it)) {
      try {
        const body = await fetch(it.url).then((r) => r.text());
        setText({ name: it.name, body });
      } catch {}
    }
  };

  useEffect(() => {
    if (viewer === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setViewer(null);
      if (e.key === 'ArrowLeft') setViewer((v) => (v === null ? v : (v - 1 + gallery.length) % gallery.length));
      if (e.key === 'ArrowRight') setViewer((v) => (v === null ? v : (v + 1) % gallery.length));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [viewer, gallery.length]);

  if (items === null) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400" data-testid="game-media-loading">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        {s('loading')}
      </div>
    );
  }
  if (items.length === 0) return null;

  return (
    <section className="space-y-2" data-testid="game-media">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
        <Images className="w-3.5 h-3.5" />
        {s('title')}
        <span className="font-normal text-slate-400">· {items.length}</span>
      </div>
      <div className="flex flex-wrap gap-1" role="tablist">
        {byKind.map(([k, list]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={k === activeKind}
            onClick={() => setKind(k)}
            className={
              'h-7 px-2 rounded-md text-[11px] font-semibold border cursor-pointer transition ' +
              (k === activeKind
                ? 'bg-accent text-white border-accent'
                : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800')
            }
          >
            {labels[k]}
            {list.length > 1 && <span className="opacity-70"> {list.length}</span>}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {shown.map((it, i) =>
          isVideo(it) ? (
            <video
              key={i}
              src={it.url}
              controls
              preload="metadata"
              className="col-span-3 w-full rounded-lg bg-black max-h-56"
            />
          ) : isImage(it) ? (
            <button
              key={i}
              type="button"
              onClick={() => void openItem(it)}
              title={it.name}
              className="aspect-square rounded-lg overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800 cursor-zoom-in"
            >
              <img src={it.url} alt={it.name} loading="lazy" className="w-full h-full object-contain" />
            </button>
          ) : (
            <button
              key={i}
              type="button"
              onClick={() => void openItem(it)}
              title={it.name}
              className="col-span-3 h-9 px-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold flex items-center gap-1.5 cursor-pointer min-w-0"
            >
              {isPdf(it) ? <FileText className="w-3.5 h-3.5 shrink-0" /> : <Film className="w-3.5 h-3.5 shrink-0" />}
              <span className="truncate">{it.name}</span>
            </button>
          )
        )}
      </div>

      {viewer !== null && gallery[viewer] && (
        <div
          className="fixed inset-0 z-[95] bg-black/85 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`${title}: ${labels[gallery[viewer].kind]}`}
          onClick={() => setViewer(null)}
        >
          <img
            src={gallery[viewer].url}
            alt={gallery[viewer].name}
            className="max-w-full max-h-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          <div className="absolute top-3 left-4 right-14 text-xs text-white/80 truncate">
            {labels[gallery[viewer].kind]} · {gallery[viewer].name}
          </div>
          <button
            type="button"
            onClick={() => setViewer(null)}
            title={s('close')}
            className="absolute top-2 right-2 w-9 h-9 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
          {gallery.length > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setViewer((viewer - 1 + gallery.length) % gallery.length);
                }}
                title={s('prev')}
                className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center cursor-pointer"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setViewer((viewer + 1) % gallery.length);
                }}
                title={s('next')}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center cursor-pointer"
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            </>
          )}
        </div>
      )}

      {pdf && <ManualViewerModal title={`${title} · ${labels[pdf.kind]}`} source={{ kind: 'url', url: pdf.url }} onClose={() => setPdf(null)} />}

      {text && (
        <div
          className="fixed inset-0 z-[95] bg-black/60 flex items-stretch sm:items-center justify-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label={text.name}
          onClick={() => setText(null)}
        >
          <div
            className="bg-white dark:bg-slate-900 w-full sm:max-w-2xl h-full sm:h-auto sm:max-h-[85vh] sm:rounded-xl shadow-2xl flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-200 dark:border-slate-800">
              <FileText className="w-4 h-4 text-slate-500 shrink-0" />
              <h2 className="flex-1 min-w-0 truncate text-sm font-semibold">{text.name}</h2>
              <button
                type="button"
                onClick={() => setText(null)}
                title={s('close')}
                className="w-8 h-8 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <pre className="p-4 text-xs whitespace-pre-wrap overflow-y-auto text-slate-800 dark:text-slate-100">{text.body}</pre>
          </div>
        </div>
      )}
    </section>
  );
};
