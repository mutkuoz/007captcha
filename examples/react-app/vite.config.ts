import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@007captcha/client': resolve(__dirname, '../../packages/client/dist/index.mjs'),
      '@007captcha/react': resolve(__dirname, '../../packages/react/dist/index.mjs'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/captcha': 'http://localhost:3007',
      '/verify': 'http://localhost:3007',
    },
  },
});
