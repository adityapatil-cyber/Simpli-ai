import { useRef, useState } from 'react';
import { Crop, RotateCcw, Sparkles } from 'lucide-react';
import { clampNormalizedRegion } from '../utils/simpliLogic';
import type { NormalizedRegion } from '../types/simpli';

interface RegionHighlighterProps {
  imageUrl: string;
  imageName: string;
  onExplainRegion: (croppedBase64: string, region: NormalizedRegion) => void;
  isBusy?: boolean;
}

export function RegionHighlighter({
  imageUrl,
  imageName,
  onExplainRegion,
  isBusy = false,
}: RegionHighlighterProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [region, setRegion] = useState<NormalizedRegion | null>(null);
  const [cropError, setCropError] = useState<string | null>(null);

  const getRelativePoint = (clientX: number, clientY: number) => {
    const el = containerRef.current;
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)));
    const y = Math.max(0, Math.min(1, (clientY - rect.top) / Math.max(1, rect.height)));
    return { x, y };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isBusy) return;
    setCropError(null);
    e.currentTarget.setPointerCapture(e.pointerId);
    const pt = getRelativePoint(e.clientX, e.clientY);
    setDragStart(pt);
    setRegion({ x: pt.x, y: pt.y, width: 0.05, height: 0.05 });
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStart) return;
    const pt = getRelativePoint(e.clientX, e.clientY);
    const next = clampNormalizedRegion({
      x: Math.min(dragStart.x, pt.x),
      y: Math.min(dragStart.y, pt.y),
      width: Math.abs(pt.x - dragStart.x),
      height: Math.abs(pt.y - dragStart.y),
    });
    setRegion(next);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStart) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore if pointer capture already released
    }
    const pt = getRelativePoint(e.clientX, e.clientY);
    const dx = Math.abs(pt.x - dragStart.x);
    const dy = Math.abs(pt.y - dragStart.y);
    if (dx < 0.025 && dy < 0.025) {
      // Single click / tap focuses a generous zoomed box centered around the click
      const centered = clampNormalizedRegion({
        x: Math.max(0, pt.x - 0.18),
        y: Math.max(0, pt.y - 0.14),
        width: 0.36,
        height: 0.28,
      });
      setRegion(centered);
    }
    setDragStart(null);
  };

  const handleCropAndExplain = () => {
    if (!region || !imgRef.current) return;
    setCropError(null);
    const img = imgRef.current;
    const naturalW = img.naturalWidth || img.width;
    const naturalH = img.naturalHeight || img.height;
    if (!naturalW || !naturalH) {
      setCropError('Wait a moment for the image to finish loading.');
      return;
    }

    const sx = Math.max(0, Math.round(region.x * naturalW));
    const sy = Math.max(0, Math.round(region.y * naturalH));
    const sw = Math.max(24, Math.min(naturalW - sx, Math.round(region.width * naturalW)));
    const sh = Math.max(24, Math.min(naturalH - sy, Math.round(region.height * naturalH)));

    const canvas = document.createElement('canvas');
    canvas.width = sw;
    canvas.height = sh;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setCropError('Could not crop the selected region in this browser.');
      return;
    }
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
    const croppedBase64 = canvas.toDataURL('image/png');
    onExplainRegion(croppedBase64, region);
  };

  return (
    <div className="rounded-2xl border border-[#7C3AED]/30 bg-slate-50/90 dark:bg-zinc-950/90 p-3.5 sm:p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Crop className="h-4 w-4 text-[#7C3AED]" aria-hidden="true" />
          <span className="text-xs font-bold text-slate-900 dark:text-white">
            Circle What&apos;s Confusing
          </span>
          <span className="text-[11px] text-slate-500 dark:text-zinc-400">
            Drag a box or tap one spot on the image
          </span>
        </div>

        <div className="flex items-center gap-2">
          {region && (
            <button
              type="button"
              onClick={() => setRegion(null)}
              className="inline-flex h-7 items-center gap-1 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2.5 text-[11px] font-medium text-slate-600 dark:text-zinc-300 cursor-pointer"
            >
              <RotateCcw className="h-3 w-3" aria-hidden="true" />
              <span>Clear Box</span>
            </button>
          )}
          <button
            type="button"
            disabled={!region || isBusy}
            onClick={handleCropAndExplain}
            className="inline-flex h-8 items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#7C3AED] to-[#3B82F6] px-3.5 text-xs font-semibold text-white cursor-pointer disabled:opacity-45"
          >
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Explain Selected Spot</span>
          </button>
        </div>
      </div>

      <div className="flex justify-center rounded-xl bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800 p-2 overflow-hidden">
        <div
          ref={containerRef}
          data-testid="region-highlighter-canvas"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          className="relative inline-block max-w-full select-none touch-none cursor-crosshair"
        >
          <img
            ref={imgRef}
            src={imageUrl}
            alt={`Highlight area on ${imageName}`}
            referrerPolicy="no-referrer"
            draggable={false}
            className="max-h-[340px] w-auto rounded-lg block pointer-events-none"
          />

          {region && (
            <div
              aria-label="Selected confusing region"
              className="pointer-events-none absolute border-2 border-[#7C3AED] bg-[#7C3AED]/18 shadow-[0_0_0_9999px_rgba(15,23,42,0.32)] rounded-md transition-[left,top,width,height] duration-75"
              style={{
                left: `${region.x * 100}%`,
                top: `${region.y * 100}%`,
                width: `${region.width * 100}%`,
                height: `${region.height * 100}%`,
              }}
            >
              <span className="absolute -top-6 left-0 rounded-md bg-[#7C3AED] px-2 py-0.5 text-[10px] font-semibold text-white whitespace-nowrap shadow-xs">
                Focus Spot
              </span>
            </div>
          )}
        </div>
      </div>

      {cropError && (
        <p role="alert" className="text-xs font-medium text-amber-700 dark:text-amber-300">
          {cropError}
        </p>
      )}
    </div>
  );
}
