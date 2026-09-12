# Wave 音乐播放器 🎵

一个原生 JavaScript 构建的网页音乐播放器，支持三音源在线播放、收藏、歌单、跨设备同步与个性化推荐。部署于 InfinityFree 免费 PHP 主机。

- **线上地址**：<https://wyqaimusic.wuaze.com>
- **技术栈**：原生 JS（无框架）· PHP 7.x · MySQL
- **部署方式**：FTP 上传（无 SSH / 无 Composer / 无 Node.js 运行时）

---

## ✨ 功能特性

- 🎧 **三音源播放**：内置示例曲 + 网易云音乐 + QQ 音乐 + Audius
- ❤️ **收藏 / 歌单 / 历史**：支持跨设备同步（MySQL + localStorage）
- 🔍 **在线搜索**：网易云 / QQ 音乐歌单导入与搜索
- 🎨 **个性化**：封面取色氛围光、明暗主题、自定义背景（模糊 / 透明度可调）
- 📱 **移动端体验**：Media Session API（灵动岛 / 锁屏 / 耳机线控）、横屏沉浸模式、触感反馈
- 👥 **社区**：好友、在线用户、歌曲分享
- 🔐 **账号体系**：注册 / 登录 / 邮箱二次验证 / 个人资料（头像、昵称、UID、签名等）
- 📦 **Android App**：通过 Capacitor 打包，支持远程加载本网站

---

## 🛠 技术栈

| 层 | 技术 |
|---|---|
| 前端 | 原生 JavaScript（ES6+ IIFE）、HTML5 Audio、Media Session API、CSS 变量 + 玻璃拟态 |
| 后端 | PHP 7.x（PDO + MySQL） |
| 数据库 | MySQL（InfinityFree） |
| 部署 | FTP（`ftpupload.net`） |
| 移动端 | Capacitor（Android APK） |

---

## 📁 目录结构

```
├── index.html              # 单页入口 + 所有弹窗
├── privacy.html            # 隐私政策
├── terms.html              # 用户服务条款
├── audio.php               # 音频流代理
├── .htaccess               # 安全响应头 / 静态缓存
├── css/
│   └── style.css           # 全部样式
├── js/
│   ├── data.js             # 曲库字典 + 外部歌曲注册 + 持久化
│   ├── store.js            # 用户 / 收藏 / 歌单 / 历史 / 资料 + 云端同步
│   ├── player.js           # 播放引擎 + Media Session + 频谱
│   ├── ui.js               # 路由 / 渲染 / 交互 / 弹窗
│   ├── recommend.js        # 情感化推荐
│   ├── particles.js        # 粒子背景
│   └── app.js              # 入口
├── api/
│   ├── config.example.php  # 数据库 / 邮箱配置模板（复制为 config.php 填写）
│   ├── auth.php            # 注册 / 登录 / 资料
│   ├── sync.php            # 跨设备同步
│   ├── netease.php         # 网易云搜索 / 歌单 / 播放地址
│   ├── qq.php              # QQ 音乐搜索 / 歌单 / 播放
│   ├── audius.php          # Audius
│   ├── upload.php          # 头像上传
│   ├── social.php          # 好友 / 分享
│   ├── mail.php            # 邮箱验证码
│   ├── db.sql              # 表结构
│   └── migration_2fa.sql   # 二步验证迁移
├── images/                 # 默认壁纸
├── music/                  # 内置示例曲（s01–s15.mp3）
├── capacitor.config.json   # Capacitor 配置（Android 打包）
├── build-android.sh        # Android 一键构建脚本
└── ANDROID_BUILD.md        # Android 打包说明
```

---

## 🚀 快速部署

### 1. 准备主机与数据库

本项目基于 InfinityFree 免费主机（PHP + MySQL + FTP）。在 InfinityFree 控制面板创建 MySQL 数据库，记录数据库名、用户名、密码、主机地址。

### 2. 配置数据库

```bash
cd api
cp config.example.php config.php
# 编辑 config.php，填入你自己的数据库与 SMTP 邮箱信息
```

> ⚠️ **config.php 已被 .gitignore 排除**，请勿将包含真实密码的 config.php 提交到仓库。

### 3. 上传到主机

将项目文件通过 FTP 上传到 `htdocs/` 目录（本仓库已包含 `.htaccess`，无需额外配置）。

### 4. 初始化数据库

在 phpMyAdmin 中导入 `api/db.sql`（如有二步验证需求再导入 `api/migration_2fa.sql`）。

---

## 💻 本地开发

前端为纯静态页面，可直接用静态服务器预览：

```bash
python3 -m http.server 8899
# 浏览器打开 http://localhost:8899
```

后端 PHP 接口需 PHP 环境 + MySQL，本地可参考 `api/config.example.php` 配置。

---

## 📱 Android 打包

本仓库附带 Capacitor 配置与构建脚本，可将本网站打包为 Android APK（远程加载模式，改网页无需重新发包）。

```bash
bash build-android.sh
```

详细步骤与踩坑说明见 [ANDROID_BUILD.md](./ANDROID_BUILD.md)。

---

## 🔒 安全说明

- 所有第三方音源请求均通过 PHP 后端代理，前端不直接请求网易云 / Audius。
- 用户输入做 HTML 转义，文件上传校验 MIME + 随机文件名 + 大小限制。
- 密码加密存储，不保存明文。
- **请勿提交** `api/config.php`、`backup.py`、`*.keystore` 等含敏感信息的文件（已列入 `.gitignore`）。

---

## 📄 许可与版权

- 本项目的代码与界面设计归项目作者所有。
- 站内播放的音乐、歌词、封面等内容的著作权归原作者、唱片公司或相关权利方所有，仅供个人欣赏与学习交流，请勿用于商业用途或侵犯相关权利人权益。

---

## 📮 联系方式

- 运营者：个人开发者
- 联系邮箱：13525474011@163.com
- 官网：<https://wyqaimusic.wuaze.com>
