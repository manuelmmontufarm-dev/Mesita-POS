import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    root: 'client/pos-pilot',
    base: '/pos-pilot/',
    plugins: [react()],
    build: {
      outDir: '../../public/pos-pilot',
      emptyOutDir: true,
      sourcemap: false,
      manifest: true,
    },
    server: {
      host: '127.0.0.1',
      port: 5174,
      strictPort: true,
      proxy: {
        '/api/pos-pilot': env.POS_PILOT_BFF_ORIGIN || 'http://127.0.0.1:3001',
      },
    },
  };
});
