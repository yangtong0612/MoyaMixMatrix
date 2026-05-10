import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    port: 5174,
    strictPort: true,
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: 'https://backend.suringmedical.com',
        changeOrigin: true,
        secure: false,
        rewrite: (url) => url.replace(/^\/api/, '')
      }
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src')
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: true
  }
});
