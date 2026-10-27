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
  'get-song-url': async (data: { pluginId: string; sourceContext: any; track: any }) => {
    const trackId = Number(data.sourceContext?.id || data.sourceContext?.trackId || data.track?.id || 0)
    if (!trackId) return { url: [], replayGain: 0, peak: 1 }
    const level = data.track?.quality || 'exhigh'
    const urls = await netease.songUrlV1([trackId], level)
    const urlObj = urls[0]
    return {
      url: urlObj?.url ? [urlObj] : [],
      replayGain: 0,
      peak: 1
    }
  },

  'plugin-lyric': async (data: { pluginId: string; sourceContext: { rawCtx: any } }) => {
    const rawCtx = data.sourceContext?.rawCtx || {}
    const trackId = Number(rawCtx.id || rawCtx.trackId || 0)
    if (!trackId) return { code: 404, data: [] }
    const lyricData = await netease.lyric(trackId)
    return { code: 200, data: lyricData }
  },

  'plugin-method-call': async (data: { pluginId: string; methodName: string; params: any }) => {
    if (data.pluginId !== 'netease') {
      console.warn(`[shim] plugin ${data.pluginId} not supported in MVP`)
      return undefined
    }
    const { methodName, params = {} } = data
    // 方法名与 netease.js 插件 exports.* 一致
    const fnMap: Record<string, (p: any) => Promise<any>> = {
      // ── 登录 ──
      loginQrKey: () => netease.loginQrKey(),
      loginQrCodeCheck: (p) => netease.loginQrCodeCheck(p.key),
      getAccount: () => netease.getAccount(),
      doLogin: (p) => netease.doLogin(p),
      doLogout: () => netease.doLogout(),
      updateBaseUrl: (p) => netease.updateBaseUrl(p),

      // ── 歌单/歌曲 ──
      userPlaylist: (p) => netease.userPlaylist(p.uid, p.limit, p.offset),
      getRecommendTracks: () => netease.recommendSongs(),
      getPlaylistDetail: (p) => netease.playlistDetail(p.id, p.n),
      getPlaylistTracks: (p) => netease.playlistDetail(p.id, p.n),
      getTrackDetail: (p) => netease.songDetail(p.tracks?.map((t: any) => t.id) || []),
      getLyric: (p) => netease.lyric(Number(p.id || p)),
      search: (p) => netease.search(p.keywords || p.keyword, p.type, p.limit, p.offset),
      likeATrack: (p) => netease.like(Number(p.trackId), p.like),

      // ── 登录状态 ──
      systemPing: () => ({ code: 200, message: 'ok' }),

      // ── 以下方法返回空数据 stub（防止 UI 崩溃，后续逐步实现）──
      getBanner: () => ({ code: 200, data: [] }),
      getRecommendPlaylist: () => ({ code: 200, data: [] }),
      topArtists: () => ({ code: 200, data: [] }),
      topAlbums: () => ({ code: 200, data: [] }),
      rankTop: () => ({ code: 200, data: [] }),
      rankList: () => ({ code: 200, data: [] }),
      topSong: () => ({ code: 200, data: [] }),
      newAlbums: () => ({ code: 200, data: [] }),
      getCategoryPlaylist: () => ({ code: 200, data: [] }),
      artistsList: () => ({ code: 200, data: [] }),
      catlist: () => ({ code: 200, data: [] }),
      getArtistCatlist: () => ({ code: 200, data: [] }),
      getAlbumCatlist: () => ({ code: 200, data: [] }),
      getTrackCatlist: () => ({ code: 200, data: [] }),
      resizePicUrl: (p) => ({ code: 200, data: { url: p?.url || '' } }),
      subscribePlaylist: () => ({ code: 200 }),
      addOrRemoveTracksToPlaylist: () => ({ code: 200 }),
      reorderPlaylistTracks: () => ({ code: 200 }),
      createPlaylist: () => ({ code: 200, data: {} }),
      editPlaylist: () => ({ code: 200 }),
      getAllTracks: () => ({ code: 200, data: [] }),
      personalFM: () => ({ code: 200, data: {} }),
      fmTrash: () => ({ code: 200 }),
      artistDetail: () => ({ code: 200, data: {} }),
      artistAlbums: () => ({ code: 200, data: [] }),
      artistMVs: () => ({ code: 200, data: [] }),
      simiArtists: () => ({ code: 200, data: [] }),
      followArtist: () => ({ code: 200 }),
      albumDetail: () => ({ code: 200, data: {} }),
      subscribeAlbum: () => ({ code: 200 }),
      mvDetail: () => ({ code: 200, data: {} }),
      likeAMV: () => ({ code: 200 }),
      subAMV: () => ({ code: 200 }),
      userRecord: () => ({ code: 200, data: [] })
    }
    const fn = fnMap[methodName]
    if (!fn) {
      console.warn(`[shim] netease method '${methodName}' not implemented`)
      return undefined
    }
    return await fn(params)
  },

  // ── 插件列表 ──
  // 返回格式与桌面版一致：[code, { name, icon, type, builtIn }] 元组数组
  'get-plugins': () => [
    ['netease', { name: '网易云音乐', icon: 'netease', type: 'library', builtIn: true }]
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
