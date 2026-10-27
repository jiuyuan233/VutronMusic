# VutronMusic Android 版构建说明

本文档说明如何把 VutronMusic 构建为 Android APK。Android 版基于 **Capacitor 6**，复用桌面版的 Vue3 前端代码，通过桥接层把 Electron IPC 映射到 Capacitor 插件。

> **MVP 范围**：网易云音乐在线播放 + 逐字歌词 + 基础歌单（个人歌单 / 每日推荐 / 搜索 / 喜欢）。本地音乐、流媒体、桌面歌词、音效变调、云盘、评论等桌面特性暂未移植。

## 一、前置要求

| 工具 | 版本 | 说明 |
| --- | --- | --- |
| Node.js | ≥ 22.6.0 | 推荐 22.12+ 以满足 `@electron/rebuild` 的 engine 要求；若用 22.11 需加 `--ignore-engines` |
| Yarn | 1.22.x | `corepack enable && corepack prepare yarn@1.22.22 --activate` |
| JDK | 17 | Android Gradle Plugin 8.x 要求 JDK 17 |
| Android SDK | API 34 (Android 14) | platform-tools + build-tools;34.0.0 + platforms;android-34 |
| 架构 | **x86_64** | ⚠️ Android build-tools 的 aapt2 等原生工具只有 x86_64 版本，**ARM64 主机无法直接构建** |

### 安装 Android SDK（命令行）

```bash
# 下载 cmdline-tools（约 148MB）
curl -L -o /tmp/cmdline-tools.zip \
  https://dl.google.com/android/repository/commandlinetools-linux-10406996_latest.zip
mkdir -p $ANDROID_HOME/cmdline-tools/latest
unzip -q /tmp/cmdline-tools.zip -d $ANDROID_HOME/cmdline-tools/latest
mv $ANDROID_HOME/cmdline-tools/latest/cmdline-tools/* $ANDROID_HOME/cmdline-tools/latest/
rmdir $ANDROID_HOME/cmdline-tools/latest/cmdline-tools

# 接受 license 并安装组件
export ANDROID_HOME=/path/to/android-sdk
export PATH=$ANDROID_HOME/cmdline-tools/latest/bin:$PATH
yes | sdkmanager --licenses
sdkmanager "platform-tools" "platforms;android-34" "build-tools;34.0.0"
```

或直接安装 **Android Studio**（自带 SDK），在 SDK Manager 里勾选 Android SDK Platform 34。

## 二、快速开始

```bash
# 1. 安装依赖（跳过 electron/better-sqlite3 的 native rebuild）
yarn install --ignore-scripts --ignore-engines

# 2. 构建移动端 web 资源（输出到 dist-mobile/）
yarn mobile:build

# 3. 同步到 Android 工程
npx cap sync android

# 4. 构建 debug APK
cd android && ./gradlew assembleDebug

# 产物位置
# android/app/build/outputs/apk/debug/app-debug.apk
```

## 三、安装到设备

```bash
# 用 adb 安装到连接的设备/模拟器
adb install android/app/build/outputs/apk/debug/app-debug.apk

# 或打开 Android Studio 调试
npx cap open android
```

## 四、开发调试

```bash
# 在浏览器里开发移动端（热更新，不需 Android SDK）
yarn mobile:dev
# 打开 http://localhost:5173 ，用 Chrome DevTools 模拟移动设备

# 在真机/模拟器上 live-reload 调试
yarn mobile:build && npx cap sync android
npx cap run android --live-reload
```

## 五、项目结构

```
VutronMusic/
├── src/
│   ├── renderer/              # Vue3 前端（桌面/移动复用）
│   │   ├── main.ts            # 桌面端入口
│   │   ├── main.mobile.ts     # 移动端入口（先装 shim 再加载 main）
│   │   ├── index.html         # 桌面端 HTML
│   │   └── index.mobile.html  # 移动端 HTML（viewport 适配）
│   ├── mobile/                # 移动端桥接层（新增）
│   │   ├── shim.ts            # window.mainApi/env → Capacitor 插件
│   │   ├── shim-install.ts    # 同步安装 shim（先于 store）
│   │   ├── neteaseClient.ts   # 网易云 API 纯前端实现（eapi 加密）
│   │   ├── preferences.ts     # electron-store → @capacitor/preferences
│   │   └── index.ts           # 移动端初始化（状态栏/键盘/返回键）
│   ├── main/                  # Electron 主进程（桌面版，移动版不用）
│   └── preload/               # Electron IPC 桥（桌面版，移动版不用）
├── android/                   # Capacitor Android 工程（cap add 生成）
├── capacitor.config.ts        # Capacitor 配置
├── vite.config.mobile.ts      # 移动端 Vite 配置（不构建 electron）
└── dist-mobile/               # 移动端 web 构建产物（cap sync 源）
```

## 六、模块映射

| 桌面版 (Electron) | 移动版 (Capacitor) | 说明 |
| --- | --- | --- |
| `src/preload/index.ts` (contextBridge) | `src/mobile/shim.ts` | IPC 通道 → Capacitor 插件/neteaseClient |
| `window.mainApi.invoke(channel)` | 同名，路由到 shim handlers | 渲染进程代码不改 |
| `window.env.isElectron` | `window.env.isAndroid` | 平台判断 |
| Fastify + `@neteasecloudmusicapienhanced/api` | `src/mobile/neteaseClient.ts` | eapi 加密 + CapacitorHttp 直连 music.163.com |
| `better-sqlite3` (主进程) | Dexie (IndexedDB) / `@capacitor-community/sqlite` | MVP 用 Dexie 简化 |
| `electron-store` | `@capacitor/preferences` | `src/mobile/preferences.ts` |
| tray/mpris/touchBar/dbus/dock | no-op | 桌面集成不适用移动端 |
| `electron-updater` | no-op | 用 Play Store 更新 |

## 七、已知限制（MVP）

- ✅ 网易云二维码登录、手机号登录
- ✅ 个人歌单、每日推荐、搜索、喜欢列表
- ✅ 在线播放（标准/极高/无损品质）、暂停、上下首、进度、循环模式
- ✅ 逐字歌词（yrc）+ 翻译歌词 + 罗马音
- ✅ 歌词偏移调整（持久化）
- ✅ 深色/浅色主题
- ❌ 本地音乐（需 Capacitor 文件系统 + SAF，后续迭代）
- ❌ 流媒体 navidrome/jellyfin/emby（需移植对应插件）
- ❌ 桌面歌词/OSD/状态栏歌词（移动端用通知栏媒体控件替代，待实现）
- ❌ 音效变调变速（SoundTouchJS 在 WebView 可跑，待接入 UI）
- ❌ 云盘、评论、MV、歌手页（后续迭代）
- ❌ 插件系统（Worker 沙箱在 WebView 不可用，需重新设计）
- ❌ 自动更新（用 Play Store 分发）

## 八、故障排查

### `yarn install` 报 node engine 不兼容
```
error @electron/rebuild: Expected version ">=22.12.0". Got "22.11.0"
```
**解决**：加 `--ignore-engines`，或升级 Node 到 22.12+。

### `cap sync` 报 web assets directory must contain index.html
**原因**：`dist-mobile/` 为空或没有 index.html。
**解决**：先 `yarn mobile:build`，确认 `dist-mobile/index.html` 存在。

### `gradlew assembleDebug` 报 aapt2 Exec format error
**原因**：在 ARM64 主机上运行 x86_64 的 aapt2。
**解决**：在 x86_64 主机（Windows/macOS/Ubuntu x86_64）上构建，或用 GitHub Actions CI（见 `.github/workflows/android.yml`）。

### 网易云登录失败 / 歌曲 URL 为空
**原因**：eapi 加密参数或 cookie 处理需调试。
**解决**：开 WebView 远程调试（`chrome://inspect`），查看 `neteaseClient` 的请求/响应。`capacitor.config.ts` 已开 `webContentsDebuggingEnabled: true`。

### WebView 白屏
**解决**：`adb logcat | grep Capacitor` 查看原生日志；确认 `dist-mobile/index.html` 的 script 路径是相对的（`./assets/...`）。

## 九、构建 Release APK（签名）

```bash
# 生成 keystore
keytool -genkey -v -keystore vutron.keystore -alias vutron \
  -keyalg RSA -keysize 2048 -validity 10000

# 在 android/app/build.gradle 的 android.signingConfigs.release 里配置
# 或用环境变量：
export ORG_GRADLE_PROJECT_RELEASE_STORE_FILE=$(pwd)/vutron.keystore
export ORG_GRADLE_PROJECT_RELEASE_STORE_PASSWORD=***
export ORG_GRADLE_PROJECT_RELEASE_KEY_ALIAS=vutron
export ORG_GRADLE_PROJECT_RELEASE_KEY_PASSWORD=***

cd android && ./gradlew assembleRelease
# 产物：android/app/build/outputs/apk/release/app-release.apk
```

## 十、贡献回上游

1. Fork `stark81/VutronMusic` 到你的 GitHub
2. 新建分支 `git checkout -b feat/android-capacitor`
3. 提交本分支所有改动
4. Push 到你的 fork
5. 在 GitHub 上发起 Pull Request 到 `stark81/VutronMusic` 的 `main` 分支
6. PR 描述里引用本文档说明 Android 版的架构与边界
