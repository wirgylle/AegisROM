import React, { useMemo, useRef, useState } from 'react';
import { Download, FileCode2, FolderInput, Wand2 } from 'lucide-react';
import { useI18n } from '../i18n/translations';
import { PATCH_EXTENSIONS, PatchError, buildPatchedFileName, readPatchInfo, type PatchInfo } from '../utils/romPatcher';
import { HACKROMS_DIR, PATCH_DIR } from '../utils/romHacks';
import { PatchMemoryError, computeRomCrc, runPatchJob } from '../utils/patchRunner';

// Патчер в «Инструментах»: ром + патч (IPS / UPS / BPS / xdelta) → новый ром с тегом статуса.
// Результат можно скачать или положить в <папка консоли>/hackroms/, а сам патч — в patch/.
// Patcher in Tools: ROM + patch (IPS / UPS / BPS / xdelta) → a new ROM with a status tag.
// The result can be downloaded or saved into <console folder>/hackroms/, the patch itself into patch/.
// Ром читается с диска кусками, результат пишется во временный файл: размер рома не ограничен.
// The ROM is read from disk in pieces and the result goes to a temporary file: no ROM size limit.

type TagChoice = 'trans' | 'hack' | 'fix' | 'custom';

function guessTag(patchName: string): { choice: TagChoice; lang: string } {
  const low = patchName.toLowerCase();
  if (/rus|русс|рус/.test(low)) return { choice: 'trans', lang: 'Rus' };
  if (/\beng|english|translat/.test(low)) return { choice: 'trans', lang: 'Eng' };
  if (/fix/.test(low)) return { choice: 'fix', lang: 'Rus' };
  return { choice: 'hack', lang: 'Rus' };
}

export function PatcherPanel({ disabled }: { disabled?: boolean }) {
  const { t, tf } = useI18n();
  const romInput = useRef<HTMLInputElement>(null);
  const patchInput = useRef<HTMLInputElement>(null);
  const [rom, setRom] = useState<{ file: File; crc: string | null; headerless?: string } | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const romToken = useRef(0);
  const [patch, setPatch] = useState<{ file: File; bytes: Uint8Array; info: PatchInfo | null } | null>(null);
  const [tagChoice, setTagChoice] = useState<TagChoice>('trans');
  const [lang, setLang] = useState('Rus');
  const [customTag, setCustomTag] = useState('');
  const [ignoreChecksums, setIgnoreChecksums] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const tag =
    tagChoice === 'trans'
      ? `T+${lang.trim() || 'Rus'}`
      : tagChoice === 'hack'
        ? 'Hack'
        : tagChoice === 'fix'
          ? 'Fixed'
          : customTag.trim();
  const outName = rom ? buildPatchedFileName(rom.file.name, tag) : '';

  const crcState = useMemo(() => {
    if (!rom?.crc || !patch?.info?.sourceCrc32) return 'unknown';
    if (rom.crc === patch.info.sourceCrc32) return 'match';
    if (rom.crc === patch.info.targetCrc32) return 'patched';
    if (rom.headerless && rom.headerless === patch.info.sourceCrc32) return 'match-header';
    return 'mismatch';
  }, [rom, patch]);

  const onRom = async (files: FileList | null) => {
    const f = files?.[0];
    if (!f) return;
    setMessage(null);
    const token = ++romToken.current;
    setRom({ file: f, crc: null });
    try {
      const res = await computeRomCrc(f);
      if (token === romToken.current) setRom({ file: f, crc: res.crc, headerless: res.headerless });
    } catch (err) {
      if (token === romToken.current) setMessage({ kind: 'err', text: String(err) });
    }
  };

  const onPatch = async (files: FileList | null) => {
    const f = files?.[0];
    if (!f) return;
    setMessage(null);
    const bytes = new Uint8Array(await f.arrayBuffer());
    const info = readPatchInfo(bytes);
    setPatch({ file: f, bytes, info });
    if (!info) setMessage({ kind: 'err', text: t('patcher.err.unknown_format') });
    const g = guessTag(f.name);
    setTagChoice(g.choice);
    setLang(g.lang);
  };

  const errorText = (err: unknown) => {
    if (err instanceof PatchError) return `${t(`patcher.err.${err.code}`)} (${err.message})`;
    if (err instanceof PatchMemoryError) return t('patcher.err.tooBig');
    return String(err);
  };

  const run = async (mode: 'download' | 'folder') => {
    if (!rom || !patch) return;
    setBusy(true);
    setMessage(null);
    setProgress(0);
    let cleanup: (() => Promise<void>) | null = null;
    try {
      let dir: any = null;
      if (mode === 'folder') {
        const picker = (window as any).showDirectoryPicker;
        if (!picker) throw new Error(t('patcher.err.noFolderApi'));
        dir = await picker({ mode: 'readwrite' });
      }
      const expected = patch.info?.targetSize || rom.file.size;
      const res = await runPatchJob(rom.file, patch.bytes, { ignoreChecksums }, (written) =>
        setProgress(Math.min(99, Math.round((written / Math.max(1, expected)) * 100)))
      );
      cleanup = res.cleanup;
      if (mode === 'download') {
        const url = URL.createObjectURL(res.blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = outName;
        a.click();
        // Временный файл удаляем позже: браузер ещё сохраняет загрузку. Брошенные файлы
        // подчищает следующий запуск. / The temp file is removed later: the browser is still
        // saving the download. Leftovers are swept by the next run.
        const done = cleanup;
        cleanup = null;
        setTimeout(() => {
          URL.revokeObjectURL(url);
          void done();
        }, 120_000);
      } else {
        const hackDir = await dir.getDirectoryHandle(HACKROMS_DIR, { create: true });
        const fh = await hackDir.getFileHandle(outName, { create: true });
        const w = await fh.createWritable();
        // Потоком с диска на диск, без копии в памяти. / Stream disk to disk, no in-memory copy.
        await res.blob.stream().pipeTo(w);
        const patchDir = await dir.getDirectoryHandle(PATCH_DIR, { create: true });
        const ph = await patchDir.getFileHandle(patch.file.name, { create: true });
        const pw = await ph.createWritable();
        await pw.write(patch.bytes as Uint8Array<ArrayBuffer>);
        await pw.close();
      }
      setMessage({
        kind: 'ok',
        text:
          tf(mode === 'download' ? 'patcher.done' : 'patcher.doneFolder', {
            name: outName,
            crc: res.crc32.toUpperCase(),
            dir: dir?.name || '',
          }) + (res.strippedHeader ? ` ${t('patcher.headerStripped')}` : ''),
      });
    } catch (err) {
      if ((err as any)?.name === 'AbortError') return;
      setMessage({ kind: 'err', text: errorText(err) });
    } finally {
      if (cleanup) void cleanup();
      setBusy(false);
      setProgress(null);
    }
  };

  const btn =
    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 font-semibold cursor-pointer disabled:opacity-50';
  const canRun = Boolean(rom && patch?.info && tag) && !busy && !disabled;

  return (
    <div data-tool="patcher" className="rounded-xl border border-slate-300 dark:border-slate-700 p-3 text-xs space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Wand2 className="w-4 h-4 shrink-0" />
        <span className="font-bold text-slate-800 dark:text-slate-100">{t('patcher.title')}</span>
        <span className="text-slate-500 dark:text-slate-400">{t('patcher.formats')}</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <button type="button" className={btn} disabled={disabled || busy} onClick={() => romInput.current?.click()}>
          <FileCode2 className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">{rom ? rom.file.name : t('patcher.pickRom')}</span>
        </button>
        <button type="button" className={btn} disabled={disabled || busy} onClick={() => patchInput.current?.click()}>
          <FileCode2 className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">{patch ? patch.file.name : t('patcher.pickPatch')}</span>
        </button>
      </div>
      <input ref={romInput} type="file" className="hidden" onChange={(e) => void onRom(e.target.files)} />
      <input
        ref={patchInput}
        type="file"
        accept={PATCH_EXTENSIONS.join(',')}
        className="hidden"
        onChange={(e) => void onPatch(e.target.files)}
      />

      {(rom || patch?.info) && (
        <div className="space-y-0.5 text-slate-600 dark:text-slate-300">
          {patch?.info && (
            <div>
              {tf('patcher.patchInfo', { format: patch.info.format.toUpperCase() })}
              {patch.info.sourceCrc32 && ` · ${tf('patcher.expects', { crc: patch.info.sourceCrc32.toUpperCase() })}`}
            </div>
          )}
          {patch?.info?.metadata && (
            <div className="font-mono text-[11px] text-slate-500 dark:text-slate-400 break-all line-clamp-2">
              {patch.info.metadata}
            </div>
          )}
          {rom && (
            <div>
              {rom.crc ? tf('patcher.romCrc', { crc: rom.crc.toUpperCase() }) : t('patcher.crcCalc')}{' '}
              {crcState === 'match' && <span className="text-emerald-600 dark:text-emerald-400">{t('patcher.crc.match')}</span>}
              {crcState === 'match-header' && (
                <span className="text-emerald-600 dark:text-emerald-400">{t('patcher.crc.matchHeader')}</span>
              )}
              {crcState === 'patched' && <span className="text-amber-600 dark:text-amber-400">{t('patcher.crc.patched')}</span>}
              {crcState === 'mismatch' && <span className="text-rose-600 dark:text-rose-400">{t('patcher.crc.mismatch')}</span>}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-slate-500 dark:text-slate-400 font-semibold">{t('patcher.tag')}</span>
        <select
          value={tagChoice}
          onChange={(e) => setTagChoice(e.target.value as TagChoice)}
          className="h-7 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2 text-xs font-semibold text-slate-800 dark:text-slate-100"
        >
          <option value="trans">{t('patcher.tag.trans')}</option>
          <option value="hack">{t('patcher.tag.hack')}</option>
          <option value="fix">{t('patcher.tag.fix')}</option>
          <option value="custom">{t('patcher.tag.custom')}</option>
        </select>
        {tagChoice === 'trans' && (
          <input
            value={lang}
            onChange={(e) => setLang(e.target.value.replace(/[^A-Za-z]/g, '').slice(0, 3))}
            aria-label={t('patcher.lang')}
            className="h-7 w-16 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2 text-xs font-mono"
          />
        )}
        {tagChoice === 'custom' && (
          <input
            value={customTag}
            onChange={(e) => setCustomTag(e.target.value.slice(0, 40))}
            placeholder="T+Rus1.0_Author"
            className="h-7 w-44 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2 text-xs font-mono"
          />
        )}
        <label className="flex items-center gap-1.5 cursor-pointer text-slate-600 dark:text-slate-300">
          <input
            type="checkbox"
            className="w-3.5 h-3.5 accent-indigo-600"
            checked={ignoreChecksums}
            onChange={(e) => setIgnoreChecksums(e.target.checked)}
          />
          <span>{t('patcher.ignoreCrc')}</span>
        </label>
      </div>

      {outName && (
        <div className="text-slate-600 dark:text-slate-300">
          {t('patcher.result')} <span className="font-mono font-bold text-slate-900 dark:text-slate-100 break-all">{outName}</span>
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        <button type="button" className={btn} disabled={!canRun} onClick={() => void run('download')}>
          <Download className="w-3.5 h-3.5 shrink-0" />
          <span>{t('patcher.download')}</span>
        </button>
        <button type="button" className={btn} disabled={!canRun} onClick={() => void run('folder')}>
          <FolderInput className="w-3.5 h-3.5 shrink-0" />
          <span>{t('patcher.toFolder')}</span>
        </button>
      </div>

      {busy && progress !== null && (
        <div className="text-slate-600 dark:text-slate-300">{tf('patcher.progress', { pct: progress })}</div>
      )}

      {message && (
        <div
          className={
            message.kind === 'ok'
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-rose-600 dark:text-rose-400'
          }
        >
          {message.text}
        </div>
      )}
    </div>
  );
}
