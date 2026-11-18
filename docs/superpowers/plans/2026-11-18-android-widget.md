# Android Desktop Widget Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> 执行适配：上游提及的两个配套技能当前未安装，不声称可用、不派发子代理、不自动提交或发布。方案确认后在当前会话直接逐项实现和验证，遵循项目授权范围。

**Goal:** 实现2×2 Android桌面卡片，展示对方未读留言/聊天、纪念日倒计时和自选背景。

**Architecture:** 服务端提供同账本隔离的留言、倒计时选择和聚合未读接口；网页提供 App 内操作入口。Android使用Java RemoteViews组件、JobScheduler周期任务及原生网络客户端，与现有WebView会话共享同源认证。

**Tech Stack:** Node.js24、现有加密SQLite、原生HTML/CSS/JS；Android Java、AppWidgetProvider、JobScheduler。保留现有minSdk26/compileSdk35/targetSdk35，JobScheduler依赖在实施时核对官方兼容版本后固定。

**Spec:** [Android桌面卡片试用版设计](../../ANDROID-WIDGET.md)

## Global Constraints

- 后台约15分钟检查，手动刷新及打开 App 立即同步；省电策略可能延迟。
- Android原生组件；桌面目标2×2，沿用应用粉色风格，文字可读优先。
- 先不改变显示版本；覆盖升级的versionCode必须高于已有包。
- 安装包及构建产物统一在 `E:/codex/love-app`，不进入公开仓库。
- 用户2026-11-19确认实施；构建本地试用APK用于验证，不部署、不推送、不发布安装包。

## Review Focus

- 切换账号、登出和会话过期时，旧用户正文/背景不得继续出现在组件上：任务3覆盖。
- 快速重复已读或从其他设备同时读消息，不能回退聊天游标或跳过未读：任务1覆盖。
- 删除/改为私有的倒计时提醒必须撤销无权访问的配置：任务1覆盖。
- 断网时已读不能假成功，多组件不得造成重复轮询：任务3覆盖。
- 启动器尺寸、字体放大和后台省电导致的状态变化不能裁掉按钮或谎报实时：任务4覆盖。

---

### Task 1: 留言、倒计时及卡片聚合API

**Files:** 新建 `widget.mjs`、`test-widget.mjs`；修改 `db.mjs`、`server.mjs`、`lifecycle.mjs`、`Dockerfile`、`package.json`。

**Interfaces:**
- 导出 `widgetService(db,{now=Date.now}={})`，返回 `route(req,res,url,user,input)`，沿用现有API错误格式。
- `GET /api/widget/state` 返回 `{owner,peer,unreadCount,item,countdown,updatedAt}`；item为null或`{type:'note'|'chat',id,text,created,target}`，仅对方未读；聊天以现有chat_reads为准。
- `POST /api/widget/read` 接收 `{type,id}`，校验收件人。留言设置read_at；聊天仅当前最早未读可推进through_id，过期操作返回409要求刷新，已读操作幂等返回state。
- `GET /api/widget/notes?box=received|sent&before=<id>` 返回 `{items,more}`，每页20条；`POST /api/widget/notes` 接收 `{text}`，服务端从同账本识别另一人，不接受任意收件人ID。
- `PUT /api/widget/settings` 接收 `{reminderId:number|null}`；服务端验证本账号可见提醒，用现有nextOccurrence和shanghaiClock计算下一日期与天数。
- 数据：`widget_notes(id,ledger_id,sender,recipient,text,created,read_at)`；`widget_settings(user_id,reminder_id)`，采用适用的外键和注销清理；查询始终限定当前账本。

- [ ] 写测试：自己卡片不显示自己发送内容，对方收到，已读后历史保留；第三账号/跨账本不可读写。
- [ ] 写测试：聊天图片/语音转摘要、撤回过滤；最早未读推进、不跳读、重复确认及其他设备先读的竞争场景。
- [ ] 写测试：私有提醒、农历、北京时间跨日、删除提醒及账号注销清理。
- [ ] 运行 `node --test test-widget.mjs`，确认未实现接口时失败。
- [ ] 实现服务和数据库增量迁移，接入服务端路由与Docker COPY；只读状态可确认已读但不可发送留言或修改设置。
- [ ] 运行 `node --test test-widget.mjs test-chat.mjs test-settings.mjs`，验证新旧行为兼容。

### Task 2: App内入口与记录

**Files:** 新建 `public/widget.js`；修改 `public/index.html`、`public/style.css`、`public/features.js`（现有提醒界面实现位置实施前核对）、`public/settings.js`、`server.mjs`静态资源白名单。

**Interfaces:** 使用任务1全部API；Android菜单「桌面留言」弹窗提供收到/发出历史和文字发送；系统设置「桌面卡片」提供倒计时选择和原生配置入口。
- 日历提醒列表中「设为桌面倒计时」调用 `PUT /api/widget/settings`，不改变现有提醒创建接口返回值。
- 原生入口使用同源主框架、用户手势下的 `/app/widget-settings` 和 `/app/pin-widget` 路由，由MainActivity截获，其他平台隐藏原生控制。

- [ ] 浏览器测试覆盖空列表、发送、已读状态、翻页、500字限制、返回键/外部关闭、只读与账号切换。
- [ ] 实现弹窗及菜单，不增加底部页签，不把已读历史从数据库删除。
- [ ] 在390/320px与桌面宽度验证，不出现横向溢出；网页/Windows不显示不可用的原生按钮。

### Task 3: Android组件、后台同步与背景配置

**Files:** 新建Java文件（均在 `apps/android/app/src/main/java/xyz/ourdays/mobile/`）：`OurDaysWidget.java`、`WidgetSyncService.java`、`WidgetApi.java`、`WidgetStore.java`、`WidgetSettingsActivity.java`。新建 `apps/android/app/src/main/res/layout/ourdays_widget.xml`、`apps/android/app/src/main/res/xml/ourdays_widget_info.xml` 与必要drawable。修改 `AndroidManifest.xml`、`MainActivity.java`、`app/build.gradle`。

**Interfaces:**
- `WidgetApi.fetchState()` 与 `acknowledge(type,id)` 对固定SERVER_URL发送同源HTTPS请求，使用CookieManager中的当前会话；不携带凭据跨站重定向，设置连接/读取超时。
- `WidgetStore`按owner隔离缓存和组件实例背景；凭据不经JavaScript或PendingIntent传递。
- `OurDaysWidget.render(context,state)`更新全部有效实例；每个实例绑定正确owner。刷新/已读使用不可变显式PendingIntent，并校验当前item及账号。
- `WidgetSyncService.schedule(context)`仅在存在组件时注册一个15分钟联网周期任务；`refreshNow(context)`使用一次性任务，打开App/刷新/已读后触发；删除最后一个组件时停止周期任务。
- `WidgetSettingsActivity`从系统选择图片，压缩到组件所需分辨率保存应用私有目录，支持恢复默认背景；不申请全盘相册权限。2×2下背景配柔和遮罩。
- MainActivity在可信页面加载、前台恢复时同步；跳转组件消息时核对账号，再打开留言或聊天。网页登出/会话失效/换账号的联动必须明确触发清缓存，不能仅等15分钟任务。

- [ ] 添加原生可运行测试：账号隔离、401清缓存、重复调度不多开、读失败保留消息、乱序旧响应不覆盖新账号。
- [ ] 实现组件Provider/布局，updatePeriodMillis=0；Android12+目标2×2，Android8～11保留兼容尺寸。
- [ ] 实现JobScheduler及同源认证；任务和图片处理均不阻塞主线程，后台无常驻通知。
- [ ] 实现配置页与系统图片选择、背景替换及资源清理；避免原图Bitmap直接传入RemoteViews。
- [ ] 实现可信原生入口、账号状态同步和精确深链；核对现有语音、返回键、文件上传、更新安装逻辑不回归。
- [ ] 仅在功能确认后安排原生构建验证；版本号和输出目录遵循Global Constraints，不覆盖不同内容的同名已有包。

### Task 4: 集成验收与交付说明

**Files:** 修改 `docs/ANDROID-WIDGET.md`、`docs/APPS.md`、`README.md`；测试产物保存在忽略的 `local-preview-data/`，客户端构建产物在 `../love-app/`。

- [ ] 运行 `npm test`，验证数据库迁移、旧客户端API兼容与Docker测试文件完整性。
- [ ] 双账号验收：A发留言→A卡片无新增→B刷新收到→B已读→卡片消失→App历史保留。
- [ ] 双账号聊天验收：B逐条确认不跳过更早未读；App读过/撤回/离线恢复后组件正确同步。
- [ ] 设备或模拟器验收2×2、字体放大、纪念日当天、跨日、重启、多组件、后台限制、背景图、删除组件、登出/换账号；未有真机时如实列出未验证项。
- [ ] 交付本地代码和已执行验证，说明服务器和Android包均需更新；不自动上传GitHub或部署服务器。

## 执行记录（2026-11-19）

服务端、网页与Android组件已实现；原生使用系统JobScheduler替代额外依赖，保留15分钟周期和交互立即刷新。128项测试、三宽度双账号浏览器测试、Android资源/Java编译及试用APK签名验证通过。未连接Android设备，原生调度、桌面启动器和选图/账户清缓存未标记为真机通过。用户补充的空白/倒计时→留言、聊天→聊天、留言→留言三类点击跳转已纳入实现和浏览器验证。

## 用户追加调整及执行（2026-11-19，10811）

- 设置从弹窗改为主页面，在右上角菜单直接进入，添加组件及背景管理统一在此。
- 增加按账号保存的custom_day/title，保留旧reminderId接口；同主题日期月历和纪念日卡片列表替代原生select。
- 增加晨光/山野/晚风矢量背景，增加background/background-current原生桥命令；Android返回键先关闭内嵌日期卡片。
- 129项测试、三宽度主页面/模式切换/任意日期/背景命令验证通过；10811 APK已构建并验签，未发布，尚无真机。
