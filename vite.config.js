import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import {fileURLToPath} from 'node:url';

export default defineConfig({
  root:'dashboard',
  plugins:[react(),tailwindcss()],
  resolve:{alias:{'@':fileURLToPath(new URL('./dashboard/src',import.meta.url))}},
  // Keep old hashed assets available to browser tabs that are already open.
  build:{outDir:'../public/dashboard',emptyOutDir:false},
});
