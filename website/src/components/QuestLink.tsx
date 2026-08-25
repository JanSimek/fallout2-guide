import React from 'react';
import Link from '@docusaurus/Link';

const WIKI = 'https://fallout.fandom.com/wiki/';

/**
 * One row of the Quest Index: the quest name linked to the section of this
 * guide that describes it, plus an optional secondary link to the Fallout Wiki
 * for cross-checking exact reward tables.
 */
export default function QuestLink({
  children,
  to,
  wiki,
  rpu = false,
}: {
  children: React.ReactNode;
  /** Anchor in this guide that describes the quest. */
  to: string;
  /** Fallout Wiki page title, if the quest has one. */
  wiki?: string;
  rpu?: boolean;
}) {
  return (
    <>
      <Link to={to} className={rpu ? 'quest quest--rpu' : 'quest'}>
        {children}
      </Link>
      {rpu ? (
        <span className="quest-tag" title="Added by the Restoration Project">
          RPU
        </span>
      ) : (
        wiki && (
          <a
            className="quest-wiki"
            href={WIKI + encodeURIComponent(wiki.replace(/ /g, '_'))}
            target="_blank"
            rel="noopener noreferrer"
            title="Cross-check rewards on the Fallout Wiki"
          >
            wiki
          </a>
        )
      )}
    </>
  );
}
