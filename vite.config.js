import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite config for the dart tournament app
// React plugin enables JSX and Fast Refresh during development
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    open: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
