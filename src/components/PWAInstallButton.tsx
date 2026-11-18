import React, { useEffect, useState } from 'react';
import {
  MonitorDown,
  CheckCircle2,
  Sparkles,
  HardDriveDownload,
  FolderOpen,
  Trash2,
  RefreshCw,
  Package,
  X,
} from 'lucide-react';
import { useI18n } from '../i18n/translations';
import {
  APP_VERSION,
  DOWNLOAD_SETUP_URL,
  DOWNLOAD_ZIP_URL,
  SETUP_EXE_FILENAME,
  ZIP_PKG_FILENAME,
} from '../version';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

interface DiscoveredInstallItem {
  dir: string;
  exePath: string;
  version: string;
  source: string;
  isCurrentVersion: boolean;
  isLegacyPreBeta: boolean;
  canUpgrade: boolean;
}

interface NativeInstallerStatus {
  installedDir?: string;
  installedVersion?: string;
  currentVersion: string;
  defaultInstallDir: string;
  isInstalled: boolean;
  isUpToDate: boolean;
  canUpgrade: boolean;
  installations?: DiscoveredInstallItem[];
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsInstalled(isStandalone);

    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIOSDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(isIOSDevice);

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const install = async () => {
    if (!deferredPrompt) return false;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
      setDeferredPrompt(null);
      return true;
    }
    return false;
  };

  return {
    isInstallable: !!deferredPrompt,
    isInstalled,
    isIOS,
    install,
  };
}

interface PWAInstallButtonProps {
  isNativeDesktopHost: boolean;
  onDownloadExe: () => void;
  onAddLog: (msg: string) => void;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  isNativeDesktopHost,
  onDownloadExe,
  onAddLog,
}) => {
  const { t, tf } = useI18n();
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showInstallModal, setShowInstallModal] = useState(false);
  const [nativeInstallMsg, setNativeInstallMsg] = useState<string>('');
  const [isInstallingNative, setIsInstallingNative] = useState(false);
  const [installDir, setInstallDir] = useState<string>('C:\\Program Files\\AegisROM');
  const [installerStatus, setInstallerStatus] = useState<NativeInstallerStatus>({
    currentVersion: APP_VERSION,
    defaultInstallDir: 'C:\\Program Files\\AegisROM',
    isInstalled: false,
    isUpToDate: false,
    canUpgrade: false,
  });

  const refreshInstallerStatus = async () => {
    if (!isNativeDesktopHost) return;
    try {
      const resp = await fetch('/api/native/installer/status');
      const data = await resp.json();
      if (data && data.ok) {
        setInstallerStatus({
          installedDir: data.installedDir || '',
          installedVersion: data.installedVersion || '',
          currentVersion: data.currentVersion || APP_VERSION,
          defaultInstallDir: data.defaultInstallDir || 'C:\\Program Files\\AegisROM',
          isInstalled: Boolean(data.isInstalled),
          isUpToDate: Boolean(data.isUpToDate),
          canUpgrade: Boolean(data.canUpgrade),
          installations: Array.isArray(data.installations) ? data.installations : [],
        });
        if (data.installedDir) {
          setInstallDir(data.installedDir);
        } else if (data.defaultInstallDir) {
          setInstallDir(data.defaultInstallDir);
        }
      }
    } catch {}
  };

  useEffect(() => {
    if (showInstallModal && isNativeDesktopHost) {
      void refreshInstallerStatus();
    }
  }, [showInstallModal, isNativeDesktopHost]);

  const handleBrowseInstallDir = async () => {
    try {
      const resp = await fetch('/api/native/installer/pick-folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initialDir: installDir }),
      });
      const data = await resp.json();
      if (data?.ok && data?.path) {
        setInstallDir(data.path);
      }
    } catch {}
  };

  const handleNativeWindowsInstall = async () => {
    setIsInstallingNative(true);
    setNativeInstallMsg('');
    try {
      const resp = await fetch('/api/native/install-desktop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ installDir: installDir.trim() || 'C:\\Program Files\\AegisROM' }),
      });
      const data = await resp.json();
      if (data?.ok) {
        const target = data.installPath || installDir;
        setNativeInstallMsg(
          tf('pwa.installedSuccessMsg', { ver: installerStatus.currentVersion, path: target })
        );
        onAddLog(
          tf('pwa.installedSuccessLog', { ver: installerStatus.currentVersion, path: target })
        );
        await refreshInstallerStatus();
      } else {
        setNativeInstallMsg(data?.error || t('pwa.installFailErr'));
      }
    } catch {
      onDownloadExe();
        setNativeInstallMsg(t('pwa.downloadFallbackMsg'));
      } finally {
        setIsInstallingNative(false);
      }
    };

    const handleNativeUninstall = async () => {
      setIsInstallingNative(true);
      setNativeInstallMsg('');
      try {
        const resp = await fetch('/api/native/installer/uninstall', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ installDir: installerStatus.installedDir || installDir }),
        });
        const data = await resp.json();
        if (data?.ok) {
          setNativeInstallMsg(t('pwa.uninstalledFullMsg'));
          onAddLog(t('pwa.uninstalledFullLog'));
          await refreshInstallerStatus();
        } else {
          setNativeInstallMsg(data?.error || t('pwa.uninstallFailErr'));
        }
      } catch (err) {
        setNativeInstallMsg(tf('pwa.uninstallErrLog', { err: String(err) }));
      } finally {
        setIsInstallingNative(false);
      }
    };

    return (
      <>
        <button
          onClick={async () => {
            if (isInstallable) {
              const ok = await install();
              if (ok) {
                onAddLog(t('pwa.pwaInstalledLog'));
                return;
              }
            }
            setShowInstallModal(true);
          }}
          title={t('pwa.installWinTip')}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow-xs transition cursor-pointer"
        >
          <MonitorDown className="w-4 h-4" />
          <span>
            {isNativeDesktopHost
              ? t('pwa.installBtnNative')
              : isInstalled
              ? t('pwa.installBtnInstalled')
              : t('pwa.installBtnWeb')}
          </span>
        </button>

      {showInstallModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-5 text-slate-900 dark:text-slate-100 max-h-[92vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
              <div>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-blue-100 dark:bg-blue-950 text-blue-900 dark:text-blue-300 text-xs font-extrabold uppercase">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{t('pwa.nativeBadge')} (v{installerStatus.currentVersion}) • Win10 / Win11 x64</span>
                </div>
                <h3 className="text-lg font-extrabold mt-1">
                  {t('pwa.modalTitle')}
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                  {t('pwa.modalSubtitle')}
                </p>
              </div>
              <button
                onClick={() => setShowInstallModal(false)}
                title={t('pwa.close')}
                className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {isNativeDesktopHost && (
              <div
                className={`p-3.5 rounded-xl border text-xs space-y-2 ${
                  installerStatus.isUpToDate
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-700 text-emerald-950 dark:text-emerald-200'
                    : installerStatus.canUpgrade
                    ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700 text-amber-950 dark:text-amber-200'
                    : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2 font-extrabold">
                  <span>
                    {installerStatus.isUpToDate
                      ? tf('pwa.existingLatestNote', { ver: installerStatus.installedVersion || installerStatus.currentVersion })
                      : installerStatus.canUpgrade
                      ? tf('pwa.existingOldNote', { ver: installerStatus.installedVersion || '' })
                      : t('pwa.noExistingDetected')}
                  </span>
                  {installerStatus.isInstalled && installerStatus.installedDir && (
                    <span className="font-mono text-[11px] opacity-80">
                      {installerStatus.installedDir}
                    </span>
                  )}
                </div>

                {Array.isArray(installerStatus.installations) && installerStatus.installations.length > 0 && (
                  <div className="pt-1 space-y-1">
                    <div className="font-bold text-[11px] opacity-80">
                      {t('pwa.existingDetectedTitle')}:
                    </div>
                    <div className="max-h-24 overflow-y-auto rounded-lg bg-white/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700 p-2 font-mono text-[11px] space-y-0.5">
                      {installerStatus.installations.map((inst, idx) => (
                        <div key={`${inst.dir}-${idx}`} className="flex items-center justify-between gap-2">
                          <span className="truncate">{inst.dir}</span>
                          <span className="shrink-0 font-bold">
                            v{inst.version} ({inst.source})
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-1.5 pt-1">
                  <label className="block font-bold text-slate-700 dark:text-slate-300">
                    {t('pwa.customDirLabel')}
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={installDir}
                      onChange={(e) => setInstallDir(e.target.value)}
                      className="flex-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 font-mono text-xs"
                    />
                    <button
                      type="button"
                      onClick={handleBrowseInstallDir}
                      className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 font-bold text-xs flex items-center gap-1.5 cursor-pointer shrink-0"
                    >
                      <FolderOpen className="w-3.5 h-3.5 text-blue-600" />
                      <span>...</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Option 1: Standalone Pure-Win32 GUI Installer (.EXE) */}
              <div className="p-4 rounded-2xl border-2 border-blue-500 bg-blue-50/40 dark:bg-blue-950/30 flex flex-col justify-between space-y-4">
                <div className="space-y-2">
                  <div className="text-xs font-extrabold uppercase text-blue-700 dark:text-blue-400">
                    {t('pwa.option1Label')}
                  </div>
                  <div className="text-sm font-extrabold">
                    {t('pwa.option1Title')}
                  </div>
                  <ul className="text-xs text-slate-700 dark:text-slate-300 space-y-1.5 list-none pl-0">
                    <li>{t('pwa.installStepBrowse')}</li>
                    <li>{t('pwa.installStepAutoUpdate')}</li>
                    <li>{t('pwa.installStepShortcut')}</li>
                  </ul>
                </div>

                <div className="space-y-2">
                  {isNativeDesktopHost ? (
                    <div className="space-y-2">
                      <button
                        onClick={handleNativeWindowsInstall}
                        disabled={isInstallingNative}
                        className="w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs shadow-sm flex items-center justify-center gap-2 cursor-pointer"
                      >
                        {installerStatus.canUpgrade ? (
                          <RefreshCw className="w-4 h-4" />
                        ) : (
                          <HardDriveDownload className="w-4 h-4" />
                        )}
                        <span>
                          {isInstallingNative
                            ? t('pwa.checkingVersion')
                            : installerStatus.canUpgrade
                            ? tf('pwa.upgradeToDirBtn', { ver: installerStatus.currentVersion, dir: installDir })
                            : installerStatus.isUpToDate
                            ? t('pwa.reinstallCleanBtn')
                            : tf('pwa.installToDirBtn', { dir: installDir })}
                        </span>
                      </button>

                      {installerStatus.isInstalled && (
                        <button
                          onClick={handleNativeUninstall}
                          disabled={isInstallingNative}
                          className="w-full py-2 px-4 rounded-xl bg-rose-50 dark:bg-rose-950/50 hover:bg-rose-100 border border-rose-300 dark:border-rose-700 text-rose-800 dark:text-rose-200 font-bold text-xs flex items-center justify-center gap-2 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>{isInstallingNative ? t('pwa.uninstallingBtn') : t('pwa.uninstallBtn')}</span>
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <a
                        href={DOWNLOAD_SETUP_URL}
                        download={SETUP_EXE_FILENAME}
                        onClick={() => {
                          onAddLog(t('app.download.setupDoneLog'));
                          setNativeInstallMsg(t('app.download.setupDoneStatus'));
                        }}
                        className="w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs shadow-sm flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <HardDriveDownload className="w-4 h-4" />
                        <span>{t('pwa.winBtn')}</span>
                      </a>
                      <a
                        href={DOWNLOAD_ZIP_URL}
                        download={ZIP_PKG_FILENAME}
                        onClick={() => {
                          onAddLog(t('app.download.zipDoneLog'));
                        }}
                        className="w-full py-2 px-4 rounded-xl bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300 font-bold text-xs flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <Package className="w-3.5 h-3.5" />
                        <span>{t('pwa.downloadSetupZipBtn')}</span>
                      </a>
                    </div>
                  )}
                </div>
              </div>

              {/* Option 2: Instant Browser PWA Installation */}
              <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex flex-col justify-between space-y-4">
                <div className="space-y-2">
                  <div className="text-xs font-extrabold uppercase text-emerald-700 dark:text-emerald-400">
                    {t('pwa.option2Label')}
                  </div>
                  <div className="text-sm font-extrabold">
                    {t('pwa.option2Title')}
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    {t('pwa.webPwaDesc')}
                  </p>
                  {isIOS ? (
                    <div className="text-xs bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-700 space-y-1">
                      <div>{t('pwa.iosNote')}</div>
                    </div>
                  ) : (
                    <ul className="text-xs text-slate-700 dark:text-slate-300 space-y-1.5 list-disc pl-4">
                      <li>{t('pwa.pwaFeatureWindow')}</li>
                      <li>{t('pwa.pwaFeaturePerms')}</li>
                    </ul>
                  )}
                </div>

                <div>
                  {isInstallable ? (
                    <button
                      onClick={async () => {
                        const ok = await install();
                        if (ok) setShowInstallModal(false);
                      }}
                      className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow-sm flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <MonitorDown className="w-4 h-4" />
                      <span>{t('pwa.pwaOneClickBtn')}</span>
                    </button>
                  ) : (
                    <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-[11px] font-semibold text-emerald-900 dark:text-emerald-300 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                      <span>
                        {isInstalled
                          ? t('pwa.alreadyStandaloneNote')
                          : t('pwa.pwaManifestNote')}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {nativeInstallMsg && (
              <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 text-xs font-bold text-emerald-900 dark:text-emerald-200">
                {nativeInstallMsg}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};
