<template>
  <nav class="bottom-nav">
    <button
      v-if="enableLibrary"
      :class="{ active: isCurrentRoute('/') }"
      class="nav-item"
      @click="handleRoute('/')"
    >
      <svg-icon class="icon" icon-class="logo" />
      <span class="label">{{ $t('nav.home') }}</span>
    </button>
    <button
      v-if="enableLibrary"
      :class="{ active: isCurrentRoute('/explore') }"
      class="nav-item"
      @click="handleRoute('/explore')"
    >
      <svg-icon class="icon" icon-class="explore" style="transform: scale(1.4)" />
      <span class="label">{{ $t('nav.explore') }}</span>
    </button>
    <button
      v-if="enableLibrary"
      :class="{ active: isCurrentRoute('/library') }"
      class="nav-item"
      @click="handleRoute('/library')"
    >
      <svg-icon class="icon" icon-class="library" />
      <span class="label">{{ $t('nav.library') }}</span>
    </button>
    <button
      v-if="enableStream"
      :class="{ active: isCurrentRoute('/stream') }"
      class="nav-item"
      @click="handleRoute('/stream')"
    >
      <svg-icon class="icon" icon-class="stream-icon" style="transform: scale(0.9)" />
      <span class="label">{{ $t('nav.stream') }}</span>
    </button>
    <button
      :class="{ active: isCurrentRoute('/settings') }"
      class="nav-item"
      @click="handleRoute('/settings')"
    >
      <svg-icon class="icon" icon-class="settings" style="transform: scale(0.9)" />
      <span class="label">{{ $t('nav.settings') }}</span>
    </button>
  </nav>
</template>

<script setup lang="ts">
import SvgIcon from './SvgIcon.vue'
import { useRoute, useRouter } from 'vue-router'
import { usePluginMusic } from '../store/pluginMusic'
import { storeToRefs } from 'pinia'

const pluginStore = usePluginMusic()
const { enableLibrary, enableStream } = storeToRefs(pluginStore)

const router = useRouter()
const route: any = useRoute()

const handleRoute = (path: string): void => {
  router.push(path)
}

const isCurrentRoute = (path: string): boolean => {
  return path === route.path
}
</script>

<style scoped lang="scss">
.bottom-nav {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: 60px;
  display: flex;
  justify-content: space-around;
  align-items: center;
  background-color: var(--color-secondary-bg);
  border-top: 1px solid rgba(128, 128, 128, 0.1);
  z-index: 100;
  user-select: none;
  padding-bottom: env(safe-area-inset-bottom, 0px);
  box-shadow: 0 -2px 12px rgba(0, 0, 0, 0.06);

  .nav-item {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 3px;
    height: 100%;
    border: none;
    background: transparent;
    color: var(--color-text);
    opacity: 0.55;
    transition: opacity 0.2s ease, transform 0.15s ease;
    padding: 0;
    -webkit-tap-highlight-color: transparent;

    .icon {
      width: 26px;
      height: 26px;
    }

    .label {
      font-size: 11px;
      font-weight: 500;
      white-space: nowrap;
    }

    &:active {
      opacity: 0.8;
      transform: scale(0.9);
    }

    &.active {
      opacity: 1;
      color: var(--color-primary);
      .icon {
        color: var(--color-primary);
      }
    }
  }
}
</style>
