<template>
  <div class="mobile-login">
    <!-- 顶部返回栏 -->
    <header class="login-header">
      <button class="back-btn" @click="goBack">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <path d="M15 18L9 12L15 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
      <h1 class="title">登录网易云音乐</h1>
    </header>

    <!-- 二维码区域 -->
    <main class="login-body">
      <div class="qr-container">
        <div v-if="loading" class="qr-loading">
          <div class="spinner" />
          <p>正在生成二维码...</p>
        </div>
        <img v-else-if="qrCodeSvg" :src="qrCodeSvg" class="qr-image" alt="登录二维码" />
        <div v-else class="qr-error">
          <p>二维码生成失败</p>
          <button class="retry-btn" @click="getQrCodeKey">重试</button>
        </div>

        <!-- 二维码遮罩（已扫码/已过期） -->
        <div v-if="qrCodeSvg && status === 'scanned'" class="qr-overlay">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
            <path d="M9 12L11 14L15 10M21 12C21 16.97 16.97 21 12 21S3 16.97 3 12S7.03 3 12 3S21 7.03 21 12Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <p>已扫码，请在手机上确认</p>
        </div>
        <div v-if="qrCodeSvg && status === 'expired'" class="qr-overlay expired">
          <p>二维码已过期</p>
          <button class="retry-btn" @click="getQrCodeKey">点击刷新</button>
        </div>
      </div>

      <!-- 状态提示 -->
      <p class="status-text" :class="status">
        <span v-if="status === 'waiting'">请使用网易云音乐 App 扫码登录</span>
        <span v-else-if="status === 'scanned'">扫描成功，等待确认...</span>
        <span v-else-if="status === 'success'">登录成功！正在跳转...</span>
        <span v-else-if="status === 'expired'">二维码已过期，请刷新</span>
        <span v-else-if="status === 'error'">登录失败，请重试</span>
      </p>

      <!-- 提示信息 -->
      <div class="tips">
        <p>打开网易云音乐 App → 设置 → 扫码登录</p>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import qrCode from 'qrcode'
import { usePluginMusic } from '../store/pluginMusic'

const router = useRouter()
const pluginStore = usePluginMusic()

const loading = ref(true)
const qrCodeSvg = ref('')
const qrCodeKey = ref('')
const status = ref<'waiting' | 'scanned' | 'success' | 'expired' | 'error'>('waiting')

let checkInterval: ReturnType<typeof setInterval> | null = null

const goBack = () => {
  router.go(-1)
}

const getQrCodeKey = async () => {
  loading.value = true
  status.value = 'waiting'
  qrCodeSvg.value = ''
  qrCodeKey.value = ''

  try {
    const res = await pluginStore.pluginMethodCall('netease', 'loginQrKey')
    if (res.code === 200 && res.data.url) {
      qrCodeKey.value = res.data.qrcode
      const svg = await qrCode.toString(res.data.url, {
        width: 240,
        margin: 1,
        color: { dark: '#333333', light: '#ffffff' },
        type: 'svg'
      })
      qrCodeSvg.value = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
      startCheckInterval()
    } else {
      status.value = 'error'
    }
  } catch (e) {
    console.error('[MobileLogin] getQrCodeKey error:', e)
    status.value = 'error'
  } finally {
    loading.value = false
  }
}

const startCheckInterval = () => {
  if (checkInterval) clearInterval(checkInterval)
  checkInterval = setInterval(async () => {
    if (!qrCodeKey.value) return
    try {
      const res = await pluginStore.pluginMethodCall('netease', 'loginQrCodeCheck', {
        key: qrCodeKey.value
      })
      // 800: 未扫码, 801: 等待确认, 802: 已确认, 803: 登录成功
      if (res.code === 801) {
        status.value = 'scanned'
      } else if (res.code === 802) {
        status.value = 'scanned'
      } else if (res.code === 803) {
        status.value = 'success'
        if (checkInterval) clearInterval(checkInterval)
        // 更新登录状态
        pluginStore.handleStatusChange('netease', 'login')
        // 延迟跳转
        setTimeout(() => {
          router.push('/')
        }, 1000)
      } else if (res.code === 800) {
        // 未扫码，继续等待
      }
    } catch (e) {
      console.error('[MobileLogin] check error:', e)
    }
  }, 2000)
}

onMounted(() => {
  getQrCodeKey()
})

onBeforeUnmount(() => {
  if (checkInterval) clearInterval(checkInterval)
})
</script>

<style scoped lang="scss">
.mobile-login {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: flex;
  flex-direction: column;
  background-color: var(--color-primary-bg);
}

.login-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  padding-top: calc(12px + env(safe-area-inset-top, 0px));
  background-color: var(--color-secondary-bg);

  .back-btn {
    width: 40px;
    height: 40px;
    border: none;
    background: transparent;
    color: var(--color-text);
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    -webkit-tap-highlight-color: transparent;

    &:active {
      background: rgba(128, 128, 128, 0.15);
    }
  }

  .title {
    font-size: 18px;
    font-weight: 600;
    color: var(--color-text);
    margin: 0;
  }
}

.login-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 24px;
  padding: 24px;
}

.qr-container {
  position: relative;
  width: 280px;
  height: 280px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #fff;
  border-radius: 20px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
  overflow: hidden;

  .qr-image {
    width: 240px;
    height: 240px;
  }

  .qr-loading,
  .qr-error {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    color: #888;
    font-size: 14px;
  }

  .spinner {
    width: 32px;
    height: 32px;
    border: 3px solid #e0e0e0;
    border-top-color: var(--color-primary);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  .qr-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    background: rgba(255, 255, 255, 0.92);
    color: #333;
    font-size: 14px;

    &.expired {
      color: #e53935;
    }
  }
}

.retry-btn {
  padding: 8px 24px;
  border: 1px solid var(--color-primary);
  border-radius: 20px;
  background: transparent;
  color: var(--color-primary);
  font-size: 14px;
  -webkit-tap-highlight-color: transparent;

  &:active {
    background: rgba(51, 94, 234, 0.1);
  }
}

.status-text {
  font-size: 16px;
  font-weight: 500;
  color: var(--color-text);
  margin: 0;

  &.success {
    color: #4caf50;
  }
  &.error {
    color: #e53935;
  }
  &.expired {
    color: #ff9800;
  }
}

.tips {
  margin-top: 8px;
  p {
    font-size: 13px;
    color: var(--color-text);
    opacity: 0.6;
    margin: 0;
    text-align: center;
  }
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
