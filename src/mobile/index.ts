import { StatusBar, Style } from '@capacitor/status-bar'
import { Keyboard } from '@capacitor/keyboard'
import { App } from '@capacitor/app'
import { installMobileShim } from './shim'
import { initNeteaseClient } from './neteaseClient'
import * as pref from './preferences'

/**
 * 移动端初始化入口
 * 在 renderer/main.ts 的 createApp 之前调用，确保 window.mainApi / window.env 已注入。
 */
export async function initMobile() {
  installMobileShim()
  await pref.ensureInit()
  try {
    await initNeteaseClient()
  } catch (e) {
    console.error('[mobile] netease client init failed:', e)
  }
  try {
    await StatusBar.setStyle({ style: Style.Dark })
    await StatusBar.setBackgroundColor({ color: '#1f1f1f' })
  } catch (e) {
    console.warn('[mobile] status bar config failed:', e)
  }
  try {
    await Keyboard.setResizeMode({ mode: 'body' })
    await Keyboard.setStyle({ style: 'DARK' })
  } catch (e) {
    console.warn('[mobile] keyboard config failed:', e)
  }
  App.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack) {
      window.history.back()
    } else {
      App.exitApp()
    }
  })
  console.log('[mobile] VutronMusic Android MVP initialized')
}

export { installMobileShim, initNeteaseClient }
