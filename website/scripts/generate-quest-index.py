#!/usr/bin/env python3
"""
Regenerate the body of docs/reference/quest-index.mdx.

Every link is built from the anchors Docusaurus actually emitted, so a link can
only be generated if its target exists. Run after `npm run build`:

    npm run build
    python3 scripts/generate-quest-index.py > /tmp/body.md
    # then splice /tmp/body.md under the front matter of
    # docs/reference/quest-index.mdx and rebuild

Inputs:
  build/walkthrough/*/index.html   heading anchors (the source of truth)
  scripts/quests-from-wiki.json    canonical quest list, from the Fallout Wiki
  scripts/quest-section-overrides.json
                                   quests described under a differently-named
                                   section, mapped by hand

Quests present as numbered headings but absent from the wiki list are treated as
Restoration Project additions.
"""
import json, re, html as H, sys, os, glob

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def load_anchors():
    out = {}
    for f in sorted(glob.glob(os.path.join(ROOT, 'build/walkthrough/*/index.html'))):
        page = os.path.basename(os.path.dirname(f))
        s = open(f, encoding='utf-8').read()
        out[page] = [
            {'id': m.group(3),
             'text': H.unescape(re.sub(r'<[^>]+>', '', m.group(4))).replace('\u200b', '').strip()}
            for m in re.finditer(r'<h([234])[^>]*\sid=(["\']?)([A-Za-z0-9_-]+)\2[^>]*>(.*?)</h\1>', s)
        ]
    if not out:
        sys.exit('No build output found — run `npm run build` first.')
    return out

real  = load_anchors()
wiki  = json.load(open(os.path.join(ROOT, 'scripts/quests-from-wiki.json')))
extra = json.load(open(os.path.join(ROOT, 'scripts/quest-section-overrides.json')))

def norm(s):
    s = s.replace('’',"'").replace('—','-').replace('–','-')
    s = re.sub(r'^\s*\d+\.\s*', '', s)
    return re.sub(r'[^a-z0-9]+', ' ', s.lower()).strip()

by_text, anchors_on = {}, {}
for page, hs in real.items():
    anchors_on[page] = {h['id'] for h in hs}
    for h in hs: by_text.setdefault(norm(h['text']), (page, h['id']))

wiki_names = {norm(q['name']) for qs in wiki.values() for q in qs}

def target(name):
    k = norm(name)
    if k in by_text: return by_text[k]
    if name in extra: return tuple(extra[name])
    return None

loc_page  = {'Arroyo':'arroyo','Broken Hills':'broken-hills','The Den':'the-den','Gecko (town)':'gecko',
 'Klamath':'klamath','Modoc':'modoc','Navarro':'navarro','New California Republic':'ncr','New Reno':'new-reno',
 'Redding':'redding','San Francisco':'san-francisco','Sierra Army Depot':'sierra-army-depot',
 'Vault 13 (Fallout 2)':'vault-13','Vault 15':'vault-15','Vault City (Fallout 2)':'vault-city'}
loc_title = {'Gecko (town)':'Gecko','Vault 13 (Fallout 2)':'Vault 13','Vault City (Fallout 2)':'Vault City'}
order = ['Arroyo','Klamath','The Den','Modoc','Vault City (Fallout 2)','Gecko (town)','Broken Hills','Redding',
 'New Reno','Sierra Army Depot','New California Republic','Vault 15','Vault 13 (Fallout 2)','San Francisco','Navarro']
rpu_only = [('Vault Village','vault-village'),('Umbra Tribe','umbra-tribe'),("Slaver's Camp",'slavers-camp'),
 ('EPA','epa'),('Abbey','abbey')]

claimed = set()
for qs in wiki.values():
    for q in qs:
        t = target(q['name'])
        if t: claimed.add(t)

def rpu_quests(page):
    res = []
    for h in real[page]:
        t = h['text']
        ok = re.match(r'^\d+\.\s', t) or (page=='slavers-camp' and t.lower().startswith('rescue kurisu'))
        if not ok: continue
        if (page, h['id']) in claimed: continue
        name = re.sub(r'^\s*\d+\.\s*', '', t).strip()
        if norm(name) in wiki_names: continue
        res.append((name, h['id']))
    return res

def attr(s): return H.escape(s, quote=True)
def body(s): return s.replace('{','&#123;').replace('}','&#125;')
def row(name, page, anchor, wiki_page=None, rpu=False):
    assert anchor in anchors_on[page], f'BROKEN {page}#{anchor} for {name}'
    a = f'to="/walkthrough/{page}#{anchor}"'
    if rpu: a += ' rpu'
    elif wiki_page: a += f' wiki="{attr(wiki_page)}"'
    return f'- <QuestLink {a}>{body(name)}</QuestLink>'

out, nb, nr, missing = [], 0, 0, []
for loc in order:
    page = loc_page[loc]
    out += [f'## {loc_title.get(loc, loc)}\n', f'**[Full walkthrough →](/walkthrough/{page})**\n']
    for q in wiki.get(loc, []):
        t = target(q['name'])
        if not t: missing.append(q['name']); continue
        out.append(row(q['name'], t[0], t[1], q['page'] or q['name'])); nb += 1
    for name, anchor in rpu_quests(page):
        out.append(row(name, page, anchor, rpu=True)); nr += 1
    out.append('')
out += ['---\n', '## Locations added by RPU\n',
        'None of these quests exist in the unmodded game, so none of them has a wiki page.\n']
for title, page in rpu_only:
    out += [f'### {title}\n', f'**[Full walkthrough →](/walkthrough/{page})**\n']
    for name, anchor in rpu_quests(page):
        out.append(row(name, page, anchor, rpu=True)); nr += 1
    out.append('')
sys.stdout.write('\n'.join(out))
print(f'base {nb} + rpu {nr} = {nb+nr}   missing: {missing}', file=sys.stderr)
