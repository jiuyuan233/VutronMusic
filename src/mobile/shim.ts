import { App } from '@capacitor/app'
import * as pref from './preferences'
import * as netease from './neteaseClient'

/**
 * 移动端 IPC 桥接层 —— 替代桌面版 src/preload/index.ts 的 contextBridge。
 *
 * 桌面版渲染进程通过 window.mainApi.invoke('channel', ...args) 调用主进程 IPC。
 * 移动端没有主进程，这里把每个 IPC 通道路由到 Capacitor 插件或 neteaseClient。
 *
 * 未实现的通道返回 undefined 并打印警告，不崩溃（渐进式迁移）。
 */

const APP_VERSION = '3.3.5-android-mvp'

/** IPC 通道 → 处理函数 */
const handlers: Record<string, (data: any) => Promise<any> | any> = {
  // ── 版本 ──
  msgRequestGetVersion: () => APP_VERSION,

  // ── 外部链接 ──
  msgOpenExternalLink: (url: string) => {
    if (typeof url === 'string' && /^https?:\/\//.test(url)) {
      window.open(url, '_blank')
    }
  },

  // ── 设置存储（替代 electron-store）──
  setStoreSettings: async (data: { key: string; value: any }) => {
    await pref.set(`settings.${data.key}`, data.value)
  },

  // ── 歌词偏移 ──
  'set-lyric-offset': async (data: { pluginId: string; trackId: string; offset: number }) => {
    const key = `lyricOffset.${data.pluginId}.${data.trackId}`
    await pref.set(key, data.offset)
  },
  'get-lyric-offset': async (data: { pluginId: string; trackId: string }) => {
    const key = `lyricOffset.${data.pluginId}.${data.trackId}`
    return (await pref.get<number>(key)) ?? 0
  },

  // ── 网易云插件调用（核心）──
  'get-song-url': async (data: { trackId: number | string; level?: string }) => {
    const urls = await netease.songUrlV1([Number(data.trackId)], data.level || 'exhigh')
    return urls[0]
  },

  'plugin-lyric': async (data: { trackId: number | string }) => {
    return await netease.lyric(Number(data.trackId))
  },

  'plugin-method-call': async (data: { pluginId: string; method: string; args: any[] }) => {
    if (data.pluginId !== 'netease') {
      console.warn(`[shim] plugin ${data.pluginId} not supported in MVP`)
      return undefined
    }
    const { method, args = [] } = data
    const fnMap: Record<string, (...a: any[]) => Promise<any>> = {
      'user/playlist': (uid, limit, offset) => netease.userPlaylist(uid, limit, offset),
      'recommend/songs': () => netease.recommendSongs(),
      'playlist/detail': (id, n) => netease.playlistDetail(id, n),
      'song/detail': (ids) => netease.songDetail(ids),
      'song/url/v1': (ids, level) => netease.songUrlV1(ids, level),
      lyric: (id) => netease.lyric(id),
      search: (kw, type, limit, offset) => netease.search(kw, type, limit, offset),
      like: (id, l) => netease.like(id, l),
      'like/list': (uid) => netease.likeList(uid),
      'login/status': () => netease.loginStatus(),
      'login/qrcode/unikey': () => netease.qrcodeUnikey(),
      'login/qrcode/client/login': (key) => netease.qrcodeLogin(key)
    }
    const fn = fnMap[method]
    if (!fn) {
      console.warn(`[shim] netease method ${method} not implemented`)
      return undefined
    }
    return await fn(...args)
  },

  // ── 插件列表 ──
  'get-plugins': () => [
    { id: 'netease', name: '网易云音乐', version: '1.0.0', type: 'library', active: true, enabled: true }
  ],
  'get-source-priority': () => ['netease'],
  'set-source-priority': (data: string[]) => pref.set('sourcePriority', data),

  // ── 窗口控制 ──
  minimize: () => {},
  maximizeOrUnmaximize: () => {},
  close: () => App.exitApp(),
  'update-powersave': () => {},

  // ── 桌面集成（no-op）──
  initTrayState: () => {},
  updateTrayVisibility: () => {},
  playDiscordPresence: () => {},
  pauseDiscordPresence: () => {},
  'lastfm-auth': () => {},
  'get-lastfm-session': () => undefined,
  'disconnect-lastfm': () => {},
  'report-playback': () => {},
  updateOsdState: () => {},
  'update-osd-lyric': () => {},
  'synchronize-player-info': () => {},

  // ── 更新（no-op）──
  'check-update': () => {},
  downloadUpdate: () => {},
  openLogFile: () => {},

  // ── 本地音乐/文件（MVP 不支持）──
  msgOpenFile: () => undefined,
  showOpenDialog: () => undefined,
  msgScanLocalMusic: () => {},
  getFilesInFolder: () => [],
  selecteFolder: () => undefined,
  msgShowInFolder: () => {},
  msgCheckFileExist: () => false,
  deleteLocalMusicDB: () => {},
  clearCacheTracks: () => {},
  getCacheTracksInfo: () => [],
  clearDeletedMusic: () => {},
  accurateMatch: () => undefined,
  'get-cache-path': () => '',
  'check-local-resource': () => false,
  metadata: () => undefined,
  'get-font-list': () => [],

  // ── 插件管理 ──
  'upload-plugin': () => {},
  setPluginEnable: () => {},
  'create-plugin-instance': () => {},
  'delete-plugin-instance': () => {},
  'plugin-comment': () => undefined,
  'plugin-intelligence': () => undefined,
  'getStreamMatchCount': () => 0,
  trackMatch: () => undefined,
  clearStreamMatches: () => {},

  // ── 截图/扩展 ──
  'get-screenshot': () => undefined,
  'delete-screenshot': () => {},
  askExtensionStatus: () => false
}

/** 安装移动端 shim：注入 window.mainApi 和 window.env（幂等） */
let _installed = false
export function installMobileShim() {
  if (_installed) return
  _installed = true
  const mainApi = {
    send: (channel: string, ...data: any[]): void => {
      const handler = handlers[channel]
      if (handler) {
        Promise.resolve(handler(data[0])).catch((e) => console.error(`[shim] ${channel} error:`, e))
      } else {
        console.warn(`[shim] unhandled send channel: ${channel}`)
      }
    },
    invoke: async (channel: string, ...data: any[]): Promise<any> => {
      const handler = handlers[channel]
      if (handler) return await handler(data[0])
      console.warn(`[shim] unhandled invoke channel: ${channel}`)
      return undefined
    },
    on: (_channel: string, _listener: (...args: any[]) => void): void => {},
    once: (_channel: string, _listener: (...args: any[]) => void): void => {},
    off: (_channel: string, _listener: (...args: any[]) => void): void => {}
  }

  const env = {
    isElectron: false,
    isCapacitor: true,
    isAndroid: true,
    isEnableTitlebar: false,
    isLinux: false,
    isMac: false,
    isWindows: false,
    isDev: import.meta.env.DEV ?? false
  }

  Object.defineProperty(window, 'mainApi', { value: mainApi, writable: false, configurable: false })
  Object.defineProperty(window, 'env', { value: env, writable: false, configurable: false })
}
