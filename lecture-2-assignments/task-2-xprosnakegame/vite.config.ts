import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    // 1. Updated base path to include your game folder
    base: '/lecture-2-assignments/task-2-xprosnakegame/', 
    
    // 2. Added this build step to put the game inside the subfolder URL
    build: {
      outDir: 'dist/task-2-xprosnakegame',
    },

    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});