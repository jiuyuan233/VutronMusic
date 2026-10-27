import type { CapacitorConfig } from '@capacitor/cli'

/**
 * VutronMusic Android (Capacitor) 配置
 *
 * 桌面版基于 Electron，移动版基于 Capacitor 6。
 * - webDir 指向 vite.config.mobile.ts 的输出目录
 * - server.androidScheme 用 https 以支持网易云 cookie 的 Secure 属性
 * - backgroundColor 与深色主题对齐
 */
const config: CapacitorConfig = {
  appId: 'com.vutronmusic.android',
  appName: 'VutronMusic',
  webDir: 'dist-mobile',
  backgroundColor: '#1f1f1f',
  server: {
    androidScheme: 'https',
    // 移动端不走 live reload；开发时可用 npx cap run android --live-reload
    cleartext: true
  },
  android: {
    allowMixedContent: true,
    // WebView 内允许跨域请求网易云（配合 Capacitor 原生 HTTP 优先策略）
    webContentsDebuggingEnabled: true
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 800,
      backgroundColor: '#1f1f1f',
      androidSpinnerStyle: 'large',
      showSpinner: true,
      androidScaleType: 'centerCrop'
    },
    Keyboard: {
      resize: 'body',
      style: 'DARK',
      resizeOnFullScreen: true
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#1f1f1f'
    }
  }
}

export default config
