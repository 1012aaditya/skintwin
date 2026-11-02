import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const alias = {
  '@shared': resolve('src/shared'),
  '@renderer': resolve('src/renderer/src')
}

export default defineConfig({
  main: {
    resolve: { alias },
    build: { externalizeDeps: true }
  },
  preload: {
    resolve: { alias },
    build: {
      // Sandboxed preload scripts must be CommonJS.
      rollupOptions: { output: { format: 'cjs', entryFileNames: '[name].cjs' } }
    }
  },
  renderer: {
    resolve: { alias },
    plugins: [react(), tailwindcss()],
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/renderer/index.html'),
          companion: resolve('src/renderer/companion.html'),
          circle: resolve('src/renderer/circle.html')
        }
      }
    }
  }
})
