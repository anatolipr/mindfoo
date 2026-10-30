import { defineConfig } from 'vite'

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    port: 5551,
    strictPort: true,
  },
  // Tests run on Node directly, which has no decorators or `accessor` fields yet.
  esbuild: process.env.VITEST ? { target: 'es2022' } : undefined,
  test: {
    environment: 'jsdom',
  },
})