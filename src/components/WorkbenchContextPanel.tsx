import React from 'react';
import { Activity, Info, MousePointerClick, Package, Gamepad2, Wrench } from 'lucide-react';
import { useI18n } from '../i18n/translations';
import type { SavedBuildRecord } from '../types/aegis';

/**
 * Right-hand column for every section except the Library.
 * The Library keeps the game inspector; other sections get context for what is on screen:
 * a description of the hovered tool, a summary of the data the section works with, and recent activity.
 */

export type ContextSection = 'tools' | 'builds' | 'env';
export type ToolsSubMode = 'library' | 'sd_folder' | 'combine';

export interface HoveredTool {
  id: string;
  label: string;
}

interface StatRow {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}

interface WorkbenchContextPanelProps {
  section: ContextSection;
  toolsMode: ToolsSubMode;
  hoveredTool: HoveredTool | null;
  // Library data
  gameCount: number;
  consoleCount: number;
  noCoverCount: number;
  multiDiscCount: number;
  libraryPath: string;
  sdFolderName: string;
  bufferFolderName: string;
  bufferItemCount: number;
  // Builds
  savedBuilds: SavedBuildRecord[];
  buildPortCount: number;
  // Environment
  assignedEmulatorCount: number;
  customExeCount: number;
  portCatalogCount: number;
  libraryPortCount: number;
  // Activity
  running: boolean;
  progressPct: number;
  statusText: string;
  logs: string[];
}

const SectionTitle: React.FC<{ icon: React.ElementType; children: React.ReactNode }> = ({
  icon: Icon,
  children,
}) => (
  <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
    <Icon className="w-3.5 h-3.5 shrink-0" />
    <span>{children}</span>
  </div>
);

const Stats: React.FC<{ rows: StatRow[] }> = ({ rows }) => (
  <dl className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
    {rows.map((r) => (
      <div key={r.label} className="flex items-baseline justify-between gap-3 py-1.5">
        <dt className="text-slate-500 dark:text-slate-400 shrink-0">{r.label}</dt>
        <dd
          className={`min-w-0 truncate text-right text-slate-900 dark:text-slate-100 ${
            r.mono ? 'font-mono text-[11px]' : 'font-semibold tabular-nums'
          }`}
          title={typeof r.value === 'string' ? r.value : undefined}
        >
          {r.value}
        </dd>
      </div>
    ))}
  </dl>
);

export const WorkbenchContextPanel: React.FC<WorkbenchContextPanelProps> = (p) => {
  const { t, locale } = useI18n();

  const sectionTitle =
    p.section === 'tools'
      ? p.toolsMode === 'library'
        ? t('tools.tab.library')
        : p.toolsMode === 'sd_folder'
        ? t('tools.tab.sdFolder')
        : t('tools.tab.combine')
      : p.section === 'builds'
      ? t('nav.builds')
      : t('nav.env');

  const overview =
    p.section === 'tools'
      ? p.toolsMode === 'library'
        ? t('ctx.tools.libraryDesc')
        : p.toolsMode === 'sd_folder'
        ? t('ctx.tools.sdDesc')
        : t('tools.comb.bufferDesc')
      : p.section === 'builds'
      ? t('ctx.builds.desc')
      : t('ctx.env.desc');

  const toolDesc = p.hoveredTool ? t(`ctx.tool.${p.hoveredTool.id}`, '') : '';

  let stats: StatRow[] = [];
  if (p.section === 'tools') {
    if (p.toolsMode === 'sd_folder') {
      stats = [
        { label: t('ctx.stat.sdFolder'), value: p.sdFolderName || '—', mono: true },
        { label: t('ctx.stat.games'), value: p.gameCount.toLocaleString(locale) },
        { label: t('ctx.stat.consoles'), value: p.consoleCount.toLocaleString(locale) },
      ];
    } else if (p.toolsMode === 'combine') {
      stats = [
        { label: t('ctx.stat.buffer'), value: p.bufferFolderName || '—', mono: true },
        { label: t('ctx.stat.bufferFiles'), value: p.bufferItemCount.toLocaleString(locale) },
        { label: t('ctx.stat.target'), value: p.libraryPath, mono: true },
      ];
    } else {
      stats = [
        { label: t('ctx.stat.path'), value: p.libraryPath, mono: true },
        { label: t('ctx.stat.games'), value: p.gameCount.toLocaleString(locale) },
        { label: t('ctx.stat.consoles'), value: p.consoleCount.toLocaleString(locale) },
        { label: t('ctx.stat.multiDisc'), value: p.multiDiscCount.toLocaleString(locale) },
        { label: t('ctx.stat.noCover'), value: p.noCoverCount.toLocaleString(locale) },
      ];
    }
  } else if (p.section === 'builds') {
    stats = [
      { label: t('ctx.stat.savedBuilds'), value: p.savedBuilds.length.toLocaleString(locale) },
      { label: t('ctx.stat.buildPorts'), value: p.buildPortCount.toLocaleString(locale) },
      { label: t('ctx.stat.games'), value: p.gameCount.toLocaleString(locale) },
    ];
  } else {
    stats = [
      { label: t('ctx.stat.assignedEmus'), value: p.assignedEmulatorCount.toLocaleString(locale) },
      { label: t('ctx.stat.customExe'), value: p.customExeCount.toLocaleString(locale) },
      { label: t('ctx.stat.portCatalog'), value: p.portCatalogCount.toLocaleString(locale) },
      { label: t('ctx.stat.libraryPorts'), value: p.libraryPortCount.toLocaleString(locale) },
    ];
  }

  const recentBuilds = p.section === 'builds' ? p.savedBuilds.slice(0, 4) : [];
  const recentLogs = p.logs.slice(-5).reverse();
  const SectionIcon = p.section === 'tools' ? Wrench : p.section === 'builds' ? Package : Gamepad2;

  return (
    <div className="flex flex-col gap-5 min-w-0">
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <SectionIcon className="w-4 h-4 text-accent shrink-0" />
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
            {sectionTitle}
          </h2>
        </div>
        <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400">{overview}</p>
      </div>

      {p.section === 'tools' && (
        <div className="space-y-2" aria-live="polite">
          <SectionTitle icon={MousePointerClick}>{t('ctx.toolHelp')}</SectionTitle>
          {p.hoveredTool && toolDesc ? (
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 p-3 space-y-1">
              <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                {p.hoveredTool.label}
              </div>
              <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">{toolDesc}</p>
            </div>
          ) : (
            <p className="text-xs text-slate-500 dark:text-slate-400">{t('ctx.toolHelpEmpty')}</p>
          )}
        </div>
      )}

      <div className="space-y-1">
        <SectionTitle icon={Info}>{t('ctx.summary')}</SectionTitle>
        <Stats rows={stats} />
      </div>

      {p.section === 'builds' && (
        <div className="space-y-1.5">
          <SectionTitle icon={Package}>{t('ctx.recentBuilds')}</SectionTitle>
          {recentBuilds.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">{t('ctx.noBuilds')}</p>
          ) : (
            <ul className="space-y-1.5">
              {recentBuilds.map((b) => (
                <li
                  key={b.id}
                  className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs"
                >
                  <div className="font-semibold text-slate-900 dark:text-slate-100 truncate">{b.name}</div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                    {b.targetProfileName} · {b.items.length.toLocaleString(locale)} {t('ctx.romsShort')}
                    {b.portMasterSlugs.length > 0 ? ` · ${b.portMasterSlugs.length} PortMaster` : ''}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="space-y-1.5">
        <SectionTitle icon={Activity}>{t('ctx.activity')}</SectionTitle>
        <div className="text-xs text-slate-700 dark:text-slate-300 flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full shrink-0 ${
              p.running ? 'bg-accent animate-pulse' : 'bg-slate-300 dark:bg-slate-600'
            }`}
          />
          <span className="truncate" title={p.statusText}>
            {p.running ? `${Math.round(p.progressPct)}% · ${p.statusText}` : t('ctx.idle')}
          </span>
        </div>
        {recentLogs.length > 0 && (
          <ol className="space-y-1 text-[11px] text-slate-500 dark:text-slate-400">
            {recentLogs.map((line, i) => (
              <li key={`${i}-${line}`} className="truncate" title={line}>
                {line}
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
};
