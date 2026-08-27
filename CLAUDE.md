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
`find_text`, `find_script`, `describe_script`, `gvars`, `analyze`, `world_encounters`, `render_map`.

- `find_gvar` → `describe_script` is the fastest route from "what triggers this?" to the source line.
- `find_text` searches the dialog `.msg`, the `game/*.msg` (item, perk, quest text) and the script
  sources — `.ssl` **and** `headers/*.h`, where the `GVAR_*`/`EXP_*` defines live — in one call, so
  "which script says this line?" is one call. It returns the script basename, which
  `describe_script` takes directly.
- `find_script` answers the reverse — which shipped maps place a script, and in which section. It
  also lists `mapsUnreadable`: **an empty `placements` is only trustworthy when that list is empty
  too**. All 176 shipped maps parse as of gecko PR #134; before it, the two EPA main maps did not,
  and quietly dropped out of every scan.

**Use the MCP tools, not `grep` over `scripts_src`.** The source tree holds the logic but not the
dialogue: what an NPC *says* lives in `data/text/english/dialog/*.msg`, and item/perk/quest wording in
`game/*.msg`. `find_text` covers all three at once; grep over `scripts_src` silently misses two of
them. Reach for grep only when you already know the script and want raw context.

**Rebuilding `gecko-mcp` does not update this session.** Tool schemas are captured when the server
connects, so new tools stay invisible until you reconnect it with `/mcp` (pick the `gecko` server →
reconnect). Restarting Claude Code also works. Until then the new tools cannot be called at all — not
a permissions problem, the schemas simply are not loaded.

**Script indices are 0-based; `headers/scripts.h` is 1-based.** `SCRIPT_EPAC17 (1413)` is
`programIndex` 1412, and passing the constant unadjusted silently describes `epac18` instead. Pass
`name` ("epac17") rather than an index, and check the `sslConstant` each result echoes.

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
| 0-damage crit XP loss | **Still works** — `_damage_object` returns early on `damage <= 0`, before both the XP award and `itemDestroyAllHidden` |
| Flare stack duplication, save-in-combat freeze, explosives corrupting a save | **Not confirmed either way** — marked as such in the guide |

Where something cannot be settled from source in reasonable time, say so in the guide rather than
asserting it. Do not silently delete an inherited claim either — it may well still be real.

## Gotchas that have already bitten

- **Admonition titles are `:::note[Title]`**, not `:::note Title`. Docusaurus 3 dropped the v2
  form and fails *silently* — the whole block renders as literal text. Grep the built HTML for
  `:::` after any content change.
- **`{#custom-id}` does not work in `.mdx`** — MDX v3 parses braces as a JS expression. Heading
  anchors are auto-generated, which is why the quest index is generated rather than hand-written.
- **Quest headings are plain text.** No JSX in headings.

## quests.txt is the authority on quest names

`scripts/quests-from-game.json` is the in-game registry (157 entries) pulled from RPU's
`quests.txt` via the `gecko` MCP `quests` tool. It has the exact Pip-Boy wording and the tracking
GVAR. Prefer it over the Fallout Wiki's phrasing when they disagree — the wiki paraphrases, and it
lists things that are not Pip-Boy quests at all.

Refresh it with `quests` and re-run the index generator, which now treats any heading matching a
`quests.txt` description as a quest even when it is not numbered.

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

## After an RPU update

```bash
cd website && npm run build
python3 scripts/check-rpu-drift.py --refresh    # re-pulls quests.txt via the gecko MCP
```

It compares the built site against RPU's own data and reports six things: quests in `quests.txt`
with no heading here, XP figures no script awards, dead `EXP_*` constants whose value the guide
quotes, broken quest-index links, unparsed admonitions, and `GVAR_*` names that no longer exist.
Exit status is 1 if anything blocking turns up, so it works in CI.

`scripts/drift-baseline.json` holds accepted differences — quest-name aliases (the guide uses
Fallout Wiki phrasing in places) and XP figures that are sums rather than a single `give_xp`.
**Read the report before running `--update-baseline`**, or you will bless real drift as accepted.

## Checks worth running before pushing

```bash
cd website && npm run build          # onBrokenLinks: throw, so this catches dead internal links
grep -rn ':::' build --include=index.html | head   # should find nothing
```

`master` builds on every push. Pages deployment is gated behind the `ENABLE_PAGES` repo variable
because Pages is not available for private repos on the free plan.
