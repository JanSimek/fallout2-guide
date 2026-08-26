import React, {useId} from 'react';

/**
 * Marks a claim the guide inherited but could not settle against the RPU
 * scripts or the fallout2-ce source — usually because it depends on engine
 * behaviour, party.txt semantics or proto stats rather than anything a script
 * spells out. The claim stays in the text (deleting an inherited claim is how
 * you lose a real one), and this icon says out loud that it wants confirming at
 * the keyboard.
 *
 * Reuses the .vanilla-note structure so positioning and focus handling live in
 * one place; the modifier class swaps the accent colour.
 *
 * Usage in MDX (registered globally, no import needed):
 *
 *   Caravans can dissolve on the world map. <Unverified>Inherited from Per
 *   Jorner; no script in RPU obviously causes this.</Unverified>
 */
export default function Unverified({children}: {children: React.ReactNode}) {
  const id = useId();
  return (
    <span className="vanilla-note vanilla-note--unverified">
      <button
        type="button"
        className="vanilla-note__icon"
        aria-label="Unverified claim — needs playtesting"
        aria-describedby={id}
      >
        ?
      </button>
      <span role="tooltip" id={id} className="vanilla-note__body">
        <strong className="vanilla-note__title">Needs playtesting</strong>
        <span className="vanilla-note__text">{children}</span>
      </span>
    </span>
  );
}
