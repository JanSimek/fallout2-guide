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
  special: SpecialRequirement[];
  /** The stat it changes per rank, when it changes one directly. */
  effect: {stat: string; amount: number} | null;
  requires: SkillRequirement[];
  /** How the two skill/gvar requirements combine; null when there is at most one. */
  requiresMode: 'or' | 'and' | null;
}

export interface PerkIndex {
  byName: Map<string, Perk>;
  bySlug: Map<string, Perk>;
  all: Perk[];
}

/** Fetched once per page load however many <Perk>s are on it, like protos.json. */
let pending: Promise<PerkIndex> | null = null;

function indexOf(perks: Perk[]): PerkIndex {
  const byName = new Map<string, Perk>();
  const bySlug = new Map<string, Perk>();
  for (const perk of perks) {
    byName.set(perk.name.toLowerCase(), perk);
    bySlug.set(perk.slug.toLowerCase(), perk);
  }
  return {byName, bySlug, all: perks};
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

export function lookupPerk(index: PerkIndex | null, name?: string): Perk | undefined {
  if (!index || !name) return undefined;
  const key = name.trim().toLowerCase();
  return index.byName.get(key) ?? index.bySlug.get(key);
}

/** "Doctor 60%", "Strength below 10" — one requirement as a reader would say it. */
export function requirementText(requirement: Requirement, suffix = ''): string {
  return requirement.op === 'below'
    ? `${requirement.name} below ${requirement.value}${suffix}`
    : `${requirement.name} ${requirement.value}${suffix}`;
}
