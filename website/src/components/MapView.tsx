import React, {useEffect, useMemo, useState} from 'react';

/** One map elevation's render, and the world→pixel mapping gecko drew it with. */
export interface MapLevel {
  elevation: number;
  image: string;
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
}

const GRID_WIDTH = 200;
const HEX_WIDTH = 16;
const HEX_HEIGHT = 12;

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

/** Where a hex falls in a given render, as a percentage so the image can be any displayed size. */
function hexToPercent(hex: number, level: MapLevel): {left: number; top: number} {
  const {x, y} = hexToWorld(hex);
  return {
    left: (((x - level.originX) * level.scale) / level.w) * 100,
    top: (((y - level.originY) * level.scale) / level.h) * 100,
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

/**
 * A map render with markers pinned to hexes. The projection comes from the renderer rather than
 * being re-derived here, so a change to how maps are framed moves the markers with the picture.
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
  if (!level) return null;
  const here = markers.filter((m) => m.elevation === level.elevation);

  return (
    <div className="mapview">
      {entry.levels.length > 1 && (
        <div className="mapview__levels">
          {entry.levels.map((l) => (
            <button
              key={l.elevation}
              type="button"
              className={`db-chip${l.elevation === level.elevation ? ' db-chip--on' : ''}`}
              onClick={() => onElevation(l.elevation)}>
              Level {l.elevation + 1}
            </button>
          ))}
        </div>
      )}
      <div className="mapview__frame">
        <img
          className="mapview__img"
          src={`${baseUrl}img/maps/${level.image}`}
          alt={`${entry.displayName ?? entry.name}, level ${level.elevation + 1}`}
          width={level.w}
          height={level.h}
          loading="lazy"
        />
        {here.map((m, i) => {
          const {left, top} = hexToPercent(m.hex, level);
          return (
            <span
              key={i}
              className="mapview__marker"
              style={{left: `${left}%`, top: `${top}%`}}
              title={m.label}
            />
          );
        })}
      </div>
      <p className="mapview__caption">
        {here.length === 0
          ? 'Nothing on this level.'
          : `${here.length} marker${here.length === 1 ? '' : 's'} on this level.`}
      </p>
    </div>
  );
}
