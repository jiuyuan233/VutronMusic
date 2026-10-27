/**
 * 同步安装移动端 IPC shim —— 必须在任何 Pinia store / window.mainApi 调用之前执行。
 */
import { installMobileShim } from './shim'

installMobileShim()
