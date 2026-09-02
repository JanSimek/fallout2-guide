import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'Fallout 2 Guide',
  tagline: 'A complete walkthrough for the Restoration Project Updated',
  favicon: 'img/favicon.png',

  future: {
    v4: true,
  },

  url: 'https://JanSimek.github.io',
  baseUrl: '/fallout2-guide/',

  organizationName: 'JanSimek',
  projectName: 'fallout2-guide',

  onBrokenLinks: 'throw',

  markdown: {
    hooks: {
      onBrokenMarkdownLinks: 'warn',
    },
    mermaid: true,
  },

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          editUrl: 'https://github.com/JanSimek/fallout2-guide/tree/master/website/',
          routeBasePath: '/',
          showLastUpdateTime: true,
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themes: [
    '@docusaurus/theme-mermaid',
    [
      '@easyops-cn/docusaurus-search-local',
      {
        hashed: true,
        docsRouteBasePath: '/',
        indexBlog: false,
        highlightSearchTermsOnTargetPage: true,
      },
    ],
  ],

  themeConfig: {
    colorMode: {
      defaultMode: 'dark',
      respectPrefersColorScheme: true,
    },
    tableOfContents: {
      minHeadingLevel: 2,
      maxHeadingLevel: 4,
    },
    navbar: {
      title: 'Fallout 2 Guide',
      logo: {
        alt: 'Fallout 2 Guide',
        src: 'img/favicon.png',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'startSidebar',
          position: 'left',
          label: 'Getting Started',
        },
        {
          type: 'docSidebar',
          sidebarId: 'characterSidebar',
          position: 'left',
          label: 'Character Creation',
        },
        {
          type: 'docSidebar',
          sidebarId: 'walkthroughSidebar',
          position: 'left',
          label: 'Walkthrough',
        },
        {
          type: 'docSidebar',
          sidebarId: 'referenceSidebar',
          position: 'left',
          label: 'Reference',
        },
        {
          // A page rather than a doc, so it is linked by path instead of a sidebar id.
          to: '/database',
          position: 'left',
          label: 'Database',
        },
        {
          type: 'search',
          position: 'right',
        },
        {
          href: 'https://github.com/BGforgeNet/Fallout2_Restoration_Project',
          label: 'RPU',
          position: 'right',
        },
        {
          href: 'https://github.com/JanSimek/fallout2-guide',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Guide',
          items: [
            {label: 'Installation', to: '/getting-started/installation'},
            {label: 'Character Creation', to: '/character/overview'},
            {label: 'Walkthrough', to: '/walkthrough/overview'},
            {label: 'Quest Index', to: '/reference/quest-index'},
          ],
        },
        {
          title: 'The Mod',
          items: [
            {label: 'Restoration Project Updated', href: 'https://github.com/BGforgeNet/Fallout2_Restoration_Project'},
            {label: 'FOR:CE Community Engine', href: 'https://github.com/fallout2-ce/fallout2-ce'},
            {label: 'RPU Walkthrough (BGforge)', href: 'https://f2rp.bgforge.net/'},
          ],
        },
        {
          title: 'Community',
          items: [
            {label: 'No Mutants Allowed', href: 'https://www.nma-fallout.com/'},
            {label: 'BGforge Forums', href: 'https://forums.bgforge.net/viewforum.php?f=39'},
            {label: 'Fallout Wiki', href: 'https://fallout.fandom.com/wiki/Fallout_2'},
          ],
        },
      ],
      copyright: `Fallout 2 Guide — content licensed CC BY-SA 4.0. Fallout 2 is a trademark of Bethesda Softworks LLC. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.vsLight,
      darkTheme: prismThemes.vsDark,
      additionalLanguages: ['ini', 'bash'],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
