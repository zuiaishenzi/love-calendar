# 朝夕项目交接

## 2026年10月15日后续：Android10809日历首页溢出修复

用户要求基于鸿蒙经验修复安卓版日历首页溢出。原手机布局的日期格有固定最小高度，缺少桌面式视口约束，六行月份易超高。新增AndroidCalendarLayout.java及assets/calendar-layout.js/css：onPageFinished注入脚本，监听WebView原生布局大小和visualViewport变化，以实际可见高度、顶部/底部导航、标题、状态/页脚高度和4/5/6行重新分配日历。只在移动Android原生客户端的已登录日历视图启用根页面高度约束，离开日历、登录页、浏览器和鸿蒙均不受影响；无全局touchmove拦截。初始及视图状态同步测量，不依赖空闲WebView可能延迟的首个动画帧。

沿用已真机确认的CSP经验：CSS通过精确同源GET非主框架资源 `/__ourdays_android__/calendar-layout.css` 由shouldInterceptRequest返回内置资源，使用link stylesheet加载，实际sheet存在后才启用布局。没有内联style、没有修改服务器CSP、无需部署网站即可安装验证，未开启WebView诊断接口。原生WebView关闭越界回弹，保留内容滚动和录音等逻辑。

最终包 `E:\codex\love-app\OurDays-1.8.0-Android-build10809.apk`，34972字节，SHA256 `36ed8283a4ffcc7eafbd218d1283d6cb70f13d88ba301ae5f81d7278d081e7ed`。离线Gradle真实构建及apksigner验证通过，应用ID xyz.ourdays.mobile，显示版本1.8.0，versionCode10809；证书SHA256 `12ab8d1cb1c8142e1035924f5a9f709f06d1e004662e81c653ace86b52f86b42` 与10808一致。解包确认JS/CSS与测试源码逐字一致。旧包保留，输出在love-app/android-build10809；固定debug签名沿用local-preview-data/android-tools/user/debug.keystore，私有签名初始化脚本留在love-app（未提交密钥或密码）。完整90项Node测试通过。

新增scripts/check-android-calendar.cjs，用server.mjs真实CSP和本地WebView资源拦截模拟，验证五种尺寸×顶部/底部导航×4/5/6行共30场景，字体放大25%、原生高度缩小、切换备忘录正常滚动、返回日历清除外层偏移和登录隐藏均通过。新增test-android-calendar.mjs覆盖首次测量无需动画帧、等待样式实际加载、视图隔离。测试需要Playwright时使用OURDAYS_PLAYWRIGHT_MODULE（同鸿蒙检查脚本）。当前adb devices为空，未做Android真机安装/验证，不能将浏览器验证当作安卓真机验证。未提交、推送、更新发布清单或部署；用户可安装10809测试，不需先更新网站。鸿蒙仍10813，Windows仍10804。

## 2026年10月15日最新：10813真机定位CSP根因、修复并已安装

此前“浏览器通过、真机仍大片空白”的根因现已确认：server.mjs的生产CSP为style-src 'self'，禁止JS添加的内联style。真机10810/10811的适配style标签存在但CSS未应用，html/body仍overflow:visible、app仍display:block；自绘滚动条覆盖层缺少position:fixed后变成普通内容，页面高度从可见740px撑到1452px。此前本地Playwright模拟网页没有生产CSP响应头，因此未覆盖此问题。旧记录中的各种“布局通过”不代表之前的实际样式生效。

用户明确授权“允许临时诊断并覆盖安装”，在已连接手机上同签名安装10811/10812诊断包，临时开启本应用WebView调试，只采集几何、样式状态和滚动位置，不读取账号、聊天、回忆文字或会话。USB中途断开后用户确认重连并继续。已将HARMONY_APPEARANCE改由原生onInterceptRequest提供指定同源GET子资源 `/__ourdays_harmony__/appearance.css?build=10813`，bootstrap用link stylesheet加载，CSP保留原策略且无需网站部署。请求只匹配配置站点、精确路径、GET和非主框架，其他请求返回null透传；SDK回调声明遗漏null，使用类型断言表达官方透传约定。源码及最终包显式setWebDebuggingAccess(false)。

真机修复验证：stylesheet实际应用13条顶级规则，html/body/app高度和scrollHeight均740px，overflow:hidden且app为flex；导航约46.86px，六行日历42格底部669px、小于导航top693px；三次上滑后root/app scrollTop仍0，日历仍可见。备忘录和回忆录从顶部实际触摸后scrollTop从0变242，滚到底及继续上滑后根页面仍740px，固定覆盖层滑块仍可见；个人设置底部亦正常。只采集布局指标，测试后恢复原月份和日历视图。私有QA数据为love-app/harmony-build/live-layout-10811.json（修复前）、live-layout-10812.json、live-verified-10812.json（修复验证）。

最终包 `E:\codex\love-app\OurDays-1.8.0-Harmony-build10813.hap`，162991字节，SHA256 `f5b61a42762625c02f51b25f9b78e9290b598c0fc9aa1e9c62f444180cf95742`。真实构建、华为验签通过，沿用当前签名；已同签名覆盖安装并启动10813，bm确认版本正确，数据保留。确认最终进程无本应用WebView调试socket，9234/9235诊断转发已清理。10811、10812只供临时诊断，不作为日常版本；全部旧包保留，显示版本仍1.8.0。准备工程已同步最终关闭调试源码。未提交、推送或部署。

14项鸿蒙Node测试通过，新增同源CSS拦截的源/路径/方法/主框架约束测试。新增仓库脚本 `scripts/check-harmony-csp.cjs` 从server.mjs读取真实CSP：复现内联CSS被style-src-elem拒绝和页面溢出，验证同源CSS无策略违规、布局740px和固定滑块层。脚本可选使用Playwright，通过OURDAYS_PLAYWRIGHT_MODULE指定模块路径；默认require('playwright')，Windows使用Edge。此后样式回归必须带真实CSP并检查link.sheet/cssRules及computed style，不能只检查标签或伪元素字符串。

## 2026年10月15日后续：10810截图反馈后的布局重整及注入兜底

用户截图显示日历内容已向上滚走、页脚下有大片空白，另一张六行日历被固定导航遮挡。不能把先前Edge通过当成真机修复。代码发现仅document-start注入适配，onPageEnd只执行Android兼容个性设置；若前者未生效，鸿蒙专用布局不会在加载完成补齐。现onPageEnd重新执行HARMONY_BOOTSTRAP，并增加10810标记及refresh接口防止重复注册，样式丢失可恢复；保留document-start能力。注入缺失是真机问题的待验证解释，尚无手机日志证明。

核心CSS重写为html.harmony-shell、data-harmony-logged-in与data-harmony-view显式状态，不再依赖:has控制核心高度。移动登录后外层和app禁止滚动，备忘录/回忆录/聊天独立内容区可滚动，顶部/底部导航日历均按实测可用高度容纳月份；清除旧网页遗留的外层及app滚动偏移。底部导航由53px再减为约47px，按钮保留44px高度、图文继续少量下移，日期区增加空间。系统设置新增“鸿蒙客户端 v1.8.0 · 构建 10810”便于核对实际版本。

在Edge确实复现并修复一个页面切换后滑块消失的问题：内容区因data-harmony-view变更才成为滚动容器，但自绘滑块未监听该属性，扫描过早后未再发现；现监听视图状态并在未知容器首次scroll时重新扫描。

最终包 `E:\codex\love-app\OurDays-1.8.0-Harmony-build10810.hap`，156446字节，SHA256 `ad9dcfc3f947902e7a8c1b2ede439d552ec780e86a601d64050b9f42b11491b7`。真实构建、验签通过，与10809当前签名一致，显示版本仍1.8.0，旧包保留。13项鸿蒙测试通过，含新增重复注入/样式恢复测试。injection-check-10810.cjs验证真实addInitScript文档开始+加载后重复、跳过开始仅加载后、丢失CSS/类恢复和清除旧scrollY，均通过；五种尺寸布局/六行月份、三种尺寸的12个底部连续上滑场景、12个触摸滚动场景及横纵/弹窗滑块拖动通过。脚本与截图在love-app/harmony-build。准备工程已同步，未安装真机、提交、推送、部署，需用户安装并核对系统设置构建号确认鸿蒙效果。

## 2026年10月15日后续：10809恢复备忘录/回忆录触摸滑动、下移导航

用户反馈10808备忘录和回忆录无法滑动，并要求底部导航下移一些以显示完整日历。已删除10808新增的全局touchstart/touchmove边界拦截，避免方向/边界误判中断原生滚动；两个长内容区域显式overflow-y:auto、touch-action:pan-y pinch-zoom，保留原生OverScrollMode.NEVER、CSS overscroll-behavior:none和独立滑块覆盖层。底部导航上下padding由5px减至2px、按钮最小高度由54px减至48px，导航总占位在测试中减少12px，图文中心约下移6px；日历继续按实测导航高度分配六行空间。Android兼容标记仍10808，未更改Android版本。

最终包 `E:\codex\love-app\OurDays-1.8.0-Harmony-build10809.hap`，163260字节，SHA256 `c740c0ed0020a9cd2262ec4da3bde780aceab2e14ceaf5894cf694a02a4ac641`，真实构建、验签通过，与10808当前签名一致，显示1.8.0不变，旧包保留。12项鸿蒙测试通过（删除随旧拦截一起失效的边界拦截测试）。新增touch-scroll-check-10809.cjs通过CDP真实触摸检查三种尺寸×顶部/底部导航×备忘录/回忆录共12场景，上滑、下滑及斜向滑动均产生预期scrollTop变化；此前仅设置scrollTop/在底部继续滑不足以证明正常触摸可用。五种尺寸布局、六行日历和12个底部连续上滑场景复查通过。准备工程已同步，未代为真机安装、提交、推送或部署，仍需用户安装确认鸿蒙效果。

## 2026年10月15日后续：10808处理底部白区和滑块消失

用户反馈日历、备忘录、回忆录、个人设置滑到底出现白色区域且滚动条消失。新增独立的fixed覆盖层（contain:strict、overflow:hidden），滑块改为层内absolute定位，按覆盖层实际原点换算坐标，防止装饰元素影响滚动范围；关闭登录后移动端html/body外层滚动，内容区保留独立滚动。全局CSS overscroll-behavior:none，原生Web显式OverScrollMode.NEVER并设置同色背景；触摸边界保护仅在所有可滚动祖先均不能接收移动时preventDefault，正常滚动、嵌套容器、双指及音视频/滑块交互保留。覆盖层在无滑块时清理。

最终包 `E:\codex\love-app\OurDays-1.8.0-Harmony-build10808.hap`，161984字节，SHA256 `7b93bf6e364561eb21cf7a2a28db93d998e15addc871a8d8d5d46bd7479f0f2a`，真实构建及华为验签通过，与10807当前签名一致，显示1.8.0不变，旧包保留。13项鸿蒙测试通过，含新增边界手势测试。五种尺寸布局复查、横纵/弹窗拖动与清理通过；bottom-check-10808.cjs在360×640、393×736、430×932对日历/备忘录/回忆录/真实个人设置dialog（加载dialog-history滚动锁）连续模拟底部wheel和CDP触摸上滑，检查外层scrollY=0、页面高度不增长、末端滑块仍可见，12个场景通过。

注意：相同Edge底部测试对旧10807脚本也通过，未在桌面浏览器重现真实鸿蒙白区，以上是针对外层滚动/回弹和覆盖层尺寸问题的修复，不可称已确认真机根因或已真机修复。用户需安装10808确认。准备工程已同步，未连接安装、提交、推送或部署。QA脚本/截图在love-app/harmony-build，最新个人设置底部截图bottom-profile-10808-393.png。

## 2026年10月15日后续：10807替换鸿蒙灰色系统滚动条

用户截图仍见灰色滚动条，授权继续修改。SDK的Web.verticalScrollBarAccess/horizontalScrollBarAccess文档明确控制系统和CSS滚动条绘制，不能据此前Edge伪元素计算样式就认定真机生效。Index现关闭两种原生绘制，PageBootstrap新增HARMONY_SCROLLBARS，以实际DOM轨道/滑块统一绘制暖粉渐变滚动条；初始化后隐藏默认滚动条及其占位。覆盖根页面、聊天、备忘录、回忆录、弹窗、textarea、任意可滚动元素及横向滚动；支持滑块拖动、随内容/视口变化重算及移除后的清理，弹窗轨道放入对应dialog以显示在顶层。保留10806日历高度修复。仅鸿蒙生效，无须先部署网页。

最终包 `E:\codex\love-app\OurDays-1.8.0-Harmony-build10807.hap`，156898字节，SHA256 `f521878054d31f9887c8db24a3ab30231dc3daa31eb417f0a4a55895f0628fe9`。真实构建、华为验签通过，沿用10806当前签名；显示版本1.8.0，旧包全部保留。12项鸿蒙测试通过。Edge使用完整启动脚本、拦截网络返回本地页面，在五种尺寸下复查日历/长内容布局；另外实际拖动纵向/横向/弹窗滑块、textarea新增内容、关闭弹窗及删除/缩短内容清理均通过。脚本在love-app/harmony-build/layout-check-10807.cjs与scrollbar-check-10807.cjs，截图layout-memos-10807.png和scrollbars-dialog-10807.png可见粉色滑块。尚未真机安装验证，未提交、推送或部署；需用户安装10807确认原灰条问题。

## 2026年10月15日后续：全局温馨滚动条、再次修复六行日历溢出

用户反馈10805仍溢出，且要求所有滚动区域统一温馨样式。当前最终测试包为 `E:\codex\love-app\OurDays-1.8.0-Harmony-build10806.hap`（148162字节，SHA256 `62c6e641910ea66f44ca0be9c35525f06dcbdac03af2589982a3bbca3dd71ec8`），真实构建及verify-app通过，沿用用户确认的当前新签名，与10805签名一致；旧包全部保留。

PageBootstrap将滚动条改为鸿蒙页面全局规则，包含根页面、全部元素、弹窗、textarea和横向滚动条，暖米色轨道、柔粉渐变6px圆角滑块；覆盖旧网页各区域独立样式。日历不再仅靠100dvh和固定68px占位：Index通过onAreaChange/pageEnd传入原生Web组件实际宽高；页面结合visualViewport、实际导航/标题/注释/页脚高度及日期格数量，重算4/5/6行高度。删除旧版560px最低高度限制，矮窗口压缩装饰区；登录隐藏和其他页面滚动保持有效。修复随原生启动脚本交付，无需先部署服务器网页。

12项鸿蒙回归测试通过，含新增实际高度/行数重算测试。Edge检查五种尺寸（360×540、360×640、393×736、412×825、430×932），包含4/5/6行月份切换、部分界面字体放大25%、原生视口比网页少40px、备忘录/回忆录内滚动、全局及弹窗/聊天/输入框滑块样式和登录隐藏，均通过。检查脚本和截图在love-app/harmony-build/layout-check-10806.cjs及layout-*-10806*.png。尚未真机测试，未安装、推送或部署；请用户安装10806验证原反馈。

## 2026年10月15日最新：鸿蒙布局、滚动条及再次申请麦克风权限

已生成最终测试包 `E:\codex\love-app\OurDays-1.8.0-Harmony-build10805.hap`（141984字节，SHA256 `05117488a2035f6117db2295b125f887d6d9aa2dc2ffe77c1729a7094168095e`）。显示版本仍1.8.0；ArkTS构建及华为verify-app均成功，清单含MICROPHONE权限。10804为本轮中间包，旧包全部保留，不覆盖。

通过原生文档启动样式修复底部导航日历轻微超出一屏；备忘录、回忆录改为内容区滚动，并统一细圆角淡玫瑰色滚动条。样式仅作用于鸿蒙且尊重登录隐藏状态，可先安装测试，无须先部署网页。Edge实际页面在360×640、393×736、412×825、430×932下的日历/备忘录/回忆录共12个布局场景通过，同时检查退出登录后app仍隐藏。完整84项Node测试通过，最终布局保护与10805版本调整后11项鸿蒙测试再次通过。

原生录音和本站ArkWeb麦克风请求均先向系统申请权限；曾拒绝且系统不再弹首次授权窗时，调用系统设置授权面板再次征求同意，仅同意后启用。刚刚拒绝时不连续弹第二次，取消录音后不再打开麦克风。真机权限交互仍待用户自行安装验证，未连接安装、推送、发布或部署。

签名注意：本机10月15日重新生成的应用证书不同于10803。用户确认没有旧签名备份，并明确选择继续使用当前签名；10805沿用该当前签名并验签成功。若手机上仍是旧证书签名应用，覆盖安装可能因签名不一致失败，需用户自行处理重新安装；不可再声称与10803同证书。

## 2026年10月14日后续：新增鸿蒙客户端源码

2026年10月15日最新：用户反馈按住说话拖动后停止、变成URL。已将网页原生录音链接改为普通按钮并显式发送命令，阻止dragstart；鸿蒙PageBootstrap为旧服务器网页去掉录音链接href，并保留未被按住手势阻止的旧式点击命令。完整83项测试通过，已构建并验签 `E:\codex\love-app\OurDays-1.8.0-Harmony-build10803.hap`（131886字节，SHA256 `097d74460006e686a1b32a8cade05b9d7e23a1ba27888d71ed3ab6bd8f63607a`），原证书一致，旧包保留。手机USB调试Unauthorized，用户明确“我稍后自行安装测试”，未安装及真机验证。未推送、发布或部署。10803内含旧网页兼容保护，可先覆盖安装验证拖动，无需先部署网页；网页源码中的普通按钮修复仍待用户部署。

当前最新包是 `OurDays-1.8.0-Harmony-build10802.hap`（位于E:\codex\love-app），133214字节，SHA256 `6a29422302e12247a0c8e102079d2dbba7e580144a0c0548160d0a251ce639e0`。用户要求导航栏位置个性设置、隐藏客户端下载、暂不设置鸿蒙更新，反馈旧包“麦克风访问被拒绝”且手机未连接。已移除鸿蒙自动更新和入口，通过原生文档启动适配兼容旧服务器页面；ArkWeb仅本站前台在系统授权后允许麦克风，不再无条件deny；原生录音授权弹窗临时后台不取消。旧包保留，显示1.8.0不变，10802原生构建/签名验证通过、证书与10801一致、聊天及鸿蒙48项测试通过。仍需用户安装10802真机验证麦克风；本轮未连接手机、未推送或部署。

签名进展（00:33）：用户完成签名后，已补齐准备工程default产品与default签名的关联，实际 `SignHap` 和 `assembleHap` 成功。生成 `E:\codex\love-app\OurDays-1.8.0-Harmony-build10801.hap`，134009字节，SHA256 `8cdfba452a66183b457a214379cad0f60b39a29b33c83008f7cd96069e4c148a`。华为签名工具verify-app返回0；Profile为debug、包名匹配、绑定1台设备。旧unsigned包保留。未连接手机（HDC Empty），尚未真机安装及验证。用户希望先试用再反馈修正；下一步连接签名绑定手机，通过DevEco Run或HDC安装此包。构建脚本已增加单签名时自动关联产品，并在签名配置缺失时提前报错；私有签名值仅留在love-app准备工程。下面无签名/无产物的描述为历史状态。

最新进展：用户安装DevEco并提供路径 `D:\Program Files\Huawei\DevEco Studio\bin\devecostudio64.exe` 后，已用该IDE自带API26 SDK实际编译成功。修复 `PhotoViewPicker` 构造函数不接收context、TLS回调使用 `handleCancel()`。产物 `E:\codex\love-app\OurDays-1.8.0-Harmony-build10801-unsigned.hap`，95398字节；准备工程 `E:\codex\love-app\harmony-build\20261014-000904-c4fad37d`。还未配置签名、无连接设备，HDC返回 `[Empty]`；已询问用户签名与设备连接状态。下一步在该准备工程配置Signing Configs并签名构建。构建工具首次初始化需要标准 `.ohpm`/`.hvigor` 缓存写权限，自动审批已允许。下面关于“未安装工具、未编译”的描述是之前状态，以本段为准。

用户授权按“鸿蒙原生壳＋现有网页”构建，要求功能与 Android 一致，目标手机系统为鸿蒙7.0.0，手机型号未提供。已新增 `apps/harmony`（ArkTS/ArkWeb）、`scripts/build-harmony.ps1` 和 `docs/HARMONY.md`，网页识别 `OurDaysHarmony/`，服务端与同步工具支持可选 `harmony.json`。显示版本仍1.8.0，独立鸿蒙构建号10801，Android/Windows原版本不变。

当前只完成源码、准备工程和 Node 测试，尚无 DevEco/SDK 编译及签名HAP。用户说稍后安装 DevEco；本轮尝试构建时常见安装目录与命令搜索均未发现可用工具，构建脚本明确报 `DevEco Studio not found`。用户询问是否必须连接手机：源码和未签名编译/模拟器不需要，设备调试签名须取得每台设备UDID，首次USB连接最方便，不必一直连接。已创建约20分钟后的单次提醒，确认开发环境安装情况。

源码准备/编译仅在 `../love-app/harmony-build/<唯一目录>` 进行，安装包继续放 `../love-app`。下一步确认 DevEco 安装路径、SDK和签名，再原生编译、解决实际编译诊断、真机验证录音/选图/返回/下载。当前更新流程能检查及下载校验HAP，覆盖安装依鸿蒙平台规则使用DevEco/HDC，未实现Android式下载安装器；不可宣称全部真机功能一致。服务器还需部署本轮网页适配才识别新端。本轮未提交、推送、部署或生成发布清单，原服务器包同步网络问题未解决。

交接日期：2026年10月13日。项目是供两个人私下使用的恋爱日历，包含回忆、聊天、备忘录和 Windows、Android 客户端。当前重点是排查服务器从 GitHub 私库同步安装包时的 `fetch failed`，而不是继续添加新功能。

新对话先阅读本文件及根目录 `AGENTS.md`，再核对 Git 状态。用户当前自行上传 GitHub；没有新的明确指令时，不代替用户提交、推送、发布或部署。

## 下一个对话从这里继续

用户最近在服务器执行：

```text
root@asuna:/home/project# sudo bash /opt/love-calendar/bin/update.sh --retry
remote: Total 0 (delta 0), reused 0 (delta 0), pack-reused 0 (from 0)
fetch failed
APK sync failed; website and previously published APK remain available.
```

源码拉取没有显示 Git 致命错误，失败发生在安装包同步阶段。新版下载器使用 Node.js fetch 访问 GitHub API；`fetch failed` 本身不足以区分 DNS、超时、TLS、代理或网络故障，也不能直接判定 Token 无效。新版在读取仓库信息和分支提交之后才打印“正在检查 Android / Windows 最新安装包清单…”，所以没有这条日志也可能已运行新版。

上一轮已给用户以下诊断命令，尚未收到输出：

```bash
curl -I --connect-timeout 10 https://api.github.com

sudo docker exec love-calendar-calendar-1 node -e 'fetch("https://api.github.com",{signal:AbortSignal.timeout(15000)}).then(r=>console.log("HTTP",r.status)).catch(e=>{console.log(e.message);console.log(e.cause?.code);for(const x of e.cause?.errors||[])console.log(x.code,x.address)})'
```

先比较宿主机与运行中的容器是否能访问 GitHub API。同步任务实际用 `docker run` 启动临时容器，网站容器的结果是初步线索；若二者表现不同，再核对同步镜像和 Docker 网络。测试命令无需 Token，不应让用户粘贴密钥。排查时只输出错误类型、状态码和必要网络信息，不打印 Authorization、凭据或签发下载地址。

网络恢复后只重试安装包即可：

```bash
sudo bash /opt/love-calendar/bin/sync-app-updates.sh
```

当前没有可用的服务器 SSH 会话或已确认连接配置；之前操作均是用户在服务器运行命令。不能声称服务器问题已经修复。

## 本地源码与版本

| 项目 | 当前核对结果 |
| --- | --- |
| 工作目录 | `E:\codex\love` |
| 本机环境 | Windows，PowerShell |
| Git 分支 | `main` |
| 交接前 HEAD | `22f80417299928b3675813990a33ca086151c6f7` |
| HEAD 标题 | `Update website and app release` |
| 交接前工作区 | 干净；本次只新增此交接文件 |
| 网页与客户端显示版本 | `1.8.0` |
| Android 构建号 | `10808` |
| Windows 构建号 | `10804` |
| 后端运行时 | Node.js 24 或以上，ES modules |
| 验证 | 交接时重新执行 `npm test`，72 项通过，0 项失败 |

服务器是否已经运行此 HEAD，应读取服务器 `/opt/love-calendar/current`，不能只用本地 HEAD 推断。

版本遵循 `x.m.y`：小修复通常递增 y，较大更新递增 m 并归零 y，m 到9之后再进入下一个大版本。日常调整合并到当前版本，用户明确发布或要求更新版本时才递增显示版本。Android 原生覆盖升级可只递增 versionCode。已有安装包保留原版本，只有重新构建才产生新包。

## 仓库与构建产物

公开源码仓库：[zuiaishenzi/love-calendar](https://github.com/zuiaishenzi/love-calendar)。独立私有安装包仓库：[zuiaishenzi/love-app](https://github.com/zuiaishenzi/love-app)。用户只希望私下使用，不上架应用商店；iOS 开发已取消，不要恢复 iOS 下载入口或构建流程。

客户端源码保留在本仓库，安装包与构建产物统一在 `E:\codex\love-app`。Windows electron-builder 输出目录为 `../../../love-app`，Android 构建产物为 `love-app/android-build`。不要在 `love` 内存安装包副本，不要上传到公开仓库的 Git、Release 或 Artifact。仓库外操作遵循工具权限要求，保留已有包，相同名称不同内容不能直接覆盖。

| 客户端 | 本地安装包 | 字节数 |
| --- | --- | --- |
| Android | `E:\codex\love-app\OurDays-1.8.0-Android-build10808.apk` | 29184 |
| Windows | `E:\codex\love-app\OurDays-1.8.0-Windows-build10804-x64.exe` | 111287782 |

本地私有发布仓库目录为 `E:\codex\love-app\server-release`。交接时核对清单：

| 清单 | 构建号 | 发布文件名 | SHA256 |
| --- | --- | --- | --- |
| `latest.json` | 10808 | `OurDays-1.8.0-10808-338e3c426971.apk` | `338e3c42697167a5e14e58c11c2749f853708e9a0250dfeefe88191e65176b9c` |
| `windows.json` | 10804 | `OurDays-1.8.0-10804-dab7686d8d71.exe` | `dab7686d8d71747769fe3307960ac6b81e4a17612d7cec55a363fb4c7eff456f` |

Windows 私库文件拆成 `.part001` 与 `.part002`，长度分别为94371840和16915942字节。服务器重组并验证整包，客户端最终下载完整 EXE。私库曾因 `.gitignore` 只允许 APK 而没有提交 Windows 清单及分片；上传脚本现已补充双端允许规则，此前修复已发布到私库。仍需区分本地清单、GitHub 当前清单、服务器已发布清单。

Android 和 Windows 都加载服务器网页。网页、CSS、后端修改通常部署服务器即可；原生录音、文件选择、客户端更新器、服务器地址、原生返回键等改变，需要重新构建并安装客户端。Android 继续使用固定签名，不能换成另一台机器随机生成的调试签名。

## 服务器目录与部署

| 用途 | 地址或路径 |
| --- | --- |
| 网站 | `https://love.11215739.xyz:11961/` |
| 服务器主机名 | `asuna` |
| 部署根目录 | `/opt/love-calendar` |
| 网站容器 | `love-calendar-calendar-1` |
| 镜像标签 | `love-calendar:<源码提交SHA>` |
| 当前部署提交 | `/opt/love-calendar/current` |
| 生产 Compose | `/opt/love-calendar/compose.yaml` |
| 更新脚本 | `/opt/love-calendar/bin/update.sh` |
| 包同步脚本 | `/opt/love-calendar/bin/sync-app-updates.sh` |
| 环境配置 | `/opt/love-calendar/shared/.env` |
| 持久数据 | `/opt/love-calendar/shared/data`，容器挂载到 `/app/data` |
| 公开下载包及清单 | `/opt/love-calendar/shared/data/app-updates` |
| 包断点缓存 | `/opt/love-calendar/shared/app-download-cache` |
| 私库 Token 文件 | `/opt/love-calendar/shared/app-repository-token` |
| 私库地址配置 | `/opt/love-calendar/app-repository` |
| 私库分支配置 | `/opt/love-calendar/app-branch`，未配置默认 main |
| 更新前备份 | `/opt/love-calendar/backups` |
| 网站构建源码 | `/opt/love-calendar/releases` |
| 公开源码 Git 缓存 | `/opt/love-calendar/source.git` |
| 旧安装包 Git 缓存 | `/opt/love-calendar/app-source.git`，新版不再使用，不自动删除 |

常用服务器更新命令：

```bash
sudo bash /opt/love-calendar/bin/update.sh --retry
```

同一命令先更新源码，再检查 Android 与 Windows 包。无源码更新时也检查包；无包版本变化时不下载安装包。包同步失败不回滚已正常更新的网站，已发布包和断点缓存保留。

网站部署先构建测试镜像，通过测试后构建生产镜像；停服后备份数据，切换容器并等待健康检查。失败会尝试恢复旧镜像和完整数据，失败数据另行保留。不要删除数据库、`.database-key`、环境配置或备份来排查下载故障。数据库使用加密 SQLite；迁移和回滚必须同时保留数据与密钥。

仓库中的生产 Compose 默认绑定 `127.0.0.1:3000`；用户曾提供的实际容器端口是 `0.0.0.0:3000`。服务器有 Docker 形式的 Nginx Proxy Manager 中文版，不应把宿主机 `nginx -T` 无结果理解为没有反向代理，也不要用仓库 Compose 覆盖其现有端口设置。

## 按清单同步安装包的实现

主要文件：

| 文件 | 职责 |
| --- | --- |
| `deploy/update.sh` | 更新公开源码、测试与部署，原子刷新两个服务器脚本，触发包同步 |
| `deploy/sync-app-updates.sh` | root 入口、文件锁、权限检查，通过 Docker stdin 把 Token 交给下载器 |
| `scripts/sync-app-release.mjs` | 私库校验、锁定提交、读清单、按需下载、断点续传、发布 |
| `scripts/app-release-manifest.mjs` | 双端应用 ID、构建号、文件名、大小、SHA256 和 Windows 分片校验 |
| `scripts/import-app-release.mjs` | 校验并导入单端或双端清单，重组 Windows 分片 |
| `scripts/publish-app.mjs` | 生成及原子发布清单，拒绝回退或同构建不同内容 |
| `test-app-sync.mjs` | 6 项同步测试，纳入根目录测试与 Docker 测试镜像 |
| `docs/APP-SYNC.md` | 新版同步机制、首次替换脚本和缓存说明 |

新版依次检查私库属性、分支 SHA，并从同一 SHA 读取 `latest.json` 和 `windows.json`，避免分支更新导致文件混搭。版本不变且已有文件长度符合清单时跳过下载；同构建号不同哈希拒绝替换，当前已发布文件缺失或长度不符会报错。

只下载清单指向的当前 APK、EXE 或分片，不拉 Git 包仓库历史。缓存以 SHA256 命名为 `.partial` 和 `.complete`，跨次重试复用，完成后校验长度及 SHA256。Windows 合并后再次验证整包。

每个文件最多尝试3次，下载连续60秒无数据才中止，不因总时长过长中止。优先使用 GitHub Contents API 签发的下载地址，HTTP Range 续传；服务器忽略 Range 返回200时从头写入，不能拼接到断点之后；206 的起点与总长度必须正确。尚未收到数据的最后一次尝试可回退 API 原始响应。API 原始响应曾实测不支持 Range，不能声称所有下载线路均可续传。

Token 只发给 `api.github.com`，允许 HTTPS GitHub API 与 githubusercontent 下载域名，下载 CDN 不携带 API Authorization；不把 Token 放到命令行、环境变量、日志或复制的凭据文件。服务器配置 Fine-grained Token，只选 love-app 仓库，Repository permissions 中 Contents 为 Read-only。截图曾只显示 Account permissions，需要先正确选择仓库访问范围。Token 文件 root 所有，权限400或600。新版 API 流程仅有 SSH 部署密钥不够。

早期服务器报过 HTTP/2 stream CANCEL、early EOF，并继续出现 `Unpacking objects`；那是旧包同步脚本还在拉 Git 仓库。新版正常不应出现安装包 Git unpacking。首次切换服务器旧 update.sh 的方法见 `docs/APP-SYNC.md`；容器镜像中也包含 `/app/scripts/update.sh` 和 `/app/scripts/sync-app-updates.sh`。确认最新源码和镜像后再替换，不要反复把网络故障当成脚本未升级。

## 最近手动搬包与 FileZilla 问题

用户询问把 NAS 上的 EXE 移到服务器发布目录，已给命令：

```bash
sudo mv -n -- /volume1/Ourday-apk/OurDays-1.8.0-Windows-build10804-x64.exe /opt/love-calendar/shared/data/app-updates/
```

尚未确认用户是否执行。`-n` 不覆盖同名文件。这个 EXE 的手动文件名与 `windows.json` 指向的哈希文件名不同；只搬文件不会自动生成清单，也不会让当前下载接口采用它。需要手动发布时，先核对大小和 SHA256，再通过发布工具处理，不能随意改版本或覆盖已有包。

FileZilla 打开 `/opt/love-calendar/shared/data/app-updates` 曾报：

```text
Received SSH_FXP_STATUS packet with unknown status code 4294967294
读取目录列表失败
```

安装器设置 shared/data 为1000:1000、700；新版设置 app-updates 为1000:1000、750。普通 SFTP 账户可能没有父目录穿越权限，但此非标准状态码不能独立确认原因。若 FileZilla 以 root 登录，不能简单归因于普通用户权限。上一轮已让用户用同一 SFTP 账户执行以下命令，尚无输出：

```bash
whoami
id
sudo namei -l /opt/love-calendar/shared/data/app-updates
sudo ls -lh /opt/love-calendar/shared/data/app-updates/
```

不要递归 chmod777 或放开整个 shared/data；其中包含双方私人记录和数据库密钥。若确定需要普通用户访问，仅授予必要父目录穿越及包目录读取权限。

## 已确定的产品行为

日历、聊天、备忘录、回忆录是四个主页面。桌面宽屏采用左侧固定导航，中间日历、右侧故事栏；整月展示。移动 App 支持在系统设置中选择顶部或底部导航，网页和 Windows 不显示个性设置；暖心句子和介绍只在日历。已取消左右滑动切换页签，保留日历区域左右滑动切换月份。节假日休班标记和回忆红点应避免重叠。

聊天显示双方头像、对方消息昵称，自己消息不显示自己昵称。时间只在首条、间隔5分钟或北京时间跨天时居中展示。聊天入口数字徽标表示未读，超过99折叠；打开聊天并显示新消息后更新已读位置，防止并发消息被误清。

聊天保留文字、图片、语音消息，实时语音通话已取消。语音气泡单击播放、显示秒数，右键或长按可下载。电脑右键、手机长按消息提供整条复制、多选、撤回等；多选时点击消息行即可。移动端不开放正文文字选择。消息发送中在对应临时气泡旁显示加载动画，成功消失。撤回在聊天记录中体现，取消底部“已撤回”等状态提示，避免改变录音按钮位置。

移动 App 使用原生录音，按住说话，松开发送；滑到取消区域丢弃，滑到转文字区域识别后填入输入框供编辑，不自动发送文字。麦克风曾多次修复，主要涉及 WebView 授权与卓易通兼容；最新源码和包已经改用原生 MediaRecorder。首次授权、切后台、手势取消和占用问题仍需真机确认。取消系统选图保持聊天，不回到日历。

腾讯云语音识别作用于已发送或收到的语音，文字显示在对应语音下；支持重试与任务复用。短音频用 SentenceRecognition，长任务用 CreateRecTask 和 DescribeTaskStatus。服务器变量为 `TENCENT_ASR_SECRET_ID`、`TENCENT_ASR_SECRET_KEY`，可选 `TENCENT_ASR_TOKEN`、`TENCENT_ASR_REGION`、`TENCENT_ASR_ENGINE`。权限需覆盖三个接口。长期密钥通常不配置临时 Token，修改环境配置后要重建容器才能加载。

回忆支持图片、视频和音频。同日多个回忆在回忆录共享日期标题，仍保留独立回忆。每条回忆双方各最多5条继续回应；格式沿用原视角风格。提示“同一段回忆，也期待另一种视角。”在对方写视角或回应后消失，回忆录始终隐藏该提示。导出“岁月拾忆”是自包含 HTML，含封面、年份目录、同日分组、双方视角、回应、附件和保存聊天；旧导出需重新生成才有新版样式。

备忘录按账号隔离，对方不可见。打开先查看条目，通过按钮新增。AI 提取含义、拆条目、归类，不照搬整段；保留否定、条件、时间与事实，不从一次经历推断长期习惯。AI 分类可以用于新记录，也可选待整理；用户自定义分类不发 AI、不被改写。支持拖动分类顺序和编辑模式把要点拖至其他分类。AI 冷却30秒，仅发送待整理文字，无待整理不调用；最多4张备忘图片、新图总量20MB，图片不发 AI。原文与管理、新增、AI 整理并排；原文按日记展示，以日期为标题，无日期按当天，移除额外重复日期和分类标签。桌面分类卡片避免等高大空白，手机布局保留。

AI 服务器配置为 `LLM_API_KEY`、`LLM_MODEL`、`LLM_BASE_URL`，使用兼容 chat/completions 的接口，密钥仅在服务器。

App 系统通知功能已按用户要求删除，不再申请通知权限或后台轮询；旧后端通知接口和相关测试还在，不代表客户端仍有系统通知。保留应用内聊天未读与检查更新。客户端下载入口只在网页版系统设置显示，Android/Windows 系统设置隐藏；显示大小、版本与可用状态。

## 界面修复的关键约束

图片查看器支持按钮缩放、双指缩放、双击及拖动，关闭后重置。之前左上缩放、右上关闭失效，以及页面底部出现黑色空查看器，分别涉及脚本静态路由和关闭状态 display；现有 `public/photo-viewer.js` 已注册静态路由，CSS 明确未打开时不显示。以后新增 public 文件要同步 `server.mjs` 静态路由白名单。

打开图片后返回应先关闭图片，再关闭底层回忆。`public/dialog-history.js` 维护弹窗历史、打开顺序和背景滚动锁定，兼容旧 Android 原生代码查找首个打开的 dialog。设置弹窗打开时不允许回忆录在后面滚动，全部关闭后恢复位置；不要破坏嵌套弹窗顺序。

弹窗和右侧故事栏用圆角裁剪、透明滚动条轨道和内缩轨道，避免滚动条盖住边框。聊天历史对话框已居中，并美化日期、消息类型、搜索和结果列表；日期选择器与 select 展开仍使用系统原生控件，没有自行制作完整日期弹层。

用户强调外观细节、紧凑布局、移动端与网页区别，以及可以回退不满意的设计。不要重启此前已经否决的布局、通知、页签滑动或 iOS 方案。

## 代码与文档入口

| 文件或目录 | 主要用途 |
| --- | --- |
| `server.mjs` | HTTP 入口、API 分发、静态资源白名单 |
| `db.mjs`、`encrypted-db.mjs` | 数据结构、迁移及数据库加密 |
| `accounts.mjs`、`lifecycle.mjs` | 双人账本、账号、注销与只读清理 |
| `calendar.mjs`、`reminders.mjs` | 农历、节假日和年度提醒 |
| `chat.mjs`、`speech.mjs`、`media.mjs` | 聊天、语音转写和附件 |
| `memos.mjs` | 私密备忘录、分类、AI 整理 |
| `memoir-export.mjs` | 自包含岁月拾忆 HTML 导出 |
| `app-updates.mjs` | 匿名更新清单和安装包下载接口 |
| `public/app.js`、`features.js`、`index.html`、`style.css` | 主页面、日历、回忆与样式 |
| `public/chat.js`、`speech.js`、`memos.js` | 聊天与备忘交互 |
| `public/settings.js`、`client-downloads.js` | 系统设置、移动个性化和网页下载 |
| `public/dialog-history.js`、`photo-viewer.js` | 弹窗返回、滚动锁定和图片查看 |
| `apps/android` | Android WebView 壳、原生录音、更新器与文件选择 |
| `apps/windows` | Electron 壳及 Windows 更新器 |
| `scripts/upload-github.ps1`、`upload-menu.ps1` | 上传校验与菜单 |
| `上传更新到GitHub.bat` | 双击启动 PowerShell 菜单，不构建、不连服务器 |

上传菜单：1上传源码和已有双端包，2只上传源码，3只检查，4退出。脚本检查公私库属性、测试、应用 ID、版本、签名相关包信息与哈希；同构建号内容冲突停止。BAT 使用简洁入口，PowerShell 文件保留兼容 Windows PowerShell 的 UTF8 编码；此前中文 BAT 与未指定 UTF8 读取 JSON 曾导致乱码和解析失败，已处理。

优先参考 `AGENTS.md`、`docs/APP-SYNC.md` 和现有代码。`docs/APPS.md`、`APP-UPDATES.md`、`PUBLISH.md`、`deploy/README.md` 有历史说明，包含10801、10803或旧 SSH/Git 同步步骤，不能把它们当作最新版本事实。当前构建号以 Gradle、client-build.json 和最新清单为准。

本机启动 `npm start`，默认端口3000；必须有合适测试数据和环境配置，不要为预览修改或暴露真实私人数据。主测试用 `npm test`；Windows 壳独立测试在 apps/windows 下 `npm test`，本次只重新跑了根目录72项。测试数据和 `local-preview-data` 已被忽略。未进行本次手机真机测试或服务器现场验证。

## 建议的新对话开场

> 请先阅读 E:\codex\love\docs\HANDOFF.md 和 AGENTS.md，核对当前 Git 状态。继续排查服务器 update.sh 的安装包同步 fetch failed；先区分宿主机与 Docker 的 GitHub API 网络问题，保留已部署网站与安装包。显示版本保持1.8.0，Windows构建10804、Android10808；产物仍放E:\codex\love-app。我自己上传GitHub，不要代替推送或部署。
