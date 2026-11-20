# 鸿蒙刷新反馈与留言恢复未读 Implementation Plan

**Goal:** 鸿蒙卡片点击刷新立即有可见动画；收件人可在桌面留言记录中将已读留言恢复未读，重新显示在自己的卡片待阅队列。

**Architecture:** 卡片点击本地@State驱动800ms单次旋转，网络请求与状态反馈保持原逻辑，不依赖来回刷新才启动动画。新增幂等note-only unread接口，保持旧read接口幂等及聊天已读位置不变；网页标记按钮按当前状态调用明确操作。

**Tech Stack:** ArkTS动态卡片、现有Node/SQLite服务与网页JS。

- [x] 收件人/跨账本/发件人/只读/幂等/卡片队列与聊天不回退测试通过，完成unread接口及按钮切换。
- [x] 本地点击状态先于消息事件的行为验证、真实ArkTS编译通过；使用800ms单次旋转，保持网络立即执行。
- [x] 双端320/390/1280px浏览器实际点击已读/未读并核对真实API队列，完整143项测试通过；Harmony10906，Android保持10905。
- [x] HAP已归档../love-app，旧包保留，官方签名校验通过；未推送或部署。

鸿蒙未连接真机，不把构建/状态测试当作桌面动画真机验证。参考官方动画说明：https://github.com/openharmony/docs/blob/master/zh-cn/application-dev/form/arkts-ui-widget-page-animation.md
