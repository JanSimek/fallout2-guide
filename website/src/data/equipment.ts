/**
 * What an item *is* — the stats out of its proto, for the table under its description in the
 * database. Built by scripts/build-database.py from gecko's export_protos, so the numbers are the
 * game's own; the rules quoted in the labels come from fallout2-ce and are named where they apply.
 */
import {useEffect, useState} from 'react';

export type DamageType = 'normal' | 'laser' | 'fire' | 'plasma' | 'electrical' | 'emp' | 'explosion';
export const DAMAGE_TYPES: DamageType[] = ['normal', 'laser', 'fire', 'plasma', 'electrical', 'emp', 'explosion'];

export interface Named {
  id: number;
  name: string;
}
export interface Attack {
  mode: string;
  skill: string;
  ap: number;
  range: number;
  rounds?: number;
}
interface Common {
  pid: number;
  name: string;
  description: string | null;
  weight: number;
  cost: number;
}
export interface Weapon extends Common {
  damage: [number, number];
  damageType: DamageType;
  minStrength: number;
  twoHanded: boolean;
  attacks: Attack[];
  caliber: Named | null;
  capacity: number;
  defaultAmmo: number | null;
  perk: Named | null;
  animation: string | null;
  hidden: boolean;
}
export interface Ammo extends Common {
  caliber: Named;
  quantity: number;
  acMod: number;
  drMod: number;
  mult: number;
  div: number;
}
export interface Armor extends Common {
  ac: number;
  dt: Record<DamageType, number>;
  dr: Record<DamageType, number>;
  perk: Named | null;
}
export interface DrugEffect {
  stat: string;
  min: number;
  max: number;
}
export interface Drug extends Common {
  now: DrugEffect[];
  then: {minutes: number; effects: DrugEffect[]};
  later: {minutes: number; effects: DrugEffect[]};
  addictionChance: number;
  withdrawalPerk: Named | null;
  withdrawalOnset: number;
}
export interface Container extends Common {
  capacity: number;
}
export interface Other extends Common {
  itemType: string;
  charges?: number;
  powerPid?: number;
}

export interface Equipment {
  source: string;
  weapons: Weapon[];
  ammo: Ammo[];
  armor: Armor[];
  drugs: Drug[];
  containers: Container[];
  other: Other[];
}

export type Entry =
  | {kind: 'weapon'; item: Weapon}
  | {kind: 'ammo'; item: Ammo}
  | {kind: 'armor'; item: Armor}
  | {kind: 'drug'; item: Drug}
  | {kind: 'container'; item: Container}
  | {kind: 'other'; item: Other};

export interface EquipmentIndex {
  byPid: Map<number, Entry>;
  ammoByCaliber: Map<number, Ammo[]>;
  source: string;
}

let pending: Promise<EquipmentIndex | null> | null = null;

function indexOf(data: Equipment): EquipmentIndex {
  const byPid = new Map<number, Entry>();
  const add = (kind: Entry['kind'], items: Common[]) => {
    for (const item of items) byPid.set(item.pid, {kind, item} as Entry);
  };
  add('weapon', data.weapons);
  add('ammo', data.ammo);
  add('armor', data.armor);
  add('drug', data.drugs);
  add('container', data.containers);
  add('other', data.other);
  const ammoByCaliber = new Map<number, Ammo[]>();
  for (const a of data.ammo) {
    const list = ammoByCaliber.get(a.caliber.id) ?? [];
    list.push(a);
    ammoByCaliber.set(a.caliber.id, list);
  }
  return {byPid, ammoByCaliber, source: data.source};
}

export function loadEquipment(baseUrl: string): Promise<EquipmentIndex | null> {
  if (!pending) {
    pending = fetch(`${baseUrl}data/equipment.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => indexOf(d as Equipment))
      .catch(() => null); // no database built: the page shows the name and nothing else
  }
  return pending;
}

/** The stats index, or null while it loads and when there is no data. */
export function useEquipment(baseUrl: string): EquipmentIndex | null {
  const [index, setIndex] = useState<EquipmentIndex | null>(null);
  useEffect(() => {
    let live = true;
    loadEquipment(baseUrl).then((i) => live && setIndex(i));
    return () => {
      live = false;
    };
  }, [baseUrl]);
  return index;
}

export const SKILL_LABEL: Record<string, string> = {
  small_guns: 'Small Guns',
  big_guns: 'Big Guns',
  energy_weapons: 'Energy Weapons',
  unarmed: 'Unarmed',
  melee_weapons: 'Melee Weapons',
  throwing: 'Throwing',
};

export const MODE_LABEL: Record<string, string> = {
  punch: 'Punch',
  kick: 'Kick',
  swing: 'Swing',
  thrust: 'Thrust',
  throw: 'Throw',
  single: 'Single shot',
  burst: 'Burst',
  flame: 'Continuous',
};

/** The animation set a critter needs to hold the weapon — the letter in its art name. */
export const ANIMATION_LABEL: Record<string, string> = {
  knife: 'knife',
  club: 'club',
  hammer: 'hammer',
  spear: 'spear',
  pistol: 'pistol',
  smg: 'SMG',
  rifle: 'rifle',
  laser_rifle: 'big energy weapon',
  minigun: 'minigun',
  launcher: 'rocket launcher',
  sfall_s: 'sfall set s',
  sfall_o: 'sfall set o',
  sfall_p: 'sfall set p',
  sfall_q: 'sfall set q',
  sfall_t: 'sfall set t',
};

/** "Weapon Long Range" → "Long Range". */
export const perkLabel = (perk: Named | null) => (perk ? perk.name.replace(/^Weapon /, '') : '');


export const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);

/** "10–20", or "15" when a chem's range is a single number. */
export const range = (min: number, max: number) => (min === max ? `${min}` : `${min}–${max}`);

/** Game minutes as something readable: 5 minutes, 2 hours, 2 days. */
export function minutes(total: number): string {
  if (total < 60) return `${total} minute${total === 1 ? '' : 's'}`;
  if (total < 1440) {
    const hours = total / 60;
    return `${Number.isInteger(hours) ? hours : hours.toFixed(1)} hours`;
  }
  const days = total / 1440;
  return `${Number.isInteger(days) ? days : days.toFixed(1)} day${days === 1 ? '' : 's'}`;
}
