import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(() => {
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      // Kein API-Key im Build: Jede Person hinterlegt ihren eigenen Key in der App.
      // Für GitHub Pages wird der Pfad über VITE_BASE gesetzt (z. B. "/AI-Scout/").
      base: process.env.VITE_BASE || '/',
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
