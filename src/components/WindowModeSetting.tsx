import { useEffect, useState } from 'react';
import { useI18n } from '../i18n/translations';

// «Окно приложения» в Настройках (только Windows-версия): своё окно или Edge со следующего запуска.
// "App window" in Settings (Windows app only): native window or Edge from the next start.

interface WindowModeState {
  current: 'native' | 'edge';
  next: 'native' | 'edge';
  reason: string;
  webview2: boolean;
  forcedEdge: boolean;
}

export function WindowModeSetting() {
  const { t } = useI18n();
  const [state, setState] = useState<WindowModeState | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch('/api/native/window-mode', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (alive && d?.ok) setState(d);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  if (!state) return null;

  const choose = async (mode: 'native' | 'edge') => {
    if (busy || mode === state.next) return;
    setBusy(true);
    try {
      const r = await fetch('/api/native/window-mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      });
      const d = r.ok ? await r.json() : null;
      if (d?.ok) setState(d);
    } catch {
      // Сервер недоступен: состояние не меняем. / Server unreachable: keep the state.
    } finally {
      setBusy(false);
    }
  };

  const options: { id: 'native' | 'edge'; label: string }[] = [
    { id: 'native', label: t('settings.window.native') },
    { id: 'edge', label: t('settings.window.edge') },
  ];

  let note = '';
  if (!state.webview2) note = t('settings.window.noWebview2');
  else if (state.current === 'edge' && state.reason === 'auto') note = t('settings.window.autoFallback');
  else if (state.forcedEdge) note = t('settings.window.flag');
  if (state.next !== state.current) note = [note, t('settings.window.restart')].filter(Boolean).join(' ');

  return (
    <div>
      <span className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">{t('settings.window')}</span>
      <div className="grid grid-cols-2 gap-0.5 p-0.5 bg-slate-100 dark:bg-slate-800 rounded-lg" role="radiogroup">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={state.next === o.id}
            disabled={busy || (o.id === 'native' && !state.webview2)}
            onClick={() => choose(o.id)}
            className={`py-1.5 px-2 rounded-md text-xs font-semibold cursor-pointer transition disabled:opacity-50 disabled:cursor-not-allowed ${
              state.next === o.id
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-2xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">{note || t('settings.window.hint')}</p>
    </div>
  );
}
