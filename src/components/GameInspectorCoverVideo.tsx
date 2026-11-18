import React, { useState, useEffect, useRef } from 'react';
import { Film, Volume2, VolumeX } from 'lucide-react';
import { useI18n } from '../i18n/translations';

export interface GameInspectorMediaProps {
  title: string;
  consoleCode: string;
  genre: string;
  year: string | number;
  region: string;
  boxArtUrl?: string;
  videoUrl?: string;
}

export const GameInspectorCoverVideo: React.FC<GameInspectorMediaProps> = ({
  title,
  consoleCode,
  genre,
  year,
  region,
  boxArtUrl,
  videoUrl,
}) => {
  const { t } = useI18n();
  const [isHovered, setIsHovered] = useState(false);
  const [isPinnedVideo, setIsPinnedVideo] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  const [isMuted, setIsMuted] = useState(true);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const isPlayingVideo = isHovered || isPinnedVideo;

  useEffect(() => {
    setImgFailed(false);
    setVideoFailed(false);
  }, [title, boxArtUrl, videoUrl]);

  // Animated 60fps gameplay preview synthesizer on <canvas> when hovering (or if external .mp4 is not yet downloaded)
  useEffect(() => {
    if (!isPlayingVideo) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId = 0;
    let frame = 0;

    // Seed deterministic palette from game title
    let hash = 0;
    for (let i = 0; i < title.length; i++) {
      hash = (hash * 31 + title.charCodeAt(i)) & 0xffffffff;
    }
    const hue1 = Math.abs(hash) % 360;
    const hue2 = (hue1 + 55) % 360;
    const lowerGenre = genre.toLowerCase();
    const isFighter = lowerGenre.includes('файт') || lowerGenre.includes('fight') || title.toLowerCase().includes('tekken');
    const isRacer = lowerGenre.includes('гонк') || lowerGenre.includes('rac') || title.toLowerCase().includes('turismo');

    const render = () => {
      frame++;
      const w = canvas.width;
      const h = canvas.height;

      // Dynamic sky / stage backdrop
      const skyGrad = ctx.createLinearGradient(0, 0, 0, h * 0.65);
      skyGrad.addColorStop(0, `hsl(${hue1}, 55%, 14%)`);
      skyGrad.addColorStop(1, `hsl(${hue2}, 60%, 26%)`);
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, w, h);

      // Parallax distant mountains / cityscape
      ctx.fillStyle = `hsl(${hue1}, 35%, 18%)`;
      for (let i = 0; i < 12; i++) {
        const bx = ((i * 55 - (frame * 0.6) % 55) + w) % (w + 55) - 55;
        const bh = 35 + ((i * 19) % 45);
        ctx.fillRect(bx, h * 0.62 - bh, 48, bh);
      }

      // Perspective scrolling floor grid
      const horizonY = h * 0.62;
      const floorGrad = ctx.createLinearGradient(0, horizonY, 0, h);
      floorGrad.addColorStop(0, `hsl(${hue2}, 45%, 16%)`);
      floorGrad.addColorStop(1, `hsl(${hue1}, 65%, 10%)`);
      ctx.fillStyle = floorGrad;
      ctx.fillRect(0, horizonY, w, h - horizonY);

      ctx.strokeStyle = `hsla(${hue2}, 85%, 60%, 0.28)`;
      ctx.lineWidth = 1;
      for (let z = 1; z <= 6; z++) {
        const yPos = horizonY + Math.pow(((z + (frame % 20) / 20) / 7), 1.7) * (h - horizonY);
        ctx.beginPath();
        ctx.moveTo(0, yPos);
        ctx.lineTo(w, yPos);
        ctx.stroke();
      }

      if (isFighter) {
        // Fighting game HUD (2 Health Bars + Timer + Animated Fighters)
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(16, 14, w - 32, 18);
        // P1 Health
        ctx.fillStyle = '#22c55e';
        const p1Hp = Math.max(0.35, 0.88 - Math.sin(frame * 0.03) * 0.12);
        ctx.fillRect(20, 17, (w * 0.4 - 20) * p1Hp, 12);
        // P2 Health
        ctx.fillStyle = '#eab308';
        const p2Hp = Math.max(0.25, 0.74 - Math.cos(frame * 0.04) * 0.18);
        const p2W = (w * 0.4 - 20) * p2Hp;
        ctx.fillRect(w - 20 - p2W, 17, p2W, 12);

        // Fighters silhouettes
        const f1X = w * 0.34 + Math.sin(frame * 0.12) * 14;
        const f2X = w * 0.64 + Math.cos(frame * 0.12) * 14;
        const groundY = h * 0.78;

        ctx.fillStyle = '#38bdf8';
        ctx.fillRect(f1X - 14, groundY - 54, 28, 54);
        ctx.fillStyle = '#f43f5e';
        ctx.fillRect(f2X - 14, groundY - 54, 28, 54);

        // Hit spark
        if (frame % 28 < 7) {
          ctx.fillStyle = '#fde047';
          ctx.beginPath();
          ctx.arc((f1X + f2X) / 2, groundY - 34, 14, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (isRacer) {
        // 3D Road + Player Car
        ctx.fillStyle = '#334155';
        ctx.beginPath();
        ctx.moveTo(w * 0.42, horizonY);
        ctx.lineTo(w * 0.58, horizonY);
        ctx.lineTo(w * 0.92, h);
        ctx.lineTo(w * 0.08, h);
        ctx.closePath();
        ctx.fill();

        const carX = w * 0.5 + Math.sin(frame * 0.07) * 28;
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(carX - 24, h * 0.76, 48, 22);
        ctx.fillStyle = '#fef08a';
        ctx.fillRect(carX - 20, h * 0.78, 8, 5);
        ctx.fillRect(carX + 12, h * 0.78, 8, 5);
      } else {
        // Action / Platformer / RPG animated hero + collectibles
        const heroX = w * 0.28 + Math.sin(frame * 0.06) * 22;
        const jumpOffset = Math.abs(Math.sin(frame * 0.11)) * 28;
        const heroY = h * 0.76 - jumpOffset;

        // Platforms
        ctx.fillStyle = `hsl(${hue1}, 40%, 35%)`;
        for (let p = 0; p < 4; p++) {
          const px = ((p * 110 - (frame * 2.2) % 440) + 440) % 440 - 60;
          const py = h * 0.58 + (p % 2) * 26;
          ctx.fillRect(px, py, 68, 10);
        }

        // Character sprite
        ctx.fillStyle = '#38bdf8';
        ctx.fillRect(heroX - 11, heroY - 32, 22, 32);
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(heroX + 2, heroY - 26, 7, 6);
      }

      // Subtle CRT scanlines
      ctx.fillStyle = 'rgba(0, 0, 0, 0.16)';
      for (let y = 0; y < h; y += 4) {
        ctx.fillRect(0, y, w, 1.5);
      }

      // Top-left REC / Gameplay Preview overlay
      ctx.fillStyle = 'rgba(15, 23, 42, 0.78)';
      ctx.fillRect(10, h - 32, w - 20, 22);
      ctx.fillStyle = '#e2e8f0';
      ctx.font = 'bold 11px monospace';
      const sec = String(Math.floor(frame / 60) % 60).padStart(2, '0');
      const ms = String(frame % 60).padStart(2, '0');
      ctx.fillText(`▶ VIDEO PREVIEW · ${consoleCode.toUpperCase()} · 00:${sec}:${ms}`, 18, h - 17);

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [isPlayingVideo, title, consoleCode, genre]);

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="relative aspect-4/3 w-full rounded-xl overflow-hidden bg-slate-900 border border-slate-200 dark:border-slate-700 select-none group cursor-pointer"
      title={t('cover.titleTip')}
    >
      {/* 1. Box-Art Cover Layer (Visible when not hovered) */}
      <div
        className={`absolute inset-0 transition-opacity duration-200 ${
          isPlayingVideo ? 'opacity-0 pointer-events-none' : 'opacity-100'
        }`}
      >
        {boxArtUrl && !imgFailed ? (
          <img
            src={boxArtUrl}
            alt={title}
            referrerPolicy="no-referrer"
            onError={() => setImgFailed(true)}
            className="w-full h-full object-contain p-3 bg-slate-950"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950 p-5 flex flex-col justify-between text-white">
            <div className="flex items-center justify-between text-xs font-mono text-slate-300">
              <span>{consoleCode.toUpperCase()}</span>
              <span>{region}</span>
            </div>
            <div className="space-y-1">
              <div className="text-lg font-extrabold tracking-tight leading-snug text-white">
                {title}
              </div>
              <div className="text-xs text-slate-300">
                {genre} · {year}
              </div>
            </div>
            <div className="text-[11px] font-mono text-slate-400">
              {t('cover.boxArtAlt')} · images/{title}.png
            </div>
          </div>
        )}

        {/* Bottom Scrim with Hover Prompt */}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/50 to-transparent px-3.5 py-2.5 flex items-center justify-between text-white">
          <div className="flex items-center gap-1.5 text-xs font-semibold">
            <Film className="w-3.5 h-3.5 text-blue-400 shrink-0" />
            <span>{t('cover.hoverVideoHint')}</span>
          </div>
          <span className="text-[11px] font-mono text-slate-300">{region}</span>
        </div>
      </div>

      {/* 2. Short Gameplay Video Preview Layer (Plays automatically on hover!) */}
      {isPlayingVideo && (
        <div className="absolute inset-0 bg-slate-950 flex items-center justify-center">
          {videoUrl && !videoFailed ? (
            <video
              ref={videoRef}
              src={videoUrl}
              autoPlay
              loop
              muted={isMuted}
              playsInline
              onError={() => setVideoFailed(true)}
              className="w-full h-full object-cover"
            />
          ) : (
            <canvas
              ref={canvasRef}
              width={360}
              height={270}
              className="w-full h-full object-cover"
            />
          )}

          {/* Video Controls Overlay */}
          <div className="absolute top-2.5 inset-x-2.5 flex items-center justify-between gap-2">
            <span className="px-2 py-0.5 rounded bg-black/75 text-white text-[11px] font-semibold flex items-center gap-1.5">
              <Film className="w-3 h-3 text-blue-400" />
              <span>{t('cover.shortVideoBadge')} · {title}</span>
            </span>

            <div className="flex items-center gap-1.5">
              {videoUrl && !videoFailed && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsMuted((m) => !m);
                  }}
                  className="p-1.5 rounded bg-black/75 text-white hover:bg-black"
                  title={isMuted ? t('cover.unmuteTip') : t('cover.muteTip')}
                >
                  {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                </button>
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsPinnedVideo((p) => !p);
                }}
                className={`px-2 py-1 rounded text-[11px] font-semibold transition-colors ${
                  isPinnedVideo
                    ? 'bg-blue-600 text-white'
                    : 'bg-black/75 text-slate-200 hover:bg-black'
                }`}
                title={isPinnedVideo ? t('cover.unpinTip') : t('cover.pinTip')}
              >
                {isPinnedVideo ? t('cover.pinnedBadge') : t('cover.pinBtn')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
