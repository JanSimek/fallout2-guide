import {useEffect, useState} from 'react';

/**
 * How a script uses the item in the procedure that advances the quest.
 *
 * 'required'  — the item is taken off the player: it is the objective.
 * 'reward'    — the item is handed to the player.
 * 'exchanged' — both, in one procedure: a trade.
 */
export type QuestRelation = 'required' | 'reward' | 'exchanged';

export interface QuestLink {
  quest: string;
  /** World-map area the quest is listed under, e.g. "The Den". */
  area: string;
  /** The global variable that tracks it, for anyone cross-checking against the scripts. */
  gvar: string;
  relations: QuestRelation[];
  /** script:procedure pairs the link was read from — the evidence, useful when it looks wrong. */
  scripts: string[];
}

export type QuestLinkIndex = Map<number, QuestLink[]>;

/** Fetched once per page load, like protos.json and perks.json. */
let pending: Promise<QuestLinkIndex> | null = null;

export function loadQuestLinks(baseUrl: string): Promise<QuestLinkIndex> {
  if (!pending) {
    pending = fetch(`${baseUrl}data/questlinks.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => new Map(Object.entries(d.links as Record<string, QuestLink[]>).map(
        ([pid, links]) => [Number(pid), links])))
      .catch(() => new Map()); // no database built: the section is simply absent
  }
  return pending;
}

/** The quest-link index, or null until it has loaded. Never throws. */
export function useQuestLinks(baseUrl: string): QuestLinkIndex | null {
  const [index, setIndex] = useState<QuestLinkIndex | null>(null);
  useEffect(() => {
    let live = true;
    loadQuestLinks(baseUrl).then((i) => {
      if (live) setIndex(i);
    });
    return () => {
      live = false;
    };
  }, [baseUrl]);
  return index;
}

/**
 * The links worth showing for one item.
 *
 * Everything the item is *needed for* is shown. A reward link is only shown when no map places the
 * item, which is the line between a quest reward and ordinary payment: the scripts hand out
 * stimpaks, 10mm rounds and knives on quest completion, and "reward from" on the Stimpak page would
 * be noise. The generator emits both kinds, so this rule can move without a rebuild.
 */
export function visibleQuestLinks(links: QuestLink[] | undefined, placements: number): QuestLink[] {
  if (!links) return [];
  return links.filter((link) =>
    link.relations.some((r) => r === 'required' || r === 'exchanged') || placements === 0);
}

/** "Needed for" / "Reward from" / "Traded for" — how to head one link. */
export function relationLabel(link: QuestLink): string {
  if (link.relations.includes('required')) return 'Needed for';
  if (link.relations.includes('exchanged')) return 'Traded for';
  return 'Reward from';
}
