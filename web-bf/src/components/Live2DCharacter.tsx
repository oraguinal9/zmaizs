'use client';

import { useEffect, useRef } from 'react';

interface Props {
  modelPath: string;
  onLoad?: () => void;
  onError?: (msg: string) => void;
}

export default function Live2DCharacter({ modelPath, onLoad, onError }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLParagraphElement>(null);
  const modelRef = useRef<any>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    let destroyed = false;
    let app: any = null;
    const bar = barRef.current;
    const text = textRef.current;
    const overlay = overlayRef.current;

    // Animate progress (DOM direct)
    let progress = 2;
    const tick = () => {
      if (destroyed || progress >= 90) return;
      progress += Math.random() * 12 + 6;
      if (progress > 90) progress = 90;
      if (bar) bar.style.width = progress + '%';
      if (text) {
        text.textContent = progress < 35 ? '正在连接...' : progress < 70 ? '加载模型资源...' : '准备就绪...';
      }
      setTimeout(tick, 350 + Math.random() * 200);
    };
    tick();

    // Load PIXI first, then Live2D
    const init = async () => {
      try {
        const PIXI = await import('pixi.js');
        if (destroyed) return;
        (window as any).PIXI = PIXI;

        app = new PIXI.Application({
          view: canvas,
          resizeTo: canvas.parentElement!,
          backgroundAlpha: 0,
          antialias: true,
          resolution: window.devicePixelRatio || 1,
          autoDensity: true,
        });

        const { Live2DModel } = await import('pixi-live2d-display/cubism4');
        if (destroyed) return;

        const model = await Live2DModel.from(modelPath);
        if (destroyed) return;
        modelRef.current = model;

        model.anchor.set(0.5, 0.5);
        model.x = app.screen.width / 2;
        model.y = app.screen.height / 2;
        model.scale.set(Math.min(
          app.screen.width / model.width * 0.85,
          app.screen.height / model.height * 0.85
        ));
        app.stage.addChild(model);

        // Done
        if (bar) bar.style.width = '100%';
        if (text) text.textContent = '就绪 ✨';
        if (overlay) {
          overlay.style.opacity = '0';
          setTimeout(() => { if (overlay) overlay.style.display = 'none'; }, 500);
        }
        onLoad?.();
      } catch (e: any) {
        if (!destroyed && text) {
          text.textContent = '加载失败';
          text.className = 'text-red-400 text-sm';
        }
        if (!destroyed) onError?.((e as Error).message);
      }
    };

    // ResizeObserver: detect parent size changes (voice mode fullscreen)
    const ro = new ResizeObserver(() => {
      if (!destroyed && app && container) {
        const w = container.clientWidth;
        const h = container.clientHeight;
        app.renderer.resize(w, h);
        if (modelRef.current) {
          const m = modelRef.current;
          m.x = w / 2;
          m.y = h / 2;
          m.scale.set(Math.min(w / m.width * 0.85, h / m.height * 0.85));
        }
      }
    });
    ro.observe(container);

    init();

    return () => {
      destroyed = true;
      ro.disconnect();
      if (app) {
        try { app.destroy(true, { children: true }); } catch {}
      }
    };
  }, [modelPath]);

  return (
    <div ref={containerRef} className="relative w-full h-full bg-gradient-to-b from-slate-900 via-indigo-950 to-slate-950 overflow-hidden flex items-center justify-center">
      <div ref={overlayRef} className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-slate-900/80 transition-opacity duration-300">
        <div className="text-center space-y-3">
          <div className="text-5xl animate-pulse">🌟</div>
          <p ref={textRef} className="text-gray-300 text-sm font-medium">正在连接...</p>
          <div className="w-48 h-2 bg-slate-700 rounded-full overflow-hidden">
            <div ref={barRef} className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 rounded-full" style={{ width: '2%' }} />
          </div>
        </div>
      </div>
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
    </div>
  );
}
