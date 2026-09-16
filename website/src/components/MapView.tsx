import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';

/** One map elevation's render, and the world→pixel mapping gecko drew it with. */
export interface MapLevel {
  elevation: number;
  /** Shown immediately. */
  base: string;
  /** Twice the resolution, fetched only once someone zooms in. */
  detail?: string;
  w: number;
  h: number;
  originX: number;
  originY: number;
  scale: number;
}
export interface MapEntry {
  file: string;
  name: string;
  displayName: string | null;
  levels: MapLevel[];
}
export interface Marker {
  hex: number;
  elevation: number;
  label: string;
  /** Drawn as the focused one, and what "zoom to it" centres on. */
  active?: boolean;
}

const GRID_WIDTH = 200;
const HEX_WIDTH = 16;
const HEX_HEIGHT = 12;

/** Past this the base render starts to soften, so it is worth paying for the detail tier. */
const DETAIL_AT = 1.5;

const MIN_ZOOM = 1;
const MAX_ZOOM = 8;
const FOCUS_ZOOM = 4;

/**
 * A hex's position in the renderer's world space — the same space sprites are placed in, ported from
 * HexagonGrid's constructor. Keep in step with src/editor/HexagonGrid.cpp in gecko.
 */
function hexToWorld(hex: number): {x: number; y: number} {
  const hx = hex % GRID_WIDTH;
  const hy = Math.floor(hex / GRID_WIDTH);
  const oddCol = hx & 1;
  const oddMod = hy + 1;
  return {
    x: 48 * (GRID_WIDTH / 2) + HEX_WIDTH * oddMod - HEX_HEIGHT * 2 * hx - (HEX_WIDTH / 2) * oddCol,
    y: oddMod * HEX_HEIGHT + (HEX_HEIGHT / 2) * hx + HEX_HEIGHT - (HEX_HEIGHT / 2) * oddCol,
  };
}

/** Where a hex falls in a render, as a fraction of its size — so the image can be shown at any width. */
function hexToFraction(hex: number, level: MapLevel): {x: number; y: number} {
  const {x, y} = hexToWorld(hex);
  return {
    x: ((x - level.originX) * level.scale) / level.w,
    y: ((y - level.originY) * level.scale) / level.h,
  };
}

export function useMaps(baseUrl: string) {
  const [maps, setMaps] = useState<MapEntry[] | null>(null);
  useEffect(() => {
    let live = true;
    fetch(`${baseUrl}data/maps.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => live && setMaps(d.maps as MapEntry[]))
      .catch(() => live && setMaps([]));
    return () => {
      live = false;
    };
  }, [baseUrl]);
  return maps;
}

/** Keep the image covering the frame: at zoom k it may be panned by at most (k-1)/2 of its size. */
function clampPan(value: number, zoom: number): number {
  const limit = Math.max(0, (zoom - 1) / (2 * zoom));
  return Math.min(limit, Math.max(-limit, value));
}

/**
 * A map render with markers pinned to hexes, zoomable and pannable.
 *
 * The projection comes from the renderer rather than being re-derived here, so a change to how maps
 * are framed moves the markers with the picture. Zoom is a CSS transform on the frame: the markers
 * are children, so they travel with the image for free and only need un-scaling so they stay the
 * same size on screen instead of growing into blobs.
 */
export default function MapView({
  entry,
  markers,
  baseUrl,
  elevation,
  onElevation,
}: {
  entry: MapEntry;
  markers: Marker[];
  baseUrl: string;
  elevation: number;
  onElevation: (e: number) => void;
}) {
  const level = useMemo(
    () => entry.levels.find((l) => l.elevation === elevation) ?? entry.levels[0],
    [entry, elevation],
  );
  const [zoom, setZoom] = useState(1);
  // Pan as a fraction of the image, so it survives the frame being resized.
  const [pan, setPan] = useState({x: 0, y: 0});
  const drag = useRef<{x: number; y: number; panX: number; panY: number} | null>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  // Once the detail tier has been paid for, keep it: dropping back to the base on zoom-out would
  // only make it load again the next time. Reset when the picture itself changes.
  const [wantDetail, setWantDetail] = useState(false);
  useEffect(() => setWantDetail(false), [entry.file, level?.elevation]);
  useEffect(() => {
    if (zoom >= DETAIL_AT) setWantDetail(true);
  }, [zoom]);

  const here = useMemo(
    () => markers.filter((m) => level && m.elevation === level.elevation),
    [markers, level],
  );
  const focus = here.find((m) => m.active) ?? here[0];

  const reset = useCallback(() => {
    setZoom(1);
    setPan({x: 0, y: 0});
  }, []);

  /** Centre the focused marker at FOCUS_ZOOM. The transform is applied about the frame's centre, so
   *  the pan needed to bring a point there is simply its offset from the middle. */
  const zoomToFocus = useCallback(() => {
    if (!focus || !level) return;
    const {x, y} = hexToFraction(focus.hex, level);
    setZoom(FOCUS_ZOOM);
    setPan({x: clampPan(0.5 - x, FOCUS_ZOOM), y: clampPan(0.5 - y, FOCUS_ZOOM)});
  }, [focus, level]);

  // A new focus means a new question; frame it rather than leaving the reader where they were.
  useEffect(() => {
    if (focus) zoomToFocus();
    else reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.hex, level?.elevation, entry.file]);

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setZoom((z) => {
      const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z * (e.deltaY < 0 ? 1.2 : 1 / 1.2)));
      setPan((p) => ({x: clampPan(p.x, next), y: clampPan(p.y, next)}));
      return next;
    });
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    if (zoom <= 1) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drag.current = {x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y};
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    const rect = frameRef.current?.getBoundingClientRect();
    if (!d || !rect) return;
    setPan({
      x: clampPan(d.panX + (e.clientX - d.x) / (rect.width * zoom), zoom),
      y: clampPan(d.panY + (e.clientY - d.y) / (rect.height * zoom), zoom),
    });
  };
  const endDrag = () => {
    drag.current = null;
  };

  if (!level) return null;

  return (
    <div className="mapview">
      <div className="mapview__bar">
        {entry.levels.length > 1 &&
          entry.levels.map((l) => (
            <button
              key={l.elevation}
              type="button"
              className={`db-chip${l.elevation === level.elevation ? ' db-chip--on' : ''}`}
              onClick={() => onElevation(l.elevation)}>
              Level {l.elevation + 1}
            </button>
          ))}
        <span className="mapview__spacer" />
        <button type="button" className="db-chip" onClick={() => setZoom((z) => Math.max(MIN_ZOOM, z / 1.5))}>
          −
        </button>
        <span className="mapview__zoom">{zoom.toFixed(1)}×</span>
        <button type="button" className="db-chip" onClick={() => setZoom((z) => Math.min(MAX_ZOOM, z * 1.5))}>
          +
        </button>
        {focus && (
          <button type="button" className="db-chip" onClick={zoomToFocus}>
            Centre
          </button>
        )}
        <button type="button" className="db-chip" onClick={reset}>
          Fit
        </button>
      </div>

      <div
        ref={frameRef}
        className={`mapview__frame${zoom > 1 ? ' mapview__frame--grabbable' : ''}`}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}>
        <div
          className="mapview__stage"
          style={{transform: `scale(${zoom}) translate(${pan.x * 100}%, ${pan.y * 100}%)`}}>
          <img
            className="mapview__img"
            src={`${baseUrl}img/maps/${wantDetail && level.detail ? level.detail : level.base}`}
            alt={`${entry.displayName ?? entry.name}, level ${level.elevation + 1}`}
            width={level.w}
            height={level.h}
            draggable={false}
            loading="lazy"
          />
          {here.map((m, i) => {
            const {x, y} = hexToFraction(m.hex, level);
            return (
              <span
                key={i}
                className={`mapview__marker${m === focus ? ' mapview__marker--on' : ''}`}
                style={{
                  left: `${x * 100}%`,
                  top: `${y * 100}%`,
                  // Un-scale, so a marker stays the same size on screen however far you zoom in.
                  transform: `translate(-50%, -50%) scale(${1 / zoom})`,
                }}
                title={m.label}
              />
            );
          })}
        </div>
      </div>
      <p className="mapview__caption">
        {here.length === 0
          ? 'Nothing on this level.'
          : `${here.length} marker${here.length === 1 ? '' : 's'} on this level. Scroll to zoom, drag to pan.`}
      </p>
    </div>
  );
}
