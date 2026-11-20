import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check, Coffee, Copy, X } from 'lucide-react';
import qrcode from 'qrcode-generator';
import { useI18n } from '../i18n/translations';
import {
  DONATE_NETWORKS,
  DONATE_PRESET_AMOUNTS,
  DONATE_TOKEN,
  parseDonateAmount,
  type DonateNetworkId,
} from '../data/donate';

// Окно «Угостить разработчика кофе»: сумма, сеть, адрес USDT с копированием и QR-кодом.
// QR строится локально (qrcode-generator), без внешних сервисов. В QR только адрес: форматы
// ссылок с суммой у кошельков разные, а неверная ссылка хуже, чем ручной ввод суммы.
// "Buy the developer a coffee" window: amount, network, USDT address with copy and a QR code.
// The QR is built locally (qrcode-generator), no external services. The QR holds only the
// address: wallets disagree on payment-link formats, and a wrong link is worse than typing the amount.

interface DonateModalProps {
  open: boolean;
  onClose: () => void;
}

// Квадраты QR одним SVG-путём; белый фон и поля, чтобы код читался и в тёмной теме.
// QR modules as one SVG path; white background and quiet zone so it scans in dark theme too.
const QrCode: React.FC<{ text: string; size?: number }> = ({ text, size = 176 }) => {
  const { d, n } = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(text, 'Byte');
    qr.make();
    const count = qr.getModuleCount();
    let path = '';
    for (let r = 0; r < count; r++) {
      for (let c = 0; c < count; c++) {
        if (qr.isDark(r, c)) path += `M${c + 4} ${r + 4}h1v1h-1z`;
      }
    }
    return { d: path, n: count + 8 };
  }, [text]);
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${n} ${n}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label={text}
      className="rounded-lg bg-white"
    >
      <rect width={n} height={n} fill="#fff" />
      <path d={d} fill="#000" />
    </svg>
  );
};

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {}
  // Запасной путь для окон, где Clipboard API недоступен. / Fallback where the Clipboard API is unavailable.
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export const DonateModal: React.FC<DonateModalProps> = ({ open, onClose }) => {
  const { t, tf } = useI18n();
  const [preset, setPreset] = useState<number | 'custom'>(DONATE_PRESET_AMOUNTS[1]);
  const [customRaw, setCustomRaw] = useState('');
  const [networkId, setNetworkId] = useState<DonateNetworkId>(DONATE_NETWORKS[0].id);
  const [copied, setCopied] = useState<'address' | 'amount' | null>(null);
  const [copyFailed, setCopyFailed] = useState(false);
  const customRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(null), 1800);
    return () => window.clearTimeout(id);
  }, [copied]);

  if (!open) return null;

  const network = DONATE_NETWORKS.find((n) => n.id === networkId) || DONATE_NETWORKS[0];
  const amount = preset === 'custom' ? parseDonateAmount(customRaw) : String(preset);
  const customInvalid = preset === 'custom' && customRaw.trim() !== '' && amount === null;
  const isEvm = network.standard === 'ERC-20';

  const doCopy = async (what: 'address' | 'amount', text: string) => {
    const ok = await copyText(text);
    setCopyFailed(!ok);
    setCopied(ok ? what : null);
  };

  const chip = (active: boolean) =>
    `h-9 px-3 rounded-lg border text-sm font-semibold transition cursor-pointer ${
      active
        ? 'bg-amber-500 border-amber-500 text-white'
        : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
    }`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('donate.title')}
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto flex flex-col shadow-2xl"
      >
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between gap-3">
          <div className="flex items-start gap-2 min-w-0">
            <Coffee className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">{t('donate.title')}</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{t('donate.intro')}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('donate.close')}
            title={t('donate.close')}
            className="w-8 h-8 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 flex items-center justify-center cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">
              {t('donate.amount')}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {DONATE_PRESET_AMOUNTS.map((a) => (
                <button key={a} type="button" className={chip(preset === a)} onClick={() => setPreset(a)}>
                  {a} {DONATE_TOKEN}
                </button>
              ))}
              <button
                type="button"
                className={chip(preset === 'custom')}
                onClick={() => {
                  setPreset('custom');
                  window.setTimeout(() => customRef.current?.focus(), 0);
                }}
              >
                {t('donate.custom')}
              </button>
              {preset === 'custom' && (
                <input
                  ref={customRef}
                  type="text"
                  inputMode="decimal"
                  value={customRaw}
                  onChange={(e) => setCustomRaw(e.target.value)}
                  placeholder={t('donate.customPlaceholder')}
                  aria-invalid={customInvalid}
                  className={`h-9 w-32 px-3 rounded-lg border bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-amber-400 ${
                    customInvalid ? 'border-rose-400' : 'border-slate-200 dark:border-slate-700'
                  }`}
                />
              )}
            </div>
            {customInvalid && <p className="text-xs text-rose-600 dark:text-rose-400 mt-1.5">{t('donate.customInvalid')}</p>}
          </div>

          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">
              {t('donate.network')}
            </div>
            <div className="flex flex-wrap gap-2">
              {DONATE_NETWORKS.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  className={chip(n.id === network.id)}
                  onClick={() => {
                    setNetworkId(n.id);
                    setCopied(null);
                  }}
                >
                  {n.label}
                  <span className="ml-1 text-[11px] font-normal opacity-75">{n.standard}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-start gap-2 rounded-lg border border-amber-300 dark:border-amber-700/70 bg-amber-50 dark:bg-amber-950/40 px-3 py-2.5 text-xs text-amber-900 dark:text-amber-200">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="flex flex-col gap-1">
              <span className="font-semibold">
                {tf('donate.warn', { network: network.label, standard: network.standard })}
              </span>
              {isEvm && <span>{tf('donate.evmShared', { network: network.label })}</span>}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 items-center sm:items-start">
            <QrCode text={network.address} />
            <div className="flex-1 min-w-0 w-full flex flex-col gap-2">
              <div className="text-sm font-bold text-slate-900 dark:text-slate-100">
                {amount
                  ? tf('donate.send', { amount, network: network.label })
                  : tf('donate.send', { amount: '…', network: network.label })}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {tf('donate.address', { network: network.label })}
              </div>
              <code
                data-testid="donate-address"
                className="block select-all break-all rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 font-mono text-[13px] leading-5 text-slate-900 dark:text-slate-100"
              >
                {network.address}
              </code>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => doCopy('address', network.address)}
                  className="h-9 px-3 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold flex items-center gap-1.5 cursor-pointer transition"
                >
                  {copied === 'address' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  {copied === 'address' ? t('donate.copied') : t('donate.copy')}
                </button>
                {amount && (
                  <button
                    type="button"
                    onClick={() => doCopy('amount', amount)}
                    className="h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm font-semibold flex items-center gap-1.5 cursor-pointer transition"
                  >
                    {copied === 'amount' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    {copied === 'amount' ? t('donate.copied') : t('donate.copyAmount')}
                  </button>
                )}
              </div>
              {copyFailed && <p className="text-xs text-rose-600 dark:text-rose-400">{t('donate.copyFailed')}</p>}
              <p className="text-xs text-slate-500 dark:text-slate-400">{t('donate.qrHint')}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
