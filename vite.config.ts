import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    base: './',
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: {
        // The JSON 'database' and uploaded-file storage live inside the project
        // folder and are rewritten on every API call. Without this, Vite treats
        // each write as a source change and force-reloads the whole page,
        // wiping in-progress UI state (e.g. right after saving Settings).
        ignored: ['**/database/**', '**/storage/**'],
      },
    },
  };
});
