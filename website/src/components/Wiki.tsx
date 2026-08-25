import React from 'react';

const WIKI = 'https://fallout.fandom.com/wiki/';

/** Links any term to the Fallout Wiki. <Wiki page="Sulik">Sulik</Wiki> */
export default function Wiki({
  children,
  page,
}: {
  children: React.ReactNode;
  page?: string;
}) {
  const label = typeof children === 'string' ? children : '';
  const target = (page ?? label).replace(/ /g, '_');
  return (
    <a href={WIKI + encodeURIComponent(target)} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}
