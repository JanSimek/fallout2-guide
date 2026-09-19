#!/usr/bin/env python3
"""
Build the perk database the guide's <Perk> tooltips read.

Perks are the one thing in this guide whose numbers are not in the game data. A perk's name and
description are in perk.msg, but what it *does* — ranks, level, the stat it raises, what it
requires — is a table compiled into the engine (fallout2-ce src/perk.cc, gPerkDescriptions). So
this reads both, and parses the table rather than transcribing it: a hand-copied copy of 119 rows
would drift the first time fallout2-ce touched one, and nothing would notice.

sfall can replace that table with a PerksFile, which would make the engine's copy the wrong answer.
RPU does not ship one (no PerksFile key in its ddraw.ini), so the compiled defaults are RPU's
values too. If RPU ever adds one this script has to read it instead — hence the check below.

    python3 scripts/build-perks.py           # -> static/data/perks.json
    python3 scripts/build-perks.py --out DIR

Every assumption it makes about the sources is asserted, so a silent half-empty database is not a
possible outcome: it either writes 119 complete perks or it fails.
"""
import argparse, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RPU = os.environ.get('FALLOUT2_RPU', os.path.expanduser('~/Development/Fallout2_Restoration_Project'))
CE = os.environ.get('FALLOUT2_CE', os.path.expanduser('~/Development/fallout2-ce'))
RPU_VERSION = os.environ.get('RPU_VERSION', os.path.basename(os.path.normpath(RPU)))

TEXT = os.path.join(RPU, 'data/text/english/game')
PERK_COUNT = 119

# perk.cc:285-290 — the engine reads a perk's name from 101 + perk and its description from
# 1101 + perk. stat.msg and skill.msg both name their entries from 100 + the enum value.
PERK_NAME_BASE = 101
PERK_DESC_BASE = 1101
STAT_NAME_BASE = 100
SKILL_NAME_BASE = 100

# PerkDescription (perk.cc:29), in declaration order. name/description are filled in at runtime
# from perk.msg, so the table's first two columns are always nullptr.
FIELDS = ['name', 'description', 'frmId', 'maxRank', 'minLevel', 'stat', 'statModifier',
          'param1', 'value1', 'paramMode', 'param2', 'value2',
          'ST', 'PE', 'EN', 'CH', 'IN', 'AG', 'LK']
SPECIAL = ['ST', 'PE', 'EN', 'CH', 'IN', 'AG', 'LK']

# perk.cc:24-26. Which of the two skill/gvar requirements have to hold.
PARAM_MODES = {0: 'first_only', 1: 'or', 2: 'and'}

# perk.cc:535 — this bit on a param means "global variable", not "skill".
GVAR_FLAG = 0x4000000


def msg(path):
    """A Fallout .msg as {id: text}, read the way the engine reads it.

    message.cc _message_load_field is a stream parser, not a line parser: a field is whatever sits
    between a '{' and the next '}', newlines inside it are dropped, and everything between a '}' and
    the next '{' is skipped entirely. Two consequences a line-based reader gets wrong — and both
    occur in perk.msg — are that an entry may span several lines, and that a trailing comment
    ("...your Strength.}  # Gain Strength") is not part of the text.

    Fields come in {id}{audio}{text} threes. Leading and trailing spaces are stripped, which the
    engine does not do; it only matters for display.
    """
    text = open(path, encoding='latin-1').read()
    fields, pos = [], 0
    while True:
        start = text.find('{', pos)
        if start < 0:
            break
        end = text.find('}', start + 1)
        if end < 0:
            break  # unterminated final field; the engine reports EOF here too
        fields.append(text[start + 1:end].replace('\n', '').replace('\r', ''))
        pos = end + 1

    out = {}
    for index in range(0, len(fields) - 2, 3):
        try:
            out[int(fields[index])] = fields[index + 2].strip()
        except ValueError:
            pass  # a non-numeric id means the triples have desynced; the caller's checks catch it
    return out


def enum_values(header, enum_name):
    """The members of a plain C enum, in order, as {SYMBOL: value}.

    The INVALID = -1 members and the _COUNT sentinels are dropped, but still counted through — an
    `INVALID = -1` is what puts the next member at 0, which is the whole reason these enums line up
    with their .msg ids."""
    src = open(os.path.join(CE, 'src', header), encoding='utf-8').read()
    body = src[src.index(f'enum {enum_name}'):]
    body = body[:body.index('};')]
    out, value = {}, 0
    for symbol, explicit in re.findall(r'^\s*([A-Z_0-9]+)\s*(?:=\s*(-?\w+))?\s*,', body, re.M):
        # findall gives '' for the optional group, not None: a bare member has no explicit value.
        if explicit:
            if not explicit.lstrip('-').isdigit():
                continue  # an alias like STAT_FIRST = STAT_STRENGTH; not a member of its own
            value = int(explicit)
        if value >= 0 and not symbol.endswith('_COUNT'):
            out[symbol] = value
        value += 1
    return out


def perk_table():
    """gPerkDescriptions, as a list of dicts keyed by FIELDS."""
    src = open(os.path.join(CE, 'src/perk.cc'), encoding='utf-8').read()
    start = src.index('static PerkDescription gPerkDescriptions[PERK_COUNT] = {')
    body = src[start:]
    body = body[:body.index('\n};')]
    rows = re.findall(r'^\s*\{(.+)\},\s*$', body, re.M)
    if len(rows) != PERK_COUNT:
        sys.exit(f'perk.cc: expected {PERK_COUNT} rows in gPerkDescriptions, parsed {len(rows)}')

    table = []
    for index, row in enumerate(rows):
        values = [v.strip() for v in row.split(',')]
        if len(values) != len(FIELDS):
            sys.exit(f'perk.cc: perk {index} has {len(values)} fields, expected {len(FIELDS)} — '
                     'the PerkDescription struct changed shape')
        table.append(dict(zip(FIELDS, values)))
    return table


def number(value):
    """A table cell that should be an integer literal."""
    return int(value, 0)


def requirement(param, value, skills, gvar_names):
    """One skill-or-gvar requirement, or None when the slot is empty (param -1).

    perk.cc:533-560: a negative value inverts the test — the engine asks for `< -value` rather than
    `>= value`, which is how the two Ranger-style "must NOT have" perks are expressed.
    """
    param = number(param)
    if param == -1:
        return None
    value = number(value)
    kind = 'gvar' if param & GVAR_FLAG else 'skill'
    index = param & ~GVAR_FLAG
    out = {'kind': kind, 'index': index,
           'op': 'below' if value < 0 else 'atLeast',
           'value': abs(value)}
    if kind == 'skill':
        out['name'] = skills.get(index, f'skill {index}')
    else:
        out['name'] = gvar_names.get(index, f'GVAR {index}')
    return out


def special_requirements(row):
    """The primary-stat minimums, as {stat, op, value}.

    perk.cc:611-616 gives a negative entry the same inverted sense as a skill requirement: the
    engine fails the check when the stat is >= -value, i.e. the perk wants the stat BELOW that.
    Gain Strength is the one that matters — it is ST -10, meaning it cannot be taken at ST 10, not
    that it requires minus ten Strength. Emitting the sense here keeps that out of the UI.
    """
    out = []
    for key in SPECIAL:
        value = number(row[key])
        if not value:
            continue
        out.append({'stat': key, 'op': 'below' if value < 0 else 'atLeast', 'value': abs(value)})
    return out


def build():
    perks_msg = msg(os.path.join(TEXT, 'perk.msg'))
    stats_msg = msg(os.path.join(TEXT, 'stat.msg'))
    skills_msg = msg(os.path.join(TEXT, 'skill.msg'))

    stat_enum = enum_values('stat_defs.h', 'Stat')
    skill_enum = enum_values('skill_defs.h', 'Skill')
    # Symbol -> the name the game shows, so the tooltip says "Melee Damage", not STAT_MELEE_DAMAGE.
    stat_name = {sym: stats_msg.get(STAT_NAME_BASE + val, sym) for sym, val in stat_enum.items()}
    skill_name = {val: skills_msg.get(SKILL_NAME_BASE + val, sym) for sym, val in skill_enum.items()}

    table = perk_table()
    perks, used = [], {}
    for index, row in enumerate(table):
        name = perks_msg.get(PERK_NAME_BASE + index)
        description = perks_msg.get(PERK_DESC_BASE + index)
        if not name:
            sys.exit(f'perk.msg: no name at {PERK_NAME_BASE + index} for perk {index}')
        if not description:
            # Vanilla's perk.msg has a malformed line that swallows the four Autodoc descriptions;
            # RPU ships a fixed one. Landing here means the mount is pointing at vanilla.
            sys.exit(f'perk.msg: no description at {PERK_DESC_BASE + index} for {name!r} — '
                     f'is {TEXT} RPU\'s text, or vanilla\'s?')

        stat_symbol = row['stat']
        modifier = number(row['statModifier'])
        effect = None
        if stat_symbol != 'STAT_INVALID' and modifier:
            if stat_symbol not in stat_name:
                sys.exit(f'perk.cc: perk {index} modifies unknown stat {stat_symbol}')
            effect = {'stat': stat_name[stat_symbol], 'amount': modifier}

        requires = [r for r in (requirement(row['param1'], row['value1'], skill_name, {}),
                                requirement(row['param2'], row['value2'], skill_name, {}))
                    if r]
        mode = PARAM_MODES.get(number(row['paramMode']))
        if mode is None:
            sys.exit(f'perk.cc: perk {index} has unknown paramMode {row["paramMode"]}')
        # first_only means the second slot is never consulted, whatever it holds.
        if mode == 'first_only':
            requires = requires[:1]

        slug = re.sub(r'_+', '_', re.sub(r'[^A-Za-z0-9]+', '_', name)).strip('_')
        if slug in used:
            slug = f'{slug}_{index}'
        used[slug] = True

        perks.append({
            'id': index,
            'name': name,
            'slug': slug,
            'description': description,
            'ranks': number(row['maxRank']),
            'level': number(row['minLevel']),
            'special': special_requirements(row),
            'effect': effect,
            'requires': requires,
            'requiresMode': mode if len(requires) > 1 else None,
        })

    return {'source': f'RPU {RPU_VERSION} + fallout2-ce gPerkDescriptions', 'perks': perks}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', help='write data/ here instead of static/')
    args = ap.parse_args()

    for path in (os.path.join(TEXT, 'perk.msg'), os.path.join(CE, 'src/perk.cc')):
        if not os.path.exists(path):
            sys.exit(f'missing {path} — set FALLOUT2_RPU / FALLOUT2_CE')

    # A PerksFile would override everything parsed here, silently.
    ddraw = os.path.join(RPU, 'extra/package/ddraw.ini')
    if os.path.exists(ddraw):
        with open(ddraw, encoding='latin-1', errors='replace') as handle:
            for line in handle:
                stripped = line.strip()
                if stripped.lower().startswith('perksfile') and stripped.split('=', 1)[-1].strip():
                    sys.exit(f'{ddraw} sets {stripped} — RPU now overrides the perk table and this '
                             'script reads the wrong one. Parse that file instead.')

    out = os.path.abspath(args.out) if args.out else os.path.join(ROOT, 'static')
    path = os.path.join(out, 'data/perks.json')
    payload = build()
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as handle:
        json.dump(payload, handle, separators=(',', ':'), ensure_ascii=False)
    ranked = sum(1 for p in payload['perks'] if p['ranks'] > 1)
    gated = sum(1 for p in payload['perks'] if p['requires'])
    print(f'wrote {path} ({os.path.getsize(path) / 1024:.0f} KB): {len(payload["perks"])} perks, '
          f'{ranked} with multiple ranks, {gated} with a skill or gvar requirement')
    return 0


if __name__ == '__main__':
    sys.exit(main())
