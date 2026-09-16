import {useEffect, useState} from 'react';

/** One proto as the generator emits it: what a thing is, not where it is. */
export interface Proto {
  pid: number;
  kind: 'item' | 'critter' | 'misc';
  name: string;
  description: string;
  fid: number;
  /** How many places on the shipped maps it turns up. */
  n: number;
}

export interface ProtoIndex {
  byPid: Map<number, Proto>;
  byName: Map<string, Proto>;
  all: Proto[];
}

/**
 * protos.json is fetched once per page load, however many <Item>s are on it — the promise is
 * cached at module scope, so simultaneous mounts share a single request rather than racing.
 */
let pending: Promise<ProtoIndex> | null = null;

function indexOf(protos: Proto[]): ProtoIndex {
  const byPid = new Map<number, Proto>();
  const byName = new Map<string, Proto>();
  for (const proto of protos) {
    byPid.set(proto.pid, proto);
    // Several protos share a display name (ammo variants, generic critters). First wins, and ties
    // are broken towards the one that actually appears on a map, which is the one a reader means.
    const key = proto.name.toLowerCase();
    const existing = byName.get(key);
    if (!existing || (existing.n === 0 && proto.n > 0)) {
      byName.set(key, proto);
    }
  }
  return {byPid, byName, all: protos};
}

export function loadProtos(baseUrl: string): Promise<ProtoIndex> {
  if (!pending) {
    pending = fetch(`${baseUrl}data/protos.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => indexOf(d.protos as Proto[]))
      .catch(() => indexOf([])); // no database built: cards degrade to plain text
  }
  return pending;
}

/** The proto index, or null until it has loaded. Never throws — callers render without it. */
export function useProtos(baseUrl: string): ProtoIndex | null {
  const [index, setIndex] = useState<ProtoIndex | null>(null);
  useEffect(() => {
    let live = true;
    loadProtos(baseUrl).then((i) => {
      if (live) setIndex(i);
    });
    return () => {
      live = false;
    };
  }, [baseUrl]);
  return index;
}

export function lookup(index: ProtoIndex | null, pid?: number, name?: string): Proto | undefined {
  if (!index) return undefined;
  if (pid !== undefined) return index.byPid.get(pid);
  if (name) return index.byName.get(name.trim().toLowerCase());
  return undefined;
}
