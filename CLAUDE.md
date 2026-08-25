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

**Later `--data` mounts win.** RPU's `data/` must be mounted *after* `master.dat`, or vanilla
overrides every file RPU patches — `quests.txt`, `endgame.txt`, `vault13.gam`, `worldmap.txt`,
`city.txt`, `maps.txt`, `ai.txt`. It fails silently: the tools answer confidently about vanilla.
**Sanity check before trusting any answer: `quests` must report 157, not 110.**

## Engine-level claims need checking against FOR:CE

The guide inherited a set of engine bugs from Per Jorner, who documented the 1998 executable. The
guide now recommends **FOR:CE**, which fixes a lot of them. Before repeating an engine bug, check
`~/Development/fallout2-ce` (or wherever the CE checkout lives) — most fixes are labelled
`// SFALL: Fix ...`, and behaviour toggles live in `files/ce.dat/config/game.cfg`.

Audited so far:

| Claim | Status |
| --- | --- |
| Bonus Move refills on save/reload | **Still works** — `_combat_turn` resets `_combat_free_move` unconditionally on the forced reload turn |
| Level 98 skips to 99 | Fixed |
| Pathfinder / Sharpshooter bugged | Fixed (`// SFALL: Fix ...`) |
| Town-map number keys, `0` to exit dialogue | Fixed by default (`town_map_hotkeys_fix`, `no_exit_hotkey`) |
| Tag! skill-point doubling | Intact (`TagSkillMode=0`) |
| "Too many items" corruption | Probably fixed — the Pip-Boy lists are now paginated and bounds-checked. Not confirmed. |
| Flare stack duplication, 0-damage crit XP loss, save-in-combat freeze, explosives corrupting a save | **Not confirmed either way** — marked as such in the guide |

Where something cannot be settled from source in reasonable time, say so in the guide rather than
asserting it. Do not silently delete an inherited claim either — it may well still be real.

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
