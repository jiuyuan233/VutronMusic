import { defineConfig, loadEnv } from 'vite'
import { resolve } from 'path'
import Vue from '@vitejs/plugin-vue'
import VueJsx from '@vitejs/plugin-vue-jsx'
import { createSvgIconsPlugin } from 'vite-plugin-svg-icons'

/**
 * 移动端（Android / Capacitor）Vite 配置
 *
 * 与桌面版 vite.config.ts 的关键差异：
 * 1. 不构建 Electron 主进程 / preload / workers
 * 2. 不 external electron / better-sqlite3 / piscina / taglib-wasm
 * 3. 输出到 dist-mobile（capacitor.config.ts 的 webDir）
 * 4. 注入 __CAPACITOR__ 全局变量，供 renderer 判断平台
 * 5. base 用相对路径 './' 以适配 WebView file:// 或 https://localhost 协议
 *
 * 复用 src/renderer 全部前端代码，通过 src/mobile/shim.ts 在运行时
 * 把 window.mainApi / window.env 桥接到 Capacitor 插件。
 */
export default defineConfig(({ mode }) => {
  process.env = {
    ...process.env,
    ...loadEnv(mode, process.cwd()),
    // 运行时通过 import.meta.env.__CAPACITOR__ 判断
    VITE_TARGET_PLATFORM: 'capacitor'
  }

  return {
    base: './',
    mode,
    root: resolve('src/renderer'),
    publicDir: resolve('src/public'),
    resolve: {
      alias: {
        // 与原项目一致：@ 指向项目根 src/，使 '@/types/schemas' 等正常解析
        '@': resolve('src'),
        '@mobile': resolve('src/mobile')
      }
    },
    define: {
      // 运行时常量，供 renderer 侧的平台分支使用
      __CAPACITOR__: JSON.stringify(true),
      __ELECTRON__: JSON.stringify(false),
      'import.meta.env.VITE_TARGET_PLATFORM': JSON.stringify('capacitor')
    },
    build: {
      outDir: resolve('dist-mobile'),
      assetsDir: 'assets',
      sourcemap: mode === 'development',
      target: 'es2020',
      cssCodeSplit: true,
      rollupOptions: {
        input: {
          main: resolve('src/renderer/index.mobile.html')
        },
        output: {
          entryFileNames: 'assets/[name].js',
          chunkFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash][extname]'
        }
      },
      commonjsOptions: {
        ignoreDynamicRequires: true,
        transformMixedEsModules: true
      }
    },
    plugins: [
      Vue(),
      VueJsx(),
      createSvgIconsPlugin({
        iconDirs: [resolve('src/renderer/assets/icons')],
        symbolId: 'icon-[dir]-[name]'
      }),
      // 把 index.mobile.html 重命名为 index.html（Capacitor 要求 webDir 入口为 index.html）
      {
        name: 'vutron-mobile-rename-html',
        closeBundle() {
          const fs = require('fs')
          const from = resolve('dist-mobile', 'index.mobile.html')
          const to = resolve('dist-mobile', 'index.html')
          if (fs.existsSync(from)) {
            fs.renameSync(from, to)
          }
        }
      }
    ],
    optimizeDeps: {
      // 网易云 API 在移动端走 src/mobile/neteaseClient.ts 的纯前端实现，
      // 不引入 @neteasecloudmusicapienhanced/api（Node.js 库）
      exclude: [
        '@neteasecloudmusicapienhanced/api',
        '@unblockneteasemusic/server',
        'better-sqlite3',
        'electron',
        'electron-store',
        'electron-log',
        'electron-updater',
        '@electron/rebuild',
        'fastify',
        '@fastify/cookie',
        '@fastify/cors',
        '@fastify/static',
        'sharp',
        'taglib-wasm',
        'music-metadata',
        'node-vibrant',
        'font-list',
        'piscina',
        '@jellybrick/mpris-service',
        'discord-rich-presence',
        '@httptoolkit/dbus-native'
      ]
    },
    worker: {
      format: 'es'
    }
  }
})
