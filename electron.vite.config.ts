import { defineConfig } from 'electron-vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  main: {
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src')
      }
    },
    build: {
      rollupOptions: {
        external: [],
        // 扩展宿主 Worker 需独立入口打包（new Worker 运行时引用——非入口链）
                input: {
                  index: resolve(__dirname, 'src/main/index.ts'),
                  'provider-host-worker': resolve(__dirname, 'src/main/core/provider/provider-host-worker.ts'),
                },
      }
    }
  },
  preload: {
    build: {
      rollupOptions: {
        external: []
      }
    }
  },
  renderer: {
    plugins: [vue()],
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src')
      }
    },
    build: {
      rollupOptions: {
        external: []
      }
    }
  }
})
