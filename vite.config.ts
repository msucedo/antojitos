import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  build: {
    // El sprite de iconos se usa con <use href>: debe ser un archivo, nunca un data: URI
    // (los navegadores bloquean <use> hacia data: y la CSP solo permite 'self').
    assetsInlineLimit: (file) => (file.endsWith('.svg') ? false : undefined),
  },
  plugins: [
    VitePWA({
      // src/main.ts registra el SW con `virtual:pwa-register`: sin script inline, compatible con la CSP.
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        cleanupOutdatedCaches: true,
        // Controlar la página desde la primera visita: si no, una actualización que llega
        // en esa misma sesión activa el SW nuevo pero el botón "Recargar" nunca recarga.
        clientsClaim: true,
      },
      manifest: {
        name: 'Imperio de Antojitos',
        short_name: 'Antojitos',
        lang: 'es-MX',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#E4007C',
        background_color: '#FFF6E5',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  test: {
    environment: 'node',
  },
});
