import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

// Every sidebar ends with the repository, so the source is one click away from any page.
const githubLink = {
  type: 'link',
  label: 'GitHub repository',
  href: 'https://github.com/JanSimek/fallout2-guide',
} as const;

const sidebars: SidebarsConfig = {
  startSidebar: [
    {
      type: 'category',
      label: 'Getting Started',
      collapsed: false,
      items: [
        'index',
        'getting-started/installation',
        'getting-started/configuration',
        'getting-started/using-this-guide',
      ],
    },
    githubLink,
  ],

  characterSidebar: [
    {
      type: 'category',
      label: 'Character Creation',
      collapsed: false,
      items: [
        'character/overview',
        'character/special',
        'character/traits',
        'character/skills',
        'character/perks',
        'character/special-perks',
        'character/builds',
        'character/reputation',
        'character/leveling',
      ],
    },
    githubLink,
  ],

  walkthroughSidebar: [
    {
      type: 'category',
      label: 'Walkthrough',
      collapsed: false,
      items: [
        'walkthrough/overview',
        {
          type: 'category',
          label: 'Chapter 1 — The Trials',
          collapsed: false,
          items: [
            'walkthrough/temple-of-trials',
            'walkthrough/arroyo',
            'walkthrough/klamath',
            'walkthrough/toxic-caves',
            'walkthrough/the-den',
            'walkthrough/modoc',
          ],
        },
        {
          type: 'category',
          label: 'Chapter 2 — The Wasteland',
          collapsed: false,
          items: [
            'walkthrough/vault-city',
            'walkthrough/gecko',
            'walkthrough/vault-village',
            'walkthrough/raiders',
            'walkthrough/umbra-tribe',
            'walkthrough/slavers-camp',
            'walkthrough/broken-hills',
            'walkthrough/redding',
          ],
        },
        {
          type: 'category',
          label: 'Chapter 3 — New Reno and Beyond',
          collapsed: false,
          items: [
            'walkthrough/new-reno',
            'walkthrough/golgotha',
            'walkthrough/the-stables',
            'walkthrough/sierra-army-depot',
            'walkthrough/epa',
            'walkthrough/abbey',
          ],
        },
        {
          type: 'category',
          label: 'Chapter 4 — The Republic',
          collapsed: false,
          items: [
            'walkthrough/ncr',
            'walkthrough/vault-15',
            'walkthrough/vault-13',
            'walkthrough/military-base',
          ],
        },
        {
          type: 'category',
          label: 'Chapter 5 — The West Coast',
          collapsed: false,
          items: [
            'walkthrough/san-francisco',
            'walkthrough/navarro',
            'walkthrough/enclave',
          ],
        },
      ],
    },
    githubLink,
  ],

  referenceSidebar: [
    {
      type: 'category',
      label: 'Reference',
      collapsed: false,
      items: [
        'reference/quest-index',
        {
          type: 'category',
          label: 'Companions',
          collapsed: false,
          items: [
            'companions/overview',
            'companions/sulik',
            'companions/vic',
            'companions/cassidy',
            'companions/myron',
            'companions/lenny',
            'companions/marcus',
            'companions/skynet',
            'companions/goris',
            'companions/dogmeat',
            'companions/k9',
            'companions/rpu-companions',
          ],
        },
        {
          type: 'category',
          label: 'Systems',
          collapsed: false,
          items: [
            'systems/combat',
            'systems/items',
            'systems/car',
            'systems/random-encounters',
            'systems/low-intelligence',
          ],
        },
        'reference/endings',
        'reference/known-issues',
        'reference/keyboard-shortcuts',
        'reference/credits',
      ],
    },
    githubLink,
  ],
};

export default sidebars;
