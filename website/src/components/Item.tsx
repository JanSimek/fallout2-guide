import React from 'react';
import Link from '@docusaurus/Link';
import useBaseUrl from '@docusaurus/useBaseUrl';
import {useProtos, lookup} from '@site/src/data/protos';

/**
 * An item or critter the reader can hover for what it is, and click for where it is.
 *
 * The text always renders, database or not: if protos.json is missing or the name matches nothing,
 * this degrades to the plain words it wraps. A walkthrough sentence must not depend on a build
 * artefact being present.
 *
 * Usage in MDX (registered globally, no import needed):
 *
 *   Grab a pair of <Item>Rubber Boots</Item> before you go.
 *   <Item pid={262} />                     name comes from the database
 *   <Item name="Rubber Boots">boots</Item> different wording, same entry
 */
export default function Item({
  children,
  pid,
  name,
}: {
  children?: React.ReactNode;
  pid?: number;
  name?: string;
}) {
  const baseUrl = useBaseUrl('/');
  const protos = useProtos(baseUrl);
  const label = name ?? (typeof children === 'string' ? children : undefined);
  const proto = lookup(protos, pid, label);
  const text = children ?? proto?.name ?? label ?? `#${pid}`;

  if (!proto) {
    // Still loading, or not in the database. Render the words and nothing else.
    return <span className="item-ref item-ref--plain">{text}</span>;
  }

  // Every proto has a sprite now — a critter's is one frame of its walk cycle, which reads fine
  // at card size.
  const icon = `${baseUrl}img/db/${proto.pid}.png`;
  const places =
    proto.n === 0
      ? 'Not placed on any map'
      : `Found in ${proto.n} place${proto.n === 1 ? '' : 's'}`;

  return (
    <span className="item-ref">
      <Link className="item-ref__link" to={`${baseUrl}database?id=${proto.pid}`}>
        {text}
      </Link>
      <span role="tooltip" className="item-ref__card">
        <span className="item-ref__head">
          {icon && <img className="item-ref__icon" src={icon} alt="" loading="lazy" />}
          <span>
            <strong className="item-ref__name">{proto.name}</strong>
            <span className="item-ref__places">{places}</span>
          </span>
        </span>
        {proto.description && <span className="item-ref__desc">{proto.description}</span>}
      </span>
    </span>
  );
}
