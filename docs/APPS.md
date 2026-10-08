# Windows 与 Android 客户端

两端默认连接 `https://love.11215739.xyz:11961/`，复用服务器网页和账号数据，源码版本为 1.8.0。网页更新后应用重新打开即可加载新功能。需联网。新客户端可在主界面右上角“通知设置”开启提醒：社交通讯用于对方新消息，服务通知用于新增回忆和特殊日期。Windows 运行或最小化期间每15秒检查，完全退出后不接收；Android 页面存活期间每15秒检查，后台系统任务约15分钟起检查一次，休眠、省电、强行停止可能延迟或暂停。当前未接入厂商实时推送。特殊日期按北京时间当日09:00起提醒，只发送给该提醒所选成员。首次开启不补发旧消息。

所有客户端安装包与构建产物统一保存到仓库同级的 ../love-app/（本机 E:\codex\love-app）。后续继续沿用，安装包不提交公开源码仓库；发布 APK 与清单存放在独立私有 love-app 仓库。

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

V1.7.2 修复 App 图片上传选择器：使用系统文档选择器，支持图片多选及取消后重试。需要安装 `../love-app/OurDays-1.7.2-Android-test.apk`，仅更新服务器不能更新原生选择器。

Android 8.0 及以上。使用系统 WebView，建议更新 Android System WebView。图片/视频/音频通过系统文件选择器上传，不申请整个存储空间的读取权限。录音首次使用需授予麦克风权限；下载附件自动写入系统 Downloads。返回键先关闭网页弹窗、再返回或退出。

Android Studio 打开 `apps/android`，安装 JDK 17、Android SDK 35、Build Tools 35.0.0。项目包含 Gradle 8.11.1 wrapper 和官方发行包 SHA256 校验。在该目录运行：

```powershell
.\gradlew.bat assembleDebug
```

测试 APK 在仓库同级的 `love-app/android-build/app/outputs/apk/debug/app-debug.apk`。这是调试签名测试包。不同电脑/CI 运行产生的调试密钥可能不同，后续升级可能需要先卸载旧测试包；正式使用应固定发布签名密钥。

正式 APK：用 Android Studio 的 Generate Signed APK 创建并保存自己的密钥，或设置 `ANDROID_KEYSTORE_PATH`、`ANDROID_KEYSTORE_PASSWORD`、`ANDROID_KEY_ALIAS`、`ANDROID_KEY_PASSWORD` 后执行 `.\gradlew.bat assembleRelease`。四项需全部配置；无密钥时 release 输出为未签名 APK，不能直接安装。密钥应私下备份，不能提交 Git。修改 `app/build.gradle` 的服务器地址、版本号后重新构建。

支持本站 HTTPS 直接下载链接（语音、回忆附件和服务端导出），暂不支持网页生成的 blob/data 下载链接。证书必须由 Android 信任，应用不会绕过证书校验。

## GitHub 打包

将代码上传 GitHub 后，在 Actions 找到 **Build clients**，点击 **Run workflow**。此流程仅验证构建，不在公开仓库上传安装包 Artifact。正式安装包使用本机固定签名构建，发布到独立私有 love-app 仓库，服务器拉取后提供更新下载。

## 验收

正式使用前请在 Windows 和 Android 真机分别测试：账号登录与重新打开、文字与图片消息、麦克风拒绝/允许/撤销、录音播放与下载、回忆视频上传与播放、历史检索、多选与保存回忆、软键盘输入、返回键关闭聊天、断网后的重新连接。

构建依据：[Electron 安全配置](https://www.electronjs.org/docs/latest/tutorial/security)、[Android WebChromeClient](https://developer.android.com/reference/android/webkit/WebChromeClient)、[AGP 8.9 工具版本要求](https://developer.android.com/build/releases/agp-8-9-0-release-notes)。

录音授权修复包：`../love-app/OurDays-1.8.0-Android-microphone-fix.apk`。系统授权后等待 Activity 回到前台，再授予本站 WebView 麦克风权限；取消的请求不继续授权。本次保持版本号不变，需要安装修复包；网页错误分类需更新服务器。

应用内更新服务、首次安装及后续发布步骤见 [Android 更新](APP-UPDATES.md)。当前更新版内部构建号为 10801，显示版本不变。


## 通知客户端构建（显示版本 1.8.0）

Android 通知构建号为 10802，安装包 `../love-app/OurDays-1.8.0-Android-build10802.apk`，保持原签名，可覆盖升级。Windows 新安装包在 `../love-app/windows-notifications10802/OurDays-1.8.0-Windows-notifications-x64.exe`。

先发布服务器源码，再安装新版客户端，登录后从右上角菜单选择“通知设置”并开启。Android 13 及以后会申请系统通知权限；系统通知设置内可分别控制“社交通讯”和“服务通知”。Windows 可在系统通知设置中控制朝夕通知。点击通知可打开聊天或对应日期。

安装包不提交公开源码仓库，APK 后续仍通过独立私有 love-app 仓库和服务器更新脚本发布。后台定时检查不等同于厂商推送；需要退出进程后及时送达时，还需接入系统推送。


Windows 应用内更新构建10803：`../love-app/OurDays-1.8.0-Windows-build10803-x64.exe`。先安装此包，再使用主界面右上角“版本更新”或桌面菜单“检查更新”。服务器接口 `/api/app/update?platform=windows` 与 Android 清单独立，SHA256校验通过后由用户选择启动安装。后续发布新Windows原生包需递增 client-build.json 并同步 package.json 中 buildVersion 和 artifactName；显示版本仍按正式发布节奏。


Android 原生录音兼容构建10803：`../love-app/OurDays-1.8.0-Android-build10803.apk`。WebView麦克风启动失败时可点击聊天工具栏“App 原生录音”，通过Android MediaRecorder录制，再回到聊天试听和发送。卓易通仍需要宿主和朝夕的麦克风权限；此入口绕过WebView转接，但不保证能绕过卓易通本身的硬件访问限制。录音最长2分钟，切到后台或取消会丢弃临时录音，不自动发送。

Android录音修复构建10804：`../love-app/OurDays-1.8.0-Android-build10804.apk`。安装此包并更新服务器源码后，聊天中的“录制语音”直接调用Android原生MediaRecorder；保留试听、取消及手动发送。首次授权等待应用恢复焦点再启动，录音切到后台会取消。手机浏览器仍使用网页录音。尚需手机实测确认。

Android构建10805：`../love-app/OurDays-1.8.0-Android-build10805.apk`，原生录音不再显示弹窗，聊天工具栏显示结束录音、计时和取消。需同步更新服务器网页代码。

Android构建10806：`../love-app/OurDays-1.8.0-Android-build10806.apk`。手机按住说话，松开发送；上滑到左侧取消，右侧转文字填入草稿供编辑，不自动发送文字。首次授权可能中断手势，授权后重新按住即可。系统图片选择取消保留当前聊天。需同步部署网页源码。备忘录支持最多4张图片，新上传图片总量20MB，仅本人可见，AI仅整理文字。
