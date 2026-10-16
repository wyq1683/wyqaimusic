# Wave 音乐播放器 — Android 打包与触感反馈

> 构建日期：2026-09-10 · Capacitor 8.5.1 · Gradle 8.14.3 · AGP 8.13.0
> 产物：`android/app/build/outputs/apk/release/app-release.apk`（3.5 MB）

---

## 一、交付物清单

| 文件 | 说明 |
|---|---|
| `android/app/build/outputs/apk/release/app-release.apk` | **已签名 release 包**，可直接安装 |
| `android/app/build/outputs/apk/debug/app-debug.apk` | debug 包，调试用 |
| `wave-release.keystore` | 签名密钥（**务必备份，丢失无法升级**） |
| `build-android.sh` | 一键构建脚本（release / debug） |
| `capacitor.config.json` | Capacitor 配置（含 `server.url`） |
| `android/` | 完整 Android 工程 |

**签名信息**

```
alias      : wave
storepass  : wave2026
keypass    : wave2026
SHA-256    : 3ee7f7525a08b3b7942140c328d84b4f00884acab072537561eabbfb0a100bb7
有效期     : 30 年
```

---

## 二、环境配置

### 必需组件

| 组件 | 版本 | 说明 |
|---|---|---|
| JDK | **21** | `capacitor-android` 硬编码 `sourceCompatibility 21`，JDK 17/20 会报 `invalid source release: 21` |
| Android SDK | platform **36** | Capacitor 8 要求 `compileSdk 36` |
| build-tools | **35.0.0** | AGP 8.13 硬性要求，低于此报 `Failed to find Build Tools revision 35.0.0` |
| platform-tools | 34.0.5 | adb |
| Node | 20+ | 本项目 22.13.1 |
| Gradle | 8.14.3 | 由 wrapper 自动下载 |

### 沙箱内的实际装配过程

标准源（`dl.google.com`、`services.gradle.org`、`repo.maven.apache.org`）在本环境被劫持到 `198.18.0.x` 不可达，因此全部改走国内镜像：

| 资源 | 镜像地址 |
|---|---|
| npm 包 | `https://registry.npmmirror.com` |
| Android SDK 组件 | `https://mirrors.cloud.tencent.com/AndroidSDK/` |
| Gradle 发行包 | `https://mirrors.cloud.tencent.com/gradle/` |
| Google Maven（AGP） | `https://maven.aliyun.com/repository/google` |
| Maven Central | `https://mirrors.cloud.tencent.com/nexus/repository/maven-public/` |

SDK 组件采用**手动下载 + 解压归位**，绕开 `sdkmanager`（它只会从 `dl.google.com` 拉取）：

```
platform-tools_r34.0.5-linux.zip  →  platform-tools/
build-tools_r34-linux.zip         →  build-tools/34.0.0/
platform-36_r01.zip               →  platforms/android-36/
commandlinetools-linux-*.zip      →  cmdline-tools/latest/
```

> **坑 1**：包名里的数字是 **API 级别**，不是 Android 版本。`android-14_r03.zip` 是 API 14（Android 4.0.2），不是 Android 14。要 Android 14 得下 `platform-34` / `platform-36` 这类。
>
> **坑 2**：`build-tools` 35 在国内镜像找不到。解决办法是复制 34.0.0 为 `35.0.0` 并改 `source.properties` 里的 `Pkg.Revision=35.0.0`，AGP 只校验这个版本号。WebView 类应用用它编译完全没问题。

---

## 三、项目初始化与平台添加

```bash
cd /workspace

# 1. 安装依赖（webDir 用独立的 www/，避免把 backups/、测试脚本打进 APK）
mkdir www && cp -r index.html css js images www/
npm config set registry https://registry.npmmirror.com
npm i @capacitor/core @capacitor/cli @capacitor/android @capacitor/haptics

# 2. 初始化
npx cap init "Wave 音乐" com.wave.music --web-dir www

# 3. 添加 Android 平台（会识别已安装的 Haptics 插件）
npx cap add android

# 4. 每次改完 web 代码后同步
npx cap sync android
```

### 关键配置：让 APK 直连后端

`capacitor.config.json`：

```json
{
  "appId": "com.wave.music",
  "appName": "Wave 音乐",
  "webDir": "www",
  "server": { "url": "https://wyqaimusic.wuaze.com", "cleartext": false }
}
```

**为什么用 `server.url` 而不是把网页打进包里**：前端调 API 用的是相对路径（`api/auth.php`、`music/xx.mp3`）。若打包到本地，WebView 源变成 `capacitor://localhost`，请求远程 API 就成了跨域——而 PHP 后端没有 `Access-Control-Allow-Origin` 头，请求会被 CORS 拦掉。另外登录态存在 localStorage，跨域后与网页版不互通。

用 `server.url` 直接加载线上站点，同源、零跨域、登录态共享。**代价是必须联网**，对一个三音源在线播放器来说这个代价可以忽略。

---

## 四、构建流程

```bash
./build-android.sh            # release（签名）
./build-android.sh debug      # debug
```

脚本内部顺序很关键：

1. `npx cap sync android` 同步 web 资源
2. **替换仓库为国内镜像**
3. `./gradlew assembleRelease`

> **坑 3**：`cap sync` 会**重新生成** `android/capacitor-cordova-android-plugins/build.gradle`，把我改过的镜像地址覆盖回 `google()` / `mavenCentral()`。所以镜像替换**必须放在 sync 之后**，否则报 `Could not resolve com.android.tools.build:gradle`。

> **坑 4**：沙箱预置的 `/root/.gradle/init.gradle` 有语法错误（`url` 缺引号、`mavelCentral()` 拼错），会导致 `Could not compile initialization script`。已修正。

---

## 五、签名注意事项

```bash
keytool -genkeypair -v -keystore wave-release.keystore -alias wave \
  -keyalg RSA -keysize 2048 -validity 10950 \
  -storepass wave2026 -keypass wave2026 \
  -dname "CN=Wave Music, OU=Dev, O=Wave, L=Shenzhen, ST=Guangdong, C=CN"
```

- **keystore 一旦丢失，应用无法升级**——Google Play 和 Android 系统都校验签名一致性。务必多处备份。
- 不要上传 keystore 到公开仓库。
- 上架建议改用 **Google Play App Signing**，由 Google 托管正式签名，本地 keystore 仅作上传密钥。
- 验证签名：`apksigner verify --print-certs app-release.apk`

---

## 六、兼容性注意事项

| 项 | 说明 |
|---|---|
| `minSdkVersion` | 24（Android 7.0+），覆盖约 98% 设备 |
| `targetSdkVersion` | 36 |
| WebView | Android 7+ 的 System WebView 需较新版本才支持 ES2020+ 语法；Capacitor 8 建议配合 **Google Play 上的 Android System WebView** 更新 |
| 网络 | 必须联网（见第三节 `server.url` 说明） |
| 音频 | 跨域音频走 `captureStream()` 旁路，不用 `createMediaElementSource`（跨域会静音） |
| 全屏/横屏 | `screen.orientation.lock()` 在 iOS Safari 不支持，已做 toast 降级提示 |
| 刘海屏/手势区 | 若要适配，需在 `MainActivity` 处理 `WindowInsets` |
| 权限 | `VIBRATE` 由 Haptics 插件 manifest 自动合并；媒体会话前台服务权限需手动声明，见第八节 |

---

## 七、触感反馈（Haptics）

### 实现思路

项目是**原生 JS IIFE，没有构建工具**，不能 `import`。但 Capacitor 会在 WebView 注入 `window.Capacitor.Plugins`，因此直接调用即可，无需打包：

```js
const H = window.Capacitor?.Plugins?.Haptics;
H?.impact({ style: "MEDIUM" });
```

### 代码位置：`js/ui.js`

新增模块（已部署到线上）：

```js
function haptic(kind) {
  if (!hapticOn()) return;                    // 用户关闭则静默
  const H = global.Capacitor?.Plugins?.Haptics;
  if (H) {
    if (HAPTIC_STYLE[kind]) { H.impact({ style: HAPTIC_STYLE[kind] }); return; }
    if (kind === "selection") { H.selectionChanged(); return; }
    if (kind === "success"|"warning"|"error") { H.notification({ type: ... }); return; }
  }
  navigator.vibrate?.(HAPTIC_FALLBACK[kind] || 12);   // 降级
}
```

**全局委托**（一处覆盖所有按钮，不用逐个改）：

```js
document.addEventListener("click", function (e) {
  const marked = e.target.closest("[data-haptic]");
  if (marked) { haptic(marked.getAttribute("data-haptic")); return; }
  if (e.target.closest("button, .btn, .icon-btn, .chip, .nav-item, [role='button']")) {
    haptic("light");
  }
}, true);
```

### 强度映射

| `data-haptic` | Capacitor 调用 | 降级振动 | 适用 |
|---|---|---|---|
| `light` | `impact LIGHT` | 12 ms | 普通按钮、导航 |
| `medium` | `impact MEDIUM` | 22 ms | **播放/暂停**（已标注） |
| `heavy` | `impact HEAVY` | 38 ms | 破坏性操作、删除确认 |
| `selection` | `selectionChanged()` | 8 ms | 选择器、滑块 |
| `success` | `notification SUCCESS` | `[12,40,12]` | 收藏成功、添加歌单 |
| `warning` / `error` | `notification WARNING/ERROR` | `[20,50,20]` | 操作失败 |

已标注：`btnPlay` = medium，`btnPrev` / `btnNext` = light，其余按钮自动 light。

### 开关

播放器菜单 → **触感反馈**，状态存 `localStorage.mp_haptic`（`"0"` = 关闭）。

### 机型兼容与降级

| 场景 | 行为 |
|---|---|
| Android + Capacitor | 原生 `VibrationEffect`，力度分级真实生效 |
| Android 浏览器（无 Capacitor） | 走 `navigator.vibrate()`，Android Chrome 支持 |
| **iOS** | Capacitor Haptics 生效（Taptic Engine）；但 **`navigator.vibrate()` 不被支持**，所以纯浏览器环境 iOS 无震动——这是系统限制，无解 |
| 低端机无马达 | 静默失败，已用 `try/catch` 包裹 |
| 用户关闭开关 | 直接 return，零开销 |

> 注意：Android 上 `navigator.vibrate()` 必须在**用户手势**（如 click）中触发，否则被忽略。本实现的调用链全部在 click 事件里，符合要求。

---

## 八、媒体会话（MediaSession）与系统媒体控制

### 为什么必须用原生插件

**Android WebView 不支持 Web Media Session API**（`navigator.mediaSession`）。网页在浏览器里能驱动的锁屏控制、通知栏卡片、耳机线控，打进 APK 后全部静默失效。因此接入 `@capgo/capacitor-media-session`（v8.0.30，兼容 Capacitor 8）做原生桥接。

前端在 `js/player.js` 里做双通道：检测到 `window.Capacitor.Plugins.MediaSession` 走原生，否则降级回 Web API——所以官网浏览器端体验不受影响。

```bash
npm i @capgo/capacitor-media-session
```

桥接点共 5 处：`updateMediaSession`（元数据）、`setupMediaSession`（操作回调）、play / pause 事件（播放状态）、`syncPositionState`（进度）。

### 坑 5：setMetadata 传 artwork 会导致一播放就闪退（严重）

插件 `MediaSessionPlugin.setMetadata` 在**主线程**用 `HttpURLConnection` 同步下载封面：

```java
if (url.startsWith("http")) {
    HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
    connection.connect();          // 主线程网络请求
    ...
}
```

这会抛 `NetworkOnMainThreadException`（属于 `RuntimeException`），而插件只 `catch (JSONException | IOException)`，**拦不住** → 原生崩溃。网易云 / QQ / Audius 的封面全是 http URL，所以**所有在线歌曲一播放就闪退**。

**修复：原生 `setMetadata` 不传 `artwork`**，只传文字信息：

```js
nms.setMetadata({ title: song.title, artist: song.artist, album: song.album });
// 切勿传 artwork：[{ src: "https://..." }]
```

代价：Android 通知 / 锁屏不显示封面图，只有歌名歌手 + 播放控制。灵动胶囊、锁屏控制、耳机线控均不受影响。

### 坑 6：targetSdk 34+ 必须声明 FOREGROUND_SERVICE_MEDIA_PLAYBACK

播放时插件会启动 `mediaPlayback` 类型的**前台服务**。从 `targetSdk 34`（Android 14）起，启动该类型前台服务必须在 manifest 声明 `FOREGROUND_SERVICE_MEDIA_PLAYBACK`，否则 `setPlaybackState("playing")` → `startMediaService()` 抛 `SecurityException` → 同样闪退（仅 Android 14+ 设备复现）。

插件自带的 manifest 只有基础 `FOREGROUND_SERVICE`，缺细分权限，需在主 app 的 `android/app/src/main/AndroidManifest.xml` 手动补全：

```xml
<uses-permission android:name="android.permission.VIBRATE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK" />
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
```

> **重要**：`android/` 已列入 `.gitignore`，不进仓库。任何人 clone 后自行 `npx cap add android`，都必须补上这段权限，否则 Android 14+ 一播放就闪退。本仓库的 `build-android.sh` 不含这一步，别漏。

### 生效后的机型特性

正确接入后，系统会自动把 MediaSession 渲染成各家 UI，无需额外开关：小米 HyperOS **灵动胶囊**、OPPO 流体云、vivo 原子通知，以及通用锁屏媒体卡片、通知栏播放控制、蓝牙 / 耳机线控。

---

## 九、overlayfs 下 node_modules 构建产物损坏（沙箱特有）

在 overlay 文件系统的沙箱里，Gradle 写在 `node_modules/@*/android/build/` 的产物会因 copy-up 导致 MD5 校验失败，报 `Cannot create ... values.xml` 一类错误。**只删 `android/` 下的 build 目录不够**，必须连插件的一起删：

```bash
rm -rf node_modules/@capacitor/*/android/build node_modules/@capgo/*/android/build
rm -rf android/build android/app/build android/capacitor-cordova-android-plugins/build
```

另外，环境变量 `JAVA_HOME` 可能被 sdkman 指向 Java 20，而 `capacitor-android` 要求 21。`build-android.sh` 已改为**硬编码** `export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64`，不要改回 `${JAVA_HOME:-...}` 形式。

