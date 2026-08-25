import React from 'react';

const WIKI = 'https://fallout.fandom.com/wiki/';

/**
 * Links a quest name to its page on the Fallout Wiki.
 *
 *   <Quest page="Kill the rat god">Kill the rat god</Quest>
 *   <Quest>Kill the rat god</Quest>          // page inferred from the text
 *
 * Quests added by the Restoration Project have no wiki page, so pass `rpu`
 * to render them as a plain marked-up quest name instead of a dead link:
 *
 *   <Quest rpu>Fix the well for Marli and the tribe</Quest>
 */
export default function Quest({
  children,
  page,
  rpu = false,
}: {
  children: React.ReactNode;
  page?: string;
  rpu?: boolean;
}) {
  const label = typeof children === 'string' ? children : '';
  const target = page ?? label;

  if (rpu || !target) {
    return (
      <span className="quest quest--rpu" title="Quest added by the Restoration Project">
        {children}
      </span>
    );
  }

  return (
    <a
      className="quest"
      href={WIKI + encodeURIComponent(target.replace(/ /g, '_'))}
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
    </a>
  );
}
