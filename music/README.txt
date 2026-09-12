# 音频文件目录

将你的 MP3 文件上传到这里。
命名规则：s01.mp3, s02.mp3, ... s36.mp3
（与 js/data.js 中的歌曲 ID 一一对应）

然后在 js/data.js 中修改 AUDIO_MODE：
- "local"    → 直接从 music/ 目录加载
- "php"      → 通过 audio.php 流式代理（推荐，支持进度拖动）
- "remote"   → 默认，使用 SoundHelix 示例音轨
