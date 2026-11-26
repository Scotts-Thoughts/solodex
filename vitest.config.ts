import { defineConfig } from 'vitest/config'
import path from 'path'
import solodexDataPlugin from './scripts/vite-plugin-solodex-data'

// Unit tests for the pure-logic parts of the renderer (damage calculator,
// stat formulas). Shares the renderer's path aliases and data plugin so
// `@data/*` imports resolve to the raw data files exactly as they do in the app.
export default defineConfig({
  plugins: [solodexDataPlugin({ dataDir: path.resolve(__dirname, 'data_objects-main') })],
  resolve: {
    alias: [
      // Shared damage engine (git submodule, see damage-calc/README.md)
      { find: /^@stp\/damage-calc\/(.*)$/, replacement: path.resolve(__dirname, 'damage-calc/src/$1') },
      { find: '@stp/damage-calc', replacement: path.resolve(__dirname, 'damage-calc/src/index.ts') },
      { find: '@data', replacement: path.resolve(__dirname, 'data_objects-main') },
      { find: '@', replacement: path.resolve(__dirname, 'src/renderer/src') },
    ],
  },
  test: {
    include: ['src/**/__tests__/**/*.test.ts', 'damage-calc/src/**/__tests__/**/*.test.ts', 'scripts/**/__tests__/**/*.test.mjs', 'relay/test/**/*.test.ts'],
    environment: 'node',
  },
})
