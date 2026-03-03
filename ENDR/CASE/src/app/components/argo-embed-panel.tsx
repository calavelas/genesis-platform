"use client";

import { useMemo, useState } from "react";

const MIN_ZOOM = 60;
const MAX_ZOOM = 140;
const STEP = 10;
const DEFAULT_ZOOM = 100;

interface ArgoEmbedPanelProps {
  embedUrl: string;
}

function clampZoom(value: number): number {
  if (value < MIN_ZOOM) {
    return MIN_ZOOM;
  }
  if (value > MAX_ZOOM) {
    return MAX_ZOOM;
  }
  return value;
}

export function ArgoEmbedPanel({ embedUrl }: ArgoEmbedPanelProps) {
  const [zoomPercent, setZoomPercent] = useState<number>(DEFAULT_ZOOM);

  const scale = useMemo(() => zoomPercent / 100, [zoomPercent]);
  const frameStyle = useMemo(
    () => ({
      zoom: scale,
      width: `${100 / scale}%`,
      height: `${100 / scale}%`
    }),
    [scale]
  );

  return (
    <section className="embed-panel">
      <div className="embed-header">
        <h2>Embedded ArgoCD Dashboard</h2>
        <span>Read-only mode</span>
      </div>

      <div className="embed-toolbar" role="group" aria-label="argocd-zoom-controls">
        <button type="button" onClick={() => setZoomPercent((current) => clampZoom(current - STEP))}>
          -
        </button>
        <span>{zoomPercent}%</span>
        <button type="button" onClick={() => setZoomPercent((current) => clampZoom(current + STEP))}>
          +
        </button>
        <button type="button" onClick={() => setZoomPercent(DEFAULT_ZOOM)}>
          Reset
        </button>
      </div>

      <div className="argocd-frame-viewport">
        <iframe className="argocd-frame" style={frameStyle} src={embedUrl} title="Embedded ArgoCD" loading="lazy" />
      </div>

      <p className="embed-note">
        If the frame is blocked, ensure ArgoCD allows frame embedding from <code>https://case.calavelas.net</code>,{" "}
        <code>127.0.0.1:3000</code>, and <code>localhost:3000</code>.
      </p>
    </section>
  );
}
