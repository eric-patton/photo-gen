import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import PageHeader from '../layout/PageHeader';
import { useGenerate, useImageDetail } from '../../api/queries';
import { formatUsd } from '../../lib/format';
import { estimateCost, validateSize } from '@photo-gen/shared';

/**
 * Image editor. Type a prompt to edit the WHOLE image, or optionally paint a
 * region to edit only that part (inpaint). The mask canvas lives at the image's
 * NATIVE resolution; on-screen painting is mapped through the view transform, so
 * the exported RGBA PNG (painted = alpha 0 = regenerate) always matches the base
 * image pixel-for-pixel. With no strokes, no mask is sent and the model edits the
 * entire image guided by the prompt.
 */
export default function InpaintEditorPage() {
  const { id } = useParams<{ id: string }>();
  const detail = useImageDetail(id);
  const generate = useGenerate();
  const navigate = useNavigate();

  const containerRef = useRef<HTMLDivElement>(null);
  const displayRef = useRef<HTMLCanvasElement>(null);
  const maskRef = useRef<HTMLCanvasElement | null>(null); // native-resolution strokes
  const imageRef = useRef<HTMLImageElement | null>(null);
  const viewRef = useRef({ scale: 1, offsetX: 0, offsetY: 0 });
  const paintingRef = useRef(false);
  const panningRef = useRef<{ startX: number; startY: number } | null>(null);

  const [brushSize, setBrushSize] = useState(48);
  const [erasing, setErasing] = useState(false);
  const [hasStrokes, setHasStrokes] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [quality, setQuality] = useState('medium');

  const img = detail.data;

  const redraw = useCallback(() => {
    const canvas = displayRef.current;
    const image = imageRef.current;
    const mask = maskRef.current;
    if (!canvas || !image || !mask) return;
    const ctx = canvas.getContext('2d')!;
    const { scale, offsetX, offsetY } = viewRef.current;
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);
    ctx.drawImage(image, 0, 0);
    ctx.globalAlpha = 0.5;
    ctx.drawImage(mask, 0, 0);
    ctx.restore();
  }, []);

  // Load image + set up canvases once the metadata is in.
  useEffect(() => {
    if (!img) return;
    const image = new Image();
    image.src = `/api/images/${img.id}/file`;
    image.onload = () => {
      imageRef.current = image;
      const mask = document.createElement('canvas');
      mask.width = img.width;
      mask.height = img.height;
      maskRef.current = mask;

      const container = containerRef.current;
      const canvas = displayRef.current;
      if (container && canvas) {
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;
        const fit = Math.min(
          canvas.width / img.width,
          canvas.height / img.height,
          1,
        );
        viewRef.current = {
          scale: fit,
          offsetX: (canvas.width - img.width * fit) / 2,
          offsetY: (canvas.height - img.height * fit) / 2,
        };
      }
      redraw();
    };
  }, [img, redraw]);

  const toImageCoords = (e: { clientX: number; clientY: number }) => {
    const canvas = displayRef.current!;
    const rect = canvas.getBoundingClientRect();
    const { scale, offsetX, offsetY } = viewRef.current;
    return {
      x: (e.clientX - rect.left - offsetX) / scale,
      y: (e.clientY - rect.top - offsetY) / scale,
    };
  };

  const paintAt = (e: { clientX: number; clientY: number }) => {
    const mask = maskRef.current;
    if (!mask) return;
    const { x, y } = toImageCoords(e);
    const ctx = mask.getContext('2d')!;
    ctx.globalCompositeOperation = erasing ? 'destination-out' : 'source-over';
    ctx.fillStyle = 'rgba(239, 68, 68, 1)';
    ctx.beginPath();
    // Brush size is in screen pixels; divide by scale so it feels constant.
    ctx.arc(x, y, brushSize / 2 / viewRef.current.scale, 0, Math.PI * 2);
    ctx.fill();
    setHasStrokes(true);
    redraw();
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    if (e.button === 1 || e.button === 2 || e.ctrlKey) {
      panningRef.current = { startX: e.clientX, startY: e.clientY };
    } else {
      paintingRef.current = true;
      paintAt(e);
    }
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (panningRef.current) {
      viewRef.current.offsetX += e.clientX - panningRef.current.startX;
      viewRef.current.offsetY += e.clientY - panningRef.current.startY;
      panningRef.current = { startX: e.clientX, startY: e.clientY };
      redraw();
    } else if (paintingRef.current) {
      paintAt(e);
    }
  };
  const onPointerUp = () => {
    paintingRef.current = false;
    panningRef.current = null;
  };
  const onWheel = (e: React.WheelEvent) => {
    const canvas = displayRef.current!;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const view = viewRef.current;
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    const newScale = Math.min(8, Math.max(0.05, view.scale * factor));
    // Zoom around the cursor.
    view.offsetX = mouseX - ((mouseX - view.offsetX) / view.scale) * newScale;
    view.offsetY = mouseY - ((mouseY - view.offsetY) / view.scale) * newScale;
    view.scale = newScale;
    redraw();
  };

  const clearMask = () => {
    const mask = maskRef.current;
    if (!mask) return;
    mask.getContext('2d')!.clearRect(0, 0, mask.width, mask.height);
    setHasStrokes(false);
    redraw();
  };

  const exportMask = (): string => {
    const strokes = maskRef.current!;
    const out = document.createElement('canvas');
    out.width = strokes.width;
    out.height = strokes.height;
    const ctx = out.getContext('2d')!;
    // Opaque everywhere…
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, out.width, out.height);
    // …then punch alpha-0 holes where the user painted (region to regenerate).
    ctx.globalCompositeOperation = 'destination-out';
    ctx.drawImage(strokes, 0, 0);
    return out.toDataURL('image/png');
  };

  const submit = () => {
    if (!img || !prompt.trim() || generate.isPending) return;
    const dims = `${img.width}x${img.height}`;
    generate.mutate(
      {
        projectId: img.projectId,
        prompt: prompt.trim(),
        // Inpaint keeps native dimensions via the mask; a full-image edit asks
        // for the base dimensions when they're a legal gpt-image-2 size (e.g.
        // an imported photo may not be), otherwise falls back to 'auto'.
        size: hasStrokes ? 'auto' : validateSize(dims).ok ? dims : 'auto',
        quality,
        n: 1,
        baseImageId: img.id,
        ...(hasStrokes ? { maskDataUrl: exportMask() } : {}),
      },
      { onSuccess: () => navigate('/generate') },
    );
  };

  if (detail.isLoading || !img) {
    return (
      <div>
        <PageHeader title="Edit" />
        <div className="p-6 text-sm text-neutral-600">
          {detail.isLoading ? 'Loading…' : 'Image not found.'}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader title={`Edit — ${img.title || img.id.slice(0, 8)}`} />
      <div className="flex flex-wrap items-center gap-3 border-b border-neutral-800 px-4 py-2 text-xs">
        <label className="flex items-center gap-1.5 text-neutral-400">
          Brush
          <input
            type="range"
            min={8}
            max={160}
            value={brushSize}
            onChange={(e) => setBrushSize(Number(e.target.value))}
          />
          <span className="w-8 text-neutral-500">{brushSize}px</span>
        </label>
        <button
          onClick={() => setErasing((v) => !v)}
          className={`rounded border px-2 py-1 ${
            erasing
              ? 'border-indigo-500 bg-indigo-950/60 text-indigo-300'
              : 'border-neutral-700 text-neutral-400 hover:border-neutral-500'
          }`}
        >
          Eraser
        </button>
        <button
          onClick={clearMask}
          className="rounded border border-neutral-700 px-2 py-1 text-neutral-400 hover:border-neutral-500"
        >
          Clear
        </button>
        <span className="text-neutral-600">
          Optional: paint a region to edit only it (inpaint) · wheel zooms · right/ctrl-drag pans
        </span>
      </div>

      <div ref={containerRef} className="min-h-0 flex-1">
        <canvas
          ref={displayRef}
          className="h-full w-full cursor-crosshair touch-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onWheel={onWheel}
          onContextMenu={(e) => e.preventDefault()}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-neutral-800 px-4 py-3">
        <input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder={
            hasStrokes
              ? 'Describe what should appear in the painted region…'
              : 'Describe the edit — applies to the whole image (paint a region above to limit it)'
          }
          className="min-w-64 flex-1 rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm"
        />
        <select
          value={quality}
          onChange={(e) => setQuality(e.target.value)}
          className="rounded-md border border-neutral-800 bg-neutral-900 px-2 py-2 text-xs"
        >
          <option value="low">low</option>
          <option value="medium">medium</option>
          <option value="high">high</option>
        </select>
        <button
          onClick={submit}
          disabled={!prompt.trim() || generate.isPending}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:bg-neutral-800 disabled:text-neutral-500"
        >
          {generate.isPending
            ? 'Submitting…'
            : `${hasStrokes ? 'Regenerate region' : 'Apply edit'} · ~${formatUsd(estimateCost(`${img.width}x${img.height}`, quality as never, 1))}`}
        </button>
        {generate.isError && <span className="text-xs text-red-400">{generate.error.message}</span>}
        {!hasStrokes && (
          <span className="text-xs text-neutral-600">Editing the whole image · paint above to inpaint a region</span>
        )}
      </div>
    </div>
  );
}
