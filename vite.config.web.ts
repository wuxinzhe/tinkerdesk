import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  plugins: [vue()],
  root: 'src/renderer',
  base: '/',
  build: {
    outDir: resolve(__dirname, '../src/main/resources/static'),
    emptyOutDir: true
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    }
  },
  server: {
    port: 5173,
    host: '0.0.0.0',
    strictPort: true,
    proxy: {
      '/auth': { target: 'http://localhost:8080', changeOrigin: true },
      '/sessions': { target: 'http://localhost:8080', changeOrigin: true },
      '/agent': { target: 'http://localhost:8080', changeOrigin: true },
      '/account': { target: 'http://localhost:8080', changeOrigin: true },
      '/sandbox': { target: 'http://localhost:8080', changeOrigin: true },
      '/tools': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        bypass: (req) => {
          const path = req.url?.split('?')[0] ?? '';
          if (path.endsWith('.ts') || path.endsWith('.vue') || path.endsWith('.css')) {
            return req.url;
          }
        }
      },
      '/skills': { target: 'http://localhost:8080', changeOrigin: true },
      '/models': { target: 'http://localhost:8080', changeOrigin: true },
      '/messages': { target: 'http://localhost:8080', changeOrigin: true },
      '/ws': { target: 'ws://localhost:8080', ws: true, changeOrigin: true }
    }
  }
})
