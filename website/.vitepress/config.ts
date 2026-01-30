import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'schelectron',
  description: 'A VSCode Editor for End-to-End Analog/RF IC Design',
  base: '/schelectron/',

  // TypeDoc-generated markdown contains internal reference links that
  // VitePress cannot resolve - this is expected behavior
  ignoreDeadLinks: true,

  head: [
    ['link', { rel: 'icon', href: '/logo.png' }]
  ],

  themeConfig: {
    logo: '/logo.png',

    nav: [
      { text: 'Guide', link: '/guide/' },
      { text: 'Features', link: '/features/' },
      { text: 'API', link: '/api/' },
    ],

    sidebar: {
      '/guide/': [
        {
          text: 'Getting Started',
          items: [
            { text: 'Introduction', link: '/guide/' },
            { text: 'Installation', link: '/guide/installation' },
            { text: 'Quick Start', link: '/guide/quick-start' }
          ]
        },
        {
          text: 'Core Concepts',
          items: [
            { text: 'SVG Schema', link: '/guide/svg-schema' }
          ]
        }
      ],
      '/features/': [
        {
          text: 'Features',
          items: [
            { text: 'Overview', link: '/features/' },
            { text: 'Schematic Editor', link: '/features/schematic-editor' },
            { text: 'Symbol Editor', link: '/features/symbol-editor' },
            { text: 'Python Integration', link: '/features/python-integration' }
          ]
        }
      ],
      '/api/': [
        {
          text: 'API Reference',
          items: [
            { text: 'Overview', link: '/api/' }
          ]
        },
        {
          text: 'TypeScript',
          items: [
            { text: 'SchematicsCore', link: '/api/typescript/SchematicsCore/src/' },
            { text: 'EditorCore', link: '/api/typescript/EditorCore/src/' },
            { text: 'PlatformInterface', link: '/api/typescript/PlatformInterface/src/' }
          ]
        },
        {
          text: 'Python',
          items: [
            { text: 'hdl21schematicimporter', link: '/api/python/' }
          ]
        }
      ]
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/gdsfactory/schelectron' }
    ],

    search: {
      provider: 'local'
    },

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright gdsfactory contributors'
    }
  }
})
