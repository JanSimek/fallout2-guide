import React, {useId} from 'react';
import useBaseUrl from '@docusaurus/useBaseUrl';
import {usePerks, lookupPerk, requirementText, grantedEffects, specialName} from '@site/src/data/perks';


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
export default function Perk({
  children,
  name,
  id: perkId,
}: {
  children?: React.ReactNode;
  name?: string;
  /** Perk id, for callers that already have one (the database page's weapon and armour rows). */
  id?: number;
}) {
  const id = useId();
  const baseUrl = useBaseUrl('/');
  const perks = usePerks(baseUrl);
  const label = name ?? (typeof children === 'string' ? children : undefined);
  const perk = lookupPerk(perks, label, perkId);
  const text = children ?? perk?.name ?? label;

  if (!perk) {
    return <span className="item-ref item-ref--plain">{text}</span>;
  }

  // An item-granted perk (ranks -1) is never chosen, so it has no cost to state — what it gives is
  // the whole story. Showing its table columns as "Level 1 · Strength 3" would read as a price the
  // wearer has to pay, which is backwards: those columns are the bonus.
  const granted = perk.ranks === -1;
  const summary: string[] = granted ? grantedEffects(perk) : [`Level ${perk.level}`];

  if (!granted) {
    for (const stat of perk.special) {
      summary.push(requirementText({...stat, name: specialName(stat.stat)}));
    }
    const gates = perk.requires.map((r) => requirementText(r, r.kind === 'skill' ? '%' : ''));
    if (gates.length) {
      summary.push(gates.join(perk.requiresMode === 'or' ? ' or ' : ' and '));
    }
    if (perk.ranks > 1) {
      summary.push(`${perk.ranks} ranks`);
    }
  }

  // perk.msg has no text for the weapon and armour perks — the entry just repeats the name — so
  // suppress it rather than printing the title twice inside its own card.
  const description = perk.description.trim() === perk.name.trim() ? '' : perk.description;

  return (
    <span className="item-ref">
      {/* A button, and aria-describedby pointing at the card: the same pairing Vanilla uses, so a
          keyboard or screen-reader user gets the requirements and description rather than just the
          perk's name. */}
      <button type="button" className="item-ref__link item-ref__link--static" aria-describedby={id}>
        {text}
      </button>
      <span role="tooltip" id={id} className="item-ref__card">
        <span className="item-ref__head">
          <span>
            <strong className="item-ref__name">{perk.name}</strong>
            {summary.length > 0 && (
              <span className="item-ref__places">{summary.join(' · ')}</span>
            )}
          </span>
        </span>
        {description && <span className="item-ref__desc">{description}</span>}
        {!granted && perk.effect && (
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
