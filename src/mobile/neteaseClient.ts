import CryptoJS from 'crypto-js'
import { CapacitorHttp, HttpOptions } from '@capacitor/core'
import * as pref from './preferences'

/**
 * 网易云音乐 API 纯前端实现（移动端）
 * 用 CapacitorHttp 在原生层发请求到 music.163.com，绕过 WebView 的 CORS。
 *
 * 加密方式：
 * - eapi（AES-128-ECB，key 固定）：用于歌曲/歌单/歌词等数据接口
 * - weapi（AES-CBC 两轮 + RSA）：用于登录相关接口（二维码 key/create/check）
 *   网易云登录接口只接受 weapi，eapi 会被服务器拒绝。
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

// ── weapi 加密 ──
// 算法：AES-CBC 两轮加密 + RSA 加密随机密钥
// 参考：NeteaseCloudMusicApi 项目 weapi 实现

const WEAPI_PRESET_KEY = CryptoJS.enc.Utf8.parse('0CoJUm6Qyw8W8jud')
const WEAPI_IV = CryptoJS.enc.Utf8.parse('0102030405060708')

// 网易云 RSA 公钥模数（固定值，分段拼接避免重复模式）
const WEAPI_RSA_PUBKEY = BigInt(
  '0x' +
    [
      'e0b509f6259df864',
      '2dbc35662901477d',
      'f22677ec152b5ff6',
      '8ace615bb7b72515',
      '2b3ab17a876aea8a',
      '5aa76d2e417629ec',
      '4ee341f56135fccf',
      '695280104e0312ec',
      'bda92557c9387011',
      '4af6c9d05c4f7f0c',
      '3685b7a46bee2559',
      '32575cce10b424d8',
      '13cfe4875d3e8204',
      '7b97ddef52741d54',
      '6b8e289dc6935b3e',
      'ce0462db0a22b8e7'
    ].join('')
)
const WEAPI_RSA_PUBEXP = BigInt('0x010001')

/** 生成随机 16 字符密钥（base62，与 NeteaseCloudMusicApi 一致） */
function generateSecretKey(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let key = ''
  for (let i = 0; i < 16; i++) {
    key += chars[Math.floor(Math.random() * chars.length)]
  }
  return key
}

/** AES-CBC 加密，返回 base64 */
function aesCBCBase64(text: string, key: CryptoJS.lib.WordArray): string {
  const encrypted = CryptoJS.AES.encrypt(CryptoJS.enc.Utf8.parse(text), key, {
    iv: WEAPI_IV,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7
  })
  return encrypted.toString() // base64
}

/** RSA 加密（无填充，直接模幂），返回 hex 左填充到 256 字符 */
function rsaEncrypt(text: string): string {
  // 将文本转为 hex 后转 BigInt（网易云的做法：逐字符转 hex 拼接）
  const textHex = Array.from(text)
    .map((c) => c.charCodeAt(0).toString(16).padStart(2, '0'))
    .join('')
  let base = BigInt('0x' + textHex)
  // base^e mod n
  let result = 1n
  let exp = WEAPI_RSA_PUBEXP
  const mod = WEAPI_RSA_PUBKEY
  while (exp > 0n) {
    if (exp & 1n) result = (result * base) % mod
    base = (base * base) % mod
    exp >>= 1n
  }
  return result.toString(16).padStart(256, '0')
}

/** weapi 加密：返回 { params, encSecKey } */
function weapiEncrypt(data: Record<string, any>): { params: string; encSecKey: string } {
  const text = JSON.stringify(data)
  const secKey = generateSecretKey()
  const secKeyWordArray = CryptoJS.enc.Utf8.parse(secKey)
  // 两轮 AES-CBC：先用 presetKey 加密，再用 secKey 加密
  const firstPass = aesCBCBase64(text, WEAPI_PRESET_KEY)
  const secondPass = aesCBCBase64(firstPass, secKeyWordArray)
  const encSecKey = rsaEncrypt(secKey.split('').reverse().join(''))
  return { params: secondPass, encSecKey }
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

/** weapi 请求：POST /weapi/path，body 为 params=xxx&encSecKey=xxx */
async function weapiRequest(path: string, data: Record<string, any> = {}): Promise<any> {
  const url = `${BASE_URL}/weapi/${path}`
  const { params, encSecKey } = weapiEncrypt({ ...data, header: {} })
  const options: HttpOptions = {
    url,
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Mobile Safari/537.36',
      Cookie: cookie || undefined,
      Referer: 'https://music.163.com'
    },
    data: { params, encSecKey }
  }
  const resp = await CapacitorHttp.post(options)
  await updateCookie(resp.headers?.['Set-Cookie'] || resp.headers?.['set-cookie'])
  if (resp.status >= 400) throw new Error(`Netease weapi ${path} failed: ${resp.status}`)
  try {
    return typeof resp.data === 'string' ? JSON.parse(resp.data) : resp.data
  } catch {
    return resp.data
  }
}

export async function qrcodeUnikey(): Promise<{ unikey: string }> {
  const res = await weapiRequest('login/qr/key', { timestamp: Date.now() })
  return { unikey: res.unikey || res.data?.unikey || res.uuid }
}

export async function qrcodeLogin(unikey: string): Promise<{ code: number; cookie?: string }> {
  const res = await weapiRequest('login/qr/check', { key: unikey, timestamp: Date.now() })
  return { code: res.code, cookie: res.cookie }
}

export async function loginStatus(): Promise<{ profile: any; account: any }> {
  const res = await eapiRequest('login/status', { timestamp: Date.now() })
  return { profile: res.data?.profile, account: res.data?.account }
}

// ── 插件方法（返回值格式与 netease.js 插件一致）──

/** 获取二维码 key 和 URL，对应插件 loginQrKey（使用 weapi） */
export async function loginQrKey(): Promise<{ code: number; data: { url: string; qrcode: string } }> {
  try {
    const result = await weapiRequest('login/qr/key', { timestamp: Date.now(), type: 1 })
    const unikey = result.unikey || result.data?.unikey || result.uuid
    const result2 = await weapiRequest('login/qr/create', {
      key: unikey,
      qrimg: true,
      timestamp: Date.now()
    })
    return {
      code: result?.code ?? 200,
      data: {
        url: result2.qrurl || result2.data?.qrurl || result2.qrcodeUrl || '',
        qrcode: unikey
      }
    }
  } catch (e) {
    console.error('[netease] loginQrKey error:', e)
    return { code: 404, data: { url: '', qrcode: '' } }
  }
}

/** 检查二维码扫码状态，对应插件 loginQrCodeCheck（使用 weapi） */
export async function loginQrCodeCheck(
  key: string
): Promise<{ code: number; message?: string; user?: any }> {
  try {
    const result = await weapiRequest('login/qr/check', { key, timestamp: Date.now() })
    if (result.code === 803) {
      // 登录成功，cookie 已通过 updateCookie 自动保存
      // 获取用户信息
      try {
        const res = await eapiRequest('login/status', { timestamp: Date.now() })
        const profile = res.data?.profile
        if (profile) {
          await pref.set('neteaseUserId', profile.userId)
          result.user = {
            userId: profile.userId,
            avatarUrl: profile.avatarUrl || '',
            nickname: profile.nickname || '',
            isVip: [11, 110].includes(profile.vipType),
            signature: profile.signature || ''
          }
        }
      } catch {
        // 获取用户信息失败，不影响登录状态
      }
    }
    return result
  } catch (e) {
    console.error('[netease] loginQrCodeCheck error:', e)
    return { code: 800, message: '' }
  }
}

/** 获取账号信息，对应插件 getAccount */
export async function getAccount(): Promise<{
  code: number
  baseUrl: string
  userName: string
  pwd: string
}> {
  return { code: 200, baseUrl: BASE_URL, userName: '', pwd: '' }
}

/** Cookie 登录，对应插件 doLogin */
export async function doLogin(params: {
  cookie?: string
  userName?: string
  pwd?: string
}): Promise<{ code: number; data?: any; message?: string }> {
  if (params?.cookie) {
    cookie = params.cookie
    await pref.set('neteaseCookie', cookie)
    try {
      const res = await eapiRequest('login/status', { timestamp: Date.now() })
      if (res.data?.profile) {
        const profile = res.data.profile
        await pref.set('neteaseUserId', profile.userId)
        return {
          code: 200,
          data: {
            userId: profile.userId,
            avatarUrl: profile.avatarUrl,
            nickname: profile.nickname,
            isVip: [11, 110].includes(profile.vipType),
            signature: profile.signature
          }
        }
      }
    } catch {
      // 网络失败
    }
    cookie = ''
    await pref.remove('neteaseCookie')
    return { code: 404, message: 'Cookie 无效或已过期' }
  }
  return { code: 404, message: '本插件不支持该登录方式' }
}

/** 登出，对应插件 doLogout */
export async function doLogout(): Promise<{ code: number }> {
  try {
    cookie = ''
    await pref.remove('neteaseCookie')
    await pref.remove('neteaseUserId')
    return { code: 200 }
  } catch {
    return { code: 404 }
  }
}

/** 更新服务地址，对应插件 updateBaseUrl */
export async function updateBaseUrl(params: { url: string }): Promise<{ code: number }> {
  // 移动端固定使用官方地址，但返回成功以兼容流程
  return { code: 200 }
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
  loginQrKey,
  loginQrCodeCheck,
  getAccount,
  doLogin,
  doLogout,
  updateBaseUrl,
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
