import { existsSync, readFileSync } from 'node:fs';
import { parse } from 'dotenv';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig(() => {
  const envPath = new URL('../../.env', import.meta.url);
  const localEnv = existsSync(envPath) ? parse(readFileSync(envPath)) : {};
  const port = process.env.PORT || localEnv.PORT || '3001';
  const timezone = process.env.VITE_TIMEZONE || localEnv.VITE_TIMEZONE || 'America/Sao_Paulo';
  return {
    plugins: [react()],
    define: {
      'import.meta.env.VITE_TIMEZONE': JSON.stringify(timezone),
    },
    server: { strictPort: true, proxy: { '/api': `http://127.0.0.1:${port}` } },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            react: ['react', 'react-dom/client', 'react-router-dom'],
            charts: ['recharts'],
            query: ['@tanstack/react-query'],
            forms: ['zod', 'react-hook-form', '@hookform/resolvers/zod'],
          },
        },
      },
    },
  };
});
