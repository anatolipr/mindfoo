import { defineConfig } from 'vite'

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    port: 5551,
    strictPort: true,
  },
  test: {
    environment: 'jsdom',
  },
})