import { defineConfig } from 'vite';

// Tauri expects a fixed port in dev; also fine for plain web preview.
export default defineConfig({
  clearScreen: false,
  server: { port: 1420, strictPort: false },
  build: {
    target: 'es2022',
    outDir: 'dist',
    emptyOutDir: true,
  },
});
