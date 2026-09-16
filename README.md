# Fallout 2 Guide

A complete Fallout 2 walkthrough written for the
[Restoration Project Updated](https://github.com/BGforgeNet/Fallout2_Restoration_Project) (RPU).

Most Fallout 2 guides describe the unpatched 1998 release. RPU restores the content that was cut
before shipping, fixes the bugs, and changes enough quest logic that an old guide will send you
looking for things that are no longer there.

**Everything in this guide describes RPU as it actually behaves.** Where the difference from the
original game is large enough to trip over, an info icon carries the "what it used to be" note on
hover, so the guide body never has to stop and explain itself.

## Contents

- **Getting Started** — installing the game and the mod, and the settings worth changing
- **Character Creation** — SPECIAL, traits, skills, perks, special perks, karma, and five complete builds
- **Walkthrough** — 28 locations in playing order, quest by quest, linked to the Fallout Wiki
- **Reference** — all 182 quests indexed and linked to their descriptions, 11 companions, combat,
  items, the car, random encounters, endings

## Development

```bash
cd website
npm install
npm run fetch-database   # the object database's generated files; needs the gh CLI
npm start                # http://localhost:3000
npm run build
```

Requires Node 20+. Without `fetch-database` the site still builds, but `/database` and the item
hover cards have nothing to show.

`npm install` also points git at [`.githooks/`](.githooks). Its pre-commit hook keeps the object
database in step with RPU (see [Deployment](#deployment)); `SKIP_DATABASE_UPDATE=1 git commit …`
skips it once.

### Custom MDX components

Three components are registered globally, so no imports are needed in `.mdx` files:

| Component | Use |
| --- | --- |
| `<Vanilla>…</Vanilla>` | An info icon whose tooltip explains what the unmodded game did |
| `<Quest>Name</Quest>` | Marks a quest name in body text. Not a link — quests are described here |
| `<Quest rpu>Name</Quest>` | Marks a quest RPU added |
| `<QuestLink to="…" wiki="…">Name</QuestLink>` | Quest Index rows: links into this guide, plus an optional secondary wiki link |
| `<Wiki page="X">text</Wiki>` | A general Fallout Wiki link |

### Regenerating the quest index

`website/docs/reference/quest-index.mdx` is generated from the built site's own heading anchors, so
every link is verified to resolve. After renaming or renumbering a quest heading, rebuild and
regenerate rather than editing the index by hand.

## Verifying the guide against the game

Facts in this guide are checked against the Restoration Project's own data rather than against other
walkthroughs. Two ways in:

**The RPU source tree** — `scripts_src/*.ssl` and `headers/exppoint.h` in a local checkout of
[Fallout2_Restoration_Project](https://github.com/BGforgeNet/Fallout2_Restoration_Project). XP
awards, skill-check thresholds and karma changes are all there in the scripts.

> **Careful:** some `EXP_*` constants are defined but never referenced — `EXP_SULIK_SISTER` and
> `EXP_CHAD_EXPOSED` among them. Confirm the value is actually used by a `give_xp` call; do not
> trust the header alone.

**The `gecko` MCP server** — a JSON-RPC wrapper over
[geck-map-editor](https://github.com/JanSimek/geck-map-editor) that reads the mounted game data
directly. Configured in [`.mcp.json`](.mcp.json); it needs the editor built
(`cmake --build build --target gecko-mcp`) and paths overridable via `GECKO_MCP`, `FALLOUT2_RPU`
and `FALLOUT2_DATA`.

> **Mount order matters — later `--data` mounts win.** `master.dat` and `critter.dat` must come
> *first*, RPU's `data/` last, or vanilla silently overrides RPU for every file RPU patches:
> `quests.txt`, `endgame.txt`, `vault13.gam`, `worldmap.txt`, `city.txt`, `maps.txt`, `ai.txt`,
> `party.txt`, `karmavar.txt`. Getting this backwards is not an error — the tools just answer
> about the wrong game (110 quests instead of 157, 52 ending slides instead of 59, 695 globals
> instead of 791).
>
> Sanity check: `quests` should report **157**.

The tools that matter for this guide:

| Tool | What it settles |
| --- | --- |
| `quests` | The Pip-Boy quest registry from `quests.txt` — real quest names, areas and their GVARs |
| `endings` | The endgame slide table from `endgame.txt` — each slide's GVAR and value |
| `find_gvar` | Every script that reads or writes a GVAR, with file and line |
| `describe_script` | A script's `.ssl` source **and** its dialogue `.msg` lines |
| `gvars` | The full GVAR dictionary from `vault13.gam` |
| `analyze` / `describe_map` | What is actually on a map: critters, scripts, containers |
| `world_encounters` | Terrain types and random-encounter tables from `worldmap.txt` |
| `render_map` | Renders a map to PNG, if the guide ever wants real maps |

Worked example — confirming how the Den's ending is chosen:

```
find_gvar GVAR_ENDGAME_MOVIE_DEN   ->  enclave/qcfrank.ssl
```

which reads `if (metzger_dead) { if (becky_dead) 1 else 2 } else { if (big_jesus_dead...) 3 else 4 }`
— i.e. kill Metzger but spare Rebecca for the good ending, exactly as
[Endings](website/docs/reference/endings.mdx) describes.

## Deployment

**Live at <https://jansimek.github.io/fallout2-guide/>.**

[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) builds on every push and pull request
— which catches broken internal links, MDX errors and type failures — and deploys `master` to GitHub
Pages.

Deployment is gated behind the `ENABLE_PAGES` repository variable, so it can be paused without
touching the workflow:

```bash
gh variable set ENABLE_PAGES --body false   # pause
gh variable set ENABLE_PAGES --body true    # resume
```

The object database is the one part CI cannot build: `scripts/build-database.py` needs gecko and
the game's `.dat` files. Its output (about 150 MB, mostly map renders) is published as a GitHub
Release instead, and the workflow downloads the tag pinned in `website/scripts/database-release.txt`.

Keeping it current needs no manual step. On every commit, the pre-commit hook checks the newest
RPU **2.4.x** release. When the pin is behind, it downloads that release's source, runs
`build-database.py`, refuses to publish a build with unreadable maps or missing renders, uploads
the result as `database-rpu-<version>`, and adds the new pin to the commit. Merging that commit to
`master` deploys it. A machine without gecko or the game files just prints a warning and commits.
To run the same thing without committing:

```bash
cd website && scripts/database-release.sh update
```

## Credits

The facts in this guide were documented by other people first — principally Per Jorner's
*The Nearly Ultimate Fallout 2 Guide* and the community-maintained
[RPU walkthrough](https://f2rp.bgforge.net/). Both are credited properly on the
[Credits](website/docs/reference/credits.mdx) page. The prose here is original.

Content is licensed CC BY-SA 4.0. Fallout 2 is a trademark of Bethesda Softworks LLC.
