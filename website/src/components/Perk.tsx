import React from 'react';
import useBaseUrl from '@docusaurus/useBaseUrl';
import {usePerks, lookupPerk, requirementText} from '@site/src/data/perks';

const SPECIAL_NAMES: Record<string, string> = {
  ST: 'Strength',
  PE: 'Perception',
  EN: 'Endurance',
  CH: 'Charisma',
  IN: 'Intelligence',
  AG: 'Agility',
  LK: 'Luck',
};

/**
 * A perk the reader can hover for what it does and what it costs to take.
 *
 * Like <Item>, the text always renders: with no perks.json, or a name that matches nothing, this
 * degrades to the plain words it wraps. There is no /database route for perks, so this is a
 * tooltip only — no link.
 *
 * Usage in MDX (registered globally, no import needed):
 *
 *   Take <Perk>Educated</Perk> as early as you can.
 *   <Perk name="Bonus Rate of Fire">BRoF</Perk>
 */
export default function Perk({children, name}: {children?: React.ReactNode; name?: string}) {
  const baseUrl = useBaseUrl('/');
  const perks = usePerks(baseUrl);
  const label = name ?? (typeof children === 'string' ? children : undefined);
  const perk = lookupPerk(perks, label);
  const text = children ?? perk?.name ?? label;

  if (!perk) {
    return <span className="item-ref item-ref--plain">{text}</span>;
  }

  // What it costs to take, as one line: level first, then SPECIAL, then skills or gvars.
  const cost: string[] = [`Level ${perk.level}`];
  for (const stat of perk.special) {
    cost.push(requirementText({...stat, name: SPECIAL_NAMES[stat.stat] ?? stat.stat}));
  }
  const gates = perk.requires.map((r) => requirementText(r, r.kind === 'skill' ? '%' : ''));
  if (gates.length) {
    cost.push(gates.join(perk.requiresMode === 'or' ? ' or ' : ' and '));
  }
  if (perk.ranks > 1) {
    cost.push(`${perk.ranks} ranks`);
  }

  return (
    <span className="item-ref">
      <span className="item-ref__link item-ref__link--static" tabIndex={0}>
        {text}
      </span>
      <span role="tooltip" className="item-ref__card">
        <span className="item-ref__head">
          <span>
            <strong className="item-ref__name">{perk.name}</strong>
            <span className="item-ref__places">{cost.join(' · ')}</span>
          </span>
        </span>
        <span className="item-ref__desc">{perk.description}</span>
        {perk.effect && (
          <span className="item-ref__places">
            {perk.effect.amount > 0 ? '+' : ''}
            {perk.effect.amount} {perk.effect.stat}
            {perk.ranks > 1 ? ' per rank' : ''}
          </span>
        )}
      </span>
    </span>
  );
}
