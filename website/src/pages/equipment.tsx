import React, {useEffect, useMemo, useState} from 'react';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';
import useBaseUrl from '@docusaurus/useBaseUrl';
import {
  AIM,
  ARMOR_PERKS,
  DAMAGE_TYPES,
  SOLAR_SCORCHER,
  perkLabel,
  compatibleAmmo,
  effectiveRange,
  summarise,
  targetResistance,
  type Aim,
  type Ammo,
  type Armor,
  type Equipment,
  type Formula,
  type Shooter,
  type Skill,
  type Target,
  type Weapon,
} from '@site/src/lib/combat';

const SKILL_LABEL: Record<Skill, string> = {
  small_guns: 'Small Guns',
  big_guns: 'Big Guns',
  energy_weapons: 'Energy Weapons',
  unarmed: 'Unarmed',
  melee_weapons: 'Melee Weapons',
  throwing: 'Throwing',
};
const SKILLS = Object.keys(SKILL_LABEL) as Skill[];

const MODE_LABEL: Record<string, string> = {
  punch: 'Punch',
  kick: 'Kick',
  swing: 'Swing',
  thrust: 'Thrust',
  throw: 'Throw',
  single: 'Single',
  burst: 'Burst',
  flame: 'Flame',
};

const AIM_LABEL: Record<Aim, string> = {
  none: 'Not aimed',
  torso: 'Torso',
  head: 'Head',
  eyes: 'Eyes',
  groin: 'Groin',
  arm: 'Arm',
  leg: 'Leg',
};

const FORMULA_LABEL: Record<Formula, string> = {
  0: 'Original (default)',
  1: 'Glovz',
  2: 'Glovz + tweak',
  5: 'YAAM',
};

const DISTANCES = [1, 2, 3, 5, 8, 10, 12, 15, 20, 25, 30, 35, 40, 45, 50];

function useEquipment(baseUrl: string) {
  const [data, setData] = useState<Equipment | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    fetch(`${baseUrl}data/equipment.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => live && setData(d))
      .catch(() => live && setData(null));
    return () => {
      live = false;
    };
  }, [baseUrl]);
  return data;
}

const fmt = (n: number, digits = 1) => (Number.isFinite(n) ? n.toFixed(digits) : '—');

function NumberInput({
  label,
  value,
  onChange,
  min,
  max,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
}) {
  return (
    <label className="eq-field">
      <span>{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v)) onChange(Math.max(min, Math.min(max, Math.round(v))));
        }}
      />
    </label>
  );
}

type SortKey = 'name' | 'damage' | 'ap' | 'range' | 'st' | 'hit' | 'perHit' | 'perAp' | 'weight';

/** Which ammunition a row is computed with: the weapon's own default, or whatever does most here. */
function pickAmmo(
  weapon: Weapon,
  ammoList: Ammo[],
  mode: 'default' | 'best',
  score: (a: Ammo | null) => number,
): Ammo | null {
  const usable = compatibleAmmo(weapon, ammoList);
  if (usable.length === 0) return null;
  if (mode === 'default') {
    return usable.find((a) => a.pid === weapon.defaultAmmo) ?? usable[0];
  }
  return usable.reduce((best, a) => (score(a) > score(best) ? a : best), usable[0]);
}

function WeaponDetail({
  weapon,
  data,
  shooter,
  target,
  formula,
  distance,
  aim,
}: {
  weapon: Weapon;
  data: Equipment;
  shooter: Shooter;
  target: Target;
  formula: Formula;
  distance: number;
  aim: Aim;
}) {
  const ammo = compatibleAmmo(weapon, data.ammo);
  const defaultAmmo = ammo.find((a) => a.pid === weapon.defaultAmmo) ?? ammo[0] ?? null;
  const [ammoPid, setAmmoPid] = useState<number | null>(defaultAmmo?.pid ?? null);
  useEffect(() => setAmmoPid(defaultAmmo?.pid ?? null), [weapon.pid]);
  const chosen = ammo.find((a) => a.pid === ammoPid) ?? defaultAmmo;
  const usedBy = (a: Ammo) => data.weapons.filter((w) => !w.hidden && w.caliber?.id === a.caliber.id && w.capacity > 0);

  return (
    <div className="eq-detail">
      <h2>{weapon.name}</h2>
      {weapon.description && <p className="eq-detail__desc">{weapon.description}</p>}
      <p className="eq-detail__meta">
        Damage <b>{weapon.damage[0]}–{weapon.damage[1]}</b> {weapon.damageType} · Min ST {weapon.minStrength}
        {weapon.twoHanded ? ' · two-handed' : ''} · {weapon.weight} lb · ${weapon.cost}
        {weapon.perk ? ` · perk: ${perkLabel(weapon.perk)}` : ''}
        {weapon.pid === SOLAR_SCORCHER
          ? ` · ${weapon.capacity} charges, recharged in bright daylight`
          : ammo.length > 0
            ? ` · ${weapon.caliber!.id === 0 ? '' : `${weapon.caliber!.name}, `}${weapon.capacity} rounds`
            : ''}{' '}
        ·{' '}
        <Link to={`/database?id=${weapon.pid}`}>where to find it</Link>
      </p>

      <h3>Attacks</h3>
      <div className="eq-scroll">
        <table>
          <thead>
            <tr>
              <th>Mode</th>
              <th>Skill</th>
              <th>AP</th>
              <th>Range</th>
              <th>Rounds</th>
              <th>Can hit target</th>
            </tr>
          </thead>
          <tbody>
            {weapon.attacks.map((a, i) => {
              const s = summarise(shooter, weapon, a, target, chosen, formula, distance, aim);
              return (
                <tr key={i}>
                  <td>{MODE_LABEL[a.mode]}</td>
                  <td>{SKILL_LABEL[a.skill]}</td>
                  <td>{a.ap}</td>
                  <td>
                    {effectiveRange(a, shooter.strength)}
                    {a.mode === 'throw' && effectiveRange(a, shooter.strength) < a.range ? ` (of ${a.range})` : ''}
                  </td>
                  <td>{a.rounds ?? 1}</td>
                  <td>{s.rounds}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {ammo.length > 0 && (
        <>
          <h3>Ammunition</h3>
          <div className="eq-scroll">
            <table>
              <thead>
                <tr>
                  <th />
                  <th>Ammunition</th>
                  <th>Damage ×</th>
                  <th>DR mod</th>
                  <th>AC mod</th>
                  <th>Per hit here</th>
                  <th>Also fits</th>
                </tr>
              </thead>
              <tbody>
                {ammo.map((a) => {
                  const s = summarise(shooter, weapon, weapon.attacks[0], target, a, formula, distance, aim);
                  return (
                    <tr key={a.pid}>
                      <td>
                        <input
                          type="radio"
                          name="eq-ammo"
                          checked={chosen?.pid === a.pid}
                          onChange={() => setAmmoPid(a.pid)}
                          aria-label={`Use ${a.name}`}
                        />
                      </td>
                      <td>
                        {a.name}
                        {a.pid === weapon.defaultAmmo ? ' (default)' : ''}
                      </td>
                      <td>
                        {a.mult}/{a.div}
                      </td>
                      <td>{a.drMod > 0 ? `+${a.drMod}` : a.drMod}</td>
                      <td>{a.acMod > 0 ? `+${a.acMod}` : a.acMod}</td>
                      <td>{fmt(s.perHit)}</td>
                      <td className="eq-muted">
                        {usedBy(a)
                          .filter((w) => w.pid !== weapon.pid)
                          .map((w) => w.name)
                          .join(', ') || '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      <h3>Chance to hit by distance</h3>
      <p className="eq-muted">
        Hexes. Damage does not change with distance — only the chance to hit does. Beyond the weapon's range the
        attack is not possible, shown as —.
      </p>
      <div className="eq-scroll">
        <table>
          <thead>
            <tr>
              <th>Attack</th>
              {DISTANCES.map((d) => (
                <th key={d}>{d}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {weapon.attacks.map((a, i) => (
              <tr key={i}>
                <td>{MODE_LABEL[a.mode]}</td>
                {DISTANCES.map((d) => {
                  const s = summarise(shooter, weapon, a, target, chosen, formula, d, aim);
                  return <td key={d}>{s.inRange ? `${s.hit}%` : '—'}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3>Damage per hit against each armour</h3>
      <p className="eq-muted">
        Average of every possible roll, {chosen ? `with ${chosen.name}` : 'no ammunition'}, for the{' '}
        {FORMULA_LABEL[formula].toLowerCase()} formula. {weapon.damageType} damage. DT and DR as the game applies
        them: the wearer's own plus the armour's, with DR capped at 90% (100% for EMP).
      </p>
      <div className="eq-scroll">
        <table>
          <thead>
            <tr>
              <th>Armour</th>
              <th>DT/DR ({weapon.damageType})</th>
              <th>Per hit</th>
            </tr>
          </thead>
          <tbody>
            {[null, ...data.armor].map((armor) => {
              const t = {baseAc: target.baseAc, armor};
              const s = summarise(shooter, weapon, weapon.attacks[0], t, chosen, formula, distance, aim);
              const r = targetResistance(t, weapon.damageType);
              return (
                <tr key={armor?.pid ?? 0}>
                  <td>{armor?.name ?? 'No armour'}</td>
                  <td>
                    {r.dt}/{r.dr}%
                  </td>
                  <td>{fmt(s.perHit)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function WeaponsTab({
  data,
  shooter,
  target,
  formula,
  distance,
  aim,
}: {
  data: Equipment;
  shooter: Shooter;
  target: Target;
  formula: Formula;
  distance: number;
  aim: Aim;
}) {
  const [query, setQuery] = useState('');
  const [skill, setSkill] = useState<Skill | 'all'>('all');
  const [ammoMode, setAmmoMode] = useState<'default' | 'best'>('default');
  const [sort, setSort] = useState<{key: SortKey; desc: boolean}>({key: 'perAp', desc: true});
  const [selected, setSelected] = useState<number | null>(null);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('weapon');
    if (id) setSelected(Number(id));
  }, []);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.weapons
      .filter((w) => !w.hidden && w.attacks.length > 0)
      .filter((w) => (q ? w.name.toLowerCase().includes(q) : true))
      .filter((w) => (skill === 'all' ? true : w.attacks.some((a) => a.skill === skill)))
      .flatMap((w) =>
        w.attacks
          .filter((a) => skill === 'all' || a.skill === skill)
          .map((a) => {
            const score = (am: Ammo | null) =>
              summarise(shooter, w, a, target, am, formula, distance, aim).perAp;
            const ammo = pickAmmo(w, data.ammo, ammoMode, score);
            return {weapon: w, attack: a, ammo, s: summarise(shooter, w, a, target, ammo, formula, distance, aim)};
          }),
      );
  }, [data, query, skill, ammoMode, shooter, target, formula, distance, aim]);

  const sorted = useMemo(() => {
    const value = (r: (typeof rows)[number]): number | string => {
      switch (sort.key) {
        case 'name':
          return r.weapon.name;
        case 'damage':
          return (r.weapon.damage[0] + r.weapon.damage[1]) / 2;
        case 'ap':
          return r.attack.ap;
        case 'range':
          return effectiveRange(r.attack, shooter.strength);
        case 'st':
          return r.weapon.minStrength;
        case 'hit':
          return r.s.inRange ? r.s.hit : -1;
        case 'perHit':
          return r.s.perHit * r.s.rounds;
        case 'perAp':
          return r.s.inRange ? r.s.perAp : -1;
        case 'weight':
          return r.weapon.weight;
      }
    };
    return [...rows].sort((a, b) => {
      const va = value(a);
      const vb = value(b);
      const c = typeof va === 'string' ? va.localeCompare(vb as string) : (va as number) - (vb as number);
      return sort.desc ? -c : c;
    });
  }, [rows, sort, shooter.strength]);

  const header = (key: SortKey, label: string, title?: string) => (
    <th>
      <button
        type="button"
        className="eq-sort"
        title={title}
        onClick={() => setSort((s) => ({key, desc: s.key === key ? !s.desc : key !== 'name'}))}>
        {label}
        {sort.key === key ? (sort.desc ? ' ▾' : ' ▴') : ''}
      </button>
    </th>
  );

  const chosen = data.weapons.find((w) => w.pid === selected);

  return (
    <>
      <div className="db-controls">
        <input
          className="db-search"
          type="search"
          placeholder="Search weapons…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search weapons"
        />
        {(['all', ...SKILLS] as const).map((k) => (
          <button
            key={k}
            type="button"
            className={`db-chip${skill === k ? ' db-chip--on' : ''}`}
            onClick={() => setSkill(k)}>
            {k === 'all' ? 'All' : SKILL_LABEL[k]}
          </button>
        ))}
      </div>
      <div className="db-controls">
        <span className="eq-muted">Ammunition:</span>
        {(['default', 'best'] as const).map((m) => (
          <button
            key={m}
            type="button"
            className={`db-chip${ammoMode === m ? ' db-chip--on' : ''}`}
            onClick={() => setAmmoMode(m)}>
            {m === 'default' ? "Weapon's default" : 'Best against this target'}
          </button>
        ))}
      </div>

      <div className="eq-scroll">
        <table className="eq-table">
          <thead>
            <tr>
              {header('name', 'Weapon')}
              <th>Attack</th>
              {header('perAp', 'Dmg/AP', 'Expected damage per action point: expected rounds on target × damage per round ÷ AP')}
              {header('hit', 'Hit %', 'Chance to hit at the distance above')}
              {header('perHit', 'Dmg/attack', 'Average damage per round that hits, times the most rounds that can hit the target (a third of a burst)')}
              <th>Skill</th>
              {header('damage', 'Damage')}
              {header('ap', 'AP')}
              {header('range', 'Range')}
              {header('st', 'Min ST')}
              <th>Ammunition</th>
              <th>Perk</th>
              {header('weight', 'Wt')}
            </tr>
          </thead>
          <tbody>
            {sorted.map(({weapon: w, attack: a, ammo, s}, i) => (
              <tr
                key={`${w.pid}-${a.mode}-${i}`}
                className={selected === w.pid ? 'eq-row--on' : undefined}
                onClick={() => setSelected(w.pid)}>
                <td>
                  <button type="button" className="eq-link" onClick={() => setSelected(w.pid)}>
                    {w.name}
                  </button>
                </td>
                <td>
                  {MODE_LABEL[a.mode]}
                  {a.rounds ? ` ×${a.rounds}` : ''}
                </td>
                <td>
                  <b>{s.inRange ? fmt(s.perAp, 2) : '—'}</b>
                </td>
                <td>{s.inRange ? `${s.hit}%` : 'out of range'}</td>
                <td>{fmt(s.perHit * s.rounds)}</td>
                <td>{SKILL_LABEL[a.skill]}</td>
                <td>
                  {w.damage[0]}–{w.damage[1]}
                  {w.damageType !== 'normal' ? ` ${w.damageType}` : ''}
                </td>
                <td>{a.ap}</td>
                <td>{effectiveRange(a, shooter.strength)}</td>
                <td className={w.minStrength > shooter.strength ? 'eq-warn' : undefined}>{w.minStrength}</td>
                <td>{w.pid === SOLAR_SCORCHER ? 'Daylight' : ammo ? ammo.name : w.caliber ? '—' : ''}</td>
                <td>{perkLabel(w.perk)}</td>
                <td>{w.weight}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {chosen && (
        <WeaponDetail
          weapon={chosen}
          data={data}
          shooter={shooter}
          target={target}
          formula={formula}
          distance={distance}
          aim={aim}
        />
      )}
    </>
  );
}

function armorPerk(a: Armor): string {
  const effect = a.perk ? ARMOR_PERKS[a.perk.id] : undefined;
  if (!a.perk) return '';
  if (!effect) return a.perk.name;
  const parts = [effect.strength ? `+${effect.strength} ST` : '', `+${effect.radiation}% radiation resistance`];
  return parts.filter(Boolean).join(', ');
}

function ArmorTab({data}: {data: Equipment}) {
  return (
    <>
      <p className="eq-muted">
        DT and DR as the item lists them. Worn, they add to the wearer's own, and the game caps the total DR at
        90% — 100% against EMP, where people and animals already have 500%. Armour perks work for you and
        your companions only.
      </p>
      <div className="eq-scroll">
        <table className="eq-table">
          <thead>
            <tr>
              <th>Armour</th>
              <th>AC</th>
              {DAMAGE_TYPES.map((t) => (
                <th key={t}>
                  {t}
                  <br />
                  <span className="eq-muted">DT/DR</span>
                </th>
              ))}
              <th>Also gives</th>
              <th>Wt</th>
              <th>Cost</th>
            </tr>
          </thead>
          <tbody>
            {[...data.armor]
              .sort((a, b) => b.ac - a.ac || a.name.localeCompare(b.name))
              .map((a: Armor) => (
                <tr key={a.pid}>
                  <td>
                    <Link to={`/database?id=${a.pid}`}>{a.name}</Link>
                  </td>
                  <td>{a.ac}</td>
                  {DAMAGE_TYPES.map((t) => (
                    <td key={t}>
                      {a.dt[t]}/{a.dr[t]}%
                    </td>
                  ))}
                  <td>{armorPerk(a)}</td>
                  <td>{a.weight}</td>
                  <td>{a.cost}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function AmmoTab({data}: {data: Equipment}) {
  return (
    <div className="eq-scroll">
      <table className="eq-table">
        <thead>
          <tr>
            <th>Ammunition</th>
            <th>Caliber</th>
            <th>Damage ×</th>
            <th>DR mod</th>
            <th>AC mod</th>
            <th>Per box</th>
            <th>Cost</th>
            <th>Fits</th>
          </tr>
        </thead>
        <tbody>
          {[...data.ammo]
            .sort((a, b) => a.caliber.name.localeCompare(b.caliber.name) || a.name.localeCompare(b.name))
            .map((a) => (
              <tr key={a.pid}>
                <td>
                  <Link to={`/database?id=${a.pid}`}>{a.name}</Link>
                </td>
                <td>{a.caliber.id === 0 ? '—' : a.caliber.name}</td>
                <td>
                  {a.mult}/{a.div}
                </td>
                <td>{a.drMod > 0 ? `+${a.drMod}` : a.drMod}</td>
                <td>{a.acMod > 0 ? `+${a.acMod}` : a.acMod}</td>
                <td>{a.quantity}</td>
                <td>{a.cost}</td>
                <td className="eq-muted">
                  {data.weapons
                    .filter((w) => !w.hidden && w.capacity > 0 && w.caliber?.id === a.caliber.id)
                    .map((w) => w.name)
                    .join(', ')}
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}

export default function EquipmentPage(): React.ReactElement {
  const baseUrl = useBaseUrl('/');
  const data = useEquipment(baseUrl);
  const [tab, setTab] = useState<'weapons' | 'armor' | 'ammo'>('weapons');

  const [isPlayer, setIsPlayer] = useState(true);
  const [perception, setPerception] = useState(6);
  const [strength, setStrength] = useState(6);
  const [skills, setSkills] = useState<Record<Skill, number>>({
    small_guns: 75,
    big_guns: 75,
    energy_weapons: 75,
    unarmed: 75,
    melee_weapons: 75,
    throwing: 75,
  });
  const [armorPid, setArmorPid] = useState<number>(0);
  const [baseAc, setBaseAc] = useState(0);
  const [distance, setDistance] = useState(8);
  const [aim, setAim] = useState<Aim>('none');
  const [formula, setFormula] = useState<Formula>(0);

  const shooter: Shooter = useMemo(
    () => ({skills, perception, strength, isPlayer}),
    [skills, perception, strength, isPlayer],
  );
  const target: Target = useMemo(
    () => ({baseAc, armor: data?.armor.find((a) => a.pid === armorPid) ?? null}),
    [baseAc, armorPid, data],
  );

  return (
    <Layout title="Weapons and Armour" description="Compare every weapon, round of ammunition and suit of armour.">
      <main className="container margin-vert--lg">
        <h1>Weapons and Armour</h1>
        <p>
          Every weapon, ammunition type and armour in the game, read from the item files, with the chance to hit
          and the damage worked out the way FOR:CE works them out. Set up the shooter and the target, then sort by{' '}
          <b>Dmg/AP</b> to see what kills fastest.
        </p>

        {data === undefined && <p>Loading…</p>}
        {data === null && (
          <p className="db-empty">
            The equipment data is not available in this build. See the README for{' '}
            <code>npm run fetch-database</code>.
          </p>
        )}
        {data && (
          <>
            <details className="eq-setup" open>
              <summary>Shooter and target</summary>
              <div className="eq-fields">
                <fieldset>
                  <legend>Shooter</legend>
                  <div className="db-controls">
                    {([true, false] as const).map((p) => (
                      <button
                        key={String(p)}
                        type="button"
                        className={`db-chip${isPlayer === p ? ' db-chip--on' : ''}`}
                        onClick={() => setIsPlayer(p)}>
                        {p ? 'You' : 'A companion'}
                      </button>
                    ))}
                  </div>
                  <NumberInput label="Perception" value={perception} onChange={setPerception} min={1} max={10} />
                  <NumberInput label="Strength" value={strength} onChange={setStrength} min={1} max={10} />
                  {SKILLS.map((k) => (
                    <NumberInput
                      key={k}
                      label={SKILL_LABEL[k]}
                      value={skills[k]}
                      onChange={(v) => setSkills((s) => ({...s, [k]: v}))}
                      min={0}
                      max={300}
                    />
                  ))}
                </fieldset>
                <fieldset>
                  <legend>Target</legend>
                  <label className="eq-field">
                    <span>Armour</span>
                    <select value={armorPid} onChange={(e) => setArmorPid(Number(e.target.value))}>
                      <option value={0}>None</option>
                      {data.armor.map((a) => (
                        <option key={a.pid} value={a.pid}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <NumberInput label="AC without armour" value={baseAc} onChange={setBaseAc} min={0} max={90} />
                  <NumberInput label="Distance (hexes)" value={distance} onChange={setDistance} min={1} max={60} />
                  <label className="eq-field">
                    <span>Aim</span>
                    <select value={aim} onChange={(e) => setAim(e.target.value as Aim)}>
                      {(Object.keys(AIM) as Aim[]).map((a) => (
                        <option key={a} value={a}>
                          {AIM_LABEL[a]}
                          {AIM[a] ? ` (${AIM[a]}%)` : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="eq-field">
                    <span>Damage formula</span>
                    <select value={formula} onChange={(e) => setFormula(Number(e.target.value) as Formula)}>
                      {([0, 1, 2, 5] as Formula[]).map((f) => (
                        <option key={f} value={f}>
                          {FORMULA_LABEL[f]}
                        </option>
                      ))}
                    </select>
                  </label>
                </fieldset>
              </div>
              <p className="eq-muted">
                Worked out as FOR:CE does, in good light, with nothing in the line of fire and a target that takes up one
                hex. Combat difficulty does not enter: it only changes the accuracy and damage of your enemies. Critical
                hits, your perks and traits are left out. A companion uses its full Perception for range, you use
                Perception − 2. Melee and unarmed attacks add Melee Damage (ST − 5, at least 1) to the top of the roll.
                Distance does not matter to melee and unarmed attacks — the attacker walks up first, at 1 AP a hex, which
                is not counted here. The aim is ignored where the game offers no aimed attack: bursts, flamers, grenades,
                the Molotov Cocktail and the Rocket Launcher. The target is a person or an animal: its own DT and DR are nil, except
                against EMP, which never hurts it. Grenades and rockets also hurt whoever stands within 2 (grenade) or 3
                (rocket) hexes of the target; only the target is counted. A burst sends a third of its rounds down the
                line to the target. Half of that third rolls to hit it; then every round of the third that has not hit
                flies on down the line and hits the target in turn until one misses. The rounds sprayed to either side
                are not counted, though they can hit anyone in their path. The damage
                formula is <code>damage_formula</code> in FOR:CE's <code>config/game.cfg</code> — see{' '}
                <Link to="/systems/combat#damage-formulas">Damage formulas</Link>. The list includes weapons that only
                creatures and robots carry.
              </p>
            </details>

            <div className="db-controls eq-tabs">
              {(
                [
                  ['weapons', `Weapons (${data.weapons.filter((w) => !w.hidden).length})`],
                  ['armor', `Armour (${data.armor.length})`],
                  ['ammo', `Ammunition (${data.ammo.length})`],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  className={`db-chip${tab === k ? ' db-chip--on' : ''}`}
                  onClick={() => setTab(k)}>
                  {label}
                </button>
              ))}
            </div>

            {tab === 'weapons' && (
              <WeaponsTab
                data={data}
                shooter={shooter}
                target={target}
                formula={formula}
                distance={distance}
                aim={aim}
              />
            )}
            {tab === 'armor' && <ArmorTab data={data} />}
            {tab === 'ammo' && <AmmoTab data={data} />}
            <p className="eq-muted">Data: {data.source}.</p>
          </>
        )}
      </main>
    </Layout>
  );
}
