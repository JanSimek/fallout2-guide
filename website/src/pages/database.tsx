import React, {useEffect, useMemo, useState} from 'react';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';
import useBaseUrl from '@docusaurus/useBaseUrl';
import {useProtos, type Proto} from '@site/src/data/protos';
import MapView, {useMaps, type MapEntry} from '@site/src/components/MapView';

interface Entity {
  kind: string;
  pid: number;
  name: string;
  map: string;
  elevation: number;
  hex: number;
  col: number;
  row: number;
  qty?: number;
  holder?: {kind: string; pid: number; name: string};
  script?: {programIndex: number; name: string; description: string};
}
interface MapInfo {
  file: string;
  name: string;
  displayName: string | null;
  lookupName?: string | null;
}

/** The location rows, fetched only here — a walkthrough page never pays for them. */
function useEntities(baseUrl: string) {
  const [data, setData] = useState<{entities: Entity[]; maps: MapInfo[]} | null>(null);
  useEffect(() => {
    let live = true;
    fetch(`${baseUrl}data/entities.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => live && setData(d))
      .catch(() => live && setData({entities: [], maps: []}));
    return () => {
      live = false;
    };
  }, [baseUrl]);
  return data;
}

function Detail({
  proto,
  rows,
  maps,
  mapEntries,
  baseUrl,
}: {
  proto: Proto;
  rows: Entity[];
  maps: Map<string, MapInfo>;
  mapEntries: MapEntry[] | null;
  baseUrl: string;
}) {
  // Which location row the map is showing. Reset whenever the entry changes, so opening something
  // new never leaves the previous thing's map on screen.
  const [shown, setShown] = React.useState(0);
  React.useEffect(() => setShown(0), [proto.pid]);
  const active = rows[shown];
  const entry = mapEntries?.find((m) => m.file === active?.map);
  const [elevation, setElevation] = React.useState(active?.elevation ?? 0);
  React.useEffect(() => setElevation(active?.elevation ?? 0), [active]);
  const icon = `${baseUrl}img/db/${proto.pid}.png`;
  return (
    <div className="db-detail">
      <div className="db-detail__head">
        <img className="db-detail__icon" src={icon} alt="" />
        <div>
          <h2 className="db-detail__name">{proto.name}</h2>
          <p className="db-detail__meta">
            {proto.kind} · proto {proto.pid}
          </p>
        </div>
      </div>
      {proto.description && <p className="db-detail__desc">{proto.description}</p>}

      <h3>
        {rows.length === 0
          ? 'Not placed on any map'
          : `${rows.length} location${rows.length === 1 ? '' : 's'}`}
      </h3>
      {rows.length > 0 && (
        <table className="db-table">
          <thead>
            <tr>
              <th>Map</th>
              <th>Level</th>
              <th>Where</th>
              <th>Position</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const info = maps.get(row.map);
              return (
                <tr
                  key={i}
                  className={`db-table__row${i === shown ? ' db-table__row--on' : ''}`}
                  onClick={() => setShown(i)}>
                  <td>{info?.displayName || info?.name || row.map}</td>
                  <td>{row.elevation + 1}</td>
                  <td>
                    {row.holder ? (
                      <>
                        in a <strong>{row.holder.name}</strong>
                      </>
                    ) : row.script?.description ? (
                      row.script.description
                    ) : (
                      'on the ground'
                    )}
                    {row.qty && row.qty > 1 ? ` ×${row.qty}` : ''}
                  </td>
                  <td className="db-table__pos">
                    hex {row.hex} · col {row.col}, row {row.row}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {entry && active && (
        <MapView
          entry={entry}
          baseUrl={baseUrl}
          elevation={elevation}
          onElevation={setElevation}
          markers={rows
            .filter((r) => r.map === active.map)
            .map((r) => ({hex: r.hex, elevation: r.elevation, label: proto.name}))}
        />
      )}
    </div>
  );
}

export default function Database(): React.ReactElement {
  const baseUrl = useBaseUrl('/');
  const protos = useProtos(baseUrl);
  const data = useEntities(baseUrl);
  const mapEntries = useMaps(baseUrl);
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('all');
  const [selected, setSelected] = useState<number | null>(null);

  // Deep links: /database?id=262 opens that entry. Read once, then the page owns the selection.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('id');
    if (id) setSelected(Number(id));
  }, []);

  const results = useMemo(() => {
    if (!protos) return [];
    const q = query.trim().toLowerCase();
    return protos.all
      .filter((p) => (kind === 'all' ? true : p.kind === kind))
      .filter((p) => (q ? p.name.toLowerCase().includes(q) : true))
      .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name))
      .slice(0, 300);
  }, [protos, query, kind]);

  const mapIndex = useMemo(() => {
    const m = new Map<string, MapInfo>();
    for (const info of data?.maps ?? []) m.set(info.file, info);
    return m;
  }, [data]);

  const chosen = selected != null ? protos?.byPid.get(selected) : undefined;
  const rows = useMemo(
    () => (selected == null ? [] : (data?.entities ?? []).filter((e) => e.pid === selected)),
    [data, selected],
  );

  return (
    <Layout title="Object Database" description="Every item and critter on the maps, and where to find it.">
      <main className="container margin-vert--lg">
        <h1>Object Database</h1>
        <p>
          Every item and critter the shipped maps place, read straight out of the game files —
          including what is inside containers. {protos ? `${protos.all.length} entries.` : 'Loading…'}
        </p>

        <div className="db-controls">
          <input
            className="db-search"
            type="search"
            placeholder="Search by name…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search the object database"
          />
          {['all', 'item', 'critter'].map((k) => (
            <button
              key={k}
              type="button"
              className={`db-chip${kind === k ? ' db-chip--on' : ''}`}
              onClick={() => setKind(k)}>
              {k === 'all' ? 'Everything' : k === 'item' ? 'Items' : 'Critters'}
            </button>
          ))}
        </div>

        <div className="db-layout">
          <ul className="db-list">
            {results.map((p) => (
              <li key={p.pid}>
                <button
                  type="button"
                  className={`db-row${selected === p.pid ? ' db-row--on' : ''}`}
                  onClick={() => setSelected(p.pid)}>
                  <img className="db-row__icon" src={`${baseUrl}img/db/${p.pid}.png`} alt="" loading="lazy" />
                  <span className="db-row__name">{p.name}</span>
                  <span className="db-row__count">{p.n || '—'}</span>
                </button>
              </li>
            ))}
            {protos && results.length === 0 && <li className="db-empty">Nothing matches.</li>}
          </ul>

          <div className="db-pane">
            {chosen ? (
              data ? (
                <Detail proto={chosen} rows={rows} maps={mapIndex} mapEntries={mapEntries} baseUrl={baseUrl} />
              ) : (
                <p>Loading locations…</p>
              )
            ) : (
              <p className="db-empty">
                Pick something on the left, or follow an <Link to={`${baseUrl}walkthrough/klamath`}>item link</Link>{' '}
                from the walkthrough.
              </p>
            )}
          </div>
        </div>
      </main>
    </Layout>
  );
}
