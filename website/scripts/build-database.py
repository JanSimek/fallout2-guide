#!/usr/bin/env python3
"""
Build the object database the guide's <Item> cards and /database page read.

Everything that understands Fallout 2 file formats lives in gecko; this only calls it and
writes the results where Docusaurus can serve them. Nothing here parses game data itself.

    python3 scripts/build-database.py            # data + icons
    python3 scripts/build-database.py --no-icons # data only (fast; icons need a GL context)

Outputs:
    static/data/protos.json     what things are — name, description, art  (~25 KB gzipped)
    static/data/entities.json   where they are — the location rows       (~172 KB gzipped)
    static/img/db/<pid>.png     sprite per proto (items and critters)

Both are generated, not committed — see .gitignore and the deploy workflow.
"""
import argparse, json, os, re, subprocess, sys, time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RPU = os.environ.get('FALLOUT2_RPU', os.path.expanduser('~/Development/Fallout2_Restoration_Project'))
DATA = os.environ.get('FALLOUT2_DATA', os.path.expanduser('~/Development'))
GECKO_MCP = os.environ.get('GECKO_MCP', os.path.expanduser('~/Development/geck-map-editor/build/gecko-mcp'))
GECKO_CLI = os.environ.get('GECKO_CLI', os.path.expanduser('~/Development/geck-map-editor/build/gecko-cli'))

# Split deliberately. A walkthrough page with one <Item> in it should not pull the whole location
# index down; it needs a name, a sentence and an icon. Only /database wants the rows.
OUT_PROTOS = os.path.join(ROOT, 'static/data/protos.json')
OUT_ENTITIES = os.path.join(ROOT, 'static/data/entities.json')
OUT_ICONS = os.path.join(ROOT, 'static/img/db')
OUT_MAPS = os.path.join(ROOT, 'static/img/maps')
OUT_MAPDATA = os.path.join(ROOT, 'static/data/maps.json')

MOUNTS = ['--data', os.path.join(DATA, 'master.dat'),
          '--data', os.path.join(DATA, 'critter.dat'),
          '--data', os.path.join(RPU, 'data'),
          '--data', os.path.join(RPU, 'scripts_src')]


def export_entities():
    """One gecko MCP call; returns the parsed export."""
    msgs = [
        {"jsonrpc": "2.0", "id": 1, "method": "initialize",
         "params": {"protocolVersion": "2024-11-05", "capabilities": {},
                    "clientInfo": {"name": "build-database", "version": "1"}}},
        {"jsonrpc": "2.0", "id": 2, "method": "tools/call",
         "params": {"name": "export_entities", "arguments": {}}},
    ]
    out = subprocess.run([GECKO_MCP] + MOUNTS,
                         input='\n'.join(json.dumps(m) for m in msgs),
                         capture_output=True, text=True, timeout=900).stdout
    for line in out.splitlines():
        d = json.loads(line)
        if d.get('id') == 2:
            return json.loads(d['result']['content'][0]['text'])
    raise SystemExit(f'export_entities: no response from {GECKO_MCP}')


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
    print(f'wrote {os.path.relpath(path, ROOT)} ({os.path.getsize(path) / 1e6:.2f} MB)')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--no-icons', action='store_true', help='skip icon rendering (needs a GL context)')
    ap.add_argument('--no-maps', action='store_true', help='skip map rendering (slow; needs a GL context)')
    args = ap.parse_args()

    print('exporting entities...', flush=True)
    t0 = time.time()
    export = export_entities()
    print(f'  {export["entityCount"]} entities, {len(export["protos"])} protos, '
          f'{len(export["maps"])} maps in {time.time() - t0:.0f}s')
    if export['mapsUnreadable']:
        # An item that appears nowhere only means something if every map was read.
        print(f'  WARNING: {len(export["mapsUnreadable"])} map(s) unreadable:', file=sys.stderr)
        for m in export['mapsUnreadable']:
            print(f'    {m["map"]}: {m["reason"]}', file=sys.stderr)

    # How many places each proto turns up, so a hover card can say "found in 3 places" without
    # holding the rows that say where.
    counts = {}
    for row in export['entities']:
        counts[row['pid']] = counts.get(row['pid'], 0) + 1
    protos = [{**p, 'n': counts.get(p['pid'], 0)} for p in export['protos']]

    os.makedirs(os.path.dirname(OUT_PROTOS), exist_ok=True)
    write(OUT_PROTOS, {'protos': protos})
    write(OUT_ENTITIES, {'maps': export['maps'], 'entities': export['entities'],
                         'mapsUnreadable': export['mapsUnreadable']})

    if not args.no_maps:
        print(f'rendering maps for {len(export["maps"])} maps...', flush=True)
        write(OUT_MAPDATA, {'maps': render_maps(export['maps'])})

    if args.no_icons:
        return 0

    os.makedirs(OUT_ICONS, exist_ok=True)
    # Everything with art, critters included. A critter's FRM is a directional animation, so take
    # one direction and one frame and you get a clean standing sprite — which is exactly what a
    # hover card wants.
    items = [p for p in export['protos'] if p['fid'] >= 0]
    print(f'rendering {len(items)} sprites...', flush=True)
    t0, written, failed = time.time(), 0, []
    for i, proto in enumerate(items, 1):
        path = os.path.join(OUT_ICONS, f'{proto["pid"]}.png')
        if os.path.exists(path):
            written += 1
            continue
        if render_icon(proto['fid'], path):
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
