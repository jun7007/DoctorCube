import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // 상대 경로로 빌드해 GitHub Pages 같은 하위 경로에서도 그대로 동작하게 한다.
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'DoctorCube — 큐브 배우기',
        short_name: 'DoctorCube',
        description: '3D로 보면서 큐브 공식을 배우는 앱',
        lang: 'ko',
        display: 'standalone',
        orientation: 'any',
        start_url: '.',
        scope: '.',
        theme_color: '#0e1120',
        background_color: '#0e1120',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
});
