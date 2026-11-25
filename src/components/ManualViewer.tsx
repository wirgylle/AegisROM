import React, { useEffect, useMemo, useState } from 'react';
import { BookOpen, Download, ExternalLink, Loader2, X } from 'lucide-react';
import { useI18n } from '../i18n/translations';
import { nativeRomQuery, type NativeRomRef } from '../utils/romSaves';

// Кнопка «Мануал» в карточке игры и окно просмотра PDF.
// Мануал берётся из файла, найденного сканом (media/manuals Skraper и т. п.), а в десктопе — из
// GET /api/native/fs/manual (aegisapi/manual.go), который ищет его рядом с ромом и после перезапуска.
// PDF показывает встроенный просмотрщик окна (Edge/Chrome).
//
// "Manual" button in the game card and a PDF viewer window.
// The manual comes from the file the scan found (Skraper media/manuals etc.), and on desktop from
// GET /api/native/fs/manual (aegisapi/manual.go), which finds it next to the ROM after a restart too.
// The window's built-in viewer (Edge/Chrome) shows the PDF.

// Строки здесь, а не в общих словарях, чтобы не конфликтовать с параллельными ветками.
// Strings live here, not in the shared dictionaries, to avoid conflicts with parallel branches.
const STR: Record<'en' | 'ru', Record<string, string>> = {
  en: {
    button: 'Manual',
    hint: 'Open the game manual (PDF)',
    title: 'Manual: {title}',
    loading: 'Loading the manual…',
    error: 'Could not open the manual. The file may have moved: rescan the folder.',
    newTab: 'Open in a new window',
    download: 'Save PDF',
    close: 'Close',
  },
  ru: {
    button: 'Мануал',
    hint: 'Открыть мануал игры (PDF)',
    title: 'Мануал: {title}',
    loading: 'Загружаю мануал…',
    error: 'Не удалось открыть мануал. Возможно, файл перенесён: пересканируйте папку.',
    newTab: 'Открыть в отдельном окне',
    download: 'Сохранить PDF',
    close: 'Закрыть',
  },
};

function useManualStrings() {
  const { lang } = useI18n();
  const dict = STR[(lang as 'en' | 'ru') in STR ? (lang as 'en' | 'ru') : 'en'];
  return (key: string, vars?: Record<string, string>) => {
    let s = dict[key] || STR.en[key] || key;
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, v);
    return s;
  };
}

export type ManualSource = { kind: 'file'; file: File } | { kind: 'url'; url: string };

export function nativeManualUrl(ref: NativeRomRef, manualRel?: string): string {
  const q = new URLSearchParams(nativeRomQuery(ref));
  if (manualRel) q.set('manualRel', manualRel);
  return `/api/native/fs/manual?${q.toString()}`;
}

interface ManualButtonProps {
  title: string;
  /** Файл мануала из скана (сеанс). / The manual file from the scan (session). */
  file?: File;
  /** Путь мануала от папки скана. / The manual path from the scan folder. */
  manualRel?: string;
  /** Где ром лежит на диске (десктоп); null в браузере. / Where the ROM is on disk (desktop); null in a browser. */
  romRef: NativeRomRef | null;
  className?: string;
}

/**
 * Кнопка появляется, только если мануал есть: файл из скана или ответ API на HEAD-запрос.
 * The button shows only when there is a manual: a scan file or an API answer to a HEAD request.
 */
export const ManualButton: React.FC<ManualButtonProps> = ({ title, file, manualRel, romRef, className }) => {
  const s = useManualStrings();
  const [open, setOpen] = useState(false);
  const nativeUrl = useMemo(
    () => (romRef ? nativeManualUrl(romRef, manualRel) : ''),
    [romRef?.romFileName, romRef?.relativePath, romRef?.consoleCode, romRef?.libraryPath, romRef?.sdCardPath, manualRel]
  );
  const [nativeFound, setNativeFound] = useState(false);

  useEffect(() => {
    setNativeFound(false);
    if (file || !nativeUrl) return;
    let alive = true;
    fetch(nativeUrl, { method: 'HEAD', cache: 'no-store' })
      .then((r) => {
        if (alive) setNativeFound(r.ok);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [file, nativeUrl]);

  // Один объект на файл/адрес: иначе окно перечитывало бы PDF на каждом рендере.
  // One object per file/URL: otherwise the window would reload the PDF on every render.
  const source = useMemo<ManualSource | null>(
    () => (file ? { kind: 'file', file } : nativeFound ? { kind: 'url', url: nativeUrl } : null),
    [file, nativeFound, nativeUrl]
  );
  if (!source) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={s('hint')}
        data-testid="manual-open"
        className={
          className ||
          'h-10 px-3.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-100 text-sm font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition'
        }
      >
        <BookOpen className="w-4 h-4" />
        <span>{s('button')}</span>
      </button>
      {open && <ManualViewerModal title={title} source={source} onClose={() => setOpen(false)} />}
    </>
  );
};

interface ManualViewerModalProps {
  title: string;
  source: ManualSource;
  onClose: () => void;
}

export const ManualViewerModal: React.FC<ManualViewerModalProps> = ({ title, source, onClose }) => {
  const s = useManualStrings();
  const [url, setUrl] = useState('');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let blobUrl = '';
    let alive = true;
    setFailed(false);
    (async () => {
      try {
        // В обоих случаях делаем blob с типом PDF: просмотрщик окна открывает его без скачивания.
        // Both ways end in a blob typed as PDF: the window's viewer opens it without a download.
        const blob =
          source.kind === 'file'
            ? // Большие файлы нативного окна — LazyFile, не Blob: читаем байты. / Native LazyFile is not a Blob.
              new Blob([source.file instanceof Blob ? source.file : await (source.file as any).arrayBuffer()], {
                type: 'application/pdf',
              })
            : await fetch(source.url, { cache: 'no-store' }).then((r) => {
                if (!r.ok) throw new Error(String(r.status));
                return r.blob().then((b) => new Blob([b], { type: 'application/pdf' }));
              });
        if (!alive) return;
        blobUrl = URL.createObjectURL(blob);
        setUrl(blobUrl);
      } catch {
        if (alive) setFailed(true);
      }
    })();
    return () => {
      alive = false;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [source]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const fileName = source.kind === 'file' ? source.file.name : `${title}.pdf`;

  return (
    <div
      className="fixed inset-0 z-[90] bg-black/60 flex items-stretch sm:items-center justify-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={s('title', { title })}
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-900 w-full sm:max-w-5xl h-full sm:h-[90vh] sm:rounded-xl shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-200 dark:border-slate-800">
          <BookOpen className="w-4 h-4 text-slate-500 shrink-0" />
          <h2 className="flex-1 min-w-0 truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
            {s('title', { title })}
          </h2>
          {url && (
            <>
              <a
                href={url}
                target="_blank"
                rel="noopener"
                title={s('newTab')}
                className="w-8 h-8 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 flex items-center justify-center"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
              <a
                href={url}
                download={fileName}
                title={s('download')}
                className="w-8 h-8 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 flex items-center justify-center"
              >
                <Download className="w-4 h-4" />
              </a>
            </>
          )}
          <button
            type="button"
            onClick={onClose}
            title={s('close')}
            className="w-8 h-8 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 flex items-center justify-center cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 min-h-0 bg-slate-100 dark:bg-slate-950">
          {failed ? (
            <div className="h-full flex items-center justify-center p-6 text-sm text-slate-600 dark:text-slate-300 text-center">
              {s('error')}
            </div>
          ) : url ? (
            <iframe title={s('title', { title })} src={url} className="w-full h-full border-0" />
          ) : (
            <div className="h-full flex items-center justify-center gap-2 text-sm text-slate-500">
              <Loader2 className="w-4 h-4 animate-spin" />
              {s('loading')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
