# 鸿蒙卡片已读响应 Implementation Plan

**Goal:** 鸿蒙桌面已读点击有清晰反馈、请求成功后推进队列，失败保留消息并明确可重试。

**Architecture:** 用明确Button承载整块热区。系统onUpdateForm/onFormEvent回调补登记已有卡片，避免本机登记缺失时静默忽略。缓存标记中与失败状态随FormData更新；保留账号隔离与服务端已读幂等。日志只输出操作及错误类别，不记录正文、Cookie或原始响应。

- [x] 回归：已有卡片缺失登记仍能分发；按钮→Form事件→原生POST→真实SQLite服务→发布无待阅状态的串联测试通过；错误保留消息并支持重试。
- [x] 系统回调补登记、明确Button、标记中/失败状态，保留旋转修复；日志不含正文和Cookie。
- [x] 完整146项测试、真实ArkTS构建及官方签名验证通过；仅鸿蒙内部构建10907，显示1.9.0，旧包保留到../love-app。
- [ ] 如设备重新连接，直接检查实际事件与网络日志；未连接则明确真机限制，不假称问题已复现或已实机解决。

本轮开始时设备已断开；当前用户反馈是已读无效果，尚未确定发生在点击、事件路由或网络哪一层。

交付时HDC仍无连接目标，未再次安装到用户手机，不能声称已确认用户真机根因或实机修复完成。

## 后续定位：系统保留字段冲突（10908）

- 用户进一步确认只有按压效果，按钮文字未进入标记中。
- 核对OpenHarmony ArkUI `FormManagerDelegate::ParseAction`：message事件会将外层action覆盖为message，并保留原params嵌套；此前用params.action传read/refresh，接收端读取外层action而忽略操作。
- [x] 按系统包装方式新增回归，旧代码复现分发次数为0，串联测试也未发出POST。
- [x] 发送端用widgetAction，接收端兼容新字段、旧嵌套params和旧平铺格式；保留账号校验。
- [x] 系统包装→已读POST→真实DB→下一卡片状态，以及本地旋转→实际GET取得新留言均通过；完整147项测试、ArkTS编译及签名校验通过。
- [x] HAP10908归档到../love-app，旧包保留，Android10905和服务器协议不变；未推送部署。
- [ ] 设备仍未连接，尚未在用户手机复测。

依据：https://github.com/openharmony/arkui_ace_engine/blob/master/frameworks/core/components/form/resource/form_manager_delegate.cpp#L498
