import React, {useCallback, useEffect, useMemo, useState} from 'react';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';
import useBaseUrl from '@docusaurus/useBaseUrl';
import {useHistory, useLocation} from '@docusaurus/router';
import {useProtos, type Proto} from '@site/src/data/protos';
import {
  ANIMATION_LABEL,
  ARMOR_PERKS,
  DAMAGE_TYPES,
  MODE_LABEL,
  SKILL_LABEL,
  minutes,
  perkLabel,
  range,
  signed,
  useEquipment,
  type Ammo,
  type Entry,
  type EquipmentIndex,
} from '@site/src/data/equipment';
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
  /** The world-map area the map belongs to: "The Den", for "The Den › Residential". */
  area?: string | null;
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

/** "The Den › Residential", or just the map's own name when it belongs to no world-map area. */
function mapTitle(info: MapInfo | undefined, file: string): string {
  const own = info?.displayName || info?.name || file.replace(/^.*\//, '');
  return info?.area ? `${info.area} › ${own}` : own;
}

function Row({label, children}: {label: string; children: React.ReactNode}) {
  return (
    <tr>
      <th scope="row">{label}</th>
      <td>{children}</td>
    </tr>
  );
}

/** Everything the item files say about the thing, under its description. */
function Stats({
  entry,
  equipment,
  slugOf,
}: {
  entry: Entry;
  equipment: EquipmentIndex;
  slugOf: (pid: number) => string | null;
}) {
  const rows: React.ReactNode[] = [];
  const {kind, item} = entry;

  if (kind === 'weapon') {
    const w = item;
    const ammo: Ammo[] =
      w.caliber && w.capacity > 0 ? (equipment.ammoByCaliber.get(w.caliber.id) ?? []) : [];
    rows.push(
      <Row key="damage" label="Damage">
        {range(w.damage[0], w.damage[1])}
        {w.damageType !== 'normal' ? ` ${w.damageType}` : ''}
      </Row>,
      <Row key="skill" label="Skill">
        {[...new Set(w.attacks.map((a) => SKILL_LABEL[a.skill] ?? a.skill))].join(' / ') || '—'}
      </Row>,
      <Row key="attacks" label="Attacks">
        <ul className="db-stats__list">
          {w.attacks.map((a, i) => (
            <li key={i}>
              <b>{MODE_LABEL[a.mode] ?? a.mode}</b> — {a.ap} AP, range {a.range}
              {a.rounds ? `, ${a.rounds} rounds` : ''}
            </li>
          ))}
        </ul>
      </Row>,
      <Row key="st" label="Minimum Strength">
        {w.minStrength}
        {w.minStrength > 0 ? ' (−20% to hit for each point you are short)' : ''}
      </Row>,
    );
    if (w.caliber && w.capacity > 0) {
      rows.push(
        <Row key="ammo" label="Ammunition">
          {w.caliber.id === 0 ? `${w.capacity} rounds` : `${w.caliber.name}, ${w.capacity} rounds`}
          {ammo.length > 0 && (
            <ul className="db-stats__list">
              {ammo.map((a) => (
                <li key={a.pid}>
                  {slugOf(a.pid) ? <Link to={`/database/${slugOf(a.pid)}`}>{a.name}</Link> : a.name}
                  {a.pid === w.defaultAmmo ? ' (loaded by default)' : ''} — damage ×{a.mult}/{a.div},
                  DR {signed(a.drMod)}, AC {signed(a.acMod)}
                </li>
              ))}
            </ul>
          )}
        </Row>,
      );
    }
    if (w.perk) {
      rows.push(
        <Row key="perk" label="Perk">
          {perkLabel(w.perk)}
        </Row>,
      );
    }
    rows.push(
      <Row key="hands" label="Handling">
        {w.twoHanded ? 'Two-handed' : 'One-handed'}
        {w.animation ? ` · needs the ${ANIMATION_LABEL[w.animation] ?? w.animation} animation` : ''}
      </Row>,
    );
  }

  if (kind === 'ammo') {
    const a = item;
    rows.push(
      <Row key="caliber" label="Caliber">
        {a.caliber.id === 0 ? '—' : a.caliber.name}
      </Row>,
      <Row key="mult" label="Damage multiplier">
        ×{a.mult}/{a.div}
      </Row>,
      <Row key="dr" label="Damage resistance modifier">
        {signed(a.drMod)} — added to the target's DR, so a positive number costs you damage
      </Row>,
      <Row key="ac" label="Armour class modifier">
        {signed(a.acMod)}
      </Row>,
      <Row key="qty" label="Rounds per box">
        {a.quantity}
      </Row>,
    );
  }

  if (kind === 'armor') {
    const a = item;
    rows.push(
      <Row key="ac" label="Armour class">
        {a.ac}
      </Row>,
      <Row key="dtdr" label="DT / DR">
        <table className="db-stats__inner">
          <tbody>
            {DAMAGE_TYPES.map((t) => (
              <tr key={t}>
                <td>{t}</td>
                <td>
                  {a.dt[t]} / {Math.min(a.dr[t], t === 'emp' ? 100 : 90)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <span className="db-stats__note">
          Damage taken is reduced by DT first, then by DR, and the engine caps resistance at 90% (100%
          against EMP). People and animals already resist EMP completely in their own files, armour or
          not — it is a weapon against robots.
        </span>
      </Row>,
    );
    if (a.perk) {
      rows.push(
        <Row key="perk" label="Wearing it gives">
          {ARMOR_PERKS[a.perk.id] ?? a.perk.name}
        </Row>,
      );
    }
  }

  if (kind === 'drug') {
    const d = item;
    const effects = (list: {stat: string; min: number; max: number}[]) =>
      list.map((e) => `${e.stat} ${signed(e.min)}${e.min === e.max ? '' : ` to ${signed(e.max)}`}`).join(', ');
    rows.push(
      <Row key="now" label="Straight away">
        {effects(d.now) || 'Nothing'}
      </Row>,
    );
    if (d.then.effects.length > 0) {
      rows.push(
        <Row key="then" label={`After ${minutes(d.then.minutes)}`}>
          {effects(d.then.effects)}
        </Row>,
      );
    }
    if (d.later.effects.length > 0) {
      rows.push(
        <Row key="later" label={`After ${minutes(d.later.minutes)}`}>
          {effects(d.later.effects)}
        </Row>,
      );
    }
    if (d.addictionChance > 0) {
      rows.push(
        <Row key="addiction" label="Addiction">
          {d.addictionChance}% chance
          {d.withdrawalPerk ? `, withdrawal after ${minutes(d.withdrawalOnset)}` : ''}
        </Row>,
      );
    }
  }

  if (kind === 'container') {
    rows.push(
      <Row key="capacity" label="Holds">
        {item.capacity} lb
      </Row>,
    );
  }

  if (kind === 'other' && item.charges) {
    rows.push(
      <Row key="charges" label="Charges">
        {item.charges}
      </Row>,
    );
  }

  rows.push(
    <Row key="weight" label="Weight">
      {item.weight} lb
    </Row>,
    <Row key="cost" label="Base price">
      ${item.cost}
    </Row>,
  );

  return (
    <table className="db-stats">
      <tbody>{rows}</tbody>
    </table>
  );
}

interface Group {
  map: string;
  info: MapInfo | undefined;
  rows: Entity[];
}

/** Where the thing is: one row per map, opening onto its placements and the map itself. */
function Locations({
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
  const groups = useMemo(() => {
    const byMap = new Map<string, Group>();
    for (const row of rows) {
      const group = byMap.get(row.map) ?? {map: row.map, info: maps.get(row.map), rows: []};
      group.rows.push(row);
      byMap.set(row.map, group);
    }
    return [...byMap.values()].sort((a, b) => mapTitle(a.info, a.map).localeCompare(mapTitle(b.info, b.map)));
  }, [rows, maps]);

  // The first map opens on its own, so something is always on screen; the rest are one click away.
  const [open, setOpen] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const [hovered, setHovered] = useState<number | null>(null);
  const [elevation, setElevation] = useState(0);
  useEffect(() => {
    const first = groups[0];
    setOpen(first ? first.map : null);
    setActive(0);
    setElevation(first ? first.rows[0].elevation : 0);
  }, [proto.pid, groups]);

  const show = useCallback((group: Group, index: number) => {
    setOpen(group.map);
    setActive(index);
    setElevation(group.rows[index].elevation);
  }, []);

  if (rows.length === 0) {
    return (
      <p className="db-empty">
        No shipped map places one. It may still come from a script — a reward, a shopkeeper's stock or a
        random encounter.
      </p>
    );
  }

  return (
    <table className="db-table">
      <thead>
        <tr>
          <th>Map</th>
          <th>Here</th>
        </tr>
      </thead>
      {groups.map((group) => {
        const isOpen = open === group.map;
        const entry = mapEntries?.find((m) => m.file === group.map);
        const count = group.rows.reduce((sum, r) => sum + (r.qty && r.qty > 1 ? r.qty : 1), 0);
        return (
          <tbody key={group.map}>
            <tr className="db-group" onClick={() => (isOpen ? setOpen(null) : show(group, 0))}>
              <th scope="rowgroup">
                <button type="button" className="db-group__toggle" aria-expanded={isOpen}>
                  <span className="db-group__chevron">{isOpen ? '▾' : '▸'}</span>
                  {mapTitle(group.info, group.map)}
                </button>
              </th>
              <td>
                {count}
                {count !== group.rows.length ? ` in ${group.rows.length} places` : count === 1 ? '' : ' places'}
              </td>
            </tr>
            {isOpen && (
              <>
                {group.rows.map((row, i) => (
                  <tr
                    key={i}
                    className={`db-place${i === active ? ' db-place--on' : ''}`}
                    onClick={() => show(group, i)}
                    onMouseEnter={() => setHovered(i)}
                    onMouseLeave={() => setHovered(null)}>
                    <td>
                      Level {row.elevation + 1} ·{' '}
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
                ))}
                <tr className="db-mapcell">
                  <td colSpan={2}>
                    {entry ? (
                      <MapView
                        entry={entry}
                        baseUrl={baseUrl}
                        elevation={elevation}
                        onElevation={setElevation}
                        markers={group.rows.map((r, i) => ({
                          hex: r.hex,
                          elevation: r.elevation,
                          label: proto.name,
                          active: i === (hovered ?? active),
                        }))}
                      />
                    ) : (
                      <p className="db-empty">No render for this map.</p>
                    )}
                  </td>
                </tr>
              </>
            )}
          </tbody>
        );
      })}
    </table>
  );
}

function Detail({
  proto,
  rows,
  maps,
  mapEntries,
  baseUrl,
  equipment,
  slugOf,
}: {
  proto: Proto;
  rows: Entity[];
  maps: Map<string, MapInfo>;
  mapEntries: MapEntry[] | null;
  baseUrl: string;
  equipment: EquipmentIndex | null;
  slugOf: (pid: number) => string | null;
}) {
  const entry = equipment?.byPid.get(proto.pid);
  return (
    <div className="db-detail">
      <div className="db-detail__head">
        <img className="db-detail__icon" src={`${baseUrl}img/db/${proto.pid}.png`} alt="" />
        <div>
          <h2 className="db-detail__name">{proto.name}</h2>
          <p className="db-detail__meta">
            {entry ? entry.kind : proto.kind} · proto {proto.pid}
          </p>
        </div>
      </div>
      {proto.description && <p className="db-detail__desc">{proto.description}</p>}

      {entry && <Stats entry={entry} equipment={equipment!} slugOf={slugOf} />}

      <h3>
        {rows.length === 0
          ? 'Not placed on any map'
          : `${rows.length} location${rows.length === 1 ? '' : 's'}`}
      </h3>
      <Locations proto={proto} rows={rows} maps={maps} mapEntries={mapEntries} baseUrl={baseUrl} />
    </div>
  );
}

export default function Database(): React.ReactElement {
  const baseUrl = useBaseUrl('/');
  const protos = useProtos(baseUrl);
  const equipment = useEquipment(baseUrl);
  const data = useEntities(baseUrl);
  const mapEntries = useMaps(baseUrl);
  const history = useHistory();
  const location = useLocation();
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('all');

  // /database/10mm_SMG is the address of an entry; ?id=9 still works for older links.
  const slug = useMemo(() => {
    const match = location.pathname.match(/\/database\/([^/]+)\/?$/);
    return match ? decodeURIComponent(match[1]).toLowerCase() : null;
  }, [location.pathname]);
  const [legacyId, setLegacyId] = useState<number | null>(null);
  useEffect(() => {
    const id = new URLSearchParams(location.search).get('id');
    if (id) setLegacyId(Number(id));
  }, [location.search]);

  const chosen = slug ? protos?.bySlug.get(slug) : legacyId != null ? protos?.byPid.get(legacyId) : undefined;

  const slugOf = useCallback((pid: number) => protos?.byPid.get(pid)?.slug ?? null, [protos]);

  const open = useCallback(
    (proto: Proto) => {
      history.push(`${baseUrl}database/${proto.slug}`);
    },
    [history, baseUrl],
  );

  const results = useMemo(() => {
    if (!protos) return [];
    const q = query.trim().toLowerCase();
    const matchesKind = (p: Proto) => {
      if (kind === 'all') return true;
      if (kind === 'item' || kind === 'critter') return p.kind === kind;
      return equipment?.byPid.get(p.pid)?.kind === kind;
    };
    return protos.all
      .filter(matchesKind)
      .filter((p) => (q ? p.name.toLowerCase().includes(q) : true))
      .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name))
      .slice(0, 300);
  }, [protos, query, kind, equipment]);

  const mapIndex = useMemo(() => {
    const m = new Map<string, MapInfo>();
    for (const info of data?.maps ?? []) m.set(info.file, info);
    return m;
  }, [data]);

  const rows = useMemo(
    () => (chosen ? (data?.entities ?? []).filter((e) => e.pid === chosen.pid) : []),
    [data, chosen],
  );

  const filters: [string, string][] = [
    ['all', 'Everything'],
    ['item', 'Items'],
    ['critter', 'Critters'],
    ['weapon', 'Weapons'],
    ['ammo', 'Ammunition'],
    ['armor', 'Armour'],
    ['drug', 'Chems'],
  ];

  return (
    <Layout
      title={chosen ? chosen.name : 'Object Database'}
      description={
        chosen
          ? `${chosen.name} — what it does and where to find it in Fallout 2.`
          : 'Every item and critter on the maps, what it does and where to find it.'
      }>
      <main className="container margin-vert--lg">
        <h1>Object Database</h1>
        <p>
          Every item and critter the shipped maps place, read straight out of the game files —
          what each one does, and where to find it, including inside containers.{' '}
          {protos ? `${protos.all.length} entries.` : 'Loading…'}
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
          {filters.map(([k, label]) => (
            <button
              key={k}
              type="button"
              className={`db-chip${kind === k ? ' db-chip--on' : ''}`}
              onClick={() => setKind(k)}>
              {label}
            </button>
          ))}
        </div>

        <div className={`db-layout${chosen ? ' db-layout--detail' : ''}`}>
          <ul className="db-list">
            {results.map((p) => (
              <li key={p.pid}>
                <button
                  type="button"
                  className={`db-row${chosen?.pid === p.pid ? ' db-row--on' : ''}`}
                  onClick={() => open(p)}>
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
                <Detail
                  proto={chosen}
                  rows={rows}
                  maps={mapIndex}
                  mapEntries={mapEntries}
                  baseUrl={baseUrl}
                  equipment={equipment}
                  slugOf={slugOf}
                />
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
