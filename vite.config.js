import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readBuildInfo } from './scripts/build-info.mjs'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: { __LINGUAJET_BUILD_INFO__: JSON.stringify(readBuildInfo()) },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
    exclude: ['.worktrees/**', 'node_modules/**'],
  },
})
