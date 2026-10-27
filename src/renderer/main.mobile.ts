/**
 * 移动端（Capacitor / Android）渲染进程入口
 * 1. 同步安装 IPC shim  2. 加载原始 main.ts  3. mount 后异步初始化
 */
import '../mobile/shim-install'
import './main'

import('../mobile/index')
  .then(({ initMobile }) => initMobile())
  .catch((e) => console.error('[mobile] async init failed:', e))
