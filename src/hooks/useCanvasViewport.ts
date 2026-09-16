import { useCallback, useState } from 'react';

interface Viewport {
  zoom: number;
  pan: { x: number; y: number };
}

export function useCanvasViewport(initialViewport?: Viewport) {
  const [zoom, setZoom] = useState(initialViewport?.zoom ?? 1);
  const [pan, setPan] = useState(initialViewport?.pan ?? { x: 0, y: 0 });
  const setViewport = useCallback((viewport: Viewport) => {
    setZoom(viewport.zoom);
    setPan(viewport.pan);
  }, []);
  const resetViewport = useCallback(
    () => setViewport({ zoom: 1, pan: { x: 0, y: 0 } }),
    [setViewport],
  );

  return { zoom, setZoom, pan, setPan, setViewport, resetViewport };
}
