import { defineConfig } from 'vitest/config'
import path from 'path'
import solodexDataPlugin from './scripts/vite-plugin-solodex-data'

// Unit tests for the pure-logic parts of the renderer (damage calculator,
// stat formulas). Shares the renderer's path aliases and data plugin so
// `@data/*` imports resolve to the raw data files exactly as they do in the app.
export default defineConfig({
  plugins: [solodexDataPlugin({ dataDir: path.resolve(__dirname, 'data_objects-main') })],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src/renderer/src'),
      '@data': path.resolve(__dirname, 'data_objects-main'),
    },
  },
  test: {
    include: ['src/**/__tests__/**/*.test.ts', 'scripts/**/__tests__/**/*.test.mjs', 'relay/test/**/*.test.ts'],
    environment: 'node',
  },
})
