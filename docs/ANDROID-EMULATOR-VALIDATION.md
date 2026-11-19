# Android桌面卡片模拟器验证

日期：2026-11-19。结论：已安装官方模拟器并完成Android 12/API31、Android 16/API36对照验证，未复现用户报告的原生闪退；不能据此认定特定厂商手机的问题已经解决。本轮实测另外复现并修复了聊天卡片跳转时网页脚本加载被取消的问题。修改尚未发布，线上正式Android构建仍为10901。

## 环境

- SDK：`E:/codex/love/local-preview-data/android-tools/sdk`。
- 官方Android Emulator 37.2.13，官方镜像 `system-images;android-31;default;x86_64` 与 `system-images;android-36;default;x86_64`。
- 模拟器和镜像均从Google官方仓库下载，并按官方SHA1验证；没有关闭HTTPS校验。
- 已启用Windows Hypervisor Platform，`emulator -accel-check` 返回0且WHPX可用；两台模拟器实际硬件加速启动成功，本轮未重启Windows。
- 两台AVD分别为 `OurDays_API31`、`OurDays_API36`，480×960、2核、2GB内存，SwiftShader图形渲染。数据位于 `E:/codex/love-app/emulator-validation/avd`。
- 测试及构建产物保存在 `E:/codex/love-app/emulator-validation`，不进入公开源码仓库。

## 实际验证

| 检查 | Android 12 | Android 16 |
| --- | --- | --- |
| 原始签名10901 APK安装及冷启动 | 通过 | 通过 |
| 10901 QA副本登录、系统确认添加卡片、显示对方留言 | 通过 | 通过 |
| 10901 App进程重新创建、卡片刷新及打开应用 | 未出现原生崩溃 | 未出现原生崩溃 |
| 覆盖升级10902 QA副本，保留登录账号 | 通过 | 通过 |
| 背景切换、后台任务注册、手动强制执行JobScheduler任务 | 通过 | 通过 |
| 留言已读后恢复倒计时 | 刷新同步已读结果，通过 | 点击卡片已读，通过 |
| 聊天卡片点击后进入聊天 | 修复网页初始化后通过 | 修复网页初始化后通过 |
| 每台连续5次使用与卡片相同flags/参数重新进入 | 通过 | 通过 |
| 原始签名10902 APK安装及冷启动 | 通过 | 通过 |
| 本轮最终崩溃日志 | 空 | 空 |

后台任务采用 `cmd jobscheduler run -f` 触发验证注册与执行，没有把它当作真实等待15分钟及厂商省电策略验证。没有测试真实手机厂商桌面、长时间待机、厂商后台限制或该用户手机的具体系统构建。

正式签名APK只进行了安装及启动检查。登录后的完整流程使用独立QA副本，保留相同应用代码与targetSdk，另改为本机HTTPS服务、仅信任本机测试证书并启用WebView调试；这些改动只存在于仓库外QA工程，没有加入正式APK。使用本地模拟账号、留言及聊天记录，没有读写生产账号或数据库。

## 发现并修复的问题

`startChat` 初始化调用 `stopChat` / `leaveChatView`；原实现即使没有录音，也会发送 `/app/cancel-voice` 导航。模拟器实测中，该导航使正在加载的 `widget.js` 出现 `net::ERR_ABORTED`，导致 `openWidgetLink` 未定义，聊天卡片打开App后停在日历。

现跟踪尚未完成的原生录音请求，仅在实际等待录音结果时发送取消指令；正在录音的清理由已有 `releaseRecording` 处理。修复后两台模拟器都确认 `openWidgetLink` 成功加载，真实点击桌面聊天卡片后 `view==='chat'`。新增回归测试覆盖空闲初始化不导航、等待授权时退出仍取消。完整135项测试通过。

这是网页脚本修复，需要后续部署网站；10902 APK包含此前后台异常隔离修复，不能仅靠安装该包获得尚未部署的网页变更。修复卡片跳转不等于确认解决了用户报告的原生闪退。

## 重用环境与证据

双击 `E:/codex/love-app/emulator-validation/Start-Android12.bat` 或 `Start-Android16.bat` 可打开对应模拟器。安装包仍位于 `E:/codex/love-app`。要重跑隔离服务测试，可运行该目录的 `Start-Local-QA-Server.bat`，再安装 `build10902/app/outputs/apk/debug/app-debug.apk`；仅此QA副本连接本地服务，测试账号为 `emulatorB`，密码 `EmulatorQA2026`，不是线上账号。

截图、界面树及日志保存在 `E:/codex/love-app/emulator-validation/evidence`：`api31-countdown.png`、`api36-countdown.png`、`api31-chat-final.png`、`api36-chat-final.png`，以及两台模拟器的 `*-crash.log`、`*-final-signed-crash.log`。日志为空只表示本轮观察窗口未捕获崩溃，不代表所有设备和场景都不会崩溃。测试结束后关闭模拟器及临时测试服务，配置与模拟数据保留。
