import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import path from 'path'

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
    plugins: [react()]
  }
})
