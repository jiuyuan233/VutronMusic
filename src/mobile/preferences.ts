import { Preferences } from '@capacitor/preferences'

/**
 * 移动端持久化层 —— 替代桌面版的 electron-store。
 *
 * electron-store 是同步 API，@capacitor/preferences 是异步的。
 * 桌面版 main/store.ts 在主进程里 new Store()，渲染进程通过 IPC 读写。
 * 移动端没有主进程，渲染进程直接调用本模块。
 *
 * 为兼容现有代码中以同步方式读取配置的少数路径，提供 getSync 兜底
 * （从内存缓存返回，首次仍需异步 init）。
 */

const memoryCache = new Map<string, unknown>()
let initialized = false

/** 启动时预加载常用配置键到内存缓存，供同步读取 */
const PREFETCH_KEYS = [
  'settings',
  'cookie',
  'neteaseCookie',
  'lyricOffset',
  'playerState',
  'pluginState'
]

async function ensureInit() {
  if (initialized) return
  initialized = true
  await Promise.all(
    PREFETCH_KEYS.map(async (key) => {
      try {
        const { value } = await Preferences.get({ key })
        if (value != null) memoryCache.set(key, JSON.parse(value))
      } catch {
        /* ignore */
      }
    })
  )
}

export async function get<T = unknown>(key: string, defaultValue?: T): Promise<T | undefined> {
  await ensureInit()
  try {
    const { value } = await Preferences.get({ key })
    if (value == null) return defaultValue
    const parsed = JSON.parse(value) as T
    memoryCache.set(key, parsed)
    return parsed
  } catch {
    return defaultValue
  }
}

export async function set(key: string, value: unknown): Promise<void> {
  await ensureInit()
  memoryCache.set(key, value)
  await Preferences.set({ key, value: JSON.stringify(value) })
}

export async function remove(key: string): Promise<void> {
  await ensureInit()
  memoryCache.delete(key)
  await Preferences.remove({ key })
}

export async function keys(): Promise<string[]> {
  const { keys } = await Preferences.keys()
  return keys
}

export async function clear(): Promise<void> {
  memoryCache.clear()
  await Preferences.clear()
}

/** 同步读取（仅限已预加载到内存缓存的键） */
export function getSync<T = unknown>(key: string, defaultValue?: T): T | undefined {
  if (memoryCache.has(key)) return memoryCache.get(key) as T
  return defaultValue
}

/** 立即刷新内存缓存中的某个键 */
export async function refresh(key: string): Promise<void> {
  try {
    const { value } = await Preferences.get({ key })
    if (value != null) memoryCache.set(key, JSON.parse(value))
    else memoryCache.delete(key)
  } catch {
    /* ignore */
  }
}

export default { get, set, remove, keys, clear, getSync, refresh, ensureInit }
