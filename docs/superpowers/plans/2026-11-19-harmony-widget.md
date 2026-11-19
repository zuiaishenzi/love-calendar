# Harmony 桌面卡片实施补充

沿用用户已确认的 [桌面卡片方案](../../ANDROID-WIDGET.md)，执行方式为当前会话直接开发，不派发代理，不自动发布。

## 目标和约束

- 原生ArkTS FormExtensionAbility与2×2服务卡片；使用现有 `/api/widget/state`、`/api/widget/read`，不新增重复的服务端留言数据。
- 无未读/倒计时进入桌面留言，聊天进入聊天，留言进入留言；逐条已读、账号隔离、温馨预设背景与本机照片。
- 鸿蒙系统定时单位30分钟，使用updateDuration=1；打开App和手动刷新主动同步，不宣称15分钟或精确即时更新。
- 保持1.9.0，鸿蒙构建10901；签名资料与构建文件只在 `../love-app`，不进入源码、不覆盖旧包、不发布。

## 文件及实施顺序

1. `entry/ets/common/WidgetModel.ets`：纯数据模型和展示/跳转规则，Node测试转译后验证；不得包含Cookie等认证信息。
2. `entry/ets/common/HarmonyWidget.ets`：应用沙箱认证/缓存、固定同源HTTPS请求、原生图片处理、form更新及生命周期保护。认证不放进卡片绑定数据或Want；换账号、退出、401清理；旧响应不能覆盖新账号。
3. `entry/ets/widget/OurDaysFormAbility.ets` 和 `entry/ets/widget/OurDaysCard.ets`：注册创建/刷新/已读/删除，绑定2×2圆角UI与本地SVG/共享图片FD；卡片不直接访问网络。
4. `EntryAbility.ets` / `Index.ets`：冷/热启动卡片跳转、可信页面prompt桥、原生选图和后台恢复同步；保留既有录音、下载和滚动修复。
5. `module.json5`、`form_config.json`、资源与版本：添加系统卡片元数据、默认卡片和三幅SVG，沿用已有INTERNET权限；现有SDK无公开发布卡片API时提供系统桌面添加指引，不伪装已添加成功。
6. `public/widget.js`：识别新鸿蒙能力并保留旧版行为，鸿蒙设置提示30分钟。原生兼容标记同时兼容服务器已部署的1.9.0网页。
7. `test-harmony.mjs`：核心展示、序列化不含认证、消息事件与过期响应保护；运行完整测试、真实CSP布局测试和HAP编译验签。没有真机时明确不声称已通过启动器/后台调度测试。

## 验收

- A发送只在B卡片显示，读后卡片恢复倒计时，App历史保留。
- Cookie失效/切换账号/旧网络响应不展示旧账号正文或背景。
- 卡片图片是压缩后的沙箱照片，通过formImages FD传递并在更新结束后关闭，不给卡片文件系统权限。
- 本地HAP可构建和验签；保留旧包；不改变Android包或私库清单。

## 执行结果

2026-11-19已完成源码实现。完整134项测试通过，包含19项鸿蒙测试；320/390/1280px设置页检查及真实服务器CSP回归通过。ArkTS、资源与HAP打包通过。原开发证书已到期，用户选择「先交付源码和未签名编译验证包」，因此本次不再要求完成验签，交付 `../love-app/OurDays-1.9.0-Harmony-build10901-unsigned.hap`。未安装、未发布；真机桌面、照片背景和后台调度仍待有效签名后验证。
