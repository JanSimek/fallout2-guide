import {useEffect, useState} from 'react';

/** A requirement on a skill or a global variable, or on a primary stat. */
export interface Requirement {
  /** 'atLeast' is the usual sense; 'below' is the engine's inverted test (a negative in the table). */
  op: 'atLeast' | 'below';
  value: number;
  name: string;
}

export interface SkillRequirement extends Requirement {
  kind: 'skill' | 'gvar';
  index: number;
}

export interface SpecialRequirement extends Requirement {
  /** 'ST' | 'PE' | 'EN' | 'CH' | 'IN' | 'AG' | 'LK'. */
  stat: string;
}

/** A primary-stat bonus an item-granted perk applies on equip. */
export interface SpecialBonus {
  stat: string;
  amount: number;
}

/** One perk as build-perks.py emits it: perk.msg text joined to the engine's own perk table. */
export interface Perk {
  id: number;
  name: string;
  slug: string;
  description: string;
  /** How many times it can be taken. */
  ranks: number;
  /** Character level it first becomes available at. */
  level: number;
  /** Stat minimums, for a perk the player chooses. Empty for item-granted ones. */
  special: SpecialRequirement[];
  /** Stat bonuses, for an item-granted perk. Empty for ones the player chooses. */
  grants: SpecialBonus[];
  /** The stat it changes per rank, when it changes one directly. */
  effect: {stat: string; amount: number} | null;
  requires: SkillRequirement[];
  /** How the two skill/gvar requirements combine; null when there is at most one. */
  requiresMode: 'or' | 'and' | null;
}

export interface PerkIndex {
  byId: Map<number, Perk>;
  byName: Map<string, Perk>;
  bySlug: Map<string, Perk>;
  all: Perk[];
}

/** Fetched once per page load however many <Perk>s are on it, like protos.json. */
let pending: Promise<PerkIndex> | null = null;

function indexOf(perks: Perk[]): PerkIndex {
  const byId = new Map<number, Perk>();
  const byName = new Map<string, Perk>();
  const bySlug = new Map<string, Perk>();
  for (const perk of perks) {
    byId.set(perk.id, perk);
    byName.set(perk.name.toLowerCase(), perk);
    bySlug.set(perk.slug.toLowerCase(), perk);
  }
  return {byId, byName, bySlug, all: perks};
}

export function loadPerks(baseUrl: string): Promise<PerkIndex> {
  if (!pending) {
    pending = fetch(`${baseUrl}data/perks.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => indexOf(d.perks as Perk[]))
      .catch(() => indexOf([])); // no database built: tooltips degrade to plain text
  }
  return pending;
}

/** The perk index, or null until it has loaded. Never throws — callers render without it. */
export function usePerks(baseUrl: string): PerkIndex | null {
  const [index, setIndex] = useState<PerkIndex | null>(null);
  useEffect(() => {
    let live = true;
    loadPerks(baseUrl).then((i) => {
      if (live) setIndex(i);
    });
    return () => {
      live = false;
    };
  }, [baseUrl]);
  return index;
}

export function lookupPerk(index: PerkIndex | null, name?: string, id?: number): Perk | undefined {
  if (!index) return undefined;
  if (id !== undefined) return index.byId.get(id);
  if (!name) return undefined;
  const key = name.trim().toLowerCase();
  return index.byName.get(key) ?? index.bySlug.get(key);
}

/**
 * What a weapon's perk does, which is the one thing here that no data file knows.
 *
 * perk.msg gives these no description — the entry at 1101 + id just repeats the name — because the
 * player never picks them from the perk screen, and unlike armour perks they are not applied to the
 * critter either: the combat code branches on the weapon's perk id directly, one hardcoded effect
 * each. So there is nothing to parse, and each line below cites where fallout2-ce implements it.
 *
 * Armour perks are NOT here on purpose. Their bonuses are real table columns (`grants`, plus
 * `effect`), applied by perkAddEffect on equip, so they come out of perks.json and cannot drift.
 */
export const WEAPON_PERK_EFFECTS: Record<number, string> = {
  58: '+4× Perception range bonus instead of the usual +2×', // combat.cc:4487, perk.cc:72
  59: '+20% to hit', // combat.cc:4570, perk.cc:73
  60: "Cuts the target's damage threshold to a fifth", // combat.cc:4687
  61: 'Knocks targets back twice as far', // combat.cc:4806
  64: '+5× Perception range bonus, but useless within 8 hexes', // combat.cc:4490, perk.cc:74-75
  65: 'Reloading costs 1 AP instead of 2', // item.cc:1746
  66: 'Ignores darkness — targets are always lit', // combat.cc:4599
  67: 'Gorier kills: the violence thresholds drop to a third', // actions.cc:245
  117: 'Chance to knock the target out, scaling with Strength above 8', // combat.cc:3938
};

/** True when the player can never choose this perk: it comes from an item, a chem or a script. */
export const isItemGranted = (perk: Perk) => perk.ranks === -1;

/** "Doctor 60%", "Strength below 10" — one requirement as a reader would say it. */
export function requirementText(requirement: Requirement, suffix = ''): string {
  return requirement.op === 'below'
    ? `${requirement.name} below ${requirement.value}${suffix}`
    : `${requirement.name} ${requirement.value}${suffix}`;
}

const SPECIAL_NAMES: Record<string, string> = {
  ST: 'Strength',
  PE: 'Perception',
  EN: 'Endurance',
  CH: 'Charisma',
  IN: 'Intelligence',
  AG: 'Agility',
  LK: 'Luck',
};

export const specialName = (stat: string) => SPECIAL_NAMES[stat] ?? stat;

/**
 * What an item-granted perk does to whoever carries it: "+3 Strength, +30% Radiation Resistance".
 *
 * Both halves come from the table — the SPECIAL columns as `grants`, and the stat/statModifier
 * pair as `effect` — so this stays right if the engine's numbers ever move. A weapon perk has
 * neither; its effect is hardcoded in the combat code, so WEAPON_PERK_EFFECTS answers for those.
 */
export function grantedEffects(perk: Perk): string[] {
  const parts = perk.grants.map((g) => `${signed(g.amount)} ${specialName(g.stat)}`);
  if (perk.effect) {
    // The resistances are percentages; the SPECIAL stats and the rest are flat points.
    const unit = /Resistance$/.test(perk.effect.stat) ? '%' : '';
    parts.push(`${signed(perk.effect.amount)}${unit} ${perk.effect.stat}`);
  }
  if (!parts.length && WEAPON_PERK_EFFECTS[perk.id]) {
    parts.push(WEAPON_PERK_EFFECTS[perk.id]);
  }
  return parts;
}

const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);
