#!/usr/bin/env python3
"""Collect every <Unverified> note in the guide into the generated block of the To Check page.

    cd website && npm run build          # the anchors come from the built HTML
    python3 scripts/list-unverified.py   # rewrites the block in docs/reference/todo.mdx

The claim stays where it is, on its own page, with the icon that says it wants confirming; this only
gathers them so the list can be worked through. Anything outside the markers in todo.mdx is left
alone — the open work that is not a single marked claim is written by hand.
"""
import glob, html as H, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAGE = os.path.join(ROOT, 'docs/reference/todo.mdx')
START = '{/* generated:unverified — python3 scripts/list-unverified.py */}'
END = '{/* /generated:unverified */}'

# Where a doc lives -> the URL Docusaurus gives it (routeBasePath is '/').
def url_of(path):
    return '/' + os.path.relpath(path, os.path.join(ROOT, 'docs'))[:-4].replace(os.sep, '/')


def anchors_for(url):
    """Heading text -> anchor id, read back from the built page so a link cannot be invented."""
    f = os.path.join(ROOT, 'build', url.strip('/'), 'index.html')
    if not os.path.exists(f):
        return {}
    s = open(f, encoding='utf-8').read()
    out = {}
    for m in re.finditer(r'<h([234])[^>]*\sid=(["\']?)([A-Za-z0-9_-]+)\2[^>]*>(.*?)</h\1>', s):
        text = H.unescape(re.sub(r'<[^>]+>', '', m.group(4))).replace('​', '').strip()
        out.setdefault(text.lower(), m.group(3))
    return out


def clean(text):
    """MDX to something readable in a list: drop tags, links to their text, collapse space."""
    # Table rows carry no sentence, and an admonition's marker is not part of the claim — but its
    # title usually is the claim's subject, so keep the title and drop the syntax around it.
    text = '\n'.join(l for l in text.split('\n') if not l.lstrip().startswith('|'))
    text = re.sub(r':::[a-z]+\[([^\]]*)\]', r'\1:', text)
    text = re.sub(r'^\s*:::\s*$', '', text, flags=re.M)
    text = re.sub(r'^\s*[-*]\s+', '', text, flags=re.M)
    text = re.sub(r'<Unverified>.*?</Unverified>', '', text, flags=re.S)
    text = re.sub(r'<Vanilla>.*?</Vanilla>', '', text, flags=re.S)
    text = re.sub(r'<Item[^>]*>(.*?)</Item>', r'\1', text, flags=re.S)
    text = re.sub(r'<Quest[^>]*>(.*?)</Quest>', r'\1', text, flags=re.S)
    text = re.sub(r'<[^>]+>', '', text)
    text = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', text)
    text = text.replace('{/*', '').replace('*/}', '')
    return re.sub(r'\s+', ' ', text).strip(' *_#|-')


def sentence_before(before):
    """The claim the note hangs off: the last sentence of the text in front of it."""
    # Never read back past the heading the claim sits under, or the heading becomes the claim.
    heads = list(re.finditer(r'^#{2,4}\s+.+$', before, flags=re.M))
    if heads:
        before = before[heads[-1].end():]
    text = clean(before)
    parts = re.split(r'(?<=[.!?:])\s+', text)
    tail = ' '.join(parts[-2:]) if parts and len(parts[-1]) < 40 else (parts[-1] if parts else '')
    return tail[-300:].strip()


def heading_before(before):
    found = re.findall(r'^#{2,4}\s+(.+?)\s*$', before, flags=re.M)
    return found[-1].strip() if found else None


def collect():
    items = {}
    for path in sorted(glob.glob(os.path.join(ROOT, 'docs/**/*.mdx'), recursive=True)):
        source = open(path, encoding='utf-8').read()
        if '<Unverified>' not in source or path == PAGE:
            continue
        url = url_of(path)
        title = (re.search(r'^title:\s*(.+)$', source, flags=re.M) or [None, None])[1]
        title = (title or url.rsplit('/', 1)[-1]).strip().strip('"\'')
        anchors = anchors_for(url)
        rows = []
        for m in re.finditer(r'<Unverified>(.*?)</Unverified>', source, flags=re.S):
            before = source[:m.start()]
            heading = heading_before(before)
            anchor = anchors.get((heading or '').lower())
            rows.append({
                'claim': sentence_before(before),
                'note': clean(m.group(1)) or 'No note.',
                'heading': heading,
                'link': f'{url}#{anchor}' if anchor else url,
            })
        items[(title, url)] = rows
    return items


def render(items):
    total = sum(len(rows) for rows in items.values())
    out = [START, '',
           f'The guide carries **{total}** of these, on {len(items)} pages.', '']
    for (title, url), rows in sorted(items.items()):
        out.append(f'### [{title}]({url})')
        out.append('')
        for row in rows:
            where = f' *({row["heading"]})*' if row['heading'] else ''
            out.append(f'- [ ] [{row["claim"]}]({row["link"]}){where}<br />')
            out.append(f'  **Why it is unconfirmed:** {row["note"]}')
        out.append('')
    out.append(END)
    return '\n'.join(out)


def main():
    if not os.path.isdir(os.path.join(ROOT, 'build')):
        sys.exit('No build output — run `npm run build` first, so the anchors are real.')
    page = open(PAGE, encoding='utf-8').read()
    if START not in page or END not in page:
        sys.exit(f'{PAGE} has no generated block — add the markers back.')
    items = collect()
    head, rest = page.split(START, 1)
    _, tail = rest.split(END, 1)
    open(PAGE, 'w', encoding='utf-8').write(head + render(items) + tail)
    print(f'{sum(len(r) for r in items.values())} unverified claims across {len(items)} pages')


if __name__ == '__main__':
    main()
