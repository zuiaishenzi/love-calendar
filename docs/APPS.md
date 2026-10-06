# Windows 与 Android 客户端

两端默认连接 `https://love.11215739.xyz:11961/`，复用服务器网页和账号数据，版本为 1.7.0。网页更新后应用重新打开即可加载新功能。需联网，退出应用后的消息推送暂未实现。

所有客户端安装包与构建产物统一保存到仓库同级的 ../love-app/（本机 E:\codex\love-app）。后续继续沿用，安装包不提交 Git。

## Windows

在 `apps/windows` 执行：

```powershell
npm ci
npm start
npm run build
```

安装包在仓库同级的 `love-app/OurDays-1.7.0-Windows-x64.exe`。支持保留登录状态、麦克风授权、系统文件选择器、附件下载。修改服务器地址需编辑 `config.json` 后重新打包。没有代码签名证书的安装包可能显示 Windows SmartScreen 提示；正式公开分发建议配置代码签名。

窗口加载失败会显示重新连接提示。远程网页没有 Node.js 权限，外站链接转交浏览器，不会忽略 HTTPS 证书错误。

## Android

Android 8.0 及以上。使用系统 WebView，建议更新 Android System WebView。图片/视频/音频通过系统文件选择器上传，不申请整个存储空间的读取权限。录音首次使用需授予麦克风权限；下载附件自动写入系统 Downloads。返回键先关闭网页弹窗、再返回或退出。

Android Studio 打开 `apps/android`，安装 JDK 17、Android SDK 35、Build Tools 35.0.0。项目包含 Gradle 8.11.1 wrapper 和官方发行包 SHA256 校验。在该目录运行：

```powershell
.\gradlew.bat assembleDebug
```

测试 APK 在仓库同级的 `love-app/android-build/app/outputs/apk/debug/app-debug.apk`。这是调试签名测试包。不同电脑/CI 运行产生的调试密钥可能不同，后续升级可能需要先卸载旧测试包；正式使用应固定发布签名密钥。

正式 APK：用 Android Studio 的 Generate Signed APK 创建并保存自己的密钥，或设置 `ANDROID_KEYSTORE_PATH`、`ANDROID_KEYSTORE_PASSWORD`、`ANDROID_KEY_ALIAS`、`ANDROID_KEY_PASSWORD` 后执行 `.\gradlew.bat assembleRelease`。四项需全部配置；无密钥时 release 输出为未签名 APK，不能直接安装。密钥应私下备份，不能提交 Git。修改 `app/build.gradle` 的服务器地址、版本号后重新构建。

支持本站 HTTPS 直接下载链接（语音、回忆附件和服务端导出），暂不支持网页生成的 blob/data 下载链接。证书必须由 Android 信任，应用不会绕过证书校验。

## GitHub 打包

将代码上传 GitHub 后，在 Actions 找到 **Build clients**，点击 **Run workflow**。完成后在该次运行的 Artifacts 下载 Windows 安装包和 Android 测试 APK。此流程只创建构建产物，不发布 Release，不部署服务器。

## 验收

正式使用前请在 Windows 和 Android 真机分别测试：账号登录与重新打开、文字与图片消息、麦克风拒绝/允许/撤销、录音播放与下载、回忆视频上传与播放、历史检索、多选与保存回忆、软键盘输入、返回键关闭聊天、断网后的重新连接。

构建依据：[Electron 安全配置](https://www.electronjs.org/docs/latest/tutorial/security)、[Android WebChromeClient](https://developer.android.com/reference/android/webkit/WebChromeClient)、[AGP 8.9 工具版本要求](https://developer.android.com/build/releases/agp-8-9-0-release-notes)。
