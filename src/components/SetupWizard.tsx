import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleAlert,
  Copy,
  FolderOpen,
  Loader2,
  MoveRight,
  Server,
  Monitor,
  Square,
  Wand2,
  X,
  Circle,
  MinusCircle,
} from 'lucide-react';
import { SUPPORTED_LANGUAGES, useI18n } from '../i18n/translations';
import { FILENAME_CONSTRUCTOR_PRESETS } from '../utils/filenameConstructor';

/**
 * Режим «клиент + сервер» скрыт, пока серверная часть не реализована.
 * Когда сервер появится в релизе, поставить true: шаг «Тип установки» вернётся в мастер.
 * Client + server mode stays hidden until the server ships. Set to true to bring back
 * the "Installation type" step.
 */
export const SERVER_MODE_AVAILABLE = false;

export const SETUP_DONE_STORAGE_KEY = 'aegisrom_setup_v1';
export const INSTALL_MODE_STORAGE_KEY = 'aegisrom_install_mode';

export type SetupFolderKind = 'library' | 'storage' | 'own';
export type InstallMode = 'client' | 'client_server';

export interface SetupWizardResult {
  installMode: InstallMode;
  ownMode: 'copy' | 'move';
  renamePresetId: string | null;
}

export interface SetupPickResult {
  ok: boolean;
  error?: string;
}

type StepId = 'lang' | 'install' | 'library' | 'storage' | 'own' | 'rename' | 'summary';

interface SetupWizardProps {
  open: boolean;
  fsSupported: boolean;
  folders: Record<SetupFolderKind, string | null>;
  ownSameAsStorage: boolean;
  onPickFolder: (kind: SetupFolderKind) => Promise<SetupPickResult>;
  onClearFolder: (kind: SetupFolderKind) => void;
  onLater: () => void;
  onStart: (result: SetupWizardResult) => void;
}

export const SetupWizard: React.FC<SetupWizardProps> = ({
  open,
  fsSupported,
  folders,
  ownSameAsStorage,
  onPickFolder,
  onClearFolder,
  onLater,
  onStart,
}) => {
  const { t, tf, lang, setLang } = useI18n();
  const steps: StepId[] = useMemo(
    () =>
      fsSupported
        ? [
            'lang',
            ...(SERVER_MODE_AVAILABLE ? (['install'] as StepId[]) : []),
            'library',
            'storage',
            'own',
            'rename',
            'summary',
          ]
        : ['lang'],
    [fsSupported]
  );
  const [stepIdx, setStepIdx] = useState(0);
  const [installMode, setInstallMode] = useState<InstallMode>('client');
  const [ownMode, setOwnMode] = useState<'copy' | 'move'>('copy');
  const [renamePresetId, setRenamePresetId] = useState<string | null>(null);
  const [pickError, setPickError] = useState<string>('');
  const [picking, setPicking] = useState(false);

  if (!open) return null;

  const step = steps[Math.min(stepIdx, steps.length - 1)];
  const isLast = stepIdx >= steps.length - 1;

  const canNext =
    step === 'library'
      ? Boolean(folders.library)
      : step === 'storage'
      ? Boolean(folders.storage)
      : step === 'own'
      ? !folders.own || !ownSameAsStorage
      : true;

  const goNext = () => {
    setPickError('');
    if (isLast) {
      if (!fsSupported) onLater();
      else onStart({ installMode, ownMode, renamePresetId });
      return;
    }
    setStepIdx((i) => i + 1);
  };

  const goBack = () => {
    setPickError('');
    setStepIdx((i) => Math.max(0, i - 1));
  };

  const skip = () => {
    if (step === 'own') onClearFolder('own');
    if (step === 'rename') setRenamePresetId(null);
    goNext();
  };

  const pick = async (kind: SetupFolderKind) => {
    setPickError('');
    setPicking(true);
    try {
      const res = await onPickFolder(kind);
      if (!res.ok && res.error) setPickError(tf('setup.pickError', { err: res.error }));
    } finally {
      setPicking(false);
    }
  };

  const folderPicker = (kind: SetupFolderKind) => {
    const name = folders[kind];
    return (
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => pick(kind)}
          disabled={picking}
          className={`h-9 px-3 rounded-lg text-sm font-semibold flex items-center gap-2 cursor-pointer transition disabled:opacity-50 ${
            name
              ? 'border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200'
              : 'bg-accent hover:bg-accent-hover text-white'
          }`}
        >
          <FolderOpen className="w-4 h-4" />
          {name ? t('setup.change') : t('setup.choose')}
        </button>
        {name && (
          <span className="min-w-0 max-w-full truncate text-sm font-mono text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 rounded-md px-2 py-1">
            {tf('setup.selected', { name })}
          </span>
        )}
      </div>
    );
  };

  const optionCard = (
    active: boolean,
    onClick: () => void,
    icon: React.ReactNode,
    title: string,
    desc: string
  ) => (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`text-left w-full rounded-xl border p-3 flex gap-3 cursor-pointer transition ${
        active
          ? 'border-accent bg-accent-soft dark:bg-accent-soft-dark'
          : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
      }`}
    >
      <span className="shrink-0 mt-0.5 text-accent dark:text-accent-dark">{icon}</span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</span>
        <span className="block text-xs text-slate-600 dark:text-slate-400 mt-0.5">{desc}</span>
      </span>
    </button>
  );

  const renameLabel = renamePresetId
    ? t(
        `ctor.preset.${renamePresetId}`,
        FILENAME_CONSTRUCTOR_PRESETS.find((p) => p.id === renamePresetId)?.label
      )
    : t('setup.summary.default');

  let body: React.ReactNode = null;
  let title = '';
  let desc = '';
  switch (step) {
    case 'lang':
      title = t('setup.lang.title');
      desc = t('setup.lang.desc');
      body = (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {SUPPORTED_LANGUAGES.map((l) => (
            <button
              key={l.code}
              type="button"
              onClick={() => setLang(l.code)}
              aria-pressed={lang === l.code}
              className={`h-10 px-3 rounded-lg border text-sm font-semibold flex items-center justify-between gap-2 cursor-pointer transition ${
                lang === l.code
                  ? 'border-accent bg-accent-soft dark:bg-accent-soft-dark text-slate-900 dark:text-slate-100'
                  : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200'
              }`}
            >
              <span className="truncate">{l.nativeLabel}</span>
              {lang === l.code && <Check className="w-4 h-4 shrink-0 text-accent dark:text-accent-dark" />}
            </button>
          ))}
          {!fsSupported && (
            <p className="col-span-full mt-2 text-xs text-amber-700 dark:text-amber-400 flex gap-2">
              <CircleAlert className="w-4 h-4 shrink-0" />
              {t('setup.noFsApi')}
            </p>
          )}
        </div>
      );
      break;
    case 'install':
      title = t('setup.install.title');
      desc = t('setup.install.desc');
      body = (
        <div className="space-y-2">
          {optionCard(
            installMode === 'client',
            () => setInstallMode('client'),
            <Monitor className="w-5 h-5" />,
            t('setup.install.client'),
            t('setup.install.clientDesc')
          )}
          {SERVER_MODE_AVAILABLE &&
            optionCard(
              installMode === 'client_server',
              () => setInstallMode('client_server'),
              <Server className="w-5 h-5" />,
              t('setup.install.server'),
              t('setup.install.serverDesc')
            )}
        </div>
      );
      break;
    case 'library':
      title = t('setup.library.title');
      desc = t('setup.library.desc');
      body = folderPicker('library');
      break;
    case 'storage':
      title = t('setup.storage.title');
      desc = t('setup.storage.desc');
      body = folderPicker('storage');
      break;
    case 'own':
      title = t('setup.own.title');
      desc = t('setup.own.desc');
      body = (
        <div className="space-y-3">
          <p className="text-xs text-slate-500 dark:text-slate-400">{t('setup.own.optional')}</p>
          {folderPicker('own')}
          {folders.own && ownSameAsStorage && (
            <p className="text-xs text-amber-700 dark:text-amber-400 flex gap-2">
              <CircleAlert className="w-4 h-4 shrink-0" />
              {t('setup.own.sameAsStorage')}
            </p>
          )}
          {folders.own && !ownSameAsStorage && (
            <div className="grid sm:grid-cols-2 gap-2">
              {optionCard(
                ownMode === 'copy',
                () => setOwnMode('copy'),
                <Copy className="w-5 h-5" />,
                t('setup.own.copy'),
                t('setup.own.copyDesc')
              )}
              {optionCard(
                ownMode === 'move',
                () => setOwnMode('move'),
                <MoveRight className="w-5 h-5" />,
                t('setup.own.move'),
                t('setup.own.moveDesc')
              )}
            </div>
          )}
        </div>
      );
      break;
    case 'rename':
      title = t('setup.rename.title');
      desc = t('setup.rename.desc');
      body = (
        <div className="space-y-2">
          <p className="text-xs text-slate-500 dark:text-slate-400">{t('setup.rename.optional')}</p>
          {FILENAME_CONSTRUCTOR_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setRenamePresetId(p.id)}
              aria-pressed={renamePresetId === p.id}
              className={`w-full text-left rounded-lg border px-3 py-2 cursor-pointer transition ${
                renamePresetId === p.id
                  ? 'border-accent bg-accent-soft dark:bg-accent-soft-dark'
                  : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              <span className="block text-sm font-semibold text-slate-900 dark:text-slate-100">
                {t(`ctor.preset.${p.id}`, p.label)}
              </span>
              <span className="block text-xs font-mono text-slate-500 dark:text-slate-400 truncate">
                {t(`ctor.presetHint.${p.id}`, p.hint)}
              </span>
            </button>
          ))}
        </div>
      );
      break;
    case 'summary': {
      title = t('setup.summary.title');
      desc = t('setup.summary.desc');
      const langLabel = SUPPORTED_LANGUAGES.find((l) => l.code === lang)?.nativeLabel || lang;
      const rows: Array<[string, string]> = [
        [t('setup.summary.lang'), langLabel],
        ...(SERVER_MODE_AVAILABLE
          ? ([
              [
                t('setup.summary.install'),
                installMode === 'client' ? t('setup.install.client') : t('setup.install.server'),
              ],
            ] as Array<[string, string]>)
          : []),
        [t('setup.summary.library'), folders.library || '—'],
        [t('setup.summary.storage'), folders.storage || '—'],
        [
          t('setup.summary.own'),
          folders.own
            ? `${folders.own} · ${ownMode === 'copy' ? t('setup.own.copy') : t('setup.own.move')}`
            : t('setup.summary.skipped'),
        ],
        [t('setup.summary.rename'), renameLabel],
      ];
      body = (
        <dl className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl">
          {rows.map(([k, v]) => (
            <div key={k} className="flex flex-wrap justify-between gap-x-4 gap-y-0.5 px-3 py-2 text-sm">
              <dt className="text-slate-500 dark:text-slate-400">{k}</dt>
              <dd className="font-semibold text-slate-900 dark:text-slate-100 min-w-0 truncate">{v}</dd>
            </div>
          ))}
        </dl>
      );
      break;
    }
  }

  const optional = step === 'own' || step === 'rename';

  return (
    <div
      className="fixed inset-0 z-[60] bg-slate-900/50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="aegis-setup-title"
    >
      <div className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-xl max-h-[calc(100vh-2rem)] flex flex-col select-text">
        <div className="px-5 pt-4 pb-3 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-semibold text-accent dark:text-accent-dark">
              <Wand2 className="w-4 h-4" />
              {t('setup.title')}
              {steps.length > 1 && (
                <span className="text-slate-500 dark:text-slate-400 font-normal">
                  · {tf('setup.stepOf', { n: stepIdx + 1, total: steps.length })}
                </span>
              )}
            </div>
            <h2 id="aegis-setup-title" className="text-lg font-semibold mt-1">
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onLater}
            title={t('setup.later')}
            aria-label={t('setup.later')}
            className="w-8 h-8 shrink-0 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 flex items-center justify-center cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {steps.length > 1 && (
          <div className="px-5 pt-3 flex gap-1" aria-hidden="true">
            {steps.map((s, i) => (
              <span
                key={s}
                className={`h-1 flex-1 rounded-full ${
                  i <= stepIdx ? 'bg-accent' : 'bg-slate-200 dark:bg-slate-700'
                }`}
              />
            ))}
          </div>
        )}

        <div className="px-5 py-4 space-y-4 overflow-y-auto">
          <p className="text-sm text-slate-600 dark:text-slate-300">{desc}</p>
          {body}
          {pickError && (
            <p className="text-xs text-rose-600 dark:text-rose-400 flex gap-2">
              <CircleAlert className="w-4 h-4 shrink-0" />
              {pickError}
            </p>
          )}
          {!canNext && (step === 'library' || step === 'storage') && (
            <p className="text-xs text-slate-500 dark:text-slate-400">{t('setup.required')}</p>
          )}
        </div>

        <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={onLater}
            className="h-9 px-3 rounded-lg text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            {t('setup.later')}
          </button>
          <div className="flex items-center gap-2 ml-auto">
            {stepIdx > 0 && (
              <button
                type="button"
                onClick={goBack}
                className="h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1.5 cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                {t('setup.back')}
              </button>
            )}
            {optional && (
              <button
                type="button"
                onClick={skip}
                className="h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                {t('setup.skip')}
              </button>
            )}
            <button
              type="button"
              onClick={goNext}
              disabled={!canNext}
              className="h-9 px-4 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isLast ? (fsSupported ? t('setup.start') : t('tour.finish')) : t('setup.next')}
              {!isLast && <ArrowRight className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// Фоновый прогресс + тур по приложению / background progress + app tour
// ============================================================================

export type SetupStageId = 'library' | 'scanStorage' | 'scanOwn' | 'transfer' | 'save';
export type SetupStageStatus = 'pending' | 'running' | 'done' | 'skipped' | 'error';

export interface SetupStage {
  id: SetupStageId;
  status: SetupStageStatus;
  detail?: string;
}

export interface SetupRunState {
  stages: SetupStage[];
  transferMode: 'copy' | 'move';
  finished: boolean;
  stopped: boolean;
  gamesCount?: number;
}

export type TourTarget = {
  tab: 'library' | 'tools' | 'builds' | 'env';
  toolsMode?: 'library' | 'sd_folder' | 'combine';
};

interface TourStep {
  id: string;
  target?: TourTarget;
}

/** Шаги тура. Новые разделы (BIOS, хаки) добавляются сюда. / Tour steps; add new sections here. */
export const TOUR_STEPS: TourStep[] = [
  { id: 'library', target: { tab: 'library' } },
  { id: 'inspector', target: { tab: 'library' } },
  { id: 'tools', target: { tab: 'tools', toolsMode: 'library' } },
  { id: 'sd', target: { tab: 'tools', toolsMode: 'sd_folder' } },
  { id: 'combine', target: { tab: 'tools', toolsMode: 'combine' } },
  { id: 'builds', target: { tab: 'builds' } },
  { id: 'env', target: { tab: 'env' } },
  { id: 'restart' },
];

interface SetupRunPanelProps {
  run: SetupRunState | null;
  tourOpen: boolean;
  onCloseTour: () => void;
  onDismissRun: () => void;
  onStop: () => void;
  onNavigate: (target: TourTarget) => void;
}

const stageIcon = (status: SetupStageStatus) => {
  switch (status) {
    case 'running':
      return <Loader2 className="w-4 h-4 animate-spin text-accent dark:text-accent-dark" />;
    case 'done':
      return <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />;
    case 'error':
      return <CircleAlert className="w-4 h-4 text-rose-600 dark:text-rose-400" />;
    case 'skipped':
      return <MinusCircle className="w-4 h-4 text-slate-400" />;
    default:
      return <Circle className="w-4 h-4 text-slate-300 dark:text-slate-600" />;
  }
};

export const SetupRunPanel: React.FC<SetupRunPanelProps> = ({
  run,
  tourOpen,
  onCloseTour,
  onDismissRun,
  onStop,
  onNavigate,
}) => {
  const { t, tf } = useI18n();
  const [tourIdx, setTourIdx] = useState(0);

  if (!run && !tourOpen) return null;

  const stageLabel = (s: SetupStage) => {
    if (s.id === 'transfer') {
      return run?.transferMode === 'move'
        ? t('setup.stage.transferMove')
        : t('setup.stage.transferCopy');
    }
    return t(`setup.stage.${s.id}`);
  };

  const stageDetail = (s: SetupStage) => {
    if (s.status === 'skipped') return t('setup.stage.skipped');
    if (s.status === 'error') return tf('setup.stage.error', { err: s.detail || '?' });
    return s.detail || '';
  };

  const runTitle = !run
    ? ''
    : run.stopped
    ? t('setup.run.stopped')
    : run.finished
    ? t('setup.run.done')
    : t('setup.run.title');

  const step = TOUR_STEPS[Math.min(tourIdx, TOUR_STEPS.length - 1)];
  const lastTour = tourIdx >= TOUR_STEPS.length - 1;

  return (
    <div
      className="fixed z-50 bottom-12 right-4 w-[min(380px,calc(100vw-2rem))] max-h-[calc(100vh-7rem)] overflow-y-auto bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl select-text"
      role="region"
      aria-label={tourOpen ? t('tour.title') : runTitle}
    >
      {run && (
        <div className={`p-4 ${tourOpen ? 'border-b border-slate-200 dark:border-slate-800' : ''}`}>
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-semibold flex items-center gap-2 min-w-0">
              {!run.finished && !run.stopped ? (
                <Loader2 className="w-4 h-4 animate-spin shrink-0 text-accent dark:text-accent-dark" />
              ) : run.stopped ? (
                <Square className="w-4 h-4 shrink-0 text-slate-500" />
              ) : (
                <Check className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              )}
              <span className="truncate">{runTitle}</span>
            </div>
            {!run.finished && !run.stopped ? (
              <button
                type="button"
                onClick={onStop}
                className="h-7 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
              >
                {t('setup.run.stop')}
              </button>
            ) : (
              <button
                type="button"
                onClick={onDismissRun}
                className="h-7 px-2.5 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                {t('setup.run.hide')}
              </button>
            )}
          </div>
          <ol className="mt-3 space-y-1.5">
            {run.stages.map((s) => (
              <li key={s.id} className="flex items-start gap-2 text-xs">
                <span className="mt-px shrink-0">{stageIcon(s.status)}</span>
                <span
                  className={`min-w-0 flex-1 ${
                    s.status === 'pending' || s.status === 'skipped'
                      ? 'text-slate-500 dark:text-slate-400'
                      : 'text-slate-800 dark:text-slate-100'
                  }`}
                >
                  {stageLabel(s)}
                  {stageDetail(s) && (
                    <span className="text-slate-500 dark:text-slate-400"> · {stageDetail(s)}</span>
                  )}
                </span>
              </li>
            ))}
          </ol>
          {run.finished && !tourOpen && (
            <button
              type="button"
              onClick={() => {
                onNavigate({ tab: 'library' });
                onDismissRun();
              }}
              className="mt-3 h-8 px-3 rounded-lg bg-accent hover:bg-accent-hover text-white text-xs font-semibold cursor-pointer"
            >
              {t('setup.run.openLibrary')}
            </button>
          )}
        </div>
      )}

      {tourOpen && (
        <div className="p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs font-semibold text-accent dark:text-accent-dark">
              {t('tour.title')} ·{' '}
              <span className="text-slate-500 dark:text-slate-400 font-normal">
                {tf('tour.stepOf', { n: tourIdx + 1, total: TOUR_STEPS.length })}
              </span>
            </div>
            <button
              type="button"
              onClick={onCloseTour}
              title={t('tour.close')}
              aria-label={t('tour.close')}
              className="w-7 h-7 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 flex items-center justify-center cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <h3 className="text-sm font-semibold mt-2">{t(`tour.${step.id}.title`)}</h3>
          <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
            {t(`tour.${step.id}.body`)}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {step.target && (
              <button
                type="button"
                onClick={() => onNavigate(step.target!)}
                className="h-8 px-3 rounded-lg border border-accent text-accent dark:text-accent-dark dark:border-accent-dark text-xs font-semibold hover:bg-accent-soft dark:hover:bg-accent-soft-dark cursor-pointer"
              >
                {t('tour.go')}
              </button>
            )}
            <div className="ml-auto flex items-center gap-2">
              {tourIdx > 0 && (
                <button
                  type="button"
                  onClick={() => setTourIdx((i) => Math.max(0, i - 1))}
                  className="h-8 px-3 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  {t('tour.prev')}
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  if (lastTour) onCloseTour();
                  else setTourIdx((i) => i + 1);
                }}
                className="h-8 px-3 rounded-lg bg-accent hover:bg-accent-hover text-white text-xs font-semibold cursor-pointer"
              >
                {lastTour ? t('tour.finish') : t('tour.next')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
