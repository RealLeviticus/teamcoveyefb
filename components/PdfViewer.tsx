// components/PdfViewer.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

export type PdfViewerClientProps = {
  src: string;               // absolute PDF URL (SimBrief)
  zoom?: number;             // 1 = fit-to-width baseline, >1 zoom in, <1 zoom out
  className?: string;
  style?: React.CSSProperties;
};

// Pin a stable pdf.js release (UMD)
const PDFJS_VERSION = "3.11.174";
const PDFJS_BASE = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}`; // pdf.min.js, pdf.worker.min.js

// Dynamically load a script tag once and cache the promise
const scriptCache = new Map<string, Promise<void>>();
function loadScriptOnce(src: string): Promise<void> {
  const cached = scriptCache.get(src);
  if (cached) return cached;
  const p = new Promise<void>((resolve, reject) => {
    const el = document.createElement("script");
    el.src = src;
    el.async = true;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(el);
  });
  scriptCache.set(src, p);
  return p;
}

// Fetch via our proxy to avoid CORS and return ArrayBuffer
async function fetchPdfArrayBuffer(simbriefUrl: string, token: string): Promise<ArrayBuffer> {
  const proxied = `/api/simbrief/ofp-proxy?url=${encodeURIComponent(simbriefUrl)}&cv=${encodeURIComponent(token)}`;
  const res = await fetch(proxied, { cache: "no-store", redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.arrayBuffer();
}

export default function PdfViewerClient({ src, zoom = 1, className, style }: PdfViewerClientProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const resizeObs = useRef<ResizeObserver | null>(null);
  const cleanupPages = useRef<(() => void) | null>(null);

  // Derive a cache-buster token from filename or timestamp
  const cvToken = useMemo(() => {
    const m = src.match(/([^/]+\.pdf)(?:\?|$)/i);
    return m ? m[1] : String(Date.now());
  }, [src]);

  // Load pdf.js UMD from CDN once on the client
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await loadScriptOnce(`${PDFJS_BASE}/pdf.min.js`);
        if (!mounted) return;
        const pdfjsLib = (window as any).pdfjsLib;
        if (pdfjsLib && pdfjsLib.GlobalWorkerOptions) {
          pdfjsLib.GlobalWorkerOptions.workerSrc = `${PDFJS_BASE}/pdf.worker.min.js`;
        }
      } catch (e) {
        console.error(e);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Render the PDF into canvases (re-runs on src or zoom change)
  useEffect(() => {
    let cancelled = false;
    let pdfDoc: any = null;

    async function run() {
      if (!src || !containerRef.current) return;
      setLoading(true);
      setError(null);

      // Clear previous render
      if (cleanupPages.current) {
        cleanupPages.current();
        cleanupPages.current = null;
      }
      containerRef.current.innerHTML = "";

      try {
        // Ensure pdf.js is loaded
        await loadScriptOnce(`${PDFJS_BASE}/pdf.min.js`);
    
        const pdfjsLib = (window as any).pdfjsLib;
        if (!pdfjsLib) throw new Error("pdf.js failed to load.");

        // 1) Get bytes via proxy to avoid CORS
        const bytes = await fetchPdfArrayBuffer(src, cvToken);
        if (cancelled) return;

        // 2) Load with PDF.js (UMD API)
        const loadingTask = pdfjsLib.getDocument({ data: bytes });
        pdfDoc = await loadingTask.promise;
        if (cancelled || !containerRef.current) return;

        // 3) Create canvases for each page
        const canvases: HTMLCanvasElement[] = [];
        const pageViews: { page: any; canvas: HTMLCanvasElement }[] = [];

        for (let p = 1; p <= pdfDoc.numPages; p++) {
          const page = await pdfDoc.getPage(p);
          if (cancelled) return;

          const wrapper = document.createElement("div");
          wrapper.style.display = "flex";
          wrapper.style.justifyContent = "center";
          wrapper.style.marginBottom = "1.5rem";

          const canvas = document.createElement("canvas");
          canvas.style.maxWidth = "100%";
          canvas.style.height = "auto";

          canvases.push(canvas);
          pageViews.push({ page, canvas });

          wrapper.appendChild(canvas);
          containerRef.current.appendChild(wrapper);
        }

        // 4) Render all pages to fit container width (baseline) * zoom
        const renderAll = async () => {
          if (!containerRef.current) return;
          const baseWidth = Math.min(1100, containerRef.current.clientWidth - 32);
          const targetWidth = Math.max(100, Math.floor(baseWidth * (zoom || 1)));
          for (const { page, canvas } of pageViews) {
            const viewport = page.getViewport({ scale: 1 });
            const scale = targetWidth / viewport.width;
            const scaledViewport = page.getViewport({ scale });

            const ctx = canvas.getContext("2d");
            if (!ctx) continue;

            canvas.width = Math.floor(scaledViewport.width);
            canvas.height = Math.floor(scaledViewport.height);

            await page
              .render({
                canvas,
                canvasContext: ctx,
                viewport: scaledViewport,
              })
              .promise;
          }
        };

        await renderAll();

        // 5) Re-render on container resize
        if (resizeObs.current) resizeObs.current.disconnect();
        resizeObs.current = new ResizeObserver(() => {
          void renderAll();
        });
        resizeObs.current.observe(containerRef.current);

        // 6) Cleanup for this render
        cleanupPages.current = () => {
          if (resizeObs.current) resizeObs.current.disconnect();
          pageViews.length = 0;
          canvases.forEach((c) => {
            const ctx = c.getContext("2d");
            if (ctx) ctx.clearRect(0, 0, c.width, c.height);
          });
          if (containerRef.current) containerRef.current.innerHTML = "";
          try {
            pdfDoc?.cleanup?.();
            pdfDoc?.destroy?.();
          } catch {}
        };
      } catch (e: any) {
        if (!cancelled) setError(e?.message || String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void run();

    return () => {
      cancelled = true;
      if (cleanupPages.current) {
        cleanupPages.current();
        cleanupPages.current = null;
      }
    };
  }, [src, zoom, cvToken]);

  return (
    <div className={className} style={style}>
      {loading && <div className="px-3 pb-2 text-sm">Loading PDF…</div>}
      {error && <div className="px-3 pb-2 text-sm text-red-500">PDF error: {error}</div>}
      <div ref={containerRef} className="w-full" />
    </div>
  );
}
