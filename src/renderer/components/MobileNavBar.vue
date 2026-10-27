<template>
  <nav class="mobile-navbar">
    <div class="nav-left">
      <h1 class="page-title">{{ currentTitle }}</h1>
    </div>
    <div class="nav-right">
      <button class="icon-btn" @click="goSearch">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2"/>
          <path d="M21 21L16.5 16.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
      </button>
    </div>
  </nav>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()

const goSearch = () => {
  router.push('/search')
}

const titleMap: Record<string, string> = {
  HomePage: 'nav.home',
  explore: 'nav.explore',
  library: 'nav.library',
  stream: 'nav.stream',
  settings: 'nav.settings',
  search: 'search.search',
  localMusic: 'nav.localMusic'
}

const currentTitle = computed(() => {
  const key = titleMap[route.name as string]
  if (key) return t(key)
  return t('nav.home')
})
</script>

<style scoped lang="scss">
.mobile-navbar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 56px;
  padding: 0 16px;
  padding-top: env(safe-area-inset-top, 0px);
  background-color: var(--color-primary-bg);
  border-bottom: 1px solid rgba(128, 128, 128, 0.08);

  .nav-left {
    flex: 1;
    overflow: hidden;

    .page-title {
      font-size: 20px;
      font-weight: 700;
      color: var(--color-text);
      margin: 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  }

  .nav-right {
    display: flex;
    align-items: center;
    gap: 4px;

    .icon-btn {
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
  }
}
</style>
