import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages serves the app at https://sakhi20.github.io/<repo>/. Must match the repo name.
const PAGES_BASE = '/health/'

export default defineConfig(({ command, isPreview }) => {
  // The dev server stays at "/" so the old LAN URL keeps working for exporting.
  // Builds and "vite preview" use the Pages subpath.
  const base = command === 'serve' && !isPreview ? '/' : PAGES_BASE
  return {
    base,
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'prompt',
        manifest: {
          name: 'Health',
          short_name: 'Health',
          description: 'Personal protein, water, sleep and energy log',
          start_url: base,
          scope: base,
          display: 'standalone',
          background_color: '#0f172a',
          theme_color: '#0f172a',
          icons: [
            { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
            { src: 'maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png}'],
          navigateFallback: `${base}index.html`,
          cleanupOutdatedCaches: true,
        },
      }),
    ],
  }
})
