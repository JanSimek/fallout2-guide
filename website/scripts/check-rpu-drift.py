#!/usr/bin/env python3
"""
Detect where the guide has drifted from the game data after an RPU update.

Compares the built site against RPU's own files and reports what needs attention.
Nothing is rewritten — this only tells you where to look.

    cd website
    npm run build                                   # anchors come from the built HTML
    python3 scripts/check-rpu-drift.py              # human-readable report
    python3 scripts/check-rpu-drift.py --json       # machine-readable
    python3 scripts/check-rpu-drift.py --refresh    # re-pull game data via the gecko MCP first

Exit status is 1 if anything needs attention, so it works in CI.

Checks
  1. quests      every quests.txt entry has a heading in the guide, and vice versa
  2. xp          every "N XP" figure in the guide exists as an EXP_* constant or a
                 literal give_xp() argument somewhere in scripts_src
  3. deadexp     EXP_* constants the guide relies on that no script actually uses
  4. links       every quest-index link resolves to a real anchor
  5. admonitions no literal ':::' survived into the built HTML
  6. gvars       GVAR names cited in the guide still exist in the game
"""
import argparse, json, os, re, subprocess, sys, glob, html
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO = os.path.dirname(ROOT)
RPU = os.environ.get('FALLOUT2_RPU', os.path.expanduser('~/Development/Fallout2_Restoration_Project'))
GECKO = os.environ.get('GECKO_MCP', os.path.expanduser('~/Development/geck-map-editor/build/gecko-mcp'))
DATA = os.environ.get('FALLOUT2_DATA', os.path.expanduser('~/Development'))
GAME_JSON = os.path.join(ROOT, 'scripts/quests-from-game.json')
BASELINE = os.path.join(ROOT, 'scripts/drift-baseline.json')

def norm(s):
    s = html.unescape(s).replace('’', "'").replace('—', '-').replace('–', '-')
    s = re.sub(r'^\s*\d+\.\s*', '', s)
    s = re.sub(r'\b(the|a|an)\b', ' ', s.lower())
    return re.sub(r'[^a-z0-9]+', ' ', s).strip()

def mcp(tool):
    """Call one gecko MCP tool over stdio and return its parsed payload."""
    msgs = [
        {"jsonrpc": "2.0", "id": 1, "method": "initialize",
         "params": {"protocolVersion": "2024-11-05", "capabilities": {},
                    "clientInfo": {"name": "drift", "version": "1"}}},
        {"jsonrpc": "2.0", "id": 2, "method": "tools/call",
         "params": {"name": tool, "arguments": {}}},
    ]
    args = [GECKO,
            '--data', os.path.join(DATA, 'master.dat'),
            '--data', os.path.join(DATA, 'critter.dat'),
            '--data', os.path.join(RPU, 'data'),
            '--data', os.path.join(RPU, 'scripts_src')]
    out = subprocess.run(args, input='\n'.join(json.dumps(m) for m in msgs),
                         capture_output=True, text=True, timeout=600).stdout
    for line in out.splitlines():
        d = json.loads(line)
        if d.get('id') == 2:
            return json.loads(d['result']['content'][0]['text'])
    raise SystemExit(f'{tool}: no response from {GECKO}')

def guide_headings():
    """{normalised heading -> [(page, raw text, anchor)]} from the built HTML."""
    out = defaultdict(list)
    for f in sorted(glob.glob(os.path.join(ROOT, 'build/walkthrough/*/index.html'))):
        page = os.path.basename(os.path.dirname(f))
        s = open(f, encoding='utf-8').read()
        for m in re.finditer(r'<h([234])[^>]*\sid=(["\']?)([A-Za-z0-9_-]+)\2[^>]*>(.*?)</h\1>', s):
            t = html.unescape(re.sub(r'<[^>]+>', '', m.group(4))).replace('​', '').strip()
            out[norm(t)].append((page, t, m.group(3)))
    if not out:
        raise SystemExit('No build output — run `npm run build` first.')
    return out

def guide_text():
    return {f: open(f, encoding='utf-8').read()
            for f in glob.glob(os.path.join(ROOT, 'docs/**/*.mdx'), recursive=True)}

def script_sources():
    files = glob.glob(os.path.join(RPU, 'scripts_src/**/*.ssl'), recursive=True)
    return {f: open(f, encoding='utf-8', errors='replace').read()
            for f in files if not f.endswith('.tmp')}

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--json', action='store_true')
    ap.add_argument('--refresh', action='store_true', help='re-pull game data via the gecko MCP')
    ap.add_argument('--update-baseline', action='store_true',
                    help='accept everything currently reported as the new baseline')
    args = ap.parse_args()

    if args.refresh or not os.path.exists(GAME_JSON):
        json.dump(mcp('quests')['quests'], open(GAME_JSON, 'w'), indent=1)

    base = (json.load(open(BASELINE)) if os.path.exists(BASELINE)
            else {'quest_aliases': {}, 'xp_allowlist': [], 'note': ''})
    aliases = base.get('quest_aliases', {})   # quests.txt description -> guide heading it lives under
    xp_ok = set(base.get('xp_allowlist', []))

    quests = json.load(open(GAME_JSON))
    heads = guide_headings()
    docs = guide_text()
    srcs = script_sources()
    report = defaultdict(list)

    # 1. quests.txt <-> guide headings
    for q in quests:
        desc = q['description'].rstrip('.')
        if norm(desc) in heads:
            continue
        covered_by = aliases.get(desc)
        if covered_by and norm(covered_by) in heads:
            continue                      # guide covers it under a different heading
        report['quests_missing_from_guide'].append(
            {'area': q['area'], 'quest': q['description'], 'gvar': q['gvarName'],
             'stale_alias': covered_by} if covered_by else
            {'area': q['area'], 'quest': q['description'], 'gvar': q['gvarName']})

    # 2. XP figures cited in the guide must exist in the scripts
    exp_h = open(os.path.join(RPU, 'scripts_src/headers/exppoint.h'), encoding='utf-8',
                 errors='replace').read()
    consts = {int(v) for v in re.findall(r'#define\s+EXP_\w+\s+\(?\s*(-?\d+)', exp_h)}
    literals = set()
    for text in srcs.values():
        for m in re.finditer(r'give_xp\(\s*(\d+)\s*\)', text):
            literals.add(int(m.group(1)))
    known = consts | literals | {v * 2 for v in consts}      # some awards are doubled
    for f, text in docs.items():
        for m in re.finditer(r'\*?\*?([\d,]{2,})\*?\*?\s*XP', text):
            n = int(m.group(1).replace(',', ''))
            if n not in known and n >= 25 and n not in xp_ok:
                report['xp_not_found_in_scripts'].append(
                    {'file': os.path.relpath(f, REPO), 'value': n})

    # 3. EXP_* constants that no script uses (the EXP_SULIK_SISTER trap)
    cited = set()
    for text in docs.values():
        for m in re.finditer(r'\*?\*?([\d,]{2,})\*?\*?\s*XP', text):
            cited.add(int(m.group(1).replace(',', '')))
    used = {c for text in srcs.values() for c in re.findall(r'\bEXP_[A-Z0-9_]+\b', text)}
    # The generic skill-XP tables (EXP_LOCKPICK_NEG_40 and friends) are macro families whose
    # values collide with ordinary quest rewards, so they are pure noise here.
    SKILL_FAMILIES = ('EXP_LOCKPICK', 'EXP_STEALING', 'EXP_TRAPS', 'EXP_GAMBLING',
                      'EXP_SPEECH', 'EXP_SCIENCE', 'EXP_REPAIR')
    for name, val in re.findall(r'#define\s+(EXP_\w+)\s+\(?\s*(-?\d+)', exp_h):
        if name in used or name.startswith(SKILL_FAMILIES):
            continue
        # A dead constant whose value the guide quotes is worth a look: the guide may be
        # citing the header rather than an actual give_xp call. This is how EXP_SULIK_SISTER
        # (defined 300, never used, real award 1000) would have been caught.
        if int(val) in cited:
            report['dead_exp_constants'].append({'const': name, 'value': int(val)})

    # 4. quest-index links resolve
    idx = os.path.join(ROOT, 'build/reference/quest-index/index.html')
    if os.path.exists(idx):
        s = open(idx, encoding='utf-8').read()
        cache = {}
        for _, href in re.findall(r'href=(["\']?)(/fallout2-guide/walkthrough/[^"\'\s>]+)\1', s):
            if '#' not in href:
                continue
            path, frag = href.split('#', 1)
            page = path.replace('/fallout2-guide/', '').strip('/')
            if page not in cache:
                pf = os.path.join(ROOT, 'build', page, 'index.html')
                cache[page] = ({m.group(2) for m in re.finditer(
                    r'\sid=(["\']?)([A-Za-z0-9_-]+)\1', open(pf, encoding='utf-8').read())}
                    if os.path.exists(pf) else None)
            if cache[page] is None or frag not in cache[page]:
                report['broken_quest_links'].append(href)

    # 5. admonitions that failed to parse
    for f in glob.glob(os.path.join(ROOT, 'build/**/index.html'), recursive=True):
        s = re.sub(r'(?is)<script.*?</script>', '', open(f, encoding='utf-8').read())
        if ':::' in html.unescape(re.sub(r'<[^>]+>', '', s)):
            report['unparsed_admonitions'].append(os.path.relpath(f, ROOT))

    # 6. GVAR names cited in the guide still exist
    gvars = set(re.findall(r'#define\s+(GVAR_\w+)',
                open(os.path.join(RPU, 'scripts_src/headers/global.h'),
                     encoding='utf-8', errors='replace').read()))
    for f, text in docs.items():
        for g in set(re.findall(r'\bGVAR_[A-Z0-9_]+\b', text)):
            if g not in gvars:
                report['unknown_gvars'].append({'file': os.path.relpath(f, REPO), 'gvar': g})

    if args.update_baseline:
        newbase = {
            'note': ('Accepted differences. quest_aliases maps a quests.txt description to the '
                     'guide heading that covers it (the guide uses Fallout Wiki phrasing in '
                     'places); xp_allowlist holds figures that are sums or derived rather than a '
                     'single give_xp call. Regenerate with --update-baseline once you have '
                     'checked the report by hand.'),
            'quest_aliases': aliases,
            'xp_allowlist': sorted(xp_ok | {i['value'] for i in report.get('xp_not_found_in_scripts', [])}),
        }
        json.dump(newbase, open(BASELINE, 'w'), indent=1)
        print(f'baseline written to {os.path.relpath(BASELINE, REPO)}')
        return 0

    if args.json:
        print(json.dumps(report, indent=1))
    else:
        titles = {
            'quests_missing_from_guide': 'Quests in quests.txt with no heading in the guide',
            'xp_not_found_in_scripts':   'XP figures the guide cites that no script awards',
            'dead_exp_constants':        'EXP_* constants no script uses (do not trust these)',
            'broken_quest_links':        'Quest-index links that do not resolve',
            'unparsed_admonitions':      'Pages with literal ::: in the built HTML',
            'unknown_gvars':             'GVAR names cited in the guide that no longer exist',
        }
        blocking = {'quests_missing_from_guide', 'broken_quest_links',
                    'unparsed_admonitions', 'unknown_gvars'}
        for key, title in titles.items():
            items = report.get(key, [])
            mark = '!!' if (items and key in blocking) else ('..' if items else 'ok')
            print(f'\n[{mark}] {title}: {len(items)}')
            for it in items[:25]:
                print(f'      {it}')
            if len(items) > 25:
                print(f'      ... and {len(items) - 25} more')
        print()

    return 1 if any(report.get(k) for k in
                    ('quests_missing_from_guide', 'broken_quest_links',
                     'unparsed_admonitions', 'unknown_gvars')) else 0

if __name__ == '__main__':
    sys.exit(main())
