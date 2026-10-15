// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { unified } from '@astrojs/markdown-remark';
import remarkDirective from 'remark-directive';
import { remarkServer } from './src/lib/remark-server.mjs';

const BASE = '/repo-servidor';

export default defineConfig({
  site: 'https://lpedaci.github.io',
  base: BASE,
  trailingSlash: 'always',
  integrations: [
    sitemap({
      filter: (page) => !page.includes('/ui/') && !page.includes('/inventario/') && !page.includes('/propuestas/'),
    }),
  ],
  markdown: {
    processor: unified({
      // Smartypants convierte "--" en rayas. El copy del server no usa rayas.
      smartypants: false,
      remarkPlugins: [remarkDirective, [remarkServer, { base: BASE }]],
    }),
    shikiConfig: { theme: 'github-dark-default' },
  },
});
