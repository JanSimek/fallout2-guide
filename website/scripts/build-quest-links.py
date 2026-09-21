#!/usr/bin/env python3
"""
Build the item -> quest index the database pages read.

Nothing in the game data says "this item belongs to that quest". A quest is tracked by a global
variable, and an item is a proto id; the only place the two meet is the script that advances the
quest while taking the item off the player. So the link is read out of RPU's SSL sources:

    procedure Node012 begin                                        // den/dcsmitty.ssl
       set_car_part_pip(car_part_pip_done);                        // advances GVAR_DEN_CAR_PART_PIP
       remove_pid_qty(dude_obj, PID_CAR_FUEL_CELL_CONTROLLER, 1)   // consumes the item

The unit is one PROCEDURE, not one file. A script file touches many quests and many items — Skeeter
alone handles three — so file-level co-occurrence links everything to everything. Within a single
dialogue node the two really do belong together.

Two things make the reading less naive than a grep:

  * A quest gvar is usually written through a header macro, not by name. den.h defines
    set_car_part_pip as `... set_global_var(GVAR_DEN_CAR_PART_PIP, x)`, so the macro layer is
    resolved first and those calls counted as writes.
  * What the procedure DOES with the item is the interesting half, so the verbs are classified:
    taking it away is the objective, handing it over is the reward, both is a trade.

The quest registry itself comes from gecko rather than being parsed here, per the rule in
build-database.py: only gecko reads Fallout 2 formats. This script only reads .ssl text, which
gecko has no tool for.

    python3 scripts/build-quest-links.py            # -> static/data/questlinks.json
    python3 scripts/build-quest-links.py --out DIR
    python3 scripts/build-quest-links.py --show 253 # explain one item

Emitting every link and letting the page decide what to show is deliberate: which relations are
worth a row is an editorial call that should not need a rebuild to change.
"""
import argparse, glob, json, os, re, subprocess, sys
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RPU = os.environ.get('FALLOUT2_RPU', os.path.expanduser('~/Development/Fallout2_Restoration_Project'))
DATA = os.environ.get('FALLOUT2_DATA', os.path.expanduser('~/Development'))
GECKO_MCP = os.environ.get('GECKO_MCP', os.path.expanduser('~/Development/geck-map-editor/build/gecko-mcp'))
RPU_VERSION = os.environ.get('RPU_VERSION', os.path.basename(os.path.normpath(RPU)))

SRC = os.path.join(RPU, 'scripts_src')

MOUNTS = ['--data', os.path.join(DATA, 'master.dat'),
          '--data', os.path.join(DATA, 'critter.dat'),
          '--data', os.path.join(RPU, 'data'),
          '--data', os.path.join(RPU, 'scripts_src')]


def gecko(tool, arguments=None):
    """One gecko MCP tool call; returns the parsed result."""
    msgs = [
        {"jsonrpc": "2.0", "id": 1, "method": "initialize",
         "params": {"protocolVersion": "2024-11-05", "capabilities": {},
                    "clientInfo": {"name": "build-quest-links", "version": "1"}}},
        {"jsonrpc": "2.0", "id": 2, "method": "tools/call",
         "params": {"name": tool, "arguments": arguments or {}}},
    ]
    out = subprocess.run([GECKO_MCP] + MOUNTS,
                         input='\n'.join(json.dumps(m) for m in msgs),
                         capture_output=True, text=True, timeout=900).stdout
    for line in out.splitlines():
        d = json.loads(line)
        if d.get('id') != 2:
            continue
        if 'error' in d or d['result'].get('isError'):
            detail = d.get('error') or d['result']['content'][0]['text']
            raise SystemExit(f'{tool}: {detail}')
        return json.loads(d['result']['content'][0]['text'])
    raise SystemExit(f'{tool}: no response from {GECKO_MCP}')


def numeric_defines(path, prefix):
    """`#define PID_FOO (253)` -> {'PID_FOO': 253}.

    [ \\t] rather than \\s throughout: \\s crosses newlines, which silently pairs one line's name
    with the next line's value.
    """
    if not os.path.exists(path):
        sys.exit(f'missing {path} — set FALLOUT2_RPU to an RPU checkout')
    text = open(path, encoding='latin-1').read()
    return {m.group(1): int(m.group(2)) for m in
            re.finditer(rf'^#define[ \t]+({prefix}[A-Z_0-9]+)[ \t]+\(?(-?\d+)\)?[ \t]*(?://.*)?$',
                        text, re.M)}


def gvar_writing_macros(gvars):
    """Header macros that write a global variable: {'set_car_part_pip': 550}.

    Most scripts never name a quest's gvar — they call an alias from the area's header — so without
    this layer the great majority of links are invisible.
    """
    out = {}
    for header in glob.glob(os.path.join(SRC, 'headers/*.h')):
        text = open(header, encoding='latin-1').read()
        # A macro's parameter list touches its name: `FOO(x) body`. A plain value define has a gap
        # before it: `FOO   (0)`. Without that distinction every value define swallows the line
        # after it as its body.
        for m in re.finditer(r'^#define[ \t]+(\w+)(?:\([^)]*\))?[ \t]+(.+)$', text, re.M):
            written = re.search(r'set_global_var\([ \t]*(GVAR_[A-Z_0-9]+)', m.group(2))
            if written and written.group(1) in gvars:
                out[m.group(1)] = gvars[written.group(1)]
    return out


PROCEDURE = re.compile(r'^procedure[ \t]+(\w+)[^\n]*\bbegin(.*?)^end', re.M | re.S)

# What the procedure does with the item. An engine hook (`use_obj_on_p_proc`) is as deliberate as a
# dialogue node, so the handler's name is not used to judge — only the verbs are.
TAKES = ('remove_pid_qty', 'rm_obj_from_inven', 'destroy_object', 'remove_obj_from_inven')
GIVES = ('create_object', 'add_obj_to_inven', 'give_pid_qty', 'add_mult_objs_to_inven')
# How far either side of the item's name to look for those verbs. A dialogue node is short; this is
# wide enough to span the `item := create_object(...)` / `add_obj_to_inven(...)` pair that always
# straddles two lines, and narrow enough not to reach the next unrelated statement block.
WINDOW = 220


def relation(body, pid_name):
    near = ''.join(body[max(0, m.start() - WINDOW): m.end() + WINDOW]
                   for m in re.finditer(re.escape(pid_name), body))
    takes = any(v in near for v in TAKES)
    gives = any(v in near for v in GIVES)
    if takes and gives:
        return 'exchanged'
    if takes:
        return 'required'
    if gives:
        return 'reward'
    return 'mentions'


def build():
    pids = numeric_defines(os.path.join(SRC, 'headers/itempid.h'), 'PID_')
    gvars = numeric_defines(os.path.join(SRC, 'headers/global.h'), 'GVAR_')
    aliases = gvar_writing_macros(gvars)

    registry = gecko('quests')
    if registry['stats']['quests'] < 150:
        # Vanilla's quests.txt has 110 entries and RPU's has 157. Fewer than 150 means RPU's data/
        # is not mounted after master.dat, and every quest below would be the wrong game's.
        sys.exit(f"quests reported {registry['stats']['quests']} — RPU's data/ is not mounted "
                 f"after master.dat, so this would index vanilla's quests")

    by_gvar = defaultdict(list)
    for quest in registry['quests']:
        by_gvar[quest['gvar']].append(quest)

    pid_names = {v: k for k, v in pids.items()}
    links = defaultdict(dict)          # pid -> (gvar, description) -> link
    for path in sorted(glob.glob(os.path.join(SRC, '*/*.ssl'))):
        script = os.path.basename(path)[:-4]
        text = open(path, encoding='latin-1').read()
        for proc, body in PROCEDURE.findall(text):
            items = {pids[name] for name in re.findall(r'\b(PID_[A-Z_0-9]+)\b', body) if name in pids}
            if not items:
                continue
            written = {gvars[g] for g in re.findall(r'set_global_var\([ \t]*(GVAR_[A-Z_0-9]+)', body)
                       if g in gvars}
            written |= {aliases[a] for a in re.findall(r'\b(\w+)[ \t]*\(', body) if a in aliases}
            for gvar in written & set(by_gvar):
                for quest in by_gvar[gvar]:
                    for pid in items:
                        # One quest can be listed under two areas (the Gecko powerplant is a quest
                        # in both Gecko and Vault City); keyed by text so it appears once.
                        key = (gvar, quest['description'])
                        link = links[pid].setdefault(key, {
                            'quest': quest['description'],
                            'area': quest['area'],
                            'gvar': quest['gvarName'],
                            'relations': set(),
                            'scripts': set(),
                        })
                        link['relations'].add(relation(body, pid_names[pid]))
                        link['scripts'].add(f'{script}:{proc}')

    out = {}
    for pid, found in sorted(links.items()):
        rows = []
        for link in found.values():
            # "mentions" alone is just a name appearing near a quest flag — far too loose to show.
            relations = sorted(link['relations'] - {'mentions'})
            if not relations:
                continue
            rows.append({'quest': link['quest'], 'area': link['area'], 'gvar': link['gvar'],
                         'relations': relations, 'scripts': sorted(link['scripts'])})
        if rows:
            out[str(pid)] = sorted(rows, key=lambda r: r['quest'])
    return {'source': f'RPU {RPU_VERSION}', 'links': out}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', help='write data/ here instead of static/')
    ap.add_argument('--show', type=int, help='print one proto id and exit, without writing')
    args = ap.parse_args()

    payload = build()
    if args.show is not None:
        rows = payload['links'].get(str(args.show), [])
        print(f'proto {args.show}: {len(rows)} quest link(s)')
        for r in rows:
            print(f"  [{','.join(r['relations'])}] {r['quest']}  ({r['area']})")
            print(f"      {', '.join(r['scripts'])}")
        return 0

    out = os.path.abspath(args.out) if args.out else os.path.join(ROOT, 'static')
    path = os.path.join(out, 'data/questlinks.json')
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as handle:
        json.dump(payload, handle, separators=(',', ':'), ensure_ascii=False)

    counts = {}
    for rows in payload['links'].values():
        for r in rows:
            for rel in r['relations']:
                counts[rel] = counts.get(rel, 0) + 1
    summary = ', '.join(f'{v} {k}' for k, v in sorted(counts.items()))
    print(f'wrote {path} ({os.path.getsize(path) / 1024:.0f} KB): '
          f'{len(payload["links"])} items linked to quests ({summary})')
    return 0


if __name__ == '__main__':
    sys.exit(main())
