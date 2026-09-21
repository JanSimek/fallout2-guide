#!/usr/bin/env python3
"""
Build the object database the guide's <Item> cards and /database page read.

Everything that understands Fallout 2 file formats lives in gecko; this only calls it and
writes the results where Docusaurus can serve them. Nothing here parses game data itself.

    python3 scripts/build-database.py            # data + icons
    python3 scripts/build-database.py --no-icons # data only (fast; icons need a GL context)

Outputs:
    static/data/protos.json     what things are — every proto, name, description, art
    static/data/entities.json   where they are — the location rows       (~172 KB gzipped)
    static/data/maps.json       which renders exist, and how each was framed
    static/data/equipment.json  every weapon, ammunition and armour, for the /equipment page
    static/img/db/<pid>.png     sprite per proto (items and critters)
    static/img/maps/*.webp      each map elevation, at two zoom tiers

None of it is committed. The pre-commit hook runs `scripts/database-release.sh update`, which
calls this into a scratch directory (--out) whenever RPU ships a release, publishes the result and
pins it; the deploy workflow fetches whichever tag scripts/database-release.txt pins.
"""
import argparse, json, os, re, subprocess, sys, time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RPU = os.environ.get('FALLOUT2_RPU', os.path.expanduser('~/Development/Fallout2_Restoration_Project'))
DATA = os.environ.get('FALLOUT2_DATA', os.path.expanduser('~/Development'))
GECKO_MCP = os.environ.get('GECKO_MCP', os.path.expanduser('~/Development/geck-map-editor/build/gecko-mcp'))
# Recorded in the output so the page can say which release its numbers come from. The hook sets it.
RPU_VERSION = os.environ.get('RPU_VERSION', os.path.basename(os.path.normpath(RPU)))
GECKO_CLI = os.environ.get('GECKO_CLI', os.path.expanduser('~/Development/geck-map-editor/build/gecko-cli'))


def use_output(out):
    """Point every output at `out` — static/ by default, a scratch directory for a release build."""
    global OUT_PROTOS, OUT_ENTITIES, OUT_ICONS, OUT_MAPS, OUT_MAPDATA, OUT_EQUIPMENT
    # Split deliberately. A walkthrough page with one <Item> in it should not pull the whole location
    # index down; it needs a name, a sentence and an icon. Only /database wants the rows.
    OUT_PROTOS = os.path.join(out, 'data/protos.json')
    OUT_ENTITIES = os.path.join(out, 'data/entities.json')
    OUT_ICONS = os.path.join(out, 'img/db')
    OUT_MAPS = os.path.join(out, 'img/maps')
    OUT_MAPDATA = os.path.join(out, 'data/maps.json')
    OUT_EQUIPMENT = os.path.join(out, 'data/equipment.json')


use_output(os.path.join(ROOT, 'static'))

MOUNTS = ['--data', os.path.join(DATA, 'master.dat'),
          '--data', os.path.join(DATA, 'critter.dat'),
          '--data', os.path.join(RPU, 'data'),
          '--data', os.path.join(RPU, 'scripts_src')]


def gecko(tool, arguments=None):
    """One gecko MCP tool call; returns the parsed result."""
    msgs = [
        {"jsonrpc": "2.0", "id": 1, "method": "initialize",
         "params": {"protocolVersion": "2024-11-05", "capabilities": {},
                    "clientInfo": {"name": "build-database", "version": "1"}}},
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
            if tool == 'export_protos':
                detail = f'{detail} — export_protos needs gecko built from master at or after JanSimek/gecko#144'
            raise SystemExit(f'{tool}: {detail}')
        return json.loads(d['result']['content'][0]['text'])
    raise SystemExit(f'{tool}: no response from {GECKO_MCP}')


def export_entities():
    return gecko('export_entities')


def export_protos():
    """Every proto the game can load — each line of items.lst and critters.lst.

    Not the same question as export_entities, which walks the maps: a quest item a script hands
    out (the fuel cell controller), shop stock and unused protos appear in no map's object records,
    so the map walk cannot see them. It stays the source of the exit-grid protos, which are neither
    an item nor a critter, and of the placement counts."""
    return gecko('export_protos')


def areas():
    """map file -> the world-map area it belongs to, from city.txt: what a reader calls the place
    ("Den"), as against the map's own name ("Residential"). 169 of the 176 shipped maps are an
    entrance of some area; the rest are alternates and cut maps, and get no area."""
    out = {}
    for area in gecko('world_map')['areas']:
        for entrance in area.get('maps', []):
            if entrance.get('mapFile'):
                out.setdefault(os.path.basename(entrance['mapFile']).lower(),
                               area.get('displayName') or area['name'])
    return out


def slugs(protos):
    """A readable URL for every proto: /database/10mm_SMG. Names repeat (two Keys, two
    Lightsabers), so a repeat carries its pid — the first one keeps the clean name."""
    used, out = {}, {}
    for proto in sorted(protos, key=lambda p: p['pid']):
        base = re.sub(r'_+', '_', re.sub(r'[^A-Za-z0-9]+', '_', proto['name'] or '')).strip('_')
        if not base:
            base = str(proto['pid'])
        slug = base if base not in used else f'{base}_{proto["pid"]}'
        used[base] = True
        out[proto['pid']] = slug
    return out


# What the engine does with a weapon's attack-mode index (fallout2-ce item.cc _attack_subtype and
# _attack_skill): the page needs the mode and the skill, and the skill is not stored anywhere.
ATTACK_MODES = {1: ('punch', 'unarmed'), 2: ('kick', 'unarmed'), 3: ('swing', 'melee_weapons'),
                4: ('thrust', 'melee_weapons'), 5: ('throw', 'throwing'), 6: ('single', 'small_guns'),
                7: ('burst', 'small_guns'), 8: ('flame', 'small_guns')}
# fallout2-ce DamageType order — the ids the export reports.
DAMAGE_TYPES = ['normal', 'laser', 'fire', 'plasma', 'electrical', 'emp', 'explosion']
# fallout2-ce art_defs.h WeaponAnimation — which critter animation set a weapon needs.
# 11-15 are sfall's extra sets, named by the letter they use in critter art names.
WEAPON_ANIMATIONS = {1: 'knife', 2: 'club', 3: 'hammer', 4: 'spear', 5: 'pistol', 6: 'smg',
                     7: 'rifle', 8: 'laser_rifle', 9: 'minigun', 10: 'launcher',
                     11: 'sfall_s', 12: 'sfall_o', 13: 'sfall_p', 14: 'sfall_q', 15: 'sfall_t'}
# Protos the game never hands out carry this name; they are not equipment.
PLACEHOLDER = 'Nothing out of the ordinary'


_active = None


def active_states():
    """Pids that are another item switched on: the lit Flare, the ticking Dynamite, the Geiger
    Counter that is on. Using the item swaps its pid for the twin (fallout2-ce item.cc), so the
    twin has the same name and art and is never found anywhere — as a second entry it only reads
    as a duplicate. RPU's itempid.h names every one PID_ACTIVE_*."""
    global _active
    if _active is None:
        found = gecko('find_text', {'pattern': r'#define\s+PID_ACTIVE_\w+\s+\(\d+\)',
                                    'regex': True, 'scope': 'source'})
        _active = {int(re.search(r'\((\d+)\)', m['text']).group(1))
                   for m in found['matches'] if m['file'] == 'itempid'}
        if not _active:
            raise SystemExit('find_text: no PID_ACTIVE_* in itempid.h — is scripts_src mounted?')
    return _active


def listable(proto):
    """Whether a proto gets an entry: it has a name a reader could search for, and is an item
    in its own right rather than the placeholder or another item's active state."""
    return (bool(proto.get('name')) and proto['name'] != PLACEHOLDER
            and proto['pid'] not in active_states())


def weapon_skill(attack_skill, damage_type, big_gun):
    """fallout2-ce item.cc weaponGetSkillForHitMode: a gun is an Energy Weapon if it does laser, plasma
    or electrical damage, otherwise a Big Gun if flagged so, otherwise a Small Gun."""
    if attack_skill != 'small_guns':
        return attack_skill
    if damage_type in ('laser', 'plasma', 'electrical'):
        return 'energy_weapons'
    return 'big_guns' if big_gun else 'small_guns'


def perk_of(perk):
    return {'id': perk['id'], 'name': perk['name']} if perk else None


def drug_effects(stats, amounts):
    """What a chem does, as {stat, min, max}. A first stat id of -2 means the next stat's amount is
    rolled between the first two numbers instead of taken from its own slot — fallout2-ce item.cc
    _perform_drug_effect (stats[0] == -2 -> randomBetween(mods[index - 1], mods[index]))."""
    out, ranged = [], stats[0]['id'] == -2
    for index in range(1 if ranged else 0, 3):
        stat = stats[index]
        if stat['id'] < 0:
            continue
        if ranged:
            low, high, ranged = amounts[index - 1], amounts[index], False
        else:
            low = high = amounts[index]
        if low or high:
            out.append({'stat': stat['name'] or str(stat['id']), 'min': low, 'max': high})
    return out


def build_equipment():
    """What every item proto is, beyond its name: the stats the database page tabulates."""
    def listed(item_type):
        export = gecko('export_protos', {'itemType': item_type})
        if export.get('unreadable'):
            raise SystemExit(f'export_protos: {len(export["unreadable"])} unreadable {item_type} protos')
        return [p for p in export['protos'] if listable(p)]

    weapons = []
    for p in listed('weapon'):
        w = p['weapon']
        damage_type = DAMAGE_TYPES[w['damageType']['id']]
        attacks = []
        for slot in ('primary', 'secondary'):
            mode = ATTACK_MODES.get(p['attackModes'][slot]['index'])
            if not mode:
                continue
            attack = {'mode': mode[0],
                      'skill': weapon_skill(mode[1], damage_type, p['extendedFlags']['bigGun']),
                      'ap': w['apCost'][slot], 'range': w['range'][slot]}
            if mode[0] == 'burst':
                attack['rounds'] = w['burstRounds']
            attacks.append(attack)
        weapons.append({
            'pid': p['pid'], 'name': p['name'], 'description': p['description'],
            'weight': p['weight'], 'cost': p['cost'],
            'damage': [w['damage']['min'], w['damage']['max']], 'damageType': damage_type,
            'minStrength': w['minStrength'], 'twoHanded': p['extendedFlags']['twoHanded'],
            'attacks': attacks,
            'caliber': w['caliber'] if w['ammoCapacity'] > 0 else None,
            'capacity': w['ammoCapacity'],
            'defaultAmmo': w['ammoPid'] if w['ammoPid'] > 0 else None,
            'perk': perk_of(w['perk']),
            'animation': WEAPON_ANIMATIONS.get(w['animationCode']),
            'hidden': p['extendedFlags']['hiddenItem'],
        })

    ammo = [{
        'pid': p['pid'], 'name': p['name'], 'description': p['description'],
        'weight': p['weight'], 'cost': p['cost'],
        'caliber': p['ammo']['caliber'], 'quantity': p['ammo']['quantity'],
        'acMod': p['ammo']['acModifier'], 'drMod': p['ammo']['drModifier'],
        'mult': p['ammo']['damageMultiplier'], 'div': p['ammo']['damageDivisor'],
    } for p in listed('ammo')]

    armor = [{
        'pid': p['pid'], 'name': p['name'], 'description': p['description'],
        'weight': p['weight'], 'cost': p['cost'],
        'ac': p['armor']['ac'], 'dt': p['armor']['dt'], 'dr': p['armor']['dr'],
        'perk': perk_of(p['armor']['perk']),
    } for p in listed('armor')]

    # Everything else an item can be, so the page can put a stat table under any of them. A drug's
    # effects are (stat, now, later, later still) triples; the engine reads them in that order
    # (fallout2-ce proto.cc protoItemDataRead, drugs applied in item.cc).
    drugs = [{
        'pid': p['pid'], 'name': p['name'], 'description': p['description'],
        'weight': p['weight'], 'cost': p['cost'],
        'now': drug_effects(p['drug']['stats'], p['drug']['immediate']),
        'then': {'minutes': p['drug']['delayed1']['minutes'],
                 'effects': drug_effects(p['drug']['stats'], p['drug']['delayed1']['amounts'])},
        'later': {'minutes': p['drug']['delayed2']['minutes'],
                  'effects': drug_effects(p['drug']['stats'], p['drug']['delayed2']['amounts'])},
        'addictionChance': p['drug']['addictionChance'],
        'withdrawalPerk': perk_of(p['drug']['withdrawalPerk']),
        'withdrawalOnset': p['drug']['withdrawalOnset'],
    } for p in listed('drug')]

    containers = [{
        'pid': p['pid'], 'name': p['name'], 'description': p['description'],
        'weight': p['weight'], 'cost': p['cost'], 'capacity': p['container']['maxSize'],
    } for p in listed('container')]

    other = [{
        'pid': p['pid'], 'name': p['name'], 'description': p['description'],
        'weight': p['weight'], 'cost': p['cost'],
        'itemType': p['itemType'],
        **({'charges': p['misc']['charges'], 'powerPid': p['misc']['powerTypePid']}
           if p['itemType'] == 'misc' and p['misc']['charges'] else {}),
    } for p in listed('misc') + listed('key')]

    print(f'  {len(weapons)} weapons, {len(ammo)} ammunition, {len(armor)} armour, '
          f'{len(drugs)} chems, {len(containers)} containers, {len(other)} other')
    return {'weapons': weapons, 'ammo': ammo, 'armor': armor, 'drugs': drugs,
            'containers': containers, 'other': other}


def render_icon(fid, path):
    """One proto's sprite: a single direction and frame, on transparency rather than the
    inspection checkerboard, which would otherwise be baked into the PNG as grey squares."""
    rc = subprocess.run(
        [GECKO_CLI, 'frm', 'render', hex(fid), '--out', path,
         '--dir', '0', '--frame', '0', '--transparent'] + MOUNTS,
        capture_output=True, text=True)
    return rc.returncode == 0 and os.path.exists(path)


PROJECTION = re.compile(r'projection origin=([-\d.]+),([-\d.]+) scale=([\d.]+)')
WROTE = re.compile(r'\((\d+)x(\d+)\)')


# Two tiers of the same textured render. The base is what everyone downloads; the detail tier is
# fetched only by readers who actually zoom in, so a casual look costs 307 KB rather than a megabyte.
MAP_TIERS = [('', 1600), ('@2x', 3200)]


def to_webp(png_path):
    """Re-encode a render as lossless WebP and drop the PNG.

    Lossless, not lossy: these are flat-colour renders, so lossless WebP beats q80 (34 KB against
    111 KB on a 3200px map) instead of losing to it the way it would on a photograph.
    """
    webp_path = png_path[:-4] + '.webp'
    rc = subprocess.run(['cwebp', '-quiet', '-lossless', png_path, '-o', webp_path],
                        capture_output=True, text=True)
    if rc.returncode != 0 or not os.path.exists(webp_path):
        return None
    os.remove(png_path)
    return os.path.basename(webp_path)


def render_map(map_path, elevation, out_path, max_dim):
    """One map elevation as a semantic render, with the world->pixel mapping it was drawn with.

    The projection is read back from gecko rather than re-derived here. A marker's pixel is
    (hex.x - originX) * scale, and only the renderer knows how it framed the map — deriving it
    twice is how the markers would quietly drift the day the framing changes.
    """
    # The natural style: the map as the game draws it, textures and all. The semantic style renders
    # markers instead of art, which is unhelpful under markers of our own.
    rc = subprocess.run(
        [GECKO_CLI, 'map', 'render', '--map', map_path, '--out', out_path,
         '--elevation', str(elevation), '--max-dim', str(max_dim)] + MOUNTS,
        capture_output=True, text=True)
    proj = PROJECTION.search(rc.stdout)
    size = WROTE.search(rc.stdout)
    if rc.returncode != 0 or not proj or not size or not os.path.exists(out_path):
        return None
    return {'elevation': elevation,
            'w': int(size.group(1)), 'h': int(size.group(2)),
            'originX': float(proj.group(1)), 'originY': float(proj.group(2)),
            'scale': float(proj.group(3))}


def render_maps(maps):
    """Every map elevation that has anything on it. Elevations are discovered by trying: a map with
    nothing at an elevation fails the render, which is the same answer as 'it does not exist'."""
    os.makedirs(OUT_MAPS, exist_ok=True)
    out, t0 = [], time.time()
    for i, info in enumerate(maps, 1):
        stem = info['name'].rsplit('.', 1)[0]
        levels = []
        for elevation in range(3):
            frame = None
            images = {}
            for suffix, max_dim in MAP_TIERS:
                path = os.path.join(OUT_MAPS, f'{stem}-{elevation}{suffix}.png')
                got = render_map(info['file'], elevation, path, max_dim)
                if not got:
                    break  # an elevation the map does not have; the same answer at every tier
                image = to_webp(path)
                if not image:
                    break
                images['detail' if suffix else 'base'] = image
                if not suffix:
                    frame = got  # the base tier's projection is the one markers are placed with
            if frame and 'base' in images:
                frame.update(images)
                levels.append(frame)
        if levels:
            out.append({**info, 'levels': levels})
        if i % 25 == 0:
            print(f'  {i}/{len(maps)}', flush=True)
    print(f'  {sum(len(m["levels"]) for m in out)} renders in {time.time() - t0:.0f}s')
    return out


def write(path, payload):
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(payload, f, separators=(',', ':'))
    print(f'wrote {path} ({os.path.getsize(path) / 1e6:.2f} MB)')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--no-icons', action='store_true', help='skip icon rendering (needs a GL context)')
    ap.add_argument('--no-maps', action='store_true', help='skip map rendering (slow; needs a GL context)')
    ap.add_argument('--out', help='write data/ and img/ here instead of static/')
    ap.add_argument('--strict', action='store_true',
                    help='fail if any map is unreadable, instead of warning (for a published build)')
    args = ap.parse_args()
    if args.out:
        use_output(os.path.abspath(args.out))

    print('exporting entities...', flush=True)
    t0 = time.time()
    export = export_entities()
    print(f'  {export["entityCount"]} entities, {len(export["protos"])} placed protos, '
          f'{len(export["maps"])} maps in {time.time() - t0:.0f}s')
    if export['mapsUnreadable']:
        # An item that appears nowhere only means something if every map was read.
        print(f'  WARNING: {len(export["mapsUnreadable"])} map(s) unreadable:', file=sys.stderr)
        for m in export['mapsUnreadable']:
            print(f'    {m["map"]}: {m["reason"]}', file=sys.stderr)
        if args.strict:
            return 1

    print('exporting protos...', flush=True)
    t0 = time.time()
    catalogue = export_protos()
    lists = ', '.join('{} ({})'.format(l['path'], l['entries']) for l in catalogue['lists'])
    print(f'  {len(catalogue["protos"])} protos from {lists} in {time.time() - t0:.0f}s')
    if catalogue['unreadable']:
        # The counterpart of mapsUnreadable: "this item is in no database" only means something
        # when every .lst entry actually loaded.
        print(f'  WARNING: {len(catalogue["unreadable"])} proto(s) unreadable:', file=sys.stderr)
        for u in catalogue['unreadable'][:10]:
            print(f'    {u["file"]}: {u["reason"]}', file=sys.stderr)
        if args.strict:
            return 1

    # What the page needs of a proto; export_protos also carries the full stat block, which
    # /equipment reads out of equipment.json instead of making every page pay for it here.
    def slim(proto):
        return {k: proto[k] for k in ('pid', 'kind', 'name', 'description', 'fid')}

    by_pid = {p['pid']: slim(p) for p in catalogue['protos']}
    placed_only = 0
    for p in export['protos']:
        if p['pid'] not in by_pid:  # exit grids, and anything else the two .lst files omit
            by_pid[p['pid']] = slim(p)
            placed_only += 1

    # How many places each proto turns up, so a hover card can say "found in 3 places" without
    # holding the rows that say where. A proto no map places is kept, at n = 0 — that is the whole
    # point of the catalogue, and the page says "not placed on any map" for it.
    counts = {}
    for row in export['entities']:
        counts[row['pid']] = counts.get(row['pid'], 0) + 1

    # Protos the game never hands out all share one name; they would fill a search with identical
    # rows. Nameless ones cannot be searched for at all, and an item's active state is the item.
    protos = [p for p in by_pid.values() if listable(p)]
    dropped = len(by_pid) - len(protos)
    protos = [{**p, 'n': counts.get(p['pid'], 0)} for p in protos]
    slug_of = slugs(protos)
    protos = [{**p, 'slug': slug_of[p['pid']]} for p in protos]
    print(f'  {len(protos)} in the database ({placed_only} from the map walk only, '
          f'{sum(1 for p in protos if not p["n"])} placed on no map, {dropped} unnamed, placeholder or active state)')

    area_of = areas()
    maps = [{**m, 'area': area_of.get(os.path.basename(m['file']).lower())} for m in export['maps']]

    os.makedirs(os.path.dirname(OUT_PROTOS), exist_ok=True)
    write(OUT_PROTOS, {'protos': protos})
    write(OUT_ENTITIES, {'maps': maps, 'entities': export['entities'],
                         'mapsUnreadable': export['mapsUnreadable']})

    print('exporting equipment...', flush=True)
    write(OUT_EQUIPMENT, {'source': f'RPU {RPU_VERSION}', **build_equipment()})

    if not args.no_maps:
        print(f'rendering maps for {len(export["maps"])} maps...', flush=True)
        write(OUT_MAPDATA, {'maps': render_maps(export['maps'])})

    if args.no_icons:
        return 0

    os.makedirs(OUT_ICONS, exist_ok=True)
    # An item's picture is its inventory art, not its ground art. The ground sprite is a speck the
    # game shares freely — the Crowbar and both Cattle Prods are one diagonal stick, 439 of the 596
    # items share one — while the inventory sprite is the item's own. Furniture containers have no
    # inventory art and keep their ground sprite.
    inventory = {p['pid']: p['inventoryFid'] for p in catalogue['protos']
                 if p.get('inventoryFid', -1) >= 0}
    # Everything with art, critters included. A critter's FRM is a directional animation, so take
    # one direction and one frame and you get a clean standing sprite — which is exactly what a
    # hover card wants.
    items = [(p, inventory.get(p['pid'], p['fid'])) for p in protos]
    items = [(p, art) for p, art in items if art >= 0]
    print(f'rendering {len(items)} sprites...', flush=True)
    t0, written, failed = time.time(), 0, []
    for i, (proto, art) in enumerate(items, 1):
        path = os.path.join(OUT_ICONS, f'{proto["pid"]}.png')
        if os.path.exists(path):
            written += 1
            continue
        if render_icon(art, path):
            written += 1
        else:
            failed.append(proto['name'] or proto['pid'])
        if i % 50 == 0:
            print(f'  {i}/{len(items)}', flush=True)
    print(f'  {written} sprites in {time.time() - t0:.0f}s')
    if failed:
        print(f'  {len(failed)} without art: {", ".join(str(x) for x in failed[:8])}'
              f'{" ..." if len(failed) > 8 else ""}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
