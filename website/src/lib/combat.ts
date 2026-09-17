/**
 * Fallout 2's to-hit and damage rules, as FOR:CE implements them, for the equipment page.
 *
 * Every rule here is transcribed from the fallout2-ce source, and the comments give the function it
 * came from (combat.cc attackDetermineToHit / attackComputeDamage / damageModCalculate*, item.cc).
 * Deliberately left out: critical hits, the player's perks and traits (except where an input says
 * otherwise), darkness, blockers in the line of fire, knocked-down and multi-hex targets (+15), a
 * blinded attacker, and explosion damage to bystanders. The page says so. Combat difficulty is not
 * an input because it only changes the accuracy and damage of attackers outside the player's team.
 */

export type DamageType = 'normal' | 'laser' | 'fire' | 'plasma' | 'electrical' | 'emp' | 'explosion';
export type Skill = 'small_guns' | 'big_guns' | 'energy_weapons' | 'unarmed' | 'melee_weapons' | 'throwing';
export type Mode = 'punch' | 'kick' | 'swing' | 'thrust' | 'throw' | 'single' | 'burst' | 'flame';

export interface Named {
  id: number;
  name: string;
}

/** Perk ids, fallout2-ce perk_defs.h. */
export const PERK = {
  longRange: 58,
  accurate: 59,
  penetrate: 60,
  scopeRange: 64,
} as const;

/**
 * What an armour's perk does to the wearer — fallout2-ce perk.cc gPerkDescriptions (the stat and
 * per-SPECIAL columns), applied on equip to party members and the player (inventory.cc).
 */
export const ARMOR_PERKS: Record<number, {strength: number; radiation: number}> = {
  62: {strength: 3, radiation: 30}, // Powered Armor
  63: {strength: 0, radiation: 20}, // Combat Armor
  68: {strength: 4, radiation: 60}, // Armor Advanced I
  69: {strength: 4, radiation: 75}, // Armor Advanced II
};

/** "Weapon Long Range" → "Long Range": the game's perk names carry a prefix the table does not need. */
export const perkLabel = (perk: Named | null) => (perk ? perk.name.replace(/^Weapon /, '') : '');

export interface Attack {
  mode: Mode;
  skill: Skill;
  ap: number;
  range: number;
  rounds?: number;
}
export interface Weapon {
  pid: number;
  name: string;
  description?: string | null;
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
  weight: number;
  cost: number;
}
export interface Ammo {
  pid: number;
  name: string;
  caliber: Named;
  quantity: number;
  acMod: number;
  drMod: number;
  mult: number;
  div: number;
  weight: number;
  cost: number;
}
export interface Armor {
  pid: number;
  name: string;
  description?: string | null;
  ac: number;
  dt: Record<DamageType, number>;
  dr: Record<DamageType, number>;
  perk: Named | null;
  weight: number;
  cost: number;
}
export interface Equipment {
  source: string;
  weapons: Weapon[];
  ammo: Ammo[];
  armor: Armor[];
}

export const DAMAGE_TYPES: DamageType[] = ['normal', 'laser', 'fire', 'plasma', 'electrical', 'emp', 'explosion'];

export const RANGED_MODES: Mode[] = ['throw', 'single', 'burst', 'flame'];
const MELEE_MODES: Mode[] = ['punch', 'kick', 'swing', 'thrust'];

/** Aimed-shot penalties, combat.cc hit_location_penalty_default (HitLocation order). */
export const AIM = {
  none: 0,
  torso: 0,
  head: -40,
  eyes: -60,
  groin: -30,
  arm: -30,
  leg: -20,
} as const;
export type Aim = keyof typeof AIM;

export interface Shooter {
  /** Skill values by skill, as shown on the character screen. */
  skills: Record<Skill, number>;
  perception: number;
  strength: number;
  /** The player uses (PE − 2) in the range allowance; NPCs use PE. combat.cc attackDetermineToHit. */
  isPlayer: boolean;
}

export interface Target {
  /** Armour class before armour (a critter's own AC). */
  baseAc: number;
  armor: Armor | null;
}

/** fallout2-ce proto_types.h PROTO_ID_SOLAR_SCORCHER: recharged by daylight, not ammunition. */
export const SOLAR_SCORCHER = 390;

/**
 * Ammunition a weapon accepts: the same caliber id (item.cc weaponCanBeReloadedWithInternal).
 * Two exceptions for the page's sake. The Solar Scorcher is reloaded by bright light before the
 * caliber is ever compared. And caliber 0 is "None": the BB guns and BB's share it on purpose, but
 * creature weapons such as the Dual Plasma Cannon carry it too, with no ammunition of their own —
 * matching BB's to those would be true to the check and useless to a reader.
 */
export function compatibleAmmo(weapon: Weapon, ammo: Ammo[]): Ammo[] {
  if (!weapon.caliber || weapon.capacity <= 0 || weapon.pid === SOLAR_SCORCHER) return [];
  if (weapon.caliber.id === 0 && weapon.defaultAmmo == null) return [];
  return ammo.filter((a) => a.caliber.id === weapon.caliber!.id);
}

/** Thrown weapons are capped at 3 × ST. item.cc weaponGetRange. Heave Ho! is ignored. */
export function effectiveRange(attack: Attack, strength: number): number {
  return attack.mode === 'throw' ? Math.min(attack.range, 3 * strength) : attack.range;
}

/**
 * Whether the game offers an aimed attack — item.cc critterCanAim: never for bursts or flamers,
 * nor for explosion, fire or EMP weapons, nor for a thrown plasma weapon (the plasma grenade).
 * The player's Fast Shot trait rules it out too, but traits are left out here.
 */
export function canAim(weapon: Weapon, attack: Attack): boolean {
  if (attack.mode === 'burst' || attack.mode === 'flame') return false;
  const t = weapon.damageType;
  if (t === 'explosion' || t === 'fire' || t === 'emp') return false;
  return !(t === 'plasma' && attack.mode === 'throw');
}

/**
 * Chance to hit, capped at 95 as the engine caps it (a negative result is returned as is) —
 * mirrors combat.cc attackDetermineToHit for a weapon attack by the player or a companion, with no
 * darkness, blockers, knockdown or multi-hex target. The caller passes aim 'none' when canAim() is
 * false.
 */
export function toHit(
  shooter: Shooter,
  weapon: Weapon,
  attack: Attack,
  target: Target,
  ammo: Ammo | null,
  distance: number,
  aim: Aim,
): number {
  let chance = shooter.skills[attack.skill];
  const ranged = RANGED_MODES.includes(attack.mode);

  if (ranged) {
    let mult = 2;
    let minDist = 0;
    if (weapon.perk?.id === PERK.longRange) mult = 4; // WeaponLongRangeBonus default
    if (weapon.perk?.id === PERK.scopeRange) {
      mult = 5; // WeaponScopeRangeBonus default
      minDist = 8; // WeaponScopeRangePenalty default
    }
    const pe = shooter.perception;
    let d = distance;
    if (d >= minDist) {
      d -= shooter.isPlayer ? mult * (pe - 2) : mult * pe;
    } else {
      d += minDist;
    }
    if (d < -2 * pe) d = -2 * pe;
    chance += -4 * d;
  }

  const short = weapon.minStrength - shooter.strength;
  if (short > 0) chance -= 20 * short;

  if (weapon.perk?.id === PERK.accurate) chance += 20; // WeaponAccurateBonus default

  const ac = Math.max(0, target.baseAc + (target.armor?.ac ?? 0) + (ammo?.acMod ?? 0));
  chance -= ac;

  const penalty = AIM[aim];
  chance += ranged ? penalty : Math.trunc(penalty / 2);

  return Math.min(chance, 95);
}

/** C-style integer division (truncates toward zero), as the engine's `int / int` does. */
const idiv = (a: number, b: number) => Math.trunc(a / b);

/** combat.cc damageModGlovzDivRound — rounds half to even. */
function glovzDivRound(dividend: number, divisor: number): number {
  if (dividend < divisor) {
    return dividend !== divisor && dividend * 2 <= divisor ? 0 : 1;
  }
  let quotient = idiv(dividend, divisor);
  let rest = dividend % divisor;
  if (rest === 0) return quotient;
  rest *= 2;
  if (rest > divisor || (rest === divisor && (quotient & 1) !== 0)) quotient += 1;
  return quotient;
}

export type Formula = 0 | 1 | 2 | 5;

export interface DamageInputs {
  dt: number;
  dr: number;
  ammo: Ammo | null;
  formula: Formula;
  /** 2 for a normal hit (combat.cc passes 2; criticals pass their multiplier). */
  baseMult?: number;
}

/**
 * Damage one round does for a given roll — combat.cc attackComputeDamage (formula 0),
 * damageModCalculateGlovz (1, 2) and damageModCalculateYaam (5), on normal difficulty with no
 * player damage bonuses.
 */
export function roundDamage(roll: number, {dt, dr, ammo, formula, baseMult = 2}: DamageInputs): number {
  const x = ammo?.mult ?? 1;
  const y = ammo?.div ?? 1;
  const ammoDr = ammo?.drMod ?? 0;
  const difficulty = 100;

  if (formula === 1 || formula === 2) {
    const ax = x <= 0 ? 1 : x;
    const ay = y <= 0 ? 1 : y;
    const adr = ammoDr > 0 ? -ammoDr : ammoDr;
    const cdt = dt > 0 ? glovzDivRound(dt, ay) : dt;
    let cdr = dr;
    if (cdr > 0) {
      cdr = glovzDivRound(cdr + adr, ax);
      if (cdr >= 100) return 0;
    }
    let damage = roll;
    if (damage <= 0) return 0;
    if (dt > 0) {
      damage -= cdt;
      if (damage <= 0) return 0;
    }
    if (dr > 0) {
      damage -= glovzDivRound(damage * cdr, 100);
      if (damage <= 0) return 0;
    }
    if (dt <= 0 && dr <= 0) {
      if (ax > 1 && ay > 1) damage += glovzDivRound(damage * 15, 100);
      else if (ax > 1) damage += glovzDivRound(damage * 20, 100);
      else if (ay > 1) damage += glovzDivRound(damage * 10, 100);
    }
    if (formula === 2) damage += glovzDivRound(damage * baseMult * 25, 100);
    else damage = idiv(damage * baseMult, 2);
    return Math.max(0, damage);
  }

  if (formula === 5) {
    let cdt = dt - ammoDr;
    let extraDr = cdt;
    if (cdt >= 0) {
      extraDr = 0;
    } else {
      cdt = 0;
      extraDr *= 10;
    }
    let cdr = dr + extraDr;
    if (cdr < 0) cdr = 0;
    else if (cdr >= 100) return 0;
    let damage = roll - cdt;
    if (damage <= 0) return 0;
    damage *= baseMult * x;
    if (y !== 0) damage = idiv(damage, y);
    damage = idiv(damage, 2);
    damage = idiv(damage * difficulty, 100);
    damage -= idiv(damage * cdr, 100);
    return Math.max(0, damage);
  }

  // Formula 0, the default.
  let resist = dr + ammoDr;
  resist = Math.min(100, Math.max(0, resist));
  let damage = roll * (baseMult * x);
  if (y !== 0) damage = idiv(damage, y);
  damage = idiv(damage, 2);
  damage = idiv(damage * difficulty, 100);
  damage -= dt;
  if (damage > 0) damage -= idiv(damage * resist, 100);
  return Math.max(0, damage);
}

/**
 * The target's own resistances, before armour. The target is a person or an animal: their protos
 * carry no DT or DR except DR 500 against EMP (e.g. 00000001.pro; robots, cyber-dogs and holograms
 * are the exceptions). The engine then caps DT at 100 and DR at 90, EMP DR at 100 (stat.cc
 * gStatDescriptions, applied in critterGetStat), so EMP never hurts such a target.
 */
const BASE_DR: Partial<Record<DamageType, number>> = {emp: 500};

/** The target's DT and DR for a damage type, as critterGetStat returns them. */
export function targetResistance(target: Target, type: DamageType): {dt: number; dr: number} {
  const dt = Math.min(100, Math.max(0, target.armor?.dt[type] ?? 0));
  const dr = (target.armor?.dr[type] ?? 0) + (BASE_DR[type] ?? 0);
  return {dt, dr: Math.min(type === 'emp' ? 100 : 90, Math.max(0, dr))};
}

/**
 * Average damage per round that hits. The roll is uniform between min and max; melee and unarmed
 * attacks add the attacker's Melee Damage to the maximum only (item.cc weaponGetDamage).
 */
export function averageDamage(
  weapon: Weapon,
  attack: Attack,
  target: Target,
  ammo: Ammo | null,
  formula: Formula,
  meleeDamage: number,
): number {
  const [min, baseMax] = weapon.damage;
  const max = MELEE_MODES.includes(attack.mode) ? baseMax + meleeDamage : baseMax;
  const {dt, dr} = targetResistance(target, weapon.damageType);
  let total = 0;
  for (let roll = min; roll <= max; roll++) {
    total += roundDamage(roll, {dt, dr, ammo, formula});
  }
  return max >= min ? total / (max - min + 1) : 0;
}

/**
 * How a burst is split — combat.cc _compute_spray without the optional burst mod (burst_enabled=0
 * in FOR:CE's config/game.cfg). A third of the rounds (at least one) goes down the line to the
 * target; half of that third (at least one, then taken out of the third) rolls to hit the target.
 */
export function burstSplit(attack: Attack, loaded: number): {fired: number; centre: number; aimed: number} {
  const fired = Math.min(attack.rounds ?? 1, Math.max(loaded, 1));
  let centre = Math.floor(fired / 3);
  if (centre === 0) centre = 1;
  let aimed = Math.floor(centre / 2);
  if (aimed === 0) {
    aimed = 1;
    centre -= 1;
  }
  return {fired, centre, aimed};
}

/**
 * The most rounds of one attack that can hit the target: a third of a burst (at least one), one
 * otherwise. A flamer's other rounds only ever count against bystanders (_shoot_along_path returns
 * no hits on the main target for continuous fire).
 */
export function roundsAtTarget(attack: Attack, loaded: number): number {
  if (attack.mode !== 'burst') return 1;
  const {centre, aimed} = burstSplit(attack, loaded);
  return Math.max(centre, aimed);
}

/**
 * Expected rounds that hit the target, with nobody else in the line of fire. A single attack hits
 * with the chance p. In a burst, each aimed round rolls p (_compute_spray); the rest of the centre
 * third then flies along the line (_shoot_along_path), and the first critter on it — the target —
 * takes one round per roll of p until a roll fails or the rounds run out. The rounds fired to
 * either side are not counted.
 */
export function expectedHits(attack: Attack, loaded: number, p: number): number {
  if (attack.mode !== 'burst') return p;
  const {centre, aimed} = burstSplit(attack, loaded);
  const alongLine = (r: number) => {
    let sum = 0;
    for (let k = 1; k <= r; k++) sum += p ** k;
    return sum;
  };
  let expected = 0;
  let ways = 1; // binomial coefficient C(aimed, h)
  for (let h = 0; h <= aimed; h++) {
    if (h > 0) ways = (ways * (aimed - h + 1)) / h;
    expected += ways * p ** h * (1 - p) ** (aimed - h) * (h + alongLine(centre - h));
  }
  return expected;
}

export interface AttackSummary {
  hit: number;
  perHit: number;
  /** The most rounds of the attack that can hit the target. */
  rounds: number;
  /** Expected rounds that hit the target. */
  hits: number;
  /** Expected damage of one attack against the target, then per action point. */
  expected: number;
  perAp: number;
  inRange: boolean;
  /** Whether the attack was worked out aimed (the game refuses some aims — see canAim). */
  aimed: boolean;
}

export function summarise(
  shooter: Shooter,
  weapon: Weapon,
  attack: Attack,
  target: Target,
  ammo: Ammo | null,
  formula: Formula,
  distance: number,
  aim: Aim,
): AttackSummary {
  const aimed: Aim = canAim(weapon, attack) ? aim : 'none';
  const hitRaw = toHit(shooter, weapon, attack, target, ammo, distance, aimed);
  const hitPct = Math.max(0, Math.min(95, hitRaw));
  const meleeDamage = Math.max(shooter.strength - 5, 1); // stat.cc critterUpdateDerivedStats
  const perHit = averageDamage(weapon, attack, target, ammo, formula, meleeDamage);
  const rounds = roundsAtTarget(attack, weapon.capacity);
  const hits = expectedHits(attack, weapon.capacity, hitPct / 100);
  const expected = hits * perHit;
  const range = effectiveRange(attack, shooter.strength);
  // item.cc weaponGetActionPointCost: an aimed attack costs 1 more AP, and never less than 1.
  const ap = Math.max(1, attack.ap + (aimed === 'none' ? 0 : 1));
  return {
    hit: hitPct,
    perHit,
    rounds,
    hits,
    expected,
    perAp: expected / ap,
    // Melee and unarmed attacks happen next to the target whatever the starting distance.
    inRange: RANGED_MODES.includes(attack.mode) ? distance <= range : true,
    aimed: aimed !== 'none',
  };
}
