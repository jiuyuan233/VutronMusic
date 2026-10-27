import CryptoJS from 'crypto-js'
import { CapacitorHttp, HttpOptions } from '@capacitor/core'
import * as pref from './preferences'

/**
 * 网易云音乐 API 纯前端实现（移动端）
 * 用 CapacitorHttp 在原生层发请求到 music.163.com，绕过 WebView 的 CORS。
 * 加密：eapi（AES-128-ECB，key 固定），比 weapi 简单（不需要 RSA）。
 */

const BASE_URL = 'https://music.163.com'
const EAPI_KEY = CryptoJS.enc.Utf8.parse('7246674226682325')

function eapiEncrypt(text: string): string {
  const encrypted = CryptoJS.AES.encrypt(CryptoJS.enc.Utf8.parse(text), EAPI_KEY, {
    mode: CryptoJS.mode.ECB,
    padding: CryptoJS.pad.Pkcs7
  })
  return encrypted.ciphertext.toString(CryptoJS.enc.Hex).toUpperCase()
}

function generateDeviceId(): string {
  return CryptoJS.MD5(`${Date.now()}${Math.random()}`).toString().slice(0, 32)
}

let cookie = ''

export async function initNeteaseClient() {
  let deviceId = (await pref.get<string>('neteaseDeviceId')) || generateDeviceId()
  await pref.set('neteaseDeviceId', deviceId)
  cookie = (await pref.get<string>('neteaseCookie')) || ''
}

export function getCookie(): string {
  return cookie
}

async function updateCookie(setCookieHeader: string | undefined) {
  if (!setCookieHeader) return
  const pairs = setCookieHeader.split(',').map((s) => s.split(';')[0].trim())
  const map = new Map<string, string>()
  cookie.split('; ').forEach((p) => {
    const [k, v] = p.split('=')
    if (k) map.set(k, v)
  })
  pairs.forEach((p) => {
    const [k, v] = p.split('=')
    if (k) map.set(k, v)
  })
  cookie = Array.from(map.entries()).map(([k, v]) => `${k}=${v}`).join('; ')
  await pref.set('neteaseCookie', cookie)
}

async function eapiRequest(path: string, data: Record<string, any> = {}): Promise<any> {
  const url = `${BASE_URL}/eapi/${path}`
  const payload = JSON.stringify({ ...data, header: {} })
  const params = eapiEncrypt(payload)
  const options: HttpOptions = {
    url,
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Mobile Safari/537.36',
      Cookie: cookie || undefined,
      Referer: 'https://music.163.com'
    },
    data: { params }
  }
  const resp = await CapacitorHttp.post(options)
  await updateCookie(resp.headers?.['Set-Cookie'] || resp.headers?.['set-cookie'])
  if (resp.status >= 400) throw new Error(`Netease API ${path} failed: ${resp.status}`)
  try {
    return typeof resp.data === 'string' ? JSON.parse(resp.data) : resp.data
  } catch {
    return resp.data
  }
}

export async function qrcodeUnikey(): Promise<{ unikey: string }> {
  const res = await eapiRequest('music/login/qrcode/unikey', { type: 1 })
  return { unikey: res.unikey || res.uuid }
}

export async function qrcodeLogin(unikey: string): Promise<{ code: number; cookie?: string }> {
  const res = await eapiRequest('music/login/qrcode/client/login', { key: unikey, type: 1 })
  return { code: res.code, cookie: res.cookie }
}

export async function loginStatus(): Promise<{ profile: any; account: any }> {
  const res = await eapiRequest('music/login/status', { cookie })
  return { profile: res.data?.profile, account: res.data?.account }
}

export async function userPlaylist(uid: number, limit = 30, offset = 0): Promise<any[]> {
  const res = await eapiRequest('music/user/playlist', { uid, limit, offset })
  return res.playlist || []
}

export async function recommendSongs(): Promise<any[]> {
  const res = await eapiRequest('music/recommend/songs')
  return res.data?.dailySongs || []
}

export async function playlistDetail(id: number, n = 1000): Promise<any> {
  const res = await eapiRequest('music/v6/playlist/detail', { id, n })
  return res.playlist
}

export async function songDetail(ids: number[]): Promise<any[]> {
  const c = ids.map((id) => `{"id":${id}}`).join(',')
  const res = await eapiRequest('music/v3/song/detail', { c })
  return res.songs || []
}

export async function songUrlV1(
  ids: number[],
  level = 'exhigh'
): Promise<{ id: number; url: string; br: number; size: number; type: string }[]> {
  const res = await eapiRequest('music/song/enhance/player/url/v1', {
    ids: ids.join(','),
    level,
    encodeType: 'flac'
  })
  return res.data || []
}

export async function lyric(id: number): Promise<{
  lrc?: string
  tlyric?: string
  romalrc?: string
  yrc?: string
  ytlrc?: string
}> {
  const res = await eapiRequest('music/lyric', { id })
  return {
    lrc: res.lrc?.lyric,
    tlyric: res.tlyric?.lyric,
    romalrc: res.romalrc?.lyric,
    yrc: res.yrc?.lyric,
    ytlrc: res.ytlrc?.lyric
  }
}

export async function search(keywords: string, type = 1, limit = 30, offset = 0): Promise<any> {
  const res = await eapiRequest('music/cloudsearch/pc', { s: keywords, type, limit, offset })
  return res
}

export async function like(id: number, like = true): Promise<boolean> {
  const res = await eapiRequest('music/song/like', { trackId: id, like })
  return res.code === 200
}

export async function likeList(uid: number): Promise<number[]> {
  const res = await eapiRequest('music/user/likes', { uid })
  return res.ids || []
}

export default {
  initNeteaseClient,
  getCookie,
  qrcodeUnikey,
  qrcodeLogin,
  loginStatus,
  userPlaylist,
  recommendSongs,
  playlistDetail,
  songDetail,
  songUrlV1,
  lyric,
  search,
  like,
  likeList
}
