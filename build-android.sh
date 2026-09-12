#!/usr/bin/env bash
# ============================================================
#  Wave 音乐播放器 — Android APK 一键构建脚本
#
#  用法:
#    ./build-android.sh            # 构建 release 签名包
#    ./build-android.sh debug      # 构建 debug 包
#
#  产物:
#    android/app/build/outputs/apk/release/app-release.apk
#    android/app/build/outputs/apk/debug/app-debug.apk
#
#  前置依赖（本沙箱已装好，换机器时需自行准备）:
#    - JDK 21            (Capacitor 8 / capacitor-android 要求 sourceCompatibility 21)
#    - Android SDK       platforms;android-36 + build-tools;35.0.0 + platform-tools
#    - Node 20+
# ============================================================
set -euo pipefail

cd "$(dirname "$0")"
VARIANT="${1:-release}"

export JAVA_HOME="/usr/lib/jvm/java-21-openjdk-amd64"
export ANDROID_HOME="${ANDROID_HOME:-/opt/android-sdk}"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$JAVA_HOME/bin:$PATH"

echo "== 环境 =="
java -version 2>&1 | head -1
echo "JAVA_HOME=$JAVA_HOME"
echo "ANDROID_HOME=$ANDROID_HOME"

# 同步 web 资源到 android 工程
echo "== 同步 web 资源 =="
npx cap sync android

# cap sync 会重新生成 capacitor-cordova-android-plugins/build.gradle，
# 因此必须在 sync 之后再把仓库替换成国内镜像
echo "== 替换仓库为国内镜像 =="
python3 - <<'PY'
import glob, io
GOOGLE = "maven { url 'https://maven.aliyun.com/repository/google' }"
MAVEN  = "maven { url 'https://mirrors.cloud.tencent.com/nexus/repository/maven-public/' }"
files = set([
    "android/build.gradle",
    "android/app/build.gradle",
    "android/capacitor-cordova-android-plugins/build.gradle",
    "node_modules/@capacitor/android/capacitor/build.gradle",
]) | set(glob.glob("node_modules/@capacitor/*/android/build.gradle")) | set(glob.glob("node_modules/@capgo/*/android/build.gradle"))
n = 0
for f in sorted(files):
    try:
        s = io.open(f, encoding="utf-8").read()
    except Exception:
        continue
    o = s
    s = s.replace("google()", GOOGLE).replace("mavenCentral()", MAVEN)
    if s != o:
        io.open(f, "w", encoding="utf-8").write(s)
        n += 1
print("已替换 %d 个文件" % n)
PY

echo "== 构建 $VARIANT =="
cd android
if [ "$VARIANT" = "debug" ]; then
  ./gradlew clean assembleDebug --no-daemon -Dorg.gradle.jvmargs="-Xmx3g"
  APK="app/build/outputs/apk/debug/app-debug.apk"
else
  ./gradlew clean assembleRelease --no-daemon -Dorg.gradle.jvmargs="-Xmx3g"
  APK="app/build/outputs/apk/release/app-release.apk"
fi

echo "== 完成 =="
ls -lh "$APK"
