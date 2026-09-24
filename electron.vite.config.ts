import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import solodexDataPlugin from './scripts/vite-plugin-solodex-data'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    server: {
      port: 5174
    },
    base: './',
    define: {
      // Make process.platform available in renderer without nodeIntegration
      'process.platform': JSON.stringify(process.platform)
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src/renderer/src'),
        '@data': path.resolve(__dirname, 'data_objects-main')
      }
    },
    plugins: [react(), solodexDataPlugin({ dataDir: path.resolve(__dirname, 'data_objects-main') })],
    build: {
      // electron-vite leaves the renderer unminified by default
      minify: 'esbuild',
      // The per-game data chunks are legitimately large
      chunkSizeWarningLimit: 6000
    }
  }
})
