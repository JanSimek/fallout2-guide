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
- **Reference** — 182 quests indexed, 11 companions, combat, items, the car, random encounters, endings

## Development

```bash
cd website
npm install
npm start          # http://localhost:3000
npm run build
```

Requires Node 20+.

### Custom MDX components

Three components are registered globally, so no imports are needed in `.mdx` files:

| Component | Use |
| --- | --- |
| `<Vanilla>…</Vanilla>` | An info icon whose tooltip explains what the unmodded game did |
| `<Quest>Name</Quest>` | Links a quest name to its Fallout Wiki page |
| `<Quest rpu>Name</Quest>` | Marks a quest RPU added, which has no wiki page |
| `<Wiki page="X">text</Wiki>` | A general Fallout Wiki link |

`<Quest>` infers the wiki page from its text; pass `page="…"` when they differ.

## Deployment

Pushing to `master` builds and deploys to GitHub Pages via
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml).

## Credits

The facts in this guide were documented by other people first — principally Per Jorner's
*The Nearly Ultimate Fallout 2 Guide* and the community-maintained
[RPU walkthrough](https://f2rp.bgforge.net/). Both are credited properly on the
[Credits](website/docs/reference/credits.mdx) page. The prose here is original.

Content is licensed CC BY-SA 4.0. Fallout 2 is a trademark of Bethesda Softworks LLC.
