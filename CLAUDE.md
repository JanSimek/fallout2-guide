# Fallout 2 Guide — working notes

A Docusaurus guide to Fallout 2 as played with the **Restoration Project Updated (RPU)**.

## The one rule

**The guide describes RPU, not vanilla.** Never add "in the original game…" prose to the body.
Where a difference is worth recording, put it in a `<Vanilla>` tooltip:

```mdx
The rat god can be brought down by collapsing the cave on him.
<Vanilla>The original game only lets you fight Keeng Ra'at, for 300 XP.</Vanilla>
```

Small differences are not marked at all.

## Verify against the game, not against other guides

Prose here is original, but the *facts* came from Per Jorner's guide and the BGforge RPU
walkthrough — both secondary sources. Before stating a number, check it.

**RPU source tree** (`$FALLOUT2_RPU`, default `~/Development/Fallout2_Restoration_Project`):

- `headers/exppoint.h` — `EXP_*` constants. **Some are dead** (`EXP_SULIK_SISTER`,
  `EXP_CHAD_EXPOSED` are defined but never used). Always confirm with the `give_xp` call site.
- `scripts_src/<location>/*.ssl` — the actual quest logic, skill checks and karma changes.
  Ignore the `.ssl.tmp` files.

**`gecko` MCP server** (see `.mcp.json` and the README): `quests`, `endings`, `find_gvar`,
`describe_script`, `gvars`, `analyze`, `world_encounters`, `render_map`. `find_gvar` →
`describe_script` is the fastest route from "what triggers this?" to the source line.

## Gotchas that have already bitten

- **Admonition titles are `:::note[Title]`**, not `:::note Title`. Docusaurus 3 dropped the v2
  form and fails *silently* — the whole block renders as literal text. Grep the built HTML for
  `:::` after any content change.
- **`{#custom-id}` does not work in `.mdx`** — MDX v3 parses braces as a JS expression. Heading
  anchors are auto-generated, which is why the quest index is generated rather than hand-written.
- **Quest headings are plain text.** No JSX in headings.

## Quest index

`docs/reference/quest-index.mdx` is generated from the anchors the built site actually emits, so a
link cannot exist unless its target does:

```bash
cd website && npm run build
python3 scripts/generate-quest-index.py > /tmp/body.md   # prints base/rpu counts + anything missing
# splice /tmp/body.md under the front matter, then rebuild
```

Regenerate it after renaming or renumbering any quest heading. Quests described under a
differently-named section are mapped in `scripts/quest-section-overrides.json`.

## Checks worth running before pushing

```bash
cd website && npm run build          # onBrokenLinks: throw, so this catches dead internal links
grep -rn ':::' build --include=index.html | head   # should find nothing
```

`master` builds on every push. Pages deployment is gated behind the `ENABLE_PAGES` repo variable
because Pages is not available for private repos on the free plan.
