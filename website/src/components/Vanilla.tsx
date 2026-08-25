import React, {useId} from 'react';

/**
 * Marks a place where the Restoration Project Updated differs from vanilla
 * Fallout 2 in a way that matters to the player. The guide text itself always
 * describes RPU behaviour; this icon carries the "what it used to be" note so
 * it never interrupts the walkthrough.
 *
 * Usage in MDX (registered globally, no import needed):
 *
 *   The rat god can be crushed instead of shot. <Vanilla>Vanilla only lets you
 *   fight him, for 300 XP.</Vanilla>
 */
export default function Vanilla({children}: {children: React.ReactNode}) {
  const id = useId();
  return (
    <span className="vanilla-note">
      <button
        type="button"
        className="vanilla-note__icon"
        aria-label="Difference from vanilla Fallout 2"
        aria-describedby={id}
      >
        i
      </button>
      <span role="tooltip" id={id} className="vanilla-note__body">
        <strong className="vanilla-note__title">In vanilla Fallout 2</strong>
        <span className="vanilla-note__text">{children}</span>
      </span>
    </span>
  );
}
