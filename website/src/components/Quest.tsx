import React from 'react';

/**
 * A quest name.
 *
 * Quests are described in full in this guide, so a quest name is not a link to
 * anywhere else — it is just marked up so it reads as a quest rather than as
 * prose. The Quest Index links each name to the section that describes it.
 *
 *   <Quest>Kill the rat god</Quest>
 *   <Quest rpu>Fix the well for Marli and the tribe</Quest>
 *
 * `rpu` marks a quest the Restoration Project adds, which has no counterpart in
 * the original game.
 */
export default function Quest({
  children,
  rpu = false,
}: {
  children: React.ReactNode;
  /** Added by the Restoration Project. */
  rpu?: boolean;
  /** Accepted and ignored: quest names used to carry a wiki page override. */
  page?: string;
}) {
  return (
    <span
      className={rpu ? 'quest quest--rpu' : 'quest'}
      title={rpu ? 'Quest added by the Restoration Project' : undefined}
    >
      {children}
    </span>
  );
}
