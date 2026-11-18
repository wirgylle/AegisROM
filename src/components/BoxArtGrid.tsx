import React, { useState } from 'react';
import { RomItem } from '../types';
import { CheckCircle2, AlertTriangle, Copy, Trash2, Search, Play } from 'lucide-react';

interface BoxArtGridProps {
  roms: RomItem[];
  onSelectRom: (rom: RomItem) => void;
}

export const BoxArtGrid: React.FC<BoxArtGridProps> = ({ roms, onSelectRom }) => {
  const [search, setSearch] = useState('');

  const filtered = roms.filter((r) => {
    const q = search.toLowerCase();
    const title = r.metadata?.title || r.suggestedName || r.fileName;
    return (
      title.toLowerCase().includes(q) ||
      r.detectedPlatform.toLowerCase().includes(q) ||
      (r.metadata?.genre && r.metadata.genre.toLowerCase().includes(q))
    );
  });

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Search Bar */}
      <div className="px-6 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4 bg-white/50 dark:bg-slate-900/40">
        <div className="relative w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search game titles, genres, platforms..."
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-cyan-500"
          />
        </div>

        <div className="text-xs text-slate-500 dark:text-slate-400">
          <span>Displaying </span>
          <span className="font-mono tabular-nums font-semibold text-slate-700 dark:text-slate-200">
            {filtered.length}
          </span>
          <span> games in visual gallery</span>
        </div>
      </div>

      {/* Grid Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5">
          {filtered.map((rom) => {
            const meta = rom.metadata;
            const title = meta?.title || rom.suggestedName || rom.fileName;

            return (
              <div
                key={rom.id}
                onClick={() => onSelectRom(rom)}
                className="group relative flex flex-col bg-white dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-xs hover:shadow-md hover:border-cyan-500 dark:hover:border-cyan-400 transition-all cursor-pointer"
              >
                {/* Poster / Box Art */}
                <div className="relative aspect-3/4 w-full bg-slate-100 dark:bg-slate-900 overflow-hidden">
                  {meta?.boxArtUrl ? (
                    <img
                      src={meta.boxArtUrl}
                      alt={title}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center bg-gradient-to-br from-slate-800 to-slate-950 text-slate-300">
                      <span className="text-xs font-mono font-bold uppercase tracking-wider text-cyan-400 mb-1">
                        {rom.detectedPlatform}
                      </span>
                      <span className="text-xs font-semibold line-clamp-3">{title}</span>
                    </div>
                  )}

                  {/* Scrim Overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-between p-3">
                    <span className="text-[11px] font-medium text-white flex items-center gap-1">
                      <Play className="w-3 h-3 fill-current" />
                      Configure
                    </span>
                    <span className="text-[11px] font-mono text-cyan-300 uppercase">
                      {rom.detectedPlatform}
                    </span>
                  </div>

                  {/* Verification Status Unboxed Tag */}
                  <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded bg-black/60 backdrop-blur-xs text-[10px] font-medium flex items-center gap-1">
                    {rom.status === 'verified' && (
                      <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                    )}
                    {rom.status === 'renamed' && (
                      <AlertTriangle className="w-3 h-3 text-amber-400" />
                    )}
                    {rom.status === 'duplicate_clone' && <Copy className="w-3 h-3 text-indigo-400" />}
                    {rom.status === 'junk_bad_dump' && <Trash2 className="w-3 h-3 text-rose-400" />}
                    <span className="text-white capitalize">{rom.status.replace(/_/g, ' ')}</span>
                  </div>
                </div>

                {/* Card Footer / Clean unboxed metadata */}
                <div className="p-3 flex flex-col justify-between flex-1">
                  <div>
                    <h4 className="text-xs font-semibold text-slate-900 dark:text-slate-100 line-clamp-1 group-hover:text-cyan-600 dark:group-hover:text-cyan-400 transition-colors">
                      {title}
                    </h4>
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                      <span className="uppercase font-medium">{rom.detectedPlatform}</span>
                      <span aria-hidden="true">·</span>
                      <span>{meta?.releaseDate?.slice(0, 4) || 'Classic'}</span>
                      {meta?.score && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums text-emerald-600 dark:text-emerald-400 font-semibold">
                            {meta.score}%
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="text-[10px] font-mono text-slate-400 truncate mt-2">
                    CRC: {rom.crc32}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
