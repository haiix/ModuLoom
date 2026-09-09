import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  optimizeDeps: {
    include: [
      '@jitl/quickjs-wasmfile-release-sync',
      '@jitl/quickjs-wasmfile-release-sync/emscripten-module',
      'acorn',
      'quickjs-emscripten-core',
    ],
  },
  plugins: [react(), tailwindcss()],
});
