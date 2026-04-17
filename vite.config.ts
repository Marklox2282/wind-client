import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist/renderer',
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@/components': resolve(__dirname, 'src/renderer/components'),
      '@/pages': resolve(__dirname, 'src/renderer/pages'),
      '@/store': resolve(__dirname, 'src/renderer/store'),
      '@/core': resolve(__dirname, 'src/core'),
      '@/shared': resolve(__dirname, 'src/shared'),
    },
  },
  server: {
    port: 3000,
  },
})
